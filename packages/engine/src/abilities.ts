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
export type PickAction = "attach" | "phaseOut" | "sacrifice" | "bounce" | "counters" | "populate" | "pair" | "reveal" | "unblocked" | "enlist" | "band" | "ringBearer" | "champion" | "exert" | "keepTapped" | "untapLimited" | "encode" | "keep" | "untap" | "tap" | "choose" | "meld" | "unattach" | /** Liliana of the Veil: the permanents for the first of two piles. */ "pile" | /** "Exile any number of creatures you control, then return them" (Another Round): the ones to flicker next. */ "flicker" | /** "Defending player exiles two permanents they control" (Bane of Bala Ged). */ "exile" | /** Nulltread Gargantuan: "put a creature you control on top of its owner's library". */ "libraryTop";

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
export type PunisherOption = { discard: number; /** "Unless they discard a nonland card" (Bandit's Talent): only cards like this. */ filter?: TargetSpec } | { sacrifice: TargetSpec; n?: number } | { pay: UnlessPays } | { /** "Equal to ~'s power" (Combustion Man): worked out as the punisher starts. */ damage: Amount };

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
  /** "Ward—Waterbend {4}" (CR 701.67a): up to this much of the cost's generic mana may be paid by tapping untapped artifacts and creatures they control, {1} each. */
  waterbend?: number;
  /** "Unless its controller discards their hand" (Perplex): all of it, even with no cards in hand (rulings). */
  discardHand?: true;
  /** "Unless its controller exiles all cards from their graveyard" (Grip of Amnesia): all of them, even none (rulings). */
  exileGraveyard?: true;
  /** "Ward—Discard a card at random" (Alpharael): this many cards chosen at random as the payment (CR 701.9c). */
  discardRandom?: number;
  /** "Ward—Get five poison counters" (The Serpent Society): the player gets this many as the payment (CR 122.1, 118.3). */
  poison?: number;
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
  /** "A third of their life, rounded up" (Dire Fleet Ravager): a third instead of half, rounded the same way. */
  third?: true;
  /** "A tenth of the creatures they control, rounded up" (Legate Lanius): a tenth instead of half, rounded the same way. */
  tenth?: true;
  /** "For each five counters removed this way" (Sage of Hours): once for each whole group of this many, rounded down. */
  per?: number;
  /** It may be below 0: doubling a creature's power gives it +X/+0 for a negative X too (CR 107.1b, 701.10c). */
  signed?: true;
  /** "If X is 6 or more, ... twice X damage ... instead" (Shatterskull Smashing): twice as much when the X announced is this or more. */
  twiceIfX?: number;
  /** "Draws 2ˣ cards" (Mathemagics): two to the power of the count, at most 1024 (more than all the cards in the game). */
  pow2?: true;
  /** "This effect can't reduce the amount of mana ~ costs by more than {5}" (Valiant Changeling): never more than this. */
  max?: number;
}

/** What an amount counts. */
export type Count =
  /** The X chosen while casting or activating it (CR 107.3a), or the spell's X for its permanent's ETB (CR 107.3m). */
  | { kind: "x" }
  /** "Choose a number between 0 and 13. Each player sacrifices that many creatures" (By Invitation Only): the number chosen (Chosen.number). */
  | { kind: "chosenNumber" }
  /** "Whenever you cast a spell with {X} in its mana cost, put X +1/+1 counters on ~" (Nev, the Practical Dean): the X that cast spell was cast with (CR 107.3a). */
  | { kind: "castSpellX" }
  /** "The number of times that spell was kicked" (Rumbling Aftershocks): its kicker costs paid as it was cast, multikicker's each time (CR 702.33d). */
  | { kind: "castSpellKicked" }
  /** "Where X is the greatest power among creatures you controlled as you cast this spell" (Lifestream's Blessing): counted once, as it's cast (StackItem.asCast). */
  | { kind: "asCast"; of: Count }
  /**
   * "The number of creatures you control", "for each other Elf you control". `filter.controller` is from the ability's controller's view;
   * `whose`: "creatures target player controls", controlled by those players.
   */
  | { kind: "permanents"; filter: TargetSpec; other?: boolean; /** "The number of Curses attached to them" (Curse of Thirst): only permanents attached to that player. */ attachedToPlayer?: PlayerRef; /** "Target attacking creature gets +1/+1 for each other attacking creature" (Paladin Class): not that target. */ otherThanTarget?: number; /** "Whenever equipped creature attacks alone, it gets +1/+1 ... for each other creature you control" (Sigil of Valor): other than the trigger's subject. */ otherThanSubject?: true; /** "Enchanted creature gets +1/+1 for each other creature you control" (Bravado), "Each legendary creature you control gets +1/+1 for each other legendary creature you control" (Heroes' Podium): other than the permanent the static effect is applied to, not the source. */ otherThanAffected?: true; whose?: PlayerRef; /** "Different kinds of counters among creatures you control" (Hundred-Battle Veteran): the kinds, each counted once. */ counterKinds?: true; /** "The number of +1/+1 counters on lands you control" (Toph, the Blind Bandit): their counters of this kind added up, not the permanents (ANY_COUNTER: every kind). */ counter?: CounterKind; /** "Differently named lands you control": each English name once (rulings); a face-down permanent has no name (CR 708.2). */ differentNames?: true; /** "Each different mana value among nonland permanents you control" (Lunar Insight): each mana value once; a face-down permanent's is 0 (CR 708.2). */ differentManaValues?: true; /** "Each different power among creatures you control" (Golden Ratio): each power once. */ differentPowers?: true; /** "Each other attacking creature that shares a creature type with it" (Shared Animosity): not the trigger's subject, and sharing a type with it. */ sharesTypeWithSubject?: true; /** "Other creature you control that shares a creature type with it" (Titan of Littjara), "it" being ~: sharing a type with the source, as it last existed if it's gone (CR 608.2h). */ sharesTypeWithSource?: true; /** With `sharesTypeWithSubject`: "creatures you control that share a creature type with it" (Mana Echoes): the subject counts too, if it matches (it shares a type with itself, rulings); gone, its creature types as it last existed (CR 608.2h). */ includeSubject?: true; /** "Each creature gets +1/+1 for each other creature on the battlefield that shares at least one creature type with it" (Coat of Arms): not the permanent the static effect is applied to, and sharing a type with it. */ sharesTypeWithAffected?: true; /** "Each nontoken creature you control gets +1/+1 for each other creature you control with the same name as that creature" (Mirror Box): not the permanent the static effect is applied to, and with its name (a face-down permanent has none, CR 708.2). */ sameNameAsAffected?: true; /** "The number of creatures attacking them" (Within Range): attacking one of these players themselves, not a planeswalker or battle (CR 506.3, 508.1b). */ attackingWho?: PlayerRef }
  /** "The number of cards in your hand", "in that player's hand". */
  | { kind: "cardsInHand"; who: PlayerRef; /** "The number of white cards in their hand" (Inquisition): only cards like this. */ filter?: TargetSpec; /** "Cards with at least six different mana values are revealed" (Atemsis, All-Seeing): how many different mana values (CR 202.3). */ differentManaValues?: true }
  /**
   * "The number of cards in that player's hand minus the number of cards in your hand" (Dark Suspicions), "draw cards
   * equal to the difference" if they have more (Balance of Power): never below 0 (CR 107.1b).
   */
  | { kind: "handMoreThanYou"; who: PlayerRef; /** "Cards in your hand minus the number of cards in that player's hand" (Bulwark): yours less theirs. */ yoursMinus?: true }
  /** "Each creature you control gets +1/+0 for each time it has attacked this turn" (Moraug): the permanent the static effect is applied to (GameObject.attacked). */
  | { kind: "timesAffectedAttacked" }
  /** Takeno, Samurai General: "for each point of bushido it has", the sum of N over its bushido instances (CR 702.45). */
  | { kind: "affectedBushido" }
  /** "Creatures you don't control get -1/-1 for each slime counter on them" (Toxrill): each affected object's own counters. */
  | { kind: "affectedCounters"; counter: CounterKind }
  /**
   * Akroma, Vision of Ixidor: how many of these keywords the affected creature has, each counted once however many
   * instances or variants it has ("protection from black and from red", "hexproof from"); "Partner" is partner or
   * "partner with", not the other variants (rulings). Worked out as a resolved effect begins (rulings).
   */
  | { kind: "affectedKeywordCount"; keywords: string[] }
  /** "Becomes an artifact creature with power and toughness each equal to its mana value" (Karn, the Great Creator): the permanent the effect is applied to; X in its mana cost is 0 (CR 202.3e). */
  | { kind: "affectedManaValue" }
  /** "For each of its colors" in a static ability (Civic Saber): the colors of the permanent the effect is applied to. */
  | { kind: "affectedColors" }
  /** "For each poison counter its controller has" (Phyresis Outbreak): of the affected permanent's controller, counted for each one as the effect is made (rulings). */
  | { kind: "affectedControllerPoison" }
  /** "For each card in its controller's hand" (Righteous Authority): the hand of the affected permanent's controller. */
  | { kind: "affectedControllerHand" }
  | { kind: "cardsInLibrary"; who: PlayerRef }
  /** "That many cards" after discarding a hand (Tolarian Winds); `greatest`: "the greatest number of cards a player discarded this way" (Windfall). */
  | { kind: "discardedThisWay"; greatest?: true; /** Only these players' discards: "each player discards their hand, then draws that many cards" is each their own (Dark Deal). */ who?: PlayerRef; /** "For each land card discarded this way" (Gerrard's Verdict): only cards like this. */ filter?: TargetSpec }
  /** "The total mana value of those cards" after "you mill three cards" (Combustible Gearhulk): X counts 0 (CR 107.3). */
  | { kind: "milledManaValue" }
  /** "The discarded card's mana value" after "draw a card, then discard a card" (Ninja's Blades): of the cards discarded while this resolves, X counting 0 (CR 107.3). */
  | { kind: "discardedManaValue" }
  /** "Reveal the top card of your library. Draw cards equal to that card's mana value." (Interpret the Signs): the card "revealTop" revealed, while it's still that card. */
  | { kind: "revealedManaValue"; /** "Gain life equal to that card's toughness, lose life equal to its power" (Sapling of Colfenor): the revealed card's toughness or power instead, as it is in the library (CR 604.3). */ stat?: "power" | "toughness" }
  /** "The total mana value of those exiled cards" (Ensnared by the Mara): of the cards an "exile the top N cards" before it exiled (GameState.resolving.exiledTopCards). */
  | { kind: "exiledTopManaValue" }
  /** "For each card of the chosen color exiled this way" (Oona, Queen of the Fae): of the cards the "exile the top X cards" before it exiled, those matching `filter` (a chosen color bound as it resolves), still in exile. */
  | { kind: "exiledTopMatching"; filter: TargetSpec }
  /** "For each card exiled from their hand this way" (Lost Legacy): of the cards an exileNamed instruction exiled. */
  | { kind: "exiledFromHandThisWay" }
  /** "For each artifact or land card exiled this way" (Canoptek Scarab Swarm): the cards this resolution exiled from graveyards so far, by their printed characteristics. */
  | { kind: "cardsExiledThisWay"; filter?: TargetSpec }
  /** Vanish into Memory: "that creature's toughness" once it's back, the total toughness of what a returnExiled with `toughnessThisWay` returned (0 for one that isn't a creature, rulings). */
  | { kind: "returnedToughness" }
  /** "Draw that many cards" after "sacrifice any number of other creatures": how many its instructions sacrificed. */
  | { kind: "sacrificedThisWayCount" }
  /** "Draw a card for each spell countered this way" (Swift Silence). */
  | { kind: "spellsCounteredThisWay" }
  /** Leeches: "that much", the poison counters its loseAllCounters instruction removed. */
  | { kind: "poisonLostThisWay" }
  /** Sweep: "for each Plains returned this way" after "return any number of Plains you control to their owner's hand": how many its instructions put into a hand. */
  | { kind: "bouncedThisWayCount" }
  /** First Responder: "you may return another creature you control to its owner's hand, then put ... equal to that creature's power": its power as it last existed on the battlefield (CR 608.2h), if it went to a hand. */
  | { kind: "bouncedThisWayPower" }
  /** Sacred Boon's delayed trigger: "for each 1 damage prevented this way", all the damage rule `rule` prevented (GameState.preventedTally). */
  | { kind: "preventedByRule"; rule: string }
  /** "The greatest power among creatures sacrificed this way" (Shadowgrange Archfiend): of what this resolution sacrificed, as each last existed (CR 608.2h); 0 if none. */
  | { kind: "sacrificedThisWayGreatestPower" }
  /** "The total power of the creatures sacrificed this way" (Reign of the Pit): as each last existed, negative powers included (rulings). */
  | { kind: "sacrificedThisWayTotalPower" }
  /**
   * Angrath, Minotaur Pirate: the total power of the creatures this effect destroyed, as they last existed, plus that of
   * the creatures `survivorsOf` still controls (those it couldn't destroy), as they are now (rulings).
   */
  | { kind: "destroyedThisWayTotalPower"; survivorsOf: PlayerRef }
  /** Corpse Cobble: "the total power of the sacrificed creatures", sacrificed to cast the spell, as each last existed (CR 608.2h), negative powers included. */
  | { kind: "costSacrificedTotalPower" }
  /** Vengeful Regrowth: "Return up to three target land cards ... to the battlefield tapped. Create that many ...": the permanents this resolution just put onto the battlefield. */
  | { kind: "putThisWay" }
  /** She-Hulk, Wallbreaker: "for each creature blocking it": the creatures blocking the source (`subject`: the trigger's attacker) as it resolves. */
  | { kind: "blockingIt"; subject?: true }
  /** "For each creature it's blocking" (Guardian of the Gateless): the creatures the source is blocking as this resolves. */
  | { kind: "itBlocks" }
  /** "For each card returned to your hand this way" (Paradoxical Outcome): the cards it returned that you own, still in your hand (a token isn't a card; another player's goes to their hand). */
  | { kind: "returnedToYourHand" }
  /** "For each card you put into your hand this way" (Search for Blex): the cards its last look at the top of a library put into a hand. */
  | { kind: "dugToHand" }
  /** "You gain life equal to that card's mana value" after "put one of them into your hand" (Reviving Vapors): the one card its last look at the top of a library put into a hand, X counted as 0 (rulings). */
  | { kind: "dugToHandMv" }
  /** "For each card revealed this way", "the number of cards revealed this way" after revealFromHand, or in its reflexive trigger. */
  | { kind: "revealedFromHand" }
  /** "The number of cards revealed this way" after revealUntil (Madcap Experiment): all of them, the one found included (rulings). */
  | { kind: "revealedUntilCount" }
  /** Parley: "for each nonland card revealed this way" after "each player reveals the top card of their library" (`land`: land cards instead). */
  | { kind: "parleyRevealed"; land?: true }
  | { kind: "bottomedFromHand" }
  /** How many cards "you may choose a nonland card from it" chose (0 or 1): for "If you do" and "If you don't". */
  | { kind: "tookFromHand" }
  /** "The greatest power among creature cards exiled this way" (Szat's Will): as they were in the graveyard (rulings), 0 with none. */
  | { kind: "greatestPowerExiled" }
  /** "The power of the creature they exiled" (Olórin's Searing Light): the power, as it last existed on the battlefield, of the creatures this player controlled that this spell or ability exiled (CR 608.2h). */
  | { kind: "exiledPowerOf"; who: PlayerRef }
  /** "For each creature destroyed this way" (Decree of Pain): by this spell's or ability's destroy instructions, as they last existed. */
  | { kind: "destroyedThisWay"; filter: TargetSpec; /** "For each creature that died this way" (Reign of Terror): only those put into a graveyard (CR 700.4). */ died?: true }
  /** "For each nontoken creature exiled this way" (Declaration in Stone): permanents, as they last existed. */
  | { kind: "exiledThisWay"; filter: TargetSpec }
  /**
   * "If the discovered card's mana value is less than 10, ... equal to the difference" (Hit the Mother Lode): `n` minus the
   * mana value of the card this spell or ability discovered (CR 701.57c), 0 if it's not less or nothing was discovered.
   */
  | { kind: "discoveredBelow"; n: number }
  /** "For each counter removed this way" (Nexus Mentality). */
  | { kind: "countersRemovedThisWay" }
  /** "Cards exiled with ~": those this object's linked exile took that are still there (CR 607.2a, 400.7). */
  | { kind: "linkedExiled" }
  /** "The exiled creature card's power" (Phyrexian Ingester): the power (or toughness) of each creature card its linked
   * exile took that's still there, as it is in exile (rulings: no bonus for a card that isn't a creature card). */
  | { kind: "linkedExiledPT"; stat: "power" | "toughness" }
  /** "The total power of those creatures": the ones that died in a "one or more ... die" event, as they last existed (The Skullspore Nexus). */
  | { kind: "eventGroupPower" }
  /** "For each card type among those cards" (Polluted Cistern): the cards of a "one or more cards are put into your graveyard" event (CR 205.2a). */
  | { kind: "eventGroupCardTypes" }
  /** "The total power of creatures goaded this way" (Havoc Eater): the targets `of` names still on the battlefield as it resolves (illegal ones weren't goaded, CR 608.2b), a negative power taking some off. */
  | { kind: "totalPowerOf"; of: ObjRef }
  /** How many cards the last "put all cards exiled with ~ into their owners' graveyards" moved (Valakut Exploration). */
  | { kind: "movedLinkedThisWay" }
  /** "The greatest power among creature cards put into your graveyard this way" (Discerning Taste): of the rest a look at the top of the library put there, as they are in the graveyard; 0 with none. */
  | { kind: "movedThisWayGreatestPower" }
  /** "For each of those cards that are still exiled" (Dragonhawk): the cards the creating ability exiled, filled in when its delayed trigger is made (CR 400.7). */
  | { kind: "stillExiled"; cards?: { id: ObjectId; zc: number }[] }
  /** "For each creature tapped this way", "the number of creatures tapped this way" after tapAnyNumber, or in its reflexive trigger. */
  | { kind: "tappedThisWay" }
  /** "For each creature goaded this way" (Kaima, the Fractured Calm): how many this resolution's goad affected (CR 701.15). */
  | { kind: "goadedThisWay" }
  /**
   * Join forces: "the total amount of mana paid this way" (Minds Aglow). `whose`: only what these players paid, "the
   * amount of mana they paid this way" (Liege of the Hollows, PlayerRef eachOne).
   */
  | { kind: "joinForcesPaid"; whose?: PlayerRef }
  /** "For each card manifested this way" (Kozilek, the Broken Reality): the cards a putFromHand with `manifest` turned face down onto the battlefield. */
  | { kind: "manifestedThisWay" }
  /**
   * "The amount of excess damage dealt to that creature this way" (Hell to Pay), "that excess damage": what this spell's or
   * ability's damage dealt to permanents beyond lethal damage, their loyalty or their defense (CR 120.4a, 120.10).
   */
  /** "You gain life equal to the damage dealt this way" (Syphon Soul): all the damage the instructions before dealt, after prevention. */
  | { kind: "damageThisWay" }
  | { kind: "excessThisWay"; /** Only that target's (The Last Agni Kai's "add that much {R}"). */ target?: number }
  /** "If you lost life this way, draw that many cards" after exchanging life totals (Mister Negative): the life you lost doing it. */
  | { kind: "lifeLostThisWay"; /** "If no life is lost this way" (Blitzwing, Cruel Tormentor): what its loseLife instructions took off life totals, any player's. */ byLoss?: true }
  /**
   * "Where X is the difference between those players' life totals" after "two target players exchange life totals"
   * (Profane Transfusion): their totals now, after the exchange (rulings), even if one is no longer a legal target (CR 608.2b).
   */
  | { kind: "exchangedLifeDifference" }
  /** "For each death vote", "the number of profit votes" (CR 701.38): the votes for that choice in this ability's vote. */
  | { kind: "votes"; option: string }
  /** "For each player who chose fortune": how many players chose that word (Effect eachChooses). */
  | { kind: "choseWord"; option: string }
  /** "Creature cards in your graveyard", "cards in all graveyards" (`filter` is a "card" spec). */
  | { kind: "cardsInGraveyard"; who: PlayerRef; filter?: TargetSpec; /** "The greatest power among creature cards in your graveyard" (Carrion Grub): the greatest power of those cards, 0 with none, instead of how many. */ greatestPower?: true; /** "The greatest mana value among cards in your graveyard" (Hapatra, the Desert Fang): the greatest mana value of those cards, 0 with none. */ greatestMv?: true; /** "The total mana value of instant and sorcery cards in your graveyard" (Inferno Project): their mana values added up. */ totalMv?: true; /** "In its controller's graveyard" (Death's Approach): the graveyard of the affected permanent's controller, instead of `who`'s. */ affectedController?: true; /** "With the same name as that spell" in a cast trigger (the Shrines): only cards with the spell's name as it was cast (StackItem.castName). */ sameNameAsCast?: true }
  /** "~'s power", "its toughness", "that creature's mana value": as it is now, or as it last existed (CR 608.2h). */
  | { kind: "power" | "toughness" | "manaValue"; of: ObjRef }
  /** "For each of its colors" (Breathe Your Last): its colors now, or as it last existed on the battlefield (CR 608.2h). */
  | { kind: "colorsOf"; of: ObjRef }
  /** "The damage already dealt to it this turn" (Whipkeeper): all of it, since it became that object, even if regeneration removed it (rulings). */
  | { kind: "damageDealtToThisTurn"; of: ObjRef }
  /** `highest`: "the highest life total among your opponents" (Malignus): the greatest of theirs, not the sum. */
  | { kind: "life"; who: PlayerRef; highest?: true }
  /** "That player's life total as the turn began" (Sengir, the Dark Baron): the trigger's player's (GameState.lifeAsTurnBegan), in the game or not. */
  | { kind: "eventPlayerLifeAsTurnBegan" }
  /** "If you had no cards in hand at the beginning of this turn" (Mindstorm Crown): your hand size then (GameState.handAsTurnBegan). */
  | { kind: "handAsTurnBegan" }
  /** "The difference" between your starting life total and your life total when it is less (Shadow of Mortality); 0 otherwise. */
  | { kind: "lifeBelowStart" }
  /** "The number of experience counters you have" (CR 122.1). */
  | { kind: "experience"; who: PlayerRef }
  /** "For each poison counter your opponents have" (Phyrexian Swarmlord): all of theirs together (CR 122.1f). */
  | { kind: "poison"; who: PlayerRef }
  /** "For each card type among cards discarded this way" (Kefka, Court Mage): every card discarded while this resolves. */
  | { kind: "discardedTypes" }
  /** "For each nonland card discarded this way" (Seasoned Pyromancer): the cards this resolution discarded that match, as they are in the graveyard. */
  | { kind: "discardedMatching"; filter: TargetSpec }
  /** "For each card drawn this way": the cards drawn in this resolution's draw before (Struggle for Project Purity). */
  | { kind: "drawnThisWay" }
  /** "Remove a number of loyalty counters equal to that card's mana value" after "Draw a card and reveal it" (Jace, Mirror Mage): the drawn card's mana value, 0 if the draw was replaced (rulings). */
  | { kind: "drawnRevealedMv" }
  /** "For each creature card put into a graveyard this way" after a mill (Dread Summons): the milled cards that went there and match. */
  | { kind: "milledThisWay"; filter?: TargetSpec }
  /** "The number of rad counters you have", "the total number of rad counters among players" (`who` unset; CR 728). */
  | { kind: "rad"; who?: PlayerRef }
  /** "Your speed": 0 if you have none (CR 702.179f). */
  | { kind: "speed" }
  /** "The number of creatures in your party" (CR 700.8): 0 to 4. */
  | { kind: "party" }
  /** "The total amount of life your opponents have lost this turn", "for each 1 life your opponents have lost this turn" (CR 119.3). */
  | { kind: "opponentsLifeLost" }
  /** "The total amount of noncombat damage dealt to your opponents this turn" (Chandra's Incinerator). */
  | { kind: "opponentsNoncombatDamage" }
  /** "The damage dealt to your opponents this turn" (Notorious Throng): by all sources, combat or not (rulings). */
  | { kind: "opponentsDamage" }
  /** "The damage dealt to target opponent this turn" (Knollspine Dragon). */
  | { kind: "playerDamageThisTurn"; who: PlayerRef }
  /** "The life they lost this turn" (Wound Reflection): each one's own, however they lost it (rulings). */
  | { kind: "lifeLostThisTurn"; who: PlayerRef }
  /** "For each unspent green mana you have" (Omnath, Locus of Mana), "six or more unspent mana" (Ozai): what's in your mana pool (CR 106.4). */
  | { kind: "unspentMana"; color?: Color }
  /** "The amount of life you gained this turn", "for each 1 life you gained this turn" (CR 119.3, 119.9): its total, whatever was lost. */
  | { kind: "lifeGainedThisTurn" }
  /** "For each {E} you've paid or lost this turn" (Blaster Hulk): energy counters you've paid or lost in total (CR 107.14, 122.1). */
  | { kind: "energyLostThisTurn" }
  /** Devotion to a color, or to several (CR 700.5). */
  | { kind: "devotion"; colors: Color[] }
  /**
   * Chroma: the mana symbols of one color in mana costs, a hybrid symbol of that color counting once (rulings): of the cards
   * in your graveyard (Umbra Stalker), of the permanent a static ability affects (Light from Within), of what was sacrificed
   * (`of`, Fiery Bombardment), of the cards revealed from your hand (Phosphorescent Feast) or from your library this way
   * (Sanity Grinding).
   */
  | { kind: "manaSymbols"; color: Color; in?: "graveyard" | "affected" | "revealedFromHand" | "revealed"; of?: ObjRef }
  /** "For each Aura attached to it", "each Equipment attached to it". */
  | { kind: "attachedToSelf"; subtypes: string[] }
  /** "Enchanted creature gets +1/+1 for each Aura and Equipment attached to it" (Mantle of the Ancients): attached to the permanent the static ability's effect is applied to. */
  | { kind: "attachedToAffected"; subtypes: string[] }
  /** "Equipped creature has double strike as long as two or more Equipment are attached to it" (Brass Knuckles): attached to the permanent the source is attached to. */
  | { kind: "attachedToHost"; subtypes: string[] }
  /** "For each creature type among creatures you control" (Valiant Changeling): each type once; a creature with changeling has them all (CR 205.3m, 702.73a). */
  | { kind: "creatureTypesAmong" }
  /** "The number of planeswalker types among planeswalkers you control" (Tam, the Possibility): each planeswalker type once (CR 205.3j), as it's counted. */
  | { kind: "planeswalkerTypesAmong" }
  /** "The number of abilities from among flying, first strike, ... found among creatures you control" (Odric, Blood-Cursed): each listed keyword once if any creature you control has it, a "hexproof from" counting as hexproof (rulings). */
  | { kind: "keywordsAmong"; keywords: string[] }
  /** Domain: "basic land type among lands you control". */
  | { kind: "basicLandTypes"; /** Allied Strategies: "among lands they control", that player's. */ whose?: PlayerRef }
  /** Vivid: "the number of colors among permanents you control" (white, blue, black, red, green; colorless isn't one, CR 105.2c). */
  | { kind: "colorsAmongPermanents"; /** "Among other legendary permanents you control" (Sisay, Weatherlight Captain). */ filter?: TargetSpec; other?: true }
  /** "For each spell you've cast this turn" (Aetherflux Reservoir): the spells its controller cast this turn, copies not (CR 707.10). */
  /** `filter`: "the number of instant and sorcery spells you've cast this turn" (Rionya), by the cards cast. */
  | { kind: "spellsCastThisTurn"; filter?: TargetSpec; /** "Spells they've cast this turn": the trigger's player's (Rug of Smothering). */ eventPlayer?: true; /** "Each other instant and sorcery spell you've cast this turn" (Lock and Load): not the resolving spell's own cast. */ other?: true; /** "From anywhere other than your hand" (Surge of Brilliance, paradox): cast from another zone, or a cast copy. */ notFromHand?: true; /** "Spells cast this turn" (Storm Entity): every player's. */ anyone?: true; /** "Spells your opponents have cast this turn" (Delightful Discovery): your opponents' only. */ opponents?: true; /** Not the cast of the source itself (its GameObject.castNth), whatever is resolving. */ notSource?: true; /** "Each spell you've cast this turn other than the first" (Outlaw Stitcher): one fewer, never less than 0. */ beyondFirst?: true; /** "Each card type among spells you've cast this turn" (April O'Neil, Hacktivist): how many different card types, as they were cast. */ cardTypes?: true }
  /** "The total mana value of other spells you've cast this turn" (Call Forth the Tempest): each as it was cast (CR 202.3e); `other`: not the resolving spell itself. */
  | { kind: "manaValueCastThisTurn"; other?: true; /** "The greatest mana value among instant and sorcery spells you've cast this turn" (Rootha, Mastering the Moment): the greatest of them, not the total; `filter` by the cards cast. */ greatest?: true; filter?: TargetSpec }
  /** "The number of card types among cards in all graveyards" (Tarmogoyf): card types only, not subtypes or supertypes (CR 205.2a). */
  | { kind: "graveyardCardTypes"; who: PlayerRef; /** Only permanent types (CR 110.4a): "permanent types among cards in your graveyard". */ permanent?: true }
  /** "Five or more mana values among cards in your graveyard" (Tainted Indulgence): how many different mana values (CR 202.3). */
  | { kind: "graveyardManaValues"; who: PlayerRef; /** "Each different mana value among instant and sorcery cards in your graveyard" (Eris, Roar of the Storm): only these cards. */ filter?: TargetSpec }
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
      /** "The greatest power among those creatures" (Shriekwood Devourer): only the trigger event's group still on the battlefield, as it resolves (rulings). */
      inEventGroup?: true;
      /** "The least power among creatures on the battlefield" (Wretched Banquet): the least instead, 0 with none. */
      least?: true;
    }
  /** "The greatest mana value among permanents you control": 0 when there are none; X is 0 on the battlefield (CR 202.3, 107.3). */
  /** `total`: "the total mana value of historic permanents you control" (Excalibur), the sum instead. */
  /** "The greatest mana value among cards in exile" (Ulamog, the Defiler): every player's exiled cards, a face-down one 0 (CR 708.2). */
  | { kind: "greatestMvInExile" }
  /** "There are seven or more cards in exile" (Ketramose): every player's exiled cards, face-down ones too (rulings). */
  | { kind: "cardsInExile"; /** "Instant and sorcery cards you own in exile and in your graveyard" (Crackling Drake): only that player's face-up cards matching `filter` (a face-down card has no characteristics, rulings), and their graveyard's too. */ who?: PlayerRef; filter?: TargetSpec; graveyardToo?: true; /** "Exiled cards with hit counters on them" (Etrata, the Silencer): only cards with that counter. */ counter?: CounterKind }
  | { kind: "greatestManaValue"; filter: TargetSpec; total?: true; /** "Other permanents you control" (Summon: Bahamut): not the source. */ other?: true; /** "The lowest mana value" among them (Culling Scales), 0 with none. */ least?: true }
  /** How many times the spell (or the permanent it became) was kicked (CR 702.33d); `which` = with that kicker cost only. */
  | { kind: "kicked"; which?: number }
  /** 1 if it was kicked at all (or with kicker cost `which`), else 0. */
  | { kind: "wasKicked"; which?: number }
  /** 1 if the mana spent to cast it meets `req` (adamant, CR 601.2h), else 0. */
  | { kind: "spentWas"; req: SpentReq }
  /** "That much", "that many" in a triggered ability: the damage its event dealt. */
  | { kind: "eventAmount" }
  /** Ancient Cellarspawn's "the difference": the cast spell's mana value (X included) less the mana spent to cast it. */
  | { kind: "castShortfall" }
  /** "Where X is that excess damage" after "if that creature was dealt excess damage this turn" (CR 120.10). */
  | { kind: "eventExcess" }
  /** "The number of colors of mana spent to cast this spell" (converge, CR 207.2c; sunburst counts the same way, 702.44a). 0 if it wasn't cast. */
  | { kind: "colorsSpent"; /** Wildgrowth Archaic: "the number of colors of mana spent to cast it" in a cast trigger: that spell's (CR 601.2h). */ of?: { ref: "castSpell" } }
  /** "For each of that spell's colors" in a cast trigger (Ramos, Dragon Engine): as it is, or as it was cast if it's gone. */
  | { kind: "castSpellColors" }
  /** "Create that many" after "a spell with one or more blue mana symbols in its mana cost" (Namor the Sub-Mariner): that spell's mana symbols of the color (hybrid ones once each). */
  | { kind: "castSpellManaSymbols"; color: Color }
  /** "The number of times it's been cast from the command zone this game" (Study Hall): the commander spell cast's. */
  | { kind: "castSpellCommanderCasts" }
  /**
   * "Enters with a number of +1/+1 counters on it equal to the amount of mana spent to cast it" (Marath): only in an
   * "enters with" (the spell it was); 0 if it wasn't cast.
   */
  | { kind: "manaSpent" }
  /**
   * "The amount of mana spent to cast that spell" (Mana Sculpt): the target spell's (CR 601.2h), as it last existed on the
   * stack if this countered it; 0 for a copy, which wasn't cast (CR 707.10).
   */
  | { kind: "manaSpentOn"; of: ObjRef }
  /** "The mana value of the returned creature" (Scarlet Spider): the creature returned to cast it using web-slinging, as it last existed; only in an "enters with". */
  | { kind: "webSlungMv" }
  /** "The greatest number of creatures a player controls" (Investigator's Journal), `opponents`: "an opponent controls". */
  | { kind: "greatestControlled"; filter: TargetSpec; opponents?: true }
  /** "The greatest number of creatures you control that have a creature type in common" (White Lotus Tile): the most of your creatures that share one creature type, a changeling counting for each. */
  | { kind: "mostSharingCreatureType" }
  /** "The greatest number of cards an opponent has drawn this turn" (Thought Sponge). */
  | { kind: "greatestDrawn" }
  /** "For each player being attacked" (Pack Attack): players a creature is attacking, not their planeswalkers (CR 506.2, 508.3b). */
  | { kind: "playersAttacked" }
  /** "The number of cards you've drawn this turn" (Duelist of the Mind), "they've drawn this turn" (Cerebral Vortex). */
  | { kind: "drawnThisTurn"; who: PlayerRef }
  /** "For each card you've discarded this turn" (Change of Fortune): for any reason, this resolution's too (rulings). */
  | { kind: "discardedThisTurn"; who: PlayerRef }
  /** "For each mana from a Treasure spent to cast it/~" (CR 106.3): the spell's, its permanent's, or an ability's. */
  | { kind: "treasureSpent"; /** "Spent to activate this ability": in an activated ability (compile checks). */ activated?: true }
  /** "Equal to the result" (CR 706.2): the last roll's result, all its dice added up; in a "whenever you roll" trigger, the roll's. */
  | { kind: "rollResult" }
  /** "The other result" after "roll two dX and choose one result": the one not chosen. */
  | { kind: "rollOther" }
  /** "For each odd result", "for each even result" (Clown Car): the dice of the last roll whose results are odd (or even). */
  | { kind: "rollParity"; odd: boolean }
  /** "If you rolled 6 exactly seven times" (Luck Bobblehead): the dice of the last roll that came up `value`. */
  | { kind: "rollEquals"; value: number }
  /** "If you put +1/+1 counters on five Dragons this way" (Call the Spirit Dragons): the permanents this resolution put counters on. */
  | { kind: "countersPutOnThisWay" }
  /** "For each flip you won" after "flip a coin until you lose a flip"; `heads`: "for each coin that comes up heads" after uncalled flips (Ral Zarek). */
  | { kind: "flipsWon"; heads?: true }
  /** "For each {S} spent to cast ~", "the amount of {S} spent" (CR 107.4h): mana from snow sources spent on the spell. */
  | { kind: "snowSpent" }
  /** "For each creature it devoured" (CR 702.82b). */
  | { kind: "devoured" }
  /** "The life paid as it entered" (Minion of the Wastes, Phyrexian Processor): the source's GameObject.lifePaidAsEntered. */
  | { kind: "lifePaidAsEntered" }
  /** "For each Aura you controlled that was attached to it" (Hateful Eidolon): the dead creature's, as it last existed (CR 603.10a). */
  | { kind: "aurasYouControlledAttached" }
  /** "The number of times ~ has mutated" (CR 702.140d): the source's, also as it last existed (CR 608.2h). */
  | { kind: "mutations" }
  /** "For each creature that died this turn" (CR 700.4); `yours`: "that died under your control this turn". */
  /** "For each creature that left the battlefield under your control this turn" (Kutzil's Flanker): a token too. */
  | { kind: "creaturesLeftThisTurn" }
  /** "For each (nontoken) creature put into your graveyard from the battlefield this turn" (Caller of the Claw): its owner's graveyard, whoever controlled it. */
  | { kind: "creaturesToYourGraveyard"; nontoken?: true }
  /** "The number of artifacts that were put into graveyards from the battlefield this turn" (Structural Assault): anyone's, tokens too. */
  | { kind: "artifactsToGraveyardThisTurn" }
  /** "If an enchantment was put into your graveyard from the battlefield this turn" (Kami of Transience): 1 if one was, as it last existed there (a token too, CR 111.7), else 0. */
  | { kind: "typeToYourGraveyardThisTurn"; type: string }
  | { kind: "diedThisTurn"; yours?: true; nontoken?: true; /** "For each Zubera that died this turn": of this creature type as it last existed. */ subtype?: string; /** "A non-Skeleton creature died under your control this turn" (Cult Conscript): not of this type as it last existed. */ notSubtype?: string }
  /** "The number of (Treasure) tokens you created this turn" (CR 111.2): tokens its controller created. */
  | { kind: "tokensCreatedThisTurn"; subtype?: string }
  /**
   * +1/+1 counters put on permanents this turn (TurnLog.plusOnes), as they were put: `byYou`, by its controller ("you've
   * put", Iridescent Hornbeetle); `onYours`, on permanents its controller controlled then; `creature`, that were creatures
   * then (Sigardian Paladin rulings); `self`, on this object (Beast, Erudite Aerialist). Counts the counters.
   */
  | { kind: "plusOnesPutThisTurn"; byYou?: true; onYours?: true; creature?: true; self?: true }
  /** "The number of Goblins that entered the battlefield under your control this turn" (Hobgoblin, Bandit Lord): as they entered, even if they've left since. */
  | { kind: "enteredThisTurn"; types?: string[]; subtype?: string; /** Lilypad Village: any one of these. */ anySubtype?: string[]; /** Gyome, Master Chef: nontoken ones only. */ nontoken?: true; /** Geralf, the Fleshwright: "each other Zombie that entered ...": not the trigger's subject entering. */ notSubject?: true }
  /** "If you sacrificed a Food this turn" (Elanor Gardner): the permanents its controller sacrificed this turn, of that subtype or card type as they last existed. */
  | { kind: "sacrificedThisTurn"; subtype?: string; type?: string; /** "A nontoken permanent" (Evendo Brushrazer). */ nontoken?: true; /** "For each permanent sacrificed this turn" (The Balrog, Durin's Bane): by any player (rulings). */ anyPlayer?: true; /** "Each card type among permanents you've sacrificed this turn" (Korvold, Gleeful Glutton): how many different card types. */ cardTypes?: true }
  /** Gravestorm's "each permanent put into a graveyard from the battlefield this turn", tokens and anyone's too (CR 702.69a, rulings). */
  | { kind: "toGraveyardThisTurn" }
  /** "The number of creatures you control plus the number of planeswalkers you control" (Ajani, Strength of the Pride): each counted on its own, so a creature planeswalker counts twice. */
  | { kind: "sum"; of: Count[] }
  /** "The number of Zombies you control or the number of Zombie cards in your graveyard, whichever is greater" (Prophet of the Scarab): the larger, counted as it resolves. */
  | { kind: "greater"; of: [Count, Count] }
  /** A fixed number, inside "greater": "2 or the greatest power among Dinosaurs you control, whichever is greater" (Triumphant Chomp). */
  | { kind: "constant"; n: number }
  /** "Equal to the difference" after "if that creature has greater power than ~" (Conformer Shuriken): the first less the second. */
  | { kind: "difference"; of: [Count, Count] }
  /** "The difference between that creature's power and its toughness" (Jaws of Defeat): the larger less the smaller. */
  | { kind: "absDifference"; of: [Count, Count] }
  /** "X or Y, whichever is greater" (Willowdusk, Essence Seer). */
  | { kind: "greaterOf"; of: [Count, Count] }
  /** "The number of cards put into their graveyard from anywhere this turn" (Fraying Sanity): that player's. */
  | { kind: "cardsToGraveyardThisTurn"; whose: PlayerRef }
  /** "For each creature that attacked this turn": creatures declared as attackers this turn (CR 508.1). */
  | { kind: "attackersThisTurn" }
  /** "For each creature you attacked with this turn" (Search Party Captain): the creatures you declared as attackers this turn (PlayerState.attackedWith). */
  | { kind: "youAttackedWithThisTurn" }
  /** "For each time you've cast your commander from the command zone this game": all of your commanders (CR 903.8, rulings). */
  | { kind: "commanderCasts"; /** "Each time they've cast a commander" (Commander's Insight): that player's instead. */ who?: PlayerRef }
  /** The mana value of the commander Effect "chooseOwnCommander" chose in this resolution (0 if none). */
  | { kind: "chosenCommanderMv" }
  /** "The greatest mana value among your commanders" (Cactus Preserve): the commanders you own wherever they are, with
   * their current characteristics (CR 903.3; rulings); 0 with none. */
  | {
      kind: "commandersMv";
      /** "A commander you own on the battlefield or in the command zone" (Cloudkill): only those there. */
      onBattlefieldOrCommand?: true;
      /** "A commander they own" (Imposing Grandeur): that player's (PlayerRef eachOne), not yours. */
      who?: PlayerRef;
    }
  /** Melee: "for each opponent you attacked with a creature this combat" (CR 702.121a). */
  | { kind: "opponentsAttacked" }
  /** "For each player", "for each opponent (you have)": the players still in the game (CR 102.1, 800.4a). */
  /** `lostLife`: "for each of your opponents who lost life this turn" (Belbe): ones who lost the game since too (rulings). */
  /** `drewThisWay`: "for each opponent who drew a card this way" (Cut a Deal): those who drew a card in this resolution's draw before, once each. */
  | { kind: "players"; opponents?: true; lostLife?: true; /** "Opponents that were dealt combat damage this turn" (Tymna the Weaver), also those who have lost since (rulings). */ combatDamaged?: true; /** "For each opponent who was dealt damage this turn" (Gnoll War Band): by any source, those still in the game (rulings). */ damaged?: true; drewThisWay?: true; /** "For each opponent who can't" after "each opponent discards a card" (Aclazotz): those in the game who discarded nothing in this resolution. */ discardedNone?: true; /** "For each opponent who didn't discard two nonland cards this way" (Garruk, Veiled Butcher): those in the game who discarded fewer than this many nonland cards in this resolution. */ discardedFewerNonland?: number; /** "Who drew two or more cards this turn" (Smuggler's Share). */ drewAtLeast?: number; /** "Who had two or more lands enter the battlefield under their control this turn" (Smuggler's Share). */ landsEnteredAtLeast?: number; /** "Who control a creature with power 4 or greater" (Summon: Yojimbo). */ controlling?: TargetSpec; /** "Who has one or fewer cards in hand" (Bandit's Talent), counted now. */ handAtMost?: number; /** "With four or more cards in hand" (Wolfcaller's Howl), counted now. */ handAtLeast?: number; /** "Opponents who have three or more poison counters" (Glissa's Retriever), counted now. */ poisonAtLeast?: number; /** "Who has more cards in their hand than you" (Consuming Tide), counted now. */ handMoreThanYou?: true; /** "For each opponent who has less life than you" (Great Unclean One), counted now. */ lifeLessThanYou?: true; /** "For each opponent whose life total is less than half their starting life total" (Anya, Merciless Angel): with at most this much life, counted now. */ lifeAtMost?: number; /** "For each opponent who controls fewer creatures than you" (Birth of the Imperium), counted now. */ fewerCreaturesThanYou?: true; /** "The number of opponents who control more creatures than you" (Heidegger, Shinra Executive), counted now. */ moreCreaturesThanYou?: true; /** "Players who control at least two more lands than you" (Surveyor's Scope), counted now. */ moreLandsThanYou?: number; /** "For each opponent you attacked" (Rose, Cutthroat Raider): players you attacked this turn, still in the game. */ attacked?: true; /** "For each player who has lost the game" (Rampant Frogantua): those no longer in it (CR 104.3, 800.4a). */ lostGame?: true; /** "For each graveyard with seven or more cards in it" (The Master of Lake-town): players whose graveyard has this many, counted now. */ yardAtLeast?: number }
  /** "For each charge counter on ~", "the number of +1/+1 counters on it": as it last existed if it's gone. */
  | { kind: "counters"; counter: CounterKind; of: ObjRef }
  /** Station's "the tapped creature's power" (CR 702.184a): as the ability resolves, or as it last existed (rulings). */
  /** Station's "the tapped creature's power" (CR 702.184a), and "the power of the creature tapped this way" after a "Tap an untapped creature you control" cost (Keldon Battlewagon): as the ability resolves, or as it last existed (rulings on Impelled Giant); never below 0 (CR 107.1b). */
  | { kind: "stationPower" }
  /** How many players took a punisher's penalty this time (Acererak's "for each opponent, you create ... unless"). */
  | { kind: "punished" }
  /** 1 while the condition holds, else 0: "Add {G}{G}. If you've completed a dungeon, add six {G} instead." */
  | { kind: "stateIf"; cond: StaticCondition };

/** What a "target ..." phrase allows. CR 115 */
export interface TargetSpec {
  /** An "enchant player" Aura's target when the Aura helps the player it enchants (Paradox Haze): bots choose themselves. */
  helpsEnchanted?: true;
  /** An Aura's target when what the Aura does hurts the enchanted permanent's controller (Brand of Ill Omen): bots aim it at an opponent's. */
  harmsEnchanted?: true;
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
  /** "An artifact card with a mana ability" (Moonsilver Key): an activated or triggered one (CR 605.1). */
  manaAbility?: true;
  /** "Artifacts without mana abilities" (Midnight Arsonist): neither an activated nor a triggered one (CR 605.1). */
  noManaAbility?: true;
  /** "That has an activated ability with {T} in its cost" (Magewright's Stone): a mana ability or another, its own or granted; tapping other permanents doesn't count (rulings). */
  tapAbility?: true;
  /** "With an activated ability that isn't a mana ability" (Tsabo's Web, Ravager Wurm): its own or granted (CR 605.1a). */
  nonManaActivated?: true;
  /** "Transformed permanent" (CR 701.27g): a nonmodal double-faced permanent with its back face up, not melded or merged. */
  transformed?: true;
  /** "A face-down creature you control" (Ugin's Mastery, CR 708.2): a face-down permanent. */
  faceDown?: true;
  /** "Each with power greater than its base power" (Kutzil): see basePowerNow. */
  powerAboveBase?: true;
  /** "With base power or toughness 1" (Sword of the Squeak): a creature whose base power or base toughness is this (see basePowerNow). */
  basePtEither?: number;
  /** "With base power and toughness 1/1" (Bess, Soul Nourisher): a creature whose base power and base toughness are these (see basePowerNow). */
  basePT?: [number, number];
  /** "With base power 1" (Rapid Augmenter): a creature whose base power is this (see basePowerNow). */
  basePower?: number;
  /** "With toughness greater than its power" (Fecund Greenshell): as it is now (as it enters, for an enters trigger). */
  toughnessAbovePower?: true;
  /** "Whose power and toughness aren't equal" (Gilt-Leaf Winnower): as it is now. */
  ptUnequal?: true;
  /** "With power equal to its toughness" (Master Symmetrist): a creature whose power and toughness are the same. */
  ptEqual?: true;
  /** Excluded card types, e.g. "nonland permanent" -> ["Land"]. */
  notTypes?: string[];
  /** "A card with two or more card types" (Rendmaw, Creaking Nest): at least this many card types (CR 205.2a). */
  minCardTypes?: number;
  /** For spells: "that wasn't cast from its owner's hand" (Wash Away); a copy was never cast. */
  notCastFromHand?: true;
  /** For spells: "target spell you control that wasn't cast" (Errant, Street Artist): a copy (CR 707.10), never cast. */
  notCast?: true;
  /** Laquatus's Disdain: "target spell cast from a graveyard" (flashback and the like); a copy was never cast. */
  castFromGraveyard?: true;
  /** Excluded colors, e.g. "nonblack creature" -> ["B"]. */
  notColors?: Color[];
  /** "A card that shares a color with a legendary creature you control" (Ringsight): a color of one of them as the search is made; none if they're colorless (rulings). */
  colorOfYourLegend?: true;
  /** "A creature card that shares a creature type with the sacrificed creature" (Pyre of Heroes): searched for as it resolves, the creature as it last existed. */
  sharesCreatureTypeWithSacrificed?: true;
  /** At least one of these colors, e.g. "blue permanent", "red or green creature". */
  colors?: Color[];
  /** Each of these colors: "a spell that's both blue and red" (the Mimics). */
  bothColors?: Color[];
  /** "Multicolored spell" (two or more colors, CR 105.4), "monocolored" (exactly one), "colorless" (none, CR 105.2c). */
  colorCount?: "multicolored" | "monocolored" | "colorless" | /** one or more colors (CR 105.2c) */ "colored" | /** exactly two colors, or not exactly two */ "two" | "notTwo" | /** "all colors" (Jenson Carthalion): all five */ "all" | /** "that isn't all colors" (Iridian Maelstrom) */ "notAll";
  supertypes?: string[]; // "basic land", "legendary creature"
  /** At least one of these subtypes: "Spirit card", "Walls" (changelings have every creature type). */
  subtypes?: string[];
  /** Or one of these subtypes instead of one of `types`: "creature or Vehicle". */
  orSubtypes?: string[];
  /** Or a card that has an Adventure instead of one of `types`: "instant cards, sorcery cards, and/or have an Adventure" (Frantic Firebolt; rulings: an adventurer card in any zone but the stack). */
  orAdventure?: true;
  /** "A creature ... that they controlled since the beginning of the turn" (Keldon Twilight): its controller has controlled it continuously since the turn began. */
  controlledSinceTurnBegan?: true;
  /** "A card ... that has an Adventure" (Howling Galefang): an adventurer card (CR 715.2), whatever its types. */
  hasAdventure?: true;
  notSupertypes?: string[]; // "nonbasic land", "nonlegendary creature"
  /** "Artifact, enchantment, or nonbasic land": it also fits one of these (each alternative with its own qualities). */
  anyOf?: TargetSpec[];
  /** "Target creature an opponent controls chosen at random" (Scab-Clan Giant): a triggered ability's one target, chosen at random among the legal ones as it's put on the stack (rulings). */
  random?: true;
  keywords?: string[]; // "creature with flying"
  /** "Creatures you control with toxic" (Skrelv's Hive): any toxic ability, whatever its number (CR 702.164). */
  toxic?: true;
  notKeywords?: string[]; // "creature without flying"
  power?: Range; // "with power 4 or greater"
  toughness?: Range;
  /** "With total power and toughness 5 or less" (Cut Down): its power plus its toughness (rulings). */
  totalPT?: Range;
  manaValue?: Range; // "with mana value 3 or less" (CR 202.3)
  /** "With mana cost {0} or {1}" (Urza's Saga): its mana cost is exactly one of these (CR 202.1; not {X} or none, rulings). */
  manaCostIn?: string[];
  /** "Target spell with {X} in its mana cost" (Frontline Medic; CR 107.3). */
  xInCost?: true;
  /** "A spell ... without {X} in its mana cost" (Titans' Nest): no {X} in its mana cost (an {X} in another cost doesn't count, rulings). */
  noXInCost?: true;
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
   * Chosen or noted as you drafted cards (Conspiracy, CR 905.2b): "a card with a name you noted for cards named ~",
   * "one or more of the colors chosen as you drafted cards named Regicide". No draft comes before a game here, so
   * nothing was noted and nothing fits (rulings).
   */
  drafted?: true;
  /**
   * "Shares a color with the most common color among all permanents or a color tied for most common" (Barrin's Unmaking),
   * or (false) doesn't (Heroic Defiance): see mostCommonColors.
   */
  mostCommonColor?: boolean;
  /**
   * "With mana value less than or equal to the number of cards in its controller's graveyard" (Drown in the Loch): each
   * candidate against its own controller's graveyard, as it's chosen and as it resolves (CR 601.2c, 608.2b).
   */
  mvAtMostControllersGraveyard?: true;
  /** "As long as that player controls three or fewer lands" (Sheltering Prayers): its controller controls at most this many lands. */
  controllersLandsAtMost?: number;
  /**
   * `attackedThisTurn`: "creatures that attacked this turn" (declared as attackers this turn, CR 508.1).
   * `couldButDidntAttack`: "creatures that didn't attack this turn, except for creatures that couldn't attack" (Season of
   * the Witch): ones that could have been declared as attackers this turn but weren't (rulings, GameObject.couldAttack).
   */
  /** `attackingYou`: "creatures attacking you", attacking that player and not a planeswalker or battle (CR 506.3, 508.1b). */
  combat?: /** "Blocked creature" (Warpath): an attacking creature blocked this combat, even with its blockers gone (CR 509.1h); "unblocked": attacking and not blocked (509.1h). */ "blocked" | "unblocked" | /** "Nonattacking, nonblocking creature" (Unlikely Alliance). */ "notInCombat" | /** "Nonattacking creature" (Alarum): not an attacking creature now. */ "notAttacking" | "attacking" | "blocking" | "attackingOrBlocking" | "attackedThisTurn" | /** "Creature that blocked this turn" (Sizzling Barrage): declared as a blocker this turn (CR 509.1), even if it's no longer blocking (rulings). */ "blockedThisTurn" | /** "That attacked during their controller's last turn" (Halls of Mist): its controller now. */ "attackedLastTurn" | /** "That didn't attack this turn" (Kratos, God of War): not declared as an attacker this turn (CR 508.1a). */ "didntAttackThisTurn" | "couldButDidntAttack" | "attackingBattle" | "attackingYou" | /** "Attacking you or a planeswalker you control" (Soul Snare). */ "attackingYouOrYourPlaneswalker" | /** "Attacking one of your opponents" (Oviya, Automech Artisan): that player, not a planeswalker or battle. */ "attackingOpponent" | /** "Attacking alone" (Security Bypass): the only attacking creature (CR 506.5). */ "attackingAlone";
  /**
   * "Target creature that's attacking that player" after "Whenever you attack a player" (Ordruun Mentor, Echoing Assault):
   * attacking that player itself, not a planeswalker or battle (CR 506.3, 508.1b); "eventPlayer" until the trigger knows
   * that player, then that player.
   */
  attackingWhom?: "eventPlayer" | PlayerId;
  /** "Each green creature that entered this turn" (Oran-Rief): this object came onto the battlefield this turn (CR 400.7). */
  enteredThisTurn?: true;
  /** "Each creature that entered the battlefield under your control this turn" (Shaile, Dean of Radiance): with `enteredThisTurn`, its controller as it entered was the player matching (turnLog.entered), whoever controls it now. */
  enteredUnderYou?: true;
  /** Let the Galaxy Burn: "each creature that didn't enter this turn". */
  notEnteredThisTurn?: true;
  /** "That entered since your last turn ended" (Premature Burial): it entered after the last turn of the spell's controller ended (in a turn after it). */
  enteredSinceYourLastTurn?: true;
  /** "All Curses attached to you" (Witchbane Orb): Auras enchanting the player whose ability or spell this is (CR 303.4). */
  attachedToYou?: true;
  /** "Target creature card from a graveyard that was put there this turn" (Abyssal Harvester): from anywhere (GameObject.toGraveyardTurn). */
  putThereThisTurn?: true;
  /** "Target creature card in your graveyard that wasn't put there this combat" (Storrev, Devkarin Lich): not put there in the current combat phase (GameObject.toGraveyardCombat; rulings: from anywhere, for any reason). */
  notPutThereThisCombat?: true;
  /** "... that was put there from their library this turn" (Captain N'ghathrod), "... that was milled this turn" (Tato Farmer): GameObject.fromLibraryTurn, milledTurn. */
  fromLibraryThisTurn?: true;
  milledThisTurn?: true;
  /** "... that were put there from the battlefield this turn" (Brought Back): GameObject.fromBattlefieldTurn. */
  fromBattlefieldThisTurn?: true;
  /** "With lesser power" than the ability's source (mentor, CR 702.134a). */
  lesserPowerThanSource?: boolean;
  /** "With greater power" than the ability's source (Éowyn, Fearless Knight). */
  greaterPowerThanSource?: true;
  /**
   * "A creature that saddled it this turn" (The Gitrog, Ravenous Ride; CR 702.171c): tapped to pay the source's saddle
   * cost this turn, the source as the object it was (TurnLog.saddledBy). Only for a pick as the source's ability resolves.
   */
  saddledSource?: true;
  /** "Target creature that crewed it this turn" (Getaway Car; CR 702.122d): the same for crewing (TurnLog.crewedBy). */
  crewedSource?: true;
  /** "Target creature it's blocking" (Tinder Wall): one the source is blocking, or was as it last existed (CR 608.2h). */
  blockedBySource?: true;
  /**
   * "Target creature blocking ~" (Master of Arms): one blocking the source; "either" adds "or blocked by ~" (Cromat). With
   * the source sacrificed to pay the cost (Urborg Panther), as it last existed (CR 608.2h).
   */
  blockingSource?: "blocking" | "either";
  /**
   * "Target creature that player controls" in a trigger about a player ("Whenever ~ deals combat damage to a
   * player"): "eventPlayer", made concrete as `controlledBy` once the trigger knows that player.
   */
  /** "chosenPlayer": "creatures that player controls" after "Choose a player ..." (The Black Gate), bound as it resolves (fixMods). */
  controller?: "you" | "opponent" | "eventPlayer" | "enchanted" | "chosenPlayer";
  /** "Creatures the monarch controls" (Azure Fleet Admiral): controlled by the player who is the monarch now (CR 725). */
  monarchControls?: true;
  controlledBy?: PlayerId;
  /** "Creatures your opponents control" in an effect, bound to the effect's controller as it resolves (Rikku). */
  notControlledBy?: PlayerId;
  /** A battle's protector (CR 310.9): "each battle they protect" after "each opponent", "battle that player protects". */
  protector?: "opponent" | "eventPlayer";
  protectedBy?: PlayerId;
  /** For players: only opponents. */
  opponent?: boolean;
  /**
   * For players: "who was dealt combat damage by ~ this turn" (Hope of Ghirapur): by the source as the permanent it is
   * now, checked as it's chosen (a fact that can't change by the time it resolves).
   */
  combatDamagedBySource?: true;
  /** For players: "target player dealt damage by ~ this turn" (Wicked Akuba): any damage, by the source as the creature it is now (TurnLog.damagedBy). */
  damagedBySource?: true;
  /** "A creature that fought this turn" (Boxing Ring): one that fought since it became this object (CR 701.14, 400.7). */
  foughtThisTurn?: true;
  /** For players: "target player who attacked this turn" (Fire and Brimstone): who declared attackers this turn (a fact that can't change by the time it resolves). */
  attackedThisTurn?: true;
  /** "A creature card with no abilities" (Fang-Druid Summoner): a card whose rules text is empty but for reminder text. */
  noAbilities?: true;
  /** For players: "target player who lost life this turn" (Rix Maadi Guildmage): any life loss, damage or paid life too (CR 119.3). */
  lostLifeThisTurn?: true;
  /**
   * For players: "target opponent who has more life than you do as you activate this ability", "who controls more
   * creatures", "who has at least two more cards in hand", "who has at least two fewer creature cards in their graveyard"
   * (the Keepers): `stat` theirs minus yours is at least `by` (with `fewer`, yours minus theirs), checked only as it's chosen
   * (rulings: it resolves even if that's no longer true).
   */
  comparedToYou?: { stat: "life" | "creatures" | "hand" | "creatureCardsInGraveyard"; by: number; fewer?: true };
  /** For players: not the one a trigger is about ("choose another target player", The Lord of Pain); `notPlayer` once it's known. */
  notEventPlayer?: true;
  notPlayer?: PlayerId;
  /** "Target player other than ~'s owner" (Crown of Doom): `notPlayer` set to that owner as targets are chosen and checked. */
  notSourceOwner?: true;
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
    /** "Distribute up to that many counters" (Lathiel): any total from none to `total`, at least 1 for each target. */
    atMost?: true;
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
   * Colfenor, the Last Yew: "Whenever ~ or another creature you control dies, return up to one other target creature
   * card": not the card whose death triggered it (rulings), fixed as `notId` as the trigger is put on the stack.
   */
  notSubject?: true;
  notId?: ObjectId;
  /** With `notSource`: "target creatures and/or other planeswalkers" (Sorin, Lord of Innistrad): the source can be chosen while it's a creature (rulings). */
  notSourceUnlessCreature?: true;
  /** With `notSource`, a permanent picked (not targeted): "you may sacrifice another creature or an artifact" (Gut, True Soul Zealot): the source too while it's an artifact (rulings). */
  notSourceUnlessArtifact?: true;
  /**
   * "A creature of their choice that dealt combat damage to you this turn" (Witch-king of Angmar): "you" being the resolving
   * ability's controller, whoever picks it (turnLog.combatDamagedBy, this object as it was then).
   */
  dealtCombatDamageToYou?: true;
  /** "Target creature that dealt damage to you this turn" (Spear of Heliod): any damage, by this object as a creature then (turnLog.damagedBy). */
  dealtDamageToYou?: true;
  /** "Enchanted creature deals damage ... to any other target" (Pain for All): not the permanent the source is attached to. */
  notSourceHost?: true;
  /** Curse Artifact: "unless they sacrifice that artifact": only the permanent the source is attached to (a pick, not a target). */
  sourceHost?: true;
  /**
   * Targets this one can't be the same as: the others of the same "two target creatures" (CR 115.3),
   * or the earlier ones for "another target".
   */
  distinctFrom?: number[];
  /** "Up to three target cards from a single graveyard": in the same graveyard as these targets of the group, if chosen. */
  sameGraveyardAs?: number[];
  /** Goblin Welder's "target artifact card in that player's graveyard": owned by the controller of these permanent targets. */
  inGraveyardOfControllerOf?: number[];
  /** "Target player shuffles up to three target cards from their graveyard" (Memory's Journey): owned by this player target. */
  inGraveyardOfTarget?: number;
  /** "Choose target opponent ... Destroy target nonblack creature that player controls" (Keeper of the Dead): controlled by this player target. A planeswalker target ("target player or planeswalker", Searing Blaze): by its controller. */
  controlledByTarget?: number;
  /** "Two target creatures controlled by different players": not controlled by the controller of these targets. */
  differentControllerFrom?: number[];
  /**
   * "Each opponent may sacrifice a permanent of their choice that shares a card type with it" (Braids, Arisen Nightmare):
   * a card type of what this ability sacrificed, as it last existed (rulings: any one of them if it had several), made into
   * `types` as the choice is made.
   */
  sharesTypeWithSacrificed?: true;
  /** "A permanent ... that shares a card type with it" (Martyr's Bond): with the trigger's subject, as it last existed; bound as the pick resolves. */
  sharesTypeWithSubject?: true;
  /** "A creature of their choice that's blocking it" (Labyrinth Raptor): blocking the trigger's subject as the pick resolves (CR 509.1h); none once the subject has left combat or the battlefield (CR 506.4). Only a "pick" checks it. */
  blockingSubject?: true;
  /**
   * Cloudstone Curio: "another permanent you control that shares a permanent type with it": not the trigger's subject,
   * and sharing a permanent type with it as it is, or last was, on the battlefield (CR 608.2h), checked as it resolves.
   */
  sharesPermanentTypeWithSubject?: true;
  /** "Two target creature cards that share a creature type": shares one with each of these targets of the group. */
  sharesCreatureTypeWith?: number[];
  /** "Two target permanents that share a card type" (Shifting Loyalties): shares a card type with each of these targets, checked both ways and again as it resolves (rulings). */
  sharesCardTypeWith?: number[];
  /** With `sharesCardTypeWith`: "that shares one of those types with it" (Legerdemain), only these card types count. */
  sharesCardTypeAmong?: string[];
  /** "Two target creatures that share no creature types" (Rivals' Duel): shares none with each of these targets, checked both ways and again as it resolves (rulings). */
  sharesNoCreatureTypeWith?: number[];
  /** "Up to six target creature cards with different names" (Behold the Sinister Six!): a name none of these targets of the group has (CR 601.2c). */
  differentNameFrom?: number[];
  /**
   * "Any number of target creature cards that each have a different mana value X or less" (Agadeem's Awakening): each a
   * mana value none of the others has (CR 601.2c). On the "any number" entry (`many`) until it's made into its targets, which
   * then get `differentManaValueFrom`: a mana value none of these targets of the group has.
   */
  differentManaValues?: true;
  differentManaValueFrom?: number[];
  /** "X target cards from a single graveyard" (Rats' Feast): on the `many` entry until it's made into its targets, which then get `sameGraveyardAs`. */
  singleGraveyard?: true;
  /**
   * "Any number of target artifacts with total mana value 6 or less", "up to two target creature cards with total power
   * 10 or less": with the other targets that have it, the targets chosen add up to no more than `max` (CR 601.2c), or
   * the X announced (`x`, made into `max` as targets are chosen, see settleDivided). Checked again as it resolves: over
   * it then, every one of them is illegal (CR 608.2b; rulings on Nethroi, Reunion of the House).
   */
  /** "Any number of target creatures with equal toughness" (V.A.T.S.): the targets that have it all have the same toughness, as they're chosen and as it resolves (rulings: otherwise none of them is legal). */
  equalToughness?: true;
  total?: { key: "manaValue" | "power"; max?: number; x?: true; /** The result of the roll a reflexive trigger is after (PendingTrigger.rolled), made into `max` as targets are chosen. */ rolled?: true };
  /** true: tapped; false: untapped. */
  tapped?: boolean;
  /** "Creature that was dealt damage this turn": damage it was dealt, even if it's been removed since (regeneration). */
  dealtDamageThisTurn?: true;
  /** "Target creature that dealt damage this turn" (Executioner's Swing): it dealt damage as this object (CR 400.7). */
  dealtDamageAsSourceThisTurn?: true;
  /** true: a token; false: "nontoken". */
  token?: boolean;
  /**
   * "Enchanted creatures you control" (an Aura attached), "equipped creature" (an Equipment attached), "modified
   * creature" (CR 700.9: a counter on it, equipped, or enchanted by an Aura its controller controls); "unenchanted":
   * "creatures that aren't enchanted".
   */
  /** "Goaded creature" (Vengeful Ancestor): goaded by any player now (CR 701.15). */
  /** "Enchanted by an Aura you control" (Eriette of the Charmed Apple): `enchantedByYours`. */
  status?: "enchanted" | "equipped" | "enchantedOrEquipped" | "modified" | "unenchanted" | "goaded" | /** CR 702.112b. */ "renowned" | "enchantedByYours" | /** "With a legendary Equipment attached to it" (Kassandra, Eagle Bearer). */ "legendaryEquipped";
  /** "Target Aura attached to a creature", "Aura or Equipment attached to a creature you control": what it's attached to. */
  attachedTo?: TargetSpec;
  /** "Suspected creature" (CR 701.60). */
  suspected?: true;
  /** true: a commander ("commander creature you control", CR 903.3); false: "noncommander". */
  commander?: boolean;
  /** "a card named ~": the source's name; "a card named Ajani, Valiant Protector": that name (only for searches). */
  named?: string;
  /** "Enchantment you control that doesn't have the same name as another permanent you control" (Yenna): no other permanent `you` control has its name (a face-down one has none, CR 708.2). */
  uniqueNameAmongYours?: true | /** The Apprentice's Folly: "that doesn't have the same name as a token you control". */ "tokens";
  /** "Dragon cards not named ~" (Tiamat): any other name; "~" is the source's (only for searches). */
  notNamed?: string;
  /** "With a different name than each Aura you control" (Light-Paws): no permanent of this kind its controller controls as the search resolves has its name (only for searches; a face-down one has none, CR 708.2). */
  notNamedAsYours?: TargetSpec;
  /** `notNamedAsYours` worked out: none of these names. */
  notNamedAny?: string[];
  /** A search's `sameName` worked out as it resolves: one of these names (CR 201.2; none at all: nothing fits). */
  namedAny?: string[];
  /** None of these subtypes. */
  notSubtypes?: string[];
  /** "creature with a +1/+1 counter on it", "permanents with ice counters on them"; ANY_COUNTER: "with a counter on it". */
  counter?: CounterKind;
  /** "Creatures you control with three or more +1/+1 counters on them" (Runadi): at least this many of `counter`. */
  counterMin?: number;
  /** "creatures with no counters on them" (Damning Verdict). */
  noCounters?: true;
  /** "each creature without a +1/+1 counter on it" (Wave Goodbye). */
  notCounter?: CounterKind;
  /**
   * "Unless it's colorless or it's only the color its controller chose" (Selective Obliteration): only permanents with a
   * color other than the one their controller chose as this resolves (Chosen.colorsBy), multicolored ones always.
   */
  notOnlyControllersColor?: true;
  /**
   * "of the chosen type", "that aren't of the chosen type", "of the chosen color": the creature type
   * or color chosen for the source (see GameObject.chosen) or while the spell resolves. Before
   * `bindChosen` fills it in, a filter that needs a choice that wasn't made matches nothing.
   */
  chosen?: "type" | "notType" | "color" | "notColor" | "cardType" | /** "Of a type chosen this way" (Chosen.types: any of them), "that aren't ...". */ "typesChosen" | "notTypesChosen" | /** "with the chosen name", "with that name" (Chosen.name, CR 201.4). */ "name" | /** "Equal to the chosen number" (Chosen.number; see equalsChosen). */ "number" | /** "With power greater than or equal to the chosen number" (Expel the Interlopers): `power.min`, once it's known. */ "powerAtLeast" | /** "With mana value of the chosen quality" (Chosen.parity): `parity.is`, once it's known. */ "parity";
  /** "With mana value of the chosen quality" (Extinction Event), "with power of that quality" (Zimone's Hypothesis): odd or even, zero being even. */
  parity?: { of: "manaValue" | "power"; is?: "odd" | "even"; /** "Without mana value of the chosen quality": the other one. */ not?: true };
  /**
   * "With mana value, power, or toughness equal to the chosen number" (Talion): one of these is that number, filled in
   * as `equals` once it's known (bindChosen). Only creature spells have power and toughness (CR 208.3).
   */
  equalsChosen?: ("manaValue" | "power" | "toughness")[];
  equals?: number;
  /**
   * "Target spell with a single target": a spell that targets exactly one thing once, whether or not that target is
   * still legal (rulings on Deflection).
   */
  singleTarget?: boolean;
  /** "Target spell that's the second spell cast this turn" (Second Guess): its StackItem.castNth (0 for the first). */
  castNth?: number;
  /** "Target spell or ability with one or more targets" (Wyll's Reversal). */
  hasTargets?: true;
  /**
   * For "spell" targets: abilities on the stack it can also target, "target spell, activated ability, or triggered
   * ability" (CR 115.1c-d; mana abilities never use the stack, 605.3a); `noSpells`: "target activated ability".
   */
  stackAbilities?: "activated" | "triggered" | "both";
  noSpells?: true;
  /** "Target loyalty ability of a planeswalker" (Verdant Command): an activated loyalty ability only (CR 606.3, StackItem.loyalty). */
  loyaltyOnly?: true;
  /**
   * "Target activated or triggered ability you control from an enchantment source" (Weaver of Harmony), "... from a
   * colorless source" (Abstruse Archaic): what the ability's source must be (CR 113.7, 113.7a). An ability with no
   * source, like the monarch's, never matches (rulings on Abstruse Archaic).
   */
  abilityFrom?: { types?: string[]; colorless?: true; /** "From another legendary source that's not a commander" (The Peregrine Dynamo): a source with these supertypes, not the ability's own source, and not a commander (CR 903.3). */ supertypes?: string[]; another?: true; notCommander?: true };
  /**
   * For "spell" targets: a permanent matching this can be the target instead, "target spell or nonland permanent an
   * opponent controls" (Sink into Stupor, Venser, Shaper Savant). One target, either kind (CR 115.1, 115.2).
   */
  orPermanent?: TargetSpec;
  /**
   * For "object" targets: a card in a graveyard matching this can be the target instead, "up to three other target
   * creatures from the battlefield and/or creature cards from graveyards" (Angel of Serenity). One target, either kind.
   */
  orCard?: TargetSpec;
  /**
   * "Target spell that targets a permanent you control", "... that targets you": a spell with at least one target that's
   * still that object on the battlefield and matches, or that is you (rulings on Rebuff the Wicked).
   */
  targetsWhat?: TargetSpec | "you";
  /** "Counter target spell that targets ~" (Mistfolk): this ability's source, made into `targetsWhat` (as `objectId`) as targets are chosen and as it resolves (bindBound). */
  targetsSource?: true;
  /** For "any" targets: "target creature token, player, or planeswalker" (Coalborn Entity): a creature only if it's a token. */
  creatureTokens?: true;
  /** That very object (see `targetsSource`). */
  objectId?: string;
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
  /** With `many` "any": "up to one hundred target creatures" (Baldin), no more than this many. */
  manyMax?: number;
  /** With `many` "any": "one or more target creatures" (Dwarven Song), at least one. */
  manyMin?: 1;
  /**
   * With `many` "x": "up to X target creatures ..., where X is the number of Bobbleheads you control" (Endurance
   * Bobblehead): X worked out as the targets are chosen (CR 601.2c), not an announced X. `manyWhere` marks it until
   * the "where X is" is read.
   */
  manyCount?: AmountExpr;
  /** With many "x": "up to twice X target cards" (Erebos's Intervention), X times this. */
  manyTimes?: 2;
  manyWhere?: true;
  many?: "any" | "x" | "exactX" | /** "Another target for each time ~ was kicked" (Comet Storm): as many as times kicked, made so as it's cast (gateBody). */ "kicked";
  /**
   * "For each opponent, destroy up to one target artifact that player controls": one "up to one" target for each
   * opponent, controlled by that opponent (CR 601.2c, 115.6). This one entry stands for all of them until the targets
   * are chosen; `expandPerOpponent` (modes.ts) makes it one target per opponent then, each with `controlledBy`.
   */
  perOpponent?: true;
  /** With `perOpponent`: "for each player" (Nils, Discipline Enforcer), its controller first, then the others in turn order. */
  perPlayer?: true;
  /** With `perOpponent`: "For each opponent, gain control of target permanent that player controls" (Blatant Thievery): not
   * "up to one", so each opponent's target must be chosen if that opponent has one to target (CR 601.2c; rulings on
   * Sylvan Primordial), and none for one who doesn't. */
  perOpponentRequired?: true;
  /** Original text, for display. */
  text: string;
}

/**
 * Where "the same name as ..." takes its names from (CR 201.2), as the instruction resolves: a target (as it is, or as it
 * last existed, CR 608.2h; `card`: the card in the zone it's in now, Deicide's "the exiled card"), the trigger's subject
 * as it last existed (Remembrance's "that creature"), the spell a cast trigger is about (Mishra), each other permanent
 * like this you control (Pattern Matcher's "another creature you control"; Doubling Chant's one card for each), each card in your graveyard (Frostpyre
 * Arcanist), each card this effect exiled (Haunting Echoes, Pick the Brain), or the card revealed from your hand (Assembly Hall). A face-down object has no name (CR 708.2).
 */
export type SameNameRef = { target: number; card?: true } | { subject: true } | { spell: true } | { permanents: TargetSpec; /** Whose permanents: yours if left out (Dichotomancy: target opponent's). */ whose?: PlayerRef; other?: true; /** Doubling Chant: "for each creature you control, ... a creature card with the same name as that creature": one card for each of them (a search's `oneOfEach`). */ each?: true } | { yourGraveyard: true } | { exiledThisWay: true } | { revealed: true };

/** Where a card found by a search goes. */
export interface SearchDest {
  /** "cast": "search your library for ... and cast that card without paying its mana cost" (Sunforger): it stays in the library for `castSearched`. */
  zone: "hand" | "battlefield" | "libraryTop" | "graveyard" | "exile" | "cast";
  tapped?: boolean;
  /** "Exile it face down" (Beseech the Mirror): only its owner may look at it (CR 406.3); kept in Resolving.faceDownExiled. */
  faceDown?: true;
  /**
   * "You may play that card for as long as it remains exiled" (Praetor's Grasp, Hoarding Broodlord): the player who
   * searched may play the card exiled face down, and look at it (CR 406.3).
   */
  play?: FaceDownPlay;
  /** "Put that card third from the top" (Long-Term Plans), for "libraryTop". */
  third?: true;
  /** "Put it onto the battlefield with X additional +1/+1 counters on it" (Vision Quest, CR 614.1c). */
  counters?: { counter: CounterKind; n: Amount };
  /** "Put that card onto the battlefield attached to ~" (Light-Paws): an Aura that can't enchant the source stays in the library (rulings). */
  attachToSelf?: true;
  /** "Put it onto the battlefield attached to target player" (Bitterheart Witch): an Aura enchanting that player only, if it could, else it stays in the library (CR 303.4f-g). */
  attachToPlayer?: PlayerRef;
  /** "Search your library for any number of Plains cards, exile them" (Endless Horizons): the cards exiled are linked to the source, for its "a card you own exiled with ~" (CR 607.2a). */
  linked?: true;
  /** "Exile the other with a silver counter on it" (Karn, Scion of Urza): a counter of this kind on each card exiled (CR 122.1). */
  counter?: CounterKind;
  /** "Put it onto the battlefield tapped under target player's control" (Yavimaya Dryad): that player controls it, the searcher still its owner's library's searcher. */
  under?: PlayerRef;
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
/**
 * What a "when that mana is spent to cast ..." trigger needs the spell to be: a creature spell that shares a creature
 * type with your commander (Path of Ancestry), an instant or sorcery spell (Primal Wellspring), a red one (Pyromancer's
 * Goggles).
 */
/**
 * `spell`: "When you spend this mana to cast a spell with mana value 6 or greater" (Gilanra), "a Dragon creature spell"
 * (Lapis Orb of Dragonkind), checked once the spell is on the stack; `commander`: "to cast your commander" (Study Hall).
 */
export type SpentFor = { sharesCommanderType: true } | { instantOrSorcery: true; color?: Color } | { spell: TargetSpec } | { commander: true };

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
       * Radiance: "target creature and each other creature that shares a color with it" (Wojek Siren): also every other
       * permanent matching `filter` that has at least one of the target's colors as this resolves; a colorless target
       * shares a color with nothing, and none are affected if the target is illegal (rulings, CR 608.2b).
       */
      sharesColor?: { filter: TargetSpec };
      /**
       * "Return target creature and all Auras attached to it" (Hubris): also each permanent matching `filter` attached to
       * the target as this resolves (none if the target is illegal, CR 608.2b). `only`: "Destroy all Equipment attached to
       * that creature" (Turn to Slag): just those.
       */
      attachedToo?: { filter: TargetSpec; only?: true };
      /** "~ and that creature each get +2/+0" (Gogo, Mysterious Mime): the source too, while it's still that permanent. */
      andSelf?: true;
      /** "Return ~ and target land card from your graveyard to the battlefield" (Sandman, Shifting Scoundrel): this card too, while it's still the object whose ability this is (CR 400.7). */
      andSelfCard?: true;
      /** "Each of those creatures you don't control" (Lost in the Maze): only the targets another player controls as it resolves. */
      notYours?: true;
      /** "Each of those creatures with flying" (Winter Blast): only the targets like this as it resolves. */
      with?: TargetSpec;
      /**
       * "Exile target creature card from a graveyard. Create a token that's a copy of it" (The Scarab God): the targeted
       * card wherever this spell or ability has put it since (CR 400.7), copied as that card (rulings).
       */
      card?: true;
    }
  | { ref: "self" } // the source permanent ("this creature")
  | { ref: "ringBearer" } // "your Ring-bearer" (CR 701.54a): the controller's, if they have one
  /** "That spell" in a cast trigger (Monstrous Vortex): the spell whose casting triggered it, as it was cast. Counts only. */
  | { ref: "castSpell" }
  /** "Each creature dealt damage this way" (Aurelia's Fury): `filter` for the kind of permanent. */
  | { ref: "damagedThisWay"; filter?: TargetSpec }
  /** The card a "whenever a creature dies" trigger was about, in the zone it went to, while it's still that object (CR 400.7). */
  | { ref: "subjectCard"; /** Only while it's in this zone ("exile that card from your graveyard"); `public`: a graveyard, exile or the command zone (Nazgûl Battle-Mace's rulings), not a hidden zone (CR 400.2). */ zone?: "graveyard" | "public"; /** "A copy of that card" (Myrkul): copied as the card, not as the permanent it was. */ printed?: true } // "a creature dealt damage this way": what this ability's damage hit
  | { ref: "subject" } // the object its trigger event was about: exalted's "that creature" (see PendingTrigger.subject)
  /** "All Auras attached to that creature" (Treefolk Mystic): the permanents matching `filter` attached to the subject as this resolves. */
  | { ref: "attachedToSubject"; filter: TargetSpec }
  /** "Whenever one or more tokens your opponents control enter, for each of them, ..." (Kambal): those that entered, while on the battlefield. */
  | { ref: "eventGroup" }
  /**
   * After a leaves-the-battlefield trigger: the card in the zone it went to, if it's still that object ("return it to your
   * hand"). `moved`: an Aura's "when enchanted creature dies, return this card ..." (Angelic Destiny), the Aura card in a
   * graveyard it went to from the battlefield then or since, while it's still there (rulings); `yours`: "from your
   * graveyard", only if that's its controller's (rulings on Screams from Within).
   */
  /** "All other tokens created with ~" (Faerie Artisans): the tokens on the battlefield this object's abilities created, not those created as this resolves (rulings: each Artisans only its own). */
  | { ref: "tokensCreatedWithSelf" }
  | { ref: "selfCard"; moved?: true; yours?: true; /** Craft's "Return this card" (CR 702.167a): the card its own cost exiled, still in exile and still that object (CR 400.7j). */ exiledAsCost?: true }
  /** "Create a 0/0 Fractal creature token. Put X +1/+1 counters on it": the token(s) this ability just created. */
  | { ref: "created" }
  /** "The amassed Army" (CR 701.47c): the Army chosen by this ability's amass, or by the one whose reflexive trigger this is. */
  | { ref: "amassed" }
  /** "One of them" in a reflexive trigger (Gilgamesh): the permanents the ability that made it put onto the battlefield (PendingTrigger.putThisWay) that are still those objects. */
  | { ref: "putThisWay" }
  /** "For each creature card in your graveyard" (Grist, the Plague Swarm): the cards in the controller's graveyard that fit, by their printed characteristics (CR 404.2), as it resolves. */
  | { ref: "yourGraveyard"; filter: TargetSpec }
  /**
   * "The sacrificed creature": what was sacrificed to cast the spell, as it last existed (CR 608.2h). `exiledCost`: "the
   * exiled creature" for an "Exile a creature you control" cost (Food Chain), likewise. `revealedCost`: "the revealed
   * card" for a "reveal a ... card from your hand" cost (Titan's Presence), as it last existed in the hand (rulings).
   */
  | { ref: "sacrificed"; exiledCost?: true; revealedCost?: true }
  /** "The exiled card" of an "Exile a nonland card from your hand" cost (Jhoira of the Ghitu), while it's still that card in exile (CR 400.7). */
  | { ref: "costExiled" }
  /** "If an ability of an artifact, creature, or planeswalker is countered this way, that permanent" (Tishana's Tidebinder): the source of the ability this resolution countered, if it's still that object and fits `filter` now (rulings). */
  | { ref: "counteredSource"; filter: TargetSpec }
  /** "A card exiled with ~" (Mimic Vat): the cards this object's linked exile took that are still there (CR 607.2a, 400.7); its controller picks one where one is needed. */
  | { ref: "linkedCard" }
  /** The card "reveal the top card of your library" revealed, while it's still where it was (CR 400.7). */
  | { ref: "revealed" }
  /** "That card" after "mill a card" (Tablet of Discovery): each card this resolution's mill put into the graveyard, still there (CR 400.7). */
  | { ref: "milled" }
  /** The one card "exile the top card of your library" exiled, while it's still that card in exile (CR 400.7). */
  | { ref: "exiledTop" }
  /** "The exiled card" after "you may exile a creature card from your hand" (Nexus of Becoming): the one card this resolution's takeFromHand exiled, while it's still that card in exile (CR 400.7). */
  | { ref: "exiledFromHand" }
  /** "Defending player chooses a nonland card in your graveyard. Return that card to your hand." (O-Kagachi Made Manifest): the card this resolution's chooseFromGraveyard moved, where it went, while it's still that card (CR 400.7). */
  | { ref: "chosenFromYard" }
  /** "The discarded card" (Malcolm): the one card this resolution's last discard put into a graveyard, while it's still that card there. */
  | { ref: "discarded" }
  /**
   * "Creatures you control get +1/+1 until end of turn. Untap those creatures": the permanents this resolution's last
   * continuous effect changed, locked in as it began (CR 611.2c), while they're still those objects on the battlefield.
   */
  | { ref: "affected" }
  /** Battle cry's "each other attacking creature". */
  | { ref: "allCreatures"; controller?: "you" | "opponent"; other?: boolean; attacking?: boolean }
  /** "Enchanted creature", "equipped creature": the permanent the source is attached to, while it's still that source. */
  | { ref: "attached" }
  /** "If that Equipment was attached to a creature, ... to that creature" (Unforge): what target `index` is attached to, or was as it left the battlefield (rulings, CR 608.2h). */
  | { ref: "targetHost"; index: number }
  /** Joint Assault's "if it's paired with a creature, that creature": what target `index` is paired with as this resolves (CR 702.95b). */
  | { ref: "pairedWithTarget"; index: number }
  /** "all creatures", "each artifact and enchantment", "other creatures you control": every permanent that matches, not targeted. */
  /**
   * `of`: "each creature target player controls", "all lands that player controls": only that player's permanents (if
   * it's still a legal target, CR 608.2b).
   */
  | { ref: "each"; filter: TargetSpec; other?: boolean; /** "Whenever enchanted creature attacks, each other creature ..." (Martial Impetus): other than the trigger's subject, not the source. */ otherThanSubject?: true; /** "Create X 1/1 Soldier tokens. ... destroy all other creatures" (Martial Coup): all but the tokens this resolution created. */ notCreated?: true; /** A spell's "other creatures you control" after "target creature you control": all but that target. */ otherThan?: number; of?: PlayerRef; /** With `of`: "all artifacts target player owns" (Hurkyl's Recall): the permanents that player owns, whoever controls them (CR 108.3). */ ofOwner?: true; /** "~ and other creatures you control": the source too, while it's still on the battlefield. */ andSelf?: true; /** "... that share a creature type with it" (Haunted One): with the source as it is, or last was, on the battlefield (CR 608.2h). */ sharesTypeWithSelf?: true; /** "Each creature with the same mana value as the sacrificed creature" (Sanguine Praetor), "all creatures that share a creature type with the sacrificed creature" (Endemic Plague): the creature a cost sacrificed, as it last existed (CR 608.2h). */ sacrificedKin?: "manaValue" | "creatureType"; /** "That creature and each other creature you control that shares a creature type with it" (Holy Frazzle-Cannon): the trigger's subject too, the others not it and sharing a creature type with it, as it is or last was on the battlefield (CR 608.2h). */ andSubject?: true; /** "Enchanted creature and other creatures that share a creature type with it" (Crown of Vigor): what the source is attached to, or was as it was sacrificed for the ability (CR 608.2h), and the others sharing a creature type with it, as it is or last was on the battlefield. */ andAttached?: true; /** "Exile all creatures except those that share a creature type with a creature that convoked ~, all artifacts, and all enchantments" (Everything Comes to Dust): not a creature that is neither an artifact nor an enchantment and shares a creature type with one of the creatures tapped to convoke the resolving spell (CR 702.51a), each as it is or last was on the battlefield (CR 608.2h). */ spareConvokerTypes?: true }
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
  /** "All creatures blocking or blocked by ~" (Kjeldoran Frostbeast): the creatures in combat with the source now, none if it left (CR 506.4). */
  | { ref: "inCombatWithSelf"; /** "Each creature it's blocking" (Gomazoa): only the attackers it blocks. */ blocked?: true; /** "~ and each creature it's blocking": the source too, while it's on the battlefield. */ andSelf?: true; /** Trial: "all creatures blocking or blocked by target creature": in combat with that target instead of the source. */ ofTarget?: number }
  /** "Each creature blocking it" (Plague Wight; `subject`: the trigger's attacker, Trailblazer's Torch): the creatures blocking the source now, none if it left combat (CR 506.4). */
  | { ref: "blockingIt"; subject?: true }
  /**
   * "All creatures that blocked ~ this turn" (Joven's Ferrets, `blockers`), "that were blocked by that creature this turn"
   * (Glyph of Doom, `blocked`), "that blocked or were blocked by it this turn" (Venomous Breath, both): declared blocks this
   * turn with `of` as it was then (TurnLog.blocks), even if they're no longer blocking (rulings), each still that object.
   * `at`: `of` as a delayed trigger remembers it.
   */
  | { ref: "blockHistory"; of: ObjRef; at?: { id: ObjectId; zc: number }; blockers?: true; blocked?: true; /** Heat Stroke: "each creature that blocked or was blocked this turn": every blocker and every blocked attacker of this turn's blocks, whoever's (`of` unused). */ anyone?: true }
  /**
   * "Each permanent with the most votes or tied for most votes" (Council's Judgment), "each card with the most votes ..."
   * (Custodi Squire): what this ability's vote chose (CR 701.38), while each is still that object; none if no one voted.
   */
  | { ref: "voted"; /** "Each permanent chosen this way": every one chosen at least once. */ any?: true }
  /**
   * "Goad each creature that had counters put on it this way" (Agitator Ant): the permanents this resolution's picks put
   * counters on (not one a replacement effect kept them off, rulings), while each is still that object. `kind`: "each
   * creature that had a +1/+1 counter put on it this way" (Fangs of Kalonia), counters of that kind put by any instruction.
   */
  | { ref: "countersPutThisWay"; kind?: CounterKind }
  /** "Put a +1/+1 counter on each of those Vampires" (Urge to Feed): the permanents this resolution's tapAnyNumber tapped, while each is still that object. */
  | { ref: "tappedThisWay" };

/** Which player(s) an effect touches. */
/** What a player has the most of: life, cards in hand, or permanents they control that match `filter`. */
export type MostStat = { what: "life" } | { what: "hand" } | { what: "control"; filter: TargetSpec };

export type PlayerRef =
  | { ref: "you" }
  /** "When ~ leaves the battlefield, that player gains 3 life" (Soul Scourge): the player its enters ability targeted (TriggeredAbility.linksTarget). */
  | { ref: "linkedPlayer" }
  /** "Each player ~ attacked this turn" (Angel of Destiny): the players (not planeswalkers) the source attacked this turn, as this object. */
  | { ref: "attackedThisTurnBySelf" }
  | { ref: "subjectController" } // the controller of the object the trigger was about, or as it last existed
  | { ref: "subjectOwner" } // "its owner": whose the object the trigger was about is (CR 108.3)
  /** `n`: "any number of target players" covers the targets from `index` on (TargetSpec.many). */
  | { ref: "target"; index: number; n?: number }
  | { ref: "eachOpponent" }
  | { ref: "eachPlayer" }
  | { ref: "targetController"; index: number } // "its controller"
  /** "Each player other than its controller" (Fractured Identity): every player but the target's controller, as it last existed. */
  | { ref: "otherThanTargetController"; index: number }
  /** "That player or that planeswalker's controller" (Bonfire of the Damned): the target player, or the target planeswalker's controller. */
  | { ref: "targetOrController"; index: number }
  | { ref: "targetOwner"; index: number } // "its owner": a targeted card's owner (Pharika's "Its owner creates ...")
  /** "That player" in "Whenever ~ deals combat damage to a player, that player discards a card". */
  | { ref: "eventPlayer" }
  /** "Each of those opponents" (Breeches, Brazen Plunderer): the players a "one or more ... deal damage to your opponents" event was about (TriggerEventInfo.players). */
  | { ref: "eventPlayers" }
  /** "That attacking player" (Breena): the player who attacked, for "playerAttacksYourOpponent" (TriggerEventInfo.attacker). */
  | { ref: "attackingPlayer" }
  /** "Each other opponent" after "Whenever ~ deals combat damage to an opponent": this ability's controller's opponents but that one. */
  | { ref: "otherOpponents" }
  /** "Each other player" after a trigger about a player (Zenith Chronicler): every player in the game but that one. */
  | { ref: "otherPlayers" }
  /** The player this Aura is attached to ("enchanted player", CR 702.5d), as it last existed if it's gone. */
  | { ref: "enchantedPlayer" }
  /** "Each opponent attacking that player": each opponent of this ability's controller attacking the event player. */
  | { ref: "opponentsAttackingEventPlayer" }
  /** The players who chose to in the "each player may ..." being resolved (see the eachMay effect). */
  | { ref: "choseThisWay"; /** "Each opponent who does" (The Second Doctor): only the opponents among them. */ opponents?: true }
  /** "Each opponent who didn't" (Kynaios and Tiro), "each player who doesn't": those not among choseThisWay, still in the game. */
  | { ref: "notChoseThisWay"; opponents?: true }
  /** The players who did none of a punisher's options (see the punisher effect). */
  | { ref: "punished" }
  /** "Each player who can't discards a card" (Plaguecrafter): those who had nothing to sacrifice for the "pick" before. */
  | { ref: "couldntPick" }
  /** Gift's "the chosen player": the opponent the gift was promised to (CR 702.174a). */
  | { ref: "giftee" }
  /** "That player" after "Clash with an opponent" (Pollen Lullaby, Captivating Glance): the opponent clashed with (CR 701.30b). */
  | { ref: "clashOpponent" }
  /** "Players dealt damage this way" (Aurelia's Fury): by this spell's or ability's damage so far. */
  | { ref: "damagedThisWay" }
  /**
   * "They" in "Each player loses 1 life for each creature they control" (Stronghold Discipline): the player the instruction
   * is being done to, one at a time.
   */
  | { ref: "eachOne" }
  /**
   * "Choose an opponent. That player ...": the opponent chosen as this resolves (ChoiceKind "opponent"). `nth`: the nth
   * player chosen by Effect "choosePlayer" (Gluntch's "a second player"), counting from 0.
   */
  | { ref: "chosenPlayer"; nth?: number }
  /** "The chosen player" of "As ~ enters, choose a player" (Stuffy Doll): its source's (CR 614.12), as it last existed. */
  | { ref: "selfChosenPlayer" }
  /** "~'s controller" (Xantcha, which any player may activate): its source's controller, not necessarily this ability's, as it last existed (CR 608.2h). */
  | { ref: "selfController" }
  /** "Defending player" in a static ability of an attacking creature (Elturel Survivors): the player it's attacking, or whose planeswalker or battle it's attacking (CR 506.2); none while it isn't attacking. */
  | { ref: "selfDefending" }
  /** "Enchanted artifact's controller" (Gremlin Infestation): who controls the permanent the source is attached to now. */
  | { ref: "hostController" }
  /** "The player to your right" (Bucknard's Everfull Purse): the one before you in turn order, "to your left" the one after (CR 101.4). */
  | { ref: "neighbor"; side: "left" | "right" }
  /** "Its owner" in an ability of ~ about ~ itself (Yes Man): whose ~ is (CR 108.3). */
  | { ref: "selfOwner" }
  /** "The player whose turn it is" (Obeka, Brute Chronologist): the active player as it resolves. */
  | { ref: "activePlayer" }
  /** "Whose controller was dealt combat damage by ~ this turn" (Steel Hellkite): the players this object dealt combat damage to this turn. */
  | { ref: "combatDamagedBySelf" }
  /** "Each player who chose money" (Master of Ceremonies): those who chose that word in this one's "each opponent chooses". */
  | { ref: "choseWord"; option: string }
  /** "Each opponent who lost 3 or more life this turn" (Davros, Dalek Creator): paid life counts too (CR 119.4). */
  | { ref: "opponentsLostLife"; n: number }
  /** "Each opponent with no cards in hand" (Tinybones, Trinket Thief): as it resolves (rulings). */
  | { ref: "opponentsEmptyHanded" }
  /** "Each opponent who has three or more poison counters" (Phyrexian Atlas): as it resolves. */
  | { ref: "opponentsWithPoison"; n: number }
  /** "Each player with exactly 13 life" (Triskaidekaphobia): as it resolves. */
  | { ref: "playersWithLife"; n: number }
  /** "Each opponent dealt combat damage this game by a creature named ~" (Gollum, Obsessed Stalker): by any creature with this source's name, whoever controlled it (rulings; Player.combatDamagedByNames). */
  | { ref: "opponentsCombatDamagedByName" }
  /** "Each of its controller's opponents" (Bounty Board): every other player than the subject's controller (CR 102.2, 800.4), as it last existed. */
  | { ref: "subjectControllerOpponents" }
  /** "Each opponent who doesn't control a legendary creature or planeswalker" (Nicol Bolas, Dragon-God): those controlling no permanent that matches `filter` as it resolves. */
  | { ref: "opponentsControllingNo"; filter: TargetSpec }
  /** "Each player who controls the most creatures" (No Witnesses): every player tied for the most, counted as it resolves. `lands`: "the most lands" (Tectonic Hellion). `fewest`: "the fewest creatures" (Gor Muldrak, Amphinologist), every player tied for the fewest. */
  | { ref: "mostCreatures"; lands?: true; fewest?: true }
  /** "Each player other than target player" (Death by Dragons): every player but the target, if it's still legal (CR 608.2b). */
  | { ref: "otherThanTarget"; index: number }
  /** "The player who controls the most Wizards" (Thoughtbound Primoc): the one player with the most, none if two or more tie (rulings on Sokenzan Renegade). */
  | { ref: "uniqueMost"; stat: MostStat }
  /** "Each opponent who didn't discard a nonland card this way" (Kroxa): opponents none of whose cards discarded in this resolution match `filter` (printed characteristics), those who discarded nothing too. */
  | { ref: "opponentsNotDiscarded"; filter: TargetSpec }
  /** "Each player who controls an artifact or enchantment" (Fade from History): as this instruction is carried out. */
  | { ref: "playersControlling"; filter: TargetSpec };

export type DamageRecipient =
  | ObjRef
  | PlayerRef
  | { ref: "anyTarget"; index: number; /** "each of up to two targets" */ n?: number }
  /** "The player or planeswalker it's attacking" (Myr Battlesphere): what the source is attacking, or was as it last existed; nothing for a battle. */
  | { ref: "attackedBySelf"; subject?: true }
  /** "That permanent or player" after "Whenever a source you control deals damage to a permanent or player" (Ghyrson Starn): the permanent dealt it (the subject), while it's that permanent, or the player (the event player). */
  | { ref: "eventRecipient" }
  /**
   * "That player or a planeswalker that player controls" (Vial Smasher the Fierce, Curse of the Pierced Heart): not
   * targeted; the controller chooses one as it resolves (rulings), asked only when that player controls a planeswalker.
   */
  | { ref: "playerOrPlaneswalker"; who: PlayerRef };

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
  by?: { filter?: TargetSpec; choose?: TargetSpec; target?: ObjRef; /** "That other creatures would deal" (Haze Frog): not the rule's own source, as the object it is now. */ notSelf?: true };
  /** "Prevent the next N damage" (CR 615.7): a shield of N for all it applies to together. */
  n?: Amount;
  /** "The next time ... would deal damage": the next damage event only, however much (CR 615.8). */
  nextTime?: true;
  /** "... is dealt to [it] instead" (CR 614.9) rather than prevented. */
  redirect?: DamageRecipient;
  /** "You gain life equal to the damage prevented this way" (CR 615.5); `colors`: only for damage from a source of those colors. */
  gainLife?: { colors?: Color[] };
  /** "~ deals that much damage to that source's controller" (CR 615.5); `colors`: only for damage from a source of those colors. */
  /** `creatureToIt` (Comeuppance): damage from a creature source is dealt back to that creature instead, if it's still that permanent. */
  dealBack?: { colors?: Color[]; creatureToIt?: true };
  /** "For each 1 damage prevented this way, create a ... token" (Inkshield, CR 615.5): its controller creates them. */
  tokens?: TokenSpec;
  /** "For each 1 damage prevented this way, put a +1/+1 counter on that creature" (Test of Faith, Temper, Brace for Impact): on the creature it protects, as the damage is prevented (rulings: before state-based actions). `endStep`: "at the beginning of the next end step" (Sacred Boon), by a delayed trigger counting all it prevented (CR 603.7); `ifCreature`: only if what it protects is a creature then (Scars of the Veteran's "If it's a creature"). */
  countersOn?: { counter: CounterKind; endStep?: true; ifCreature?: true };
  /** Vengeful Archon: "If damage is prevented this way, ~ deals that much damage to target player or planeswalker" (CR 615.5): the target chosen as it was activated; dealt at once, by the source, after the damage (rulings). */
  dealTo?: DamageRecipient;
}

/** Does this reference cover target `i`? ("up to two target creatures" covers two in a row.) */
export const refCovers = (r: object, i: number): boolean =>
  "index" in r && typeof r.index === "number" && i >= r.index && i < r.index + ("n" in r && typeof r.n === "number" ? r.n : 1);

/** Is it kicker (CR 702.33), so a spell cast paying it is "kicked" for other cards, not replicate, waterbend and the like? */
export const isRealKicker = (k: CompiledCard["kicker"]): boolean => !!k && (kickerName(k) === "kicker" || kickerName(k) === "multikicker");

/** What a card's kicker-like cost is called (see CompiledCard.kicker). */
export const kickerName = (k: NonNullable<CompiledCard["kicker"]>): "kicker" | "multikicker" | "replicate" | "squad" | "offspring" | "waterbend" | "additional cost" =>
  k.replicate ? "replicate" : k.squad ? "squad" : k.offspring ? "offspring" : k.waterbend !== undefined ? "waterbend" : k.optional ? "additional cost" : k.multi ? "multikicker" : "kicker";

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
  /** "Colorless snow artifact tokens named Replicated Ring" (Replicating Ring): the snow supertype (CR 205.4g). */
  snow?: true;
  /** A token that's a copy of a card (Ginger's Gingerbrute): that card's mana cost (CR 111.3, 707.2). */
  manaCost?: string;
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
  op: "times" | "half" | "plus" | "minus" | "allBut" | "prevent" | /** "Deals damage equal to ~'s power instead" of less (Ojer Axonil): `amount`, when it's more. */ "raiseTo" | /** "It deals 2 damage to you instead" (Forethought Amulet): `amount` instead, for damage of at least `atLeast`. */ "setTo";
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
  /** Forethought Amulet: "If an instant or sorcery source would deal 3 or more damage to you": only to damage of at least this much. */
  atLeast?: number;
  /**
   * What would deal the damage: any of `filters` (as it deals it, CR 609.7b); `self`: the permanent with the ability (for
   * an Aura or Equipment, the permanent it's attached to); `other`: not that permanent; `spell`: a spell, not a permanent.
   * Missing: any source.
   */
  by?: { self?: true; other?: true; filters?: { spec: TargetSpec; spell?: true }[]; /** "By creatures it's blocking" (Wall of Vapor): a creature the holder is blocking; "by creatures blocking it" (Armored Transport): one blocking the holder. */ combatWithHolder?: "blocked" | "blocking"; /** A resolved effect's target or chosen source, as the object it was; `spell`: a spell, and the permanent it becomes (CR 609.7a). */ chosen?: { id: ObjectId; zc: number; spell?: true } };
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
  | { kind: "addTypes"; types: string[]; subtypes: string[]; supertypes?: string[]; allCreatureTypes?: true; chosenType?: true; /** The basic land type chosen as its source entered ("This land is the chosen type", Multiversal Passage). */ chosenLandType?: true }
  | { kind: "setTypes"; types: string[]; subtypes: string[]; /** "Becomes a legendary 4/4 red Dragon creature" (Sarkhan, the Dragonspeaker): it gains these supertypes and keeps its others (CR 205.4b). */ supertypes?: string[] } // layer 4, "becomes a 3/3 Elemental creature": new card types replace the old (CR 205.1a)
  /** `chosenType`: the creature type chosen as its source entered instead ("creatures you control are the chosen type"). */
  | { kind: "setSubtypes"; subtypes: string[]; chosenType?: true } // layer 4, "becomes a Frog": replaces only subtypes of the same kind (CR 205.1a)
  /**
   * Layer 4, "Nonbasic lands are Mountains", "enchanted land is an Island": the land's land types become these basic
   * ones, and it loses the abilities from its rules text, gaining each basic type's mana ability instead (CR 305.7).
   */
  | { kind: "setLandTypes"; subtypes: string[] }
  | { kind: "loseTypes"; types: string[]; /** "That's no longer an Equipment" (Haunted Plate Mail): those subtypes go too. */ subtypes?: string[] } // layer 4, "stops being a creature": that type and its subtypes go (CR 702.151b)
  /** Layer 4, "loses all creature types" (Amoeboid Changeling): its creature types go, changeling's too; ones gained later come back (rulings, CR 613.7). */
  | { kind: "loseCreatureTypes" }
  /** `chosen`: "becomes the color of your choice", the color chosen as it resolved; "colors": "the color or colors of your choice", the colors chosen. */
  | { kind: "setColors"; colors: Color[]; chosen?: true | "colors" } // layer 5
  | { kind: "addColors"; colors: Color[] } // layer 5, "is blue in addition to its other colors"
  /** Layer 6. `spares`: "This effect doesn't remove ~": the protection it grants doesn't make its source fall off (Cho-Manno's Blessing). */
  /**
   * `sharedAmongYours`: "creatures you control gain first strike until end of turn if a creature you control has first
   * strike. The same is true for flying, ..." (Odric, Lunarch Marshal): of `keywords`, those a creature its controller
   * controls has as it resolves, a variant such as hexproof from white included (rulings). `"graveyard"`: "... if a
   * creature card in your graveyard has flying. The same is true for ..." (Bleeding Effect): those a creature card in
   * its controller's graveyard has as it resolves.
   */
  | { kind: "addKeywords"; keywords: string[]; spares?: true; sharedAmongYours?: true | "graveyard" }
  | { kind: "removeKeywords"; keywords: string[] } // layer 6
  | { kind: "loseAllAbilities" } // layer 6
  /**
   * Layer 6: 'has "{T}: Add one mana of any color."', 'gains "When ~ dies, ..." until end of turn'. The text
   * is a triggered, activated or mana ability in which "~" ("this creature") is the object that has it.
   * Text naming the granting card by name is about that card (CR 201.5a), so it isn't compiled.
   */
  | { kind: "addAbility"; text: string }
  | { kind: "setPT"; power: Amount; toughness: Amount } // layer 7b
  /** "Is ... named Legitimate Businessperson" (Witness Protection): its name, a text-changing effect (layer 3, CR 613.1c). */
  | { kind: "setName"; name: string }
  /** "Have base toughness 1" (Maha, Its Feathers Night): toughness only, power unchanged. */
  | { kind: "setToughness"; toughness: Amount } // layer 7b
  | { kind: "setPower"; power: Amount } // layer 7b
  /** A characteristic-defining ability (CR 604.3): "~'s power and toughness are each equal to ...", layer 7a. */
  | { kind: "definePT"; power?: Amount; toughness?: Amount }
  | { kind: "modifyPT"; power: Amount; toughness: Amount } // layer 7c
  | { kind: "switchPT" } // layer 7d
  /**
   * Duplicant: "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the
   * last creature card exiled with it. It's still a Shapeshifter." `part` "types": its creature types become that card's
   * and Shapeshifter (layer 4); "pt": its base power and toughness become that card's (layer 7b, rulings). Nothing
   * while no card exiled with it (CR 607.2a) is a creature card.
   */
  | { kind: "linkedCreature"; part: "types" | "pt" }
  // Rules effects about what the object can do (CR 613.11), checked after the layers.
  | { kind: "cantAttack" }
  /** `ability`: "This creature can't block" as an ability it has (a suspected creature's, CR 701.60c), so in layer 6. */
  | { kind: "cantBlock"; ability?: true }
  /** "~ can't be attacked" (The Aetherspark): no creature may be declared as attacking it (CR 508.1b); one already attacking it goes on attacking it (rulings). */
  | { kind: "cantBeAttacked" }
  | { kind: "cantBeBlocked" }
  /** "You may have ~ assign its combat damage as though it weren't blocked" (an ability, so layer 6). */
  | { kind: "unblockedDamage" }
  /** Layer 6: "~ loses this ability" (a Licid): its printed activated ability with this index (in CompiledCard.activated). */
  | { kind: "loseActivated"; index: number }
  /** Layer 6: "becomes an Aura enchantment with enchant creature" (a Licid): it has enchant creature (CR 702.5a). */
  | { kind: "enchantCreature" }
  | { kind: "doesntUntap" }
  /** "Can't become untapped" (Frozen in Ice): it doesn't untap in its untap step or from any effect (see untapPermanent). */
  | { kind: "cantBecomeUntapped" }
  /** "Can't become suspected" (Airtight Alibi, CR 701.60): suspect effects don't apply to it. */
  | { kind: "cantBeSuspected" }
  /**
   * Ghostly Prison: "Creatures can't attack you unless their controller pays {2} for each creature they control that's
   * attacking you" (CR 508.1g-h): generic mana per creature attacking its controller.
   */
  /** Ghostly Prison: {n} per attacker; Sphere of Safety: {X}, a count (`amount`), attacking your planeswalkers too. */
  /** "Creatures can't block unless their controller pays {1} for each of those creatures" (Archangel of Tithes, CR 509.1d). */
  | { kind: "blockTax"; n: number }
  /** "Enchanted creature can't attack unless its controller pays {3}" (Brainwash), "~ can't attack unless you pay {1} for each +1/+1 counter on it" (Phyrexian Marauder): what attacking with this creature costs, whoever it attacks (CR 508.1g-h). */
  /**
   * Exalted Dragon: "~ can't attack unless you sacrifice a land"; Leviathan: "... two Islands"; Floodtide Serpent: "...
   * unless you return an enchantment you control to its owner's hand": costs to attack that aren't mana, paid as attackers
   * are declared (CR 508.1g-i), `n` permanents of yours matching `filter`.
   */
  | { kind: "ownAttackCost"; action: "sacrifice" | "bounce"; filter: TargetSpec; n: number }
  | { kind: "ownAttackTax"; n: number; perPlusOne?: true; /** "{1} for each card in your hand" (Cowed by Wisdom): counted as it applies, "your" being the source's controller. */ amount?: Amount }
  /** "~ can't attack or block unless you pay {2}" (Qal Sisma Behemoth), "Enchanted creature can't attack or block unless its controller pays {3}" (Oppressive Rays): what blocking with this creature costs (CR 509.1d-e), as for ownAttackTax. */
  | { kind: "ownBlockTax"; n: number; perPlusOne?: true; amount?: Amount }
  | { kind: "attackTax"; n: number; amount?: Amount; planeswalkers?: true; /** A symbol other than generic mana per creature, "{W/P}" (Norn's Annex). */ mana?: string; /** Nils, Discipline Enforcer: each creature with counters on it, {X} for it, X its number of counters (all kinds, rulings). */ perCounter?: true }
  /** "Untap ~ during each other player's untap step" (CR 502.3). */
  | { kind: "untapsDuringOthers" }
  | { kind: "blocksOnlyFlyers" } // "can block only creatures with flying" (a blocking restriction, CR 509.1b)
  /** "Attacks each combat if able" (an attack requirement, CR 508.1d). `combat`: "attacks this combat if able" (Legion
   * Warboss), only in that combat of the turn (`GameState.combatsThisTurn`); "this" until it resolves. */
  | { kind: "attacksIfAble"; combat?: number | "this"; /** "Attacks that combat if able" (Illusionist's Gambit): only in the added combat phase with this key (GameState.thatCombat). */ combatKey?: number }
  /**
   * Goaded by the effect's controller (CR 701.15b): it attacks each combat if able, and a player other than them if able.
   * `notGoaded`: the same requirements without goading it (Kardur, Doomscourge; Maximum Carnage rulings).
   */
  | { kind: "goad"; notGoaded?: true }
  /** "Can't have hexproof or shroud" (Arcane Lighthouse): no layer 6 effect gives them these, whatever its timestamp. */
  | { kind: "cantHaveKeywords"; keywords: string[] }
  /** "Attacks that opponent this turn if able" (encore, CR 702.141a): a requirement to attack that player (CR 508.1d). */
  /** Galactus, Devourer of Worlds: "~ attacks an opponent with the most life among your opponents each combat if able" (CR 508.1d). */
  | { kind: "mustAttackMostLife" }
  | { kind: "mustAttackPlayer"; player: PlayerId | /** "That player" after "choose an opponent" (Raving Dead): bound as it resolves (Effect "continuous"). */ "chosen" | /** "Attacks target opponent this turn if able" (Dulcet Sirens): that target, bound as it resolves. */ { target: number }; /** "Attacks that player this combat if able": in that combat only, as "attacksIfAble". */ combat?: number | "this" }
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
  | { kind: "preventDamage"; to?: true; by?: true; combat?: "only" | "non"; fromTypes?: string[]; /** "Put a +1/+1 counter on that creature for each 1 damage prevented this way" (Vigor, CR 615.5): the ability's controller puts them. */ plusOnes?: true; /** With plusOnes, "put that many +1/+1 counters on ~" (Anti-Venom): as many as the damage, even if it can't be prevented (CR 615.12). */ thatMany?: true; /** "When damage is prevented this way, ..." (Phyrexian Vindicator): a reflexive trigger of its source, "that much" being the damage prevented in the event (CR 603.12). */ reflect?: AbilityBody }
  /** "If a source you control would deal damage ..., it deals double that damage instead" (a replacement effect, CR 614.1a). */
  | { kind: "damageMod"; mod: DamageMod }
  /** "Damage that would be dealt by ~ can't be prevented" (CR 615.12); `combat`: combat damage only (Questing Beast). */
  | { kind: "unpreventable"; combat?: true }
  /** "Can't block creatures with power 2 or greater" (a blocking restriction on the blocker, CR 509.1b). */
  | { kind: "cantBlockCreatures"; filter: TargetSpec }
  /** "Can't be blocked by more than one creature" (CR 509.1b). */
  | { kind: "maxOneBlocker" }
  /** "Its activated abilities can't be activated" (Arrest), mana abilities included (CR 605.1a) unless `exceptMana`. */
  | { kind: "cantActivate"; exceptMana?: true; /** Serra Bestiary: "its activated abilities with {T} in their costs", mana abilities too (rulings). */ tapCost?: true }
  /** "Can't be blocked except by three or more creatures" (CR 509.1b; menace is the same with two, 702.111b). */
  | { kind: "minBlockers"; n: number }
  /** "Can't attack unless defending player controls an Island": checked per defending player (CR 508.1c). */
  | { kind: "cantAttackUnless"; defenderControls: TargetSpec }
  /** "Can't attack unless defending player has seven or more cards in their graveyard" (Vantress Gargoyle). */
  | { kind: "cantAttackUnlessDefenderYard"; n: number }
  /** "Can't attack if defending player controls an untapped creature with power 2 or less" (Mogg Jailer, CR 508.1c). */
  | { kind: "cantAttackIf"; defenderControls: TargetSpec }
  /** "Can't attack unless you control more lands than defending player" (Monstrous Hound): its controller's count against the player it would attack. */
  | { kind: "cantAttackUnlessMore"; what: "lands" | "creatures" }
  /** "Can't attack unless a black or green creature also attacks" (Scarred Puma): another attacker that fits, in the same declaration (CR 508.1c). */
  | { kind: "cantAttackUnlessAlso"; filter: TargetSpec }
  /** Orcish Conscripts: "can't attack (block) unless at least two other creatures attack (block)": in the same combat (CR 508.1c, 509.1b). */
  | { kind: "cantAttackUnlessOthers"; n: number }
  | { kind: "cantBlockUnlessOthers"; n: number }
  /**
   * "Creatures with power less than ~'s power can't block it" (CR 509.1b). `than: "source"`: less than the power of the
   * permanent with this ability, not the attacker's ("... can't block creatures you control", Champion of Lambholt).
   */
  | { kind: "cantBeBlockedByLesserPower"; than?: "source" }
  /** The Ring-bearer: "can't be blocked by creatures with greater power" (CR 701.54c). */
  | { kind: "cantBeBlockedByGreaterPower" }
  /** Spitfire Handler: "can't block creatures with power greater than ~'s power" (CR 509.1b). */
  | { kind: "cantBlockGreaterPower" }
  /** Ironclaw Curse: "can't block creatures with power equal to or greater than the enchanted creature's toughness" (CR 509.1b). */
  | { kind: "cantBlockPowerAtLeastToughness" }
  /** "Can't attack alone", "can't block alone" (CR 506.5, 508.1c, 509.1b). */
  | { kind: "cantAttackAlone" }
  /** "Can only attack alone" (Master of Cruelties): if it attacks, it's the only creature declared as an attacker (CR 506.5). */
  | { kind: "onlyAttacksAlone" }
  | { kind: "cantBlockAlone" }
  /** "Can't attack a player it has already attacked this turn" (Port Razer): attacking a planeswalker still can (rulings). */
  | { kind: "cantAttackSamePlayer" }
  /** "Can't attack you or planeswalkers you control" (Promise of Loyalty, CR 508.1c): "you" is the effect's controller. */
  | { kind: "cantAttackYou"; /** "That combat" (Illusionist's Gambit): only in the added combat phase with this key. */ combatKey?: number; /** Blazing Archon's "can't attack you": the player only, not their planeswalkers or battles (CR 508.1c). */ playerOnly?: true }
  /**
   * "Can't attack those players or planeswalkers they control this combat" (Chaos Dragon): the players, worked out as the
   * effect starts ("highestRoll": the opponents who had the highest result of the last "each player rolls", ties
   * included), in the combat going on only (CR 508.1c).
   */
  | { kind: "cantAttackPlayers"; players: PlayerId[] | "highestRoll"; combat?: number | "this" }
  /** "Can't attack its owner" (Alexios): that player, not their planeswalkers or battles (rulings). */
  | { kind: "cantAttackOwner"; /** Xantcha: "or planeswalkers its owner controls" too. */ planeswalkers?: true }
  /** "Can't be sacrificed" (CR 701.21): an instruction to sacrifice it does nothing; it can't be chosen to be sacrificed, for a cost either (rulings on Alexios). */
  | { kind: "cantBeSacrificed" }
  /** "It can't be turned face up" (Unable to Scream): not by its controller's special action (CR 116.2b, 702.37e). */
  | { kind: "cantTurnFaceUp" }
  /** "Can't transform" (Bound by Moonsilver): nor convert (CR 701.28f), not even by day and night (run-permanents.ts transformPermanent). */
  | { kind: "cantTransform" }
  /** "Can't crew Vehicles" (Revoke Privileges): it can't be tapped to pay a crew cost (CR 702.122a). */
  | { kind: "cantCrew" }
  /** "~ can't be equipped" (Goblin Brawler): Equipment can't become attached to it (CR 701.3b) and becomes unattached (704.5n). */
  | { kind: "cantBeEquipped" }
  /** Blocking requirements (CR 509.1c): "must be blocked if able", "all creatures able to block ~ do so". */
  | { kind: "mustBeBlocked"; /** "Must be blocked this combat if able" (Neyith of the Dire Hunt): in that combat only, as for attacksIfAble. */ combat?: number | "this" }
  | { kind: "allMustBlock"; /** "All Walls able to block ~ do so" (Marble Priest): only blockers that fit this (CR 509.1c). */ by?: TargetSpec }
  /**
   * Doran: "assigns combat damage equal to its toughness rather than its power" (CR 510.1a as modified); `ifGreater`
   * for "with toughness greater than its power", checked as the damage is assigned.
   */
  | { kind: "assignsToughness"; ifGreater?: true }
  /** Loot, the Anomaly: "If ~'s power is negative, ~ assigns combat damage as though ~'s power were positive" (only the damage assigned; its power is unchanged, rulings). */
  | { kind: "assignsAbsPower" }
  /** "Can attack as though it didn't have defender" (CR 702.3b). */
  | { kind: "attackDespiteDefender"; /** Only players who attacked you during their last turn (Weathered Sentinels). */ vsAttackedYou?: true }
  /**
   * "Can block creatures with landwalk abilities as though they didn't have those abilities" (Street Savvy), "can block
   * creatures with shadow as though it had shadow" (Heartwood Dryad): evasion it ignores as it blocks (CR 509.1b).
   */
  | { kind: "blockAsThough"; walk?: true; shadow?: true; /** "As though they didn't have shadow" (Aetherflame Wall): the attacker's shadow is ignored, not the blocker given it (CR 702.28b). */ notShadow?: true; /** "Can block Dragons as though it had reach" (Dragon Hunter, CR 702.17b): attackers of this creature type. */ reachVs?: string }
  /** "Enchanted creature can attack as though it had haste" (Instill Energy): it may attack while summoning sick (CR 302.6); its {T} abilities still can't be activated. */
  | { kind: "attackAsThoughHaste" }
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
  /** "Creatures blocking or blocked by ~" (Alms Beast): those in combat with the source now (CR 509.1h). */
  | { kind: "inCombatWithSelf" }
  | {
      kind: "filter";
      types: string[]; // all of these card types, e.g. ["Creature"]
      subtypes?: string[]; // any of these subtypes
      colors?: Color[]; // any of these colors
      /** `enchanted`: the player the source Aura enchants controls them ("creatures enchanted player controls"). */
      controller?: "you" | "opponent" | "enchanted";
      other?: boolean; // "other creatures ..." excludes the source
      /** "Other creatures you control get -1/-1" on an Aura (Vampirism): excludes the permanent the source is attached to. */
      otherThanAttached?: true;
      /** Backgrounds' "Commander creatures you own" (CR 903.3): commanders owned by the source's controller. */
      ownedCommanders?: boolean;
      /** Anything more the group says: "with a +1/+1 counter on it", "of the chosen type", "with flying". */
      spec?: TargetSpec;
      /**
       * "With power less than ~'s power" (Baeloth Barrityl): compared once power is known, so only for effects that apply
       * after layer 7 (goad).
       */
      lesserPowerThanSource?: true;
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
  /**
   * "All cards that aren't on the battlefield, spells, and permanents are colorless" (Mycosynth Lattice): its color change
   * applies to every card and spell outside the battlefield too, whoever owns or controls it (layers.ts offFieldColored).
   */
  offFieldAll?: true;
  /**
   * "Nonland permanents you control and permanent spells you control are enchantments in addition to their other types"
   * (Secret Arcade): its type change applies to its controller's permanent spells on the stack too (layers.ts
   * offFieldTyped).
   */
  offFieldSpells?: true;
  /**
   * "Lands you control and land cards you own that aren't on the battlefield are Deserts in addition to their other types"
   * (Dune Chanter): its type change applies to its controller's land cards outside the battlefield too (layers.ts
   * offFieldTyped).
   */
  offFieldLands?: true;
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
  /** "If that creature has a +1/+1 counter on it" (Marcus, Mutant Mayor): the trigger's subject, or as it last existed. */
  | { kind: "subjectCounter"; counter: CounterKind; /** "If that creature has three or more +1/+1 counters on it" (Hadana's Climb): at least this many (default 1). */ min?: number }
  /**
   * Guardian Project: "if it doesn't have the same name as another creature you control or a creature card in your
   * graveyard", about the creature that entered. A face-down creature has no name (CR 708.2), so it shares none (rulings).
   */
  | { kind: "subjectNameUnique" }
  /** "If it was a Human" (Slayer's Plate): the trigger's subject's creature types, or as it last existed (CR 608.2h). */
  | { kind: "subjectType"; subtype: string }
  /** "If it's a creature" (Trail of Mystery): the trigger's subject has this card type, or had it as it last existed (CR 608.2h). */
  | { kind: "subjectCardType"; type: string }
  /** "If it wasn't put onto the battlefield with this ability" (Kodama of the East Tree): the entering permanent (GameObject.putBy). */
  | { kind: "subjectPutBySelf"; not?: true }
  /** Chainer: "if you didn't cast it from your hand", about the entering permanent (GameObject.castFromHand). */
  | { kind: "subjectCastFromHand"; not?: true }
  /** Preston, the Vanisher: "if it wasn't cast", about the entering permanent (GameObject.wasCast). */
  | { kind: "subjectWasCast"; not?: true }
  /** Prized Amalgam: "if it entered from your graveyard or you cast it from your graveyard", about the entering permanent (GameObject.enteredFromGraveyard, castFromGraveyard): one you own. */
  | { kind: "subjectFromYourGraveyard" }
  /** "If it's the first time that creature has become tapped this turn" (Captain America, Living Legend): the trigger's subject, as the same object (GameObject.tapsThisTurn). */
  | { kind: "subjectFirstTapThisTurn" }
  /** "If its power was different from its base power" (Jason Bright, Glowing Prophet): the trigger's subject now, or as it last existed (CR 608.2h). */
  | { kind: "subjectPowerNotBase" }
  /** Rith: "if a creature or planeswalker an opponent controlled was dealt excess damage this turn" (any of `types`). */
  | { kind: "opponentsDealtExcess"; types: string[] }
  /**
   * Aegar: "if a Giant, Wizard, or spell you controlled dealt damage to it this turn": the trigger's subject was dealt
   * damage this turn by a source you controlled then that was a spell or had one of `subtypes`.
   */
  | { kind: "subjectDamagedBy"; subtypes: string[]; spell: boolean }
  /** A number compared to fixed bounds: "as long as your devotion to black is less than five" (Theros gods, CR 700.5). */
  /** `moreThan`: "if the number of attacking creatures is greater than the number of quest counters on ~" (ED-E): both counted now. */
  /** `parity`: "as long as ~'s power is even" (Kianne, Corrupted Memory): 0 counts as even. */
  | { kind: "amount"; amount: Amount; min?: number; max?: number; moreThan?: Amount; parity?: "even" | "odd" }
  /** "If ~ is in your graveyard" (`creatureAbove`: "with a creature card directly above it", Krovikan Horror). */
  | { kind: "selfInGraveyard"; creatureAbove?: true }
  /** "If this card is exiled" (Senu): still that card, face up in its owner's exile (CR 603.4). */
  | { kind: "selfInExile" }
  /** Firemane Angel's "if ~ is in your graveyard or on the battlefield", one ability for each zone: still there, the same object (CR 400.7, 603.4). */
  | { kind: "selfStill"; zone: "graveyard" | "battlefield" }
  /** Codespell Cleric: "if it was the second spell you cast this turn": ~ entered this turn as that spell, cast (not a copy), the `n`th of its controller's this turn. */
  | { kind: "selfCastNth"; n: number }
  /** Eminence's "if ~ is in the command zone or on the battlefield". */
  | { kind: "selfCommandOrBattlefield" }
  /** "If ~ is in the command zone" (Oloro, Ageless Ascetic): an ability that works only there (CR 113.6). */
  | { kind: "selfInCommand" }
  /** "If ~ dealt damage to another creature this turn" (Wolverine, Best There Is): as the object it is now (TurnLog.damagedCreature). */
  | { kind: "selfDamagedCreature" }
  /** Delirium: card types among cards in your graveyard (CR 205.2a). */
  | { kind: "graveyardTypes"; n: number; /** Only permanent types (CR 110.4a): "permanent types among cards in your graveyard". */ permanent?: true }
  /** Descend: permanent cards in your graveyard (CR 110.4b). */
  | { kind: "graveyardPermanents"; n: number }
  | { kind: "selfCounter"; counter: CounterKind }
  /** A level symbol's "at least N1 and no more than N2 level counters" (CR 711.2), a station symbol's "N or more charge counters" (CR 721.2). */
  | { kind: "selfCounters"; /** "*": all kinds together. */ counter: CounterKind; min: number; max?: number; /** Sab-Sunen: "an even number of counters on it" (zero is even). */ parity?: "even" | "odd" }
  /** A Class's level (CR 716.2a): at least `min`, at most `max`; a permanent without a level is level 1 (716.2d). */
  | { kind: "classLevel"; min: number; max?: number }
  /** "As long as it's attacking", "it's enchanted / equipped", "it's modified" (CR 700.9), "if it devoured a creature" (CR 702.82b). */
  /** `controlledThisTurn`: "it came under your control this turn" (CR 302.6). `hasCounter`: a counter of any kind on it. `not`: "~ didn't attack this turn" (Air Nomad Student). */
  | { kind: "self"; is: "attacking" | /** "~ is blocking" (CR 509.1g). */ "blocking" | /** "~ is blocked": an attacking creature blocked this combat, even with its blockers gone (CR 509.1h). */ "blocked" | /** "At least one creature is blocking ~" (Grizzled Wolverine): blocked, by a creature still blocking it. */ "hasBlockers" | /** "Two or more creatures are blocking ~" (Rampaging Cyclops). */ "twoOrMoreBlockers" | "attackingOrBlocking" | "attackingAlone" | "enchanted" | "equipped" | "modified" | "devoured" | "attachedToCreature" | "tapped" | "untapped" | "monstrous" | /** CR 702.112b. */ "renowned" | "escaped" | "attackedThisTurn" | /** "If ~ attacked or blocked this combat" (Kjeldoran Home Guard): declared as one in this combat (CR 508.1, 509.1). */ "attackedOrBlockedThisCombat" | /** "Unless it attacked or blocked this turn" (Lurker): declared as one this turn. */ "attackedOrBlockedThisTurn" | /** "If ~ attacked this combat" (Tolsimir, Midnight's Light): declared as an attacker in this combat. */ "attackedThisCombat" | "attackedBattleThisTurn" | "saddled" | "enteredThisTurn" | "onBattlefield" | "controlledThisTurn" | "hasCounter" | "prepared" | /** Its impending cost was paid and it has a time counter on it (CR 702.176a). */ "impending" | /** "If a counter was put on ~ this turn" (Wakka): as it entered too (CR 122.6). */ "countersPutThisTurn" | /** "~ isn't legendary if it's a token" (Aeve). */ "token" | /** "If ~ was dealt damage this turn" (Wall of Resistance): read by triggers only. */ "dealtDamageThisTurn" | /** "If ~ dealt damage to an opponent this turn" (Whirling Dervish): read by triggers only. */ "dealtDamageToOpponentThisTurn" | /** "As long as it has dealt damage" (Karakyk Guardian's "hasn't dealt damage yet" is its `not`): since it became this object. */ "hasDealtDamage" | /** "If ~ wasn't kicked" (Skizzik): the permanent's spell was (CR 702.33d). */ "kicked" | /** "As long as it was cast" (The Tarrasque): it entered as a resolving spell, from any zone (rulings). */ "cast" | /** "If her sneak cost was paid this turn" (Karai, Future of the Foot): this permanent's spell was cast for its sneak cost this turn (CR 702.190a). */ "sneakThisTurn"; not?: true }
  /**
   * "If ~ is a Warrior, ..." (Figure of Destiny): its source as it is now, with every effect applied (CR 608.2c). Only an
   * instruction's condition, checked as it resolves: a static ability's condition about its own types would depend
   * on the layers being worked out.
   */
  | { kind: "selfIs"; filter: TargetSpec }
  /**
   * "As long as the top card of your library is black / a creature card" (Vampire Nocturnus, Mul Daya Channelers): the
   * card on top of the source's controller's library, as printed (a card in a library has only its printed
   * characteristics), false with an empty library.
   */
  | { kind: "topCardIs"; filter: TargetSpec }
  /** A trigger's "if its toughness is 3 or less" about its own source (Young Hero Role, CR 603.4): power or toughness now. */
  | { kind: "selfPT"; stat: "power" | "toughness"; min?: number; max?: number }
  /** "Draw a card if its power is 3 or greater" about a trigger's subject (Tribute to the World Tree): as it is now, or as it last existed (CR 608.2h). */
  /** `greatest`: "if its power is greater than each other creature's power" (Selvala, Heart of the Wilds), creatures on the battlefield now. */
  | { kind: "subjectPT"; stat: "power" | "toughness"; min?: number; max?: number; greatest?: true; /** "If that creature's power is greater than ~'s" (Pelt Collector): than this permanent's, as it last existed if it's gone. */ greaterThanSource?: true }
  /** "If you're the defending player" (Kazuul, Tyrant of the Cliffs): the trigger's subject is still attacking you, a planeswalker you control or a battle you protect (CR 506.2). */
  | { kind: "subjectAttackingYou" }
  /** "Activate only if ~ entered this turn or if you control a basic land": either one. */
  | { kind: "anyOf"; conds: StaticCondition[] }
  /** "~ can't attack or block unless a player has no cards in hand" (Lupine Prototype): while `cond` is false. */
  | { kind: "not"; cond: StaticCondition }
  /** Coven: "if you control three or more creatures with different powers" (three or more different power values). */
  | { kind: "coven" }
  /**
   * "If an opponent controls more lands than you", "... more creatures than you", "an opponent has more life than you",
   * "... more cards in hand than you": any one opponent.
   */
  /** `subjectController`: "if that player controls more lands than you", that player being the entering land's controller. */
  /** Confounding Conundrum: "if that player had another land enter the battlefield under their control this turn": the entering land's controller (as it is or last was), another land than that one (TurnLog.entered). */
  | { kind: "subjectControllerOtherLandEntered" }
  | { kind: "opponentMore"; what: "lands" | "creatures" | "life" | "hand"; subjectController?: true; /** "That player" is the active player, an opponent (Keeper of the Accord). */ activePlayer?: true; /** "If defending player controls more lands than you" (Aerial Surveyor): the trigger's event player. */ eventPlayer?: true; /** "At least two more lands than you" (Isolated Watchtower): by this many or more. */ atLeast?: number; /** "If you have more life than an opponent" (Feudkiller's Verdict): an opponent has less. */ fewer?: true }
  /** "If that player has more cards in hand than each other player" (Battle Angels of Tyr): the trigger's event player. */
  | { kind: "eventPlayerMost"; what: "lands" | "creatures" | "life" | "hand" }
  /** "As long as you have more cards in hand than each opponent" (Okina Nightwatch): strictly more than each opponent still in the game. */
  | { kind: "youMost"; what: "lands" | "creatures" | "life" | "hand"; /** "You control fewer creatures than each opponent" (Even the Odds): strictly fewer than each opponent in the game. */ fewer?: true }
  /** "If that opponent has more life than another of your opponents" (Breena): the event player against your other opponents. */
  | { kind: "eventPlayerMoreThanAnotherOpponent"; what: "life" }
  /** "If one or more players being attacked are poisoned" (Norn's Decree): attacked themselves, not their planeswalkers or battles (CR 508.3b), with a poison counter. */
  | { kind: "attackedPlayerPoisoned" }
  /** "You control the creature with the greatest power or tied for the greatest power" (Triumph of Ferocity), "the artifact with the greatest mana value ..." (Padeem): among all on the battlefield. */
  | { kind: "controlGreatest"; type: "Creature" | "Artifact"; stat: "power" | "toughness" | "manaValue" }
  /** "As long as you have the city's blessing" (CR 702.131c). */
  | { kind: "citysBlessing"; /** "Unless you have the city's blessing". */ not?: true }
  /** "If it's night" (CR 731.1): the game is night (or day) now; neither before day/night begins. */
  | { kind: "dayNight"; v: "day" | "night" }
  /** "As long as you have an enduring story" (CR 702.195b). */
  | { kind: "enduringStory"; /** "Unless you have an enduring story". */ not?: true }
  /** "If it's your turn"; `not`: "if it's not your turn" (Force of Negation). */
  | { kind: "yourTurn"; not?: true }
  /** "During extra turns" (Medomai the Ageless): the turn being taken is an extra turn (CR 500.7), whoever's it is. */
  | { kind: "extraTurn" }
  /** "If it isn't that player's turn" (Tataru Taru): the trigger's event player is (not) the active player. */
  | { kind: "eventPlayersTurn"; not?: true }
  /**
   * "Activate only during your turn, before attackers are declared": your turn, before its declare attackers step
   * begins (rulings: before the first combat's declare attackers step; there's one combat a turn here).
   */
  | { kind: "beforeAttackers" }
  /** "As long as you're the monarch" (CR 725). */
  /** "If that player attacked you during their last turn" (O-Kagachi, Vengeful Kami): the trigger's player, in their most recent turn. */
  | { kind: "eventPlayerAttackedYou" }
  | { kind: "monarch"; /** "If an opponent is the monarch" (Queen Marchesa). */ opponent?: true; /** "If you're not the monarch" (Court of Vantress). */ not?: true; /** "If there is no monarch" (Crown of Gondor): no player is (CR 725). */ none?: true; /** "If that player is the monarch" (M'Baku, Jabari Chieftain): the trigger's player. */ eventPlayer?: true; /** "If you were the monarch as the turn began" (Knights of the Black Rose). */ asTurnBegan?: true }
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
  | { kind: "controlCommander"; types?: string[]; /** Lieutenant's "if you control your commander": one you own (CR 903.3). */ own?: true; /** Crimson Honor Guard: "unless they control a commander", the trigger's player. */ eventPlayer?: true }
  /** "If you have a full party" (CR 700.8a): four creatures in your party. */
  | { kind: "fullParty" }
  /** "If you don't control a Ring-bearer" (CR 701.54e); `self`: "as long as ~ is your Ring-bearer". */
  | { kind: "ringBearer"; not?: true; self?: true }
  /** "If the Ring has tempted you two or more times this game" (Frodo, Adventurous Hobbit; CR 701.54c): `n` or more. */
  | { kind: "ringTempted"; n: number }
  /** Max speed (CR 702.178a, 702.179e): your speed is 4. */
  | { kind: "maxSpeed" }
  /** "∞ — [Ability]": as long as this permanent is harnessed (CR 702.186b). */
  | { kind: "harnessed" }
  /**
   * "Whenever ~ attacks a player, if no opponent has more life than that player": none of the attacking player's
   * opponents has more life than the attacked player (rulings; the attacker's own life isn't compared).
   */
  | { kind: "defenderMostLife" }
  /** "As long as defending player controls the most creatures or is tied for the most" (Hooded Horror): the player it's attacking, among all players. */
  | { kind: "defenderMostCreatures" }
  /** "Unless it's paired with a creature with soulbond" (CR 702.95b): `not` for "unless". */
  | { kind: "paired"; withKeyword?: string; not?: true }
  /** Morbid: "if a creature died this turn" (CR 700.4); `n`: "if two or more creatures died this turn"; `yours`: "under your control". */
  | { kind: "creatureDied"; n?: number; yours?: true; /** "A creature not named ~" (Ebondeath, Dracolich): with another name as it last existed. */ notNamedSelf?: true }
  /**
   * "If no creatures are on the battlefield", "if four or more creatures are attacking" (Arrow Volley Trap), "if there are
   * thirteen or more creatures on the battlefield": how many permanents matching `filter` there are, under anyone's control.
   */
  /** "You control more lands than attacking player" (Monstrous Hound): than the active player, the one whose creatures attack (CR 506.2); `not`: you don't. */
  | { kind: "moreThanActive"; what: "lands" | "creatures"; not?: true }
  | { kind: "onBattlefield"; filter: TargetSpec; max?: number; min?: number; /** "Five or more other creatures" (Deathbringer Regent): not counting the source. */ other?: true }
  /** "If an opponent lost life this turn". */
  /** "If an opponent lost life this turn"; `n`: "lost 2 or more life this turn", one opponent alone (rulings on Bloodchief Ascension). */
  /** "If a player discarded a card this turn" (The Raven Man): any player, any discard this turn. */
  | { kind: "discardedThisTurn"; /** "If an opponent discarded a card this turn" (Tinybones, Trinket Thief): an opponent of `you`. */ opponent?: true; /** "If you've discarded a card this turn" (Recalibrate): `you`. */ yours?: true }
  | { kind: "opponentLostLife"; n?: number; /** "If a player lost 4 or more life this turn" (Y'shtola, Night's Blessed): any player, you too. */ anyPlayer?: true; /** "An opponent has been dealt damage this turn" (Bloodcrazed Goblin): damage, not life loss (infect's too, CR 120.3). */ damaged?: true; /** "Noncombat damage" (Grim Repriser): with `damaged`, only damage that wasn't combat damage (CR 120.2b). */ noncombat?: true }
  /** "If you've scried or surveilled this turn" (Proctor of Potential): `you` scried or surveilled at least once this turn (CR 701.22, 701.25). */
  | { kind: "scriedThisTurn"; /** "As long as you've surveilled this turn" (Darkblade Agent): surveilling only. */ surveil?: true }
  /**
   * "If you haven't been dealt combat damage since your last turn" (Marchesa, Resolute Monarch): none from the start of
   * your previous turn (Player.lastTurnBegan; the whole game if you haven't had one) until now.
   */
  | { kind: "noCombatDamageSinceLastTurn" }
  /** Nightkin Ambusher: "as long as defending player has a rad counter": the player the source is attacking (CR 506.2, 728). */
  | { kind: "defendingHasRad" }
  /** "If a player was dealt combat damage by a Zombie this turn" (Lost Monarch of Ifnir): by a creature of that type. */
  | { kind: "playerCombatDamaged"; subtype: string }
  /** "If an opponent was dealt combat damage by a legendary creature this turn" (Blitzball): whoever controlled it (rulings). */
  | { kind: "opponentCombatDamagedByLegendary" }
  /** "If an opponent was dealt 7 or more damage this turn" (Spinerock Knoll): in total, from any sources (rulings). */
  | { kind: "opponentDealtDamage"; n: number; /** "If you were dealt 4 or more damage this turn" (Boarded Window): `you`. */ you?: true }
  /** "If you attacked with three or more creatures this turn" (Windbrisk Heights): different creatures you declared as attackers. */
  | { kind: "attackedWith"; n: number; /** "Three or more Merfolk" (Deepway Navigator): of that creature type as they were declared. */ subtype?: string; /** In this combat only, not this turn (Kytheon, Hero of Akros). */ combat?: true }
  /** Pack tactics: "if you attacked with creatures with total power 6 or greater this combat": their total power as they were declared as attackers (PlayerState.attackPower; AFR release notes). */
  | { kind: "attackPower"; n: number }
  /** "If you lost life last turn" (First Response, Paladin of Atonement): during the turn before this one (GameState.lastTurn). */
  | { kind: "lostLifeLastTurn" }
  /** "If you've drawn two or more cards this turn"; `opponent`: "if an opponent drew three or more cards this turn" (Runeflare Trap). */
  | { kind: "drawn"; n: number; opponent?: true }
  /** "If you descended this turn": a permanent card was put into your graveyard this turn (CR 700.11). */
  | { kind: "descended" }
  /** "If you cycled two or more cards this turn" (Spellpyre Phoenix): cards cycled this turn, before it was there too (rulings). */
  | { kind: "cycled"; n: number }
  /** Revolt: "if a permanent left the battlefield under your control this turn". */
  | { kind: "revolt"; /** "If a creature left the battlefield under your control this turn" (Tale of Momo). */ creature?: true; /** "If no permanents left the battlefield this turn" (Sarevok, Deathbringer): none at all, anyone's. */ none?: true }
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
   * "If two or more creatures entered the battlefield under your control this turn" (Spider-UK), "if you had a land enter
   * the battlefield under your control this turn", celebration's "two or more nonland permanents": permanents that
   * entered under your control this turn, as they entered, even if they've left since; with all of `types`, none of
   * `notTypes`, and `subtype`.
   */
  | { kind: "youEntered"; types: string[]; notTypes?: string[]; subtype?: string; n: number; /** "another": not the source itself (Éowyn, Shieldmaiden). */ other?: true }
  /**
   * "If a noncreature permanent under your control was destroyed this turn by a spell or ability an opponent controlled"
   * (Cobra Trap): only an effect that says "destroy" (rulings), not lethal damage or sacrifice.
   */
  | { kind: "destroyedByOpponent" }
  /** "If you've been dealt damage by two or more creatures this turn" (Inferno Trap): different creatures, anyone's (rulings). */
  | { kind: "damagedByCreatures"; n: number }
  /** "If an opponent gained life this turn" (Needlebite Trap): whether or not they also lost life (rulings). */
  | { kind: "opponentGainedLife" }
  /** "If you put a counter on a creature this turn" (Lasting Tarfire): of any kind, as it entered too (CR 122.6). */
  | { kind: "youPutCounterOnCreature" }
  /** "If one or more cards were put into exile this turn" (Ennis, Debate Moderator): from anywhere, anyone's; not tokens or spell copies, which aren't cards (rulings). */
  | { kind: "cardExiledThisTurn" }
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
  | { kind: "life"; min?: number; max?: number; opponent?: true; /** "If each player has 10 or less life" (Cryptolith Fragment): every player still in the game. */ everyone?: true; /** "If a player's life total is ..." (Game Over): any player still in the game, you too. */ anyone?: true }
  /** "As long as equipped creature is a Human": the permanent this is attached to matches. */
  | { kind: "attachedIs"; filter: TargetSpec }
  /** "As long as white is the most common color among all permanents or is tied for most common" (Ruham Djinn): see mostCommonColors. */
  | { kind: "mostCommonColor"; color: Color }
  /** "As long as it's blocking or blocked by a Goblin or Orc" (Sting): the permanent this is attached to blocks one or is blocked by one. */
  | { kind: "attachedInCombatWith"; filter: TargetSpec }
  /** "If you have nine or more cards in hand" (Wiretapping). */
  | { kind: "handAtLeast"; n: number; /** "exactly thirteen cards in your hand" (Triskaidekaphile). */ exactly?: true; /** "Fewer than seven cards in hand" (Kozilek): under `n`. */ fewer?: true }
  /** "If you control eight or more artifacts with the same name as one another" (Mechanized Production, CR 201.2a). */
  | { kind: "sameNamed"; types: string[]; n: number; /** Chrome Replicator: "nonland, nontoken permanents". */ notTypes?: string[]; nontoken?: true }
  /**
   * Common Cause: "Nonartifact creatures get +2/+2 as long as they all share a color": every permanent that matches has
   * one color in common with all the others, whatever other colors they have (rulings); a colorless one shares none.
   */
  | { kind: "allShareColor"; filter: TargetSpec }
  /** "If each player has no cards in hand" (Howltooth Hollow). */
  | { kind: "handsEmpty" }
  /** "If you played a land this turn" (River of Tears): a land played, not one put onto the battlefield (CR 305.1). */
  | { kind: "playedLandThisTurn" }
  /**
   * "If a player controls more Wizards than each other player" (Thoughtbound Primoc), "has more life" (Ghazbán Ogre), "has
   * more cards in hand" (Sokenzan Renegade): exactly one player in the game has the most, none tied with it.
   */
  | { kind: "uniqueMost"; stat: MostStat }
  /** "As long as an opponent owns a card in exile" (Warden of the Beyond): any card, face down too, however many (rulings). */
  | { kind: "opponentOwnsExiled" }
  /** "If a player has one or fewer cards in hand" (Temple of the Dead): some player in the game. */
  | { kind: "someHandAtMost"; n: number; /** "As long as an opponent has no cards in hand" (Guul Draz Specter). */ opponent?: true }
  /** "If creatures you control have total power 10 or greater" (Mosswort Bridge). */
  | { kind: "totalPower"; n: number; toughness?: true }
  /** "If a library has twenty or fewer cards in it": any player's (Shelldock Isle). */
  /** `yours`: "if your library has no cards in it" (Jace, Wielder of Mysteries): your library only. */
  | { kind: "libraryAtMost"; n: number; yours?: true }
  /** Corrupted: "as long as an opponent has three or more poison counters" (CR 122.1f). */
  | { kind: "opponentPoison"; n: number }
  /** "If an opponent has eight or more cards in their graveyard" (Sheoldred // The True Scriptures): one still in the game. */
  | { kind: "opponentGraveyard"; n: number; /** "If a graveyard has twenty or more cards in it" (Visions of Beyond): yours too. */ anyone?: true }
  /** Raid: "if you attacked this turn" (with one or more creatures); `not`: "if you didn't attack with a creature this turn" (Curious Obsession). */
  | { kind: "attackedThisTurn"; not?: true; /** "If no creatures attacked this turn" (Charging Cinderhorn): any player's attack. */ anyone?: true }
  /** The Chain Veil: "if you didn't activate a loyalty ability of a planeswalker this turn" (`not`). */
  | { kind: "activatedLoyaltyThisTurn"; not?: true }
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
  | { kind: "castCount"; n: number; filter: TargetSpec; /** "If you didn't cast a spell this turn" (Nightpack Ambusher): fewer than `n`. */ not?: true; /** "If you haven't cast a spell from your hand this turn" (Prairie Dog): only spells cast from a hand. */ fromHand?: true; /** "At the beginning of each player's end step, if that player didn't cast a spell this turn" (Impatience): the active player's spells. */ activePlayer?: true; /** "A spell with mana value 4 or greater" (Rhino, Barreling Brute): its mana value as it was cast. */ mvAtLeast?: number; /** "As long as an opponent has cast a spell this turn" (Captain Mar-Vell): spells cast by any one opponent. */ byOpponent?: true }
  /** "There are five colors among permanents you control" (CR 105.2). */
  | { kind: "colorsAmong"; n: number }
  /** "You've gained 5 or more life this turn": in total. */
  | { kind: "lifeGainedThisTurn"; n: number }
  /**
   * "If no spells were cast last turn" (`none`), "if a player cast two or more spells last turn" (`onePlayer`: by a single
   * player, rulings): the whole previous turn (GameState.lastTurn).
   */
  | { kind: "castLastTurn"; none?: true; onePlayer?: number }
  /** "If an opponent lost life last turn" (Feast on the Fallen): during the whole previous turn (GameState.lastTurn). */
  | { kind: "opponentLostLifeLastTurn" }
  /** "During your first, second, or third turns of the game" (Serra Avenger): your turn, one of the first `n` you've begun, extra turns too. */
  | { kind: "ownTurnAtMost"; n: number }
  /**
   * "If it's your main phase", "if it's your combat phase" (CR 505.1, 506.1), "if it's the first combat phase of the
   * turn" (`first`; "of your turn": `yours` too).
   */
  | { kind: "phase"; phase: "main" | "combat" | "end"; yours?: true; first?: true; /** "If it isn't your main phase" (Dose of Dawnglow). */ not?: true }
  /** "If it's attacking the player with the most life or tied for most life" (Scourge of the Throne; dethrone's test, CR 702.105a). */
  | { kind: "attackingMostLife" }
  /** "While you have the most life or are tied for most life" (Preacher of the Schism). */
  | { kind: "youMostLife" }
  /** "~ costs {2} less to cast if you've cast another spell this turn": checked as it's cast, before it counts itself (CR 601.2f). */
  /** "If a card left your graveyard this turn" (Gau, Feral Youth). */
  | { kind: "cardLeftYourGraveyard"; /** "If three or more cards left your graveyard this turn" (Bonecache Overseer). */ n?: number }
  | { kind: "castAnother"; /** "If you've cast another spell this turn, draw a card" (Slick Sequence): as the spell resolves, other than itself (rulings). */ resolving?: true; /** "Enters with ... unless you've cast another red spell this turn" (Hotheaded Giant): as it enters, other than itself if it was cast (rulings). */ entering?: true; /** "Another black spell" (Soul Reap): of that color as it was cast. */ color?: Color; /** "Another instant or sorcery spell" (Mage Duel): one with any of these card types. */ types?: string[] }
  /**
   * Prowl (CR 702.76a): a player was dealt combat damage this turn by a source that, as it dealt it, was under your control
   * and had any of this spell's creature types.
   */
  | { kind: "prowl" }
  /** Increment (CR 702.191a): it's a creature and the mana spent on the spell (the event's amount) is greater than its power or toughness. */
  | { kind: "increment"; /** "If the amount of mana spent to cast that spell is greater than ~'s power" (Liberator): power only. */ powerOnly?: true }
  /** "If that player has two or fewer cards in hand": the trigger's player (whose upkeep it is), checked as it triggers and resolves (CR 603.4). */
  | { kind: "eventPlayerHand"; max?: number; min?: number }
  /** "Whenever ~ attacks, if defending player is poisoned" (Septic Rats): the trigger's player has a poison counter (CR 122.1f). */
  | { kind: "eventPlayerPoisoned" }
  /** "If that player lost less than 8 life this turn" (Lolth's emblem): the life the event's player lost this turn (CR 119.3). */
  | { kind: "eventPlayerLifeLost"; max: number }
  /** "If the player is your opponent" (Fevered Visions): the event's player is an opponent of this ability's controller. */
  | { kind: "eventPlayerOpponent" }
  /** "If they don't have any rad counters" (Vexing Radgull): the trigger's event player has none (CR 122.1, 728.1). */
  | { kind: "eventPlayerNoRad" }
  /**
   * "As long as you control three or more artifacts / another Wizard / no untapped lands", "as long as
   * an opponent controls an Island", "as long as defending player controls an artifact".
   */
  | { kind: "control"; /** "eventPlayer": the trigger's player ("unless they control two or more basic lands", Furnace Punisher). */ who: "you" | "opponent" | "defending" | "eventPlayer" | /** "Activate only during combat and only if defending player controls no snow lands" (Kjeldoran Guard): the player ~ is attacking, or else any one defending player, whom the ability's controller chooses (CR 508.5, 508.5a, 802.2). */ "anyDefending" | /** "Its controller controls no other creatures" (Predator's Gambit): the controller of the permanent the source is attached to; `other` means other than that permanent. */ "attached"; filter: TargetSpec; min?: number; max?: number; other?: boolean; /** "As long as no opponent controls a creature" (Vexing Beetle): every opponent, not any one. */ every?: true; /** "Five other Mountains" after "Whenever a Mountain you control enters" (Valakut): other than the one that entered (rulings). */ otherThanSubject?: true; /** "Lands with different names" (Field of the Dead): each name counted once. */ differentNames?: true; /** "Three or more lands with the same name" (Sceptre of Eternal Glory): the most that share one name. */ sameName?: true; /** "Three or more creatures that share a creature type" (Graxiplon): the most that share one creature type, changelings sharing every one (CR 702.73a). */ sameCreatureType?: true }
  /** "If an opponent controls an Island and you control a Mountain" (Mogg Salvage): all of them at once. */
  | { kind: "allOf"; conds: StaticCondition[] }
  /**
   * "Cast ~ only during combat", "Activate only during your upkeep" (CR 506.8, 601.3, 602.5b): the part of the turn
   * it may be cast or activated in; `turn`: "your" or "an opponent's" (upkeep, end step, combat, declare attackers step).
   */
  | { kind: "during"; window: TimingWindow; turn?: "you" | "opponent"; /** "You can't activate this ability during combat" (Djinn of Infinite Deceits): any time but then. */ not?: true }
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
  !!c && ((c.kind === "during" && !c.not) || c.kind === "attackedThisStep" || ((c.kind === "allOf" || c.kind === "anyOf") && c.conds.some(timedCondition)));

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
      /** Tropical Storm: "and 1 additional damage to each blue creature": what `also` is dealt instead of `amount`. */
      alsoAmount?: Amount;
      divided?: true;
      evenly?: true;
      /** "The damage can't be prevented." (CR 615.12) */ unpreventable?: true;
      /** Banefire: "If X is 5 or more, ... the damage can't be prevented": while the spell's X is at least this (CR 615.12). */ unpreventableX?: number;
      /** Demonfire: "If you have no cards in hand, ... the damage can't be prevented": while this holds as the damage is dealt (CR 615.12). */ unpreventableIf?: StaticCondition;
      /** "It deals ..." after "Whenever a commander you control deals combat damage" (Kediss): the trigger's creature deals it, as it last existed if it's gone (CR 608.2h). */
      /** `target`: "Target creature you control deals damage equal to its power to each other creature" (Chandra's Ignition): that target, if still legal. */
      /** `attached`: "Enchanted creature deals damage equal to its power to any other target" (Pain for All): the permanent the source is attached to. */
      /** `castSpell`: "that spell deals ..." in a cast trigger (Sorcerer Class): the spell, as it last existed if it has left the stack (rulings, CR 608.2h). */
      /** `created`: "That creature deals ..." after putting a card onto the battlefield (Too Greedily, Too Deep): the one permanent this resolution put there, if it's still there. */
      /** `lastKnown`: "Destroy target artifact. That artifact deals damage ..." (Goblin Tinkerer): the target as it last existed on the battlefield once this has moved it (CR 608.2h). */
      by?: "subject" | "attached" | "castSpell" | "created" | { target: number; lastKnown?: true };
      /** "Excess damage is dealt to that creature's controller instead" (Flame Spill): the damage beyond lethal goes there (CR 120.4a). */
      excessToController?: true;
      /** "And an additional 1 damage to each green creature" (Kaervek's Hex): a recipient in both `to` and `also` is dealt the two amounts added up, as one. */
      merge?: true;
    }
  /**
   * "Each creature deals 1 damage to its controller" (Rakdos Charm): each of those permanents is the source of its own
   * damage, all dealt at the same time (CR 120.3, 120.4).
   */
  | { type: "eachDealsDamage"; what: ObjRef; amount: Amount; toController?: true; /** Sarkhan the Mad: "Each Dragon creature you control deals damage equal to its power to target player or planeswalker": each one its own power as this resolves, to that target (`recipient`). */ ownPower?: true; recipient?: DamageRecipient; /** "Each Dragon you control deals 1 damage to that creature" (Sarkhan the Masterless): to this permanent instead, if it's still on the battlefield. */ to?: ObjRef }
  | { type: "draw"; who: PlayerRef; n: Amount }
  /** "Its controller may draw up to two cards" (Arcane Denial): each player chooses how many, 0 to `n`, before drawing (rulings). */
  | { type: "drawUpTo"; who: PlayerRef; n: number; /** Truce: "For each card less than two a player draws this way, that player gains 2 life." */ shortLife?: number }
  /** "Put your commander into your hand from the command zone" (Command Beacon): one of yours there, chosen with two (rulings). */
  | { type: "commanderToHand" }
  /** "Put all commanders you own from the command zone and from your graveyard into your hand" (Campfire, CR 903.3). */
  | { type: "commandersToHand" }
  /**
   * Orzhov Advokist: "each player may put two +1/+1 counters on a creature they control. If a player does, creatures that
   * player controls can't attack you or planeswalkers you control until your next turn." Chosen in turn order from its
   * controller, each knowing the choices before, then the counters put at once (rulings).
   */
  | { type: "eachMayCounter"; n: number; counter: CounterKind; attackBan?: true }
  /**
   * "Where X is the mana value of a commander you own on the battlefield or in the command zone" (Stinging Study): one
   * of them chosen as it resolves (rulings), counted by Count "chosenCommanderMv"; under another player's control too.
   */
  | { type: "chooseOwnCommander" }
  /**
   * "Put a commander you own from the command zone onto the battlefield" (Hellkite Courser): one of them, chosen with two;
   * "It gains haste" (`haste`), "Return it to the command zone at the beginning of the next end step" (`atEndStep`), if
   * it's still on the battlefield then (rulings).
   */
  | { type: "commanderToBattlefield"; haste?: "game" | "endOfTurn"; atEndStep?: "command" }
  /** Put it into its owner's command zone (Hellkite Courser's delayed trigger), if it's still that permanent. */
  | { type: "toCommandZone"; what: ObjRef }
  | { type: "gainLife"; who: PlayerRef; n: Amount }
  /** `drain`: "You gain life equal to the life lost this way" (extort, CR 702.101a; Gray Merchant). */
  | { type: "loseLife"; who: PlayerRef; n: Amount; drain?: boolean }
  /** "Your life total becomes 10" (CR 119.5): that player gains or loses the difference. */
  | { type: "setLife"; who: PlayerRef; n: number; /** "Double target player's life total" (CR 701.10d): twice what it is as it resolves; `n` unused. */ double?: true; /** "The lowest life total among all players" (Repay in Kind): as it resolves; `n` unused. */ lowest?: true; /** "The highest life total among all players" (Arbiter of Knollridge): the same, the highest. */ highest?: true; /** "The number of creatures they control" (Biorhythm): each player's own (PlayerRef eachOne), all counted before any change; `n` unused. */ amount?: Amount }
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
  /**
   * "Exchange target opponent's life total with ~'s toughness" (Tree of Perdition, CR 701.12g): the player gains or loses
   * life to reach its previous toughness, and an effect sets its toughness (layer 7b) to their previous life total. If
   * ~ has left the battlefield, or the life can't change, none of it happens (CR 701.12a, rulings).
   */
  | { type: "exchangeLifeWithSelf"; who: PlayerRef; stat: "power" | "toughness" }
  /** "Exchange its power and the power of target creature it's blocking until end of combat" (Serene Master): CR 701.12g. */
  | { type: "exchangePower"; what: ObjRef; duration: "endOfTurn" | "endOfCombat" }
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
      /** Palace Jailer: "until an opponent becomes the monarch" (`opponentMonarch`), whoever controls the source then. */
      until?: "sourceLeaves" | "opponentMonarch" | /** Calix, Destiny's Hand: "until target enchantment you control leaves the battlefield": target `untilTarget`. */ "targetLeaves";
      untilTarget?: number;
      linked?: boolean;
      /**
       * "For as long as that card remains exiled, its owner may cast it" (Aerial Extortionist), "... may play it" (`play`),
       * "... without paying its mana cost" (`free`), airbend's "for {2} rather than its mana cost" (`cost`, CR 701.65a);
       * "A spell cast (by an opponent) this way costs {2} more to cast" (`more`, `moreOpponents`). A token can't be cast.
       */
      ownerMay?: { play?: true; free?: true; cost?: string; more?: number; moreOpponents?: true; /** Only this turn, or until the end of their next turn (Containment Construct, Moonstone), not for as long as it's exiled. */ until?: "thisTurn" | "nextTurn" };
      /** "You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell" (Hostage Taker): the ability's controller's permission (CR 609.4b). */
      youMay?: { anyType?: true; /** "You may cast it this turn" (Dire Fleet Daredevil). */ thisTurn?: true; /** "Until the end of your next turn, you may play that card" (Thor, God of Thunder). */ nextTurn?: true; /** "You may play that card": a land too (Savvy Trader). */ play?: true; /** "If that spell would be put into a graveyard, exile it instead." */ exileAfter?: true };
      /** "Exile target creature and put two time counters on it. If it doesn't have suspend, it gains suspend." (Suspend, Doom's Time Platform, Epochrasite). */
      suspend?: number;
      /** "Exile it with a hit counter on it" (Mari, Tinybones): put on the card in exile (CR 122.1), not a permanent's. */
      counters?: Record<string, number>;
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
  /** "Until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead" (Kaya, Geist Hunter): a replacement effect for the rest of the turn (CR 614.1a, 611.2a). */
  | { type: "countModThisTurn"; mod: CountMod }
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
  /**
   * Lim-Dûl's Vault: look at the top `n` cards; as many times as the player chooses, pay `life` life, put them on the bottom
   * in any order and look at the top `n`; then shuffle the rest of the library and put the last ones looked at on top in
   * any order (rulings).
   */
  | { type: "vault"; n: number; life: number }
  | { type: "exileFaceDown"; from: "top" | "hand" | "handCard"; n?: Amount; look?: true; who?: PlayerRef; /** "Its controller looks at ... and exiles it face down. They may play that card" (Gonti, Night Minister): who exiles, looks and may play; the ability's controller if unset. */ actor?: PlayerRef; play?: FaceDownPlay; upkeepGraveyard?: true; /** "Put that card into your hand at the beginning of your next end step" (Necropotence). */ endStepHand?: true; /** "Look at the top two cards of target opponent's library. Exile one of them face down and put the other on the bottom of that library" (Siphon Insight): of the top `n`, the actor exiles the one they choose and the rest go to the bottom. */ pickOne?: true }
  /**
   * Cards exiled with ~ (CR 607.2a): "Put all cards exiled with ~ into their owner's graveyard", "Return a card you own
   * exiled with ~ to your hand" (`one`, `yours`), "put all other cards you own exiled with ~ into your hand" (`other`:
   * not those exiled earlier in this resolution).
   */
  /**
   * `dest` "battlefield": "Put all creature cards exiled with ~ onto the battlefield under your control. They gain
   * decayed." (Gisa, Glorious Resurrector): those matching `filter`, all at once, gaining `gain` for good.
   */
  | { type: "moveLinked"; dest: "hand" | "graveyard" | "battlefield"; filter?: TargetSpec; gain?: string[]; /** Ghost Vacuum: "with a flying counter on it", "Each of them is a 1/1 Spirit in addition to its other types" (from then on, CR 611.2c). */ counters?: Record<string, number>; alsoMods?: Modification[]; one?: true; yours?: true; other?: true; /** "You may exile that card. If you do, return each other card exiled with ~ to its owner's graveyard" (Mimic Vat): only if this resolution linked a card, and not those. */ ifLinkedNow?: true; /** Emperor of Bones: "It gains haste. Sacrifice it at the beginning of the next end step." for the permanent it became. */ haste?: "game"; atEndStep?: "sacrifice"; /** Safe Haven: "under its owner's control", not this ability's controller's. */ ownersControl?: true }
  /**
   * Memory Jar: "At the beginning of the next end step, each player ... returns to their hand each card they exiled this
   * way": the cards the ability exiled face down (`cards`, filled in as the delayed trigger is made), if they're still
   * the same objects in exile (CR 400.7).
   */
  | { type: "returnFaceDownExiled"; cards?: { id: ObjectId; zc: number }[] }
  /**
   * Glimpse the Impossible: "At the beginning of the next end step, if any of those cards remain exiled, put them into
   * your graveyard": the cards the spell exiled (`cards`, filled in as the delayed trigger is made) that are still the
   * same objects in exile (CR 400.7); how many went to the graveyard is "put into your graveyard this way".
   */
  | { type: "exiledToGraveyard"; cards?: { id: ObjectId; zc: number }[] }
  /**
   * Mysterio, Master of Illusion: "Exile those tokens when ~ leaves the battlefield": the tokens the ability created
   * (`cards`, filled in as the delayed trigger is made) that are still the same permanents (CR 400.7).
   */
  | { type: "exileRemembered"; cards?: { id: ObjectId; zc: number }[] }
  /**
   * The Eldrazi processors: "put a card an opponent owns from exile into that player's graveyard", "put two cards your
   * opponents own from exile into their owners' graveyards", chosen as it resolves (game.ts processCandidates).
   */
  | { type: "processExile"; n: number }
  /**
   * Hideaway N (CR 702.75a): look at the top N cards of your library, exile one of them face down (linked to this
   * permanent, CR 607.2a), and put the rest on the bottom of your library in a random order.
   */
  /**
   * Hideaway (CR 702.75a), or Gonti, Lord of Luxury's "look at the top four cards of target opponent's library, exile one
   * of them face down, then put the rest on the bottom of that library in a random order. You may cast that card for as
   * long as it remains exiled, and mana of any type can be spent to cast that spell": `from` that player's library, and
   * `castAnyType` the permission (CR 609.4b).
   */
  | { type: "hideaway"; n: number; from?: PlayerRef; castAnyType?: true; /** "Then put the rest into their graveyard" (Thief of Sanity), not on the bottom. */ restToGraveyard?: true; /** Vivien, Champion of the Wilds: "for as long as it remains exiled, you may cast it if it's a creature spell"; the rest go on the bottom in the order looked at ("in any order"). */ castCreature?: true }
  /**
   * "You may play the exiled card without paying its mana cost": the card this permanent's hideaway exiled, as this
   * resolves. A land only on your turn with a land play left (CR 305.2-3, rulings on Evercoat Ursine).
   */
  | { type: "playLinked"; /** "Play one of them" (Evercoat Ursine): of the cards exiled with it, the one its controller chooses. */ one?: true; /** Kinship's "you may play that card without paying its mana cost" (Leaf-Crowned Elder): the revealed card, from the library. */ revealed?: true }
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
  | { type: "pick"; who: PlayerRef; filter: TargetSpec; n: Amount; action: PickAction; /** Ghired, Conclave Exile: "populate. The token enters tapped and attacking." */ attacking?: true; /** The whole question, when `filter` and `action` don't say it (Garnet's "remove a lore counter from each of any number of Sagas"); "~" is the source's name. */ prompt?: string; /** "Sacrifice any number of other creatures" (God-Eternal Bontu): as many as they like, none too; `n` is ignored. */ anyNumber?: true; /** "Return half the creatures they control" (Split the Party): `who` picks among this player's permanents, not their own. */ among?: PlayerRef; /** For "counters": "put two +1/+1 counters on a creature you control". */ counter?: { kind: CounterKind; n: Amount }; /** Bolster: only among those with the least toughness (CR 701.39a); Witch-king, Bringer of Ruin: the least power. */ least?: "toughness" | "power"; /** "One of those Dragons" (Zurgo and Ojutai): only among the trigger's group (TriggerEventInfo.group), not targeted. */ fromGroup?: true; /** "Put a deathtouch counter on either of them" (Call of the Death-Dweller): only among the permanents this ability's targets `index` (`n` of them) are or became, not targeted. */ fromTargets?: { index: number; n: number }; /** "A creature with the greatest power among creatures they control", "a creature or planeswalker with the greatest mana value among creatures and planeswalkers they control": only those, or tied for it. */ greatest?: "power" | "manaValue"; /** "Unless they pay {3}": each player may pay to be left out. */ unless?: UnlessPays; /** "Put a +1/+1 counter on a creature" (Zimone's Hypothesis): any player's, not only `who`'s own (not targeted). */ anyController?: true; /** "On each of up to two Soldiers you control" (SOLDIER Military Program): up to `n`, none too. */ upTo?: true; /** With "choose" and `least`, before "Destroy that creature" (Drop of Honey): not one with indestructible while another tied one can be destroyed (rulings, CR 702.12b). */ destroyable?: true }
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
      keep: { filter: TargetSpec; n: number; upTo?: true; fewest?: true; /** "Any number of creatures they control with total power 4 or less" (Slaughter the Strong): any number, `n` unused. */ maxTotalPower?: number }[];
      among: TargetSpec;
      youChoose?: true;
      /** "Each player puts a vow counter on a creature they control and sacrifices the rest" (Promise of Loyalty): one on each kept permanent first; they're "those creatures" afterwards (Resolving.created). */
      counter?: CounterKind;
      /** Divine Reckoning: "Destroy the rest": destroyed instead of sacrificed. */
      destroy?: true;
      /** Consuming Tide: "Return all nonland permanents not chosen this way to their owners' hands": returned instead. */
      bounce?: true;
      /** Killing Wave: "sacrifices it unless they pay X life": any number kept, this much life paid for each (as many as they can pay for). */
      payLife?: Amount;
    }
  /** Mount Doom: "Choose up to two creatures, then destroy the rest": the controller picks up to `n` among every player's (not targeted). */
  | { type: "keepDestroyRest"; filter: TargetSpec; n: number; /** Last One Standing: "Choose a creature at random, then destroy the rest": the one kept at random, not targeted (rulings). */ random?: true; /** Deadly Vanity: "Choose a creature or planeswalker": exactly `n` while there are that many (rulings), not up to. */ exactly?: true }
  /** Return to owner's hand (from the battlefield or a graveyard). `hidden`: a face-down card, named only to its owner. */
  | { type: "bounce"; what: ObjRef; hidden?: true; /** "Return it to its owner's hand. If you do, ..." (Cartographer's Hawk): whether it was returned is what "if you do" asks. */ setsDid?: true }
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
  | { type: "revealFromHand"; filter?: TargetSpec; bottom?: true; /** "You may reveal a Dinosaur card from your hand" (Priest of the Wakening Sun): one at most. */ one?: true; /** "You may behold a Dragon" (Sarkhan, Dragon Ascendant; CR 701.4a): or choose a permanent you control of that kind. */ orControl?: true; /** With `one`: "Reveal a creature card in your hand" (Assembly Hall): one if there is one, not none. */ must?: true }
  /** "Exile all cards from your hand" (face up); `until`, how long you may play them. How many is kept for "that many". */
  | { type: "exileHand"; /** Hypnox: "exile all cards from target opponent's hand": that player's instead of yours. */ who?: PlayerRef; until?: "nextTurn"; /** Wormfang Behemoth: "When ~ leaves the battlefield, return the exiled cards to their owner's hand" (CR 607.2a; set by compile). */ linked?: boolean }
  /**
   * "Choose target artifact card in your graveyard. You may cast that card this turn." (Emry): a permission to cast it
   * from there this turn, paying its costs and following the timing rules (CR 601.2, 601.3).
   */
  | { type: "mayCastFromGraveyard"; what: ObjRef; /** "Mill a card. You may play that card this turn." (Tablet of Discovery): a land may be played too (CR 305.1). */ play?: true; /** "If that spell would be put into your graveyard, exile it instead" (Vohar, Vodalian Desecrator): MayPlay.exileAfter. */ exileAfter?: true; /** "You may cast it from your graveyard as an Adventure until the end of your next turn" (Mosswood Dreadknight): until then, and only as its Adventure (face 1, CR 715.3). */ asAdventure?: true; /** Synth Eradicator: "If you don't, you may play that card this turn": a card in exile (the one just exiled from the top). */ inExile?: true }
  /**
   * "You may cast that card" as this resolves (Conduit of Worlds), from your graveyard, paying its costs and ignoring
   * timing (CR 608.2g, 601.2, rulings: not later in the turn). `thenNoMore`: "If you do, you can't cast additional spells
   * this turn", even if another effect would let you (rulings, CR 101.2). `unlessCast`: "if you haven't cast a spell this
   * turn", checked as it begins (spells cast earlier this turn count, even countered ones and the card with the ability).
   */
  /**
   * `anyOwner`: "you may cast target nonland permanent card from that player's graveyard" (Tinybones), a card another
   * player owns; `anyType`: "and mana of any type can be spent to cast that spell" (CR 609.4b).
   */
  | {
      type: "castNow";
      what: ObjRef;
      thenNoMore?: true;
      unlessCast?: true;
      anyOwner?: true;
      anyType?: true;
      /** "If that spell would be put into your graveyard, exile it instead." */
      exileAfter?: true;
      /** "Do this only once each turn" (Emet-Selch, CR 603.2h): casting it is doing it; then the ability doesn't trigger again this turn. */
      once?: true;
    }
  | { type: "putFromHand"; who?: PlayerRef; /** "Whenever equipped creature deals combat damage, you may put an Aura card from your hand onto the battlefield attached to it" (Holy Avenger): only to the trigger's creature, still on the battlefield as the same object (CR 400.7, 303.4f). */ attachToSubject?: true; /** "If it's an Equipment, attach it to ~" (The Invincible Iron Man): after it enters, an Equipment put this way is attached to the source, still on the battlefield as the same object, if it could be (CR 701.3a-b). */ equipToSelf?: true; /** "And attach ~ to it" (Deathrender): the source Equipment, still on the battlefield as the same object, to the creature it became (CR 701.3). */ attachSelf?: true; /** "Look at defending player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control" (Zara): a card from that player's hand, attacking only them or a planeswalker of theirs. */ fromHandOf?: PlayerRef; filter?: TargetSpec; tapped?: boolean; /** "With a finality counter on it" (Kastral, the Windcrested): it enters with these (CR 122.6). */ counters?: Record<string, number>; attacking?: boolean; may: boolean; any?: boolean; /** With `any`: "up to seven" (Ugin, the Spirit Dragon), "up to X" (Worldsoul's Rage). */ upTo?: Amount; /** "From your hand and/or graveyard" (Worldsoul's Rage): cards from either, together. */ orGraveyard?: true; lesserPower?: true; attackingEvent?: true; haste?: "endOfTurn" | "game"; atEndStep?: "exile" | "sacrifice" | "hand"; /** "If you do, draw a card and repeat this process" (Cultivator Colossus): after each card put, a draw, then again until you put none (rulings). */ drawRepeat?: true; /** "Each manifest two cards from their hands" (Kozilek, the Broken Reality): exactly this many (all with fewer), face down (CR 701.40a). */ manifest?: number; /** With `manifest`: "Cloak a card from your hand" (Vannifar, Evolved Enigma): cloaked instead, so with ward {2} (CR 701.58a). */ cloak?: true;
    /** "Onto the battlefield attached to ~" (Danitha, Benalia's Hope): an Aura only onto the source, if it could enchant it, or it stays where it is (CR 303.4f-g); an Equipment attached to it if it could be, else unattached (rulings, CR 301.5c). */ attachToSelf?: true }
  /**
   * "Return all land cards from your graveyard to the battlefield tapped" (CR 110.2a: under your control), "from all graveyards
   * ... under their owners' control". All at once. Never Auras: those need a choice of what they enchant (CR 303.4f).
   */
  /** Tevesh Szat: "Put all commanders from the command zone onto the battlefield under your control" (CR 903.3, 110.2a): every player's. */
  | { type: "commandersOntoBattlefield" }
  | { type: "returnAllFromGraveyard"; who: PlayerRef; filter: TargetSpec; tapped?: boolean; /** "With an additional -1/-1 counter on it" (Pyrrhic Revival). */ counters?: Record<string, number>; owners?: true; /** "... to your hand" instead of the battlefield. */ toHand?: true; /** With `toHand`: "Mill six cards, then put all instant and sorcery cards from among them into your hand" (Gleam of Death): only the cards the mill just before put there, still those cards (CR 400.7). */ milled?: true; /** "Target creature card and all other cards with the same name as that card" (Echoing Return): only cards with target `sameNameAs`'s name, that card included. */ sameNameAs?: number; /** "Only creatures can be enchanted this way" (Retether): an Aura can attach only to a creature. */ auraOnCreature?: true; /** "That weren't put there this way" (Bringer of the Last Gift): not the cards this ability's sacrifice put there (ResolvingState.sacrificedThisWay). */ notSacrificedThisWay?: true; /** Storm of Souls: "Each of them is a 1/1 Spirit with flying in addition to its other types", from then on (CR 611.2c). */ alsoMods?: Modification[]; /** "Exile those creatures at the beginning of your next upkeep" (Rally the Ancestors): a delayed trigger for each permanent it returned (CR 603.7). */ exileAtYourNextUpkeep?: true }
  /** "Remove it from combat" (CR 506.4): it stops being an attacking, blocking, blocked or unblocked creature. */
  | { type: "removeFromCombat"; what: ObjRef; /** "Remove all attacking creatures from combat and untap them" (Illusionist's Gambit): those removed are "them" (ref "created"). */ remember?: true }
  /**
   * "Reselect which player or permanent target attacking creature is attacking" (Misleading Signpost): its controller's
   * choice as it resolves of another player, planeswalker or battle it could attack, ignoring requirements, restrictions
   * and costs (rulings). It still attacked what it was declared attacking.
   */
  | {
      type: "reselectAttack";
      what: ObjRef;
      /**
       * "For each attacking creature, you may reselect which player or permanent that creature is attacking" (Windshaper
       * Planetar): each one in turn, each one's own "may" (a "keep" option).
       */
      each?: true;
    }
  /**
   * "Return a creature card at random from your graveyard to your hand" (Haunted Fengraf); "an opponent chooses a card at
   * random in your graveyard. If it's a creature card, put it onto the battlefield. Otherwise, exile it." (Search for
   * Survivors, `dest` "creatureOrExile"). Chosen by the game, and everyone sees which (rulings on Fossil Find).
   */
  /** Primal Surge: "Exile the top card of your library. If it's a permanent card, you may put it onto the battlefield. If you do, repeat this process." */
  | { type: "surge" }
  /** Sinister Waltz: of the target cards still legal, all but `keep` chosen at random go to the bottom of their owner's library. */
  | { type: "randomTargetsToBottom"; what: ObjRef; keep: number }
  | { type: "randomFromGraveyard"; filter?: TargetSpec; /** Tariel, Reckoner of Souls: "from target opponent's graveyard", onto the battlefield under your control. */ from?: PlayerRef; /** Make a Wish: "Return two cards at random": that many different ones (all of them if fewer), into your hand; Reap the Past's X. */ n?: Amount; /** "creatureOrExile": onto the battlefield if it's a creature card, otherwise exiled (Search for Survivors); "creatureOrHand", otherwise into your hand (Deadbridge Chant). */ dest: "hand" | "creatureOrExile" | "creatureOrHand" | /** Tomb Tyrant: "Return a Zombie creature card at random from your graveyard to the battlefield". */ "battlefield" | /** Tersa Lightshatter: "exile a card at random from your graveyard. You may play that card this turn." */ "exilePlay" }
  /**
   * "Return a creature card from your graveyard to your hand", "you may return up to two instant and/or sorcery cards
   * ...": not targeted, so the cards are chosen as it resolves (CR 608.2c), as many as there are up to `n` unless `upTo`.
   */
  | { type: "chooseFromGraveyard"; filter?: TargetSpec; n: number; /** "The creature card in your graveyard with the greatest power" (Desecrator Hag): only cards with the greatest power among those that fit, a tie your choice. */ greatestPower?: true; /** Instead of `n`: "return that many creature cards" (Lich-Knights' Conquest), as it resolves. */ nAmount?: Amount; upTo?: true; /** "With total mana value 4 or less" (Lively Dirge): of all the cards chosen. */ totalMv?: number; /** "Mill three cards. You may put a land card from among them into your hand." (Six): only the cards the mill just before put there. */ milled?: true; /** "Whenever one or more creature cards are put into your graveyard from your library, put one of them onto the battlefield" (Colossal Grave-Reaver): only the trigger's cards. */ eventGroup?: true; /** "Return another permanent card" after "if you sacrificed a creature this way" (Rise of the Witch-king): not the card you sacrificed. */ notSacrificed?: true; /** "Return any number of cards with different mana values" (Seasons Past): no limit but one card per mana value; `n` is ignored. */ distinctManaValues?: true; /** "Any number of permanent cards with different names" (Eerie Ultimatum): at most one card of each name. */ oneEach?: true; /** Exiled instead ("Target player exiles a card from their graveyard"), put onto the battlefield under your control, or on top of your library; "castThisTurn": it stays there, and you may cast it this turn (Mission Briefing, with `exileAfter` as for mayCastFromGraveyard). */ dest?: "exile" | "battlefield" | "libraryTop" | "castThisTurn"; exileAfter?: true; /** With `dest` "exile": "If you do, you may cast it this turn" (Conspiracy Theorist), the exiled card, with its normal timing (rulings). */ castExiledThisTurn?: true; tapped?: true; counters?: Record<string, number>; /** "With a number of +1/+1 counters on it equal to that result" (Grave Endeavor): how many of the one kind in `counters`, as it resolves. */ countersN?: Amount; /** "With mana value X or less", X worked out as it resolves (Blood on the Snow). */ mvMax?: Amount; /** Whose graveyard, and who chooses: yours if left out. */ who?: PlayerRef; /** "Defending player chooses a nonland card in your graveyard" (O-Kagachi Made Manifest): another player chooses from `who`'s graveyard, for its owner; the card is kept for "that card" (ObjRef chosenFromYard). */ chooser?: PlayerRef; /** "Choose a face-up artifact card you own in exile. Put that card into your hand." (Karn, the Great Creator): from among the face-up cards you own in exile instead, into your hand. With `who` and `dest` "battlefield" (Oblivion Sower): that player's face-up cards in exile, put onto the battlefield under your control. */ fromExile?: true; /** "Any number of": as many as there are; `n` is ignored. */ anyNumber?: true; /** "Put all cards that have an Adventure from among the milled cards into your hand" (Seek Thrills): every card that fits, with no choice. */ all?: true; /** "For each player, choose a creature or planeswalker card in that player's graveyard. Put those cards onto the battlefield under your control." (Breach the Multiverse): with `who` each player, you choose one card in each of their graveyards and they all enter under your control. */ youChoose?: true; /** "Target opponent puts a creature card of their choice from their graveyard onto the battlefield under your control" (Visions of Dread): `who` chooses from their own graveyard, and it enters under your control. */ underYours?: true; /** "Starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen" (Rejoin the Fight): with `who` each opponent and `underYours`, each chooses from your graveyard, in turn order from you, among the cards not chosen yet. */ fromYours?: true; /** "Exile a card from a graveyard" (Cemetery Prowler): from any player's graveyard, chosen by you as it resolves. */ anyGraveyard?: true; /** "A creature card put into your graveyard this way" after a destroy (Starfall Invocation): one that died to it, still that card (CR 400.7). */ destroyedThisWay?: true; /** The cards it exiles are linked to this source (CR 607.2a): "the exiled card", "cards exiled with ~". */ linked?: true; /** With `anyGraveyard` onto the battlefield: "It's an artifact in addition to its other types" (Path of the Schemer), for good. */ alsoMods?: Modification[] }
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
      /** "And attach ~ to it" (Nim Deathmantle): the source, if it's still on the battlefield, attached to the permanent (CR 701.3). */
      attachSelf?: true;
      /** An Aura "attached to target opponent" (Accursed Witch): this target, if the Aura could enchant it (CR 303.4f). */
      attachToTarget?: number;
      /**
       * "Attached to enchanted creature" (Mantle of the Ancients): the creature the source Aura is attached to as this
       * resolves, or was last attached to if it has left (rulings); each card only if it could be attached to it.
       */
      attachToEnchanted?: true;
      /**
       * "Attached to that creature" (Unfinished Business): the creature the instruction before put onto the battlefield.
       * An Aura that can't enchant it stays in the graveyard; an Equipment that can't equip it enters unattached (rulings).
       */
      attachToCreated?: true;
      /** "Attached to ~" (Magnetic Snuffler): an Equipment attached to the source creature, still the same object on the battlefield; else unattached (rulings). */
      attachToSource?: true;
      /** Craft (CR 702.167c): the cards its activation's cost exiled (StackItem.costExiled) are linked to the permanent it becomes, "the exiled cards used to craft it". */
      linkCostExiled?: true;
      /** "Face down ... It's a Forest land" (Yedora, Grave Gardener): face down as a Forest land (FaceDownKind "forest"). */
      faceDown?: "forest";
      /** The Enduring cycle's "It's an enchantment. (It's not a creature.)": its new card types as it enters. */
      becomes?: { types: string[]; subtypes: string[] };
      /** "That creature gains haste until end of turn" ("endOfTurn"), "It gains haste" ("game": for as long as it's that object). */
      haste?: "endOfTurn" | "game";
      /** "Exile it at the beginning of the next end step", "Sacrifice it ...": a delayed trigger for it (CR 603.7), while it's that object. */
      atEndStep?: "exile" | "sacrifice";
      /** "Exile it at the beginning of your next upkeep" (Lukka, Wayward Bonder): the same, at that upkeep. */
      exileAtYourNextUpkeep?: true;
      /** With `counters`: only if it enters as a creature (Recommission, CR 614.12). */
      countersIfCreature?: true;
      /** With `counters`: only if it enters with this subtype (Heroic Return's "If a Hero enters this way", CR 614.12). */
      countersIfSubtype?: string;
      /** "With a +1/+1 counter on it" (Undying Malice): counters it enters with (CR 614.1c). */
      counters?: Record<string, number>;
      /** "With one fewer revival counter on it" (Nine-Lives Familiar): as many of that kind as it had as it last existed on the battlefield, plus `plus`. */
      countersFromLast?: { kind: string; plus: number };
      /**
       * "Sacrifice it when you lose control of ~" (Krovikan Vampire, Seraph): a delayed trigger watching ~ (`true`: this
       * ability's source, if it's on the battlefield) for each permanent put there (CR 603.7).
       */
      sacrificeOnLostControl?: true | { id: ObjectId; zc: number };
      /** With `atNextEndStep`: "you may return that card ... at the beginning of the next end step if ~ is still on the battlefield" (Shirei): the choice then, only while the source is still the object it was. */
      ifSourceHere?: true;
      mayThen?: true;
      /** "That creature is a black Zombie in addition to its other colors and types": an effect on the permanent from then on (CR 611.2c). */
      alsoMods?: Modification[];
      /** Tune Up: "If it's a Vehicle, it becomes an artifact creature": `alsoMods` only for a permanent with this subtype as it enters. */
      alsoModsIfSubtype?: string;
      /** "If X is 6 or more, those permanents are 4/4 creatures in addition to their other types" (Dance of the Manse): they enter that way (rulings) when the X is at least `x`. */
      entersAs?: { mods: Modification[]; x: number };
      /** "Put that card onto the battlefield ... at the beginning of the next end step" (Seraph): a delayed trigger for each card (CR 603.7). */
      atNextEndStep?: true;
      /** "Put it onto the battlefield attacking" (Senu): during combat, attacking what its controller chooses (CR 508.4). */
      attacking?: true;
      /** With `attacking`: "It enters tapped and attacking that player" (Shark Shredder): the trigger's event player only. */
      attackingEvent?: true;
    }
  /**
   * "Put target card from your graveyard on top of / on the bottom of its owner's library"; "ownersChoice": "Target
   * creature's owner puts it on their choice of the top or bottom of their library".
   */
  | { type: "putInLibrary"; what: ObjRef; position: "top" | "bottom" | "ownersChoice" | /** "Second from the top or on the bottom" (Temporal Cleansing), its owner's choice. */ "ownersChoiceSecond" | "second" | "third" | "fourth" | "fifth"; /** "Just beneath the top X cards of that library" (Unexpectedly Absent): with `position` "top", under that many cards (on the bottom with fewer, rulings). */ beneath?: Amount; /** "On top of their library in any order" (Misinformation): the controller orders them, not their owner. */ youOrder?: true }
  | { type: "exileGraveyard"; who: PlayerRef; /** "Exile all cards from target player's library" (Jace, the Mind Sculptor): that zone instead. */ library?: true; /** "Exile all cards from all hands and graveyards" (Worldfire): the hand too, then the graveyard. */ hand?: true; /** The cards are linked to the source (Nautiloid Ship's "a creature card exiled with ~", CR 607.2a). */ linked?: true; /** Only the cards like this ("all creature cards with mana value 3 or less", Idol of Endurance). */ filter?: TargetSpec; /** "All cards with flashback" (Tombfire): cards that have it there, their own or given by an effect (CR 702.34a). */ withFlashback?: true; /** "Until ~ leaves the battlefield": they return to the graveyard then (CR 610.3). */ until?: "sourceLeaves" } // "Exile target player's graveyard"
  /**
   * Living Death, Living End: "Each player exiles all creature cards from their graveyard, then sacrifices all creatures
   * they control, then puts all cards they exiled this way onto the battlefield." Each part for all players at once
   * (rulings); only the cards the first part exiled come back, under their owners' (the exilers') control. Scrap Mastery:
   * the same with artifacts (`cardType`).
   */
  | { type: "livingDeath"; cardType?: "Artifact" }
  /**
   * "Put all creatures on the bottom of their owners' libraries" (Terminus): all at once (rulings); each owner orders
   * their cards first, without revealing the order (CR 401.4).
   */
  | { type: "putAllOnBottom"; filter: TargetSpec }
  /** "Put the cards in your hand on the bottom of your library in any order, then draw that many cards" (Teferi's Puzzle Box, Mindmoil). */
  | { type: "handToBottomDraw"; who: PlayerRef }
  | { type: "tap"; what: ObjRef; /** "Where X is the number of Islands tapped this way" follows (Monsoon): how many it tapped (Count "tappedThisWay"). */ noteTapped?: true }
  /** "Turn target face-down creature face up" (CR 708.8): with no cost paid; see turnFaceUpByEffect. */
  | { type: "turnFaceUp"; what: ObjRef }
  /** Suspect (CR 701.60a): it becomes suspected, unless it already is (701.60d); `no`: "is no longer suspected". */
  | { type: "suspect"; what: ObjRef; no?: true }
  /** Time travel (CR 701.56a): for each permanent you control with a time counter and suspended card you own, you may put a time counter on it or remove one. */
  | { type: "timeTravel" }
  /** Proliferate (CR 701.27): another counter of each kind on the chosen permanents and players. */
  /** `thenPhaseOut`: "then choose any number of permanents you control that had a counter put on them this way. Those permanents phase out." (Ripples of Potential). */
  | { type: "proliferate"; thenPhaseOut?: true; /** "Proliferate twice" (Agent Frank Horrigan, Ezuri): two proliferate actions. */ twice?: true; /** "Proliferate X times, where X is ..." (Tromell): that many proliferate actions. */ n?: Amount }
  /** Amass [subtype] N (CR 701.47): an Army gets N +1/+1 counters, made first if you have none. */
  | { type: "amass"; subtype: string; n: Amount; /** "Its controller amasses Goblins X" (Azog, Moria's Ruin): that player instead of you. */ who?: PlayerRef }
  /**
   * "Exile target creature you control, then return it to the battlefield under its owner's control"
   * (blink); with `at`, it comes back at the beginning of the next end step (a delayed trigger, CR 603.7), all the cards
   * exiled together by one delayed trigger. `tapped`: "return it to the battlefield tapped".
   */
  /** `transformed`: "return it to the battlefield transformed" (CR 712.14a). */
  /** `counterIf`: "If it's a Spirit, put a +1/+1 counter on it" (Essence Flux), each returned permanent that matches, once it's back. */
  | { type: "flicker"; what: ObjRef; under: "owner" | "you"; /** With `at`: "If a land enters this way, it enters tapped" (Silver Surfer, Cosmic Voyager). */ landsTapped?: true; /** With `at` and `counter`: "If it enters as a creature, it enters with an additional +1/+1 counter on it" (Teferi's Time Twist). */ counterIfCreature?: true; /** With `counterIfCreature`: "and an additional loyalty counter on it if it's a planeswalker" (Semester's End). */ loyaltyIfPlaneswalker?: true; /** `ownersNextEndStep`: "at the beginning of that player's next end step", the card's owner's (one card only). */ at?: "nextEndStep" | "ownersNextEndStep" | "yourNextUpkeep" | /** Legion's Initiative: "At the beginning of the next combat". */ "nextBeginCombat"; /** With `at`: "It gains haste" (Obzedat), for as long as it remains on the battlefield (rulings); "endOfTurn": "those creatures gain haste until end of turn" (Legion's Initiative). */ haste?: true | "endOfTurn"; /** With `at`: "If it entered under your control, put a +1/+1 counter on ~" (Phelia), on the source as it is then. */ selfCounterIfYours?: CounterKind; counter?: CounterKind; tapped?: true; transformed?: true; counterIf?: { counter: CounterKind; filter: TargetSpec }; /** With `at`: Vanish into Memory's "If you do, discard cards equal to that creature's toughness", in the delayed trigger after it returns. */ thenDiscardToughness?: true; /** Hallowed Respite: once back, a counter of this kind on each one that entered under this ability's controller's control, and each other one tapped. */ yoursCounterElseTap?: CounterKind; /** Exiled now, returned by the search after it (Sword of Hearth and Home: "Put both cards onto the battlefield"), kept in Resolving.held. */ hold?: true; /** With `tapped`: "tapped and attacking" (The Neutrinos), attacking what its controller chooses, in combat only (CR 508.4). */ attacking?: true }
  /**
   * "Return those cards to the battlefield under their owner's control" after a held flicker (Lae'zel's Acrobatics): the
   * cards it exiled (Resolving.held) that are still those objects in exile; now, or with `at` by one delayed trigger (CR
   * 603.7). `thenExile`: "then exile them again", the new objects (CR 400.7) held in their place.
   */
  | { type: "returnHeld"; under: "owner" | "you"; at?: "nextEndStep"; thenExile?: true; /** "With a vigilance counter and a lifelink counter on it" (Gilraen): each enters with one of each (CR 122.6). */ counters?: CounterKind[] }
  /** "Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice." (Liliana of the Veil, CR 700.3). */
  | { type: "permanentPiles"; who: PlayerRef }
  /** A delayed flicker's return: the exiled card, while it's still in exile as that object. */
  /** A delayed flicker's return: its subject, or with `cards` each of those cards, if still the same objects in exile. */
  /** "Each opponent can't block with more than one creature this combat" (Mirri, Weatherlight Duelist; CR 509.1b): for each of those players, until the combat ends. */
  | { type: "blockLimitThisCombat"; who: PlayerRef; n: number }
  | { type: "returnExiled"; under: "owner" | "you"; /** "If a land enters this way, it enters tapped" (Silver Surfer, Cosmic Voyager). */ landsTapped?: true; /** Kept for Count "returnedToughness" (Vanish into Memory). */ toughnessThisWay?: true; /** "It gains haste" (Obzedat): for as long as it remains on the battlefield; "endOfTurn", until end of turn (Legion's Initiative). */ haste?: true | "endOfTurn"; counter?: CounterKind; /** One of each of these as well (Gilraen). */ counters?: CounterKind[]; /** The counter only if it enters as a creature (Teferi's Time Twist). */ counterIfCreature?: true; /** And a loyalty counter if it enters as a planeswalker (Semester's End). */ loyaltyIfPlaneswalker?: true; tapped?: true; cards?: { id: ObjectId; zc: number }[]; /** Phelia: a counter on this permanent, while it's still that object, if one of them entered under this ability's controller's control. */ selfCounter?: { id: ObjectId; zc: number; counter: CounterKind }; /** Mechtitan Core: the permanents this activated ability's cost exiled (StackItem.costExiled), set as its delayed trigger is made. */ fromCost?: true }
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
  /** "If a creature would die this turn, exile it instead" (Malicious Malfunction): every creature this turn, ones that enter or become creatures later too (rulings, CR 614.1a). */
  /** Mistcaller: "Until end of turn, if a nontoken creature would enter and it wasn't cast, exile it instead" (GameState.exileUncastTurn). */
  | { type: "exileUncastThisTurn" }
  | { type: "exileDyingThisTurn"; /** Malicious Eclipse: only creatures the controller's opponents control. */ opponentsOfYou?: true }
  /** "Players can't search libraries this turn" (Shadow of Doubt): GameState.noSearchTurn. */
  | { type: "noSearchThisTurn" }
  /** "Draw a card and reveal it. If it isn't a land card, discard it." (Sindbad): the cards just drawn, revealed; those not matching `keep` are discarded. */
  | { type: "revealDrawn"; keep: TargetSpec }
  /**
   * Cosmic Intervention: "If a permanent you control would be put into a graveyard from the battlefield this turn, exile it
   * instead. Return it to the battlefield under its owner's control at the beginning of the next end step." (CR 614.1a,
   * 603.7): see GameState.exileReturnTurn.
   */
  | { type: "exileReturnThisTurn" }
  /** "If it would leave the battlefield, exile it instead of putting it anywhere else" (CR 614.1a): while it's that permanent. */
  | { type: "exileIfLeaves"; what: ObjRef }
  /** "It can't be regenerated this turn" (CR 701.19c): its regeneration shields don't apply this turn. */
  | { type: "noRegen"; what: ObjRef; ifCreature?: true }
  /** "Look at target opponent's hand" (only you see it, CR 402.3); `reveal`: "target player reveals their hand" (everyone sees it). */
  | { type: "lookAtHand"; who: PlayerRef; reveal?: true; /** "Look at a card at random in target player's hand" (Urza's Bauble). */ atRandom?: true }
  /** "Look at target face-down creature" (Smoke Teller): the card it is, shown to this ability's controller only (CR 708.5). */
  | { type: "lookAtFaceDown"; what: ObjRef }
  /** "~ assigns no combat damage this turn" (CR 510.1). */
  | { type: "noCombatDamage"; what: ObjRef; /** "This combat" rather than "this turn" (Master of Cruelties). */ combat?: true }
  | { type: "untap"; what: ObjRef }
  /**
   * "Untap up to seven lands" (Palinchron, Snap): its controller chooses as it resolves, among any player's tapped lands
   * (not targeted, rulings), from none up to `n`.
   */
  | { type: "untapUpTo"; n: Amount; filter: TargetSpec; /** "That player untaps a land they control" (Hokori, Dust Drinker): who chooses and untaps, among their own (default: you). */ who?: PlayerRef }
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
  | { type: "skipUntap"; what: ObjRef; /** "Its controller's next two untap steps" (Telekinesis). */ n?: number }
  /** "Lands you control don't untap during your next untap step": every one of these types they control then (Player.noUntapNext). */
  | { type: "noUntapNext"; who: PlayerRef; types: string[] }
  /** "You have no maximum hand size for the rest of the game" (Player.noMaxHandSize). */
  | { type: "noMaxHandSize"; /** "For as long as you control ~" (The Great Synthesis): see Player.noMaxHandSizeWhile. */ whileControlled?: true; /** "Until your next turn" (Enter the Infinite). */ untilYourNextTurn?: true }
  /** "Until your next turn, creatures your opponents control enter tapped" (Cone of Cold): GameState.entersTappedUntil. `thisTurn`: "Lands you control enter tapped this turn" (Nahiri's Lithoforming). */
  | { type: "enterTappedUntil"; filter: TargetSpec; thisTurn?: true }
  /** `perLastKnownCounter`: modular's "a +1/+1 counter for each +1/+1 counter on this permanent", as it last was. */
  /** `divided`: "distribute N counters among" the targets of `what`, each getting its part (CR 601.2d). */
  /**
   * `double`: "double the number of +1/+1 counters on each creature you control": each gets as many more as it has (CR
   * 701.10e), `n` aside; with `everyKind`, of each kind of counter it has ("double the number of each kind of counter").
   */
  | { type: "counters"; what: ObjRef; counter: CounterKind; n: Amount; /** "Put the same number of each kind of counter on that creature" as ~ has (Denry Klin, Editor in Chief): each kind `copyFrom` has as it resolves, that many; `counter` and `n` are ignored. */ copyFrom?: ObjRef; /** "A +1/+1 counter or a loyalty counter" (Elspeth Conquers Death): either kind, chosen as it resolves. */ orCounter?: CounterKind; /** With `orCounter`: "a flying, lifelink, or +1/+1 counter" (Reluctant Role Model), more kinds to choose from. */ orCounters?: CounterKind[]; /** "Equal to that creature's toughness" (Canopy Gargantuan): each its own number, all worked out first; `n` is ignored. */ perOwn?: "power" | "toughness"; perLastKnownCounter?: "+1/+1" | "-1/-1"; divided?: true; /** As many as its power is above its base power, each its own (Sovereign Okinec Ahau). */ aboveBase?: true; double?: true; everyKind?: true; /** "That player ... puts a +1/+1 counter on it" (Alexios): who puts them, when not the ability's controller. */ by?: PlayerRef; /** With what "voted": each chosen permanent gets them from the player who chose it (Agitator Ant). */ byVoter?: true; /** "Put up to X +1/+0 counters on ~. This ability can't cause the total number of +1/+0 counters on ~ to be greater than four" (Clockwork Beast): no more than it takes to bring that kind up to this many, none if it has that many or more (rulings). */ maxTotal?: number }
  /**
   * "Distribute X +1/+1 counters among any number of creatures you control" (no targets): its controller divides them
   * among the permanents like `filter` they control as it resolves (rulings on Blessing of Frost, CR 608.2d), each
   * chosen one getting at least one.
   */
  /**
   * `move`: "you may move any number of +1/+1 counters from ~ onto other creatures" (Forgotten Ancient): from this
   * permanent, as many as it has (`n` aside), onto any number of other creatures anyone controls, none at all included.
   */
  | { type: "distribute"; counter: CounterKind; n: Amount; filter: TargetSpec; move?: true; /** "Remove up to three stun counters from among all permanents" (Sensational Spider-Man): up to `n` of them off any permanents matching `filter`, each no more than it has (rulings), counted for "the number of ... counters removed this way". */ remove?: true }
  /** "Sacrifice ~" as an effect: only a permanent its controller controls (CR 701.21a). */
  /** `byController`: the permanent's controller sacrifices it, whoever controls the effect. */
  /**
   * Tyrant of Discord: "target opponent chooses a permanent they control at random and sacrifices it. If a nonland
   * permanent is sacrificed this way, repeat this process." Each of `who` in turn, a permanent chosen at random among
   * those they control (CR 701.21a), again while the last one sacrificed wasn't a land (`repeatNonland`).
   */
  | { type: "sacrificeRandom"; who: PlayerRef; repeatNonland?: true }
  /** "Choose a creature at random that attacked this turn. Destroy that creature." (Metzali, Tower of Triumph): one of those matching `filter` as it resolves, not targeted. */
  | { type: "destroyRandom"; filter: TargetSpec }
  | { type: "sacrifice"; what: ObjRef; byController?: true; /** "That player sacrifices that creature" (Lingering Death): only if the trigger's player controls it (CR 701.21a). */ byEventPlayer?: true }
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
  /** "Each Merfolk creature you control explores" (Hakbal): one at a time, in the order its controller chooses (rulings). */
  | { type: "exploreEach"; what: ObjRef }
  /** Renown N (CR 702.112a): if it isn't renowned, N +1/+1 counters and it becomes renowned. */
  | { type: "renown"; n: number }
  /** Adapt N (CR 701.46a): if this permanent has no +1/+1 counters on it, put N +1/+1 counters on it. */
  | { type: "adapt"; n: Amount }
  /** Biomancer's Familiar: "The next time target creature adapts this turn, it adapts as though it had no +1/+1 counters on it." (GameObject.adaptFresh) */
  | { type: "adaptFresh"; what: ObjRef }
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
   * of combat"), instead of the source; "returned": about the permanent the trigger's card just became, with "~" the
   * source's card in the graveyard (Gift of Immortality).
   */
  /** `lostControl`: "When you lose control of the creature, tap it" (Ray of Command), about `of` (CR 603.7). */
  /** `thisTurn`: "When you lose control of that Equipment this turn" (Stolen Uniform): only until the turn ends. */
  /**
   * `event`: what it remembers from now, as its trigger event (CR 603.7c): "its controller" (Arcane Denial: the countered
   * spell's) is its event player, "that spell's mana value" (Mana Drain) its event amount. `yourNextMain`: "at the
   * beginning of your next main phase", the next one that begins after it's made (rulings on Mana Drain).
   */
  | { type: "delayed"; when: "nextTurnUpkeep" | "yourNextUpkeep" | /** "When that creature becomes blocked this turn" (Barreling Attack): each time it does this turn (CR 603.7b). */ "becomesBlocked" | "nextEndStep" | "yourNextEndStep" | /** "At the beginning of the end step on your next turn" (Kav Landseeker): your end step on a later turn. */ "yourNextTurnEndStep" | "yourNextMain" | "yourNextFirstMain" | "endOfCombat" | "nextCleanup" | "lostControl" | "dies" | "leaves" | /** "At the beginning of that player's next end step" (Faramir, Prince of Ithilien): `whose`'s, who is the trigger's event player ("they"). */ "playersNextEndStep"; whose?: PlayerRef; effects: Effect[]; text: string; each?: "created" | "subject" | "selfCard" | "subjectCard" | "returned"; /** With each "subject": the delayed trigger also remembers this ability's source as it is now, its "~" (Contempt). */ withSource?: true; of?: ObjRef; thisTurn?: true; /** With "dies": "When it dies under your control this turn" (Desperate Measures). */ underYourControl?: true; /** With `when` "dies": "When the permanent you don't control dies this turn" (Devouring Tendrils): a planeswalker too, any permanent put into a graveyard from the battlefield (CR 700.4). */ anyPermanent?: true; /** With "dies": "When target creature is put into your graveyard this turn" (Saffi Eriksdotter): only if you own it. */ intoYourGraveyard?: true; event?: { player?: PlayerRef; amount?: Amount } }
  /** Ninjutsu (CR 702.49a): put this card onto the battlefield from your hand tapped and attacking. */
  | { type: "ninjutsu" }
  /** Madness's trigger (CR 702.35a): its owner may cast the exiled card (the subject) for its madness cost; if not, it goes to the graveyard. */
  | { type: "madness" }
  /** Miracle's trigger (CR 702.94a): "you may cast it by paying [cost] rather than its mana cost", while it's still in hand. */
  | { type: "miracle"; /** The miracle cost of this instance: a granted one (Lorehold, the Historian) rather than the card's own. */ cost?: string }
  /**
   * "You may cast a spell with mana value 3 or less from your hand without paying its mana cost" (the Expertises,
   * Electrodominance's "X or less"): one card, picked and cast as this resolves (rulings).
   */
  | { type: "castFromHand"; filter: TargetSpec; /** "If you don't, scry 1" after it (In Search of Greatness): whether a spell was cast this way is what "if you do" asks. */ setsDid?: true; /** "Draw three cards and reveal them. You may cast one of them ...": only those, revealed. */ drawn?: true; /** "... from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead." (Sword of Once and Future): a card there, and the spell is exiled instead of going back. */ fromGraveyard?: true; /** With `fromGraveyard`: no "exile it instead" (Counterpoint). */ yardNoExile?: true; /** Jace's Mindseeker: "target opponent mills five cards. You may cast an instant or sorcery spell from among them": one of the cards this resolution milled, where they went (exile too, rulings). */ milled?: true }
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
  | { type: "forEachThisWay"; which: "destroyed" | "exiled"; graveyard?: true; filter: TargetSpec; effects: Effect[]; /** "Creates two 1/1 red Goblin creature tokens" for each (Mogg Infestation). */ times?: number; /** "The controller of each of those artifacts gains life equal to its mana value" (Seeds of Innocence): each one counts its mana value, not 1. */ manaValue?: true }
  /** "Exile the top two cards of your library. Until the end of your next turn, you may play those cards." */
  /** `who`: "the top card of that player's library" (Ragavan), not yours; `castOnly`: "you may cast that card", not play it. */
  /** `free`: "you may play that card without paying its mana cost" (Urza, Lord High Artificer, CR 118.9). */
  /**
   * Aminatou's Augury: "Exile the top eight cards of your library. You may put a land card from among them onto the
   * battlefield. Until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled
   * cards without paying its mana cost." (GameObject.mayPlay.byType.)
   */
  | { type: "exileCastEachType"; n: Amount }
  /**
   * "Until end of turn, you may cast a spell from among cards exiled with ~ without paying its mana cost" (Court of
   * Locthwain): one spell, from the cards its linked exile took (CR 607.2a), cast for its AltCostKind "linkedFree" (CR 118.9).
   */
  | { type: "castLinkedFree"; /** "A creature spell" (Idol of Endurance): only one of these. */ filter?: TargetSpec }
  | { type: "impulse"; n: Amount; until: "thisTurn" | "nextTurn" | /** "Until your next turn" (Nivix, Aerie of the Firemind): over as that turn begins. */ "yourNextTurn" | "exiled" | "yourNextEndStep" | /** "Until the beginning of your next upkeep" (Elkin Bottle). */ "yourNextUpkeep" | /** "During your next turn" (Galvanic Relay). */ "duringNextTurn" | /** "For as long as you control ~" (Lightning, Security Sergeant). */ "whileControlled"; who?: PlayerRef; /** Elder Brain: "exile all cards from that player's hand, then they draw that many cards" (`n` unused). */ hand?: true; castOnly?: true; free?: true; /** With `free`: "you may play cards this way without paying their mana costs" (Ignite the Future): or for their costs. */ orPay?: true; /** With `free`: "You may cast Equipment spells this way without paying their mana costs" (Nahiri, Forged in Fury): only cards like this are free. */ freeFor?: TargetSpec; /** "During any turn you attacked with a token" (Neyali): only then. */ attackedWithToken?: true; /** "You may play it if you control a Kavu" (Possibility Technician): only while that player controls a permanent like this (GameObject.mayPlay.ifControl). */ ifControl?: TargetSpec; /** "And you may spend mana as though it were mana of any color to cast that spell" (Grenzo, CR 609.4b). */ anyType?: true; /** The cards are "exiled with ~" for its other abilities (CR 607.2a). */ linked?: true; /** "You may play one of those cards" (Nashi, Moon Sage's Scion): once one is played, the rest can't be. */ oneOf?: true; /** "Exile the top two cards of your library, then choose one of them. You may play that card this turn." (Party Thrasher): only the chosen one. */ choose?: true; /** "If you cast a spell this way, pay life equal to its mana value rather than paying its mana cost" (Nashi). */ life?: true; /** "Exile all opponents' graveyards" (Mnemonic Betrayal): every card in each `who` player's graveyard, `n` aside. */ graveyards?: true; /** "You may cast instant and sorcery spells from among them" (Ral, Leyline Prodigy): only cards like this get the permission. */ castFilter?: TargetSpec; /** "You may cast an instant or sorcery spell from among those exiled cards" (Chandra, Hope's Beacon): only spells like this, the face cast counting (GameObject.mayPlay.castFilter); with `oneOf`, one of them. */ spellFilter?: TargetSpec; /** "You may play it until you exile another card with ~" (Unstable Amulet, Furious Rise): until the source's next such exile (GameObject.mayPlay.untilAnother). */ untilAnother?: true }
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
  | { type: "nextCast"; filter: TargetSpec; effects: Effect[]; text: string; cascade?: true; /** "The next instant or sorcery spell you cast this turn has storm" (Crackling Spellslinger). */ storm?: true; who?: PlayerRef; /** "When you next cast an instant or sorcery spell from your hand this turn" (Narset Transcendent). */ fromHand?: true; /** "The next spell you cast this turn can't be countered" (Mistrise Village). */ uncounterable?: true; /** "The next spell of the chosen type you cast this turn can be cast as though it had flash" (Progenitor's Icon; CR 702.8a): used up by that spell, whenever it's cast. */ flash?: true }
  /**
   * "Until end of turn, whenever you cast a spell, ~ deals 2 damage to up to one target creature" (CR 603.7b): a delayed
   * triggered ability that triggers each time its event happens until `until` ends (see GameState.floatingTriggers).
   */
  /** `about`: its "~" is this target (Hunter's Insight's "that creature"), the object it was as this resolved (CR 603.7c). */
  /** `aboutPlayer`: only for combat damage to the player of that target (Great Train Heist). */
  | { type: "floatingTrigger"; trigger: TriggeredAbility; until: TriggerDuration; about?: number; aboutPlayer?: number; /** With `about`: that many targets in a row from it, one for each ("either of those creatures", Tamiyo). */ each?: number; /** "When you next attack this turn" (All-Out Assault): only the first time (CR 603.7c). */ once?: true }
  /**
   * Copy a spell (CR 707.10): the one whose casting triggered this ("cause": storm, replicate, "copy that spell") or a
   * target. `n`: "storm" is the spells cast before it this turn, "kicked" the times its replicate cost was paid.
   * `newTargets`: "you may choose new targets for the copy" (707.10c).
   */
  /** `epic`: the spell with epic as it resolved, by its stack id in `GameState.epics` (CR 702.50a). */
  /** `self`: the spell that's resolving ("you may copy this spell", Sevinne's Reclamation), as it is on the stack. */
  | { type: "copySpell"; spell: "cause" | "self" | { target: number } | { epic: string }; /** "stormInstantSorcery": the instant and sorcery spells its controller cast before it this turn (Thousand-Year Storm). "otherInstantSorcery": all the others its controller has cast this turn, counted as this resolves (Show of Confidence). "eachOther": see `eachOther`. */ n: Amount | "storm" | "kicked" | "stormInstantSorcery" | "otherInstantSorcery" | "eachOther"; newTargets: boolean;
    /**
     * Zada, Ink-Treader Nephilim, Precursor Golem: "copy that spell for each other creature (you control) that the spell
     * could target. Each copy targets a different one of those creatures": one copy for each permanent matching `among`
     * (for this ability's controller) other than the one the spell targets only (`self`: other than this ability's
     * source too), that every target of the spell could name, as its caster (rulings); each copy names that one in each
     * of its targets. `caster`: the spell's caster copies it (Precursor Golem), else this ability's controller.
     * `onlySelf`: an intervening "if that spell targets only ~" (CR 603.4), checked again as it resolves.
     */
    eachOther?: { among: TargetSpec; self?: true; caster?: true; onlySelf?: true; /** Ivy, Gleeful Spellthief: "The copy targets ~": one copy, aimed at this ability's source, made even if the spell has left the stack (rulings), if ~ could be every target of it. */ toSource?: true }; /** Then an opponent you choose copies it too (CR 702.144a). */ demonstrate?: true; /** "If it's a permanent spell, the copy gains haste and "..."" (Nalfeshnee): what the token it becomes has (CR 400.7a, 608.3f). */ gains?: Modification[]; /** "Except it isn't legendary" (Double Major): exceptions to its copiable values (CR 707.9b). */ except?: CopyExcept;
    /** "That player copies it and may choose new targets for the copy" (Bonus Round): the spell's controller copies it and chooses the copy's targets, not this ability's controller. */ byController?: true }
  | { type: "removeCounters"; what: ObjRef; counter: CounterKind; /** "allButOne": "remove all but one +1/+1 counter from it" (Lily Bowen). */ n: Amount | "all" | "allButOne"; /** "Remove a hope counter from ~. If you do, ..." (Dawn of a New Age): whether that many were removed is what "if you do" asks. */ setsDid?: true }
  /** "Remove (up to) three counters from target permanent": of any kinds, chosen as it resolves (rulings on Glissa Sunslayer); fewer than that, all of them. */
  /**
   * `moveTo`: "Move any number of counters from target permanent you control onto a second target permanent you control"
   * (Resourceful Defense): `n` is ignored, up to all of them, each removed and put on that one (CR 122.5).
   */
  | { type: "removeAnyCounters"; what: ObjRef; n: Amount; upTo?: true; moveTo?: ObjRef; /** "Any number of +1/+1 counters" (Scrounging Bandar): only these kinds. */ kinds?: CounterKind[] }
  /**
   * Slippery Bogbonder: "Then move any number of counters from among creatures you control onto that creature." Chosen
   * one at a time as it resolves, any kinds, from any of them but `onto` itself (rulings), then moved together (CR 122.5).
   */
  | { type: "gatherCounters"; onto: ObjRef; from: TargetSpec }
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
  /** Ichormoon Gauntlet: "choose a counter on target permanent. Put an additional counter of that kind on that permanent." */
  | { type: "counterOfKindOnIt"; what: ObjRef; /** "Choose a counter on target permanent or player. Give that permanent or player another counter of that kind." (Animation Module): this target, which may be a player. */ host?: number; /** "For each kind of counter on target permanent or player, give that permanent or player another counter of that kind" (Maulfist Revolutionary): one of each kind, no choice (rulings). */ eachKind?: true }
  /** "End the turn." (CR 724.1, Sundial of the Infinite): its last instruction; the rest happens as it finishes resolving. */
  | { type: "endTurn" }
  /** Cascade (CR 702.85a), resolving: exile until a cheaper nonland card, maybe cast it free, the rest to the bottom. */
  | { type: "cascade"; legendary?: true }
  /**
   * "Search target player's graveyard, hand, and library for any number of cards with that name and exile them. Then that
   * player shuffles." (Memoricide, CR 701.23): the ability's controller finds them. `all`: "for all cards" (Cranial
   * Extraction): the ones in the graveyard can't be left, those in the hidden hand and library can (CR 701.23b); `max`:
   * "up to four cards" (Unmoored Ego). How many came from the hand is kept ("exiledFromHandThisWay"). The name is the one
   * chosen (`filter` with chosen "name"), or `sameAs`: "with the same name as that spell" (Counterbore), target `sameAs`'s
   * name as it last existed (CR 608.2h).
   */
  | { type: "exileNamed"; who: PlayerRef; filter: TargetSpec; all?: true; max?: number; sameAs?: number; /** "The same name as the exiled card" (Pick the Brain): the name or names found this way instead. */ sameName?: SameNameRef; /** Hour of Glory: "reveals their hand and exiles all cards from it with the same name": only the revealed hand, every such card there (no search, no shuffle). */ handOnly?: true }
  /**
   * "Reveal cards from the top of your library until you reveal a card with the chosen name" (Demonic Consultation, CR
   * 701.20a): `found`, where that card goes; `rest`, where the other revealed cards go (all of them when none is found);
   * `lifePerRest`: "you lose 1 life for each of the exiled cards" (Spoils of the Vault).
   */
  /**
   * "Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and the
   * rest on the bottom of your library in a random order" (`found` "battlefield", `rest` "bottom"), `tapped`.
   */
  /** "Each opponent reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard" (Consuming Aberration). */
  /** "Reveal the top card of your library. If it's a land card, put it into your graveyard and repeat this process" (Countryside Crusher): lands one at a time, until a nonland card (left on top) or an empty library. */
  | { type: "revealTopLandsToGraveyard" }
  | { type: "revealUntilLandToGraveyard"; who: PlayerRef; /** "Until they reveal X land cards" (Mind Grind): this many land cards; one if left out. */ n?: Amount }
  /** "Each opponent exiles cards from the top of their library until that player has exiled cards with total mana value 20 or greater" (Tasha's Hideous Laughter). */
  | { type: "exileUntilTotalMv"; who: PlayerRef; total: number }
  | {
      type: "revealUntil";
      filter: TargetSpec;
      /** "Graveyard": "Put all creature cards revealed this way into your graveyard" (Old Stickfingers). */
      found: "hand" | "battlefield" | "graveyard";
      /** "You may put that card onto the battlefield. If you don't, put it into your hand." (Songbirds' Blessing): `found` is "battlefield", if its controller chooses and it can go there. */
      mayElseHand?: true;
      /** "You may put that card onto the battlefield. Then shuffle." (Hei Bai, Forest Guardian): `found` is "battlefield" if its controller chooses; if not, it stays in the library. */
      mayStay?: true;
      /** Aspiring Champion: "If that creature is a Demon, ...": the permanent put onto the battlefield is remembered as this resolution's (ObjRef "created"). */
      remember?: true;
      tapped?: true;
      /** "Onto the battlefield tapped and attacking" (Raph & Mikey, CR 508.4): during combat, attacking a player, planeswalker or battle its controller chooses (rulings). */
      attacking?: true;
      /** "Shuffle": "then shuffles all other cards revealed this way into their library" (Polymorph), a shuffle of the library. */
      /** "Graveyard": "and all other cards revealed this way into your graveyard" (Hermit Druid): the whole library if none is found. */
      rest: "exile" | "bottom" | "shuffle" | "graveyard";
      lifePerRest?: true;
      /** "Until you reveal X land cards" (Open the Way): that many, all put there together. */
      n?: Amount;
      /** Who reveals, and puts the card onto the battlefield under their control: "its controller" (Polymorph). Unset, you. */
      who?: PlayerRef;
      /** With `who`: "Put that card onto the battlefield under your control" (Curse of Unbinding): the ability's controller's instead. */
      yours?: true;
      /** "A permanent card that shares a card type with that permanent" (Wild Magic Surge): target `index` as it is, or last was on the battlefield (CR 608.2h). */
      sharesTypeWith?: number;
      /** "A creature card that shares a creature type with it" (Heirloom Blade): with the trigger's subject as it last existed (CR 608.2h). */
      sharesCreatureTypeWithSubject?: true;
      /** "A creature card that shares a creature type with the sacrificed creature" (Descendants' Fury): as it last existed (rulings). */
      sharesCreatureTypeWithSacrificed?: true;
      /** "Exile cards from the top of your library until you exile a land card" (Venture Forth): exiled, not revealed (CR 406.3), then put where they go from exile. */
      exile?: true;
    }
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
      then: "castFree" | "freeThisTurn" | "thisTurn" | "hand" | "suspend" | /** With `reveal`: the cards stay where they are for "that card's mana value" (Resolution.revealed) and a later revealedUntilToBottom (Erratic Explosion). */ "keep";
      /** `then` "suspend": "Put two time counters on that card. If it doesn't have suspend, it gains suspend." (Kang Prime). */
      suspend?: number;
      ownerCasts?: true;
      /** Tibalt's Trickery: "Choose 1, 2, or 3 at random. Its controller mills that many cards, then exiles ...". */
      millFirst?: number;
      /** "A nonland card with a different name than that spell": target `notNamedAs`'s name. */
      notNamedAs?: number;
      /** "Then they put the exiled cards on the bottom of their library in a random order": the card not cast too. */
      restBottom?: true;
      /** "Until they exile an instant or sorcery card" (Gríma, Saruman's Footman): a card of one of these types, not a nonland card. */
      untilTypes?: string[];
      /** With "castFree": "if that spell's mana value is 8 or less" (Breaching Dragonstorm), the spell as it's cast (CR 202.3). */
      maxMv?: number;
      /** "If you don't, put that card into your hand" (Breaching Dragonstorm): the card not cast. */
      orHand?: true;
      /** "Until you reveal a nonland card with mana value 3 or less" (Treasure Keeper): only one like this stops it. */
      untilMv?: number;
      /** With `reveal`: "You may cast that card without paying its mana cost. Put all revealed cards not cast this way on the bottom of your library in a random order." (Treasure Keeper): the cards stay in the library, revealed, and the found card is cast from there; then the rest go to the bottom. */
      inPlace?: true;
    }
  /**
   * Discover N (CR 701.57a): exile cards from the top of your library until a nonland card with mana value N or less;
   * you may cast it without paying its mana cost, else it goes to your hand; the rest go on the bottom in a random order.
   */
  | { type: "discover"; n: Amount; /** Zoyowa's Justice: "Then that player discovers X": that player (CR 701.57a), you otherwise. */ who?: PlayerRef }
  /**
   * Ripple N as it resolves (CR 702.60a): reveal the top N cards, cast any with the same name as the spell for free,
   * the rest to the bottom in any order. `of`: "cause" when the ripple was given to the spell that triggered it.
   */
  | { type: "ripple"; n: number; of?: "cause" }
  /** Evolve's effect (CR 702.100a): a +1/+1 counter on the source if the entering creature (the subject) is still bigger. */
  | { type: "evolve"; /** Hulkling, Burgeoning Bruiser: evolve's check and counter spelled out, not the keyword, so ~ doesn't "evolve" (CR 702.100b). */ notKeyword?: true; /** With `notKeyword`: the kind of counter put on it (Evolving Adaptive: "an oil counter"), +1/+1 if not given. */ counter?: CounterKind }
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
  /**
   * Reins of Power: "Untap all creatures you control and all creatures target opponent controls. You and that opponent
   * each gain control of all creatures the other controls until end of turn. Those creatures gain haste until end of
   * turn." Both groups are the creatures each controls as it resolves, exchanged at once (CR 701.12b, 611.2c).
   */
  | { type: "swapCreatures"; who: PlayerRef }
  /** "Exchange control of target artifact or creature you control and target creature an opponent controls" (Oko, CR 701.12b). */
  | { type: "exchangeControl"; a: ObjRef; b: ObjRef }
  | { type: "groupRules"; affects: Affects; /** The group as the card says it, for the log. */ text: string; mods: Modification[]; duration: "endOfTurn" | "yourNextTurn" }
  | { type: "continuous"; what: ObjRef; mods: Modification[]; duration: "endOfTurn" | /** "Until end of combat" (CR 500.5a). */ "endOfCombat" | "game" | "yourNextTurn" | "endOfYourNextTurn" | /** "Until your next upkeep" (Erhnam Djinn). */ "yourNextUpkeep" | "whileTapped" | "whileControlled"; notSource?: boolean; whileControlled?: true; /** With "whileControlled": "for as long as ~ remains on the battlefield" (Tishana's Tidebinder), whoever controls it. */ whileOnBattlefield?: true; giveTo?: PlayerRef; /** "For as long as it has a vow counter on it" (Promise of Loyalty): only to those of them with one. */ whileCounter?: CounterKind }
  /**
   * Attach the source (an Equipment or Aura) to `what`, CR 701.3; `source`: another Equipment instead ("Attach target
   * Equipment you control to target creature you control", Brass Squire).
   */
  /**
   * A Licid: "~ loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature.
   * You may pay {W} to end this effect." (target 0). Ending it is a special action (CR 116.2c): the "endEffect" action.
   */
  | { type: "becomeLicid"; endCost: string }
  | { type: "attach"; what: ObjRef; source?: ObjRef; /** "If that artifact is an Equipment, attach it" (Thieving Skydiver): not an Aura. */ equipmentOnly?: true; /** "Equip planeswalker" (Luxior): to a planeswalker as though it were a creature. */ asCreature?: true }
  /**
   * "Attach any number of Auras and Equipment you control to target permanent or player" (Ardenn): chosen as it resolves
   * (rulings) among those that could be attached to target `host` (CR 701.3a-b), then attached to it.
   */
  | { type: "attachAny"; host: number; /** "Attach any number of Equipment you control" (Beatrix, Loyal General): only Equipment, not Auras. */ equipment?: true; /** Heavenly Blademaster: "to it": the source itself, not a target (`host` unused). */ self?: true; /** Yuffie, Materia Hunter: "you may attach an Equipment you control to ~": at most one. */ one?: true }
  /** "Attach all Equipment you control to ~" (Balan, Wandering Knight): each of `filter` that could be attached to the source (CR 701.3a-b). */
  | { type: "attachAll"; filter: TargetSpec }
  /** Unbound Flourishing: "double the value of X" of the spell whose casting triggered this, if it's still on the stack. */
  | { type: "doubleX" }
  /**
   * "Remove a hit counter from a card that player owns in exile" (Mari, the Killing Quill): one such card, chosen as it
   * resolves when they differ in how many they have (Etrata counts the cards, not the counters).
   */
  | { type: "removeExiledCounter"; owner: PlayerRef; counter: CounterKind }
  /**
   * Zack Fair: "attach an Equipment that was attached to ~ to that creature": one of those still on the battlefield, chosen
   * as it resolves if there are several (CR 608.2d), attached if it could be (CR 701.3a-b).
   */
  | { type: "attachLastKnown"; what: ObjRef }
  /**
   * "You may attach an Equipment you control to it" (Nahiri, Heir of the Ancients), "For each of those tokens, you may
   * attach an Equipment you control to it" (Goldwardens' Gambit): for each of `what` still on the battlefield, in turn, an
   * Equipment its controller controls chosen as it resolves (CR 608.2d), or none, among those that could be attached to
   * it (CR 701.3a-b). The same Equipment can be chosen again for the next one: it moves.
   */
  | { type: "attachEquipmentTo"; what: ObjRef }
  /** "Attach target Aura attached to a creature to another creature" (Crown of the Ages): a creature chosen as it resolves. */
  | { type: "attachElsewhere"; source: ObjRef }
  /**
   * "Attach ~ to another one of your opponents chosen at random" (Maddening Hex): a Curse moves to one of its controller's
   * opponents other than the player it enchants, at random; with no other one, it stays (rulings).
   */
  | { type: "attachToRandomOpponent" }
  /**
   * "Put it onto the battlefield, attach it to a creature you control" (Stonehewer Giant), "If an Equipment is put onto
   * the battlefield this way, you may attach it to a creature you control" (Armored Skyhunter): the creature is chosen as
   * it resolves, not targeted (CR 608.2d), among those it could be attached to (CR 701.3a-b, 301.5c). `equipmentOnly`:
   * nothing happens unless it's an Equipment; `may`: attaching it to none is a choice too.
   */
  | { type: "attachToChosen"; source: ObjRef; filter: TargetSpec; may?: true; equipmentOnly?: true; /** "Attach one of them" (Gilgamesh): with more than one of `source`, which one is chosen first (with `may`, or none). */ pickOne?: true }
  /**
   * "Exile them, then meld them into [the combined back face]" (CR 701.42): ~ and a permanent of this card type named its
   * counterpart, if you both own and control them (and both are attacking, `attacking`: then it enters tapped and
   * attacking). See meld.ts.
   */
  | { type: "meld"; partnerType: "Creature" | "Land" | "Artifact"; attacking?: true }
  /** "Unattach it" (CR 701.3d): Ogre Geargrabber's Equipment, from whatever it's attached to; `ifAttachedToYours`: "if it's attached to a creature you control" (Stolen Uniform). */
  | { type: "unattach"; what: ObjRef; ifAttachedToYours?: true; /** "If it's an Equipment, unattach it" (Tamiyo's Compleation): only an Equipment. */ ifEquipment?: true }
  /** "{2}: Transform this token." (CR 701.27a): a double-faced token turns its back face up. */
  | { type: "transformSelf" }
  /** Reconfigure's "Unattach this permanent" (CR 702.151a, 701.3d). */
  | { type: "unattachSelf" }
  /** "Create a token that's a copy of target creature you control[, except ...]" (CR 707.2, 707.9, 111.4). */
  /** `ofSource`: a copy of the card the ability came from, as it last existed (embalm, eternalize: exiled to pay the cost). */
  /** `each`: "For each token you control, create a token that's a copy of that permanent" (Second Harvest): one copy of each object in the group `what`, as it is now. */
  /**
   * Benthic Anomaly: "For each opponent, choose a creature that player controls. Create a token that's a copy of one of
   * those creatures, except its power is equal to the total power of those creatures, its toughness is equal to the total
   * toughness of those creatures, and ...": chosen as it resolves (not targeted, CR 608.2d), then one of them copied.
   */
  | { type: "copyChosenPerOpponent"; filter: TargetSpec; except: CopyExcept }
  | { type: "createTokenCopy"; who: PlayerRef; n: Amount; what: ObjRef; except?: CopyExcept; tapped?: boolean; attacking?: boolean; ofSource?: boolean; each?: true; /** "Tapped and attacking that player" after "Whenever you attack a player" (Echoing Assault): the event player. */ attackingEvent?: true; /** "For each opponent, ... attacking that opponent" (Mardu Siegebreaker): `n` for each opponent, each attacking them. */ attackingEach?: true; /** An embalm ability's: the tokens are "embalmed" (CR 702.128b). */ embalmed?: true; /** With `each`: "its controller creates a token that's a copy of that creature" (Parallel Evolution), each copy for the copied permanent's controller, not `who`. */ eachController?: true }
  /**
   * "~ becomes a copy of target creature until end of turn, except it has this ability" (CR 707.4): each permanent
   * `what` refers to becomes a copy of `of`'s copiable values (as it last existed, if it's gone, CR 608.2h), with
   * the exceptions (CR 707.9), for the rest of the game, until end of turn, or until its controller's next turn.
   */
  | { type: "becomeCopy"; what: ObjRef; of: ObjRef; except?: CopyExcept; duration: "game" | "endOfTurn" | "yourNextTurn" }
  /**
   * Mystic Reflection: "The next time one or more creatures or planeswalkers enter this turn, they enter as copies of the
   * chosen creature": a replacement effect for the next such event (CR 614.1c, 707.5), see GameState.nextEntersAsCopy.
   */
  | { type: "nextEntersAsCopy"; of: ObjRef }
  /** `attacking`: "tapped and attacking" (CR 508.4), attacking whom the ability's source attacks. */
  | {
      type: "createToken";
      who: PlayerRef;
      n: Amount;
      token: TokenSpec;
      tapped?: boolean;
      attacking?: boolean;
      /** "That's attacking" (Brimaz, King of Oreskos): attacking but not tapped (CR 508.4). */
      untapped?: true;
      /** "That's tapped and attacking that player" after "Whenever you attack a player" (Soaring Lightbringer): attacking the event player. */
      attackingEvent?: true;
      /** "That's blocking that creature" (Brimaz): it enters blocking it, if that creature is still attacking (CR 509.1). */
      blocking?: ObjRef;
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
      /** "An X/1 ... token": `pt` is its power only; its toughness is the token's own. */
      ptPowerOnly?: true;
      /** "Its toughness is equal to that creature's toughness" (Broken Visage): with `pt` for its power, its toughness. */
      ptToughness?: Amount;
      /**
       * An Aura token "attached to" this object (a Role, CR 303.7): one for each object it means. It isn't created if it
       * couldn't legally enchant that object (rulings on Roles).
       */
      attachTo?: ObjRef;
      /** Investigate (CR 701.16a): a Clue token, made by investigating `n` times, each time an event (youInvestigate). */
      investigate?: true;
    }
  /** Two kinds of tokens made by one instruction (Wurmcoil Engine): they enter at the same time (CR 608.2f). */
  | { type: "together"; effects: Effect[] }
  | { type: "mill"; who: PlayerRef; n: Amount }
  /** "That player exiles the top card of their library" (ingest, CR 702.115a): face up (CR 406.3), with no permission to play it. */
  /**
   * "Exile the top seven cards of that player's library, then put a creature card from among them onto the battlefield
   * under your control" (Lord of the Void): one of the cards the "exileTop" before it exiled that match `filter`, chosen as
   * it resolves; not optional when there is one (rulings).
   */
  | { type: "putFromExiledTop"; filter: TargetSpec; /** "You may put any number of creature and/or land cards from among them onto the battlefield" (Xenagos, the Reveler): any of them, together. */ any?: true }
  /**
   * "Destroy all creatures, then return a creature card put into a graveyard this way to the battlefield under your
   * control" (Necromantic Selection): one of the cards this resolution's destroy put into graveyards, chosen as it
   * resolves; `alsoMods`: "It's a black Zombie in addition to its other colors and types", for good.
   */
  | { type: "returnDiedThisWay"; filter: TargetSpec; /** "Return each card put into a graveyard this way" (Sorin, Lord of Innistrad): all of them, not one. */ each?: true; alsoMods?: Modification[]; /** "Sacrifice it at the beginning of your next end step" (Come Back Wrong). */ atEndStep?: "nextEndStep" | "yourNextEndStep" }
  /** "For each nonland card exiled this way, put a number of time counters on that card equal to its mana value. If it doesn't have suspend, it gains suspend." (The Parting of the Ways): the cards the exileTop before it exiled. */
  | { type: "suspendExiledTop"; filter: TargetSpec }
  | { type: "exileTop"; who: PlayerRef; n: Amount; /** The cards are linked to the source, for its "play cards exiled with ~" (CR 607.2a). */ linked?: true; /** "Put all artifact cards from among them onto the battlefield" (Tezzeret, Master of the Bridge): together, under your control. */ putAll?: TargetSpec }
  /**
   * Dark Confidant: "reveal the top card of your library and put that card into your hand", then maybe "[you] lose
   * (gain) life equal to its mana value" (X is 0 in a library, CR 202.3e).
   */
  /** `drain`: "Each opponent loses X life and you gain X life, where X is that card's mana value" (Twilight Prophet). */
  | { type: "revealTopToHand"; life?: { who: PlayerRef; gain?: boolean; drain?: true }; /** Sarkhan the Mad: "~ deals damage to himself equal to that card's mana value", if it's still on the battlefield. */ selfDamage?: true; /** Duskmantle Seer: each player reveals their own top card, loses life equal to its mana value, then puts it into their hand. */ each?: true }
  /**
   * Keen Duelist, Parker Luck: two players each reveal the top card of their library, each loses life equal to the mana
   * value of the card the other revealed, then each puts the card they revealed into their hand.
   */
  | { type: "duelReveal"; between: PlayerRef[] }
  /** "You may repeat this process any number of times" (Ad Nauseam): `effects` (none of which waits on a choice), then the controller decides whether to go again, each time after seeing the result (rulings). */
  | { type: "repeatMay"; effects: Effect[]; text: string }
  /** Sunforger: the card a search with dest "cast" found, cast from the library without paying its mana cost (CR 608.2g). */
  | { type: "castSearched" }
  /** Geode Golem: "you may cast your commander from the command zone without paying its mana cost", as this resolves (CR 608.2g). */
  | { type: "castCommanderFree" }
  /** Eladamri, Korvecdal: reveal a card from your hand or the top card of your library; one matching `filter` goes onto the battlefield. */
  | { type: "revealHandOrTop"; filter: TargetSpec }
  /**
   * "Each opponent exiles a card from their hand or a permanent they control" (Nicol Bolas, Dragon-God): each of `who`
   * chooses one, in turn order from the active player's, knowing the choices before; then all are exiled at once (rulings).
   */
  | { type: "exileHandOrPermanent"; who: PlayerRef }
  /**
   * "Create a 1/1 Insect token, then mill a card. If an Insect card was milled this way, put a loyalty counter on ~ and
   * repeat this process." (Grist): `effects`, then `then` and all of it again for as long as `cond` holds after them.
   */
  /** Sphinx's Tutelage: "If two nonland cards that share a color were milled this way, repeat this process" (cond "milledShareColor"). */
  /** "Then repeat this process X more times" (Another Round): `effects` `n` times in all, each pass its own choices. */
  | { type: "repeat"; effects: Effect[]; n: Amount }
  | { type: "repeatIf"; effects: Effect[]; cond: { kind: "milledIs"; filter: TargetSpec } | { kind: "milledShareColor" } | /** Hoarder's Greed: "If you win, repeat this process." */ { kind: "wonClash" }; then: Effect[] }
  /** "You may roll again" in a results table's row (Delina, Wild Mage): if its controller wants, the ability's roll and the rows after it happen again (CR 706.3c). */
  | { type: "rollAgain" }
  /**
   * "Each opponent chooses fame or fortune" (Seize the Spotlight): each of `who`, in APNAP order and knowing the earlier
   * answers (CR 101.4), chooses one of the words; what they chose is kept for "for each player who chose ...". Not a vote.
   */
  | { type: "eachChooses"; who: PlayerRef; options: string[]; text: string; /** "Secretly chooses ..., then the choices are revealed": none sees another's word until all have chosen. */ secret?: true; /** "For each player, choose friend or foe" (Pir's Whim): its controller chooses the word for each of them. */ byYou?: true }
  /**
   * "Each opponent faces a villainous choice — A, or B" (CR 701.55): each of `who` in APNAP order chooses one of the two
   * options, then all of it is done, that player being the event player in it, before the next one chooses (701.55d).
   * `labels`: the options' text, for the prompt.
   */
  | { type: "villainous"; who: PlayerRef; options: [Effect[], Effect[]]; labels: [string, string] }
  /**
   * "For each player who chose fame, gain control of a creature that player controls until end of turn": for each player
   * who chose `chose`, in APNAP order, its controller chooses one of that player's creatures (not targeted); then it gains
   * control of all of them for the duration. Afterwards "those creatures" are they (ObjRef created).
   */
  /**
   * `votedFor`: "For each money vote, choose a permanent owned by the voter and gain control of it" (Expropriate): one
   * permanent that voter owns for each such vote, for good.
   */
  | { type: "controlFromEach"; chose?: string; votedFor?: string; duration: "endOfTurn" | "game" }
  /** "Reveal the top card of your library" (CR 701.20a): what follows ("If it's a creature card, put it into your hand") is about it (ObjRef "revealed"). */
  /** "Reveal the top card of your library" (CR 701.20a), or with `look` only look at it, for an "if it's a ... card" after it. */
  /** Parley: "Each player reveals the top card of their library." (ResolvingState.parley counts them.) */
  | { type: "parleyReveal" }
  /**
   * "Put the revealed cards on the bottom of your library in any order" after an exileUntilNonland "keep" (Erratic
   * Explosion): those still in the library, ordered by their owner (CR 401.4). `hand`: "Put the nonland card into your
   * hand and the rest on the bottom" (Explosive Revelation).
   */
  | { type: "revealedUntilToBottom"; hand?: true }
  | { type: "revealTop"; /** "Reveal the top ten cards of your library" (Sanity Grinding, Stomping Slabs): they stay there as "the revealed cards" (ResolvingInfo.revealedUntil). */ n?: number; look?: true; /** "Reveal a card at random from your hand" (Cursed Scroll) instead. */ randomFromHand?: true; /** Whose library: "reveals the top card of their library" (Chaos Warp: the target's owner). Yours if left out. */ who?: PlayerRef }
  /** "Return ~ to its owner's hand" as the spell resolves (Cerebral Eruption): it goes there, not to the graveyard, as it finishes resolving (GameObject.toHandOnResolve). */
  | { type: "spellToHand" }
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
      action: "discard" | "exile" | /** Lost Hours */ "libraryThird" | /** Perish the Thought: "That player shuffles that card into their library." */ "shuffleIn" | /** Painful Memories: "Put that card on top of that player's library." */ "libraryTop" | /** Vendilion Clique: "that player reveals the chosen card, puts it on the bottom of their library". */ "libraryBottom" | /** Lobotomy: the card stays; its name becomes the chosen name ("cards with the same name as the chosen card"). */ "name";
      /** "Choose two cards from it", "X cards" (Mind Warp): that many, or every card there is if fewer (CR 609.3); `upTo`: "up to two", none to that many. */
      n?: Amount;
      upTo?: true;
      until?: "sourceLeaves";
      linked?: boolean;
      /** "You may exile a nonland card from it" (Elite Spellbinder): or none. */
      optional?: true;
      /** "For as long as that card remains exiled, its owner may play it. A spell cast this way costs {2} more to cast." */
      ownerMay?: { play?: true; more?: number };
      /** "If you do, it becomes plotted" (Kellan Joins Up, CR 702.170c): its owner may cast it free on a later turn. */
      plot?: true;
      /** Talara's Bane: "You gain life equal to that creature card's toughness, then that player discards that card." */
      gainToughness?: true;
      /** Never Happened: "a nonland card from that player's graveyard or hand": one card from either zone (action "exile"). */
      orGraveyard?: true;
      /** With `orGraveyard`: Agonizing Remorse's "a nonland card from it or a card from their graveyard": `filter` is for the hand's cards only. */
      anyFromYard?: true;
      /** Covetous Urge: "You may cast that card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell": the ability's controller may (action "exile"). */
      youMay?: { anyType?: true };
    }
  /** `hand`: "discards their hand", every card in it (n is ignored). */
  /** `filter`: "discard a creature card" (only such cards can be chosen). */
  /** `exile`: "target opponent exiles a card from their hand": chosen the same way, but exiled, not discarded (no discard, CR 701.9a); `linked` as for "exile". */
  | { type: "discard"; who: PlayerRef; n: Amount; random?: boolean; hand?: true; /** "Discard any number of cards", "discard up to two cards": none to `n` (CR 107.1c), chosen as it resolves. */ upTo?: true; filter?: TargetSpec; /** "Each player discards cards the same way" (Balancing Act): down to the fewest cards any of them has; `n` is unused. */ downToFewest?: true; exile?: true; linked?: boolean; /** With `hand`: "all nonland cards with the same name as another card in their hand" (Hint of Insanity). */ nameTwice?: true; /** Breakthrough: "choose X cards in your hand and discard the rest": all but this many, chosen (`n` is unused). */ keep?: Amount; /** Soldevi Sage: "Draw three cards, then discard one of them": only the cards this resolution's draw just drew that are still in that hand. */ drawn?: true; /** Fall: "reveals two cards at random from their hand, then discards each nonland card revealed this way": with `random`, `n` cards revealed, only those matching this discarded. */ ofRevealed?: TargetSpec } // CR 701.9
  /** CR 701.22, by the controller, or `who` ("target player scries X", Kozilek's Command). */
  | { type: "scry"; n: Amount; who?: PlayerRef }
  /** "~ endures N" (CR 701.63a): N +1/+1 counters on it, or an N/N white Spirit token, its controller's choice. */
  | { type: "endure"; what: ObjRef; n: Amount }
  /**
   * "Create a Food token or a Treasure token" (Tireless Provisioner): one of these, chosen by its controller as it
   * resolves (CR 608.2d). `labels` name each for the choice.
   */
  /** `onlyDoable`: only the options that can be done now are offered (CR 608.2d), and none happens if neither can (Ghostly Dancers). */
  | { type: "either"; options: Effect[][]; labels: string[]; onlyDoable?: true }
  /**
   * "Unlock a locked door of a Room you control" (Ghostly Dancers), with `what` "... of up to one target Room you control"
   * (Ghostly Keybearer): its controller chooses a locked door and the Room gets that unlocked designation (CR 709.5f).
   */
  | { type: "unlockDoor"; what?: ObjRef; /** "Lock or unlock a door of target Room you control" (Marina Vendrell): any door of it, an unlocked one becoming locked (CR 709.5g). */ orLock?: true }
  /** "Clash with an opponent" (CR 701.30): for a following "If you win, ..." (see SpellCondition "wonClash"). */
  | { type: "clash"; /** "Clash with defending player" (Marvo): that opponent, not one chosen (CR 701.30b). */ with?: PlayerRef }
  /**
   * "Flip a coin" (CR 705): its controller calls it and wins or loses the flip, for a following "If you win the flip, ..."
   * (SpellCondition "wonFlip"); `untilLose`: "flip a coin until you lose a flip", counting the wins (Count "flipsWon").
   */
  /**
   * "Flip a coin for each creature that isn't a Demon, Devil, or Imp. Destroy each creature whose coin comes up tails."
   * (Rakdos, the Showstopper): one coin for each permanent that fits as it resolves, which only comes up heads or tails
   * (no one wins or loses it, CR 705.2); those that come up tails are destroyed at the same time (rulings).
   */
  | { type: "flipCoinEach"; filter: TargetSpec }
  /** Mana Clash: "You and target opponent each flip a coin. ~ deals 1 damage to each player whose coin comes up tails. Repeat this process until both players' coins come up heads on the same flip." (flips no one wins, rulings). */
  | { type: "flipClash"; with: PlayerRef; damage: number }
  | { type: "flipCoin"; untilLose?: true; /** "Flip three coins" (Goblin Traprunner): that many flips, the wins counted. */ n?: number; /** "For each coin that comes up heads" (Ral Zarek): no one calls these flips, so no one wins or loses them (CR 705.2, rulings); the heads are counted. */ uncalled?: true }
  /**
   * "Roll a d20", "roll X six-sided dice", "roll two d20 and ignore the lower roll", "roll a d20 and add the number of
   * cards in your hand" (CR 706): the controller rolls; `add` and `subtract` modify the result (706.2). A results table
   * and "equal to the result" read it afterwards (SpellCondition "rollIn", Count "rollResult").
   */
  | { type: "roll"; sides: number; n?: Amount; add?: Amount; subtract?: Amount; /** "Ignore the lower roll": keep only the highest one. */ keepHighest?: true; /** "Roll two d8 and choose one result" (the Endeavors): "that result" is the one chosen, "the other result" the other (Count "rollOther"). */ chooseOne?: true; /** "Each player rolls a d20" (Chaos Dragon): every player in the game, in turn order, each result kept (ResolvingInfo.rolledEach). */ eachPlayer?: true }
  | { type: "surveil"; n: Amount } // CR 701.25
  /** Urabrask, Heretic Praetor: "the next time they would draw a card this turn, instead they exile the top card of their library. They may play it this turn." (Player.nextDrawExiles) */
  | { type: "nextDrawExile"; who: PlayerRef }
  /** Words of Wilding, Words of Worship: "The next time you would draw a card this turn, create a 2/2 green Bear creature token (you gain 5 life) instead." (Player.nextDrawInstead) */
  | { type: "nextDrawInstead"; gain?: number; token?: TokenSpec }
  /** "Look at the top N cards of [a player's] library, then put them back in any order": the controller orders them. */
  | { type: "orderTop"; who: PlayerRef; n: Amount; /** Fateseal (CR 701.29a): with `who` the chosen player and `mayBottom`, the opponent is chosen first, as it resolves. */ fateseal?: true; /** "You may put that card on the bottom of that player's library" (Jace, the Mind Sculptor): as a scry of their library. */ mayBottom?: true; /** "Look at the top five cards of target player's library" (Visions): only looked at, never reordered. */ lookOnly?: true }
  /**
   * Earthbend N (CR 701.66a): the target land you control becomes a 0/0 land creature with haste in addition to its
   * other types, gets N +1/+1 counters, and "when that land dies or is put into exile, return it to the battlefield
   * tapped under your control".
   */
  | { type: "earthbend"; what: ObjRef; n: Amount }
  /** "Put two cards from your hand on top of your library in any order" (Brainstorm): the controller's own hand. */
  /** `bottom`: "put a card from your hand on the bottom of your library" instead (Volcanic Spite). */
  | { type: "handToTop"; n: Amount; bottom?: true; /** See Beyond: "shuffle a card from your hand into your library". */ shuffle?: true; /** "Target opponent puts a card from their hand on top of their library" (Chimney Imp), "each player ..." (Sadistic Augermage): each of them, from their own hand, in turn order (default: you). */ who?: PlayerRef }
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
      /** "Until end of turn, you don't lose this mana as steps and phases end" (CR 500.4); "combat": "Until end of combat, you don't lose this mana as steps end" (Fire Lord Ozai). */
      keep?: "turn" | "combat";
      /** Who adds it: "target player adds", "that player adds" (CR 106.4); the controller if absent. */
      who?: PlayerRef;
      /** "Spend this mana only to cast instant and sorcery spells" after it (CR 106.6). */
      only?: ManaSpend;
      /** "Add {B} or {G} for each ...": `times` mana, each of either color (chosen as it resolves). */
      split?: [ManaType, ManaType];
      /**
       * "Add X mana in any combination of colors, where X is the total power of attacking creatures" (Klauth), "add two mana
       * in any combination of colors" (Manamorphose): `times` mana, each of any color (CR 106.1b), chosen as it resolves.
       */
      anyColors?: true;
      /** Remember that this ability's source added mana this turn (StaticCondition addedManaThisTurn). */
      markSource?: true;
    }
  /** "Creatures without flying can't block this turn" (Falter): a rule for the turn, not locked to the creatures there now,
   * since it doesn't change characteristics (CR 611.2c; Magmatic Chasm rulings). */
  | { type: "cantBlockRule"; filter: TargetSpec; /** Eunuchs' Intrigues: "Other creatures they control": controlled by this player, as it resolves, except the creature that player just chose (ObjRef "created"). */ ofPlayer?: PlayerRef; exceptChosen?: true }
  /** "Creatures can't attack this turn" (kicked Orim's Chant): a rule for the turn, so also creatures that arrive later (CR 611.2c). */
  | { type: "cantAttackRule"; filter: TargetSpec; /** "Creatures that player controls" (Oriss, Samite Guardian): those that player controls. */ ofPlayer?: PlayerRef; /** "Other creatures can't attack this turn" (Intimidation Bolt): not target `exceptTarget` while it's that object. */ exceptTarget?: number }
  /** "Creatures can't be blocked this turn" (Venser, the Sojourner): a rule for the turn, so also creatures that arrive later (CR 611.2c; rulings). */
  | { type: "cantBeBlockedRule"; filter: TargetSpec }
  /** "You may shuffle", "you may have that player shuffle" (CR 701.20). */
  | { type: "shuffle"; who: PlayerRef; /** "If you search your library this way, shuffle" after searches with `noShuffle` (Claim Jumper): only if one of them searched it. */ ifSearched?: true }
  /**
   * "Shuffle it into its owner's library"; `shuffleSpell`: "Shuffle ~ into its owner's library", the resolving spell itself,
   * instead of its owner's graveyard (CR 608.2n). The owner's library is shuffled even if the card is gone (CR 701.24c).
   */
  | { type: "shuffleIntoLibrary"; what: ObjRef; /** "Into your library": yours is shuffled even if no card is put into it. */ yours?: true; /** "Target player shuffles ... into their library" (Memory's Journey): that player's is, the same way. */ who?: PlayerRef }
  | { type: "shuffleSpell"; /** "Put ~ on the bottom of its owner's library" (Seasons Past): there instead, with no shuffle. */ bottom?: true; /** "Put ~ into its owner's library seventh from the top" (Approach of the Second Sun): no shuffle. */ nth?: number }
  /** "Target player shuffles their graveyard into their library", "Each player shuffles their hand and graveyard into their library". */
  | { type: "shuffleZones"; who: PlayerRef; hand?: true; graveyard?: true; /** Sway of the Stars: "and all permanents they own", every player's at once before the cards are shuffled in (tokens cease to exist, CR 111.7). */ permanents?: true; /** "Target player mills that many cards" next (Psychic Spiral): how many cards were shuffled in, as ResolvingInfo.movedLinked. */ countThisWay?: true; /** "All creature cards from your graveyard": only those. */ filter?: TargetSpec; /** "Puts all the cards from their graveyard on the bottom of their library in a random order" (Endurance): no shuffle. */ bottom?: true; /** "Then draws that many cards" (Winds of Change): each player as many as they shuffled in, after all have shuffled. */ drawThatMany?: true; /** "You gain life equal to the number of cards shuffled into your library this way" (Elixir). */ gainThatMany?: true; /** "Exchange your graveyard and library" (Morality Shift): the library's cards go to the graveyard at the same time, and nothing is shuffled (a "Then shuffle" of its own does). With `hand`, "exchange your hand and library" (Mordenkainen): to the hand. With `hand` and `graveyard`, "exchange your hand and graveyard" (Harness Infinity): no library. */ exchange?: true }
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
  | { type: "bite"; a: ObjRef; b: ObjRef; excessIfTrample?: true; /** "Deals damage equal to twice its power" (Polliwallop): that multiple. */ times?: number; /** "Each creature deals damage to itself equal to its power" (Wave of Reckoning): each of `a` to itself, all at once (`b` is `a`). */ self?: true }
  /**
   * Counter the targeted spell (CR 701.6a), maybe unless its controller pays (CR 118.12); "exile it instead", "put it on
   * top of its owner's library instead".
   */
  /** "Counter each spell you don't control" (overloaded Counterflux): every spell on the stack matching it, not abilities. */
  | { type: "counterEach"; filter: TargetSpec }
  /** "Target spell can't be countered" (Vexing Shusher): that spell, a copy too, while it's on the stack (CR 101.2). */
  | { type: "spellUncounterable"; index: number }
  /**
   * "That creature enters with an additional +1/+1 counter on it" in a cast trigger (Boreal Outrider): the spell it was
   * about, if it's still on the stack, enters with these too (CR 614.1c).
   */
  | { type: "spellEntersWith"; counter: CounterKind; n: Amount }
  /** "It gains haste until end of turn" about the spell a cast trigger is about (Tyvar Kell's emblem): the permanent it becomes has it, until end of turn (CR 400.7a). */
  | { type: "spellGains"; mods: Modification[]; /** "That spell gains deathtouch and lifelink" (Judith, Carnage Connoisseur): no duration, so only while it's that spell; a permanent it becomes doesn't keep them (CR 400.7). */ whileSpell?: true; /** No duration (Rivaz of the Claw's 'it gains "When this creature dies, exile it."'): for as long as that permanent is on the battlefield. */ forever?: true; /** "Gains hexproof until your next turn" (Jade Orb of Dragonkind): until the trigger's controller's next turn. */ until?: "yourNextTurn" }
  | {
      type: "counterSpell";
      index: number;
      unless?: UnlessPays;
      exile?: boolean;
      top?: boolean;
      /** Remand: "If that spell is countered this way, put it into its owner's hand instead of into that player's graveyard." */
      hand?: true;
      /** With `exile`: "You may play it without paying its mana cost for as long as it remains exiled" (Spelljack; "cast that card", Kheru Spellsnatcher): a permission for this ability's controller (CR 609.4b), that card only while it stays exiled (CR 400.7). */
      youMayFree?: "play" | "cast";
      /** With `exile`: "If a permanent spell is countered this way, exile it instead" (Thranduil's Decree): only a permanent spell (CR 110.4b) is exiled. */
      exileIfPermanent?: true;
      /** Delay: "exile it with three time counters on it instead ... If it doesn't have suspend, it gains suspend." */
      suspend?: number;
      /**
       * "Return target spell to its owner's hand" (Reprieve): not a counter, so a spell that can't be countered goes too
       * (CR 101.2 doesn't apply); otherwise like Remand's.
       */
      bounce?: true;
      /** With `bounce`: "Put target spell ... into its owner's library second from the top" (Commit): there instead of the hand. */
      librarySecond?: true;
      /** With `bounce`: "Its owner puts it on their choice of the top or bottom of their library" (Subtlety): there instead. */
      libraryChoice?: true;
      /** "Exile any number of target spells" (Mindbreak Trap): not a counter either, so it exiles one that can't be countered (rulings). */
      exileSpell?: true;
      /** "Exile target spell. It becomes plotted." (Aven Interrupter, CR 702.170c). */
      plot?: true;
      /** With `exileSpell`: airbend (CR 701.65a): while the card stays exiled, its owner may cast it for this rather than its mana cost. */
      ownerMayCost?: string;
      /** "Any number of target spells": the targets from `index`, this many (see TargetSpec.many, expandMany). */
      n?: number;
      /** "Counter target spell if its mana value is X" (Disrupting Shoal): only then, checked as it resolves. */
      ifMvX?: true;
      /** Ertai's Trickery: "Counter target spell if it was kicked": any spell can be targeted; only a kicked one is countered. */
      ifKicked?: true;
      /** "Counter target spell if it has the same name as that card" (Jester's Scepter): the card put into a graveyard to pay the cost. */
      ifCostCardName?: true;
      /** "Counter target spell if it has the same mana value as the discarded card" (Hisoka, Minamo Sensei): the discard cost's card, X as 0. */
      ifMvDiscarded?: true;
      /** "When you cast this spell, ... counter ~" (Brain Gorgers): the spell that triggered it, not a target (`index` -1). */
      cause?: true;
      /**
       * "If a permanent's ability is countered this way, destroy that permanent" (Green Slime), "... activated abilities of
       * that permanent can't be activated this turn" (Trickbind): an ability countered, its source still the permanent it was.
       */
      thenSource?: "destroy" | "cantActivate";
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
   * "Gain control of target spell" (Commandeer): its controller becomes this ability's controller; a permanent spell
   * becomes a permanent under their control (CR 110.2b). An instant or sorcery still goes to its owner's graveyard.
   */
  | { type: "controlSpell"; index: number }
  /**
   * "Put four time counters on the exiled card. If it doesn't have suspend, it gains suspend." (Jhoira of the Ghitu): a
   * card in exile gets time counters and suspend's abilities (CR 702.62a), so it's suspended (CR 702.62b).
   */
  | { type: "suspendCard"; what: ObjRef; n: number }
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
  | { type: "may"; effects: Effect[]; text: string; otherwise?: Effect[]; pay?: PayCost; keep?: boolean; once?: boolean; payX?: { max?: Amount; /** "You may pay any amount of {R}" (Leyline Tyrant): X paid in mana of that color only. */ color?: "W" | "U" | "B" | "R" | "G"; /** "You may pay any amount of life" (Necrodominance): X life, up to the life the player could pay (CR 119.4). */ life?: true; /** "You may pay any amount of {E}" (Galvanic Discharge): X energy, up to the energy the player has (CR 107.14). */ energy?: true; /** "You may pay one or more {E}. If you do" (Localized Destruction): paying none is not paying. */ atLeastOne?: true; /** "You may pay {1}{W} any number of times" (Intrepid Adversary): `pay` X times, X chosen first (none is not paying), at most as many times as the player could pay. */ times?: true }; /** "Pay {E}{E}. If you can't, ..." (Greenbelt Rampager): energy paid whenever it can be, with no choice (rulings). */ must?: true; /** "Unless you pay an amount of {E} equal to its mana value" (Volatile Stormdrake): energy counted as it resolves. */ payEnergy?: Amount; /** "Pay X life, where X is its power" (Mask of Griselbrand): life counted as it resolves. */ payLife?: Amount; /** "Unless you pay {1} for each card in your hand" (Megatherium): `pay` that many times, counted as it resolves. */ payTimes?: Amount; /** "Unless you pay its mana cost" (Pendrell Flux): the source's mana cost as it resolves, X as 0 (unpayable with none, CR 118.6). */ payManaCost?: true; /**
   * "For each opponent, you may put up to one target creature card from that player's graveyard onto the battlefield"
   * (Sepulchral Primordial): asked about each target in turn, then done at once to the ones chosen (rulings: they enter
   * simultaneously). The targets turned down aren't affected.
   */ eachTarget?: true }
  /**
   * "Each player may discard their hand and draw five cards" (Will of the Jeskai): each of them decides in APNAP order,
   * knowing the earlier answers (CR 101.4), then `effects` happen to those who chose to ({ ref: "choseThisWay" }).
   * `wheel`: the number of cards drawn (each player's own with PlayerRef eachOne, Imposing Grandeur), for the bots' answer.
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
  /**
   * Join forces: "Starting with you, each player may pay any amount of mana" (Minds Aglow), the total kept for X.
   * `activeFirst`: "Each player may pay any amount of mana" (Liege of the Hollows): starting with the active player
   * (CR 101.4, rulings), each one's amount kept too.
   */
  | { type: "joinForces"; activeFirst?: true }
  | { type: "eachMay"; who: PlayerRef; effects: Effect[]; text: string; wheel?: Amount; each?: true; chain?: true; need?: { zone: "battlefield" | "graveyard" | "hand"; filter: TargetSpec }; untappedSubject?: true; perAccepted?: { effects: Effect[]; opponents?: true }; pay?: PayCost }
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
  | { type: "punisher"; who: PlayerRef; options: PunisherOption[]; effects: Effect[]; times?: Amount; picks?: Amount; mode?: "ifAny" | "ifNone"; /** With `mode`: what happens instead when `effects` don't ("If they do, ~ deals 2 damage to the permanent or player", Rhystic Lightning). */ otherwise?: Effect[]; /** What `effects` do, for the prompt; without `mode`, what its controller does to those who don't ("may draw a card"). */ thenText?: string; /** The penalty's button as it is ("Lose 5 life (Ann sacrifices Pillar Tombs of Aku)"), ~ its source. */ penalty?: string }
  /**
   * Cumulative upkeep (CR 702.24a): put an age counter on it, then you may pay the cost once for each
   * age counter on it; if you don't, sacrifice it.
   */
  | { type: "cumulativeUpkeep"; pay: PayCost; /** "Cumulative upkeep—Put a -1/-1 counter on ~" (Aboroth): the cost is that many of these counters on it, not a payment. */ selfCounter?: CounterKind; /** "Cumulative upkeep—Draw a card" (Psychic Vortex): the cost is drawing a card for each age counter. */ drawCost?: true; /** "Cumulative upkeep—Add {R}" (Braid of Fire): the cost is adding this mana for each age counter. */ addMana?: string } // "If you don't, ...": fabricate (CR 702.123a)
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
  | { type: "reflexive"; body: AbilityBody; sacrificed?: true; /** "Where X is the exiled card's toughness" (Venom, Deadly Devourer): its X, counted as it triggers in the ability that made it. */ xAmount?: Amount; /** "When you discard a nonland card this way, ~ deals damage equal to that card's mana value" (Fiery Encore): its X, the mana value of the card discarded. */ xDiscardedMv?: true; /** "Where X is the number of card types the discarded card has" (Mount Velus Manticore): its X, the card types (CR 205.2a) of the card the "you may discard" discarded. */ xDiscardedTypes?: true; about?: "created" | { target: number; attached?: true }; /** "When you put one or more Equipment onto the battlefield this way" (Gilgamesh): only if the ability put one or more permanents onto the battlefield, which it remembers (PendingTrigger.putThisWay). */ putThisWay?: true; /** "When it deals excess damage this way, ... that amount of excess damage" (Unleash the Inferno): its X is the excess dealt (CR 603.12). */ xExcess?: true; /** "You may sacrifice one or more Treasures. When you do, up to that many target creatures ..." (Swashbuckler Extraordinaire): its X is how many were sacrificed. */ xSacrificed?: true; /** "You may discard one or more land cards. When you do, return up to that many target ..." (Loamcrafter Faun): its X is how many were discarded. */ xDiscarded?: true; /** "When you reveal a creature card this way, ..., where X is the mana value of that card" (Yuna's Whistle): only if the revealUntil before found a card (ResolvingState.revealedUntilMv), its X that card's mana value. */ xRevealedMv?: true; /** "Exile the top card of your library. You may play that card this turn. When you exile a (nonland) card this way, ..., where X is that card's mana value" (Cait Sith, Fortune Teller; Hidetsugu, Devouring Chaos): only if the impulse before exiled a card (ResolvingState.exiledTop), a nonland one for "nonland", its X that card's mana value. */ xExiledMv?: "any" | "nonland"; /** "Create a Food token. When you do, ...": once for each of this token the effect before created (CR 603.12a). */ perToken?: TokenSpec }
  /** "Until end of turn, you don't lose unspent red mana as steps and phases end" (The Last Agni Kai, CR 500.4). */
  | { type: "keepManaThisTurn"; color?: Color }
  /** "Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}" (High Tide). */
  | { type: "manaTriggerThisTurn"; trigger: ManaTrigger }
  /** "Defending player gets a poison counter", "each opponent gets two poison counters" (CR 122.1f; ten lose, 704.5c). */
  /** `upTo`: as many as it takes to have that many ("equal to the difference", Vraska, Betrayal's Sting); `n` is unused. */
  | { type: "poison"; who: PlayerRef; n: Amount; upTo?: number }
  /** "Target player gets two rad counters" (CR 728). */
  | { type: "getRad"; who: PlayerRef; n: Amount }
  /** Rad counters' inherent triggered ability (CR 728.1), for the player whose precombat main phase it is (its controller). */
  | { type: "radiation" }
  /** "Each opponent loses all counters" (CR 122.1): poison and energy, the player counters there are here. */
  | { type: "loseAllCounters"; who: PlayerRef; /** "Loses all poison counters" (Leeches): only those; how many is kept for "that much" (Count poisonLostThisWay). */ poison?: true }
  /** "Double the number of each kind of counter you have" (CR 701.10e): that many more of each. */
  | { type: "doublePlayerCounters"; who: PlayerRef }
  /**
   * Doubling the power and/or toughness of each of a group until end of turn (CR 701.10b-c): each gets +X/+0, +0/+Y or
   * +X/+Y, X its power and Y its toughness as this resolves (negative ones make it -X or -Y).
   */
  | { type: "doublePT"; what: ObjRef; power: boolean; toughness: boolean; /** Triple instead (CR 701.11b): twice the value added. */ triple?: true }
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
  | {
      type: "castFromExileFree";
      /** "Counter target spell. If that spell is countered this way, exile it instead ..., then you may cast it without paying its mana cost" (Transcendent Dragon): the card countered and exiled this way (Resolving.counteredExiled), cast as this resolves (CR 608.2g). */
      countered?: true;
    }
  /**
   * Jeweled Amulet: "Note the type of mana spent to pay this activation cost." As the ability resolves, its source notes
   * that type (GameObject.notedMana); with no mana spent, nothing new is noted.
   */
  | { type: "noteManaSpent" }
  /**
   * Rona, Tolarian Obliterator: "that source's controller exiles a card from their hand at random. If it's a land card,
   * you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost."
   * The card is cast as this resolves, ignoring timing (CR 608.2g); X is 0, no alternative costs (rulings).
   */
  | { type: "exileRandomThenPlay"; who: PlayerRef }
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
  /** "You can't become the monarch this turn" (Jared Carthalion, True Heir): until the turn ends (TurnLog.cantBecomeMonarch). */
  | { type: "cantBecomeMonarch"; who: PlayerRef }
  /** "It becomes night" (Unnatural Moonrise), "it becomes day" (CR 731.1): the daybound and nightbound permanents transform with it. */
  | { type: "becomeDayNight"; v: "day" | "night" | /** The Celestus: "If it's night, it becomes day. Otherwise, it becomes night." */ "switch" }
  /** "You may play an additional land this turn" (CR 305.2a): `n` more land plays for you this turn. */
  | { type: "extraLandThisTurn"; n: Amount }
  /** "~ becomes saddled until end of turn" (CR 702.171b): a designation it has until end of turn or until it leaves. */
  | { type: "becomeSaddled"; what: ObjRef }
  /** The end of every crew ability (CR 702.122a): it "becomes crewed" as the ability resolves (CR 702.122e). */
  | { type: "becameCrewed" }
  /** The end of every gift's effect (CR 702.174c): its controller "gives a gift" as the spell or the gift trigger resolves. */
  | { type: "gaveGift" }
  /** The end of a paid cumulative upkeep (CR 702.24a): "Whenever you pay ~'s cumulative upkeep" (Hibernation's End). */
  | { type: "cumulativeUpkeepPaid" }
  /** A class level bar's "This Class's level becomes N" (CR 716.2a). */
  | { type: "classLevel"; n: number }
  /** A "To solve" trigger's "this Case becomes solved" (CR 719.3a). */
  | { type: "solve" }
  /** "Harness ~" (CR 701.64a): if it isn't harnessed, it becomes harnessed; its "∞ —" abilities then work (702.186b). */
  | { type: "harness" }
  /**
   * "The next spell you cast this turn has improvise" (Archway of Innovation, CR 702.126): used up by the next spell cast.
   * `convoke`: "... has convoke" (Wand of the Worldsoul, CR 702.51) instead.
   */
  | { type: "nextSpellImprovise"; convoke?: true }
  /** "Transform ~" (CR 701.27a): turn a double-faced permanent over. */
  /** `convert`: "convert ~" (CR 701.28a), which works just as transforming does. */
  | { type: "transform"; what: ObjRef; convert?: true }
  /** "Flip ~", "you may flip it" (CR 710): a flip card's permanent turns to its flipped half, for good (710.4). */
  | { type: "flip"; what: ObjRef }
  /** "~ becomes prepared" (CR 722.3a): a permanent with a prepare spell gets the prepared designation. */
  /** "Becomes prepared" (CR 722.3a); `un`: "becomes unprepared" (CR 722.3b). */
  | { type: "becomePrepared"; what: ObjRef; un?: true }
  /** "The Ring tempts you" (CR 701.54a): choose a creature you control as your Ring-bearer. */
  | { type: "ringTempts" }
  /** "~ phases out", "target creature phases out" (CR 702.26b). */
  | { type: "phaseOut"; what: ObjRef; /** Oubliette: "until ~ leaves the battlefield. Tap that creature as it phases in this way." (CR 610.3): it phases in tapped only then, not in an untap step. */ untilSourceLeaves?: true; /** "You may have any number of them phase out" (Change of Plans): the controller picks which of them, none too. */ anyNumber?: true }
  /** Speed's inherent trigger (CR 702.179d): "if your speed is less than 4, your speed increases by 1". */
  | { type: "increaseSpeed" }
  /**
   * "It gets +1/+1 until end of turn for each creature blocking it (beyond the first)": rampage
   * (CR 702.23a) and the like. The number of blockers is counted as it resolves (CR 702.23b).
   */
  | { type: "pumpPerBlocker"; what: ObjRef; power: number; toughness: number; beyondFirst: boolean }
  /** Murderous Spoils: "all Equipment that were attached to it", kept before it's destroyed, as "created" for what follows. */
  | { type: "rememberGroup"; what: ObjRef }
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
  /** "If a player is dealt damage this way, they can't gain life for the rest of the game" (Screaming Nemesis, CR 119.7). */
  | { type: "noLifeGainForGame"; who: PlayerRef }
  /** "You can't lose life this turn, you can't lose the game this turn, and your opponents can't win the game this turn" (Courageous Resolve). */
  /** `everyone`: "Players can't lose life this turn" (Everybody Lives!), each player in the game as it resolves. */
  | { type: "turnRules"; rules: TurnRule["rule"][]; everyone?: true; /** "That player can't activate abilities that aren't mana abilities" (Abeyance): for these players. */ who?: PlayerRef; /** For each opponent of its controller (Revel in Silence). */ opponents?: true; /** "Can't be countered by blue or black spells" (Autumn's Veil): only by spells of these colors. */ byColors?: Color[] }
  /** "Until your next turn, you may cast sorcery spells as though they had flash." (Teferi, Time Raveler; CR 702.8a) */
  | { type: "flashUntilNextTurn"; filter: TargetSpec; /** "You may cast creature spells this turn as though they had flash" (Winding Canyons): until this turn ends instead. */ thisTurn?: true }
  /**
   * Goblin Welder: "If both targets are still legal as this ability resolves, that player simultaneously sacrifices the
   * artifact and returns the artifact card to the battlefield": targets `artifact` and `card` (rulings: neither if either is illegal).
   */
  | { type: "weld"; artifact: number; card: number }
  /** "Until your next turn, your opponents can't cast spells from anywhere other than their hands" (Avatar's Wrath): see GameState.handOnlyUntil. */
  | { type: "opponentsHandOnlyUntilNextTurn" }
  /** "You may cast a creature spell from your graveyard this turn" (Chainer, Nightmare Adept): one such cast (GameState.graveGrants). */
  | { type: "graveyardCastThisTurn"; filter: TargetSpec; /** The Tomb of Aclazotz: "If you do, it enters with a finality counter on it and is a Vampire in addition to its other types." */ rider?: GraveCastRider; /** Locke: only the cards the mill before put into graveyards, any player's (GameState.graveGrants `cards`). */ milled?: true }
  /**
   * For the rest of the turn, its controller may cast spells (`cast`: those cards) and/or play lands (`lands`) from their
   * graveyard, as many as they like, paying their costs and following their timing rules (rulings on Forgotten Cellar;
   * a land is still their land play, CR 305.2); `exileInstead`: "if a card would be put into your graveyard from anywhere
   * this turn, exile it instead" (CR 614.1a), not a token (rulings).
   */
  /** "Until end of turn, you may look at the top card of your library any time and you may play ... from the top of your library" (Gwenom): GameState.topTurn. */
  | { type: "topTurn"; top: FromTop }
  | { type: "graveyardTurn"; cast?: TargetSpec; lands?: true; exileInstead?: true; /** "From any graveyard" (The Great Work). */ anyGraveyard?: true; /** "If a spell cast this way would be put into a graveyard, exile it instead." */ exileCast?: true }
  /** "Artifact, instant, and sorcery spells you cast this turn cost {2} less to cast" (Urza, Planeswalker): `mod`'s "you" is the ability's controller (CR 601.2f, 611.2a). */
  | { type: "costModThisTurn"; mod: CostMod; /** "... until your next turn" (Elspeth Conquers Death): as that turn begins (CR 611.2b). */ untilYourNextTurn?: true; /** "The next spell you cast this turn costs {1} less to cast" (Hardened Berserker): only the next such spell its controller casts this turn, used up as it becomes cast (CR 601.2f, 601.2i). */ next?: true; /** "Costs {X} less ..., where X is ~'s power as this ability resolves" (Maelstrom Muse): generic mana `mod.n` times this, counted as it resolves. */ times?: Amount }
  /**
   * "Your opponents can't cast spells this turn" (Silence), "target player can't ..." (Orim's Chant), "players can't cast
   * noncreature spells this turn" (Calamity's Wake): those players, chosen as it resolves, until the turn ends; `filter`
   * is the kind of spell.
   */
  | { type: "cantCast"; who: PlayerRef; filter?: TargetSpec; /** "Until the end of your next turn" (Single Combat), not just this turn. */ untilYourNextTurnEnds?: true; /** "Until your next turn" (Hope of Ghirapur). */ untilYourNextTurn?: true; /** "During that player's next turn" (Azor, the Lawbringer): only in each such player's next turn. */ duringTheirNextTurn?: true }
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
  | { type: "search"; filter?: TargetSpec; n: Amount; upTo: boolean; dest: SearchDest; others?: SearchDest; /** With `others`: "Put two of them onto the battlefield tapped and the other into your hand" (Viewpoint Synchronization): the first this many found go to `dest`. One if left out. */ firstN?: number; reveal: boolean; /** Whose library: "its controller may search their library" (Path to Exile). Yours if left out. */ who?: PlayerRef; /** "Search target opponent's library" (Bribery): you search that player's library, which they then shuffle. */ library?: PlayerRef; /** "Search your library and/or graveyard ... If you search your library this way, shuffle" (Finale of Devastation): your graveyard, and your library too if you choose. */ orGraveyard?: boolean; /** "A card named A and/or a card named B" (Alpine Houndmaster), "cards with different names" (Three Dreams): at most one card of each name. */ oneEach?: true; /** "Up to two basic land cards that share a land type" (Myriad Landscape): the cards found all have a land type in common. */ shareLandType?: true; /** "Each player may search their library" (Veteran Explorer): each one, as their turn to search comes, chooses whether to (rulings); only those who did shuffle. */ may?: true; /** "Target opponent chooses two of those cards. Put the chosen cards into your graveyard and the rest into your hand" (Gifts Ungiven): `n` of the cards found, chosen by that opponent (by an opponent you choose as it resolves if left out), go `to`; the rest go to `dest`. */ split?: { chooser?: PlayerRef; n: number; to: SearchDest }; /** "Put that card into your hand if you control an Assassin. Otherwise, put that card on top of your library." (Loyal Inventor): where the cards found go instead of `dest` while `cond` holds, as they're put there. */ condDest?: { cond: StaticCondition; dest: SearchDest }; /** "Put it onto the battlefield tapped if it's a land card. Otherwise, put it into your hand." (Archdruid's Charm): where a land card found goes instead of `dest`. */ landTo?: SearchDest; /** "Put it onto the battlefield if its mana value is 2 or less. Otherwise, put it into your hand." (Guidelight Pathmaker): where a card found that's `card` goes instead of `dest`. */ cardTo?: { card: TargetSpec; dest: SearchDest }; /** "A Forest card and a Plains card" (Krosan Verge): up to one card for each of these, each card found matching a different one. */ oneOfEach?: TargetSpec[]; /** The cards a "hold" flicker exiled enter with the found cards, at the same time, under your control (Sword of Hearth and Home). */ withHeld?: true; /** Not shuffled now: a later "shuffle" with `ifSearched` does it once (Claim Jumper). */ noShuffle?: true; /** "Search your library and graveyard for five cards" (Doomsday): both zones together, no choice. */ andGraveyard?: true; /** With `andGraveyard`: "Search your graveyard, hand, and library for a card named ..." (Kassandra, Eagle Bearer): the hand too. */ andHand?: true; /** "And exile the rest" (Doomsday): every other card in the zones searched is exiled before the found cards are put where they go. */ exileRest?: true; /** "Any number of creature cards with total mana value 6 or less" (Protean Hulk): of all the cards found. */ totalMv?: number; /** Scholar of New Horizons: "If an opponent controls more lands than you, you may put that card onto the battlefield tapped. If you don't put the card onto the battlefield, put it into your hand": the one card found may go here instead of `dest` while `cond` holds, the searcher's choice. */ mayInstead?: { dest: SearchDest; /** Left out (Dina's Guidance: "put it into your hand or graveyard"): always the searcher's choice. */ cond?: StaticCondition; /** "If it's an artifact card, you may put it onto the battlefield" (Treasure Chest): only a card found that's this. */ card?: TargetSpec }; /** Transmute Artifact: the one card found goes to `dest` if its mana value is at most this; if greater, only if the searcher pays the difference as it resolves, and into its owner's graveyard if they don't. */ payDiff?: Amount; /** "Search your library for three cards, exile them" (Foresight): cards the searcher wants gone (for the bot). */ away?: true; /** "A card with the same name as target nontoken creature" (Bifurcate), "... as that creature" (Remembrance): only cards with that name or one of those names, found as it resolves (CR 201.2). */ sameName?: SameNameRef; /** "Search ... for any number of basic land cards, put them onto the battlefield ... Those lands become ..." (Nissa, Worldwaker): every card found and put onto the battlefield is remembered (ObjRef "created"). */ rememberAll?: true }
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
  | { type: "dig"; n: Amount; count: number; /** "Put X cards from among them into your hand" (Stargaze): `count` is the X it was cast with. */ countX?: true; /** Omarthis: "manifest a number of cards ... equal to ...": every card looked at (`count` unused). */ countAll?: true; /** "If ~ was kicked, put two of those cards into your hand instead": `count` when kicked (CR 702.33e). */ kickedCount?: number; /** "If there is an instant card and a sorcery card in your graveyard, instead put two of them into your hand" (Flow State): `count` while your graveyard has a card matching each of `has`, as it resolves. */ countIfYard?: { has: TargetSpec[]; count: number; /** "If there are three or more Lesson cards in your graveyard" (Accumulate Wisdom): at least this many cards matching `has[0]`. */ min?: number }; upTo: boolean; filter?: TargetSpec; /** "manifest", "cloak": onto the battlefield face down (CR 701.40a, 701.58a). */ into: "hand" | "libraryTop" | "battlefield" | "manifest" | "cloak" | "exile" | /** Wu Spy: "Put one of them into their graveyard": the owner's. */ "graveyard"; /** Into exile: "You may play the exiled card this turn" (Nahiri's Warcrafting, Florian). */ play?: "thisTurn"; /** With `play`: "Until end of turn, you may cast the exiled card without paying its mana cost" (Djeru and Hazoret): cast only, free (CR 118.9). */ playFree?: true; /** Into exile, then "You may cast the exiled card without paying its mana cost" (The Key to the Vault): once the rest are put away, as this resolves (CR 608.2g). */ castFree?: true; /** "keep": the rest stay on top, in order, for the next instruction (Expressive Iteration). */ rest: "graveyard" | "bottom" | "shuffle" | "hand" | "keep" | /** "And exile the rest" (Browse). */ "exile"; /** Takes only while this many cards are left for the rest (Expressive Iteration's exile, after one goes to the bottom). */ minRest?: number; /** "On the bottom of your library in a random order"; otherwise its owner orders them (CR 401.4). */ random?: true; reveal: boolean; /** Whose library, who looks and who gets the permanents: "its controller manifests dread" (default: you). */ who?: PlayerRef; /** Another player's library the cards come from: "manifest the top card of that player's library" (Orochi Soul-Reaver), `who` getting them. */ library?: PlayerRef; /** Not optional: "Put a creature card from among them onto the battlefield". */ required?: true; /** "Put a random creature card from among them" (Getaway Barrel): the card is chosen at random, not by a player. */ pickRandom?: true; /** "With three +1/+1 counters on it" (onto the battlefield). */ counters?: { counter: CounterKind; n: number }; /** "If that card has mana value 3 or less, it enters with three additional +1/+1 counters on it" (Turntimber Symbiosis, CR 614.1c). */ countersIfMv?: { max: number; counter: CounterKind; n: number }; /** "Onto the battlefield tapped". */ tapped?: true; /** "Tapped and attacking" (Winota, CR 508.4): a creature put onto the battlefield during combat attacks a player or planeswalker its controller chooses. */ attacking?: true; /** "A creature card and/or a land card" (Kiora): up to one for each, each card taken matching a different one. */ oneOfEach?: TargetSpec[]; /** "Each player looks at the top five cards of their library" (Explore the Vastlands): each one in turn, in their own library. */ each?: true; /** "Any number of nonland permanent cards with total mana value 4 or less" (Ao, the Dawn Sky): of all the cards taken. */ totalMv?: number; /** Birthing Ritual: "Then you may sacrifice a creature. If you do, you may put ...": after looking, a permanent like this may be sacrificed (ResolvingInfo.sacrificedThisWay); nothing is taken if none was. */ sacrificeFirst?: TargetSpec; /** "You lose 3 life for each card you put into your hand this way" follows (Search for Blex): for the prompt and bots only. */ lifeEach?: number; /** "Put all land cards revealed this way onto the battlefield tapped and put all creature cards revealed this way into your hand" (Zimone's Experiment): with `into` "hand", the land cards taken go onto the battlefield tapped instead. */ landsOnto?: true }
  /** Venture into the dungeon (CR 701.49a-c), or into Undercity (701.49d). */
  | { type: "venture"; undercity?: true }
  /** "Take an extra turn after this one", "target player takes two extra turns after this one" (CR 500.7). */
  /** `loseAtEnd`: "At the beginning of that turn's end step, you lose the game." */
  | { type: "extraTurn"; who: PlayerRef; /** "For each time vote, take an extra turn after this one" (Expropriate): counted as it resolves. */ n: Amount; loseAtEnd?: true; /** "Skip the untap step of that turn" (Savor the Moment). */ skipUntap?: true }
  /**
   * "You control target player during that player's next turn" (CR 723): `controller` makes all of `who`'s choices and
   * decisions during the next turn `who` actually takes (723.1, 723.1b). `extraTurnAfter`: "After that turn, that player
   * takes an extra turn" (Emrakul, the Promised End).
   */
  | { type: "controlPlayer"; who: PlayerRef; controller: PlayerRef; extraTurnAfter?: true }
  /** "Target player skips their next combat phase", "you skip your next two turns" (CR 614.10); `thisTurn`: only this turn. */
  | { type: "skip"; who: PlayerRef; skip: SkipWhat; /** "Skips their next X turns, where X is the number of coins that came up heads" (Ral Zarek, Guest Lecturer): counted as it resolves. */ n: Amount; thisTurn?: true; /** "Skips all combat phases of their next turn" (False Peace). */ wholeTurn?: true }
  /**
   * "After this phase, there is an additional combat phase [followed by an additional main phase]" (CR 500.8): `after`
   * "main" or "combat" for "after this main/combat phase", which adds nothing in another phase.
   */
  /**
   * "Then if it's the first end step of the turn, there is an additional end step after this step" (Y'shtola Rhul, CR
   * 500.8): only during the turn's first end step.
   */
  | { type: "addEndStep" }
  /** "That player gets an additional upkeep step after this step" (Paradox Haze, CR 500.8): only during an upkeep. */
  | { type: "addUpkeepStep" }
  | {
      type: "addPhases";
      /** "beginning": "there is an additional beginning phase after this phase" (Sphinx of the Second Sun): untap, upkeep and draw steps. */
      phases: ("combat" | "main" | "beginning")[];
      /** "secondMain": "after the second main phase this turn" (World at War): after the turn's second main phase, whenever it ends. */
      after?: "main" | "combat" | "secondMain";
      /** "At the beginning of that combat, untap all creatures you control" (Moraug): a delayed trigger for the added combat phase only (CR 603.7). */
      thatCombat?: { effects: Effect[]; text: string };
      /** "Only land creatures can attack during that combat phase" (Bumi, Unleashed): the added combat phase only (rulings). */
      onlyAttack?: TargetSpec;
      /**
       * Illusionist's Gambit: "Each of those creatures attacks that combat if able. They can't attack you or planeswalkers
       * you control that combat." Those are the creatures it removed from combat (ref "created"), in the added combat only.
       */
      thoseAttack?: true;
    }
  /** "You lose the game" (CR 104.3e). */
  | { type: "loseGame"; who: PlayerRef }
  /** "You win the game" (CR 104.2b): the game ends. */
  | { type: "winGame"; who: PlayerRef }
  /** Celestial Convergence: "the player with the highest life total wins the game. If two or more players are tied for highest life total, the game is a draw" (CR 104.2a, 104.4c). */
  | { type: "highestLifeWins" }
  /** "Exile ~" in an instant or sorcery: it goes to exile as it resolves instead of its owner's graveyard (CR 608.2n). */
  | { type: "exileSpell"; /** "Then put it onto the battlefield transformed under its owner's control with a finality counter on it" (Esper Origins): the exiled card, back face up (CR 712.14a); a card with no back face stays in exile (rulings). */ thenTransformed?: { counter?: CounterKind } }
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
  /** `reveal`: "reveal the top X cards of your library ... from among cards revealed this way" (Sunbird's Invocation): they stay in the library while revealed, cast from there. */
  /** `copyTimes` with `copies`: "Copy that card three times. You may cast the copies" (Mnemonic Deluge): that many copies of each. */
  | { type: "castFromAmong"; who: PlayerRef; n: Amount; reveal?: true; copyTimes?: number; /** With `reveal`: only looked at, not revealed (Planetarium of Wan Shi Tong). */ look?: true; /** "Do this only once each turn": casting one is doing it (CR 603.2h, rulings on Planetarium). */ once?: true; each?: true; untilNonland?: true; /** With `each` (Wand of Wonder): "each opponent exiles cards ... until they exile an instant or sorcery card, then shuffles the rest into their library": down to the first card matching this; the others shuffled back. */ untilHit?: TargetSpec; /** With `each`: each opponent, not each player. */ opponents?: true; copies?: true; fromYard?: { target?: number; filter?: TargetSpec; /** Arcane Bombardment: one card matching `filter`, at random, exiled with this source; then a copy of each card exiled with it (CR 607.2a). */ randomLinked?: true; /** Kefka, Dancing Mad: "exile a card at random from each opponent's graveyard". */ randomEachOpponent?: true; /** Wondrous Crucible: one card matching `filter`, at random, exiled; then a copy of only that card. */ random?: true }; /** Kefka: "Then each player who owns a spell you cast this way loses life equal to its mana value." */ ownersLoseLife?: true; maxMv?: Amount; /** Powerbalance: "if the two spells have the same mana value": only a card with exactly this mana value. */ exactMv?: Amount; totalMv?: Amount; untilMv?: number; untilHits?: { n: number; filter: TargetSpec }; hitToHand?: true; filter?: TargetSpec; max?: number; rest?: { dest: "graveyard" | "bottomRandom"; toHand?: boolean }; /** "You may play lands and cast spells from among ..." (Gix): lands are played too, on your turn with a land play left (rulings). */ lands?: true; /** Descendants' Path: "that shares a creature type with a creature you control", as it's cast. */ sharesTypeWithYours?: true; /** Plargg and Nassari: "An opponent chooses a nonland card exiled this way": an opponent you choose picks one, which can't be cast. */ opponentExcludes?: true; /** Silent-Blade Oni: "look at that player's hand. You may cast a spell from among those cards": the cards in `who`'s hand, cast from there. */ fromHand?: true; /** Invoke Calamity: "from your graveyard and/or hand": the cards in your hand and graveyard, cast from where they are. */ handAndYard?: true; /** Galvanoth: "if it's an instant or sorcery spell": `filter`'s types are the spell's as it's cast (an Adventure too, CR 715.3), not the card's. */ asSpell?: true; /** Dance with Calamity: "As many times as you choose, you may exile the top card of your library. If the total mana value of the cards exiled this way is N or less, ...": asked card by card, then only if the total is at most this. */ pushLuck?: number; /** "If those spells would be put into your graveyard, exile them instead" (Invoke Calamity): the spells cast this way. */ exileCast?: true; /** Yennett, Cryptic Sovereign: "If you don't cast it, draw a card": with none cast, you draw this many (the revealed card stays on top). */ noneCastDraw?: number }
  /**
   * "You gain shroud until end of turn", "You and permanents you control gain hexproof until end of turn" (the player's
   * half), "you gain protection from the chosen player": see Player.gained (CR 702.11d, 702.16b-e, 702.16k, 702.18d).
   */
  /**
   * "Each opponent who does can't attack you or permanents you control during their next turn" (The Second Doctor):
   * see Player.attackBansNextTurn.
   */
  | { type: "attackBanNextTurn"; who: PlayerRef }
  /** Wall of Dust: "that creature can't attack during its controller's next turn": that player's next turn, while it's the same object (CR 400.7). */
  | { type: "cantAttackNextTurn"; what: ObjRef }
  /**
   * "Up to one target creature an opponent controls attacks ~ during its controller's next turn if able" (Gideon,
   * Battle-Forged; `what`), "during target opponent's next turn, creatures that player controls attack ~ if able" (Gideon
   * Jura; `who`): a requirement to attack this planeswalker (CR 508.1d), GameState.attackWalkerNextTurn.
   */
  | { type: "attackWalkerNextTurn"; what?: ObjRef; who?: PlayerRef }
  | {
      type: "playerGains";
      keywords: string[];
      /** "Until your next turn" rather than until end of turn (Noble Heritage). */
      untilYourNextTurn?: true;
      /** "Until your next turn, your life total can't change" (Teferi's Protection): see Player.lifeCantChange. */
      lifeCantChange?: true;
      /** "Until end of turn, your life total can't change" (Flare of Fortitude): see Player.lifeCantChangeTurn. */
      lifeCantChangeThisTurn?: true;
      /** "Until end of turn, damage that would reduce your life total to less than 1 reduces it to 1 instead" (Angel's Grace): see Player.lifeFloorTurn. */
      lifeFloorThisTurn?: true;
      /** "Players gain hexproof until end of turn" (Everybody Lives!): each player in the game, not only its controller. */
      everyone?: true;
      /**
       * "Until your next turn, creatures can't attack you (or planeswalkers you control) unless their controller pays {2}
       * for each of those creatures" (Summon: Yojimbo, Forbidding Spirit): see Player.attackTaxUntil (CR 508.1g-h).
       */
      attackTax?: { n: number; planeswalkers?: true };
      /** "Until your next turn, creatures can't attack you" (Chronomantic Escape): see Player.unattackableUntil. */
      unattackable?: true;
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
  /** Odric, Master Tactician: "You choose which creatures block this combat and how those creatures block" (GameState.blocksChosenBy). */
  | { type: "chooseBlocks" }
  /**
   * "Each player secretly chooses a number 0 or greater, then all players reveal those numbers simultaneously"
   * (Wheel of Misfortune, Menacing Ogre): each one chooses without seeing the others' numbers, then what the card does
   * with them. `wheel`: damage equal to the highest number to each player who chose it, then each player who didn't
   * choose the lowest discards their hand and draws seven. `ogre`: each player with the highest number loses that much
   * life, and two +1/+1 counters on the source if its controller is one of them.
   */
  | { type: "secretNumbers"; then: "wheel" | "ogre" }
  /**
   * `choose`: "Starting with you, each player may choose an artifact or enchantment you don't control" (Druid of
   * Purification): not a vote (no extra votes, nobody chooses for another), each player in turn order picks one of
   * `among` or nothing, knowing the earlier picks (rulings); "each permanent chosen this way" is ObjRef "voted" `any`.
   */
  | {
      type: "vote";
      options?: string[];
      among?: TargetSpec;
      secret?: true;
      choose?: true;
      /** With `choose`: "Starting with the next opponent in turn order, each player chooses a creature you don't control" (Sadistic Shell Game): not "may", so one each while there's one to choose, starting after the controller. */
      mustChoose?: true;
      startNext?: true;
      /** "Each player may put two +1/+1 counters on a creature they control" (Agitator Ant): each one chooses among `among` as they see it (their own creatures); one with nothing to choose isn't asked. */
      theirs?: true;
      text: string;
    }
  /**
   * Gluntch, the Bestower: "Choose a player. ... Choose a second player to draw a card. Then choose a third player to
   * ...": the controller chooses one more player, any player but those already chosen this way (rulings), as it resolves
   * (CR 608.2d), into Chosen.players; with none left to choose (a two-player game's third), none is (rulings).
   * PlayerRef "chosenPlayer" `nth` is that player. `prompt`: what the player is chosen for.
   */
  | { type: "choosePlayer"; prompt: string }
  | { type: "choose"; choice: ChoiceKind; /** With "opponent": "Choose an opponent at random" (Vial Smasher the Fierce): one still in the game, as it resolves. */ random?: true; /** With "opponent": "Choose an opponent." a second time in the same ability (Sylvan Offering): chosen anew, "that player" after it being the new one. */ again?: true; /** "Each player chooses a creature type" (Patriarch's Bidding): every player in turn order, starting with the active player, into Chosen.types. */ each?: true; /** With "opponent": "a player with the most life or tied for most life" (The Black Gate), checked as it resolves; you can be one. "opponents": "an opponent with the most life among your opponents" (The Master, Gallifrey's End). */ mostLife?: true | "opponents"; except?: string; /** The choices the text lists (keywords). */ options?: string[]; /** Who chooses: the player told to add the mana; the controller if absent. */ who?: PlayerRef; /** "Choose a nonland card name": the cards whose names may be chosen (CR 201.4a). */ names?: TargetSpec; /** What the name is for, for bots. */ purpose?: NamePurpose; /** "Choose a number between 0 and 10" (Expel the Interlopers): any whole number in it, into Chosen.number. */ range?: { min: number; max: number } };

/** What a player chooses by name: a creature type (CR 205.3m) or a color (CR 105.1). */
/** "keyword": "gains your choice of flying, vigilance, deathtouch, or haste", from the options listed (CR 608.2d). */
/** "opponent": "Choose an opponent." as it resolves (CR 608.2d); "that player" is them (PlayerRef "chosenPlayer"). */
/** "cardType": "Choose artifact or enchantment." (Season of Gathering), from the card types listed (CR 205.2a). */
/** "cardName": "Choose a card name", "as ~ enters, choose a nonland card name" (CR 201.4): the name of a card (Chosen.name). */
export type ChoiceKind = "creatureType" | "color" | /** "The color or colors of your choice" (Prismatic Lace): one or more colors, chosen at once (CR 105.3). */ "colors" | "basicLandType" | "keyword" | "opponent" | "cardType" | "cardName" | "number" | /** "Choose odd or even" (Chosen.parity). */ "parity";

/**
 * What a chosen card name is for, so a bot can pick one: "deny", cards its opponents shouldn't use (Pithing Needle,
 * Meddling Mage, Runed Halo); "theirs", cards a player has hidden in their hand or library (Cabal Therapy, Memoricide);
 * "find", a card in its own library (Demonic Consultation); "guess", the top card of a library (Predict); "guessHand",
 * a card at random from its own hand (Cursed Scroll); "own", cards of its own it's going to cast (Cheering Fanatic).
 */
export type NamePurpose = "deny" | "theirs" | "find" | "guess" | "guessHand" | "own";

/** A choice made as a permanent enters that adds a +1/+1 counter or not (see CompiledCard.entersOptions). */
export type EntersOption = /** "As ~ enters, pay any amount of life" (CompiledCard.entersPayLife). */ "lifeAsEnters" | "riot" | /** "Enters with your choice of a reach counter or a vigilance counter on it" (CompiledCard.entersCounterChoice). */ "counterChoice" | "unleash" | "copy" | "exchangeText" | "controlOpponent" | "devour" | "amplify" | "tribute" | "tributePay" | "readAhead" | "player" | "anchor" | "protector" | "discardInstead" | "sacrificeInstead" | /** "As ~ enters, it becomes your choice of ..." (CompiledCard.entersForms). */ "form";

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
  | { kind: "kicked"; which?: number; /** As written, before compile() turns it into `which`. */ cost?: string; /** "If it was kicked twice" (Archangel of Wrath): at least this many kicker costs paid. */ times?: number }
  /** "You may discard a card. If you do, draw a card.": whether the last "you may" was done (CR 608.2c). */
  | { kind: "youDid" }
  /** "If this ability has been activated four or more times this turn" (Dragon Whelp): this activated ability, counted as it resolves (rulings). */
  | { kind: "activatedTimes"; n: number }
  /** "Exile up to one target creature card from a graveyard. If you exiled a card this way, ..." (Ardyn): target `index` is now in exile, moved there by this (CR 400.7). */
  | { kind: "targetExiled"; index: number }
  /** "If the player doesn't" after "target opponent may have you draw three cards" (Combustible Gearhulk): whether that player chose to (eachMay's choseThisWay). */
  | { kind: "theyChose"; not?: true }
  /**
   * The source is still on the battlefield as the same object (CR 400.7), with `yours` under your control: "Sacrifice ~.
   * When you do, ..." can be done (CR 701.21a).
   */
  | { kind: "selfHere"; yours?: true; /** "When they do" after "target opponent gains control of ~" (Yes Man): that target player controls it. */ controlledByTarget?: number; /** "If they do" after "that player gains control of ~" (Kain, Traitorous Dragoon): the trigger's player controls it. */ controlledByEventPlayer?: true }
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
  /** "Choose flying or indestructible at random" (Blitzwing, Adaptive Assailant): the first of two, with even chances, decided as the instruction is reached. */
  | { kind: "atRandom" }
  /** "If that permanent is destroyed this way" (Transforming Flourish): this spell's or ability's destroy instructions destroyed something. */
  /** `died`: "if that creature dies this way" (Saw in Half): one it destroyed was put into a graveyard (CR 700.4, rulings). */
  | { kind: "destroyedThisWay"; died?: true; /** "If a creature you controlled was destroyed this way" (Demonic Junker). */ you?: true; /** "If a permanent you controlled or a token was destroyed this way" (Break the Spell): either one. */ youOrToken?: true; /** "If an enchantment was destroyed this way" (Shredder's Technique): one of that card type, as it last existed. */ cardType?: string; /** "If a white creature dies this way" (Cinder Cloud): of that color as it last existed. */ color?: Color }
  /** "Sacrifice a creature. When you do, ..." (Tip the Scales): this ability's instructions sacrificed something. */
  /** `you`: "if you sacrificed a creature this way" after "each player sacrifices" (Rise of the Witch-king): you did. */
  | { kind: "sacrificedThisWay"; you?: true; /** "If the sacrificed permanent was a commander" (Tevesh Szat). */ commander?: true; /** "If you sacrifice an Island this way" (Serendib Djinn): one with this subtype, as it last existed (CR 608.2h). */ subtype?: string }
  /** "Destroy target creature. If another creature died this turn" (Chain Assassination): a creature died this turn other than target `index` dying to this. */
  | { kind: "anotherDied"; index: number }
  /** "If that spell targets a commander you control" (Bane's Contingency): target `index`, a spell, targets a permanent on the battlefield matching `filter` as this resolves. */
  | { kind: "targetSpellTargets"; index: number; filter: TargetSpec }
  /** "Exile it. If you do, ..." (Mazemind Tome): this ability's exile instructions exiled a permanent from the battlefield.
   * `cards`: "When ~ dies, exile it. When you do, ..." (Glissa's Retriever): they exiled a card from a graveyard instead. */
  | { kind: "exiledThisWay"; cards?: true }
  /** "If another Desert was returned this way" (Arid Archway): its "return a ... you control" pick returned one, as it last existed, other than its source. */
  | { kind: "bouncedThisWay"; subtype: string; another: true }
  /** "If you return four or more nontoken permanents you control this way" (Flood of Tears): this resolution's "return all ..." returned at least `n` of them, counting one a replacement sent elsewhere (rulings). */
  | { kind: "returnedYoursAtLeast"; n: number }
  /** "You may put a land card from among them onto the battlefield tapped. If you don't, ..." (Planar Genesis): its last dig took a card. */
  | { kind: "digTook" }
  /** "Search your library for a card, put it into your graveyard, then shuffle. If it's an instant or sorcery card, ..." (Oriq Loremage): the card its last search found is this. */
  | { kind: "searchFound"; filter: TargetSpec }
  /** "If excess damage was dealt this way" (Orbital Plunge): this spell's or ability's damage dealt some (Count excessThisWay). */
  | { kind: "excessDealt"; /** "To a creature this way" (Vikya): only excess dealt to a creature counts. */ creature?: true; /** "If the creature the opponent controls is dealt excess damage this way" after a fight (The Last Agni Kai): only that target's. */ target?: number }
  /**
   * A results table's row (CR 706.3a): "1—9 | ..." is "if the result was in this range". `event`: the result a "whenever
   * you roll" trigger is about ("If you rolled 6 or higher", Mr. House).
   */
  | { kind: "rollIn"; min?: number; max?: number; event?: true; /** "If any of those results was 10 or higher" (Farideh, Devil's Chosen): the highest die of the trigger's roll (TriggerEventInfo.rollMax). */ eventMax?: true; /** "If the result is greater than the damage dealt or the result is 12" (Sword of Hours): above the trigger's event amount, or at least `min`. */ aboveEvent?: true }
  /** "If none of those creatures attacked you" (Firemane Commando): the attack trigger's event counted none attacking its controller. */
  | { kind: "noneAttackedYou" }
  /** "If they didn't attack you that turn" (Faramir, Prince of Ithilien): the event player attacked you (not your planeswalkers or battles, rulings) with a creature this turn; `not`: didn't. */
  | { kind: "eventPlayerAttackedYou"; not?: true }
  /** "If an artifact card was discarded this way" (Reckless Handling): one of the cards this resolution discarded, by its card (CR 701.9). */
  | { kind: "discardedThisWayIs"; filter: TargetSpec }
  /** "If it's suspected, ...": the object, as the instruction is done (CR 701.60). */
  | { kind: "suspected"; what: ObjRef }
  /** "If the sacrificed creature was suspected" (Agency Coroner): the creature its sacrifice cost sacrificed, as it last
   * existed on the battlefield (CR 608.2h), where being suspected is a designation it had (CR 701.60). */
  | { kind: "sacrificedSuspected" }
  /** "If the sacrificed creature was legendary" (Nasty End): the same, legendary as it last existed (CR 608.2h). */
  | { kind: "sacrificedLegendary" }
  /** "If the sacrificed creature was a Hamster" (Minsc & Boo): one of its creature types as it last existed. */
  | { kind: "sacrificedSubtype"; subtype: string; /** "If an outlaw was sacrificed this way" (Boneyard Desecrator): any one of these too (CR 700.12). */ orSubtypes?: string[] }
  /** "If the sacrificed creature was red" (Lyzolda, the Blood Witch): one of its colors as it last existed (CR 608.2h). */
  | { kind: "sacrificedColor"; color: Color }
  /**
   * "If the discarded card wasn't a land card" (Grab the Prize), "was a creature card" (Moria Scavenger): the card a
   * discard cost discarded (StackItem.costDiscarded), as it is in the graveyard. Costs are paid after targets are chosen
   * (CR 601.2c, 601.2h), so no target depends on it.
   */
  | { kind: "discardedIs"; filter: TargetSpec }
  /** "{U}, Exile the top card of your library: If the exiled card is a snow land, ..." (Storm Elemental): the one card this activated ability's cost exiled (StackItem.costExiled), by its printed characteristics. */
  | { kind: "costExiledIs"; filter: TargetSpec }
  /** "If this spell was foretold" (CR 702.143c): it was a foretold card before it was cast, whatever it cost. */
  | { kind: "foretold" }
  /** "If ~ was bargained" (CR 702.166b). */
  | { kind: "bargained" }
  /** "If the modified creature was sacrificed" (Lethal Throwdown): its additional cost was paid the CompiledCard.costOr way `index` (CR 601.2b); a copy wasn't cast. */
  | { kind: "costOrPaid"; index: number }
  /** "If this spell was cast from a graveyard" (Sevinne's Reclamation): a copy wasn't cast (rulings, CR 707.10). */
  /** `exile`: "if ~ was cast from exile" (Delayed Blast Fireball) instead. A copy wasn't cast (CR 707.10). */
  /** `hand`: "if ~ was cast from your hand" (Transpose). */
  /** `notHand`: "if ~ was cast from anywhere other than your hand" (See the Truth). */
  | { kind: "castFromGraveyard"; exile?: true; hand?: true; notHand?: true }
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
  | { kind: "altPaid"; alt: "surge" | "spectacle" | "awaken" | "alternative" | "madness" | "prowl" | /** The Last Ronin's Technique (CR 702.190a). */ "sneak" | /** Sandman's Quicksand: cast using mayhem from the graveyard (CR 702.187b; GameObject.castVia). */ "mayhem" }
  /** "If you attacked this turn, ...": a fact about the game, checked as the spell or ability resolves (CR 608.2c). */
  | { kind: "state"; cond: StaticCondition; /** "If you control a white permanent other than that creature or ~" (Sorin, Ravenous Neonate): the condition's subject (`otherThanSubject`) is this object, not the trigger's. */ subject?: ObjRef }
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
   * Dead Ringers: "unless either one is a color the other isn't": targets `index` to `index + n - 1` have exactly the same
   * colors (all colorless counts), as they are now or, gone from the battlefield, as they last existed (CR 608.2b, 608.2h).
   */
  | { kind: "targetsSameColors"; index: number; n: number }
  /** "If another permanent with the same name is on the battlefield" (Winnow): as target `index`, checked as it resolves. */
  | { kind: "targetSharesName"; index: number }
  /** "Destroy target creature if no other creature has greater power" (Getaway Glamer): that creature as it is now, still a legal target, against every other creature on the battlefield. */
  | { kind: "targetGreatestPower"; index: number }
  /** "If a Dinosaur is dealt damage this way" (Marauding Raptor): a permanent this resolution dealt damage to, as it is now. */
  | { kind: "damagedThisWayIs"; filter: TargetSpec }
  /** "If a player is dealt damage this way, scry 1" (Play with Fire): damage this resolution dealt to a player. */
  | { kind: "playerDamagedThisWay" }
  /** "If that creature is a Bird, Frog, Otter, or Rat" after a flicker (Splash Portal): a permanent it returned, as it is now (rulings). */
  | { kind: "flickeredIs"; filter: TargetSpec }
  /** "If that land is a Plains" (Emeria Shepherd): the trigger's subject as it is now, or as it last existed (CR 608.2h). */
  | { kind: "subjectIs"; filter: TargetSpec }
  /** "If it's a Samurai card" (Oathkeeper, Takeno's Daisho): the card the trigger's subject became, by its printed characteristics (rulings). */
  | { kind: "subjectCardIs"; filter: TargetSpec }
  /** "If that spell is a Lesson" in a cast trigger (Toph, Hardheaded Teacher): the spell it's about, by its card's characteristics. */
  | { kind: "causeSpellIs"; filter: TargetSpec }
  /** "If it was attacking" (Zurgo Stormrender): the trigger's subject is attacking, or was as it last existed (CR 608.2h). */
  | { kind: "subjectWasAttacking" }
  /** Silumgar Scavenger: "if it exploited that creature": the creature a dies trigger is about was sacrificed for this source's exploit, this object (CR 702.110a, 400.7). */
  | { kind: "subjectExploitedBySelf" }
  /** Pulse of the Forge: "if that player or that planeswalker's controller has more life than you", as it resolves. */
  | { kind: "playerMoreLifeThanYou"; who: PlayerRef }
  /**
   * "If you controlled that permanent, draw a card" about target `index` (Geistwave, Kellan): you control it now, or did
   * as it last existed on the battlefield if this spell or ability moved it (CR 608.2h; rulings on Geistwave and Kellan).
   */
  | { kind: "targetWasYours"; index: number }
  /** "Target player gets two rad counters. If that player is you, ..." (The Ghoul, Gunslinger): target player `index` is the ability's controller (and still a legal target). */
  | { kind: "targetPlayerIsYou"; index: number }
  /** "Choose target opponent. If they lost life this turn, ..." (Thought-Stalker Warlock): target player `index` is legal and lost life this turn (not a net change, rulings). */
  | { kind: "targetPlayerLostLife"; index: number }
  /** "If that creature was cast for its warp cost" (Full Bore): target `index` is legal and is a permanent whose spell was cast for its warp cost (CR 702.185a). */
  | { kind: "targetWarped"; index: number }
  /**
   * "Exile target card from a graveyard. If it was a creature card, ..." (Scavenging Ooze): the target card `index`, by its
   * printed characteristics, which are the ones it had in the graveyard (CR 608.2h).
   */
  | { kind: "targetCardWas"; index: number; filter: TargetSpec }
  /** "Counter target spell unless its controller pays {4}. If they do, you incubate 2." (Assimilate Essence): it was paid. */
  | { kind: "unlessPaid" }
  /** Fold into Aether: "If that spell is countered this way, ...": the counter just before this one countered a spell (not one that can't be countered, rulings). */
  | { kind: "spellCountered" }
  /** "If it's a creature card" about the card "reveal the top card of your library" revealed, by its printed characteristics; `not`: "if it isn't". */
  | { kind: "revealedIs"; filter: TargetSpec; not?: true }
  /** "If it has the same mana value as the revealed card" (Counterbalance): the revealed card's (X as 0 off the stack, CR 202.3e) is `mv`. */
  | { kind: "revealedMv"; mv: AmountExpr }
  /** "Put a card exiled with ~ into its owner's graveyard. If it's a land card, ..." (Currency Converter): the card moved. */
  | { kind: "movedLinkedIs"; filter: TargetSpec }
  /** Kinship: the card "look at the top card of your library" found shares a creature type with this ability's source. */
  | { kind: "revealedSharesCreatureType" }
  /** "If a card named ~ was revealed this way" (Stomping Slabs): one of the cards a revealTop of several revealed is, by its printed characteristics. */
  | { kind: "revealedTopIs"; filter: TargetSpec }
  /** "If a card with the chosen name was milled this way" (Predict): any card the mill instruction before put there. */
  | { kind: "milledIs"; filter: TargetSpec }
  /** "If two cards that share all their card types were milled this way" (Demonic Covenant): the two cards the mill before put there have the same card types (rulings). */
  | { kind: "milledShareTypes" }
  /** "If you exiled a land card this way" after exiling the top cards to play (Bonehoard Dracosaur): one of them is. */
  | { kind: "impulsedIs"; filter: TargetSpec }
  /** "If you didn't create a token this way" (Springheart Nantuko): this resolution hasn't created any. */
  | { kind: "createdNone" }
  /** "If you put a Town card into your hand this way" (Town Greeter): a card the instruction before put into your hand from among the milled cards is one, still in the hand. */
  | { kind: "putIntoHandIs"; filter: TargetSpec; /** Cache Grab: "If you control a Squirrel or returned a Squirrel card to your hand this way": or this holds as it resolves. */ orState?: StaticCondition }
  /** "If you return a nonland card to your hand this way" (Vengeful Rebirth): a card this resolution returned to its owner's hand is one, still there. */
  | { kind: "returnedToHandIs"; filter: TargetSpec }
  /** "If you put a Cave onto the battlefield this way" (Spelunking): a permanent the instruction before put there matches, as it is now. */
  | { kind: "putThisWayIs"; filter: TargetSpec }
  /** "Target player exiles a card from their graveyard. If it's a creature card, ..." (Graveyard Shovel): a card the chooseFromGraveyard before moved, by its printed characteristics. */
  | { kind: "yardChosenIs"; filter: TargetSpec }
  /** Candles of Leng: "If it has the same name as a card in your graveyard": the card "reveal the top card" revealed, by name. */
  | { kind: "revealedNameInYard" }
  /**
   * "If death gets more votes" (CR 701.38): that choice got more votes than each other one in this ability's vote.
   * `orTie`: "If taxes gets more votes or the vote is tied": also when two or more choices tie for the most (rulings on
   * Coercive Portal).
   */
  | { kind: "voteWins"; option: string; orTie?: true }
  /** "If each opponent chose silence" (Prisoner's Dilemma): every one of them still in the game chose that word (Effect eachChooses). */
  | { kind: "allChose"; option: string };

/** Every effect, including the ones inside "you may" and "if", in order. */
export const allEffects = (effects: Effect[]): Effect[] =>
  effects.flatMap((e) => (e.type === "may" || e.type === "if" ? [e, ...allEffects(e.effects), ...allEffects(e.otherwise ?? [])] : e.type === "either" || e.type === "villainous" ? [e, ...e.options.flatMap(allEffects)] : e.type === "together" || e.type === "repeatMay" ? [e, ...allEffects(e.effects)] : [e]));

/** A sequence of effects with the targets they need, like a spell's text or one ability. */
export interface AbilityBody {
  targets: TargetSpec[];
  effects: Effect[];
  text: string;
  /** "This ability still resolves if its target becomes illegal" (Gilded Drake): it isn't removed by CR 608.2b. */
  resolvesAnyway?: true;
  /** Does nothing at all: a draft-matters ability with nothing noted in a draft (oracle/draft.ts), like Volatile Chimera's. */
  inert?: true;
  /** "This ability can't be copied" (Gogo, Master of Mimicry), "~ can't be copied" (See Double): an effect that would copy it makes no copy. */
  uncopyable?: true;
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
    both?: "teamwork" | "commander" | "kicked" | "control";
    /** "If you control a Wizard as you cast ~, you may choose two instead" (Flame of Anor): both "control", checked as it's cast. */
    bothIf?: StaticCondition;
    /** "If there are four or more card types among cards in your graveyard, choose both instead" (Prophetic Titan): both, not one or both. */
    bothExactly?: true;
    /** "If there are four or more card types among cards in your graveyard, choose one or more instead" (Let's Play a Game): one to all of them. */
    bothAny?: true;
    repeat?: true;
    pawprints?: number[];
    escalate?: { mana?: string; cost?: AdditionalCost; text: string };
    unchosen?: "ever" | "turn";
    random?: true;
    /** "You may choose two" (Shadrix Silverquill): no modes at all, or `min` to `max` of them. */
    optional?: true;
    /** "Each mode must target a different player" (Shadrix Silverquill): no target of one mode is a target of another. */
    distinctTargets?: true;
    /** "Choose up to X, where X is the number of Lesson cards in your graveyard" (Bumi, King of Three Trials): `max` is the most there are modes; this caps it, counted as a triggered ability is put on the stack (CR 603.3c; PendingTrigger.maxModes). */
    maxCount?: AmountExpr;
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
  | "selfIsDealtNoncombatDamage" // "Whenever ~ is dealt noncombat damage" (Smaug the Impenetrable): the same, for damage other than combat damage
  | "selfIsDealtCombatDamage" // "Whenever ~ is dealt combat damage" (Wall of Essence): the same, for combat damage only
  /** "Whenever a Dragon you control is dealt damage" (Wrathful Red Dragon): that permanent is the subject; see TriggeredAbility.dealtFilter. */
  | "permanentIsDealtDamage"
  | "selfDealtDamageBySource" // "Whenever a source deals damage to ~": once for each source dealing it damage; "that player" is that source's controller
  | "creatureDealsCombatDamageToSelf" // "Whenever a creature deals combat damage to ~" (Vraska the Unseen): once for each creature dealing it combat damage, which "that creature" means
  | "permanentBecomesTapped" // "Whenever a creature an opponent controls becomes tapped": see TriggeredAbility.tappedFilter
  | "selfBecomesUntapped" // "Whenever ~ becomes untapped" (inspired): it changed from tapped to untapped (CR 701.26b)
  | "permanentBecomesUntapped" // "Whenever a permanent you control becomes untapped": see TriggeredAbility.tappedFilter
  | "permanentTurnedFaceUp" // "Whenever a permanent is turned face up" (Aven Farseer): see TriggeredAbility.tappedFilter
  | "permanentTransformsInto" // "Whenever a permanent you control transforms into a Phyrexian" (Norn's Inquisitor): see TriggeredAbility.tappedFilter
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
  | "selfBecomesRenowned"
  | "creatureYouControlBecomesRenowned"
  /** "Whenever ~ evolves" (Watchful Radstag): its evolve ability resolved and put one or more +1/+1 counters on it (CR 702.100d). */
  | "selfEvolves"
  /** "Whenever ~ phases in" (Warping Wurm), "Whenever ~ phases out" (Teferi's Imp, looking back in time, CR 603.10b): directly or indirectly (CR 702.26g). */
  | "selfPhasesIn"
  | "selfPhasesOut"
  /** "Whenever this Vehicle becomes crewed": whenever a crew ability of it resolves (CR 702.122e). */
  | "selfBecomesCrewed"
  /** "Whenever ~ crews a Vehicle" (CR 702.122d): it was tapped to pay a Vehicle's crew cost; the trigger's subject is that Vehicle. */
  | "selfCrewsVehicle"
  | "selfMutates"
  /** "Whenever a creature you control mutates" (Essence Symbiote): one matching `tappedFilter`, the subject (CR 702.140d). */
  | "permanentMutates"
  /** "Whenever a creature you control explores" (Wildgrowth Walker): once the exploring is done (CR 701.44b), the explorer the subject. */
  | "creatureYouControlExplores"
  /** "Whenever a creature you control connives" (Iron Monger, Ultron): once the conniving is done (CR 701.50f), the conniver the subject. */
  | "creatureYouControlConnives"
  /** "When this Class becomes level 2" (CR 716.2a): TriggeredAbility.level. */
  | "selfBecomesLevel"
  /** Exert's "When you do" (CR 701.43d): this creature was exerted as it attacked. */
  | "selfExerted"
  /** "Whenever you exert a creature": the exerted creature is the subject. */
  | "youExert"
  /** "Whenever you get one or more {E}" (Aether Revolt): energy counters put on you, "that much" their number (CR 107.14). */
  | "youGetEnergy"
  | "permanentCountersPut"
  /** "Whenever a creature you control enters", "another Ally", "~ or another artifact": see TriggeredAbility.enters. */
  | "permanentEnters"
  /** "Whenever another creature dies", "a creature you control", "equipped creature": see TriggeredAbility.dies. */
  | "permanentDies"
  /** "Whenever a spell or ability an opponent controls destroys a noncreature permanent you control" (Karmic Justice): see TriggeredAbility.destroyed. */
  | "permanentDestroyed"
  /** "Whenever ~ becomes unattached from a permanent" (it leaving too, CR 603.10a): the subject is that permanent. */
  | "selfBecomesUnattached"
  /** "Whenever an Aura becomes attached to ~" (Brood Keeper): one entering attached to it or moved onto it from something else (rulings); the subject is the Aura. */
  | "auraAttachedToSelf"
  /** "Whenever an Aura you control becomes attached to a creature you control" (Siona, Captain of the Pyleas): entering attached too (rulings). */
  | "auraAttachedToYours"
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
  /** "Whenever a source you control deals (noncombat) damage to an opponent" (Niv-Mizzet, Visionary): once for each source and player (CR 603.2c). */
  | "sourceYouControlDamagesOpponent"
  /** "Whenever another source you control deals exactly 1 damage to a permanent or player" (Ghyrson Starn): once for each source and recipient, the permanent dealt it the subject, the player the event player. */
  | "sourceYouControlDealsDamage"
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
  | "radiation" // rad counters' inherent triggered ability (CR 728.1)
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
  | "selfTransforms" // "When equipped creature transforms" (Neglected Heirloom): the creature it's attached to transformed (CR 701.27)
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
   * "Whenever a creature blocks a black or red creature" (Righteous Indignation): once for each creature it blocks that
   * fits `blockFilter` (CR 509.3c), the blocker its subject (`subjectFilter`).
   */
  | "creatureBlocksCreature"
  /**
   * "Whenever a creature deals damage to you" (Dread), "Whenever a source an opponent controls deals damage to you" (Michiko
   * Konda): once for each source dealing damage to this permanent's controller (CR 603.2c), see `damagesYou`.
   */
  | "dealsDamageToYou"
  /** "Whenever ~ attacks and isn't blocked": after blockers are declared, if no creature blocks it (rulings). */
  | "selfAttacksUnblocked"
  /** Senu: "When a legendary creature you control attacks and isn't blocked" (with `attacker`), once for each one, as blockers are declared. */
  | "creatureYouControlAttacksUnblocked"
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
  | "youUntapInUntapStep" // "Whenever you untap one or more permanents during your untap step": "that many" is how many (CR 502.3)
  | "opponentGainsLife" // "Whenever an opponent gains life": "that player", "that much" (CR 119.9)
  | "playerGainsLife" // False Cure: "whenever a player gains life", any player's life gain event (CR 119.9, 119.10)
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
  /** "Whenever another player loses the game" (Sengir, the Dark Baron): after they've left (CR 800.4a), "that player" them. */
  | "anotherPlayerLosesGame"
  /** "When enchanted player loses the game" (Curse of Vengeance). */
  | "enchantedPlayerLosesGame"
  | "playerLosesLife" // "Whenever a player loses life" (The Master of Lake-town): the same for any player, you included
  | "opponentsLoseOneLife" // "Whenever one or more opponents each lose exactly 1 life" (Ob Nixilis, Captive Kingpin): an opponentsLoseLife event in which one of them lost exactly 1 in all
  | "opponentsLoseLife" // "Whenever one or more opponents lose life" (Emet-Selch): once for life lost at the same time
  | "youCreateToken" // "Whenever you create a token": once for each token you create (CR 111.2), whoever ends up controlling it
  /**
   * "Whenever you're dealt damage", "whenever an opponent is dealt damage", "whenever enchanted player is dealt damage": once
   * for all the damage dealt to that player at the same time (rulings on Grievous Wound); the event amount is that damage.
   */
  | "youAreDealtDamage"
  | "youAreDealtCombatDamage"
  /** "Whenever damage that would be dealt to you is prevented" (Selfless Squire): "that many" is the damage prevented. */
  | "youDamagePrevented"
  | "opponentIsDealtDamage"
  /** "Whenever an opponent is dealt 3 or more damage by a single source" (Pain Magnification): once for each source and opponent, `minDamage` at once (rulings). */
  | "opponentDealtDamageBySource"
  /** "Whenever an opponent is dealt noncombat damage" (Chandra's Spitfire). */
  | "opponentIsDealtNoncombatDamage"
  | "enchantedPlayerDealtDamage"
  /** Sower of Discord: "Whenever damage is dealt to one of the chosen players" (Chosen.players, two): the event's player is the other one. */
  | "chosenPlayerDealtDamage"
  /** "Whenever you draw a card", "whenever an opponent draws a card", "your second card each turn": see TriggeredAbility.draws. */
  | "playerDraws"
  /** "Whenever an opponent activates an ability that isn't a mana ability" (see TriggeredAbility.activates). */
  | "abilityActivated"
  /** "Whenever a creature you control attacking causes a triggered ability of that creature to trigger" (Firebender Ascension). */
  | "attackCausesTrigger"
  /** "Whenever a creature entering under an opponent's control causes a triggered ability of that creature to trigger" (Aboleth Spawn). */
  | "opponentEntersCausesTrigger"
  /** "Whenever you sacrifice another permanent", "a Food", "~ or another creature": see TriggeredAbility.sacrifices. */
  | "youSacrifice"
  /** "Whenever you expend 4" (CR 700.14): see TriggeredAbility.expend. */
  | "youExpend"
  /** "Whenever you collect evidence" (CR 701.59a): for any reason, also collecting evidence 0 (rulings). */
  | "youCollectEvidence"
  /** "Whenever you investigate" (CR 701.16a), once for each time; `firstEachTurn`: only your first time each turn. */
  | "youInvestigate"
  /** "Whenever you give a gift" (Jolly Gerbils): a spell of yours whose gift was promised, or a gift trigger of yours, resolved (CR 702.174c). */
  | "youGiveGift"
  /** "Whenever you foretell a card" (Dream Devourer): exiling one from your hand with foretell, not casting it later (rulings, CR 702.143a). */
  | "youForetell"
  | "youFinalChapterResolves" // Narci, Fable Singer: the final chapter ability of a Saga you control finished resolving; the event's amount is the Saga's mana value
  /** "Whenever you scry", "whenever you surveil", "whenever you scry or surveil": after it's done (CR 701.22d, 701.25d). */
  | "youScry"
  /** "Whenever you clash" (Entangling Trap): each time you clash, whoever started it (CR 701.30, rulings). */
  | "youClash"
  /** "Whenever you clash and win", "Whenever you win a clash" (Sylvan Echoes, Marvo): a clash you won (CR 701.30d). */
  | "youWinClash"
  | "youSurveil"
  | "youScryOrSurveil"
  /** "Whenever you proliferate" (CR 701.27): once for each proliferate action, even with nothing chosen (rulings). */
  | "youProliferate"
  /** "Whenever you become the monarch": only when you weren't already (CR 725.3; rulings on Custodi Lich). */
  | "youBecomeMonarch"
  /** "Whenever an opponent becomes the monarch" (Knights of the Black Rose): "that player" is them. */
  | "opponentBecomesMonarch"
  /** "Whenever day becomes night or night becomes day" (CR 731.1): not the first time it becomes either (rulings). */
  | "dayNightChanges"
  /** "Whenever a spell or ability you control counters a spell" (Baral): once for each spell countered (CR 701.6a). */
  | "youCounterSpell"
  /** "Whenever a spell you've cast is countered" (Multani's Presence): a spell you cast, not a copy (CR 707.10), countered by anything. */
  | "yourSpellCountered"
  /** "Whenever you complete a dungeon" (CR 309.7). */
  | "youCompleteDungeon"
  | "youFullyUnlockRoom" // "Whenever you fully unlock a Room" (CR 709.5i): one of your Rooms gets its second unlocked designation
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
  /** Tenuous Truce: you attack enchanted player or their planeswalkers, or they attack you or yours (once per declaration). */
  | "attackBetweenYouAndEnchanted"
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
   * "Whenever a player attacks one of your opponents" (Breena): once for each player attacking each of your opponents with
   * one or more creatures as attackers are declared, not their planeswalkers or battles (CR 508.3e). The event player is
   * that opponent; "that attacking player" is TriggerEventInfo.attacker.
   */
  | "playerAttacksYourOpponent"
  /**
   * "Whenever one or more creatures an opponent controls attack you and aren't blocked" (Coveted Jewel): once blockers are
   * declared, for each opponent with an unblocked creature attacking you (not your planeswalkers, rulings); "that player"
   * is that opponent.
   */
  | "opponentCreaturesUnblocked"
  /**
   * "Whenever one or more creatures you control fight or become blocked" (Neyith of the Dire Hunt): once for each fight
   * (CR 701.14) one of yours is in, and once when blockers are declared if one or more of yours became blocked (rulings).
   */
  | "yourCreaturesFightOrBlocked"
  /** "When you cycle ~" (CR 702.29c): it triggers from whatever zone the card went to, under its owner's control. */
  | "selfCycled"
  /** "When you discard ~" (Titanbones, Towering Heart): the card's ability, wherever it went (as with cycling). */
  | "selfDiscarded"
  /** "When ~ becomes plotted" (Longhorn Sharpshooter, Aloe Alchemist): it triggers from exile, under its owner's control (CR 702.170a, 702.170c). */
  | "selfPlotted"
  /**
   * "When ~ is put into a graveyard from anywhere" (Serra Avatar): it triggers from the graveyard, under its owner's control
   * (CR 603.3a), never as a leaves-the-battlefield ability (CR 603.6c).
   */
  | "selfToGraveyardAnywhere"
  /** "When ~ is put into your hand from your graveyard" (Golgari Brownscale): it triggers from the hand, for any reason it got there (rulings). */
  | "selfToHandFromGraveyard"
  /** "When ~ is put into your graveyard from your library" (Narcomoeba): the same, only from its owner's library. */
  | "selfToGraveyardFromLibrary"
  /** Haunt on an instant or sorcery (CR 702.55a): "When this spell is put into a graveyard during its resolution". */
  | "selfResolvedToGraveyard"
  /**
   * "When the creature ~ haunts dies" (CR 702.55b-c): it triggers from exile, where the haunting card is, under its
   * owner's control (CR 108.4a, 113.8).
   */
  | "hauntedDies"
  | "selfTargetedByYourSpell" // heroic: "Whenever you cast a spell that targets ~"
  /** "Whenever you pay ~'s cumulative upkeep" (Hibernation's End, CR 702.24a). */
  | "selfCumulativeUpkeepPaid"
  | "selfLastTimeCounterRemoved" // vanishing: "When the last time counter is removed from ~" (CR 702.63a)
  /** "When ~ exploits a creature" (CR 702.110b); the exploited creature is the subject. */
  | "selfExploits"
  /** "Whenever a creature you control exploits a nontoken creature": see TriggeredAbility.subjectFilter. */
  | "creatureYouControlExploits"
  /** "Whenever a creature you control deals combat damage to a player": see TriggeredAbility.dealer; the creature is the subject. */
  | "creatureYouControlDealsCombatDamageToPlayer"
  /** "Whenever a creature you control deals combat damage" (Quilled Greatwurm): to anything, once per combat damage step, "that many" its total (CR 510.2). */
  | "creatureYouControlDealsCombatDamage"
  /** "Whenever a Sliver deals combat damage to a creature" (Toxin Sliver): anyone's (TriggeredAbility.dealer), once for each creature dealt it; that creature is the subject. */
  | "creatureDealsCombatDamageToCreature"
  /**
   * "Whenever a creature you control with deathtouch deals damage to a planeswalker" (Hooded Blightfang), "... to a player
   * or planeswalker" (Vraska, Swarm's Eminence), "Whenever ~ deals damage to a planeswalker": once for each recipient;
   * see TriggeredAbility.damageTo.
   */
  | "yourCreatureDealsDamage"
  /** "Whenever one or more creatures you control attack" / "Whenever you attack": once per declaration, see TriggeredAbility.group. */
  | "creaturesYouControlAttack"
  /** "Whenever one or more creatures you control deal combat damage to a player": once per player dealt damage. */
  | "creaturesYouControlDealCombatDamageToPlayer"
  /** "Whenever one or more Pirates you control deal damage to your opponents" (Malcolm, Keen-Eyed Navigator): see `damageGroup`. */
  | "groupDealsDamageToPlayers"
  /** "Whenever one or more creatures deal combat damage to you" (Witch-king of Angmar). */
  | "creaturesDealCombatDamageToYou"
  /** "Whenever combat damage is dealt to you or a planeswalker you control" (Vengeful Pharaoh): once for you and once for each planeswalker (rulings). */
  | "combatDamageToYouOrYourPlaneswalker"
  /** "Whenever a source an opponent controls deals damage to you or a permanent you control" (Elesh Norn): once for each source and each of them dealt damage (rulings); the source's controller is "that player". */
  | "opponentSourceDamagesYouOrYours"
  /** "Whenever one or more creatures an opponent controls deal combat damage to you" (Norn's Decree): once for each such opponent, who is "that opponent". */
  | "opponentCreaturesDealCombatDamageToYou"
  /** "Whenever one or more creatures an opponent controls deal combat damage to one or more of your opponents" (Nelly Borca): once for each such opponent in a combat damage step, who is "the controller of those creatures". */
  | "opponentCreaturesDamageYourOpponents"
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
/** `endOfCombat`: "this combat" (Stensian Sanguinist), until this combat's end of combat step ends (CR 511.3). */
export type TriggerDuration = "endOfTurn" | "yourNextTurn" | "endOfYourNextTurn" | "endOfCombat";

export interface TriggeredAbility {
  /** Druid of Horns: "Whenever you cast an Aura spell that targets ~": heroic for spells like this only. */
  heroicSpell?: TargetSpec;
  event: TriggerEvent;
  body: AbilityBody;
  /** Soul Scourge: the player this enters ability targets is "that player" of its leaves ability, even if it's still on the stack or never resolves (rulings on Laquatus's Champion). */
  linksTarget?: true;
  /** "Where X is the number of nonland cards milled this way" (The Wise Mothman): X is the event's amount, known as it triggers, so it can count targets ("up to X target creatures"). */
  eventX?: true;
  /** For "permanentIsDealtDamage": what has to be dealt damage. */
  dealtFilter?: TargetSpec;
  /** For "opponentLosesLife": "for the first time during each of their turns" (Valgavoth): their first life loss this turn, on their turn.
   * For "youGainLife": "for the first time during each of your turns" (Cat Collector): your first life gain this turn, on your turn. */
  firstOnTheirTurn?: true;
  /** For "youGainLife" and "youLoseLife": "for the first time each turn" (Vengeful Warchief): your first such event this turn, anyone's turn.
   * For "selfBecomesCrewed": "becomes crewed for the first time each turn" (Mighty Servant of Leuk-o).
   * For "selfBecomesTapped": "becomes tapped for the first time during each of your turns" (Tale of Katara and Toph), with activeIf yourTurn. */
  firstEachTurn?: true;
  /** For "selfBecomesCrewed": "if it was crewed by exactly two creatures" (an intervening if about the crewing, CR 603.4). */
  crewedBy?: number;
  /** For "youGainLife": "Whenever you gain or lose life during your turn" (Moonstone Harbinger): a life loss too, and only on your turn. */
  orLoseLife?: true;
  /** For "youGainLife" and "youLoseLife": "Whenever you gain life during your turn" (Vampire Scrivener): only while you're the active player. */
  onYourTurn?: true;
  /** "This ability triggers only once each turn": see GameObject.triggeredThisTurn. */
  oncePerTurn?: boolean;
  /** An ability an effect gave it: its index among the object's granted abilities (cards.ts withGranted). */
  grant?: number;
  /** Eminence: it also works while ~ is a commander in the command zone (CR 903.3, 113.6). */
  eminence?: true;
  /** For "selfBecomesLevel": the level. */
  level?: number;
  /**
   * For "selfBecomesTarget" / "permanentBecomesTarget": `spell`, "of a spell" (not an ability); `by`, "a spell or ability
   * you control / an opponent controls"; `first`, "for the first time each turn" (counting only those `by` names, as valiant does).
   */
  targeted?: { spell?: true; /** "Of an instant or sorcery spell" (Silverfur Partisan): a spell with one of these card types. */ spellTypes?: string[]; /** "Of an Aura spell" (Fugitive Druid): a spell with one of these subtypes. */ spellSubtypes?: string[]; by?: "you" | "opponent"; first?: true; /** "Another permanent you control". */ other?: boolean; /** "Whenever you or a permanent you control becomes the target ..." (Unsettled Mariner): this ability's controller as a target too, once for each spell or ability (rulings). */ orYou?: true; /** With `orYou`: "Whenever you become the target ..." (Amulet of Safekeeping): you only, no permanent. */ onlyYou?: true; /** With `orYou`: "Whenever you and/or at least one permanent you control becomes the target ..." (Leyline of Combustion): once for each spell or ability that targets any of them, however many (rulings). */ once?: true; /** "Whenever a creature you control or a creature spell you control becomes the target ..." (Surrak, Elusive Hunter): a spell of yours this matches (TargetSpec kind "spell") too, once for each spell or ability. */ orSpell?: TargetSpec };
  /**
   * For "tappedForMana": who taps it (`by`, relative to this ability's controller; "that player") and which permanent
   * (`filter`, the subject: "that land"); without a filter, ~ itself.
   */
  manaTap?: { by: "you" | "opponent" | "any"; filter?: TargetSpec };
  /**
   * For "permanentBecomesTapped", "permanentBecomesUntapped", "permanentTurnedFaceUp" and "permanentTransformsInto": which permanent ("a Dwarf you control"); it's the subject
   * ("put a wind counter on it").
   */
  tappedFilter?: TargetSpec;
  /** "Whenever you turn a permanent face up" (Growing Dread): with "permanentTurnedFaceUp", only when this ability's controller turned it. */
  turnedByYou?: true;
  /** "Whenever you create a Blood token" (Voldaren Bloodcaster): event "youCreateToken" for a token matching this only. */
  createdFilter?: TargetSpec;
  /**
   * "If it isn't being declared as an attacker" (Verity Circle): not when it's tapped as it's declared as an attacker
   * (CR 508.1f); tapped any other way, an attacking one too (rulings).
   */
  notDeclaringAttack?: true;
  /** For "selfCountersPut" / "permanentCountersPut": that kind of counter ("+1/+1 counters"); unset = any counters. */
  countersKind?: string;
  /** For "selfCountersPut" / "permanentCountersPut": "whenever you put one or more counters on ...", only counters this ability's controller puts. */
  countersByYou?: true;
  /** For "permanentCountersPut": "on a permanent or player" (All Will Be One), counters put on a player too. */
  countersOrPlayer?: true;
  /** For "selfCountersPut": "when the twelfth hour counter is put on ~", only when the count goes from below this to at least it. */
  countersReach?: number;
  /** "Whenever one or more counters are put on ~ for the first time each turn" (Danny Pink): the first time this turn, ability or not. */
  countersFirstTime?: true;
  /** For "selfCountersPut": "whenever a +1/+1 counter is put on ~" (Fathom Mage), once for each counter. */
  countersEach?: true;
  /**
   * "Whenever you cast a multicolored spell, you may return ~ from your graveyard to your hand": an ability whose
   * effect moves the card out of a zone works only in that zone (CR 113.6m), and its owner controls it there.
   * "If this card is exiled" (Senu): an ability of the face-up card in exile (CR 113.6k).
   */
  zone?: "graveyard" | "exile";
  /** For "state": the game state that triggers it, checked whenever state-based actions are (CR 603.8). */
  state?: StaticCondition;
  /** For "castSpell": who casts it, and what kind of spell ("noncreature spell", "instant or sorcery spell"). */
  /** `orCopy`: magecraft's "whenever you cast or copy" also triggers on a copy put on the stack. */
  /** `nth`: "whenever you cast your second spell each turn", counting the spells that player cast this turn (copies aren't cast). */
  /** `enchanted`: the player this Aura is attached to ("Whenever enchanted player casts a spell"). */
  cast?: { by: "you" | "opponent" | "any" | "enchanted" | "chosen"; spell: TargetSpec; orCopy?: boolean; /** With `orCopy`: "Whenever you copy an instant spell" (Kalamax, the Stormsire): only a copy. */ onlyCopy?: true; /** Vesuvan Duplimancy: with `targetsOnly`, that one permanent is the trigger's subject ("that artifact or creature"), as the spell was cast. */ subjectTarget?: true; /** "That targets only ~" (Zada), "... only a single Golem" (Precursor Golem): every target it has is one object, ~ or one matching this (rulings: several targets all naming it count). */ targetsOnly?: "self" | TargetSpec; nth?: number; /** "A spell other than your first spell each turn" (Arcbound Tracker): its caster's second or later spell this turn. */ notFirst?: true; /** `nth` counts only its caster's spells this turn that match `spell` ("their first noncreature spell each turn"). */ nthOfKind?: true; /** Alania: "if it's the first instant spell, the first sorcery spell, or the first Otter spell other than ~ you've cast this turn": the first of any of these kinds (`notSelfName`: not counting spells with this permanent's name). */ firstOfKinds?: { spec: TargetSpec; notSelfName?: true }[]; /** "If mana from a Treasure was spent to cast it" (CR 106.3, 603.4). */ treasure?: true; /** "If at least four mana was spent to cast it", "if no mana was spent to cast it" (CR 603.4). */ spent?: SpentReq; /** "If the amount of mana spent to cast it was less than its mana value" (Ancient Cellarspawn). */ spentLessThanMv?: true; /** Vazi: "casts a spell or activates an ability", any ability (mana abilities too), with `treasure`. */ orActivates?: true; /** "During each opponent's turn" (Wavebreak Hippocamp): not in its caster's own turn. */ opponentsTurn?: true; /** "Their second spell during their turn" (The Council of Four): only while the caster is the active player. */ ownTurn?: true; /** With `ownTurn`, "during your main phase" (Dovin's Acuity): in a main phase of that turn (CR 505.1). */ mainPhase?: true; /** "Whenever an opponent casts a spell during your turn" (Voice of Resurgence): only while this ability's controller is the active player. */ yourTurn?: true; /** "A kicked spell" (Lullmage's Familiar): its kicker cost was paid (CR 702.33d). */ kicked?: true; /** "While ~ is attacking" (Fire Lord Azula): only while this permanent is attacking. */ selfAttacking?: true; /** "A spell that targets a creature you control", "... that targets an opponent or a creature an opponent controls": one of its targets as it was cast is one of these (rulings: it triggers once however many do). "You" and "you control" are this ability's controller. */ targets?: (TargetSpec | "you")[]; /** "From exile", "from anywhere other than your hand", "from your graveyard" (its caster's), "from a graveyard": the zone it was cast from (CR 601.2a). */ from?: "hand" | "notHand" | "exile" | "graveyard" | "ownGraveyard" | "ownLibrary"; /** "A spell that shares a creature type with ~" (Folk Hero). */ sharesTypeWithSelf?: true; /** Volo, Guide to Monsters: "a creature spell that doesn't share a creature type with a creature you control or a creature card in your graveyard". */ sharesNoTypeWithYours?: true; /** "A spell they don't own" (Gonti, Night Minister): its owner isn't its caster. */ notOwned?: true; /** Dragonlord Kolaghan: "a ... spell with the same name as a card in their graveyard", as it's cast (after its costs: delve can exile them, rulings). */ nameInCasterYard?: true; /** "A creature spell that has an Adventure" (Garenbrig Squire): an adventurer card (CR 715.2). */ adventure?: true; /** "A spell that has convoke", "a creature spell with flying". */ keyword?: string; /** "A spell with {X} in its mana cost" (Zaxara, Unbound Flourishing). */ xInCost?: true; /** "A noncreature spell with one or more blue mana symbols in its mana cost" (Namor the Sub-Mariner): hybrid and Phyrexian symbols of the color count. */ manaSymbol?: Color; /** "Using mana produced by Tecutlan": some of the mana spent to cast it came from this permanent (CR 601.2h). */ manaFromSelf?: true; /** "Whenever you play a land or cast a spell": playing a land that matches this (from `from`, if set) triggers it too. */ orPlaysLand?: TargetSpec; /** Faldorn: "or a land you control enters from exile" triggers it too (CR 603.6a). */ orLandEntersFromExile?: true; /**
   * "If it shares a card type with the exiled card" (Cemetery Protector): the spell or land played shares one with a card
   * this permanent's linked ability exiled (CR 607.2a), an intervening "if" checked again as it resolves (CR 603.4).
   */ sharesTypeWithLinked?: true };
  /** An intervening "if" (CR 603.4): "When ~ enters, if you attacked this turn, ...". Checked as it triggers and as it resolves. */
  ifCond?: StaticCondition;
  /**
   * For "permanentDealtExcess" (CR 120.10): which permanents ("a creature or planeswalker an opponent controls", the
   * subject, "that excess damage" its event's amount), `noncombat` for "excess noncombat damage", `oneOrMore` for "one or
   * more creatures ... are dealt" (once for each damage event).
   */
  excess?: { filter: TargetSpec; noncombat?: true; oneOrMore?: true };
  /** For "spellYouControlDealsDamage": what spell, and dealt to an opponent (or a battle too, `orBattle`). */
  spellDamage?: {
    filter: TargetSpec;
    orBattle?: true;
    /** "deals damage to a player" (Syr Carah): any player, you too, not only an opponent. */
    anyPlayer?: true;
    /** "Whenever ~ or an instant or sorcery spell you control deals damage" (Syr Carah): ~ dealing damage to a player too. */
    orSelf?: true;
  };
  /**
   * For "youRollDie": the die's result has to be at least `min` ("a 4 or higher"), or its natural result (CR 706.2) has
   * to be `natural` ("a natural 20"), or the die's highest one (`natural: "max"`).
   */
  rolls?: { min?: number; natural?: number | "max" };
  /** For "playerDraws": who draws, and for "your second card each turn", which card of the turn it has to be. */
  /** `notFirstInDrawStep`: "except the first one they draw in each of their draw steps" (Orcish Bowmasters). */
  draws?: { by: "you" | "opponent" | "any" | "enchanted"; nth?: number; notFirstInDrawStep?: true; /** "During their turn": only while the player who draws is the active player. */ ownTurn?: true; /** Keranos, God of Storms: "Reveal the first card you draw on each of your turns. Whenever you reveal a land card this way, ...": only when the card drawn is (not) a land, revealed as it's drawn. */ revealed?: "land" | "nonland" };
  /** Wedding Ring: "an opponent who controls an artifact named ~ ... during their turn": what the event's player must be. */
  eventPlayerIf?: { controlsArtifactNamedSelf?: true; theirTurn?: true };
  /**
   * For "abilityActivated": who activated an ability that isn't a mana ability (CR 602, 605.1a), and `of`: what its
   * source had to be as it was activated, a permanent on the battlefield ("an ability of an artifact, creature, or land").
   * "That player" is who activated it.
   */
  activates?: { by: "opponent" | "any" | "you"; of?: TargetSpec; /** "An ability with {X} in its activation cost": the mana symbol {X}, not another X (rulings on Unbound Flourishing). */ xCost?: true; /** "Whenever you activate a ninjutsu ability" (Satoru Umezawa): commander ninjutsu too (CR 702.49d). */ ninjutsu?: true; /** "Whenever you activate a boast ability" (Frenzied Raider, CR 702.142a). */ boast?: true; /** "Whenever you activate an exhaust ability" (Afterburner Expert, CR 702.177a): mana abilities too. */ exhaust?: true; /** "Whenever you activate ~'s outlast ability" (Herald of Anafenza): this permanent's own (CR 702.107a). */ ownOutlast?: true; /** "Whenever an ability of equipped creature is activated" (Illusionist's Bracers): its source is the creature this is attached to, still there after its costs are paid (rulings). */ equipped?: true; /** "Whenever you activate an ability of a creature" (Elrond, Moon-Reader): mana abilities too (rulings). */ mana?: true; /** "Whenever you ... activate an ability of a card in your graveyard" (Neerdiv, Devious Diver): its source a card in its activator's graveyard as it's activated (CR 602.2). */ inYourGraveyard?: true; /** "Whenever you activate a loyalty ability" (Way of the Paradox, CR 606.3): a loyalty ability only. */ loyalty?: true; /** With `loyalty`: "if you removed two or more loyalty counters to activate it" (Way of the Mind Sculptor), the loyalty cost paid (CR 606.4). */ loyaltyRemoved?: number };
  /**
   * For "playerDiscards": who discards, `cycled` for "cycles a card" (only a card discarded to pay a cycling cost,
   * CR 702.29c), `other` for "another card", `filter` for "a creature card". "Cycle or discard" is just "discard"
   * (rulings: cycling a card triggers it once).
   */
  discards?: { by: "you" | "opponent" | "any"; cycled?: true; other?: true; filter?: TargetSpec; /** "For the first time each turn" (Valiant Rescuer): the player's first cycle this turn. */ firstEachTurn?: true; /** "Whenever a spell or ability an opponent controls causes you to discard a card" (Spiritual Focus). */ byOpponent?: true };
  /** "When a spell or ability an opponent controls causes you to discard ~" (Sand Golem): a "selfDiscarded" trigger only for such a discard; the event player is that opponent. */
  discardedByOpponent?: true;
  /** For "creatureYouControlDealsCombatDamageToPlayer": which creature ("a Vampire you control", "another creature"). */
  dealer?: { filter: TargetSpec; other?: boolean; /** "Whenever ~ or an enchanted creature you control deals combat damage to a player" (Calix): this permanent too, whatever the filter says. */ orSelf?: true; /** "Whenever a creature deals combat damage to one of your opponents" (Edric): anyone's creature; `toOpponent` is then about this permanent's controller. */ anyone?: true };
  /** For "yourCreatureDealsDamage": the creature (`dealer` its filter, or `self` this one), what it's dealt to, and whether the subject is what was dealt damage ("destroy that planeswalker") rather than the creature. */
  damageTo?: { what: "planeswalker" | "playerOrPlaneswalker"; self?: true; subjectDealt?: true; /** Zagras: "deals combat damage to a planeswalker": combat damage only. */ combat?: true };
  /** For "creatureYouControlAttacks": which creature ("a Dragon you control", "another creature you control"). */
  attacker?: {
    filter: TargetSpec;
    other?: boolean;
    /** "Whenever a creature attacks": anyone's (Caltrops, Righteous Cause). */
    anyone?: true;
    /**
     * "Whenever a creature attacks you" (Briar Patch): this permanent's controller; "or a planeswalker you control" (Isperia)
     * too. "One of your opponents" (Genestealer Locus): one of their opponents; "or a planeswalker an opponent controls" (Gahiji).
     */
    attacksYou?: "player" | "orPlaneswalker" | "opponent" | "opponentOrPlaneswalker";
  };
  /** What the event's subject has to be: "blocks a creature with flying", flanking's "a creature without flanking". */
  subjectFilter?: TargetSpec;
  /** With `subjectFilter`: "Whenever ~ or a commander you control attacks alone" (Ironsoul Enforcer): the source itself matches too. */
  subjectOrSelf?: true;
  /**
   * "Whenever ~ blocks or becomes blocked by one or more black creatures" (Serra Inquisitors), "blocks one or more black
   * creatures" (Rashka the Slayer): once per combat, if any creature it blocks or that blocks it matches (rulings).
   */
  blockFilter?: TargetSpec;
  /** "Whenever ~ blocks two or more creatures" (Lairwatch Giant): only if it blocks at least this many as blockers are declared. */
  blocksAtLeast?: number;
  /** "Whenever a creature ... becomes blocked by two or more creatures" (Seifer, Balamb Rival): only with at least this many blockers as blockers are declared. */
  blockedByAtLeast?: number;
  /**
   * For "dealsDamageToYou": a source that's a permanent fitting `subjectFilter` (the subject, "it", "that creature"), or
   * any source with `by` saying whose ("a source an opponent controls": the event player, "that player", is its
   * controller); `combat`: only combat damage.
   */
  damagesYou?: { by?: "you" | "opponent" | "any"; combat?: true };
  /**
   * For "groupDealsDamageToPlayers": the permanents you control dealing it (`filter`), all damage dealt at the same time
   * one event (CR 603.2c). `opponents`: to your opponents, "that many" how many of them were dealt damage; `perPlayer`:
   * once for each player dealt damage, "that player" them.
   */
  damageGroup?: { filter: TargetSpec; opponents?: true; perPlayer?: true; /** "Deal combat damage" (Hordewing Skaab): only combat damage. */ combat?: true; /** "If any of that damage was dealt by a Warrior" (Mindblade Render): anyone's, not only yours (rulings). */ anyController?: true; /** "During your turn" (Fblthp, Impossibly Lost): only while its controller is the active player. */ yourTurn?: true };
  /** For "sourceYouControlDamagesOpponent": only noncombat damage. */
  noncombatOnly?: true;
  /** For "sourceYouControlDamagesOpponent", "opponentDealtDamageBySource", "selfDealsDamage" and "selfDealsDamageToPlayer": "deals 5 or more damage" at once (Dragonborn Champion, Spinneret and Spiderling, Deus of Calamity); for "selfIsDealtDamage", "is dealt 3 or more damage" at once (Innocent Bystander). */
  minDamage?: number;
  /** For "sourceYouControlDamagesOpponent": "to a player", you included. */
  anyPlayer?: true;
  /** For "sourceYouControlDamagesOpponent": "a source you control other than ~" (Talon of Pain). */
  otherSource?: true;
  /** For "sourceYouControlDealsDamage": exactly this much at once; `other`: a source other than this permanent. */
  sourceDamage?: { exactly: number; other?: true };
  /** For "creaturesYouControlAttack": "Whenever you attack with two or more creatures", at least this many of them. */
  minAttackers?: number;
  /** For "creaturesYouControlAttack": "Whenever you attack with creatures with total power 6 or greater" (Ugin's Mastery): the attackers' powers as they were declared add up to at least this. */
  minTotalPower?: number;
  /** "Whenever you expend N": the total mana spent casting spells this turn reaching N as a cost is paid (CR 700.14). */
  expend?: number;
  /** For "creaturesYouControlAttack": "Whenever one or more creatures attack" (Duelist's Heritage), any player's, not only its controller's. */
  anyoneAttacks?: true;
  /** For "creaturesYouControlAttack": "Whenever you attack a player", once for each player attacked (CR 508.3e); the event's player is that player. */
  perPlayer?: true;
  /** With `perPlayer`: "Whenever you attack a player or planeswalker with ..." (Rigo, Streetwise Mentor): once for each planeswalker attacked too. */
  perWalker?: true;
  /**
   * With `anyoneAttacks`: "Whenever one or more creatures attack one of your opponents (or a planeswalker they control)"
   * (Frontier Warmonger): once for each of its controller's opponents attacked; the event's player is that opponent, its
   * group the creatures attacking them (and, `orPlaneswalkers`, their planeswalkers).
   */
  attacksOpponent?: { orPlaneswalkers?: true };
  /** "Whenever you attack with ~ and/or your commander" (Ainok Strike Leader): once, if it or a commander you own is among the attackers. */
  selfOrCommander?: true;
  /**
   * "Whenever you attack with ~ and another legendary creature" (Merry, Esquire of Rohan): once for the attack, if it and
   * another creature like this are among the attackers, whoever each attacks (rulings).
   */
  selfAnd?: TargetSpec;
  /** With `anyoneAttacks`: "Whenever another player attacks" (Firemane Commando), not its controller. The event's player is the attacking player, its amount how many of the attackers attack its controller (not their planeswalkers or battles). */
  anotherPlayer?: true;
  /** For "opponentAttacksYou": at least `min` attackers at you, or (`orPlaneswalkers`, an intervening if, CR 603.4) at your planeswalkers too. */
  attacksYou?: { min: number; orPlaneswalkers?: true; /** With `orPlaneswalkers`: "attacks one or more planeswalkers you control" (Mila, Crafty Companion), not you. */ walkersOnly?: true; /** With `walkersOnly`: once for each planeswalker attacked (Oath of Kaya). */ perWalker?: true; /** Mangara's intervening "if two or more of those creatures are attacking you": checked again as it resolves (CR 603.4). */ recheck?: true };
  /**
   * For "permanentEnters": what has to enter (the subject, "that creature"), relative to this permanent's
   * controller. "Another" leaves this permanent out; "~ or another" counts it whatever it is. Without
   * either, it sees itself enter if it matches (CR 603.6a).
   */
  enters?: { filter: TargetSpec; other?: boolean; orSelf?: boolean; /** "Whenever an Aura you control enters, if you cast it" (Light-Paws): it entered from the stack as a resolving permanent spell, not a copy (an intervening if, CR 603.4; a permanent spell enters under its caster's control, CR 608.3). */ ifCast?: true; /** With `ifCast`: "if you cast it from anywhere other than your hand" (Alex Wilder, Runaway). */ notFromHand?: true };
  /**
   * For "permanentDies": what has to die, as it last existed. `attached`: the creature this Aura or
   * Equipment is attached to; `damagedBySelf`: "a creature dealt damage by ~ this turn".
   */
  /**
   * `leaves`: "leaves the battlefield", wherever it went, not only into a graveyard (CR 603.6c, 603.10a); `notDies` with it:
   * "without dying" (anywhere but a graveyard, CR 700.4).
   */
  dies?: { filter: TargetSpec; other?: boolean; orSelf?: boolean; /** "When ~ dies, if it had counters on it" (Iron Apprentice): ~ only, matching `filter`. */ self?: true; attached?: boolean; /** "Whenever enchanted creature or another modified creature you control dies" (One with the Kami): the creature it was attached to as it died, or one matching `filter`. */ orAttached?: true; damagedBySelf?: boolean; /** "A creature dealt damage by equipped creature this turn" (Unscythe). */ damagedByEquipped?: true; leaves?: true; notDies?: true; /** With `leaves`: only when it went to one of these zones ("dies or is put into exile", Kaya's Ghostform; "is returned to its owner's hand", Justice, Vance Astrovik). */ toZones?: ("graveyard" | "exile" | "hand")[]; /** "If it had a counter on it" (Leader's Talent): any kind, or "a -1/-1 counter" (Blowfly Infestation) that kind, as it last existed (CR 603.10a). */ hadCounter?: true | CounterKind };
  /**
   * For "youSacrifice": what its controller sacrificed (CR 701.21a), as it last existed on the battlefield, wherever it
   * went. The card is the subject ("exile it").
   */
  /** `by`: "whenever a player sacrifices" (any), "whenever an opponent sacrifices" (opponent); otherwise "whenever you sacrifice". */
  /** `self`: "When you sacrifice ~" (Heaped Harvest), only ~ itself. */
  sacrifices?: { filter: TargetSpec; other?: boolean; orSelf?: boolean; self?: true; by?: "any" | "opponent" };
  /**
   * For "permanentDestroyed": a permanent a spell or ability destroyed (CR 701.8a), as it last existed on the battlefield
   * (CR 603.10a), this one too; `by` "opponent": the spell's or ability's controller is an opponent, the event player.
   * Not a sacrifice, nor lethal damage destroyed by a state-based action (rulings on Karmic Justice).
   */
  destroyed?: { filter: TargetSpec; by: "opponent" };
  /** Persist/undying's "if it had no -1/-1 counters on it" (an intervening if, CR 603.4), from last known information; "any": "if it had no counters on it" (Unstoppable Slasher); "time" (Deadly Grub). */
  ifNoCounter?: string;
  /** "When ~ dies, if it had a revival counter on it" (Nine-Lives Familiar): from last known information (CR 603.4, 603.10a). */
  ifHadCounter?: string;
  /** "When ~ dies, if 4 or more damage was dealt to it this turn" (the Zuberas): from all sources (rulings), as it last existed (CR 603.10a). */
  ifDamagedThisTurn?: number;
  /** "When ~ dies, if it's not a token" (Vaultborn Tyrant): as it last existed (CR 603.4, 603.10a). */
  ifNotToken?: true;
  /** "When ~ dies, if it wasn't blocking" (Guildsworn Prowler): as it last existed (CR 603.4, 603.10a). */
  ifNotBlocking?: true;
  /** Mongrel Pack: "When ~ dies during combat": only if it dies during a combat phase (CR 506.1). */
  ifDiesInCombat?: true;
  /** Fyndhorn Druid: "When ~ dies, if it was blocked this turn": it became blocked this turn as that object (CR 509.1h, 603.10a). */
  ifBlockedThisTurn?: true;
  /** For "selfToGraveyard": "is put into your graveyard", so only if its controller owns it (rulings on Enigma Sphinx). */
  ownGraveyard?: true;
  /**
   * Evolve (CR 702.100a): "if that creature's power is greater than this creature's power and/or
   * that creature's toughness is greater than this creature's toughness", checked as it triggers and
   * again as it resolves (CR 603.4).
   */
  ifEvolves?: boolean;
  /** "Whenever a creature you control explores a land card" (Nicanzil, Current Conductor): what the explore revealed, as it was revealed (rulings). */
  explored?: "land" | "nonland";
  /** For the "one or more" events: what has to be among them ("one or more Rogues you control"). */
  group?: TargetSpec;
  /** Dethrone (CR 702.105a): "attacks the player with the most life or tied for most life", as it attacks. */
  attacksMostLife?: boolean;
  /** "Whenever equipped creature attacks the monarch" (The Spear of Bashenga): the monarch as it attacks, not a planeswalker. */
  attacksMonarch?: boolean;
  /** "Whenever ~ attacks a player": not when it attacks a planeswalker (rulings). */
  attacksPlayer?: boolean;
  /** With `attacksPlayer`: "a player who has more life than you" (Namor, Atlantean King), as it attacks. */
  attacksMoreLife?: true;
  /** "Whenever ~ attacks a battle" (Thrashing Frontliner, CR 310.5). */
  attacksBattle?: boolean;
  /** "Whenever ~ attacks for the first time each turn": only on its first attack this turn, as this object (Aurelia). */
  firstAttack?: true;
  /** "Whenever ~ deals combat damage to a player for the first time each turn" (Raphael, Tag Team Tough): as this object (GameObject.combatHitTurn). */
  firstHit?: true;
  /** "Whenever ~ is dealt damage for the first time each turn" (Hercules, Olympian Hero): only its first damage event this turn (TurnLog.timesDealtDamage). */
  firstDealtEachTurn?: true;
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
  ifAlt?: "sneak" | "surge" | "spectacle" | "webSlinging" | "prowl" | /** "If its madness cost was paid" (Grave Scrabbler, CR 702.35). */ "madness";
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
  ifFromGraveyard?: "any" | "yours" | /** "If it entered from your graveyard or you cast it from your graveyard". */ "yoursOrCast" | /** "If that creature entered from a graveyard or you cast it from a graveyard" (Breathless Knight): anyone's graveyard. */ "anyOrCast" | /** "If it was cast from your graveyard" (Rocket-Powered Goblin Glider). */ "castYours";
  /** "When ~ enters from your hand" (Thousand-Faced Shadow): it came from its owner's hand (CR 603.6a). */
  ifFromHand?: true;
  /** "When ~ enters untapped" (Mystic Sanctuary): only if it entered untapped, part of the trigger event. */
  ifEnteredUntapped?: true;
  /** "Whenever a player attacks one or more of your opponents" (Jolene): once for the declaration, not once for each opponent attacked. */
  anyOpponent?: true;
  /** "Whenever an opponent attacks another one of your opponents" (Karazikar): playerAttacksYourOpponent, only when the attacking player is your opponent. */
  attackerOpponent?: true;
  /** "When ~ enters, if you cast it, ..." (Geological Appraiser): it entered as a spell that resolved, not a copy. */
  ifCast?: true;
  /** Addendum: "When this Aura enters, if you cast it during your main phase, ..." (Sentinel's Mark, CR 207.2c). */
  ifCastInMain?: true;
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
  /** "At the beginning of the chosen player's upkeep" (Black Vise): only on the turn of the player chosen as its permanent entered. */
  chosenPlayersTurn?: true;
  /** "At the beginning of the monarch's end step" (Archivist of Gondor): only on the turn of the player who's the monarch as the step begins (CR 725). */
  monarchsTurn?: true;
  /** "At the beginning of enchanted player's first upkeep each turn" (Paradox Haze): not an additional upkeep. */
  firstUpkeep?: true;
  /** "Deals damage to an opponent": an opponent of this ability's controller (rulings on Curiosity). */
  toOpponent?: true;
  /** "Whenever a creature deals combat damage to its owner" (The Beast, Deathless Prince): only to the dealing creature's owner. */
  toOwner?: true;
  /** "Deals combat damage to enchanted player" (Curse of Stalked Prey): the player this Aura enchants. */
  toEnchanted?: true;
  /** Its X is the number of times its permanent was kicked (Marshal's Anthem), not the spell's X. */
  xKicked?: true;
  /** "Deals combat damage to a player who controls more lands than you" (Cartographer's Hawk): checked as it triggers. */
  toMoreLands?: true;
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
  /** `created`: "Whenever you create one or more creature tokens" (Staff of the Storyteller), tokens that player created (CR 111.2). */
  /** `exiledFromGraveyardsOrBattlefield`: "cards are put into exile from graveyards and/or the battlefield" (Ketramose): anyone's. */
  what: "enters" | "leaves" | "leavesGraveyard" | "toGraveyard" | "discards" | "exiledFromLibraryOrGraveyard" | "exiledFromGraveyardsOrBattlefield" | "created";
  /** What each object has to be ("creature card", "nontoken creature"); unset, any. */
  filter?: TargetSpec;
  whose?: "you" | "opponent";
  /** "One or more other creatures": not this permanent. */
  other?: true;
  /** "Whenever ~ and/or one or more other creatures you control enter": this permanent entering counts too. */
  orSelf?: true;
  /** Satoru: "if none of them were cast or no mana was spent to cast them" (an intervening if, CR 603.4). */
  noneCastWithMana?: true;
  /** Kotis: "if one or more of them entered from a graveyard or was cast from a graveyard" (an intervening if, CR 603.4). */
  fromGraveyard?: true;
  /** With `fromGraveyard`: "them" are only those of them that entered or were cast from a graveyard (Twilight Diviner). */
  onlyFromGraveyard?: true;
  dies?: true;
  notDies?: true;
  /** `notBattlefield`: "from anywhere other than the battlefield" (Syr Konrad). */
  from?: "library" | "battlefield" | "notBattlefield";
  to?: "exile";
  /** "Whenever a creature card leaves your graveyard" (not "one or more"): once for each card it moved (CR 603.2c). */
  each?: true;
  /** "For the first time each turn": only the first such event this turn (counting the ones before this permanent was there). */
  first?: true;
  /** "Lands enter ... without being played" (Deep Gnome Terramancer): not a land played (CR 305.1). */
  notPlayed?: true;
  /** `toGraveyard` from the library: "Whenever a player mills one or more creature cards" (Zellix), milled ones only (CR 701.17a). */
  milled?: true;
  /** `discards`: "Whenever a player discards one or more cards" (Tinybones, Pocket Nuisance): once for each player who discarded in the event. */
  eachPlayer?: true;
  /** With `milled`: once for the whole event, whoever milled them (The Wise Mothman, rulings), not once for each player. */
  together?: true;
  /** `leaves`: "Whenever you sacrifice one or more Foods" (Camellia): ones `whose` player sacrificed (CR 701.21a). */
  sacrificed?: true;
}

export interface ActivatedAbility {
  /** Another permanent's ability that this one has through "~ has all activated abilities of ..." (CompiledCard.borrows). */
  borrowed?: true;
  /** "Spend only mana of the chosen color to activate this ability" (Throne of Eldraine): the color chosen as its source entered. */
  spendOnlyChosenColor?: true;
  /** "{X}: ... Spend only black mana on X." (Crypt Rats): with {X} its whole mana cost, only mana of these types pays it. */
  spendOnly?: ManaType[];
  manaCost: string; // "{2}{R}" or ""
  /**
   * "Waterbend {N}" (CR 701.67a): the {N} is part of `manaCost`, and up to N of its generic mana (X for "Waterbend {X}")
   * may be paid by tapping untapped artifacts and creatures you control, the activation's `tapCreatures`.
   */
  waterbend?: number | "X";
  tap: boolean;
  sacrificeSelf: boolean;
  sorcerySpeed: boolean;
  body: AbilityBody;
  text: string;
  /** An equip ability (CR 702.6a), for "Equip abilities you activate cost {1} less to activate". */
  equip?: true;
  /** Works only while the card is in its owner's hand, like cycling (CR 702.29a), or graveyard, like unearth (CR 702.84a), or the command zone (Derevi, CR 113.6k). Otherwise on the battlefield. */
  zone?: "hand" | "graveyard" | "command";
  /** With `zone` "hand": from the command zone too (commander ninjutsu, CR 702.49d). */
  orCommand?: true;
  /** "Discard this card" is part of the cost (cycling, transmute). */
  discardSelf?: boolean;
  /** "This ability costs {1} less to activate for each legendary creature you control" (CR 602.2b, 601.2f): generic mana only. */
  costLess?: Amount;
  /** "This ability costs {1} more to activate for each card in your hand" (Loreseeker's Stone): counted as it's activated (CR 602.2b, 601.2f). */
  costMore?: Amount;
  /** "This ability costs {1} less to activate during your turn" (Hylda's Crown of Winter): `n` less while `cond` holds, generic mana only. */
  costLessIf?: { n: number; cond: StaticCondition };
  /** "This ability costs {1} less to activate if it targets a creature with power 3 or less" (Raft Security Officer): `n` less once its target is chosen and matches (CR 602.2b, 601.2f), generic mana only. */
  costLessIfTarget?: { n: number; filter: TargetSpec };
  /**
   * "This ability costs {1} less to activate for each color of the creature it targets" (Dragonfire Blade), "... for each
   * +1/+1 counter on the creature it targets" (Warrior's Blades): `n` less for each, once the target is chosen (CR
   * 602.2b, 601.2f).
   */
  costLessPerTarget?: { n: number; each: "color" | "+1/+1" };
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
  /** With `anyPlayer`: "Only ~'s owner may activate this ability" (Personal Incarnation): its owner, whoever controls it. */
  ownerOnly?: true;
  /** With `anyPlayer`: "Only your opponents may activate this ability" (Clergy of the Holy Nimbus): an opponent of its controller. */
  opponentsOnly?: true;
  /** "Reveal the player you chose" (Guardian Archon): payable only if a player was secretly chosen for it as it entered. */
  revealChosen?: true;
  /** Exhaust: "Activate only once" (CR 702.177a), for as long as it's the same object (CR 400.7): see GameObject.activatedEver. */
  onceEver?: true;
  /**
   * The keyword written before it ("Exhaust — {2}{G}: ..."), which effects can refer to (CR 702.142b, 702.177b). A power-up
   * ability costs less by the permanent's mana cost if it entered this turn (CR 702.193a): see game.ts activationCost.
   */
  keyword?: "Exhaust" | "Boast" | "Power-up" | "Ninjutsu" | "Craft" | "Forecast";
  /** An outlast ability (CR 702.107a), for "whenever you activate ~'s outlast ability" (Herald of Anafenza). */
  outlast?: true;
  /** "Activate no more than twice each turn" (CR 602.5b). */
  maxPerTurn?: number;
  /** "Activate no more times each turn than the number of snow Swamps you control" (Withering Wisps, CR 602.5b). */
  maxPerTurnCount?: AmountExpr;
  /** "X can't be 0." for an X in its costs ("Sacrifice X artifacts", Ruthless Technomancer). */
  xMin?: number;
  /**
   * "{X}, {T}: Create a token that's a copy of the exiled card. X is the mana value of that card." (Prototype Portal): X is
   * defined by the ability, not chosen (CR 107.3c), worked out as it's activated; with no card exiled it can't be (rulings).
   */
  xIs?: "linkedCardMv";
  /** "Activate only if you have the city's blessing" (CR 602.5b). */
  activateIf?: StaticCondition;
  /** "Pay 2 life" as part of the cost (CR 119.4: only with at least that much life). */
  lifeCost?: number;
  /** "Pay life equal to the number of colors in your commanders' color identity" (War Room), on top of `lifeCost`. */
  lifeCostIdentity?: true;
  /** "{X}{B}, {T}, Pay X life" (Krumar Initiate): X life, the X announced for its mana cost, on top of `lifeCost`. */
  lifeCostX?: true;
  /**
   * "Pay half your life, rounded up" as part of the cost (CR 119.4, 107.1a): half the life total as the cost is worked out
   * (CR 601.2f), 0 with 0 or less life (rulings on Lurking Evil).
   */
  halfLifeCost?: "up" | "down";
  /** "Discard your hand" as part of the cost (Tarrian's Journal; CR 701.9a): with no cards in it too (rulings). */
  discardHand?: true;
  /** "Pay {E}{E}" as part of the cost (CR 107.14). */
  energyCost?: number;
  /** "Pay X {E}" (Sphinx of the Revelation): X energy, X announced as it's activated (CR 107.3a). */
  energyX?: true;
  /** "Exile this card from your graveyard" is part of the cost: scavenge (CR 702.97a); on the battlefield, "Exile ~" (Relic of Progenitus). */
  exileSelf?: boolean;
  /** "Return ~ to its owner's hand" is part of the cost (Shigeki, Jukai Visionary; CR 602.2b). */
  returnSelf?: true;
  /** With `returnSelf`: "Put ~ on the bottom of its owner's library" instead (Timestream Navigator). */
  toLibraryBottom?: true;
  /** "Sacrifice a creature", "Discard a card" as part of the cost (CR 602.2b, 601.2h). */
  costs?: AdditionalCost[];
  /**
   * "Remove three spore counters from ~" as part of the cost (CR 602.2b). `all`: "Remove all +1/+1 counters from ~" (Sage of
   * Hours), however many (none too); the number removed is "the number of counters removed this way". `x`: "Remove X ki
   * counters from ~" (the Bakus): X is announced as it's activated, up to how many it has, and is how many (CR 107.3a,
   * 601.2b); also "the counters removed".
   */
  removeCounters?: { counter: CounterKind; n: number; all?: true; x?: true };
  /** "{T}, Exert ~: ..." (CR 701.43a): it won't untap during your next untap step; possible even if already exerted (701.43b). */
  exertCost?: true;
  /** The untap symbol {Q} (CR 107.6): untapping this permanent is part of the cost; it must be tapped, and a creature not summoning sick (CR 302.6). */
  untapSelf?: true;
  /** "Unattach ~" as a cost (Sunforger): it must be attached to a creature (rulings). */
  unattachCost?: true;
  /**
   * "Tap enchanted creature", "Tap enchanted land" as the cost (Krovikan Plague, Earthlore): tapping the untapped permanent
   * this Aura is attached to (CR 602.2b), which isn't this ability's own {T}, so a creature that came under its
   * controller's control this turn can be tapped (CR 302.6 is about its own {T} abilities).
   */
  tapAttached?: true;
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
  /** Jeweled Amulet: "Add one mana of ~'s last noted type" (GameObject.notedMana); none if no type was noted (rulings). */
  | { kind: "noted" }
  | { kind: "oneOf"; options: ManaType[]; amount: number; n?: AmountExpr }
  | { kind: "commanderIdentity" }
  /** "Add one mana of the chosen color", "Add {B} or one mana of the chosen color": the color chosen as it entered. */
  | { kind: "chosenColor"; also?: ManaType; /** "Four mana of the chosen color" (Throne of Eldraine): that many. */ n?: number }
  /**
   * "One mana of any color that a land an opponent controls could produce" (Fellwar Stone, Exotic Orchard), "of any
   * type that a land you control could produce" (Reflecting Pool): what those lands' mana abilities would make (CR 106.7).
   */
  | { kind: "landsCouldProduce"; whose: "you" | "opponent"; anyType?: boolean; /** "That a Gate you control could produce" (Gond Gate). */ subtype?: string; /** "That a basic land you control could produce" (Star Compass). */ basic?: true; /** "Add three mana of that type instead" (Incubation Druid). */ n?: number }
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
  | { kind: "removeX"; counter: CounterKind; colors: ManaType[]; min: number; /** The Mana Batteries: "Add {G}, then add an additional {G} for each charge counter removed this way": this much more, of the one color. */ base?: number }
  /**
   * Metalworker: "Reveal any number of artifact cards in your hand. Add {C}{C} for each card revealed this way." How many
   * are revealed is chosen as it's activated (rulings: zero too); each number is a combination, numbered as for "combos"
   * (`revealXCombos`), and the first that many matching cards in hand are revealed.
   */
  | { kind: "revealX"; filter: TargetSpec; per: ManaType[] }
  /**
   * "One mana of any color among legendary creatures and planeswalkers you control" (Mox Amber, Plaza of Heroes: the
   * colors of the permanents matching `filter` now), "one mana of any of the exiled card's colors" (Chrome Mox, `linked`:
   * the card its linked imprint ability exiled, CR 607.2a). None if there's no such color (CR 106.5, rulings).
   */
  | { kind: "colorsAmong"; filter?: TargetSpec; linked?: true; /** "Any of this creature's colors" (Katilda's): its own. */ self?: true; /** "Among legendary creature cards in your graveyard" (The Grey Havens): cards there, not permanents. */ inYard?: true }
  /** "For each color among permanents you control, add one mana of that color" (Bloom Tender, Faeburrow Elder); `monocolored`: "among monocolored permanents" (Tarnation Vista, CR 105.2b). */
  | { kind: "eachColorAmong"; monocolored?: true }
  /**
   * "Choose a color. Add an amount of mana of that color equal to your devotion to that color." (Nykthos, Shrine to Nyx,
   * CR 700.5): the color chosen as it resolves, then the devotion to it.
   */
  | { kind: "devotion" }
  /**
   * "Double the amount of each type of unspent mana you have" (Doubling Cube): as much of each type as is in its
   * controller's pool once its cost is paid, added as new mana; restrictions on that mana aren't copied (rulings). The
   * way its mana cost is paid from the pool is chosen as the ability is activated (CR 601.2h, 605.3a), numbered as
   * `combo` (`doublePoolPayments`).
   */
  | { kind: "doublePool" };

/**
 * A mana ability (CR 605.1a): no targets, adds mana, doesn't use the stack (CR 605.3a).
 * The costs are paid in the order the text gives them; the mana comes after.
 */
export interface ManaAbility {
  text: string;
  /** "{T}: A player of your choice adds {C}." (Victory Chimes): the player chosen as it's activated adds it (Action activateMana `to`). */
  toChosenPlayer?: true;
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
  /** "If this ability has been activated four or more times this turn, sacrifice ~ at the beginning of the next end step" (Farrelite Priest): the N. */
  sacrificeIfActivated?: number;
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
  /** "Activate only as a sorcery" (Grinning Ignus): only when its controller could cast a sorcery (CR 307.1), so never while paying. */
  sorceryOnly?: true;
  /** "Return ~ to its owner's hand" as part of the cost (Grinning Ignus): never used by automatic payment. */
  returnSelf?: true;
  /** "Activate only if you control a Swamp." (CR 602.5b): it can't be activated otherwise, but it still could produce its mana (CR 106.7, rulings on Reflecting Pool). */
  activateIf?: StaticCondition;
  /** "Spend this mana only to cast a creature spell." (CR 106.6) */
  spendOnly?: ManaSpend;
  /**
   * "When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1." (Path
   * of Ancestry): a triggered ability of its source, once for each of that mana spent so (rulings), with your
   * commanders' creature types as they are just after the spell is cast.
   */
  spentTrigger?: { body: AbilityBody } & SpentFor;
  /**
   * "If any of that mana is spent on a creature spell, it gains haste until end of turn." (Arena of Glory, Generator
   * Servant), "If that mana is spent on a creature spell, it gains haste." (Hall of the Bandit Lord, which doesn't wear
   * off): a creature spell any of it pays any part of the total cost of (rulings), and the creature it becomes.
   */
  spentHaste?: "endOfTurn" | "game";
  /** "If that mana is spent on an instant or sorcery spell, that spell can't be countered" (Boseiju, Who Shelters All). */
  spentUncounterable?: true;
  /** With `spentHaste`: only a creature spell of this creature type ("a Dragon creature spell", Carnelian Orb of Dragonkind). */
  spentHasteType?: string;
  /**
   * Opal Palace: "If you spend this mana to cast your commander, it enters with a number of additional +1/+1 counters on
   * it equal to the number of times it's been cast from the command zone this game": that many for each such mana spent
   * (rulings: two mana from it give two counters for each cast).
   */
  spentCommanderCounters?: true;
  /** Biophagus: "If this mana is spent to cast a creature spell, that creature enters with an additional +1/+1 counter on it" (one for each such mana). */
  spentCreatureCounter?: true;
  /**
   * Yuna, Grand Summoner: "When you next cast a creature spell this turn, that creature enters with two additional +1/+1
   * counters on it", a delayed trigger the ability creates as it resolves (CR 603.7a, 605.3b), whatever the mana is spent on.
   */
  nextCast?: Extract<Effect, { type: "nextCast" }>;
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
  /** "Whenever a land with the same name as the exiled card is tapped for mana" (Extraplanar Lens): the card its linked imprint ability exiled (CR 607.2a). */
  sameNameAsLinked?: true;
  /** "... is tapped for mana of the chosen color": only when it made mana of the color chosen for this permanent. */
  ofChosen?: true;
  /** "Whenever you tap a permanent for {C}": only when it made one or more mana of this type. */
  madeType?: ManaType;
  /** "Whenever you tap a land for mana while you're the monarch" (Regal Behemoth): only while its controller is the monarch (CR 725). */
  whileMonarch?: true;
  /**
   * "Whenever a land's ability causes you to add ..." (Caged Sun): any mana ability of it, not only ones with {T} in
   * their cost.
   */
  anyAbility?: true;
  /**
   * What it adds: fixed mana ("an additional {G}"); `n` mana each of any color the player picks ("one mana of any
   * color", "two mana in any combination of colors"); one of the color chosen for this permanent; or "one mana of
   * any type that land produced" (picking one of them if it made several, rulings on Mana Flare). The mana has none
   * of the riders of the mana that permanent made (rulings on Mana Flare). Fixed mana with `times` is that mana once
   * for each ("an additional {G} for each Elf on the battlefield", Elvish Guidance), counted as it resolves.
   */
  adds: { kind: "fixed"; mana: ManaType[]; times?: Amount } | { kind: "anyColor"; n: number } | { kind: "chosenColor" } | { kind: "produced" };
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
  /** "Or to gain a Class level" (Sorcerer Class): a Class's level ability, which makes it gain a level (CR 716.2a). */
  classLevel?: true;
  /** "Or activate an equip ability" (Freya Crescent): any equip ability (CR 702.6a), whatever its source. */
  equipAbilities?: true;
  /** "This mana can't be spent to pay generic mana costs" (Jegantha): spent on anything, but only on colored, hybrid or Phyrexian symbols' colored mana. */
  notGeneric?: true;
  /**
   * "Spend this mana only on costs that contain {X}" (Elementalist's Palette): on any part of a spell's mana cost or an
   * ability's activation cost with {X} in it (rulings); with the other fields unset.
   */
  xCosts?: true;
  /** "Spend this mana only to cast kicked spells" (Throne of Makindi): a spell kicked as it's cast (ManaUse.kicked). */
  kickedSpells?: true;
  /** "Only to pay a disturb cost or ..." (Unblinking Observer): a spell cast for its disturb cost too (ManaUse.disturb). */
  disturb?: true;
  /** "This mana can't be spent to cast spells from your hand" (Karolina Dean): not on a spell cast from a hand (ManaUse.fromHand). */
  notFromHand?: true;
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
  | { kind: "ownTurnAtMost"; n: number }
  | { kind: "yourTurn" };

/**
 * "As ~ enters, you may pay 2 life / reveal a Dragon card from your hand. If you don't, it enters
 * tapped." The choice is made as it enters (CR 614.12).
 */
/** `orControl`: "or you control a Dragon" (Temple of the Dragon Queen): untapped then with nothing revealed. */
export type EntersChoice = { kind: "payLife"; n: number } | { kind: "reveal"; filter: TargetSpec; orControl?: TargetSpec };

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
  /** During the permanent's controller's turn or not; `notCasters`: "except during its controller's turn" (Defense Grid), the spell's. */
  turn?: "yours" | "notYours" | "notCasters";
  /** "Spells you cast from your graveyard": the caster's own (with `fromZones`, a graveyard one must be theirs). */
  fromGraveyard?: boolean;
  /** "Spells your opponents cast from graveyards or from exile" (Aven Interrupter): only spells cast from these zones. */
  fromZones?: ("graveyard" | "exile")[];
  /** "Spells you cast from anywhere other than your hand" (Fortune Teller's Talent): a graveyard, exile, the library, the command zone. */
  notFromHand?: true;
  /** "Spells you cast but don't own" (Gonti, Canny Acquisitor). */
  notOwned?: true;
  /** "Spells you cast that share a card type with the exiled card" (Semblance Anvil): with a card its imprint ability exiled (CR 607.2a). */
  sharesTypeWithLinked?: true;
  /** "Cost {1} less to cast for each card type they share with cards exiled with ~" (Cemetery Prowler): `n` once for each card type of the spell among them (rulings). */
  perTypeSharedWithLinked?: true;
  /** "The first creature spell you cast each turn", "the second spell you cast each turn": only the nth matching spell. */
  nth?: number;
  /** Only while this holds: a Class level's (CR 716.2a). */
  if?: StaticCondition;
  /** "... for each experience counter you have" (Mizzix): `n` that many times, for the permanent's controller. */
  times?: AmountExpr;
  /** Hum of the Radix: "for each artifact its controller controls": `times` counted for the spell's caster, not the permanent's controller. */
  timesForCaster?: true;
  /** "Cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay" (Morophon): `n` is 0. */
  colored?: Color[];
  /** The Leeches: "Red spells you cast cost {R} more to cast": this colored mana added to the total cost (CR 601.2f); `n` is 0. */
  moreColored?: Color[];
  /** Eluge: "costs {U} (or {1}) less ... for each": `times` that color, each one {1} once the cost has none of it left. */
  coloredOrGeneric?: Color;
  /** The Defilers: only if the caster chose to pay this much life for it as an additional cost (CostChoices.lifeFor). */
  payLife?: number;
  /** Eminence (The Ur-Dragon): it also works while its commander is in the command zone (CR 113.6). */
  eminence?: true;
  /** "Other Dragon spells": not the card itself. */
  other?: true;
  text: string;
}

/** What a spell cast with a permission to cast it from a graveyard gets: a counter it enters with, creature types on the stack and for good (CR 614.1c, 400.7a). */
export interface GraveCastRider {
  counter?: CounterKind;
  subtypes?: string[];
}

/** Everything the engine knows how to do with one card. */
/** A cost paid along with a spell's mana cost (CR 118.8). */
/**
 * `x` (on a spell's costs): "pay X life", "discard X cards", "sacrifice X lands": as many as the X announced as it's
 * cast (CR 107.3a, 601.2b); `n` is that X once `castExtraCosts` has it.
 */
export type AdditionalCost =
  /**
   * Forage (CR 701.61a): exile three cards from your graveyard or sacrifice a Food, chosen as it's paid (CostChoices
   * `exileCards` or `sacrifice`).
   */
  | { kind: "forage" }
  /** `other`: "sacrifice another creature", not the ability's source. */
  | { kind: "sacrifice"; filter: TargetSpec; n: number; other?: boolean; /** With `other`: the source itself may be sacrificed if it's one of these ("another creature or an artifact"). */ selfIf?: TargetSpec; x?: true; /** "Sacrifice half the lands you control, rounded up" (Tectonic Split): `n` is worked out as the cost is (CR 601.2f). */ half?: "up"; /** "Exile a creature you control" (The Soul Stone): chosen the same way, but exiled, not sacrificed (CR 701.21a doesn't apply). */ exile?: true; /** "You may sacrifice one or more creatures" (Plumb the Forbidden): X may be 0, and is how many. */ optional?: true; /** "Sacrifice a Swamp and a Forest" (Jarad): `n` permanents, each matching a different one of these (a land that's both is either, not both; rulings). */ oneOfEach?: TargetSpec[]; /** "Sacrifice three artifact tokens with different names" (Transmutation Font): no two with the same name. */ differentNames?: true }
  /** "discard a land card" (retrace); `random`: "discard a card at random", chosen by the game as it's paid (CR 701.9b). */
  | { kind: "discard"; n: number; filter?: TargetSpec; random?: true; x?: true; /** "Discard an Island card and another card" (Foil): at least one of the `n` matches this. */ oneOf?: TargetSpec; /** "Discard a card with mana value X" (Kozilek, the Great Distortion): X is announced as it's activated (CR 107.3a), and `filter` gets that mana value. */ mvX?: true }
  | { kind: "payLife"; n: number; x?: true }
  /**
   * `top`: "exile the top creature card of your graveyard": the topmost `n` that match, nothing to choose (CR 404.1).
   * `linked`: "Put a card exiled with ~ into its owner's graveyard" (Jester's Scepter): one of the cards the source's
   * linked exile took (CR 607.2a), moved to its owner's graveyard, chosen in CostChoices.exileCards.
   */
  | { kind: "exileFromGraveyard"; filter?: TargetSpec; n: number; x?: true; top?: true; linked?: true; /** "Put a card an opponent owns from exile into that player's graveyard" (the Eldrazi processors): any card an opponent owns in exile, chosen in CostChoices.exileCards. */ process?: true }
  /** Ninjutsu (CR 702.49a): "Return an unblocked attacker you control to hand". */
  | { kind: "returnToHand"; filter: TargetSpec; n: number; unblockedAttacker?: boolean; x?: true }
  /**
   * "Tap an untapped creature you control", "tap two untapped Wizards you control" (CR 602.2b). Any of them, summoning
   * sick or not (CR 302.6 is only about {T}). `other`: the ability also has {T}, so its source is already tapped for it.
   */
  | { kind: "tap"; filter: TargetSpec; n: number; other?: boolean; /** "Untap a tapped creature you control" (Halo Fountain): untapped instead. */ untap?: true; /** "Tap X untapped Knights you control" (Aryel): X is announced as it's activated, and is how many (CR 107.3a). */ x?: true }
  /**
   * "Reveal a Pirate card from your hand" (Daring Buccaneer): the card stays in the hand. `orControl`: "behold an Elf"
   * (CR 701.4a): an Elf card from your hand or an Elf permanent you control. `exile`: "behold a Kithkin and exile it": the
   * card or permanent is exiled, linked to the permanent the spell becomes (CR 607.2q).
   */
  | { kind: "reveal"; filter: TargetSpec; n: number; orControl?: TargetSpec; exile?: true; /** "Reveal X red cards from your hand" (Martyr of Ashes): X is announced as it's activated, and is how many (CR 107.3a). */ x?: true }
  /** "Exile a blue card from your hand" (Force of Will's alternative cost): not the spell itself, on the stack by then (CR 601.2a). */
  | {
      kind: "exileFromHand";
      filter?: TargetSpec;
      n: number;
      /** "Exile a red card with mana value X from your hand" (the Shoals): its mana value is the X announced (CR 107.3a). */
      mvX?: true;
      /** "Put a card from your hand on top of your library" (Penance, Leashling): moved there instead of exiled. */
      toLibrary?: true;
      /** "You may exile any number of blue cards from your hand" (the Marches): none or more, `n` unused. */
      anyNumber?: true;
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
  | { kind: "mill"; n: number; /** "Exile the top card of your library" (Royal Herbalist, Arc-Slogger): exiled, not milled; not payable with fewer cards there either. */ exile?: true }
  /**
   * "Remove three counters from among other artifacts, creatures, and planeswalkers you control" (Tekuthal), "Remove two
   * +1/+1 counters from among creatures you control" (Hopeful Initiate): counters on permanents you control that match,
   * any mix of them (of `counter`'s kind if set), chosen as it's paid (CR 602.2b, 601.2h); CostChoices.counters.
   */
  | { kind: "removeCounters"; n: number; filter: TargetSpec; counter?: string; other?: true; /** "Remove a counter from ~" (Glen Elendra Guardian): any kind, from this permanent only. */ self?: true }
  /**
   * "Put a -1/-1 counter on a creature you control" (Hatchet Bully, Wandering Mage): on one permanent you control that
   * matches, chosen as it's paid (CR 602.2b, 601.2h; CostChoices.counterOn), the source too. Not payable on one counters
   * can't be put on (rulings on Solemnity).
   */
  | { kind: "putCounter"; counter: CounterKind; n: number; filter: TargetSpec; /** Blight N (CR 701.68a): `n` -1/-1 counters on one creature you control. */ blight?: true }
  /**
   * Craft's materials (CR 702.167a-b): "Exile [materials] from among permanents you control and/or cards in your
   * graveyard", `n` objects that match `filter` (a permanent by its characteristics, a card by its printed ones), any mix
   * of the two, never the source (it's exiled by the other part of the cost); CostChoices.craft.
   */
  | { kind: "craft"; n: number; filter: TargetSpec };

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
/** `payZero`: "you may pay {0} rather than pay the mana cost" for some spells you cast (CompiledCard.payZero: As Foretold, Rooftop Storm). */
/** `lifeForMv`: Demon of Fate's Design's "by paying life equal to its mana value rather than paying its mana cost" (CompiledCard.payZero `life`). */
export type AltCostKind = "payZero" | "impending" | "citadel" | "evidence" | "evoke" | "dash" | "bestow" | "mutate" | "madness" | "blitz" | "warp" | /** Warp a permanent gives a card in its controller's hand (Tannuk, Steadfast Second): the same as the card's own (CR 702.185a), a cost of its own beside one the card has. */ "grantedWarp" | "alternative" | /** Freerunning a permanent gives a spell (Ezio Auditore da Firenze: "Assassin spells you cast have freerunning {B}{B}"): a cost of its own beside the spell's own freerunning (CR 702.173a). */ "grantedFreerunning" | /** Web-slinging a permanent gives a spell (Amazing Spider-Man: "Each legendary spell you cast that's one or more colors has web-slinging {G}{W}{U}"), CR 702.188a, beside any of the spell's own. */ "grantedWebSlinging" | /** Blitz a permanent gives a spell (Henzie "Toolbox" Torre: "Each creature spell you cast with mana value 4 or greater has blitz. The blitz cost is equal to its mana cost"), CR 702.152a, beside any blitz of the spell's own. */ "grantedBlitz" | "prototype" | "wubrg" | "emerge" | "freerunning" | "foretell" | "sneak" | "surge" | "spectacle" | "overload" | "awaken" | "miracle" | "convert" | "omniscience" | "cleave" | "lifeForMv" | "linkedFree" | "prowl" | /** Kentaro, the Smiling Cat: {X} where X is the spell's mana value (CompiledCard.payZero `genericMv`). */ "genericMv";

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
  /** A permission to cast it from any graveyard (The Great Work): not only its owner may. */
  anyOwner?: true;
  /** "If a spell cast this way would be put into a graveyard, exile it instead" (CR 614.1a). */
  exileIfToGraveyard?: true;
  /** "Cast this card from your graveyard using its warp ability" (Timeline Culler): only for that alternative cost. */
  alt?: AltCostKind;
  /** "This spell costs {X} less to cast this way, where X is ..." (Visions of Glory): generic mana off when cast this way. */
  less?: Amount;
  /** "If you pay {1} more to cast it for each other creature card in your graveyard" (Risen Executioner): generic mana on top when cast this way (CR 601.2f). */
  more?: Amount;
  /** "If you do, ~ enters with a +1/+1 counter on it" (Undead Sprinter): counters the spell cast this way enters with (CR 614.1c). */
  entersWith?: { counter: CounterKind; n: number };
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
  /** "If one or more creature tokens would be created under your control, that many 4/4 white Angel creature tokens ... are created instead" (Divine Visitation): each token of card type `type` is a `token` instead. */
  | { what: "tokens"; who: "you"; op: "instead"; type: string; token: TokenSpec }
  | { what: "counters"; counter?: CounterKind; on: "creature" | "permanent" | "artifactOrCreature" | "creatureSpacecraftOrPlanet" | "creatureOrVehicle"; who: "you" | "any"; op: "double" | "plusOne" | "minusOne"; other?: boolean; /** "On an Army, Goblin, or Orc you control" (Mauhúr): only a permanent with one of these subtypes. */ subtypes?: string[]; /** "Would be put on ~" (Mowu): only the source. */ self?: true }
  /** "If you would get one or more counters, you get that many plus one of each of those kinds of counters instead" (Winding Constrictor): counters on its controller, whoever puts them. */
  | { what: "counters"; onPlayer: true; op: "plusOne" }
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
      subtypes?: undefined;
      self?: undefined;
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
  borrows?: { filter: TargetSpec; other?: boolean; notSameName?: true; graveyard?: true; yours?: true; noMana?: true; /** Conspicuous Snoop: the top card of your library, while it matches `filter`. */ top?: true; /** "You may spend mana as though it were mana of any color to activate those abilities" (Drana and Linvala, CR 609.4b). */ anyColor?: true; /** "All loyalty abilities" (Nicol Bolas, Dragon-God): only those. */ loyalty?: true };
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
  /**
   * "Mana abilities of this land cost an additional 1 life to activate" (Thran Portal, CR 601.2f, 602.2b): every mana
   * ability this object has, those of its land types and any it gains too, only its own (rulings).
   */
  manaAbilityLifeTax?: number;
  statics: StaticAbility[];
  /** For Auras: what it can enchant, which is also what the Aura spell targets. CR 303.4a, 702.5 */
  enchant?: TargetSpec;
  /** "~ can be attached only to a creature with power 3 or greater" (O-Naginata): an Equipment's limit (run-permanents.ts canAttachTo, SBA 704.5n). */
  attachOnly?: TargetSpec;
  /** Daybreak Coronet: "Enchant creature with another Aura attached to it": an Aura other than this one (CR 303.4c, 704.5m). */
  enchantAnotherAura?: true;
  entersTapped: boolean;
  /** "If it's neither day nor night, it becomes day as ~ enters" (Brimstone Vandal, CR 731.1). */
  entersDay?: true;
  /** "As long as ~ isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types" (Grist): see defOf. */
  offFieldCreature?: { power: string; toughness: string; subtype: string };
  /** "If a creature dealt damage by ~ (by enchanted creature) this turn would die, exile it instead." (Kumano) */
  exileWhatItDamaged?: "self" | "attached";
  /**
   * "If ~ would die, exile it instead" (`self`), "If a creature an opponent controls would die, exile it instead",
   * "If another creature would die, ..." (`filter`, from this permanent's controller's view): replacement effects (CR 614.1a).
   */
  /**
   * "If ~ would die, put it on top (Gravebane Zombie) / on the bottom (Nissa's Chosen) of its owner's library instead": a
   * replacement effect (CR 614.1a).
   */
  libraryInsteadOfDying?: "top" | "bottom";
  /** Mossbridge Troll: "If ~ would be destroyed, regenerate it" (CR 614.1a, 701.19a), every time. */
  regeneratesInsteadOfDestroyed?: true;
  exileInsteadOfDying?: {
    self?: true;
    /** A granted "If this creature would die, exile it instead" (Can't Stay Away) beside its own one about others (cards.ts withGranted). */
    alsoSelf?: true;
    filter?: TargetSpec;
    other?: true;
    /** "Instead exile it and you gain 2 life" (The Darkness Crystal); the card is linked to the permanent (CR 607.2a). */
    gainLife?: number;
    /** "Instead exile that card and create a 2/2 black Zombie creature token" (Kalitas). */
    token?: TokenSpec;
    linked?: true;
    /** "Exile it instead. When you do, create a 1/1 green Saproling creature token." (Nemata, Primeval Warden): a reflexive trigger each time this replacement is applied (CR 603.12). */
    reflexive?: AbilityBody;
  };
  /** "If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead." */
  shuffleInsteadOfGraveyard?: boolean;
  /** "If this land would leave the battlefield, exile it instead of putting it anywhere else" (CR 614.1a), as an ability it has (Realmbreaker's gift). */
  exileIfLeavesSelf?: true;
  /** "If ~ would be put into a graveyard from anywhere, exile it instead" (a disturb card's back face, CR 614.1a). */
  /** Ugin's Nexus: "If ~ would be put into a graveyard from the battlefield, instead exile it and take an extra turn after this one." (game.ts moveObject). */
  exileForExtraTurn?: true;
  exileInsteadOfGraveyard?: boolean;
  /** An instant or sorcery whose last instruction is "Exile ~.": exiled as it finishes resolving (CR 608.2n). */
  exileSelfOnResolve?: true;
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
  /** `permanents`: "If a permanent would be put into a graveyard, exile it instead" (Samurai of the Pale Curtain): only from the battlefield, tokens too. */
  graveyardExile?: { whose: "any" | "opponents" | "yours"; tokens?: true; filter?: TargetSpec; counter?: CounterKind; notYours?: true; linked?: true; permanents?: true };
  /** "This creature enters prepared" (CR 722.3a): it becomes prepared as it enters. */
  entersPrepared?: boolean;
  /** "As ~ enters, discard your hand" (Heightened Awareness): its controller discards their hand as it enters (CR 614.1c). */
  entersDiscardHand?: true;
  /** Urborg Lhurgoyf: "As ~ enters, mill three cards for each time it was kicked" (rulings: no trigger, CR 614.1c). */
  entersMillPerKick?: number;
  /**
   * "Creatures your opponents control enter tapped", "Artifacts and lands enter tapped": a replacement effect on other
   * permanents entering (CR 614.1c, 614.12), checked against them as they'd be on the battlefield.
   */
  othersEnterTapped?: { filter: TargetSpec; text: string; /** Only one that was cast, entering from the stack (Uphill Battle's "played"). */ cast?: true }[];
  /**
   * "Lands you control enter untapped" (Spelunking, Horizon Explorer), "Gates you control enter untapped" (Gond Gate): a
   * replacement effect on other permanents entering; against an "enters tapped" one, the permanent's controller orders them
   * (CR 616.1) and has it enter untapped, without paying for a "pay 2 life" choice (rulings on Spelunking).
   */
  othersEnterUntapped?: { filter: TargetSpec; text: string }[];
  /** "Each other creature you control enters with an additional +1/+1 counter on it" (Renata): on other permanents entering. */
  /** `perControlled`: "for each Angel you already control" (Giada): `n` times the permanents matching it its controller controls, the entering one aside. */
  /** "As a historic permanent you control enters, it becomes a 7/7 Dinosaur creature in addition to its other types" (Displaced Dinosaurs): other permanents like this enter with these changes, for as long as they're on the battlefield (CR 614.1c, 614.12). */
  othersEnterAs?: { filter: TargetSpec; mods: Modification[]; text: string }[];
  othersEnterWithCounters?: { filter: TargetSpec; counter: CounterKind; n: number; perControlled?: TargetSpec; /** n times the source's toughness (Arwen, Weaver of Hope). */ perSourceToughness?: true; /** n times the source's power (Master Biomancer). */ perSourcePower?: true; /** n for each mana from a Treasure (Kalain, Reclusive Painter) or an artifact source (Coin of Mastery) spent to cast the entering creature (CR 106.3; none if it wasn't cast). */ perSpentFrom?: "treasure" | "artifact"; /** "And as a Mutant in addition to its other types" (Master Biomancer): it enters with this creature type too (CR 614.1c). */ asSubtype?: string; /** "As long as an opponent lost life this turn, ..." (Vampire Socialite): only while this holds, as the creature would enter. */ while?: StaticCondition; /** "For each opponent who lost life this turn" (Gev, Scaled Scorch): n times this, counted as the creature would enter. */ per?: Amount; text: string }[];
  /** "This creature enters with an additional +1/+1 counter on it" (Master Chef's granted ability): on itself entering. */
  /**
   * The Volvers: "If ~ was kicked with its {U} kicker, it enters ... with flying": the abilities it enters with when that
   * kicker (by index; `cost` as written, before compile() links it) was paid, for as long as it's on the battlefield
   * (CR 614.1c, 702.33f).
   */
  entersKicked?: { which?: number; cost?: string; mods: Modification[] }[];
  entersWithAdditional?: { counter: CounterKind; /** Counted as it enters: "for each instant and sorcery spell you've cast this turn" (Ral, Leyline Prodigy). */ n: Amount }[];
  entersTappedUnless?: EntersCondition;
  entersTappedChoice?: EntersChoice;
  /** "As ~ enters, choose a creature type / a color" (CR 614.12): made as it enters, kept while it's on the battlefield. */
  entersChoose?: { what: ChoiceKind; except?: string; /** "Choose two abilities from among first strike, vigilance, and lifelink" (Greymond): one of several keywords chosen, each added to Chosen.keywords and not offered again. */ many?: true; names?: TargetSpec; purpose?: NamePurpose; /** "Choose artifact, creature, enchantment, instant, or sorcery" (Cloud Key): the card types offered. */ options?: string[]; /** "Choose a number between 1 and 10" (Talion): any whole number in it. */ range?: { min: number; max: number } }[];
  /** "Noncreature spells with mana value equal to the chosen number can't be cast." (Sanctum Prelate): anyone's. */
  noncreatureChosenMvCantBeCast?: true;
  /** "You may cast ~ as though it had flash if it targets a commander." (Timely Ward) */
  flashIfTargetsCommander?: true;
  /** "You may cast ~ as though it had flash if it targets a permanent you control." (Flash Photography) */
  flashIfTargetsYours?: true;
  /** "You may cast ~ as though it had flash if X is 3 or less." (Silver Scrutiny): with the X announced for it at most this (CR 601.3b, 601.2b). */
  flashIfXAtMost?: number;
  /** "As ~ enters, choose a player" / "an opponent" (CR 614.12): kept while it's on the battlefield, as Chosen.player. */
  entersChoosePlayer?: "player" | "opponent";
  /** "As ~ enters, choose two players" (Sower of Discord): two different ones, you too if you like (rulings), as Chosen.players. */
  entersChooseTwoPlayers?: true;
  /** "As Arachne enters, look at an opponent's hand, then choose ...": the opponent is chosen first, then their hand is seen (CR 614.12). */
  entersLookHand?: true;
  /** "As ~ enters, choose Khans or Dragons" (CR 614.12b): the anchor words, one chosen as it enters (Chosen.anchor). */
  entersAnchor?: string[];
  /**
   * Primeval Spawn: "If ~ would enter and it wasn't cast or no mana was spent to cast it, exile it instead" (CR 614.1a),
   * judged by the abilities it would have on the battlefield (614.12): under Humility it enters (rulings).
   */
  exileUnlessCastWithMana?: true;
  /** "If a nontoken creature would enter and it wasn't cast, exile it instead." (Containment Priest, CR 614.1a): any player's, judged as it would exist on the battlefield (CR 614.12, rulings). */
  exileUncastCreatures?: true;
  /**
   * Mox Diamond: "If ~ would enter, you may discard a land card instead. If you do, put ~ onto the battlefield. If you
   * don't, put it into its owner's graveyard." (CR 614.1a): chosen as it would enter; if not, it never entered (rulings).
   */
  entersDiscardInstead?: TargetSpec;
  /**
   * Lake of the Dead: "If ~ would enter, sacrifice a Swamp instead. If you do, put ~ onto the battlefield. If you don't,
   * put it into its owner's graveyard." (CR 614.1a): not optional; with no such permanent to sacrifice, it never enters
   * (rulings), however it would have entered.
   */
  entersSacrificeInstead?: TargetSpec;
  /** Lotus Vale: "sacrifice two untapped lands instead": how many, all at once (rulings: with fewer, it never enters). */
  entersSacrificeInsteadN?: number;
  /** Trinisphere: "As long as ~ is untapped, each spell that would cost less than three mana to cast costs three mana to cast" (CR 601.2f). */
  spellCostAtLeast?: { n: number; whileUntapped?: true };
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
  /**
   * "~ enters with your choice of a flying counter or a first strike counter on it" (Helica Glider), "~ escapes with your
   * choice of a +1/+1 counter or a flying counter on it" (Tizerus Charger, only when it escaped, CR 702.138c): chosen as it
   * enters (CR 614.1c, 614.12), part of how it enters.
   */
  entersCounterChoice?: { counters: CounterKind[]; escaped?: true };
  /**
   * "As ~ enters, it becomes your choice of a 3/3 creature with flying, a 2/5 creature with vigilance, or a 0/12 creature
   * with defender" (Corrupted Shapeshifter, Primal Clay): chosen as it enters (CR 614.12), part of its copiable values
   * (CR 208.2b, 707.2), so a copy effect over what it is; `text` is the choice as offered.
   */
  entersForms?: { except: CopyExcept; text: string }[];
  /** Fear of Abduction: the card exiled to pay its "exile a creature you control" cost is linked to its leaves ability too, with the card its enters ability exiles (CR 607.2q). */
  costExileLinked?: true;
  /** Read ahead (CR 702.155): a Saga that enters with the chapter number its controller chooses in lore counters. */
  readAhead?: true;
  /** "As ~ enters, you may exchange ~'s text box and another creature's" (Deadpool, Trading Card; CR 612.5, 701.12h). */
  entersExchangeText?: true;
  /** "~ enters under the control of an opponent of your choice" (Xantcha, Captive Audience): how it enters (CR 614.1c, 614.12). */
  entersUnderOpponent?: true;
  /**
   * "You may have ~ enter as a copy of any creature on the battlefield[, except ...]" (CR 707.5, 707.9). Cursed
   * Mirror's "as ~ enters, you may have it become a copy of ... until end of turn": the copy ends with the turn.
   */
  entersAsCopy?: { filter: TargetSpec; except?: CopyExcept; /** Vizier of Many Faces: "except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types" (CR 702.128b). */ ifEmbalmed?: CopyExcept; untilEndOfTurn?: boolean; /** Vesuva: "enter tapped as a copy". */ tapped?: true; /** Superior Spider-Man: "When you do, exile that card": a reflexive trigger exiling the card it copied (CR 603.12). */ exileCopied?: true };
  /** "~ enters with N +1/+1 counters on it." (a replacement effect, CR 614.1c); modular N too (CR 702.43a). */
  entersWithCounters?: { counter: CounterKind; n: Amount; /** "With two +1/+1 counters and a lifelink counter on it" (Dust Animus): a second kind, under the same condition. */ also?: { counter: CounterKind; n: number }; /** "Roll X d6. It enters with ... counters equal to the total of those results" (Neverwinter Hydra): `n` dice with this many sides, rolled as it enters. */ rollD?: number; /** Raid: "if you attacked this turn". */ if?: StaticCondition; /** "If you cast it from your hand" (the Myojin). */ castFromHand?: true; /** "If you didn't cast it from your hand" (Epochrasite). */ notCastFromHand?: true; /** "If you cast it" (Nine-Lives Familiar). */ ifCast?: true; /** "If ~ was cast using web-slinging" (Scarlet Spider, CR 702.188a). */ ifWebSlung?: true; /** "If X is 5 or more, it enters with an additional X" (Apocalypse Hydra): twice as many. */ doubleIfXAtLeast?: number; /** "It escapes with twelve +1/+1 counters on it instead" (Polukranos, Unchained, CR 702.138c): as many when it escaped. */ escaped?: number; /** "As ~ enters, choose a creature type. ~ enters with a fellowship counter on it for each creature you control of the chosen type" (Banner of Kinship): counted once that choice, part of how it enters, is made (CR 614.12). */ afterChoice?: ChoiceKind; /** "As ~ enters, choose an opponent. ~ enters with a -1/-1 counter on it for each creature that player controls" (Canker Abomination): counted once the player is chosen, the same way. */ afterPlayer?: true };
  /** Bloodthirst N (CR 702.54a): enters with N +1/+1 counters if an opponent was dealt damage this turn. */
  bloodthirst?: number;
  /** Bloodthirst X (CR 702.54b): enters with a +1/+1 counter for each damage its controller's opponents were dealt this turn. */
  bloodthirstX?: true;
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
   * "As ~ enters, you may reveal any number of other artifact cards from your hand. ~ enters with a +1/+1 counter on it
   * for each card revealed this way." (Arsenal Thresher): amplify 1's choice, of these cards instead of ones sharing a
   * creature type with it.
   */
  amplifyFilter?: TargetSpec;
  /**
   * Dragon's Disciple: "As ~ enters, you may reveal a Dragon card from your hand. If you do or if you control a Dragon, ~
   * enters with a +1/+1 counter on it.": amplify's choice of at most one card (`amplifyFilter`), and one counter if one
   * is revealed or you control a permanent like `orControl` as it would enter (CR 614.12; no reveal asked for then).
   */
  amplifyOne?: { orControl: TargetSpec };
  /**
   * Devour N (CR 702.82a, c): "As this object enters, you may sacrifice any number of [creatures]. This permanent
   * enters with N +1/+1 counters on it for each [one] sacrificed this way." `n: "devoured"`: Thromok's "Devour X,
   * where X is the number of creatures devoured this way".
   * "As ~ enters, sacrifice any number of untapped Forests / permanents / creatures" (CR 614.1c, 614.12) is the same
   * choice: Shimatsu's "enters with that many +1/+1 counters" is n 1; with `defines` there are no counters (n 0), and
   * its power and toughness come from what was sacrificed: "count", Wood Elemental's "equal to the number of Forests
   * sacrificed as it entered" (its CDA reads GameObject.devoured); "total", Dracoplasm's "power becomes the total
   * power of those creatures and its toughness becomes their total toughness" (a layer 7b effect from then on).
   */
  devour?: { n: number | "devoured"; filter: TargetSpec; defines?: "count" | "total" };
  /**
   * "As ~ enters, pay any amount of life" (Minion of the Wastes, Phyrexian Processor; CR 614.12, 119.4): the amount, kept
   * as GameObject.lifePaidAsEntered. `max`: Nameless Race's "The amount you pay can't be more than ...".
   */
  entersPayLife?: { max?: Amount };
  /**
   * "If damage would be dealt to ~, prevent that damage. Remove a +1/+1 counter from ~." (Phantom Centaur): every bit
   * of damage is prevented, and one counter removed per damage event, even when there's none left to remove.
   */
  /** `whileCounter`: "while it has a +1/+1 counter on it" (Undergrowth Champion): only then. */
  phantom?: boolean | "whileCounter";
  /**
   * "If damage would be dealt to ~ while it has a +1/+1 counter on it, prevent that damage and remove that many +1/+1
   * counters from ~" (Ugin's Conjurant, CR 615.5): all of it prevented, as many counters as it has removed (rulings);
   * damage that can't be prevented still removes them (615.12).
   */
  counterShield?: true;
  /**
   * Phyrexian Hydra: "If damage would be dealt to ~, prevent that damage. Put a -1/-1 counter on ~ for each 1 damage
   * prevented this way." Damage that can't be prevented is dealt as usual, with no counters (rulings).
   */
  preventToMinusCounters?: true;
  /**
   * Khârn the Betrayer: "If damage would be dealt to ~, prevent that damage and an opponent of your choice gains control
   * of it" (CR 615.5): the control change happens right away, also when the damage can't be prevented (615.12).
   */
  betrayer?: true;
  /** The Mindskinner: "If a source you control would deal damage to an opponent, prevent that damage and each opponent mills that many cards." (CR 615.5) */
  damageToOpponentsMills?: true;
  /** Angel of Suffering: "If damage would be dealt to you, prevent that damage and mill twice that many cards" (CR 615.5, 615.12). */
  damageToYouMillsTwice?: true;
  /** Nine Lives: "If a source would deal damage to you, prevent that damage and put an incarnation counter on ~": the counter kind, one for each source (rulings, CR 615.5, 615.12). */
  preventToYouCounter?: string;
  /** "Prevent all noncombat damage that would be dealt to you and other permanents you control." (The Wanderer, CR 615.1): see staticRules in damage.ts. */
  preventToYou?: { combat?: "only" | "non"; others?: true; /** Purity: "You gain life equal to the damage prevented this way" (CR 615.5). */ gain?: true };
  /**
   * Stormwild Capridor: "If noncombat damage would be dealt to ~, prevent that damage. Put a +1/+1 counter on ~ for each 1
   * damage prevented this way" (CR 615.5): no counters for damage that can't be prevented (rulings). See staticRules in damage.ts.
   */
  preventToSelfCounters?: { combat?: "only" | "non"; counter: string };
  /**
   * "All damage that would be dealt to you is dealt to enchanted creature instead" (Pariah, CR 614.9): `to` is where it
   * goes (this permanent, or the creature it's attached to); `others`: "you and other permanents you control" (Palisade
   * Giant); `untapped`: "as long as ~ is untapped"; `by`: only damage from such sources ("by artifacts").
   */
  damageToYouRedirect?: { to: "self" | "attached"; others?: true; untapped?: true; by?: TargetSpec };
  /** "Damage isn't removed from ~ during cleanup steps" (Ancient Adamantoise, CR 514.2). */
  keepsDamage?: true;
  /** "~ can't be countered." CR 101.2 */
  cantBeCountered?: boolean;
  /** Banefire: "If X is 5 or more, ~ can't be countered": while its X is at least this (CR 101.2). */
  cantBeCounteredX?: number;
  /** "If you revealed a Dragon card or controlled a Dragon as you cast ~, ~ can't be countered" (Dragonlord's Prerogative): read as kicked. */
  cantBeCounteredKicked?: true;
  /** "Spell mastery — If there are two or more instant and/or sorcery cards in your graveyard, ~ can't be countered" (Exquisite Firecraft): while this holds for its controller. */
  cantBeCounteredIf?: StaticCondition;
  /**
   * "Creature spells you control can't be countered", "Creature spells can't be countered", "Spells you control can't be
   * countered": spells matching `filter`, controlled by this permanent's controller unless `anyone` (CR 101.2).
   */
  /** Spider-Punk: "Spells and abilities can't be countered": activated and triggered abilities on the stack too (CR 101.2). */
  abilitiesUncounterable?: true;
  uncounterable?: { filter: TargetSpec; anyone?: true; /** Thryx: "spells you cast with mana value 5 or greater": X counted (rulings), copies weren't cast (CR 707.10). */ minMv?: number; /** "Spells ... you cast" (Cunning Nightbonder): not copies (CR 707.10), and only while the caster controls it. */ castOnly?: true }[];
  /** "Your opponents can't cast spells during your turn." (a "can't" that wins over any "can", CR 101.2) */
  /** Compleated (CR 702.150a): two fewer loyalty counters for each Phyrexian symbol its caster paid with life. */
  compleated?: true;
  opponentsCantCastYourTurn?: true;
  /** "Your opponents can't cast spells during combat" (Marisi, Breaker of the Coil): during any combat phase, whoever's turn (CR 506.1), even a spell an effect lets or tells them cast (rulings). */
  opponentsCantCastDuringCombat?: true | /** "Players can't cast spells during combat" (Basandra, Battle Seraph): its controller too. */ "all";
  /** "Each opponent who cast a spell this turn can't attack with creatures" (Angelic Arbiter): checked as attackers are declared, counting spells cast before it was there (rulings). */
  opponentsWhoCastCantAttack?: true;
  /** Wardscale Dragon: "As long as ~ is attacking, defending player can't cast spells": the player it's attacking (CR 506.2). */
  defendingCantCastWhileAttacking?: true;
  /** "Each opponent who attacked with a creature this turn can't cast spells" (Angelic Arbiter): one who declared an attacker this turn (rulings). */
  opponentsWhoAttackedCantCast?: true;
  /** "As long as ~ is attached to a creature, your opponents can't cast spells during your turn" (Conqueror's Flail): only while this holds. */
  opponentsCantCastYourTurnIf?: StaticCondition;
  /**
   * "Each opponent can cast spells only any time they could cast a sorcery." (Teferi, Time Raveler; CR 307.1): over any
   * permission to cast as though with flash (rulings), and not while something resolves (cascade).
   */
  opponentsSorceryTiming?: true;
  /** "Players can cast spells only during their own turns" (Dosan the Falling Leaf). */
  castOnlyOwnTurn?: true;
  /** "Players can ... activate abilities only during their own turns" (City of Solitude): every activated ability, mana
   * abilities and abilities of cards in other zones included (rulings). */
  activateOnlyOwnTurn?: true;
  /** "No more than one creature can attack each combat." / "... block ..." (Silent Arbiter; CR 508.1c, 509.1b): for everyone. */
  /** "No more than one creature can attack each combat" (Silent Arbiter); `attackYou`: "... can attack you each combat" (Crawlspace), its controller only, not their planeswalkers (rulings). */
  combatLimit?: { attack?: number; block?: number; attackYou?: number; /** "No more than one creature can attack ~ each combat" (The Eternal Wanderer). */ attackSelf?: number; /** "As long as ~ is tapped, no more than one creature can attack you each combat" (Mirri, Weatherlight Duelist). */ attackYouIfTapped?: number };
  /** "You may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant." (Teferi, Temporal Archmage's emblem) */
  loyaltyAtInstantSpeed?: true;
  /** Teferi, Master of Time: "You may activate loyalty abilities of ~ on any player's turn any time you could cast an instant." Still once each turn (CR 606.3). */
  selfLoyaltyAtInstantSpeed?: true | "enteredThisTurn";
  /** "Your opponents can't cast spells with mana value 3 or less." (Brisela, Voice of Nightmares): this many or less. */
  opponentsCantCastMvAtMost?: number;
  /** "Your opponents can't cast spells with even mana values." (Void Winnower). */
  opponentsCantCastEven?: true;
  /** Lavinia, Azorius Renegade: "Each opponent can't cast noncreature spells with mana value greater than the number of lands that player controls." */
  opponentsNoncreatureMvAboveLands?: true;
  /** "Your opponents can't block with creatures with even mana values." (Void Winnower). */
  opponentsCantBlockEven?: true;
  /**
   * "Creatures with islandwalk can be blocked as though they didn't have islandwalk" (Undertow), "creatures with landwalk
   * abilities can be blocked as though they didn't have those abilities" (Staff of the Ages, "*"): any creature may block
   * them as though they hadn't (CR 509.1b; rulings: it doesn't take the ability away).
   */
  walkBlockable?: string[];
  /** "You can't cast creature spells." (Steel Golem), "You can't cast noncreature spells." (Nikya): its controller. */
  youCantCast?: TargetSpec[];
  /**
   * "Noncreature spells with mana value 4 or greater can't be cast", "Noncreature spells with {X} in their mana costs can't
   * be cast" (Gaddock Teeg), "Creature spells can't be cast" (Aether Storm): no player's (CR 101.2). The mana value is the
   * spell's, X as chosen (CR 202.3e).
   */
  cantBeCast?: { filter: TargetSpec; hasX?: true; text: string }[];
  /** "Your opponents can't cast noncreature spells." (Narset Transcendent's emblem): each opponent of its controller. */
  opponentsCantCast?: TargetSpec[];
  /** "You can't play lands if ~ was cast this turn" (Rock Jockey): its controller, while it's a permanent that was cast this turn. */
  noLandsIfCastThisTurn?: true;
  /** "Enchanted creature's controller can't cast creature spells." (Brand of Ill Omen): that creature's controller now. */
  enchantedControllerCantCast?: TargetSpec[];
  /**
   * "During your turn, your opponents can't ... activate abilities of artifacts, creatures, or enchantments" (Grand
   * Abolisher): permanents on the battlefield only, mana abilities too (rulings); see abolisherBan.
   */
  opponentsCantActivateYourTurn?: true;
  /** Stabilizer: "Players can't cycle cards." No cycling ability (landcycling and the like too, CR 702.29f) can be activated. */
  noCycling?: true;
  /**
   * "Stun counters can't be removed from permanents your opponents control." (Fear of Sleep Paralysis): counters of this
   * kind stay on its controller's opponents' permanents, nor are they moved off them (rulings); see countersStay.
   */
  opponentsCountersStay?: CounterKind;
  /** "Players can't activate planeswalkers' loyalty abilities." (The Immortal Sun): while it's on the battlefield. */
  noLoyaltyAbilities?: true;
  /** Solemnity: "Players can't get counters." (counters.ts playerCountersBanned). */
  noPlayerCounters?: true;
  /** Solemnity: "Counters can't be put on artifacts, creatures, enchantments, or lands." Permanents with any of these card types (counters.ts countersBanned). */
  noCountersOn?: string[];
  /** Blightbeetle: "Creatures your opponents control can't have +1/+1 counters put on them." (counters.ts countersBanned). */
  opponentsCreaturesNoCounters?: CounterKind;
  /** Melira, Sylvok Outcast: "Creatures you control can't have -1/-1 counters put on them." (counters.ts countersBanned). */
  yourCreaturesNoCounters?: CounterKind;
  /** Melira, Sylvok Outcast: "You can't get poison counters." (counters.ts playerCountersToPut). */
  noPoisonForYou?: true;
  /** Tatterkite: "~ can't have counters put on it." (counters.ts countersBanned). */
  selfNoCounters?: true;
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
  activationTaxes?: { filter?: TargetSpec; n: number; text: string; /** Only abilities its controller's opponents activate (Tithe Taker). */ opponents?: true; /** Only during its controller's turn. */ yourTurn?: true; /** Only loyalty abilities of planeswalkers (Eidolon of Obstruction). */ loyalty?: true }[];
  /**
   * The Leylines: "If ~ is in your opening hand, you may begin the game with it on the battlefield" (CR 103.6a). Gemstone
   * Caverns: only if you're not the starting player, with a counter on it, and "if you do, exile a card from your hand".
   */
  beginOnBattlefield?: true | { notStarting: true; counter: CounterKind; exileFromHand: true };
  /**
   * "You may reveal ~ from your opening hand. If you do, at the beginning of the first upkeep, ..." (the Chancellors,
   * CR 103.6b): revealing it makes a delayed triggered ability of the revealing player's (CR 603.7) with these
   * instructions, at the first upkeep of the game ("nextTurnUpkeep"), their first upkeep ("yourNextUpkeep") or their
   * first precombat main phase ("yourNextFirstMain"). Each one revealed makes its own (Chancellor of the Spires rulings).
   */
  openingReveal?: { when: "nextTurnUpkeep" | "yourNextUpkeep" | "yourNextFirstMain"; body: AbilityBody };
  /** "If you would gain life, you gain twice that much life instead" (a replacement effect, CR 614.1a). */
  doubleLifeGain?: boolean;
  /** "If you would gain life while you have 5 or less life, ..." (Phial of Galadriel): `doubleLifeGain` only while this holds, as the life would be gained. */
  doubleLifeGainIf?: StaticCondition;
  /** "If an opponent would lose life during your turn, they lose twice that much life instead" (Bloodletter of Aclazotz). */
  opponentsLoseDouble?: true;
  /**
   * "You may look at an additional two cards each time you surveil" (Enhanced Surveillance, CR 701.25): that many more
   * cards in each surveil of its controller's; they're part of what's surveilled (rulings), and each one adds its own.
   */
  surveilMore?: number;
  /** "If you would scry a number of cards, scry that many cards plus one instead." (Kenessos, Priest of Thassa, CR 614.1a): one more for each. */
  scryMore?: number;
  /** "If you would scry a number of cards, draw that many cards instead." (Eligeth, Crossroads Augur, CR 614.1a). */
  scryToDraw?: true;
  /** "You gain life rather than lose life from radiation" (Strong, the Brutish Thespian; CR 728.1, 614.1a). */
  radiationGains?: true;
  /** "Each opponent can't draw more than one card each turn" (Narset, Parter of Veils). */
  opponentsDrawOnce?: true;
  /** "Each player can't draw more than one card each turn" (Spirit of the Labyrinth). */
  playersDrawOnce?: true;
  /** "Lethal damage dealt to creatures you control is determined by their power rather than their toughness" (Zilortha, Strength Incarnate). */
  lethalByPower?: true;
  /** "Players can't draw cards" (Maralen of the Mornsong, Omen Machine): no draw happens, for any reason, so nothing replaces one (rulings). */
  playersCantDraw?: true;
  /**
   * Notion Thief: "If an opponent would draw a card except the first one they draw in each of their draw steps, instead
   * that player skips that draw and you draw a card" (a replacement effect, CR 614.1a, 614.10).
   */
  stealsDraws?: true;
  /**
   * Alms Collector: "If an opponent would draw two or more cards, instead you and that player each draw a card" (CR
   * 614.1a), applied to the instruction as a whole before any single draw (CR 121.2a, 616.1g; rulings).
   */
  splitsBigDraws?: true;
  /**
   * "If you tap a permanent for mana, it produces twice as much of that mana instead" (Mana Reflection; three times,
   * Nyxbloom Ancient): a replacement effect on the mana a mana ability with {T} in its cost produces (CR 106.12b,
   * 614.1a), the factor it multiplies by. Several multiply together (rulings).
   */
  tapManaTimes?: number;
  /**
   * "Creatures your opponents control can be the targets of spells and abilities as though they didn't have hexproof.
   * Ward abilities of those creatures don't trigger." (Nowhere to Run, CR 702.11e).
   */
  exposesOpponentsCreatures?: true;
  /**
   * Glaring Spotlight: "Creatures your opponents control with hexproof can be the targets of spells and abilities you
   * control as though they didn't have hexproof" (CR 702.11e: "hexproof from" too); ward still triggers.
   */
  seesOpponentsCreatures?: true;
  /**
   * Kaya, Bane of the Dead: "Your opponents and permanents your opponents control with hexproof can be the targets of
   * spells and abilities you control as though they didn't have hexproof" (CR 702.11e).
   */
  seesOpponents?: true;
  /** "If you tap a basic land for mana, it produces three times as much of that mana instead" (Virtue of Strength). */
  tapBasicManaTimes?: number;
  /** "If you would gain life, you gain that much life plus 1 instead" (CR 614.1a): N for each. */
  lifeGainPlus?: number;
  /** "Damage that would reduce your life total to less than 1 reduces it to 1 instead" (Ali from Cairo): that number. */
  lifeFloor?: number;
  /** "If you control a creature, damage that would ..." (Serra the Benevolent's emblem): `lifeFloor` only while this holds. */
  lifeFloorIf?: StaticCondition;
  /** "As long as you're the monarch, damage doesn't cause you to lose life" (Archon of Coronation): the damage is still
   * dealt, with all its other results (lifelink, triggers, commander damage; rulings). Only while the condition holds. */
  damageNoLifeLossIf?: StaticCondition;
  /** "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead";
   * "always": "If you would draw a card, draw two cards instead" (Thought Reflection), the draw step's first draw too. */
  drawTwoInstead?: true | "always";
  /**
   * "Max speed — If you would draw a card, draw two cards instead" (Vnwxt): `drawTwoInstead` only while this holds (CR
   * 702.178a). "If you would draw a card while you have no cards in hand, draw two cards instead" (Phial of Galadriel): as
   * each draw would happen.
   */
  drawTwoIf?: StaticCondition;
  /**
   * Abundance: "If you would draw a card, you may instead choose land or nonland and reveal cards from the top of your
   * library until you reveal a card of the chosen kind. Put that card into your hand and put all other cards revealed this
   * way on the bottom of your library in any order." (CR 614.1a; each draw of several separately, rulings).
   */
  drawAbundance?: true;
  /**
   * Underrealm Lich: "If you would draw a card, instead look at the top three cards of your library, then put one into
   * your hand and the rest into your graveyard." (CR 614.1a): how many it looks at; each draw of several separately (rulings).
   */
  drawDig?: number;
  /** Tomorrow, Azami's Familiar: drawDig's other cards go on the bottom of the library in any order, not into the graveyard. */
  drawDigBottom?: true;
  /** "If you would draw a card while your library has no cards in it, you win the game instead." (Laboratory Maniac, CR 614.1a) */
  drawEmptyWins?: true;
  /**
   * Out of the Tombs: "If you would draw a card while your library has no cards in it, instead return a creature card from
   * your graveyard to the battlefield. If you can't, you lose the game." (CR 614.1a), for each draw (rulings).
   */
  drawEmptyReturn?: true;
  /** "Your opponents can't cast spells from anywhere other than their hands." (Drannith Magistrate) */
  opponentsOnlyFromHand?: true;
  /**
   * "Creature cards in graveyards and libraries can't enter the battlefield." (Grafdigger's Cage), "Permanent cards in
   * graveyards ..." (Soulless Jailer), "Nonland permanent cards ..." (Weathered Runestone): such a card stays where it is.
   */
  cantEnterFrom?: { zones: ("graveyard" | "library")[]; what: "creature" | "permanent" | "nonlandPermanent" };
  /** "Players can't cast spells from graveyards or libraries." (Grafdigger's Cage), "... noncreature spells from graveyards or exile" (Soulless Jailer). */
  cantCastFrom?: { zones: ("graveyard" | "library" | "exile")[]; noncreature?: true };
  /** Ashes of the Abhorrent: "Players can't ... activate abilities of cards in graveyards." Triggered abilities still work (rulings). */
  noGraveyardActivations?: true;
  /** Ground Seal: "Cards in graveyards can't be the targets of spells or abilities." Untargeted effects still reach them (rulings). */
  graveyardUntargetable?: true;
  /** Aven Mindcensor: "If an opponent would search a library, that player searches the top four cards of that library instead." (CR 614.1a) */
  opponentsSearchTop?: number;
  /**
   * Ashiok, Dream Render: "Spells and abilities your opponents control can't cause their controller to search their
   * library." Only that player's own library, searched by them; any shuffle the effect calls for still happens (rulings).
   */
  opponentsCantSearchOwn?: true;
  /**
   * Stranglehold: "Your opponents can't search libraries." Any library, for any reason; any shuffle the effect calls for
   * still happens, but not after a "may" they can't choose (rulings).
   */
  opponentsCantSearch?: true;
  /** Mindlock Orb: "Players can't search libraries." Stranglehold's rule for every player, its controller too. */
  playersCantSearch?: true;
  /** "Players can't play lands." (Territorial Dispute): no land plays for anyone, whatever lets them (CR 305.2, 101.2). */
  playersCantPlayLands?: true;
  /**
   * Library of Leng: "If an effect causes you to discard a card, discard it, but you may put it on top of your library
   * instead of into your graveyard." (CR 614.1a). Never a discard as a cost (rulings).
   */
  discardToTop?: true;
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
  /** "Your life total can't change." (Platinum Emperion, CR 119.7-8): its controller can't gain or lose life, nor pay more than 0 life. */
  lifeCantChange?: true;
  /** "Players can't pay life to cast spells or to activate abilities that aren't mana abilities" (Karn's Sylex): see game.ts sylexed. */
  noLifeCosts?: true | "all";
  /** "All damage is dealt as though its source had wither" (Everlasting Torment, CR 702.80a): see damage.ts. */
  allDamageWither?: true;
  /**
   * Angel of Jubilation: "Players can't ... sacrifice creatures to cast spells or activate abilities" ("creatures");
   * Yasharn: "... sacrifice nonland permanents ..." ("nonland"). Costs only, mana abilities' too (rulings); see
   * cards.ts canSacrificeForCost.
   */
  noSacrificeCosts?: "creatures" | "nonland";
  /** "If a player would gain life, that player gains no life instead" (Sulfuric Vortex): a replacement (CR 614.1a), not "can't gain life". */
  gainsNoLife?: true;
  /** "If an opponent would gain life, that player loses that much life instead" (Tainted Remedy, CR 614.1a). */
  opponentsGainLose?: true;
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
  /** "During your turn, you and ~ have hexproof" (Gruul Spellbreaker): `youHave` only while its controller is the active player. */
  youHaveDuringYourTurn?: true;
  /** "As long as ~ has a shield counter on him, you and other Heroes you control have hexproof" (Captain America, Super-Soldier): `youHave` only while this is true. */
  youHaveIf?: StaticCondition;
  /** Serra's Emissary: its controller has protection from the card type chosen as it entered (CR 702.16b). */
  youProtectedFromChosenType?: true;
  /** "You and permanents you control have protection from Salamanders" (Gor Muldrak, Amphinologist): its controller has this protection keyword (CR 702.16b, 702.16e); the permanents get it from a static ability. */
  youProtectionFrom?: string;
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
  /** The Valeyard: "If an opponent would face a villainous choice, they face that choice an additional time" (CR 701.55c). */
  villainAgain?: true;
  /**
   * Platinum Angel: "You can't lose the game and your opponents can't win the game" (`cantLose` "you", `cantWin`
   * "opponents"); Abyssal Persecutor the other way round. Conceding still works (rulings).
   */
  cantLose?: "you" | "opponents";
  /** Gideon of the Trials' emblem: "As long as you control a Gideon planeswalker, ...": `cantLose` and `cantWin` only while this holds. */
  gameEndIf?: StaticCondition;
  /**
   * "You don't lose the game for having 0 or less life" (Marina Vendrell's Grimoire, Phyrexian Unlife): its controller
   * skips the state-based action of CR 704.5a while it's on the battlefield; they can still lose any other way.
   */
  noZeroLifeLoss?: true;
  cantWin?: "you" | "opponents";
  /**
   * The Golden Throne: "If you would lose the game, instead exile ~ and your life total becomes 1." A replacement effect
   * (CR 614.1a), for any way of losing but conceding (rulings).
   */
  loseGameExileSelf?: true;
  /**
   * "You may activate abilities of creatures you control as though those creatures had haste" (Thousand-Year Elixir,
   * CR 302.6): {T} abilities of creatures that came under your control this turn. They don't gain haste (rulings).
   */
  creatureAbilitiesHaste?: true;
  /** "You have no maximum hand size." (CR 402.2): its controller doesn't discard down in cleanup; "all": "Players have ...". */
  noMaxHandSize?: boolean | "all";
  /** Ensnaring Bridge: "Creatures with power greater than the number of cards in your hand can't attack" (any player's, checked as attackers are declared, rulings). */
  attackPowerCapHand?: true;
  /** "Your maximum hand size is eight", "... is increased by one", "Each opponent's maximum hand size is reduced by seven" (CR 402.2). */
  /**
   * `minus`: Winter, Misanthropic Guide's "each opponent's maximum hand size is equal to seven minus the number of those
   * card types", `set` less this, counted as it applies; `if`: only while this holds (its delirium).
   */
  handSize?: { who: "you" | "opponents"; set?: number; plus?: number; minus?: Amount; if?: StaticCondition; /** Midnight Oil: "Your maximum hand size is equal to the number of hour counters on ~", counted whenever it's checked. */ equal?: Amount }[];
  /** K'rrik: "For each {B} in a cost, you may pay 2 life rather than pay that mana" (see blackForLife), for its controller. */
  lifeForBlack?: true;
  /** Doc Aurlock: "Plotting cards from your hand costs {2} less" (CR 702.170a, 601.2f): less generic mana, for its controller. */
  plotLess?: number;
  /** Exiled Doomsayer: "All morph costs cost {2} more" (CR 118.7, 702.37b): more generic mana to turn any face-down permanent face up with its morph or megamorph cost, not a disguise cost or a manifested card's mana cost, nor casting it face down. */
  morphTax?: number;
  /** Embalmer's Tools: "Activated abilities of creature cards in your graveyard cost {1} less to activate" (CR 601.2f). */
  yardCreatureAbilityLess?: number;
  /** Catalyst Stone: "Flashback costs you pay cost {2} less" (CR 601.2f). */
  flashbackLess?: number;
  /** Catalyst Stone: "Flashback costs your opponents pay cost {2} more" (CR 601.2f). */
  flashbackTax?: number;
  /** Inquisitive Glimmer: "Unlock costs you pay cost {1} less" (CR 709.5e, 601.2f): less generic mana, for its controller's Rooms. */
  unlockLess?: number;
  /** Chromatic Orrery: "You may spend mana as though it were mana of any color." (CR 609.4b), for its controller's costs. */
  spendAnyColor?: true;
  /** "Players may spend mana as though it were mana of any color" (Mycosynth Lattice): every player, for every cost (CR 609.4b). */
  spendAnyColorAll?: true;
  /** Agatha's Soul Cauldron: "You may spend mana as though it were mana of any color to activate abilities of creatures you control" (CR 609.4b). */
  spendAnyColorCreatureAbilities?: true;
  /** Vizier of the Menagerie: "You can spend mana of any type to cast creature spells" (CR 609.4b), its controller's. */
  spendAnyTypeCreatureSpells?: true;
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
  /** "~ is every nonbasic land type" (Planar Nexus): a characteristic-defining ability (CR 604.3), applied first in layer 4 (613.3). */
  allNonbasicLandTypes?: true;
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
  /** "Each noncreature spell you cast has conspire" (Raiding Schemes, Wort, Rassilon): as for spellsHaveConvoke (CR 702.78a). */
  spellsHaveConspire?: { filter: TargetSpec; fromExile?: true; text: string }[];
  spellsHaveConvoke?: { filter: TargetSpec; /** "Spells you cast from exile" (Hoarding Broodlord). */ fromExile?: true; /** "The first historic spell you cast each turn" (Peri Brown): only while no other spell matching `filter` was cast by its controller this turn. */ firstEachTurn?: true; text: string }[];
  /** "Nonartifact spells you cast have improvise" (Inspiring Statuary), CR 702.126. */
  spellsHaveImprovise?: { filter: TargetSpec; /** "The first nonartifact spell you cast each turn" (The Fifteenth Doctor), as for convoke. */ firstEachTurn?: true; text: string }[];
  /** "Spells you cast have delve" (Teval, Arbiter of Virtue), CR 702.66a: while they're cast and paid for. */
  spellsHaveDelve?: { filter: TargetSpec; text: string }[];
  /** "Your devotion to each color and each combination of colors is increased by one" (Altar of the Pantheon), CR 700.5: added to its controller's devotion to any color or colors. */
  devotionBonus?: number;
  /** "Dinosaur spells you cast have prowl {2}{R}" (Hunting Velociraptor), CR 702.76a: that alternative cost, for those spells. */
  spellsHaveProwl?: { filter: TargetSpec; mana: string; text: string }[];
  /** "Assassin spells you cast have freerunning {B}{B}" (Ezio Auditore da Firenze), CR 702.173a: that alternative cost, for those spells (AltCostKind "grantedFreerunning"). */
  spellsHaveFreerunning?: { filter: TargetSpec; mana: string; text: string }[];
  /** "Each legendary spell you cast that's one or more colors has web-slinging {G}{W}{U}" (Amazing Spider-Man), CR 702.188a: that alternative cost, for those spells (AltCostKind "grantedWebSlinging"). */
  spellsHaveWebSlinging?: { filter: TargetSpec; mana: string; text: string }[];
  /** "Each creature spell you cast with mana value 4 or greater has blitz. The blitz cost is equal to its mana cost." (Henzie "Toolbox" Torre), CR 702.152a: blitz for those spells, its cost their mana cost (AltCostKind "grantedBlitz"). */
  spellsHaveBlitz?: { filter: TargetSpec; text: string }[];
  /** Henzie "Toolbox" Torre: "Blitz costs you pay cost {1} less for each time you've cast your commander from the command zone this game" (CR 601.2f): this much generic mana per such cast, off each blitz cost its controller pays. */
  blitzLessPerCommanderCast?: number;
  /** "Artifact cards and red creature cards in your hand have warp {2}{R}" (Tannuk, Steadfast Second): warp for those cards in its controller's hand (CR 702.185a). */
  handWarp?: { filter: TargetSpec; mana: string; text: string }[];
  /** "Each instant and sorcery card in your hand has miracle {2}" (Lorehold, the Historian): miracle for those cards in its controller's hand (CR 702.94a), so drawing one as the first card drawn this turn triggers it. */
  handMiracle?: { filter: TargetSpec; mana: string; text: string }[];
  /** "Each nonland card in your hand without foretell has foretell. Its foretell cost is equal to its mana cost reduced by {2}." (Dream Devourer): foretell for those cards in its controller's hand (CR 702.143a), a foretell cost of their mana cost less this much generic mana (rulings). */
  handForetell?: { reduce: number; text: string }[];
  /** "Instant and sorcery spells you cast have storm" (Prismari, Ral's emblem): each such spell's own storm triggers (CR 702.40a). */
  spellsHaveStorm?: { filter: TargetSpec; text: string }[];
  spellsHaveCascade?: { filter?: TargetSpec; from?: "hand" | "exile"; /** 'Have "Cascade, cascade."' (Zhulodok): two instances. */ twice?: true; first?: true; treasure?: true; commander?: true; yourTurn?: true; maxMv?: Amount; text: string }[];
  /** Shadow the Hedgehog: "Each spell you cast has split second if mana from an artifact was spent to cast it" (CR 702.61a, 106.3). */
  splitSecondIfArtifactMana?: true;
  /** Samut, Tyrant of Naktamun: "Instant and sorcery spells you control have split second" (CR 702.61a): spells of its controller's on the stack that match. */
  spellsHaveSplitSecond?: TargetSpec[];
  /** Cast Through Time: "Instant and sorcery spells you control have rebound" (CR 702.88a), as they finish resolving. */
  spellsHaveRebound?: TargetSpec[];
  /** "Instant and sorcery spells you control have lifelink" (Soulfire Grand Master), "... deathtouch" (Pestilent Spirit): its controller's spells that match, while it's on the battlefield, as their damage is dealt (CR 702.15b, 702.2b). */
  spellsHaveKeywords?: { filter: TargetSpec; keyword: "Lifelink" | "Deathtouch" }[];
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
  activationLess?: { n: number; filter: TargetSpec; atLeastOne?: true; /** "Enchanted artifact's activated abilities cost {2} less to activate" (Power Artifact): only the permanent this Aura is attached to. */ enchanted?: true }[];
  /**
   * Zirda, the Dawnwaker: "Abilities you activate that aren't mana abilities cost {2} less to activate. This effect can't
   * reduce the mana in that cost to less than one mana." Any such ability its controller activates, from any zone (rulings).
   */
  youActivateLess?: { n: number; atLeastOne?: true };
  /** Fluctuator: "Cycling abilities you activate cost {2} less to activate", from any zone (CR 702.29f: typecycling too). */
  cyclingLess?: number;
  /**
   * "Players can't untap more than one nonbasic land during their untap steps" (Winter Moon), "You can't untap more than
   * one land during your untap step" (Mungha Wurm, `you`), "As long as ~ is untapped, players can't untap more than two
   * permanents ..." (Static Orb, `whileUntapped`): the active player chooses which of them untap (CR 502.3).
   */
  untapLimits?: { n: number; filter: TargetSpec; you?: true; whileUntapped?: true }[];
  /** "Ninjutsu abilities you activate cost {1} less to activate" (Silver-Fur Master, CR 602.2b applies 601.2f). */
  ninjutsuLess?: number;
  /** "Boast abilities you activate cost {1} less to activate for each Dragon you control" (Dragonkin Berserker): generic mana only (CR 602.2b applies 601.2f). */
  boastLess?: AmountExpr;
  /** "Each creature card in your hand has ninjutsu {2}{U}{B}" (Satoru Umezawa): these abilities for its controller's cards in hand that match (CR 113.6, 702.49a). */
  handGrants?: { filter: TargetSpec; activated: ActivatedAbility[]; /** "In each player's hand" (Homing Sliver): every player's cards, not only its controller's. */ everyHand?: true }[];
  /**
   * "Each creature card in your graveyard has unearth {2}{B}" (Sedris): this ability for its controller's graveyard cards
   * that match, an ability of each card (CR 113.6, rulings). `manaValueCost`: "encore {X}, where X is its mana value"
   * (Graywater's Fixer): each card's mana value is the ability's mana cost.
   */
  yardGrants?: { filter: TargetSpec; activated: ActivatedAbility; manaValueCost?: true }[];
  /** The Master, Multiplied: "Triggered abilities you control can't cause you to sacrifice or exile creature tokens you control." */
  ownTriggersSpareTokens?: true;
  /** "The "legend rule" doesn't apply to permanents you control" (CR 704.5j): to these, from the source's controller's view. */
  noLegendRule?: TargetSpec[];
  /**
   * "If you would copy a spell one or more times, instead copy it that many times plus an additional time. You may choose
   * new targets for the additional copy." (Twinning Staff, CR 614.1a): one more copy for each such permanent its
   * controller controls (rulings), only when copying a spell, not a card.
   */
  extraSpellCopy?: true;
  /** "Power-up abilities of other creatures you control cost {3} less to activate." (Hulk, Gamma Goliath; CR 702.193) */
  powerUpLess?: number;
  /** "Exhaust abilities of other permanents you control cost {2} less to activate" (Boom Scholar): generic mana only. */
  exhaustLess?: number;
  /** "Each power-up ability of permanents you control can be activated an additional time." (Wonder Man; CR 702.193a) */
  powerUpAgain?: true;
  /**
   * "The first activated ability of an artifact you activate each turn costs {2} less to activate" (Tezzeret, Betrayer of
   * Flesh; CR 602.2b applies 601.2f): mana abilities count as that first ability too (rulings). See TurnLog.artifactAbility.
   */
  firstArtifactAbilityLess?: number;
  equipLess?: { n: number; targetSelf?: true; otherEquipment?: true; /** "~'s equip abilities" (Firion's token copies): only this Equipment's own. */ self?: true; /** "That target enchanted creature" (Strong Back): the creature this Aura is attached to. */ targetEnchanted?: true; /** Only while this holds (a Class level's). */ if?: StaticCondition }[];
  /** "Aura spells you cast that target enchanted creature cost {3} less to cast" (Strong Back, CR 601.2f). */
  auraLessEnchanted?: number;
  /** "You may activate equip abilities any time you could cast an instant" (Leonin Shikari); Forge Anew's "During your turn, ...". */
  equipAtInstantSpeed?: "always" | "yourTurn";
  /**
   * Forge Anew: "You may pay {0} rather than pay the equip cost of the first equip ability you activate during each of your
   * turns" (`"yourTurn"`); Bruenor Battlehammer: "... you activate each turn" (`"eachTurn"`).
   */
  firstEquipFree?: "yourTurn" | "eachTurn";
  /** Kíli the Resourceful: only as long as this holds ("as long as you have an enduring story"). */
  firstEquipFreeWhile?: StaticCondition;
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
  triggersAgain?: { by?: { event: "enters" | "dies" | "attacks" | "combatDamage" | "castOrCopy" | /** Krang, the All-Powerful: "If a player drawing a card causes ...". */ "draws" | /** Gandalf the White: entering, or leaving the battlefield for any zone. */ "entersOrLeaves"; filter?: TargetSpec[] }; of?: { filter: TargetSpec; other?: true }[]; anchor?: string; /** Cloud, Midgar Mercenary: "As long as ~ is equipped, ... a triggered ability of ~ or an Equipment attached to it". */ selfOrEquipment?: true; /** Wizard's Staff: "If a triggered ability of equipped creature triggers": the creature it's attached to, whoever controls either. */ ofEquipped?: true; /** The Masamune's granted "a triggered ability of this creature or an emblem you own": this permanent's own abilities and its controller's emblems'. */ selfOrEmblems?: true; /** Bifur: "As long as you have an enduring story" (CR 702.195b). */ enduringStory?: true }[];
  /** Fist of Suns: "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast" (an alternative cost, CR 118.9). */
  payWUBRG?: true;
  /** Omniscience: "You may cast spells from your hand without paying their mana costs" (AltCostKind "omniscience"). */
  castFromHandFree?: true;
  /**
   * "You may pay {0} rather than pay the mana cost for Zombie creature spells you cast" (Rooftop Storm, AltCostKind
   * "payZero", CR 118.9): spells matching `filter`; `fromHand`: cast from your hand; `once`: "once each turn", for each
   * such permanent; `maxMvCounters`: "with mana value X or less, where X is the number of time counters on ~" (As
   * Foretold), checked with X at 0 (rulings).
   */
  payZero?: {
    filter?: TargetSpec;
    fromHand?: true;
    /** Warped Space: "for a spell you cast from exile". */
    fromExile?: true;
    once?: true;
    maxMvCounters?: string;
    /** One with the Multiverse: "once during each of your turns, you may cast a spell from your hand or the top of your library without paying its mana cost". */
    yourTurn?: true;
    fromHandOrTop?: true;
    /** Demon of Fate's Design: life equal to the spell's mana value rather than {0} (AltCostKind "lifeForMv"). */
    life?: true;
    /** Kentaro, the Smiling Cat: generic mana equal to the spell's mana value rather than {0} (AltCostKind "genericMv"). */
    genericMv?: true;
    /** Weftwalking: "The first spell each player casts during each of their turns may be cast without paying its mana cost": any player's, during their own turn, while they haven't cast a spell this turn. */
    eachPlayerFirst?: true;
    /** Aluren: "Any player may cast creature spells with mana value 3 or less without paying their mana costs and as though they had flash": any player's spells, at instant speed when cast this way. */
    anyPlayer?: true;
    flash?: true;
  };
  /**
   * Obstinate Baloth: "If a spell or ability an opponent controls causes you to discard ~, put it onto the battlefield
   * instead of putting it into your graveyard" (a replacement effect, CR 614.1a). It's still discarded (rulings).
   */
  discardedToBattlefield?: boolean;
  /** Dodecapod: "with two +1/+1 counters on it", as it enters that way. */
  discardedToBattlefieldCounters?: number;
  /**
   * "If an opponent would mill one or more cards, they mill that many cards plus four instead" (The Water Crystal),
   * "... twice that many cards instead" (Bruvac): replacement effects on its controller's opponents' mills (CR 614.1a).
   */
  millMore?: ({ plus: number } | { twice: true })[];
  /** "Skip your draw step." (CR 614.10): its controller's draw steps don't happen. */
  skipDrawStep?: boolean;
  /** "Skip your upkeep step if you have no cards in hand" (Gibbering Descent, CR 614.10): its controller's upkeep doesn't happen while their hand is empty. */
  skipUpkeepIfHellbent?: true;
  /** "Players skip their untap steps." (Stasis, CR 614.10): no player's untap step happens. */
  skipUntapSteps?: boolean;
  /** Eon Hub: "Players skip their upkeep steps": every player's, the whole step (CR 614.10). */
  skipUpkeepSteps?: true;
  /** "You draw a card during each opponent's draw step" (Teferi, Who Slows the Sunset's emblem): after that player's draw (rulings). */
  drawsInOpponentsDrawStep?: boolean;
  /** "You may choose not to untap ~ during your untap step." (CR 502.3): its controller decides as the step untaps. */
  mayNotUntap?: boolean;
  /**
   * "You may cast spells as though they had flash", "... sorcery spells ...", "... creature spells ..." (CR 702.8a): its
   * controller may cast spells like these any time they could cast an instant.
   */
  flashFor?: TargetSpec[];
  /** "As long as ~ is tapped, you may cast spells as though they had flash" (Quicksilver, Speedster): any spell, while one of these holds. */
  flashWhile?: StaticCondition[];
  /** "As long as ~'s power is even, you may cast noncreature spells as though they had flash" (Kianne): spells like this, while the condition holds. */
  flashForWhile?: { filter: TargetSpec; condition: StaticCondition }[];
  /** "During each opponent's end step, you may cast spells as though they had flash" (Final-Word Phantom, CR 702.8a). */
  flashInOpponentsEndStep?: true;
  /** "Any player may cast Sliver spells as though they had flash" (Quick Sliver, CR 702.8a): every player may, not only its controller. */
  flashForAll?: TargetSpec[];
  /** "The first creature spell you cast each turn ... can be cast as though it had flash" (Radagast of Rhosgobel): only while you've cast none of these this turn. */
  flashForFirst?: TargetSpec[];
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
  /** Krark's Thumb: each coin its controller would flip is two coins, and they ignore one (rulings: they see both first). */
  flipTwo?: true;
  /** Edgar, King of Figaro: "The first time you flip one or more coins each turn, those coins come up heads and you win those flips" (run-dice.ts rigged; TurnLog.coinsFlipped). */
  firstFlipsHeads?: true;
  /** "You may play Forests from your graveyard." (Titania, Nature's Force): only lands with one of these subtypes. */
  landsFromGraveyardOf?: string[];
  /** Glacierwood Siege's "• Sultai — You may play lands from your graveyard.": the same as `landsFromGraveyard`, only while this holds. */
  landsFromGraveyardIf?: StaticCondition;
  /**
   * "Mayhem" without a cost on a land (Oscorp Industries): "You may play this card from your graveyard if you discarded
   * it this turn" (CR 702.187c), with a land play and the usual timing (rulings).
   */
  mayhemLand?: true;
  /** "Land cards in your graveyard have dredge 2" (The Necrobloom): the matching cards in its controller's graveyard have dredge N. */
  dredgeGrants?: { filter: TargetSpec; n: number }[];
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
    /** Serra Paragon: "If you do, it gains '...'": the permanent the land or spell becomes has this ability (GameObject.entersGaining). */
    gains?: string;
    /** Edgar, Master Machinist: "If you cast a spell this way, that artifact enters tapped" (CR 614.1c). */
    entersTapped?: true;
    /** Only while this holds: a station symbol's (Exploration Broodship's 8+, CR 721.2a). */
    if?: StaticCondition;
    /**
     * Only cards put into the graveyard this turn from a library (Kagha, Shadow Archdruid: GameObject.fromLibraryTurn), or
     * from anywhere other than the battlefield (Banon, the Returners' Leader: toGraveyardTurn without fromBattlefieldTurn).
     */
    arrived?: "fromLibrary" | "notFromBattlefield";
  }[];
  /** Muldrotha: "you may play a land ... from your graveyard" once during each of your turns. "shared": the same use as its once-each-turn spell permission (Serra Paragon's "a land ... or a permanent spell"). */
  landFromGraveyardOnce?: true | "shared";
  /** Kagha, Shadow Archdruid: that land only if it was put into the graveyard from a library this turn. */
  landFromGraveyardArrived?: "fromLibrary";
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
   * Evendo Brushrazer: "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards
   * exiled with ~": while this holds, with the usual costs and timing (rulings), no other mana.
   */
  playLinkedWhile?: StaticCondition;
  /**
   * "During your turn, you may play cards you don't own with stash counters on them from exile, and mana of any type can
   * be spent to cast those spells" (Tinybones, Bauble Burglar): any such card, whoever exiled it (rulings), with the usual
   * timing (rulings), mana of any type (CR 609.4b).
   */
  playCountered?: CounterKind;
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
  /**
   * "You may look at face-down creatures you don't control (your opponents control) any time" (Lens of Clarity, Found
   * Footage): its controller sees what those face-down permanents are (CR 708.5), not face-down spells (rulings).
   */
  lookFaceDown?: true;
  /** Arboria: "Creatures can't attack a player unless that player cast a spell or put a nontoken permanent onto the battlefield during their last turn" (attackProblem). */
  attackOnlyActive?: true;
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
  /** Khalni Hydra: "~ costs {G} less to cast for each green creature you control": that color first, then generic (rulings). */
  costLessEachColored?: { color: Color; count: Amount }[];
  /** "This spell costs {2} less to cast if you control a Wizard": the reduction while the condition holds. */
  /** A negative `n` costs that much more (Hurkyl's Final Meditation); `colored` takes off colored mana too (Discontinuity). */
  costLessIf?: { n: number; cond: StaticCondition; colored?: Color[] }[];
  /** "This spell costs {3} less to cast if it targets a tapped creature" (CR 601.2f). */
  costLessIfTargets?: { n: number; filter: TargetSpec; /** Brush Off: "{1}{U} less", the colored part. */ colored?: Color[] }[];
  /** Strive: "This spell costs {2}{G} more to cast for each target beyond the first", an additional cost (CR 601.2f, rulings). */
  strive?: string;
  /** "Spells your opponents cast that target ~ cost {2} more to cast": once per spell however often it targets it (rulings). */
  targetTax?: number;
  /** "Spells your opponents cast that target ~ cost {1} less to cast" (Accursed Witch): generic mana, once per spell (rulings, CR 601.2f). */
  targetDiscount?: number;
  /** "Spells that target ~ cost {2} less to cast" (Spellwild Ouphe): any player's spells, generic mana, once per spell however often it's targeted (rulings). */
  targetDiscountAny?: number;
  /** "Spells you cast that target enchanted player cost {1} less to cast" (Infectious Curse): generic mana, once per spell (rulings). */
  castTargetEnchantedPlayerLess?: number;
  /** "Spells you cast that target a creature cost {2} less to cast" (Killian, Ink Duelist): generic mana only (CR 601.2f). */
  castTargetLess?: { n: number; filter: TargetSpec }[];
  /** "Spells your opponents cast that target one or more commanders you control cost {3} more to cast" (Esior): once per spell. */
  commanderTargetTax?: number;
  /** Hinata, Dawn-Crowned: "Spells you cast cost {1} less to cast for each target", "Spells your opponents cast cost {1} more ...": `n` generic mana (negative: less) for each different player or object the spell targets (rulings). */
  perTargetCost?: { opponents: boolean; n: number }[];
  /** "Spells your opponents cast that target a Merfolk you control cost {2} more to cast", `abilities`: "Abilities your opponents activate that target ..." (Kopala, Warden of Waves): once per spell or ability. */
  opponentsTargetTax?: { n: number; filter: TargetSpec; abilities?: true }[];
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
  /** "X can't be 0." on a spell with {X} in its mana cost (Mind Grind): so it can't be cast without paying it (CR 107.3b). */
  xMin?: number;
  /** `xMin`: "Kicker {X}. X can't be 0." (Thieving Skydiver): a kicker cost with X, chosen as it's cast (CR 107.3a, 601.2b). */
  kicker?: {
    costs: string[];
    multi?: boolean;
    replicate?: boolean;
    squad?: boolean;
    offspring?: boolean;
    xMin?: number;
    /**
     * "As an additional cost to cast this spell, (you may) waterbend {N}" (CR 701.67a): paid like kicker, and up to N of
     * its generic mana may be paid by tapping artifacts and creatures (CostChoices.waterbend). `required`: it must be paid.
     */
    waterbend?: number;
    required?: true;
    /**
     * "Kicker—Sacrifice two lands.", "Kicker—{2}{R}, Sacrifice a land." (CR 702.33a, 118.8): the kicker cost's parts that
     * aren't mana (its one cost's mana, if any, is `costs[0]`), paid with the spell's other costs when it's kicked;
     * `text` says the whole cost.
     */
    extraCosts?: AdditionalCost[];
    text?: string;
    /**
     * "As an additional cost to cast this spell, you may blight 1", "you may behold a Dragon" (CR 601.2b): an optional
     * additional cost that isn't kicker, its one cost `extraCosts[0]`, chosen and paid the same way. "If this spell's
     * additional cost was paid", "if a Dragon was beheld" read as kicked. Not "kicked" for other cards.
     */
    optional?: true;
    /**
     * "As an additional cost to cast this spell, you may reveal a Dragon card from your hand" with "if you revealed a Dragon
     * card or controlled a Dragon as you cast this spell" (the Dragons of Tarkir cycle): also counted as paid when its
     * caster controls a permanent like this as they cast it (checked then, rulings).
     */
    ifControl?: TargetSpec;
  };
  /** "As an additional cost to cast this spell, sacrifice a creature" and the like (CR 601.2b, 601.2f-h). */
  additionalCosts?: AdditionalCost[];
  /** "As an additional cost to cast this spell, sacrifice a creature or pay {3}{B}": exactly one of these, announced as it's cast (CR 601.2b). */
  costOr?: CostOption[];
  /** Flashback, jump-start, retrace, escape: casting it from your graveyard. */
  fromGraveyard?: CastFromGraveyard[];
  /** "You may cast ~ from exile" (Misthollow Griffin, Squee): its owner may cast it while it's in exile. */
  castFromExile?: true;
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
    /** Web-slinging (CR 702.188a), for "if ~ was cast using web-slinging". */
    webSlinging?: true;
  }[];
  /** Madness [cost] (CR 702.35a): discarded, it's exiled instead, and its owner may cast it for this cost. */
  madness?: string;
  /** "Madness—{2}{B}, Pay 8 life" (Shadowgrange Archfiend): life paid as part of the madness cost (CR 702.35a, 119.4). */
  madnessLife?: number;
  /** Suspend N—[cost] (CR 702.62a): exile it from your hand with N time counters, cast it free when the last is removed. */
  suspend?: { n: number; cost: string };
  /** Reconfigure (CR 702.151): attached to a creature, this Equipment isn't a creature (702.151b). */
  reconfigure?: true;
  /** Impending N—[cost] (CR 702.176a): cast for that cost (AltCostKind "impending"), it enters with N time counters. */
  impending?: number;
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
  /**
   * "[Quality] offering" (CR 702.48a): you may sacrifice a permanent of that quality as you cast it; then it costs that
   * permanent's mana cost less (702.48c) and may be cast any time you could cast an instant.
   */
  offering?: TargetSpec;
  /** "~ costs {2} less to cast if it's bargained." */
  bargainReduction?: number;
  /** "As an additional cost to cast this spell, you may collect evidence N" (CR 701.59a, c): paid with CostChoices.evidence. */
  evidence?: number;
  /** "This spell costs {2} less to cast if evidence was collected." */
  evidenceReduction?: number;
  /** Open the Way: "X can't be greater than the number of players in the game." */
  xMaxPlayers?: true;
  /** The Marches: "~ costs {2} less to cast for each card exiled this way" (its optional exileFromHand cost, CR 601.2f). */
  exiledReduction?: number;
  /**
   * Rottenmouth Viper, Torgaar: "you may sacrifice any number of nonland permanents. This spell costs {1} less to cast
   * for each permanent sacrificed this way" (its optional sacrifice cost, whose X is how many; CR 601.2b, 601.2f).
   */
  sacrificedReduction?: number;
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
  /** "You can't spend mana to cast this spell" (Hogaak, Arisen Necropolis): its total cost is paid only by convoke and delve. */
  noManaSpend?: true;
  /** Assist (CR 702.132a): another player may pay for generic mana in its total cost. */
  assist?: true;
  /** Morph, megamorph, disguise (CR 702.37, 702.168): cast face down for {3}, turned face up for `cost`. */
  /** `costs`: "Morph—Pay 5 life." (CR 702.37a, 118.8), a morph cost that isn't mana (`cost` is "" then); `text` says it. */
  faceDownCast?: { kind: FaceDownKind; cost: string; costs?: AdditionalCost[]; text?: string };
  /** Hooded Hydra: "As ~ is turned face up, put five +1/+1 counters on it" (a replacement, CR 614.1e), however it's turned face up (rulings). */
  faceUpCounters?: { counter: string; n: number | Amount };
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
  /** Only these lands: "you may play historic lands ..." (Crystal Skull, Isu Spyglass). */
  landFilter?: TargetSpec;
  spells?: TargetSpec[] | "any";
  once?: true;
  if?: StaticCondition;
  /**
   * Bolas's Citadel: "If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost": a
   * spell cast with this permission is cast for that alternative cost (AltCostKind "citadel", CR 118.9).
   */
  payLife?: true;
  /** "If you cast a creature spell this way, it gains haste until end of turn" (Thundermane Dragon). */
  haste?: "endOfTurn";
}

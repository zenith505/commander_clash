// The effect language. Card rules text is compiled (see oracle.ts) into these plain,
// serializable structures, and the engine executes them (see effects.ts). Everything
// here is data, so abilities can sit on the stack inside GameState.

import type { Color, FaceDownKind, ManaType, ObjectId, PlayerId, SkipWhat } from "./types";
import type { CopyExcept } from "./copies";

/**
 * A number an effect uses: fixed, or worked out from the game. A spell or ability works out
 * the number once, as it resolves (CR 608.2h); a static ability keeps it up to date (CR 611.3a).
 */
export type Amount = number | AmountExpr;

/** Counter kinds effects can put on permanents. Stun and shield are keyword counters (CR 122.1c-d). */
/** +1/+1, -1/-1, stun (CR 122.1d), shield (122.1c), and named counters with no rules of their own: charge, spore, oil, ... */
// eslint-disable-next-line @typescript-eslint/ban-types
export type CounterKind = "+1/+1" | "-1/-1" | "stun" | "shield" | "time" | "fade" | (string & {});

/** What happens to permanents a player picks as an effect resolves: sacrificed, returned to hand, or given counters. */
/** "populate": create a token that's a copy of the picked creature token (CR 701.36). */
/** "reveal": amplify's cards revealed from the hand as a permanent enters (CR 702.38a). */
/** "band": attacking creatures declared to be in a band (CR 702.22c). */
/** "enlist": the creature an attacker taps for its enlist ability (CR 702.154a). */
/** "unblocked": blocked attackers that assign their combat damage as though they weren't blocked (CR 510.1). */
/** "exert": attackers their controller exerts as they attack (CR 701.43d). */
export type PickAction = "sacrifice" | "bounce" | "counters" | "populate" | "pair" | "reveal" | "unblocked" | "enlist" | "band" | "ringBearer" | "champion" | "exert" | "keepTapped" | "encode" | "keep";

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

/** One way to avoid a punisher's penalty: discard that many cards, sacrifice a permanent like this, or pay. */
export type PunisherOption = { discard: number } | { sacrifice: TargetSpec } | { pay: UnlessPays };

export interface UnlessPays {
  cost: string;
  generic?: Amount;
  life?: number;
  /** "Ward—Discard a card": discard this many cards (of their choice) as the payment. */
  discard?: number;
}

/**
 * `count` times `times` (default 1), plus `plus` (default 0): "2 life for each creature", "X is 1 plus
 * ...". A negative result is 0 (CR 107.1b: "If your life total is negative, X is considered to be 0").
 * `negate` then makes it negative, for "-X/-X" and "-1/-1 for each".
 */
export interface AmountExpr {
  count: Count;
  times?: number;
  plus?: number;
  negate?: boolean;
}

/** What an amount counts. */
export type Count =
  /** The X chosen while casting or activating it (CR 107.3a), or the spell's X for its permanent's ETB (CR 107.3m). */
  | { kind: "x" }
  /**
   * "The number of creatures you control", "for each other Elf you control". `filter.controller` is from the ability's controller's view;
   * `whose`: "creatures target player controls", controlled by those players.
   */
  | { kind: "permanents"; filter: TargetSpec; other?: boolean; whose?: PlayerRef }
  /** "The number of cards in your hand", "in that player's hand". */
  | { kind: "cardsInHand"; who: PlayerRef }
  | { kind: "cardsInLibrary"; who: PlayerRef }
  /** "That many cards" after discarding a hand (Tolarian Winds); `greatest`: "the greatest number of cards a player discarded this way" (Windfall). */
  | { kind: "discardedThisWay"; greatest?: true }
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
  /** "Creature cards in your graveyard", "cards in all graveyards" (`filter` is a "card" spec). */
  | { kind: "cardsInGraveyard"; who: PlayerRef; filter?: TargetSpec }
  /** "~'s power", "its toughness", "that creature's mana value": as it is now, or as it last existed (CR 608.2h). */
  | { kind: "power" | "toughness" | "manaValue"; of: ObjRef }
  | { kind: "life"; who: PlayerRef }
  /** "Your speed": 0 if you have none (CR 702.179f). */
  | { kind: "speed" }
  /** "The number of creatures in your party" (CR 700.8): 0 to 4. */
  | { kind: "party" }
  /** Devotion to a color, or to several (CR 700.5). */
  | { kind: "devotion"; colors: Color[] }
  /** "For each Aura attached to it", "each Equipment attached to it". */
  | { kind: "attachedToSelf"; subtypes: string[] }
  /** Domain: "basic land type among lands you control". */
  | { kind: "basicLandTypes" }
  /** "The number of card types among cards in all graveyards" (Tarmogoyf): card types only, not subtypes or supertypes (CR 205.2a). */
  | { kind: "graveyardCardTypes"; who: PlayerRef }
  /** "The greatest power among creatures you control": 0 when there are none (rulings on Ghalta). */
  | { kind: "greatestPower"; filter: TargetSpec; other?: boolean }
  /** "The greatest mana value among permanents you control": 0 when there are none; X is 0 on the battlefield (CR 202.3, 107.3). */
  | { kind: "greatestManaValue"; filter: TargetSpec }
  /** How many times the spell (or the permanent it became) was kicked (CR 702.33d); `which` = with that kicker cost only. */
  | { kind: "kicked"; which?: number }
  /** 1 if it was kicked at all (or with kicker cost `which`), else 0. */
  | { kind: "wasKicked"; which?: number }
  /** 1 if the mana spent to cast it meets `req` (adamant, CR 601.2h), else 0. */
  | { kind: "spentWas"; req: SpentReq }
  /** "That much", "that many" in a triggered ability: the damage its event dealt. */
  | { kind: "eventAmount" }
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
  /** "For each mana from a Treasure spent to cast it/~" (CR 106.3): the spell's, its permanent's, or an ability's. */
  | { kind: "treasureSpent" }
  /** "For each {S} spent to cast ~", "the amount of {S} spent" (CR 107.4h): mana from snow sources spent on the spell. */
  | { kind: "snowSpent" }
  /** "For each creature it devoured" (CR 702.82b). */
  | { kind: "devoured" }
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
  | { kind: "players"; opponents?: true }
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
  /** For objects/spells: at least one of these card types (empty = any permanent). */
  types?: string[];
  /** All of these card types: "artifact creature" (as opposed to "artifact or creature"). */
  allTypes?: string[];
  /** Excluded card types, e.g. "nonland permanent" -> ["Land"]. */
  notTypes?: string[];
  /** Excluded colors, e.g. "nonblack creature" -> ["B"]. */
  notColors?: Color[];
  /** At least one of these colors, e.g. "blue permanent", "red or green creature". */
  colors?: Color[];
  /** "Multicolored spell" (two or more colors, CR 105.4), "monocolored" (exactly one), "colorless" (none, CR 105.2c). */
  colorCount?: "multicolored" | "monocolored" | "colorless";
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
  /**
   * "Counter target spell with mana value X", "destroy target creature with power X or less": the X announced for the
   * spell or ability (CR 107.3a), made into that range of `key` as its targets are chosen (settleDivided). Until then,
   * any value.
   */
  xRange?: { key: "power" | "toughness" | "manaValue"; at: "exact" | "most" | "least" };
  /** `attackedThisTurn`: "creatures that attacked this turn" (declared as attackers this turn, CR 508.1). */
  combat?: "attacking" | "blocking" | "attackingOrBlocking" | "attackedThisTurn";
  /** "With lesser power" than the ability's source (mentor, CR 702.134a). */
  lesserPowerThanSource?: boolean;
  /**
   * "Target creature that player controls" in a trigger about a player ("Whenever ~ deals combat damage to a
   * player"): "eventPlayer", made concrete as `controlledBy` once the trigger knows that player.
   */
  controller?: "you" | "opponent" | "eventPlayer" | "enchanted";
  controlledBy?: PlayerId;
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
  /** "Two target creature cards that share a creature type": shares one with each of these targets of the group. */
  sharesCreatureTypeWith?: number[];
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
  status?: "enchanted" | "equipped" | "modified" | "unenchanted";
  /** "Suspected creature" (CR 701.60). */
  suspected?: true;
  /** true: a commander ("commander creature you control", CR 903.3); false: "noncommander". */
  commander?: boolean;
  /** "a card named ~": the source's name (only for searches). */
  named?: string;
  /** None of these subtypes. */
  notSubtypes?: string[];
  /** "creature with a +1/+1 counter on it", "permanents with ice counters on them" */
  counter?: CounterKind;
  /**
   * "of the chosen type", "that aren't of the chosen type", "of the chosen color": the creature type
   * or color chosen for the source (see GameObject.chosen) or while the spell resolves. Before
   * `bindChosen` fills it in, a filter that needs a choice that wasn't made matches nothing.
   */
  chosen?: "type" | "notType" | "color" | "notColor";
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
   * "Target spell that targets a permanent you control", "... that targets you": a spell with at least one target that's
   * still that object on the battlefield and matches, or that is you (rulings on Rebuff the Wicked).
   */
  targetsWhat?: TargetSpec | "you";
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
  many?: "any" | "x" | "exactX";
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
    }
  | { ref: "self" } // the source permanent ("this creature")
  /** "That spell" in a cast trigger (Monstrous Vortex): the spell whose casting triggered it, as it was cast. Counts only. */
  | { ref: "castSpell" }
  /** "Each creature dealt damage this way" (Aurelia's Fury): `filter` for the kind of permanent. */
  | { ref: "damagedThisWay"; filter?: TargetSpec }
  /** The card a "whenever a creature dies" trigger was about, in the zone it went to, while it's still that object (CR 400.7). */
  | { ref: "subjectCard" } // "a creature dealt damage this way": what this ability's damage hit
  | { ref: "subject" } // the object its trigger event was about: exalted's "that creature" (see PendingTrigger.subject)
  /** After a leaves-the-battlefield trigger: the card in the zone it went to, if it's still that object ("return it to your hand"). */
  | { ref: "selfCard" }
  /** "Create a 0/0 Fractal creature token. Put X +1/+1 counters on it": the token(s) this ability just created. */
  | { ref: "created" }
  /** "The sacrificed creature": what was sacrificed to cast the spell, as it last existed (CR 608.2h). */
  | { ref: "sacrificed" }
  /** The card "reveal the top card of your library" revealed, while it's still where it was (CR 400.7). */
  | { ref: "revealed" }
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
  | { ref: "each"; filter: TargetSpec; other?: boolean; /** A spell's "other creatures you control" after "target creature you control": all but that target. */ otherThan?: number; of?: PlayerRef }
  /**
   * "The top creature card of your graveyard" (CR 404.1, rulings: the one put there most recently): the topmost card of
   * each player's graveyard that matches `filter`, as this resolves. `bottom`: the bottommost. `only`: "if the top card
   * of target player's graveyard is a creature card, put that card ...": the top card, only if it matches.
   */
  | { ref: "graveyardEnd"; who: PlayerRef; filter?: TargetSpec; bottom?: true; only?: true };

/** Which player(s) an effect touches. */
export type PlayerRef =
  | { ref: "you" }
  | { ref: "subjectController" } // the controller of the object the trigger was about, or as it last existed
  /** `n`: "any number of target players" covers the targets from `index` on (TargetSpec.many). */
  | { ref: "target"; index: number; n?: number }
  | { ref: "eachOpponent" }
  | { ref: "eachPlayer" }
  | { ref: "targetController"; index: number } // "its controller"
  | { ref: "targetOwner"; index: number } // "its owner": a targeted card's owner (Pharika's "Its owner creates ...")
  /** "That player" in "Whenever ~ deals combat damage to a player, that player discards a card". */
  | { ref: "eventPlayer" }
  /** The player this Aura is attached to ("enchanted player", CR 702.5d), as it last existed if it's gone. */
  | { ref: "enchantedPlayer" }
  /** "Each opponent attacking that player": each opponent of this ability's controller attacking the event player. */
  | { ref: "opponentsAttackingEventPlayer" }
  /** The players who chose to in the "each player may ..." being resolved (see the eachMay effect). */
  | { ref: "choseThisWay" }
  /** The players who did none of a punisher's options (see the punisher effect). */
  | { ref: "punished" }
  /** Gift's "the chosen player": the opponent the gift was promised to (CR 702.174a). */
  | { ref: "giftee" }
  /** "Players dealt damage this way" (Aurelia's Fury): by this spell's or ability's damage so far. */
  | { ref: "damagedThisWay" }
  /**
   * "They" in "Each player loses 1 life for each creature they control" (Stronghold Discipline): the player the instruction
   * is being done to, one at a time.
   */
  | { ref: "eachOne" };

export type DamageRecipient = ObjRef | PlayerRef | { ref: "anyTarget"; index: number; /** "each of up to two targets" */ n?: number };

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

export type Modification =
  | { kind: "control" } // layer 2: the effect's controller controls it
  /** Layer 4, "in addition to its other types"; `allCreatureTypes`: "with all creature types" (Mutavault). */
  | { kind: "addTypes"; types: string[]; subtypes: string[]; supertypes?: string[]; allCreatureTypes?: true }
  | { kind: "setTypes"; types: string[]; subtypes: string[] } // layer 4, "becomes a 3/3 Elemental creature": new card types replace the old (CR 205.1a)
  | { kind: "setSubtypes"; subtypes: string[] } // layer 4, "becomes a Frog": replaces only subtypes of the same kind (CR 205.1a)
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
  | { kind: "addKeywords"; keywords: string[]; spares?: true }
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
  | { kind: "attackTax"; n: number }
  /** "Untap ~ during each other player's untap step" (CR 502.3). */
  | { kind: "untapsDuringOthers" }
  | { kind: "blocksOnlyFlyers" } // "can block only creatures with flying" (a blocking restriction, CR 509.1b)
  | { kind: "attacksIfAble" } // "attacks each combat if able" (an attack requirement, CR 508.1d)
  /** Goaded by the effect's controller (CR 701.15b): it attacks each combat if able, and a player other than them if able. */
  | { kind: "goad" }
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
  | { kind: "preventDamage"; to?: true; by?: true; combat?: "only" | "non"; fromTypes?: string[] }
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
  /** "Creatures with power less than ~'s power can't block it" (CR 509.1b). */
  | { kind: "cantBeBlockedByLesserPower" }
  /** The Ring-bearer: "can't be blocked by creatures with greater power" (CR 701.54c). */
  | { kind: "cantBeBlockedByGreaterPower" }
  /** "Can't attack alone", "can't block alone" (CR 506.5, 508.1c, 509.1b). */
  | { kind: "cantAttackAlone" }
  | { kind: "cantBlockAlone" }
  /** "Can't attack a player it has already attacked this turn" (Port Razer): attacking a planeswalker still can (rulings). */
  | { kind: "cantAttackSamePlayer" }
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
}

/**
 * When a static ability applies ("as long as ..."): threshold's "seven or more cards in your graveyard",
 * unleash's "as long as it has a +1/+1 counter on it" (CR 702.98a), metalcraft's "three or more
 * artifacts", delirium's "four or more card types among cards in your graveyard", and so on.
 */
export type StaticCondition =
  | { kind: "graveyardAtLeast"; n: number }
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
  | { kind: "self"; is: "attacking" | "enchanted" | "equipped" | "modified" | "devoured" | "attachedToCreature" | "tapped" | "untapped" | "monstrous" | "escaped" | "attackedThisTurn" | "saddled" | "enteredThisTurn" | "onBattlefield" }
  /**
   * "If ~ is a Warrior, ..." (Figure of Destiny): its source as it is now, with every effect applied (CR 608.2c). Only an
   * instruction's condition, checked as it resolves: a static ability's condition about its own types would depend
   * on the layers being worked out.
   */
  | { kind: "selfIs"; filter: TargetSpec }
  /** A trigger's "if its toughness is 3 or less" about its own source (Young Hero Role, CR 603.4): power or toughness now. */
  | { kind: "selfPT"; stat: "power" | "toughness"; min?: number; max?: number }
  /** "Activate only if ~ entered this turn or if you control a basic land": either one. */
  | { kind: "anyOf"; conds: StaticCondition[] }
  /** Coven: "if you control three or more creatures with different powers" (three or more different power values). */
  | { kind: "coven" }
  /**
   * "If an opponent controls more lands than you", "... more creatures than you", "an opponent has more life than you",
   * "... more cards in hand than you": any one opponent.
   */
  | { kind: "opponentMore"; what: "lands" | "creatures" | "life" | "hand" }
  /** "As long as you have the city's blessing" (CR 702.131c). */
  | { kind: "citysBlessing"; /** "Unless you have the city's blessing". */ not?: true }
  /** "If it's your turn"; `not`: "if it's not your turn" (Force of Negation). */
  | { kind: "yourTurn"; not?: true }
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
  | { kind: "controlCommander"; types?: string[] }
  /** "If you have a full party" (CR 700.8a): four creatures in your party. */
  | { kind: "fullParty" }
  /** "If you don't control a Ring-bearer" (CR 701.54e); `self`: "as long as ~ is your Ring-bearer". */
  | { kind: "ringBearer"; not?: true; self?: true }
  /** Max speed (CR 702.178a, 702.179e): your speed is 4. */
  | { kind: "maxSpeed" }
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
  | { kind: "opponentLostLife" }
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
  /** "If an opponent cast a blue spell this turn" (Ricochet Trap): the spell's colors as it was cast. */
  | { kind: "opponentCast"; color: Color }
  /** "If you have no land cards in hand" (Land Grant). */
  | { kind: "noneInHand"; filter: TargetSpec }
  /**
   * "As long as you have 25 or more life", fateful hour's "5 or less life", "at least 7 life more than your starting life
   * total", "your life total is greater than or equal to your starting life total" (CR 903.7: 40): your life total now.
   */
  | { kind: "life"; min?: number; max?: number }
  /** "As long as equipped creature is a Human": the permanent this is attached to matches. */
  | { kind: "attachedIs"; filter: TargetSpec }
  /** "If you have nine or more cards in hand" (Wiretapping). */
  | { kind: "handAtLeast"; n: number }
  /** "If each player has no cards in hand" (Howltooth Hollow). */
  | { kind: "handsEmpty" }
  /** "If creatures you control have total power 10 or greater" (Mosswort Bridge). */
  | { kind: "totalPower"; n: number }
  /** "If a library has twenty or fewer cards in it": any player's (Shelldock Isle). */
  | { kind: "libraryAtMost"; n: number }
  /** Corrupted: "as long as an opponent has three or more poison counters" (CR 122.1f). */
  | { kind: "opponentPoison"; n: number }
  /** Raid: "if you attacked this turn" (with one or more creatures). */
  | { kind: "attackedThisTurn" }
  /** "If you've committed a crime this turn" (CR 700.13). */
  | { kind: "committedCrime" }
  /** A Case's solved designation (CR 719.3b): "Solved — [ability]" (702.169); `not`: a "To solve" trigger's "this Case is not solved" (719.3a). */
  | { kind: "solved"; not?: true }
  /** "Three or more creature cards were put into graveyards from anywhere this turn": cards, anyone's, with all of `types` (as cards in the graveyard). */
  | { kind: "cardsToGraveyard"; n: number; types: string[] }
  /** "Three or more sources you controlled dealt damage this turn": different sources, as the objects they were (CR 400.7), controlled by you as they dealt it. */
  | { kind: "sourcesDealtDamage"; n: number }
  /** "You've cast four or more instant and sorcery spells this turn": your spells this turn matching `filter` as they were cast. */
  | { kind: "castCount"; n: number; filter: TargetSpec }
  /** "There are five colors among permanents you control" (CR 105.2). */
  | { kind: "colorsAmong"; n: number }
  /** "You've gained 5 or more life this turn": in total. */
  | { kind: "lifeGainedThisTurn"; n: number }
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
  | { kind: "increment" }
  /** "If that player has two or fewer cards in hand": the trigger's player (whose upkeep it is), checked as it triggers and resolves (CR 603.4). */
  | { kind: "eventPlayerHand"; max?: number; min?: number }
  /**
   * "As long as you control three or more artifacts / another Wizard / no untapped lands", "as long as
   * an opponent controls an Island", "as long as defending player controls an artifact".
   */
  | { kind: "control"; who: "you" | "opponent" | "defending"; filter: TargetSpec; min?: number; max?: number; other?: boolean }
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
  | { kind: "attackedThisStep" };

/** A restriction naming a part of the turn (CR 506.8, 602.5b): "only during your upkeep", "only during combat". */
export const timedCondition = (c: StaticCondition | undefined): boolean =>
  !!c && (c.kind === "during" || c.kind === "attackedThisStep" || ((c.kind === "allOf" || c.kind === "anyOf") && c.conds.some(timedCondition)));

/**
 * When a restricted spell or ability may be used (CR 506.8): "upkeep", "end" (end step), "afterUpkeep" (the steps after
 * the upkeep), "combat" (any step of a combat phase, 506.8c), "combatBeforeBlocks" (beginning of combat and declare
 * attackers), "combatAfterBlocks" (once blockers are declared, 506.8f: not in a combat whose declare blockers step was
 * skipped), and the steps "declareAttackers", "declareBlockers" and "endCombat", once their turn-based actions are done.
 */
export type TimingWindow = "upkeep" | "end" | "afterUpkeep" | "combat" | "combatBeforeBlocks" | "combatAfterBlocks" | "declareAttackers" | "declareBlockers" | "endCombat" | TurnPoint;

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
  | { type: "damage"; amount: Amount; to: DamageRecipient; also?: DamageRecipient[]; divided?: true; evenly?: true }
  | { type: "draw"; who: PlayerRef; n: Amount }
  | { type: "gainLife"; who: PlayerRef; n: Amount }
  /** `drain`: "You gain life equal to the life lost this way" (extort, CR 702.101a; Gray Merchant). */
  | { type: "loseLife"; who: PlayerRef; n: Amount; drain?: boolean }
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
  | { type: "exile"; what: ObjRef; until?: "sourceLeaves"; linked?: boolean }
  /**
   * "Target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to
   * its mana cost." (Snapcaster Mage), "each instant and sorcery card in your graveyard ..." (Past in Flames): only the
   * cards there as it resolves (rulings). A card with no mana cost can't be cast this way (rulings).
   */
  | { type: "grantFlashback"; what?: ObjRef; each?: TargetSpec }
  /** "Return the exiled card to the battlefield under its owner's control": the cards this object's linked exile took (CR 607.2a). */
  | { type: "returnLinked"; dest: "battlefield" | "hand" }
  /**
   * Cards exiled face down, linked to the source (CR 406.3, 607.2a): `top`, the top `n` of your library (Duplicity);
   * `hand`, all cards from your hand; `handCard`, one card you choose from your hand (Gustha's Scepter). `look`: its
   * controller may look at them while they remain exiled; otherwise nobody may (Duplicity rulings).
   */
  | { type: "exileFaceDown"; from: "top" | "hand" | "handCard"; n?: number; look?: true }
  /**
   * Cards exiled with ~ (CR 607.2a): "Put all cards exiled with ~ into their owner's graveyard", "Return a card you own
   * exiled with ~ to your hand" (`one`, `yours`), "put all other cards you own exiled with ~ into your hand" (`other`:
   * not those exiled earlier in this resolution).
   */
  | { type: "moveLinked"; dest: "hand" | "graveyard"; one?: true; yours?: true; other?: true }
  /**
   * Hideaway N (CR 702.75a): look at the top N cards of your library, exile one of them face down (linked to this
   * permanent, CR 607.2a), and put the rest on the bottom of your library in a random order.
   */
  | { type: "hideaway"; n: number }
  /**
   * "You may play the exiled card without paying its mana cost": the card this permanent's hideaway exiled, as this
   * resolves. A land only on your turn with a land play left (CR 305.2-3, rulings on Evercoat Ursine).
   */
  | { type: "playLinked" }
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
  | { type: "pick"; who: PlayerRef; filter: TargetSpec; n: Amount; action: PickAction; /** For "counters": "put two +1/+1 counters on a creature you control". */ counter?: { kind: CounterKind; n: Amount }; /** Bolster: only among those with the least toughness (CR 701.39a). */ least?: "toughness"; /** "A creature with the greatest power among creatures they control": only those, or tied for it. */ greatest?: "power"; /** "Unless they pay {3}": each player may pay to be left out. */ unless?: UnlessPays }
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
    }
  | { type: "bounce"; what: ObjRef } // return to owner's hand (from the battlefield or a graveyard)
  /** "Return target creature card from your graveyard to the battlefield": enters under the effect controller's control (CR 110.2a). */
  /**
   * "You may put a land card from your hand onto the battlefield": the player picks one (or, with `any`, any number) of
   * the cards in their hand that match; without `may`, one if they have one. Not an Aura: that would need a choice of
   * what it enchants (CR 303.4f).
   */
  | { type: "putFromHand"; filter?: TargetSpec; tapped?: boolean; may: boolean; any?: boolean }
  /**
   * "Return all land cards from your graveyard to the battlefield tapped" (CR 110.2a: under your control), "from all graveyards
   * ... under their owners' control". All at once. Never Auras: those need a choice of what they enchant (CR 303.4f).
   */
  | { type: "returnAllFromGraveyard"; who: PlayerRef; filter: TargetSpec; tapped?: boolean; owners?: true }
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
  | { type: "chooseFromGraveyard"; filter?: TargetSpec; n: number; upTo?: true; /** Exiled instead ("Target player exiles a card from their graveyard"), or put onto the battlefield under your control. */ dest?: "exile" | "battlefield"; tapped?: true; counters?: Record<string, number>; /** "With mana value X or less", X worked out as it resolves (Blood on the Snow). */ mvMax?: Amount; /** Whose graveyard, and who chooses: yours if left out. */ who?: PlayerRef }
  /** "Reorder your graveyard as you choose" (Fossil Find), "at random" (Search for Survivors). */
  | { type: "reorderGraveyard"; random?: true }
  | {
      type: "putOntoBattlefield";
      what: ObjRef;
      tapped?: boolean;
      /** "Under its owner's control" rather than yours. */
      owner?: boolean;
      /** An Aura "attached to that creature": the trigger's subject (CR 303.4f). */
      attachToSubject?: boolean;
      /** The Enduring cycle's "It's an enchantment. (It's not a creature.)": its new card types as it enters. */
      becomes?: { types: string[]; subtypes: string[] };
      /** "That creature gains haste until end of turn" ("endOfTurn"), "It gains haste" ("game": for as long as it's that object). */
      haste?: "endOfTurn" | "game";
      /** "Exile it at the beginning of the next end step", "Sacrifice it ...": a delayed trigger for it (CR 603.7), while it's that object. */
      atEndStep?: "exile" | "sacrifice";
      /** "With a +1/+1 counter on it" (Undying Malice): counters it enters with (CR 614.1c). */
      counters?: Record<string, number>;
    }
  /**
   * "Put target card from your graveyard on top of / on the bottom of its owner's library"; "ownersChoice": "Target
   * creature's owner puts it on their choice of the top or bottom of their library".
   */
  | { type: "putInLibrary"; what: ObjRef; position: "top" | "bottom" | "ownersChoice" | "second" }
  | { type: "exileGraveyard"; who: PlayerRef } // "Exile target player's graveyard"
  | { type: "tap"; what: ObjRef }
  /** Suspect (CR 701.60a): it becomes suspected, unless it already is (701.60d); `no`: "is no longer suspected". */
  | { type: "suspect"; what: ObjRef; no?: true }
  /** Proliferate (CR 701.27): another counter of each kind on the chosen permanents and players. */
  | { type: "proliferate" }
  /** Amass [subtype] N (CR 701.47): an Army gets N +1/+1 counters, made first if you have none. */
  | { type: "amass"; subtype: string; n: Amount }
  /**
   * "Exile target creature you control, then return it to the battlefield under its owner's control"
   * (blink); with `at`, it comes back at the beginning of the next end step (a delayed trigger, CR 603.7).
   */
  | { type: "flicker"; what: ObjRef; under: "owner" | "you"; at?: "nextEndStep"; counter?: CounterKind }
  /** A delayed flicker's return: the exiled card, while it's still in exile as that object. */
  | { type: "returnExiled"; under: "owner" | "you"; counter?: CounterKind }
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
  /** "It can't be regenerated this turn" (CR 701.19c): its regeneration shields don't apply this turn. */
  | { type: "noRegen"; what: ObjRef; ifCreature?: true }
  /** "Look at target opponent's hand" (only you see it, CR 402.3); `reveal`: "target player reveals their hand" (everyone sees it). */
  | { type: "lookAtHand"; who: PlayerRef; reveal?: true }
  /** "~ assigns no combat damage this turn" (CR 510.1). */
  | { type: "noCombatDamage"; what: ObjRef }
  | { type: "untap"; what: ObjRef }
  /**
   * "Tap or untap target permanent": its controller chooses which as it resolves (CR 608.2d); `may`: "you may tap or
   * untap", where doing neither is a choice too (one question).
   */
  | { type: "tapOrUntap"; what: ObjRef; may?: true }
  /** Provoke's "block [the source] this combat if able" (CR 702.39a): a blocking requirement, see blockRequirementProblem. */
  /** Provoke and "target creature blocks ~ this turn if able": for this combat, or the rest of the turn (CR 509.1c). */
  /** Provoke-like: `what` blocks the source (or `attacker`, "blocks target creature") this combat or turn if able. */
  | { type: "mustBlockSource"; what: ObjRef; attacker?: ObjRef; thisTurn?: true }
  /** "That creature doesn't untap during its controller's next untap step." */
  | { type: "skipUntap"; what: ObjRef }
  /** `perLastKnownCounter`: modular's "a +1/+1 counter for each +1/+1 counter on this permanent", as it last was. */
  /** `divided`: "distribute N counters among" the targets of `what`, each getting its part (CR 601.2d). */
  | { type: "counters"; what: ObjRef; counter: CounterKind; n: Amount; perLastKnownCounter?: "+1/+1" | "-1/-1"; divided?: true }
  /**
   * "Distribute X +1/+1 counters among any number of creatures you control" (no targets): its controller divides them
   * among the permanents like `filter` they control as it resolves (rulings on Blessing of Frost, CR 608.2d), each
   * chosen one getting at least one.
   */
  | { type: "distribute"; counter: CounterKind; n: Amount; filter: TargetSpec }
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
  | { type: "delayed"; when: "nextTurnUpkeep" | "nextEndStep" | "endOfCombat" | "nextCleanup" | "lostControl"; effects: Effect[]; text: string; each?: "created" | "subject" | "selfCard"; of?: ObjRef }
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
  /** "Exile ~ with three time counters on it": the resolving spell suspends itself again (Arc Blade). */
  | { type: "exileSelfWithTime"; n: number }
  /** Warp's end-step trigger (CR 702.185a): exile the permanent; its owner may cast the card after this turn. */
  | { type: "warpExile" }
  /** "Exile the top two cards of your library. Until the end of your next turn, you may play those cards." */
  | { type: "impulse"; n: Amount; until: "thisTurn" | "nextTurn" | "exiled" }
  | { type: "removeSelfCounter"; counter: CounterKind; orSacrifice?: boolean }
  /** "Remove a +1/+1 counter from it", "remove all -1/-1 counters from ~" (CR 122.8): as many as it has, at most. */
  /** CR 702.116a: token copies of the source attacking each opponent other than defending player (the event player). */
  | { type: "myriad" }
  /**
   * Encore (CR 702.141a): for each opponent, a token copy of this card that attacks that opponent this turn if able.
   * The tokens gain haste. (The sacrifice at the next end step is a separate delayed trigger about each token.)
   */
  | { type: "encore" }
  /** "When you next cast an instant or sorcery spell this turn, ...": a delayed trigger on that cast (CR 603.7). */
  /** `cascade`: "the next noncreature spell you cast this turn has cascade" (Dark Apostle): that spell's own cascade. */
  | { type: "nextCast"; filter: TargetSpec; effects: Effect[]; text: string; cascade?: true }
  /**
   * Copy a spell (CR 707.10): the one whose casting triggered this ("cause": storm, replicate, "copy that spell") or a
   * target. `n`: "storm" is the spells cast before it this turn, "kicked" the times its replicate cost was paid.
   * `newTargets`: "you may choose new targets for the copy" (707.10c).
   */
  /** `epic`: the spell with epic as it resolved, by its stack id in `GameState.epics` (CR 702.50a). */
  | { type: "copySpell"; spell: "cause" | { target: number } | { epic: string }; n: Amount | "storm" | "kicked"; newTargets: boolean }
  | { type: "removeCounters"; what: ObjRef; counter: CounterKind; n: Amount | "all" }
  /** "Remove all counters from target permanent": every kind; how many were removed is counted ("this way"). */
  | { type: "removeAllCounters"; what: ObjRef }
  /** "Move all counters from target creature onto another target creature" (CR 122.5): only if both are still legal targets (rulings on Fate Transfer). */
  | { type: "moveAllCounters"; from: ObjRef; to: ObjRef }
  /** "Put its counters on target creature": as many of each kind (or of `only`) as the source had as it last existed. */
  | { type: "lastKnownCounters"; what: ObjRef; only?: CounterKind }
  /** "Move a +1/+1 counter from ~ onto that creature" (CR 122.5): nothing happens unless both parts can. */
  | { type: "moveCounter"; counter: CounterKind; from: ObjRef; to: ObjRef }
  /** Cascade (CR 702.85a), resolving: exile until a cheaper nonland card, maybe cast it free, the rest to the bottom. */
  | { type: "cascade" }
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
   * remains tapped" (CR 611.2b), with `whileControlled` "for as long as you control ~ and ~ remains tapped".
   */
  | { type: "continuous"; what: ObjRef; mods: Modification[]; duration: "endOfTurn" | "game" | "yourNextTurn" | "whileTapped"; notSource?: boolean; whileControlled?: true }
  /**
   * Attach the source (an Equipment or Aura) to `what`, CR 701.3; `source`: another Equipment instead ("Attach target
   * Equipment you control to target creature you control", Brass Squire).
   */
  | { type: "attach"; what: ObjRef; source?: ObjRef }
  /** "Unattach it" (CR 701.3d): Ogre Geargrabber's Equipment, from whatever it's attached to. */
  | { type: "unattach"; what: ObjRef }
  /** "{2}: Transform this token." (CR 701.27a): a double-faced token turns its back face up. */
  | { type: "transformSelf" }
  /** Reconfigure's "Unattach this permanent" (CR 702.151a, 701.3d). */
  | { type: "unattachSelf" }
  /** "Create a token that's a copy of target creature you control[, except ...]" (CR 707.2, 707.9, 111.4). */
  /** `ofSource`: a copy of the card the ability came from, as it last existed (embalm, eternalize: exiled to pay the cost). */
  | { type: "createTokenCopy"; who: PlayerRef; n: Amount; what: ObjRef; except?: CopyExcept; tapped?: boolean; attacking?: boolean; ofSource?: boolean }
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
      /** "With N +1/+1 counters on it": it enters with them (incubate, CR 701.53a). */
      counters?: { counter: CounterKind; n: Amount };
      /**
       * An Aura token "attached to" this object (a Role, CR 303.7): one for each object it means. It isn't created if it
       * couldn't legally enchant that object (rulings on Roles).
       */
      attachTo?: ObjRef;
    }
  | { type: "mill"; who: PlayerRef; n: Amount }
  /** "That player exiles the top card of their library" (ingest, CR 702.115a): face up (CR 406.3), with no permission to play it. */
  | { type: "exileTop"; who: PlayerRef; n: Amount }
  /**
   * Dark Confidant: "reveal the top card of your library and put that card into your hand", then maybe "[you] lose
   * (gain) life equal to its mana value" (X is 0 in a library, CR 202.3e).
   */
  | { type: "revealTopToHand"; life?: { who: PlayerRef; gain?: boolean } }
  /** "Reveal the top card of your library" (CR 701.20a): what follows ("If it's a creature card, put it into your hand") is about it (ObjRef "revealed"). */
  /** "Reveal the top card of your library" (CR 701.20a), or with `look` only look at it, for an "if it's a ... card" after it. */
  | { type: "revealTop"; look?: true }
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
  | { type: "takeFromHand"; who: PlayerRef; filter?: TargetSpec; action: "discard" | "exile"; until?: "sourceLeaves"; linked?: boolean }
  /** `hand`: "discards their hand", every card in it (n is ignored). */
  /** `filter`: "discard a creature card" (only such cards can be chosen). */
  | { type: "discard"; who: PlayerRef; n: Amount; random?: boolean; hand?: true; filter?: TargetSpec; /** "Each player discards cards the same way" (Balancing Act): down to the fewest cards any of them has; `n` is unused. */ downToFewest?: true } // CR 701.9
  | { type: "scry"; n: Amount } // CR 701.22, by the controller
  /** "~ endures N" (CR 701.63a): N +1/+1 counters on it, or an N/N white Spirit token, its controller's choice. */
  | { type: "endure"; what: ObjRef; n: Amount }
  /** "Clash with an opponent" (CR 701.30): for a following "If you win, ..." (see SpellCondition "wonClash"). */
  | { type: "clash" }
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
  | { type: "handToTop"; n: Amount }
  /** Firebending's "add N {R}. Until end of combat, you don't lose this mana as steps and phases end" (CR 702.189a). */
  | { type: "addCombatMana"; n: Amount }
  /** "Add {B}{B}{B}" (Dark Ritual), "add one mana of any color" from an enters trigger: not a mana ability, so it uses the
   * stack (CR 605.1, 605.5a). `chosen` adds that much mana of the color chosen just before (a "choose" effect). */
  /** `times`: "Add {R} for each card in target opponent's hand" (Jeska's Will). */
  | { type: "addMana"; mana?: string; chosen?: number; times?: Amount; /** "Until end of turn, you don't lose this mana as steps and phases end" (CR 500.4). */ keep?: "turn" }
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
  | { type: "shuffleSpell" }
  /** "Target player shuffles their graveyard into their library", "Each player shuffles their hand and graveyard into their library". */
  | { type: "shuffleZones"; who: PlayerRef; hand?: true; graveyard?: true }
  | { type: "fight"; a: ObjRef; b: ObjRef } // CR 701.14: each deals damage equal to its power to the other
  | { type: "bite"; a: ObjRef; b: ObjRef } // a deals damage equal to its power to b
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
  | { type: "counterSpell"; index: number; unless?: UnlessPays; exile?: boolean; top?: boolean; /** "Counter target spell if its mana value is X" (Disrupting Shoal): only then, checked as it resolves. */ ifMvX?: true }
  /**
   * "Change the target of target spell with a single target" (CR 115.7a): to another legal target, chosen as this
   * resolves, or it stays as it is if there's none; maybe unless that spell's controller pays (CR 118.12).
   */
  | { type: "changeTarget"; index: number; unless?: UnlessPays }
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
  | { type: "may"; effects: Effect[]; text: string; otherwise?: Effect[]; pay?: PayCost; keep?: boolean; once?: boolean }
  /**
   * "Each player may discard their hand and draw five cards" (Will of the Jeskai): each of them decides in APNAP order,
   * knowing the earlier answers (CR 101.4), then `effects` happen to those who chose to ({ ref: "choseThisWay" }).
   * `wheel`: the number of cards drawn, for the bots' answer.
   */
  | { type: "eachMay"; who: PlayerRef; effects: Effect[]; text: string; wheel?: number }
  /**
   * A punisher: "Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards
   * a card". Each player in APNAP order picks one of `options` they can do (or none) and, for a discard or a sacrifice,
   * which cards or permanent, without revealing a card to be discarded; then the cards are discarded and the permanents
   * sacrificed all at once, and `effects` happen to those who did none ({ ref: "punished" }) (CR 101.4, rulings on Nicol
   * Bolas, the Deceiver and Court of Ambition). A player may always choose none. `times`: "Repeat this process X times",
   * each time all the way through (rulings on Torment of Hailfire).
   */
  /** `picks`: "for each blight counter on it, ... unless" (Rottenmouth Viper): each player chooses that many times first. */
  | { type: "punisher"; who: PlayerRef; options: PunisherOption[]; effects: Effect[]; times?: Amount; picks?: Amount }
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
  | { type: "reflexive"; body: AbilityBody }
  /** "Defending player gets a poison counter", "each opponent gets two poison counters" (CR 122.1f; ten lose, 704.5c). */
  | { type: "poison"; who: PlayerRef; n: Amount }
  /** "You get {E}{E}" (CR 107.14): energy counters on a player (CR 122.1). */
  | { type: "getEnergy"; who: PlayerRef; n: Amount }
  /** Unearth (CR 702.84a): return the source card from your graveyard to the battlefield with haste, exiled at the next end step or if it would leave. */
  | { type: "unearth" }
  /** Rebound's delayed trigger (CR 702.88a): "you may cast this card from exile without paying its mana cost". */
  | { type: "castFromExileFree" }
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
  /**
   * "Your opponents can't cast spells this turn" (Silence), "target player can't ..." (Orim's Chant), "players can't cast
   * noncreature spells this turn" (Calamity's Wake): those players, chosen as it resolves, until the turn ends; `filter`
   * is the kind of spell.
   */
  | { type: "cantCast"; who: PlayerRef; filter?: TargetSpec }
  /** "Target player can't play lands this turn" (Moonhold): no land plays for them until the turn ends (CR 305.2, 101.2). */
  | { type: "cantPlayLands"; who: PlayerRef }
  /** "Damage can't be prevented this turn" (CR 615.12). */
  | { type: "noPrevention" }
  /** "If ~ was kicked, ...", with "... instead" as `otherwise` being what it does when it wasn't. */
  | { type: "if"; cond: SpellCondition; effects: Effect[]; otherwise?: Effect[] }
  /**
   * "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle"
   * (CR 701.23). `filter` unset = any card. Found cards go to `dest`; with `others`, only the first
   * does and the rest go there (Cultivate). The library is then shuffled (CR 701.20).
   */
  | { type: "search"; filter?: TargetSpec; n: Amount; upTo: boolean; dest: SearchDest; others?: SearchDest; reveal: boolean; /** Whose library: "its controller may search their library" (Path to Exile). Yours if left out. */ who?: PlayerRef }
  /**
   * "Look at the top four cards of your library. You may reveal a creature card from among them and put it
   * into your hand. Put the rest on the bottom of your library in a random order." Pick `count` of the top
   * `n` (matching `filter`; `upTo`: any number up to that), put them `into` there, and the others `rest`.
   */
  | { type: "dig"; n: Amount; count: number; upTo: boolean; filter?: TargetSpec; /** "manifest", "cloak": onto the battlefield face down (CR 701.40a, 701.58a). */ into: "hand" | "libraryTop" | "battlefield" | "manifest" | "cloak"; rest: "graveyard" | "bottom" | "shuffle" | "hand"; /** "On the bottom of your library in a random order"; otherwise its owner orders them (CR 401.4). */ random?: true; reveal: boolean; /** Whose library, who looks and who gets the permanents: "its controller manifests dread" (default: you). */ who?: PlayerRef; /** Not optional: "Put a creature card from among them onto the battlefield". */ required?: true; /** "With three +1/+1 counters on it" (onto the battlefield). */ counters?: { counter: CounterKind; n: number }; /** "Onto the battlefield tapped". */ tapped?: true }
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
  | { type: "addPhases"; phases: ("combat" | "main")[]; after?: "main" | "combat" }
  /** "You lose the game" (CR 104.3e). */
  | { type: "loseGame"; who: PlayerRef }
  /** "You win the game" (CR 104.2b): the game ends. */
  | { type: "winGame"; who: PlayerRef }
  /** "Exile ~" in an instant or sorcery: it goes to exile as it resolves instead of its owner's graveyard (CR 608.2n). */
  | { type: "exileSpell" }
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
  | { type: "castFromAmong"; who: PlayerRef; n: Amount; maxMv?: Amount; totalMv?: Amount }
  /**
   * "You gain shroud until end of turn", "You and permanents you control gain hexproof until end of turn" (the player's
   * half), "you gain protection from the chosen player": see Player.gained (CR 702.11d, 702.16b-e, 702.16k, 702.18d).
   */
  | { type: "playerGains"; keywords: string[] }
  | { type: "choose"; choice: ChoiceKind; except?: string; /** The choices the text lists (keywords). */ options?: string[] };

/** What a player chooses by name: a creature type (CR 205.3m) or a color (CR 105.1). */
/** "keyword": "gains your choice of flying, vigilance, deathtouch, or haste", from the options listed (CR 608.2d). */
export type ChoiceKind = "creatureType" | "color" | "basicLandType" | "keyword";

/** A choice made as a permanent enters that adds a +1/+1 counter or not (see CompiledCard.entersOptions). */
export type EntersOption = "riot" | "unleash" | "copy" | "devour" | "amplify" | "tribute" | "tributePay" | "readAhead" | "player";

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
  /** "Clash with an opponent. If you win, ...": whether you won the last clash (CR 701.30d). */
  | { kind: "wonClash" }
  /** "If it's suspected, ...": the object, as the instruction is done (CR 701.60). */
  | { kind: "suspected"; what: ObjRef }
  /** "If the sacrificed creature was suspected" (Agency Coroner): the creature its sacrifice cost sacrificed, as it last
   * existed on the battlefield (CR 608.2h), where being suspected is a designation it had (CR 701.60). */
  | { kind: "sacrificedSuspected" }
  /** "If this spell was foretold" (CR 702.143c): it was a foretold card before it was cast, whatever it cost. */
  | { kind: "foretold" }
  /** "If ~ was bargained" (CR 702.166b). */
  | { kind: "bargained" }
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
  | { kind: "altPaid"; alt: "surge" | "spectacle" | "awaken" }
  /** "If you attacked this turn, ...": a fact about the game, checked as the spell or ability resolves (CR 608.2c). */
  | { kind: "state"; cond: StaticCondition }
  /** "If it's a creature" about target `index` (Mythos of Nethroi): that permanent as it is now, still a legal target. */
  | { kind: "targetIs"; index: number; filter: TargetSpec }
  /** "If it's a creature card" about the card "reveal the top card of your library" revealed, by its printed characteristics; `not`: "if it isn't". */
  | { kind: "revealedIs"; filter: TargetSpec; not?: true };

/** Every effect, including the ones inside "you may" and "if", in order. */
export const allEffects = (effects: Effect[]): Effect[] =>
  effects.flatMap((e) => (e.type === "may" || e.type === "if" ? [e, ...allEffects(e.effects), ...allEffects(e.otherwise ?? [])] : [e]));

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
  | "selfToGraveyard" // "When this is put into a graveyard from the battlefield" (any permanent, not just a creature)
  | "selfLeaves" // "When this leaves the battlefield", wherever it goes (CR 603.6c, 603.10a)
  /**
   * "When you lose control of ~" (Duplicity, Gustha's Scepter): it left the battlefield (looking back, CR 603.10a) or
   * another player gained control of it; the player who lost control controls the trigger (Khârn rulings).
   */
  | "selfLostControl"
  | "selfBecomesTapped" // "Whenever ~ becomes tapped": it changed from untapped to tapped (CR 701.26a)
  | "selfIsDealtDamage" // "Whenever ~ is dealt damage": once for all the damage dealt to it at the same time
  | "permanentBecomesTapped" // "Whenever a creature an opponent controls becomes tapped": see TriggeredAbility.tappedFilter
  /**
   * "Whenever one or more +1/+1 counters are put on ~" (once for each time counters are put on it, also as it enters
   * with them, CR 122.6); "on a creature you control" with TriggeredAbility.tappedFilter as the filter. See countersKind.
   */
  | "selfCountersPut"
  /** "When ~ becomes monstrous" (CR 701.37b). */
  | "selfBecomesMonstrous"
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
  | "selfAttacksOrBlocks" // Whenever ~ attacks or blocks
  | "eachEndStep" // At the beginning of the end step (every turn's)
  | "eachUpkeep" // At the beginning of each upkeep / each player's upkeep ("that player" is the active player)
  | "yourDrawStep" // At the beginning of your draw step (after the draw, CR 504.2)
  | "eachDrawStep" // At the beginning of each player's draw step
  | "selfTurnedFaceUp" // "When ~ is turned face up" (CR 708.8: it doesn't enter again)
  | "selfCast" // "When you cast this spell": cascade (CR 702.85a), triggering from the stack
  | "castSpell" // Whenever you cast a noncreature spell (see `cast`), prowess (CR 702.108a)
  | "becomesTargetOfOpponent" // ward (CR 702.21a)
  // Blocking (CR 509.3). "Blocks" and "becomes blocked" trigger once per combat; the "a creature"
  // forms trigger once for each creature it blocks or is blocked by, which is their subject.
  | "selfBlocks"
  | "selfBecomesBlocked"
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
  | "opponentLosesLife" // "Whenever an opponent loses life": once per life-loss event, damage and paying life included (CR 119.2, 119.4)
  /** "Whenever you draw a card", "whenever an opponent draws a card", "your second card each turn": see TriggeredAbility.draws. */
  | "playerDraws"
  /** "Whenever an opponent activates an ability that isn't a mana ability" (see TriggeredAbility.activates). */
  | "abilityActivated"
  /** "Whenever you sacrifice another permanent", "a Food", "~ or another creature": see TriggeredAbility.sacrifices. */
  | "youSacrifice"
  /** "Whenever you collect evidence" (CR 701.59a): for any reason, also collecting evidence 0 (rulings). */
  | "youCollectEvidence"
  /** "Whenever you complete a dungeon" (CR 309.7). */
  | "youCompleteDungeon"
  /** "Whenever you commit a crime", "whenever an opponent commits a crime" (CR 700.13): once for each spell or ability. */
  | "youCommitCrime"
  | "opponentCommitsCrime"
  /** "Whenever a creature attacks enchanted player" (not a planeswalker of theirs, rulings): that creature is the subject. */
  | "creatureAttacksEnchantedPlayer"
  /** "Whenever enchanted player is attacked": once as attackers are declared, if a creature attacks that player (rulings). */
  | "enchantedPlayerAttacked"
  /** "Whenever you discard a card", "whenever a player cycles a card": see TriggeredAbility.discards. */
  | "playerDiscards"
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
  /**
   * "Whenever one or more cards leave your graveyard", "one or more tokens you control enter", "one or more other creatures
   * die", "you discard one or more cards": once for each event that moves one or more matching objects (CR 603.2c), see
   * TriggeredAbility.batch. "That many" is how many of them matched.
   */
  | "batch";


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
  /** For "permanentBecomesTapped": which permanent ("a Dwarf you control"); it's the subject ("put a wind counter on it"). */
  tappedFilter?: TargetSpec;
  /** For "selfCountersPut" / "permanentCountersPut": that kind of counter ("+1/+1 counters"); unset = any counters. */
  countersKind?: string;
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
  cast?: { by: "you" | "opponent" | "any" | "enchanted"; spell: TargetSpec; orCopy?: boolean; nth?: number; /** "If mana from a Treasure was spent to cast it" (CR 106.3, 603.4). */ treasure?: true; /** "If at least four mana was spent to cast it", "if no mana was spent to cast it" (CR 603.4). */ spent?: SpentReq; /** Vazi: "casts a spell or activates an ability", any ability (mana abilities too), with `treasure`. */ orActivates?: true };
  /** An intervening "if" (CR 603.4): "When ~ enters, if you attacked this turn, ...". Checked as it triggers and as it resolves. */
  ifCond?: StaticCondition;
  /** For "playerDraws": who draws, and for "your second card each turn", which card of the turn it has to be. */
  draws?: { by: "you" | "opponent" | "any" | "enchanted"; nth?: number };
  /**
   * For "abilityActivated": who activated an ability that isn't a mana ability (CR 602, 605.1a), and `of`: what its
   * source had to be as it was activated, a permanent on the battlefield ("an ability of an artifact, creature, or land").
   * "That player" is who activated it.
   */
  activates?: { by: "opponent" | "any"; of?: TargetSpec };
  /**
   * For "playerDiscards": who discards, `cycled` for "cycles a card" (only a card discarded to pay a cycling cost,
   * CR 702.29c), `other` for "another card", `filter` for "a creature card". "Cycle or discard" is just "discard"
   * (rulings: cycling a card triggers it once).
   */
  discards?: { by: "you" | "opponent" | "any"; cycled?: true; other?: true; filter?: TargetSpec };
  /** For "creatureYouControlDealsCombatDamageToPlayer": which creature ("a Vampire you control", "another creature"). */
  dealer?: { filter: TargetSpec; other?: boolean };
  /** For "creatureYouControlAttacks": which creature ("a Dragon you control", "another creature you control"). */
  attacker?: { filter: TargetSpec; other?: boolean };
  /** What the event's subject has to be: "blocks a creature with flying", flanking's "a creature without flanking". */
  subjectFilter?: TargetSpec;
  /** For "creaturesYouControlAttack": "Whenever you attack with two or more creatures", at least this many of them. */
  minAttackers?: number;
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
  dies?: { filter: TargetSpec; other?: boolean; orSelf?: boolean; attached?: boolean; damagedBySelf?: boolean };
  /**
   * For "youSacrifice": what its controller sacrificed (CR 701.21a), as it last existed on the battlefield, wherever it
   * went. The card is the subject ("exile it").
   */
  sacrifices?: { filter: TargetSpec; other?: boolean; orSelf?: boolean };
  /** Persist/undying's "if it had no -1/-1 counters on it" (an intervening if, CR 603.4), from last known information. */
  ifNoCounter?: "+1/+1" | "-1/-1";
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
  /** "Whenever ~ attacks for the first time each turn": only on its first attack this turn, as this object (Aurelia). */
  firstAttack?: true;
  /** Battalion: "Whenever ~ and at least two other creatures attack", at least this many others attacking with it. */
  withOthers?: number;
  /** Training (CR 702.149a): "and at least one other creature with power greater than this creature's power attack". */
  training?: boolean;
  /** Renown's "if it isn't renowned" (CR 702.112a), checked as it triggers and as it resolves. */
  ifNotRenowned?: boolean;
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
  what: "enters" | "leaves" | "leavesGraveyard" | "toGraveyard" | "discards";
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
  from?: "library" | "battlefield";
  to?: "exile";
  /** "For the first time each turn": only the first such event this turn (counting the ones before this permanent was there). */
  first?: true;
}

export interface ActivatedAbility {
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
  /** "Reveal the player you chose" (Guardian Archon): payable only if a player was secretly chosen for it as it entered. */
  revealChosen?: true;
  /** Exhaust: "Activate only once" (CR 702.177a), for as long as it's the same object (CR 400.7): see GameObject.activatedEver. */
  onceEver?: true;
  /** The keyword written before it ("Exhaust — {2}{G}: ..."), which effects can refer to (CR 702.142b, 702.177b). */
  keyword?: "Exhaust" | "Boast";
  /** "Activate no more than twice each turn" (CR 602.5b). */
  maxPerTurn?: number;
  /** "Activate only if you have the city's blessing" (CR 602.5b). */
  activateIf?: StaticCondition;
  /** "Pay 2 life" as part of the cost (CR 119.4: only with at least that much life). */
  lifeCost?: number;
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
  | { kind: "chosenColor"; also?: ManaType }
  /**
   * "One mana of any color that a land an opponent controls could produce" (Fellwar Stone, Exotic Orchard), "of any
   * type that a land you control could produce" (Reflecting Pool): what those lands' mana abilities would make (CR 106.7).
   */
  | { kind: "landsCouldProduce"; whose: "you" | "opponent"; anyType?: boolean }
  /** "Add {W}{W}, {W}{U}, or {U}{U}" (filter lands): one of these combinations, chosen as it resolves (CR 605.3b). */
  | { kind: "combos"; options: ManaType[][] };

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
  /** "Activate only if you control a Swamp." (CR 602.5b): it can't be activated otherwise, but it still could produce its mana (CR 106.7, rulings on Reflecting Pool). */
  activateIf?: StaticCondition;
  /** "Spend this mana only to cast a creature spell." (CR 106.6) */
  spendOnly?: ManaSpend;
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
  text: string;
}

/**
 * When a land that "enters tapped unless ..." enters untapped (a replacement effect, CR 614.1d):
 * you (or the opponents) control enough of some permanents, or a player is at low life, or you
 * have enough opponents.
 */
export type EntersCondition =
  | { kind: "control"; who: "you" | "opponents"; types?: string[]; subtypes?: string[]; supertypes?: string[]; other?: boolean; min?: number; max?: number }
  | { kind: "playerLifeAtMost"; n: number }
  | { kind: "opponents"; min: number };

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
  /** Whose spells: the permanent's controller's, their opponents', or everyone's. */
  who: "you" | "opponents" | "all";
  /** Which spells (printed characteristics, with the chosen X counted in the mana value, CR 202.3e). */
  filter: TargetSpec;
  n: number;
  turn?: "yours" | "notYours";
  /** "Spells you cast from your graveyard". */
  fromGraveyard?: boolean;
  /** "The first creature spell you cast each turn", "the second spell you cast each turn": only the nth matching spell. */
  nth?: number;
  /** Only while this holds: a Class level's (CR 716.2a). */
  if?: StaticCondition;
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
  | { kind: "sacrifice"; filter: TargetSpec; n: number; other?: boolean; x?: true }
  /** "discard a land card" (retrace); `random`: "discard a card at random", chosen by the game as it's paid (CR 701.9b). */
  | { kind: "discard"; n: number; filter?: TargetSpec; random?: true; x?: true; /** "Discard an Island card and another card" (Foil): at least one of the `n` matches this. */ oneOf?: TargetSpec }
  | { kind: "payLife"; n: number; x?: true }
  /** `top`: "exile the top creature card of your graveyard": the topmost `n` that match, nothing to choose (CR 404.1). */
  | { kind: "exileFromGraveyard"; filter?: TargetSpec; n: number; x?: true; top?: true }
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
  | { kind: "collectEvidence"; n: number };

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
export type AltCostKind = "evidence" | "evoke" | "dash" | "bestow" | "madness" | "blitz" | "warp" | "alternative" | "prototype" | "wubrg" | "emerge" | "freerunning" | "foretell" | "sneak" | "surge" | "spectacle" | "overload" | "awaken" | "miracle";

/** `grantedFlashback`: flashback an effect gave the card, with its mana cost as the cost (Snapcaster Mage), next to any of its own (rulings). */
export type CastFromGraveyardKind = "flashback" | "jumpStart" | "retrace" | "escape" | "mayhem" | "harmonize" | "grantedFlashback" | "permission";
export interface CastFromGraveyard {
  kind: CastFromGraveyardKind;
  mana?: string;
  costs: AdditionalCost[];
  exile: boolean;
  /** "You may cast this card from your graveyard as long as you control a Zombie" (Gravecrawler). */
  if?: StaticCondition;
}

/**
 * Replacement effects that change how many tokens are created or counters put on (CR 614.1a): Parallel Lives,
 * Doubling Season, Hardened Scales, Xorn. `who`: "you" = only for its controller's tokens / permanents.
 */
export type CountMod =
  | { what: "tokens"; who: "you" | "any"; op: "double" | "plusOne"; subtype?: string }
  | { what: "counters"; counter?: CounterKind; on: "creature" | "permanent"; who: "you" | "any"; op: "double" | "plusOne" | "minusOne"; other?: boolean };

/**
 * What a gift gives the chosen opponent (CR 702.174d-i): "Gift a card" means they draw a card, "Gift a Food" that they
 * create a Food token, and so on. `effects` do it, with that player as the "giftee".
 */
export interface Gift {
  what: string;
  effects: Effect[];
}

export interface CompiledCard {
  spell?: AbilityBody; // instants and sorceries
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
  exileInsteadOfDying?: { self?: true; filter?: TargetSpec; other?: true };
  /** "If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead." */
  shuffleInsteadOfGraveyard?: boolean;
  /**
   * "Creatures your opponents control enter tapped", "Artifacts and lands enter tapped": a replacement effect on other
   * permanents entering (CR 614.1c, 614.12), checked against them as they'd be on the battlefield.
   */
  othersEnterTapped?: { filter: TargetSpec; text: string }[];
  entersTappedUnless?: EntersCondition;
  entersTappedChoice?: EntersChoice;
  /** "As ~ enters, choose a creature type / a color" (CR 614.12): made as it enters, kept while it's on the battlefield. */
  entersChoose?: { what: ChoiceKind; except?: string }[];
  /** "As ~ enters, choose a player" / "an opponent" (CR 614.12): kept while it's on the battlefield, as Chosen.player. */
  entersChoosePlayer?: "player" | "opponent";
  /**
   * Primeval Spawn: "If ~ would enter and it wasn't cast or no mana was spent to cast it, exile it instead" (CR 614.1a),
   * judged by the abilities it would have on the battlefield (614.12): under Humility it enters (rulings).
   */
  exileUnlessCastWithMana?: true;
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
  entersAsCopy?: { filter: TargetSpec; except?: CopyExcept; untilEndOfTurn?: boolean };
  /** "~ enters with N +1/+1 counters on it." (a replacement effect, CR 614.1c); modular N too (CR 702.43a). */
  entersWithCounters?: { counter: CounterKind; n: Amount; /** Raid: "if you attacked this turn". */ if?: StaticCondition; /** "If you cast it from your hand" (the Myojin). */ castFromHand?: true };
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
  /** "~ can't be countered." CR 101.2 */
  cantBeCountered?: boolean;
  /**
   * "Creature spells you control can't be countered", "Creature spells can't be countered", "Spells you control can't be
   * countered": spells matching `filter`, controlled by this permanent's controller unless `anyone` (CR 101.2).
   */
  uncounterable?: { filter: TargetSpec; anyone?: true }[];
  /** "Your opponents can't cast spells during your turn." (a "can't" that wins over any "can", CR 101.2) */
  opponentsCantCastYourTurn?: true;
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
  /** The Leylines: "If ~ is in your opening hand, you may begin the game with it on the battlefield" (CR 103.6a). */
  beginOnBattlefield?: boolean;
  /** "If you would gain life, you gain twice that much life instead" (a replacement effect, CR 614.1a). */
  doubleLifeGain?: boolean;
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
  /** "Room abilities of dungeons you own trigger an additional time" (Hama Pashar, CR 603.2d). */
  roomsTwice?: true;
  /** "Players can't gain life." / "Your opponents can't gain life." (CR 119.7) */
  cantGainLife?: "all" | "opponents" | "enchanted";
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
  /** "You have no maximum hand size." (CR 402.2): its controller doesn't discard down in cleanup. */
  noMaxHandSize?: boolean;
  /**
   * "Sliver spells you cast have cascade", "Instant and sorcery spells you cast from your hand have cascade", "The first
   * spell you cast each turn has cascade" (CR 702.85a): those spells have cascade as they're cast. `first`: the first such
   * spell its controller cast this turn, counting ones before this permanent was there; `fromHand` / `fromExile`: cast
   * from there; `treasure`: "that mana from a Treasure was spent to cast" (CR 106.3).
   */
  spellsHaveCascade?: { filter?: TargetSpec; from?: "hand" | "exile"; first?: true; treasure?: true; text: string }[];
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
  equipLess?: { n: number; targetSelf?: true; otherEquipment?: true; /** Only while this holds (a Class level's). */ if?: StaticCondition }[];
  /**
   * Torpor Orb: "Creatures entering don't cause abilities to trigger" (`types`: the entering permanent's, as it is on the
   * battlefield); Elesh Norn's "... abilities of permanents your opponents control" (`opponents`).
   */
  enterLock?: { types?: string[]; opponents?: true };
  /** Fist of Suns: "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast" (an alternative cost, CR 118.9). */
  payWUBRG?: true;
  /**
   * Obstinate Baloth: "If a spell or ability an opponent controls causes you to discard ~, put it onto the battlefield
   * instead of putting it into your graveyard" (a replacement effect, CR 614.1a). It's still discarded (rulings).
   */
  discardedToBattlefield?: boolean;
  /** "Skip your draw step." (CR 614.10): its controller's draw steps don't happen. */
  skipDrawStep?: boolean;
  /** "You may choose not to untap ~ during your untap step." (CR 502.3): its controller decides as the step untaps. */
  mayNotUntap?: boolean;
  /**
   * "You may cast spells as though they had flash", "... sorcery spells ...", "... creature spells ..." (CR 702.8a): its
   * controller may cast spells like these any time they could cast an instant.
   */
  flashFor?: TargetSpec[];
  /** "Whenever enchanted land is tapped for mana, its controller adds an additional {G}" and the like (CR 605.1b). */
  manaTriggers?: ManaTrigger[];
  countMods?: CountMod[];
  /** "You may play an additional land on each of your turns." (CR 305.2a): one more land each turn per such ability. */
  extraLands?: number;
  /** The same, only while each condition holds (a Class level's, CR 716.2a). */
  extraLandsIf?: StaticCondition[];
  /** "You may play lands from your graveyard." (Crucible of Worlds): a permission; each still uses a land play (CR 305.2). */
  landsFromGraveyard?: boolean;
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
}

// The effect language. Card rules text is compiled (see oracle.ts) into these plain,
// serializable structures, and the engine executes them (see effects.ts). Everything
// here is data, so abilities can sit on the stack inside GameState.

import type { Color, FaceDownKind, ManaType, ObjectId, PlayerId } from "./types";
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
export type PickAction = "sacrifice" | "bounce" | "counters" | "populate" | "pair";

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

export interface UnlessPays {
  cost: string;
  generic?: Amount;
  life?: number;
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
  /** "The number of creatures you control", "for each other Elf you control". `filter.controller` is from the ability's controller's view. */
  | { kind: "permanents"; filter: TargetSpec; other?: boolean }
  /** "The number of cards in your hand", "in that player's hand". */
  | { kind: "cardsInHand"; who: PlayerRef }
  | { kind: "cardsInLibrary"; who: PlayerRef }
  /** "Creature cards in your graveyard", "cards in all graveyards" (`filter` is a "card" spec). */
  | { kind: "cardsInGraveyard"; who: PlayerRef; filter?: TargetSpec }
  /** "~'s power", "its toughness", "that creature's mana value": as it is now, or as it last existed (CR 608.2h). */
  | { kind: "power" | "toughness" | "manaValue"; of: ObjRef }
  | { kind: "life"; who: PlayerRef }
  /** Devotion to a color, or to several (CR 700.5). */
  | { kind: "devotion"; colors: Color[] }
  /** "For each Aura attached to it", "each Equipment attached to it". */
  | { kind: "attachedToSelf"; subtypes: string[] }
  /** Domain: "basic land type among lands you control". */
  | { kind: "basicLandTypes" }
  /** How many times the spell (or the permanent it became) was kicked (CR 702.33d); `which` = with that kicker cost only. */
  | { kind: "kicked"; which?: number }
  /** 1 if it was kicked at all (or with kicker cost `which`), else 0. */
  | { kind: "wasKicked"; which?: number }
  /** "That much", "that many" in a triggered ability: the damage its event dealt. */
  | { kind: "eventAmount" }
  /** "For each creature it devoured" (CR 702.82b). */
  | { kind: "devoured" }
  /** "For each charge counter on ~", "the number of +1/+1 counters on it": as it last existed if it's gone. */
  | { kind: "counters"; counter: CounterKind; of: ObjRef };

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
  supertypes?: string[]; // "basic land", "legendary creature"
  /** At least one of these subtypes: "Spirit card", "Walls" (changelings have every creature type). */
  subtypes?: string[];
  notSupertypes?: string[]; // "nonbasic land", "nonlegendary creature"
  keywords?: string[]; // "creature with flying"
  notKeywords?: string[]; // "creature without flying"
  power?: Range; // "with power 4 or greater"
  toughness?: Range;
  manaValue?: Range; // "with mana value 3 or less" (CR 202.3)
  combat?: "attacking" | "blocking" | "attackingOrBlocking";
  /** "With lesser power" than the ability's source (mentor, CR 702.134a). */
  lesserPowerThanSource?: boolean;
  /**
   * "Target creature that player controls" in a trigger about a player ("Whenever ~ deals combat damage to a
   * player"): "eventPlayer", made concrete as `controlledBy` once the trigger knows that player.
   */
  controller?: "you" | "opponent" | "eventPlayer";
  controlledBy?: PlayerId;
  /** For players: only opponents. */
  opponent?: boolean;
  /** "Up to two target creatures": this target may be left unchosen (CR 115.6). */
  optional?: boolean;
  /** "Another target creature" on a permanent's ability: not the source itself. */
  notSource?: boolean;
  /**
   * Targets this one can't be the same as: the others of the same "two target creatures" (CR 115.3),
   * or the earlier ones for "another target".
   */
  distinctFrom?: number[];
  /** true: tapped; false: untapped. */
  tapped?: boolean;
  /** true: a token; false: "nontoken". */
  token?: boolean;
  /** "a card named ~": the source's name (only for searches). */
  named?: string;
  /** None of these subtypes. */
  notSubtypes?: string[];
  /** "creature with a +1/+1 counter on it" */
  counter?: "+1/+1" | "-1/-1";
  /**
   * "of the chosen type", "that aren't of the chosen type", "of the chosen color": the creature type
   * or color chosen for the source (see GameObject.chosen) or while the spell resolves. Before
   * `bindChosen` fills it in, a filter that needs a choice that wasn't made matches nothing.
   */
  chosen?: "type" | "notType" | "color" | "notColor";
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
}

/**
 * A chosen target. For objects, `zc` is its zoneChanges when chosen: if it has changed zones
 * since, it's a new object and no longer the target (CR 400.7, 608.2b).
 */
export type TargetChoice =
  | { kind: "object"; id: ObjectId; zc?: number }
  | { kind: "player"; id: PlayerId }
  | { kind: "stack"; id: string }
  /** An "up to N" target left unchosen (CR 115.6, 601.2c). */
  | { kind: "none" };

/** A target that was actually chosen. */
export type ChosenTarget = Exclude<TargetChoice, { kind: "none" }>;

/** Which object(s) an effect touches. */
export type ObjRef =
  /** `n`: "up to two target creatures" is `n` targets in a row, starting at `index`. */
  | { ref: "target"; index: number; n?: number }
  | { ref: "self" } // the source permanent ("this creature")
  | { ref: "damagedThisWay" }
  /** The card a "whenever a creature dies" trigger was about, in the zone it went to, while it's still that object (CR 400.7). */
  | { ref: "subjectCard" } // "a creature dealt damage this way": what this ability's damage hit
  | { ref: "subject" } // the object its trigger event was about: exalted's "that creature" (see PendingTrigger.subject)
  /** After a leaves-the-battlefield trigger: the card in the zone it went to, if it's still that object ("return it to your hand"). */
  | { ref: "selfCard" }
  /** "Create a 0/0 Fractal creature token. Put X +1/+1 counters on it": the token(s) this ability just created. */
  | { ref: "created" }
  /** "The sacrificed creature": what was sacrificed to cast the spell, as it last existed (CR 608.2h). */
  | { ref: "sacrificed" }
  /** Battle cry's "each other attacking creature". */
  | { ref: "allCreatures"; controller?: "you" | "opponent"; other?: boolean; attacking?: boolean }
  /** "Enchanted creature", "equipped creature": the permanent the source is attached to, while it's still that source. */
  | { ref: "attached" }
  /** Joint Assault's "if it's paired with a creature, that creature": what target `index` is paired with as this resolves (CR 702.95b). */
  | { ref: "pairedWithTarget"; index: number }
  /** "all creatures", "each artifact and enchantment", "other creatures you control": every permanent that matches, not targeted. */
  | { ref: "each"; filter: TargetSpec; other?: boolean; /** A spell's "other creatures you control" after "target creature you control": all but that target. */ otherThan?: number };

/** Which player(s) an effect touches. */
export type PlayerRef =
  | { ref: "you" }
  | { ref: "subjectController" } // the controller of the object the trigger was about, or as it last existed
  | { ref: "target"; index: number }
  | { ref: "eachOpponent" }
  | { ref: "eachPlayer" }
  | { ref: "targetController"; index: number } // "its controller"
  /** "That player" in "Whenever ~ deals combat damage to a player, that player discards a card". */
  | { ref: "eventPlayer" };

export type DamageRecipient = ObjRef | PlayerRef | { ref: "anyTarget"; index: number; /** "each of up to two targets" */ n?: number };

/** Does this reference cover target `i`? ("up to two target creatures" covers two in a row.) */
export const refCovers = (r: object, i: number): boolean =>
  "index" in r && typeof r.index === "number" && i >= r.index && i < r.index + ("n" in r && typeof r.n === "number" ? r.n : 1);

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
}

/**
 * One change made by a continuous effect. Each kind belongs to one layer (CR 613.1),
 * see `layerOf` in layers.ts. An effect can have parts in several layers (CR 613.6).
 */
export type Modification =
  | { kind: "control" } // layer 2: the effect's controller controls it
  | { kind: "addTypes"; types: string[]; subtypes: string[] } // layer 4, "in addition to its other types"
  | { kind: "setTypes"; types: string[]; subtypes: string[] } // layer 4, "becomes a 3/3 Elemental creature": new card types replace the old (CR 205.1a)
  | { kind: "setSubtypes"; subtypes: string[] } // layer 4, "becomes a Frog": replaces only subtypes of the same kind (CR 205.1a)
  | { kind: "setColors"; colors: Color[] } // layer 5
  | { kind: "addKeywords"; keywords: string[] } // layer 6
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
  | { kind: "cantBlock" }
  | { kind: "cantBeBlocked" }
  | { kind: "doesntUntap" }
  | { kind: "blocksOnlyFlyers" } // "can block only creatures with flying" (a blocking restriction, CR 509.1b)
  | { kind: "attacksIfAble" } // "attacks each combat if able" (an attack requirement, CR 508.1d)
  /** "Can't be blocked by creatures with power 2 or less", "by Walls", "by blue creatures" (CR 509.1b). */
  | { kind: "cantBeBlockedBy"; filter: TargetSpec }
  /** "Can't be blocked by more than one creature" (CR 509.1b). */
  | { kind: "maxOneBlocker" }
  /** "Can't attack unless defending player controls an Island": checked per defending player (CR 508.1c). */
  | { kind: "cantAttackUnless"; defenderControls: TargetSpec }
  /** "Creatures with power less than ~'s power can't block it" (CR 509.1b). */
  | { kind: "cantBeBlockedByLesserPower" }
  /** "Can't attack alone", "can't block alone" (CR 506.5, 508.1c, 509.1b). */
  | { kind: "cantAttackAlone" }
  | { kind: "cantBlockAlone" }
  /** Blocking requirements (CR 509.1c): "must be blocked if able", "all creatures able to block ~ do so". */
  | { kind: "mustBeBlocked" }
  | { kind: "allMustBlock" }
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
      controller?: "you" | "opponent";
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
  /** Delirium: card types among cards in your graveyard (CR 205.2a). */
  | { kind: "graveyardTypes"; n: number }
  /** Descend: permanent cards in your graveyard (CR 110.4b). */
  | { kind: "graveyardPermanents"; n: number }
  | { kind: "selfCounter"; counter: CounterKind }
  /** "As long as it's attacking", "it's enchanted / equipped", "it's modified" (CR 700.9), "if it devoured a creature" (CR 702.82b). */
  | { kind: "self"; is: "attacking" | "enchanted" | "equipped" | "modified" | "devoured" }
  /** "As long as you have the city's blessing" (CR 702.131c). */
  | { kind: "citysBlessing"; /** "Unless you have the city's blessing". */ not?: true }
  | { kind: "yourTurn" }
  /** "As long as you're the monarch" (CR 725). */
  | { kind: "monarch" }
  /**
   * "Whenever ~ attacks a player, if no opponent has more life than that player": none of the attacking player's
   * opponents has more life than the attacked player (rulings; the attacker's own life isn't compared).
   */
  | { kind: "defenderMostLife" }
  /** "Unless it's paired with a creature with soulbond" (CR 702.95b): `not` for "unless". */
  | { kind: "paired"; withKeyword?: string; not?: true }
  /** Raid: "if you attacked this turn" (with one or more creatures). */
  | { kind: "attackedThisTurn" }
  /**
   * "As long as you control three or more artifacts / another Wizard / no untapped lands", "as long as
   * an opponent controls an Island", "as long as defending player controls an artifact".
   */
  | { kind: "control"; who: "you" | "opponent" | "defending"; filter: TargetSpec; min?: number; max?: number; other?: boolean };

export type Effect =
  /** `also`: more recipients dealt the same damage at the same time ("to each creature and each player", CR 120.3). */
  | { type: "damage"; amount: Amount; to: DamageRecipient; also?: DamageRecipient[] }
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
  /** "Return the exiled card to the battlefield under its owner's control": the cards this object's linked exile took (CR 607.2a). */
  | { type: "returnLinked"; dest: "battlefield" | "hand" }
  /**
   * "Sacrifice a creature", "each opponent sacrifices a creature of their choice", "return a land you
   * control to its owner's hand": each player picks n of their own permanents that match, in APNAP order,
   * then they're all sacrificed or returned at once (CR 101.4, 701.21). Not targeted.
   */
  | { type: "pick"; who: PlayerRef; filter: TargetSpec; n: Amount; action: PickAction; /** For "counters": "put two +1/+1 counters on a creature you control". */ counter?: { kind: CounterKind; n: Amount } }
  | { type: "bounce"; what: ObjRef } // return to owner's hand (from the battlefield or a graveyard)
  /** "Return target creature card from your graveyard to the battlefield": enters under the effect controller's control (CR 110.2a). */
  | { type: "putOntoBattlefield"; what: ObjRef; tapped?: boolean }
  /** "Put target card from your graveyard on top of / on the bottom of its owner's library". */
  | { type: "putInLibrary"; what: ObjRef; position: "top" | "bottom" }
  | { type: "exileGraveyard"; who: PlayerRef } // "Exile target player's graveyard"
  | { type: "tap"; what: ObjRef }
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
  /** "If that creature would die this turn, exile it instead": a replacement effect for the rest of the turn (CR 614.1a). */
  | { type: "exileIfDies"; what: ObjRef }
  | { type: "untap"; what: ObjRef }
  /** "That creature doesn't untap during its controller's next untap step." */
  | { type: "skipUntap"; what: ObjRef }
  /** `perLastKnownCounter`: modular's "a +1/+1 counter for each +1/+1 counter on this permanent", as it last was. */
  | { type: "counters"; what: ObjRef; counter: CounterKind; n: Amount; perLastKnownCounter?: "+1/+1" | "-1/-1" }
  /** "Sacrifice ~" as an effect: only a permanent its controller controls (CR 701.21a). */
  | { type: "sacrifice"; what: ObjRef }
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
  | { type: "explore" }
  /** Renown N (CR 702.112a): if it isn't renowned, N +1/+1 counters and it becomes renowned. */
  | { type: "renown"; n: number }
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
  | { type: "delayed"; when: "nextTurnUpkeep" | "nextEndStep" | "endOfCombat"; effects: Effect[]; text: string; each?: "created" | "subject" }
  /** Ninjutsu (CR 702.49a): put this card onto the battlefield from your hand tapped and attacking. */
  | { type: "ninjutsu" }
  /** "Exile the top two cards of your library. Until the end of your next turn, you may play those cards." */
  | { type: "impulse"; n: Amount; until: "thisTurn" | "nextTurn" }
  | { type: "removeSelfCounter"; counter: CounterKind; orSacrifice?: boolean }
  /** "Remove a +1/+1 counter from it", "remove all -1/-1 counters from ~" (CR 122.8): as many as it has, at most. */
  /** CR 702.116a: token copies of the source attacking each opponent other than defending player (the event player). */
  | { type: "myriad" }
  /** "When you next cast an instant or sorcery spell this turn, ...": a delayed trigger on that cast (CR 603.7). */
  | { type: "nextCast"; filter: TargetSpec; effects: Effect[]; text: string }
  /**
   * Copy a spell (CR 707.10): the one whose casting triggered this ("cause": storm, replicate, "copy that spell") or a
   * target. `n`: "storm" is the spells cast before it this turn, "kicked" the times its replicate cost was paid.
   * `newTargets`: "you may choose new targets for the copy" (707.10c).
   */
  | { type: "copySpell"; spell: "cause" | { target: number }; n: Amount | "storm" | "kicked"; newTargets: boolean }
  | { type: "removeCounters"; what: ObjRef; counter: CounterKind; n: Amount | "all" }
  /** "Move a +1/+1 counter from ~ onto that creature" (CR 122.5): nothing happens unless both parts can. */
  | { type: "moveCounter"; counter: CounterKind; from: ObjRef; to: ObjRef }
  /** Cascade (CR 702.85a), resolving: exile until a cheaper nonland card, maybe cast it free, the rest to the bottom. */
  | { type: "cascade" }
  /** Evolve's effect (CR 702.100a): a +1/+1 counter on the source if the entering creature (the subject) is still bigger. */
  | { type: "evolve" }
  /** `notSource`: backup's "If that's another creature, it gains ..." (CR 702.165a). */
  | { type: "continuous"; what: ObjRef; mods: Modification[]; duration: "endOfTurn" | "game"; notSource?: boolean }
  | { type: "attach"; what: ObjRef } // attach the source (an Equipment) to it, CR 701.3
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
  | { type: "createToken"; who: PlayerRef; n: Amount; token: TokenSpec; tapped?: boolean; attacking?: boolean }
  | { type: "mill"; who: PlayerRef; n: Amount }
  | { type: "discard"; who: PlayerRef; n: Amount; random?: boolean } // CR 701.9
  | { type: "scry"; n: Amount } // CR 701.22, by the controller
  | { type: "surveil"; n: Amount } // CR 701.25
  | { type: "fight"; a: ObjRef; b: ObjRef } // CR 701.14: each deals damage equal to its power to the other
  | { type: "bite"; a: ObjRef; b: ObjRef } // a deals damage equal to its power to b
  /** Counter the targeted spell (CR 701.6a), maybe unless its controller pays (CR 118.12); "exile it instead". */
  | { type: "counterSpell"; index: number; unless?: UnlessPays; exile?: boolean }
  /**
   * Counter the spell or ability that triggered this unless its controller pays: ward (CR 702.21a),
   * "Whenever a player casts a spell, counter it unless that player pays {1}".
   */
  | { type: "counterUnlessPays"; unless: UnlessPays; ward?: boolean }
  /**
   * "You may [do something]": the controller chooses as it resolves whether to do it
   * (CR 608.2d). Its targets were still chosen when it was put on the stack (CR 603.3d).
   */
  | { type: "may"; effects: Effect[]; text: string; otherwise?: Effect[]; pay?: PayCost; keep?: boolean }
  /**
   * Cumulative upkeep (CR 702.24a): put an age counter on it, then you may pay the cost once for each
   * age counter on it; if you don't, sacrifice it.
   */
  | { type: "cumulativeUpkeep"; pay: PayCost } // "If you don't, ...": fabricate (CR 702.123a)
  /** "You get {E}{E}" (CR 107.14): energy counters on a player (CR 122.1). */
  | { type: "getEnergy"; who: PlayerRef; n: Amount }
  /** Unearth (CR 702.84a): return the source card from your graveyard to the battlefield with haste, exiled at the next end step or if it would leave. */
  | { type: "unearth" }
  /** Rebound's delayed trigger (CR 702.88a): "you may cast this card from exile without paying its mana cost". */
  | { type: "castFromExileFree" }
  /** "You become the monarch" (CR 725). */
  | { type: "becomeMonarch"; who: PlayerRef }
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
  /** "Prevent the next 2 damage that would be dealt to any target this turn" (a prevention shield, CR 615.7). */
  | { type: "preventNext"; n: Amount; to: DamageRecipient }
  /** "Prevent all combat damage that would be dealt this turn" (CR 615.1). */
  | { type: "preventCombatDamage" }
  /** "If ~ was kicked, ...", with "... instead" as `otherwise` being what it does when it wasn't. */
  | { type: "if"; cond: SpellCondition; effects: Effect[]; otherwise?: Effect[] }
  /**
   * "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle"
   * (CR 701.23). `filter` unset = any card. Found cards go to `dest`; with `others`, only the first
   * does and the rest go there (Cultivate). The library is then shuffled (CR 701.20).
   */
  | { type: "search"; filter?: TargetSpec; n: Amount; upTo: boolean; dest: SearchDest; others?: SearchDest; reveal: boolean }
  /**
   * "Look at the top four cards of your library. You may reveal a creature card from among them and put it
   * into your hand. Put the rest on the bottom of your library in a random order." Pick `count` of the top
   * `n` (matching `filter`; `upTo`: any number up to that), put them `into` there, and the others `rest`.
   */
  | { type: "dig"; n: Amount; count: number; upTo: boolean; filter?: TargetSpec; into: "hand" | "libraryTop"; rest: "graveyard" | "bottom"; reveal: boolean }
  /**
   * "Choose a creature type." / "Choose a color." while it resolves: later instructions use the
   * choice ("of the chosen type", "of that color"). `except`: "other than Wall".
   */
  | { type: "choose"; choice: ChoiceKind; except?: string };

/** What a player chooses by name: a creature type (CR 205.3m) or a color (CR 105.1). */
export type ChoiceKind = "creatureType" | "color";

/** A choice made as a permanent enters that adds a +1/+1 counter or not (see CompiledCard.entersOptions). */
export type EntersOption = "riot" | "unleash" | "copy" | "devour";

/** A fact about how the spell was cast: "if ~ was kicked", "if it was kicked with its {1}{U} kicker" (CR 702.33e-f). */
export type SpellCondition =
  | { kind: "kicked"; which?: number; /** As written, before compile() turns it into `which`. */ cost?: string }
  /** "You may discard a card. If you do, draw a card.": whether the last "you may" was done (CR 608.2c). */
  | { kind: "youDid" }
  /** "If you attacked this turn, ...": a fact about the game, checked as the spell or ability resolves (CR 608.2c). */
  | { kind: "state"; cond: StaticCondition };

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
   * has no targets or effects of its own; see `withModes` in modes.ts.
   */
  modal?: { min: number; max: number; modes: AbilityBody[] };
}

export type TriggerEvent =
  /** A state trigger (CR 603.8): "When you control no Islands, sacrifice ~", see TriggeredAbility.state. */
  | "state"
  | "selfEnters" // When this enters
  | "selfDies" // When this dies
  | "selfToGraveyard" // "When this is put into a graveyard from the battlefield" (any permanent, not just a creature)
  | "selfLeaves" // "When this leaves the battlefield", wherever it goes (CR 603.6c, 603.10a)
  /** "Whenever a creature you control enters", "another Ally", "~ or another artifact": see TriggeredAbility.enters. */
  | "permanentEnters"
  /** "Whenever another creature dies", "a creature you control", "equipped creature": see TriggeredAbility.dies. */
  | "permanentDies"
  | "selfBecomesTarget" // "When this becomes the target of a spell or ability"
  | "selfAttacks" // Whenever this attacks
  | "selfDealsCombatDamageToPlayer"
  /** "Whenever ~ deals damage": once per event, however many things it damaged at once; "that much" is the total. */
  | "selfDealsDamage"
  | "selfDealsCombatDamage"
  | "monarchEndStep" // the monarch's inherent abilities (CR 725.2): no source, fired by the game
  | "monarchDamaged"
  | "anotherCreatureYouControlEnters"
  | "landYouControlEnters" // landfall: "Whenever a land you control enters"
  | "creatureYouControlAttacksAlone" // exalted (CR 702.83a)
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
  | "selfBlocksOrBecomesBlocked" // bushido (CR 702.45a)
  | "selfBlocksCreature"
  | "selfBlockedByCreature" // flanking (CR 702.25a)
  | "selfBlocksOrBlockedByCreature"
  | "youGainLife" // "Whenever you gain life": once per source that makes you gain life (CR 119.10)
  /** "Whenever you draw a card", "whenever an opponent draws a card", "your second card each turn": see TriggeredAbility.draws. */
  | "playerDraws"
  | "selfTargetedByYourSpell" // heroic: "Whenever you cast a spell that targets ~"
  | "selfLastTimeCounterRemoved" // vanishing: "When the last time counter is removed from ~" (CR 702.63a)
  /** "When ~ exploits a creature" (CR 702.110b); the exploited creature is the subject. */
  | "selfExploits"
  /** "Whenever a creature you control exploits a nontoken creature": see TriggeredAbility.subjectFilter. */
  | "creatureYouControlExploits"
  /** "Whenever one or more creatures you control attack" / "Whenever you attack": once per declaration, see TriggeredAbility.group. */
  | "creaturesYouControlAttack"
  /** "Whenever one or more creatures you control deal combat damage to a player": once per player dealt damage. */
  | "creaturesYouControlDealCombatDamageToPlayer";


export interface TriggeredAbility {
  event: TriggerEvent;
  body: AbilityBody;
  /** For "state": the game state that triggers it, checked whenever state-based actions are (CR 603.8). */
  state?: StaticCondition;
  /** For "castSpell": who casts it, and what kind of spell ("noncreature spell", "instant or sorcery spell"). */
  /** `orCopy`: magecraft's "whenever you cast or copy" also triggers on a copy put on the stack. */
  cast?: { by: "you" | "opponent" | "any"; spell: TargetSpec; orCopy?: boolean };
  /** An intervening "if" (CR 603.4): "When ~ enters, if you attacked this turn, ...". Checked as it triggers and as it resolves. */
  ifCond?: StaticCondition;
  /** For "playerDraws": who draws, and for "your second card each turn", which card of the turn it has to be. */
  draws?: { by: "you" | "opponent" | "any"; nth?: number };
  /** What the event's subject has to be: "blocks a creature with flying", flanking's "a creature without flanking". */
  subjectFilter?: TargetSpec;
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
  /** Training (CR 702.149a): "and at least one other creature with power greater than this creature's power attack". */
  training?: boolean;
  /** Renown's "if it isn't renowned" (CR 702.112a), checked as it triggers and as it resolves. */
  ifNotRenowned?: boolean;
  /** "When ~ enters, if it was kicked, ..." (an intervening if, CR 603.4). */
  ifKicked?: SpellCondition;
  /** Evoke's "if its evoke cost was paid" (CR 702.74a). */
  ifEvoked?: boolean;
  /** Echo's "if this permanent came under your control since the beginning of your last upkeep" (CR 702.30a). */
  ifEcho?: boolean;
  /** Soulbond's "if you control both ... and both are unpaired" (CR 702.95a, an intervening if). */
  ifSoulbond?: boolean;
}

export interface ActivatedAbility {
  manaCost: string; // "{2}{R}" or ""
  tap: boolean;
  sacrificeSelf: boolean;
  sorcerySpeed: boolean;
  body: AbilityBody;
  text: string;
  /** Works only while the card is in its owner's hand, like cycling (CR 702.29a), or graveyard, like unearth (CR 702.84a). Otherwise on the battlefield. */
  zone?: "hand" | "graveyard";
  /** "Discard this card" is part of the cost (cycling). */
  discardSelf?: boolean;
  /** Crew N (CR 702.122a): the cost is tapping other untapped creatures you control with total power N or more. */
  crew?: number;
  /** "Activate only once each turn" (CR 602.5b). */
  oncePerTurn?: boolean;
  /** "Activate only if you have the city's blessing" (CR 602.5b). */
  activateIf?: StaticCondition;
  /** "Pay 2 life" as part of the cost (CR 119.4: only with at least that much life). */
  lifeCost?: number;
  /** "Pay {E}{E}" as part of the cost (CR 107.14). */
  energyCost?: number;
  /** "Exile this card from your graveyard" is part of the cost: scavenge (CR 702.97a). */
  exileSelf?: boolean;
  /** "Sacrifice a creature", "Discard a card" as part of the cost (CR 602.2b, 601.2h). */
  costs?: AdditionalCost[];
  /** "Remove three spore counters from ~" as part of the cost (CR 602.2b). */
  removeCounters?: { counter: CounterKind; n: number };
}

/**
 * What a mana ability adds (CR 106.1, 605). "fixed": exactly these, `count` times over if it
 * says "for each" ("Add {G} for each creature you control"). "oneOf": `amount` mana of one of
 * the options, chosen as it resolves ("{W} or {U}", "two mana of any one color").
 * "commanderIdentity": one mana of a color in its controller's commander's color identity
 * (none if that identity is colorless, CR 903.4f).
 */
export type ManaProduce =
  | { kind: "fixed"; mana: ManaType[]; count?: TargetSpec }
  | { kind: "oneOf"; options: ManaType[]; amount: number }
  | { kind: "commanderIdentity" }
  /** "Add one mana of the chosen color", "Add {B} or one mana of the chosen color": the color chosen as it entered. */
  | { kind: "chosenColor"; also?: ManaType };

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
  produces: ManaProduce;
  /** Painlands: "~ deals 1 damage to you." */
  selfDamage?: number;
  /** "~ doesn't untap during your next untap step." */
  skipNextUntap?: boolean;
  /** "Activate only once each turn." (CR 602.5b) */
  oncePerTurn?: boolean;
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
  text: string;
}

/** Everything the engine knows how to do with one card. */
/** A cost paid along with a spell's mana cost (CR 118.8). */
export type AdditionalCost =
  /** `other`: "sacrifice another creature", not the ability's source. */
  | { kind: "sacrifice"; filter: TargetSpec; n: number; other?: boolean }
  | { kind: "discard"; n: number; filter?: TargetSpec } // "discard a land card" (retrace)
  | { kind: "payLife"; n: number }
  | { kind: "exileFromGraveyard"; filter?: TargetSpec; n: number }
  /** Ninjutsu (CR 702.49a): "Return an unblocked attacker you control to hand". */
  | { kind: "returnToHand"; filter: TargetSpec; n: number; unblockedAttacker?: boolean };

/**
 * Ways to cast a card from a graveyard (CR 601.3e): flashback (702.34), jump-start (702.133) and
 * retrace (702.81), escape (702.138). `mana` replaces the mana cost (an alternative cost, CR 118.9);
 * without it the mana cost is paid. `costs` are paid on top. `exile`: the card is exiled instead of
 * going anywhere else when it leaves the stack.
 */
/** Alternative costs that don't change where it's cast from (CR 118.9): evoke (CR 702.74a), dash (CR 702.109a). */
export type AltCostKind = "evoke" | "dash";

export type CastFromGraveyardKind = "flashback" | "jumpStart" | "retrace" | "escape";
export interface CastFromGraveyard {
  kind: CastFromGraveyardKind;
  mana?: string;
  costs: AdditionalCost[];
  exile: boolean;
}

/**
 * Replacement effects that change how many tokens are created or counters put on (CR 614.1a): Parallel Lives,
 * Doubling Season, Hardened Scales, Xorn. `who`: "you" = only for its controller's tokens / permanents.
 */
export type CountMod =
  | { what: "tokens"; who: "you" | "any"; op: "double" | "plusOne"; subtype?: string }
  | { what: "counters"; counter?: CounterKind; on: "creature" | "permanent"; who: "you" | "any"; op: "double" | "plusOne"; other?: boolean };

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
  entersTappedUnless?: EntersCondition;
  entersTappedChoice?: EntersChoice;
  /** "As ~ enters, choose a creature type / a color" (CR 614.12): made as it enters, kept while it's on the battlefield. */
  entersChoose?: { what: ChoiceKind; except?: string }[];
  /**
   * Riot (CR 702.136a): enters with a +1/+1 counter or gains haste. Unleash (CR 702.98a): may enter with
   * a +1/+1 counter. Chosen as it enters, by its controller.
   */
  entersOptions?: EntersOption[];
  /**
   * "You may have ~ enter as a copy of any creature on the battlefield[, except ...]" (CR 707.5, 707.9). Cursed
   * Mirror's "as ~ enters, you may have it become a copy of ... until end of turn": the copy ends with the turn.
   */
  entersAsCopy?: { filter: TargetSpec; except?: CopyExcept; untilEndOfTurn?: boolean };
  /** "~ enters with N +1/+1 counters on it." (a replacement effect, CR 614.1c); modular N too (CR 702.43a). */
  entersWithCounters?: { counter: CounterKind; n: Amount; /** Raid: "if you attacked this turn". */ if?: StaticCondition };
  /** Bloodthirst N (CR 702.54a): enters with N +1/+1 counters if an opponent was dealt damage this turn. */
  bloodthirst?: number;
  /**
   * Devour N (CR 702.82a, c): "As this object enters, you may sacrifice any number of [creatures]. This permanent
   * enters with N +1/+1 counters on it for each [one] sacrificed this way." `n: "devoured"`: Thromok's "Devour X,
   * where X is the number of creatures devoured this way".
   */
  devour?: { n: number | "devoured"; filter: TargetSpec };
  /** "~ can't be countered." CR 101.2 */
  cantBeCountered?: boolean;
  /** "You have no maximum hand size." (CR 402.2): its controller doesn't discard down in cleanup. */
  noMaxHandSize?: boolean;
  countMods?: CountMod[];
  /** "You may play an additional land on each of your turns." (CR 305.2a): one more land each turn per such ability. */
  extraLands?: number;
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
  /**
   * A permanent's static abilities that make spells cost more or less: "Creature spells you cast cost
   * {1} less to cast", "Noncreature spells cost {1} more to cast" (CR 601.2f).
   */
  costMods?: CostMod[];
  /**
   * Kicker (CR 702.33): the optional additional costs, each payable once; multikicker's can be paid
   * any number of times (702.33c).
   */
  /** `replicate`: it's really replicate (CR 702.56a), paid like multikicker. */
  kicker?: { costs: string[]; multi?: boolean; replicate?: boolean };
  /** "As an additional cost to cast this spell, sacrifice a creature" and the like (CR 601.2b, 601.2f-h). */
  additionalCosts?: AdditionalCost[];
  /** Flashback, jump-start, retrace, escape: casting it from your graveyard. */
  fromGraveyard?: CastFromGraveyard[];
  /** "~ escapes with N +1/+1 counters on it" (CR 702.138c). */
  escapesWith?: number;
  /** Buyback (CR 702.27): an optional additional cost; paid, the spell returns to its owner's hand as it resolves. */
  buyback?: string;
  /** Rebound (CR 702.88). */
  rebound?: boolean;
  /** Evoke and dash (CR 702.74, 702.109): alternative costs for casting it from your hand. */
  altCosts?: { kind: AltCostKind; mana: string }[];
  /** Delve (CR 702.66): each card exiled from your graveyard while casting it pays for {1}. */
  delve?: boolean;
  /** Morph, megamorph, disguise (CR 702.37, 702.168): cast face down for {3}, turned face up for `cost`. */
  faceDownCast?: { kind: FaceDownKind; cost: string };
  /** Keywords spelled out only in the text ("Protection from black", "Toxic 2"); see textKeywords in oracle.ts. */
  textKeywords: string[];
  /** Lines the compiler couldn't turn into rules. Empty means the card is fully supported. */
  unsupported: string[];
}

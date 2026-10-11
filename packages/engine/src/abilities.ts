// The effect language. Card rules text is compiled (see oracle.ts) into these plain,
// serializable structures, and the engine executes them (see effects.ts). Everything
// here is data, so abilities can sit on the stack inside GameState.

import type { Color, ManaType, ObjectId, PlayerId } from "./types";

/**
 * A number an effect uses: fixed, or worked out from the game. A spell or ability works out
 * the number once, as it resolves (CR 608.2h); a static ability keeps it up to date (CR 611.3a).
 */
export type Amount = number | AmountExpr;

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
  | { kind: "wasKicked"; which?: number };

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
  controller?: "you" | "opponent";
  /** For players: only opponents. */
  opponent?: boolean;
  tapped?: boolean;
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
export type TargetChoice = { kind: "object"; id: ObjectId; zc?: number } | { kind: "player"; id: PlayerId } | { kind: "stack"; id: string };

/** Which object(s) an effect touches. */
export type ObjRef =
  | { ref: "target"; index: number }
  | { ref: "self" } // the source permanent ("this creature")
  | { ref: "subject" } // the object its trigger event was about: exalted's "that creature" (see PendingTrigger.subject)
  /** After a leaves-the-battlefield trigger: the card in the zone it went to, if it's still that object ("return it to your hand"). */
  | { ref: "selfCard" }
  /** "Create a 0/0 Fractal creature token. Put X +1/+1 counters on it": the token(s) this ability just created. */
  | { ref: "created" }
  /** "The sacrificed creature": what was sacrificed to cast the spell, as it last existed (CR 608.2h). */
  | { ref: "sacrificed" }
  /** Battle cry's "each other attacking creature". */
  | { ref: "allCreatures"; controller?: "you" | "opponent"; other?: boolean; attacking?: boolean }
  /** "all creatures", "each artifact and enchantment", "other creatures you control": every permanent that matches, not targeted. */
  | { ref: "each"; filter: TargetSpec; other?: boolean; /** A spell's "other creatures you control" after "target creature you control": all but that target. */ otherThan?: number };

/** Which player(s) an effect touches. */
export type PlayerRef =
  | { ref: "you" }
  | { ref: "subjectController" } // the controller of the object the trigger was about, or as it last existed
  | { ref: "target"; index: number }
  | { ref: "eachOpponent" }
  | { ref: "eachPlayer" }
  | { ref: "targetController"; index: number }; // "its controller"

export type DamageRecipient = ObjRef | PlayerRef | { ref: "anyTarget"; index: number };

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
  | { kind: "maxOneBlocker" };

/** What a static ability's effect applies to. */
export type Affects =
  | { kind: "self" }
  | { kind: "attached" } // "enchanted creature", "equipped creature"
  | {
      kind: "filter";
      types: string[]; // all of these card types, e.g. ["Creature"]
      subtypes?: string[]; // any of these subtypes
      colors?: Color[]; // any of these colors
      controller?: "you" | "opponent";
      other?: boolean; // "other creatures ..." excludes the source
      /** Anything more the group says: "with a +1/+1 counter on it", "of the chosen type", "with flying". */
      spec?: TargetSpec;
    };

/** A static ability that generates a continuous effect (CR 604.1, 611.3). */
export interface StaticAbility {
  affects: Affects;
  mods: Modification[];
  text: string;
  /** "As long as there are seven or more cards in your graveyard" (threshold): applies only while true. */
  condition?: { kind: "graveyardAtLeast"; n: number };
}

export type Effect =
  /** `also`: more recipients dealt the same damage at the same time ("to each creature and each player", CR 120.3). */
  | { type: "damage"; amount: Amount; to: DamageRecipient; also?: DamageRecipient[] }
  | { type: "draw"; who: PlayerRef; n: Amount }
  | { type: "gainLife"; who: PlayerRef; n: Amount }
  | { type: "loseLife"; who: PlayerRef; n: Amount }
  | { type: "destroy"; what: ObjRef; noRegen?: boolean } // "It can't be regenerated."
  /** "Regenerate ~": a shield that replaces its next destruction this turn (CR 701.19a). */
  | { type: "regenerate"; what: ObjRef }
  | { type: "exile"; what: ObjRef }
  | { type: "bounce"; what: ObjRef } // return to owner's hand (from the battlefield or a graveyard)
  /** "Return target creature card from your graveyard to the battlefield": enters under the effect controller's control (CR 110.2a). */
  | { type: "putOntoBattlefield"; what: ObjRef; tapped?: boolean }
  /** "Put target card from your graveyard on top of / on the bottom of its owner's library". */
  | { type: "putInLibrary"; what: ObjRef; position: "top" | "bottom" }
  | { type: "exileGraveyard"; who: PlayerRef } // "Exile target player's graveyard"
  | { type: "tap"; what: ObjRef }
  | { type: "untap"; what: ObjRef }
  /** `perLastKnownCounter`: modular's "a +1/+1 counter for each +1/+1 counter on this permanent", as it last was. */
  | { type: "counters"; what: ObjRef; counter: "+1/+1" | "-1/-1"; n: Amount; perLastKnownCounter?: "+1/+1" | "-1/-1" }
  /** "Sacrifice ~" as an effect: only a permanent its controller controls (CR 701.21a). */
  | { type: "sacrifice"; what: ObjRef }
  /** The source explores (CR 701.44a): a land on top goes to hand; otherwise a +1/+1 counter, and the card may be milled. */
  | { type: "explore" }
  /** Renown N (CR 702.112a): if it isn't renowned, N +1/+1 counters and it becomes renowned. */
  | { type: "renown"; n: number }
  /** Cascade (CR 702.85a), resolving: exile until a cheaper nonland card, maybe cast it free, the rest to the bottom. */
  | { type: "cascade" }
  /** Evolve's effect (CR 702.100a): a +1/+1 counter on the source if the entering creature (the subject) is still bigger. */
  | { type: "evolve" }
  | { type: "continuous"; what: ObjRef; mods: Modification[]; duration: "endOfTurn" | "game" }
  | { type: "attach"; what: ObjRef } // attach the source (an Equipment) to it, CR 701.3
  | { type: "createToken"; who: PlayerRef; n: Amount; token: TokenSpec }
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
  | { type: "may"; effects: Effect[]; text: string; otherwise?: Effect[]; pay?: PayCost } // "If you don't, ...": fabricate (CR 702.123a)
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
   * "Choose a creature type." / "Choose a color." while it resolves: later instructions use the
   * choice ("of the chosen type", "of that color"). `except`: "other than Wall".
   */
  | { type: "choose"; choice: ChoiceKind; except?: string };

/** What a player chooses by name: a creature type (CR 205.3m) or a color (CR 105.1). */
export type ChoiceKind = "creatureType" | "color";

/** A fact about how the spell was cast: "if ~ was kicked", "if it was kicked with its {1}{U} kicker" (CR 702.33e-f). */
export type SpellCondition = { kind: "kicked"; which?: number; /** As written, before compile() turns it into `which`. */ cost?: string };

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
  | "selfEnters" // When this enters
  | "selfDies" // When this dies
  | "selfToGraveyard" // "When this is put into a graveyard from the battlefield" (any permanent, not just a creature)
  | "selfBecomesTarget" // "When this becomes the target of a spell or ability"
  | "selfAttacks" // Whenever this attacks
  | "selfDealsCombatDamageToPlayer"
  | "monarchEndStep" // the monarch's inherent abilities (CR 725.2): no source, fired by the game
  | "monarchDamaged"
  | "anotherCreatureYouControlEnters"
  | "landYouControlEnters" // landfall: "Whenever a land you control enters"
  | "creatureYouControlAttacksAlone" // exalted (CR 702.83a)
  | "yourUpkeep" // At the beginning of your upkeep
  | "yourEndStep" // At the beginning of your end step
  | "eachEndStep" // At the beginning of the end step (every turn's)
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
  | "youGainLife"; // "Whenever you gain life": once per source that makes you gain life (CR 119.10)

export interface TriggeredAbility {
  event: TriggerEvent;
  body: AbilityBody;
  /** For "castSpell": who casts it, and what kind of spell ("noncreature spell", "instant or sorcery spell"). */
  cast?: { by: "you" | "opponent" | "any"; spell: TargetSpec };
  /** What the event's subject has to be: "blocks a creature with flying", flanking's "a creature without flanking". */
  subjectFilter?: TargetSpec;
  /** Persist/undying's "if it had no -1/-1 counters on it" (an intervening if, CR 603.4), from last known information. */
  ifNoCounter?: "+1/+1" | "-1/-1";
  /**
   * Evolve (CR 702.100a): "if that creature's power is greater than this creature's power and/or
   * that creature's toughness is greater than this creature's toughness", checked as it triggers and
   * again as it resolves (CR 603.4).
   */
  ifEvolves?: boolean;
  /** Renown's "if it isn't renowned" (CR 702.112a), checked as it triggers and as it resolves. */
  ifNotRenowned?: boolean;
  /** "When ~ enters, if it was kicked, ..." (an intervening if, CR 603.4). */
  ifKicked?: SpellCondition;
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
  /** "Pay 2 life" as part of the cost (CR 119.4: only with at least that much life). */
  lifeCost?: number;
  /** "Pay {E}{E}" as part of the cost (CR 107.14). */
  energyCost?: number;
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

/** Everything the engine knows how to do with one card. */
/** A cost paid along with a spell's mana cost (CR 118.8). */
export type AdditionalCost =
  | { kind: "sacrifice"; filter: TargetSpec; n: number }
  | { kind: "discard"; n: number; filter?: TargetSpec } // "discard a land card" (retrace)
  | { kind: "payLife"; n: number }
  | { kind: "exileFromGraveyard"; filter?: TargetSpec; n: number };

/**
 * Ways to cast a card from a graveyard (CR 601.3e): flashback (702.34), jump-start (702.133) and
 * retrace (702.81), escape (702.138). `mana` replaces the mana cost (an alternative cost, CR 118.9);
 * without it the mana cost is paid. `costs` are paid on top. `exile`: the card is exiled instead of
 * going anywhere else when it leaves the stack.
 */
export type CastFromGraveyardKind = "flashback" | "jumpStart" | "retrace" | "escape";
export interface CastFromGraveyard {
  kind: CastFromGraveyardKind;
  mana?: string;
  costs: AdditionalCost[];
  exile: boolean;
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
  entersTappedUnless?: EntersCondition;
  entersTappedChoice?: EntersChoice;
  /** "As ~ enters, choose a creature type / a color" (CR 614.12): made as it enters, kept while it's on the battlefield. */
  entersChoose?: { what: ChoiceKind; except?: string }[];
  /** "~ enters with N +1/+1 counters on it." (a replacement effect, CR 614.1c); modular N too (CR 702.43a). */
  entersWithCounters?: { counter: "+1/+1" | "-1/-1"; n: Amount };
  /** Bloodthirst N (CR 702.54a): enters with N +1/+1 counters if an opponent was dealt damage this turn. */
  bloodthirst?: number;
  /** "~ can't be countered." CR 101.2 */
  cantBeCountered?: boolean;
  /** Convoke (CR 702.51): creatures you tap while casting it help pay its cost. */
  convoke?: boolean;
  /** Improvise (CR 702.126a): artifacts you tap while casting it each pay for {1}. */
  improvise?: boolean;
  /**
   * "This spell costs {1} less to cast for each artifact you control" and the like, affinity included
   * (CR 702.41a): each amount comes off the generic mana of its total cost (CR 601.2f).
   */
  costLess?: Amount[];
  /**
   * Kicker (CR 702.33): the optional additional costs, each payable once; multikicker's can be paid
   * any number of times (702.33c).
   */
  kicker?: { costs: string[]; multi?: boolean };
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
  /** Keywords spelled out only in the text ("Protection from black", "Toxic 2"); see textKeywords in oracle.ts. */
  textKeywords: string[];
  /** Lines the compiler couldn't turn into rules. Empty means the card is fully supported. */
  unsupported: string[];
}

import { parseFromTop } from "./compile";
import { ANY_COUNTER, allEffects, refCovers, type SearchDest, type AbilityBody, type FaceDownPlay, type Amount, type AmountExpr, type Count, type Effect, type ObjRef, type PlayerRef, type SpellCondition, type StaticCondition, type TargetSpec, type UnlessPays, type PayCost, type NamePurpose, type Modification, type DamageRuleSpec, type CounterKind } from "../abilities";
import { substituteX } from "../amounts";
import { differenceInHand, num, NUM, NUMX, X, amt, ROLL_ROW, counterKind, COUNTER, isGroup, keywordOf, parseSpentReq, SPENT_TO_CAST, WHEEL, capital, COLOR_WORDS, singularWord, NUMBER_WORDS, plainMana, BASIC_TYPES } from "./words";
import { canonicalKeyword, CARD_TYPE_PLURAL, CHOSEN_KEYWORD, CHOSEN_PROTECTION, CREATURE_TYPES, SUPPORTED_KEYWORDS, THAT_PLAYER_PROTECTION } from "../keywords";
import { parsePreventAll, parseStaticCondition } from "./statics";
import { parseBoundCount, parseCount } from "./counts";
import { parseBecomes, parseChanges, parseDig, parseSentence } from "./sentence";
import { parsePreventionRider } from "./sentences/prevention";
import { compileQuoted, parseGrants } from "./grants";
import { boundAtTargeting, parseCardTarget, parseDamageRecipient, parseKeywordList, parseObject, parsePlayer, parseTargetPhrase, pickFilter, PERMANENT_TYPES, PLANESWALKER_TYPES } from "./targets";
import { parseCardNameChoice, parseSearch, parseSearchFilter } from "./search";
import { parseManaSpend, parseManaTrigger } from "./mana-abilities";
import { parseTrigger } from "./triggers";
import { parseToken } from "./tokens";
import { parsePunisherOptions } from "./sentences/basics";

export interface Ctx {
  targets: TargetSpec[];
  /** Just after "each player may ..." (see PlayerRef choseThisWay): "each opponent who didn't" can follow. */
  eachChose?: boolean;
  /** "Each player may search ... and put it ...": its next sentence says who shuffles. */
  eachSearched?: boolean;
  /** Parsing what follows "you may": "collect evidence 4" can only be done by choice. */
  mayNow?: boolean;
  /** In a trigger about another object ("blocks a creature"), "that creature" is that object. */
  subject?: boolean;
  /** "Whenever a creature you control enters": "it", "its power", "that land" are the entering permanent too. */
  subjectIt?: boolean;
  /** In a trigger about the permanent itself, "it" (with no target before it) is that permanent. */
  selfIt?: boolean;
  /** After it left the battlefield ("When ~ dies, return it to its owner's hand"), "it" is the card in its new zone. */
  selfCard?: boolean;
  /** An ability whose cost discards the card it's on ("{2}{R}{G}, Discard this card: ..."): "~" in the graveyard after. */
  discardedSelf?: true;
  /** An Aura's "when enchanted creature dies": "return ~ ..." is the Aura card, in the graveyard it went to (ObjRef selfCard `moved`). */
  auraCard?: boolean;
  /** "Exile the top card of your library" came before: "that card's mana value" is that card's. */
  exiledTop?: boolean;
  /** After "you may reveal the top card of your library. If you do": "that card" is the revealed card. */
  revealedTop?: boolean;
  /** "Reveal the top ten cards of your library" kept them there: "the revealed cards" are those (Sanity Grinding). */
  revealedTopN?: boolean;
  /** "Reveal cards ... until you reveal a nonland card" kept them in the library: "Put the revealed cards on the bottom of your library in any order" can follow (Erratic Explosion). */
  revealedUntil?: boolean;
  /** The instruction before exiled cards from the top of a library (face up): "for each blue card exiled this way" (Oona, Queen of the Fae). */
  afterExileTop?: boolean;
  /** Another player chose a card in your graveyard to return (O-Kagachi Made Manifest): "that card" is that card. */
  chosenFromYard?: boolean;
  /** A reflexive trigger after "you may sacrifice another creature": "that creature's power" is the sacrificed one's. */
  sacrificedIt?: boolean;
  /** A revealFromHand instruction came before, here or in the ability whose reflexive trigger this is: "for each card revealed this way". */
  revealedFromHand?: boolean;
  /** The sentence just read exiled target N (noteLast): "the exiled card", "that card" after it (Deicide). */
  exiledTarget?: number;
  /** The sentence just read exiled one card from a player's hand (Pick the Brain's "the exiled card"). */
  exiledFromHand?: boolean;
  /** After "may have you ...": "you mill three cards, then ... the total mana value of those cards" (Combustible Gearhulk). */
  milledThisWay?: boolean;
  /** A damage instruction came before: "the excess damage dealt this way" (CR 120.10). */
  excessDamage?: boolean;
  /** A tapAnyNumber instruction came before, here or in the ability whose reflexive trigger this is: "for each creature tapped this way". */
  tappedThisWay?: boolean;
  /** Sweep: "Return any number of Plains you control to their owner's hand" came before: "for each Plains returned this way". */
  bouncedAny?: string;
  /** Devouring Rage: its additional cost sacrifices any number of these, the number its X: "for each Spirit sacrificed this way". */
  costSacrificedX?: string;
  /** "Each opponent discards a card" came just before: "for each opponent who can't". */
  opponentsDiscarded?: boolean;
  /** A "manifest N cards from their hands" instruction came before: "for each card manifested this way". */
  manifested?: boolean;
  /** Parley's "each player reveals the top card of their library" came before: "for each nonland card revealed this way". */
  parley?: boolean;
  /** An amass instruction came before, here or in the ability whose reflexive trigger this is: "the amassed Army" (CR 701.47c). */
  amassed?: boolean;
  /** Index of the most recent object target, for "it" / "its controller". */
  lastObjectTarget?: number;
  /** An earlier sentence acted on "enchanted creature" (or equipped): a later "it" means that creature. */
  lastAttached?: boolean;
  /** The most recent "up to two target creatures", for "they" / "those creatures". */
  lastTargets?: { index: number; n?: number };
  /**
   * "Untap all attacking creatures. They gain first strike until end of turn" (Karlach): the permanents an untap or tap
   * of a group just touched, which are still on the battlefield, so "they" is the same group.
   */
  lastGroup?: ObjRef;
  /** Index of the most recent player target, for "that player's hand". */
  lastPlayerTarget?: number;
  /** "Target creature and all other creatures its controller controls ...": that target, whose controller "that player" is. */
  controllerNamed?: number;
  /** "Any number of target players": that target (see TargetSpec.many); "those players" are all of them. */
  manyPlayers?: number;
  /** In an activated ability: "its power" with no target before it is the source's. */
  activated?: boolean;
  /** Its cost puts a card exiled with ~ into a graveyard: "that card" is that one (Jester's Scepter). */
  costLinked?: boolean;
  /** The last sentence created one token: "put a +1/+1 counter on it" means that token. */
  lastCreated?: boolean;
  /** The last sentence created one creature token: "put a +1/+1 counter on that creature" (Otterball Antics) means it. */
  lastCreatedCreature?: boolean;
  /**
   * The last sentence put one card onto the battlefield ("Return target creature card from your graveyard to the
   * battlefield"): "it" and "that creature" are the permanent it became (CR 400.7), kept in `created` like a token.
   */
  lastPut?: boolean;
  /** The last sentence created tokens, any number: "Sacrifice them at the beginning of the next end step". */
  lastCreatedAny?: boolean;
  /** "Put all land cards from among them onto the battlefield tapped": "those lands" after (Animist's Awakening). */
  lastDugLands?: boolean;
  /** After "look at the top N cards ... You may put any number of them into your hand": "each card you put into your hand this way" (Count "dugToHand"). */
  dugToHand?: boolean;
  /** The instruction before was "mill N cards" (yours): "those cards" in what follows can be the milled cards (Ripples of Undeath). */
  afterMill?: boolean;
  /** The instruction before was a mill, anyone's: "for each creature card put into a graveyard this way" (Dread Summons). */
  afterAnyMill?: boolean;
  /** An instruction before in this ability discarded cards of yours: "for each card discarded this way" (Pyretic Charge). */
  afterYourDiscard?: boolean;
  /** An instruction before discarded one card of yours: "the discarded card" is that card (Malcolm). */
  discardedOne?: boolean;
  /** After "you may exile a creature card from your hand. If you do": "the exiled card" is that card (Nexus of Becoming). */
  mayExiledFromHand?: boolean;
  /** An instant or sorcery: "other" can't mean other than its source, which isn't a permanent. */
  spell?: boolean;
  /** A "whenever a player casts a spell" trigger: "it" or "that spell" can be the spell cast. */
  castSpell?: boolean;
  /** After "you may remove all +1/+1 counters from ~. If you do" (Sarulf): "the number of counters removed this way". */
  removedCounters?: boolean;
  /** A "whenever you activate an ability" trigger: "that ability" is the ability activated (Rings of Brighthearth). */
  activatedAbility?: boolean;
  /** A cast trigger's first instruction: "it gains haste" (Tyvar Kell's emblem) is the spell cast. */
  spellIt?: boolean;
  /** In a "when you cast this spell" ability: "copy it" is the spell itself. */
  selfCastSpell?: boolean;
  /** An exchange of life totals came before: "the life lost this way", "those players' life totals" are about it. */
  exchanged?: boolean;
  /** After an instruction that exiles cards from graveyards: "cards exiled this way" are those (Count "cardsExiledThisWay"). */
  exiledCards?: boolean;
  /** "Whenever ~ deals combat damage to a player": "that player" is that player. */
  eventPlayer?: boolean;
  /** "Whenever you clash": "If you won, ..." is about that clash (TriggerEventInfo.wonClash). */
  clashed?: boolean;
  /** After "Clash with an opponent. If you win, ...": "that player" is the opponent clashed with (PlayerRef clashOpponent). */
  clashOpp?: boolean;
  /** While counting for "each player ... that player controls" (Price of Progress): "that player" is each of them in turn (PlayerRef eachOne). */
  eachOne?: boolean;
  /** "Choose an opponent." came before: "that player" is the one chosen. */
  chosenOpponent?: boolean;
  /** A spell's "Choose a creature type." came before: "cards of the chosen type" are those with that type (For the Ancestors). */
  choseCreatureType?: boolean;
  /** "Flip five coins" whose heads are counted (Ral Zarek): no one calls them (CR 705.2). */
  uncalledFlips?: boolean;
  /** "Roll two d8 and choose one result" came before: "that result" and "the other result" mean something. */
  chooseResult?: boolean;
  /** In "whenever ~ attacks" and "becomes blocked" triggers: "defending player" is the event player. */
  defending?: boolean;
  /** "Whenever a source you control deals damage to a permanent or player": "that permanent or player" is the one dealt it. */
  eventRecipient?: boolean;
  /** "Whenever another creature dies": the subject left the battlefield, so "it" and "that card" are the card where it went. */
  subjectLeft?: boolean;
  /**
   * An enters trigger of a card with {X} in its cost (or a "when you cast this spell" one): X is the X its spell was cast
   * with (CR 107.3m, 107.3a), known as the trigger's targets are chosen, like a spell's.
   */
  ownX?: boolean;
  /** An enters trigger of its own ("When ~ enters"): "the amount of mana spent to cast it" is its spell's (CR 601.2h). */
  selfEntered?: boolean;
  /** This sentence defines its own X ("..., where X is ..."): "up to X target ..." isn't the spell's X then. */
  whereX?: boolean;
  /** The ability ends "Round up each time." (CR 107.1a): every "half ..." in it is rounded that way. */
  halfRound?: "up" | "down";
  /** A vote came before (CR 701.38): its words ("death vote", "if taxes gets more votes"), or that it's for objects. */
  vote?: { options?: string[]; among?: true; /** "Each player may choose ..." (not a vote): "each permanent chosen this way". */ choose?: true };
  /** "Each opponent chooses fame or fortune" came before: its words ("for each player who chose fortune"). */
  chooseWords?: string[];
  /** Who chose those words: "each opponent" or "each player". */
  chooseWho?: "opponent" | "player";
  /** "Gain control of a creature that player controls" for each player who chose a word: "those creatures" are they. */
  fromEach?: boolean;
}

/**
 * The instruction after ", then": "Target player draws a card, then discards a card" (Cephalid Looter) is the same player
 * discarding, "that player"; "each player draws ..., then discards ..." each of them.
 */
function thenSubject(first: string, next: string): string {
  // "At the beginning of each player's draw step, that player draws an additional card, then discards a card" (Anvil of
  // Bogardan): lowercase after the trigger.
  // Hired Torturer: "Target opponent loses 2 life, then reveals a card at random from their hand"; Singe-Mind Ogre: "target
  // player reveals a card at random from their hand, then loses life ...".
  const who = /^(Target player|Target opponent|target player|target opponent|That player|that player|Each player|Each opponent|each player|each opponent) /.exec(first);
  if (who && /^(?:draws|discards|mills|loses|gains|sacrifices|shuffles|creates) /.test(next)) return `${/^[Tt]arget /.test(who[1]!) ? "That player" : capital(who[1]!)} ${next}`;
  if (who && /^[Tt]arget /.test(who[1]!) && /^reveals a card at random from their hand$/.test(next)) return `That player ${next}`;
  // Pendant of Prosperity: "~'s owner draws a card, then that player may put a land card from their hand onto the
  // battlefield": the same owner.
  if (/^~'s owner draws /.test(first) && /^that player may put /.test(next)) return `~'s owner ${next.slice("that player ".length)}`;
  // Oblation: "The owner of target nonland permanent shuffles it into their library, then draws two cards": that owner.
  if (/^The owner of target [^,]+ shuffles it into their library$/.test(first) && /^draws /.test(next)) return `Its owner ${next}`;
  // Rolling Hamsphere: "create three 1/1 red Hamster creature tokens, then it deals X damage to any target": the tokens
  // are made by you, so "it" is the source.
  if (/^[Cc]reate [^,]+ tokens?$/.test(first) && !/\btarget\b/.test(first) && /^it deals /.test(next)) return `~${next.slice(2)}`;
  return next.charAt(0).toUpperCase() + next.slice(1);
}

/** A card type a player can be told to choose among (CR 205.2a). */
const CARD_TYPE_WORD = "(?:artifact|battle|creature|enchantment|instant|land|planeswalker|sorcery)";

/**
 * The events a delayed triggered ability with a duration can wait for (see GameState.floatingTriggers), and the parts of
 * a trigger it can have: an intervening "if" or a zone would need more about its source than it has.
 */
const FLOATING_EVENTS = new Set<string>(["creatureDealsCombatDamageToSelf", "permanentEnters", "youGainLife", "castSpell", "permanentDies", "selfDealsCombatDamageToPlayer", "creatureYouControlDealsCombatDamageToPlayer", "creaturesYouControlDealCombatDamageToPlayer", "eachBeginCombat", "creaturesYouControlAttack", "creatureYouControlAttacks", "permanentBecomesTapped", "creatureBlocks"]);
const FLOATING_KEYS = new Set<string>(["event", "enters", "cast", "dies", "dealer", "attacker", "toOpponent", "orPlaneswalker", "tappedFilter", "subjectFilter", "body"]);

/**
 * "Until end of turn, whenever you cast a spell, copy it. You may choose new targets for the copy.": a delayed triggered
 * ability that triggers each time until then (CR 603.7b), the sentences after it its instructions. Undefined when `s`
 * isn't one, null when it can't be compiled.
 */
function floatingTrigger(s: string, after: string[], ctx?: Ctx): Effect | null | undefined {
  // "Choose target creature you control. Whenever that creature deals combat damage to a player or planeswalker this
  // turn, draw that many cards." (Hunter's Insight): a delayed trigger about that creature (CR 603.7b-c), this turn.
  // Stensian Sanguinist: "Whenever you attack, target creature gains deathtouch until end of turn. Whenever that creature
  // deals combat damage to a player this combat, this creature becomes prepared": until this combat ends, "this creature"
  // being the source of the ability that made it (CR 603.7d).
  const that = ctx?.lastObjectTarget !== undefined ? /^Whenever (?:that creature|it) (deals combat damage to a player(?: or planeswalker)?) this (turn|combat), (.+)$/.exec(s) : null;
  if (that) {
    const rest = [that[3]!, ...after.map((x) => x.replace(/\.$/, ""))].join(". ");
    if (that[2] === "combat" && !/^(?:this creature|~) becomes prepared$/.test(rest)) return null;
    const trigger = parseTrigger(`Whenever ~ ${that[1]!}, ${rest}.`);
    if (!trigger || trigger === "fail" || trigger.event !== "selfDealsCombatDamageToPlayer" || Object.keys(trigger).some((k) => !FLOATING_KEYS.has(k))) return null;
    return { type: "floatingTrigger", trigger, until: that[2] === "combat" ? "endOfCombat" : "endOfTurn", about: ctx!.lastObjectTarget! };
  }
  // "Choose target opponent. Whenever a creature you control deals combat damage to that player this turn, create a tapped
  // Treasure token." (Great Train Heist): a delayed trigger this turn, only for combat damage to that player.
  const toThem = ctx && /^Choose target opponent$/.test(s) ? /^Whenever (a creature you control) deals combat damage to that player this turn, (.+)$/.exec(after[0] ?? "") : null;
  if (toThem) {
    const trigger = parseTrigger(`Whenever ${toThem[1]!} deals combat damage to a player, ${[toThem[2]!.replace(/\.$/, ""), ...after.slice(1).map((x) => x.replace(/\.$/, ""))].join(". ")}.`);
    if (!trigger || trigger === "fail" || trigger.event !== "creatureYouControlDealsCombatDamageToPlayer" || Object.keys(trigger).some((k) => !FLOATING_KEYS.has(k))) return null;
    const index = addTarget(ctx!, { kind: "player", opponent: true, text: "target opponent" });
    return { type: "floatingTrigger", trigger, until: "endOfTurn", aboutPlayer: index };
  }
  // Tamiyo, Field Researcher: "Choose up to two target creatures. Until your next turn, whenever either of those
  // creatures deals combat damage, you draw a card." A delayed trigger about each of them (CR 603.7b-c): both dealing
  // combat damage at once trigger it twice (rulings).
  const either = ctx && /^Choose up to two target creatures$/.test(s) ? /^Until your next turn, whenever either of those creatures deals combat damage, (.+)$/.exec(after[0] ?? "") : null;
  if (either) {
    const trigger = parseTrigger(`Whenever ~ deals combat damage, ${[either[1]!, ...after.slice(1).map((x) => x.replace(/\.$/, ""))].join(". ")}.`);
    if (!trigger || trigger === "fail" || trigger.event !== "selfDealsCombatDamage" || Object.keys(trigger).some((k) => !FLOATING_KEYS.has(k))) return null;
    const what = parseObject("up to two target creatures", ctx!);
    if (what?.ref !== "target") return null;
    return { type: "floatingTrigger", trigger, until: "yourNextTurn", about: what.index, each: what.n ?? 1 };
  }
  // "At the beginning of each combat this turn, untap all creatures that attacked this turn" (Full Throttle): a delayed
  // trigger for each beginning of combat step this turn (CR 603.7b).
  const combats = /^At the beginning of each combat this turn, (.+)$/.exec(s);
  if (combats) {
    const trigger = parseTrigger(`At the beginning of each combat, ${[combats[1]!, ...after.map((x) => x.replace(/\.$/, ""))].join(". ")}.`);
    if (!trigger || trigger === "fail" || trigger.event !== "eachBeginCombat" || Object.keys(trigger).some((k) => !FLOATING_KEYS.has(k))) return null;
    return { type: "floatingTrigger", trigger, until: "endOfTurn" };
  }
  // "Whenever a creature dies this turn, each creature other than ~ gets -1/-1 until end of turn" (Massacre Girl): the
  // same as "This turn, whenever a creature dies, ..." (CR 603.7b).
  const dies = /^Whenever (an?(?: [a-z]+)? creature(?: you control| an opponent controls)?) dies this turn, (.+)$/.exec(s);
  if (dies) return floatingTrigger(`This turn, whenever ${dies[1]!} dies, ${dies[2]!}`, after, ctx);
  // "Whenever a creature or enchantment you control enters this turn, draw a card" (Rite of Harmony): the same as "This
  // turn, whenever a creature or enchantment you control enters, ..." (CR 603.7b).
  const enters = /^Whenever (an?(?: [a-z]+)? (?:creature|enchantment|artifact|land|permanent)(?: or (?:creature|enchantment|artifact|land))?(?: you control)?) enters this turn, (.+)$/.exec(s);
  if (enters) return floatingTrigger(`This turn, whenever ${enters[1]!} enters, ${enters[2]!}`, after, ctx);
  // "Whenever one or more creatures you control deal combat damage to one or more players this turn, you become the
  // monarch" (Forth Eorlingas!): the same, once for each combat damage step (CR 510.2, 603.2c).
  // The Girl in the Fireplace: "Whenever a creature you control deals combat damage to a player this turn, time travel":
  // once for each creature (CR 603.7b).
  const dealt = /^Whenever (one or more creatures you control deal combat damage to one or more players|a creature you control deals combat damage to a player) this turn, (.+)$/.exec(s);
  if (dealt) return floatingTrigger(`This turn, whenever ${dealt[1]!}, ${dealt[2]!}`, after, ctx);
  // Duskmantle Guildmage: "Whenever a card is put into an opponent's graveyard from anywhere this turn, that player loses 1
  // life": once for each card (CR 603.7b), not a token (rulings), each opponent's.
  const toYard = /^Whenever a card is put into an opponent's graveyard from anywhere this turn, (.+)$/.exec(s);
  if (toYard) {
    const trigger = parseTrigger(`Whenever a card is put into an opponent's graveyard from anywhere, ${[toYard[1]!, ...after.map((x) => x.replace(/\.$/, ""))].join(". ")}.`);
    if (!trigger || trigger === "fail" || trigger.event !== "batch" || trigger.batch?.what !== "toGraveyard" || !trigger.batch.each || Object.keys(trigger).some((k) => k !== "batch" && !FLOATING_KEYS.has(k)) || Object.keys(trigger.batch).some((k) => !["what", "whose", "each"].includes(k))) return null;
    return { type: "floatingTrigger", trigger, until: "endOfTurn" };
  }
  // Noxious Assault: "Whenever a creature blocks this turn, its controller gets a poison counter" (CR 603.7b).
  const blocks = /^Whenever (an? creature(?: you control| an opponent controls)?) blocks this turn, (.+)$/.exec(s);
  if (blocks) return floatingTrigger(`This turn, whenever ${blocks[1]!} blocks, ${blocks[2]!}`, after, ctx);
  // "Whenever an Assassin you control attacks this turn, put a +1/+1 counter on it" (The Revelations of Ezio), "Whenever a
  // creature attacks this turn, it gains lifelink until end of turn" (Ondu Rising): the same as "This turn, whenever ...
  // attacks, ..." (CR 603.7b), once for each attacking creature (CR 508.3a).
  const attacks = /^Whenever (an? [A-Za-z]+(?: creature)?(?: you control| an opponent controls)?) attacks this turn, (.+)$/.exec(s);
  if (attacks) return floatingTrigger(`This turn, whenever ${attacks[1]!} attacks, ${attacks[2]!}`, after, ctx);
  // "Whenever you gain life this turn, each opponent loses that much life" (Vizkopa Guildmage): the same as "This turn,
  // whenever you gain life, ..." (CR 603.7b), each life gain event once (CR 119.10).
  const gain = /^Whenever you gain life this turn, (.+)$/.exec(s);
  if (gain) return floatingTrigger(`This turn, whenever you gain life, ${gain[1]!}`, after, ctx);
  // "Whenever you attack this turn, create two 1/1 red Warrior creature tokens that are tapped and attacking" (Dalkovan
  // Encampment): once for each declaration of attackers this turn (CR 508.1, 603.7b).
  const attack = /^Whenever you attack this turn, (.+)$/.exec(s);
  if (attack) return floatingTrigger(`This turn, whenever you attack, ${attack[1]!}`, after, ctx);
  // "When you next attack this turn, untap each creature you control" (All-Out Assault): the same, the first time only.
  const nextAttack = /^When you next attack this turn, (.+)$/.exec(s);
  if (nextAttack) {
    const e = floatingTrigger(`This turn, whenever you attack, ${nextAttack[1]!}`, after, ctx);
    return e?.type === "floatingTrigger" ? { ...e, once: true } : e;
  }
  const m = /^([Uu]ntil end of turn|[Tt]his turn|[Uu]ntil your next turn|[Uu]ntil the end of your next turn), ([Ww]henever .+)$/.exec(s);
  if (!m) return undefined;
  const text = [m[2]!, ...after.map((x) => x.replace(/\.$/, ""))].join(". ");
  const trigger = parseTrigger(`W${text.slice(1)}.`);
  if (!trigger || trigger === "fail" || !FLOATING_EVENTS.has(trigger.event) || Object.keys(trigger).some((k) => !FLOATING_KEYS.has(k))) return null;
  const when = m[1]!.toLowerCase();
  const until = when === "until your next turn" ? "yourNextTurn" : when === "until the end of your next turn" ? "endOfYourNextTurn" : "endOfTurn";
  return { type: "floatingTrigger", trigger, until };
}

/** Starts a results table row's marker sentence (see parseBody). */
const ROW_MARK = "\u0001";

/** Effects that can stop a resolution to wait for a player's choice. */
const PAUSING = new Set<Effect["type"]>(["vote", "flipCoin", "attachAny", "discard", "reorderGraveyard", "takeFromHand", "scry", "surveil", "orderTop", "handToTop", "may", "explore", "search", "choose", "connive", "recruit", "pick", "clash", "endure", "tapOrUntap", "untapUpTo", "castFromHand", "punisher", "sacrificeEach", "venture", "chooseFromGraveyard", "keepRest", "villainous", "putFromExiledTop"]);
/** Effects that can stop for a choice partway: they can't share a conditional or a loop with other effects. */
const pauses = (e: Effect) => PAUSING.has(e.type) || (e.type === "putInLibrary" && (e.position === "ownersChoice" || e.position === "ownersChoiceSecond")) || (e.type === "roll" && !!e.chooseOne);

/** "You may [this]. If you do, ...": whether it was done is known (see canDoNow in effects.ts). */
const checkableMay = (e: Effect): boolean =>
  e.type === "collectEvidence" ||
  // "You may exile all cards from your hand face down. If you do, ..." (Duplicity): even an empty hand (rulings on
  // exiling or discarding your hand, Herigast).
  (e.type === "exileFaceDown" && e.from === "hand") ||
  (e.type === "discard" && e.who.ref === "you" && e.n === 1 && !e.random) ||
  // "You may discard two cards. If you do, draw three cards." (Thrilling Discovery): only with that many cards in hand.
  (e.type === "discard" && e.who.ref === "you" && typeof e.n === "number" && e.n > 1 && !e.random && !e.filter && !e.upTo) ||
  // "You may discard your hand. If you do, draw three cards." (Phyrexian Dragon Engine): even an empty one (rulings on
  // Moonveil Regent).
  (e.type === "discard" && e.who.ref === "you" && e.hand && !e.filter) ||
  (e.type === "draw" && e.who.ref === "you") ||
  // "You may have target opponent draw a card. If you do, copy that spell." (Alania): done if that player is still a legal
  // target with a card to draw.
  (e.type === "draw" && e.who.ref === "target" && !("n" in e.who && e.who.n) && e.n === 1) ||
  // "You may have that player lose 2 life. If you do, you gain 2 life." (Bloodchief Ascension): one player, who can lose
  // life now (CR 119.8).
  (e.type === "loseLife" && (e.who.ref === "eventPlayer" || (e.who.ref === "target" && !("n" in e.who && e.who.n))) && typeof e.n === "number" && e.n > 0) ||
  // "You may put a card from your hand on the bottom of your library. If you do, draw a card." (Volcanic Spite): only
  // with a card in hand.
  (e.type === "handToTop" && e.n === 1) ||
  // "You may gain 1 life for each creature card in your graveyard. If you do, exile ~ from your graveyard." (Skyfisher
  // Spider): only if life would be gained.
  (e.type === "gainLife" && e.who.ref === "you") ||
  // "You may exile a creature card from your graveyard. If you do, ..." (Masked Vandal): only with one there; "eight cards"
  // (Emeritus of Ideation), only with eight there.
  (e.type === "chooseFromGraveyard" && e.dest === "exile" && e.n >= 1 && !e.nAmount && !e.upTo && !e.who && !e.milled && !e.eventGroup && !e.notSacrificed && e.totalMv === undefined && e.mvMax === undefined) ||
  // "You may discard a card or sacrifice a land. If you do, ..." (Highway Robbery): one of them, only one that can be done.
  (e.type === "either" && !!e.onlyDoable && e.options.every((o) => o.length === 1 && checkableMay(o[0]!))) ||
  // "You may create a Treasure token. When you do, ..." (Generous Plunderer): creating it is doing it.
  (e.type === "createToken" && e.who.ref === "you" && typeof e.n === "number" && e.n > 0 && !e.attachTo) ||
  (e.type === "sacrifice" && e.what.ref === "self") ||
  // "Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it." (Gorbag): the subject.
  (e.type === "sacrifice" && e.what.ref === "subject") ||
  // "When ~ dies, you may exile it. When you do, ..." (Undead Butler): only while it's still that card in the graveyard.
  (e.type === "exile" && e.what.ref === "selfCard") ||
  // "Whenever another nontoken creature you control dies, you may exile it. If you do, ..." (Nightmare Shepherd): only
  // while it's still that card, in the graveyard it went to (CR 400.7).
  (e.type === "exile" && e.what.ref === "subjectCard") ||
  // Wall of Resurgence: "You may put three +1/+1 counters on target land you control. If you do, ...": only on a target
  // still there.
  (e.type === "counters" && e.what.ref === "target" && !e.what.n && typeof e.n === "number" && e.n > 0) ||
  // "You may tap it. When you do, ..." (The Fire Nation Drill): only an untapped permanent can be tapped (CR 701.26a).
  (e.type === "tap" && e.what.ref === "self") ||
  // Soldevi Golem: "You may untap target tapped creature an opponent controls. If you do, untap ~.": only a target still
  // there and tapped.
  (e.type === "untap" && e.what.ref === "target" && !("n" in e.what && e.what.n)) ||
  // "You may remove a hit counter from a card that player owns in exile. If you do, ..." (Mari): only with one there.
  e.type === "removeExiledCounter" ||
  // "You may remove a charge counter from ~. If you do, you gain 1 life" (Sun Droplet): only with that many on it.
  (e.type === "removeCounters" && e.what.ref === "self" && typeof e.n === "number") ||
  // "You may mill that many cards. If you do, you may put a creature card from among them into your hand" (Barrowgoyf):
  // choosing to mill is doing it (with nothing milled, nothing is among them anyway).
  (e.type === "mill" && e.who.ref === "you") ||
  // "You may put the top creature card of defending player's graveyard onto the battlefield. If you do, ..." (Bone Dancer).
  (e.type === "putOntoBattlefield" && e.what.ref === "graveyardEnd" && !e.atEndStep && !e.haste) ||
  // "You may return another creature you control to its owner's hand. If you do, ...": only with one to return. "You may
  // sacrifice a Zombie. If you do, ..." (Wilhelt): only with one to sacrifice.
  // "You may choose a token you control. If you do, ..." (Brudiclad): only with one to choose.
  (e.type === "pick" && e.who.ref === "you" && (e.action === "bounce" || e.action === "sacrifice" || e.action === "choose") && e.n === 1 && !e.unless) ||
  // "You may blight 1. If you do, ..." (Scuzzback Scrounger): only with a creature to put the counters on (CR 701.68b).
  (e.type === "pick" && e.who.ref === "you" && e.action === "counters" && e.counter?.kind === "-1/-1" && e.n === 1 && !e.unless) ||
  // "You may sacrifice three other nonland permanents. If you do, ..." (Scavenger's Talent): only with that many to
  // sacrifice; all of them is doing it.
  (e.type === "pick" && e.who.ref === "you" && e.action === "sacrifice" && typeof e.n === "number" && e.n > 1 && !e.unless && !e.anyNumber) ||
  // "You may tap five untapped artifacts and/or creatures you control. If you do, ..." (Thousand Moons Smithy): only with
  // that many untapped.
  (e.type === "pick" && e.who.ref === "you" && e.action === "tap" && typeof e.n === "number" && !e.unless && !e.anyNumber) ||
  // "You may have it deal 3 damage to target creature. If you do, ...": done if that target is still legal.
  (e.type === "damage" && (e.to.ref === "target" || e.to.ref === "anyTarget") && !("n" in e.to && e.to.n) && !e.also && !e.divided) ||
  (e.type === "bite" && e.b.ref === "target" && !e.b.n && (e.a.ref === "self" || e.a.ref === "target")) ||
  // "You may have target creature you control get +2/+0 and gain haste until end of turn. If you do, ..." (Hazoret's
  // Favor), "you may have it get +4/+0 until end of turn" (Attack-in-the-Box): done if that permanent is still there.
  (e.type === "continuous" && (e.what.ref === "self" || (e.what.ref === "target" && !e.what.n)) && e.duration === "endOfTurn") ||
  // "You may have it assign no combat damage this turn. If you do, ..." (Cloak of Confusion): done if that creature is
  // still on the battlefield.
  (e.type === "noCombatDamage" && (e.what.ref === "self" || e.what.ref === "subject" || e.what.ref === "attached")) ||
  // "You may gain control of target artifact defending player controls. If you do, ..." (Kukemssa Pirates; "for as long
  // as you control ~", Orcish Squatters): done if that target is still legal, which a lone target must be for the
  // ability to resolve at all (CR 608.2b).
  (e.type === "continuous" && e.what.ref === "target" && !e.what.n && !e.giveTo && e.mods.length === 1 && e.mods[0]!.kind === "control" && (e.duration === "game" || e.duration === "whileControlled")) ||
  // "You may have that player gain control of equipped creature until end of turn. If you do, untap it." (Assault Suit).
  (e.type === "continuous" && e.what.ref === "attached" && e.giveTo?.ref === "eventPlayer" && e.duration === "endOfTurn") ||
  // "You may have ~ become a copy of another target creature you control until end of turn ... If you do, ..." (Gogo,
  // Mysterious Mime): done if it and that target are both still there.
  (e.type === "becomeCopy" && e.what.ref === "self" && e.of.ref === "target" && !e.of.n && e.duration === "endOfTurn");

/**
 * What a card name chosen as it resolves is for, from the instructions after it (bots, see NamePurpose): to find in your
 * library (Demonic Consultation), to guess a top card or a card at random from your hand (Diviner's Lockbox, Predict,
 * Cursed Scroll), to hit a player's hand, graveyard and library (Cabal Therapy, Memoricide), else to stop it (Conjurer's Ban).
 */
function namePurpose(rest: string): NamePurpose {
  if (/\breveal cards from the top of your library until\b/i.test(rest)) return "find";
  if (/\breveal the top (?:card|\w+ cards) of your library\b|\bmills a card\b/i.test(rest)) return "guess";
  if (/\breveal a card at random from your hand\b/i.test(rest)) return "guessHand";
  if (/\b(?:reveals (?:their|his or her) hand|graveyard, hand, and library)\b/i.test(rest)) return "theirs";
  return "deny";
}

/**
 * What follows "Reveal the top card of your library": "If it's a creature card, put it into your hand", "If it isn't a
 * creature card, put it into your graveyard", then maybe "Otherwise, [you may] put it ..." and, after "put it onto the
 * battlefield", "That creature gains haste [until end of turn]" and "Sacrifice it at the beginning of the next end step".
 * `next`: the sentence after the last one used.
 */
function parseRevealedIf(sentences0: string[], at: number, ctx: Ctx): { effect: Effect; next: number } | null {
  // "If it's a creature card of the chosen type, ..." (Herald's Horn): the type chosen for its source.
  const ofChosen = /^If (?:it's|that card is) an? [^,]+? card of the chosen type, /.test(sentences0[at] ?? "");
  const sentences = ofChosen ? sentences0.map((x, i) => (i === at ? x.replace(/ card of the chosen type, /, " card, ") : x)) : sentences0;
  // "If it's a card of the chosen type, ..." (Gathering Stone): any card with that creature type (CR 205.3m).
  const anyOfChosen = /^If (?:it's|that card is) a card of the chosen type, (.+)$/.exec(sentences0[at] ?? "");
  const first = anyOfChosen ? (["", "", "card", anyOfChosen[1]!] as const) : (/^If (?:it's|that card is) (not |)(an? .+?|snow) card, (.+)$/.exec(sentences[at] ?? "") ?? /^If (?:it's|that card is) ()(an? [a-z]+ card with mana value \d+ or (?:less|greater)), (.+)$/.exec(sentences[at] ?? "") ?? /^If it (isn't) (an? .+?) card, (.+)$/.exec(sentences[at] ?? "") ?? /^If that card is ()(snow), (.+)$/.exec(sentences[at] ?? ""));
  // "If that card has the chosen name, sacrifice ~ and draw three cards" (Diviner's Lockbox), after "choose a card name".
  const named = !first && /^If (?:it|that card) has the chosen name, (.+)$/.exec(sentences[at] ?? "");
  if (named) {
    // Its targets are chosen as it's put on the stack, whatever the card turns out to be (CR 601.2c, 602.2b).
    const then = revealedAction(named[1]!, ctx, true);
    return then && { effect: { type: "if", cond: { kind: "revealedIs", filter: { kind: "card", chosen: "name", text: "card with the chosen name" } }, effects: then }, next: at + 1 };
  }
  // Nissa, Steward of Elements: "If it's a land card or a creature card with mana value less than or equal to the number of
  // loyalty counters on ~, you may put that card onto the battlefield": either one, the count made as it resolves (with
  // ~'s last known loyalty if it's gone, rulings). Not put, it stays on top (rulings).
  const orBound = !first && /^If it's (an? [a-z]+ card) or (an? [a-z]+ card with mana value less than or equal to [^,]+), (.+)$/.exec(sentences[at] ?? "");
  if (orBound) {
    const a = parseSearchFilter(orBound[1]!.replace(/^an? /, ""));
    const b = parseSearchFilter(orBound[2]!.replace(/^an? /, ""), (t) => parseBoundCount(t, ctx));
    const then = a && b?.bound ? revealedAction(orBound[3]!, ctx) : null;
    if (!then) return null;
    return { effect: { type: "if", cond: { kind: "revealedIs", filter: { kind: "card", anyOf: [a!, b!], text: `${orBound[1]!.replace(/^an? /, "")} or ${orBound[2]!.replace(/^an? /, "")}` } }, effects: then }, next: at + 1 };
  }
  if (!first) return null;
  const filter0: TargetSpec | null = anyOfChosen ? { kind: "card", chosen: "type", text: "card of the chosen type" } : (parseSearchFilter(/ card with mana value /.test(first[2]!) ? first[2]!.replace(/^an? /, "") : `${first[2]!.replace(/^an? /, "")} card`) ?? null);
  const filter = filter0 && ofChosen && !anyOfChosen ? { ...filter0, chosen: "type" as const, text: `${filter0.text} of the chosen type` } : filter0;
  const then = filter && revealedAction(first[3]!, ctx);
  if (!filter || !then) return null;
  let next = at + 1;
  const other = /^Otherwise, (.+)$/.exec(sentences[next] ?? "");
  let otherwise = other ? revealedAction(other[1]!, ctx) : undefined;
  if (otherwise === null) return null;
  if (other) next++;
  // Fecund Greenshell: "If it's a land card, you may put it onto the battlefield tapped. Otherwise, put it into your
  // hand.": a land you choose not to put onto the battlefield goes to your hand too (rulings).
  const mayPut = then.length === 1 && then[0]!.type === "may" && !then[0]!.otherwise && !then[0]!.pay && then[0]!.effects.length === 1 && then[0]!.effects[0]!.type === "putOntoBattlefield" ? then[0]! : null;
  if (other && mayPut && otherwise && /^put it into your hand$/.test(other[1]!)) then[0] = { ...mayPut, otherwise: structuredClone(otherwise) };
  // "If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, put
  // it into your hand." (Risen Reef), "If you didn't put a card onto the battlefield this way, create ..." (Rulik Mons):
  // when it isn't one, or when you choose not to.
  // Gathering Stone: "If it's a card of the chosen type, you may reveal it and put it into your hand. If you don't put the
  // card into your hand, you may put it into your graveyard": also when it is one and you don't reveal it (rulings).
  const notPut = !other && /^If you (?:don't put the card onto the battlefield|didn't put a card onto the battlefield this way|don't put the card into your hand), (.+)$/.exec(sentences[next] ?? "");
  if (notPut) {
    const toHand = /^If you don't put the card into your hand, /.test(sentences[next] ?? "");
    const one = then.length === 1 && then[0]!.type === "may" && !then[0]!.otherwise && !then[0]!.pay ? then[0]! : null;
    const may = one && (toHand ? one.effects.length === 2 && one.effects[0]!.type === "revealRevealed" && one.effects[1]!.type === "bounce" : one.effects.length === 1 && one.effects[0]!.type === "putOntoBattlefield") ? one : null;
    const before = ctx.targets.length;
    const rest = may && (revealedAction(notPut[1]!, ctx) ?? parseOne(capital(notPut[1]!), ctx));
    if (!may || !rest || ctx.targets.length !== before || rest.some((e) => pauses(e) && e.type !== "may")) return null;
    then[0] = { ...may, otherwise: rest };
    otherwise = structuredClone(rest);
    next++;
  }
  // "That creature gains haste. Sacrifice it at the beginning of the next end step." (Impromptu Raid, Killer Instinct):
  // about the permanent the one "put it onto the battlefield" made.
  const puts = [...then, ...(otherwise ?? [])].flatMap((e) => (e.type === "putOntoBattlefield" ? [e] : e.type === "may" ? e.effects.filter((x) => x.type === "putOntoBattlefield") : [])) as Extract<Effect, { type: "putOntoBattlefield" }>[];
  const haste = /^That creature gains haste( until end of turn)?$/.exec(sentences[next] ?? "");
  if (haste) {
    if (puts.length !== 1) return null;
    puts[0]!.haste = haste[1] ? "endOfTurn" : "game";
    next++;
  }
  const atEnd = /^(Exile|Sacrifice) (?:it|that creature) at the beginning of the next end step$/.exec(sentences[next] ?? "");
  if (atEnd) {
    if (puts.length !== 1) return null;
    puts[0]!.atEndStep = atEnd[1] === "Exile" ? "exile" : "sacrifice";
    next++;
  }
  const effect: Effect = { type: "if", cond: { kind: "revealedIs", filter, ...(first[1] ? { not: true as const } : {}) }, effects: then, ...(otherwise ? { otherwise } : {}) };
  return { effect, next };
}

/**
 * "Exile the top three cards of your library face down. You may look at those cards for as long as they remain exiled.
 * Until your next turn, you may play those cards." (Three Wishes), "look at the top card of that player's library, then
 * exile it face down. You may play that card for as long as it remains exiled, and mana of any type can be spent to cast
 * that spell" (Gonti), "Target opponent exiles the top X cards of their library face down. You may look at and play
 * those cards for as long as they remain exiled." (Outrageous Robbery): the exile and what may be done with the cards,
 * which only the player who exiled them may look at (CR 406.3). Null if the sentence isn't such an exile, or if it's one
 * with no permission after it (Duplicity's, read elsewhere).
 */
function parseFaceDownPlay(sentences: string[], at: number, ctx: Ctx): { effect: Effect; next: number } | null | "fail" {
  const s = sentences[at]!;
  const LIB = "(your|that player's|target player's|target opponent's|each opponent's|each player's)";
  const head =
    new RegExp(`^[Ee]xile the top (card|${NUMX} cards) of ${LIB} library face down$`).exec(s) ??
    new RegExp(`^(?:[Ll]ook at the top (card|${NUMX} cards) of ${LIB} library and exile (?:it|that card|those cards) face down)$`).exec(s);
  // "Exile the top card of your library face down and look at it" (Ugin, the Ineffable).
  const andLook = /^Exile the top (card) of (your) library face down and look at it$/.exec(s);
  if (andLook) return { effect: { type: "exileFaceDown", from: "top", look: true }, next: at + 1 };
  const look = !head && new RegExp(`^[Ll]ook at the top (card|${NUMX} cards) of ${LIB} library$`).exec(s);
  const lookThen = look && /^Exile (?:it|that card|those cards|them) face down$/.test(sentences[at + 1] ?? "");
  // Siphon Insight: "Look at the top two cards of target opponent's library. Exile one of them face down and put the other
  // on the bottom of that library."
  const lookPick = look && !lookThen && look[1] === "two cards" && /^Exile one of them face down and put the other on the bottom of that library$/.test(sentences[at + 1] ?? "");
  const they = new RegExp(`^(Target opponent|Target player|That player|Each opponent) exiles? the top (card|${NUMX} cards) of their library face down$`).exec(s);
  // "Whenever a creature deals combat damage to one of your opponents, its controller looks at the top card of that
  // opponent's library and exiles it face down. They may play that card ..." (Gonti, Night Minister): the creature's
  // controller exiles it and may play it (as it last existed, CR 608.2h), "that opponent" being the player dealt damage.
  const its = ctx.subjectIt && ctx.eventPlayer && !head && !lookThen && !they ? /^[Ii]ts controller looks at the top card of that (?:opponent|player)'s library and exiles it face down$/.exec(s) : null;
  if (its) {
    const t = sentences[at + 1];
    const may = /^They may play that card for as long as it remains exiled$/.test(t ?? "");
    if (!may) return "fail";
    const anyType = /^Mana of any type can be spent to cast (?:a spell this way|that spell|it)$/.test(sentences[at + 2] ?? "");
    const effect: Effect = { type: "exileFaceDown", from: "top", who: { ref: "eventPlayer" }, actor: { ref: "subjectController" }, play: { until: "exiled", ...(anyType ? { anyType: true as const } : {}) } };
    return { effect, next: at + (anyType ? 3 : 2) };
  }
  if (!head && !lookThen && !lookPick && !they) return null;
  let next = at + (lookThen || lookPick ? 2 : 1);
  const m = head ?? (lookThen || lookPick ? look : null);
  const count = m ? m[1]! : they![2]!;
  const n = count === "card" ? 1 : amt(new RegExp(`^${NUMX} cards$`).exec(count)![1]!);
  // Not yet: whose library is read last, after the permission is known to be there (it may add a target).
  const whose = m ? (m[m.length - 1] === "your" ? "you" : m[m.length - 1]!.replace(/'s$/, "")) : they![1]!;
  let seen = false;
  let play: FaceDownPlay | undefined;
  let upkeepGraveyard = false;
  let endStepHand = false;
  // "As though it were mana of any color": colored symbols paid with any mana, {C} still only with colorless (CR 609.4b).
  const ANY = "(?:mana of any type can be spent to cast (?:it|them|that spell|those spells)|you may spend mana as though it were mana of any (?:type|color) to cast (?:it|them|that spell|those spells))";
  for (;;) {
    const t = sentences[next];
    if (t === undefined) break;
    if (/^You may look at (?:it|that card|those cards|them) for as long as (?:it remains|they remain) exiled$/.test(t)) seen = true;
    else {
      const may = new RegExp(`^You may (look at and )?(play|cast) (?:it|that card|those cards|them|${lookPick ? "the exiled card" : "it"})( without paying (?:its mana cost|their mana costs))? (for as long as (?:it remains|they remain) exiled|this turn|for as long as ~ remains on the battlefield)(?:, and ${ANY})?$`).exec(t);
      const until = /^Until your next turn, you may play (?:it|that card|those cards|them)$/.exec(t);
      if ((may || until) && !play) {
        play = { until: until ? "yourNextTurn" : /this turn/.test(may![4]!) ? "thisTurn" : /~ remains/.test(may![4]!) ? "source" : "exiled" };
        if (may?.[1]) seen = true;
        if (may?.[2] === "cast") play.castOnly = true;
        if (may?.[3]) play.free = true;
        if (may && new RegExp(ANY).test(t)) play.anyType = true;
        // "For as long as ~ remains on the battlefield": a permanent's ability only.
        if (play.until === "source" && ctx.spell) return "fail";
      } else if (play && /^(?:If you cast a spell this way, you may spend mana as though it were mana of any type to cast it|Mana of any type can be spent to cast (?:a spell this way|that spell|it))$/.test(t)) play.anyType = true;
      else if (play?.until === "yourNextTurn" && /^At the beginning of your next upkeep, put any of those cards you didn't play into your graveyard$/.test(t) && whose === "you") upkeepGraveyard = true;
      // "Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step."
      // (Necropotence): a delayed trigger for the card (rulings), which nobody may look at until then.
      else if (!play && !seen && !endStepHand && count === "card" && whose === "you" && t === "Put that card into your hand at the beginning of your next end step") endStepHand = true;
      else break;
    }
    next++;
  }
  if (!play && !seen && !endStepHand) return null;
  // A face-down card nobody may look at: Duplicity's, without the look (read as a plain sentence).
  const who = parsePlayer(whose, ctx);
  if (!who) return "fail";
  const effect: Effect = { type: "exileFaceDown", from: "top", ...(n !== 1 ? { n } : {}), ...(who.ref !== "you" ? { who } : {}), ...(seen ? { look: true as const } : {}), ...(play ? { play } : {}), ...(upkeepGraveyard ? { upkeepGraveyard: true as const } : {}), ...(endStepHand ? { endStepHand: true as const } : {}), ...(lookPick ? { pickOne: true as const } : {}) };
  return { effect, next };
}

/**
 * "Exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its
 * mana cost." (Sarevok's Tome), "Target opponent exiles cards ... until they exile a nonland card. Until end of turn, you
 * may cast that card without paying its mana cost." (Stolen Goods), "Shuffle your library, then reveal cards from the top
 * of it until you reveal a nonland card. Exile that card and put the rest on the bottom of your library in a random
 * order. You may cast the exiled card without paying its mana cost." (Creative Technique), "Reveal cards ... until you
 * reveal a nonland card, then put all cards revealed this way into your hand" (Treasure Hunt), and Transforming
 * Flourish's "If that permanent is destroyed this way, its controller exiles ..., then they may cast that card without
 * paying its mana cost". Null when it isn't one of these; any other use of the found card leaves the line unsupported.
 */
const TIBALT = "Its controller mills one to three cards chosen at random and exiles cards from the top of their library until they exile a nonland card with a different name than that spell; they may cast that card without paying its mana cost and put the exiled cards on the bottom of their library in a random order";

function parseUntilNonland(sentences: string[], at: number, ctx: Ctx): { effect: Effect; next: number } | null | "fail" {
  // Tibalt's Trickery, after "Counter target spell": "Choose 1, 2, or 3 at random. Its controller mills that many cards,
  // then exiles ... until they exile a nonland card with a different name than that spell. They may cast that card
  // without paying its mana cost. Then they put the exiled cards on the bottom of their library in a random order."
  if (sentences[at] === TIBALT) {
    if (ctx.targets.length !== 1 || ctx.targets[0]!.kind !== "spell") return "fail";
    const who = { ref: "targetController" as const, index: 0 };
    return { effect: { type: "exileUntilNonland", who, then: "castFree", ownerCasts: true, millFirst: 3, notNamedAs: 0, restBottom: true }, next: at + 1 };
  }
  // Gríma, Saruman's Footman: "that player exiles cards from the top of their library until they exile an instant or
  // sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled cards that weren't
  // cast this way on the bottom of their library in a random order." Cast as it resolves; not cast, it goes to the bottom
  // with the rest (rulings).
  if (
    ctx.eventPlayer &&
    /^[Tt]hat player exiles cards from the top of their library until they exile an instant or sorcery card$/.test(sentences[at]!) &&
    sentences[at + 1] === "You may cast that card without paying its mana cost" &&
    /^Then that player puts the exiled cards that weren't cast this way on the bottom of their library in a random order\.?$/.test(sentences[at + 2] ?? "")
  )
    return { effect: { type: "exileUntilNonland", who: { ref: "eventPlayer" }, then: "castFree", restBottom: true, untilTypes: ["Instant", "Sorcery"] }, next: at + 3 };
  // Chaos Wand: "Target opponent exiles cards ... until they exile an instant or sorcery card. You may cast that card
  // without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of that library in
  // a random order." The same as Gríma's, the target opponent's library (rulings).
  if (
    /^Target opponent exiles cards from the top of their library until they exile an instant or sorcery card$/.test(sentences[at]!) &&
    sentences[at + 1] === "You may cast that card without paying its mana cost" &&
    /^Then put the exiled cards that weren't cast this way on the bottom of that library in a random order\.?$/.test(sentences[at + 2] ?? "")
  ) {
    const who = parsePlayer("Target opponent", ctx);
    return who ? { effect: { type: "exileUntilNonland", who, then: "castFree", restBottom: true, untilTypes: ["Instant", "Sorcery"] }, next: at + 3 } : "fail";
  }
  // Treasure Keeper: "reveal cards from the top of your library until you reveal a nonland card with mana value 3 or less.
  // You may cast that card without paying its mana cost. Put all revealed cards not cast this way on the bottom of your
  // library in a random order.": cast from the library as this resolves; not cast, it goes to the bottom with the rest
  // (rulings), all of them if none was found.
  const keeper = new RegExp(`^[Rr]eveal cards from the top of your library until you reveal a nonland card with mana value (${NUM}) or less$`).exec(sentences[at]!);
  if (keeper && sentences[at + 1] === "You may cast that card without paying its mana cost" && /^Put all revealed cards not cast this way on the bottom of your library in a random order\.?$/.test(sentences[at + 2] ?? ""))
    return { effect: { type: "exileUntilNonland", reveal: true, inPlace: true, untilMv: num(keeper[1]!), then: "castFree" }, next: at + 3 };
  // Jodah, the Unifier: cascade that only stops at a legendary card, measured against the spell that triggered it.
  if (
    /^[Ee]xile cards from the top of your library until you exile a legendary nonland card with lesser mana value$/.test(sentences[at]!) &&
    sentences[at + 1] === "You may cast that card without paying its mana cost" &&
    sentences[at + 2] === "Put the rest on the bottom of your library in a random order"
  )
    return { effect: { type: "cascade", legendary: true }, next: at + 3 };
  // "Shuffle your library, then reveal ...", "..., then put all cards revealed this way ...": split at ", then" by now.
  const shuffleFirst = /^[Ss]huffle your library$/.test(sentences[at]!);
  const s = sentences[shuffleFirst ? at + 1 : at] ?? "";
  const reveal = (shuffleFirst ? /^Reveal cards from the top of it until you reveal a nonland card$/ : /^[Rr]eveal cards from the top of your library until you reveal a nonland card$/).test(s);
  const exile = !shuffleFirst && /^[Ee]xile cards from the top of your library until you exile a nonland card$/.test(s);
  // "They exile cards ... until they exile a nonland card" in a villainous choice's option (Ensnared by the Mara): the
  // player facing it, the event player as it runs.
  const they = shuffleFirst ? null : (/^(Target opponent|Target player) exiles cards from the top of their library until they exile a nonland card$/.exec(s) ?? (ctx.eventPlayer ? /^(They|That player) exiles? cards from the top of their library until they exile a nonland card$/.exec(s) : null));
  const flourish = !shuffleFirst && /^If that (?:permanent|creature) is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost$/.test(s);
  if (!reveal && !exile && !they && !flourish) return null;
  if (flourish) {
    if (ctx.targets.length !== 1) return "fail";
    const inner: Effect = { type: "exileUntilNonland", who: { ref: "targetController", index: 0 }, then: "castFree", ownerCasts: true };
    return { effect: { type: "if", cond: { kind: "destroyedThisWay" }, effects: [inner] }, next: at + 1 };
  }
  if (reveal && !shuffleFirst && sentences[at + 1] === "Put all cards revealed this way into your hand") return { effect: { type: "exileUntilNonland", reveal: true, then: "hand" }, next: at + 2 };
  // Erratic Explosion, Goblin Machinist: "... until you reveal a nonland card. ~ deals damage equal to that card's mana
  // value to any target. Put the revealed cards on the bottom of your library in any order." The cards stay in the library
  // while the next instruction reads "that card", then go to the bottom (see revealedUntilToBottom).
  if (reveal && !shuffleFirst && /\bthat card's mana value\b/.test(sentences[at + 1] ?? "") && /^Put (?:the revealed cards|all cards revealed this way|the nonland card into your hand and the rest) on the bottom of your library in any order\.?$/.test(sentences[at + 2] ?? "")) {
    ctx.revealedTop = true;
    ctx.revealedUntil = true;
    return { effect: { type: "exileUntilNonland", reveal: true, then: "keep" }, next: at + 1 };
  }
  // Breaching Dragonstorm: "You may cast it without paying its mana cost if that spell's mana value is 8 or less. If you
  // don't, put that card into your hand." Any nonland card stops it; one with a greater mana value goes to the hand.
  const upTo = exile && !they ? new RegExp(`^You may cast it without paying its mana cost if that spell's mana value is (${NUM}) or less$`).exec(sentences[at + 1] ?? "") : null;
  if (upTo && sentences[at + 2] === "If you don't, put that card into your hand") return { effect: { type: "exileUntilNonland", then: "castFree", maxMv: num(upTo[1]!), orHand: true }, next: at + 3 };
  let next = (shuffleFirst ? at + 1 : at) + 1;
  if (reveal) {
    if (sentences[next] !== "Exile that card and put the rest on the bottom of your library in a random order") return null;
    next++;
  }
  const cast = sentences[next] ?? "";
  const then: Extract<Effect, { type: "exileUntilNonland" }>["then"] | undefined = /^You may cast (?:that card|it|the exiled card) without paying its mana cost$/.test(cast)
    ? "castFree"
    : /^Until end of turn, you may cast that card without paying its mana cost$/.test(cast)
      ? "freeThisTurn"
      : /^You may cast that card this turn$/.test(cast)
        ? "thisTurn"
        : undefined;
  // "Put two time counters on that card. If it doesn't have suspend, it gains suspend." (Kang Prime, CR 702.62); "Put three
  // time counters on it." (The Tenth Doctor).
  const suspend = exile && !then ? new RegExp(`^Put ${NUM} time counters? on (?:that card|it)$`).exec(cast) : null;
  if (suspend && /^If it doesn't have suspend, it gains suspend$/.test(sentences[next + 1] ?? ""))
    return { effect: { type: "exileUntilNonland", then: "suspend", suspend: Number(amt(suspend[1]!)) }, next: next + 2 };
  if (!then) return null;
  const who = they ? (/^(?:They|That player)$/.test(they[1]!) ? ({ ref: "eventPlayer" } as const) : parsePlayer(they[1]!, ctx)) : undefined;
  if (they && !who) return "fail";
  return { effect: { type: "exileUntilNonland", ...(who ? { who } : {}), ...(reveal ? { reveal: true as const } : {}), ...(shuffleFirst ? { shuffleFirst: true as const } : {}), then }, next: next + 1 };
}

/** One thing done with the revealed card ("put it into your hand", "you may put it into your graveyard"), or "draw a card". */
function revealedAction(text: string, ctx: Ctx, targets = false): Effect[] | null {
  // "You may reveal it and put it into your hand" (Frost Augur): a card only looked at is revealed as it's put there.
  const shown = /^you may reveal it and put it into your hand$/.test(text);
  if (shown) return [{ type: "may", effects: [{ type: "revealRevealed" }, { type: "bounce", what: { ref: "revealed" } }], text: "reveal the revealed card and put it into your hand" }];
  // Sapling of Colfenor: "you gain life equal to that card's toughness, lose life equal to its power, then put it into
  // your hand": three events in turn (rulings), each read from the card as it is in the library.
  const sapling = /^you gain life equal to that card's (power|toughness), lose life equal to its (power|toughness), then put it into your hand$/.exec(text);
  if (sapling) {
    const stat = (w: string) => ({ count: { kind: "revealedManaValue" as const, stat: w as "power" | "toughness" } });
    return [{ type: "gainLife", who: { ref: "you" }, n: stat(sapling[1]!) }, { type: "loseLife", who: { ref: "you" }, n: stat(sapling[2]!) }, { type: "bounce", what: { ref: "revealed" } }];
  }
  const m = /^(you may )?put (?:it|that card) (into your hand|into your graveyard|on the bottom of your library|onto the battlefield( tapped)?(?: under your control)?)$/.exec(text);
  if (!m) {
    // Harsh Deceiver: "untap ~ and it gets +1/+1 until end of turn": "it" is ~, not the card.
    const untapSelf = /^untap ~ and it (gets .+)$/.exec(text);
    if (untapSelf) {
      const rest = revealedAction(`~ ${untapSelf[1]}`, ctx, targets);
      return rest && [{ type: "untap", what: { ref: "self" } }, ...rest];
    }
    // Not about the card: "draw a card" (Track Down, Thrasios), "sacrifice ~ and draw three cards" (Diviner's Lockbox).
    if (/\b(?:it|its|that card|that card's)\b/.test(text)) return null;
    const sac = /^sacrifice ~ and (.+)$/.exec(text);
    if (sac) {
      const rest = revealedAction(sac[1]!, ctx, targets);
      return rest && [{ type: "sacrifice", what: { ref: "self" } }, ...rest];
    }
    const before = ctx.targets.length;
    const fx = parseSentence(text.charAt(0).toUpperCase() + text.slice(1), ctx);
    return fx && (targets || ctx.targets.length === before) && !allEffects(fx).some((e) => PAUSING.has(e.type)) ? fx : null;
  }
  const what = { ref: "revealed" as const };
  const dest = m[2]!;
  const e: Effect = /hand/.test(dest)
    ? { type: "bounce", what }
    : /graveyard/.test(dest)
      ? { type: "putInGraveyard", what }
      : /bottom/.test(dest)
        ? { type: "putInLibrary", what, position: "bottom" }
        : { type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}) };
  return m[1] ? [{ type: "may", effects: [e], text: `put the revealed card ${dest.replace(/ under your control$/, "")}` }] : [e];
}

/** Split text into sentences, keeping a quoted ability ('gains "Sacrifice ~. Draw a card."') whole. */
/** Living Death's three parts, each for all players at once (Effect livingDeath): one instruction. */
const LIVING_DEATH = /^Each player exiles all (creature|artifact) cards from their graveyard, then sacrifices all \1s they control, then /;

/** Split `text` at each match of `re` (global) that isn't inside double quotes: a quoted ability is one piece. */
function splitOutsideQuotes(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(re)) {
    if ((text.slice(0, m.index).match(/"/g)?.length ?? 0) % 2) continue;
    out.push(text.slice(start, m.index));
    start = m.index! + m[0].length;
  }
  out.push(text.slice(start));
  return out;
}

function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (!quoted && /\s/.test(text[i]!) && (text[i - 1] === "." || (text[i - 1] === '"' && text[i - 2] === "."))) {
      if (text.slice(start, i).trim()) out.push(text.slice(start, i));
      while (i + 1 < text.length && /\s/.test(text[i + 1]!)) i++;
      start = i + 1;
    }
  }
  if (text.slice(start).trim()) out.push(text.slice(start));
  return out;
}

const LIM_DULS_VAULT =
  "Look at the top five cards of your library. As many times as you choose, you may pay 1 life, put those cards on the bottom of your library in any order, then look at the top five cards of your library. Then shuffle and put the last cards you looked at this way on top in any order.";

/** One ability's text to its targets and effects, or null if any of it can't be compiled. */

/**
 * A prevention shield on a target or you as a damage rule (CR 615.7), so an additional effect after it can be part of it
 * (CR 615.5): "Prevent the next N damage that would be dealt to target creature this turn" (not divided), or "Prevent all
 * damage that would be dealt to target creature this turn". Undefined for anything else.
 */
function prevAsDamageRule(e: Effect | undefined): Extract<Effect, { type: "damageRule" }> | undefined {
  if (e?.type === "preventNext" && !e.divided && (e.to.ref === "you" || ("index" in e.to && (e.to.ref === "target" || e.to.ref === "anyTarget"))))
    return { type: "damageRule", rule: { to: { target: e.to }, n: e.n } };
  if (e?.type === "continuous" && e.duration === "endOfTurn" && e.what.ref === "target" && !("n" in e.what) && e.mods.length === 1) {
    const m = e.mods[0]!;
    if (m.kind === "preventDamage" && m.to && Object.keys(m).every((k) => k === "kind" || k === "to") && Object.keys(e).every((k) => ["type", "what", "mods", "duration"].includes(k)))
      return { type: "damageRule", rule: { to: { target: { ref: "target", index: e.what.index } } } };
  }
  return undefined;
}

export function parseBody(text: string, opts: { sacrificedIt?: boolean; amassed?: boolean; subject?: boolean; subjectIt?: boolean; subjectLeft?: boolean; selfIt?: boolean; selfCard?: boolean; auraCard?: boolean; activated?: boolean; costLinked?: boolean; spell?: boolean; castSpell?: boolean; activatedAbility?: boolean; eventPlayer?: boolean; defending?: boolean; selfCastSpell?: boolean; selfEntered?: boolean; ownX?: boolean; revealedFromHand?: boolean; tappedThisWay?: boolean; costSacrificedX?: string; discardedSelf?: true; /** "Those creatures" are the trigger event's group (Frontier Warmonger). */ eventGroup?: true; eventRecipient?: true; clashed?: boolean } = {}): AbilityBody | null {
  // Dazzling Denial: "Counter target spell unless its controller pays {2}. If you control a Bird, counter that spell unless
  // its controller pays {4} instead." One counter, with the cost the condition sets as it resolves (CR 608.2c).
  // Increasing Ambition: "Search your library for a card and put that card into your hand. If ~ was cast from a graveyard,
  // instead search your library for two cards and put those cards into your hand. Then shuffle." One search either way,
  // then the shuffle: the same as each search followed by its shuffle.
  const searchInstead = /^Search your library for (an? [^.,]+?) and put that card into your hand\. If ~ was cast from a graveyard, instead search your library for (two [^.,]+?) and put those cards into your hand\. Then shuffle\.$/.exec(text.trim());
  if (searchInstead) return parseBody(`Search your library for ${searchInstead[1]}, put that card into your hand, then shuffle. If ~ was cast from a graveyard, instead search your library for ${searchInstead[2]}, put those cards into your hand, then shuffle.`, opts);
  // Obzedat, Ghost Council: "You may exile ~. If you do, return it to the battlefield under its owner's control at the
  // beginning of your next upkeep. It gains haste.": one delayed trigger (CR 603.7), the card it became coming back with
  // haste for as long as it remains on the battlefield (rulings).
  if (!opts.spell && !opts.selfCard && /^[Yy]ou may exile ~\. If you do, return it to the battlefield under its owner's control at the beginning of your next upkeep\. It gains haste\.$/.test(text.trim()))
    return { targets: [], effects: [{ type: "may", effects: [{ type: "flicker", what: { ref: "self" }, under: "owner", at: "yourNextUpkeep", haste: true }], text: "exile ~" }], text };
  // From Father to Son: "Search your library for a Vehicle card, reveal it, and put it into your hand. If ~ was cast from a
  // graveyard, put that card onto the battlefield instead. Then shuffle.": one search, the card going to one place or the
  // other (CR 608.2c), then the shuffle.
  const searchPutInstead = opts.spell ? /^Search your library for (an? [^.,]+? card), reveal it, and put it into your hand\. If ~ was cast from a graveyard, put that card onto the battlefield instead\. Then shuffle\.$/.exec(text.trim()) : null;
  if (searchPutInstead) {
    const hand = parseBodyText(`Search your library for ${searchPutInstead[1]}, reveal it, put it into your hand, then shuffle.`, opts);
    const field = parseBodyText(`Search your library for ${searchPutInstead[1]}, put it onto the battlefield, then shuffle.`, opts);
    if (!hand || !field || hand.targets.length || field.targets.length) return null;
    return { targets: [], effects: [{ type: "if", cond: { kind: "castFromGraveyard" }, effects: field.effects, otherwise: hand.effects }], text };
  }
  // Increasing Confusion: "Target player mills X cards. If ~ was cast from a graveyard, that player mills twice that many
  // cards instead": twice X.
  const millTwice = /^(Target player mills X cards\. If ~ was cast from a graveyard, that player mills) twice that many cards instead\.$/.exec(text.trim());
  if (millTwice) return parseBody(`${millTwice[1]} twice X cards instead.`, opts);
  const instead = /^(Counter target spell unless its controller pays \{\d+\})\. If (you control [^,.]+), counter that spell unless its controller pays (\{\d+\}) instead\.$/.exec(text.trim());
  if (instead) {
    const base = parseBodyText(`${instead[1]}.`, opts);
    const cond = parseBodyText(`If ${instead[2]}, draw a card.`, opts)?.effects[0];
    const counter = base?.effects.length === 1 ? base.effects[0] : undefined;
    if (counter?.type !== "counterSpell" || !counter.unless || cond?.type !== "if" || cond.effects.length !== 1 || cond.otherwise) return null;
    return { targets: base!.targets, effects: [{ type: "if", cond: cond.cond, effects: [{ ...counter, unless: { cost: instead[3]! } }], otherwise: [counter] }], text };
  }
  // Scab-Clan Giant: "it fights target creature an opponent controls chosen at random"; Knight Rampager: "it deals 4 damage
  // to target opponent chosen at random": a triggered ability's one target, picked at random among the legal ones as the
  // ability is put on the stack, so players can respond knowing it (rulings).
  // Witch Hunt: "target opponent chosen at random gains control of ~". (Not "chosen at random from among ...".)
  const random = /\btarget [a-z ]+? chosen at random(?=[.,]| (?!from\b))/.exec(text);
  if (random && !opts.spell && !opts.activated && !opts.activatedAbility) {
    if ((text.match(/chosen at random/g) ?? []).length !== 1 || (text.match(/\btarget\b/g) ?? []).length !== 1) return null;
    const body = parseBodyText(text.replace(" chosen at random", ""), opts);
    const t = body?.targets.length === 1 ? body.targets[0]! : undefined;
    if (!t || t.many || t.optional || t.divided) return null;
    return { ...body!, targets: [{ ...t, random: true, text: `${t.text} chosen at random` }], text };
  }
  const body = parseBodyText(text, opts);
  // Search for Blex: "You lose 3 life for each card you put into your hand this way": the dig's prompt and the bots know
  // what each card taken costs.
  body?.effects.forEach((e, i) => {
    const dig = body.effects[i - 1];
    if (e.type === "loseLife" && e.who.ref === "you" && typeof e.n === "object" && "count" in e.n && e.n.count.kind === "dugToHand" && dig?.type === "dig") dig.lifeEach = e.n.times ?? 1;
  });
  // Éowyn: "protection from each of that creature's colors" is the colors of the ability's one target (TARGET_COLORS_PROTECTION).
  if (body && text.includes("each of that creature's colors") && (body.targets.length !== 1 || body.targets[0]!.kind !== "object")) return null;
  return body;
}

function parseBodyText(text: string, opts: { sacrificedIt?: boolean; amassed?: boolean; subject?: boolean; subjectIt?: boolean; subjectLeft?: boolean; selfIt?: boolean; selfCard?: boolean; auraCard?: boolean; activated?: boolean; costLinked?: boolean; spell?: boolean; castSpell?: boolean; activatedAbility?: boolean; eventPlayer?: boolean; defending?: boolean; selfCastSpell?: boolean; selfEntered?: boolean; ownX?: boolean; revealedFromHand?: boolean; tappedThisWay?: boolean; costSacrificedX?: string; discardedSelf?: true; /** "Those creatures" are the trigger event's group (Frontier Warmonger). */ eventGroup?: true; eventRecipient?: true; clashed?: boolean } = {}): AbilityBody | null {
  // "Put a +1/+1 counter on ~ and untap it" (Gwenna): "it" is ~, the one thing named.
  text = differenceInHand(text).replace(/\b(counters? on ~ and (?:un)?tap) it\b/g, "$1 ~")
    // Homarid Warrior: "~ gains shroud until end of turn and doesn't untap during your next untap step. Tap it.": two
    // instructions about ~, then tapping ~.
    .replace(/^~ gains (\w+) until end of turn and doesn't untap during your next untap step\. Tap it\.$/, "~ gains $1 until end of turn. ~ doesn't untap during your next untap step. Tap ~.")
    // Reveka, Wizard Savant: "~ deals 2 damage to any target and doesn't untap during your next untap step": two
    // instructions about ~, in order.
    .replace(/^~ deals (\d+) damage to any target and doesn't untap during your next untap step\.$/, "~ deals $1 damage to any target. ~ doesn't untap during your next untap step.")
    // Machine Man, Model X-51: "put a +1/+1 counter on ~ and ~ gains flying until end of turn": the same.
    .replace(/^put an? \+1\/\+1 counter on ~ and ~ gains ([a-z]+) until end of turn\.$/, "put a +1/+1 counter on ~. ~ gains $1 until end of turn.")
    // Yawgmoth Demon: "tap ~ and it deals 2 damage to you": the same.
    .replace(/\b([Tt]ap ~ and) it (deals \d+ damage to you)\b/g, "$1 ~ $2")
    // Touch of the Eternal: "count the number of permanents you control. Your life total becomes that number.": the number
    // counted as it resolves (CR 119.5).
    .replace(/^count the number of permanents you control\. Your life total becomes that number\.$/, "Your life total becomes the number of permanents you control.");
  // Scavenged Brawler: "Choose target creature. Put four +1/+1 counters, a flying counter, ... on that creature.": the
  // counters on that target.
  text = text.replace(/^Choose (target creature)\. (Put [^.]+?) on that creature\.$/, "$2 on $1.");
  text = text.replace(/^[Cc]hoose (target creature you control)\. If damage would be dealt to that creature this turn, /, "If damage would be dealt to $1 this turn, ");
  // Fulgent Distraction: "Choose two target creatures. Tap those creatures, then ...": the same as "Tap two target creatures".
  text = text.replace(/^Choose two target creatures\. Tap those creatures, then /, "Tap two target creatures, then ");
  // Willowdusk, Essence Seer: "Choose another target creature. Put a number of +1/+1 counters on it equal to ...": the same.
  text = text.replace(/(^|: )Choose (another target creature)\. (Put a number of [+-]1\/[+-]1 counters) on it (equal to [^.]+)\./, "$1$3 on $2 $4.");
  // Akroan Horse: "When ~ enters, an opponent gains control of it": an opponent chosen as it resolves, not targeted
  // (rulings), the same as "Choose an opponent. That player gains control of ~."
  if (opts.selfIt || !/\bit\b/.test(text)) text = text.replace(/^[Aa]n opponent gains control of (?:~|it)\.$/, "Choose an opponent. That player gains control of ~.");
  // Liliana's Triumph: "Each opponent sacrifices a creature of their choice. If you control a Liliana planeswalker, each
  // opponent also discards a card.": "also" says only that it's in addition to the sacrifice.
  text = text.replace(/(\. If you control an? [A-Z][a-z]+ planeswalker, each opponent) also (discards a card\.)$/, "$1 $2");
  // Witch-king of Angmar: "sacrifices a creature of their choice that dealt combat damage to you this turn" (the
  // sacrificing player chooses anyway, CR 701.21a).
  text = text.replace(/\b(sacrifices a creature) of their choice (that dealt combat damage to you this turn)\b/, "$1 $2");
  // Clip Wings: "sacrifices a creature of their choice with flying": a creature with flying, of their choice.
  text = text.replace(/\b(sacrifices a creature) of their choice (with [a-z]+)(?=\.)/, "$1 $2");
  // Thousand-Faced Shadow: "create a token that's a copy of another target attacking creature. The token enters tapped and
  // attacking." (CR 508.4).
  text = text.replace(/\b([Cc]reate) a token that's a copy of ([^.]+)\. The token enters tapped and attacking\./, "$1 a tapped and attacking token that's a copy of $2.");
  // Flamerush Rider: "create a token that's a copy of another target attacking creature and that's tapped and attacking"
  // (CR 508.4), the same thing said in one sentence.
  text = text.replace(/\b([Cc]reate) a token that's a copy of ([^.]+?) and that's tapped and attacking\./, "$1 a tapped and attacking token that's a copy of $2.");
  // Echoing Assault: "... The token enters tapped and attacking that player." after "Whenever you attack a player".
  text = text.replace(/\b([Cc]reate) a token that's a copy of ([^.]+)\. The token enters tapped and attacking that player\./, "$1 a tapped and attacking that player token that's a copy of $2.");
  // Ichormoon Gauntlet: "choose a counter on target permanent. Put an additional counter of that kind on that permanent."
  text = text.replace(/\b[Cc]hoose a counter on (target [a-z ]+?)\. Put an additional counter of that kind on that permanent\./, "Put another counter of a kind already on $1 on it.");
  // Captain N'ghathrod: "choose target artifact or creature card in an opponent's graveyard that was put there from their
  // library this turn. Put it onto the battlefield under your control."
  text = text.replace(/\bchoose (target [a-z ]+? card in an opponent's graveyard that was put there from their library this turn)\. Put it onto the battlefield under your control\./, "put $1 onto the battlefield under your control.");
  // Animation Module: "Choose a counter on target permanent or player. Give that permanent or player another counter of
  // that kind."
  text = text.replace(/\b[Cc]hoose a counter on target permanent or player\. Give that permanent or player another counter of that kind\./, "Put another counter of a kind already on target permanent or player on it.");
  // Lim-Dûl's Vault: look at the top five; as many times as you choose, pay 1 life and put them on the bottom in any order,
  // then look at the next five; then shuffle the rest and put the last five looked at on top in any order (rulings).
  if (text.trim() === LIM_DULS_VAULT) return { targets: [], effects: [{ type: "vault", n: 5, life: 1 }], text };
  // Shadrix Silverquill: "you may choose two. Each mode must target a different player." (a triggered ability's): none, or
  // exactly two (rulings), the two targeting different players (CR 115.3).
  const mayTwo = /^[Yy]ou may choose two\. Each mode must target a different player\.\s*((?:•[^•]+)+)$/.exec(text.trim());
  if (mayTwo && !opts.spell && !opts.activated) {
    const body = parseModal("two", mayTwo[1]!, text.trim(), opts);
    if (!body || !body.modal!.modes.every((m) => m.targets.length === 1 && m.targets[0]!.kind === "player")) return null;
    return { ...body, modal: { ...body.modal!, optional: true, distinctTargets: true } };
  }
  // Vindictive Lich: "choose one or more. Each mode must target a different player." (a triggered ability's): no more
  // modes than there are players to target, but at least one if any can be (rulings, CR 115.3).
  const oneOrMore = /^[Cc]hoose one or more\. Each mode must target a different player\.\s*((?:•[^•]+)+)$/.exec(text.trim());
  if (oneOrMore && !opts.spell && !opts.activated) {
    const body = parseModal("one or more", oneOrMore[1]!, text.trim(), opts);
    if (!body || !body.modal!.modes.every((m) => m.targets.length === 1 && m.targets[0]!.kind === "player")) return null;
    return { ...body, modal: { ...body.modal!, distinctTargets: true } };
  }
  // A triggered ability's "choose one. If you control a commander, you may choose both instead." (SOLDIER Military
  // Program), "If there are four or more card types among cards in your graveyard, choose both instead." (Prophetic
  // Titan): the condition is checked as the ability is put on the stack, when its modes are chosen (CR 603.3c; rulings
  // on Prophetic Titan).
  const bothIf = /^[Cc]hoose one\. If (.+?), (you may )?choose both instead(?:\.| —)\s*((?:•[^•]+)+)$/.exec(text.trim());
  if (bothIf && !opts.spell && !opts.activated) {
    const cond = parseStaticCondition(bothIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
    const body = cond && parseModal("one", bothIf[3]!, text.trim(), opts);
    if (!body || body.modal!.modes.length !== 2) return null;
    return { ...body, modal: { ...body.modal!, both: "control", bothIf: cond, ...(bothIf[2] ? {} : { bothExactly: true as const }) } };
  }
  const modal = MODAL.exec(text.trim());
  if (modal) {
    const body = parseModal(modal[1]!, modal[3]!, text.trim(), opts);
    const how = modal[2]?.trim();
    // Only "choose one", and an ability's (no spell has these).
    if (!body || !how) return body;
    if (modal[1] !== "one" || opts.spell) return null;
    return { ...body, modal: { ...body.modal!, ...(how === "at random" ? { random: true as const } : { unchosen: how.endsWith("this turn") ? ("turn" as const) : ("ever" as const) }) } };
  }
  // Modes with text before them, or a kind of choice we don't support; but "You may pay {1}. When you do, choose one —
  // • ..." (Hylda of the Icy Crown) is a modal reflexive trigger, its modes chosen as it's put on the stack (CR 603.12).
  const reflexiveModes = /\bWhen you do, choose [^•.]*—\s*•/.exec(text);
  if (text.includes("•") && (!reflexiveModes || text.indexOf("•") < reflexiveModes.index)) return null;
  const ctx: Ctx = {
    targets: [],
    // Ral Zarek: "Flip five coins. ... for each coin that comes up heads": flips no one calls (CR 705.2).
    ...(/\b[Ff]lip (?:two|three|four|five) coins\b/.test(text) && /\bfor each coin that comes up heads\b/.test(text) ? { uncalledFlips: true } : {}),
    ...(opts.subject ? { subject: true } : {}),
    ...(opts.subjectIt ? { subject: true, subjectIt: true } : {}),
    ...(opts.subjectLeft ? { subjectLeft: true } : {}),
    ...(opts.selfIt ? { selfIt: true } : {}),
    ...(opts.selfCard ? { selfCard: true } : {}),
    ...(opts.discardedSelf ? { discardedSelf: true as const } : {}),
    ...(opts.auraCard ? { auraCard: true } : {}),
    ...(opts.activated ? { activated: true } : {}),
    ...(opts.costLinked ? { costLinked: true } : {}),
    ...(opts.spell ? { spell: true } : {}),
    ...(opts.castSpell ? { castSpell: true, spellIt: true } : {}),
    ...(opts.activatedAbility ? { activatedAbility: true } : {}),
    ...(opts.eventPlayer ? { eventPlayer: true } : {}),
    ...(opts.defending ? { defending: true } : {}),
    ...(opts.eventRecipient ? { eventRecipient: true } : {}),
    ...(opts.selfCastSpell ? { selfCastSpell: true } : {}),
    ...(opts.selfEntered ? { selfEntered: true } : {}),
    ...(opts.ownX ? { ownX: true } : {}),
    ...(opts.sacrificedIt ? { sacrificedIt: true } : {}),
    ...(opts.amassed ? { amassed: true } : {}),
    ...(opts.revealedFromHand ? { revealedFromHand: true } : {}),
    ...(opts.tappedThisWay ? { tappedThisWay: true } : {}),
    ...(opts.costSacrificedX ? { costSacrificedX: opts.costSacrificedX } : {}),
    ...(opts.eventGroup ? { lastGroup: { ref: "eventGroup" as const } } : {}),
    ...(opts.clashed ? { clashed: true } : {}),
  };
  // "Each player loses half their life, then discards half the cards in their hand, ... Round up each time." (Fraying
  // Omnipotence): the last sentence says how each "half" in the others is rounded (CR 107.1a).
  const roundEach = /(?:^|\s)Round (up|down) each time\.?$/.exec(text.trim());
  if (roundEach) {
    text = text.trim().slice(0, roundEach.index);
    ctx.halfRound = roundEach[1] as "up" | "down";
  }
  // Wash Out: "Return all permanents of the color of your choice to their owners' hands": the color is chosen as it
  // resolves (CR 608.2d), the same as "Choose a color. Return all permanents of the chosen color ...".
  text = text.replace(/^(Return|Destroy|Exile) all ([a-z]+) of the color of your choice\b/, "Choose a color. $1 all $2 of the chosen color");
  // Prismatic Strands: "Prevent all damage that sources of the color of your choice would deal this turn": the same.
  text = text.replace(/^Prevent all damage that sources of the color of your choice would deal this turn\./, "Choose a color. Prevent all damage that sources of the chosen color would deal this turn.");
  // Smallpox: "Each player loses 1 life, discards a card, sacrifices a creature of their choice, then sacrifices a land of
  // their choice": one instruction after another, each done by every player at once (rulings), as with ", then".
  // Aberrant Return: "Put one, two, or three target creature cards from graveyards onto the battlefield under your
  // control. Each of them enters with an additional -1/-1 counter on it." It enters with it (CR 614.1c), as with "...
  // under your control with an additional -1/-1 counter on it".
  text = text.replace(/^((?:Put|Return) [^.]*target [^.]+ from [^.]*graveyards? (?:to|onto) the battlefield under your control)\. (?:Each of them|It) enters with an additional ([+-]1\/[+-]1) counter on it\./, "$1 with an additional $2 counter on it.");
  // Killian, Decisive Mentor: "tap up to one target creature and goad it": two instructions, in order.
  text = text.replace(/^([Tt]ap (?:up to one )?target creature) and goad it\./, "$1. Goad it.");
  // Sauron, Lord of the Rings: "amass Orcs 5, mill five cards, then return a creature card from your graveyard to the
  // battlefield": one instruction after another; the creature card may be one that was there before the mill (rulings).
  text = text.replace(/^amass ([A-Z][a-z]+) (\d+), mill (\w+) cards, then /, "amass $1 $2. Mill $3 cards, then ");
  // Daretti, Rocketeer Engineer: "choose target artifact card in your graveyard. You may sacrifice an artifact. If you do,
  // return the chosen card to the battlefield." The card is targeted as the ability is put on the stack and the sacrifice
  // chosen as it resolves (rulings): the same as "You may sacrifice an artifact. If you do, return target ...".
  text = text.replace(/^[Cc]hoose target ([a-z]+ card) in your graveyard\. You may sacrifice (an? [a-z]+)\. If you do, return the chosen card to the battlefield\./, "You may sacrifice $2. If you do, return target $1 from your graveyard to the battlefield.");
  // The Motherlode, Excavator: "destroy target nonbasic land defending player controls, and creatures that player controls
  // without flying can't block this turn": two instructions, "that player" being the defending player.
  text = text.replace(/\b([Dd]estroy target [a-z ]+ defending player controls), and creatures that player controls (without flying )?can't block this turn\./, "$1. Creatures defending player controls $2can't block this turn.");
  // Dragon Turtle: "tap it and up to one target creature an opponent controls. They don't untap during their controllers'
  // next untap steps." Both tapped, then neither untaps; with no target chosen, only ~ (rulings).
  text = text.replace(/^[Tt]ap (?:it|~) and (up to one target creature an opponent controls)\. They don't untap during their controllers' next untap steps\./, "Tap ~. Tap $1. ~ doesn't untap during its controller's next untap step. That creature doesn't untap during its controller's next untap step.");
  // Flamehold Grappler, Tzaangor Shaman: "copy the next spell you cast this turn when you cast it. You may choose new
  // targets for the copy": a delayed trigger (CR 603.7a), the same as "When you next cast a spell this turn, copy that
  // spell" (Doublecast).
  text = text.replace(/(^|\. )[Cc]opy the next ((?:instant or sorcery )?spell) you cast this turn when you cast it\. You may choose new targets for the copy\./, (_, pre: string, what: string) => `${pre}When you next cast ${/^[aeiou]/.test(what) ? "an" : "a"} ${what} this turn, copy that spell and you may choose new targets for the copy.`);
  // Ebony Fly: "Roll a d6. Until end of turn, you may have ~ become an X/X Insect artifact creature with flying, where X is
  // the result." Chosen as it resolves, after the roll (rulings): the same as "You may have ~ become ... until end of turn".
  text = text.replace(/(^|\. )Until end of turn, you may have ~ become ([^.,]+), where X is the result\./, "$1You may have ~ become $2 until end of turn, where X is the result.");
  // Nahiri, the Lithomancer: "Create a colorless Equipment artifact token named Stoneforged Blade. It has indestructible,
  // "...," and equip {0}." One instruction: the token is created with them (see sentences/tokens.ts).
  text = text.replace(/(^|\. )(Create a colorless Equipment artifact token named [A-Z][\w'-]*(?: [A-Z][\w'-]*)*)\. It has ([a-z]+), ("[^"]+") and (equip \{\d+\})\./, "$1$2 with $3, $4 and $5.");
  // Nahiri, the Harbinger: "Search your library for an artifact or creature card, put it onto the battlefield, then shuffle.
  // It gains haste. Return it to your hand at the beginning of the next end step." A delayed trigger about the permanent
  // found (CR 603.7), the same as "At the beginning of the next end step, return it to its owner's hand" (yours: it came
  // from your library).
  text = text.replace(/(^|\. )(Search your library for [^.]+, put it onto the battlefield, then shuffle\. It gains haste\.) Return it to your hand at the beginning of the next end step\./, "$1$2 At the beginning of the next end step, return it to its owner's hand.");
  // Cruel Ultimatum: "Target opponent sacrifices a creature of their choice, discards three cards, then loses 5 life. You
  // return a creature card from your graveyard to your hand, draw three cards, then gain 5 life." The same, in order.
  text = text.replace(/\. You return a creature card from your graveyard to your hand, draw three cards, then gain 5 life\.$/, ". Return a creature card from your graveyard to your hand. Draw three cards. You gain 5 life.");
  text = text.replace(/^((?:Each (?:player|opponent)|Target (?:player|opponent)) (?:loses|discards|sacrifices|draws|mills) [^,.]+)((?:, (?:loses|discards|sacrifices|draws|mills) [^,.]+)+), then ((?:loses|discards|sacrifices|draws|mills) [^,.]+)\./, (_, a: string, mid: string, last: string) => `${a}${mid.replace(/, /g, ", then ")}, then ${last}.`);
  // Linessa, Zephyr Mage: "Target player returns a creature they control to its owner's hand, then repeats this process for
  // an artifact, an enchantment, and a land": one after another, so an artifact creature returned first can't count as
  // the artifact too (rulings).
  text = text.replace(/^Target player returns a creature they control to its owner's hand, then repeats this process for an artifact, an enchantment, and a land\.$/, "Target player returns a creature they control to its owner's hand. That player returns an artifact they control to its owner's hand. That player returns an enchantment they control to its owner's hand. That player returns a land they control to its owner's hand.");
  // Oriss, Samite Guardian: "Target player can't cast spells this turn, and creatures that player controls can't attack
  // this turn": two instructions.
  text = text.replace(/^(Target player can't cast spells this turn), and creatures that player controls can't attack this turn\.$/, "$1. Creatures that player controls can't attack this turn.");
  const effects: Effect[] = [];
  // Cosmic Rebirth: "Choose target permanent card in your graveyard. If it has mana value 3 or less, you may put it onto the
  // battlefield. If you don't put it onto the battlefield, put it into your hand.": one instruction after the target.
  text = text.replace(/(Choose target permanent card in your graveyard\.) If it has mana value (\d+) or less, you may put it onto the battlefield\. If you don't put it onto the battlefield, put it into your hand\./, "$1 Put that card onto the battlefield if it has mana value $2 or less and you choose to, else into your hand.");
  // Doubling Chant: "For each creature you control, you may search your library for a creature card with the same name as
  // that creature. Put those cards onto the battlefield, then shuffle.": one search, up to one card for each of them (the
  // name each has now, rulings), shuffled even with none (rulings). Dichotomancy: the same for the tapped nonland
  // permanents target opponent controls, in that player's library, the cards coming under your control.
  text = text.replace(/^For each creature you control, you may search your library for a creature card with the same name as that creature\. Put those cards onto the battlefield, then shuffle\.$/, "Search your library for any number of creature cards with the same name as each creature you control, put them onto the battlefield, then shuffle.");
  text = text.replace(/^For each (tapped nonland permanent) target opponent controls, search that player's library for a card with the same name as that permanent\. Put those cards onto the battlefield under your control, then that player shuffles\.$/, "Search target opponent's library for cards with the same name as each $1 that player controls and put them onto the battlefield under your control. Then that player shuffles.");
  // Analyze the Pollen: "Search your library for a basic land card. If evidence was collected, instead search your
  // library for a creature or land card. Reveal that card, put it into your hand, then shuffle.": either search, each
  // revealed and put into your hand.
  text = text.replace(/^Search your library for (an? [a-z ]+? card)\. If evidence was collected, instead search your library for (an? [a-z ]+? card)\. Reveal that card, put it into your hand, then shuffle\.$/, "Search your library for $1, reveal it, put it into your hand, then shuffle. If evidence was collected, instead search your library for $2, reveal it, put it into your hand, then shuffle.");
  // "... gains flashback until end of turn. The flashback cost is equal to its mana cost." is one instruction.
  // "Choose target artifact or enchantment. Its owner shuffles it into their library." (Deglamer) is one instruction.
  text = text.replace(/^Choose (target [^.]+?)\. Its owner shuffles it into their library\./, "The owner of $1 shuffles it into their library.");
  // Subtlety: "choose up to one target creature spell or planeswalker spell. Its owner puts it on their choice of the top or
  // bottom of their library." One instruction, as "The owner of up to one target ... puts it ...".
  text = text.replace(/^[Cc]hoose (up to one )?target ([a-z]+) spell or ([a-z]+) spell\. Its owner puts it on their choice of the top or bottom of their library\./, "The owner of $1target $2 or $3 spell puts it on their choice of the top or bottom of their library.");
  // Night Nurse: "choose target permanent card in your graveyard that was put there from anywhere this turn. Return it to
  // your hand." is one instruction.
  // Archangel Elspeth: "It becomes an Angel in addition to its other types and gains flying." Two changes, both with no
  // duration (rulings).
  text = text.replace(/\bIt becomes (an? [A-Z][a-z]+) in addition to its other types and gains ([a-z]+)\./g, "It becomes $1 in addition to its other types. It gains $2.");
  // Tend the Pests: '... with "When this token dies, you gain 1 life," where X is ...': the comma belongs before "where".
  text = text.replace(/,"( where X is )/g, '",$1');
  // Samwise the Stouthearted: "choose up to one target permanent card in your graveyard that was put there from the
  // battlefield this turn. Return it to your hand. Then the Ring tempts you." The same, then the Ring.
  text = text.replace(/^[Cc]hoose ((?:up to one )?target [^.]+? in your graveyard(?: that was put there (?:from anywhere |from the battlefield )?this turn)?)\. Return it to your hand\.(?=$| Then )/, "Return $1 to your hand.");
  // Brought Back: "Choose up to two target permanent cards in your graveyard that were put there from the battlefield this
  // turn. Return them to the battlefield tapped." is one instruction; they return at the same time. Continue?: up to four.
  text = text.replace(/^[Cc]hoose (up to (?:one|two|three|four) target [^.]+? in your graveyard that were put there from the battlefield this turn)\. Return them to the battlefield( tapped)?\.$/, "Return $1 to the battlefield$2.");
  // Autumn's Veil: "Spells you control can't be countered by blue or black spells this turn, and creatures you control
  // can't be the targets of blue or black spells this turn": two instructions.
  text = text.replace(/^(Spells you control can't be countered by [a-z]+ or [a-z]+ spells this turn), and (creatures you control can't be the targets of [a-z]+ or [a-z]+ spells this turn)\./, "$1. $2.");
  // Meathook Massacre II: "return that card under your control" (its Oracle wording) is from the graveyard to the battlefield.
  text = text.replace(/\breturn that card under your control\b/g, "return that card to the battlefield under your control");
  // Tibalt's Trickery: one instruction about the countered spell's controller (read in parseUntilNonland).
  // "Search your library for up to X basic land cards, where X is .... Put those cards onto the battlefield tapped, then
  // shuffle." (Traverse the Outlands): the same as "... put them onto the battlefield tapped, then shuffle, where X is ...".
  text = text.replace(/(^|\. )Search your library for up to X ([^.,]+), where X is ([^.]+)\. Put those cards onto the battlefield( tapped)?, then shuffle\./, "$1Search your library for up to X $2, put them onto the battlefield$4, then shuffle, where X is $3.");
  // Green Slime: "counter target activated or triggered ability from an artifact or enchantment source. If a permanent's
  // ability is countered this way, destroy that permanent." Trickbind: "... activated abilities of that permanent can't be
  // activated this turn." One instruction each, about the countered ability's source (see sentences/spells.ts).
  text = text.replace(/(^|\. )([Cc]ounter target (?:activated or triggered|activated|triggered) ability[^.]*)\. If a permanent's ability is countered this way, (destroy that permanent|activated abilities of that permanent can't be activated this turn)\./, "$1$2, and if a permanent's ability is countered this way, $3.");
  // Mayael's Aria: "put a +1/+1 counter on each creature you control if you control a creature with power 5 or greater.
  // Then you gain 10 life if .... Then you win the game if ...": each condition checked in turn as it resolves (rulings),
  // the same as "If you control ..., put .... Then if you control ..., you gain .... Then if ..., you win the game."
  text = text.replace(/^([a-z][^.]*?) if (you control a creature with power \d+ or greater)\.(?= Then )/, (_, a: string, c: string) => `If ${c}, ${a}.`);
  text = text.replace(/\. Then ([a-z][^.]*?) if (you control a creature with power \d+ or greater)(?=\.)/g, ". Then if $2, $1");
  // Dowsing Device: "Then transform ~ if you control four or more artifacts": checked as it resolves (CR 608.2c), the
  // same as "Then if you control ..., transform ~".
  text = text.replace(/(^|\. )Then transform ~ if (you control [^.]+)\./, "$1Then if $2, transform ~.");
  // Red Death, Shipwrecker: "Goad target creature an opponent controls. That player draws a card.": the creature's
  // controller, as it resolves.
  text = text.replace(/^(Goad target creature an opponent controls\.) That player (draws a card\.)/, "$1 Its controller $2");
  // Field-Tested Frying Pan: "create a Food token, then create a 1/1 white Halfling creature token and attach ~ to it": the
  // Halfling, created second.
  text = text.replace(/(create an? [^.,]+ token), then (create an? [^.,]+ creature token) and (attach ~ to it\.)/, (_, a: string, b: string, c: string) => `${a}. ${b.charAt(0).toUpperCase()}${b.slice(1)}, then ${c}`);
  // Fractal Harness: "create a 0/0 green and blue Fractal creature token. Put X +1/+1 counters on it and attach ~ to it":
  // two instructions about the token, in that order.
  text = text.replace(/(create an? [^.]+ creature token\. Put (?:X|\w+) \+1\/\+1 counters? on it) and attach (~ to it\.)/, "$1. Attach $2");
  // Oreskos Explorer: "Search your library for up to X Plains cards, where X is .... Reveal those cards, put them into your
  // hand, then shuffle." The same, into your hand.
  text = text.replace(/(^|\. )([Ss])earch your library for up to X ([^.,]+), where X is ([^.]+)\. Reveal those cards, put them into your hand, then shuffle\./, "$1$2earch your library for up to X $3, reveal them, put them into your hand, then shuffle, where X is $4.");
  // Kami's Flare: "~ also deals 2 damage to that permanent's controller if you control a modified creature": checked as it
  // resolves (CR 608.2c), the same as "If you control a modified creature, ~ deals 2 damage to ...".
  text = text.replace(/(^|\. )~ also deals (\d+) damage to that permanent's controller if (you control an? [a-z ]+ creature)\./, "$1If $3, ~ deals $2 damage to that permanent's controller.");
  // Nightmare Incursion: "Search target player's library for up to X cards, where X is the number of Swamps you control,
  // and exile them.": the "where" at the end, as usual.
  text = text.replace(/(^|\. )Search (target player's|target opponent's) library for (up to )?X cards, where X is ([^.,]+), and exile them\./, "$1Search $2 library for $3X cards and exile them, where X is $4.");
  // Harvest Season: "Search your library for up to X basic land cards, where X is ..., put those cards onto the
  // battlefield tapped, then shuffle." The same; "put them" too (Rampant Rejuvenator, its power as it last existed).
  text = text.replace(/(^|\. )([Ss])earch your library for up to X ([^.,]+), where X is ([^.,]+), put (?:those cards|them) onto the battlefield( tapped)?, then shuffle\./, "$1$2earch your library for up to X $3, put them onto the battlefield$5, then shuffle, where X is $4.");
  // Avatar's Wrath: "Choose up to one target creature, then airbend all other creatures": the target only says which one
  // isn't airbent (CR 701.65a), the same as two sentences.
  // "Put a night counter on ~. Then if it has eight or more night counters on it, remove all of them and create ..."
  // (Replicating Ring): ~'s counters, checked as it resolves (rulings).
  // The Scarab God: "each opponent loses X life and you scry X, where X is the number of Zombies you control": the same X
  // for both, which losing life doesn't change, so two instructions each with it. Tymaret Calls the Dead's "You gain X
  // life and scry X" too.
  // "Untap it and all Samurai you control" (Godo, Bandit Warlord): two untaps, nothing in between.
  text = text.replace(/(^|\. )([Uu])ntap (it|~) and all ([^.]+)\./, "$1$2ntap $3. Untap all $4.");
  // "~ deals damage to each opponent equal to the number of tapped creatures that opponent controls" (Mjölnir, Storm
  // Hammer): each opponent's own count.
  text = text.replace(/(deals damage to each opponent equal to the number of [^.]+?) that opponent controls\b/g, "$1 that player controls");
  // Aria of Flame: "put a verse counter on ~, then it deals damage equal to the number of verse counters on it to ...":
  // "it" is ~.
  text = text.replace(/\b(put an? [a-z]+ counter on ~, then) it deals damage equal to the number of ([a-z]+) counters on it to\b/gi, "$1 ~ deals damage equal to the number of $2 counters on ~ to");
  // Herald of Ilharg: "~ deals damage equal to the number of counters on it to each opponent": "it" is ~.
  text = text.replace(/(^|\. |, )~ deals damage equal to the number of ((?:[+-]?[a-z0-9/+-]+ )?)counters on it to\b/g, "$1~ deals damage equal to the number of $2counters on ~ to");
  // Midnight Tilling: "Mill four cards, then you may return a permanent card from among them to your hand": the same as
  // "You may put ... from among them into your hand", the milled cards (CR 701.17b).
  text = text.replace(/^Mill (two|three|four|five) cards, then you may return (an? [a-z]+ card) from among them to your hand\./, "Mill $1 cards. You may put $2 from among them into your hand.");
  // Silvan Rally: "Mill four cards, then put up to two land cards from among them into your hand": up to two, none too.
  text = text.replace(/^Mill (two|three|four|five) cards, then put up to (two|three) ([a-z]+) cards from among them into your hand\./, "Mill $1 cards. You may put up to $2 $3 cards from among them into your hand.");
  // Ana Battlemage: "tap target untapped creature and that creature deals damage equal to its power to its controller":
  // two instructions about the target, in order.
  text = text.replace(/^([Tt]ap target untapped creature) and (that creature deals damage equal to its power to its controller)\.$/, (_, a: string, b: string) => `${a}. ${capital(b)}.`);
  // Wartime Protestors: "put a +1/+1 counter on that creature and it gains haste until end of turn": two instructions about
  // the same creature.
  // Sinkhole Surveyor: "you lose 1 life and ~ endures 1" (CR 701.63a), one after the other.
  text = text.replace(/^(you lose \d+ life) and ~ endures (\d+)\.$/, "$1. ~ endures $2.");
  text = text.replace(/^(put a \+1\/\+1 counter on that creature) and it gains ([a-z]+) until end of turn\.$/, "$1. That creature gains $2 until end of turn.");
  // Cryptek: "Choose another target artifact creature you control. When that creature dies this turn, return it to the
  // battlefield tapped under your control": choosing the target is targeting it (CR 115.1), so the same as Adarkar
  // Valkyrie's "When target creature ... dies this turn, return that card ..." (sentences/permanents.ts).
  text = text.replace(/^Choose (another target artifact creature you control)\. When that creature dies this turn, return it to the battlefield tapped under your control\.$/, "When $1 dies this turn, return that card to the battlefield tapped under your control.");
  // First Day of Class: "put a +1/+1 counter on it and it gains haste until end of turn": the same, about "it".
  text = text.replace(/^(put a \+1\/\+1 counter on it) and it gains ([a-z]+) until end of turn\.$/, "$1. It gains $2 until end of turn.");
  text = text.replace(/^[Mm]ill (two|three|four|five) cards, then you may put (an? [a-z]+(?: or [a-z]+)? card) from among the milled cards on top of your library\./, "Mill $1 cards. You may put $2 from among the milled cards on top of your library.");
  // Nalia de'Arnise: "put a +1/+1 counter on each creature you control and those creatures gain deathtouch until end of
  // turn": the same as two sentences, "those creatures" the same group.
  text = text.replace(/\b(put an? [^.]+? counter on each [^.]+? you control) and those creatures gain ([^.]+? until end of turn)\./gi, "$1. Those creatures gain $2.");
  // Torture Chamber: "~ deals damage to you equal to the number of pain counters on it": "it" is ~.
  text = text.replace(/(~ deals damage to [^.]+? equal to the number of [^.]+? counters on) it\b/g, "$1 ~");
  // Acidic Soil: "~ deals damage to each player equal to the number of lands they control": each that player's own.
  text = text.replace(/(deals damage to each (?:player|opponent) equal to the number of [^.]+?) they control\b/g, "$1 that player controls");
  // "~ deals X damage to each opponent, where X is the number of artifacts you control. You gain X life." (Tezzeret, Master
  // of the Bridge): the same X, counted again (nothing between them changes it).
  // Afterlife from the Loam: "For each player, choose up to one target creature card in that player's graveyard. Put those
  // cards onto the battlefield under your control." One target in each player's graveyard, yours too, all put at once.
  text = text.replace(/(^|\. )For each player, choose up to one target ([a-z]+ card) in that player's graveyard\. Put those cards onto the battlefield under your control\./, "$1For each player, put up to one target $2 from that player's graveyard onto the battlefield under your control.");
  // Legion Loyalist: "creatures you control gain first strike and trample until end of turn and can't be blocked by
  // creature tokens this turn": two instructions about the same creatures (those there as it resolves, CR 611.2c).
  text = text.replace(/(^|\. )([Cc]reatures you control) gain ([^.]+?) until end of turn and can't be blocked by ([^.]+?) this turn\./, "$1$2 gain $3 until end of turn. Creatures you control can't be blocked by $4 this turn.");
  // Kitesail Larcenist: "For each player, choose up to one other target artifact or creature that player controls. For as
  // long as ~ remains on the battlefield, the chosen permanents become Treasure artifacts with "..." and lose all other
  // abilities." One instruction for each player's target; each loses its other card types and subtypes too, keeping its
  // supertypes (rulings, CR 205.1a).
  text = text.replace(/(^|\. )[Ff]or each player, choose up to one other target (artifact or creature) that player controls\. For as long as ~ remains on the battlefield, the chosen permanents become Treasure artifacts with ("[^"]+") and lose all other abilities\./, "$1For each player, up to one other target $2 that player controls becomes a Treasure artifact with $3 and loses all other card types and abilities for as long as ~ remains on the battlefield.");
  text = text.replace(/(^|\. )(~ deals X damage to [^.]+), where X is ([^.]+)\. You gain X life\./, "$1$2, where X is $3. You gain X life, where X is $3.");
  // Recursive Recruitment: "for every three cards in your graveyard" is "for each" group of three.
  text = text.replace(/ for every (two|three|four|five) cards in your graveyard\./, " for each $1 cards in your graveyard.");
  // Browse: "Look at the top five cards of your library, put one of them into your hand, and exile the rest": the look,
  // then what's done with them.
  text = text.replace(/(^|\. )Look at the top (\w+) cards of your library, put one of them into your hand, and exile the rest\./, "$1Look at the top $2 cards of your library. Put one of them into your hand and exile the rest.");
  // Eye of Yawgmoth: "Reveal a number of cards from the top of your library equal to the sacrificed creature's power":
  // that many off the top, X defined by the text (CR 107.3c).
  text = text.replace(/(^|\. )Reveal a number of cards from the top of your library equal to ([^.]+)\./, "$1Reveal the top X cards of your library, where X is $2.");
  // Growth Cycle: "Target creature gets +3/+3 until end of turn. It gets an additional +2/+2 until end of turn for each card
  // named ~ in your graveyard": a second bonus, counted as it resolves (rulings: ~ is on the stack, not in the graveyard).
  text = text.replace(/(gets [+-]\d+\/[+-]\d+ until end of turn\. It) gets an additional ([+-]\d+\/[+-]\d+ until end of turn for each )/, "$1 gets $2");
  // Campsite Cuisine: "you may sacrifice X Foods. When you do, up to X target attacking creatures ...": X is how many you
  // sacrifice, so the same as Swashbuckler Extraordinaire's "one or more ... up to that many" (none sacrificed, no trigger).
  text = text.replace(/\b([Yy]ou may sacrifice) X ([A-Z][a-z]+s)\. When you do, up to X target /, "$1 one or more $2. When you do, up to that many target ");
  // Tasigur, the Golden Fang: "Mill two cards, then return a nonland card of an opponent's choice from your graveyard to
  // your hand": you choose an opponent as it resolves, and after the mill that player chooses any nonland card in your
  // graveyard, not a target (rulings).
  text = text.replace(/^Mill (a card|two cards|three cards), then return an? ([a-z]+ card) of an opponent's choice from your graveyard to your hand\.$/, "Mill $1. Choose an opponent. That player chooses a $2 in your graveyard. Return that card to your hand.");
  // Tevesh Szat: "If you do, draw two cards, then draw another card if the sacrificed permanent was a commander."
  text = text.replace(/(^|\. )(If you do, draw (?:a card|two cards)), then draw another card if the sacrificed permanent was a commander\./, "$1$2. If the sacrificed permanent was a commander, draw a card.");
  // Enchanted River's Grasp: "tap enchanted creature and remove all counters from it": two instructions about it.
  text = text.replace(/(^|\. )([Tt])ap enchanted creature and remove all counters from it\./, "$1$2ap enchanted creature. Remove all counters from enchanted creature.");
  // Mystic Reflection: "Choose target nonlegendary creature. The next time ..., they enter as copies of the chosen creature."
  text = text.replace(/(^|\. )Choose (target [^.]+?)\. (The next time one or more creatures or planeswalkers enter this turn, they enter as copies of) the chosen creature\./, "$1$3 $2.");
  // Nibelheim Aflame: "Choose target creature you control. It deals damage equal to its power to each other creature.": the
  // target deals it (rulings), the same as "Target creature you control deals ...".
  text = text.replace(/(^|\. )Choose (target creature(?: you control)?)\. It deals damage equal to its power to /, (_, a: string, who: string) => `${a}${capital(who)} deals damage equal to its power to `);
  // Moonlight Hunt: "Choose target creature you don't control. Each creature you control that's a Wolf or a Werewolf deals
  // damage equal to its power to that creature.": each of them to that target, all at once.
  text = text.replace(/^Choose (target creature you don't control)\. (Each creature you control that's an? [A-Z][a-z]+ or an? [A-Z][a-z]+) deals damage equal to its power to that creature\.$/, "$2 deals damage equal to its power to $1.");
  // Might of the Meek: "It also gets +1/+0 until end of turn if you control a Mouse": the condition read first, as it
  // resolves (CR 608.2c).
  text = text.replace(/(^|\. )(It|That creature) also gets ([^.]+?) until end of turn if (you control an? [A-Z][a-z]+)\./, (_, a: string, who: string, pt: string, cond: string) => `${a}If ${cond}, ${who.toLowerCase()} also gets ${pt} until end of turn.`);
  // Agrus Kos, Wojek Veteran: "attacking red creatures get +2/+0 and attacking white creatures get +0/+2 until end of turn":
  // two instructions with the same duration (a creature that's both gets both).
  text = text.replace(/^(attacking (?:white|blue|black|red|green) creatures) (get [+-]\d+\/[+-]\d+) and (attacking (?:white|blue|black|red|green) creatures) (get [+-]\d+\/[+-]\d+) until end of turn\.$/, (_, a: string, b: string, c: string, d: string) => `${capital(a)} ${b} until end of turn. ${capital(c)} ${d} until end of turn.`);
  // Drag the Canal: "If a creature died this turn, you gain 2 life, surveil 2, then investigate": the same three
  // instructions in order, all under the condition.
  text = text.replace(/(you gain \d+ life, surveil \d+), then (investigate)\./, "$1, and $2.");
  // Armageddon Clock: "~ deals damage equal to the number of doom counters on it to each player": "it" is ~.
  text = text.replace(/^(~ deals damage equal to the number of [a-z]+ counters on) it (to each player\.)$/, "$1 ~ $2");
  // Skull Rend: "~ deals 2 damage to each opponent. Those players each discard two cards at random.": every opponent.
  text = text.replace(/^(~ deals \d+ damage to each opponent\. )Those players each discard (a card|two cards|three cards) at random\.$/, "$1Each opponent discards $2 at random.");
  // Karma: "~ deals damage to that player equal to the number of Swamps they control": that player's (the trigger's).
  // Decimator Web: "Target opponent loses 2 life, gets a poison counter, then mills six cards": in that order.
  text = text.replace(/^Target opponent loses (\d+) life, gets a poison counter, then mills (\w+) cards\.$/, "Target opponent loses $1 life and gets a poison counter. That player mills $2 cards.");
  // Tangled Skyline: "you gain 5 life and incubate 5": one, then the other.
  text = text.replace(/\b([Yy]ou gain \d+ life) and (incubate \d+)\./g, (_, a: string, b: string) => `${a}. ${capital(b)}.`);
  // Plan the Heist: "Surveil 3 if you have no cards in hand. Then draw three cards.": the condition first, the same.
  text = text.replace(/^(Surveil \d+) if you have no cards in hand\. /, "If you have no cards in hand, $1. ");
  // Godsire: "Create an 8/8 Beast creature token that's red, green, and white": its colors before its types, the same.
  text = text.replace(/\b(Create an? \d+\/\d+) ([A-Z][a-z]+) creature token that's ((?:white|blue|black|red|green), (?:white|blue|black|red|green),? and (?:white|blue|black|red|green))\./g, "$1 $3 $2 creature token.");
  // Michelangelo, On the Scene: "When ~ dies, return ~ to your hand": a card goes only to its owner's hand (CR 400.3).
  text = text.replace(/^([Rr])eturn ~ to your hand\.$/, "$1eturn ~ to its owner's hand.");
  // Primal Order: "... the number of nonbasic lands they control", the same; Cold Snap's "snow lands they control".
  text = text.replace(/^(~ deals damage to that player equal to the number of (?:nonbasic |snow )?[A-Za-z]+) they control\.$/, "$1 that player controls.");
  // Strength of Night: "If ~ was kicked, Zombie creatures you control get an additional +2/+2 until end of turn": a
  // second pump on top of the first.
  text = text.replace(/(\. If ~ was kicked, [A-Z][a-z]+ creatures you control get) an additional ([+-]\d+\/[+-]\d+ until end of turn\.)$/, "$1 $2");
  // Persecute: "Choose a color. Target player reveals their hand and discards all cards of that color.": the chosen one.
  text = text.replace(/^(Choose a color\. (?:Target player|Target opponent) reveals their hand and discards all cards of) that color\.$/, "$1 the chosen color.");
  // Undergrowth: "Prevent all combat damage that would be dealt this turn. If this spell's additional cost was paid (read as
  // kicked), this effect doesn't affect combat damage that would be dealt by red creatures": all of it but red creatures'
  // then, which is all combat damage nonred creatures would deal (only creatures deal combat damage, CR 510.1).
  text = text.replace(/^(Prevent all combat damage that would be dealt this turn\. If ~ was kicked, )this effect doesn't affect combat damage that would be dealt by (white|blue|black|red|green) creatures\.$/, "$1prevent all combat damage that would be dealt this turn by non$2 creatures instead.");
  // Treva, the Renewer: "If you do, choose a color, then you gain 1 life for each permanent of that color": the chosen one.
  text = text.replace(/\b(choose a color, then you gain 1 life for each permanent of) that color\.$/, "$1 the chosen color.");
  // Traitor's Clutch: "Target creature gets +1/+0, becomes black, and gains shadow until end of turn.": all three to it,
  // until end of turn.
  text = text.replace(/^Target creature gets ([+-]\d+\/[+-]\d+), becomes (white|blue|black|red|green), and gains ([a-z]+) until end of turn\./, "Target creature gets $1 and gains $3 until end of turn. That creature becomes $2 until end of turn.");
  // Take to the Streets: "Creatures you control get +2/+2 until end of turn. Citizens you control get an additional +1/+1 and
  // gain vigilance until end of turn.": a second pump on top of the first for those.
  text = text.replace(/^(Creatures you control get [+-]\d+\/[+-]\d+ until end of turn\. [A-Z][a-z]+s you control get) an additional ([+-]\d+\/[+-]\d+ and gain [a-z]+ until end of turn\.)$/, "$1 $2");
  // Ageless Sentinels: "it becomes a Bird Giant, and it loses defender": one change to it, indefinitely (rulings).
  text = text.replace(/^(it|~) becomes an? ([A-Z][a-z]+(?: [A-Z][a-z]+)?), and it loses defender\.$/, "$1 becomes a $2 and loses defender.");
  // Sabertooth Alley Cat: "Creatures without defender can't block ~ this turn": the same as "~ can't be blocked by creatures
  // without defender this turn", the blockers' keywords as blocks are declared (CR 509.1b).
  text = text.replace(/(^|\. )Creatures (with(?:out)? [a-z]+) can't block ~ this turn\./, "$1~ can't be blocked by creatures $2 this turn.");
  // The Fall of Kroog: "~ deals 3 damage to that player and 1 damage to each creature they control": "they" being that player.
  text = text.replace(/(~ deals \d+ damage to that player and \d+ damage to each creature) they control\./, "$1 that player controls.");
  // Thoughtcutter Agent: "Target player loses 1 life and reveals their hand": two instructions, in order.
  text = text.replace(/^(Target (?:player|opponent) loses \d+ life) and reveals their hand\.$/, "$1. That player reveals their hand.");
  // Rookie Mistake: "Until end of turn, target creature gets +0/+2 and another target creature gets -2/-0": each until end
  // of turn, two different targets.
  text = text.replace(/^Until end of turn, target creature (gets [+-]\d+\/[+-]\d+) and another target creature (gets [+-]\d+\/[+-]\d+)\.$/, "Target creature $1 until end of turn. Another target creature $2 until end of turn.");
  // Stinging Vitriol: "That player reveals their hand. You choose a nonland card from it. They discard that card.": the
  // same as "... That player discards that card.", "they" being that player.
  text = text.replace(/(\. That player reveals their hand\. You choose an? (?:[a-z]+ )?card from it\.) They discard that card\.$/, "$1 That player discards that card.");
  // Ral's Staticaster: "~ gets +1/+0 for each card in your hand until end of turn": the usual order, counted as it
  // resolves (rulings).
  text = text.replace(/(^|\. )(~ gets [+-]\d+\/[+-]\d+) for each ([^.]+?) until end of turn\./, "$1$2 until end of turn for each $3.");
  // Frightful Delusion: "Counter target spell unless its controller pays {1}. That player discards a card.": that spell's
  // controller, whether they paid or not (rulings).
  text = text.replace(/^(Counter target spell unless its controller pays \{\d+\})\. That player discards a card\.$/, "$1. That spell's controller discards a card.");
  // Saprazzan Outrigger: "When ~ attacks or blocks, put it on top of its owner's library at end of combat": ~ itself.
  text = text.replace(/^put it on top of its owner's library at end of combat\.$/, "put ~ on top of its owner's library at end of combat.");
  // Burning Palm Efreet: "~ deals 2 damage to target creature with flying and that creature loses flying until end of
  // turn": two instructions, in order.
  text = text.replace(/^(~ deals \d+ damage to target creature with flying) and (that creature loses flying until end of turn)\.$/, (_, a: string, b: string) => `${a}. ${capital(b)}.`);
  // Word of Blasting: "Destroy target Wall. ... deals damage equal to that Wall's mana value to the Wall's controller": the
  // creature destroyed, as it last existed (CR 608.2h).
  text = text.replace(/(\. ~ deals damage equal to) that Wall's mana value to the Wall's controller\.$/, "$1 that creature's mana value to that creature's controller.");
  // Rakdos Ickspitter: "~ deals 1 damage to target creature and that creature's controller loses 1 life": two
  // instructions, in order; the controller as the creature is now or last existed (CR 608.2h).
  text = text.replace(/^(~ deals \d+ damage to target creature) and (that creature's controller loses \d+ life)\.$/, (_, a: string, b: string) => `${a}. ${capital(b)}.`);
  // Glistening Deluge: "Creatures that are green and/or white get an additional -2/-2 until end of turn": each one that's
  // green, white or both, after "All creatures get -1/-1 until end of turn".
  text = text.replace(/(^All creatures get -\d+\/-\d+ until end of turn\. )Creatures that are (white|blue|black|red|green) and\/or (white|blue|black|red|green) get an additional (-\d+\/-\d+) until end of turn\.$/, (_, a: string, c1: string, c2: string, pt: string) => `${a}${capital(c1)} or ${c2} creatures get ${pt} until end of turn.`);
  // Lightning Reaver: "~ deals damage equal to the number of charge counters on it to each opponent": X, counted once as
  // it resolves, to each of them.
  // Hallar, the Firefletcher: "put a +1/+1 counter on ~, then ~ deals damage equal to the number of +1/+1 counters on it to
  // each opponent": counted after the counter is put on it.
  text = text.replace(/^((?:[Pp]ut an? [+-]1\/[+-]1 counter on ~, then )?)~ deals damage equal to (the number of [a-z+/0-9-]+ counters on (?:it|~)) to each opponent\.$/, "$1~ deals X damage to each opponent, where X is $2.");
  // Lord of Tresserhorn: "you lose 2 life, you sacrifice two creatures, and target opponent draws two cards": three
  // instructions, in order (it may be one of the creatures sacrificed, rulings).
  text = text.replace(/^([Yy]ou lose \d+ life), you (sacrifice (?:two|three) creatures), and (target opponent draws (?:two|three) cards)\.$/, (_, a: string, b: string, c: string) => `${a}. ${capital(b)}. ${capital(c)}.`);
  // Dinrova Horror: "return target permanent to its owner's hand, then that player discards a card": its owner.
  // Recoil: "Return target permanent to its owner's hand. Then that player discards a card." The same.
  text = text.replace(/^([Rr]eturn target (?:nonland )?permanent to its owner's hand)(?:, then|\. Then) that player discards a card\.$/, "$1, then its owner discards a card.");
  // Compelling Deterrence: "... Then that player discards a card if you control a Zombie." Checked as it resolves.
  text = text.replace(/^([Rr]eturn target nonland permanent to its owner's hand)\. Then that player discards a card if (you control an? [A-Z][a-z]+)\.$/, "$1. If $2, its owner discards a card.");
  // Hold for Questioning: "tap enchanted permanent and investigate": two instructions.
  text = text.replace(/^([Tt]ap enchanted (?:permanent|creature)) and investigate\.$/, "$1. Investigate.");
  // Toolcraft Exemplar: "~ gets +2/+1 until end of turn. If you control three or more artifacts, it also gains first
  // strike until end of turn": ~ again, checked as it resolves.
  text = text.replace(/^(~ gets [+-]\d+\/[+-]\d+ until end of turn\. If you control [^,.]+, )it also (gains [a-z ]+ until end of turn\.)$/, "$1~ $2");
  // Painwracker Oni: "sacrifice a creature if you don't control an Ogre": checked as it resolves (CR 608.2c), the same as
  // "unless you control an Ogre".
  text = text.replace(/^([Ss]acrifice an? [a-z]+) if you don't control (an? [A-Z][a-z]+)\.$/, "$1 unless you control $2.");
  // Second Chance: "sacrifice ~ and take an extra turn after this one": two instructions.
  text = text.replace(/^([Ss]acrifice ~) and (take an extra turn after this one)\.$/, (_, a: string, b: string) => `${a}. ${capital(b)}.`);
  // Death Watch: "its controller loses life equal to its power and you gain life equal to its toughness": two instructions,
  // both about the creature that died.
  text = text.replace(/^(its controller loses life equal to its power) and (you gain life equal to its toughness)\.$/, (_, a: string, b: string) => `${capital(a)}. ${capital(b)}.`);
  // Lunar Force: "sacrifice ~ and counter that spell": two instructions; the spell is countered even if ~ is already gone
  // (rulings).
  text = text.replace(/^sacrifice ~ and counter that spell\.$/, "Sacrifice ~. Counter that spell.");
  // The Thanos-Copter: "Vehicles you control become artifact creatures until end of turn": each one (CR 301.7b), the ones
  // there as it resolves (CR 611.2c).
  // Start Your Engines: the same, then "Creatures you control get +2/+0 until end of turn", those Vehicles included (rulings).
  text = text.replace(/^Vehicles you control become artifact creatures until end of turn\.(?= |$)/, "Each Vehicle you control becomes an artifact creature until end of turn.");
  // Does Machines: "mill two cards, draw two cards, then discard two cards": one after another.
  text = text.replace(/^([Mm]ill (?:a card|\w+ cards)), (draw (?:a card|\w+ cards), then discard (?:a card|\w+ cards))\.$/, (_, a: string, b: string) => `${a}. ${capital(b)}.`);
  // Spoils of Victory: "Search your library for a ... card and put that card onto the battlefield. Then shuffle." is the
  // usual "..., put it onto the battlefield, then shuffle."
  text = text.replace(/^(Search your library for an? [^.]+? card) and put that card onto the battlefield\. Then shuffle\.$/, "$1, put it onto the battlefield, then shuffle.");
  // Teyo, Lightshield Expert: "Put a +1/+1 counter on it if it's a creature. Put a loyalty counter on it if it's a
  // planeswalker.": each checked as it resolves (CR 608.2c); both if it's both (rulings).
  text = text.replace(/(^|\. )Put (an? [+\-/0-9a-z]+ counter) on it if it's an? (creature|planeswalker)(?=\.)/g, "$1If it's a $3, put $2 on it");
  // HYDRA Troopers: "create a tapped 2/1 ... token with menace if there are two or more creature cards in your graveyard.
  // Otherwise, mill two cards.": checked as it resolves (CR 608.2c), not an intervening "if".
  text = text.replace(/^create ([^.]+?) if (there are [a-z]+ or more [a-z]+ cards in your graveyard)\. Otherwise,/, "If $2, create $1. Otherwise,");
  // Seer's Vision: "Look at target player's hand and choose a card from it. That player discards that card.": as "reveals
  // their hand. You choose ...", the hand seen only by you.
  text = text.replace(/(^|\. )(Look at target (?:player|opponent)'s hand) and choose (an? [a-z ]*?card) from it\. That player discards that card\./, "$1$2. You choose $3 from it. That player discards that card.");
  // Extortion, Mind Warp: "Look at target player's hand and choose up to two / X cards from it. That player discards those
  // cards."; Painful Memories: "... choose a card from it. Put that card on top of that player's library.": the same way.
  text = text.replace(/^(Look at target (?:player|opponent)'s hand) and choose ((?:up to )?(?:two|three|X) cards) from it(, where X is [^.]+)?\. That player discards those cards\.$/, "$1. You choose $2 from it$3. That player discards those cards.");
  text = text.replace(/^(Look at target (?:player|opponent)'s hand) and choose a card from it\. Put that card on top of that player's library\.$/, "$1. You choose a card from it. Put that card on top of that player's library.");
  // Winterthorn Blessing: "Tap up to one target creature you don't control, and that creature doesn't untap during its
  // controller's next untap step": two instructions about the same creature.
  text = text.replace(/(^|\. )(Tap up to one target creature you don't control), and that creature (doesn't untap during its controller's next untap step)\./, "$1$2. It $3.");
  // Mageta the Lion: "Destroy all creatures except for ~. Those creatures can't be regenerated.": every other creature.
  text = text.replace(/(^|\. )Destroy all creatures except for ~\. Those creatures can't be regenerated\./, "$1Destroy all other creatures. They can't be regenerated.");
  // Ultimate Nullification: "Exile all creatures and graveyards": the creatures, then the graveyards they didn't go to.
  text = text.replace(/^Exile all creatures and graveyards\./, "Exile all creatures. Exile all graveyards.");
  // Sphinx Sovereign: "you gain 3 life if ~ is untapped. Otherwise, each opponent loses 3 life.": checked as it resolves
  // (CR 608.2c), not an intervening "if".
  text = text.replace(/^(you gain \d+ life) if (~ is (?:un)?tapped)\. (Otherwise, [^.]+\.)$/, (_, a: string, cond: string, b: string) => `If ${cond}, ${a}. ${b}`);
  // Invasive Maneuvers: "It deals 5 damage instead if you control a Spacecraft": the condition read first, as it
  // resolves (CR 608.2c), the same as "If you control a Spacecraft, it deals 5 damage instead".
  text = text.replace(/(\. )It deals (\d+) damage instead if (you control an? [A-Z][a-z]+)\.$/, "$1If $3, it deals $2 damage instead.");
  // Cinder Strike: "It deals 4 damage to that creature instead if this spell's additional cost was paid" (read as kicked):
  // the same as "If ~ was kicked, it deals 4 damage instead".
  text = text.replace(/^(~ deals \d+ damage to target creature\. )It deals (\d+) damage to that creature instead if ~ was kicked\.$/, "$1If ~ was kicked, it deals $2 damage instead.");
  // Lithomantic Barrage: "It deals 5 damage instead if that target is white and/or blue": a permanent that's white, blue
  // or both, as it resolves (CR 608.2c), the same as Lightning Dart's "If that creature is white or blue".
  text = text.replace(/^(~ deals \d+ damage to target creature or planeswalker\. )It deals (\d+) damage instead if that target is (white|blue|black|red|green) and\/or (white|blue|black|red|green)\.$/, "$1If that permanent is $3 or $4, ~ deals $2 damage instead.");
  // Court of Vantress: "If you're the monarch, you may create a token that's a copy of it. If you're not the monarch, you
  // may have ~ become a copy of it": both "it"s are the chosen target, not the token (only one branch happens).
  text = text.replace(/(If you're the monarch, you may create a token that's a copy of it\. If you're not the monarch, you may have ~ become a copy of) it\b/, "$1 the chosen permanent");
  // Rite of the Raging Storm: "creates a 5/1 red Elemental creature token named Lightning Rager. It has trample, haste, and
  // "..."": what the token has, as one instruction.
  text = text.replace(/(creature token named [A-Z][\w'-]*(?: [A-Z][\w'-]*)*)\. It has ((?:[^."]|"[^"]*")+?)(\.|(?<="))(?=\s|$)/, "$1 with $2$3");
  // Orzhov Advokist: "If a player does" is about the "may" of the sentence before: one instruction.
  text = text.replace(/(each player may put (?:two|three) \S+ counters on a creature they control)\. If a player does, (creatures that player controls can't attack you or planeswalkers you control until your next turn)\./i, "$1; if a player does, $2.");
  // Stinging Study: "where X is the mana value of a commander you own on the battlefield or in the command zone": one of
  // them chosen as it resolves (rulings), the same one for both.
  text = text.replace(/(^|\. )You draw X cards and you lose X life, where X is the mana value of a commander you own on the battlefield or in the command zone\./, "$1Choose a commander you own on the battlefield or in the command zone. You draw X cards, where X is the chosen commander's mana value. You lose X life, where X is the chosen commander's mana value.");
  text = text.replace(/(^|\. )([Ee]ach opponent loses X life(?= and you)|You gain X life(?= and scry X,)) and (?:you )?(scry X|draw X cards), where X is ([^.]+)\./, (_, lead: string, a: string, b: string, x: string) => `${lead}${a}, where X is ${x}. ${b.charAt(0).toUpperCase()}${b.slice(1)}, where X is ${x}.`);
  // Cursed Recording: "Then if there are seven or more time counters on it, remove those counters and it deals 20 damage to
  // you": "it" is ~.
  text = text.replace(/(Then if there are [a-z]+ or more [a-z]+ counters on it, remove those counters and) it (deals \d+ damage to you\.)/, "$1 ~ $2");
  // In Oketra's Name: "Zombies you control get +2/+1 until end of turn. Other creatures you control get +1/+1 until end of
  // turn.": the other ones are those that aren't Zombies.
  text = text.replace(/^([A-Z][a-z]+)s you control (get [+-]\d+\/[+-]\d+ until end of turn\.) Other creatures you control (get [+-]\d+\/[+-]\d+ until end of turn\.)$/, (all, kind: string, a: string, b: string) => (CREATURE_TYPES.has(kind) ? `${kind}s you control ${a} Non-${kind} creatures you control ${b}` : all));
  // Join Forces: "Untap up to two target creatures. They each get +2/+2 until end of turn.": each of them, as "they get".
  // Fancy Footwork: "Untap one or two target creatures. They each get ...": the same.
  text = text.replace(/((?:^|\. )(?:Untap|Tap) (?:up to |one or )?(?:two|three) target creatures\.) They each get /, "$1 They get ");
  // Balance of Power: "If target opponent has more cards in hand than you, draw cards equal to the difference.": with
  // fewer or as many, the difference is nothing to draw (handMoreThanYou).
  text = text.replace(/^If target opponent has more cards in hand than you, draw cards equal to the difference\.$/, "Draw X cards, where X is the number of cards in target opponent's hand minus the number of cards in your hand.");
  // Suffocating Blast: "Counter target spell and ~ deals 3 damage to target creature.": two instructions, in order.
  text = text.replace(/^Counter target spell and (~ deals \d+ damage to target creature\.)$/, "Counter target spell. $1");
  // Unagi's Spray: "If you control a Fish, Octopus, Otter, Seal, Serpent, or Whale, draw a card": the list with "or"s, so
  // the condition ends at its comma.
  text = text.replace(/\bIf you control an? ((?:[A-Z][a-z]+, )+)or ([A-Z][a-z]+), /g, (_, list: string, last: string) => `If you control a ${[...list.split(", ").filter(Boolean), last].join(" or ")}, `);
  // Urge to Feed: "You may tap any number of untapped Vampire creatures you control. If you do, put a +1/+1 counter on each
  // of those Vampires." Tapping none is the "may" (CR 608.2d); the counters go on the ones tapped.
  text = text.replace(/(^|\. )You may tap any number of untapped ([A-Z][a-z]+ creatures) you control\. If you do, put an? (\+1\/\+1) counter on each of those ([A-Z][a-z]+s)\./, (all, lead: string, what: string, c: string, those: string) =>
    what.startsWith(those.replace(/s$/, " ")) ? `${lead}You may tap any number of untapped ${what} you control. Put a ${c} counter on each permanent tapped this way.` : all);
  // Turn the Earth: "Choose up to three target cards in graveyards. The owners of those cards shuffle them into their
  // libraries.": one instruction.
  text = text.replace(/(^|\. )Choose (up to (?:one|two|three|four|five)|any number of) target cards in graveyards\. The owners of those cards shuffle them into their libraries\./, "$1Shuffle $2 target cards from graveyards into their owners' libraries.");
  // Carnival of Souls: "you lose 1 life and add {B}": two instructions, in order.
  text = text.replace(/(^|\. )[Yy]ou lose (\d+) life and add ((?:\{[WUBRGC]\})+)\./, "$1You lose $2 life. Add $3.");
  // Gran Pulse Ochu: "Until end of turn, ~ gets +1/+1 for each permanent card in your graveyard": the usual order.
  text = text.replace(/(^|\. )Until end of turn, ~ gets ([+-]\d+\/[+-]\d+) for each ([^.]+)\./, "$1~ gets $2 until end of turn for each $3.");
  // Ent's Fury: "Then that creature gets +1/+1 until end of turn and fights target creature you don't control": two
  // instructions about the same creature, in order.
  text = text.replace(/(^|\. )(Then that creature|That creature) gets ([+-]\d+\/[+-]\d+) until end of turn and fights (target creature [^.]+)\./, "$1$2 gets $3 until end of turn. That creature fights $4.");
  // Drana, Kalastria Bloodchief: "Target creature gets -0/-X until end of turn and ~ gets +X/+0 until end of turn": two
  // instructions, in order.
  text = text.replace(/(^|: |\. )(Target creature gets [+-][\dX]+\/[+-][\dX]+ until end of turn) and (~ gets [+-][\dX]+\/[+-][\dX]+ until end of turn)\./, "$1$2. $3.");
  // Restorative Technique: "Target player gains 2 life, then searches their library for a basic land card, ...": two
  // instructions for that player, in order.
  text = text.replace(/(^|\. )Target player gains (\d+) life, then searches their library /, "$1Target player gains $2 life. That player searches their library ");
  // Sigil Blessing: "Until end of turn, target creature you control gets +3/+3 and other creatures you control get +1/+1."
  text = text.replace(/^Until end of turn, (target creature you control) (gets [+-]\d+\/[+-]\d+) and (other creatures you control) (get [+-]\d+\/[+-]\d+)\.$/, "Target creature you control $2 until end of turn. Other creatures you control $4 until end of turn.");
  // Zealous Persecution: "Until end of turn, creatures you control get +1/+1 and creatures your opponents control get
  // -1/-1." Skulduggery: "Until end of turn, target creature you control gets +1/+1 and target creature an opponent
  // controls gets -1/-1." Two instructions with the same duration, in order (CR 611.2c: each group is fixed as it resolves).
  text = text.replace(/^Until end of turn, (creatures you control|target creature you control) (get|gets) ([+-]\d+\/[+-]\d+) and (creatures your opponents control|target creature an opponent controls) (get|gets) ([+-]\d+\/[+-]\d+)\.$/, (all, a: string, v1: string, p1: string, b: string, v2: string, p2: string) =>
    (v1 === "get") === a.startsWith("creatures") && (v2 === "get") === b.startsWith("creatures") ? `${capital(a)} ${v1} ${p1} until end of turn. ${capital(b)} ${v2} ${p2} until end of turn.` : all);
  // Brass's Tunnel-Grinder: "Then if there are three or more bore counters on it, remove those counters and transform it."
  // Primal Amulet: "..., you may remove those counters and transform it."
  // Edgar Markov's Coffin: "create a 1/1 ... token with lifelink and put a bloodline counter on ~. Then if ..." too.
  text = text.replace(/(^|\. | and )([Pp]ut an? ([a-z]+) counter on ~\.) Then if (?:it has|there are) ([a-z]+) or more \3 counters on it, (you may )?remove (?:all of them|those counters)( and |(?=, transform ~, and ))/, (_, lead: string, put: string, kind: string, n: string, may: string | undefined, and: string) => `${lead}${put} If there are ${n} or more ${kind} counters on ~, ${may ?? ""}remove all ${kind} counters from ~${and}`);
  // Prize Pig: "put that many ribbon counters on ~. Then if there are three or more ribbon counters on ~, remove those
  // counters and untap it": all of them, whether or not it's tapped (rulings).
  text = text.replace(/^([Pp]ut (?:that many|X) ([a-z]+) counters on ~\.) Then if there are ([a-z]+) or more \2 counters on ~, remove those counters and untap it\.$/, "$1 If there are $3 or more $2 counters on ~, remove all $2 counters from ~ and untap ~.");
  // Sinner's Judgment: "put a judgment counter on this Aura. Then if there are three or more judgment counters on it,
  // enchanted player loses the game": "it" is ~.
  text = text.replace(/([Pp]ut an? ([a-z]+) counter on ~\.) Then if there are ([a-z]+) or more \2 counters on it, (?!remove )/, "$1 Then if there are $3 or more $2 counters on ~, ");
  // Firebender Ascension: "Put a quest counter on ~. Then if it has four or more quest counters on it, you may copy that
  // ability": the same check of ~'s counters as it resolves.
  text = text.replace(/^([Pp]ut an? ([a-z]+) counter on ~\.) Then if it has ([a-z]+) or more \2 counters on it, (you may copy that ability\.)/, "$1 If there are $3 or more $2 counters on ~, $4");
  text = text.replace(/((?:^|\. | and )[Pp]ut an? [a-z]+ counter on ~\. If there are [a-z]+ or more [a-z]+ counters on ~, (?:you may )?remove all [a-z]+ counters from ~ and transform) it\.$/, "$1 ~.");
  text = text.replace(/^Choose (up to one target [a-z]+), then (airbend|exile|destroy) all other ([a-z]+)\./, (_, t: string, verb: string, what: string) => `Choose ${t}. ${verb.charAt(0).toUpperCase()}${verb.slice(1)} all other ${what}.`);
  // "Transform ~, then untap it" (Westvale Abbey): the same permanent, now its back face (CR 712.18).
  text = text.replace(/^Transform ~, then untap it\.$/, "Transform ~, then untap ~.");
  text = text.replace(/Choose 1, 2, or 3 at random\. Its controller mills that many cards, then exiles cards from the top of their library until they exile a nonland card with a different name than that spell\. They may cast that card without paying its mana cost\. Then they put the exiled cards on the bottom of their library in a random order\./, `${TIBALT}.`);
  // Nissa's Pilgrimage: "..., reveal those cards, and put one onto the battlefield tapped and the rest into your hand. Then
  // shuffle." is Cultivate's search.
  text = text.replace(/^(Search your library for up to \w+ [^.]+? cards, reveal those cards), and (put one [^.]+? and the rest into your hand)\. Then shuffle\./, "$1, $2, then shuffle.");
  // Jarad's Orders: "Search your library for up to two creature cards and reveal them. Put one into your hand and the
  // other into your graveyard. Then shuffle." Viewpoint Synchronization: "... up to three basic land cards and reveal
  // them. Put two of them onto the battlefield tapped and the other into your hand, then shuffle." One search each.
  text = text.replace(/^(Search your library for up to (?:two|three) [^.]+? cards) and reveal them\. Put (one|two of them) ([^.]+? and the other [^.]+?)(?:\. Then shuffle|, then shuffle)\./, (_, a: string, b: string, c: string) => `${a}, reveal them, put ${b.toLowerCase()} ${c}, then shuffle.`);
  // Out of the Tombs: "put two eon counters on ~, then mill cards equal to the number of eon counters on it": ~ is the
  // only object named, so "it" is ~.
  text = text.replace(/^([Pp]ut [^.~]+ counters? on ~, then [^.~]+ counters on )it\./, "$1~.");
  // Wheel and Deal: "Any number of target opponents each discard their hands, then draw seven cards": each of them, as
  // one wheel (sentences/spells.ts).
  text = text.replace(/^(Any number of target opponents each) discard their hands, then draw (\w+ cards)\./, "$1 discards their hand, then draws $2.");
  // Forgotten Creation: "you may discard all the cards in your hand. If you do, draw that many cards": both or neither.
  text = text.replace(/^[Yy]ou may discard all the cards in your hand\. If you do, draw that many cards\.$/, "You may discard your hand, then draw that many cards.");
  text = text.replace(/If you haven't cast a spell this turn, you may cast that card\. If you do, you can't cast additional spells this turn\./, "If you haven't cast a spell this turn, you may cast that card, and if you do, you can't cast additional spells this turn.");
  text = text.replace(/ gains flashback until end of turn\. (?:The|Its) flashback cost is equal to (?:its|that card's) mana cost\./g, " gains flashback with its mana cost until end of turn.");
  // Search for Survivors: "An opponent chooses a card at random in your graveyard. If it's a creature card, put it onto the
  // battlefield. Otherwise, exile it." The choice is at random, so who makes it changes nothing: one instruction.
  // Flubs, the Fool: "draw a card if you have no cards in hand. Otherwise, discard a card." is "If you have no cards in
  // hand, draw a card. Otherwise, discard a card."
  // Momentous Fall: "You draw cards equal to the sacrificed creature's power, then you gain life equal to its toughness":
  // "its" is the sacrificed creature, as it last existed (CR 608.2h).
  text = text.replace(/(equal to the sacrificed (creature|artifact|permanent)'s (?:power|toughness|mana value), then [^.]*? equal to) its (power|toughness|mana value)\b/, "$1 the sacrificed $2's $3");
  // Dawn of a New Age: "Then if ~ has no hope counters on it, sacrifice it and you gain 4 life": ~, as it resolves.
  text = text.replace(/\b[Tt]hen if ~ has no ([a-z]+) counters on it, sacrifice it\b/, "If there are no $1 counters on ~, sacrifice ~");
  // Tourach's Gate: "Remove a time counter from ~. If there are no time counters on ~, sacrifice it": ~, checked after the
  // removal.
  text = text.replace(/^(remove an? ([a-z]+) counter from ~\. If there are no \2 counters on ~, sacrifice) it\.$/i, "$1 ~.");
  // Archfiend of the Dross: "Remove an oil counter from ~. Then if it has no oil counters on it, you lose the game": ~,
  // checked after the removal. Thing in the Ice: "..., transform it" too; Evolved Spinoderm: "..., sacrifice it".
  text = text.replace(/(\b[Rr]emove an? ([a-z]+) counter from ~\.) Then if it has no \2 counters on it, (you lose the game|transform it|sacrifice it)\./, (_, rm: string, kind: string, then: string) => `${rm} If there are no ${kind} counters on ~, ${then.replace(/ it$/, " ~")}.`);
  // Amalia Benavides Aguirre: "~ explores. Then destroy all other creatures if its power is exactly 20": ~ is the only
  // object named, checked once as the ability resolves, after the explore (rulings).
  text = text.replace(/^(~ explores\. Then [^.~]+ if )its (power|toughness)\b/, "$1~'s $2");
  // Level Up: "Then if it has power 10 or greater, draw a card": the same as "if its power is 10 or greater".
  text = text.replace(/\b([Ii]f) (it|~) has (power|toughness) (\w+) or (greater|less),/g, (_, i: string, w: string, st: string, n: string, c: string) => `${i} ${w === "~" ? "~'s" : "its"} ${st} is ${n} or ${c},`);
  // Cosmos Elixir: "draw a card if your life total is greater than your starting life total. Otherwise, you gain 2 life."
  text = text.replace(/(^|\. )[Dd]raw a card if (you have no cards in hand|your life total is greater than your starting life total|you control a creature with the greatest power among creatures on the battlefield)\. Otherwise,/, (_, lead: string, cond: string) => `${lead}If ${cond}, draw a card. Otherwise,`);
  // Benevolent Offering: "You gain 2 life for each creature you control and that player gains 2 life for each creature they
  // control." is two instructions, you first.
  text = text.replace(/\bYou gain (\d+) life for each creature you control and that player gains \1 life for each creature they control\./g, "You gain $1 life for each creature you control. That player gains $1 life for each creature they control.");
  // Intellectual Offering: "Untap all nonland permanents you control and all nonland permanents that player controls."
  // Untapping one group then the other can't be told from untapping both at once (nothing waits on the event between).
  text = text.replace(/\bUntap all nonland permanents you control and all nonland permanents that player controls\./g, "Untap all nonland permanents you control. Untap all nonland permanents that player controls.");
  // Taigam, Master Opportunist: "copy it, then exile the spell you cast with four time counters on it." is two
  // instructions, the copy first.
  text = text.replace(/^[Cc]opy it, then (exile the spell you cast with \w+ time counters? on it\.)/, (_, rest: string) => `Copy it. ${capital(rest)}`);
  // Vexing Radgull: "that player gets two rad counters if they don't have any rad counters. Otherwise, proliferate."
  text = text.replace(/(^|\. )[Tt]hat player gets (\w+) rad counters if they don't have any rad counters\. Otherwise,/, (_, lead: string, n: string) => `${lead}If that player has no rad counters, that player gets ${n} rad counters. Otherwise,`);
  text = text.replace(/An opponent chooses a card at random in your graveyard\. If it's a creature card, put it onto the battlefield\. Otherwise, exile it\./, "Put a card chosen at random from your graveyard onto the battlefield if it's a creature card, otherwise exile it.");
  // Tariel, Reckoner of Souls: "Choose a creature card at random from target opponent's graveyard. Put that card onto the
  // battlefield under your control." is one instruction about that card.
  text = text.replace(/^Choose a creature card at random from target opponent's graveyard\. Put that card onto the battlefield under your control\./, "Put a creature card chosen at random from target opponent's graveyard onto the battlefield under your control.");
  // Sword of the Meek: "return ~ from your graveyard to the battlefield, then attach it to that creature": one sentence
  // (sentences/zones.ts), not split at ", then".
  text = text.replace(/\b([Rr]eturn ~ from your graveyard to the battlefield), then (attach it to that creature)\./, "$1 and then $2.");
  // Dimir Keyrune: "~ becomes a 2/2 blue and black Horror artifact creature until end of turn and can't be blocked this
  // turn": two instructions about the same permanent.
  text = text.replace(/^(~ becomes an? [^.]+? until end of turn) and can't be blocked this turn\./, "$1. ~ can't be blocked this turn.");
  // Prying Questions: "Target opponent loses 3 life and puts a card from their hand on top of their library": two
  // instructions for that player.
  text = text.replace(/^(Target opponent|Target player) (loses \d+ life) and (puts a card from their hand on top of their library)\./, "$1 $2. That player $3.");
  // Drudge Sentinel: "Tap ~. It gains indestructible until end of turn.": "it" is ~, the one thing named.
  text = text.replace(/^(Tap|Untap) ~\. It (gains|gets) /, "$1 ~. ~ $2 ");
  // Takenuma Bleeder: "you lose 1 life if you don't control a Demon" is "unless you control a Demon".
  text = text.replace(/\b(you lose \d+ life) if you don't control (an? [A-Z][a-z]+)\./gi, "$1 unless you control $2.");
  // Ral, Leyline Prodigy: "Draw a card if you control a blue permanent other than ~": another blue permanent.
  text = text.replace(/\bif you control an? ((?:white|blue|black|red|green) (?:permanent|creature)) other than ~\./g, "if you control another $1.");
  // Ral, Monsoon Mage: "If you win the flip, you may exile ~. If you do, return ~ to the battlefield transformed under ~'s
  // owner's control": one choice, exiling it and returning it (a blink, CR 712.14a); if it's gone by then, nothing happens.
  // Pyre of Heroes: "Search your library for a creature card .... Put that card onto the battlefield, then shuffle." is
  // the one instruction "search ..., put that card onto the battlefield, then shuffle".
  text = text.replace(/\b(Search your library for an? [^.,]+? card [^.,]+)\. Put that card onto the battlefield, then shuffle\./g, "$1, put that card onto the battlefield, then shuffle.");
  // Kaya, Geist Hunter: "Exile all cards from all graveyards" is exiling all graveyards.
  text = text.replace(/\b([Ee])xile all cards from all graveyards\b/g, "$1xile all graveyards");
  // Geth, Lord of the Vault: "Put target ... card ... from an opponent's graveyard onto the battlefield ... Then that player
  // mills X cards": that player is the card's owner.
  text = text.replace(/^(Put target [^.]+ card[^.]* from an opponent's graveyard onto the battlefield[^.]*)\. Then that player mills/, "$1. Its owner mills");
  // Sorin of House Markov: "exile ~, then return ~ to the battlefield transformed under ~'s owner's control" ("him").
  // Nicol Bolas, the Ravager: "{4}{U}{B}{R}: Exile ~, then return ~ ...", the same at the start of an ability.
  text = text.replace(/\b([Ee])xile ~, then return ~ to the battlefield transformed under ~'s owner's control\b/g, "$1xile ~, then return it to the battlefield transformed under its owner's control");
  text = text.replace(/If you win the flip, you may exile ~\. If you do, return ~ to the battlefield transformed under (?:its|~'s) owner's control\./, "If you win the flip, you may exile ~, then return it to the battlefield transformed under its owner's control.");
  // Deadbridge Chant: "choose a card at random in your graveyard. If it's a creature card, put it onto the battlefield.
  // Otherwise, put it into your hand."
  text = text.replace(/(^|\. )[Cc]hoose a card at random in your graveyard\. If it's a creature card, put it onto the battlefield\. Otherwise, put it into your hand\./, "$1Put a card chosen at random from your graveyard onto the battlefield if it's a creature card, otherwise into your hand.");
  // Goblin Welder: the card is in the graveyard of the artifact's controller ("that player"); both targets must still be
  // legal as it resolves (rulings), and that player does both at once.
  if (text.trim() === "Choose target artifact a player controls and target artifact card in that player's graveyard. If both targets are still legal as this ability resolves, that player simultaneously sacrifices the artifact and returns the artifact card to the battlefield.")
    return {
      targets: [
        { kind: "object", types: ["Artifact"], text: "target artifact a player controls" },
        { kind: "card", types: ["Artifact"], text: "target artifact card in that player's graveyard", inGraveyardOfControllerOf: [0] },
      ],
      effects: [{ type: "weld", artifact: 0, card: 1 }],
      text,
    };
  // Gluntch, the Bestower: "Choose a player. They put two +1/+1 counters on a creature they control. Choose a second
  // player to draw a card. Then choose a third player to create two Treasure tokens." Three different players, you among
  // them or not, each chosen as it's reached (CR 608.2d, rulings); each instruction is one that player does.
  const gifts = /^[Cc]hoose a player\. They (put [^.]+ on a creature they control)\. Choose a second player to ([^.]+)\. Then choose a third player to ([^.]+)\.$/.exec(text.trim());
  if (gifts) {
    const out: Effect[] = [];
    const clauses = [gifts[1]!.replace(/they control$/, "you control"), gifts[2]!, gifts[3]!];
    for (const [i, x] of clauses.entries()) {
      const fx = attempt(ctx, () => parseOne(x.charAt(0).toUpperCase() + x.slice(1), ctx));
      const e = fx?.length === 1 ? fx[0]! : undefined;
      if (!e || !("who" in e) || (e.who as PlayerRef).ref !== "you" || ctx.targets.length) return null;
      const theirs = { ...e, who: { ref: "chosenPlayer", nth: i } } as Effect;
      if (JSON.stringify(theirs).includes('"ref":"you"')) return null;
      out.push({ type: "choosePlayer", prompt: `to ${i === 0 ? gifts[1]! : x}` }, theirs);
    }
    return { targets: [], effects: out, text };
  }
  // Aminatou's Augury (see Effect "exileCastEachType").
  const augury = /^Exile the top (\w+) cards of your library\. You may put a land card from among them onto the battlefield\. Until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost\.$/.exec(text.trim());
  if (augury && opts.spell && num(augury[1]!)) return { targets: [], effects: [{ type: "exileCastEachType", n: num(augury[1]!) }], text };
  // Sylvan Library: "You may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of
  // those cards, pay 4 life or put the card on top of your library." Drawing and choosing with nothing in between (rulings).
  const sylvan = /^[Yy]ou may draw (two|three) additional cards\. If you do, choose (two|three) cards in your hand drawn this turn\. For each of those cards, pay (\d+) life or put the card on top of your library\.$/.exec(text.trim());
  if (sylvan && sylvan[1] === sylvan[2])
    return { targets: [], effects: [{ type: "may", effects: [{ type: "draw", who: { ref: "you" }, n: num(sylvan[1]!) }, { type: "drawnPayOrTop", n: num(sylvan[2]!), life: Number(sylvan[3]) }], text: `draw ${sylvan[1]} additional cards` }], text };
  // Unlucky Cabbage Merchant: "you may search your library for a basic land card and put it onto the battlefield tapped. If
  // you search your library this way, put ~ on the bottom of its owner's library, then shuffle." In that order: the shuffle
  // comes after ~ goes to the bottom, and only if the library was searched (CR 701.23, 701.24).
  const cabbage = /^[Yy]ou may search your library for (a basic land card) and put it onto the battlefield tapped\. If you search your library this way, put ~ on the bottom of its owner's library, then shuffle\.$/.exec(text.trim());
  if (cabbage && !opts.spell) {
    const found = parseBodyText(`Search your library for ${cabbage[1]}, put it onto the battlefield tapped, then shuffle.`, opts);
    const search = found?.effects.length === 1 && found.effects[0]!.type === "search" ? found.effects[0] : undefined;
    if (!search) return null;
    return { targets: [], effects: [{ type: "may", effects: [{ ...search, noShuffle: true }, { type: "putInLibrary", what: { ref: "self" }, position: "bottom" }, { type: "shuffle", who: { ref: "you" } }], text: `search your library for ${cabbage[1]}` }], text };
  }
  // Beseech the Mirror: "Search your library for a card, exile it face down, then shuffle. If ~ was bargained, you may cast
  // the exiled card without paying its mana cost if that spell's mana value is 4 or less. Put the exiled card into your
  // hand if it wasn't cast this way." Cast as it resolves (CR 608.2g); found (Opposition Agent) or not, nothing else.
  const beseech = /^Search your library for a card, exile it face down, then shuffle\. If ~ was bargained, you may cast the exiled card without paying its mana cost if that spell's mana value is (\d+) or less\. Put the exiled card into your hand if it wasn't cast this way\.$/.exec(text.trim());
  if (beseech && opts.spell)
    return {
      targets: [],
      effects: [
        { type: "search", n: 1, upTo: false, dest: { zone: "exile", faceDown: true }, reveal: false },
        { type: "castFaceDownExiled", maxMv: Number(beseech[1]), ifBargained: true, elseHand: true },
      ],
      text,
    };
  // Praetor's Grasp: "Search target opponent's library for a card and exile it face down. Then that player shuffles. You
  // may play that card for as long as it remains exiled." Hoarding Broodlord, The Creation of Avacyn: "search your
  // library for a card, exile it face down, then shuffle(. For as long as that card remains exiled, you may play it)."
  // Only the player who searched may look at it (CR 406.3).
  const grasp = /^Search target opponent's library for a card and exile it face down\. Then that player shuffles\. You may play that card for as long as it remains exiled\.$/.test(text.trim());
  const hoard = /^Search your library for a card, exile it face down, then shuffle\.( For as long as that card remains exiled, you may play it\.)?$/i.exec(text.trim());
  if (grasp || hoard) {
    const play = grasp || hoard?.[1] ? { play: { until: "exiled" as const } } : {};
    return {
      targets: grasp ? [{ kind: "player", opponent: true, text: "target opponent" }] : [],
      effects: [{ type: "search", n: 1, upTo: false, dest: { zone: "exile", faceDown: true, ...play }, reveal: false, ...(grasp ? { library: { ref: "target", index: 0 } } : {}) }],
      text,
    };
  }
  // Reins of Power (see Effect "swapCreatures").
  if (opts.spell && /^Untap all creatures you control and all creatures target opponent controls\. You and that opponent each gain control of all creatures the other controls until end of turn\. Those creatures gain haste until end of turn\.$/.test(text.trim()))
    return { targets: [{ kind: "player", opponent: true, text: "target opponent" }], effects: [{ type: "swapCreatures", who: { ref: "target", index: 0 } }], text };
  // Ugin, Eye of the Storms: "Search your library for any number of colorless nonland cards, exile them, then shuffle.
  // Until end of turn, you may cast those cards without paying their mana costs." With the normal timing (rulings).
  const ugin = /^Search your library for any number of (.+? cards), exile them, then shuffle\. Until end of turn, you may cast those cards without paying their mana costs\.$/.exec(text.trim());
  const uginFilter = ugin ? parseSearchFilter(ugin[1]!) : undefined;
  if (ugin && uginFilter)
    return { targets: [], effects: [{ type: "search", filter: uginFilter, n: 99, upTo: true, dest: { zone: "exile", play: { until: "thisTurn", free: true, castOnly: true } }, reveal: false }], text };
  // Shatterskull Smashing: "If X is 6 or more, ~ deals twice X damage divided as you choose among them instead": twice X
  // is what's divided, as it's cast (rulings: "you divide twice X damage; you don't assign X damage and then double it").
  const twiceX = /^(~ deals X damage divided as you choose among [^.]+)\. If X is (\d+) or more, ~ deals twice X damage divided as you choose among them instead\.$/.exec(text.trim());
  if (twiceX && opts.spell) {
    const body = parseBody(`${twiceX[1]!}.`, opts);
    const fx = body?.effects[0];
    if (!body || body.effects.length !== 1 || fx?.type !== "damage" || !fx.divided || !body.targets.every((t) => t.divided?.amount)) return null;
    const amount: AmountExpr = { ...(fx.amount as AmountExpr), twiceIfX: Number(twiceX[2]) };
    return { ...body, targets: body.targets.map((t) => ({ ...t, divided: { ...t.divided!, amount } })), effects: [{ ...fx, amount }], text };
  }
  // Comet Storm: "Choose any target, then choose another target for each time ~ was kicked. ~ deals X damage to each of
  // them." One target more than the times it was kicked, all different (rulings; CR 601.2c, 702.33d).
  const comet = /^Choose any target, then choose another target for each time ~ was kicked\. ~ deals (X|\d+) damage to each of them\.$/.exec(text.trim());
  if (comet && opts.spell)
    return {
      targets: [
        { kind: "any", text: "any target" },
        { kind: "any", text: "another target", many: "kicked", distinctFrom: [0] },
      ],
      effects: [{ type: "damage", amount: amt(comet[1]!), to: { ref: "anyTarget", index: 0, n: 2 } }],
      text,
    };
  // Odric, Lunarch Marshal: each keyword creatures you control share, as it resolves (Modification sharedAmongYours).
  const odric = /^[Cc]reatures you control gain ([a-z ]+) until end of turn if a creature you control has \1\. The same is true for ([a-z ,]+), and ([a-z ]+)\.$/.exec(text.trim());
  if (odric && !opts.spell) {
    const keywords = [odric[1]!, ...odric[2]!.split(", "), odric[3]!].map((k) => canonicalKeyword(k));
    if (keywords.some((k) => !k || /^(Protection|Hexproof from|Toxic)/.test(k) || k.includes("("))) return null;
    const yours: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creatures you control" };
    return { targets: [], effects: [{ type: "continuous", what: { ref: "each", filter: yours }, mods: [{ kind: "addKeywords", keywords: keywords as string[], sharedAmongYours: true }], duration: "endOfTurn" }], text };
  }
  // Scroll Rack: cards from the hand traded for as many from the top of the library (not a draw, rulings).
  if (text === "Exile any number of cards from your hand face down. Put that many cards from the top of your library into your hand. Then look at the exiled cards and put them on top of your library in any order.")
    return { targets: [], effects: [{ type: "scrollRack" }], text };
  // Wheel of Misfortune, Menacing Ogre: numbers chosen secretly, revealed at once (Effect secretNumbers).
  if (/^Each player secretly chooses a number 0 or greater, then all players reveal those numbers simultaneously and determine the highest and lowest numbers revealed this way\. ~ deals damage equal to the highest number to each player who chose that number\. Each player who didn't choose the lowest number discards their hand, then draws seven cards\.$/.test(text.trim()))
    return { targets: [], effects: [{ type: "secretNumbers", then: "wheel" }], text };
  if (/^[Ee]ach player secretly chooses a number\. Then those numbers are revealed\. Each player with the highest number loses that much life\. If you are one of those players, put two \+1\/\+1 counters on ~\.$/.test(text.trim()))
    return { targets: [], effects: [{ type: "secretNumbers", then: "ogre" }], text };
  if (/^Exile the top card of your library\. You may put that card into your hand unless it has the same name as another card exiled this way\. Repeat this process until you put a card into your hand or you exile two cards with the same name, whichever comes first\.$/.test(text.trim()))
    return { targets: [], effects: [{ type: "taintedPact" }], text };
  // Tempt with Discovery: a tempting offer whose searches each end with their own shuffle here. A library is shuffled
  // after each search instead of once at the end; nothing between them depends on its order (the next search sees the
  // whole library anyway), so it comes to the same.
  if (/^Search your library for a land card and put it onto the battlefield\. Each opponent may search their library for a land card and put it onto the battlefield\. For each opponent who searches a library this way, search your library for a land card and put it onto the battlefield\. Then each player who searched a library this way shuffles\.$/.test(text.trim())) {
    const land = (): Effect => ({ type: "search", filter: { kind: "card", types: ["Land"], notTypes: [], notColors: [], text: "land card" }, n: 1, upTo: false, reveal: false, dest: { zone: "battlefield" } });
    return { targets: [], effects: [land(), { type: "eachMay", who: { ref: "eachOpponent" }, effects: [land()], text: "search your library for a land card and put it onto the battlefield", each: true, perAccepted: { effects: [land()], opponents: true } }], text };
  }
  // Approach of the Second Sun (rulings): the other one only needs to have been cast, from anywhere, and a copy isn't cast.
  const approach = /^If ~ was cast from your hand and you've cast another spell named ~ this game, you win the game\. Otherwise, put ~ into its owner's library seventh from the top and you gain (\d+) life\.$/.exec(text.trim());
  if (approach && opts.spell)
    return {
      targets: [],
      effects: [{ type: "if", cond: { kind: "castFromHandAndAnotherNamed" }, effects: [{ type: "winGame", who: { ref: "you" } }], otherwise: [{ type: "shuffleSpell", nth: 7 }, { type: "gainLife", who: { ref: "you" }, n: Number(approach[1]) }] }],
      text,
    };
  // Expressive Iteration: "Look at the top three cards of your library. Put one of them into your hand, put one of them on
  // the bottom of your library, and exile one of them. You may play the exiled card this turn." In that order, with
  // fewer cards too: two go to your hand and the bottom, one only to your hand (rulings). The other two stay on top
  // until the second pick, which puts one on the bottom and exiles the other if there are two.
  const iteration = /^Look at the top three cards of your library\. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them\. You may play the exiled card this turn\.$/.exec(text.trim());
  if (iteration)
    return {
      targets: [],
      effects: [
        { type: "dig", n: 3, count: 1, upTo: false, into: "hand", rest: "keep", reveal: false },
        { type: "dig", n: 2, count: 1, upTo: false, into: "exile", play: "thisTurn", rest: "bottom", minRest: 1, reveal: false },
      ],
      text,
    };
  // Brood Birthing: "If you control an Eldrazi Spawn, create three 0/1 colorless Eldrazi Spawn creature tokens. They have
  // "Sacrifice ~: Add {C}." Otherwise, create one of those tokens.": how many, by what you control as it resolves.
  const brood = /^If (you control an? [^,]+), create (two|three|four) ([^.]+ tokens)\. (They have "[^"]+") Otherwise, create one of those tokens\.$/.exec(text.trim());
  if (brood) {
    const cond = parseStaticCondition(brood[1]!, { affects: { kind: "self" }, mods: [], text: "" });
    const made = parseBody(`Create ${brood[2]} ${brood[3]}. ${brood[4]}`, opts);
    const tok = made?.effects.length === 1 && !made.targets.length ? made.effects[0] : undefined;
    if (!cond || tok?.type !== "createToken" || typeof tok.n !== "number") return null;
    return { targets: [], effects: [{ type: "if", cond: { kind: "state", cond }, effects: [tok], otherwise: [{ ...tok, n: 1 }] }], text };
  }
  // Moment of Truth: "Look at the top three cards of your library. Put one of those cards into your hand, one into your
  // graveyard, and one on the bottom of your library." In that order, with fewer cards too (rulings): the other two stay
  // on top for the second pick.
  if (/^Look at the top three cards of your library\. Put one of those cards into your hand, one into your graveyard, and one on the bottom of your library\.$/.test(text.trim()))
    return {
      targets: [],
      effects: [
        { type: "dig", n: 3, count: 1, upTo: false, into: "hand", rest: "keep", reveal: false },
        { type: "dig", n: 2, count: 1, upTo: false, into: "graveyard", rest: "bottom", reveal: false },
      ],
      text,
    };
  // Incremental Blight: "Put a -1/-1 counter on target creature, two -1/-1 counters on another target creature, and three
  // -1/-1 counters on a third target creature." Three different target creatures (CR 115.3), each getting its own number.
  // Incremental Growth: the same with +1/+1 counters.
  const incremental = /^Put an? ([+-]1\/[+-]1) counter on target creature, two \1 counters on another target creature, and three \1 counters on a third target creature\.$/.exec(text.trim());
  if (incremental && (incremental[1] === "-1/-1" || incremental[1] === "+1/+1")) {
    const counter = incremental[1];
    const creature = (i: number): TargetSpec => ({ kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "target creature", ...(i ? { distinctFrom: [...Array(i).keys()] } : {}) });
    return {
      targets: [creature(0), creature(1), creature(2)],
      effects: [1, 2, 3].map((n, i) => ({ type: "counters" as const, what: { ref: "target" as const, index: i }, counter, n })),
      text,
    };
  }
  // Cone of Flame: "~ deals 1 damage to any target, 2 damage to another target, and 3 damage to a third target.": three
  // different targets (CR 115.3), each dealt its own amount, as "~ deals 1 damage to any target and 2 damage to another
  // target" is.
  const cone = /^~ deals (\d+) damage to any target, (\d+) damage to another target, and (\d+) damage to a third target\.$/.exec(text.trim());
  if (cone) {
    const any = (i: number): TargetSpec => ({ kind: "any", text: i ? "any other target" : "any target", ...(i ? { distinctFrom: [...Array(i).keys()] } : {}) });
    return {
      targets: [any(0), any(1), any(2)],
      effects: [cone[1]!, cone[2]!, cone[3]!].map((n, i) => ({ type: "damage" as const, amount: Number(n), to: { ref: "anyTarget" as const, index: i } })),
      text,
    };
  }
  // Telling Time: "Look at the top three cards of your library. Put one of those cards into your hand, one on top of your
  // library, and one on the bottom of your library." In that order, with fewer cards too (rulings): the other two stay
  // on top for the second pick, which leaves one on top and puts the other on the bottom.
  if (/^Look at the top three cards of your library\. Put one of (?:those cards|them) into your hand, one on top of your library, and one on the bottom of your library\.$/.test(text.trim()))
    return {
      targets: [],
      effects: [
        { type: "dig", n: 3, count: 1, upTo: false, into: "hand", rest: "keep", reveal: false },
        { type: "dig", n: 2, count: 1, upTo: false, into: "libraryTop", rest: "bottom", reveal: false },
      ],
      text,
    };
  // Planar Genesis: "Look at the top four cards of your library. You may put a land card from among them onto the
  // battlefield tapped. If you don't, put a card from among them into your hand. Put the rest on the bottom of your library
  // in a random order." The land, or else any one of the four into your hand; the rest to the bottom.
  const genesis = /^Look at the top (two|three|four|five) cards of your library\. You may put an? ([a-z]+) card from among them onto the battlefield tapped\. If you don't, put a card from among them into your hand\. Put the rest on the bottom of your library in a random order\.$/.exec(text.trim());
  const genesisFilter = genesis && parseSearchFilter(`${genesis[2]} card`);
  if (genesis && genesisFilter) {
    const n = num(genesis[1]!);
    return {
      targets: [],
      effects: [
        { type: "dig", n, count: 1, upTo: true, filter: genesisFilter, into: "battlefield", tapped: true, rest: "keep", reveal: false },
        {
          type: "if",
          cond: { kind: "digTook" },
          effects: [{ type: "dig", n: n - 1, count: 0, upTo: true, into: "hand", rest: "bottom", random: true, reveal: false }],
          otherwise: [{ type: "dig", n, count: 1, upTo: false, required: true, into: "hand", rest: "bottom", random: true, reveal: false }],
        },
      ],
      text,
    };
  }
  // Commodore Guff: "You draw X cards and ~ deals X damage to each opponent, where X is the number of planeswalkers you
  // control": one X for both instructions.
  text = text.replace(/(^|\. )You draw X cards and ~ deals X damage to each opponent, where X is ([^.]+)\./, "$1You draw X cards, where X is $2. ~ deals X damage to each opponent, where X is $2.");
  // Balin, Loremaster: "Draw X cards, where X is the number of cards discarded this way. If you have an enduring story, ~
  // deals X damage to each opponent.": the same X.
  text = text.replace(/(^|\. )(Draw X cards), where X is ([^.]+)\. (If [^,.]+, ~ deals X damage to each opponent)\./, "$1$2, where X is $3. $4, where X is $3.");
  // Descent into Avernus: "Then each player creates X Treasure tokens and ~ deals X damage to each player, where X is the
  // number of descent counters on ~": the same X for both, which nothing in between changes.
  text = text.replace(/(^|\. )Then each player creates X ([^.]+?) tokens and ~ deals X damage to each player, where X is ([^.]+)\./, "$1Then each player creates X $2 tokens, where X is $3. ~ deals X damage to each player, where X is $3.");
  // Demonic Counsel: "search your library for any card, put it into your hand": one card, like "a card".
  text = text.replace(/\b([Ss])earch your library for any card, /g, "$1earch your library for a card, ");
  // Gamble: "Search your library for a card, put that card into your hand, discard a card at random, then shuffle." The
  // discard comes before the shuffle, but the discarded card goes to the graveyard, so the order changes nothing that can
  // be seen: the search, then the discard (at random from the whole hand, the found card included).
  text = text.replace(/^Search your library for a card, put that card into your hand, discard a card at random, then shuffle\.$/, "Search your library for a card, put that card into your hand, then shuffle. Discard a card at random.");
  // "Put a +1/+1 counter on each creature you control and a loyalty counter on each other planeswalker you control"
  // (Ajani Steadfast), "put a +1/+1 counter on each creature you control and a loyalty counter on each planeswalker you
  // control" (Brokers Ascendancy, in a trigger): two kinds of counters on two groups, one after the other. Ich-Tekik,
  // Salvage Splicer: "put a +1/+1 counter on ~ and a +1/+1 counter on each Golem you control", Captain America, Team
  // Leader: "Put a +1/+1 counter on that Hero and a +1/+1 counter on ~", the same.
  text = text.replace(/(^|\. )[Pp]ut (an?|one|two|three|five) ([^.]*?counters?) on (~|each [^.]+?|that [A-Z][a-z]+) and (an?|one|two|three|five) ([^.]*?counters?) on (each [^.]+?|~)\./g, "$1Put $2 $3 on $4. Put $5 $6 on $7.");
  // "Search your library for up to four cards with different names and reveal them. Target opponent chooses two of those
  // cards. Put the chosen cards into your graveyard and the rest into your hand. Then shuffle." (Gifts Ungiven), and
  // "Reveal the top three cards of your library. An opponent chooses one of them. Put that card into your graveyard and
  // the rest into your hand." (Murmurs from Beyond): one instruction each, the opponent choosing among the revealed cards.
  // Karn, Scion of Urza: "Put that card into your hand and exile the other with a silver counter on it" too.
  text = text.replace(
    /\bSearch your library for ([^.]+?) and reveal them\. (Target opponent|An opponent) chooses (one|two)(?: of (?:them|those cards))?\. Put (?:that card|the chosen cards?) (into your hand|into your graveyard) and the rest (into your hand|into your graveyard|onto the battlefield tapped)(?:\. Then shuffle|, then shuffle)\./g,
    (_, what, who, n, to, rest) => `Search your library for ${what}; ${who.toLowerCase()} chooses ${n}; put them ${to} and the rest ${rest}.`,
  );
  text = text.replace(
    /\bReveal the top (\w+) cards of your library\. (Target opponent|An opponent) chooses (one of (?:them|those cards)|an? [a-z]+ card from among them)\. Put that card (into your hand|into your graveyard|onto the battlefield)(?: and the rest (into your hand|into your graveyard)| and (exile the other with an? [a-z]+ counter on it))?(\.|, then )/g,
    (_, n, who, which, to, rest, exile, end) => `Reveal the top ${n} cards of your library; ${who.toLowerCase()} chooses ${which.replace(/ of (?:them|those cards)$/, "")}; put it ${to}${rest ? ` and the rest ${rest}` : exile ? ` and ${exile}` : ""}.${end === "." ? "" : " Then "}`,
  );
  // "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your
  // hand and the other into your graveyard." (Fact or Fiction), "Reveal the top five cards of your library and separate
  // them into two piles. An opponent chooses one of those piles. Put that pile into your hand and the other into your
  // graveyard." (Steam Augury): one instruction each (CR 700.3).
  text = text.replace(
    /\b([Rr])eveal the top (\w+(?: plus one)?) cards of your library(, where X is [^.;]+)?\. An opponent separates (?:those cards|them) into two piles\. Put one pile into your hand and the other (into your graveyard|on the bottom of your library in any order)\./g,
    (_, r, n, where, rest) => `${r}eveal the top ${n} cards of your library; an opponent separates them into two piles; put one pile into your hand and the other ${rest}${where ?? ""}.`,
  );
  text = text.replace(
    /\b([Rr])eveal the top (\w+(?: plus one)?) cards of your library and separate them into two piles\. An opponent chooses one of those piles\. Put that pile into your hand and the other into your graveyard\./g,
    (_, r, n) => `${r}eveal the top ${n} cards of your library; you separate them into two piles and an opponent chooses one; put one pile into your hand and the other into your graveyard.`,
  );
  // Selvala, Explorer Returned (parley): "For each nonland card revealed this way, add {G} and you gain 1 life." is two
  // instructions, each counting those cards (see parleyReveal).
  text = text.replace(/\bFor each ((?:non)?land card revealed this way), add (\{[WUBRGC]\}) and you gain (\d+) life\./g, "Add $2 for each $1. You gain $3 life for each $1.");
  // Volatile Rig: "When ~ dies, flip a coin. If you lose the flip, it deals 4 damage to each creature and each player": it
  // is ~, as it last existed (CR 608.2h).
  text = text.replace(/^([Ff]lip a coin\. If you lose the flip, )it (deals \d+ damage to each creature and each player\.)$/, "$1~ $2");
  // Favored Hoplite: "put a +1/+1 counter on ~ and prevent all damage that would be dealt to it this turn": two instructions.
  text = text.replace(/\b([Pp]ut an? \+1\/\+1 counter on ~) and prevent all damage that would be dealt to it this turn\./, "$1. Prevent all damage that would be dealt to ~ this turn.");
  // Gomazoa: putting cards on top of libraries that are then shuffled is shuffling them in (see zones.ts).
  text = text.replace(/^Put ~ and each creature it's blocking on top of their owners' libraries, then those players shuffle\.$/, "Shuffle ~ and each creature it's blocking into their owners' libraries.");
  // Spoils of Evil: "For each artifact or creature card in target opponent's graveyard, add {C} and you gain 1 life.": the
  // same two instructions, both counting that player's graveyard.
  text = text.replace(/^For each (artifact or creature card) in target opponent's graveyard, add (\{[WUBRGC]\}) and you gain (\d+) life\.$/, "Add $2 for each $1 in target opponent's graveyard. You gain $3 life for each $1 in that player's graveyard.");
  // "You may copy the exiled card. If you do, you may cast the copy without paying its mana cost." (Isochron Scepter):
  // copying without casting does nothing, so it's one choice.
  text = text.replace(/\b[Yy]ou may copy the exiled card\. If you do, you may cast the copy without paying its mana cost\./g, "You may cast a copy of the exiled card without paying its mana cost.");
  // "Search your library for a creature card with mana value X or less, where X is 2 plus the sacrificed creature's mana
  // value. Put that card onto the battlefield, then shuffle." (Eldritch Evolution): one instruction, its X defined after it.
  text = text.replace(
    /\bSearch your library for (an? [^.,]+? with mana value X or less), where X is ([^.]+)\. Put that card (onto the battlefield|into your hand), then shuffle\./g,
    (_, what, x, to) => `Search your library for ${what}, put it ${to}, then shuffle, where X is ${x}.`,
  );
  // "Search your library, graveyard, and/or outside the game for an instant or sorcery card you own" (Invasion of
  // Arcavios): players here have no sideboard (CR 100.4: one is optional) and nothing else outside the game (as for
  // learn), so it's the library and/or the graveyard, where every card is one you own.
  text = text.replace(/\b([Ss])earch your library, graveyard, and\/or outside the game for (an? [a-z ]+? card) you own, /, "$1earch your library and/or graveyard for $2, ");
  // Karn, the Great Creator: "You may reveal an artifact card you own from outside the game or choose a face-up artifact
  // card you own in exile. Put that card into your hand." Likewise only the exiled card (see zones.ts).
  text = text.replace(/\b[Yy]ou may reveal an? ([A-Za-z ]+? card) you own from outside the game or choose a face-up \1 you own in exile\. Put that card into your hand\./g, "You may put a face-up $1 you own in exile into your hand.");
  // "Look at that many cards from the top of your library" (Doomskar Warrior), with "that many" made X by the trigger:
  // the same as "the top X cards".
  text = text.replace(/\b([Ll]ook at|[Rr]eveal) X cards from the top of your library\b/g, "$1 the top X cards of your library");
  // Jeska, Thrice Reborn: "Choose target creature. Until your next turn, if that creature would deal combat damage to one
  // of your opponents, it deals triple that damage to that player instead": that target's combat damage to each of them
  // (see parseDamageModSentence).
  text = text.replace(/^Choose target creature\. Until your next turn, if that creature would deal combat damage to one of your opponents, it deals (double|triple) that damage to that player instead\.$/, "Until your next turn, each time target creature would deal combat damage to an opponent, it deals $1 that damage instead.");
  // Riddle of Lightning: "Choose any target. Scry 3, then reveal the top card of your library. ~ deals damage equal to that
  // card's mana value to that permanent or player." Judge Unworthy: "Choose target attacking or blocking creature. ...
  // to that creature." The target is chosen as the spell is cast (CR 601.2c); if it's illegal as the spell resolves,
  // nothing happens, no scry or reveal either (rulings).
  // Barrowin of Clan Undurr: "return up to one creature card ... to the battlefield if you've completed a dungeon": not an
  // intervening "if" (CR 603.4), checked as it resolves.
  text = text.replace(/^[Rr](eturn up to one creature card [^.]+ from your graveyard to the battlefield) if you've completed a dungeon\.$/, "If you've completed a dungeon, r$1.");
  // Regal Sliver: "Slivers you control get +1/+1 until end of turn if you're the monarch. Otherwise, you become the
  // monarch.": whether you're the monarch as it resolves.
  text = text.replace(/^([A-Z])([^."]*) if you're the monarch\. Otherwise, /, (_, c: string, rest: string) => `If you're the monarch, ${c.toLowerCase()}${rest}. Otherwise, `);
  // Bebop, Skull & Crossbones: "you may draw X cards, where X is the number of counters on ~. If you do, you lose X life.":
  // the same X in both sentences, counted as it resolves (CR 107.3c).
  text = text.replace(/^([Yy]ou may draw X cards), where X is (the number of counters on ~)\. If you do, you lose X life\.$/, "$1, where X is $2. If you do, you lose life equal to $2.");
  text = text.replace(/^Choose (any target|target [a-z ]+creature)\. (Scry \d+, then reveal the top card of your library\. ~ deals damage equal to that card's mana value to) (?:that permanent or player|that creature)\.$/, "$2 $1.");
  // Blast of Genius: "Choose any target. Draw three cards, then discard a card. ~ deals damage equal to the discarded card's
  // mana value to that permanent or player." The same: the target is chosen as it's cast, and with it illegal as the spell
  // resolves, nothing is drawn or discarded (rulings, CR 608.2b).
  text = text.replace(/^Choose any target\. (Draw (?:a card|two cards|three cards), then discard a card\. ~ deals damage equal to the discarded card's mana value to) that permanent or player\.$/, "$1 any target.");
  // Erratic Explosion: "Choose any target. Reveal cards ... until you reveal a nonland card. ~ deals damage equal to that
  // card's mana value to that permanent or player." Erratic Mutation: "Choose target creature. ... That creature gets
  // +X/-X ...". The target is chosen as it's cast (CR 601.2c); illegal as it resolves, nothing is revealed (rulings).
  text = text.replace(/^Choose any target\. (Reveal cards from the top of your library until you reveal a nonland card\. ~ deals damage equal to that card's mana value to) that permanent or player\./, "$1 any target.");
  text = text.replace(/^Choose target creature\. (Reveal cards from the top of your library until you reveal a nonland card\.) That creature (gets [^.]+, where X is that card's mana value\.)/, "$1 Target creature $2");
  // Incite: "Target creature becomes red until end of turn and attacks this turn if able": two changes to that target.
  text = text.replace(/^(Target creature) becomes (white|blue|black|red|green) until end of turn and attacks this turn if able\.$/, "$1 becomes $2 until end of turn. It attacks this turn if able.");
  // V.A.T.S.: "Choose any number of target creatures with equal toughness. Destroy the chosen creatures." The targets.
  text = text.replace(/^Choose (any number of target creatures with equal toughness)\. Destroy the chosen creatures\.$/, "Destroy $1.");
  // Angelic Skirmisher: "Choose first strike, vigilance, or lifelink. Creatures you control gain that ability until end of
  // turn." The keyword is chosen as it resolves (CR 608.2d), and only creatures you control then gain it (CR 611.2c).
  text = text.replace(/(^|, )[Cc]hoose ((?:[a-z ]+, )+or [a-z ]+)\. (Creatures you control) gain that ability until end of turn\.$/, (_, pre: string, opts: string, who: string) => `${pre}${pre ? who.toLowerCase() : who} gain your choice of ${opts} until end of turn.`);
  // "Create a token that's a copy of a permanent you control" (Awaken the Maelstrom): not targeted, so chosen as it
  // resolves (CR 608.2d, rulings), the same as "Choose a permanent you control. Create a token that's a copy of it."
  text = text.replace(/(^|\. )[Cc]reate a token that's a copy of an? (permanent|creature|artifact|non-Saga token) you control\./g, "$1Choose a $2 you control. Create a token that's a copy of it.");
  // "Whenever you cast a noncreature spell this turn, ..." (Summon: Good King Mog XII): a delayed triggered ability for
  // the rest of the turn (CR 603.7c), the same as "Until end of turn, whenever you cast a noncreature spell, ...".
  // Showdown of the Skalds, Origin of Thor: "Whenever you cast a spell this turn, ..." the same way.
  text = text.replace(/^Whenever you cast an? (?:(noncreature|creature|instant or sorcery) )?spell this turn, /, (_, kind?: string) => `Until end of turn, whenever you cast a ${kind ? `${kind} ` : ""}spell, `);
  // "You may create a token that's a copy of a nonlegendary enchantment you control" (Calix, Guided by Fate): choosing
  // one is creating it, so "you may choose ... If you do, create a token that's a copy of it."
  text = text.replace(/(^|\. )([Yy]ou may) create a token that's a copy of an? ((?:nonlegendary )?(?:permanent|creature|artifact|enchantment)) you control\./g, "$1$2 choose a $3 you control. If you do, create a token that's a copy of it.");
  // Sanctum of Eternity: "Return target commander you own from the battlefield to your hand": a target permanent you own
  // (CR 115.1), so its owner's hand.
  text = text.replace(/\b([Rr]eturn target [a-z ]+? you own) from the battlefield to your hand\./g, "$1 to its owner's hand.");
  // Divine Reckoning: "Each player chooses a creature they control. Destroy the rest." One instruction (CR 608.2c).
  text = text.replace(/(^|\. )(Each player chooses an? [a-z]+ they control)\. Destroy the rest\./g, "$1$2 and the rest are destroyed.");
  // The Celestus: "If it's night, it becomes day. Otherwise, it becomes night." One instruction.
  text = text.replace(/(^|\. )If it's night, it becomes day\. Otherwise, it becomes night\./, "$1If it's night, it becomes day, otherwise it becomes night.");
  // Pia's Revolution: "return that card to your hand unless target opponent has ~ deal 3 damage to them": that player
  // chooses as it resolves (rulings), the same as Risk Factor's "Target opponent may have ~ deal 3 damage to them. If that
  // player doesn't, ...". The card is in your graveyard, so it's yours (CR 404.2).
  text = text.replace(/^return that card to your hand unless (target opponent) has ~ (deal \d+ damage) to them\.$/, "$1 may have ~ $2 to them. If that player doesn't, return that card to its owner's hand.");
  // Fall of the First Civilization: "Each player chooses three nonland permanents they control. Destroy all other nonland
  // permanents." The same: every nonland permanent is controlled by one of them.
  text = text.replace(/(^|\. |— )(Each player chooses (?:two|three) nonland permanents they control)\. Destroy all other nonland permanents\./g, "$1$2 and the rest are destroyed.");
  // The Last Ronin's Technique: "Create three ... tokens. If ~'s sneak cost was paid, they enter tapped and attacking": how
  // they enter, chosen by whether the sneak cost was paid (CR 702.190a).
  text = text.replace(/^Create (\w+ [^.]+? tokens)\. If ~'s sneak cost was paid, they enter tapped and attacking\.$/, "Create $1. If ~'s sneak cost was paid, instead create $1 that are tapped and attacking.");
  // Rhystic Tutor: "Unless any player pays {2}, search your library for a card, ...": each player in turn order may pay,
  // the caster too; the search only if no one does (CR 101.4), the same as "Any player may pay {2}. If no one does, ...".
  text = text.replace(/^Unless any player pays ((?:\{[^}]+\})+), (search your library [^.]+\.)$/, (_, cost: string, rest: string) => `Any player may pay ${cost}. If no one does, ${rest}`);
  // Ghired, Conclave Exile: "populate. The token enters tapped and attacking." One instruction: how the copy enters.
  text = text.replace(/(^|\. )([Pp])opulate\. The token enters tapped and attacking\./, "$1$2opulate, the token entering tapped and attacking.");
  // Duneblast: "Choose up to one creature. Destroy the rest." The same as Mount Doom's "..., then destroy the rest".
  text = text.replace(/(^|\. )(Choose up to (?:one|two|three) (?:creatures?|permanents?|nonland permanents?|artifacts?))\. Destroy the rest\./g, (_, lead: string, c: string) => `${lead}${c.replace(/(creature|permanent|artifact)$/, "$1s")}, then destroy the rest.`);
  // "Put a quest counter on this enchantment. Then if it has four or more quest counters on it, draw a card." (Waterbender
  // Ascension): "it" is ~.
  // Sab-Sunen, Luxa Embodied: "Then if it has an odd number of counters on it, draw two cards" too.
  text = text.replace(/(\bcounters? on ~\. Then if) it has (?=\w+ or more [a-z+\/0-9-]+ counters on it, |an? (?:even|odd) number of counters on it, )/g, "$1 ~ has ");
  // Strixhaven Stadium: "Then if it has ten or more point counters on it, remove them all and that player loses the game":
  // the point counters on ~, then the player its trigger is about (checked only as it resolves, rulings).
  text = text.replace(/(\bcounters? on ~\. Then if ~ has \w+ or more ([a-z]+) counters on it, )remove them all and (that player loses the game)\./g, "$1remove all $2 counters from ~, then $3.");
  // The Emperor of Palamecia: "Then if it has three or more +1/+1 counters on it, transform it": ~, as it is then.
  // Wedding Announcement: "Then if ~ has three or more invitation counters on it, transform it" after other instructions.
  text = text.replace(/(\bcounters? on ~\. Then if ~ has \w+ or more [a-z+\/0-9-]+ counters on it, )transform it\./g, "$1transform ~.");
  text = text.replace(/(\. Then if ~ has \w+ or more [a-z+\/0-9-]+ counters on it, )transform it\.$/, "$1transform ~.");
  // Sarkhan, Dragon Ascendant: "~ becomes a Dragon in addition to his other types" ("~'s other types" by now): its own.
  text = text.replace(/(~ becomes [^.]+? in addition to) ~'s other types\b/g, "$1 its other types");
  // Charitable Levy: "put a collection counter on ~. Then if there are three or more collection counters on it, sacrifice
  // it. If you do, ...": the counters on ~, then ~ itself.
  text = text.replace(/(\bcounters? on ~\. Then if) there are (\w+ or more [a-z]+ counters) on (?:it|~), sacrifice it\./g, "$1 ~ has $2 on it, sacrifice ~.");
  // "Choose target battle. If an opponent protects it, remove a defense counter from it. Otherwise, put a defense counter
  // on it." (Portent Tracker) is one instruction about one battle.
  text = text.replace(/Choose target battle\. If an opponent protects it, remove (a|\w+) defense counters? from it\. Otherwise, put \1 defense counters? on it\./, (_, n: string) => `Remove ${n} defense counter${n === "a" ? "" : "s"} from target battle if an opponent protects it, otherwise put that many on it.`);
  // "Create a Treasure token and exile the top card of that player's library. Until end of turn, you may cast that card."
  // (Ragavan): two instructions, the second an impulse with its permission.
  text = text.replace(/(^|\. )([Cc]reate an? [^.]+? token) and exile the top card of (your|that player's) library\. (?=(?:Until end of turn, )?[Yy]ou may (?:cast|play) that card)/, "$1$2. Exile the top card of $3 library. ");
  // "..., then shuffle and you gain 1 life" (Brokers Hideout): the search, then the life.
  // "Loses two times X life" (Debt to the Deathless) is "loses twice X life".
  text = text.replace(/\bloses two times X life\b/g, "loses twice X life");
  // "A token that's a copy of that creature except it's an artifact ..." (Faerie Artisans): the usual comma.
  text = text.replace(/\b(a token that's a copy of that creature) except it's /g, "$1, except it's ");
  text = text.replace(/, then shuffle and you gain (\d+) life\./g, ", then shuffle. You gain $1 life.");
  // "Each opponent discards a card, you draw a card, and you gain 2 life" (Daemogoth Woe-Eater): three instructions, in order.
  text = text.replace(/(^|\. )([Ee]ach opponent|[Yy]ou) (discards? a card|draws? a card|gains? \d+ life|loses? \d+ life), (each opponent|you) (discards? a card|draws? a card|gains? \d+ life|loses? \d+ life), and (each opponent|you) (discards? a card|draws? a card|gains? \d+ life|loses? \d+ life)\./g, (_, a: string, b: string, c: string, d: string, e: string, f: string, g: string) => `${a}${capital(b)} ${c}. ${capital(d)} ${e}. ${capital(f)} ${g}.`);
  // "Search your library for two cards. Put one into your hand and the other into your graveyard. Then shuffle." (Final
  // Parting): one search, as Cultivate's.
  text = text.replace(/\bSearch your library for two cards\. Put one (into your hand|onto the battlefield) and the other into your graveyard\. Then shuffle\./g, "Search your library for two cards, put one $1 and the other into your graveyard, then shuffle.");
  // "You gain 7 life, draw seven cards, then put up to seven ..." (Ugin, the Spirit Dragon): three instructions in order.
  text = text.replace(/^You gain (\d+) life, draw (\w+) cards?, then /, "You gain $1 life. Draw $2 cards, then ");
  // "Sacrifice ~, search your library for up to two creature cards, put those cards onto the battlefield, then shuffle"
  // (Defense of the Heart): the sacrifice, then the search.
  text = text.replace(/^([Ss])acrifice ~, search your library /, "$1acrifice ~. Search your library ");
  // "Put a +1/+1 counter on ~ and add {R}" (Crime Novelist): two instructions, in that order.
  text = text.replace(/^([Pp]ut an? [^.]+? counter on ~) and add ((?:\{[WUBRGC]\})+)\.$/, "$1. Add $2.");
  // "That creature also gains trample until end of turn if you control a creature with power 4 or greater" (Temur Battle
  // Rage): checked as it resolves (CR 608.2c).
  // Grim Giganotosaurus: "destroy all artifacts and creatures other than ~": the same as "all other artifacts and creatures".
  text = text.replace(/^([Dd]estroy) all ([a-z]+s(?: and [a-z]+s)?) other than ~\.$/, "$1 all other $2.");
  // Patron of the Orochi: "Untap all Forests and all green creatures.": each of them (a green Forest creature once).
  text = text.replace(/^Untap all ([A-Z][a-z]+s) and all (white|blue|black|red|green) creatures\.$/, "Untap all $1. Untap all $2 creatures.");
  // Savage Punch: "Target creature you control fights target creature you don't control. The creature you control gets
  // +2/+2 until end of turn before it fights if you control a creature with power 4 or greater.": the bonus first,
  // checked as it resolves (CR 608.2c; rulings), then the fight.
  text = text.replace(/^Target creature you control fights target creature you don't control\. The creature you control gets (\+\d+\/\+\d+) until end of turn before it fights if (you control a creature with power 4 or greater)\.$/, "If $2, target creature you control gets $1 until end of turn. It fights target creature you don't control.");
  // Marcus, Mutant Mayor: "draw a card if that creature has a +1/+1 counter on it. If it doesn't, put a +1/+1 counter
  // on it": one condition, checked as it resolves (CR 608.2c).
  text = text.replace(/^[Dd]raw a card if (that creature has an? [^.]+? counter on it)\. If it doesn't, ([^.]+)\.$/, "If $1, draw a card. Otherwise, $2.");
  // Weatherlight Compleated: "put a phyresis counter on ~. Then draw a card if it has seven or more phyresis counters on it.
  // If it doesn't, scry 1.": ~, checked as it resolves after the counter (or as it last existed, rulings).
  text = text.replace(/(\bcounter on ~\. )Then draw a card if it has (\w+ or more [a-z]+ counters on it)\. If it doesn't, ([^.]+)\.$/, "$1Then if it has $2, draw a card. Otherwise, $3.");
  // Kathari Bomber: "create two 1/1 red Goblin creature tokens and sacrifice ~": two instructions, in order.
  text = text.replace(/^([Cc]reate [^.]+? tokens?) and sacrifice ~\.$/, "$1. Sacrifice ~.");
  // Swarm Surge: "Creatures you control get +2/+0 until end of turn. Colorless creatures you control also gain first strike
  // until end of turn.": a second effect of its own.
  text = text.replace(/(\. )((?:[A-Z][a-z]+ )?creatures you control) also (gain|get) /, "$1$2 $3 ");
  // Roar of Challenge's "That creature gains indestructible until end of turn if ..." too.
  text = text.replace(/(^|\. )That creature (?:also )?gains ([^.]+?) until end of turn if (you control [^.,]+)\./, "$1If $3, that creature gains $2 until end of turn.");
  // "Sacrifice another creature. You gain X life and draw X cards, where X is that creature's power." (Disciple of Bolas):
  // with none sacrificed, X is 0 and nothing happens, the same as "If you do, ...".
  // Doomgape: "sacrifice a creature. You gain life equal to that creature's toughness.": the same.
  text = text.replace(/(^|\. )([Ss]acrifice (?:another|a) creature)\. You gain life equal to that creature's (power|toughness)\./, "$1$2. You gain X life, where X is that creature's $3.");
  text = text.replace(/(^|\. )([Ss]acrifice (?:another|a) creature)\. You ([^.]+, where X is that creature's (?:power|toughness))\./, "$1$2. If you do, you $3.");
  // "You lose 1 life and amass Zombies 1." (Dreadhorde Invasion): two instructions, in that order.
  text = text.replace(/(^|\. )([Yy]ou (?:lose|gain) \d+ life) and (amass [A-Z][a-z]+ \d+)\./, (_, a, b, c) => `${a}${b}. ${capital(c)}.`);
  // "You add {B}{B} and draw a card." (Priest of Forgotten Gods): the same as "Add {B}{B}".
  text = text.replace(/(^|\. )You add ((?:\{[WUBRGC]\})+)(?= and |\.)/, "$1Add $2");
  // "~ deals 2 damage to each other player" (Syphon Soul): with no teams, every other player is an opponent (CR 102.3).
  text = text.replace(/\b(deals \w+ damage to) each other player\b/g, "$1 each opponent");
  // "~ deals X damage to that player, where X is the number of untapped lands they control" (Citadel of Pain): "they"
  // is that player.
  text = text.replace(/\b(damage to that player, where X is the number of [a-z ]+?) they control\./, "$1 that player controls.");
  // Self-Destruct: "Target creature you control deals X damage to any other target and X damage to itself, where X is its
  // power": one X, its power as this resolves (rulings).
  text = text.replace(/^Target creature you control deals X damage to any other target and X damage to itself, where X is its power\.$/, "Target creature you control deals damage equal to its power to any other target and to itself.");
  // Necrogen Rotpriest: "that player gets an additional poison counter": one more, from this trigger (CR 122.1).
  text = text.replace(/\bthat player gets an additional poison counter\b/g, "that player gets a poison counter");
  // "~ deals 3 damage to each of your opponents" (Aurelia, the Law Above) is "each opponent".
  text = text.replace(/\b(deals \w+ damage to) each of your opponents\b/g, "$1 each opponent");
  // "~ deals 4 damage to target creature and you gain life equal to the damage dealt this way" (Enter the God-Eternals).
  text = text.replace(/^(~ deals [^.]+? damage to [^.]+?) and you gain life equal to the damage dealt this way\./, "$1. You gain life equal to the damage dealt this way.");
  // "They lose 1 life and you put a -1/-1 counter on up to one target creature they control" (Persistent Constrictor): the
  // life, then the counter (the target chosen as the ability is put on the stack, CR 603.3d).
  // Ziatora: "~ deals damage equal to that creature's power to any target and you create three Treasure tokens": two
  // instructions in order (the amount's words would otherwise swallow the second).
  text = text.replace(/^(~ deals damage equal to [^.]+? to any target) and you (create|gain|draw) /, (_, a: string, v: string) => `${a}. You ${v} `);
  text = text.replace(/^(they|that player) (loses?) (\d+) life and you (put an? [^.]+? counter on up to one target creature) (they|that player) controls?\./, (_, w: string, v: string, n: string, rest: string) => `${w === "they" ? "They" : "That player"} ${v} ${n} life. ${capital(rest)} that player controls.`);
  // Mwonvuli Beast Tracker: "search your library for a creature card with ... and reveal it. Shuffle and put that card on
  // top.": the same as "..., reveal it, then shuffle and put that card on top" (Worldly Tutor).
  text = text.replace(/(^|\. )([Ss]earch your library for an? [^.,]+? card(?: with [^.]+?)?) and reveal it\. Shuffle and put that card on top\./, "$1$2, reveal it, then shuffle and put that card on top.");
  // Pore Over the Pages: "Draw three cards, untap up to two lands, then discard a card.": three instructions, in order.
  text = text.replace(/(^|\. )Draw (a card|\w+ cards), untap up to (\w+) lands, then discard (a card|\w+ cards)\./, "$1Draw $2. Untap up to $3 lands. Then discard $4.");
  // See Beyond: "Draw two cards, then shuffle a card from your hand into your library.": two instructions, in order.
  text = text.replace(/(^|\. )Draw (a card|\w+ cards), then shuffle (a card|\w+ cards) from your hand into your library\./, "$1Draw $2. Then shuffle $3 from your hand into your library.");
  // Invincible Hymn: "Count the number of cards in your library. Your life total becomes that number.": counted once, as
  // it resolves (rulings).
  text = text.replace(/^Count the number of cards in your library\. Your life total becomes that number\.$/, "Your life total becomes the number of cards in your library.");
  // Reckless Handling: "..., put it into your hand, shuffle, then discard a card at random." The discard comes after the
  // shuffle, found or not (rulings).
  text = text.replace(/, put it into your hand, shuffle, then discard a card at random\./, ", put it into your hand, then shuffle. Discard a card at random.");
  // "~ deals damage to that player equal to the number of cards in their hand and you gain 1 life for each card in your
  // hand" (Sword of War and Peace): the damage, then the life; the cards counted as each part happens (CR 608.2c).
  text = text.replace(/^(~ deals damage to that player equal to the number of cards in their hand) and (you gain 1 life for each card in your hand)\./, "$1. $2.");
  // "Destroy all creatures you don't control and all planeswalkers you don't control" (In Garruk's Wake).
  text = text.replace(/\ball creatures you don't control and all planeswalkers you don't control\b/g, "all creatures and planeswalkers you don't control");
  // "Destroy all creatures other than ~" (Magister of Worth) is "destroy all other creatures".
  text = text.replace(/\ball creatures other than ~/g, "all other creatures");
  // Insurrection: "Untap all creatures and gain control of them until end of turn. They gain haste until end of turn.":
  // the same creatures throughout (rulings), those there as it resolves (CR 611.2c).
  text = text.replace(/^Untap all creatures and gain control of them until end of turn\. They gain haste until end of turn\.$/, "Untap all creatures. Gain control of all creatures until end of turn. All creatures gain haste until end of turn.");
  // Cloud's Limit Break: "destroy any number of target tapped creatures with different controllers": as it's cast, up to
  // one for each player, the same as "for each player, ... up to one target ... that player controls" (CR 601.2c).
  text = text.replace(/(^|\. )Destroy any number of target ([a-z ]+?) creatures with different controllers\./, "$1For each player, destroy up to one target $2 creature that player controls.");
  // "Until end of turn, target creature gains trample and gets +1/+0 for each card you've drawn this turn" (Fists of
  // Flame): both until end of turn, the bonus counted as it resolves (rulings, CR 608.2h).
  text = text.replace(/(^|\. )Until end of turn, target creature gains ([a-z]+) and gets ([+-]\d+\/[+-]\d+) for each ([^.]+)\./, "$1Target creature gains $2 until end of turn. It gets $3 until end of turn for each $4.");
  // "Until end of turn, creatures you control get +1/+1 for each Forest you control and gain trample" (Nissa, Ascended
  // Animist): two instructions about the same creatures, all of them as it resolves (CR 611.2c).
  // Elspeth Tirel: "Destroy all other permanents except for lands and tokens": each nonland, nontoken permanent but her
  // (rulings).
  text = text.replace(/(^|\. )Destroy all other permanents except for lands and tokens\./, "$1Destroy all other nonland, nontoken permanents.");
  // Suspended Sentence: "Destroy target creature an opponent controls. That player loses 3 life.": that player is the
  // creature's controller, as it last existed on the battlefield (CR 608.2h).
  text = text.replace(/(^|\. )([Dd]estroy|[Ee]xile) target creature an opponent controls\. That player (loses|gains) /, "$1$2 target creature an opponent controls. Its controller $3 ");
  // Wand of Orcus: "it and Zombies you control gain deathtouch until end of turn": both, at once.
  text = text.replace(/(^|, |\. )it and ([A-Z][a-z]+s) you control gain ([a-z]+) until end of turn\./, "$1it gains $3 until end of turn. $2 you control gain $3 until end of turn.");
  // "Until end of turn, target attacking creature gets +1/+1 for each other attacking creature and gains double strike"
  // (Paladin Class): both until end of turn.
  text = text.replace(/(^|\. )[Uu]ntil end of turn, (target [a-z ]*?creature) gets ([+-]\d+\/[+-]\d+) for each ([^.]+?) and gains ([a-z ]+)\./, (_, a, t, pt, per, kw) => `${a}${t.charAt(0).toUpperCase()}${t.slice(1)} gets ${pt} until end of turn for each ${per}. It gains ${kw} until end of turn.`);
  // Gold Rush: "Until end of turn, up to one target creature gets +2/+2 for each Treasure you control": the same.
  text = text.replace(/(^|\. )[Uu]ntil end of turn, ((?:up to one )?target [a-z ]*?creature) gets ([+-]\d+\/[+-]\d+) for each ([^.,]+?)\./, (_, a, t, pt, per) => `${a}${capital(t)} gets ${pt} until end of turn for each ${per}.`);
  text = text.replace(/(^|\. )Until end of turn, creatures you control get ([+-]\d+\/[+-]\d+) for each ([^.]+?) and gain ([a-z]+)\./, "$1Creatures you control get $2 until end of turn for each $3. Creatures you control gain $4 until end of turn.");
  // Whispering Specter: "that player discards a card for each poison counter they have": "they" is that player.
  if (opts.eventPlayer) text = text.replace(/\b([Tt]hat player discards a card for each poison counter) they have\./, "$1 that player has.");
  // Besmirch: "Until end of turn, gain control of target creature and it gains haste": both until end of turn.
  text = text.replace(/(^|\. )Until end of turn, gain control of (target [^.,]+?) and it gains haste\./, "$1Gain control of $2 until end of turn. It gains haste until end of turn.");
  // Haldir, Lórien Lieutenant: "Until end of turn, other Elves you control gain vigilance and get +1/+1 for each +1/+1
  // counter on ~": the same.
  text = text.replace(/(^|\. )Until end of turn, (other [A-Z][a-z]+ you control) gain ([a-z]+) and get ([+-]\d+\/[+-]\d+) for each ([^.]+?)\./, (_, a: string, g: string, kw: string, pt: string, per: string) => `${a}${capital(g)} gain ${kw} until end of turn. ${capital(g)} get ${pt} until end of turn for each ${per}.`);
  // "Each creature other than ~ gets -1/-1 until end of turn" (Massacre Girl) is "each other creature".
  text = text.replace(/\b([Ee])ach creature other than ~/g, "$1ach other creature");
  // "Sacrifice a creature other than ~" (Lord of the Pit, Demonic Taskmaster) is "sacrifice another creature".
  text = text.replace(/\b([Ss]acrifice) an? (creature|permanent) other than ~/g, "$1 another $2");
  // "Choose any number of target creatures you control. For each of them, create a token that's a copy of that creature,
  // except it has haste." (Twinflame): a copy of each of them.
  // "Choose up to two target creatures you don't control. For each of those creatures, create a token that's a copy of that
  // creature." (Hate Mirage) likewise.
  text = text.replace(/^Choose (any number of|up to two) target ([^.]+?)\. For each (?:of them|of those creatures), create a token that's a copy of that (?:creature|permanent)(, except [^.]+)?\./, "Create a token that's a copy of each of $1 target $2$3.");
  // "Target creature you control other than ~" (Rosie Cotton) is "another target creature you control"; "each creature you
  // control other than ~" (Dawnstrike Vanguard) is "each other creature you control".
  text = text.replace(/\b([Tt])arget (creature|permanent) you control other than ~/g, (_, t: string, w: string) => `${t === "T" ? "A" : "a"}nother target ${w} you control`);
  text = text.replace(/\beach (creature|permanent) you control other than ~/g, "each other $1 you control");
  // "Exile target nonland permanent other than ~" (Admonition Angel), "target creature other than ~ gets -1/-1" (Weed-Pruner
  // Poplar): "another target ...", other than the source, when no target comes before it in the sentence.
  // "Return up to one target nonland permanent other than ~" (Council of Echoes): "up to one other target ...".
  text = text.replace(/(^|[.:] |, )([^.]*?)\b(?:([Tt])arget|(up to one) target) ((?:non[a-z]+ )?(?:creature|permanent)) other than ~/g, (all, lead: string, before: string, t: string | undefined, upTo: string | undefined, w: string) => (/\btargets?\b/.test(before) ? all : upTo ? `${lead}${before}up to one other target ${w}` : `${lead}${before}${t === "T" ? "A" : "a"}nother target ${w}`));
  // "Each player secretly votes for truth or consequences, then those votes are revealed" is one instruction (a vote whose
  // votes nobody sees until all are made), not two.
  text = text.replace(/\b(secretly votes for [^.]+?), then those votes are revealed\./g, "$1.");
  // Ifrit, Warden of Inferno: "If ~ has three or more lore counters on it, exile it, then return it ...": "it" is ~.
  text = text.replace(/\b(If ~ has [^,.]+ counters on it), exile it, then return it to the battlefield\./, "$1, exile ~, then return it to the battlefield.");
  // Gisa, Glorious Resurrector: "They gain decayed" is about the cards just put onto the battlefield.
  text = text.replace(/([Pp]ut all creature cards exiled with ~ onto the battlefield under your control)\. They gain decayed\./, "$1, and they gain decayed.");
  // Emperor of Bones: "put a creature card exiled with ~ onto the battlefield under your control with a finality counter on
  // it. It gains haste. Sacrifice it at the beginning of the next end step." One instruction about that permanent.
  text = text.replace(/([Pp]ut a creature card exiled with ~ onto the battlefield under your control with a finality counter on it)\. It gains haste\. Sacrifice it at the beginning of the next end step\./, "$1, and it gains haste until it is sacrificed when the next end step begins.");
  // "Until your next turn, it gains indestructible." (Hydaelyn) says the same as "It gains indestructible until your next turn."
  text = text.replace(/\bUntil your next turn, it gains ([a-z ]+)\./g, "It gains $1 until your next turn.");
  // Mass Diminish: "Until your next turn, creatures target player controls have base power and toughness 1/1": the
  // same as "... until your next turn" (the creatures there as it resolves, CR 611.2c).
  text = text.replace(/(^|\. )Until your next turn, (creatures target (?:player|opponent) controls (?:have|get) [^.]+)\./, (_, pre: string, rest: string) => `${pre}${rest.charAt(0).toUpperCase()}${rest.slice(1)} until your next turn.`);
  // Sylvan Awakening: "Until your next turn, all lands you control become 2/2 Elemental creatures with reach,
  // indestructible, and haste." The same as with the duration last; the lands it affects are those there as it resolves
  // (rulings, CR 611.2c).
  text = text.replace(/(^|\. )Until your next turn, (all lands you control become [^.]+)\./, "$1$2 until your next turn.");
  // Nissa, Vital Force: "Untap target land you control. Until your next turn, it becomes a 5/5 Elemental creature with
  // haste. It's still a land." The same.
  // Matter Reshaper: "You may put that card onto the battlefield if it's a permanent card with mana value 3 or less.
  // Otherwise, put that card into your hand." Not one or not put: into your hand (rulings), as Fecund Greenshell's.
  text = text.replace(/(^|\. )You may put that card onto the battlefield if it's (an? [a-z]+ card with mana value \d+ or (?:less|greater))\. Otherwise, put that card into your hand\./, "$1If it's $2, you may put it onto the battlefield. Otherwise, put it into your hand.");
  // Energy Tap: "Tap target untapped creature you control. If you do, add ...": its only target is untapped as long as
  // it's legal, so when the spell resolves the creature is always tapped (CR 608.2b).
  text = text.replace(/^Tap target untapped creature you control\. If you do, add /, "Tap target untapped creature you control. Add ");
  // Spirit Flare: "... If you do, it deals damage equal to its power to target attacking or blocking creature ...": the same,
  // and with either target illegal it deals no damage (rulings).
  text = text.replace(/^Tap target untapped creature you control\. If you do, it deals damage equal to its power to (target [^.]+)\.$/, "Tap target untapped creature you control. It deals damage equal to its power to $1.");
  // Mirko, Obsessive Theorist: "target creature card with power less than ~'s": than ~'s power.
  text = text.replace(/\bwith (power|toughness) (less|greater) than ~'s(?! power| toughness)\b/g, "with $1 $2 than ~'s $1");
  // Conflux: "Search your library for a white card, ... and a green card. Reveal those cards, put them into your hand,
  // then shuffle." One search, as in one sentence.
  text = text.replace(/(^|\. )(Search your library for [^.]+? card)\. Reveal those cards, put them into your hand, then shuffle\./, "$1$2, reveal them, put them into your hand, then shuffle.");
  // Lotuslight Dancers: "... for a black card, a green card, and a blue card. Put those cards into your graveyard, then
  // shuffle." The same.
  text = text.replace(/(^|\. )([Ss]earch your library for [^.]+? card)\. Put those cards into your graveyard, then shuffle\./, "$1$2, put them into your graveyard, then shuffle.");
  // Pointed Discussion: "You draw two cards, lose 2 life, then create a Blood token": three instructions, in order. Funeral
  // Rites: "..., then mill two cards".
  text = text.replace(/(^|\. )You draw (\w+) cards?, lose (\w+) life, then (create [^.]+|mill (?:a card|\w+ cards))\./, (_, lead: string, n: string, l: string, c: string) => `${lead}Draw ${n} card${n === "a" ? "" : "s"}. You lose ${l} life. ${capital(c)}.`);
  // Drillworks Mole: "Put a +1/+1 counter on ~ and a +1/+1 counter on up to one target commander creature you control": two
  // instructions, in that order.
  text = text.replace(/(^|: |\. )Put (an? [+-]\d\/[+-]\d counter) on ~ and (an? [+-]\d\/[+-]\d counter) on ((?:up to one )?target [^.]+)\./, "$1Put $2 on ~. Put $3 on $4.");
  // Hope-Ender Coatl: "counter target spell an opponent controls unless they pay {1}": "they" is that spell's controller.
  text = text.replace(/(^|\. )([Cc]ounter target (?:[a-z]+ )?spell(?: an opponent controls)?) unless they pay (\{)/, "$1$2 unless its controller pays $3");
  // Triceraton Commander: "Dinosaurs you control other than ~ get +1/+1 and gain flying until end of turn": the same as
  // "other Dinosaurs you control".
  text = text.replace(/(^|\. )([A-Z][a-z]+s|[Cc]reatures) you control other than ~ (get|gain) /, (_, lead: string, what: string, verb: string) => `${lead}Other ${what === "Creatures" ? "creatures" : what} you control ${verb} `);
  // Razzle-Dazzler: "put a +1/+1 counter on ~. It can't be blocked this turn"; Wicked Wolf: "Put a +1/+1 counter on ~. It
  // gains indestructible until end of turn. Tap it.": "it" is ~, the one object named. ("It gains X until end of turn" alone
  // already reads as ~.)
  text = text.replace(/((?:^|: |\. )[Pp]ut (?:an?|\w+) [+-]\d\/[+-]\d counters? on ~\.) It (can't be blocked this turn|gains [a-z ]+ until end of turn(?=\. Tap it\.))\.(?: Tap it\.)?/, (all: string, put: string, rest: string) => `${put} ~ ${rest}.${/ Tap it\.$/.test(all) ? " Tap ~." : ""}`);
  // Captain Ripley Vance: "put a +1/+1 counter on ~, then it deals damage equal to its power to any target": "it" is ~, and
  // its power counts the new counter.
  text = text.replace(/(^|: |\. )[Pp]ut (an? [+-]\d\/[+-]\d counter) on ~, then it deals /, "$1Put $2 on ~. ~ deals ");
  // Trygon Prime: "Whenever ~ attacks, put a +1/+1 counter on it and a +1/+1 counter on up to one other target attacking
  // creature": "it" is ~ there.
  if (opts.selfIt) text = text.replace(/^[Pp]ut (an? [+-]\d\/[+-]\d counter) on it and (an? [+-]\d\/[+-]\d counter) on ((?:up to one )?(?:other )?target [^.]+)\./, "Put $1 on ~. Put $2 on $3.");
  // Oblivion's Hunger: "Draw a card if that creature has a +1/+1 counter on it": the condition first, the same instruction.
  text = text.replace(/(^|\. )Draw a card if that creature has (an? [^.,]+ counter on it)\./, "$1If that creature has $2, draw a card.");
  // Seedtime: "Take an extra turn after this one if an opponent cast a blue spell this turn": the condition first.
  text = text.replace(/^Take an extra turn after this one if (an opponent cast an? [a-z]+ spell this turn)\./, "If $1, take an extra turn after this one.");
  // Ajani Goldmane: "Create a white Avatar creature token. It has "This creature's power and toughness are each equal to
  // your life total."": the token is created with that ability.
  text = text.replace(/(^|\. )(Create an? [^."]+? creature token)\. It has ("(?:This creature|~)'s power and toughness are each equal to [^"]+")\.?$/, "$1$2 with $3.");
  // Broken Visage, Kalitas, Ritual of the Returned: "Create a black Spirit creature token. Its power is equal to that
  // creature's power and its toughness is equal to that creature's toughness": one instruction (tokens.ts).
  text = text.replace(/(^|\. |, )([Cc]reate) an? ([a-z]+ [A-Z][a-z]+ creature token)\. Its power is equal to (that creature|that card)'s power and its toughness is equal to \4's toughness\./, "$1$2 a 0/0 $3 with power and toughness equal to $4's.");
  // Inspired Ultimatum: "Target player gains 5 life, ~ deals 5 damage to any target, then you draw five cards": three
  // instructions, each with its own subject, in order.
  text = text.replace(/^Target player gains (\w+) life, ~ deals (\w+) damage to any target, then you draw (\w+) cards\./, "Target player gains $1 life. ~ deals $2 damage to any target. You draw $3 cards.");
  // Crawling Barrens: "Put two +1/+1 counters on ~. Then you may have it become a 0/0 Elemental creature ...": ~.
  text = text.replace(/(^|\. )(Put [^.]+ counters? on ~)\. Then you may have it become /, "$1$2. Then you may have ~ become ");
  text = text.replace(/(^|\. )Until your next turn, it becomes (an? \d+\/\d+ [^.]+)\. It's still a land\./, "$1It becomes $2 until your next turn. It's still a land.");
  // Malboro: "each opponent discards a card, loses 2 life, and exiles the top three cards of their library": three
  // instructions, each done by all of them before the next (CR 608.2c; rulings).
  text = text.replace(/(^|\. )([Ee]ach opponent) (discards an? [^,.]+), (loses \d+ life), and (exiles the top [^,.]+ of their library)\./, (_, a: string, who: string, x: string, y: string, z: string) => `${a}${capital(who)} ${x}. Each opponent ${y}. Each opponent ${z}.`);
  // Swallowed by Leviathan: "Choose target spell. Surveil 2, then counter the chosen spell unless ...": the target is chosen
  // as it's cast either way (CR 601.2c), so the same as "Surveil 2. Counter target spell unless ...".
  text = text.replace(/^Choose (target spell)\. (Surveil \d+), then counter the chosen spell unless /, "$2. Counter $1 unless ");
  // Worldslayer: "destroy all permanents other than ~" says the same as "destroy all other permanents".
  text = text.replace(/\b([Dd]estroy|[Ee]xile) all permanents other than ~/g, "$1 all other permanents");
  // "Enchanted player mills X cards, where X is the number of cards put into their graveyard ..." (Fraying Sanity).
  text = text.replace(/\b(enchanted player) mills X cards, where X is the number of cards put into their graveyard/g, "$1 mills X cards, where X is the number of cards put into enchanted player's graveyard");
  // Liliana of the Veil's two sentences are one effect: the piles, then the sacrifice of the chosen one (CR 700.3).
  text = text.replace(/\bSeparate all permanents (target player|target opponent) controls into two piles\. That player sacrifices all permanents in the pile of their choice\./g, "Separate all permanents $1 controls into two piles for that player to sacrifice the pile of their choice.");
  // "You may pay eight {E}. If you pay, ..." (Lightning Runner) says the same as "If you do".
  text = text.replace(/(you may pay [^.]+\.) If you pay, /g, "$1 If you do, ");
  // "Roll a d20. [Instructions with X.] 1—9 | X is one. 10—19 | X is two. 20 | X is three." (Wand of Wonder): each row
  // does the instructions with its X (CR 706.3a); only one row applies.
  text = text.replace(/^(Roll a d\d+\.) (.+?) ((?:\d+(?:—\d+)? \| X is (?:one|two|three|four|five)\.\s*)+)$/, (all, roll: string, body: string, rows: string) =>
    /\bX\b/.test(body) ? `${roll} ${[...rows.matchAll(/(\d+(?:—\d+)?) \| X is (\w+)\./g)].map((r) => `${r[1]} | ${body.replace(/\bX\b/g, r[2]!)}`).join(" ")}` : all,
  );
  // Bucknard's Everfull Purse: "Roll a d4 and create a number of Treasure tokens equal to the result": the roll, then the
  // tokens (the result is known as one instruction finishes, CR 706.2).
  text = text.replace(/(^|\. )Roll a (d\d+) and (create a number of [A-Z][a-z]+ tokens equal to the result\.)/, (_m, pre: string, d: string, rest: string) => `${pre}Roll a ${d}. ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`);
  let rowToken: string | undefined;
  let rowCopy: string | undefined;
  // The instructions split off after a ", then" (the first part of each sentence stays out).
  const thenParts = new Set<string>();
  const thenPart = (p: string) => (thenParts.add(p), p);
  const sentences = splitSentences(text.trim())
    .map((x) => x.replace(/\.$/, "").trim())
    // A results table's row (CR 706.3a): a marker, then its instructions, up to the next row.
    .flatMap((x) => {
      const row = ROLL_ROW.exec(x);
      if (!row) return [x];
      let fx = row[5]!.replace(/^[A-Z][^—.|]*?! — /, "");
      // "1—9 | Create a 1/1 red Goblin creature token. 10—19 | Create two of those tokens." (Swarming Goblins)
      const those = /^Create (two|three|four|five) of those tokens$/.exec(fx);
      if (those && rowToken) fx = `Create ${those[1]} ${rowToken} tokens`;
      // "1—14 | Create a tapped and attacking token that's a copy of that creature, except .... 15—20 | Create one of
      // those tokens." (Delina, Wild Mage): the same token again.
      if (/^Create one of those tokens$/.test(fx) && rowCopy) fx = rowCopy;
      rowToken = /^Create an? ([^,.]+?) token$/.exec(fx)?.[1] ?? rowToken;
      rowCopy = /^Create an? (?:tapped (?:and attacking )?)?token that's a copy of .+$/.exec(fx)?.[0] ?? rowCopy;
      return [`${ROW_MARK}${row[1]}|${row[2] ?? (row[3] || row[4] === "more" || row[4] === "higher" ? "+" : row[4] === "less" ? "-" : row[1])}`, fx];
    })
    // "Target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life" (Archon of
    // Cruelty): three instructions for that player, in the order listed (rulings).
    .flatMap((x) => {
      const verb = "(?:sacrifices|discards|loses|mills|draws|gains) [^,]+";
      const three = new RegExp(`^([Tt]arget opponent|[Tt]arget player|[Ee]ach opponent|[Ee]ach player) (${verb}), (${verb}),? and (${verb})$`).exec(x);
      if (!three) return [x];
      const again = /^target/i.test(three[1]!) ? "That player" : capital(three[1]!);
      return [`${three[1]} ${three[2]}`, `${again} ${three[3]}`, `${again} ${three[4]}`];
    })
    // "Draw two cards, then discard a card": two instructions, in order.
    // A search's "then shuffle" is part of the search (CR 701.23): "you may search" covers it too.
    // Not before "meld them into": meld (CR 701.42a) is one instruction with the exile (sentences/zones.ts).
    // Not after "If you do,": all of it depends on the payment ("If you do, choose a color, then ...").
    // Not after a leading condition either: "If you control a blue creature, draw a card, then discard a card" (Statute
    // of Denial) is all conditional; "Then if it has ten or more point counters on it, remove them all and that player loses
    // the game" (Strixhaven Stadium) likewise.
    // Nor "exile the top two cards of your library, then choose one of them" (Party Thrasher): the choice is of those cards.
    // Nor "you may exile target creature you control, then return that card to the battlefield" (Conjurer's Closet), "...
    // transformed" (Ral, Monsoon Mage): one blink, all of it optional.
    .flatMap((x) => (/^(?:Then i|I)f [^,]+, /.test(x) || /^Otherwise, remove all but one [^,]+, then you gain 1 life for each [^,]+ removed this way\.?$/.test(x) || / faces? a villainous choice — /.test(x) || /^[Yy]ou may exile [^,]+, then return (?:it|that card) to the battlefield(?: transformed)? under (?:its owner's|your) control\.?$/.test(x) || WHEEL.test(x) || /^(?:\w+ player shuffles (?:their|the cards from their) .+ into their library, then draws|[Ss]huffle the cards from your hand into your library, then draw) /.test(x) || /^The owner of target [^,]+ shuffles it into their library, then reveals the top card of their library\.?$/.test(x) || LIVING_DEATH.test(x) || /^[Ee]ach player reveals the top card of their library, loses life equal to that card's mana value, then puts it into their hand\.?$/.test(x) ? [x] : splitOutsideQuotes(x, /, then (?!shuffle|sacrifices the rest$|sacrifices all other creatures they control$|destroy the rest$|destroy all other creatures and planeswalkers\.?$|meld them into |choose one of them$|exile them again$|the choices are revealed\.?$)/g).map((p, i, all) => (i ? thenPart(thenSubject(all[0]!, p)) : p))))
    // "Target opponent reveals their hand and you choose a nonland card from it": two instructions, in order.
    .flatMap((x) => x.split(/(?<=reveals (?:their|his or her) hand) and (?=you choose )/).map((p, i) => (i ? p.charAt(0).toUpperCase() + p.slice(1) : p)))
    .flatMap(splitSpentPair)
    // "You may cast spells from your graveyard this turn, and if a card would be put into your graveyard from anywhere this
    // turn, exile it instead" (Forgotten Cellar): two instructions.
    .flatMap((x) => {
      const m = /^(.+ from your graveyard this turn), and (if a card would be put into your graveyard from anywhere this turn, exile (?:it|that card) instead)$/.exec(x);
      return m ? [m[1]!, capital(m[2]!)] : [x];
    })
    // "For each player who chose fortune, you draw a card and create a Treasure token" (Seize the Spotlight): two
    // instructions, each done that many times.
    .flatMap((x) => {
      const m = /^(For each player who chose [a-z]+), you (draw [^,]+?) and (create [^,]+)$/.exec(x);
      return m ? [`${m[1]}, you ${m[2]}`, `${m[1]}, ${m[3]}`] : [x];
    })
    // "Put a +1/+1 counter on ~ and it can't be blocked this turn" (Sahagin): two instructions, both about ~.
    .flatMap((x) => {
      // Not under a leading condition ("If you do, put ... and it gains menace"): the condition is for both.
      // Nor under a leading "Unless you sacrifice an Island, ..." (Elder Spawn): both are what happens without it.
      const m = /^(?:If|[Uu]nless) /.test(x) ? null : /^(.*\b(?:counters? on ~|[Ss]acrifice ~)) and it ((?:gains|gets|can't|deals) .+)$/.exec(x);
      return m ? [m[1]!, `~ ${m[2]!}`] : [x];
    })
    // Legion Leadership: "Until end of turn, double target creature's power and it gains first strike": two instructions.
    .flatMap((x) => {
      const m = /^Until end of turn, double target creature's power and it gains ([a-z ]+)\.?$/.exec(x);
      return m ? ["Double target creature's power until end of turn", `It gains ${m[1]} until end of turn`] : [x];
    })
    // "You draw that many cards and ~ deals that much damage to each other opponent" (Kosei): two instructions, in order.
    .flatMap((x) => {
      const m = /^If /.test(x) ? null : /^([Yy]ou draw [^,]+?) and (~ deals .+)$/.exec(x);
      return m ? [m[1]!, m[2]!] : [x];
    })
    // "~ gets +2/+0 until end of turn and deals 1 damage to you" (Electric Eel): two instructions, both about ~.
    .flatMap((x) => {
      // Wormwood Dryad: "~ gains forestwalk until end of turn and deals 1 damage to you": the same.
      const m = /^(~ gets [+-]\d+\/[+-]\d+ until end of turn|~ gains [a-z]+ until end of turn) and (deals \d+ damage to you)$/.exec(x);
      // Kookus: "~ deals 3 damage to you and attacks this turn if able": the same, in order.
      const k = /^(~ deals \d+ damage to you) and (attacks this turn if able)$/.exec(x);
      return m ? [m[1]!, `~ ${m[2]!}`] : k ? [k[1]!, `~ ${k[2]!}`] : [x];
    })
    .filter(Boolean);
  let prevStart = 0;
  /** The mana a "Spend this mana only ..." sentence restricted, for an "Until end of turn, you don't lose this mana" after it. */
  let spendAdded: Extract<Effect, { type: "addMana" }>[] = [];
  let curStart = 0;
  // Where the sentence before started, counting the parts split off at ", then" as one sentence with it: "Draw a card,
  // then discard a card. If you have a full party, instead draw three cards." (The Destined Thief) replaces both.
  let prevWhole = 0;
  let curWhole = 0;
  // Where the targets of the sentence before and of this one start.
  let prevTargets = 0;
  let curTargets = 0;
  // "You may pay {2}" waits for the sentence after: "If you do, draw a card."
  let payFirst: { pay: PayCost; text: string; payX?: { max?: Amount; color?: "W" | "U" | "B" | "R" | "G" }; /** "Pay X life, where X is its power" (Mask of Griselbrand). */ payLife?: AmountExpr; /** "Pay life equal to its power. If you do, ... that many": "that many" is that X. */ thatMany?: true } | null = null;
  // "Look at the top four cards of your library" waits for what to do with them (see parseDig).
  let dig: Partial<Extract<Effect, { type: "dig" }>> | null = null;
  // The look's own "where X is ...", for "with mana value X or less" after it (Hatchery Spider).
  let digWhere: AmountExpr | undefined;
  // A look that a "you may pay ... If you do," before it depends on (see payFirst).
  let digPaid: { pay?: PayCost; text: string } | null = null;
  /** "If an Equipment is put onto the battlefield this way, you may attach it to a creature you control": after the dig. */
  let afterDig: Effect[] = [];
  // "If {B} was spent to cast ~, you may have target creature get -3/-3 until end of turn" (Cankerous Thirst): the "you
  // may" sentence is parsed as one, then put under the condition.
  let mayGate: { cond: SpellCondition; start: number } | null = null;
  const closeGate = () => {
    if (!mayGate) return true;
    const inner = effects.splice(mayGate.start);
    if (inner.length !== 1 || inner[0]!.type !== "may") return false;
    effects.push({ type: "if", cond: mayGate.cond, effects: inner });
    mayGate = null;
    return true;
  };
  // The results table row being read: its range, and where its instructions start.
  let row: { min?: number; max?: number; start: number } | null = null;
  const closeRow = () => {
    if (!row) return true;
    const inner = effects.splice(row.start);
    if (!inner.length) return false;
    effects.push({ type: "if", cond: { kind: "rollIn", ...(row.min !== undefined ? { min: row.min } : {}), ...(row.max !== undefined ? { max: row.max } : {}) }, effects: inner });
    row = null;
    return true;
  };
  let chosenCards: ObjRef | undefined;
  /** An X counted as the spell was cast (Count asCast), and where the instructions after the sentence defining it start. */
  let castX: { def: AmountExpr; from: number } | undefined;
  // The counts "if this is the Nth time this ability has resolved this turn" sentences named so far.
  const nthSeen: number[] = [];
  let resolvesAnyway = false;
  for (let si = 0; si < sentences.length; si++) {
    // "It" is the spell cast only as the first instruction: "Untap ~. It gains ..." is about ~ (Pristine Skywise).
    if (si > 0) delete ctx.spellIt;
    let s = sentences[si]!.replace(/^Then,? (.)/, (_, c: string) => c.toUpperCase());
    const last = effects[effects.length - 1];
    // Jadelight Ranger: "it explores, then it explores again": one exploration after the other (CR 701.44), the same
    // creature.
    if (/^(?:[Tt]hen )?[Ii]t explores again\.?$/.test(s)) {
      if (last?.type !== "explore") return null;
      effects.push({ ...last });
      continue;
    }
    // Foul-Tongue Shriek: "Target opponent loses 1 life for each attacking creature you control. You gain that much life.":
    // the life lost this way (as extort's, CR 702.101a).
    if (/^You gain that much life$/.test(s.replace(/\.$/, "")) && last?.type === "loseLife" && !last.drain && effects.length - 1 === effects.indexOf(last) && si > 0 && /\bloses? \d+ life\b/.test(sentences[si - 1]!)) {
      last.drain = true;
      continue;
    }
    // Roalesk, Apex Hybrid: "proliferate, then proliferate again": two proliferate actions, one after the other (CR 701.34).
    if (/^(?:[Tt]hen )?[Pp]roliferate again\.?$/.test(s)) {
      if (last?.type !== "proliferate" || last.n || last.twice || last.thenPhaseOut) return null;
      effects.push({ ...last });
      continue;
    }
    ctx.afterMill = last?.type === "mill" && last.who.ref === "you";
    ctx.afterAnyMill = last?.type === "mill";
    // "You may discard your hand." (Balin, Loremaster): none discarded this way if you don't.
    ctx.afterYourDiscard = effects.some((e) => (e.type === "discard" && e.who.ref === "you") || (e.type === "may" && e.effects.length === 1 && e.effects[0]!.type === "discard" && e.effects[0]!.who.ref === "you"));
    ctx.afterExileTop = last?.type === "exileTop";
    // Kari Zev, Skyship Raider: "Create Ragavan, a legendary 2/1 red Monkey creature token. Ragavan enters tapped and
    // attacking.": the token is created tapped and attacking (CR 506.3d), as "a token that's tapped and attacking".
    const named = /^[Cc]reate ([A-Z][a-z]+), (a legendary .+ token)$/.exec(s);
    if (named && sentences[si + 1] === `${named[1]} enters tapped and attacking`) {
      sentences[si + 1] = "";
      s = `${s} that's tapped and attacking`;
    }
    if (!s) continue;
    // The Parting of the Ways: "Exile the top five cards of your library. For each nonland card exiled this way, put a
    // number of time counters on that card equal to its mana value. If it doesn't have suspend, it gains suspend." (CR
    // 702.62): each such card, with no time counters for a mana value of 0, so not suspended (CR 702.62b).
    const suspendEach = ctx.afterExileTop && last?.type === "exileTop" && last.who.ref === "you" ? /^For each (nonland) card exiled this way, put a number of time counters on that card equal to its mana value$/.exec(s) : null;
    if (suspendEach && sentences[si + 1] === "If it doesn't have suspend, it gains suspend") {
      effects.push({ type: "suspendExiledTop", filter: { kind: "card", notTypes: ["Land"], text: "nonland card" } });
      si++;
      continue;
    }
    // Atemsis, All-Seeing: "you may reveal your hand. If cards with at least six different mana values are revealed this
    // way, that player loses the game." Only a hand revealed counts, so the condition is part of the "you may"; the mana
    // values are the cards' in your hand (CR 202.3), each counted once.
    const handMvs = /^[Yy]ou may reveal your hand$/.test(s) ? /^If cards with at least (two|three|four|five|six|seven) different mana values are revealed this way, (.+)$/.exec(sentences[si + 1] ?? "") : null;
    if (handMvs) {
      const then = parseSentence(capital(handMvs[2]!), ctx);
      if (!then) return null;
      const amount = { count: { kind: "cardsInHand" as const, who: { ref: "you" as const }, differentManaValues: true as const } };
      effects.push({ type: "may", text: `reveal your hand. ${sentences[si + 1]}`, effects: [{ type: "lookAtHand", who: { ref: "you" }, reveal: true }, { type: "if", cond: { kind: "state", cond: { kind: "amount", amount, min: num(handMvs[1]!) } }, effects: then }] });
      si++;
      continue;
    }
    // Isildur's Fateful Strike: "Destroy target creature. If its controller has more than four cards in hand, they exile
    // cards from their hand equal to the difference." Its controller as it last existed (CR 608.2h) chooses the cards, as
    // with "exiles a card from their hand"; with four or fewer the difference is nothing to exile.
    const overHand = /^If its controller has more than (one|two|three|four|five|six|seven) cards in hand, they exile cards from their hand equal to the difference$/.exec(s);
    if (overHand && last?.type === "destroy" && ctx.targets.length === 1 && JSON.stringify(last.what) === JSON.stringify({ ref: "target", index: 0 })) {
      const who = { ref: "targetController" as const, index: 0 };
      effects.push({ type: "discard", who, n: { count: { kind: "cardsInHand", who }, plus: -num(overHand[1]!) }, exile: true });
      continue;
    }
    // Bring the Ending: "Counter target spell unless its controller pays {2}. Corrupted — Counter that spell instead if its
    // controller has three or more poison counters." Its controller's poison counted as it resolves (CR 608.2h for a spell
    // already gone), then one or the other.
    const poisonInstead = /^Counter that spell instead if its controller has (two|three|four|five) or more poison counters$/.exec(s);
    if (poisonInstead && last?.type === "counterSpell" && last.unless && effects.length === 1 && ctx.targets.length === 1) {
      const { unless: _, ...plain } = last;
      effects[0] = { type: "if", cond: { kind: "amountNow", amount: { count: { kind: "poison", who: { ref: "targetController", index: last.index } } }, min: num(poisonInstead[1]!) }, effects: [plain], otherwise: [last] };
      continue;
    }
    // Shantotto, Tactician Magician: "~ gets +X/+0 until end of turn, where X is the amount of mana spent to cast that
    // spell. If X is 4 or more, draw a card." The same X, that spell's mana spent (the cast trigger's event amount).
    const spentX = si > 0 && /, where X is the amount of mana spent to cast that spell\.?$/.test(sentences[si - 1]!) && ctx.castSpell ? /^If X is (\w+) or more, (.+)$/.exec(s) : null;
    if (spentX) {
      const then = parseSentence(capital(spentX[2]!), ctx);
      if (!then || !JSON.stringify(effects).includes('"eventAmount"')) return null;
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "eventAmount" } }, min: num(spentX[1]!) }, effects: then });
      continue;
    }
    // Akroma, Vision of Ixidor: one instruction, before the conditions below read its "if it has" (sentences/permanents.ts).
    if (/^[Uu]ntil end of turn, each other creature you control gets \+1\/\+1 if it has flying, \+1\/\+1 if it has first strike, and so on for /.test(s)) {
      const akroma = parseSentence(capital(s), ctx);
      if (!akroma) return null;
      effects.push(...akroma);
      continue;
    }
    if (last?.type === "discard" && last.who.ref === "you" && last.n === 1) ctx.discardedOne = true;
    // Swashbuckler Extraordinaire: "you may sacrifice one or more Treasures. When you do, up to that many target creatures
    // gain double strike until end of turn." Any number, none too; the reflexive trigger (CR 603.12) has up to as many
    // targets as were sacrificed, chosen as it's put on the stack.
    const sacMany = /^[Yy]ou may sacrifice one or more ([A-Z][a-z]+s)$/.exec(s);
    const sacWhen = sacMany && /^When you do, up to (?:that many|X) (target .+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (sacMany && sacWhen) {
      const filter = parseTargetPhrase(`${sacMany[1]!.replace(/s$/, "")} you control`);
      const reflexive = filter?.kind === "object" ? reflexiveBody(`up to X ${sacWhen[1]}`, ctx, false, false, true) : null;
      if (!reflexive || filter?.kind !== "object") return null;
      effects.push({ type: "pick", who: { ref: "you" }, filter: { ...filter, text: sacMany[1]!.replace(/s$/, "") }, n: 99, action: "sacrifice", anyNumber: true });
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: [{ type: "reflexive", body: reflexive, xSacrificed: true }] });
      si++;
      continue;
    }
    // Teferi, Who Slows the Sunset: "Choose up to one target artifact, up to one target creature, and up to one target
    // land. Untap the chosen permanents you control. Tap the chosen permanents you don't control." Each target by who
    // controls it as this resolves; an illegal one is left alone (rulings).
    const chooseUpTo = /^Choose (up to one target [a-z]+(?:, up to one target [a-z]+)*,? and up to one target [a-z]+)$/.exec(s);
    if (chooseUpTo && sentences[si + 1]?.replace(/\.$/, "") === "Untap the chosen permanents you control" && sentences[si + 2]?.replace(/\.$/, "") === "Tap the chosen permanents you don't control") {
      const before = ctx.targets.length;
      const untaps = parseOne(`Untap ${chooseUpTo[1]}`, ctx);
      if (!untaps || untaps.length !== ctx.targets.length - before || untaps.some((e) => e.type !== "untap" || e.what.ref !== "target")) return null;
      for (const e of untaps) {
        if (e.type !== "untap" || e.what.ref !== "target") return null;
        effects.push({ type: "if", cond: { kind: "targetWasYours", index: e.what.index }, effects: [e], otherwise: [{ type: "tap", what: e.what }] });
      }
      si += 2;
      continue;
    }
    // Urabrask, Heretic Praetor, at the beginning of each opponent's upkeep: "the next time they would draw a card this
    // turn, instead they exile the top card of their library. They may play it this turn." That player's next draw.
    if (ctx.eventPlayer && /^[Tt]he next time (?:they|that player) would draw a card this turn, instead they exile the top card of their library$/.test(s) && /^They may play (?:it|that card) this turn$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "nextDrawExile", who: { ref: "eventPlayer" } });
      si++;
      continue;
    }
    // Call the Spirit Dragons: "For each color, put a +1/+1 counter on a Dragon you control of that color. If you put +1/+1
    // counters on five Dragons this way, you win the game." One Dragon chosen for each color in turn as it resolves, not
    // targeted; a Dragon of two colors can be chosen for each (rulings); it wins only with five different Dragons.
    const perColor = /^[Ff]or each color, put a \+1\/\+1 counter on a ([A-Z][a-z]+) you control of that color$/.exec(s);
    if (perColor && CREATURE_TYPES.has(perColor[1]!)) {
      const win = new RegExp(`^If you put \\+1\\/\\+1 counters on ${NUM} ${perColor[1]!}s this way, (you win the game)$`).exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      const st = perColor[1]!;
      for (const [c, word] of [["W", "white"], ["U", "blue"], ["B", "black"], ["R", "red"], ["G", "green"]] as const)
        effects.push({ type: "pick", who: { ref: "you" }, filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [st], colors: [c], controller: "you", text: `${word} ${st} you control` }, n: 1, action: "counters", counter: { kind: "+1/+1", n: 1 } });
      if (win) {
        const inner = parseOne(capital(win[2]!), ctx);
        if (!inner) return null;
        effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "countersPutOnThisWay" } }, min: num(win[1]!) }, effects: inner });
        si++;
      }
      continue;
    }
    // Luck Bobblehead: "If you rolled 6 exactly seven times, you win the game." The dice of this ability's roll only, an
    // ignored roll not counting (rulings, CR 706.6).
    const rolledN = effects.some((e) => e.type === "roll" && !e.eachPlayer && !e.chooseOne) ? new RegExp(`^If you rolled (\\d+) exactly ${NUM} times, (.+)$`).exec(s) : null;
    if (rolledN) {
      const inner = parseOne(capital(rolledN[3]!), ctx);
      if (!inner) return null;
      const n = num(rolledN[2]!);
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "rollEquals", value: Number(rolledN[1]) } }, min: n, max: n }, effects: inner });
      continue;
    }
    // Vivien, Champion of the Wilds: "Look at the top three cards of your library. Exile one face down and put the rest on
    // the bottom of your library in any order. For as long as it remains exiled, you may cast it if it's a creature
    // spell." One must be exiled, creature or not; it may be looked at while exiled (rulings).
    const vivien = new RegExp(`^[Ll]ook at the top ${NUM} cards of your library$`).exec(s);
    if (vivien && sentences[si + 1]?.replace(/\.$/, "") === "Exile one face down and put the rest on the bottom of your library in any order" && sentences[si + 2]?.replace(/\.$/, "") === "For as long as it remains exiled, you may cast it if it's a creature spell") {
      effects.push({ type: "hideaway", n: num(vivien[1]!), castCreature: true });
      si += 2;
      continue;
    }
    // Shyft: "At the beginning of your upkeep, you may have ~ become the color or colors of your choice." Chosen as it
    // resolves (CR 608.2d), only if you do; with no duration, for as long as it stays on the battlefield (rulings).
    if (!ctx.spell && /^[Yy]ou may have ~ become the color or colors of your choice$/.test(s)) {
      effects.push({ type: "may", effects: [{ type: "choose", choice: "colors" }, { type: "continuous", what: { ref: "self" }, mods: [{ kind: "setColors", colors: [], chosen: "colors" }], duration: "game" }], text: "have ~ become the color or colors of your choice" });
      continue;
    }
    // The Irencrag: "you may have ~ become a legendary Equipment artifact named Everflame, Heroes' Legacy. If you do, it
    // gains equip {3} and "Equipped creature gets +3/+3" and loses all other abilities." With no duration, for as long
    // as it stays on the battlefield (CR 611.2a, rulings). Its new card type and subtype replace its others (CR 205.1a),
    // it keeps being legendary (CR 205.4b), its name changes (layer 3, CR 613.1c), and in layer 6 it loses its other
    // abilities before it gains the two (CR 613.7, as one effect in the order written).
    const becomeNamed = !ctx.spell && /^[Yy]ou may have ~ become a legendary Equipment artifact named ([A-Z][^.]+)$/.exec(s);
    const namedGains = becomeNamed && /^If you do, it gains equip (\{\d+\}) and "(Equipped creature gets \+\d+\/\+\d+)" and loses all other abilities$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (becomeNamed && namedGains) {
      const mods: Modification[] = [
        { kind: "setTypes", types: ["Artifact"], subtypes: ["Equipment"], supertypes: ["Legendary"] },
        { kind: "setName", name: becomeNamed[1]! },
        { kind: "loseAllAbilities" },
        { kind: "addAbility", text: `Equip ${namedGains[1]}` },
        { kind: "addAbility", text: `${namedGains[2]}.` },
      ];
      effects.push({ type: "may", effects: [{ type: "continuous", what: { ref: "self" }, mods, duration: "game" }], text: `have ~ become ${becomeNamed[1]}` });
      si++;
      continue;
    }
    // Oubliette: "target creature phases out until ~ leaves the battlefield. Tap that creature as it phases in this way."
    // It doesn't phase in in its controller's untap step, but right after ~ leaves (rulings, CR 610.3); nothing if ~ has
    // already left.
    const phaseUntil = !ctx.spell && /^([Tt]arget creature) phases out until ~ leaves the battlefield$/.exec(s);
    if (phaseUntil && sentences[si + 1]?.replace(/\.$/, "") === "Tap that creature as it phases in this way") {
      const what = parseObject(phaseUntil[1]!.toLowerCase(), ctx);
      if (what?.ref !== "target") return null;
      effects.push({ type: "phaseOut", what, untilSourceLeaves: true });
      si++;
      continue;
    }
    // Virtue of Courage: "you may exile that many cards from the top of your library. You may play those cards this
    // turn." Whether to exile them is the choice; once they're exiled, each may be played (CR 406.3, 400.7).
    // Harnesser of Storms: "you may exile the top card of your library. Until end of turn, you may play that card." The same.
    if (/^[Yy]ou may exile the top card of your library$/.test(s) && sentences[si + 1]?.replace(/\.$/, "") === "Until end of turn, you may play that card") {
      effects.push({ type: "may", effects: [{ type: "impulse", n: 1, until: "thisTurn" }], text: "exile the top card of your library" });
      si++;
      continue;
    }
    const mayExileTop = new RegExp(`^[Yy]ou may exile ${NUMX} cards from the top of your library$`).exec(s);
    if (mayExileTop && sentences[si + 1]?.replace(/\.$/, "") === "You may play those cards this turn") {
      effects.push({ type: "may", effects: [{ type: "impulse", n: amt(mayExileTop[1]!), until: "thisTurn" }], text: `exile ${mayExileTop[1] === "X" ? "that many" : mayExileTop[1]} cards from the top of your library` });
      si++;
      continue;
    }
    // Reign of Terror: "Destroy all green creatures or all white creatures"; Lava Storm: "~ deals 2 damage to each attacking
    // creature or ~ deals 2 damage to each blocking creature": one or the other, chosen as it resolves (CR 608.2d).
    // Essence Filter: "Destroy all enchantments or all nonwhite enchantments".
    const orAll = /^(Destroy all (?:[a-z]+ )?(?:creatures|enchantments)) or all ((?:[a-z]+ )?(?:creatures|enchantments))$/.exec(s) ?? /^(~ deals \d+ damage to each [a-z]+ creature) or (~ deals \d+ damage to each [a-z]+ creature)$/.exec(s);
    if (orAll) {
      const halves = [orAll[1]!, /^Destroy/.test(orAll[1]!) ? `Destroy all ${orAll[2]}` : orAll[2]!];
      const options = halves.map((h) => parseOne(h, ctx));
      if (options.some((o) => o?.length !== 1 || (o[0]!.type !== "destroy" && o[0]!.type !== "damage") || o[0]!.type !== options[0]![0]!.type)) return null;
      effects.push({ type: "either", options: options as Effect[][], labels: halves });
      continue;
    }
    // Haunting Voyage: "Choose a creature type. Return up to two creature cards of that type ...": the type chosen.
    if (/ cards? of that type\b/.test(s) && effects.some((e) => e.type === "choose" && e.choice === "creatureType" && !e.each)) s = s.replace(/( cards?) of that type\b/g, "$1 of the chosen type");
    // Mistform Mutant, Standardize: "Choose a creature type (other than Wall). Target creature (Each creature) becomes that
    // type until end of turn.": the type chosen as it resolves (CR 608.2d), replacing its creature types (CR 205.1b).
    // Tsabo's Decree, Peer Pressure: "creatures of that type": of the chosen type.
    if (effects.some((e) => e.type === "choose" && e.choice === "creatureType" && !e.each)) s = s.replace(/\b(becomes?) that type\b/g, "$1 the chosen creature type").replace(/\b(creatures?) of that type\b/g, "$1 of the chosen type");
    // Terraformer: "Choose a basic land type. Each land you control becomes that type until end of turn."
    else if (effects.some((e) => e.type === "choose" && e.choice === "basicLandType")) s = s.replace(/\b(becomes?) that type\b/g, "$1 the chosen basic land type");
    // Lae'zel's Acrobatics: "Exile all nontoken creatures you control, then roll a d20. 1—9 | Return those cards to the
    // battlefield ... at the beginning of the next end step. 10—20 | Return those cards ..., then exile them again. Return
    // those cards ... at the beginning of the next end step." The cards the first exile exiled are held for the returns.
    const heldBack = /^Return those cards to the battlefield under their owner's control(, then exile them again| at the beginning of the next end step)?$/.exec(s);
    // Only after a die roll: a plain "Exile ..., then return those cards" is a flicker (sentences/zones.ts).
    if (heldBack && effects.some((e) => e.type === "roll")) {
      const ex = effects.findIndex((e) => e.type === "exile" || (e.type === "flicker" && e.hold));
      const prev = effects[ex];
      if (!prev || effects.some((e, i) => i !== ex && e.type !== "roll" && e.type !== "if" && e.type !== "returnHeld")) return null;
      if (prev.type === "exile") {
        if (Object.keys(prev).length !== 2 || prev.what.ref !== "each") return null;
        effects[ex] = { type: "flicker", what: prev.what, under: "owner", hold: true };
      }
      effects.push({ type: "returnHeld", under: "owner", ...(heldBack[1] === ", then exile them again" ? { thenExile: true as const } : heldBack[1] ? { at: "nextEndStep" as const } : {}) });
      continue;
    }
    // "Exile target spell. It becomes plotted." (Aven Interrupter, CR 702.170c): its owner may cast it from exile on a later
    // turn without paying its mana cost.
    // Kellan Joins Up, Jace Reawakened: "You may exile a nonland card with mana value 3 or less from your hand. If you do,
    // it becomes plotted." The card exiled this way, if one is (CR 702.170c); cast on a later turn (702.170d).
    if (/^If you do, it becomes plotted$/.test(s)) {
      const last = effects[effects.length - 1];
      const prev = last?.type === "may" && last.effects.length === 1 && !last.pay && !last.otherwise ? last.effects[0] : last?.type === "takeFromHand" && last.optional ? last : undefined;
      if (prev?.type !== "takeFromHand" || prev.action !== "exile" || prev.who.ref !== "you" || prev.n !== undefined || prev.until || prev.ownerMay || prev.linked) return null;
      prev.plot = true;
      continue;
    }
    if (/^It becomes plotted$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "counterSpell" || !prev.exileSpell || prev.n !== undefined || ctx.targets[prev.index]?.many) return null;
      prev.plot = true;
      continue;
    }
    // Invert Polarity: "Choose target spell, then flip a coin. If you win the flip, gain control of that spell and you may
    // choose new targets for it. If you lose the flip, counter that spell." New targets are chosen only after the flip is
    // won (rulings); a spell that can't be countered still changes control (CR 110.2b, 101.2).
    if (
      s === "Choose target spell" &&
      /^[Ff]lip a coin$/.test(sentences[si + 1] ?? "") &&
      sentences[si + 2]?.replace(/\.$/, "") === "If you win the flip, gain control of that spell and you may choose new targets for it" &&
      sentences[si + 3]?.replace(/\.$/, "") === "If you lose the flip, counter that spell"
    ) {
      const spec = parseTargetPhrase("spell");
      if (spec?.kind !== "spell") return null;
      const index = addTarget(ctx, { ...spec, text: "target spell" });
      effects.push(
        { type: "flipCoin" },
        { type: "if", cond: { kind: "wonFlip" }, effects: [{ type: "controlSpell", index }, { type: "newTargets", index }] },
        { type: "if", cond: { kind: "wonFlip", lost: true }, effects: [{ type: "counterSpell", index }] },
      );
      si += 3;
      continue;
    }
    // Wyll's Reversal: "Choose target spell or ability ... You may choose new targets for that spell or ability" (CR 115.7d):
    // whether to is part of choosing them (keeping them all is allowed).
    if (/^You may choose new targets for that spell(?: or ability)?$/.test(s) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "spell") {
      effects.push({ type: "newTargets", index: ctx.lastObjectTarget });
      continue;
    }
    // Invoke Calamity: "You may cast up to two instant and/or sorcery spells with total mana value 6 or less from your
    // graveyard and/or hand without paying their mana costs. If those spells would be put into your graveyard, exile them
    // instead." Cast one after the other as it resolves (rulings, CR 608.2g), from where they are; the total counts the
    // spells' mana values on the stack (rulings), X being 0 (CR 107.3b).
    const calamity = /^You may cast up to two instant and\/or sorcery spells with total mana value (\d+) or less from your graveyard and\/or hand without paying their mana costs$/.exec(s);
    if (calamity && /^If those spells would be put into your graveyard, exile them instead\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, handAndYard: true, max: 2, totalMv: Number(calamity[1]), exileCast: true, filter: { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" } });
      si++;
      continue;
    }
    // The Great Synthesis: "You may cast any number of spells from your hand without paying their mana costs": one after
    // another as it resolves, ignoring timing (CR 608.2g); X is 0 (rulings).
    if (/^You may cast any number of spells from your hand without paying their mana costs$/.test(s)) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, fromHand: true });
      continue;
    }
    // Silent-Blade Oni: "look at that player's hand. You may cast a spell from among those cards without paying its mana
    // cost"; Mindclaw Shaman: "target opponent reveals their hand. You may cast an instant or sorcery spell from among
    // those cards ...": cast from that hand as this resolves (CR 608.2g), the spell controlled by you (rulings).
    const handCast = /^You may cast (a|an instant or sorcery) spell from among those cards without paying its mana cost$/.exec(s);
    const looked = effects[effects.length - 1];
    if (handCast && looked?.type === "lookAtHand" && !looked.atRandom) {
      const filter: TargetSpec | undefined = handCast[1] === "a" ? undefined : { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" };
      effects.push({ type: "castFromAmong", who: looked.who, n: 0, fromHand: true, max: 1, ...(filter ? { filter } : {}) });
      continue;
    }
    // "Gain control of target spell. You may choose new targets for it." (Commandeer): after the change of control, so
    // its targets are chosen as its new controller's (rulings).
    if (/^You may choose new targets for it$/.test(s) && effects[effects.length - 1]?.type === "controlSpell") {
      effects.push({ type: "newTargets", index: (effects[effects.length - 1] as Extract<Effect, { type: "controlSpell" }>).index });
      continue;
    }
    // "You may cast a creature spell from your graveyard this turn" (Chainer, Nightmare Adept): a permission, not a choice.
    const yardCast = /^You may cast an? (creature|artifact|instant|sorcery) spell from your graveyard this turn$/.exec(s.replace(/\.$/, ""));
    if (yardCast) {
      const type = yardCast[1]!.charAt(0).toUpperCase() + yardCast[1]!.slice(1);
      // The Tomb of Aclazotz: "If you do, it enters with a finality counter on it and is a Vampire in addition to its other types."
      const rider = yardCast[1] === "creature" ? /^If you do, it enters with a finality counter on it and is an? ([A-Z][a-z]+) in addition to its other types\.?$/.exec(sentences[si + 1] ?? "") : null;
      if (rider && !CREATURE_TYPES.has(rider[1]!)) return null;
      effects.push({ type: "graveyardCastThisTurn", filter: { kind: "card", types: [type], notTypes: [], notColors: [], text: `${yardCast[1]} card` }, ...(rider ? { rider: { counter: "finality", subtypes: [rider[1]!] } } : {}) });
      if (rider) si++;
      continue;
    }
    // Locke, Treasure Hunter: "Each player mills a card. ... Until end of turn, you may cast a spell from among those
    // cards": one spell from among the cards that mill put into graveyards, whoever owns them, paying its costs and
    // following its timing (rulings), only through this permission.
    if (/^Until end of turn, you may cast a spell from among those cards\.?$/.test(s)) {
      const mill = effects.find((e) => e.type === "mill");
      if (!mill || effects.some((e) => e.type === "graveyardCastThisTurn")) return null;
      effects.push({ type: "graveyardCastThisTurn", filter: { kind: "card", types: [], notTypes: ["Land"], notColors: [], text: "card" }, milled: true });
      continue;
    }
    // "When ~ dies, you may cast it from your graveyard as an Adventure until the end of your next turn" (Mosswood
    // Dreadknight, Hildibrand Manderville): a permission for that card, paying its Adventure's costs and following its
    // timing (rulings), not to cast it as a creature.
    if (/^[Yy]ou may cast it from your graveyard as an Adventure until the end of your next turn$/.test(s.replace(/\.$/, ""))) {
      const what = parseObject("it", ctx);
      if (what?.ref !== "selfCard") return null;
      effects.push({ type: "mayCastFromGraveyard", what, asAdventure: true });
      continue;
    }
    // "{T}: You may cast target Zombie creature card from your graveyard this turn" (Zul Ashur, Lich Lord): a permission
    // for that card, paying its costs and following the normal timing (rulings).
    const yardTarget = /^[Yy]ou may cast (target .+? card) from your graveyard this turn$/.exec(s.replace(/\.$/, ""));
    if (yardTarget) {
      const before = ctx.targets.length;
      const what = parseCardTarget(`${yardTarget[1]} from your graveyard`, ctx, "you");
      const t = ctx.targets[before];
      if (what?.ref !== "target" || ctx.targets.length !== before + 1 || t?.kind !== "card" || !t.types?.length || t.types.includes("Land")) return null;
      // Vohar, Vodalian Desecrator: "... this turn. If that spell would be put into your graveyard, exile it instead."
      const rider = sentences[si + 1]?.replace(/\.$/, "") === "If that spell would be put into your graveyard, exile it instead";
      effects.push({ type: "mayCastFromGraveyard", what, ...(rider ? { exileAfter: true as const } : {}) });
      if (rider) si++;
      continue;
    }
    // "You may cast spells from your graveyard this turn" (Forgotten Cellar), "you may cast Zombie spells ..." (Liliana,
    // Untouched by Death), "Until end of turn, you may play lands and cast spells from your graveyard" (Yawgmoth's Will),
    // "... play lands from your graveyard" (Gaea's Will): permissions for the rest of the turn, any number of times.
    const yardTurn = /^(?:[Yy]ou may (cast|play lands and cast|play lands from your graveyard)(?: ([A-Z][a-z]+|instant and sorcery|creature))?(?: spells)?(?: from your graveyard)? this turn|Until end of turn, you may (play lands and cast spells|play lands) from your graveyard)$/.exec(s);
    if (yardTurn && !(yardTurn[1] && /graveyard$/.test(yardTurn[1]) && yardTurn[2])) {
      const how = yardTurn[1] ?? yardTurn[3]!;
      const lands = /^play lands/.test(how);
      const castsAny = /cast/.test(how);
      const kind = yardTurn[2];
      if (castsAny && !/spells/.test(s)) return null;
      const spec = kind ? parseTargetPhrase(`${kind === "instant and sorcery" ? "instant or sorcery" : kind} card from a graveyard`) : null;
      if (kind && spec?.kind !== "card") return null;
      const cast: TargetSpec | undefined = !castsAny ? undefined : spec?.kind === "card" ? (({ owner: _, ...rest }) => ({ ...rest, text: `${kind} card` }))(spec) : { kind: "card", types: [], notTypes: ["Land"], notColors: [], text: "card" };
      effects.push({ type: "graveyardTurn", ...(cast ? { cast } : {}), ...(lands ? { lands: true as const } : {}) });
      continue;
    }
    // "Until end of turn, you may cast instant and sorcery spells from any graveyard. If a spell cast this way would be put
    // into a graveyard, exile it instead." (The Great Work)
    const anyYard = /^Until end of turn, you may cast (instant and sorcery|instant|sorcery|creature) spells from any graveyard$/.exec(s);
    if (anyYard) {
      const spec = parseTargetPhrase(`${anyYard[1] === "instant and sorcery" ? "instant or sorcery" : anyYard[1]} card from a graveyard`);
      if (spec?.kind !== "card") return null;
      const { owner: _, ...rest } = spec;
      const exileCast = sentences[si + 1] === "If a spell cast this way would be put into a graveyard, exile it instead";
      effects.push({ type: "graveyardTurn", cast: { ...rest, text: `${anyYard[1]} card` }, anyGraveyard: true, ...(exileCast ? { exileCast: true as const } : {}) });
      if (exileCast) si++;
      continue;
    }
    // "Until end of turn, you may look at the top card of your library any time and you may play cards from the top of
    // your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost."
    // (Gwenom, Remorseless): Bolas's Citadel's permission for the rest of the turn (Effect topTurn).
    const topTurn = /^[Uu]ntil end of turn, you may look at the top card of your library any time and (you may .+)$/.exec(s);
    if (topTurn) {
      const top = parseFromTop(topTurn[1]!);
      const life = sentences[si + 1] === "If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost";
      if (!top || (life && !top.spells)) return null;
      effects.push({ type: "topTurn", top: { ...top, ...(life ? { payLife: true as const } : {}) } });
      if (life) si++;
      continue;
    }
    if (/^If a card would be put into your graveyard from anywhere this turn, exile (?:it|that card) instead$/.test(s)) {
      effects.push({ type: "graveyardTurn", exileInstead: true });
      continue;
    }
    // Cultivator Colossus: "you may put a land card from your hand onto the battlefield tapped. If you do, draw a card and
    // repeat this process": until you decline or have none, all in this resolution (rulings).
    if (/^If you do, draw a card and repeat this process\.?$/.test(s)) {
      const may = effects[effects.length - 1];
      const prev = may?.type === "may" && !may.pay && may.effects.length === 1 ? may.effects[0] : undefined;
      if (effects.length !== 1 || prev?.type !== "putFromHand" || prev.any || prev.who || prev.attacking || si + 1 !== sentences.length) return null;
      effects[0] = { ...prev, may: true, drawRepeat: true };
      continue;
    }
    // "Put them into their owner's graveyard, then ~ deals that much damage to each opponent" (Valakut Exploration): the
    // number of cards the move put there (rulings: one played in response isn't counted).
    if (last?.type === "moveLinked" && last.dest === "graveyard" && !last.one && /^~ deals that much damage to each opponent$/.test(s.replace(/\.$/, ""))) {
      effects.push({ type: "damage", amount: { count: { kind: "movedLinkedThisWay" } }, to: { ref: "eachOpponent" } });
      continue;
    }
    // Currency Converter: "Put a card exiled with ~ into its owner's graveyard. If it's a land card, create a Treasure token.
    // If it's a nonland card, ...": the card that moved, by its printed characteristics; nothing if none did.
    const movedIs = effects.some((e) => e.type === "moveLinked" && e.one && e.dest === "graveyard") ? /^If it's an? (.+? card), (.+)$/.exec(s) : null;
    if (movedIs) {
      const filter = parseSearchFilter(movedIs[1]!);
      const then = filter && parseOne(capital(movedIs[2]!), ctx);
      if (!filter || !then) return null;
      effects.push({ type: "if", cond: { kind: "movedLinkedIs", filter }, effects: then });
      continue;
    }
    // "At the beginning of the next end step, sacrifice that creature" (Meek Attack) is "Sacrifice that creature at the
    // beginning of the next end step" (one instruction, no condition).
    // Berserk: "At the beginning of the next end step, destroy that creature if it attacked this turn": checked as the
    // delayed trigger resolves; it's destroyed even if it stopped being a creature (rulings).
    if (s === "At the beginning of the next end step, destroy that creature if it attacked this turn") {
      const later = parseOne("Destroy that creature at the beginning of the next end step", ctx);
      const d = later?.length === 1 && later[0]!.type === "delayed" ? later[0]! : undefined;
      if (!d || d.type !== "delayed") return null;
      effects.push({ ...d, effects: [{ type: "if", cond: { kind: "subjectIs", filter: { kind: "object", types: [], combat: "attackedThisTurn", text: "permanent that attacked this turn" } }, effects: d.effects }], text: "Destroy that creature if it attacked this turn" });
      continue;
    }
    const atNext = /^At the beginning of (the|your) next end step, ((?:sacrifice|exile|destroy|return) [^,]+)$/.exec(s);
    if (atNext && !/\b(?:if|unless|then|instead)\b| to the battlefield/.test(atNext[2]!)) s = `${atNext[2]!.charAt(0).toUpperCase()}${atNext[2]!.slice(1)} at the beginning of ${atNext[1]} next end step`;
    // "Sacrifice any number of other permanents, then draw that many cards" (God-Eternal Bontu), "you may sacrifice any
    // number of other creatures. If you do, draw that many cards" (Sephiroth): any number, none too (CR 107.1c), picked
    // as it resolves; "that many" is how many were sacrificed (none: nothing to draw).
    // Lethal Scheme: "Each creature that convoked ~ connives" (CR 702.51a, 701.50): one at a time (rulings), each of the
    // creatures tapped for it, at most one for each mana its cost could have (here up to ten).
    if (s === "Each creature that convoked ~ connives" && ctx.spell) {
      for (let i = 0; i < 10; i++) effects.push({ type: "connive", what: { ref: "convoker", index: i }, n: 1 });
      continue;
    }
    // Abdel Adrian: "exile any number of other nonland permanents you control until ~ leaves the battlefield" (CR 610.3),
    // Glorious Protector: "you may exile any number of non-Angel creatures you control ...": chosen as it resolves, none
    // too, then exiled together.
    const anyExile = !ctx.spell ? /^(?:[Yy]ou may )?[Ee]xile any number of (other )?(.+?) you control until ~ leaves the battlefield$/.exec(s) : null;
    if (anyExile) {
      const filter = pickFilter(anyExile[2]!);
      if (!filter) return null;
      effects.push({ type: "pick", who: { ref: "you" }, filter: anyExile[1] ? { ...filter, notSource: true, text: `other ${filter.text}` } : filter, n: 1, action: "choose", anyNumber: true }, { type: "exile", what: { ref: "created" }, until: "sourceLeaves" });
      continue;
    }
    // Garnet, Princess of Alexandria: "you may remove a lore counter from each of any number of Sagas you control. Put a
    // +1/+1 counter on ~ for each lore counter removed this way": the Sagas chosen as it resolves, none too, then one
    // lore counter off each (a Saga with none loses none and adds nothing, CR 122.8 counts only those removed). Removing
    // lore counters doesn't trigger chapters; the next lore counters put on it do again (CR 714.2c, rulings).
    const loreOff = !ctx.spell ? /^(?:[Yy]ou may )?[Rr]emove a lore counter from each of any number of Sagas you control$/.exec(s) : null;
    if (loreOff && /^Put a \+1\/\+1 counter on ~ for each lore counter removed this way$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const filter = pickFilter("Sagas");
      if (!filter) return null;
      effects.push(
        { type: "pick", who: { ref: "you" }, filter, n: 1, action: "choose", anyNumber: true, prompt: "click any number of your Sagas to remove a lore counter from each, then choose them (a +1/+1 counter on ~ for each one removed)." },
        { type: "removeCounters", what: { ref: "created" }, counter: "lore", n: 1 },
        { type: "counters", what: { ref: "self" }, counter: "+1/+1", n: { count: { kind: "countersRemovedThisWay" } } },
      );
      si++;
      continue;
    }
    // Yorion, Sky Nomad: "exile any number of other nonland permanents you own and control. Return those cards to the
    // battlefield at the beginning of the next end step": chosen as it resolves (rulings), exiled together, and returned
    // together by one delayed trigger (CR 603.7) under your control (CR 110.2a); a token doesn't come back (rulings).
    const anyUntilEnd = !ctx.spell ? /^[Ee]xile any number of (other )?(.+?) you own and control$/.exec(s) : null;
    if (anyUntilEnd && /^Return those cards to the battlefield at the beginning of the next end step$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const filter = pickFilter(`${anyUntilEnd[2]!} you control`);
      if (filter?.kind !== "object") return null;
      si++;
      effects.push({ type: "pick", who: { ref: "you" }, filter: { ...filter, owner: "you", ...(anyUntilEnd[1] ? { notSource: true } : {}), text: `${anyUntilEnd[1] ?? ""}${anyUntilEnd[2]!} you own and control` }, n: 1, action: "flicker", anyNumber: true }, { type: "flicker", what: { ref: "created" }, under: "you", at: "nextEndStep" });
      continue;
    }
    // Another Round: "Exile any number of creatures you control, then return them to the battlefield under their owner's
    // control. Then repeat this process X more times." Chosen as it resolves, each time anew (rulings), exiled and
    // returned together; a token doesn't come back (CR 111.7).
    const anyFlicker = /^[Ee]xile any number of (.+?) you control$/.exec(s);
    if (anyFlicker && /^(?:Then r|R)eturn them to the battlefield under their owner's control$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      si++;
      const filter = pickFilter(anyFlicker[1]!);
      if (!filter) return null;
      const pass: Effect[] = [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "flicker", anyNumber: true }, { type: "flicker", what: { ref: "created" }, under: "owner" }];
      const more = /^Then repeat this process (X|once|twice|\w+) more times?$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (!more) {
        effects.push(...pass);
        continue;
      }
      if (more[1] !== "X" || !ctx.spell) return null;
      effects.push({ type: "repeat", effects: pass, n: { count: { kind: "x" }, plus: 1 } });
      si++;
      continue;
    }
    // Clockwork Beast: "Put up to X +1/+0 counters on ~. This ability can't cause the total number of +1/+0 counters on ~ to
    // be greater than seven." With X chosen as it's activated, "up to X" is any number from 0 to X (rulings), the same as
    // X itself as far as the counters go; none past the total (rulings).
    const capped = new RegExp(`^Put up to X ${COUNTER} counters on ~$`).exec(s);
    const cap = capped && new RegExp(`^This ability can't cause the total number of ${COUNTER} counters on ~ to be greater than (one|two|three|four|five|six|seven|eight|nine|ten)$`).exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (capped && cap && cap[1] === capped[1] && ctx.activated) {
      effects.push({ type: "counters", what: { ref: "self" }, counter: capped[1]!, n: X, maxTotal: num(cap[2]!) });
      si++;
      continue;
    }
    // Psychic Spiral: "Shuffle all cards from your graveyard into your library. Target player mills that many cards.": as
    // many as were shuffled in.
    if (/^Shuffle all cards from your graveyard into your library$/.test(s) && /^Target player mills that many cards\.?$/.test(sentences[si + 1] ?? "")) {
      const before = ctx.targets.length;
      const mill = parseOne("Target player mills X cards", ctx);
      if (!mill || ctx.targets.length !== before + 1) return null;
      effects.push({ type: "shuffleZones", who: { ref: "you" }, graveyard: true, countThisWay: true }, ...replaceX(mill, { count: { kind: "movedLinkedThisWay" } }));
      si++;
      continue;
    }
    // Vengeful Regrowth: "Return up to three target land cards from your graveyard to the battlefield tapped. Create that
    // many 4/2 green Plant Warrior creature tokens with reach": as many as it returned (rulings).
    if (/^Return up to (?:two|three|four|five) target [a-z]+ cards from your graveyard to the battlefield(?: tapped)?$/.test(s) && !effects.length && /^Create that many /.test(thatManyNext(sentences, si))) {
      const before = ctx.targets.length;
      const put = parseOne(s, ctx);
      const after = ctx.targets.length;
      const next = put && parseOne(thatManyNext(sentences, si).replace(/\bthat many\b/, "X"), ctx);
      if (put?.length !== 1 || put[0]!.type !== "putOntoBattlefield" || put[0]!.what.ref !== "target" || after <= before || !next || ctx.targets.length !== after) return null;
      effects.push(...put, ...replaceX(next, { count: { kind: "putThisWay" } }));
      si++;
      continue;
    }
    // "Sacrifice any number of lands. Search your library for up to that many land cards, put them onto the battlefield
    // tapped, then shuffle." (Scapeshift): the same count.
    // Flame Sweep: "~ deals 2 damage to each creature except for creatures you control with flying": each creature an
    // opponent controls or without flying.
    const sweep = /^~ deals (\d+) damage to each creature except for creatures you control with flying$/.exec(s);
    if (sweep) {
      const filter: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], anyOf: [{ kind: "object", controller: "opponent", text: "an opponent controls" }, { kind: "object", notKeywords: ["Flying"], text: "without flying" }], text: "creature except for creatures you control with flying" };
      effects.push({ type: "damage", amount: Number(sweep[1]), to: { ref: "each", filter } });
      continue;
    }
    // Priest of the Wakening Sun: "You may reveal a Dinosaur card from your hand. If you do, you gain 2 life.": one card or
    // none, chosen as it resolves (CR 701.20a); the rest only if one was revealed.
    // Sarkhan, Dragon Ascendant: "You may behold a Dragon. If you do, ...": a Dragon you control or a Dragon card revealed
    // from your hand (CR 701.4a), chosen as it resolves.
    const revealOne = /^[Yy]ou may (?:reveal an? ([A-Z][a-z]+|[a-z]+) card from your hand|behold an? ([A-Z][a-z]+))$/.exec(s);
    const revealDo = revealOne && /^If you do, (.+?)\.?$/.exec(sentences[si + 1] ?? "");
    if (revealOne && revealDo && (!revealOne[2] || CREATURE_TYPES.has(revealOne[2]))) {
      const filter = parseSearchFilter(`${revealOne[1] ?? revealOne[2]} card`);
      const before = ctx.targets.length;
      const fx = filter ? parseOne(capital(revealDo[1]!), ctx) : null;
      if (!filter || !fx?.length || ctx.targets.length !== before) return null;
      effects.push({ type: "revealFromHand", filter, one: true, ...(revealOne[2] ? { orControl: true as const } : {}) }, { type: "if", cond: { kind: "amountNow", amount: { count: { kind: "revealedFromHand" } }, min: 1 }, effects: fx });
      si++;
      continue;
    }
    // Sweep (Plow Through Reito): "Return any number of Plains you control to their owner's hand. Target creature gets
    // +1/+1 until end of turn for each Plains returned this way.": returned as it resolves, not as a cost (rulings), as
    // many as you choose (CR 107.1c); counted as those put into a hand.
    const sweepBack = /^Return any number of ([A-Z][a-z]+) you control to their owner's hand$/.exec(s);
    if (sweepBack && !ctx.bouncedAny && new RegExp(`\\b${singularWord(sweepBack[1]!).replace(/s$/, "")}s? returned this way\\b`).test(sentences[si + 1] ?? "")) {
      const filter = pickFilter(sweepBack[1]!);
      if (!filter || filter.kind !== "object" || !filter.subtypes?.length) return null;
      effects.push({ type: "pick", who: { ref: "you" }, filter, n: 1, action: "bounce", anyNumber: true });
      ctx.bouncedAny = sweepBack[1]!;
      continue;
    }
    // Sacred Rites: "Discard any number of cards. Creatures you control get +0/+1 until end of turn for each card
    // discarded this way.": none or more, chosen as it resolves (CR 107.1c).
    if (s === "Discard any number of cards" && /\bfor each card discarded this way\b/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "discard", who: { ref: "you" }, n: 99, upTo: true });
      continue;
    }
    // Landslide: "Sacrifice any number of Mountains. ~ deals that much damage to target player or planeswalker.": one
    // damage for each Mountain sacrificed, as it resolves (rulings).
    const slide = /^Sacrifice any number of ([A-Z][a-z]+)$/.exec(s);
    const slideNext = sentences[si + 1]?.replace(/\.$/, "") ?? "";
    if (slide && /^~ deals that much damage to target [a-z ]+$/.test(slideNext)) {
      const filter = pickFilter(slide[1]!);
      const fx = filter && parseOne(slideNext.replace("that much", "X"), ctx);
      if (!filter || filter.kind !== "object" || fx?.length !== 1 || fx[0]!.type !== "damage") return null;
      effects.push({ type: "pick", who: { ref: "you" }, filter, n: 1, action: "sacrifice", anyNumber: true }, ...replaceX(fx, { count: { kind: "sacrificedThisWayCount" } }));
      si++;
      continue;
    }
    // Mana Seism: "Sacrifice any number of lands, then add that much {C}": one {C} for each land sacrificed.
    const seism = /^[Ss]acrifice any number of lands$/.test(s) && /^(?:[Tt]hen )?[Aa]dd that much \{C\}$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    const anySac = /^(?:[Yy]ou may )?[Ss]acrifice any number of (other )?(.+)$/.exec(s);
    const thatMany = sentences[si + 1]?.replace(/\.$/, "").replace(/^If you do, /, "") ?? "";
    if (anySac && (seism || (/\bthat many\b/.test(thatMany) && !/\bthat many\b.*\bthat many\b/.test(thatMany)))) {
      const filter = pickFilter(anySac[2]!);
      if (!filter) return null;
      const before = ctx.targets.length;
      const next = seism ? [{ type: "addMana" as const, mana: "{C}", times: { count: { kind: "x" as const } } }] : parseOne(capital(thatMany.replace(/\bthat many\b/, "X")), ctx);
      if (!next || ctx.targets.length !== before) return null;
      effects.push({ type: "pick", who: { ref: "you" }, filter: anySac[1] ? { ...filter, notSource: true, text: `other ${filter.text}` } : filter, n: 1, action: "sacrifice", anyNumber: true }, ...replaceX(next, { count: { kind: "sacrificedThisWayCount" } }));
      si++;
      continue;
    }
    // Hellion Eruption: "Sacrifice all creatures you control, then create that many 4/4 red Hellion creature tokens": as many
    // as were sacrificed.
    if (/^[Ss]acrifice all [^.]+ you control$/.test(s) && /\bthat many\b/.test(thatMany) && !/\bthat many\b.*\bthat many\b/.test(thatMany) && /^[Cc]reate that many /.test(thatMany)) {
      const before = ctx.targets.length;
      const sac = parseOne(s, ctx);
      const next = sac && parseOne(capital(thatMany.replace(/\bthat many\b/, "X")), ctx);
      if (!sac || sac.length !== 1 || sac[0]!.type !== "sacrifice" || !next || ctx.targets.length !== before) return null;
      effects.push(...sac, ...replaceX(next, { count: { kind: "sacrificedThisWayCount" } }));
      si++;
      continue;
    }
    // Nahiri's Lithoforming: "Sacrifice X lands. For each land sacrificed this way, draw a card.": as many as it sacrificed
    // (fewer than X with fewer lands, rulings).
    const sacX = /^[Ss]acrifice X (lands|creatures|artifacts|permanents)$/.exec(s);
    const perSac = sacX ? new RegExp(`^For each ${sacX[1]!.replace(/s$/, "")} sacrificed this way, draw a card$`).test(sentences[si + 1]?.replace(/\.$/, "") ?? "") : false;
    if (sacX && perSac) {
      const filter = pickFilter(sacX[1]!);
      if (!filter) return null;
      effects.push({ type: "pick", who: { ref: "you" }, filter, n: { count: { kind: "x" } }, action: "sacrifice" }, { type: "draw", who: { ref: "you" }, n: { count: { kind: "sacrificedThisWayCount" } } });
      si++;
      continue;
    }
    // "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the
    // battlefield tapped." (Victimize): the targets, chosen as it's cast (CR 601.2c); "the chosen cards" are them.
    const chooseCards = /^Choose ((?:two|three) target [a-z]+ cards) in your graveyard$/.exec(s);
    if (chooseCards) {
      const what = parseObject(`${chooseCards[1]} from your graveyard`, ctx, true);
      if (what?.ref !== "target" || !what.n) return null;
      chosenCards = what;
      continue;
    }
    // "Each player sacrifices a creature or planeswalker of their choice. Each player who can't discards a card."
    // (Plaguecrafter): those who had none to sacrifice, after the sacrifices (rulings).
    // Skull Storm: "Each opponent who can't loses half their life, rounded up": each of them, by their own life total.
    const cant = /^Each (player|opponent) who can't (?:discards (a card|two cards)|(loses half their life, rounded up))$/.exec(s);
    const pickPrev = effects[effects.length - 1];
    if (cant && pickPrev?.type === "pick" && pickPrev.action === "sacrifice" && pickPrev.who.ref === (cant[1] === "player" ? "eachPlayer" : "eachOpponent") && !pickPrev.unless) {
      effects.push(cant[3] ? { type: "loseLife", who: { ref: "couldntPick" }, n: { count: { kind: "life", who: { ref: "eachOne" } }, half: "up" } } : { type: "discard", who: { ref: "couldntPick" }, n: cant[2] === "a card" ? 1 : 2, random: false });
      continue;
    }
    // Transmute Artifact: "Search your library for an artifact card. If that card's mana value is less than or equal to the
    // sacrificed artifact's mana value, put it onto the battlefield. If it's greater, you may pay {X}, where X is the
    // difference. If you do, put it onto the battlefield. If you don't, put it into its owner's graveyard. Then shuffle."
    // One search; the {X} is paid as it resolves, after the card is found (rulings).
    const payDiff = /^If you do, (search your library for an? [A-Za-z ]+? card)$/.exec(s);
    const payPrev = effects[effects.length - 1];
    const payMv = payDiff && /^If that card's mana value is less than or equal to (the sacrificed (?:artifact|creature|enchantment|permanent)'s mana value), put it onto the battlefield$/.exec(sentences[si + 1] ?? "");
    if (payMv && payPrev?.type === "pick" && payPrev.action === "sacrifice" && payPrev.who.ref === "you" && payPrev.n === 1 && !payPrev.unless && sentences[si + 2] === "If it's greater, you may pay {X}, where X is the difference" && sentences[si + 3] === "If you do, put it onto the battlefield" && sentences[si + 4] === "If you don't, put it into its owner's graveyard" && /^Then,? shuffle$/.test(sentences[si + 5] ?? "")) {
      const fx = parseOne(`${capital(payDiff![1]!)}, put it onto the battlefield, then shuffle`, ctx);
      const mv = parseCount(payMv[1]!, ctx);
      if (!mv || fx?.length !== 1 || fx[0]!.type !== "search" || fx[0]!.n !== 1 || fx[0]!.upTo || fx[0]!.others) return null;
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: [{ ...fx[0]!, payDiff: mv }] });
      si += 5;
      continue;
    }
    // "Search your library for a creature or land card and reveal it. Put it onto the battlefield tapped if it's a land
    // card. Otherwise, put it into your hand. Then shuffle." (Archdruid's Charm): one search, the land card's own destination.
    const searchReveal = /^Search your library for (an? [A-Za-z ]+? card) and reveal it$/.exec(s);
    if (searchReveal && sentences[si + 1] === "Put it onto the battlefield tapped if it's a land card" && sentences[si + 2] === "Otherwise, put it into your hand" && /^Then,? shuffle$/.test(sentences[si + 3] ?? "")) {
      const fx = parseOne(`Search your library for ${searchReveal[1]}, reveal it, put it into your hand, then shuffle`, ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "search") return null;
      effects.push({ ...fx[0]!, landTo: { zone: "battlefield", tapped: true } });
      si += 3;
      continue;
    }
    // Guidelight Pathmaker: "you may search your library for an artifact card and reveal it. Put it onto the battlefield if
    // its mana value is 2 or less. Otherwise, put it into your hand. If you search your library this way, shuffle.": one
    // search, the card's destination by its mana value; shuffled only if searched (rulings).
    const mvTo = /^([Yy]ou may )?[Ss]earch your library for (an? [A-Za-z ]+? card) and reveal it$/.exec(s);
    const mvIf = mvTo && /^Put it onto the battlefield if its mana value is (\d+) or less$/.exec(sentences[si + 1] ?? "");
    if (mvTo && mvIf && sentences[si + 2] === "Otherwise, put it into your hand" && sentences[si + 3]?.replace(/\.$/, "") === "If you search your library this way, shuffle") {
      const fx = parseOne(`Search your library for ${mvTo[2]}, reveal it, put it into your hand, then shuffle`, ctx);
      const card = parseSearchFilter(`card with mana value ${mvIf[1]} or less`);
      if (fx?.length !== 1 || fx[0]!.type !== "search" || !card) return null;
      const search: Effect = { ...fx[0]!, cardTo: { card, dest: { zone: "battlefield" } } };
      effects.push(mvTo[1] ? { type: "may", effects: [search], text: sentences.slice(si, si + 4).join(". ").replace(/^[Yy]ou may /, "") } : search);
      si += 3;
      continue;
    }
    // Treasure Chest: "Search your library for a card. If it's an artifact card, you may put it onto the battlefield.
    // Otherwise, put that card into your hand. Then shuffle." The card found goes onto the battlefield instead only if it's
    // of that type and the searcher wants it there.
    const ifTypeInstead = /^Search your library for a card$/.test(s) ? /^If it's an? (artifact|creature|land|enchantment|permanent) card, you may put it onto the battlefield$/.exec(sentences[si + 1] ?? "") : null;
    if (ifTypeInstead && sentences[si + 2] === "Otherwise, put that card into your hand" && /^Then,? shuffle$/.test(sentences[si + 3] ?? "")) {
      const fx = parseOne("Search your library for a card, put it into your hand, then shuffle", ctx);
      const card = parseSearchFilter(`${ifTypeInstead[1]} card`);
      if (fx?.length !== 1 || fx[0]!.type !== "search" || !card) return null;
      effects.push({ ...fx[0]!, mayInstead: { dest: { zone: "battlefield" }, card } });
      si += 3;
      continue;
    }
    // Loyal Inventor: "you may search your library for an artifact card, reveal it, then shuffle. Put that card into your
    // hand if you control an Assassin. Otherwise, put that card on top of your library.": shuffled first, then put where the
    // condition says, as it's put there.
    const searchThen = /^([Yy]ou may )?[Ss]earch your library for (an? [^,]+ card), reveal it, then shuffle$/.exec(s);
    const handIf = searchThen && /^Put that card into your hand if (.+)$/.exec(sentences[si + 1] ?? "");
    if (searchThen && handIf && sentences[si + 2]?.replace(/\.$/, "") === "Otherwise, put that card on top of your library") {
      const fx = parseOne(`Search your library for ${searchThen[2]}, reveal it, then shuffle and put that card on top`, ctx);
      const cond = parseStaticCondition(handIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (fx?.length !== 1 || fx[0]!.type !== "search" || fx[0]!.dest.zone !== "libraryTop" || !cond) return null;
      const search: Effect = { ...fx[0]!, condDest: { cond, dest: { zone: "hand" } } };
      effects.push(searchThen[1] ? { type: "may", effects: [search], text: [s, sentences[si + 1], sentences[si + 2]].join(". ").replace(/^[Yy]ou may /, "") } : search);
      si += 2;
      continue;
    }
    // Dina's Guidance: "Search your library for a creature card, reveal it, put it into your hand or graveyard, then
    // shuffle": the searcher chooses which as it's put there.
    const handOrYard = /^Search your library for (an? [^,]+ card), reveal it, put it into your hand or graveyard, then shuffle$/.exec(s);
    if (handOrYard) {
      const fx = parseOne(`Search your library for ${handOrYard[1]}, reveal it, put it into your hand, then shuffle`, ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "search") return null;
      effects.push({ ...fx[0]!, mayInstead: { dest: { zone: "graveyard" } } });
      continue;
    }
    // Caravan Vigil: "Search your library for a basic land card, reveal it, put it into your hand, then shuffle. You may put
    // that card onto the battlefield instead of putting it into your hand if a creature died this turn.": one search; the
    // card goes onto the battlefield instead only if the condition holds then, and the player wants it to.
    const searchHand = /^Search your library for (an? [^,]+ card), reveal it, put it into your hand, then shuffle$/.exec(s);
    const handInstead = searchHand && /^(?:[A-Z][a-z]+ — )?You may put that card onto the battlefield( tapped)? instead of putting it into your hand if (.+)$/.exec(sentences[si + 1] ?? "");
    if (searchHand && handInstead) {
      const fx = parseOne(s, ctx);
      const cond = parseStaticCondition(handInstead[2]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (fx?.length !== 1 || fx[0]!.type !== "search" || !cond) return null;
      effects.push({ ...fx[0]!, mayInstead: { dest: { zone: "battlefield", ...(handInstead[1] ? { tapped: true } : {}) }, cond } });
      si++;
      continue;
    }
    // Scholar of New Horizons: "Search your library for a Plains card and reveal it. If an opponent controls more lands
    // than you, you may put that card onto the battlefield tapped. If you don't put the card onto the battlefield, put it
    // into your hand. Then shuffle." One search; the card found goes onto the battlefield instead only if the condition
    // holds then, and the player wants it to (rulings).
    const mayInstead = searchReveal && /^If (.+), you may put that card onto the battlefield( tapped)?$/.exec(sentences[si + 1] ?? "");
    if (searchReveal && mayInstead && sentences[si + 2] === "If you don't put the card onto the battlefield, put it into your hand" && /^Then,? shuffle$/.test(sentences[si + 3] ?? "")) {
      const fx = parseOne(`Search your library for ${searchReveal[1]}, reveal it, put it into your hand, then shuffle`, ctx);
      const cond = parseStaticCondition(mayInstead[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (fx?.length !== 1 || fx[0]!.type !== "search" || !cond) return null;
      effects.push({ ...fx[0]!, mayInstead: { dest: { zone: "battlefield", ...(mayInstead[2] ? { tapped: true } : {}) }, cond } });
      si += 3;
      continue;
    }
    // Necromantic Selection: "Destroy all creatures, then return a creature card put into a graveyard this way to the
    // battlefield under your control": one of those that died (CR 700.4), chosen as it resolves.
    // Zero Point Ballad: "Destroy all creatures with toughness X or less. You lose X life. If X is 6 or more, return a
    // creature card put into a graveyard this way ...": the destroy is an earlier instruction, the condition X as cast.
    const diedBack = /^(?:If X is (\d+) or more, r|R)eturn an? (creature card) put into a graveyard this way to the battlefield under your control$/.exec(s);
    const prevDestroy = diedBack?.[1] ? effects.find((x) => x.type === "destroy") : effects[effects.length - 1];
    if (diedBack && prevDestroy?.type === "destroy" && prevDestroy.what.ref === "each" && effects.filter((x) => x.type === "destroy").length === 1) {
      const filter = parseSearchFilter(diedBack[2]!);
      if (!filter) return null;
      const back: Effect = { type: "returnDiedThisWay", filter };
      effects.push(diedBack[1] ? { type: "if", cond: { kind: "xAtLeast", n: Number(diedBack[1]) }, effects: [back] } : back);
      continue;
    }
    // Sorin, Lord of Innistrad: "Destroy up to three target creatures and/or other planeswalkers. Return each card put
    // into a graveyard this way to the battlefield under your control." The cards the destroy put there, still there (a
    // token isn't a card, and a commander its owner put into the command zone isn't there: CR 903.9a).
    const lastKill = effects[effects.length - 1];
    if (/^Return each card put into a graveyard this way to the battlefield under your control$/.test(s) && lastKill?.type === "destroy" && lastKill.what.ref === "target" && effects.filter((x) => x.type === "destroy").length === 1) {
      effects.push({ type: "returnDiedThisWay", each: true, filter: { kind: "card", types: [], notTypes: [], notColors: [], text: "card" } });
      continue;
    }
    // Tuktuk Scrapper: "you may destroy target artifact. If that artifact is put into a graveyard this way, ~ deals damage to
    // that artifact's controller ...": only if it went to a graveyard (rulings: not if it's indestructible, regenerated,
    // not destroyed, or moved elsewhere instead; a token goes there first).
    const intoYard = /^If that (artifact|creature|enchantment|permanent) is put into a graveyard this way, (.+)$/.exec(s);
    const mayKill = effects[effects.length - 1];
    const killed = mayKill?.type === "may" && !mayKill.pay && !mayKill.otherwise && mayKill.effects.length === 1 ? mayKill.effects[0]! : mayKill;
    if (intoYard && killed?.type === "destroy" && killed.what.ref === "target" && !killed.what.n && ctx.targets[killed.what.index]?.kind === "object" && effects.filter((x) => x.type === "destroy" || x.type === "may").length === 1) {
      const inner = parseOne(capital(intoYard[2]!), ctx);
      if (!inner) return null;
      const check: Effect = { type: "if", cond: { kind: "destroyedThisWay", died: true }, effects: inner };
      if (mayKill !== killed) (mayKill as Extract<Effect, { type: "may" }>).effects.push(check);
      else effects.push(check);
      continue;
    }
    // Come Back Wrong: "Destroy target creature. If a creature card is put into a graveyard this way, return it to the
    // battlefield under your control. Sacrifice it at the beginning of your next end step." The card the destroy put
    // there (a token isn't a card), with no chance to act in between (rulings).
    const cardBack = /^If an? (creature card) is put into a graveyard this way, return it to the battlefield under your control$/.exec(s);
    const lastDestroy = effects[effects.length - 1];
    if (cardBack && lastDestroy?.type === "destroy" && lastDestroy.what.ref === "target" && effects.filter((x) => x.type === "destroy").length === 1) {
      const filter = parseSearchFilter(cardBack[1]!);
      if (!filter) return null;
      const sac = /^Sacrifice it at the beginning of (the|your) next end step$/.exec(sentences[si + 1] ?? "");
      effects.push({ type: "returnDiedThisWay", filter, ...(sac ? { atEndStep: sac[1] === "your" ? ("yourNextEndStep" as const) : ("nextEndStep" as const) } : {}) });
      if (sac) si++;
      continue;
    }
    // Nissa's Pilgrimage: "If there are two or more instant and/or sorcery cards in your graveyard, search your library
    // for up to three basic Forest cards instead of two": the same search, for more cards while that's true as it resolves.
    const moreIf = /^If (.+), search your library for up to (two|three|four|five) (.+?) instead of (one|two|three|four)$/.exec(s);
    const lastSearch = effects[effects.length - 1];
    if (moreIf && lastSearch?.type === "search" && lastSearch.upTo && lastSearch.n === NUMBER_WORDS[moreIf[4]!] && lastSearch.filter && parseSearchFilter(moreIf[3]!)?.text === lastSearch.filter.text) {
      const cond = parseStaticCondition(moreIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond) return null;
      effects[effects.length - 1] = { type: "if", cond: { kind: "state", cond }, effects: [{ ...lastSearch, n: NUMBER_WORDS[moreIf[2]!]! }], otherwise: [lastSearch] };
      continue;
    }
    // Charnel Troll: "exile a creature card from your graveyard. If you do, put a +1/+1 counter on ~. Otherwise, sacrifice
    // it.": you must exile one if you can (rulings), so it's done exactly when there's one there as it resolves; "it" is ~,
    // the only permanent named.
    const yardDo = /^[Ee]xile an? ([a-z]+ card) from your graveyard$/.exec(s);
    const yardThen = yardDo && /^If you do, (.+?)\.?$/.exec(sentences[si + 1] ?? "");
    const yardElse = yardThen && /^Otherwise, sacrifice (?:it|~)\.?$/.test(sentences[si + 2] ?? "");
    if (yardDo && yardThen && yardElse) {
      const fx = parseOne(s, ctx);
      const n = parseCount(`the number of ${yardDo[1]}s in your graveyard`, ctx);
      const then = parseOne(capital(yardThen[1]!), ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "chooseFromGraveyard" || !n || typeof n !== "object" || !then) return null;
      effects.push({ type: "if", cond: { kind: "amountNow", amount: n, min: 1 }, effects: [...fx, ...then], otherwise: [{ type: "sacrifice", what: { ref: "self" } }] });
      si += 2;
      continue;
    }
    // "Sacrifice a creature. If you do, ...": only if one was sacrificed (you must if you can, rulings on Victimize).
    const sacDo = /^If you do, (.+)$/.exec(s);
    const sacPrev = effects[effects.length - 1];
    // "Sacrifice ~. If you do, create Marit Lage ..." (Dark Depths): only if it was sacrificed (it may have left already,
    // or be one that can't be sacrificed).
    if (sacDo && !/, where X is /.test(s) && ((sacPrev?.type === "pick" && sacPrev.action === "sacrifice" && sacPrev.who.ref === "you" && sacPrev.n === 1 && !sacPrev.unless) || (sacPrev?.type === "sacrifice" && sacPrev.what.ref === "self" && !sacPrev.byController))) {
      // A target in it ("If you do, return target artifact card from your graveyard to the battlefield", Daretti) is
      // chosen as the ability is put on the stack, like any other (CR 601.2c).
      const back = /^return the chosen cards to the battlefield( tapped)?$/.exec(sacDo[1]!);
      // Aspiring Champion: "sacrifice it. If you do, reveal cards ... until you reveal a creature card. Put that card onto
      // the battlefield, then ...": all the rest of the ability, with no targets.
      if (/^reveal cards from the top of your library until /.test(sacDo[1]!) && sacPrev?.type === "sacrifice") {
        const rest = parseBody(`${[capital(sacDo[1]!), ...sentences.slice(si + 1).map((x) => x.replace(/\.$/, ""))].join(". ")}.`);
        if (!rest || rest.targets.length) return null;
        effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: rest.effects });
        si = sentences.length;
        continue;
      }
      const inner: Effect[] | null = back ? (chosenCards ? [{ type: "putOntoBattlefield", what: chosenCards, ...(back[1] ? { tapped: true } : {}) }] : null) : parseOne(capital(sacDo[1]!), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: inner });
      continue;
    }
    // Serendib Djinn: "Sacrifice a land. If you sacrifice an Island this way, ~ deals 3 damage to you.": the land as it
    // last existed (CR 608.2h).
    const sacSub = /^If you sacrifice an? ([A-Z][a-z]+) this way, (.+)$/.exec(s);
    if (sacSub && sacPrev?.type === "pick" && sacPrev.action === "sacrifice" && sacPrev.who.ref === "you" && sacPrev.n === 1 && !sacPrev.unless && !sacPrev.anyNumber) {
      const inner = parseOne(capital(sacSub[2]!), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay", subtype: sacSub[1]! }, effects: inner });
      continue;
    }
    // Mazemind Tome: "When there are four or more page counters on ~, exile it. If you do, you gain 4 life.": only if it was
    // exiled from the battlefield (rulings: not from the zone it went to if it left first).
    if (sacDo && !/, where X is /.test(s) && sacPrev?.type === "exile" && sacPrev.what.ref === "self" && Object.keys(sacPrev).length === 2) {
      const inner = parseOne(capital(sacDo[1]!), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "exiledThisWay" }, effects: inner });
      continue;
    }
    // Self-Inflicted Wound: "Target opponent sacrifices a green or white creature of their choice. If that player does, they
    // lose 2 life.": only if that player sacrificed one.
    const sacTheyDo = /^If that player does, they (lose \d+ life)$/.exec(s);
    if (sacTheyDo && sacPrev?.type === "pick" && sacPrev.action === "sacrifice" && sacPrev.who.ref === "target" && sacPrev.n === 1 && !sacPrev.unless) {
      const inner = parseOne(`That player ${sacTheyDo[1]!.replace(/^lose/, "loses")}`, ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: inner });
      continue;
    }
    // Tevesh Szat: "You may sacrifice another creature or planeswalker. If you do, draw two cards. If the sacrificed
    // permanent was a commander, draw a card." (its "then ... if" made a sentence of its own above): as it last existed.
    const sacCmd = /^If the sacrificed permanent was a commander, (.+)$/.exec(s);
    const [mayPrev, didPrev] = [effects[effects.length - 2], effects[effects.length - 1]];
    if (sacCmd && didPrev?.type === "if" && didPrev.cond.kind === "youDid" && mayPrev?.type === "may" && mayPrev.effects.length === 1 && mayPrev.effects[0]!.type === "pick" && mayPrev.effects[0]!.action === "sacrifice" && mayPrev.effects[0]!.who.ref === "you") {
      const inner = parseOne(capital(sacCmd[1]!), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay", commander: true }, effects: inner });
      continue;
    }
    // Starfall Invocation: "Destroy all creatures. If the gift was promised, return a creature card put into your graveyard
    // this way to the battlefield under your control." One of the cards that died to it, chosen as it resolves (rulings).
    const starfall = /^(If the gift was promised, )?[Rr]eturn a creature card put into your graveyard this way to the battlefield under your control$/.exec(s);
    if (starfall && effects.some((e) => e.type === "destroy" && e.what.ref === "each")) {
      const inner = parseOne("Return a creature card from your graveyard to the battlefield", ctx);
      if (inner?.length !== 1 || inner[0]!.type !== "chooseFromGraveyard") return null;
      const back: Effect = { ...inner[0]!, destroyedThisWay: true };
      effects.push(starfall[1] ? { type: "if", cond: { kind: "gift" }, effects: [back] } : back);
      continue;
    }
    // "Each player sacrifices a creature of their choice. If you sacrificed a creature this way, you may return another
    // permanent card from your graveyard to the battlefield." (Rise of the Witch-king): chosen after the sacrifices, and
    // not the card you sacrificed (rulings).
    // Deadly Brew: "Each player sacrifices a creature or planeswalker of their choice. If you sacrificed a permanent this
    // way, you may return another permanent card from your graveyard to your hand": the same, to your hand (rulings).
    const sacYou = /^If you sacrificed a (creature|permanent) this way, you may return another permanent card from your graveyard to (the battlefield|your hand)$/.exec(s);
    const sacTypes = sacYou?.[1] === "creature" ? ["Creature"] : ["Creature,Planeswalker"];
    if (sacYou && sacPrev?.type === "pick" && sacPrev.action === "sacrifice" && sacPrev.who.ref === "eachPlayer" && sacPrev.n === 1 && !sacPrev.unless && sacTypes.includes(sacPrev.filter?.types?.join() ?? "")) {
      const inner = parseOne(`Return a permanent card from your graveyard to ${sacYou[2]}`, ctx);
      if (inner?.length !== 1 || inner[0]!.type !== "chooseFromGraveyard") return null;
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay", you: true }, effects: [{ ...inner[0]!, upTo: true, notSacrificed: true }] });
      continue;
    }
    // "Return a land you control to its owner's hand. If another Desert was returned this way, surveil 1" (Arid Archway).
    const bounced = /^If another ([A-Z][a-z]+) was returned this way, (.+)$/.exec(s);
    if (bounced && sacPrev?.type === "pick" && sacPrev.action === "bounce" && sacPrev.who.ref === "you" && sacPrev.n === 1 && !sacPrev.unless && !ctx.spell) {
      const before = ctx.targets.length;
      const inner = parseOne(capital(bounced[2]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "bouncedThisWay", subtype: bounced[1]!, another: true }, effects: inner });
      continue;
    }
    // Egon, God of Death: "exile two cards from your graveyard. If you can't, sacrifice ~ and draw a card": with fewer than
    // two there, none are exiled and the rest happens instead (rulings).
    const yardExile = new RegExp(`^[Ee]xile ${NUM} cards from your graveyard$`).exec(s);
    const yardCant = yardExile && /^If you can't, (.+?)\.?$/.exec(sentences[si + 1] ?? "");
    if (yardExile && yardCant && num(yardExile[1]!) > 1) {
      const before = ctx.targets.length;
      const exile = parseOne(capital(s), ctx);
      const inner = parseOne(capital(yardCant[1]!), ctx);
      const yard = parseCount("the number of cards in your graveyard", ctx);
      if (!exile || !inner || !yard || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "amountNow", amount: yard, min: num(yardExile[1]!) }, effects: exile, otherwise: inner });
      si++;
      continue;
    }
    // Roots of Wisdom: "return a land card or Elf card from your graveyard to your hand. If you can't, draw a card.": you
    // must return one if there's one (rulings), so the rest happens only with none there.
    const yardReturn = /^[Rr]eturn an? [^.]+? card from your graveyard to your hand$/.test(s) ? /^If you can't, (.+?)\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (yardReturn) {
      const before = ctx.targets.length;
      const ret = parseOne(capital(s), ctx);
      const inner = parseOne(capital(yardReturn[1]!), ctx);
      const pick = ret?.length === 1 && ret[0]!.type === "chooseFromGraveyard" ? ret[0] : undefined;
      if (pick?.type !== "chooseFromGraveyard" || pick.n !== 1 || pick.upTo || pick.who || pick.dest || !pick.filter || Object.keys(pick).length !== 3 || !inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "cardsInGraveyard", who: { ref: "you" }, filter: pick.filter } }, min: 1 }, effects: [pick], otherwise: inner });
      si++;
      continue;
    }
    // "Sacrifice a creature. If you can't, sacrifice ~." (Eldrazi Monument): you must if you can, so only when none was.
    // "That player sacrifices a creature of their choice. If the player can't, you create a ... token" (Wasitora): the
    // same, for that one player.
    // Invoke Despair: "Target opponent sacrifices a creature of their choice. If they can't, they lose 2 life and you draw a
    // card." ("they" is that player).
    const sacCant = /^If (you|the player|that player|they) can't, (.+)$/.exec(s);
    const sacWho = sacPrev?.type === "pick" ? sacPrev.who : undefined;
    if (sacCant && sacPrev?.type === "pick" && sacPrev.action === "sacrifice" && (sacCant[1] === "you" ? sacWho?.ref === "you" : sacWho?.ref === "eventPlayer" || (sacWho?.ref === "target" && !sacWho.n)) && sacPrev.n === 1 && !sacPrev.unless && !sacPrev.anyNumber && !sacPrev.upTo) {
      const before = ctx.targets.length;
      const text = sacCant[1] === "they" ? sacCant[2]!.replace(/^they (lose|gain|draw|discard|mill)\b/, "that player $1s") : sacCant[2]!;
      if (sacCant[1] === "they" && /\b(?:they|them|their)\b/.test(text)) return null;
      const inner = parseOne(capital(text), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      // "Then repeat this process for an enchantment and a planeswalker": the same player sacrifices one of each in turn,
      // each "if they can't" about that one alone (rulings), whether or not the ones before were sacrificed. Worked out
      // here by how many have been sacrificed so far: after k of them, this one was if there are k + 1.
      const again = /^Then repeat this process for (an? [a-z]+(?:, an? [a-z]+)*,? and an? [a-z]+)\.?$/.exec(sentences[si + 1] ?? "");
      if (again) {
        const kinds = again[1]!.split(/,? and |, /).map((w) => w.replace(/^an? /, ""));
        const filters = kinds.map((w) => pickFilter(w));
        if (filters.some((f) => !f)) return null;
        const pickOf = (f: TargetSpec): Effect => ({ ...sacPrev, filter: f });
        const steps = (rest: TargetSpec[], k: number): Effect[] => {
          if (!rest.length) return [];
          return [pickOf(rest[0]!), { type: "if", cond: { kind: "amountNow", amount: { count: { kind: "sacrificedThisWayCount" } }, min: k + 1 }, effects: steps(rest.slice(1), k + 1), otherwise: [...inner, ...steps(rest.slice(1), k)] }];
        };
        effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: steps(filters as TargetSpec[], 1), otherwise: [...inner, ...steps(filters as TargetSpec[], 0)] });
        si++;
        continue;
      }
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: [], otherwise: inner });
      continue;
    }
    // "15—20 | Create one of those tokens. You may roll again." (Delina, Wild Mage): the same roll and its results table
    // once more, if its controller wants (CR 706.3c); the last instruction of a row.
    if (s === "You may roll again") {
      if (!row || sentences[si + 1] !== undefined && !sentences[si + 1]!.startsWith(ROW_MARK) || effects.filter((e) => e.type === "roll").length !== 1) return null;
      effects.push({ type: "rollAgain" });
      continue;
    }
    // Flood of Tears: "Return all nonland permanents to their owners' hands. If you return four or more nontoken permanents
    // you control this way, you may put a permanent card from your hand onto the battlefield."
    const returnedFour = new RegExp(`^If you return ${NUM} or more nontoken permanents you control this way, (.+)$`).exec(s);
    if (returnedFour && last?.type === "bounce" && last.what.ref === "each") {
      const before = ctx.targets.length;
      const inner = parseOne(capital(returnedFour[2]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "returnedYoursAtLeast", n: num(returnedFour[1]!) }, effects: inner });
      continue;
    }
    // "Roll a d20 and subtract the number of cards in your hand. If the result is 0 or less, discard your hand." (The Deck
    // of Many Things): the result after the modifier (CR 706.2, rulings), before the results table.
    // Sword of Hours: "If the result is greater than the damage dealt or the result is 12, ...": the damage its "deals
    // combat damage" trigger is about (CR 603.2).
    const aboveDealt = /^If the result is greater than the damage this trigger is about or the result is (\d+), (.+)$/.exec(s);
    if (aboveDealt && !row && effects.length === 1 && effects[0]!.type === "roll" && !effects[0].n) {
      const before = ctx.targets.length;
      const inner = parseOne(capital(aboveDealt[2]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "rollIn", aboveEvent: true, min: Number(aboveDealt[1]) }, effects: inner });
      continue;
    }
    const resultIs = /^If the result is (\d+) or (less|greater), (.+)$/.exec(s);
    if (resultIs && !row && effects.some((e) => e.type === "roll")) {
      const before = ctx.targets.length;
      const inner = parseOne(capital(resultIs[3]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      const n = Number(resultIs[1]);
      effects.push({ type: "if", cond: { kind: "rollIn", ...(resultIs[2] === "less" ? { max: n } : { min: n }) }, effects: inner });
      continue;
    }
    if (s.startsWith(ROW_MARK)) {
      // Rows only after the roll (CR 706.3b).
      if (payFirst || dig || !closeGate() || !closeRow() || !allEffects(effects).some((e) => e.type === "roll")) return null;
      const [a, b] = s.slice(ROW_MARK.length).split("|");
      row = { start: effects.length, ...(b === "-" ? { max: Number(a) } : b === "+" ? { min: Number(a) } : { min: Number(a), max: Number(b) }) };
      continue;
    }
    // "~ gains indestructible until end of turn. Tap it." (Icehide Troll): "it" is the permanent the sentence before was
    // about, when that sentence was about ~ itself and nothing else.
    if (/^(?:Tap|Untap) it$/.test(s) && si > 0 && /^~ (?:gets|gains|has|becomes)\b/.test(sentences[si - 1]!) && !/\btarget\b/.test(sentences[si - 1]!)) s = s.replace(/it$/, "~");
    // "Put seven +1/+1 counters on ~. It becomes a 0/0 Spirit creature" (Haunted Screen), "~ becomes a Werewolf. Put two
    // +1/+1 counters on it" (Mild-Mannered Librarian): "it" is ~, when the sentence before was about ~ and nothing else.
    const aboutSelf = si > 0 && /^(?:~ (?:gets|gains|has|becomes)\b|[Pp]ut [^.]+ counters? on ~$)/.test(sentences[si - 1]!) && !/\b(?:target|it|them)\b/.test(sentences[si - 1]!);
    if (aboutSelf && /^It (?:becomes|gains|gets) /.test(s)) s = s.replace(/^It /, "~ ");
    if (aboutSelf && /^Put [^.]+ counters? on it(?: and |$)/.test(s)) s = s.replace(/ counters? on it\b/, (w) => w.replace(/it$/, "~"));
    // Aligned Heart: "Put a rally counter on ~. Then create a 1/1 white Monk creature token with prowess for each rally
    // counter on it": ~'s counters.
    if (aboutSelf && /^(?:Then )?[Cc]reate [^.]+ for each [a-z+\/-]+ counter on it$/.test(s)) s = s.replace(/ on it$/, " on ~");
    // "Put three +1/+1 counters on ~ and it becomes a black Demon ..." (Possessed Goat): two instructions about ~.
    const putThen = /^(Put [^.]+ counters? on ~) and it (becomes .+)$/.exec(s);
    if (putThen) {
      s = putThen[1]!;
      sentences.splice(si + 1, 0, `~ ${putThen[2]!}`);
    }
    if (!closeGate()) return null;
    [prevStart, curStart] = [curStart, effects.length];
    if (!thenParts.has(sentences[si]!)) [prevWhole, curWhole] = [curWhole, effects.length];
    [prevTargets, curTargets] = [curTargets, ctx.targets.length];
    // "Until end of turn, you don't lose unspent red mana as steps and phases end" (The Last Agni Kai, CR 500.4).
    const keepMana = /^Until end of turn, you don't lose unspent (?:(white|blue|black|red|green) )?mana as steps and phases end$/.exec(s);
    if (keepMana) {
      const color = keepMana[1] ? (({ white: "W", blue: "U", black: "B", red: "R", green: "G" }) as const)[keepMana[1] as "red"] : undefined;
      effects.push({ type: "keepManaThisTurn", ...(color ? { color } : {}) });
      continue;
    }
    // "Add {R}. Until end of turn, you don't lose this mana as steps and phases end" (CR 500.4): the mana the sentence
    // before added, unless it can only be spent some ways.
    // After "Spend this mana only to cast spells" (Klauth): the mana the sentence before that one added, restricted and kept.
    if (/^Until end of turn, you don't lose this mana as steps and phases end$/.test(s)) {
      const spendBefore = si > 0 && /^(?:[Ss]pend this mana only |This mana can't be spent to cast (?:non|spells$))/.test(sentences[si - 1]!);
      const added = spendBefore ? spendAdded : allEffects(effects.slice(prevStart)).filter((e): e is Extract<Effect, { type: "addMana" }> => e.type === "addMana");
      if (!added.length || si === 0 || (!spendBefore && /can't be spent/.test(sentences[si - 1]!)) || (!spendBefore && /[Ss]pend this mana only/.test(sentences[si - 1]!))) return null;
      for (const e of added) e.keep = "turn";
      continue;
    }
    // "Add {U}{R}. Spend this mana only to cast instant and sorcery spells" (Abstract Paintmage, CR 106.6): the mana the
    // sentence before added.
    if (/^(?:Spend this mana only |This mana can't be spent to cast (?:non|spells$))/.test(s)) {
      const added = allEffects(effects.slice(prevStart)).filter((e): e is Extract<Effect, { type: "addMana" }> => e.type === "addMana");
      const only = parseManaSpend(`${s}.`);
      if (!added.length || !only || added.some((e) => e.only)) return null;
      for (const e of added) e.only = only;
      spendAdded = added;
      continue;
    }
    // Cards exiled face down that you may look at and play (Three Wishes, Gonti, Outrageous Robbery, Intet; CR 406.3).
    const faceDown = parseFaceDownPlay(sentences, si, ctx);
    if (faceDown === "fail") return null;
    if (faceDown) {
      effects.push(faceDown.effect);
      si = faceDown.next - 1;
      continue;
    }
    const untilNonland = parseUntilNonland(sentences, si, ctx);
    if (untilNonland === "fail") return null;
    if (untilNonland) {
      effects.push(untilNonland.effect);
      si = untilNonland.next - 1;
      continue;
    }
    const untilBottom = ctx.revealedUntil ? /^Put (the revealed cards|all cards revealed this way|the nonland card into your hand and the rest) on the bottom of your library in any order$/.exec(s) : null;
    if (untilBottom) {
      effects.push({ type: "revealedUntilToBottom", ...(/^the nonland card/.test(untilBottom[1]!) ? { hand: true as const } : {}) });
      ctx.revealedUntil = false;
      continue;
    }
    // "Exile target nonland permanent. For as long as that card remains exiled, its owner may cast it" (Aerial
    // Extortionist, Release to the Wind's "without paying its mana cost", Soul Partition's "may play it"): a permission for
    // that card in exile (CR 400.7), its owner's; "A spell cast (by an opponent) this way costs {2} more to cast".
    // "Choose an exiled card an opponent owns with a void counter on it. You may play it this turn without paying its
    // mana cost." (Dauthi Voidwalker)
    const voidPick = /^Choose an exiled card an opponent owns with an? ([a-z]+) counter on it$/.exec(s);
    const voidPlay = voidPick && /^You may play (?:it|that card) this turn( without paying its mana cost)?$/.exec(sentences[si + 1] ?? "");
    if (voidPick && voidPlay) {
      effects.push({ type: "playExiled", counter: counterKind(voidPick[1]!), ...(voidPlay[1] ? { free: true as const } : {}) });
      si++;
      continue;
    }
    const ownerMay =
      /^For as long as (?:that card|it) remains exiled, its owner may (cast|play) it( without paying its mana cost)?$/.exec(s) ??
      /^For each of those cards, its owner may (play|cast) it for as long as it remains exiled()$/.exec(s);
    if (ownerMay) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exile" || prev.until || prev.linked || prev.ownerMay || (prev.what.ref !== "target" && prev.what.ref !== "each")) return null;
      prev.ownerMay = { ...(ownerMay[1] === "play" ? { play: true as const } : {}), ...(ownerMay[2] ? { free: true as const } : {}) };
      const tax = /^A spell cast (by an opponent )?this way costs \{(\d+)\} more to cast$/.exec(sentences[si + 1] ?? "");
      if (tax) {
        prev.ownerMay.more = Number(tax[2]);
        if (tax[1]) prev.ownerMay.moreOpponents = true;
        si++;
      }
      continue;
    }
    // Hostage Taker: "exile another target creature or artifact until ~ leaves the battlefield. You may cast that card for
    // as long as it remains exiled, and mana of any type can be spent to cast that spell": a permission for the
    // ability's controller (CR 609.4b), that card only while it stays exiled (CR 400.7).
    // Dire Fleet Daredevil: "exile target instant or sorcery card from an opponent's graveyard. You may cast it this turn, and
    // mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead": a
    // card from a graveyard, cast with its usual timing this turn (rulings).
    // Savvy Trader: "exile target permanent card from your graveyard. You may play that card for as long as it remains
    // exiled": a land too, with a land play (CR 305.1).
    // Thor, God of Thunder: "Until the end of your next turn, you may play that card" (Practiced Scrollsmith: "cast").
    // Hurl Through Hell: "Exile target creature. Until the end of your next turn, you may cast that card and you may spend
    // mana as though it were mana of any color to cast that spell": the card the creature became in exile (CR 400.7), a
    // token ceasing to exist (CR 704.5d); cast only, so an animated land card can't be played (rulings).
    const untilNext = /^Until the end of your next turn, you may (cast|play) that card( and you may spend mana as though it were mana of any color to cast that spell)?$/.exec(s);
    const youCast0 = untilNext ? ([s, untilNext[1]!, "until the end of your next turn", untilNext[2]] as unknown as RegExpExecArray) : /^You may (cast|play) (?:that card|it) (for as long as it remains exiled|this turn)(, and mana of any type can be spent to cast (?:that spell|it))?$/.exec(s);
    // "You may cast that card this turn" after something other than an exile (Emry) is read elsewhere.
    const youCast = youCast0 && (youCast0[2] !== "this turn" || effects[effects.length - 1]?.type === "exile") && (youCast0[1] === "cast" || (youCast0[2] !== "this turn" && !youCast0[3] && effects[effects.length - 1]?.type === "exile")) ? youCast0 : null;
    if (youCast) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exile" || prev.linked || prev.ownerMay || prev.youMay || prev.what.ref !== "target" || (prev.what.n ?? 1) !== 1) return null;
      const thisTurn = youCast[2] === "this turn";
      const nextTurn = youCast[2] === "until the end of your next turn";
      const play = youCast[1] === "play";
      const exileAfter = !play && sentences[si + 1]?.replace(/\.$/, "") === "If that spell would be put into a graveyard, exile it instead";
      if ((thisTurn || nextTurn || play) && ctx.targets[prev.what.index]?.kind !== "card" && !(untilNext?.[2] && !play && ctx.targets[prev.what.index]?.kind === "object")) return null;
      prev.youMay = { ...(youCast[3] ? { anyType: true as const } : {}), ...(thisTurn ? { thisTurn: true as const } : {}), ...(nextTurn ? { nextTurn: true as const } : {}), ...(play ? { play: true as const } : {}), ...(exileAfter ? { exileAfter: true as const } : {}) };
      if (exileAfter) si++;
      continue;
    }
    // A tempting offer and the like: "Each opponent may create a Treasure token. For each opponent who does, you create a
    // Treasure token." (Tempting Contract), "each player may put two +1/+1 counters on a creature they control. For each
    // opponent who does, you gain protection from that player until your next turn" (Noble Heritage). Each decides in
    // turn order, then it happens for each who accepted, then the rest for each opponent who did (rulings).
    // Only with "For each ... who does": a plain "each player may" (Will of the Jeskai's wheel) is parsed elsewhere.
    // Heartwood Storyteller: "each of that player's opponents may draw a card": every other player (no teams), each deciding.
    if (ctx.eventPlayer && /^[Ee]ach of that player's opponents may draw a card$/.test(s)) {
      effects.push({ type: "eachMay", who: { ref: "otherPlayers" }, effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "draw a card", each: true });
      ctx.eachChose = true;
      continue;
    }
    const offer = /^(?:Then )?[Ee]ach (opponent|player) may (.+)$/.exec(s);
    const does = offer && /^For each (opponent|player) who does, (.+)$/.exec(sentences[si + 1] ?? "");
    const offerFx = offer && does && !/\b(?:that player|it|its|them|this way|instead)\b/.test(offer[2]!) ? parseOffer(offer[2]!, ctx) : null;
    // "Any player may sacrifice a land of their choice. If a player does, put ~ on top of its owner's library" (Argothian
    // Wurm), "any opponent may have it deal 4 damage to them. If a player does, sacrifice ~" (Vexing Devil), "Any player
    // may have ~ deal 5 damage to them. If no one does, target player draws three cards" (Browbeat): a punisher whose
    // instructions happen once, if anyone did or if no one did (see its `mode`).
    const anyMay = /^[Aa]ny (player|opponent) may (.+)$/.exec(s);
    const anyThen = anyMay && /^If (a player does|no one does), (.+)$/.exec(sentences[si + 1] ?? "");
    if (anyMay && anyThen) {
      const options = parsePunisherOptions(anyMay[2]!.replace(/^(sacrifice|discard|pay|have)\b/, (w) => (w === "have" ? "have" : `${w}s`)), ctx);
      // "Tap ~ and put a +1/+1 counter on it", "tap ~, you gain 3 life, and you draw a card": several instructions,
      // with no targets of their own.
      // "Destroy all creatures. Creatures destroyed this way can't be regenerated" (Breaking Point): its next sentence too.
      const noRegen = /can't be regenerated$/.test(sentences[si + 2] ?? "") ? sentences[si + 2]! : "";
      const thenText = anyThen[2]!.replace(/^(.+?), (you [^,]+), and (you .+)$/, (_, a: string, b: string, c: string) => `${a}. ${capital(b)}. ${capital(c)}`);
      const one = options && !noRegen && thenText === anyThen[2] ? attempt(ctx, () => parseOne(capital(thenText), ctx)) : null;
      const whole = options && !one ? parseBody(`${capital(thenText)}.${noRegen ? ` ${noRegen}.` : ""}`, { ...(ctx.selfIt || /~/.test(thenText) ? { selfIt: true } : {}), ...(ctx.selfCastSpell ? { selfCastSpell: true } : {}), ...(ctx.spell ? { spell: true } : {}) }) : null;
      const then = one ?? (whole && !whole.targets.length ? whole.effects : null);
      if (!options || !then) return null;
      if (noRegen) si++;
      effects.push({ type: "punisher", who: { ref: anyMay[1] === "player" ? "eachPlayer" : "eachOpponent" }, options, effects: then, mode: anyThen[1] === "a player does" ? "ifAny" : "ifNone", thenText: anyThen[2]! });
      si++;
      continue;
    }
    // "Target opponent may have you draw three cards. If the player doesn't, you mill three cards, then ~ deals damage to
    // that player equal to the total mana value of those cards." (Combustible Gearhulk), "defending player may have you
    // draw a card. If they do, untap ~ and remove it from combat" (Shakedown Heavy): that player decides as it resolves
    // (CR 608.2d), and what happens either way is yours to do.
    // Join forces (Minds Aglow, Collective Voyage, Alliance of Arms): "Starting with you, each player may pay any amount of
    // mana. Each player draws X cards, where X is the total amount of mana paid this way."
    if (/^Starting with you, each player may pay any amount of mana$/.test(s)) {
      // "..., where X is the total amount of mana paid this way, puts them onto the battlefield tapped" (Collective Voyage).
      const where = /^(.+?), where X is the total amount of mana paid this way(, .+)?$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (!where) return null;
      ctx.whereX = true;
      const fx = attempt(ctx, () => parseOne(capital(`${where[1]!}${where[2] ?? ""}`), ctx));
      ctx.whereX = false;
      if (!fx) return null;
      effects.push({ type: "joinForces" }, ...replaceX(fx, { count: { kind: "joinForcesPaid" } }));
      si++;
      continue;
    }
    // Liege of the Hollows: "Each player may pay any amount of mana. Then each player creates a number of 1/1 green
    // Squirrel creature tokens equal to the amount of mana they paid this way." Starting with the active player (rulings).
    const theyPaid = /^[Ee]ach player may pay any amount of mana$/.test(s) ? /^Then each player creates a number of (.+? tokens?) equal to the amount of mana they paid this way$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (theyPaid) {
      ctx.whereX = true;
      const fx = attempt(ctx, () => parseOne(`Each player creates X ${theyPaid[1]!}`, ctx));
      ctx.whereX = false;
      if (!fx || fx.length !== 1 || fx[0]!.type !== "createToken") return null;
      effects.push({ type: "joinForces", activeFirst: true }, ...replaceX(fx, { count: { kind: "joinForcesPaid", whose: { ref: "eachOne" } } }));
      si++;
      continue;
    }
    // "Target opponent may have ~ deal 4 damage to them. If that player doesn't, you draw three cards." (Risk Factor): the
    // same, the damage to that player.
    const haveDeal = /^(?:Then )?([Tt]arget opponent) may have ~ (deal \d+ damage) to them$/.exec(s);
    const haveYou = haveDeal ?? /^(?:Then )?([Tt]arget opponent|[Dd]efending player) may have you (.+)$/.exec(s);
    const haveIf = haveYou && /^If (?:the player|that player|they) (doesn't|don't|does|do), (.+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (haveYou && haveIf) {
      const who = parsePlayer(haveYou[1]!.toLowerCase(), ctx);
      if (!who || who.ref === "you") return null;
      const what = attempt(ctx, () => parseOne(haveDeal ? `~ ${haveDeal[2]!.replace(/^deal/, "deals")} to that player` : `You ${haveYou[2]!}`, ctx));
      if (!what || what.some((e) => pauses(e))) return null;
      ctx.milledThisWay = true;
      // "You mill X cards, where X is the number of influence counters on ~, and that player loses life equal to ..."
      // (Palantír of Orthanc): two instructions.
      const two = /^(you mill X cards, where X is [^,]+), and (that player .+)$/.exec(haveIf[2]!);
      const one = (text: string): Effect[] | null => {
        const where = /^(.+), where X is (.+)$/.exec(text);
        if (!where) return attempt(ctx, () => parseOne(capital(text), ctx));
        ctx.whereX = true;
        const fx = attempt(ctx, () => parseOne(capital(where[1]!), ctx));
        ctx.whereX = false;
        const def = fx && parseCount(where[2]!.replace(/ counters on it$/, " counters on ~"), ctx);
        return fx && def ? replaceX(fx, def) : null;
      };
      const then = two ? ((a, b) => (a && b ? [...a, ...b] : null))(one(two[1]!), one(two[2]!)) : one(haveIf[2]!);
      ctx.milledThisWay = undefined;
      if (!then) return null;
      effects.push({ type: "eachMay", who, effects: what, text: haveDeal ? `have ~ ${haveDeal[2]!} to them` : `have ~'s controller ${haveYou[2]!}` }, { type: "if", cond: { kind: "theyChose", ...(/n't$/.test(haveIf[1]!) ? { not: true as const } : {}) }, effects: then });
      si++;
      continue;
    }
    // "Whenever a creature deals combat damage to one of your opponents, its controller may pay 1 life. If they do, they
    // draw a card." (Gix): the creature's controller decides and pays as it resolves (CR 608.2d), as it last existed.
    const itsPay = ctx.subjectIt ? /^[Ii]ts controller may pay (\d+) life$/.exec(s) : null;
    const itsDraw = itsPay && /^If they do, they draw (a card|two cards)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (itsPay && itsDraw) {
      effects.push({ type: "eachMay", who: { ref: "subjectController" }, pay: { life: Number(itsPay[1]) }, text: `pay ${itsPay[1]} life to draw ${itsDraw[1]}`, effects: [{ type: "draw", who: { ref: "choseThisWay" }, n: itsDraw[1] === "a card" ? 1 : 2 }] });
      si++;
      continue;
    }
    // "Whenever an artifact or creature an opponent controls enters untapped, they may tap that permanent. If they don't,
    // you create a 1/1 white Vampire creature token with lifelink." (Charismatic Conqueror): its controller decides as it
    // resolves; one that's tapped or gone by then can't be tapped, so the token comes (rulings).
    const tapThat = ctx.subject ? /^(?:[Tt]hey|[Tt]hat player) may tap that (permanent|creature|artifact)$/.exec(s) : null;
    const tapIf = tapThat && /^If (?:they|that player|the player) (?:doesn't|don't), (.+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (tapThat && tapIf) {
      const what = attempt(ctx, () => parseOne(`Tap that ${tapThat[1]!}`, ctx));
      const then = what && attempt(ctx, () => parseOne(capital(tapIf[1]!), ctx));
      if (!what || !then) return null;
      effects.push({ type: "eachMay", who: { ref: "subjectController" }, effects: what, text: `tap that ${tapThat[1]!}`, untappedSubject: true }, { type: "if", cond: { kind: "theyChose", not: true }, effects: then });
      si++;
      continue;
    }
    // "Choose up to one target nonland permanent. Its controller may sacrifice it. If they don't, ~ deals 5 damage to that
    // player." (Star Athlete): its controller decides as it resolves; with no target nothing happens (rulings).
    const athleteChoose = /^[Cc]hoose (up to one )?target ([^.]+)$/.exec(s);
    const athleteThen = athleteChoose && sentences[si + 1]?.replace(/\.$/, "") === "Its controller may sacrifice it" ? /^If they don't, (~ deals \d+ damage) to that player$/.exec(sentences[si + 2]?.replace(/\.$/, "") ?? "") : null;
    if (athleteChoose && athleteThen) {
      const spec = parseTargetPhrase(athleteChoose[2]!);
      if (spec?.kind !== "object") return null;
      const index = addTarget(ctx, { ...spec, ...(athleteChoose[1] ? { optional: true } : {}), text: `${athleteChoose[1] ?? ""}target ${athleteChoose[2]!}` });
      const dmg = parseOne(`${athleteThen[1]!} to each opponent`, ctx);
      if (dmg?.length !== 1 || dmg[0]!.type !== "damage") return null;
      effects.push(
        { type: "eachMay", who: { ref: "targetController", index }, effects: [{ type: "sacrifice", what: { ref: "target", index }, byController: true }], text: `sacrifice the targeted ${athleteChoose[2]!}; if you don't, ${athleteThen[1]!} to you` },
        { type: "if", cond: { kind: "theyChose", not: true }, effects: [{ ...dmg[0]!, to: { ref: "targetController", index } }] },
      );
      si += 2;
      continue;
    }
    // "Whenever a player casts their first spell each turn, choose another target player. ~ deals damage equal to that
    // spell's mana value to the chosen player." (The Lord of Pain): a player other than the caster (rulings).
    const another = ctx.eventPlayer && /^[Cc]hoose another target player$/.test(s) ? /^(.+) to the chosen player$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (another) {
      const fx = parseOne(`${another[1]!} to target player other than that player`, ctx);
      if (!fx) return null;
      effects.push(...fx);
      si++;
      continue;
    }
    // "Each opponent may discard a card. If they don't, they lose 3 life." (Professor Onyx): a punisher, "loses 3 life
    // unless they discard a card".
    const mayOut = /^([Ee]ach opponent|[Tt]arget opponent|[Tt]arget player|[Tt]hat player) may (discard|sacrifice) (.+)$/.exec(s);
    // Pillar Tombs of Aku: "... If that player doesn't, they lose 5 life and you sacrifice ~": your part after theirs.
    const mayLose = mayOut && new RegExp(`^If (?:they|that player|the player) (?:doesn't|don't), (?:they|that player|the player) loses? (\\d+) life(?: and you (sacrifice ~))?$`).exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (mayOut && mayLose) {
      const fx = parseOne(`${mayOut[1]!} loses ${mayLose[1]!} life unless they ${mayOut[2]!}s ${mayOut[3]!}`, ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "punisher") return null;
      if (mayLose[2]) {
        const more = parseOne(capital(mayLose[2]), ctx);
        if (more?.length !== 1 || more[0]!.type !== "sacrifice") return null;
        fx[0] = { ...fx[0]!, effects: [...fx[0]!.effects, ...more], penalty: `Lose ${mayLose[1]} life ({you} sacrifices ~)` };
      }
      effects.push(...fx);
      si++;
      continue;
    }
    // "Target opponent may sacrifice two nonland, nontoken permanents of their choice. If they don't, you draw two cards."
    // (Rakdos, Patron of Chaos): a punisher whose only way out is the sacrifice.
    const mayYou = mayOut && /^If (?:they|that player|the player) (?:doesn't|don't), (you (?!may\b).+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (mayOut && mayYou) {
      const who = parsePlayer(mayOut[1]!.toLowerCase(), ctx);
      const options = parsePunisherOptions(`${mayOut[2]!}s ${mayOut[3]!}`, ctx);
      const then = options && parseOne(capital(mayYou[1]!), ctx);
      if (!who || who.ref === "you" || !options || !then || then.some((e) => pauses(e))) return null;
      effects.push({ type: "punisher", who, options, effects: then, thenText: mayYou[1]!.replace(/^you (\w+)/, (_, v: string) => `${v}s`) });
      si++;
      continue;
    }
    // "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token."
    // (Smothering Tithe): a punisher whose only way out is the payment.
    // Mtenda Lion, Shrouded Serpent: "Whenever ~ attacks, defending player may pay {U}": the player it's attacking (CR 506.2).
    const thatMay = /^([Tt]hat player|[Tt]hey|[Tt]arget opponent|[Tt]arget player|[Ee]ach opponent|[Dd]efending player) may pay (.+)$/.exec(s);
    // "If they don't, return that card to the battlefield under your control ..." (Meathook Massacre II): what you do.
    const thatThen = thatMay && /^If (?:the player|that player|they|he or she) (?:doesn't|don't), (you .+|return that card to the battlefield under your control.*)$/.exec(sentences[si + 1] ?? "");
    if (thatMay && thatThen) {
      // "Whenever a creature an opponent controls dies, they may pay 3 life" (Meathook Massacre II): its controller.
      const who = parsePlayer(thatMay[1]!.toLowerCase(), ctx) ?? (ctx.subjectIt && /^they$/i.test(thatMay[1]!) ? { ref: "subjectController" as const } : null);
      const options = parsePunisherOptions(`pays ${thatMay[2]!}`, ctx);
      const then = options && parseOne(capital(thatThen[1]!), ctx);
      // "They may pay {2}. If they don't, you may copy that spell." (Wandering Archaic): your choice comes after theirs, so
      // their payment is a "may" of its own, then yours if they didn't (CR 101.4).
      const pay = options?.length === 1 && "pay" in options[0]! && Object.keys(options[0].pay).length === 1 && /^(?:\{[^}]+\})+$/.test(options[0].pay.cost) ? options[0].pay.cost : undefined;
      const youMay = /^you may (.+)$/.exec(thatThen[1]!);
      if (who && who.ref !== "you" && pay && youMay) {
        ctx.mayNow = true;
        const inner = parseOne(capital(youMay[1]!), ctx);
        ctx.mayNow = false;
        if (inner?.length !== 1) return null;
        effects.push({ type: "eachMay", who, effects: [], pay: { mana: pay }, text: `pay ${pay}` }, { type: "if", cond: { kind: "theyChose", not: true }, effects: [{ type: "may", effects: inner, text: youMay[1]! }] });
        si++;
        continue;
      }
      if (!who || who.ref === "you" || !options || !then || then.some((e) => pauses(e))) return null;
      effects.push({ type: "punisher", who, options, effects: then, thenText: thatThen[1]!.replace(/^you (\w+)/, (_, v: string) => `${v}s`).replace(/^return that card (.+?) under your control/, "returns that card $1 under their control").replace(/\.$/, "") });
      si++;
      continue;
    }
    // "At the beginning of the upkeep of enchanted creature's controller, that player may pay {1}{B}. If the player does,
    // untap that creature." (Dance of the Dead): their payment, then what it buys.
    // "If that player doesn't, ~ can't be blocked this turn" (Shrouded Serpent), "If they don't, ~ deals 2 damage to that
    // player and you tap that creature" (Mind Whip): what not paying lets happen, after their choice (CR 101.4).
    const thatDo = thatMay && /^If (?:the player|that player|they) (does|do|doesn't|don't), (.+)$/.exec(sentences[si + 1] ?? "");
    if (thatMay && thatDo && /^(?:\{[^}]+\})+$/.test(thatMay[2]!)) {
      const who = parsePlayer(thatMay[1]!.toLowerCase(), ctx);
      const then = parseOne(capital(thatDo[2]!), ctx);
      if (!who || who.ref === "you" || !then || then.some((e) => pauses(e))) return null;
      effects.push({ type: "eachMay", who, effects: [], pay: { mana: thatMay[2]! }, text: `pay ${thatMay[2]!}` }, { type: "if", cond: { kind: "theyChose", ...(/n't$/.test(thatDo[1]!) ? { not: true as const } : {}) }, effects: then });
      si++;
      continue;
    }
    // "Each player may scry 1" (Eager Construct), "then each opponent may scry 1" (Myr Custodian), "each player may draw a
    // card" (Kwain): each decides in turn order, knowing the earlier answers, then those who did each do it, in turn
    // order (rulings on Eager Construct and Kaya, Intangible Slayer).
    // "Each opponent may sacrifice a nontoken creature of their choice. Each opponent who doesn't loses ..." (Fandaniel):
    // each chooses in turn order, then the chosen ones are sacrificed (rulings); only one who has such a creature can.
    const sacAlone = offer && !does && /^sacrifice an? [a-z ]+?(?: of their choice)?$/.test(offer[2]!) && /^(?:Then )?[Ee]ach (?:opponent|player) who (?:doesn't|didn't) /.test(sentences[si + 1] ?? "");
    const alone = offer && !does && (sacAlone || /^(?:scry \d+|surveil \d+|draw a card)$/.test(offer[2]!)) ? parseOffer(offer[2]!.replace(/ of their choice$/, ""), ctx) : null;
    // "Each player may put two +1/+1 counters on a creature they control. Goad each creature that had counters put on
    // it this way." (Agitator Ant): each decides in turn order, then puts them; then those creatures are goaded (rulings).
    const goadPut = offer && !does && /^put .+ counters? on a creature they control$/.test(offer[2]!) && /^Goad each creature that had counters put on it this way$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    const goadFx = goadPut ? parseOffer(offer[2]!, ctx) : null;
    if (offer && goadFx) {
      const one = goadFx.length === 1 ? goadFx[0]! : undefined;
      if (one?.type !== "pick" || one.action !== "counters" || !one.counter || offer[1] !== "player") return null;
      // Starting with you, each one chooses a creature of theirs or none, knowing the earlier choices; then each chosen
      // creature gets its counters (rulings).
      effects.push(
        { type: "vote", among: { ...one.filter, controller: "you" }, choose: true, theirs: true, text: offer[2]!.replace(/\btheir\b/g, "your").replace(/\bthey\b/g, "you") },
        { type: "counters", what: { ref: "voted", any: true }, counter: one.counter.kind, n: one.counter.n, byVoter: true },
        { type: "continuous", what: { ref: "countersPutThisWay" }, mods: [{ kind: "goad" }], duration: "yourNextTurn" },
      );
      si++;
      continue;
    }
    if (offer && alone) {
      const one = alone.length === 1 ? alone[0]! : undefined;
      if (sacAlone && (one?.type !== "pick" || one.action !== "sacrifice" || one.n !== 1)) return null;
      const need = sacAlone && one?.type === "pick" ? { zone: "battlefield" as const, filter: one.filter } : undefined;
      effects.push({ type: "eachMay", who: { ref: offer[1] === "player" ? "eachPlayer" : "eachOpponent" }, effects: alone, text: offer[2]!.replace(/\btheir\b/g, "your"), each: true, ...(need ? { need } : {}) });
      ctx.eachChose = true;
      continue;
    }
    if (offer && does && offerFx) {
      const then = parseOfferRest(does[2]!, ctx);
      if (then === null) return null;
      const one = offerFx.length === 1 ? offerFx[0]! : undefined;
      const need = one?.type === "pick" ? { zone: "battlefield" as const, filter: one.filter } : one?.type === "chooseFromGraveyard" && one.filter ? { zone: "graveyard" as const, filter: one.filter } : undefined;
      effects.push({
        type: "eachMay",
        who: { ref: offer[1] === "player" ? "eachPlayer" : "eachOpponent" },
        effects: offerFx,
        text: offer[2]!.replace(/\btheir\b/g, "your").replace(/\bthey\b/g, "you"),
        each: true,
        ...(need ? { need } : {}),
        perAccepted: { effects: then, ...(does[1] === "opponent" ? { opponents: true as const } : {}) },
      });
      si++;
      continue;
    }
    // Impulse draw: "Exile the top two cards of your library. Until the end of your next turn, you may play those cards."
    // Under a condition about how it was cast (Elemental Mascot's "If five or more mana was spent to cast that spell, exile
    // the top card of your library. You may play that card until the end of your next turn."), both sentences are.
    const impulseIf = /^If [^,]+, exile the top /.test(s) ? parseHowCast(s, ctx) : null;
    // "Exile cards from the top of your library equal to the excess damage dealt to that creature this way" (Archaic's
    // Agony): that many, counted as it resolves.
    // "Exile the top X cards of your library, where X is the number of creatures you control with power 4 or greater"
    // (Dragonhawk, Fate's Tempest): X counted once, as it resolves (rulings).
    const exEqual = /^Exile cards from the top of your library equal to (.+)$/.exec(s) ?? /^[Ee]xile the top X cards of your library, where X is (.+)$/.exec(s);
    const exEqualN = exEqual ? parseCount(exEqual[1]!, ctx) : null;
    if (exEqual && !exEqualN) return null;
    // "Shuffle your library, then exile the top card." (Urza, Lord High Artificer): the top card of your library, after.
    // "Shuffle your library. Then exile the top card of your library." (Mind's Desire): the same.
    if (/^Shuffle your library$/.test(s) && /^(?:[Ee]xile the top card|Then exile the top card of your library)$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "shuffle", who: { ref: "you" } });
      sentences[si + 1] = "Exile the top card of your library";
      continue;
    }
    // "Exile the top two cards of your library, then choose one of them. You may play that card this turn." (Party
    // Thrasher, Magmatic Channeler): only the chosen card may be played (Effect impulse `choose`).
    const exChoose = !impulseIf && new RegExp(`^[Ee]xile the top (${NUM}) cards of your library, then choose one of them$`).exec(s);
    if (exChoose && /^You may play that card this turn\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "impulse", n: amt(exChoose[1]!), until: "thisTurn", choose: true });
      si++;
      continue;
    }
    // Tectonic Giant: "Exile the top two cards of your library. Choose one of them. Until the end of your next turn, you may
    // play that card." The same, the card chosen as it resolves (rulings).
    // You Find Some Prisoners: "Exile the top three cards of target opponent's library. Choose one of them. Until the end
    // of your next turn, you may play that card, and you may spend mana as though it were mana of any color to cast it."
    // The same from that library, a spell cast with mana of any type (CR 609.4b); the rest stay exiled (rulings).
    const exChoose2 = !impulseIf && new RegExp(`^[Ee]xile the top ${NUM} cards of (your|target opponent's) library$`).exec(s);
    const playChosen = exChoose2 && /^Choose one of them\.?$/.test(sentences[si + 1] ?? "") ? /^(?:Until (end of turn|the end of your next turn), you may play that card|You may play that card (this turn|until the end of your next turn))(, and you may spend mana as though it were mana of any color to cast it)?\.?$/.exec(sentences[si + 2] ?? "") : null;
    if (exChoose2 && playChosen) {
      const who = exChoose2[2] === "your" ? undefined : parsePlayer("target opponent", ctx);
      if (who === null) return null;
      effects.push({ type: "impulse", n: amt(exChoose2[1]!), until: /next turn/.test(playChosen[0]) ? "nextTurn" : "thisTurn", choose: true, ...(who ? { who } : {}), ...(playChosen[3] ? { anyType: true as const } : {}) });
      si += 2;
      continue;
    }
    const exTop = exEqual ? (["", "X"] as unknown as RegExpExecArray) : new RegExp(`^[Ee]xile the top (?:card|${NUMX} cards) of your library$`).exec(impulseIf && !impulseIf.not ? impulseIf.text : s);
    // "Exile the top card of that player's library. Until end of turn, you may cast that card." (Ragavan, after combat
    // damage to a player): that player's card, cast only (no land play, rulings), paying its costs.
    const theirTop = !exTop && !impulseIf && ctx.eventPlayer && /^[Ee]xile the top card of that player's library$/.test(s) ? /^(?:Until end of turn, you may cast that card|You may cast that card this turn)( and you may spend mana as though it were mana of any color to cast that spell)?$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    // Fallen Shinobi: "That player exiles the top two cards of their library. Until end of turn, you may play those cards
    // without paying their mana costs." The permission is yours; a land is played as your land play (CR 305.1, rulings).
    const theyExile = ctx.eventPlayer ? new RegExp(`^[Tt]hat player exiles the top (card|${NUMX} cards) of their library$`).exec(s) : null;
    const theyPlay = theyExile && /^Until end of turn, you may play (?:that card|those cards) without paying (?:its mana cost|their mana costs)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (theyExile && theyPlay && (theyExile[1] === "card") === /that card/.test(sentences[si + 1]!)) {
      effects.push({ type: "impulse", n: theyExile[1] === "card" ? 1 : amt(theyExile[2]!), until: "thisTurn", who: { ref: "eventPlayer" }, free: true });
      si++;
      continue;
    }
    // Bloodsoaked Insight: "Target opponent exiles the top three cards of their library. Until the end of your next turn,
    // you may play those cards. If you cast a spell this way, mana of any type can be spent to cast it." Face up (CR
    // 406.3), the permission yours; a land is played as your land play, a spell with mana of any type (CR 609.4b).
    const tgtExile = !theyExile ? new RegExp(`^(Target opponent|Target player) exiles the top (card|${NUMX} cards) of their library$`).exec(s) : null;
    const tgtPlay = tgtExile && /^(Until the end of your next turn|Until end of turn), you may play (?:that card|those cards)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (tgtExile && tgtPlay && (tgtExile[2] === "card") === /that card/.test(sentences[si + 1]!)) {
      const any = /^(?:If you cast a spell this way, mana of any type can be spent to cast it|Mana of any type can be spent to cast (?:those spells|them))$/.test(sentences[si + 2]?.replace(/\.$/, "") ?? "");
      const who = parsePlayer(tgtExile[1]!, ctx);
      if (!who) return null;
      effects.push({ type: "impulse", n: tgtExile[2] === "card" ? 1 : amt(tgtExile[3]!), until: /next turn/.test(tgtPlay[1]!) ? "nextTurn" : "thisTurn", who, ...(any ? { anyType: true as const } : {}) });
      si += any ? 2 : 1;
      continue;
    }
    // Rakdos, the Muscle: "exile cards equal to its mana value from the top of target player's library. Until your next
    // end step, you may play those cards, and mana of any type can be spent to cast those spells." The sacrificed
    // creature's mana value as it last existed (rulings); the permission yours, with the normal timing (rulings).
    const tgtEqual = /^[Ee]xile cards equal to (.+?) from the top of (target player|target opponent)'s library$/.exec(s);
    const tgtEqualPlay = tgtEqual && /^Until your next end step, you may play those cards(, and mana of any type can be spent to cast those spells)?$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (tgtEqual && tgtEqualPlay) {
      const n = parseCount(tgtEqual[1]!, ctx);
      const who = n && parsePlayer(tgtEqual[2]!, ctx);
      if (!n || !who) return null;
      effects.push({ type: "impulse", n, until: "yourNextEndStep", who, ...(tgtEqualPlay[1] ? { anyType: true as const } : {}) });
      si++;
      continue;
    }
    // Nashi, Moon Sage's Scion: "Exile the top card of each player's library. Until end of turn, you may play one of those
    // cards. If you cast a spell this way, pay life equal to its mana value rather than paying its mana cost." One card in
    // all; a land is played with the usual timing and land drop (rulings).
    if (
      /^[Ee]xile the top card of each player's library$/.test(s) &&
      sentences[si + 1]?.replace(/\.$/, "") === "Until end of turn, you may play one of those cards" &&
      sentences[si + 2]?.replace(/\.$/, "") === "If you cast a spell this way, pay life equal to its mana value rather than paying its mana cost"
    ) {
      effects.push({ type: "impulse", n: 1, until: "thisTurn", who: { ref: "eachPlayer" }, oneOf: true, life: true });
      si += 2;
      continue;
    }
    // Burning Curiosity: "Exile the top two cards of your library. If this spell's additional cost was paid, exile the top
    // three cards instead. Until the end of your next turn, you may play those cards.": one impulse, of more cards when that
    // cost was paid (read as kicked).
    const kickedTop = exTop && exTop[1] && !impulseIf && !exEqual ? new RegExp(`^If ~ was kicked, exile the top ${NUM} cards instead\\.?$`).exec(sentences[si + 1] ?? "") : null;
    if (kickedTop && /^Until the end of your next turn, you may play those cards\.?$/.test(sentences[si + 2] ?? "") && num(kickedTop[1]!) > num(exTop![1]!)) {
      const base = num(exTop![1]!);
      effects.push({ type: "impulse", n: { count: { kind: "wasKicked" }, times: num(kickedTop[1]!) - base, plus: base }, until: "nextTurn" });
      si += 2;
      continue;
    }
    // Brainstealer Dragon: "Exile the top card of each opponent's library. You may play those cards for as long as they
    // remain exiled. If you cast a spell this way, you may spend mana as though it were mana of any color to cast it."
    // Stolen Strategy: "... Until end of turn, you may cast spells from among those exiled cards, and you may spend mana as
    // though it were mana of any color to cast those spells." Face up (CR 406.3), each card's permission its own (CR 400.7),
    // mana of any type for a spell (CR 609.4b).
    if (/^[Ee]xile the top card of each opponent's library$/.test(s)) {
      const next = (k: number) => sentences[si + k]?.replace(/\.$/, "") ?? "";
      if (next(1) === "You may play those cards for as long as they remain exiled" && next(2) === "If you cast a spell this way, you may spend mana as though it were mana of any color to cast it") {
        effects.push({ type: "impulse", n: 1, until: "exiled", who: { ref: "eachOpponent" }, anyType: true });
        si += 2;
        continue;
      }
      if (next(1) === "Until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells") {
        effects.push({ type: "impulse", n: 1, until: "thisTurn", who: { ref: "eachOpponent" }, castOnly: true, anyType: true });
        si++;
        continue;
      }
    }
    // Laughing Jasper Flint: "exile the top X cards of target opponent's library, where X is ... Until end of turn, you may
    // cast spells from among those cards, and mana of any type can be spent to cast those spells." Face up (CR 406.3), a
    // spell only (no land), with mana of any type (CR 609.4b).
    const exOpp = !exTop && !impulseIf ? new RegExp(`^[Ee]xile the top (card|${NUMX} cards) of target opponent's library(?:, where X is ([^"]+))?$`).exec(s) : null;
    if (exOpp && sentences[si + 1]?.replace(/\.$/, "") === `Until end of turn, you may cast spells from among ${exOpp[1] === "card" ? "that card" : "those cards"}, and mana of any type can be spent to cast those spells`) {
      const who = parsePlayer("target opponent", ctx);
      if (!who || (exOpp[2] === "X") !== !!exOpp[3]) return null;
      // "Where X is the number of outlaws you control" (CR 107.3c), counted as it resolves.
      const def = exOpp[3] ? parseCount(exOpp[3], ctx) : undefined;
      if (exOpp[3] && !def) return null;
      const fx: Effect = { type: "impulse", n: exOpp[1] === "card" ? 1 : amt(exOpp[2]!), until: "thisTurn", who, castOnly: true, anyType: true };
      effects.push(...(def ? replaceX([fx], def) : [fx]));
      si++;
      continue;
    }
    // Korvold and the Noble Thief: "Exile the top three cards of target opponent's library. You may play those cards this
    // turn.": face up (CR 406.3), a land as your land play, a spell paid for as usual (rulings).
    if (exOpp && !exOpp[3] && sentences[si + 1]?.replace(/\.$/, "") === `You may play ${exOpp[1] === "card" ? "that card" : "those cards"} this turn`) {
      const who = parsePlayer("target opponent", ctx);
      if (!who || exOpp[2] === "X") return null;
      effects.push({ type: "impulse", n: exOpp[1] === "card" ? 1 : amt(exOpp[2]!), until: "thisTurn", who });
      si++;
      continue;
    }
    // Court of Locthwain: "exile the top card of target opponent's library. You may play that card for as long as it
    // remains exiled, and mana of any type can be spent to cast it." Face up (CR 406.3), a land played as your land play,
    // mana of any type for a spell (CR 609.4b), for as long as it stays exiled (CR 400.7).
    if (!exTop && !impulseIf && /^[Ee]xile the top card of target opponent's library$/.test(s) && sentences[si + 1]?.replace(/\.$/, "") === "You may play that card for as long as it remains exiled, and mana of any type can be spent to cast it") {
      const who = parsePlayer("target opponent", ctx);
      if (!who) return null;
      effects.push({ type: "impulse", n: 1, until: "exiled", who, anyType: true });
      ctx.exiledTop = true;
      si++;
      continue;
    }
    // Elder Brain: "exile all cards from that player's hand, then they draw that many cards. You may play lands and cast
    // spells from among the exiled cards for as long as they remain exiled. If you cast a spell this way, you may spend
    // mana as though it were mana of any color to cast it." Face up (rulings, CR 406.3); a land played as your land play;
    // mana of any type for a spell (CR 609.4b); each card's permission its own (CR 400.7).
    if (
      /^[Ee]xile all cards from that player's hand$/.test(s) &&
      sentences[si + 1]?.replace(/\.$/, "") === "They draw that many cards" &&
      sentences[si + 2]?.replace(/\.$/, "") === "You may play lands and cast spells from among the exiled cards for as long as they remain exiled" &&
      sentences[si + 3]?.replace(/\.$/, "") === "If you cast a spell this way, you may spend mana as though it were mana of any color to cast it"
    ) {
      // "Whenever ~ attacks a player": that player is the defending one.
      const who = ctx.defending ? parsePlayer("defending player", ctx) : null;
      if (!who || who.ref === "you") return null;
      effects.push({ type: "impulse", n: 0, until: "exiled", who, hand: true, anyType: true });
      si += 3;
      continue;
    }
    // Cunning Rhetoric: "exile the top card of that player's library. You may play that card for as long as it remains
    // exiled, and you may spend mana as though it were mana of any color to cast it." Face up (CR 406.3), a land played
    // as your land play (rulings), mana of any type for a spell (CR 609.4b).
    // Ramirez DePietro, Pillager: "You may cast that card for as long as it remains exiled": spells only, no land play.
    if (!exTop && !impulseIf && ctx.eventPlayer && /^[Ee]xile the top card of that player's library$/.test(s) && /^You may (?:play|cast) that card for as long as it remains exiled(, and you may spend mana as though it were mana of any color to cast it)?$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "impulse", n: 1, until: "exiled", who: { ref: "eventPlayer" }, ...(/^You may cast/.test(sentences[si + 1]!) ? { castOnly: true as const } : {}), ...(/any color/.test(sentences[si + 1]!) ? { anyType: true as const } : {}) });
      ctx.exiledTop = true;
      si++;
      continue;
    }
    // Grenzo, Havoc Raiser: "... and you may spend mana as though it were mana of any color to cast that spell" (CR 609.4b).
    // Daxos of Meletis: "exile the top card of that player's library. You gain life equal to that card's mana value. Until
    // end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell."
    const daxos = !exTop && !impulseIf && !theirTop && ctx.eventPlayer && /^[Ee]xile the top card of that player's library$/.test(s) && sentences[si + 1] === "You gain life equal to that card's mana value" && sentences[si + 2]?.replace(/\.$/, "") === "Until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell";
    if (daxos) {
      effects.push({ type: "impulse", n: 1, until: "thisTurn", who: { ref: "eventPlayer" }, castOnly: true, anyType: true });
      ctx.exiledTop = true;
      const gain = parseOne(sentences[si + 1]!, ctx);
      if (!gain) return null;
      effects.push(...gain);
      si += 2;
      continue;
    }
    // Vaan, Street Thief: "exile the top card of that player's library. You may cast it. If you don't, create a Treasure
    // token.": cast as this resolves or not at all, paying its costs (rulings; CR 608.2g), as Chandra, Torch of Defiance.
    const theirCastElse = !exTop && !impulseIf && ctx.eventPlayer && /^[Ee]xile the top card of that player's library$/.test(s) && /^You may cast (?:it|that card)$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "") ? /^If you don't, (.+)$/.exec(sentences[si + 2]?.replace(/\.$/, "") ?? "") : null;
    if (theirCastElse) {
      const before = ctx.targets.length;
      const inner = parseOne(capital(theirCastElse[1]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "exileTop", who: { ref: "eventPlayer" }, n: 1 }, { type: "castNow", what: { ref: "exiledTop" } }, { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner });
      si += 2;
      continue;
    }
    if (theirTop) {
      effects.push({ type: "impulse", n: 1, until: "thisTurn", who: { ref: "eventPlayer" }, castOnly: true, ...(theirTop[1] ? { anyType: true as const } : {}) });
      ctx.exiledTop = true;
      si++;
      continue;
    }
    // With no duration (Dungeon of the Mad Mage's Runestone Caverns), for as long as each card stays exiled (CR 611.2a, 400.7).
    // "Until your next end step, you may play it" (Yasmin Khan, Wiccan, Ob Nixilis): over as your next end step begins.
    // "Until end of turn, you may play that card without paying its mana cost" (Urza, CR 118.9): `free`.
    // "You may play that card for as long as it remains exiled" (Valakut Exploration): no duration, as above.
    // "During your next turn, you may play that card" (Galvanic Relay): only then, not this turn (rulings).
    // "You may play that card for as long as you control ~" (Lightning, Security Sergeant): over once you lose control of
    // that object, for good (rulings, CR 400.7).
    const playRe = /^(?:(Until the end of your next turn|Until end of turn|Until your next end step|Until the beginning of your next upkeep|During your next turn), you may play (?:that card|those cards|them|it)|You may play (?:that card|those cards|them|it|cards exiled this way)(?: (this turn|until the end of your next turn|until your next end step|for as long as you control ~)| for as long as (?:it remains|they remain) exiled)?)( without paying its mana cost)?$/;
    const playIt = exTop && sentences[si + 1] && playRe.exec(sentences[si + 1]!.replace(/\.$/, ""));
    // "Exile the top card of your library. ~ gets +X/+0 until end of turn, where X is that card's mana value. You may play
    // that card this turn." (Tavern Brawler, Daredevil): the permission and the sentence between, about that card.
    const playAfter = exTop && !exTop[1] && !playIt && sentences[si + 2] && /\b(?:that|the exiled) card's mana value\b/.test(sentences[si + 1] ?? "") ? playRe.exec(sentences[si + 2]!.replace(/\.$/, "")) : null;
    if (playAfter && !impulseIf && !playAfter[3]) {
      const when = (playAfter[1] ?? playAfter[2] ?? "").toLowerCase();
      if (/^during|you control ~/.test(when)) return null;
      if (/next upkeep/.test(when)) return null;
      effects.push({ type: "impulse", n: 1, until: !when ? "exiled" : /next end step/.test(when) ? "yourNextEndStep" : /next turn/.test(when) ? "nextTurn" : "thisTurn" });
      ctx.exiledTop = true;
      sentences.splice(si + 2, 1);
      continue;
    }
    // Caves of Chaos Adventurer: "Exile the top card of your library. If you've completed a dungeon, you may play that card
    // this turn without paying its mana cost. Otherwise, you may play that card this turn." A condition about the game,
    // checked as it resolves; either way the card is exiled and may be played this turn.
    const freeIf = exTop && !exTop[1] && !exEqual && !impulseIf ? /^If ([^,]+), you may play that card this turn without paying its mana cost$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (freeIf && sentences[si + 2]?.replace(/\.$/, "") === "Otherwise, you may play that card this turn") {
      const cond = parseStaticCondition(freeIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || cond.kind !== "completedDungeon") return null;
      effects.push({ type: "if", cond: { kind: "state", cond }, effects: [{ type: "impulse", n: 1, until: "thisTurn", free: true }], otherwise: [{ type: "impulse", n: 1, until: "thisTurn" }] });
      ctx.exiledTop = true;
      si += 2;
      continue;
    }
    // Unstable Amulet, Furious Rise: "Exile the top card of your library. You may play it until you exile another card
    // with ~." For as long as it stays exiled, until this object exiles another card (rulings).
    if (exTop && !exTop[1] && !exEqual && !impulseIf && !ctx.spell && /^You may play (?:it|that card) until you exile another card with ~$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "impulse", n: 1, until: "exiled", untilAnother: true });
      ctx.exiledTop = true;
      si++;
      continue;
    }
    if (exTop && !exTop[1]) ctx.exiledTop = true;
    // Chaos Harlequin: "Exile the top card of your library. If that card is a land card, ~ gets -4/-0 until end of turn.
    // Otherwise, ~ gets +2/+0 until end of turn.": the card as it is in exile, face up (CR 406.3); nothing more about it.
    const exiledIs = exTop && !exTop[1] && !exEqual && !impulseIf ? /^If (?:that card|it) is an? ([a-z]+) card, (.+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    const exiledElse = exiledIs ? /^Otherwise, (.+)$/.exec(sentences[si + 2]?.replace(/\.$/, "") ?? "") : null;
    if (exiledIs && !/\b(?:it|its|that card)\b/.test(`${exiledIs[2]} ${exiledElse?.[1] ?? ""}`)) {
      const filter = parseSearchFilter(`${exiledIs[1]} card`);
      const before = ctx.targets.length;
      const then = parseOne(capital(exiledIs[2]!), ctx);
      const otherwise = exiledElse ? parseOne(capital(exiledElse[1]!), ctx) : undefined;
      if (!filter || !then || otherwise === null || ctx.targets.length !== before || [...then, ...(otherwise ?? [])].some((e) => pauses(e))) return null;
      effects.push({ type: "exileTop", who: { ref: "you" }, n: 1 }, { type: "if", cond: { kind: "amountNow", amount: { count: { kind: "exiledTopMatching", filter } }, min: 1 }, effects: then, ...(otherwise ? { otherwise } : {}) });
      si += exiledElse ? 2 : 1;
      continue;
    }
    // Rundvelt Hordemaster: "Exile the top card of your library. If it's a Goblin creature card, you may cast that card
    // until the end of your next turn." Vance's Blasting Cannons: "If it's a nonland card, you may cast that card this
    // turn." The card as it is in exile, face up (CR 406.3); only a card like that gets the permission.
    const castIfIs = exTop && !exTop[1] && !exEqual && !impulseIf ? /^If it's an? (.+? card), you may cast (?:that card|it) (this turn|until the end of your next turn)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (castIfIs) {
      const castFilter = parseSearchFilter(castIfIs[1]!);
      if (!castFilter) return null;
      effects.push({ type: "impulse", n: 1, until: castIfIs[2] === "this turn" ? "thisTurn" : "nextTurn", castOnly: true, castFilter });
      si++;
      continue;
    }
    // Neyali, Suns' Vanguard: "During any turn you attacked with a token, you may play that card." For as long as it stays
    // exiled, in any turn its controller declared a token as an attacker (rulings), whatever became of Neyali.
    if (exTop && !exTop[1] && !exEqual && !impulseIf && sentences[si + 1]?.replace(/\.$/, "") === "During any turn you attacked with a token, you may play that card") {
      effects.push({ type: "impulse", n: 1, until: "exiled", attackedWithToken: true });
      si++;
      continue;
    }
    // "Exile the top card of your library. You may cast that card. If you don't, ~ deals 2 damage to each opponent."
    // (Chandra, Torch of Defiance): cast as this resolves or not at all, paying its costs (rulings; CR 608.2g).
    const castTopElse = exTop && !exTop[1] && !exEqual && !impulseIf && sentences[si + 1]?.replace(/\.$/, "") === "You may cast that card" ? /^If you don't, (.+)$/.exec(sentences[si + 2]?.replace(/\.$/, "") ?? "") : null;
    if (castTopElse) {
      const before = ctx.targets.length;
      const inner = parseOne(capital(castTopElse[1]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "exileTop", who: { ref: "you" }, n: 1 }, { type: "castNow", what: { ref: "exiledTop" } }, { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner });
      si += 2;
      continue;
    }
    // Ral, Leyline Prodigy: "Exile the top eight cards of your library. You may cast instant and sorcery spells from among
    // them this turn without paying their mana costs." Only those card types, with their normal timing (rulings).
    const castAmongKind = exTop && exTop[1] && !exEqual && !impulseIf ? /^You may cast ((?:instant|sorcery|creature|artifact|enchantment)(?: and (?:instant|sorcery|creature|artifact|enchantment))?) spells from among them this turn without paying their mana costs$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    const castFilter = castAmongKind ? parseSearchFilter(`${castAmongKind[1]!.replace(/ and /, " or ")} card`) : null;
    if (castAmongKind) {
      if (!castFilter) return null;
      effects.push({ type: "impulse", n: amt(exTop![1]!), until: "thisTurn", castOnly: true, free: true, castFilter });
      si++;
      continue;
    }
    // Chandra, Hope's Beacon: "Exile the top five cards of your library. Until the end of your next turn, you may cast an
    // instant or sorcery spell from among those exiled cards." One spell, of that kind (the face cast counting, rulings),
    // with its normal timing, paying its costs.
    const castOneAmong = exTop && exTop[1] && !exEqual && !impulseIf ? /^(Until the end of your next turn|Until end of turn), you may cast an? ((?:instant|sorcery|creature|artifact|enchantment)(?: or (?:instant|sorcery|creature|artifact|enchantment))?) spell from among (?:those exiled cards|them|the exiled cards)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (castOneAmong) {
      const spellFilter = parseSearchFilter(`${castOneAmong[2]!} card`);
      if (!spellFilter) return null;
      effects.push({ type: "impulse", n: amt(exTop![1]!), until: /next turn/.test(castOneAmong[1]!) ? "nextTurn" : "thisTurn", castOnly: true, oneOf: true, spellFilter });
      si++;
      continue;
    }
    // Apex of Power: "Exile the top seven cards of your library. Until end of turn, you may cast spells from among them."
    // Spells only (the lands stay in exile), with their normal timing, paying their costs (rulings).
    if (exTop && exTop[1] && !exEqual && !impulseIf && sentences[si + 1]?.replace(/\.$/, "") === "Until end of turn, you may cast spells from among them") {
      effects.push({ type: "impulse", n: amt(exTop[1]), until: "thisTurn", castOnly: true });
      si++;
      continue;
    }
    if (exTop && playIt) {
      const when = (playIt[1] ?? playIt[2] ?? "").toLowerCase();
      const free = playIt[3] ? { free: true as const } : {};
      if (free.free && (exTop[1] || exEqualN || impulseIf)) return null;
      if (/you control ~/.test(when) && ctx.spell) return null;
      const impulse: Effect = { type: "impulse", n: exEqualN ?? (exTop[1] ? amt(exTop[1]) : 1), until: !when ? "exiled" : /next end step/.test(when) ? "yourNextEndStep" : /next upkeep/.test(when) ? "yourNextUpkeep" : /^during/.test(when) ? "duringNextTurn" : /you control ~/.test(when) ? "whileControlled" : /next turn/.test(when) ? "nextTurn" : "thisTurn", ...free };
      // Ignite the Future: "If this spell was cast from a graveyard, you may play cards this way without paying their mana
      // costs": then each may be cast for its mana cost, an alternative cost, or without paying its mana cost (rulings).
      const freeIf = !free.free && !impulseIf && ctx.spell && /^If ~ was cast from a graveyard, you may play cards this way without paying their mana costs\.?$/.test(sentences[si + 2] ?? "");
      if (freeIf) {
        effects.push({ type: "if", cond: { kind: "castFromGraveyard" }, effects: [{ ...impulse, free: true, orPay: true }], otherwise: [impulse] });
        si += 2;
        continue;
      }
      // Nahiri, Forged in Fury: "You may cast Equipment spells this way without paying their mana costs": those for free, or
      // for their costs if you'd rather (rulings), the rest for their costs.
      const freeKind = !free.free && !impulseIf && !exTop[1] && !exEqualN ? /^You may cast (Equipment|artifact|creature|enchantment|instant|sorcery) spells this way without paying their mana costs\.?$/.exec(sentences[si + 2] ?? "") : null;
      if (freeKind) {
        const k = freeKind[1]!;
        const freeFor: TargetSpec = k === "Equipment" ? { kind: "card", subtypes: ["Equipment"], text: "Equipment card" } : { kind: "card", types: [capital(k)], text: `${k} card` };
        effects.push({ ...impulse, free: true, orPay: true, freeFor } as Effect);
        si += 2;
        continue;
      }
      effects.push(impulseIf && !impulseIf.not ? { type: "if", cond: impulseIf.cond, effects: [impulse] } : impulse);
      si++;
      continue;
    }
    // "Exile all cards from your hand, then draw that many cards. Until the end of your next turn, you may play cards exiled
    // this way." (Invasion of Kaldheim; Hex Magic's "all the cards"): face up (CR 406.3), each card's permission its own
    // (CR 400.7).
    // "Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one" (Valakut
    // Awakening, Into the Fire).
    // "Discard any number of cards, then draw that many cards plus one" (Celes, Brass's Tunnel-Grinder), "You may discard
    // up to two cards. If you do, draw that many cards." (Fable of the Mirror-Breaker): none up to that many, chosen as it
    // resolves (CR 107.1c); "that many" is how many were discarded.
    const anyDiscard = /^(?:([Yy]ou may) d|[Dd])iscard (any number of|up to two|up to three) cards$/.exec(s);
    // Neheb, Dreadhorde Champion: "... If you do, draw that many cards and add that much {R}": as much mana as cards
    // discarded, however many are drawn (rulings).
    const drawThat = anyDiscard && /^(If you do, d|D)raw that many cards( plus one)?(?: and add that much (\{[WUBRGC]\}))?$/.exec(sentences[si + 1] ?? "");
    if (anyDiscard && drawThat && !!anyDiscard[1] === !!drawThat[1]?.startsWith("If") && !(drawThat[2] && drawThat[3])) {
      const max = anyDiscard[2] === "any number of" ? 99 : num(anyDiscard[2]!.slice(6));
      const discarded = { count: { kind: "discardedThisWay" as const, who: { ref: "you" as const } } };
      effects.push({ type: "discard", who: { ref: "you" }, n: max, upTo: true }, { type: "draw", who: { ref: "you" }, n: { ...discarded, ...(drawThat[2] ? { plus: 1 } : {}) } });
      if (drawThat[3]) effects.push({ type: "addMana", mana: drawThat[3], times: discarded });
      si++;
      continue;
    }
    // Steal the Show: "Target player discards any number of cards, then draws that many cards": that player chooses how
    // many as it resolves (CR 107.1c), then draws as many as they discarded.
    if (/^Target player discards any number of cards$/.test(s) && sentences[si + 1] === "That player draws that many cards") {
      const who = parsePlayer("target player", ctx);
      if (!who) return null;
      effects.push({ type: "discard", who, n: 99, upTo: true }, { type: "draw", who, n: { count: { kind: "discardedThisWay", who } } });
      si++;
      continue;
    }
    if (/^[Pp]ut any number of cards from your hand on the bottom of your library$/.test(s) && /^Draw that many cards plus one$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "revealFromHand", bottom: true }, { type: "draw", who: { ref: "you" }, n: { count: { kind: "bottomedFromHand" }, plus: 1 } });
      si++;
      continue;
    }
    // "Reveal the top four cards of your library. Put all land cards revealed this way into your hand and the rest into your
    // graveyard." (Mulch, Wrenn and Seven): every matching card, no choice; the rest where they go (CR 401.4 for "any order").
    // "Put all creature and land cards revealed this way" (Lair Delve): each that's either. "The top X cards" (Enshrined
    // Memories): X as it was cast.
    // Thought Hemorrhage: "Target player reveals their hand. ~ deals 3 damage to that player for each card with the chosen
    // name revealed this way.": the cards with that name in the hand just revealed (nothing happens in between, rulings),
    // dealt as one amount (rulings).
    const perRevealed = /^~ deals (\d+) damage to that player for each card with the chosen name revealed this way$/.exec(s);
    if (perRevealed) {
      const prev = effects.at(-1);
      if (prev?.type !== "lookAtHand" || !prev.reveal) return null;
      effects.push({ type: "damage", amount: { count: { kind: "cardsInHand", who: prev.who, filter: { kind: "card", types: [], notTypes: [], notColors: [], chosen: "name", text: "card with the chosen name" } }, times: Number(perRevealed[1]) }, to: prev.who });
      continue;
    }
    // Baleful Stare, Withering Gaze: "Target opponent reveals their hand. You draw a card for each Mountain and red card in
    // it.": the cards in the hand just revealed that are either (each card once), counted as it resolves.
    const perKindIn = /^You draw a card for each ([A-Z][a-z]+) and (white|blue|black|red|green) card in it$/.exec(s);
    if (perKindIn && BASIC_TYPES.includes(perKindIn[1]!)) {
      const prev = effects.at(-1);
      if (prev?.type !== "lookAtHand" || !prev.reveal) return null;
      const base = { kind: "card" as const, types: [], notTypes: [], notColors: [] };
      const filter: TargetSpec = { ...base, anyOf: [{ ...base, subtypes: [perKindIn[1]!], text: perKindIn[1]! }, { ...base, colors: [COLOR_WORDS[perKindIn[2]!]!], text: `${perKindIn[2]} card` }], text: `${perKindIn[1]} and ${perKindIn[2]} card` };
      effects.push({ type: "draw", who: { ref: "you" }, n: { count: { kind: "cardsInHand", who: prev.who, filter } } });
      continue;
    }
    // Vigean Intuition: "Choose a card type, then reveal the top four cards of your library. Put all cards of the chosen type
    // revealed this way into your hand and the rest into your graveyard." The type is chosen first, as it resolves (CR
    // 608.2d): Mulch's dig with that type.
    const typeThenReveal = /^Choose a card type$/.test(s) ? new RegExp(`^[Rr]eveal the top ${NUM} cards of your library$`).exec(sentences[si + 1] ?? "") : null;
    if (typeThenReveal && /^Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard$/.test(sentences[si + 2] ?? "")) {
      const n = num(typeThenReveal[1]!);
      effects.push({ type: "choose", choice: "cardType", options: Object.keys(CARD_TYPE_PLURAL) }, { type: "dig", n, count: n, upTo: false, filter: { kind: "card", types: [], notTypes: [], notColors: [], chosen: "cardType", text: "card of the chosen type" }, into: "hand", rest: "graveyard", reveal: true, required: true });
      si += 2;
      continue;
    }
    // Sanity Grinding: "Reveal the top ten cards of your library. For each blue mana symbol in the mana costs of the revealed
    // cards, target opponent mills a card. Then put the cards you revealed this way on the bottom of your library in any
    // order." Stomping Slabs: "Reveal the top seven cards of your library, then put those cards on the bottom of your library
    // in any order. If a card named ~ was revealed this way, ~ deals 7 damage to any target." The cards stay on top while
    // they're counted, then go to the bottom in the order you choose (all of them if there are fewer, rulings).
    const revealKeep = new RegExp(`^Reveal the top ${NUM} cards of your library$`).exec(s);
    const forEachRevealed = revealKeep && /^For each (white|blue|black|red|green) mana symbol in the mana costs of the revealed cards, (target opponent mills a card)$/.exec(sentences[si + 1] ?? "");
    if (revealKeep && forEachRevealed && /^Then put the cards you revealed this way on the bottom of your library in any order$/.test(sentences[si + 2] ?? "")) {
      ctx.revealedTopN = true;
      const mill = parseOne(`${capital(forEachRevealed[2]!)} for each ${forEachRevealed[1]} mana symbol in the mana costs of the revealed cards`, ctx);
      ctx.revealedTopN = false;
      if (!mill) return null;
      effects.push({ type: "revealTop", n: num(revealKeep[1]!) }, ...mill, { type: "revealedUntilToBottom" });
      si += 2;
      continue;
    }
    const namedRevealed = revealKeep && /^[Pp]ut those cards on the bottom of your library in any order$/.test(sentences[si + 1] ?? "") ? /^If a card named ~ was revealed this way, (.+)$/.exec(sentences[si + 2] ?? "") : null;
    if (revealKeep && namedRevealed) {
      const inner = parseOne(capital(namedRevealed[1]!), ctx);
      if (!inner || inner.some((e) => pauses(e))) return null;
      effects.push({ type: "revealTop", n: num(revealKeep[1]!) }, { type: "revealedUntilToBottom" }, { type: "if", cond: { kind: "revealedTopIs", filter: { kind: "card", types: [], notTypes: [], notColors: [], named: "~", text: "card named ~" } }, effects: inner });
      si += 2;
      continue;
    }
    // Desperate Research: "Choose a card name other than a basic land card name. Reveal the top seven cards of your library
    // and put all of them with that name into your hand. Exile the rest." Every card with the name chosen as it resolves.
    const revealNamed = new RegExp(`^Reveal the top ${NUM} cards of your library and put all of them with that name into your hand$`).exec(s);
    if (revealNamed && /^Exile the rest\.?$/.test(sentences[si + 1] ?? "") && allEffects(effects).some((x) => x.type === "choose" && x.choice === "cardName")) {
      const n = num(revealNamed[1]!);
      effects.push({ type: "dig", n, count: n, upTo: false, filter: { kind: "card", types: [], notTypes: [], notColors: [], chosen: "name", text: "card with the chosen name" }, into: "hand", rest: "exile", reveal: true, required: true });
      si++;
      continue;
    }
    const revealN = new RegExp(`^Reveal the top ${NUMX} cards of your library$`, "i").exec(s);
    const putAll = revealN && /^Put all (.+?) cards revealed this way into your hand and the rest (into your graveyard|on the bottom of your library in any order|on the bottom of your library in a random order)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (revealN && putAll) {
      const filter = parseSearchFilter(`${putAll[1]!.replace(/\band\/or\b|,? and /g, " or ").replace(/  +/g, " ").replace(/ cards\b/g, " card")} card`);
      const n = revealN[1] === "X" ? X : num(revealN[1]!);
      if (!filter || (typeof n === "number" && !Number.isInteger(n))) return null;
      const rest = putAll[2] === "into your graveyard" ? "graveyard" : "bottom";
      // Every match is taken, however many.
      effects.push({ type: "dig", n, count: typeof n === "number" ? n : 1000, upTo: false, filter, into: "hand", rest, reveal: true, required: true, ...(/random/.test(putAll[2]!) ? { random: true as const } : {}) });
      si++;
      continue;
    }
    // Teferi's Puzzle Box, Mindmoil (split at ", then" by now): see handToBottomDraw.
    const handDown = /^(?:([Tt]hat player) puts|[Pp]ut) the cards in (?:their|your) hand on the bottom of (?:their|your) library in any order$/.exec(s);
    if (handDown && /^(?:[Tt]hat player )?[Dd]raws? that many cards$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const fx = parseOne(`${s}, then ${handDown[1] ? "draws" : "draw"} that many cards`, ctx);
      if (!fx) return null;
      effects.push(...fx);
      si++;
      continue;
    }
    // By now split at ", then".
    if (/^[Ee]xile all (?:the )?cards from your hand$/.test(s) && /^Draw that many cards$/.test(sentences[si + 1] ?? "") && /^Until the end of your next turn, you may play cards exiled this way$/.test(sentences[si + 2] ?? "")) {
      effects.push({ type: "exileHand", until: "nextTurn" }, { type: "draw", who: { ref: "you" }, n: { count: { kind: "exiledFromHandThisWay" } } });
      si += 2;
      continue;
    }
    // "Exile the top ten cards of your library. Put all artifact cards from among them onto the battlefield." (Tezzeret,
    // Master of the Bridge): the rest stay exiled.
    const exileTopN = new RegExp(`^[Ee]xile the top ${NUM} cards of your library$`).exec(s);
    const exilePutAll = exileTopN && /^Put all (.+? cards) from among them onto the battlefield$/.exec(sentences[si + 1] ?? "");
    if (exileTopN && exilePutAll) {
      const filter = parseSearchFilter(exilePutAll[1]!.replace(/cards$/, "card"));
      if (!filter) return null;
      effects.push({ type: "exileTop", who: { ref: "you" }, n: num(exileTopN[1]!), putAll: filter });
      si++;
      continue;
    }
    // Lord of the Void: "exile the top seven cards of that player's library, then put a creature card from among them onto
    // the battlefield under your control" (split at ", then" by now).
    const exileTheirs = new RegExp(`^[Ee]xile the top ${NUM} cards of (that player's|your) library$`).exec(s);
    const putOne = exileTheirs && /^Put an? (.+? card) from among them onto the battlefield under your control$/.exec(sentences[si + 1] ?? "");
    if (exileTheirs && putOne) {
      const who = exileTheirs[2] === "your" ? ({ ref: "you" } as const) : parsePlayer("that player", ctx);
      const filter = parseSearchFilter(putOne[1]!);
      if (!who || !filter) return null;
      effects.push({ type: "exileTop", who, n: num(exileTheirs[1]!) }, { type: "putFromExiledTop", filter });
      si++;
      continue;
    }
    // "Exile the top ten cards of your library. You may cast any number of spells with total mana value 10 or less from
    // among them without paying their mana costs." (Primeval Spawn), "Target opponent exiles the top X cards of their
    // library. You may cast any number of spells with mana value X or less from among them ..." (Villainous Wealth): cast
    // one after another as it resolves, ignoring timing (CR 608.2g, 601.2); lands can't be cast, and the rest stay exiled.
    // "Shuffle your library, then exile the top four cards" (Hazoret's Undying Fury): your library, after the shuffle.
    const afterShuffle = si > 0 && sentences[si - 1] === "Shuffle your library";
    const castAmongHead = new RegExp(`^(?:[Ee]xile the top ${NUMX} cards(?: of (your|their|target player's|target opponent's) library)?|(Target player|Target opponent) exiles the top ${NUMX} cards of their library)$`).exec(s);
    // "You may cast an instant or sorcery spell with mana value X or less from among them ..." (Muse Vortex), "... up to
    // two sorcery spells ..." (Collected Conjuring): only so many, of those types.
    // "You may play lands and cast spells from among cards exiled this way without paying their mana costs" (Gix): lands
    // too, played as this resolves.
    const lands = castAmongHead && /^You may play lands and cast spells from among (?:them|cards exiled this way) without paying their mana costs$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    const castAmong = castAmongHead && /^You may (?:play lands and )?cast (?:(any number of|up to two|an?) )?(?:(instant or sorcery|instant and sorcery|sorcery|instant|Aura) )?spells?(?: with (total )?mana value (\d+|X) or less)? from among (?:them|cards exiled this way) without paying (?:their mana costs|its mana cost)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    // Improvisation Capstone: "Exile cards from the top of your library until you exile cards with total mana value 4 or
    // greater."
    const untilMv = /^Exile cards from the top of your library until you exile cards with total mana value (\d+) or greater$/.exec(s);
    // Invasion of Alara: "Exile cards from the top of your library until you exile two nonland cards with mana value 4 or
    // less. You may cast one of those two cards without paying its mana cost. Put one of them into your hand. Then put
    // the other cards exiled this way on the bottom of your library in a random order."
    const untilTwo = /^[Ee]xile cards from the top of your library until you exile two (nonland cards with mana value \d+ or less)$/.exec(s);
    if (
      untilTwo &&
      sentences[si + 1] === "You may cast one of those two cards without paying its mana cost" &&
      sentences[si + 2] === "Put one of them into your hand" &&
      /^(?:Then put|Put) the other cards exiled this way on the bottom of your library in a random order$/.test(sentences[si + 3] ?? "")
    ) {
      const filter = parseSearchFilter(untilTwo[1]!.replace(/cards/, "card"));
      if (!filter) return null;
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, untilHits: { n: 2, filter }, hitToHand: true, max: 1, rest: { dest: "bottomRandom" } });
      si += 3;
      continue;
    }
    // Etali, Primal Storm: "exile the top card of each player's library, then you may cast any number of spells from
    // among those cards without paying their mana costs". The cards not cast stay exiled (rulings).
    // Mizzix's Mastery: "Exile target card that's an instant or sorcery from your graveyard. For each card exiled this way,
    // copy it, and you may cast the copy without paying its mana cost." Overloaded, "each card" (CR 702.96a): all of them.
    const mizzix = /^Exile (target|each) card that's an instant or sorcery from your graveyard$/.exec(s);
    if (mizzix && /^For each card exiled this way, copy it, and you may cast the copy without paying its mana cost$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const filter: TargetSpec = { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], owner: "you", text: `${mizzix[1]} card that's an instant or sorcery from your graveyard` };
      const fromYard = mizzix[1] === "target" ? { target: ctx.targets.push(filter) - 1 } : { filter };
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard });
      si++;
      continue;
    }
    // Reenact the Crime: "Exile target nonland card in a graveyard that was put there from anywhere this turn. Copy it. You
    // may cast the copy without paying its mana cost." Cast as it resolves, or never (rulings); a permanent spell copy
    // becomes a token (CR 608.3f).
    const reenact = /^Exile (target nonland card in a graveyard that was put there from anywhere this turn)$/.exec(s);
    if (reenact && sentences[si + 1]?.replace(/\.$/, "") === "Copy it" && sentences[si + 2]?.replace(/\.$/, "") === "You may cast the copy without paying its mana cost") {
      const what = parseObject(reenact[1]!, ctx, true);
      if (what?.ref !== "target") return null;
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: what.index } });
      si += 2;
      continue;
    }
    // Mnemonic Deluge: "Exile target instant or sorcery card from a graveyard. Copy that card three times. You may cast the
    // copies without paying their mana costs." Flawless Forgery: "... from an opponent's graveyard. Copy that card. You may
    // cast the copy without paying its mana cost." Made and cast as it resolves, or never (rulings).
    const deluge = /^Exile (target instant or sorcery card from (?:a|an opponent's|your) graveyard)$/.exec(s);
    const copyN = deluge && /^Copy that card(?: (twice|three times))?$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (deluge && copyN && /^You may cast the (?:copy without paying its mana cost|copies without paying their mana costs)$/.test(sentences[si + 2]?.replace(/\.$/, "") ?? "") && (!copyN[1] === /the copy without/.test(sentences[si + 2]!))) {
      const what = parseObject(deluge[1]!, ctx, true);
      if (what?.ref !== "target") return null;
      const times = copyN[1] === "twice" ? 2 : copyN[1] === "three times" ? 3 : undefined;
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: what.index }, ...(times ? { copyTimes: times } : {}) });
      si += 2;
      continue;
    }
    // Narset, Enlightened Exile: "exile target noncreature, nonland card with mana value less than ~'s power from a
    // graveyard and copy it. You may cast the copy without paying its mana cost." Cast as it resolves, or never; a
    // permanent spell copy becomes a token (CR 608.3f). Her power is checked on targeting and on resolution (CR 608.2b).
    const exileCopy = /^[Ee]xile (target [^.]+ card [^.]*from (?:a|an opponent's|your) graveyard) and copy it$/.exec(s);
    if (exileCopy && sentences[si + 1]?.replace(/\.$/, "") === "You may cast the copy without paying its mana cost") {
      const what = parseObject(exileCopy[1]!, ctx, true);
      if (what?.ref !== "target") return null;
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: what.index } });
      si++;
      continue;
    }
    // Arcane Bombardment: "exile an instant or sorcery card at random from your graveyard. Then copy each card exiled with
    // this enchantment. You may cast any number of the copies without paying their mana costs." The copies are cast as
    // the ability resolves, or never (rulings); the cards stay exiled, linked to it (CR 607.2a).
    if (
      /^[Ee]xile an instant or sorcery card at random from your graveyard$/.test(s) &&
      /^Then copy each card exiled with (?:~|this enchantment)$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "") &&
      /^You may cast any number of the copies without paying their mana costs$/.test(sentences[si + 2]?.replace(/\.$/, "") ?? "")
    ) {
      const filter: TargetSpec = { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], owner: "you", text: "instant or sorcery card" };
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { filter, randomLinked: true } });
      si += 2;
      continue;
    }
    // Battlefield Improvisation: "Target creature gets +2/+2 until end of turn. If that creature is attacking, you may attach
    // any number of Equipment you control to it." Attacking as it resolves.
    const ifAttacking = ctx.lastObjectTarget !== undefined && !ctx.targets[ctx.lastObjectTarget]?.many ? /^If that creature is attacking, (you may attach any number of Equipment you control to it)$/.exec(s) : null;
    if (ifAttacking) {
      const then = parseOne(capital(ifAttacking[1]!), ctx);
      if (!then) return null;
      effects.push({ type: "if", cond: { kind: "targetIs", index: ctx.lastObjectTarget!, filter: { kind: "object", types: ["Creature"], combat: "attacking", text: "attacking creature" } }, effects: then });
      continue;
    }
    // Countryside Crusher: "Reveal the top card of your library. If it's a land card, put it into your graveyard and repeat
    // this process.": one process (run-library.ts).
    if (/^[Rr]eveal the top card of your library$/.test(s) && /^If it's a land card, put it into your graveyard and repeat this process\.?$/.test(sentences[si + 1] ?? "") && si + 2 === sentences.length) {
      effects.push({ type: "revealTopLandsToGraveyard" });
      si++;
      continue;
    }
    // Madcap Experiment: "~ deals damage to you equal to the number of cards revealed this way", after revealing until an
    // artifact card: every card revealed, the one found too (rulings).
    if (/^~ deals damage to you equal to the number of cards revealed this way$/.test(s) && last?.type === "revealUntil" && !last.who) {
      effects.push({ type: "damage", amount: { count: { kind: "revealedUntilCount" } }, to: { ref: "you" } });
      continue;
    }
    // Primal Surge: all three sentences, one process (run-library.ts).
    if (s === "Exile the top card of your library" && sentences[si + 1] === "If it's a permanent card, you may put it onto the battlefield" && /^If you do, repeat this process\.?$/.test(sentences[si + 2] ?? "") && si + 3 === sentences.length) {
      effects.push({ type: "surge" });
      si += 2;
      continue;
    }
    // Tersa Lightshatter: "exile a card at random from your graveyard. You may play that card this turn." Played the usual
    // way, paying its costs (rulings).
    if (/^[Ee]xile a card at random from your graveyard$/.test(s) && /^You may play that card this turn$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "randomFromGraveyard", dest: "exilePlay" });
      si++;
      continue;
    }
    // Faerie Artisans: "Then exile all other tokens created with this creature": those its abilities created, as that
    // object (rulings), not the one just created.
    if (/^(?:Then )?[Ee]xile all other tokens created with (?:~|this creature)$/.test(s)) {
      effects.push({ type: "exile", what: { ref: "tokensCreatedWithSelf" } });
      continue;
    }
    // Wondrous Crucible: "exile a nonland card at random from your graveyard. Copy it. You may cast the copy without paying
    // its mana cost." Cast as this resolves, or never (CR 608.2g); the card stays exiled and an uncast copy ceases to exist
    // (rulings); X is 0 (CR 107.3b).
    const crucible = /^[Ee]xile an? (nonland|instant or sorcery) card at random from your graveyard$/.exec(s);
    if (crucible && /^Copy it$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "") && /^You may cast the copy without paying its mana cost$/.test(sentences[si + 2]?.replace(/\.$/, "") ?? "")) {
      const filter: TargetSpec = crucible[1] === "nonland" ? { kind: "card", types: [], notTypes: ["Land"], notColors: [], owner: "you", text: "nonland card" } : { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], owner: "you", text: "instant or sorcery card" };
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { filter, random: true } });
      si += 2;
      continue;
    }
    // Kefka, Dancing Mad: "exile a card at random from each opponent's graveyard. You may cast any number of spells from
    // among cards exiled this way without paying their mana costs. Then each player who owns a spell you cast this way
    // loses life equal to its mana value." Cast as this resolves, or never (rulings, CR 608.2g); X is 0 (CR 107.3b).
    if (
      /^[Ee]xile a card at random from each opponent's graveyard$/.test(s) &&
      sentences[si + 1]?.replace(/\.$/, "") === "You may cast any number of spells from among cards exiled this way without paying their mana costs" &&
      sentences[si + 2]?.replace(/\.$/, "").replace(/^Then e/, "E") === "Each player who owns a spell you cast this way loses life equal to its mana value"
    ) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, fromYard: { randomEachOpponent: true }, ownersLoseLife: true });
      si += 2;
      continue;
    }
    // Wand of Wonder (one row of its table): "Each opponent exiles cards from the top of their library until they exile an
    // instant or sorcery card, then shuffles the rest into their library. You may cast up to two instant and/or sorcery
    // spells from among cards exiled this way without paying their mana costs." Cast as this resolves (CR 608.2g).
    const wandCast = /^[Ee]ach opponent exiles cards from the top of their library until they exile an instant or sorcery card, then shuffles the rest into their library$/.test(s)
      ? /^You may cast up to (one|two|three) instant and\/or sorcery spells? from among cards exiled this way without paying (?:its|their) mana costs?$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "")
      : null;
    if (wandCast) {
      const spells: TargetSpec = { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" };
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 1, each: true, opponents: true, untilHit: spells, filter: spells, max: num(wandCast[1]!) });
      si++;
      continue;
    }
    // Etali, Primal Conqueror: "each player exiles cards from the top of their library until they exile a nonland card.
    // You may cast any number of spells from among the nonland cards exiled this way without paying their mana costs."
    if (/^[Ee]ach player exiles cards from the top of their library until they exile a nonland card$/.test(s) && /^You may cast any number of spells from among the nonland cards exiled this way without paying their mana costs$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 1, each: true, untilNonland: true });
      si++;
      continue;
    }
    // Fevered Suspicion: "Each opponent exiles cards from the top of their library until they exile a nonland card. You may
    // cast any number of spells from among those nonland cards without paying their mana costs." The same, opponents only;
    // what isn't cast stays exiled (rulings).
    if (/^[Ee]ach opponent exiles cards from the top of their library until they exile a nonland card$/.test(s) && /^You may cast any number of spells from among those nonland cards without paying their mana costs$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 1, each: true, untilNonland: true, opponents: true });
      si++;
      continue;
    }
    // Plargg and Nassari: "... An opponent chooses a nonland card exiled this way. You may cast up to two spells from among
    // the other cards exiled this way without paying their mana costs." You choose the opponent (rulings).
    if (
      /^[Ee]ach player exiles cards from the top of their library until they exile a nonland card$/.test(s) &&
      sentences[si + 1]?.replace(/\.$/, "") === "An opponent chooses a nonland card exiled this way" &&
      /^You may cast up to two spells from among the other cards exiled this way without paying their mana costs$/.test(sentences[si + 2]?.replace(/\.$/, "") ?? "")
    ) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 1, each: true, untilNonland: true, opponentExcludes: true, max: 2 });
      si += 2;
      continue;
    }
    // Benthic Anomaly: "For each opponent, choose a creature that player controls. Create a token that's a copy of one of
    // those creatures, except its power is equal to the total power of those creatures, its toughness is equal to the
    // total toughness of those creatures, and it's a colorless Eldrazi creature." An Eldrazi creature instead of its
    // other card types and creature types, keeping its supertypes, and colorless (rulings).
    if (/^[Ff]or each opponent, choose a creature that player controls$/.test(s) && /^Create a token that's a copy of one of those creatures, except its power is equal to the total power of those creatures, its toughness is equal to the total toughness of those creatures, and it's a colorless Eldrazi creature\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "copyChosenPerOpponent", filter: { kind: "object", types: ["Creature"], text: "creature" }, except: { setTypes: ["Creature"], setSubtypes: ["Eldrazi"], colors: [] } });
      si++;
      continue;
    }
    // Dance with Calamity: "As many times as you choose, you may exile the top card of your library. If the total mana
    // value of the cards exiled this way is 13 or less, you may cast any number of spells from among those cards without
    // paying their mana costs." Cast as it resolves, or never (rulings, CR 608.2g).
    if (/^Shuffle your library$/.test(s) && /^As many times as you choose, you may exile the top card of your library\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "shuffle", who: { ref: "you" } });
      continue;
    }
    if (/^As many times as you choose, you may exile the top card of your library$/.test(s)) {
      const then = /^If the total mana value of the cards exiled this way is (\d+) or less, you may cast any number of spells from among those cards without paying their mana costs\.?$/.exec(sentences[si + 1] ?? "");
      if (!then) return null;
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, pushLuck: Number(then[1]) });
      si++;
      continue;
    }
    if (/^[Ee]xile the top card of each player's library$/.test(s) && /^[Yy]ou may cast any number of spells from among those cards without paying their mana costs$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 1, each: true });
      si++;
      continue;
    }
    if (untilMv && /^You may cast any number of spells from among them without paying their mana costs\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 0, untilMv: Number(untilMv[1]) });
      si++;
      continue;
    }
    // Sunbird's Invocation, in a cast trigger: "Reveal the top X cards of your library, where X is that spell's mana value.
    // You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost.
    // Put the rest on the bottom of your library in a random order." Cast from the library, as this resolves (CR 608.2g).
    // Descendants' Path: "Reveal the top card of your library. If it's a creature card that shares a creature type with a
    // creature you control, you may cast it without paying its mana cost. If you don't cast it, put it on the bottom of your
    // library." Cast from the library as this resolves (CR 608.2g); the types compared then.
    if (/^[Rr]eveal the top card of your library$/.test(s) && sentences[si + 1]?.replace(/\.$/, "") === "If it's a creature card that shares a creature type with a creature you control, you may cast it without paying its mana cost" && sentences[si + 2]?.replace(/\.$/, "") === "If you don't cast it, put it on the bottom of your library") {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 1, reveal: true, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, sharesTypeWithYours: true, max: 1, rest: { dest: "bottomRandom" } });
      si += 2;
      continue;
    }
    // Rashmi, Eternities Crafter, in a cast trigger: "Reveal the top card of your library. You may cast it without paying its
    // mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand." Cast from the library
    // as this resolves (CR 608.2g); "lesser" than the spell's mana value as it last existed, X as chosen for it (rulings);
    // a land can't be cast, so it goes to the hand.
    if (/^[Rr]eveal the top card of your library$/.test(s) && ctx.castSpell && sentences[si + 1]?.replace(/\.$/, "") === "You may cast it without paying its mana cost if it's a spell with lesser mana value" && sentences[si + 2]?.replace(/\.$/, "") === "If you don't cast it, put it into your hand") {
      const mv = parseCount("that spell's mana value", ctx);
      if (!mv || typeof mv !== "object") return null;
      // One less, and below 0 for a spell with mana value 0: nothing is lesser (CR 107.1b doesn't apply to a comparison).
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 1, reveal: true, maxMv: { ...mv, plus: (mv.plus ?? 0) - 1, signed: true }, max: 1, rest: { dest: "bottomRandom", toHand: true } });
      si += 2;
      continue;
    }
    // Mind's Dilation, in an opponent's cast trigger: "that player exiles the top card of their library. If it's a nonland
    // card, you may cast it without paying its mana cost." Cast as this resolves (CR 608.2g); a land, or a card not cast,
    // stays exiled (rulings).
    if (/^[Tt]hat player exiles the top card of their library$/.test(s) && sentences[si + 1]?.replace(/\.$/, "") === "If it's a nonland card, you may cast it without paying its mana cost") {
      const who = parsePlayer("that player", ctx);
      if (!who || who.ref === "you") return null;
      effects.push({ type: "castFromAmong", who, n: 1, filter: { kind: "card", types: [], notTypes: ["Land"], notColors: [], text: "nonland card" }, max: 1 });
      si++;
      continue;
    }
    // Planetarium of Wan Shi Tong: "Look at the top card of your library. You may cast that card without paying its mana
    // cost." Cast from the library as this resolves, or not at all (CR 608.2g, rulings); a land can't be cast.
    if (/^[Ll]ook at the top card of your library$/.test(s) && sentences[si + 1]?.replace(/\.$/, "") === "You may cast that card without paying its mana cost" && si + 2 === sentences.length) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 1, reveal: true, look: true, max: 1 });
      si++;
      continue;
    }
    // Powerbalance, in an opponent's cast trigger: "You may reveal the top card of your library. If you do, you may cast
    // that card without paying its mana cost if the two spells have the same mana value." Cast from the library as this
    // resolves (CR 608.2g, rulings), its mana value compared with the spell's (X as chosen for that spell, CR 202.3e).
    if (/^[Yy]ou may reveal the top card of your library$/.test(s) && ctx.castSpell && sentences[si + 1]?.replace(/\.$/, "") === "If you do, you may cast that card without paying its mana cost if the two spells have the same mana value") {
      const mv = parseCount("that spell's mana value", ctx);
      if (!mv) return null;
      effects.push({ type: "may", effects: [{ type: "castFromAmong", who: { ref: "you" }, n: 1, reveal: true, exactMv: mv, max: 1 }], text: "reveal the top card of your library" });
      si++;
      continue;
    }
    // Counterbalance, in an opponent's cast trigger: "You may reveal the top card of your library. If you do, counter that
    // spell if it has the same mana value as the revealed card." The spell's with X as chosen for it, the card's with X
    // as 0 (rulings, CR 202.3e).
    if (/^[Yy]ou may reveal the top card of your library$/.test(s) && ctx.castSpell && sentences[si + 1]?.replace(/\.$/, "") === "If you do, counter that spell if it has the same mana value as the revealed card") {
      const mv = parseCount("that spell's mana value", ctx);
      if (!mv) return null;
      effects.push({ type: "may", effects: [{ type: "revealTop" }, { type: "if", cond: { kind: "revealedMv", mv }, effects: [{ type: "counterCause" }] }], text: "reveal the top card of your library" });
      si++;
      continue;
    }
    // Aetherworks Marvel: "Look at the top six cards of your library. You may cast a spell from among them without paying
    // its mana cost. Put the rest on the bottom of your library in a random order." Cast from the library as this resolves
    // (CR 608.2g, rulings).
    const lookCast = /^[Ll]ook at the top (two|three|four|five|six|seven|eight|nine|ten) cards of your library$/.exec(s);
    if (lookCast && sentences[si + 1]?.replace(/\.$/, "") === "You may cast a spell from among them without paying its mana cost" && sentences[si + 2]?.replace(/\.$/, "") === "Put the rest on the bottom of your library in a random order") {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: num(lookCast[1]!), reveal: true, look: true, max: 1, rest: { dest: "bottomRandom" } });
      si += 2;
      continue;
    }
    // Cosmic Cube: "You may cast a spell from among them with mana value less than or equal to the greatest power among
    // attacking creatures you control without paying its mana cost": that bound worked out as it resolves.
    // Velomachus Lorehold: "You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from
    // among them without paying its mana cost": only those, the power as it resolves.
    const lookCastMv = lookCast && (/^You may cast a spell from among them with mana value less than or equal to (.+) without paying its mana cost$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") ?? /^You may cast an instant or sorcery spell with mana value less than or equal to (.+) from among them without paying its mana cost$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? ""));
    if (lookCast && lookCastMv && sentences[si + 2]?.replace(/\.$/, "") === "Put the rest on the bottom of your library in a random order") {
      const x = parseCount(lookCastMv[1]!, ctx);
      if (!x) return null;
      const spells = / an instant or sorcery spell /.test(lookCastMv[0]) ? { filter: { kind: "card" as const, types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" } } : {};
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: num(lookCast[1]!), reveal: true, look: true, maxMv: x, max: 1, rest: { dest: "bottomRandom" }, ...spells });
      si += 2;
      continue;
    }
    const sunbird = /^[Rr]eveal the top X cards of your library, where X is (that spell's mana value)$/.exec(s);
    if (sunbird && sentences[si + 1]?.replace(/\.$/, "") === "You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost" && sentences[si + 2]?.replace(/\.$/, "") === "Put the rest on the bottom of your library in a random order") {
      const x = parseCount(sunbird[1]!, ctx);
      if (!x) return null;
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: x, reveal: true, maxMv: x, max: 1, rest: { dest: "bottomRandom" } });
      si += 2;
      continue;
    }
    if (castAmongHead && castAmong && (castAmongHead[2] || castAmongHead[3] || afterShuffle)) {
      const n = castAmongHead[1] ?? castAmongHead[4]!;
      const whose = castAmongHead[2] ? (castAmongHead[2] === "your" ? "you" : castAmongHead[2] === "their" ? "that player" : castAmongHead[2].replace(/'s$/, "")) : castAmongHead[3] ?? "you";
      const who = parsePlayer(whose, ctx);
      if (!who) return null;
      const [, many, kinds, total, mv] = castAmong;
      const one = many === "a" || many === "an";
      // Plain "spells" needs "any number of"; "instant and sorcery spells" says it without (Epic Experiment).
      if (!many && kinds !== "instant and sorcery" && !lands) return null;
      // "An instant or sorcery spell ... its mana cost", "spells ... their mana costs": the words agree.
      if (one !== /its mana cost$/.test(sentences[si + 1]!.replace(/\.$/, "")) || (one && total)) return null;
      const limit = mv ? amt(mv) : undefined;
      const types = kinds && kinds !== "Aura" ? (kinds === "sorcery" ? ["Sorcery"] : kinds === "instant" ? ["Instant"] : ["Instant", "Sorcery"]) : undefined;
      // "You may cast an Aura spell from among them" (Herald of Amity).
      const filter: TargetSpec | undefined = kinds === "Aura" ? parseSearchFilter("Aura card") ?? undefined : types ? { kind: "card", types: types as TargetSpec["types"] & string[], notTypes: [], notColors: [], text: `${kinds} card` } : undefined;
      if (kinds === "Aura" && !filter) return null;
      // What happens to the exiled cards not cast: "Then put the exiled instant and sorcery cards that weren't cast this
      // way into your hand and the rest on the bottom of your library in a random order" (Muse Vortex), "Then put all
      // cards exiled this way that weren't cast into your graveyard" (Epic Experiment), "Put the exiled cards not cast
      // this way on the bottom of your library in a random order" (Collected Conjuring). Your own library only.
      const restText = sentences[si + 2]?.replace(/\.$/, "").replace(/^Then,? (.)/, (_, c: string) => c.toUpperCase()) ?? "";
      const rest: { dest: "graveyard" | "bottomRandom"; toHand?: boolean } | undefined =
        kinds && new RegExp(`^Put the exiled ${kinds.replace(" or ", " and ")} cards that weren't cast this way into your hand and the rest on the bottom of your library in a random order$`).test(restText)
          ? { dest: "bottomRandom", toHand: true }
          : /^Put all cards exiled this way that weren't cast into your graveyard$/.test(restText)
            ? { dest: "graveyard" }
            : /^Put the exiled cards not cast this way on the bottom of your library in a random order$/.test(restText) || (one && /^Put the rest on the bottom of your library in a random order$/.test(restText))
              ? { dest: "bottomRandom" }
              : undefined;
      if (rest?.dest === "bottomRandom" && who.ref !== "you") return null;
      effects.push({ type: "castFromAmong", who, n: amt(n), ...(lands ? { lands: true as const } : {}), ...(limit !== undefined ? (total ? { totalMv: limit } : { maxMv: limit }) : {}), ...(filter ? { filter } : {}), ...(one ? { max: 1 } : many === "up to two" ? { max: 2 } : {}), ...(rest ? { rest } : {}) });
      si += rest ? 2 : 1;
      continue;
    }
    // The Key to the Vault, after "You may exile a nonland card from among them. Put the rest on the bottom ...": cast as
    // this resolves, or it stays exiled (rulings).
    if (/^You may cast the exiled card without paying its mana cost$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "dig" || last.into !== "exile" || last.count !== 1 || last.play || last.castFree || last.each || !last.filter?.notTypes?.includes("Land")) return null;
      last.castFree = true;
      continue;
    }
    // Diluvian Primordial, after its "for each opponent, you may cast ...": the spells cast this way.
    if (/^If a spell cast this way would be put into a graveyard, exile it instead$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "castTargetFree" || last.exileAfter) return null;
      last.exileAfter = true;
      continue;
    }
    // Tinybones, the Pickpocket: "you may cast target nonland permanent card from that player's graveyard, and mana of any
    // type can be spent to cast that spell": cast as it resolves or not at all, paying its costs, timing ignored (rulings).
    const castTheirs = ctx.eventPlayer ? /^[Yy]ou may cast (target .+? card from that player's graveyard), and mana of any type can be spent to cast that spell$/.exec(s) : null;
    if (castTheirs) {
      const before = ctx.targets.length;
      const what = parseCardTarget(castTheirs[1]!, ctx);
      const t = ctx.targets[before];
      if (what?.ref !== "target" || ctx.targets.length !== before + 1 || t?.kind !== "card" || !t.types?.length || !t.notTypes?.includes("Land")) return null;
      effects.push({ type: "castNow", what, anyOwner: true, anyType: true });
      continue;
    }
    // "You may cast target instant or sorcery card from your graveyard. If that spell would be put into your graveyard, exile
    // it instead." (Emet-Selch, Toshiro Umezawa, Chandra, Flame's Catalyst): cast as it resolves or not at all, paying its
    // costs, timing ignored (CR 608.2g, 601.2).
    const castPaid = /^[Yy]ou may cast (target .+? card from your graveyard)$/.exec(s);
    const paidRider = sentences[si + 1]?.replace(/\.$/, "");
    if (castPaid && (paidRider === "If that spell would be put into your graveyard, exile it instead" || paidRider === "If that spell would be put into a graveyard, exile it instead")) {
      const before = ctx.targets.length;
      const what = parseCardTarget(castPaid[1]!, ctx, "you");
      const t = ctx.targets[before];
      if (!what || ctx.targets.length !== before + 1 || t?.kind !== "card" || !t.types?.length || t.types.includes("Land")) return null;
      effects.push({ type: "castNow", what, exileAfter: true });
      si++;
      continue;
    }
    // "You may cast target instant card from your graveyard without paying its mana cost. If that spell would be put into
    // your graveyard, exile it instead." (Torrential Gearhulk): cast as it resolves (CR 608.2g), or not.
    // "You may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost." (Memory
    // Plunder): the same, the spell going to its owner's graveyard after; Arcane Heist: "If that spell would be put into
    // their graveyard, exile it instead".
    // Sword of Once and Future: "Then you may cast an instant or sorcery spell with mana value 2 or less from your graveyard
    // without paying its mana cost. If that spell would be put into your graveyard, exile it instead.": one card there,
    // picked and cast as this resolves, or none (rulings).
    // Diviner of Mist: "an instant or sorcery spell from your graveyard with mana value 4 or less", the same.
    const castYard = /^(?:Then )?[Yy]ou may cast (an? .+? spell with mana value \d+ or less) from your graveyard without paying its mana cost$/.exec(s.replace(/ spell from your graveyard (with mana value \d+ or less) without/, " spell $1 from your graveyard without"));
    if (castYard && sentences[si + 1]?.replace(/\.$/, "") === "If that spell would be put into your graveyard, exile it instead") {
      const fx = parseOne(`You may cast ${castYard[1]!} from your hand without paying its mana cost`, ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "castFromHand") return null;
      effects.push({ ...fx[0]!, fromGraveyard: true });
      si++;
      continue;
    }
    // Wrexial, the Risen Deep: "from that player's graveyard", the player it dealt combat damage to; "If that spell would be
    // put into a graveyard, exile it instead".
    const castTarget = /^[Yy]ou may cast (target .+? card(?: with .+?)? from (your|an opponent's|that player's) graveyard) without paying its mana cost$/.exec(s);
    if (castTarget && (castTarget[2] !== "that player's" || ctx.eventPlayer)) {
      const theirs = castTarget[2] !== "your";
      const rider = sentences[si + 1]?.replace(/\.$/, "");
      const exileAfter = rider === `If that spell would be put into ${theirs ? "their" : "your"} graveyard, exile it instead` || (theirs && rider === "If that spell would be put into a graveyard, exile it instead") ? (true as const) : !theirs && rider === "If an instant or sorcery spell cast this way would be put into your graveyard, exile it instead" ? ("instantOrSorcery" as const) : undefined;
      const before = ctx.targets.length;
      const what = parseCardTarget(castTarget[1]!, ctx, theirs ? undefined : "you");
      const t = ctx.targets[before];
      // A land card can't be cast (CR 305.9).
      if (!what || (!exileAfter && !theirs) || ctx.targets.length !== before + 1 || t?.kind !== "card" || (castTarget[2] === "that player's" ? t.owner || t.controller !== "eventPlayer" : t.owner !== (theirs ? "opponent" : "you")) || !t.types?.length || t.types.includes("Land")) return null;
      effects.push({ type: "castTargetFree", what, ...(exileAfter ? { exileAfter } : {}) });
      if (exileAfter) si++;
      continue;
    }
    // "You may search your library and/or graveyard for a card named Ajani, Valiant Protector, reveal it, and put it into
    // your hand. If you search your library this way, shuffle." (CR 701.23): one card, from either zone; whether the
    // library is searched too is the player's choice as it resolves (search.orGraveyard).
    // "... and put it onto the battlefield with X additional +1/+1 counters on it. If X is 4 or greater, it gains haste
    // until end of turn. If you search your library this way, shuffle." (Vision Quest): the shuffle doesn't depend on
    // what's between, so it goes with the search.
    const orYard = new RegExp(`^(?:([Yy]ou may) )?[Ss]earch your library and\\/or graveyard for (a|an) (.+?)(, reveal it,)? and put it (into your hand|onto the battlefield(?: tapped)?)(?: with (X|an|a|one|two|three) additional ${COUNTER} counters? on it)?$`).exec(s);
    const isShuffle = (i: number) => sentences[i]?.replace(/\.$/, "") === "If you search your library this way, shuffle";
    const shuffleAt = isShuffle(si + 1) ? si + 1 : orYard && !orYard[1] && isShuffle(si + 2) ? si + 2 : undefined;
    if (orYard && shuffleAt !== undefined) {
      const filter = parseSearchFilter(orYard[3]!, (t) => parseBoundCount(t, ctx));
      if (filter === null) return null;
      const dest: SearchDest =
        orYard[5] === "into your hand"
          ? { zone: "hand" }
          : { zone: "battlefield", ...(/tapped$/.test(orYard[5]!) ? { tapped: true } : {}), ...(orYard[6] ? { counters: { counter: counterKind(orYard[7]!), n: /^an?$/.test(orYard[6]) ? 1 : amt(orYard[6]) } } : {}) };
      if (orYard[6] === "X" && !ctx.spell && !ctx.ownX) return null;
      const search: Effect = { type: "search", ...(filter ? { filter } : {}), n: 1, upTo: false, reveal: !!orYard[4], dest, orGraveyard: true };
      const fx: Effect = orYard[1] ? { type: "may", effects: [search], text: s.replace(/^[Yy]ou may /, "") } : search;
      effects.push(fx);
      noteLast(ctx, [fx]);
      if (shuffleAt === si + 1) si++;
      else sentences.splice(shuffleAt, 1);
      continue;
    }
    // Kassandra, Eagle Bearer: "search your graveyard, hand, and library for a card named The Spear of Leonidas, put it
    // onto the battlefield, then shuffle": one card from any of the three zones (CR 701.23); finding nothing is allowed,
    // as the search is for a card with a stated quality (CR 701.23b).
    const threeZones = /^[Ss]earch your graveyard, hand, and library for (a card named [^,]+), put it onto the battlefield, then shuffle$/.exec(s);
    if (threeZones) {
      const filter = parseSearchFilter(threeZones[1]!.replace(/^a /, ""));
      if (!filter?.named) return null;
      const fx: Effect = { type: "search", filter, n: 1, upTo: false, reveal: false, dest: { zone: "battlefield" }, andGraveyard: true, andHand: true };
      effects.push(fx);
      noteLast(ctx, [fx]);
      continue;
    }
    // Doomsday: "Search your library and graveyard for five cards and exile the rest. Put the chosen cards on top of your
    // library in any order.": five from the two zones together, all of them if there are fewer (rulings, CR 701.23d); the
    // rest of both zones is exiled, then the five go on top in the order you choose, with no shuffle.
    const doom = /^Search your library and graveyard for (two|three|four|five|six|seven) cards and exile the rest$/.exec(s);
    if (doom && sentences[si + 1]?.replace(/\.$/, "") === "Put the chosen cards on top of your library in any order") {
      effects.push({ type: "search", n: amt(doom[1]!), upTo: false, reveal: false, dest: { zone: "libraryTop" }, andGraveyard: true, exileRest: true, noShuffle: true });
      si++;
      continue;
    }
    // Claim Jumper: "you may search your library for a Plains card and put it onto the battlefield tapped. Then if an
    // opponent controls more lands than you, repeat this process once. If you search your library this way, shuffle."
    // The process (the "you may" too) happens again only if the condition holds then (rulings); one shuffle at the end,
    // only if a library was searched (CR 701.20, 701.23).
    const again = /^(?:([Yy]ou may) )?[Ss]earch your library for (a|an) (.+?) and put it onto the battlefield( tapped)?$/.exec(s);
    const againIf = again && /^Then if (.+), repeat this process once$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (again && againIf && isShuffle(si + 2)) {
      const filter = parseSearchFilter(again[3]!, (t) => parseBoundCount(t, ctx));
      const cond = parseStaticCondition(againIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (filter === null || !cond) return null;
      const search: Effect = { type: "search", ...(filter ? { filter } : {}), n: 1, upTo: false, reveal: false, dest: { zone: "battlefield", ...(again[4] ? { tapped: true as const } : {}) }, noShuffle: true };
      const once: Effect = again[1] ? { type: "may", effects: [search], text: s.replace(/^[Yy]ou may /, "") } : search;
      effects.push(once, { type: "if", cond: { kind: "state", cond }, effects: [once] }, { type: "shuffle", who: { ref: "you" }, ifSearched: true });
      si += 2;
      continue;
    }
    // Mission Briefing: "choose an instant or sorcery card in your graveyard. You may cast it this turn. If that spell would
    // be put into your graveyard, exile it instead." Chosen as it resolves, not targeted (a card just surveilled there
    // too, never this spell, still on the stack: rulings); then a permission at its normal timing (rulings).
    const briefing = /^[Cc]hoose an? (instant or sorcery card|instant card|sorcery card) in your graveyard$/.exec(s);
    if (briefing && /^You may cast it this turn$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const filter = parseSearchFilter(briefing[1]!);
      if (!filter) return null;
      const rider = sentences[si + 2]?.replace(/\.$/, "") === "If that spell would be put into your graveyard, exile it instead";
      effects.push({ type: "chooseFromGraveyard", n: 1, filter, dest: "castThisTurn", ...(rider ? { exileAfter: true as const } : {}) });
      si += rider ? 2 : 1;
      continue;
    }
    // "You may choose a creature card in your graveyard. If you do, return it to the battlefield with an additional +1/+1
    // counter on it" (Cauldron's Gift): one choice and one move, nothing in between (rulings), and not targeted.
    const yardPick = /^You may choose an? (.+? card) in your graveyard$/.exec(s);
    const yardBack = yardPick && new RegExp(`^If you do, return it to the battlefield(?: with an additional (${COUNTER}) counter on it)?$`).exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (yardPick && yardBack) {
      const filter = parseSearchFilter(yardPick[1]!);
      if (filter === null || (filter?.types ?? []).some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
      effects.push({ type: "chooseFromGraveyard", n: 1, upTo: true, dest: "battlefield", ...(filter ? { filter } : {}), ...(yardBack[1] ? { counters: { [counterKind(yardBack[1])]: 1 } } : {}) });
      si++;
      continue;
    }
    // "For each player, choose a creature or planeswalker card in that player's graveyard. Put those cards onto the
    // battlefield under your control." (Breach the Multiverse): not targeted, so chosen as it resolves (CR 608.2c), one in
    // each graveyard, then all enter at the same time under your control (CR 110.2a). Only permanent card types, so no
    // Aura needs something to enchant.
    // Ripples of Potential: "Proliferate, then choose any number of permanents you control that had a counter put on them
    // this way. Those permanents phase out." Chosen after proliferating, all phasing out at once (CR 702.26).
    if (/^Proliferate$/i.test(s) && /^[Cc]hoose any number of permanents you control that had a counter put on them this way$/.test(sentences[si + 1] ?? "") && /^Those permanents phase out$/.test(sentences[si + 2]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "proliferate", thenPhaseOut: true });
      si += 2;
      continue;
    }
    // Sword of Hearth and Home: "exile up to one target creature you own, then search your library for a basic land card.
    // Put both cards onto the battlefield under your control, then shuffle." Both enter at the same time (rulings).
    const holdExile = /^[Ee]xile (up to one target creature you own)$/.exec(s);
    if (holdExile && /^[Ss]earch your library for a basic land card$/.test(sentences[si + 1] ?? "") && /^Put both cards onto the battlefield under your control, then shuffle$/.test(sentences[si + 2]?.replace(/\.$/, "") ?? "")) {
      const what = parseObject(holdExile[1]!, ctx);
      if (what?.ref !== "target") return null;
      effects.push({ type: "flicker", what, under: "you", hold: true });
      effects.push({ type: "search", filter: { kind: "card", types: ["Land"], supertypes: ["Basic"], text: "basic land card" }, n: 1, upTo: false, dest: { zone: "battlefield" }, reveal: false, withHeld: true });
      si += 2;
      continue;
    }
    // Myr Battlesphere: "you may tap X untapped Myr you control. If you do, ~ gets +X/+0 until end of turn and deals X
    // damage to the player or planeswalker it's attacking." X is chosen as it resolves, no more than the untapped Myr you
    // control, and they can be tapped even after ~ has left the battlefield (rulings); X = 0 does nothing.
    const tapX = /^[Yy]ou may tap X untapped ([A-Z][a-z]+) you control$/.exec(s);
    const tapXThen = tapX && CREATURE_TYPES.has(tapX[1]!) ? /^If you do, ~ gets \+X\/\+0 until end of turn and deals X damage to (.+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (tapX && tapXThen) {
      const to = parseDamageRecipient(tapXThen[1]!, ctx);
      if (!to) return null;
      const x: AmountExpr = { count: { kind: "tappedThisWay" } };
      effects.push(
        { type: "tapAnyNumber", filter: { kind: "object", subtypes: [tapX[1]!], controller: "you", text: `${tapX[1]} you control` } },
        { type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power: x, toughness: 0 }], duration: "endOfTurn" },
        { type: "damage", amount: x, to },
      );
      si++;
      continue;
    }
    // Promise of Loyalty: "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those
    // creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it." Each must put
    // one if able (rulings); the counter staying is what keeps the restriction (CR 611.2b), whoever controls it later.
    const vow = new RegExp(`^Each player puts an? (${COUNTER}) counter on a creature they control and sacrifices the rest$`).exec(s);
    const vowThen = vow && new RegExp(`^Each of those creatures can't attack you or planeswalkers you control for as long as it has an? ${vow[1]!.replace(/[+/]/g, "\\$&")} counter on it$`).exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (vow && vowThen) {
      const creature: TargetSpec = { kind: "object", types: ["Creature"], text: "creature" };
      const counter = counterKind(vow[1]!);
      effects.push(
        { type: "keepRest", who: { ref: "eachPlayer" }, keep: [{ filter: creature, n: 1 }], among: creature, counter },
        { type: "continuous", what: { ref: "created" }, mods: [{ kind: "cantAttackYou" }], duration: "game", whileCounter: counter },
      );
      si++;
      continue;
    }
    // The Chain cards: "Then that permanent's controller may sacrifice a land of their choice. If the player does, they may
    // copy ~ and may choose a new target for that copy" (Chain of Vapor), "Then that permanent's controller may copy ~ and
    // may choose a new target for that copy" (Chain of Acid). That player, as it resolves, controls the copy (CR 707.10,
    // 707.10c); as if they were "you" (eachMay's each). Who it is when the permanent has left: its last controller (608.2h).
    // "Then that player or that permanent's controller may pay {R}{R}. If the player does, they may copy ~ ..." (Chain
    // Lightning), "... may discard a card ..." (Chain of Plasma), "That player may copy ~ ..." (Chain of Smog): the player
    // targeted, or the targeted permanent's controller.
    const chain = /^([Tt]hat (?:permanent|creature)'s controller|[Tt]hat player or that permanent's controller|[Tt]hat player) may (sacrifice a land of their choice|discard a card|pay ((?:\{[^}]+\})+)|copy ~ and may choose a new target for that copy)$/.exec(s);
    const chainCopy = /^(?:If the player does, )?they may copy ~ and may choose a new target for that copy$/;
    if (chain && ctx.spell && (chain[2]!.startsWith("copy") || chainCopy.test(sentences[si + 1]?.replace(/\.$/, "") ?? ""))) {
      const last = ctx.targets.length - 1;
      const who: PlayerRef | null = /or that permanent's/i.test(chain[1]!) ? (ctx.targets[last]?.kind === "any" && ctx.targets.length === 1 ? { ref: "targetOrController", index: last } : null) : parsePlayer(chain[1]!.toLowerCase(), ctx);
      if (who?.ref !== "targetController" && who?.ref !== "targetOrController" && !(who?.ref === "target" && ctx.targets.length === 1 && ctx.targets[0]!.kind === "player")) return null;
      const copy: Effect = { type: "copySpell", spell: "self", n: 1, newTargets: true };
      const land: TargetSpec = { kind: "object", types: ["Land"], text: "land" };
      const how = chain[2]!.startsWith("copy") ? "copy" : chain[2]!.startsWith("sacrifice") ? "land" : chain[2]!.startsWith("discard") ? "discard" : "pay";
      const mayCopy: Effect = { type: "may", effects: [copy], text: "copy ~ and choose a new target for the copy" };
      effects.push({
        type: "eachMay",
        who,
        each: true,
        chain: true,
        effects: how === "land" ? [{ type: "pick", who: { ref: "you" }, filter: land, n: 1, action: "sacrifice" }, mayCopy] : how === "discard" ? [{ type: "discard", who: { ref: "you" }, n: 1 }, mayCopy] : how === "pay" ? [mayCopy] : [copy],
        text: how === "land" ? "sacrifice a land to copy ~" : how === "discard" ? "discard a card to copy ~" : how === "pay" ? `pay ${chain[3]} to copy ~` : "copy ~ and choose a new target for the copy",
        ...(how === "land" ? { need: { zone: "battlefield" as const, filter: { ...land, controller: "you" as const } } } : {}),
        ...(how === "discard" ? { need: { zone: "hand" as const, filter: { kind: "card" as const, text: "card" } } } : {}),
        ...(how === "pay" ? { pay: { mana: chain[3]! } } : {}),
      });
      const cost = how !== "copy";
      if (cost) si++;
      continue;
    }
    // Syphon Mind: "Each other player discards a card. You draw a card for each card discarded this way": the cards this
    // spell's discard made them discard, all at once (rulings).
    if (/^(?:You )?[Dd]raw a card for each card discarded this way$/.test(s) && effects[effects.length - 1]?.type === "discard") {
      effects.push({ type: "draw", who: { ref: "you" }, n: { count: { kind: "discardedThisWay" } } });
      continue;
    }
    // Forget: "Target player discards two cards, then draws as many cards as they discarded this way.": the same player.
    const prevDiscard = effects[effects.length - 1];
    if (/^(?:That player|They) draws? as many cards as they discarded this way$/.test(s) && prevDiscard?.type === "discard" && prevDiscard.who.ref === "target") {
      effects.push({ type: "draw", who: prevDiscard.who, n: { count: { kind: "discardedThisWay" } } });
      continue;
    }
    // Skullknocker Ogre: "that player discards a card at random. If the player does, they draw a card.": only if a card was
    // discarded (rulings: with one card in hand, it's discarded and they draw).
    if (/^If the player does, they draw a card$/.test(s) && prevDiscard?.type === "discard" && prevDiscard.who.ref === "eventPlayer" && prevDiscard.n === 1 && !prevDiscard.upTo) {
      effects.push({ type: "draw", who: prevDiscard.who, n: { count: { kind: "discardedThisWay" } } });
      continue;
    }
    // Gerrard's Verdict: "Target player discards two cards. You gain 3 life for each land card discarded this way."
    const gainPer = /^You gain (\d+) life for each (land|creature|nonland) card discarded this way$/.exec(s);
    if (gainPer && effects[effects.length - 1]?.type === "discard") {
      const filter = parseSearchFilter(`${gainPer[2]} card`);
      if (!filter) return null;
      effects.push({ type: "gainLife", who: { ref: "you" }, n: { count: { kind: "discardedThisWay", filter }, times: Number(gainPer[1]) } });
      continue;
    }
    // Moraug: "there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures
    // you control." The delayed trigger is for that combat phase only (rulings: not the turn's regular combat).
    // World at War: "After the second main phase this turn, there's an additional combat phase followed by an additional
    // main phase. At the beginning of that combat, untap all creatures that attacked this turn" (rulings: the turn's
    // first postcombat main phase, if this resolves before it ends).
    const second = /^After the second main phase this turn, there's an additional combat phase followed by an additional main phase$/.test(s);
    const thatCombat = second || /^(?:[Tt]here(?:'s| is) an additional combat phase after this phase|[Aa]fter this phase, there is an additional combat phase)$/.test(s) ? /^At the beginning of that combat, (.+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    // Bumi, Unleashed: "After this phase, there is an additional combat phase. Only land creatures can attack during that
    // combat phase." Only that one (rulings).
    const onlyAttack = /^(?:[Tt]here(?:'s| is) an additional combat phase after this phase|[Aa]fter this phase, there is an additional combat phase)$/.test(s) ? /^Only (.+?) can attack during that combat phase$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (onlyAttack) {
      const filter = pickFilter(onlyAttack[1]!.replace(/s$/, ""));
      if (filter?.kind !== "object") return null;
      effects.push({ type: "addPhases", phases: ["combat"], onlyAttack: filter });
      si++;
      continue;
    }
    if (thatCombat) {
      const before = ctx.targets.length;
      const inner = parseSentence(capital(thatCombat[1]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "addPhases", phases: second ? ["combat", "main"] : ["combat"], ...(second ? { after: "secondMain" as const } : {}), thatCombat: { effects: inner, text: `${capital(thatCombat[1]!)}.` } });
      si++;
      continue;
    }
    // Consuming Tide: "Each player chooses a nonland permanent they control. Return all nonland permanents not chosen this
    // way to their owners' hands." In turn order, each knowing the choices before theirs, then the rest at once (rulings).
    const eachChooses = /^Each player chooses an? ((?:non)?[a-z]+) permanent they control$/.exec(s);
    if (eachChooses && sentences[si + 1]?.replace(/\.$/, "") === `Return all ${eachChooses[1]} permanents not chosen this way to their owners' hands`) {
      const filter = pickFilter(`${eachChooses[1]} permanent`);
      if (filter?.kind !== "object") return null;
      effects.push({ type: "keepRest", who: { ref: "eachPlayer" }, keep: [{ filter, n: 1 }], among: filter, bounce: true });
      si++;
      continue;
    }
    // Summon: Valefor: "Each opponent chooses a creature with the greatest mana value among creatures they control. Return
    // those creatures to their owners' hands." In turn order, then all at once (rulings), as a pick does.
    const greatestMv = /^(Each opponent|Each player) chooses a creature with the greatest mana value among creatures they control$/.exec(s);
    if (greatestMv && sentences[si + 1]?.replace(/\.$/, "") === "Return those creatures to their owners' hands") {
      const who = parsePlayer(greatestMv[1]!, ctx);
      if (!who) return null;
      effects.push({ type: "pick", who, filter: { kind: "object", types: ["Creature"], text: "creature" }, n: 1, action: "bounce", greatest: "manaValue" });
      si++;
      continue;
    }
    // "For each player, choose a creature that player controls. Each player sacrifices all creatures they control not
    // chosen this way." (The Eternal Wanderer): you choose for everyone, not targeting (rulings), then the rest go at once.
    const eachKeep = /^For each player, choose an? ([a-z]+) that player controls$/.exec(s);
    if (eachKeep && new RegExp(`^Each player sacrifices all ${eachKeep[1]}s they control not chosen this way$`).test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const filter = pickFilter(eachKeep[1]!);
      if (!filter || filter.kind !== "object") return null;
      effects.push({ type: "keepRest", who: { ref: "eachPlayer" }, keep: [{ filter, n: 1 }], among: filter, youChoose: true });
      si++;
      continue;
    }
    // Tragic Arrogance: "For each player, you choose from among the permanents that player controls an artifact, a creature,
    // an enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents they control." Like
    // Cataclysmic Gearhulk's, but you choose for everyone, not targeting (rulings).
    const arrogance = /^For each player, you choose from among the permanents that player controls (an artifact, a creature, an enchantment, and a planeswalker)$/.exec(s);
    if (arrogance && /^Then each player sacrifices all other nonland permanents they control\.?$/.test(sentences[si + 1] ?? "")) {
      const fx = parseSentence(`Each player chooses ${arrogance[1]} from among the nonland permanents they control, then sacrifices the rest`, ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "keepRest") return null;
      effects.push({ ...fx[0]!, youChoose: true });
      si++;
      continue;
    }
    // Dredge the Mire: "Each opponent chooses a creature card in their graveyard. Put those cards onto the battlefield under
    // your control." Each opponent in turn order, knowing the choices before theirs, then all at the same time (rulings).
    const oppYard = /^Each opponent chooses an? (.+? card) in their graveyard$/.exec(s);
    if (oppYard && /^Put those cards onto the battlefield under your control$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const filter = parseSearchFilter(oppYard[1]!);
      if (!filter?.types?.length || filter.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
      effects.push({ type: "chooseFromGraveyard", n: 1, dest: "battlefield", filter, who: { ref: "eachOpponent" }, underYours: true });
      si++;
      continue;
    }
    const eachYard = /^For each player, choose an? (.+? card) in that player's graveyard$/.exec(s);
    if (eachYard && /^Put those cards onto the battlefield under your control$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const filter = parseSearchFilter(eachYard[1]!);
      if (!filter?.types?.length || filter.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
      effects.push({ type: "chooseFromGraveyard", n: 1, dest: "battlefield", filter, who: { ref: "eachPlayer" }, youChoose: true });
      si++;
      continue;
    }
    // Diabolic Vision: "Look at the top five cards of your library. Put one of them into your hand and the rest on top of
    // your library in any order.": the others stay on top, then their owner orders them (CR 401.4).
    const visionLook = new RegExp(`^Look at the top ${NUM} cards of your library$`).exec(s);
    if (visionLook && sentences[si + 1]?.replace(/\.$/, "") === "Put one of them into your hand and the rest on top of your library in any order" && num(visionLook[1]!) > 1) {
      effects.push({ type: "dig", n: num(visionLook[1]!), count: 1, upTo: false, into: "hand", rest: "keep", reveal: false }, { type: "orderTop", who: { ref: "you" }, n: num(visionLook[1]!) - 1 });
      si++;
      continue;
    }
    // "Look at the top three cards of target player's library, then put them back in any order." The player
    // looking orders them (CR 401.4 lets nobody else see them). "You may shuffle." after it is a choice to shuffle.
    // Fractalize: "Until end of turn, target creature becomes a green and blue Fractal with base power and toughness each
    // equal to X plus 1": X/X, each one more (the spell's X, CR 107.3).
    const plusOne = /^(Until end of turn, target creature becomes an? [a-z ]+ [A-Z][a-z]+ with base power and toughness) each equal to X plus 1$/.exec(s);
    if (plusOne && (ctx.spell || ctx.activated)) {
      const fx = attempt(ctx, () => parseOne(`${plusOne[1]} X/X`, ctx));
      const e = fx?.length === 1 ? fx[0]! : undefined;
      const x = (a: Amount) => typeof a === "object" && "count" in a && a.count.kind === "x" && !a.plus && !a.times;
      if (e?.type !== "continuous" || !e.mods.some((m) => m.kind === "setPT" && x(m.power) && x(m.toughness))) return null;
      effects.push({ ...e, mods: e.mods.map((m) => (m.kind === "setPT" ? { ...m, power: { count: { kind: "x" }, plus: 1 }, toughness: { count: { kind: "x" }, plus: 1 } } : m)) });
      continue;
    }
    // Information Dealer: "Look at the top X cards of your library, where X is the number of Wizards on the battlefield,
    // then put them back in any order."
    const order = new RegExp(`^([Yy]ou may )?[Ll]ook at the top ${NUMX} cards of (your|target player's|target opponent's) library(?:, where X is (.+))?$`).exec(s);
    if (order && /^[Pp]ut them back in any order$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const who = parsePlayer(order[3] === "your" ? "you" : order[3]!.replace(/'s$/, ""), ctx);
      const n = order[4] ? (order[2] === "X" ? parseCount(order[4], ctx) : null) : amt(order[2]!);
      if (!who || !n) return null;
      const e: Effect = { type: "orderTop", who, n };
      effects.push(order[1] ? { type: "may", effects: [e], text: `look at the top ${order[2]} cards of ${order[3]} library, then put them back in any order` } : e);
      si++;
      const shuffle = /^You may (shuffle|have that player shuffle)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (shuffle && (shuffle[1] === "shuffle") === (who.ref === "you")) {
        effects.push({ type: "may", effects: [{ type: "shuffle", who }], text: shuffle[1]! });
        si++;
      }
      continue;
    }
    // "{1}: Look at the top card of your library." (Brutal Deceiver): only as the last instruction, so nothing after it
    // refers to the card.
    const lookTop = /^[Ll]ook at the top card of (your|target player's|target opponent's) library$/.exec(s);
    // "Look at the top card of your library. If it's a snow card, you may reveal it and put it into your hand" (Frost
    // Augur; Scrying Sheets: you can't reveal a card that isn't snow, and needn't reveal one that is, rulings).
    if (lookTop?.[1] === "your" && /^If (?:it's|that card is) /.test(sentences[si + 1] ?? "")) {
      const r = parseRevealedIf(sentences, si + 1, ctx);
      if (!r) return null;
      effects.push({ type: "revealTop", look: true }, r.effect);
      si = r.next - 1;
      continue;
    }
    // Sorin the Mirthless: "Look at the top card of your library. You may reveal that card and put it into your hand. If you
    // do, you lose life equal to its mana value." Not revealing it leaves it on top (rulings).
    if (lookTop?.[1] === "your" && /^You may reveal (?:that card|it) and put it into your hand$/.test(sentences[si + 1] ?? "") && /^If you do, you lose life equal to its mana value$/.test(sentences[si + 2]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "revealTop", look: true }, { type: "may", effects: [{ type: "revealRevealed" }, { type: "revealTopToHand", life: { who: { ref: "you" } } }], text: "reveal the card and put it into your hand, losing life equal to its mana value" });
      si += 2;
      continue;
    }
    // Kinship: "you may look at the top card of your library. If it shares a creature type with ~, you may reveal it. If
    // you do, [effect]." Looking is only information, so it's always done; revealing is up to the controller even when
    // the card shares a type (rulings on Mudbutton Clanger), and the card stays on top.
    if (/^(?:[Yy]ou may )?look at the top card of your library$/.test(s) && /^If it shares a creature type with ~, you may reveal it$/.test(sentences[si + 1] ?? "")) {
      const ifDo = /^If you do, (.+)$/.exec(sentences[si + 2] ?? "");
      // "If you do, you may play that card without paying its mana cost" (Leaf-Crowned Elder): from the library, as this
      // resolves (rulings: any X is 0, no alternative costs).
      const playIt = ifDo && /^you may play that card without paying its mana cost$/.test(ifDo[1]!);
      if (!ifDo || si + 3 !== sentences.length || (!playIt && /\b(?:it|that card)\b/.test(ifDo[1]!))) return null;
      const before = ctx.targets.length;
      const then: Effect[] | null = playIt ? [{ type: "playLinked", revealed: true }] : parseSentence(capital(ifDo[1]!), ctx);
      if (!then || ctx.targets.length !== before) return null;
      effects.push({ type: "revealTop", look: true }, { type: "if", cond: { kind: "revealedSharesCreatureType" }, effects: [{ type: "may", effects: [{ type: "revealRevealed" }, ...then], text: `reveal the revealed card (if you do, ${ifDo[1]!.replace(/\.$/, "")})` }] });
      si += 2;
      continue;
    }
    // Jace, the Mind Sculptor: "Look at the top card of target player's library. You may put that card on the bottom of that
    // player's library." The one who looks decides.
    if (lookTop && /^You may put (?:that card|it) on the bottom of (?:that player's|your) library$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "") && /your/.test(sentences[si + 1]!) === (lookTop[1] === "your")) {
      const who = parsePlayer(lookTop[1] === "your" ? "you" : lookTop[1]!.replace(/'s$/, ""), ctx);
      if (!who) return null;
      effects.push({ type: "orderTop", who, n: 1, mayBottom: true });
      si++;
      continue;
    }
    // "Look at the top card of target player's library. Draw a card at the beginning of the next turn's upkeep." (Mishra's
    // Bauble): a draw after it doesn't refer to the card either.
    if (lookTop && (si === sentences.length - 1 || (si === sentences.length - 2 && /^Draw a card(?: at the beginning of the next turn's upkeep)?$/.test(sentences[si + 1]!)))) {
      const who = parsePlayer(lookTop[1] === "your" ? "you" : lookTop[1]!.replace(/'s$/, ""), ctx);
      if (!who) return null;
      effects.push({ type: "orderTop", who, n: 1 });
      continue;
    }
    // "Reveal the top card of your library. If it's a creature card, put it into your hand. Otherwise, you may put it into
    // your graveyard." (Nylea, Keen-Eyed; CR 701.20a): what's done depends on the revealed card's printed characteristics;
    // it stays in the library until an instruction moves it.
    // "Choose a card name, then reveal a card at random from your hand. If that card has the chosen name, ~ deals 2 damage to
    // any target." (Cursed Scroll): about that card, which stays in the hand.
    // "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a
    // permanent card, they put it onto the battlefield." (Chaos Warp): that owner's library, the card entering under their
    // control; nothing is revealed if the target is illegal (rulings).
    // Zoyowa's Justice: "The owner of target artifact or creature ... shuffles it into their library. Then that player
    // discovers X, where X is its mana value": that owner discovers (CR 701.57a), X its mana value as it last existed
    // (rulings: an X in its cost is 0).
    const ownerDiscovers = /^The owner of (target .+?) shuffles it into their library$/.exec(s) && /^Then that player discovers X, where X is its mana value\.?$/.exec(sentences[si + 1] ?? "");
    if (ownerDiscovers) {
      const what = parseObject(/^The owner of (target .+?) shuffles it into their library$/.exec(s)![1]!, ctx);
      if (what?.ref !== "target" || what.n) return null;
      effects.push({ type: "shuffleIntoLibrary", what }, { type: "discover", n: { count: { kind: "manaValue", of: { ref: "target", index: what.index } } }, who: { ref: "targetOwner", index: what.index } });
      si++;
      continue;
    }
    const warp = /^The owner of (target .+?) shuffles it into their library, then reveals the top card of their library$/.exec(s);
    if (warp) {
      const what = parseObject(warp[1]!, ctx);
      const then = /^If it's an? (.+?) card, they put it onto the battlefield$/.exec(sentences[si + 1] ?? "");
      const filter = then && parseSearchFilter(`${then[1]!} card`);
      if (what?.ref !== "target" || what.n || !filter) return null;
      effects.push({ type: "shuffleIntoLibrary", what }, { type: "revealTop", who: { ref: "targetOwner", index: what.index } }, { type: "if", cond: { kind: "revealedIs", filter }, effects: [{ type: "putOntoBattlefield", what: { ref: "revealed" }, owner: true }] });
      si++;
      continue;
    }
    // Goblin Guide: "defending player reveals the top card of their library. If it's a land card, that player puts it into
    // their hand.": that player's library, and only "that player puts it into their hand" after it (CR 701.20a).
    const defReveal = /^([Dd]efending player) reveals the top card of their library$/.exec(s);
    if (defReveal) {
      const who = parsePlayer(defReveal[1]!, ctx);
      const then = /^If it's an? (.+?) card, that player puts it into their hand\.?$/.exec(sentences[si + 1] ?? "");
      const filter = then && parseSearchFilter(`${then[1]!} card`);
      if (!who || !filter) return null;
      effects.push({ type: "revealTop", who }, { type: "if", cond: { kind: "revealedIs", filter }, effects: [{ type: "bounce", what: { ref: "revealed" } }] });
      si++;
      continue;
    }
    // Cocoon: "remove a pupa counter from ~. If you can't, sacrifice it, put a +1/+1 counter on enchanted creature, and
    // that creature gains flying.": the rest only if none could be removed, "it" being ~ and "that creature" the one it
    // enchanted, as it last existed once ~ is gone (CR 608.2h). Flying with no duration lasts indefinitely (CR 611.2a).
    const removeOwn = /^[Rr]emove an? ([a-z]+) counter from ~$/.exec(s);
    const cantRemove = removeOwn && /^If you can't, (.+?)\.?$/.exec(sentences[si + 1] ?? "");
    if (removeOwn && cantRemove) {
      const parts = cantRemove[1]!.replace(/^sacrifice it, /, "sacrifice ~, ").split(/, (?:and )?/).map((p) => p.replace(/^that creature /, "enchanted creature "));
      const rest: Effect[] = [];
      for (const p of parts) {
        const fx = parseOne(capital(p), ctx);
        if (!fx || fx.some((e) => pauses(e))) return null;
        rest.push(...fx);
      }
      effects.push({ type: "removeSelfCounter", counter: removeOwn[1]! }, { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: rest });
      si++;
      continue;
    }
    // Paroxysm: "At the beginning of the upkeep of enchanted creature's controller, that player reveals the top card of their
    // library. If that card is a land card, destroy that creature. Otherwise, it gets +3/+3 until end of turn.": that
    // player's library (CR 701.20a); "it" is the creature, not the card.
    const thatReveal = /^[Tt]hat player reveals the top card of their library$/.test(s) && /^If that card is an? [a-z]+ card, /.test(sentences[si + 1] ?? "");
    if (thatReveal) {
      const who = parsePlayer("that player", ctx);
      const rest = sentences.map((x, i) => (i === si + 2 ? x.replace(/^Otherwise, it gets /, "Otherwise, enchanted creature gets ") : x));
      const r = who && parseRevealedIf(rest, si + 1, ctx);
      if (!r) return null;
      effects.push({ type: "revealTop", who: who! }, r.effect);
      si = r.next - 1;
      continue;
    }
    // Petra Sphinx, Vexing Arcanix: "Target player chooses a card name, then reveals the top card of their library. If that
    // card has the chosen name, that player puts it into their hand. If it doesn't, the player puts it into their
    // graveyard." / "Otherwise, they put it into their graveyard and ~ deals 2 damage to them.": the target player names a
    // card as it resolves (rulings on Vexing Arcanix); with an empty library nothing else happens, no damage (rulings).
    // (", then" splits the first sentence in two.)
    const guessTop = /^([Tt]arget player) chooses a card name$/.exec(s) && /^Reveals the top card of their library$/.test(sentences[si + 1] ?? "") ? /^([Tt]arget player)/.exec(s) : null;
    if (guessTop) {
      const who = parsePlayer(guessTop[1]!, ctx);
      const hit = /^If that card has the chosen name, that player puts it into their hand\.?$/.test(sentences[si + 2] ?? "");
      const miss = /^(?:If it doesn't, the player puts it into their graveyard|Otherwise, they put it into their graveyard(?: and ~ deals (\d+) damage to them)?)\.?$/.exec(sentences[si + 3] ?? "");
      if (!who || who.ref !== "target" || !hit || !miss) return null;
      const named: TargetSpec = { kind: "card", chosen: "name", text: "card with the chosen name" };
      const otherwise: Effect[] = [{ type: "putInGraveyard", what: { ref: "revealed" } }, ...(miss[1] ? [{ type: "damage" as const, amount: Number(miss[1]), to: who }] : [])];
      effects.push(
        { type: "choose", choice: "cardName", who, purpose: "guess" },
        { type: "revealTop", who },
        { type: "if", cond: { kind: "revealedIs", filter: { kind: "card", text: "card" } }, effects: [{ type: "if", cond: { kind: "revealedIs", filter: named }, effects: [{ type: "bounce", what: { ref: "revealed" } }], otherwise }] },
      );
      si += 3;
      continue;
    }
    // Aven Windreader: "Target player reveals the top card of their library." (CR 701.20a), on its own; Cerebral Eruption:
    // "Target opponent reveals ...", then "the revealed card's mana value" and "If a land card is revealed this way, ...".
    const theyRevealTop = /^([Tt]arget player|[Tt]arget opponent) reveals the top card of their library$/.exec(s);
    if (theyRevealTop && (si === sentences.length - 1 || /\bthe revealed card's\b/.test(sentences[si + 1] ?? ""))) {
      const who = parsePlayer(theyRevealTop[1]!, ctx);
      if (!who) return null;
      effects.push({ type: "revealTop", who });
      ctx.revealedTop = true;
      continue;
    }
    // Cerebral Eruption: "If a land card is revealed this way, return ~ to its owner's hand.": the spell goes to its
    // owner's hand from the stack as it finishes resolving, not to the graveyard (rulings).
    const eruption = ctx.revealedTop && ctx.spell && /^If a land card is revealed this way, return ~ to its owner's hand$/.test(s);
    if (eruption) {
      effects.push({ type: "if", cond: { kind: "revealedIs", filter: { kind: "card", types: ["Land"], text: "land card" } }, effects: [{ type: "spellToHand" }] });
      continue;
    }
    // Elven Farsight: "Scry 3, then you may reveal the top card of your library. If a creature card is revealed this way,
    // draw a card.": the card on top after the scry, revealed only if you choose to (CR 701.20a).
    const farsight = /^[Yy]ou may reveal the top card of your library$/.test(s);
    const farsightIf = farsight && /^If an? ((?:basic )?[a-z]+) card is revealed this way, (.+)$/.exec(sentences[si + 1] ?? "");
    if (farsightIf) {
      const r = parseRevealedIf(sentences.map((x, i) => (i === si + 1 ? `If it's a ${farsightIf[1]} card, ${farsightIf[2]}` : x)), si + 1, ctx);
      if (!r) return null;
      effects.push({ type: "may", effects: [{ type: "revealTop" }, r.effect], text: "reveal the top card of your library" });
      si = r.next - 1;
      continue;
    }
    // Baneful Omen: "you may reveal the top card of your library. If you do, each opponent loses life equal to that card's
    // mana value": the card revealed (CR 701.20a), still on top of the library.
    const omen = farsight && /^If you do, (each opponent loses life equal to that card's mana value)$/.exec(sentences[si + 1] ?? "");
    if (omen) {
      ctx.revealedTop = true;
      const then = parseOne(capital(omen[1]!), ctx);
      ctx.revealedTop = false;
      if (!then) return null;
      effects.push({ type: "may", effects: [{ type: "revealTop" }, ...then], text: "reveal the top card of your library" });
      si++;
      continue;
    }
    // Fertile Thicket: "you may look at the top five cards of your library. If you do, reveal up to one basic land card from
    // among them, then put that card on top of your library and the rest on the bottom in any order." Not looking leaves
    // the library as it is.
    const mayLookTop = /^[Yy]ou may look at the top (two|three|four|five|six) cards of your library$/.exec(s);
    // Planar Atlas: "... and the rest on the bottom in a random order" (CR 401.4).
    const lookTopLand = mayLookTop && /^If you do, reveal up to one (.+? card) from among them, then put that card on top of your library and the rest on the bottom in (any|a random) order$/.exec(sentences[si + 1] ?? "");
    if (lookTopLand) {
      const filter = parseSearchFilter(lookTopLand[1]!);
      if (!filter) return null;
      effects.push({ type: "may", effects: [{ type: "dig", n: num(mayLookTop[1]!), count: 1, upTo: true, filter, into: "libraryTop", rest: "bottom", ...(lookTopLand[2] === "a random" ? { random: true as const } : {}), reveal: true }], text: `look at the top ${mayLookTop[1]} cards of your library` });
      si++;
      continue;
    }
    // "Target opponent reveals a card at random from their hand" (Planeswalker's Mirth, Hired Torturer), "that player ..."
    // (Merfolk Spy), "target creature's controller ..." (Friendly Fire): "that card" and "the revealed card" after it are
    // that card (an empty hand reveals none, and its mana value is 0: rulings on Planeswalker's Scorn).
    const theyReveal = /^([Tt]arget opponent|[Tt]arget player|[Tt]hat player|Target creature's controller) reveals a card at random from their hand$/.exec(s);
    if (theyReveal) {
      const who = parsePlayer(theyReveal[1]!, ctx);
      if (!who) return null;
      effects.push({ type: "revealTop", randomFromHand: true, who });
      ctx.revealedTop = true;
      continue;
    }
    const atRandom = /^[Rr]eveal a card at random from your hand$/.test(s);
    // Interpret the Signs: "Reveal the top card of your library. Draw cards equal to that card's mana value."; Sifter Wurm:
    // "You gain life equal to that card's mana value." The card stays on top.
    const revealedMvThen = /^[Rr]eveal the top card of your library$/.test(s) ? /^(Draw cards|You gain life) equal to that card's mana value\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (revealedMvThen) {
      const n = { count: { kind: "revealedManaValue" as const } };
      effects.push({ type: "revealTop" }, revealedMvThen[1] === "Draw cards" ? { type: "draw", who: { ref: "you" }, n } : { type: "gainLife", who: { ref: "you" }, n });
      si++;
      continue;
    }
    // Putrid Cyclops: "Reveal the top card of your library. ~ gets -X/-X until end of turn, where X is that card's mana
    // value"; Riddle of Lightning: "~ deals damage equal to that card's mana value to any target": the card revealed, still
    // on top of the library (CR 701.20a).
    // A Licid's ability: "~ loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target
    // creature. You may pay {W} to end this effect." (CR 116.2c; see the "becomeLicid" effect).
    if (ctx.activated && si === 0 && sentences.length === 3 && s === "~ loses this ability and becomes an Aura enchantment with enchant creature" && sentences[1] === "Attach it to target creature") {
      const endCost = /^You may pay ((?:\{[^}]+\})+) to end this effect$/.exec(sentences[2]!)?.[1];
      const host = parseObject("target creature", ctx);
      if (!endCost || host?.ref !== "target" || host.index !== 0) return null;
      effects.push({ type: "becomeLicid", endCost });
      si += 2;
      continue;
    }
    if (/^[Rr]eveal the top card of your library$/.test(s) && /\bthat card's mana value\b/.test(sentences[si + 1] ?? "") && !/^If /.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "revealTop" });
      ctx.revealedTop = true;
      continue;
    }
    if (/^[Rr]eveal the top card of your library$/.test(s) || (atRandom && /^If that card has the chosen name, /.test(sentences[si + 1] ?? ""))) {
      const r = parseRevealedIf(sentences, si + 1, ctx);
      if (!r) return null;
      effects.push({ type: "revealTop", ...(atRandom ? { randomFromHand: true as const } : {}) }, r.effect);
      si = r.next - 1;
      continue;
    }
    // Keen Duelist: "you and target opponent each reveal the top card of your library. You each lose life equal to the mana
    // value of the card revealed by the other player. You each put the card you revealed into your hand." Parker Luck: "two
    // target players each reveal ... They each lose life ... Then they each put the card they revealed into their hand."
    const duel = /^(you and target opponent|two target players) each reveal the top card of (?:your|their) library$/i.exec(s);
    if (duel) {
      const you = /^you/i.test(duel[1]!);
      const loss = you ? /^You each lose life equal to the mana value of the card revealed by the other player\.?$/ : /^They each lose life equal to the mana value of the card revealed by the other player\.?$/;
      const hand = you ? /^You each put the card you revealed into your hand\.?$/ : /^Then they each put the card they revealed into their hand\.?$/;
      if (!loss.test(sentences[si + 1] ?? "") || !hand.test(sentences[si + 2] ?? "")) return null;
      const who = parsePlayer(you ? "target opponent" : "two target players", ctx);
      if (!who) return null;
      effects.push({ type: "duelReveal", between: you ? [{ ref: "you" }, who] : [who] });
      si += 2;
      continue;
    }
    // Duskmantle Seer: "Each player reveals the top card of their library, loses life equal to that card's mana value, then
    // puts it into their hand."
    if (/^[Ee]ach player reveals the top card of their library, loses life equal to that card's mana value, then puts it into their hand$/.test(s)) {
      effects.push({ type: "revealTopToHand", each: true });
      continue;
    }
    // Dark Confidant: "Reveal the top card of your library and put that card into your hand. You lose life equal to
    // its mana value."
    if (/^[Rr]eveal the top card of your library and put (?:that card|it) into your hand$/.test(s)) {
      const next = sentences[si + 1]?.replace(/\.$/, "") ?? "";
      const life = /^(You|Each opponent) (?:loses?|(gains?)) life equal to (?:its|that card's|the card's) mana value$/.exec(next);
      const drain = /^Each opponent loses X life and you gain X life, where X is (?:its|that card's|the card's) mana value$/.test(next);
      effects.push({ type: "revealTopToHand", ...(drain ? { life: { who: { ref: "eachOpponent" }, drain: true } } : life ? { life: { who: life[1] === "You" ? { ref: "you" } : { ref: "eachOpponent" }, ...(life[2] ? { gain: true } : {}) } } : {}) });
      if (life || drain) si++;
      continue;
    }
    // "Repeat this process once" after a punisher (Remorseless Punishment); "Repeat the following process X times" before
    // one (Torment of Hailfire): the whole process again, the same players each time (rulings).
    // "Repeat this process six more times" (Professor Onyx): seven in all.
    const repeatN = /^Repeat this process (once|twice|(two|three|four|five|six) more times)$/.exec(s);
    if (repeatN) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "punisher" || prev.times !== undefined) return null;
      const more = repeatN[1] === "once" ? 1 : repeatN[1] === "twice" ? 2 : ["two", "three", "four", "five", "six"].indexOf(repeatN[2]!) + 2;
      effects[effects.length - 1] = { ...prev, times: more + 1 };
      continue;
    }
    // Ad Nauseam: "Reveal the top card of your library and put that card into your hand. You lose life equal to its mana
    // value. You may repeat this process any number of times."
    if (/^You may repeat this process any number of times$/.test(s)) {
      const prev = effects[0];
      if (effects.length !== 1 || prev?.type !== "revealTopToHand" || !prev.life || prev.life.gain || prev.life.who.ref !== "you" || si + 1 !== sentences.length) return null;
      effects[0] = { type: "repeatMay", effects: [prev], text: "reveal the top card of your library and put it into your hand, losing life equal to its mana value" };
      continue;
    }
    const repeat = new RegExp(`^Repeat the following process ${NUMX} times$`).exec(s);
    if (repeat) {
      const next = sentences[si + 1] ? attempt(ctx, () => parseOne(sentences[si + 1]!.replace(/\.$/, ""), ctx)) : null;
      if (next?.length !== 1 || next[0]!.type !== "punisher" || si + 2 !== sentences.length) return null;
      effects.push({ ...next[0]!, times: amt(repeat[1]!) });
      si++;
      continue;
    }
    // "Each player discards cards the same way", "Players sacrifice creatures and discard cards the same way" (Balancing
    // Act, Restore Balance, Magus of the Balance): after the "chooses a number of lands ... equal to the number ...
    // controlled by the player who controls the fewest, then sacrifices the rest" before it, the same again for the
    // creatures and the cards in hand, one after another in the order written, each counted when its turn comes (rulings).
    const same = /^(?:Each player|Players) (.+) the same way$/.exec(s);
    if (same) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "keepRest" || !prev.keep[0]?.fewest || prev.keep.length !== 1 || prev.youChoose) return null;
      const steps = same[1]!.split(" and ");
      const more: Effect[] = [];
      for (const step of steps) {
        if (/^discards? cards$/.test(step)) more.push({ type: "discard", who: prev.who, n: 0, downToFewest: true });
        else if (/^sacrifices? creatures$/.test(step)) {
          const among: TargetSpec = { kind: "object", types: ["Creature"], text: "creature" };
          more.push({ type: "keepRest", who: prev.who, keep: [{ filter: among, n: 0, fewest: true }], among });
        } else return null;
      }
      effects.push(...more);
      continue;
    }
    // Emeria Shepherd: "You may return target nonland permanent card from your graveyard to your hand. If that land is a
    // Plains, you may return that nonland permanent card to the battlefield instead." With a Plains, one of the two (or
    // neither), chosen as it resolves; the land as it is then, or as it last existed (CR 608.2h).
    const landIs = /^If that land is an? (Plains|Island|Swamp|Mountain|Forest), you may return that [a-z ]+ card to the battlefield instead$/.exec(s);
    if (landIs) {
      const prev = effects[effects.length - 1];
      const back = prev?.type === "may" && prev.effects.length === 1 && prev.effects[0]!.type === "bounce" && prev.effects[0]!.what.ref === "target" ? prev.effects[0]! : undefined;
      if (!prev || prev.type !== "may" || !back || back.type !== "bounce" || !ctx.subject) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [landIs[1]!], text: landIs[1]! };
      const either: Effect = { type: "either", options: [[{ type: "putOntoBattlefield", what: back.what }], [back]], labels: ["Return it to the battlefield", "Return it to your hand"] };
      effects[effects.length - 1] = { type: "if", cond: { kind: "subjectIs", filter }, effects: [{ ...prev, effects: [either] }], otherwise: [prev] };
      continue;
    }
    // Oran-Rief Hydra: "Put a +1/+1 counter on ~. If that land is a Forest, put two +1/+1 counters on ~ instead."; Akoum
    // Hellkite: "~ deals 1 damage to any target. If that land is a Mountain, ~ deals 2 damage instead." The land that
    // entered as this resolves, or as it last existed (CR 608.2h); the same instruction with the other number.
    const landMore = ctx.subject ? /^If that land is an? (Plains|Island|Swamp|Mountain|Forest), (put (two|three) \+1\/\+1 counters on ~|~ deals (\d+) damage) instead$/.exec(s) : null;
    if (landMore) {
      const prev = effects[effects.length - 1];
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [landMore[1]!], text: landMore[1]! };
      const more: Effect | null =
        landMore[3] && prev?.type === "counters" && prev.what.ref === "self" && prev.counter === "+1/+1" && prev.n === 1 ? { ...prev, n: num(landMore[3]) }
        : landMore[4] && prev?.type === "damage" && typeof prev.amount === "number" && !prev.by && !prev.also && !prev.divided ? { ...prev, amount: Number(landMore[4]) }
        : null;
      if (!more || !prev) return null;
      effects[effects.length - 1] = { type: "if", cond: { kind: "subjectIs", filter }, effects: [more], otherwise: [prev] };
      continue;
    }
    // Guardian of Tazeem: "Tap target creature an opponent controls. If that land is an Island, that creature doesn't untap
    // during its controller's next untap step.": the land that entered as this resolves, or as it last existed (CR 608.2h).
    const landThen = ctx.subject ? /^If that land is an? (Plains|Island|Swamp|Mountain|Forest), ((?!.*\binstead\b).+)$/.exec(s) : null;
    if (landThen) {
      const inner = attempt(ctx, () => parseOne(capital(landThen[2]!), ctx));
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [landThen[1]!], text: landThen[1]! };
      effects.push({ type: "if", cond: { kind: "subjectIs", filter }, effects: inner });
      continue;
    }
    // Uglúk of the White Hand: "Whenever another creature you control dies, put a +1/+1 counter on ~. If that creature was
    // a Goblin or Orc, put two +1/+1 counters on ~ instead.": the creature as it last existed (CR 608.2h).
    const wasEither = (ctx.subject || ctx.subjectIt) ? /^If that creature was an? ([A-Z][a-z]+) or ([A-Z][a-z]+), put (two|three) \+1\/\+1 counters on ~ instead$/.exec(s) : null;
    if (wasEither && CREATURE_TYPES.has(wasEither[1]!) && CREATURE_TYPES.has(wasEither[2]!)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "counters" || prev.what.ref !== "self" || prev.counter !== "+1/+1" || prev.n !== 1) return null;
      // Either one: a filter's subtypes match any of them.
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [wasEither[1]!, wasEither[2]!], text: `${wasEither[1]} or ${wasEither[2]}` };
      effects[effects.length - 1] = { type: "if", cond: { kind: "subjectIs", filter }, effects: [{ ...prev, n: num(wasEither[3]!) }], otherwise: [prev] };
      continue;
    }
    // Andúril, Flame of the West: "Create two tapped 1/1 white Spirit creature tokens with flying. If that creature is
    // legendary, instead create two of those tokens that are tapped and attacking." The attacker as it is when this
    // resolves, or as it last existed (CR 608.2h); one or the other.
    if ((ctx.subject || ctx.subjectIt) && s === "If that creature is legendary, instead create two of those tokens that are tapped and attacking") {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "createToken" || prev.n !== 2 || !prev.tapped || prev.attacking || prev.who.ref !== "you") return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], supertypes: ["Legendary"], text: "legendary permanent" };
      effects[effects.length - 1] = { type: "if", cond: { kind: "subjectIs", filter }, effects: [{ ...prev, attacking: true }], otherwise: [prev] };
      continue;
    }
    // Emiel the Blessed: "Whenever another creature you control enters, you may pay {G/W}. If you do, put a +1/+1 counter on
    // it. If it's a Unicorn, put two +1/+1 counters on it instead.": the creature as it is when this resolves (CR 608.2c).
    const subjectType = ctx.subjectIt ? /^If it's an? ([A-Z][a-z]+), put (two|three) \+1\/\+1 counters on it instead$/.exec(s) : null;
    if (subjectType && CREATURE_TYPES.has(subjectType[1]!)) {
      const prev = effects[effects.length - 1];
      const holder = prev?.type === "may" && prev.effects.length === 1 ? prev : undefined;
      const one = holder ? holder.effects[0] : prev;
      if (one?.type !== "counters" || one.what.ref !== "subject" || one.counter !== "+1/+1" || one.n !== 1) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [subjectType[1]!], text: subjectType[1]! };
      const pick: Effect = { type: "if", cond: { kind: "subjectIs", filter }, effects: [{ ...one, n: num(subjectType[2]!) }], otherwise: [one] };
      effects[effects.length - 1] = holder ? { ...holder, effects: [pick] } : pick;
      continue;
    }
    // Miles "Tails" Prower: "Whenever a Vehicle you control enters, draw a card if it has flying. Otherwise, put a flying
    // counter on it.": the permanent as it is when this resolves (CR 608.2c), or as it last existed (608.2h).
    const subjectHas = ctx.subjectIt && !effects.length ? /^(.+) if it has (flying|first strike|trample|haste|vigilance|reach|lifelink|deathtouch|menace)$/.exec(s) : null;
    const subjectElse = subjectHas && /^Otherwise, (.+?)\.?$/.exec(sentences[si + 1] ?? "");
    if (subjectHas && subjectElse && si + 2 === sentences.length) {
      const before = ctx.targets.length;
      const yes = parseSentence(capital(subjectHas[1]!), ctx);
      const no = parseSentence(capital(subjectElse[1]!), ctx);
      if (!yes || !no || ctx.targets.length !== before) return null;
      const kw = subjectHas[2]!.split(" ").map(capital).join(" ");
      effects.push({ type: "if", cond: { kind: "subjectIs", filter: { kind: "object", types: [], notTypes: [], notColors: [], keywords: [kw], text: `with ${subjectHas[2]}` } }, effects: yes, otherwise: no });
      si++;
      continue;
    }
    // Aunt May: "Whenever another creature you control enters, you gain 1 life. If it's a Spider, put a +1/+1 counter on
    // it.": the creature as it is when this resolves (CR 608.2c), or as it last existed (608.2h).
    const subjectIs = ctx.subjectIt && !subjectType && effects.length ? /^If it's an? ([A-Z][a-z]+), ([a-z].+)$/.exec(s) : null;
    if (subjectIs && CREATURE_TYPES.has(subjectIs[1]!) && !/\b(?:instead|otherwise)\b/.test(subjectIs[2]!) && !/^(?:Otherwise|If)\b/.test(sentences[si + 1] ?? "")) {
      const before = ctx.targets.length;
      const inner = parseSentence(capital(subjectIs[2]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "subjectIs", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [subjectIs[1]!], text: subjectIs[1]! } }, effects: inner });
      continue;
    }
    // Taborax, Hope's Demise: "Whenever another nontoken creature you control dies, put a +1/+1 counter on ~. If that
    // creature was a Cleric, you may draw a card. If you do, you lose 1 life.": the creature as it last existed (CR
    // 608.2h); both sentences under the condition. Overgrowth Elemental: "you gain 1 life. If that creature was an
    // Elemental, put a +1/+1 counter on ~."
    // Venom, Eddie Brock: "If that creature was a Villain, draw a card": the same.
    const subjectWas = (ctx.subjectIt || ctx.subject) && effects.length ? /^If that creature was an? ([A-Z][a-z]+), (you may [^.]+|put an? \+1\/\+1 counter on ~|draw (?:a card|two cards))$/.exec(s) : null;
    const wasDo = subjectWas && /^If you do, ([^.]+)\.?$/.exec(sentences[si + 1] ?? "");
    if (subjectWas && CREATURE_TYPES.has(subjectWas[1]!) && (wasDo || !/^(?:Otherwise|If)\b/.test(sentences[si + 1] ?? ""))) {
      const sub = parseBody(`${capital(subjectWas[2]!)}.${wasDo ? ` If you do, ${wasDo[1]}.` : ""}`, {});
      if (!sub || sub.targets.length || /\bit\b|\bthat creature\b/.test(`${subjectWas[2]} ${wasDo?.[1] ?? ""}`) || (/~/.test(`${subjectWas[2]} ${wasDo?.[1] ?? ""}`) && !/^put/.test(subjectWas[2]!))) return null;
      effects.push({ type: "if", cond: { kind: "subjectIs", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [subjectWas[1]!], text: subjectWas[1]! } }, effects: sub.effects });
      if (wasDo) si++;
      continue;
    }
    // Ajani's Chosen: "Whenever an enchantment you control enters, create a 2/2 white Cat creature token. If that enchantment
    // is an Aura, you may attach it to the token." Only if the Aura can legally enchant the token, both still on the
    // battlefield as this resolves (rulings, CR 701.3b).
    if ((ctx.subject || ctx.subjectIt) && s === "If that enchantment is an Aura, you may attach it to the token") {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "createToken" || prev.n !== 1 || prev.who.ref !== "you") return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Aura"], text: "Aura" };
      effects.push({ type: "if", cond: { kind: "subjectIs", filter }, effects: [{ type: "may", effects: [{ type: "attach", what: { ref: "created" }, source: { ref: "subject" } }], text: "Attach it to the token" }] });
      continue;
    }
    // Jenson Carthalion, Druid Exile: "If that spell was all colors, create ...": the spell the cast trigger is about, as it
    // was cast (all five colors, CR 105.1).
    const allColors = ctx.castSpell && /^If that spell (?:was|is) all colors, (.+)$/.exec(s);
    if (allColors) {
      const before = ctx.targets.length;
      const inner = parseOne(capital(allColors[1]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "causeSpellIs", filter: { kind: "card", colorCount: "all", text: "spell that's all colors" } }, effects: inner });
      continue;
    }
    // Toph, Hardheaded Teacher: "Whenever you cast a spell, earthbend 1. If that spell is a Lesson, put an additional +1/+1
    // counter on that land." The land earthbending chose, the spell as it was cast.
    const lessonIf = ctx.castSpell && /^If that spell is an? ([A-Z][a-z]+), put an additional \+1\/\+1 counter on that land$/.exec(s);
    if (lessonIf) {
      const prev = effects[effects.length - 1];
      const filter = parseTargetPhrase(`${lessonIf[1]} spell`);
      if (prev?.type !== "earthbend" || filter?.kind !== "spell") return null;
      effects.push({ type: "if", cond: { kind: "causeSpellIs", filter: { ...filter, kind: "card" } }, effects: [{ type: "counters", what: prev.what, counter: "+1/+1", n: 1 }] });
      continue;
    }
    // Tribute to Hunger: "Target opponent sacrifices a creature of their choice. You gain life equal to that creature's
    // toughness": the creature sacrificed, as it last existed (CR 608.2h); if none was, no life (rulings). Twisted Justice:
    // "You draw cards equal to that creature's power" likewise.
    const sacGain = /^You (gain life|draw cards) equal to that creature's (power|toughness)$/.exec(s);
    const sacked = effects[effects.length - 1];
    if (sacGain && sacked?.type === "pick" && sacked.action === "sacrifice" && sacked.n === 1 && sacked.who.ref === "target" && sacked.filter.kind === "object" && sacked.filter.types?.join() === "Creature") {
      const n = { count: { kind: sacGain[2] as "power" | "toughness", of: { ref: "sacrificed" as const } } };
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: [sacGain[1] === "gain life" ? { type: "gainLife", who: { ref: "you" }, n } : { type: "draw", who: { ref: "you" }, n }] });
      continue;
    }
    // Dominus of Fealty: "you may gain control of target permanent until end of turn. If you do, untap it and it gains
    // haste until end of turn": both only if you did (rulings), about that target.
    if (s === "If you do, untap it and it gains haste until end of turn") {
      const prev = effects[effects.length - 1];
      const ctl = prev?.type === "may" && !prev.pay && prev.effects.length === 1 ? prev.effects[0] : undefined;
      if (ctl?.type !== "continuous" || ctl.what.ref !== "target" || ctl.what.n || ctl.mods.length !== 1 || ctl.mods[0]!.kind !== "control" || ctl.duration !== "endOfTurn") return null;
      effects.push({ type: "if", cond: { kind: "youDid" }, effects: [{ type: "untap", what: ctl.what }, { type: "continuous", what: ctl.what, mods: [{ kind: "addKeywords", keywords: ["Haste"] }], duration: "endOfTurn" }] });
      continue;
    }
    // The Ghoul, Gunslinger: "target player gets two rad counters. If that player is you, create a Treasure token": about
    // that target player as this resolves.
    const thatIsYou = /^If that player is you, (.+)$/.exec(s);
    if (thatIsYou && ctx.lastPlayerTarget !== undefined && ctx.targets[ctx.lastPlayerTarget]?.kind === "player" && !ctx.targets[ctx.lastPlayerTarget]!.many && !ctx.targets[ctx.lastPlayerTarget]!.optional) {
      const before = ctx.targets.length;
      const inner = parseOne(capital(thatIsYou[1]!), ctx);
      if (!inner || ctx.targets.length !== before || /\b(?:that player|they|their)\b/.test(thatIsYou[1]!)) return null;
      effects.push({ type: "if", cond: { kind: "targetPlayerIsYou", index: ctx.lastPlayerTarget }, effects: inner });
      continue;
    }
    // Essence Flux: "Exile target creature you control, then return that card to the battlefield under its owner's
    // control. If it's a Spirit, put a +1/+1 counter on it.": checked once it has returned (rulings).
    const fluxIf = /^If it's an? ([A-Z][a-z]+), put a \+1\/\+1 counter on it$/.exec(s);
    if (fluxIf && effects[effects.length - 1]?.type === "flicker") {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "flicker" || prev.at || prev.counter || prev.transformed) return null;
      const filter = parseTargetPhrase(fluxIf[1]!);
      if (filter?.kind !== "object") return null;
      effects[effects.length - 1] = { ...prev, counterIf: { counter: "+1/+1", filter: { ...filter, text: fluxIf[1]! } } };
      continue;
    }
    // Tezzeret, Cruel Captain: "Untap target artifact or creature. If it's an artifact creature, put a +1/+1 counter on
    // it." "Put three +1/+1 counters on target artifact you control. If it's not a creature, it becomes a 0/0 Robot
    // artifact creature." The target still on the battlefield, checked as it resolves (CR 608.2c).
    // Splash Portal: "Exile target creature you control, then return it .... If that creature is a Bird, Frog, Otter, or Rat,
    // draw a card": the permanent it returned as, as it is now (rulings); a token doesn't come back.
    // Liliana, Heretical Healer: "exile ~, then return her to the battlefield transformed under her owner's control. If you
    // do, create a 2/2 black Zombie creature token": only if she came back (a single-faced copy stays in exile, CR
    // 712.14a), so only the first of several of these abilities to resolve makes a Zombie (rulings).
    const ifReturned = /^If you do, (.+)$/.exec(s);
    const flick = effects[effects.length - 1];
    if (ifReturned && flick?.type === "flicker" && flick.transformed && flick.what.ref === "self" && !flick.at && !flick.hold) {
      const fx = parseOne(capital(ifReturned[1]!), ctx);
      if (!fx) return null;
      effects.push({ type: "if", cond: { kind: "flickeredIs", filter: { kind: "object", types: [], text: "permanent" } }, effects: fx });
      continue;
    }
    const ifBack = /^If (?:that creature|it) is an? ([A-Z][a-z]+(?:, [A-Z][a-z]+)*,? or [A-Z][a-z]+|[A-Z][a-z]+), (.+)$/.exec(s);
    const lastFx = effects[effects.length - 1];
    if (ifBack && lastFx?.type === "flicker" && !lastFx.at && !lastFx.hold) {
      const typed = parseTargetPhrase(ifBack[1]!);
      if (typed?.kind !== "object" || !typed.subtypes?.length || Object.entries(typed).some(([k, v]) => v !== undefined && !["kind", "types", "notTypes", "notColors", "subtypes", "text"].includes(k)) || typed.types?.length) return null;
      const fx = parseOne(capital(ifBack[2]!), ctx);
      if (!fx) return null;
      effects.push({ type: "if", cond: { kind: "flickeredIs", filter: { ...typed, text: ifBack[1]! } }, effects: fx });
      continue;
    }
    // Tezzeret, Betrayer of Flesh: "Target artifact becomes an artifact creature. If it isn't a Vehicle, it has base power
    // and toughness 4/4." No duration, so for as long as it stays on the battlefield (CR 611.2a); the Vehicle checked as this
    // resolves (CR 608.2c). A Vehicle keeps its printed power and toughness (rulings), and isn't crewed.
    const notVehicle = /^[Tt]arget artifact becomes an artifact creature$/.test(s) ? /^If it isn't a Vehicle, it has base power and toughness (\d+)\/(\d+)\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (notVehicle) {
      const what = parseObject("target artifact", ctx);
      if (what?.ref !== "target") return null;
      const i = ctx.targets.length - 1;
      effects.push({ type: "continuous", what, mods: [{ kind: "addTypes", types: ["Artifact", "Creature"], subtypes: [] }], duration: "game" });
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], notSubtypes: ["Vehicle"], text: "not a Vehicle" };
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter }, effects: [{ type: "continuous", what, mods: [{ kind: "setPT", power: Number(notVehicle[1]), toughness: Number(notVehicle[2]) }], duration: "game" }] });
      si++;
      continue;
    }
    // Too Greedily, Too Deep: "Put target creature card from a graveyard onto the battlefield under your control. That
    // creature deals damage equal to its power to each other creature." The permanent it became (CR 400.7), if it's
    // still there, with its power as it resolves.
    if (/^That creature deals damage equal to its power to each other creature\.?$/.test(sentences[si + 1] ?? "") && /^Put target creature card from (?:a|your) graveyard onto the battlefield(?: under your control)?$/.test(s)) {
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || fx[0]!.type !== "putOntoBattlefield") return null;
      effects.push(...fx, { type: "damage", amount: { count: { kind: "power", of: { ref: "created" } } }, to: { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "each other creature" }, notCreated: true }, by: "created" });
      si++;
      continue;
    }
    // Unforge: "Destroy target Equipment. If that Equipment was attached to a creature, ~ deals 2 damage to that creature.":
    // the creature it was attached to as it was destroyed (rulings), as that creature is now.
    const unforge = /^Destroy target Equipment$/.test(s) ? /^If that Equipment was attached to a creature, ~ deals (\d+) damage to that creature\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (unforge) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || ctx.targets.length !== before + 1) return null;
      const host: ObjRef = { ref: "targetHost", index: before };
      effects.push(...fx, { type: "damage", amount: Number(unforge[1]), to: host });
      si++;
      continue;
    }
    // Woeleecher: "Remove a -1/-1 counter from target creature. If you do, you gain 2 life.": a counter is removed only
    // if it has one, so the life only then.
    const removeThen = /^Remove an? (-1\/-1|\+1\/\+1) counter from target creature$/.exec(s);
    const removeDid = removeThen ? /^If you do, (you gain \d+ life)\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (removeThen && removeDid) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      const then = fx && parseOne(capital(removeDid[1]!), ctx);
      if (!fx || !then || ctx.targets.length !== before + 1) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], counter: removeThen[1]!, text: `with a ${removeThen[1]} counter on it` };
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: [...fx, ...then] });
      si++;
      continue;
    }
    // Elvish Healer: "Prevent the next 1 damage that would be dealt to any target this turn. If it's a green creature, prevent
    // the next 2 damage instead.": the target as it resolves.
    const shieldIf = /^Prevent the next (\d+) damage that would be dealt to any target this turn$/.exec(s);
    const shieldMore = shieldIf ? /^If it's an? (white|blue|black|red|green) creature, prevent the next (\d+) damage instead\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (shieldIf && shieldMore) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      const filter = parseTargetPhrase(`${shieldMore[1]} creature`);
      if (fx?.length !== 1 || fx[0]!.type !== "preventNext" || filter?.kind !== "object" || ctx.targets.length !== before + 1) return null;
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: [{ ...fx[0]!, n: Number(shieldMore[2]) }], otherwise: fx });
      si++;
      continue;
    }
    // Dead Ringers: "Destroy two target nonblack creatures unless either one is a color the other isn't. They can't be
    // regenerated.": both exactly the same colors, or both colorless, checked as it resolves (rulings); otherwise nothing.
    const ringers = /^(Destroy two target [a-z]+ creatures) unless either one is a color the other isn't$/.exec(s);
    if (ringers) {
      const before = ctx.targets.length;
      const noRegen = /^They can't be regenerated\.?$/.test(sentences[si + 1] ?? "");
      const fx = parseOne(ringers[1]!, ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "destroy" || ctx.targets.length !== before + 2) return null;
      effects.push({ type: "if", cond: { kind: "targetsSameColors", index: before, n: 2 }, effects: [{ ...fx[0]!, ...(noRegen ? { noRegen: true } : {}) }] });
      if (noRegen) si++;
      continue;
    }
    // Winnow: "Destroy target nonland permanent if another permanent with the same name is on the battlefield": any nonland
    // permanent may be the target; the name is checked as it resolves (CR 608.2b).
    const winnow = /^(Destroy target nonland permanent) if another permanent with the same name is on the battlefield$/.exec(s);
    if (winnow) {
      const before = ctx.targets.length;
      const fx = parseOne(winnow[1]!, ctx);
      if (!fx || ctx.targets.length !== before + 1) return null;
      effects.push({ type: "if", cond: { kind: "targetSharesName", index: before }, effects: fx });
      continue;
    }
    // Drop of Honey: "Destroy the creature with the least power. It can't be regenerated. If two or more creatures are tied
    // for least power, you choose one of them." Purging Scythe: "~ deals 2 damage to the creature with the least toughness.
    // If two or more ...": any player's, not targeted (rulings); you choose among those tied. A tied one with
    // indestructible can't be chosen to be destroyed while another can (Drop of Honey's rulings).
    const least = /^([Dd]estroy|~ deals (\d+) damage to) the creature with the least (power|toughness)$/.exec(s);
    const leastNoRegen = /^[Dd]estroy$/.test(least?.[1] ?? "") && /^It can't be regenerated\.?$/.test(sentences[si + 1] ?? "");
    if (least && new RegExp(`^If two or more creatures are tied for least ${least[3]}, you choose one of them\\.?$`).test(sentences[si + (leastNoRegen ? 2 : 1)] ?? "")) {
      const filter: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
      const destroy = /^[Dd]estroy$/.test(least[1]!);
      effects.push(
        { type: "pick", who: { ref: "you" }, filter, n: 1, action: "choose", least: least[3] as "power" | "toughness", anyController: true, ...(destroy ? { destroyable: true as const } : {}) },
        destroy ? { type: "destroy", what: { ref: "created" }, ...(leastNoRegen ? { noRegen: true } : {}) } : { type: "damage", amount: Number(least[2]), to: { ref: "created" } },
      );
      si += leastNoRegen ? 2 : 1;
      continue;
    }
    // Wretched Banquet: "Destroy target creature if it has the least power or is tied for least power among creatures on
    // the battlefield": any creature may be the target; its power is checked as it resolves (rulings).
    const leastIf = /^(Destroy target creature) if it has the least power or is tied for least power among creatures on the battlefield$/.exec(s);
    if (leastIf) {
      const before = ctx.targets.length;
      const fx = parseOne(leastIf[1]!, ctx);
      if (!fx || ctx.targets.length !== before + 1) return null;
      const creatures: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creatures on the battlefield" };
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], bound: { key: "power", at: "most", amount: { count: { kind: "greatestPower", filter: creatures, least: true } } }, text: "the least power among creatures on the battlefield" };
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: fx });
      continue;
    }
    // "Return target creature to its owner's hand. If its mana value was 3 or less, scry 1." (Fading Hope, Perilous
    // Voyage, Serum Snare), "... If it was tapped, ..." (Brackish Blunder), "If it was attacking, ..." (Desculpting
    // Blast): the permanent as it last existed on the battlefield (rulings, CR 608.2h), so it's checked just before it
    // moves, and the rest happens after.
    // Zephyr Sentinel: "Return up to one other target creature you control to its owner's hand. If it was a Soldier, ...":
    // its creature types the same way (none chosen: false).
    // Sunpearl Kirin: "If it was a token, draw a card": the same, whether it was a token.
    const bounceWas = /^[Rr]eturn (?:up to one (?:other )?)?target [^.]+ to its owner's hand$/.test(s) ? /^If (?:its mana value was (\d+) or less|that permanent had mana value (\d+) or less|it was (tapped|attacking|a token|an? [A-Z][a-z]+)), (.+?)\.?$/.exec(sentences[si + 1] ?? "") : null;
    const bounceType = bounceWas?.[3] && /^an? /.test(bounceWas[3]) && bounceWas[3] !== "a token" ? bounceWas[3].replace(/^an? /, "") : undefined;
    if (bounceWas && (!bounceType || CREATURE_TYPES.has(bounceType)) && !/\b(?:it|its|that permanent|that creature)\b/.test(bounceWas[4]!.replace(/"[^"]*"/g, ""))) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "bounce" || ctx.targets[before]!.kind !== "object") return null;
      const mv = bounceWas[1] ?? bounceWas[2];
      const filter: TargetSpec = mv ? { kind: "object", types: [], notTypes: [], notColors: [], manaValue: { max: Number(mv) }, text: `mana value ${mv} or less` } : bounceType ? { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [bounceType], text: `a ${bounceType}` } : bounceWas[3] === "a token" ? { kind: "object", types: [], notTypes: [], notColors: [], token: true, text: "a token" } : bounceWas[3] === "tapped" ? { kind: "object", types: [], notTypes: [], notColors: [], tapped: true, text: "tapped" } : { kind: "object", types: [], notTypes: [], notColors: [], combat: "attacking", text: "attacking" };
      const then = parseOne(capital(bounceWas[4]!), ctx);
      if (!then || ctx.targets.length !== before + 1) return null;
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: [...fx, ...then], otherwise: structuredClone(fx) });
      si++;
      continue;
    }
    // "Destroy target creature. If that creature was green or white, its controller discards a card." (Gloomlance), "If
    // that creature was a Human, ..." (Death's Caress), "If it wasn't attacking, ..." (Prophesied End): the creature as it
    // last existed on the battlefield (CR 608.2h), so it's checked just before it's destroyed, and the rest happens after.
    // Rite of the Serpent: "If that creature had a +1/+1 counter on it, ...": the same, its counters as it last existed.
    // Icequake, Thermokarst: "Destroy target land. If that land was a snow land, ...": the same, its supertypes.
    // Gloomwidow's Feast: "Destroy target creature with flying. If that creature was blue or black, ...", Filigree Fracture:
    // "Destroy target artifact or enchantment. If that permanent was blue or black, draw a card.", Molten Rain: "Destroy
    // target land. If that land was nonbasic, ~ deals 2 damage to the land's controller.", Liliana's Defeat: "If that
    // permanent was a Liliana planeswalker, her controller loses 3 life.": the same, as it last existed.
    const destroyWas = /^[Dd]estroy target (?:creature|creature with [a-z]+|artifact or enchantment|black creature or black planeswalker|Forest, green enchantment, or green planeswalker)$/.test(s)
      ? /^If (?:that creature|that permanent|it) (was (?:(white|blue|black|red|green) or (white|blue|black|red|green)|an? ([A-Z][a-z]+)(?: planeswalker)?)|was a legendary enchantment|wasn't attacking|had an? (\+1\/\+1) counter on it), (.+?)\.?$/.exec(sentences[si + 1] ?? "")
      : /^[Dd]estroy target (?:land|non-Swamp land)$/.test(s) ? /^If that land (was a snow land|was nonbasic)(), ()()()(.+?)\.?$/.exec(sentences[si + 1] ?? "") : null;
    const planeswalkerWas = destroyWas && / planeswalker,/.test(sentences[si + 1] ?? "");
    if (destroyWas && (!destroyWas[4] || planeswalkerWas || CREATURE_TYPES.has(destroyWas[4]))) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "destroy") return null;
      // Budding Insurgent: "If that permanent was a legendary enchantment, draw a card."
      const filter: TargetSpec = destroyWas[1] === "was a legendary enchantment"
        ? { kind: "object", types: ["Enchantment"], notTypes: [], notColors: [], supertypes: ["Legendary"], text: "a legendary enchantment" }
        : destroyWas[1] === "was a snow land"
        ? { kind: "object", types: [], notTypes: [], notColors: [], supertypes: ["Snow"], text: "snow" }
        : destroyWas[1] === "was nonbasic"
        ? { kind: "object", types: [], notTypes: [], notColors: [], notSupertypes: ["Basic"], text: "nonbasic" }
        : planeswalkerWas
        ? { kind: "object", types: ["Planeswalker"], notTypes: [], notColors: [], subtypes: [destroyWas[4]!], text: `a ${destroyWas[4]} planeswalker` }
        : destroyWas[2]
        ? { kind: "object", types: [], notTypes: [], notColors: [], colors: [COLOR_WORDS[destroyWas[2]]!, COLOR_WORDS[destroyWas[3]!]!], text: `${destroyWas[2]} or ${destroyWas[3]}` }
        : destroyWas[4]
          ? { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [destroyWas[4]], text: `a ${destroyWas[4]}` }
          : destroyWas[5]
            ? { kind: "object", types: [], notTypes: [], notColors: [], counter: "+1/+1", text: "with a +1/+1 counter on it" }
            : { kind: "object", types: [], notTypes: [], notColors: [], combat: "attacking", text: "attacking" };
      const then = parseOne(capital(destroyWas[6]!.replace(/\b(?:the land's|her) controller\b/, "that permanent's controller")), ctx);
      if (!then || !then.length || ctx.targets.length !== before + 1) return null;
      const yes = [...fx, ...then];
      effects.push(destroyWas[1] === "wasn't attacking"
        ? { type: "if", cond: { kind: "targetIs", index: before, filter }, effects: structuredClone(fx), otherwise: yes }
        : { type: "if", cond: { kind: "targetIs", index: before, filter }, effects: yes, otherwise: structuredClone(fx) });
      si++;
      continue;
    }
    // Hour of Glory: "Exile target creature. If that creature was a God, its controller reveals their hand and exiles all
    // cards from it with the same name as that creature.": a God as it last existed on the battlefield (CR 608.2h, checked
    // before it's exiled), its controller then, and the name it had.
    if (/^Exile target creature$/.test(s) && /^If that creature was a God, its controller reveals their hand and exiles all cards from it with the same name as that creature\.?$/.test(sentences[si + 1] ?? "")) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "exile") return null;
      const who: PlayerRef = { ref: "targetController", index: before };
      const yes: Effect[] = [...fx, { type: "lookAtHand", who, reveal: true }, { type: "exileNamed", who, filter: { kind: "card", text: "card with the same name as that creature" }, all: true, sameAs: before, handOnly: true }];
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["God"], text: "a God" } }, effects: yes, otherwise: structuredClone(fx) });
      si++;
      continue;
    }
    // Hidetsugu's Second Rite: "If target player has exactly 10 life, ~ deals 10 damage to that player.": that life total
    // as it resolves (CR 608.2c); the target is chosen either way.
    const exactLife = /^If target player has exactly (\d+) life, (~ deals \d+ damage to) that player$/.exec(s);
    if (exactLife) {
      const before = ctx.targets.length;
      const fx = parseOne(`${exactLife[2]} target player`, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "damage") return null;
      const n = Number(exactLife[1]);
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "life", who: { ref: "target", index: before } } }, min: n, max: n }, effects: fx });
      continue;
    }
    // Fear of Immobility: "tap up to one target creature. If an opponent controls that creature, put a stun counter on
    // it.": who controls it as this resolves (CR 608.2c); no target chosen, no counter.
    const oppControls = /^[Tt]ap (?:up to one )?target creature$/.test(s) ? /^If an opponent controls that creature, (put an? [a-z]+ counter on it)\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (oppControls) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "tap") return null;
      const then = parseOne(capital(oppControls[1]!.replace(/ on it$/, " on that creature")), ctx);
      if (!then || then.length !== 1 || ctx.targets.length !== before + 1) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], controller: "opponent", text: "an opponent controls" };
      effects.push(...fx, { type: "if", cond: { kind: "targetIs", index: before, filter }, effects: then });
      si++;
      continue;
    }
    // Sold Out: "Exile target creature. If it was dealt damage this turn, create a Clue token.": whether it was, checked
    // before it's exiled (an exiled card is a new object, CR 400.7), so as it last existed on the battlefield.
    const exileHurt = /^[Ee]xile target creature$/.test(s) ? /^If it was dealt damage this turn, (.+?)\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (exileHurt && !/\b(?:it|its|that creature)\b/.test(exileHurt[1]!)) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "exile") return null;
      const then = parseOne(capital(exileHurt[1]!), ctx);
      if (!then || !then.length || ctx.targets.length !== before + 1) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], dealtDamageThisTurn: true, text: "dealt damage this turn" };
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: [...fx, ...then], otherwise: structuredClone(fx) });
      si++;
      continue;
    }
    // Grey Knight Paragon: "destroy target attacking creature. If that creature is a Demon, exile it instead.": what it is
    // as this resolves (CR 608.2c), one or the other.
    const exileInstead = /^[Dd]estroy target (?:attacking )?creature$/.test(s) ? /^If that creature is an? ([A-Z][a-z]+), exile it instead\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (exileInstead && CREATURE_TYPES.has(exileInstead[1]!)) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "destroy") return null;
      const ex = parseOne("Exile that creature", ctx);
      if (!ex || ex.length !== 1 || ex[0]!.type !== "exile" || ctx.targets.length !== before + 1) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [exileInstead[1]!], text: `a ${exileInstead[1]}` };
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: ex, otherwise: fx });
      si++;
      continue;
    }
    // Raze to the Ground: "Destroy target artifact. If its mana value was 1 or less, draw a card.", Extinguish the Light,
    // Tainted Treats, Seedship Impact, Carnivorous Canopy ("If that permanent's mana value was 3 or less"), Containment Breach ("If its mana value is 2 or
    // less", even if it wasn't destroyed: rulings): its mana value as it last existed (CR 608.2h), the same before or after.
    // Consuming Ashes: "Exile target creature. If it had mana value 3 or less, surveil 2.": the same, as it last existed.
    const exileMv = /^[Ee]xile target creature$/.test(s) && /^If it had mana value (\d+) or less, /.test(sentences[si + 1] ?? "");
    const destroyMv = /^[Dd]estroy target [^.]+$/.test(s) || exileMv ? /^If (?:its|that (?:permanent|creature|artifact)'s) mana value (?:was|is) (\d+) or less, (.+?)\.?$/.exec((sentences[si + 1] ?? "").replace(/^If it had mana value /, "If its mana value was ")) : null;
    if (destroyMv && !/\b(?:it|its|that permanent|that creature)\b/.test(destroyMv[2]!.replace(/"[^"]*"/g, ""))) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== (exileMv ? "exile" : "destroy") || ctx.targets[before]!.kind !== "object") return null;
      const then = parseOne(capital(destroyMv[2]!), ctx);
      if (!then || !then.length || ctx.targets.length !== before + 1) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], manaValue: { max: Number(destroyMv[1]) }, text: `mana value ${destroyMv[1]} or less` };
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: [...fx, ...then], otherwise: structuredClone(fx) });
      si++;
      continue;
    }
    // Durkwood Tracker: "If ~ is on the battlefield, it deals damage equal to its power to target attacking creature. That
    // creature deals damage equal to its power to ~.": nothing if it has left (rulings); one after the other, each with
    // its power then (not a fight: the second one's power is read after the first damage).
    const tracker = /^If ~ is on the battlefield, it deals damage equal to its power to (target [a-z ]+)$/.exec(s);
    if (tracker && /^That creature deals damage equal to its power to ~\.?$/.test(sentences[si + 1] ?? "") && !ctx.spell) {
      const before = ctx.targets.length;
      const fx = parseOne(`~ deals damage equal to its power to ${tracker[1]}`, ctx);
      const to = fx?.length === 1 && fx[0]!.type === "damage" ? fx[0]!.to : undefined;
      if (!to || to.ref !== "target" || to.index !== before || ctx.targets.length !== before + 1) return null;
      const them: ObjRef = { ref: "target", index: before };
      effects.push({ type: "if", cond: { kind: "selfHere" }, effects: [{ type: "bite", a: { ref: "self" }, b: them }, { type: "bite", a: them, b: { ref: "self" } }] });
      si++;
      continue;
    }
    // Chandra's Defeat: "~ deals 5 damage to target red creature or red planeswalker. If that permanent is a Chandra
    // planeswalker, you may discard a card. If you do, draw a card.": what it is after the damage, as this resolves (CR
    // 608.2c; it's still on the battlefield, state-based actions wait until it has resolved, CR 704.3).
    const pwIs = /^~ deals \d+ damage to target [a-z ]*planeswalker$/.test(s) ? /^If that permanent is an? ([A-Z][a-z]+) planeswalker, (you may [^.]+)$/.exec(sentences[si + 1] ?? "") : null;
    const pwThen = pwIs && PLANESWALKER_TYPES.has(pwIs[1]!) ? /^If you do, (.+?)\.?$/.exec(sentences[si + 2] ?? "") : null;
    if (pwIs && pwThen && si + 3 === sentences.length) {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "damage") return null;
      const inner = parseOne(capital(pwIs[2]!.replace(/^you may /, "")), ctx);
      const then = parseOne(capital(pwThen[1]!), ctx);
      if (!inner?.length || !then?.length || ctx.targets.length !== before + 1) return null;
      const may: Effect[] = [{ type: "may", effects: inner, text: pwIs[2]!.replace(/^you may /, "") }];
      const filter: TargetSpec = { kind: "object", types: ["Planeswalker"], notTypes: [], notColors: [], subtypes: [pwIs[1]!], text: `a ${pwIs[1]} planeswalker` };
      effects.push(...fx, { type: "if", cond: { kind: "targetIs", index: before, filter }, effects: [...may, { type: "if", cond: { kind: "youDid" }, effects: then }] });
      si += 2;
      continue;
    }
    // Starfall: "~ deals 3 damage to target creature. If that creature is an enchantment, ~ deals 3 damage to that
    // creature's controller.": what it is after the damage, as this resolves (CR 608.2c).
    // Burn the Impure: "If that creature has infect, ~ deals 3 damage to that creature's controller." Lightning Dart: "~ deals
    // 1 damage to target creature. If that creature is white or blue, ~ deals 4 damage to it instead.": which one, by the
    // creature as this resolves.
    // Electrostatic Bolt: "If it's an artifact creature, ~ deals 4 damage to it instead"; Purifying Dragon: "it deals 1
    // damage to target creature defending player controls. If that creature is a Zombie, ~ deals 2 damage to it instead";
    // Rending Flame: "~ deals 5 damage to target creature or planeswalker. If that permanent is a Spirit, ~ also deals 2
    // damage to that permanent's controller." Burning Hands: "If that permanent is green, ~ deals 6 damage instead." All
    // as it is when this resolves (CR 608.2c).
    const dmgIs = /^(?:~|it) deals \d+ damage to target (?:creature|creature or planeswalker)(?: defending player controls| an opponent controls)?$/.test(s)
      ? /^If (?:that creature|that permanent|it's) (is an? (enchantment|artifact)|an? (artifact) creature|is (white|blue|black|red|green)(?: or (white|blue|black|red|green))?|has ([a-z]+)|(?:is )?an? ([A-Z][a-z]+)), (~ (?:also )?deals \d+ damage to (?:that creature's|that permanent's|its) controller|~ deals (\d+) damage(?: to (?:it|that creature))? instead)\.?$/.exec(sentences[si + 1] ?? "")
      : null;
    const dmgKeyword = dmgIs?.[6] ? capital(dmgIs[6]) : undefined;
    const dmgSubject = !dmgIs ? undefined : /^If that permanent /.test(sentences[si + 1]!) ? "permanent" : /^If that creature /.test(sentences[si + 1]!) ? "creature" : "it";
    const dmgTargetsPw = / creature or planeswalker\b/.test(s);
    // Hexgold Slash: "If that creature has toxic, ...": any toxic ability (CR 702.164).
    if (
      dmgIs &&
      (!dmgKeyword || dmgKeyword === "Toxic" || (SUPPORTED_KEYWORDS as readonly string[]).includes(dmgKeyword)) &&
      (!dmgIs[7] || CREATURE_TYPES.has(dmgIs[7])) &&
      (dmgSubject === "permanent") === dmgTargetsPw &&
      (dmgSubject !== "it" || !!dmgIs[3] || !!dmgIs[7]) &&
      !(/'s controller$/.test(dmgIs[8]!) && !dmgIs[8]!.includes(dmgSubject === "permanent" ? "that permanent's" : "that creature's") && !dmgIs[8]!.includes("its controller"))
    ) {
      const before = ctx.targets.length;
      const fx = parseOne(s.replace(/^it deals /, "~ deals "), ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "damage") return null;
      const filter: TargetSpec = dmgIs[2] || dmgIs[3]
        ? { kind: "object", types: [capital(dmgIs[2] ?? dmgIs[3]!)], notTypes: [], notColors: [], text: dmgIs[2] ?? dmgIs[3]! }
        : dmgIs[7]
          ? { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [dmgIs[7]], text: dmgIs[7] }
          : dmgIs[4]
          ? { kind: "object", types: [], notTypes: [], notColors: [], colors: [dmgIs[4], dmgIs[5]].filter(Boolean).map((c) => COLOR_WORDS[c!]!), text: dmgIs[1]!.replace(/^is /, "") }
          : dmgKeyword === "Toxic"
            ? { kind: "object", types: [], notTypes: [], notColors: [], toxic: true, text: "with toxic" }
            : { kind: "object", types: [], notTypes: [], notColors: [], keywords: [dmgKeyword!], text: `with ${dmgIs[6]}` };
      if (dmgIs[9]) {
        effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: [{ ...fx[0]!, amount: num(dmgIs[9]) } as Effect], otherwise: fx });
      } else {
        const then = parseOne(dmgIs[8]!.replace(" also ", " ").replace(/\b(?:that permanent's|its) controller$/, "that creature's controller"), ctx);
        if (!then || !then.length || ctx.targets.length !== before + 1) return null;
        effects.push(...fx, { type: "if", cond: { kind: "targetIs", index: before, filter }, effects: then });
      }
      si++;
      continue;
    }
    // Deathbringer Liege: "you may destroy target creature if it's tapped": any creature is a legal target; whether it's
    // tapped is checked as this resolves, and only then may it be destroyed (rulings).
    if (/^[Yy]ou may destroy target creature if it's tapped$/.test(s)) {
      const before = ctx.targets.length;
      const fx = parseOne("Destroy target creature", ctx);
      if (!fx || ctx.targets.length !== before + 1) return null;
      const tapped: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], tapped: true, text: "tapped" };
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter: tapped }, effects: [{ type: "may", effects: fx, text: "destroy target creature" }] });
      continue;
    }
    // Modify Memory: "If you control neither creature, draw three cards." after exchanging control of two targets: who
    // controls each as this resolves, after the exchange. A target gone or illegal can't be looked at (CR 608.2b), so
    // only the legal ones are checked.
    const neither = /^If you control neither creature, (.+?)\.?$/.exec(s);
    const swapped = effects[effects.length - 1];
    if (neither && swapped?.type === "exchangeControl" && swapped.a.ref === "target" && swapped.b.ref === "target") {
      const before = ctx.targets.length;
      const fx = parseOne(capital(neither[1]!), ctx);
      if (!fx || ctx.targets.length !== before) return null;
      const yours: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], controller: "you", text: "you control" };
      effects.push({ type: "if", cond: { kind: "targetIs", index: swapped.a.index, filter: yours }, effects: [], otherwise: [{ type: "if", cond: { kind: "targetIs", index: swapped.b.index, filter: structuredClone(yours) }, effects: [], otherwise: fx }] });
      continue;
    }
    // Éowyn, Lady of Rohan: "Target creature gains your choice of first strike or vigilance until end of turn. If that
    // creature is equipped, it gains first strike and vigilance until end of turn instead.": whether it's equipped as this
    // resolves; then no choice is made.
    const eitherKw = /^[Tt]arget creature gains your choice of ([a-z ]+) or ([a-z ]+) until end of turn$/.exec(s);
    const bothKw = eitherKw && /^If that creature is equipped, it gains ([a-z ]+) and ([a-z ]+) until end of turn instead\.?$/.exec(sentences[si + 1] ?? "");
    if (eitherKw && bothKw && eitherKw[1] === bothKw[1] && eitherKw[2] === bothKw[2]) {
      const before = ctx.targets.length;
      const both = parseOne(`Target creature gains ${bothKw[1]} and ${bothKw[2]} until end of turn`, ctx);
      const kws = [keywordOf(eitherKw[1]!), keywordOf(eitherKw[2]!)];
      const gain = both?.length === 1 ? both[0]! : undefined;
      if (gain?.type !== "continuous" || ctx.targets.length !== before + 1 || kws.some((k) => !k || k === CHOSEN_PROTECTION)) return null;
      const one: Effect = { ...gain, mods: [{ kind: "addKeywords", keywords: [CHOSEN_KEYWORD] }] };
      const equipped: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], status: "equipped", text: "equipped" };
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter: equipped }, effects: [gain], otherwise: [{ type: "choose", choice: "keyword", options: kws as string[] }, one] });
      si++;
      continue;
    }
    // "If it's a Vampire, put a +1/+1 counter on it" (Sorin, Imperious Bloodlord): a creature type, as it is as this resolves.
    // Hidden Blade: "Attach it to target creature you control. If that creature is an Assassin, it gains deathtouch ...".
    // Karametra's Blessing: "If it's an enchanted creature or enchantment creature, ..." (TargetSpec.anyOf).
    // Elder Cathar: "put a +1/+1 counter on target creature you control. If that creature is a Human, put two +1/+1
    // counters on it instead.": which one, by the creature as this resolves (CR 608.2c).
    // Ray of Enfeeblement: "Target creature gets -4/-1 until end of turn. If that creature is white, it gets -4/-4 until
    // end of turn instead.": one or the other, by the creature's color as this resolves (CR 608.2c).
    // Porcelain Zealot: "If that creature has toxic, instead it gets +2/+2 until end of turn": any toxic ability (CR 702.164).
    const ptInstead = /^If that creature (?:is (white|blue|black|red|green|an? [A-Z][a-z]+)|(has toxic)), it gets ([+-]\d+)\/([+-]\d+) until end of turn instead$/.exec(s.replace(/^(If that creature has toxic), instead (it gets [+-]\d+\/[+-]\d+ until end of turn)$/, "$1, $2 instead"));
    ptInstead?.splice(2, 1);
    if (ptInstead) {
      const last = effects[effects.length - 1];
      const mod = last?.type === "continuous" ? last.mods[0] : undefined;
      const toxic = !ptInstead[1];
      const kind = toxic ? "" : ptInstead[1]!.replace(/^an? /, "");
      if (last?.type !== "continuous" || last.what.ref !== "target" || last.duration !== "endOfTurn" || last.mods.length !== 1 || mod?.kind !== "modifyPT" || (!toxic && !COLOR_WORDS[kind] && !CREATURE_TYPES.has(kind))) return null;
      const filter: TargetSpec = toxic
        ? { kind: "object", types: [], notTypes: [], notColors: [], toxic: true, text: "with toxic" }
        : COLOR_WORDS[kind]
        ? { kind: "object", types: [], notTypes: [], notColors: [], colors: [COLOR_WORDS[kind]!], text: kind }
        : { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [kind], text: kind };
      const other: Effect = { ...last, mods: [{ kind: "modifyPT", power: Number(ptInstead[2]), toughness: Number(ptInstead[3]) }] };
      effects[effects.length - 1] = { type: "if", cond: { kind: "targetIs", index: last.what.index, filter }, effects: [other], otherwise: [last] };
      continue;
    }
    // Flare of Faith: "Target creature gets +2/+2 until end of turn. If it's a Human, instead it gets +3/+3 and gains
    // indestructible until end of turn.": one or the other, by the creature's types as this resolves (CR 608.2c).
    const typeInstead = /^If (?:it's|that creature is) an? ([A-Z][a-z]+), instead (it (?:gets|gains) .+ until end of turn)$/.exec(s);
    if (typeInstead && CREATURE_TYPES.has(typeInstead[1]!)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "continuous" || last.what.ref !== "target" || last.what.n || last.duration !== "endOfTurn" || ctx.lastObjectTarget !== last.what.index) return null;
      const index = last.what.index;
      const before = ctx.targets.length;
      const other = parseOne(capital(typeInstead[2]!), ctx);
      if (!other?.length || ctx.targets.length !== before || other.some((e) => e.type !== "continuous" || e.what.ref !== "target" || e.what.index !== index || e.duration !== "endOfTurn")) return null;
      effects[effects.length - 1] = { type: "if", cond: { kind: "targetIs", index, filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [typeInstead[1]!], text: typeInstead[1]! } }, effects: other, otherwise: [last] };
      continue;
    }
    // Depressurize: "Target creature gets -3/-0 until end of turn. Then if that creature's power is 0 or less, destroy it.":
    // its power after the first instruction, as this resolves (CR 608.2c).
    const powerThen = /^(?:Then i|I)f that creature's power is (\d+) or less, destroy it$/.exec(s);
    if (powerThen) {
      const last = effects[effects.length - 1];
      if (last?.type !== "continuous" || last.what.ref !== "target" || last.what.n || ctx.targets[last.what.index]?.kind !== "object") return null;
      const index = last.what.index;
      effects.push({ type: "if", cond: { kind: "targetIs", index, filter: { kind: "object", types: [], notTypes: [], notColors: [], power: { max: Number(powerThen[1]) }, text: `power ${powerThen[1]} or less` } }, effects: [{ type: "destroy", what: { ref: "target", index } }] });
      continue;
    }
    // Eagle of Deliverance: "Put an indestructible counter on another target creature you control. Draw a card if that
    // creature's power is 2 or less.": its power as this resolves (CR 608.2c).
    const drawIfPower = /^Draw a card if that creature's power is (\d+) or less$/.exec(s);
    const drawAbout = effects[effects.length - 1];
    if (drawIfPower && (drawAbout?.type === "continuous" || drawAbout?.type === "counters") && drawAbout.what.ref === "target" && !drawAbout.what.n && ctx.targets[drawAbout.what.index]?.kind === "object") {
      const index = (drawAbout.what as { index: number }).index;
      effects.push({ type: "if", cond: { kind: "targetIs", index, filter: { kind: "object", types: [], notTypes: [], notColors: [], power: { max: Number(drawIfPower[1]) }, text: `power ${drawIfPower[1]} or less` } }, effects: [{ type: "draw", who: { ref: "you" }, n: 1 }] });
      continue;
    }
    // Dormant Grove: "Put a +1/+1 counter on target creature you control. Then if that creature has toughness 6 or greater,
    // transform ~.": its toughness after the counter, as this resolves (CR 608.2c).
    const hasPT = /^(?:Then i|I)f that creature has (power|toughness) (\d+) or greater, (.+)$/.exec(s);
    const hasAbout = effects[effects.length - 1];
    if (hasPT && (hasAbout?.type === "continuous" || hasAbout?.type === "counters") && hasAbout.what.ref === "target" && !hasAbout.what.n && ctx.targets[hasAbout.what.index]?.kind === "object") {
      const index = (hasAbout.what as { index: number }).index;
      const inner = parseOne(capital(hasPT[3]!), ctx);
      if (!inner || /\b(?:it|its|that creature)\b/.test(hasPT[3]!)) return null;
      effects.push({ type: "if", cond: { kind: "targetIs", index, filter: { kind: "object", types: [], notTypes: [], notColors: [], [hasPT[1]!]: { min: Number(hasPT[2]) }, text: `${hasPT[1]} ${hasPT[2]} or greater` } }, effects: inner });
      continue;
    }
    // Compleat Devotion: "Target creature you control gets +2/+2 until end of turn. If that creature has toxic, draw a
    // card.": the creature as this resolves (CR 608.2c), any toxic ability (CR 702.164).
    const toxicThen = /^If that creature has toxic, (.+)$/.exec(s);
    if (toxicThen) {
      const last = effects[effects.length - 1];
      const i = ctx.lastObjectTarget;
      const t = i !== undefined ? ctx.targets[i] : undefined;
      if (i === undefined || t?.kind !== "object" || t.many || t.optional || !last || !mentionsTarget(last, i)) return null;
      const before = ctx.targets.length;
      const fx = parseOne(capital(toxicThen[1]!), ctx);
      if (!fx?.length || ctx.targets.length !== before || fx.some((e) => mentionsTarget(e, i))) return null;
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter: { kind: "object", types: [], notTypes: [], notColors: [], toxic: true, text: "with toxic" } }, effects: fx });
      continue;
    }
    // Rapid Fire: "If it doesn't have rampage, that creature gains rampage 2 until end of turn.": the target as this
    // resolves (CR 608.2c), with the abilities the effects before gave it.
    const lacksKw = /^If (?:it|that creature) doesn't have ([a-z]+(?: [a-z]+)?), (.+)$/.exec(s);
    const lackedKw = lacksKw && (lacksKw[1] === "rampage" ? "Rampage" : keywordOf(lacksKw[1]!));
    if (lacksKw && lackedKw) {
      const last = effects[effects.length - 1];
      const i = ctx.lastObjectTarget;
      const t = i !== undefined ? ctx.targets[i] : undefined;
      if (i === undefined || t?.kind !== "object" || t.many || t.optional || !last || !mentionsTarget(last, i)) return null;
      const before = ctx.targets.length;
      const fx = parseOne(capital(lacksKw[2]!), ctx);
      if (!fx?.length || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter: { kind: "object", types: [], notTypes: [], notColors: [], notKeywords: [lackedKw], text: `without ${lacksKw[1]}` } }, effects: fx });
      continue;
    }
    // Wakandan Royal Guard: "If that creature is another Hero, ...": a Hero other than ~ (TargetSpec.notSource).
    const moreCounters = /^If that creature is (an?|another) ([A-Z][a-z]+), put (two|three) \+1\/\+1 counters on it instead$/.exec(s);
    if (moreCounters) {
      const last = effects[effects.length - 1];
      if (last?.type !== "counters" || last.what.ref !== "target" || last.what.n || last.counter !== "+1/+1" || last.n !== 1 || !CREATURE_TYPES.has(moreCounters[2]!)) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [moreCounters[2]!], ...(moreCounters[1] === "another" ? { notSource: true } : {}), text: `${moreCounters[1]} ${moreCounters[2]}` };
      effects[effects.length - 1] = { type: "if", cond: { kind: "targetIs", index: last.what.index, filter }, effects: [{ ...last, n: num(moreCounters[3]!) }], otherwise: [last] };
      continue;
    }
    // Olivia's Midnight Ambush: "Target creature gets -2/-2 until end of turn. If it's night, that creature gets -13/-13
    // until end of turn instead.": one or the other, by day or night as it resolves (CR 731.1, 608.2c).
    const nightInstead = /^If it's (day|night), that creature gets ([+-]\d+)\/([+-]\d+) until end of turn instead$/.exec(s);
    const nightPrev = effects.at(-1);
    if (nightInstead && nightPrev?.type === "continuous" && nightPrev.what.ref === "target" && nightPrev.duration === "endOfTurn" && nightPrev.mods.length === 1 && nightPrev.mods[0]!.kind === "modifyPT" && nightPrev.what.index === ctx.targets.length - 1) {
      effects.pop();
      const instead: Effect = { ...nightPrev, mods: [{ kind: "modifyPT", power: Number(nightInstead[2]), toughness: Number(nightInstead[3]) }] };
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "dayNight", v: nightInstead[1] as "day" | "night" } }, effects: [instead], otherwise: [nightPrev] });
      continue;
    }
    // Wolf Strike: "Target creature you control gets +2/+0 until end of turn if it's night. Then it deals damage ...": the
    // target is chosen either way; the bonus only by night as it resolves.
    const pumpAtNight = /^((?:[Tt]arget|[Aa]nother target) creature(?: you control)? gets [+-]\d+\/[+-]\d+ until end of turn) if it's (day|night)$/.exec(s);
    if (pumpAtNight) {
      const before = ctx.targets.length;
      const fx = parseOne(capital(pumpAtNight[1]!), ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "continuous" || ctx.targets.length !== before + 1) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "dayNight", v: pumpAtNight[2] as "day" | "night" } }, effects: fx });
      continue;
    }
    // Searing Barb: "~ deals 2 damage to any target. If it's a creature, it can't block this turn.": a creature as it
    // resolves (CR 608.2c; state-based actions haven't been checked yet, so a creature dealt lethal damage is still one).
    const barbPrev = effects.at(-1);
    if (/^If it's a creature, it can't block this turn$/.test(s) && barbPrev?.type === "damage" && barbPrev.to.ref === "anyTarget" && ctx.targets[barbPrev.to.index]?.kind === "any" && barbPrev.to.index === ctx.targets.length - 1) {
      const i = barbPrev.to.index;
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" } }, effects: [{ type: "continuous", what: { ref: "target", index: i }, mods: [{ kind: "cantBlock" }], duration: "endOfTurn" }] });
      continue;
    }
    // Rush the Room: "If it's a Goblin or Orc, it also gains haste until end of turn": either creature type.
    // Tawnos's Tinkering: "If it isn't a creature, it becomes a 0/0 creature in addition to its other types": the same.
    const ifIts =/^If (?:it's|that creature is) (not )?an? ([a-z]+(?: [a-z]+)?|[A-Z][a-z]+(?: or [A-Z][a-z]+)?|enchanted creature or enchantment creature), (.+)$/.exec(s.replace(/^If it isn't (an?) /, "If it's not $1 "));
    if (ifIts && (/^[a-z]/.test(ifIts[2]!) || (ifIts[2]!.split(" or ").every((x) => CREATURE_TYPES.has(x)) && !ifIts[1]))) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      const typed = parseTargetPhrase(ifIts[2]!);
      const known = typed?.kind === "object" && Object.entries(typed).every(([k, v]) => v === undefined || ["kind", "types", "allTypes", "notTypes", "notColors", "text", ...(/^[A-Z]/.test(ifIts[2]!) ? ["subtypes"] : []), ...(/ or /.test(ifIts[2]!) ? ["anyOf"] : []), ...(ifIts[2] === "token" && !ifIts[1] ? ["token"] : [])].includes(k));
      const types = typed?.kind === "object" ? [...(typed.types ?? []), ...(typed.allTypes ?? [])] : [];
      // Anything else is left to the readings below (Carbonize's "If it's a creature, it can't be regenerated ...").
      // "Up to one target ... loses all abilities until your next turn. If it's a creature, it also has base power and
      // toughness 2/2 until your next turn" (Azure Beastbinder): with no target chosen, the condition is false.
      const then = ifIts[3]!.replace(/^it also /, "it ");
      if (t?.kind === "object" && (!t.optional || prev?.type === "continuous") && !t.many && known && prev && (["untap", "tap", "counters", "continuous", "attach"].includes(prev.type) || (prev.type === "if" && prev.cond.kind === "targetIs" && prev.cond.index === i)) && mentionsTarget(prev, i) && (!ifIts[1] || types.length === 1) && !/,/.test(then)) {
        const fx = parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
        // Thwip!: "If it's a Spider, you gain 2 life": about the target, an instruction that isn't (no "it" in it).
        const aside = /^you gain \d+ life$/.test(then);
        if (!fx || ctx.targets.length !== i + 1 || !fx.every((e) => aside || mentionsTarget(e, i))) return null;
        const filter: TargetSpec = ifIts[1] ? { kind: "object", types: [], notTypes: types, notColors: [], text: `not ${ifIts[2]}` } : { ...typed, text: ifIts[2]! };
        effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter }, effects: fx });
        continue;
      }
    }
    // Ancient Animus: "Put a +1/+1 counter on target creature you control if it's legendary. Then it fights ...": the
    // target is chosen either way, and only gets the counter if it's legendary as this resolves (rulings, CR 608.2c).
    // Ent's Fury: "Put a +1/+1 counter on target creature you control if its power is 4 or greater": the same, by its power
    // as this resolves.
    const putIfLegendary = /^(Put an? (?:[+-]1\/[+-]1 |[a-z]+ )?counter on target .+?) if (it's legendary|its power is (\d+) or greater)$/.exec(s);
    if (putIfLegendary) {
      const before = ctx.targets.length;
      const fx = parseOne(putIfLegendary[1]!, ctx);
      if (!fx || ctx.targets.length !== before + 1 || ctx.targets[before]!.kind !== "object" || ctx.targets[before]!.optional || ctx.targets[before]!.many || fx.length !== 1 || fx[0]!.type !== "counters") return null;
      const filter: TargetSpec = putIfLegendary[3] ? { kind: "object", types: [], notTypes: [], notColors: [], power: { min: Number(putIfLegendary[3]) }, text: `with power ${putIfLegendary[3]} or greater` } : { kind: "object", types: [], notTypes: [], notColors: [], supertypes: ["Legendary"], text: "legendary" };
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: fx });
      continue;
    }
    // Hydaelyn, the Mothercrystal: "Put a +1/+1 counter on another target creature you control. ... If that creature is
    // legendary, draw a card." The target as it is as this resolves (CR 608.2c); the instruction needn't be about it.
    // Revelation of Power: "If it has a counter on it, it also gains flying and lifelink until end of turn": a counter of
    // any kind, as this resolves.
    // Dual-Sun Technique: "If it has a +1/+1 counter on it, draw a card": that kind.
    const hasCounter = /^If it has an? (\+1\/\+1 )?counter on it, (.+)$/.exec(s);
    const ifLegendary = /^If (?:it's|that creature is|that permanent is) legendary, (.+)$/.exec(s) ?? (hasCounter ? [hasCounter[0], hasCounter[2]!] : null);
    if (ifLegendary) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      if (t?.kind !== "object" || t.optional || t.many || !prev || !mentionsTarget(prev, i)) return null;
      // Gimli's Fury: "If it's legendary, it also gains trample until end of turn."
      const fx = parseOne(capital(ifLegendary[1]!.replace(/^it also /, "it ")), ctx);
      if (!fx || ctx.targets.length !== i + 1 || fx.some((e) => pauses(e))) return null;
      const anyCounter = !!hasCounter;
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter: anyCounter ? { kind: "object", types: [], notTypes: [], notColors: [], counter: hasCounter[1] ? "+1/+1" : ANY_COUNTER, text: `with a ${hasCounter[1] ?? ""}counter on it` } : { kind: "object", types: [], notTypes: [], notColors: [], supertypes: ["Legendary"], text: "legendary" } }, effects: fx });
      continue;
    }
    // Forge of Heroes: "Choose target commander that entered this turn. Put a +1/+1 counter on it if it's a creature and a
    // loyalty counter on it if it's a planeswalker." Its types as it resolves (CR 608.2c): both, if it's both.
    if (s === "Put a +1/+1 counter on it if it's a creature and a loyalty counter on it if it's a planeswalker") {
      const i = ctx.targets.length - 1;
      if (ctx.targets[i]?.kind !== "object" || ctx.targets[i]!.many) return null;
      const both: Effect[] = [];
      for (const [counter, type] of [["+1/+1", "Creature"], ["loyalty", "Planeswalker"]] as const) {
        const fx = parseOne(`Put a ${counter} counter on it`, ctx);
        if (!fx || ctx.targets.length !== i + 1 || !fx.every((e) => mentionsTarget(e, i))) return null;
        both.push({ type: "if", cond: { kind: "targetIs", index: i, filter: { kind: "object", types: [type], notTypes: [], notColors: [], text: type.toLowerCase() } }, effects: fx });
      }
      effects.push(...both);
      continue;
    }
    // "You gain life equal to the damage prevented this way": part of the prevention effect before it (CR 615.5).
    // Inkshield: "For each 1 damage prevented this way, create a 2/1 ... token": also part of the prevention (CR 615.5).
    const perDamage = /^For each 1 damage prevented this way, (create an? [^.]+ token(?: with [a-z ]+)?)$/.exec(s);
    const made = perDamage && parseBody(`${perDamage[1]![0]!.toUpperCase()}${perDamage[1]!.slice(1)}.`, {});
    const tokenRider = made && made.targets.length === 0 && made.effects.length === 1 && made.effects[0]!.type === "createToken" ? made.effects[0]! : undefined;
    if (perDamage && !(tokenRider?.type === "createToken" && JSON.stringify(tokenRider.n) === "1" && Object.keys(tokenRider).every((k) => ["type", "token", "n", "who"].includes(k)) && (!tokenRider.who || JSON.stringify(tokenRider.who) === '{"ref":"you"}'))) return null;
    // Comeuppance: "If damage from a creature source is prevented this way, ~ deals that much damage to that creature. If
    // damage from a noncreature source is prevented this way, ~ deals that much damage to the source's controller."
    const toCreature =
      /^If damage from a creature source is prevented this way, ~ deals that much damage to that creature$/.test(s) &&
      /^If damage from a noncreature source is prevented this way, ~ deals that much damage to the source's controller\.?$/.test(sentences[si + 1] ?? "");
    if (toCreature) si++;
    // Test of Faith: "For each 1 damage prevented this way, put a +1/+1 counter on that creature"; Sacred Boon: "At the
    // beginning of the next end step, put a +0/+1 counter on that creature for each 1 damage prevented this way";
    // Scars of the Veteran: "If it's a creature, put a +0/+1 counter on it for each 1 damage prevented this way at the
    // beginning of the next end step" (CR 615.5, 603.7).
    const counterRider =
      /^For each 1 damage prevented this way, put an? ([+-]\d+\/[+-]\d+) counter on that creature$/.exec(s) ??
      /^At the beginning of the next end step, put an? ([+-]\d+\/[+-]\d+) counter on that creature for each 1 damage prevented this way$/.exec(s) ??
      /^If it's a creature, put an? ([+-]\d+\/[+-]\d+) counter on it for each 1 damage prevented this way at the beginning of the next end step$/.exec(s);
    // Vengeful Archon: "If damage is prevented this way, ~ deals that much damage to target player or planeswalker".
    const dealToM = /^If damage is prevented this way, ~ deals that much damage to (target [a-z ]+)$/.exec(s);
    let extraRider: Pick<DamageRuleSpec, "countersOn" | "dealTo"> | undefined;
    if (counterRider || dealToM) {
      // The prevention before it as a damage rule ("Prevent the next 3 damage that would be dealt to target creature this
      // turn", "Prevent all damage that would be dealt to target creature this turn"), which can carry the rider.
      const prev = effects[effects.length - 1];
      const asRule = prevAsDamageRule(prev);
      if (!asRule) return null;
      effects[effects.length - 1] = asRule;
      const on = asRule.rule.to?.target;
      if (counterRider) {
        const creature = s.startsWith("If it's a creature");
        const spec = on && "index" in on ? ctx.targets[on.index] : undefined;
        // "that creature" is a target creature; "If it's a creature ... on it", any target.
        if (!spec || spec.kind !== (creature ? "any" : "object") || (!creature && !spec.types?.includes("Creature"))) return null;
        extraRider = { countersOn: { counter: counterRider[1] as CounterKind, ...(/end step/.test(s) ? { endStep: true as const } : {}), ...(creature ? { ifCreature: true as const } : {}) } };
      } else {
        const fx = parseOne(`~ deals 1 damage to ${dealToM![1]}`, ctx);
        const d = fx?.length === 1 ? fx[0]! : undefined;
        if (d?.type !== "damage" || d.amount !== 1 || !Object.keys(d).every((k) => ["type", "amount", "to"].includes(k))) return null;
        extraRider = { dealTo: d.to };
      }
    }
    const rider = extraRider ?? (toCreature ? { dealBack: { creatureToIt: true as const } } : tokenRider?.type === "createToken" ? { tokens: tokenRider.token } : parsePreventionRider(s));
    if (rider) {
      const prev0 = effects[effects.length - 1];
      const asRule = prev0?.type === "preventNext" ? prevAsDamageRule(prev0) : undefined;
      // Candles' Glow: "Prevent the next 3 damage that would be dealt to any target this turn. You gain life equal to the
      // damage prevented this way."
      if (asRule) effects[effects.length - 1] = asRule;
      const prev = effects[effects.length - 1];
      if (prev?.type !== "damageRule" || prev.rule.redirect) return null;
      effects[effects.length - 1] = { ...prev, rule: { ...prev.rule, ...rider } };
      continue;
    }
    // Elite Spellbinder, Invasion of Gobakhan: "Look at target opponent's hand. You may exile a nonland card from it. For
    // as long as that card remains exiled, its owner may play it. A spell cast this way costs {2} more to cast." You
    // choose one or none among those you looked at (CR 402.3); the permission is the owner's, for that card in exile.
    // Deep-Cavern Bat: "You may exile a nonland card from it until ~ leaves the battlefield" (CR 610.3), as Kitesail
    // Freebooter's: nothing is exiled if ~ has left by then (rulings).
    const mayExile = /^You may exile an? (.+?) from it( until ~ leaves the battlefield)?$/.exec(s);
    if (mayExile) {
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(mayExile[1]!);
      if (prev?.type !== "lookAtHand" || filter === null) return null;
      const take: Effect = { type: "takeFromHand", who: prev.who, ...(filter ? { filter } : {}), action: "exile", optional: true, ...(mayExile[2] ? { until: "sourceLeaves" as const } : {}) };
      if (mayExile[2] && /^For as long as /.test(sentences[si + 1] ?? "")) return null;
      const owner = /^For as long as that card remains exiled, its owner may (play|cast) it$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (owner) {
        take.ownerMay = { ...(owner[1] === "play" ? { play: true as const } : {}) };
        const tax = /^A spell cast this way costs \{(\d+)\} more to cast$/.exec(sentences[si + 2]?.replace(/\.$/, "") ?? "");
        if (tax) take.ownerMay.more = Number(tax[1]);
        si += tax ? 2 : 1;
      }
      effects.push(take);
      continue;
    }
    // "Counter target spell unless its controller pays {2}. If they do, surveil 2." (Assimilate Essence, Spell Pierce-likes):
    // only if they paid as it resolved (CR 608.2c).
    const theyDo = /^If they do, (.+)$/.exec(s);
    const prevCounter = effects[effects.length - 1];
    if (theyDo && prevCounter?.type === "counterSpell" && prevCounter.unless && effects.length - prevWhole === 1) {
      const before = ctx.targets.length;
      const inner = parseOne(theyDo[1]!.charAt(0).toUpperCase() + theyDo[1]!.slice(1), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "unlessPaid" }, effects: inner });
      continue;
    }
    // Gisa's Favorite Shovel: "defending player sacrifices a creature of their choice. If they do, you create a Walker
    // token": only if that player had one to sacrifice.
    const theySac = /^If they do, (you create .+)$/.exec(s);
    if (theySac && si > 0) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "pick" || prev.action !== "sacrifice" || prev.who.ref === "you" || prev.n !== 1 || prev.unless) return null;
      const before = ctx.targets.length;
      const inner = parseOne(capital(theySac[1]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: inner });
      continue;
    }
    // Shark Shredder, Killer Clone: "put up to one target creature card from that player's graveyard onto the battlefield
    // under your control. It enters tapped and attacking that player.": the player dealt the damage (CR 508.4).
    if (/^It enters tapped and attacking that player$/.test(s) && ctx.eventPlayer) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "putOntoBattlefield" || prev.what.ref !== "target" || prev.tapped || prev.attacking || prev.owner) return null;
      effects[effects.length - 1] = { ...prev, tapped: true, attacking: true, attackingEvent: true };
      continue;
    }
    // Mr. Foxglove: "draw cards equal to ... If you didn't draw cards this way, you may put a creature card from your hand
    // onto the battlefield": no card drawn in that draw (none when the count is 0 or less, rulings).
    const noDraw = /^If you didn't draw cards this way, (.+)$/.exec(s);
    if (noDraw) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "draw" || prev.who.ref !== "you" || typeof prev.n === "number") return null;
      const before = ctx.targets.length;
      const inner = parseOne(capital(noDraw[1]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "drawnThisWay" } }, max: 0 }, effects: inner });
      continue;
    }
    // "Target opponent reveals their hand. You may choose a creature or battle card from it. If you do, that player
    // discards that card. If you don't, incubate 3." (Traumatic Revelation): one or none (rulings), then what follows
    // depends on which.
    const mayChoose = /^You may choose an? (.+?) from it$/.exec(s);
    if (mayChoose) {
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(mayChoose[1]!);
      if (prev?.type !== "lookAtHand" || filter === null) return null;
      const next = sentences[si + 1] ?? "";
      // Vendilion Clique: "If you do, that player reveals the chosen card, puts it on the bottom of their library, then
      // draws a card."
      const act = /^(?:If you do, )?(?:(that player discards that card|they discard it|that player reveals the chosen card, puts it on the bottom of their library)(?:,? then (?:they )?draws? a card)?|(?:that player exiles|exile) that card)$/i.exec(next);
      if (!act || (/^If you do, (?:that player exiles|exile)/.test(next) && /^If a /.test(sentences[si + 2] ?? ""))) return null;
      const bottom = /bottom of their library/.test(act[1] ?? "");
      if (bottom && !/ then draws a card$/.test(next)) return null;
      effects.push({ type: "takeFromHand", who: prev.who, ...(filter ? { filter } : {}), action: bottom ? "libraryBottom" : act[1] ? "discard" : "exile", optional: true });
      si++;
      const took: Amount = { count: { kind: "tookFromHand" } };
      // "..., then draws a card": that player, only if they discarded.
      if (/ then (?:they )?draws? a card$/.test(next)) effects.push({ type: "if", cond: { kind: "amountNow", amount: took, min: 1 }, effects: [{ type: "draw", who: prev.who, n: 1 }] });
      const otherwise = /^(?:If you don't|Otherwise), (.+)$/.exec(sentences[si + 1] ?? "");
      if (otherwise) {
        const t = otherwise[1]!.replace(/^that player discards /, "That player discards ");
        const before = ctx.targets.length;
        const inner = parseOne(t.charAt(0).toUpperCase() + t.slice(1), ctx);
        if (!inner || ctx.targets.length !== before) return null;
        effects.push({ type: "if", cond: { kind: "amountNow", amount: took, max: 0 }, effects: inner });
        si++;
      }
      continue;
    }
    // Hand disruption: "Target opponent reveals their hand. You choose a nonland card from it. That player discards
    // that card." Another player picks the card (CR 701.9b), among those that match.
    // "You choose up to two / X cards from it. That player discards those cards." (Extortion, Mind Warp): that many.
    // Kaervek's Hex: "~ deals 1 damage to each nonblack creature and an additional 1 damage to each green creature": one
    // amount to each creature, both parts added up (rulings: a black and green creature is dealt 1), all at once.
    // Tropical Storm: "~ deals X damage to each creature with flying and 1 additional damage to each blue creature": the
    // same, a blue creature without flying dealt 1.
    const additional = /^~ deals (\d+) damage to (each [^,]+?) and an additional (\1) damage to (each [^,]+)$/.exec(s) ?? /^~ deals (X|\d+) damage to (each [^,]+?) and (\d+) additional damage to (each [^,]+)$/.exec(s);
    if (additional) {
      const first = parseOne(`~ deals ${additional[1]} damage to ${additional[2]}`, ctx);
      const second = parseOne(`~ deals ${additional[3]} damage to ${additional[4]}`, ctx);
      const [a, b] = [first?.[0], second?.[0]];
      if (first?.length !== 1 || second?.length !== 1 || a?.type !== "damage" || b?.type !== "damage" || a.also || b.also || a.to.ref !== "each" || b.to.ref !== "each") return null;
      effects.push({ ...a, also: [b.to], ...(additional[3] !== additional[1] ? { alsoAmount: b.amount } : {}), merge: true });
      continue;
    }
    // Hail Storm: "~ deals 2 damage to each attacking creature and 1 damage to you and each creature you control": all
    // dealt at once, an attacking creature you control dealt the two amounts added up.
    const twoAmounts = /^~ deals (\d+) damage to (each [^,]+?) and (\d+) damage to ((?:you and )?each [^,]+)$/.exec(s);
    if (twoAmounts && !parseOne(s, ctx)) {
      const first = parseOne(`~ deals ${twoAmounts[1]} damage to ${twoAmounts[2]}`, ctx);
      const second = parseOne(`~ deals ${twoAmounts[3]} damage to ${twoAmounts[4]}`, ctx);
      const [a, b] = [first?.[0], second?.[0]];
      if (first?.length !== 1 || second?.length !== 1 || a?.type !== "damage" || b?.type !== "damage" || a.also || a.to.ref !== "each" || b.alsoAmount || b.merge) return null;
      effects.push({ ...a, also: [b.to, ...(b.also ?? [])], alsoAmount: b.amount, merge: true });
      continue;
    }
    // Discordant Dirge: "where X is the number of verse counters on ~": counted as it resolves (CR 107.3c, 608.2h).
    const chooseN = /^You choose (up to )?(two|three|X) cards from it(?:, where X is (.+))?$/.exec(s);
    if (chooseN) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "lookAtHand" || (!prev.reveal && !/^Look at target (?:player|opponent)'s hand$/.test(sentences[si - 1] ?? ""))) return null;
      const where = chooseN[3] ? parseCount(chooseN[3], ctx) : undefined;
      if (where === null || !/^That player discards those cards\.?$/.test(sentences[si + 1] ?? "") || (chooseN[2] === "X" && !ctx.spell && !where) || (where && chooseN[2] !== "X")) return null;
      effects.push({ type: "takeFromHand", who: prev.who, action: "discard", n: where ?? (chooseN[2] === "X" ? X : num(chooseN[2]!)), ...(chooseN[1] ? { upTo: true as const } : {}) });
      si++;
      continue;
    }
    const choose = /^You choose an? (.+?) from it( with mana value (?:\d+|X) or (?:less|greater))?( and exile that card)?$/.exec(s);
    if (choose) {
      const prev = effects[effects.length - 1];
      // Seer's Vision: "Look at target player's hand. You choose a card from it": seen only by you.
      if (prev?.type !== "lookAtHand" || (!prev.reveal && !/^Look at target (?:player|opponent)'s hand$/.test(sentences[si - 1] ?? ""))) return null;
      // Painful Memories: "Put that card on top of that player's library."
      if (!choose[2] && !choose[3] && /^Put that card on top of that player's library\.?$/.test(sentences[si + 1] ?? "")) {
        const filter = parseSearchFilter(choose[1]!);
        if (filter === null) return null;
        effects.push({ type: "takeFromHand", who: prev.who, ...(filter ? { filter } : {}), action: "libraryTop" });
        si++;
        continue;
      }
      // Venarian Glimmer: "with mana value X or less": the X it was cast with (CR 107.3a), bound as it resolves.
      if (/\bX\b/.test(choose[2] ?? "") && !ctx.spell) return null;
      // Lobotomy: "Search that player's graveyard, hand, and library for all cards with the same name as the chosen card and
      // exile them. Then that player shuffles." Shimian Specter: "... as that card ...". The card's name (CR 201.2), the
      // search as for Memoricide's (CR 701.23; "Then that player shuffles" is part of it).
      if (!choose[2] && !choose[3] && /^Search that player's graveyard, hand, and library for all cards with the same name as (?:that|the chosen) card and exile them\.?$/.test(sentences[si + 1] ?? "")) {
        const filter = parseSearchFilter(choose[1]!);
        if (filter === null) return null;
        effects.push({ type: "takeFromHand", who: prev.who, ...(filter ? { filter } : {}), action: "name" }, { type: "exileNamed", who: prev.who, filter: { kind: "card", chosen: "name", text: "card with the chosen name" }, all: true });
        si++;
        continue;
      }
      // Lost Hours: "That player puts that card into their library third from the top."
      // Talara's Bane: "You gain life equal to that creature card's toughness, then that player discards that card."
      // (Split before "then", so two sentences here.)
      const gainToughness = !choose[2] && !choose[3] && /^You gain life equal to that creature card's toughness$/.test(sentences[si + 1] ?? "") && /^That player discards that card\.?$/.test(sentences[si + 2] ?? "") && /\bcreature card$/.test(choose[1]!);
      if (gainToughness) si++;
      const then = choose[3] ? "exile" : /^(?:That player discards that card|(?:That player exiles|Exile) that card( until ~ leaves the battlefield)?|That player puts that card into their library third from the top|That player shuffles that card into their library)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (!then) return null;
      // "Exile that card until ~ leaves the battlefield" (Kitesail Freebooter, CR 610.3): only an ability of a permanent.
      const until = typeof then !== "string" && !!then[1];
      if (until && opts.spell) return null;
      const filter = parseSearchFilter(`${choose[1]}${choose[2] ?? ""}`, (t) => (t === "X" ? X : null));
      if (filter === null) return null;
      effects.push({ type: "takeFromHand", who: prev.who, ...(filter ? { filter } : {}), action: typeof then !== "string" && /discards/.test(then[0]) ? "discard" : typeof then !== "string" && /third from the top/.test(then[0]) ? "libraryThird" : typeof then !== "string" && /shuffles/.test(then[0]) ? "shuffleIn" : "exile", ...(until ? { until: "sourceLeaves" as const } : {}), ...(gainToughness ? { gainToughness: true as const } : {}) });
      if (!choose[3]) si++;
      // Pick the Brain: "the exiled card" in the sentence after is this one.
      ctx.exiledFromHand = !!(choose[3] || (typeof then !== "string" && /^(?:That player exiles|Exile) that card$/.test(then[0]))) && !until;
      continue;
    }
    // "Look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield
    // tapped, then shuffle" (Through the Forest Gate): the same as three sentences.
    const joined = new RegExp(`^((?:Look at|Reveal) the top ${NUMX} cards of your library), (put .+ from among them .+), then shuffle$`).exec(s);
    if (joined && !dig) {
      sentences.splice(si, 1, joined[1]!, joined[3]!.charAt(0).toUpperCase() + joined[3]!.slice(1), "Shuffle");
      s = sentences[si]!;
    }
    // "Look at the top X cards of your library, where X is the number of tokens you created this turn" (Ellyn Harbreeze):
    // X counted as it resolves (CR 107.3c, 608.2h).
    // Explore the Vastlands: "Each player looks at the top five cards of their library and may reveal a land card and/or an
    // instant or sorcery card from among them. Each player puts the cards they revealed this way into their hand and the
    // rest on the bottom of their library in a random order."
    const eachLook = new RegExp(`^Each player looks at the top ${NUM} cards of their library and may reveal (an? [^,]+? card) and/or (an? [^,]+? card) from among them$`).exec(s);
    if (eachLook && !dig && /^Each player puts the cards they revealed this way into their hand and the rest on the bottom of their library in a random order$/.test(sentences[si + 1] ?? "")) {
      const specs = [eachLook[2]!, eachLook[3]!].map((w) => parseSearchFilter(w.replace(/^an? /, "")));
      if (specs.some((f) => !f)) return null;
      const anyOf = specs as TargetSpec[];
      effects.push({ type: "dig", n: num(eachLook[1]!), reveal: false, count: 2, upTo: true, filter: { kind: "card", anyOf, text: `${eachLook[2]!.replace(/^an? /, "")} and/or ${eachLook[3]!}` }, oneOfEach: anyOf, into: "hand", rest: "bottom", random: true, each: true });
      si++;
      continue;
    }
    // Stargaze: "Look at twice X cards from the top of your library" (the X it was cast with).
    if (!dig && ctx.spell && /^Look at twice X cards from the top of your library$/.test(s)) {
      dig = { type: "dig", n: { ...X, times: 2 }, reveal: false };
      continue;
    }
    // Birthing Ritual: "look at the top seven cards of your library. Then you may sacrifice a creature. If you do, you may
    // put a creature card with mana value X or less from among those cards onto the battlefield, where X is 1 plus the
    // sacrificed creature's mana value. Put the rest on the bottom of your library in a random order." The sacrifice is
    // chosen knowing the cards; its mana value as it last existed (rulings); the rest go to the bottom either way.
    const lookSac: RegExpExecArray | null = dig ? null : new RegExp(`^[Ll]ook at the top ${NUM} cards of your library$`).exec(s);
    const sacThen: RegExpExecArray | null = lookSac && /^Then you may sacrifice an? (creature|artifact)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    const sacPut: RegExpExecArray | null = sacThen && /^If you do, you may put (an? .+?) with mana value X or less from among those cards onto the battlefield, where X is (.+)$/.exec(sentences[si + 2]?.replace(/\.$/, "") ?? "");
    if (lookSac && sacThen && sacPut) {
      const def = parseCount(sacPut[2]!, ctx);
      if (!def) return null;
      dig = { type: "dig", n: num(lookSac[1]!), reveal: false, sacrificeFirst: { kind: "object", types: [capital(sacThen[1]!)], notTypes: [], notColors: [], controller: "you", text: sacThen[1]! } };
      digWhere = def;
      sentences.splice(si + 1, 2, `You may put ${sacPut[1]} with mana value X or less from among them onto the battlefield`);
      continue;
    }
    // Lonis, Cryptozoologist: "Target opponent reveals the top X cards of their library. You may put a nonland permanent
    // card with mana value X or less from among them onto the battlefield under your control. That player puts the rest
    // on the bottom of their library in a random order.": you take from their library (Effect dig's `library`).
    const theirLook: RegExpExecArray | null = !dig ? new RegExp(`^Target opponent reveals the top ${NUMX} cards of their library$`).exec(s) : null;
    if (theirLook) {
      const put = /^(You may put an? .+? from among them onto the battlefield) under your control$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (!put || !/^That player puts the rest on the bottom of their library in a random order\.?$/.test(sentences[si + 2] ?? "")) return null;
      const index = addTarget(ctx, { kind: "player", opponent: true, text: "target opponent" });
      ctx.lastPlayerTarget = index;
      dig = { type: "dig", n: amt(theirLook[1]!), reveal: true, library: { ref: "target", index } };
      sentences.splice(si + 1, 2, put[1]!, "Put the rest on the bottom in a random order");
      continue;
    }
    // Wu Spy: "Look at the top two cards of target player's library. Put one of them into their graveyard."; Cruel Fate:
    // "Look at the top five cards of target opponent's library. Put one of those cards into that player's graveyard and the
    // rest on top of their library in any order.": you choose the card (and the order), the cards that player's.
    const yourLook = !dig ? new RegExp(`^[Ll]ook at the top ${NUM} cards of (target player|target opponent)'s library$`).exec(s) : null;
    const yourPut = yourLook && /^Put one of (?:them|those cards) into (?:their|that player's) graveyard( and the rest on top of their library in any order)?\.?$/.exec(sentences[si + 1] ?? "");
    // Dimir Charm: "Look at the top three cards of target player's library. Put one back and the rest into that player's
    // graveyard.": you choose the one that stays on top.
    const backPut = yourLook && !yourPut && /^Put one back and the rest into (?:their|that player's) graveyard\.?$/.test(sentences[si + 1] ?? "");
    if (yourLook && backPut) {
      const index = addTarget(ctx, { kind: "player", opponent: yourLook[2] === "target opponent", text: yourLook[2]! });
      ctx.lastPlayerTarget = index;
      effects.push({ type: "dig", n: num(yourLook[1]!), count: 1, upTo: false, required: true, into: "libraryTop", rest: "graveyard", reveal: false, library: { ref: "target", index } });
      si++;
      continue;
    }
    // Balshan Beguiler: "that player reveals the top two cards of their library. You choose one of those cards and put it
    // into their graveyard.": the player dealt the damage reveals them, you pick one, the other stays on top.
    if (!dig && /^[Tt]hat player reveals the top two cards of their library$/.test(s) && /^You choose one of those cards and put it into their graveyard\.?$/.test(sentences[si + 1] ?? "") && ctx.eventPlayer && !ctx.spell) {
      effects.push({ type: "dig", n: 2, count: 1, upTo: false, required: true, into: "graveyard", rest: "keep", reveal: true, library: { ref: "eventPlayer" } });
      si++;
      continue;
    }
    // Ransack: "Look at the top five cards of target player's library. Put any number of them on the bottom of that library
    // in any order and the rest on top of the library in any order.": you choose and order both (as a scry of their library).
    if (yourLook && /^Put any number of them on the bottom of that library in any order and the rest on top of the library in any order\.?$/.test(sentences[si + 1] ?? "")) {
      const index = addTarget(ctx, { kind: "player", opponent: yourLook[2] === "target opponent", text: yourLook[2]! });
      ctx.lastPlayerTarget = index;
      effects.push({ type: "orderTop", who: { ref: "target", index }, n: num(yourLook[1]!), mayBottom: true });
      si++;
      continue;
    }
    // Sealed Fate: "Look at the top X cards of target opponent's library. Exile one of those cards and put the rest back on
    // top of that player's library in any order.": you choose the card and the order (rulings).
    const xLook = !dig && ctx.spell ? /^[Ll]ook at the top X cards of (target player|target opponent)'s library$/.exec(s) : null;
    if (xLook && /^Exile one of those cards and put the rest back on top of that player's library in any order\.?$/.test(sentences[si + 1] ?? "")) {
      const index = addTarget(ctx, { kind: "player", opponent: xLook[1] === "target opponent", text: xLook[1]! });
      ctx.lastPlayerTarget = index;
      effects.push({ type: "dig", n: X, count: 1, upTo: false, required: true, into: "exile", rest: "keep", reveal: false, library: { ref: "target", index } }, { type: "orderTop", who: { ref: "target", index }, n: { count: { kind: "x" }, plus: -1 } });
      si++;
      continue;
    }
    // Eye Spy: "Look at the top card of target player's library. You may put that card into their graveyard.": you choose
    // (it's not surveil, CR 701.25, as only the controller of the library surveils).
    const oneLook = !dig && /^[Ll]ook at the top card of (target player|target opponent)'s library$/.exec(s);
    if (oneLook && /^You may put that card into (?:their|that player's) graveyard\.?$/.test(sentences[si + 1] ?? "")) {
      const index = addTarget(ctx, { kind: "player", opponent: oneLook[1] === "target opponent", text: oneLook[1]! });
      ctx.lastPlayerTarget = index;
      effects.push({ type: "dig", n: 1, count: 1, upTo: true, into: "graveyard", rest: "keep", reveal: false, library: { ref: "target", index } });
      si++;
      continue;
    }
    if (yourLook && yourPut) {
      const n = num(yourLook[1]!);
      const index = addTarget(ctx, { kind: "player", opponent: yourLook[2] === "target opponent", text: yourLook[2]! });
      ctx.lastPlayerTarget = index;
      effects.push({ type: "dig", n, count: 1, upTo: false, required: true, into: "graveyard", rest: "keep", reveal: false, library: { ref: "target", index } });
      if (yourPut[1] && n > 2) effects.push({ type: "orderTop", who: { ref: "target", index }, n: n - 1 });
      si++;
      continue;
    }
    // Celestus Sanctifier: "Look at the top two cards of your library. Put one of them into your graveyard.": the other
    // stays on top.
    if (!dig && /^[Ll]ook at the top two cards of your library$/.test(s) && /^Put one of them into your graveyard\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "dig", n: 2, count: 1, upTo: false, required: true, into: "graveyard", rest: "keep", reveal: false });
      si++;
      continue;
    }
    // Cream of the Crop: "You may look at the top X cards of your library, where X is that creature's power. If you do, put
    // one of those cards on top ...": the whole look is optional.
    const mayLook = !dig && /^If you do, put /.test(sentences[si + 1] ?? "") ? /^[Yy]ou may (look at the top .+)$/.exec(s) : null;
    const look = new RegExp(`^(Look at|Reveal) the top ${NUMX} cards? of your library(?:, where X is (.+))?$`, "i").exec(mayLook ? mayLook[1]! : s);
    if (look && !dig && (!look[3] || look[2] === "X")) {
      if (mayLook) {
        digPaid = { text: [s, ...sentences.slice(si + 1, si + 3)].join(". ") };
        sentences[si + 1] = capital(sentences[si + 1]!.replace(/^If you do, /, ""));
      }
      const def = look[3] ? parseCount(look[3], ctx) : undefined;
      if (look[3] && !def) return null;
      dig = { type: "dig", n: def ? replaceX(X, def) : amt(look[2]!), reveal: /^reveal/i.test(look[1]!) };
      digWhere = def ?? undefined;
      continue;
    }
    // Thassa's Oracle: "If X is greater than or equal to the number of cards in your library, you win the game", X being
    // the look's, counted again as it resolves (rulings).
    const xVsLibrary = digWhere && !dig ? /^If X is greater than or equal to the number of cards in your library, (.+)$/.exec(s) : null;
    if (xVsLibrary) {
      const fx = parseOne(capital(xVsLibrary[1]!), ctx);
      if (!fx) return null;
      effects.push({ type: "if", cond: { kind: "amountsCompare", a: digWhere!, atLeast: { count: { kind: "cardsInLibrary", who: { ref: "you" } } } }, effects: fx });
      continue;
    }
    // Gilgamesh, Master-at-Arms: "When you put one or more Equipment onto the battlefield this way, you may attach one of
    // them to a Samurai you control": a reflexive trigger (CR 603.12) after a look that put only Equipment cards onto the
    // battlefield; one of them, chosen as it resolves, to one that it can legally be attached to (rulings).
    const lastDig = effects[effects.length - 1];
    const attachOne = !dig && lastDig?.type === "dig" && lastDig.into === "battlefield" && lastDig.filter?.subtypes?.length === 1 && lastDig.filter.subtypes[0] === "Equipment" && !lastDig.filter.types?.length && !lastDig.filter.anyOf
      ? /^When you put one or more Equipment onto the battlefield this way, you may attach one of them to (an? (?:[A-Z][a-z]+|creature) you control)$/.exec(s)
      : null;
    if (attachOne) {
      const host = parseTargetPhrase(attachOne[1]!.replace(/^an? /, ""));
      if (host?.kind !== "object" || host.controller !== "you") return null;
      effects.push({ type: "reflexive", putThisWay: true, body: { targets: [], effects: [{ type: "attachToChosen", source: { ref: "putThisWay" }, filter: { ...host, types: host.types?.length || host.subtypes?.length ? host.types : ["Creature"], text: attachOne[1]! }, may: true, equipmentOnly: true, pickOne: true }], text: `you may attach one of them to ${attachOne[1]!}.` } });
      continue;
    }
    // Obscura Interceptor: "When this creature enters, it connives. When it connives this way, return up to one target
    // spell to its owner's hand.": a reflexive trigger (CR 603.12), which triggers even if it left before conniving
    // (rulings: it still connives).
    const connived = /^When (?:it|~) connives this way, (.+)$/.exec(s);
    if (connived && effects.length === 1 && effects[0]!.type === "connive" && effects[0]!.what.ref === "self" && (effects[0]!.n ?? 1) === 1) {
      const reflexive = reflexiveBody(connived[1]!, ctx);
      if (!reflexive) return null;
      effects.push({ type: "reflexive", body: reflexive });
      continue;
    }
    // Vivien's Invocation: "You may put a creature card from among them onto the battlefield. ... When a creature is put
    // onto the battlefield this way, it deals damage equal to its power to target creature an opponent controls": a
    // reflexive trigger (CR 603.12) only if one was put there, about that creature.
    const whenPut = !dig && lastDig?.type === "dig" && lastDig.into === "battlefield" && (lastDig.count ?? 1) === 1 && lastDig.filter?.types?.length === 1 && lastDig.filter.types[0] === "Creature" ? /^When a creature is put onto the battlefield this way, (it deals damage equal to its power to .+)$/.exec(s) : null;
    if (whenPut) {
      const reflexive = reflexiveBody(whenPut[1]!, ctx, false, true);
      if (!reflexive) return null;
      // Gone by then: its power as it last existed (rulings, CR 608.2h), so damage from it rather than a bite (CR 701.14b).
      const bite = reflexive.effects[0];
      if (reflexive.effects.length !== 1 || bite?.type !== "bite" || bite.a.ref !== "subject" || bite.b.ref !== "target" || bite.times || bite.self) return null;
      reflexive.effects = [{ type: "damage", amount: { count: { kind: "power", of: { ref: "subject" } } }, to: bite.b, by: "subject" }];
      effects.push({ type: "reflexive", body: reflexive, about: "created" });
      continue;
    }
    // Winota: "It gains indestructible until end of turn": the one card put onto the battlefield, the permanent it became
    // (CR 400.7).
    const digGains = dig?.into === "battlefield" && dig.count === 1 && !afterDig.length ? /^It gains (indestructible|haste) until end of turn$/.exec(s) : null;
    if (digGains) {
      afterDig = [{ type: "continuous", what: { ref: "created" }, mods: [{ kind: "addKeywords", keywords: [capital(digGains[1]!)] }], duration: "endOfTurn" }];
      continue;
    }
    // Armored Skyhunter: the one card put onto the battlefield, if it's an Equipment.
    if (dig?.into === "battlefield" && dig.count === 1 && !afterDig.length && /^If an Equipment is put onto the battlefield this way, you may attach it to a creature you control$/.test(s)) {
      afterDig = [{ type: "attachToChosen", source: { ref: "created" }, filter: { kind: "object", types: ["Creature"], controller: "you", text: "a creature you control" }, may: true, equipmentOnly: true }];
      continue;
    }
    if (dig) {
      if (ctx.spell && effects.some((e) => e.type === "choose" && e.choice === "creatureType" && !e.each)) ctx.choseCreatureType = true;
      const done = parseDig(s, dig, ctx, digWhere);
      if (!done) return null;
      if (done === "more") continue;
      // Flow State: "If there is an instant card and a sorcery card in your graveyard, instead put two of them into your
      // hand and the rest on the bottom of your library in any order": the same look, more cards taken, checked as it
      // resolves.
      const yardInstead = done.into === "hand" && !done.upTo && !done.filter && done.rest === "bottom" && !done.random && !done.kickedCount && !done.countX
        ? /^If there is an? (instant|sorcery|creature|artifact|enchantment|land) card and an? (instant|sorcery|creature|artifact|enchantment|land) card in your graveyard, instead put (two|three) of them into your hand and the rest on the bottom of your library in any order\.?$/.exec(sentences[si + 1] ?? "")
        : null;
      if (yardInstead) {
        const has = [yardInstead[1]!, yardInstead[2]!].map((w) => ({ kind: "card" as const, types: [capital(w)], text: `${w} card` }));
        done.countIfYard = { has, count: num(yardInstead[3]!) };
        si++;
      }
      // Accumulate Wisdom: "Put each of those cards into your hand instead if there are three or more Lesson cards in your
      // graveyard": all of them, checked as it resolves.
      const lessons = !yardInstead && done.into === "hand" && done.count === 1 && !done.upTo && !done.filter && done.rest === "bottom" && !done.random && !done.kickedCount && !done.countX && typeof done.n === "number"
        ? new RegExp(`^Put each of those cards into your hand instead if there are ${NUM} or more ([A-Z][a-z]+) cards in your graveyard\\.?$`).exec(sentences[si + 1] ?? "")
        : null;
      if (lessons) {
        done.countIfYard = { has: [{ kind: "card", subtypes: [lessons[2]!], text: `${lessons[2]} card` }], count: done.n as number, min: num(lessons[1]!) };
        si++;
      }
      if (digPaid) effects.push({ type: "may", effects: [done], ...(digPaid.pay ? { pay: digPaid.pay } : {}), text: digPaid.text });
      else effects.push(done);
      effects.push(...afterDig);
      afterDig = [];
      noteLast(ctx, [done]);
      dig = null;
      // Dihada, Binder of Wills: "Create a Treasure token for each card put into your graveyard this way": the rest that
      // went there (not one a replacement effect sent elsewhere).
      const forEachYard = done.rest === "graveyard" && !digPaid && !done.each ? /^(Create an? [^.]+? token) for each card put into your graveyard this way\.?$/.exec(sentences[si + 1] ?? "") : null;
      if (forEachYard) {
        const made = parseOne(forEachYard[1]!, ctx);
        const token = made?.length === 1 ? made[0]! : undefined;
        if (token?.type !== "createToken" || token.n !== 1) return null;
        effects.push({ ...token, n: { count: { kind: "movedLinkedThisWay" } } });
        si++;
      }
      digPaid = null;
      continue;
    }
    if (payFirst) {
      // "You may pay {2}{W}. When you do, tap target creature." (Thousand Moons Crackshot): paying triggers a reflexive
      // ability with targets of its own, chosen as it's put on the stack (CR 603.12; rulings). The rest of the ability is its.
      const whenPaid = /^When you do, (.+)$/.exec(s);
      if (whenPaid) {
        // "You may pay {X}. When you do, ~ deals X damage to target player" (Electro): the reflexive ability's X is the X paid.
        // "You may pay any amount of {R}. When you do, it deals that much damage to any target" (Leyline Tyrant): that
        // much is the X paid, and "it" the source.
        const paidText = payFirst.payX?.color ? whenPaid[1]!.replace(/^it deals that much damage\b/, "~ deals X damage") : whenPaid[1]!;
        if (payFirst.payX?.color && !/\bX\b/.test(paidText)) return null;
        const reflexive = reflexiveBody([paidText, ...sentences.slice(si + 1)].join(". "), ctx);
        if (!reflexive) return null;
        effects.push({ type: "may", effects: [{ type: "reflexive", body: reflexive }], pay: payFirst.pay, ...(payFirst.payX ? { payX: payFirst.payX } : {}), text: `${payFirst.text}. When you do, ${[whenPaid[1]!, ...sentences.slice(si + 1)].join(". ")}` });
        payFirst = null;
        si = sentences.length;
        continue;
      }
      // Knight of the Mists: "you may pay {U}. If you don't, destroy target Knight and it can't be regenerated": its target
      // chosen as it's put on the stack, the destruction only if you don't pay (CR 608.2d).
      const dont = !payFirst.payX && !payFirst.payLife ? /^If you don't, (.+?)( and it can't be regenerated)?$/.exec(s) : null;
      if (dont && si + 1 === sentences.length) {
        const inner = attempt(ctx, () => parseOne(capital(dont[1]!), ctx));
        if (!inner || (dont[2] && (inner.length !== 1 || inner[0]!.type !== "destroy"))) return null;
        effects.push({ type: "may", effects: [], pay: payFirst.pay, otherwise: dont[2] ? [{ ...inner[0]!, noRegen: true } as Effect] : inner, text: `${payFirst.text}. If you don't, ${dont[1]}${dont[2] ?? ""}` });
        payFirst = null;
        continue;
      }
      const then = /^If you do, (.+)$/.exec(s);
      if (!then) return null;
      // Mask of Griselbrand: "If you do, draw X cards", the X of the life paid; that sentence alone.
      if (payFirst.payLife) {
        if (payFirst.thatMany) then[1] = then[1]!.replace(/\bthat many\b/, "X");
        const inner = si + 1 === sentences.length ? attempt(ctx, () => parseOne(capital(then[1]!), ctx)) : null;
        if (!inner || !/\bX\b/.test(then[1]!)) return null;
        effects.push({ type: "may", effects: replaceX(inner, payFirst.payLife), payLife: payFirst.payLife, text: `${payFirst.text}. If you do, ${then[1]}` });
        payFirst = null;
        continue;
      }
      // "Whenever ~ attacks, you may pay {X}{R}. If you do, it deals X damage to any target." (Flameblast Dragon): "it" is ~.
      if (ctx.selfIt && !ctx.subjectIt) then[1] = then[1]!.replace(/^it deals /, "~ deals ");
      // "You may pay {1}. If you do, look at the top two cards of your library. Put one of them into your hand and the
      // other into your graveyard." (Marchesa): the whole look depends on the payment.
      const lookPaid = new RegExp(`^look at the top ${NUMX} cards? of your library$`).exec(then[1]!);
      if (payFirst.payX && !/\bX\b/.test(then[1]!)) return null;
      if (lookPaid && payFirst.payX) return null;
      if (lookPaid) {
        dig = { type: "dig", n: amt(lookPaid[1]!), reveal: false };
        digPaid = { pay: payFirst.pay, text: `${payFirst.text}. If you do, ${then[1]}` };
        payFirst = null;
        continue;
      }
      const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
      // Skirk Drill Sergeant: "you may pay {2}{R}. If you do, reveal the top card of your library. If it's a Goblin
      // permanent card, put it onto the battlefield. Otherwise, put it into your graveyard.": the reveal and what's done
      // with the card, only if paid.
      if (!payFirst.payX && /^reveal the top card of your library$/.test(then[1]!) && /^If it's /.test(sentences[si + 1] ?? "")) {
        const revealed = parseBody(`${[cap(then[1]!), ...sentences.slice(si + 1)].join(". ")}.`);
        if (!revealed || revealed.targets.length || revealed.effects[0]?.type !== "revealTop") return null;
        effects.push({ type: "may", effects: [], pay: payFirst.pay, text: `${payFirst.text}. If you do, ${[then[1]!, ...sentences.slice(si + 1)].join(". ")}` }, { type: "if", cond: { kind: "youDid" }, effects: revealed.effects });
        payFirst = null;
        si = sentences.length;
        continue;
      }
      // Foster: "you may pay {1}. If you do, reveal cards from the top of your library until you reveal a creature card. Put
      // that card into your hand and the rest into your graveyard.": the whole reveal, only if paid.
      if (!payFirst.payX && /^reveal cards from the top of your library until you reveal /.test(then[1]!) && /^Put that card /.test(sentences[si + 1] ?? "") && si + 2 === sentences.length) {
        const revealed = parseBody(`${[cap(then[1]!), sentences[si + 1]!.replace(/\.$/, "")].join(". ")}.`);
        if (!revealed || revealed.targets.length || revealed.effects.length !== 1 || revealed.effects[0]!.type !== "revealUntil") return null;
        effects.push({ type: "may", effects: revealed.effects, pay: payFirst.pay, text: `${payFirst.text}. If you do, ${[then[1]!, ...sentences.slice(si + 1)].join(". ")}` });
        payFirst = null;
        si = sentences.length;
        continue;
      }
      // "You may pay {R}{G}{W}{U}. If you do, until end of turn, whenever he deals combat damage to an opponent, ..."
      // (Human Torch): the delayed triggered ability, and the rest of the paragraph its instructions, if paid.
      const floatingPaid = payFirst.payX ? undefined : floatingTrigger(then[1]!, sentences.slice(si + 1));
      if (floatingPaid !== undefined) {
        if (!floatingPaid) return null;
        effects.push({ type: "may", effects: [floatingPaid], pay: payFirst.pay, text: `${payFirst.text}. If you do, ${[then[1]!, ...sentences.slice(si + 1)].join(". ")}` });
        payFirst = null;
        si = sentences.length;
        continue;
      }
      // "You may pay {2}{U}. If you do, exile the top card of your library face down. You may look at that card ... You
      // may play that card ..." (Intet): the exile and its permissions depend on the payment.
      const paidFaceDown = payFirst.payX ? null : parseFaceDownPlay([cap(then[1]!), ...sentences.slice(si + 1)], 0, ctx);
      if (paidFaceDown === "fail") return null;
      if (paidFaceDown) {
        effects.push({ type: "may", effects: [paidFaceDown.effect], pay: payFirst.pay, text: `${payFirst.text}. If you do, ${sentences.slice(si, si + paidFaceDown.next).join(". ").replace(/^If you do, /, "")}` });
        payFirst = null;
        si += paidFaceDown.next - 1;
        continue;
      }
      // Arahbo, Roar of the World: "If you do, it gains trample and gets +X/+X until end of turn, where X is its power":
      // X defined by the text (CR 107.3c), counted as it resolves (CR 608.2h).
      const whereIn = payFirst.payX ? null : /^(.+), where X is ([^"]+)$/.exec(then[1]!);
      if (whereIn) {
        ctx.whereX = true;
        const fx = attempt(ctx, () => parseOne(cap(whereIn[1]!), ctx));
        ctx.whereX = false;
        const def = fx && parseCount(whereIn[2]!, ctx);
        if (!fx || !def || (fx.length > 1 && fx.some((e) => pauses(e)))) return null;
        effects.push({ type: "may", effects: replaceX(fx, def), pay: payFirst.pay, text: `${payFirst.text}. If you do, ${then[1]}` });
        payFirst = null;
        continue;
      }
      // "If you do, create a 2/2 black Zombie Berserker creature token, then attach ~ to it": both parts depend
      // on the payment, in order.
      const inner =
        attempt(ctx, () => parseOne(cap(then[1]!), ctx)) ??
        attempt(ctx, () => {
          // Goblin Vandal: "If you do, destroy target artifact defending player controls and ~ assigns no combat damage this
          // turn": two instructions, both paid for.
          const parts = then[1]!.split(/, then (?!shuffle)| and (?=~ assigns no combat damage this turn$)/);
          if (parts.length < 2) return null;
          const all: Effect[] = [];
          for (const p of parts) {
            const fx = parseOne(cap(p), ctx);
            if (!fx) return null;
            all.push(...fx);
          }
          return all;
        });
      // Bitter Chill: "you may pay {1}. If you do, scry 1, then draw a card": instructions that stop for a choice run
      // under an "if you do" of their own, which keeps its place while they wait.
      if (inner && inner.length > 1 && inner.some((e) => pauses(e)) && !payFirst.payX) {
        effects.push({ type: "may", effects: [], pay: payFirst.pay, text: `${payFirst.text}. If you do, ${then[1]}` }, { type: "if", cond: { kind: "youDid" }, effects: inner });
        payFirst = null;
        continue;
      }
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "may", effects: inner, pay: payFirst.pay, text: `${payFirst.text}. If you do, ${then[1]}`, ...(payFirst.payX ? { payX: payFirst.payX } : {}) });
      payFirst = null;
      continue;
    }
    // Relentless Dead: "you may pay {X}. If you do, return another target Zombie creature card with mana value X from your
    // graveyard to the battlefield": the target is chosen as the trigger is put on the stack, and only paying its mana
    // value returns it (rulings: you choose whether to pay as it resolves), so it's {1} for each of its mana value.
    const payMvReturn = /^[Yy]ou may pay \{X\}$/.test(s) ? /^If you do, return (another target .+? card) with mana value X (from your graveyard to the battlefield)\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (payMvReturn && !payFirst) {
      const before = ctx.targets.length;
      const inner = parseOne(`Return ${payMvReturn[1]} ${payMvReturn[2]}`, ctx);
      if (!inner || ctx.targets.length !== before + 1 || ctx.targets[before]!.kind !== "card") return null;
      ctx.targets[before] = { ...ctx.targets[before]!, text: `${ctx.targets[before]!.text} with mana value X` };
      effects.push({ type: "may", effects: inner, pay: { mana: "{1}" }, payTimes: { count: { kind: "manaValue", of: { ref: "target", index: before } } }, text: `pay {X}. If you do, return ${payMvReturn[1]!.replace(/^another target /, "")} with mana value X ${payMvReturn[2]}`.replace(/^pay \{X\}\. If you do, return (.+)$/, "pay {X}, X being that card's mana value. If you do, return it") });
      si++;
      continue;
    }
    // The Adversaries: "you may pay {1}{W} any number of times. When you pay this cost one or more times, put that many valor
    // counters on ~": how many times is chosen and paid as it resolves, then a reflexive trigger (CR 603.12; rulings) with
    // its X that number, and none if it wasn't paid.
    const payTimesAny = !payFirst ? /^[Yy]ou may pay ((?:\{(?:\d+|[WUBRGC])\})+) any number of times$/.exec(s) : null;
    const whenPaidTimes = payTimesAny ? /^When you pay this cost one or more times, (.+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (payTimesAny && whenPaidTimes) {
      const rest = [whenPaidTimes[1]!, ...sentences.slice(si + 2).map((x) => x.replace(/\.$/, ""))].join(". ");
      const text = rest.replace(/\btwice that many\b/g, "twice X").replace(/\bthat many\b/g, "X");
      if (text === rest || /\bX\b/.test(rest)) return null;
      const reflexive = reflexiveBody(text, ctx, false, false, true);
      if (!reflexive) return null;
      effects.push({ type: "may", effects: [{ type: "reflexive", body: reflexive }], pay: { mana: payTimesAny[1]! }, payX: { times: true }, text: `pay ${payTimesAny[1]} any number of times. When you pay this cost one or more times, ${rest}` });
      si = sentences.length;
      continue;
    }
    // "You may pay {X}. If you do, ..." (Decree of Justice), "... {X}{R} ..." (Flameblast Dragon), "you may pay {X}, where
    // X is less than or equal to the amount of life you gained" (Well of Lost Dreams): X chosen as it resolves.
    const mayPayX = /^[Yy]ou may pay (\{X\}(?:\{(?:\d+|[WUBRGC])\})*)(?:, where X is less than or equal to (.+))?$/.exec(s);
    if (mayPayX) {
      // "The amount of life you gained": what the "whenever you gain life" event gave (CR 119.9).
      const max = mayPayX[2] === "the amount of life you gained" ? { count: { kind: "eventAmount" as const } } : mayPayX[2] !== undefined ? parseCount(mayPayX[2]!, ctx) : undefined;
      if (max === null) return null;
      payFirst = { pay: { mana: mayPayX[1]! }, text: `pay ${mayPayX[1]}`, payX: max ? { max } : {} };
      continue;
    }
    // "You may pay any amount of {R}" (Leyline Tyrant): X of that color, chosen as it resolves (CR 107.1c).
    const payAny = /^[Yy]ou may pay any amount of \{([WUBRG])\}$/.exec(s);
    if (payAny) {
      payFirst = { pay: { mana: "{X}" }, text: `pay any amount of {${payAny[1]}}`, payX: { color: payAny[1] as "W" | "U" | "B" | "R" | "G" } };
      continue;
    }
    // Necrodominance: "You may pay any amount of life. If you do, draw that many cards": X life, chosen as it resolves.
    if (/^[Yy]ou may pay any amount of life$/.test(s) && /^If you do, draw that many cards\.?$/.test(sentences[si + 1] ?? "") && si + 2 === sentences.length) {
      effects.push({ type: "may", effects: [{ type: "draw", who: { ref: "you" }, n: { count: { kind: "x" } } }], pay: {}, payX: { life: true }, text: "pay any amount of life. If you do, draw that many cards" });
      si++;
      continue;
    }
    // Galvanic Discharge, Harnessed Lightning, Die Young: "Choose target creature. You get {E}{E}{E}, then you may pay any
    // amount of {E}. ~ deals that much damage to that creature" ("The creature gets -1/-1 until end of turn for each {E}
    // paid this way"): X energy, chosen as it resolves, at most what you have; paying 0 is paying (rulings, CR 107.14).
    // ", then" has split the sentence already.
    const anyEnergy = ctx.spell && /^[Yy]ou may pay any amount of \{E\}$/.test(s);
    const energyUse = anyEnergy && si + 2 === sentences.length ? (sentences[si + 1] ?? "").replace(/\.$/, "") : "";
    const energyX = energyUse.replace(/^~ deals that much damage to that (permanent|creature)$/, "~ deals X damage to that $1").replace(/^The creature gets -1\/-1 until end of turn for each \{E\} paid this way$/, "That creature gets -X/-X until end of turn");
    if (anyEnergy && energyX !== energyUse && ctx.targets.length === 1) {
      const before = ctx.targets.length;
      const inner = parseOne(energyX, ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "may", effects: inner, pay: {}, payX: { energy: true }, text: `pay any amount of {E}. ${energyUse}` });
      si++;
      continue;
    }
    // "You may pay X life, where X is its power" (Mask of Griselbrand): counted as it resolves (CR 608.2h).
    // Madame Null, Power Broker: "you may pay life equal to its power. If you do, put that many +1/+1 counters on it": the
    // same, "that many" being the life paid (its power as it resolves, or as it last existed, rulings).
    // Niv-Mizzet, Ghost Counsel: "Whenever you gain life, you may pay that much life. If you do, draw that many cards": the
    // trigger has made both of them X (the life gained, triggers.ts), so the life paid is the cards drawn.
    const payTriggerX = !ctx.spell && /^[Yy]ou may pay X life$/.test(s) && /^If you do, [^.]*\bX\b/.test(sentences[si + 1] ?? "");
    const payLifeEq = /^[Yy]ou may pay life equal to (its power)$/.exec(s);
    const payLifeX = payLifeEq ?? /^[Yy]ou may pay X life, where X is (.+)$/.exec(s) ?? (payTriggerX ? /^[Yy]ou may pay (X) life$/.exec(s) : null);
    if (payLifeX) {
      const n = payTriggerX ? { count: { kind: "x" as const } } : parseCount(payLifeX[1]!, ctx);
      if (!n || typeof n !== "object" || !("count" in n)) return null;
      payFirst = { pay: {}, payLife: n, text: payTriggerX ? "pay X life" : payLifeEq ? `pay life equal to ${payLifeX[1]}` : `pay X life, where X is ${payLifeX[1]}`, ...(payLifeEq ? { thatMany: true } : {}) };
      continue;
    }
    // Killer Service: "you may pay {2} and sacrifice a token. If you do, ...", Conspiracy Theorist's "pay {1} and discard
    // a card": both or neither, as it resolves (someone who can't do both isn't asked).
    const payAnd = /^[Yy]ou may pay ((?:\{[^}]+\})+) and ((?:sacrifice|discard) an? [a-z ]+)$/.exec(s);
    if (payAnd && plainMana(payAnd[1]!) && /^If you do, /.test(sentences[si + 1] ?? "")) {
      const inner = parseOne(capital(payAnd[2]!), ctx);
      if (!inner || inner.length !== 1 || inner[0]!.type !== (/^sacrifice/.test(payAnd[2]!) ? "pick" : "discard")) return null;
      const then = parseOne(capital(sentences[si + 1]!.replace(/^If you do, /, "").replace(/\.$/, "")), ctx);
      if (!then) return null;
      effects.push({ type: "may", effects: inner, pay: { mana: payAnd[1]! }, text: `pay ${payAnd[1]} and ${payAnd[2]}` }, { type: "if", cond: { kind: "youDid" }, effects: then });
      si++;
      continue;
    }
    const mayPay = /^[Yy]ou may pay (.+)$/.exec(s);
    if (mayPay) {
      const pay = parsePayCost(mayPay[1]!);
      if (!pay) return null;
      payFirst = { pay, text: `pay ${mayPay[1]}` };
      continue;
    }
    // "If this is the second time this ability has resolved this turn, draw a card" (South Pole Voyager), "..., draw a card
    // instead" (Rumor Gatherer); "You gain 4 life if this is the first time this ability has resolved this turn. If it's
    // the second time, add {R}{G}{W}{U}. If it's the third time, ..." (Omnath); "Otherwise, ...": checked as it resolves,
    // counting this time (SpellCondition "resolvedNth"). Each such sentence is about itself only, so none may come after
    // them that isn't one (a second sentence under "If it's the third time" would read as unconditional).
    const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
    const ORD = "(first|second|third|fourth|fifth)(?: or (second|third|fourth|fifth))?";
    const nthIf = new RegExp(`^If (?:this is the ${ORD} time this ability has resolved this turn|it's the ${ORD} time), (.+)$`).exec(s);
    const nthAfter = new RegExp(`^(.+?),? if this is the ${ORD} time this ability has resolved this turn$`).exec(s);
    const nthOtherwise = nthSeen.length ? /^Otherwise, (.+)$/.exec(s) : null;
    if (nthSeen.length && !nthIf && !nthAfter && !nthOtherwise) return null;
    // Nissa, Resurgent Animist: "Then if this is the second time this ability has resolved this turn, reveal cards from
    // the top of your library until you reveal an Elf or Elemental card. Put that card into your hand and the rest on the
    // bottom of your library in a random order." The second sentence finishes the first, under the same condition.
    const nthUntil = nthIf && nthIf[1] && !nthSeen.length && /^reveal cards from the top of your library until you reveal /.test(nthIf[5]!) && /^Put that card into your hand and the rest on the bottom of your library in a random order\.?$/.test(sentences[si + 1] ?? "") && si + 2 === sentences.length;
    if (nthUntil) {
      const sub = parseBody(`R${nthIf[5]!.slice(1)}. ${sentences[si + 1]!.replace(/\.$/, "")}.`);
      if (!sub || sub.targets.length || sub.effects.length !== 1 || sub.effects[0]!.type !== "revealUntil") return null;
      effects.push({ type: "if", cond: { kind: "resolvedNth", n: [ORDINAL[nthIf[1]!]!, ...(nthIf[2] ? [ORDINAL[nthIf[2]]!] : [])] }, effects: sub.effects });
      si++;
      continue;
    }
    if (nthIf && (nthIf[1] || nthSeen.length)) {
      const ns = [nthIf[1] ?? nthIf[3]!, nthIf[2] ?? nthIf[4]].filter((x): x is string => !!x).map((w) => ORDINAL[w]!);
      const cond: SpellCondition = { kind: "resolvedNth", n: ns };
      const fx = parseKicked(nthIf[5]!, effects.slice(prevStart), ctx);
      if (!fx || (fx.instead && nthSeen.length)) return null;
      nthSeen.push(...ns);
      if (fx.instead) effects.splice(prevStart, effects.length - prevStart, { type: "if", cond, effects: fx.effects, otherwise: effects.slice(prevStart) });
      else effects.push({ type: "if", cond, effects: fx.effects });
      continue;
    }
    if (nthAfter && !nthSeen.length) {
      const ns = [nthAfter[2]!, nthAfter[3]].filter((x): x is string => !!x).map((w) => ORDINAL[w]!);
      const before = ctx.targets.length;
      const fx = parseOne(nthAfter[1]!.charAt(0).toUpperCase() + nthAfter[1]!.slice(1), ctx);
      if (!fx || ctx.targets.length !== before) return null;
      nthSeen.push(...ns);
      effects.push({ type: "if", cond: { kind: "resolvedNth", n: ns }, effects: fx });
      continue;
    }
    // Rose Room Treasurer: "Otherwise, you may pay {X}. When you do, ~ deals X damage to any target.": the reflexive
    // trigger (CR 603.12) belongs to the "Otherwise" too, its target chosen when it triggers.
    if (nthOtherwise && /^you may pay \{X\}$/.test(nthOtherwise[1]!) && /^When you do, /.test(sentences[si + 1] ?? "") && si + 2 === sentences.length) {
      const sub = parseBody(`You may pay {X}. ${sentences[si + 1]!.replace(/\.$/, "")}.`, {});
      if (!sub || sub.targets.length || sub.effects.length !== 1 || sub.effects[0]!.type !== "may") return null;
      effects.push({ type: "if", cond: { kind: "resolvedNth", n: [...nthSeen], not: true }, effects: sub.effects });
      nthSeen.push(0);
      si++;
      continue;
    }
    if (nthOtherwise) {
      const fx = parseKicked(nthOtherwise[1]!, [], ctx);
      if (!fx || fx.instead) return null;
      effects.push({ type: "if", cond: { kind: "resolvedNth", n: [...nthSeen], not: true }, effects: fx.effects });
      nthSeen.push(0); // nothing may follow "Otherwise"
      continue;
    }
    // Ardyn, the Usurper: "Exile up to one target creature card from a graveyard. If you exiled a card this way, create a token
    // that's a copy of that card, ...": only once that card is in exile (a commander put into the command zone instead
    // wasn't exiled, CR 903.9a).
    const exiledWay = /^If you exiled a card this way, (.+)$/.exec(s);
    if (exiledWay) {
      const prev = effects[effects.length - 1];
      const index = prev?.type === "exile" && prev.what.ref === "target" && !prev.what.n && !prev.until ? prev.what.index : undefined;
      if (index === undefined || ctx.targets[index]?.kind !== "card") return null;
      const before = ctx.targets.length;
      const inner = parseOne(capital(exiledWay[1]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "targetExiled", index }, effects: inner });
      continue;
    }
    // Sphinx of Lost Truths: "Then if it wasn't kicked, discard three cards.": only when it wasn't (CR 702.33e), with no
    // targets of its own.
    const notKicked = /^(?:Then i|I)f (?:~|it) wasn't kicked, (.+)$/.exec(s);
    if (notKicked && (ctx.spell || ctx.selfEntered)) {
      const before = ctx.targets.length;
      const fx = parseOne(capital(notKicked[1]!), ctx);
      if (!fx?.length || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "kicked" }, effects: [], otherwise: fx });
      continue;
    }
    // Blood Tribute: "Target opponent loses half their life, rounded up. If ~ was kicked, you gain life equal to the life
    // lost this way": whether it was kicked was settled as it was cast (CR 702.33e), so it's the same loss, drained or not.
    if (/^If ~ was kicked, you gain life equal to the life lost this way$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "loseLife" || last.drain) return null;
      effects.splice(effects.length - 1, 1, { type: "if", cond: { kind: "kicked" }, effects: [{ ...last, drain: true }], otherwise: [last] });
      continue;
    }
    // Chain Assassination: "Destroy target creature. If another creature died this turn, draw a card.": one other than that
    // target, which counts only if this destroyed it; an indestructible target still lets you draw (rulings).
    const anotherDied = /^If another creature died this turn, (.+)$/.exec(s);
    if (anotherDied) {
      const last = effects[effects.length - 1];
      const fx = parseOne(capital(anotherDied[1]!), ctx);
      if (last?.type !== "destroy" || last.what.ref !== "target" || effects.length - prevStart !== 1 || !fx || ctx.targets.length !== curTargets) return null;
      effects.push({ type: "if", cond: { kind: "anotherDied", index: last.what.index }, effects: fx });
      continue;
    }
    // Bane's Contingency: "Counter target spell. If that spell targets a commander you control, instead counter that spell,
    // scry 2, then draw a card": what the spell targets as this resolves; a commander on the battlefield (rulings).
    const banes = /^If that spell targets a commander you control, instead counter that spell, (.+)$/.exec(s);
    if (banes) {
      const last = effects[effects.length - 1];
      const filter = parseTargetPhrase("commander you control");
      const parts = banes[1]!.split(/, then /).map((x) => parseOne(capital(x), ctx));
      const rest = parts.every(Boolean) ? parts.flatMap((x) => x!) : null;
      if (last?.type !== "counterSpell" || effects.length - prevStart !== 1 || filter?.kind !== "object" || !rest || ctx.targets.length !== curTargets) return null;
      effects.splice(effects.length - 1, 1, { type: "if", cond: { kind: "targetSpellTargets", index: last.index, filter }, effects: [last, ...rest], otherwise: [last] });
      continue;
    }
    // "If ~ was kicked, draw a card." / "If ~ was kicked, it deals 5 damage instead." (CR 702.33e)
    const kicked = /^If (?:~|it) was kicked(?: with its ((?:\{[^}]+\})+) kicker)?, (.+)$/.exec(s);
    if (kicked) {
      const cond: SpellCondition = { kind: "kicked", ...(kicked[1] ? { cost: kicked[1] } : {}) };
      const fx = parseKicked(kicked[2]!, effects.slice(prevStart), ctx, true);
      if (!fx || !gateNewTargets(ctx, cond, false, fx, effects.slice(prevStart), prevTargets, curTargets)) return null;
      if (fx.instead) effects.splice(prevStart, effects.length - prevStart, { type: "if", cond, effects: fx.effects, otherwise: effects.slice(prevStart) });
      else effects.push({ type: "if", cond, effects: fx.effects });
      continue;
    }
    // "If ~ was bargained, that creature also gains flying", "... it deals twice X damage to that permanent instead"
    // (CR 702.166b); "If this spell was cast using teamwork, draw a card", "Also put a +1/+1 counter on that creature if
    // this spell was cast using teamwork", "Then discard a card unless this spell was cast using teamwork"; "If the gift
    // was promised, ..." (CR 702.174b). Targets only the optional part needs are chosen only if it was paid (CR 702.166d,
    // 702.194c, 702.174m).
    // "Destroy target nonland permanent if it's a creature or if {G}{W} was spent to cast ~" (Mythos of Nethroi): either
    // one, checked as it resolves (rulings).
    const orSpent = new RegExp(`^(.+) if it's an? (artifact|creature|enchantment|planeswalker) or if (${SPENT_TO_CAST})$`).exec(s);
    if (orSpent) {
      const fx = parseOne(orSpent[1]!, ctx);
      const spent = spentHowCast(`${orSpent[1]} if ${orSpent[3]}`, ctx);
      const i = ctx.targets.length - 1;
      if (!fx || !spent || spent.not || spent.ofTarget || i !== curTargets || ctx.targets[i]!.kind !== "object" || !fx.every((e) => mentionsTarget(e, i))) return null;
      const filter = parseTargetPhrase(orSpent[2]!);
      if (filter?.kind !== "object") return null;
      effects.push({ type: "if", cond: spent.cond, effects: fx, otherwise: [{ type: "if", cond: { kind: "targetIs", index: i, filter }, effects: structuredClone(fx) }] });
      continue;
    }
    // Fatal Push: "Destroy target creature if it has mana value 2 or less. Revolt — Destroy that creature if it has mana
    // value 4 or less instead if a permanent left the battlefield under your control this turn." Any creature can be
    // targeted; its mana value and revolt are checked as it resolves (rulings).
    const push = /^Destroy target creature if it has mana value (\d+) or less$/.exec(s);
    const pushRevolt = push && /^Destroy that creature if it has mana value (\d+) or less instead if a permanent left the battlefield under your control this turn\.?$/.exec(sentences[si + 1] ?? "");
    if (push && pushRevolt && ctx.spell) {
      const index = addTarget(ctx, { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "target creature" });
      const upTo = (n: string): Effect => ({ type: "if", cond: { kind: "targetIs", index, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], manaValue: { max: Number(n) }, text: `creature with mana value ${n} or less` } }, effects: [{ type: "destroy", what: { ref: "target", index } }] });
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "revolt" } }, effects: [upTo(pushRevolt[1]!)], otherwise: [upTo(push[1]!)] });
      si++;
      continue;
    }
    // Anoint with Affliction: "Exile target creature if it has mana value 3 or less. Corrupted — Exile that creature
    // instead if its controller has three or more poison counters": either one, checked as it resolves (rulings).
    const anoint = /^Exile target creature if it has mana value (\d+) or less$/.exec(s);
    const corrupted = anoint && /^Exile that creature instead if its controller has (one|two|three|four|five|\d+) or more poison counters\.?$/.exec(sentences[si + 1] ?? "");
    if (anoint && corrupted && ctx.spell) {
      const index = addTarget(ctx, { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "target creature" });
      const exile: Effect = { type: "exile", what: { ref: "target", index } };
      const small: Effect = { type: "if", cond: { kind: "targetIs", index, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], manaValue: { max: Number(anoint[1]) }, text: `creature with mana value ${anoint[1]} or less` } }, effects: [structuredClone(exile)] };
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "poison", who: { ref: "targetController", index } } }, min: num(corrupted[1]!) }, effects: [exile], otherwise: [small] });
      si++;
      continue;
    }
    // "Destroy target nonblack creature if its toughness is less than or equal to the number of cards in your graveyard"
    // (Ghastly Demise), "Counter target spell if its mana value is less than or equal to ..." (Dispersal Shield): any such
    // object can be targeted, and the comparison is made as it resolves (rulings on Ghastly Demise, Prismatic Ending,
    // Agadeem Occultist, Nimbus Champion).
    // "Return target nonland permanent to its owner's hand. If you controlled that permanent, draw a card." (Geistwave),
    // "... If you controlled it, investigate." (Hotshot Investigators): about the one object target before it, checked as
    // the spell or ability resolves (CR 608.2h).
    const controlled = /^If you controlled (that permanent|that creature|that artifact|it), (.+)$/.exec(s);
    if (controlled) {
      const i = ctx.lastObjectTarget;
      const t = i === undefined ? undefined : ctx.targets[i];
      if (i === undefined || !t || t.kind !== "object" || t.many || t.divided || i !== ctx.targets.length - 1) return null;
      const fx = parseOne(controlled[2]!.charAt(0).toUpperCase() + controlled[2]!.slice(1), ctx);
      if (!fx || ctx.targets.length !== i + 1) return null;
      effects.push({ type: "if", cond: { kind: "targetWasYours", index: i }, effects: fx });
      continue;
    }
    // Kaya, Intangible Slayer: "Exile target creature or enchantment. If it wasn't an Aura, create a token that's a copy of
    // it, ...": whether it was an Aura as it last existed on the battlefield (rulings, CR 608.2h), so it's checked just
    // before it's exiled, and the rest happens after.
    const exileWasnt = /^Exile target [^.]+$/.test(s) ? /^If it wasn't an? ([A-Z][a-z]+), (.+?)\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (exileWasnt && exileWasnt[1] === "Aura") {
      const before = ctx.targets.length;
      const fx = parseOne(s, ctx);
      if (!fx || fx.length !== 1 || ctx.targets.length !== before + 1 || fx[0]!.type !== "exile" || ctx.targets[before]!.kind !== "object" || ctx.targets[before]!.optional) return null;
      const then = parseOne(capital(exileWasnt[2]!), ctx);
      if (!then || ctx.targets.length !== before + 1) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [exileWasnt[1]!], text: `an ${exileWasnt[1]}` };
      effects.push({ type: "if", cond: { kind: "targetIs", index: before, filter }, effects: fx, otherwise: [...structuredClone(fx), ...then] });
      si++;
      continue;
    }
    // "Exile target card from a graveyard. If it was a creature card, ..." (Scavenging Ooze, Cling to Dust, Deluge of the
    // Dead): about the card the instruction before exiled, by its characteristics in the graveyard, which are its printed
    // ones (CR 608.2h). A target that's illegal by then stops the whole ability (rulings), so it never gets here.
    // Cemetery Recruitment: "Return target creature card from your graveyard to your hand. If it's a Zombie card, draw a
    // card.": the card returned, by its printed characteristics (the same in the graveyard and the hand).
    const wasCard = /^If it(?: was|'s) an? ((?:[a-z]+ )?[A-Za-z]+) card, (.+)$/.exec(s);
    if (wasCard) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(`${wasCard[1]!} card`);
      const moved = /^If it was /.test(s) ? prev?.type === "exile" : prev?.type === "bounce";
      if (!t || t.kind !== "card" || t.many || t.optional || !moved || !prev || !("what" in prev) || prev.what?.ref !== "target" || prev.what.index !== i || !filter) return null;
      const inner = parseOne(wasCard[2]!.charAt(0).toUpperCase() + wasCard[2]!.slice(1), ctx);
      if (!inner || ctx.targets.length !== i + 1 || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "targetCardWas", index: i, filter }, effects: inner });
      continue;
    }
    // Deicide: "Exile target enchantment. If the exiled card is a God card, search its controller's graveyard, hand, and
    // library for ...": the card in exile, by its printed characteristics (rulings: a God card whatever the devotion was).
    const exiledCardIs = /^If the exiled card is an? ([A-Z][a-z]+) card, (.+)$/.exec(s);
    if (exiledCardIs) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(`${exiledCardIs[1]!} card`);
      if (!t || t.kind !== "object" || t.many || t.optional || prev?.type !== "exile" || prev.what.ref !== "target" || prev.what.index !== i || !filter) return null;
      const inner = parseOne(capital(exiledCardIs[2]!), ctx);
      if (!inner || ctx.targets.length !== i + 1) return null;
      effects.push({ type: "if", cond: { kind: "targetCardWas", index: i, filter }, effects: inner });
      continue;
    }
    // Warren Pilferers: "Return target creature card from your graveyard to your hand. If that card is a Goblin card, ~
    // gains haste until end of turn.": the card returned, by its printed characteristics (CR 608.2h).
    const isCard = /^If that card is an? ([A-Z][a-z]+) card, (.+)$/.exec(s);
    if (isCard && CREATURE_TYPES.has(isCard[1]!)) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      if (!t || t.kind !== "card" || t.many || t.optional || prev?.type !== "bounce" || prev.what.ref !== "target" || prev.what.index !== i) return null;
      const inner = parseOne(capital(isCard[2]!), ctx);
      if (!inner || ctx.targets.length !== i + 1 || inner.some((e) => pauses(e))) return null;
      effects.push({ type: "if", cond: { kind: "targetCardWas", index: i, filter: { kind: "card", subtypes: [isCard[1]!], text: `${isCard[1]} card` } }, effects: inner });
      continue;
    }
    // Glorious Gale: "Counter target creature spell. If it was a legendary spell, the Ring tempts you": that spell's card,
    // countered or not, by its printed characteristics.
    // Jace's Defeat: "Counter target blue spell. If it was a Jace planeswalker spell, scry 2": the same, its planeswalker type.
    const wasSpell = /^If it was a (legendary|([A-Z][a-z]+) planeswalker) spell, (.+)$/.exec(s);
    if (wasSpell && (!wasSpell[2] || PLANESWALKER_TYPES.has(wasSpell[2]))) {
      const prev = effects[effects.length - 1];
      const i = prev?.type === "counterSpell" && !prev.bounce && !prev.exileSpell ? prev.index : -1;
      if (i < 0 || ctx.targets[i]?.kind !== "spell" || ctx.targets[i]!.many || ctx.targets[i]!.optional) return null;
      // A choice inside ("scry 2") keeps the answer (run-choices.ts holds it).
      const inner = parseOne(capital(wasSpell[3]!), ctx);
      if (!inner) return null;
      const filter: TargetSpec = wasSpell[2] ? { kind: "card", types: ["Planeswalker"], subtypes: [wasSpell[2]], text: `${wasSpell[2]} planeswalker card` } : { kind: "card", supertypes: ["Legendary"], text: "legendary card" };
      effects.push({ type: "if", cond: { kind: "targetCardWas", index: i, filter }, effects: inner });
      continue;
    }
    // Getaway Glamer: "Destroy target creature if no other creature has greater power": checked as it resolves (rulings).
    const greatest = /^(Destroy target creature) if no other creature has greater power$/.exec(s);
    if (greatest) {
      const i = ctx.targets.length;
      const inner = parseOne(greatest[1]!, ctx);
      if (!inner || ctx.targets.length !== i + 1) return null;
      effects.push({ type: "if", cond: { kind: "targetGreatestPower", index: i }, effects: inner });
      continue;
    }
    // Siren's Ruse: "Exile target creature you control, then return that card to the battlefield under its owner's control.
    // If a Pirate was exiled this way, draw a card": the permanent as it last existed on the battlefield (CR 608.2h).
    const typeExiled = /^If an? ([A-Z][a-z]+) was exiled this way, (.+)$/.exec(s);
    if (typeExiled && CREATURE_TYPES.has(typeExiled[1]!)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "flicker" || prev.what.ref !== "target" || prev.at || prev.hold) return null;
      const inner = parseOne(capital(typeExiled[2]!), ctx);
      if (!inner) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [typeExiled[1]!], text: typeExiled[1]! };
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "exiledThisWay", filter } }, min: 1 }, effects: inner });
      continue;
    }
    // Gideon's Defeat: "Exile target white creature that's attacking or blocking. If it was a Gideon planeswalker, you gain 5
    // life": the permanent as it last existed on the battlefield (CR 608.2h), so only if it was exiled from there.
    const exiledWas = /^If (?:it|that permanent) was an? ([A-Z][a-z]+) planeswalker, (.+)$/.exec(s);
    if (exiledWas && PLANESWALKER_TYPES.has(exiledWas[1]!)) {
      const prev = effects[effects.length - 1];
      const i = prev?.type === "exile" && !prev.until && !prev.linked && !prev.ownerMay && !prev.youMay && prev.what.ref === "target" && !prev.what.n ? prev.what.index : -1;
      if (i < 0 || ctx.targets[i]?.kind !== "object" || ctx.targets[i]!.many) return null;
      const inner = parseOne(capital(exiledWas[2]!), ctx);
      if (!inner || ctx.targets.length !== i + 1) return null;
      const filter: TargetSpec = { kind: "object", types: ["Planeswalker"], notTypes: [], notColors: [], subtypes: [exiledWas[1]!], text: `${exiledWas[1]} planeswalker` };
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "exiledThisWay", filter } }, min: 1 }, effects: inner });
      continue;
    }
    // Agatha's Soul Cauldron: "Exile target card from a graveyard. When a creature card is exiled this way, put a +1/+1
    // counter on target creature you control": a reflexive trigger (CR 603.12) if the card was a creature card.
    const whenCard = /^When an? ((?:[a-z]+ )?[a-z]+) card is exiled this way, (.+)$/.exec(s);
    if (whenCard) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(`${whenCard[1]!} card`);
      if (!t || t.kind !== "card" || t.many || t.optional || prev?.type !== "exile" || prev.what.ref !== "target" || prev.what.index !== i || !filter || si + 1 !== sentences.length) return null;
      const reflexive = reflexiveBody(whenCard[2]!, ctx);
      if (!reflexive) return null;
      effects.push({ type: "if", cond: { kind: "targetCardWas", index: i, filter }, effects: [{ type: "reflexive", body: reflexive }] });
      continue;
    }
    // Kabira Evangel: "you may choose a color. If you do, Allies you control gain protection from the chosen color until end
    // of turn": both or neither, the color chosen as it resolves (CR 608.2d).
    if (/^[Yy]ou may choose a color$/.test(s) && /^If you do, /.test(sentences[si + 1] ?? "")) {
      const inner = parseOne(capital(sentences[si + 1]!.replace(/^If you do, /, "").replace(/\.$/, "")), ctx);
      if (!inner || !/\bthe chosen color\b/.test(sentences[si + 1]!) || inner.some((x) => pauses(x))) return null;
      effects.push({ type: "may", effects: [{ type: "choose", choice: "color" }, ...inner], text: "choose a color" });
      si++;
      continue;
    }
    // Yuna's Whistle: "Reveal cards ... until you reveal a creature card. Put that card into your hand ... When you reveal a
    // creature card this way, put X +1/+1 counters on target creature you control, where X is the mana value of that
    // card": a reflexive trigger (CR 603.12) only if one was found, its X that card's mana value.
    const whenRevealed = /^When you reveal an? ([a-z]+ card) this way, (.+), where X is the mana value of that card$/.exec(s);
    if (whenRevealed) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "revealUntil" || prev.n || prev.who || prev.filter.text !== whenRevealed[1] || si + 1 !== sentences.length || /\b(?:that|those|it)\b/.test(whenRevealed[2]!)) return null;
      const reflexive = reflexiveBody(whenRevealed[2]!, ctx, false, false, true);
      if (!reflexive) return null;
      effects.push({ type: "reflexive", body: reflexive, xRevealedMv: true });
      continue;
    }
    // Cait Sith, Fortune Teller: "Exile the top card of your library. You may play that card this turn. When you exile a
    // card this way, target creature you control gets +X/+0 until end of turn, where X is that card's mana value.";
    // Hidetsugu, Devouring Chaos: "When you exile a nonland card this way, ~ deals damage equal to the exiled card's mana
    // value to any target.": a reflexive trigger (CR 603.12) only if a card (a nonland one) was exiled, its X that card's
    // mana value.
    const whenExiled = /^When you exile an? (nonland )?card this way, (.+)$/.exec(s);
    if (whenExiled) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "impulse" || prev.who || prev.hand || prev.choose || prev.graveyards || typeof prev.n !== "number" || prev.n !== 1 || si + 1 !== sentences.length) return null;
      const text = whenExiled[2]!.replace(/, where X is (?:that|the exiled) card's mana value$/, "").replace(/^~ deals damage equal to (?:that|the exiled) card's mana value to /, "~ deals X damage to ");
      if (text === whenExiled[2] || /\b(?:that card|the exiled card|it)\b/.test(text)) return null;
      const reflexive = reflexiveBody(text, ctx, false, false, true);
      if (!reflexive) return null;
      effects.push({ type: "reflexive", body: reflexive, xExiledMv: whenExiled[1] ? "nonland" : "any" });
      continue;
    }
    // Mastermind Plum: "Exile up to one target card from a graveyard. If an artifact card was exiled this way, create a
    // Treasure token": the target card, if it was chosen and still legal as this resolves (so exiled).
    // Feral Appetite: "If a creature card is exiled this way, ..." too.
    const ifCardExiled = /^If an? ((?:[a-z]+ )?[a-z]+) card (?:was|is) exiled this way, (.+)$/.exec(s);
    if (ifCardExiled) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(`${ifCardExiled[1]!} card`);
      // Deathgorge Scavenger: "you may exile target card from a graveyard. If a creature card is exiled this way, you gain 2
      // life. If a noncreature card is exiled this way, ...": only if it was exiled (rulings), so each under "if it was".
      const exiling = prev?.type === "may" && !prev.pay && prev.effects.length === 1 ? prev.effects[0] : prev;
      const mayExiled = (prev?.type === "may" && exiling !== prev) || (prev?.type === "if" && prev.cond.kind === "targetExiled" && prev.cond.index === i && !prev.otherwise);
      const isExile = (e: Effect | undefined) => e?.type === "exile" && e.what.ref === "target" && e.what.index === i && !e.what.n;
      if (!t || t.kind !== "card" || t.many || !(isExile(exiling) || (prev?.type === "if" && mayExiled)) || !filter) return null;
      const before = ctx.targets.length;
      const inner = parseOne(capital(ifCardExiled[2]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      const pick: Effect = { type: "if", cond: { kind: "targetCardWas", index: i, filter }, effects: inner };
      effects.push(mayExiled ? { type: "if", cond: { kind: "targetExiled", index: i }, effects: [pick] } : pick);
      continue;
    }
    // "Choose target creature card in your graveyard. If that card's mana value is less than or equal to the number of
    // experience counters you have, return it to the battlefield. Otherwise, put it into your hand." (Meren of Clan Nel
    // Toth): compared as it resolves; with it lower, it can't go to the hand instead (rulings).
    const ifMv = /^If that card's mana value is less than or equal to (.+?), (.+)$/.exec(s);
    const elseMv = ifMv && /^Otherwise, (.+)$/.exec(sentences[si + 1] ?? "");
    if (ifMv && elseMv) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      if (i !== prevTargets || i + 1 !== curTargets || !t || t.kind !== "card" || t.optional || t.many) return null;
      const amount = parseCount(ifMv[1]!, ctx);
      // The card targeted: "return it to the battlefield", "put it into your hand".
      const move = (x: string): Effect[] | null =>
        /^return it to the battlefield$/i.test(x) ? [{ type: "putOntoBattlefield", what: { ref: "target", index: i } }] : /^(?:put it into|return it to) your hand$/i.test(x) ? [{ type: "bounce", what: { ref: "target", index: i } }] : null;
      const yes = amount && ctx.targets.length === i + 1 ? move(ifMv[2]!) : null;
      const no = yes ? move(elseMv[1]!) : null;
      if (!amount || !yes || !no || ctx.targets.length !== i + 1 || ![...yes, ...no].every((e) => mentionsTarget(e, i))) return null;
      const filter: TargetSpec = { kind: "card", bound: { key: "manaValue", at: "most", amount }, text: `mana value less than or equal to ${ifMv[1]}` };
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter }, effects: yes, otherwise: no });
      si++;
      continue;
    }
    // Barrin's Unmaking: "Return target permanent to its owner's hand if that permanent shares a color with the most common
    // color among all permanents or a color tied for most common": as it resolves.
    const mostCommon = /^(.+) if that (permanent|creature) shares a color with the most common color among all permanents or a color tied for most common$/.exec(s);
    if (mostCommon) {
      const fx = parseOne(mostCommon[1]!, ctx);
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      if (!fx || i !== curTargets || t?.kind !== "object" || t.optional || t.many || !fx.every((e) => mentionsTarget(e, i))) return null;
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter: { kind: "object", mostCommonColor: true, text: "shares a color with the most common color" } }, effects: fx });
      continue;
    }
    const atMost = /^(.+) if (?:its|that creature's|that card's) (power|toughness|mana value) is less than or equal to (.+)$/.exec(s);
    if (atMost) {
      // "You may return target creature to its owner's hand if that creature's power is ..." (Nimbus Champion): asked only
      // if it holds.
      const may = /^[Yy]ou may (.+)$/.exec(atMost[1]!);
      const fx0 = parseOne(may ? may[1]!.charAt(0).toUpperCase() + may[1]!.slice(1) : atMost[1]!, ctx);
      const fx = fx0 && may ? fx0.some((e) => pauses(e)) ? null : [{ type: "may" as const, effects: fx0, text: may[1]! }] : fx0;
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      if (!fx || i !== curTargets || !t || t.optional || t.many || t.divided || !fx.every((e) => mentionsTarget(e, i))) return null;
      const key = atMost[2] === "mana value" ? "manaValue" : (atMost[2] as "power" | "toughness");
      // Power and toughness only for creatures (CR 208.3); a spell's mana value counts its X (202.3e).
      if (t.kind === "player" || t.kind === "any" || (key !== "manaValue" && t.kind === "spell")) return null;
      const amount = parseCount(atMost[3]!, ctx);
      if (!amount || ctx.targets.length !== i + 1) return null;
      const filter: TargetSpec = { kind: t.kind, bound: { key, at: "most", amount }, text: `${atMost[2]} less than or equal to ${atMost[3]}` };
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter }, effects: fx });
      continue;
    }
    // Dreamdew Entrancer: "Tap up to one target creature and put three stun counters on it. If you control that creature,
    // draw two cards.": the target as it is now, still legal (none chosen: false).
    const ifYours = /^If you control (?:that creature|that permanent), (.+)$/.exec(s);
    if (ifYours) {
      const i = ctx.lastObjectTarget;
      const t = i !== undefined ? ctx.targets[i] : undefined;
      const prev = effects[effects.length - 1];
      if (i === undefined || t?.kind !== "object" || t.many || t.controller || !prev || !mentionsTarget(prev, i)) return null;
      const before = ctx.targets.length;
      const fx = parseOne(capital(ifYours[1]!), ctx);
      if (!fx || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter: { kind: "object", types: [], notTypes: [], notColors: [], controller: "you", text: "you control" } }, effects: fx });
      continue;
    }
    // "Counter target spell if it's blue", "Destroy target permanent if it's blue" (Pyroblast): any spell or permanent can
    // be targeted, and its color is checked as it resolves (rulings).
    const ifColor = /^(.+) if it's (white|blue|black|red|green)$/.exec(s);
    // Ring of Valkas: "put a +1/+1 counter on equipped creature if it's red": the creature it's attached to, as it resolves.
    if (ifColor && /^put an? \S+ counter on equipped creature$/i.test(ifColor[1]!)) {
      const fx = parseOne(ifColor[1]!, ctx);
      if (!fx || fx.length !== 1 || fx[0]!.type !== "counters" || fx[0]!.what.ref !== "attached") return null;
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], colors: [COLOR_WORDS[ifColor[2]!]!], text: `${ifColor[2]} creature` } } }, effects: fx });
      continue;
    }
    if (ifColor) {
      const fx = parseOne(ifColor[1]!, ctx);
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      if (!fx || i !== curTargets || !t || (t.kind !== "spell" && t.kind !== "object") || t.optional || t.many || t.divided || !fx.every((e) => mentionsTarget(e, i))) return null;
      const filter: TargetSpec = { kind: t.kind, types: [], notTypes: [], notColors: [], colors: [COLOR_WORDS[ifColor[2]!]!], text: ifColor[2]! };
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter }, effects: fx });
      continue;
    }
    // Parting Gust: "Exile target nontoken creature. If the gift wasn't promised, return that card to the battlefield under
    // its owner's control with a +1/+1 counter on it at the beginning of the next end step": with the gift promised, an
    // exile; without, a blink that comes back with a delayed trigger (CR 702.174j, 603.7).
    // Shirei, Shizo's Caretaker: "you may return that card to the battlefield at the beginning of the next end step if ~ is
    // still on the battlefield": a delayed trigger about the card in the graveyard now (CR 603.7, 400.7), done then only
    // while ~ is still the object whose ability made it (rulings), the choice made as it resolves.
    if (ctx.subjectLeft && !ctx.spell && /^[Yy]ou may return that card to the battlefield at the beginning of the next end step if ~ is still on the battlefield$/.test(s)) {
      effects.push({ type: "putOntoBattlefield", what: { ref: "subjectCard" }, atNextEndStep: true, ifSourceHere: true, mayThen: true });
      continue;
    }
    const giftBack = ctx.spell ? /^If the gift wasn't promised, (return (?:it|that card) to the battlefield under its owner's control(?: with an? [^ ]+ counter on it)? at the beginning of the next end step)$/.exec(s) : null;
    const giftExile = giftBack && effects[effects.length - 1];
    if (giftBack && giftExile && giftExile.type === "exile" && giftExile.what.ref === "target" && !giftExile.until && !giftExile.linked) {
      const sub = parseBody(`Exile target creature. ${giftBack[1]!.charAt(0).toUpperCase()}${giftBack[1]!.slice(1)}.`, { spell: true });
      const blink = sub?.effects.length === 1 && sub.effects[0]!.type === "flicker" ? sub.effects[0] : null;
      if (!blink || blink.type !== "flicker") return null;
      effects[effects.length - 1] = { type: "if", cond: { kind: "gift" }, effects: [giftExile], otherwise: [{ ...blink, what: giftExile.what }] };
      continue;
    }
    // "~ deals 2 damage to it. If a Dinosaur is dealt damage this way, ~ gets +2/+0 until end of turn" (Marauding Raptor):
    // only if damage was dealt (none if it was prevented), to a permanent that is one now.
    // Play with Fire: "If a player is dealt damage this way, scry 1".
    const playerDealt = /^If a player is dealt damage this way, (.+)$/.exec(s);
    // Not about that player ("they can't gain life ...", Screaming Nemesis: sentences/basics.ts).
    if (playerDealt && effects.some((e) => e.type === "damage") && !/\b(?:they|them|their|that player)\b/.test(playerDealt[1]!)) {
      const before = ctx.targets.length;
      const fx = parseOne(capital(playerDealt[1]!), ctx);
      if (!fx || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "playerDamagedThisWay" }, effects: fx });
      continue;
    }
    // Mishra's War Machine, Minion of Leshrac: "If ~ deals damage to you this way, tap it": only if the damage wasn't all
    // prevented (rulings), after "~ deals 3 damage to you unless you discard a card".
    const unlessDmg = effects[effects.length - 1];
    if (/^If (?:it|~) deals damage to you this way, tap (?:it|~)$/.test(s) && unlessDmg?.type === "may" && unlessDmg.otherwise?.length === 1 && unlessDmg.otherwise[0]!.type === "damage") {
      effects.push({ type: "if", cond: { kind: "playerDamagedThisWay" }, effects: [{ type: "tap", what: { ref: "self" } }] });
      continue;
    }
    const dealtIs = /^If an? ([A-Z][a-z]+|creature) is dealt damage this way, (.+)$/.exec(s);
    if (dealtIs && effects.some((e) => e.type === "damage")) {
      const filter = parseTargetPhrase(dealtIs[1]!);
      const before = ctx.targets.length;
      const fx = filter?.kind === "object" ? parseOne(dealtIs[2]!, ctx) : null;
      if (!fx || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "damagedThisWayIs", filter: filter! }, effects: fx });
      continue;
    }
    const howCast = parseHowCast(s, ctx);
    // Once and Future's adamant, "instead return those cards to your hand and exile ~": done instead of all the spell's
    // instructions before it, so each target card goes to your hand whichever zone it was chosen for (CR 601.2c).
    if (howCast && !howCast.not && ctx.spell && /^instead return those cards to your hand and exile ~$/.test(howCast.text)) {
      const last = effects[effects.length - 1];
      const moves = effects.slice(0, -1);
      const each = moves.map((e, i) => (e.type === "bounce" || e.type === "putInLibrary") && e.what.ref === "target" && e.what.index === i && !e.what.n);
      if (last?.type !== "exileSpell" || !moves.length || each.includes(false) || ctx.targets.length !== moves.length || ctx.targets.some((x) => x.kind !== "card" || x.owner !== "you")) return null;
      effects.splice(0, effects.length, { type: "if", cond: howCast.cond, effects: [...moves.map((_, i): Effect => ({ type: "bounce", what: { ref: "target", index: i } })), { type: "exileSpell" }], otherwise: effects.slice() });
      continue;
    }
    // See the Truth: "Look at the top three cards of your library. Put one of those cards into your hand and the rest on the
    // bottom ... If ~ was cast from anywhere other than your hand, put each of those cards into your hand instead."
    const seeDig = effects[effects.length - 1];
    if (howCast && !howCast.not && howCast.text === "put each of those cards into your hand instead" && seeDig?.type === "dig" && seeDig.into === "hand" && !seeDig.filter && !seeDig.upTo && typeof seeDig.n === "number" && effects.length - 1 === prevStart) {
      effects[effects.length - 1] = { type: "if", cond: howCast.cond, effects: [{ ...seeDig, count: seeDig.n }], otherwise: [seeDig] };
      continue;
    }
    // "Return target creature card from your graveyard to the battlefield. If {G} was spent to cast ~, that creature enters
    // with an additional +1/+1 counter on it" (Vigor Mortis): it enters with it (CR 614.1c), so the return itself differs.
    const more = howCast && !howCast.not && /^(?:that creature|it) enters with an additional (\+1\/\+1|-1\/-1) counter on it$/i.exec(howCast.text);
    const back = effects[effects.length - 1];
    if (more && howCast && back?.type === "putOntoBattlefield" && back.what.ref === "target" && !back.what.n && effects.length - 1 === prevStart) {
      const k = counterKind(more[1]!);
      effects[effects.length - 1] = { type: "if", cond: howCast.cond, effects: [{ ...back, counters: { ...back.counters, [k]: (back.counters?.[k] ?? 0) + 1 } }], otherwise: [back] };
      continue;
    }
    // A spell's targets are chosen whatever was spent (Cankerous Thirst rulings), so they aren't gated.
    if (howCast?.ungated && (howCast.cond.kind !== "castInMain" || /\btarget\b/.test(howCast.text)) && !howCast.not && !howCast.ofTarget && /^you may /i.test(howCast.text) && !/ instead$/.test(howCast.text)) {
      mayGate = { cond: howCast.cond, start: effects.length };
      s = `Y${howCast.text.slice(1)}`;
    } else if (howCast) {
      // "If {B} was spent to cast ~, that spell's controller mills X cards, where X is the spell's mana value" (Induce
      // Paranoia): X is defined by the text (CR 107.3c), read after the rest.
      const whereIn = /^(.+), where X is (.+)$/.exec(howCast.text);
      ctx.whereX = !!whereIn;
      const fx = parseKicked(whereIn ? whereIn[1]! : howCast.text, effects.slice(prevStart), ctx, true);
      ctx.whereX = false;
      if (fx && whereIn) {
        const def = parseCount(whereIn[2]!, ctx);
        if (!def || ctx.targets.slice(curTargets).some((t) => t.xRange || t.divided)) return null;
        fx.effects = replaceX(fx.effects, def);
      }
      // "If ~ wasn't cast from your hand, draw two cards instead" (Twinned Vision): the other way round, with no new targets.
      // An activated ability's targets are all chosen as it's activated, before its costs are paid (CR 602.2b, 601.2c,
      // 601.2h): "If the discarded card was a land card, ~ deals 2 damage to target player" (Land's Edge) targets whatever
      // is discarded, and only the damage depends on it.
      const activatedGate = !!ctx.activated && !ctx.spell && !howCast.not && !!fx && !fx.instead && !howCast.ofTarget && ctx.targets.length !== curTargets;
      if (!fx || (howCast.not && fx.instead && ctx.targets.length !== curTargets) || (howCast.noTargets && ctx.targets.length !== curTargets && !activatedGate)) return null;
      if (activatedGate) {
        // (the targets aren't gated)
      } else if (howCast.ofTarget) {
        // "Counter target spell if no mana was spent to cast it": the one target spell this sentence chose.
        const spell = ctx.targets.length === curTargets + 1 && ctx.targets[curTargets]!.kind === "spell";
        if (!spell || fx.instead || howCast.cond.kind !== "spent") return null;
        howCast.cond.target = curTargets;
      } else if (!howCast.ungated && !gateNewTargets(ctx, howCast.cond, howCast.not, fx, effects.slice(prevStart), prevTargets, curTargets)) return null;
      if (howCast.not && fx.instead) effects.splice(prevStart, effects.length - prevStart, { type: "if", cond: howCast.cond, effects: effects.slice(prevStart), otherwise: fx.effects });
      else if (howCast.not) effects.push({ type: "if", cond: howCast.cond, effects: [], otherwise: fx.effects });
      else if (fx.instead) effects.splice(prevStart, effects.length - prevStart, { type: "if", cond: howCast.cond, effects: fx.effects, otherwise: effects.slice(prevStart) });
      else effects.push({ type: "if", cond: howCast.cond, effects: fx.effects });
      continue;
    }
    // "If this spell was foretold, scry 2", "... create X of those tokens instead" (CR 702.143c).
    const foretold = ctx.spell ? /^If (?:this spell|~) was foretold, (.+)$/.exec(s) : null;
    if (foretold) {
      const fx = parseKicked(foretold[1]!, effects.slice(prevStart), ctx);
      if (!fx) return null;
      const cond: SpellCondition = { kind: "foretold" };
      if (fx.instead) effects.splice(prevStart, effects.length - prevStart, { type: "if", cond, effects: fx.effects, otherwise: effects.slice(prevStart) });
      else effects.push({ type: "if", cond, effects: fx.effects });
      continue;
    }
    // Doubling a creature's power (CR 701.10b-c): it gets +X/+0, where X is its power as this resolves (for a negative
    // power, -X/-0 for X below 0 comes to the same). Its power and toughness: +X/+Y, Y its toughness (Grunn, Dragonclaw
    // Strike), each signed on its own.
    // Exponential Growth: "Until end of turn, double target creature's power X times": one doubling after another, each
    // +X/+0 for its power then (CR 701.10b), X the number announced (CR 107.3a).
    if (/^Until end of turn, double target creature's power X times$/.test(s) && ctx.spell) {
      const index = ctx.targets.length;
      ctx.targets.push({ kind: "object", types: ["Creature"], text: "target creature" });
      const double: Effect = { type: "continuous", what: { ref: "target", index }, mods: [{ kind: "modifyPT", power: { count: { kind: "power", of: { ref: "target", index } }, signed: true }, toughness: 0 }], duration: "endOfTurn" };
      effects.push({ type: "repeat", n: { count: { kind: "x" } }, effects: [double] });
      continue;
    }
    const double = /^[Dd]ouble (?:(its|target creature's) power( and toughness)?|the power( and toughness)? of (target creature(?: you control)?)) until end of turn$/.exec(s);
    const doubleBoth = !!double && !!(double[2] ?? double[3]);
    if (double) s = `${double[1] === "its" ? "It" : double[4] ? double[4].charAt(0).toUpperCase() + double[4].slice(1) : "Target creature"} gets +X/+0 until end of turn, where X is its power`;
    // Astarion's Thirst: "Exile target creature. Put X +1/+1 counters on a commander creature you control, where X is the
    // power of the creature exiled this way": that target's power as it last existed (CR 608.2h), if it was exiled. A
    // commander exiled this way is still in exile as this resolves (it can go to the command zone only as a state-based
    // action afterwards, CR 903.9a).
    // Ruinous Intrusion: "Exile target artifact or enchantment. Put X +1/+1 counters on target creature you control, where
    // X is the mana value of the permanent exiled this way": the same, with its mana value.
    const powerExiled = /^(.+), where X is the (power of the creature|mana value of the permanent) exiled this way$/.exec(s);
    if (powerExiled) {
      const prev = effects[effects.length - 1];
      const mv = powerExiled[2] === "mana value of the permanent";
      if (prev?.type !== "exile" || prev.what.ref !== "target" || prev.what.n || prev.until || (mv ? ctx.targets[prev.what.index]?.kind !== "object" || ctx.targets[prev.what.index]!.many : ctx.targets[prev.what.index]?.types?.join() !== "Creature")) return null;
      const parsed = parseOne(powerExiled[1]!, ctx);
      // X stands for that power (amounts.ts reads a target that just left as it last existed).
      const power = { count: { kind: mv ? "manaValue" : "power", of: { ref: "target", index: prev.what.index } } };
      let xs = 0;
      const subst = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(subst);
        if (!v || typeof v !== "object") return v;
        const c = (v as { count?: { kind?: string } }).count;
        if (c?.kind === "x" && Object.keys(v).length === 1 && Object.keys(c).length === 1) return xs++, power;
        return Object.fromEntries(Object.entries(v).map(([k, w]) => [k, subst(w)]));
      };
      const inner = parsed && (subst(parsed) as Effect[]);
      if (!inner || xs !== 1) return null;
      effects.push({ type: "if", cond: { kind: "targetExiled", index: prev.what.index }, effects: inner });
      continue;
    }
    // "..., where X is the number of creatures you control": X is defined by the text (CR 107.3c).
    // It's read after the rest of the sentence, which may name what it counts ("that player's hand").
    // Not one inside a quoted ability ('You get an emblem with "..., where X is ..."'), which is that ability's own.
    // Skyclave Apparition: "the exiled card's owner creates an X/X blue Illusion creature token, where X is the mana value
    // of the exiled card": the card its own exile ability took (linked in compile.ts, CR 607.2a).
    const skyclave = ctx.selfCard ? /^[Tt]he exiled card's owner creates an X\/X (.+?) creature token, where X is the mana value of the exiled card$/.exec(s) : null;
    if (skyclave) {
      const token = parseToken(0, 0, skyclave[1]!);
      if (!token) return null;
      effects.push({ type: "linkedExileToken", token });
      continue;
    }
    const where = /^(.+), where X is ([^"]+)$/.exec(s);
    if (where) s = where[1]!;
    // "Where X is ~'s power as this ability resolves" (Maelstrom Muse): when an X is counted anyway (CR 608.2h).
    if (where) where[2] = where[2]!.replace(/ as this ability resolves$/, "");
    ctx.whereX = !!where;
    const before = effects.length;
    const targetsBefore = ctx.targets.length;
    const defineX = () => {
      if (!where) return true;
      // "X damage divided as you choose ..., where X is the number of Mountains you control as you cast this spell": the
      // amount is worked out as the targets are chosen, while it's being cast, anyway (TargetSpec.divided.amount).
      const asCast = / as you (?:cast ~|cast this spell|activate this ability)$/.exec(where[2]!);
      const added = effects.slice(before);
      // "Up to X target creatures ..., where X is the number of Bobbleheads you control as you activate this ability"
      // (Endurance Bobblehead): how many targets, worked out as they're chosen (CR 601.2c), which is as it's activated.
      const manyAt = ctx.targets.findIndex((t, k) => k >= targetsBefore && t.manyWhere);
      if (manyAt >= 0) {
        const n = parseCount(asCast ? where[2]!.slice(0, asCast.index) : where[2]!, ctx);
        // X counts the targets only: an X in what they get is worked out as it resolves, not as you activate.
        if (!n || !boundAtTargeting(n) || (asCast && JSON.stringify(added).includes('"x"'))) return false;
        const { manyWhere: _, ...t } = ctx.targets[manyAt]!;
        ctx.targets[manyAt] = { ...t, manyCount: n };
        if (asCast) return true;
      }
      const dividedOnly = added.length === 1 && added[0]!.type === "damage" && !!added[0]!.divided && ctx.targets.slice(targetsBefore).some((t) => t.divided?.amount);
      // Otherwise this spell's own amount, counted once as it's cast (Count asCast; rulings on Lifestream's Blessing).
      const castOnce = asCast && !dividedOnly && ctx.spell && /^ as you cast (?:~|this spell)$/.test(asCast[0]);
      if (asCast && !dividedOnly && !castOnce) return false;
      // "~ deals X damage ..., where X is the number of age counters on it" (Magmatic Core): "it" is ~.
      // Runadi, Behemoth Caller: "that creature enters with X additional +1/+1 counters on it, where X is its mana value
      // minus 4": "its" is the creature spell the cast trigger is about.
      const what = /^~ /.test(s) ? where[2]!.replace(/ counters on it$/, " counters on ~") : ctx.castSpell && /^[Tt]hat creature enters with X additional /.test(s) ? where[2]!.replace(/^its /, "that spell's ") : where[2]!;
      // "Creatures you controlled as you cast this spell": those you control then.
      const counted = parseCount(asCast ? what.slice(0, asCast.index).replace(/ you controlled$/, " you control") : what, ctx);
      if (!counted) return false;
      const def0 = castOnce ? { ...counted, count: { kind: "asCast" as const, of: counted.count } } : counted;
      const def = double ? { ...def0, signed: true as const } : def0;
      let replaced = replaceX(added, def);
      if (doubleBoth) {
        const c = def.count;
        const e0 = replaced[0];
        if (replaced.length !== 1 || e0?.type !== "continuous" || e0.mods.length !== 1 || e0.mods[0]!.kind !== "modifyPT" || c.kind !== "power") return false;
        replaced = [{ ...e0, mods: [{ ...e0.mods[0]!, toughness: { count: { ...c, kind: "toughness" }, signed: true } }] }];
      }
      effects.splice(before, effects.length - before, ...replaced);
      if (castOnce) castX = { def, from: effects.length };
      for (let k = targetsBefore; k < ctx.targets.length; k++) {
        const t = ctx.targets[k]!;
        // "Counter target spell with mana value X or less, where X is the number of Faeries you control": not the X
        // announced but an amount compared as the target is chosen and again as it resolves (TargetSpec.bound; CR 601.2c,
        // 608.2b; rulings on Spellstutter Sprite). Only an amount that can be worked out then.
        if (t.xRange) {
          if (!boundAtTargeting(def)) return false;
          const { xRange, ...rest } = t;
          ctx.targets[k] = { ...rest, bound: { key: xRange.key, at: xRange.at, amount: def } };
          continue;
        }
        if (t.divided?.amount) ctx.targets[k] = { ...t, divided: { ...t.divided, amount: replaceX(t.divided.amount, def) } };
        // "Any number of target creature cards with total mana value X or less ..., where X is the result" (Ancient Brass
        // Dragon's reflexive trigger after a roll): the result, known as its targets are chosen (CR 603.12).
        if (t.total?.x) {
          if (def.count.kind !== "rollResult" || def.times !== undefined || def.plus !== undefined || def.signed) return false;
          ctx.targets[k] = { ...t, total: { key: t.total.key, rolled: true } };
        }
      }
      return true;
    };
    // Entrapment Maneuver: "Target player sacrifices an attacking creature of their choice. You create X 1/1 white Soldier
    // creature tokens, where X is that creature's toughness": the creature sacrificed, as it last existed (CR 608.2h); none
    // sacrificed, X is 0.
    const lastPick = effects[effects.length - 1];
    if (where && lastPick?.type === "pick" && lastPick.action === "sacrifice" && lastPick.n === 1 && !ctx.sacrificedIt && /^You create X /.test(s) && /^that creature's (?:power|toughness|mana value)$/.test(where[2]!) && !/\bthat creature\b/.test(s)) {
      ctx.sacrificedIt = true;
      const inner = parseOne(s, ctx);
      if (inner) effects.push(...inner);
      const ok = !!inner && defineX();
      delete ctx.sacrificedIt;
      if (!ok) return null;
      // Only if one was sacrificed (X would be 0 otherwise anyway).
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: effects.splice(before) });
      continue;
    }
    // "You may discard a card. If you do, draw a card." (CR 608.2c): what follows depends on whether it was
    // done. Only for things the engine can tell weren't possible (discarding with no cards in hand, ...).
    // "Exile target creature. Return that card to the battlefield under its owner's control at the beginning of
    // the next end step": the exile becomes a blink that comes back with a delayed trigger (CR 603.7).
    // "Exile any number of target creatures you control. Return those cards ..." (Eerie Interlude), "Exile all creatures. At
    // the beginning of the next end step, return those cards to the battlefield under their owners' control" (Planar
    // Guide), "... return it to the battlefield tapped ..." (Mystifying Maze), "... with a flying counter on it" (Salvation
    // Swan); after "you may exile ~ target creature", "If you do, return that card ..." (Astral Slide).
    // Legion's Initiative: "Exile all creatures you control. At the beginning of the next combat, return those cards to the
    // battlefield under their owner's control and those creatures gain haste until end of turn." The next beginning of
    // combat step, whoever's turn it is (rulings: it happens even if no one attacks), haste for that turn.
    if (/^At the beginning of the next combat, return those cards to the battlefield under their owners?'s? control and those creatures gain haste until end of turn$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exile" || prev.what.ref !== "each" || Object.keys(prev).length !== 2) return null;
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under: "owner", at: "nextBeginCombat", haste: "endOfTurn" };
      continue;
    }
    const BACK = "(?:it|that card|the exiled card|those cards|the exiled cards|them|each of them|~)";
    const UNDER = "(its owner's|their owner's|their owners'|your)";
    const laterRe = new RegExp(`^(?:If you do, )?(?:At the beginning of the next end step, return ${BACK} to the battlefield( tapped)? under ${UNDER} control|[Rr]eturn ${BACK} to the battlefield( tapped)? under ${UNDER} control(?: with an? ${COUNTER} counter on it)? at the beginning of (the|that player's) next end step)(?: with an? ${COUNTER} counter on it)?$`);
    const later = laterRe.exec(s);
    // Gift of Immortality: "When enchanted creature dies, return that card to the battlefield under its owner's control.
    // Return ~ to the battlefield attached to that creature at the beginning of the next end step": a delayed trigger
    // about the permanent the card became, and the Aura's card in the graveyard (rulings).
    const prevPut = effects[effects.length - 1];
    // Ghoulish Impetus: "When enchanted creature dies, return this card to the battlefield at the beginning of the next end
    // step": the Aura's card, if it's still in the graveyard then, under the delayed trigger's controller's control (CR
    // 110.2a, 603.7), enchanting what that player chooses as it enters (303.4f).
    if (ctx.auraCard && /^[Rr]eturn ~ to the battlefield at the beginning of the next end step$/.test(s) && si === 0) {
      effects.push({ type: "delayed", when: "nextEndStep", each: "selfCard", of: { ref: "selfCard", moved: true }, effects: [{ type: "putOntoBattlefield", what: { ref: "selfCard" } }], text: "return ~ to the battlefield" });
      continue;
    }
    if (ctx.auraCard && /^Return ~ to the battlefield attached to that creature at the beginning of the next end step$/.test(s) && prevPut?.type === "putOntoBattlefield" && prevPut.what.ref === "subjectCard" && si === 1) {
      effects.push({ type: "delayed", when: "nextEndStep", each: "returned", effects: [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, attachToSubject: true }], text: "return ~ to the battlefield attached to that creature" });
      continue;
    }
    // Gilraen, Dúnedain Protector: "Exile another target creature you control. You may return that card to the battlefield
    // under its owner's control. If you don't, at the beginning of the next end step, return that card to the battlefield
    // under its owner's control with a vigilance counter and a lifelink counter on it." The card exiled is held; it comes
    // back now, or by a delayed trigger with those counters (CR 603.7, 122.1b). A token stays gone (CR 111.7).
    const mayBack = /^You may return that card to the battlefield under its owner's control$/.test(s)
      ? new RegExp(`^If you don't, at the beginning of the next end step, return that card to the battlefield under its owner's control with an? ${COUNTER} counter and an? ${COUNTER} counter on it\\.?$`).exec(sentences[si + 1] ?? "")
      : null;
    if (mayBack) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exile" || Object.keys(prev).length !== 2 || prev.what.ref !== "target" || (prev.what.n !== undefined && prev.what.n !== 1)) return null;
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under: "owner", hold: true };
      effects.push({ type: "may", effects: [{ type: "returnHeld", under: "owner" }], otherwise: [{ type: "returnHeld", under: "owner", at: "nextEndStep", counters: [counterKind(mayBack[1]!), counterKind(mayBack[2]!)] }], text: "return that card to the battlefield under its owner's control" });
      si++;
      continue;
    }
    // "Exile this Saga, then return it to the battlefield transformed under your control": its back face up (CR 712.14a).
    // "Exile this Saga, then return it to the battlefield (front face up)" (The Great Work): under the control of the
    // player who puts it there (CR 110.2a).
    // "... with a +1/+1 counter on it" (Planar Incision): it enters with it (CR 122.6).
    // "... then return it to the battlefield tapped under its owner's control" (Eldrazi Confluence): it enters tapped.
    const now = /^(?:[Tt]hen )?[Rr]eturn (?:it|that card|them|those cards) to the battlefield( transformed| tapped)?(?: under (its owner's|their owner's|their owners'|your) control)?( with an? \+1\/\+1 counter on it)?$/.exec(s);
    if (now && effects[effects.length - 1]?.type === "exile") {
      const prev = effects[effects.length - 1] as Extract<Effect, { type: "exile" }>;
      const transformed = now[1] === " transformed";
      if (prev.until || prev.linked || isGroup(prev.what) || (transformed && prev.what.ref !== "self") || (!now[2] && prev.what.ref !== "self")) return null;
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under: !now[2] || now[2] === "your" ? "you" : "owner", ...(transformed ? { transformed: true as const } : {}), ...(now[1] === " tapped" ? { tapped: true as const } : {}), ...(now[3] ? { counter: "+1/+1" as const } : {}) };
      continue;
    }
    // Which exile it returns: the last exile in this ability ("Exile X target creatures, then investigate X times. Return the
    // exiled cards ...", Disorder in the Court), or after "If you do," the exile that may be done or that had up to one
    // target (Roll-Roll-Roll-Roll). With none, it's something else ("return that card" after a dies trigger).
    const laterAt = ((): { into: Effect[]; at: number } | null => {
      if (!later) return null;
      const last = effects[effects.length - 1];
      if (/^If you do, /.test(s)) {
        if (last?.type === "may" && !last.pay && last.effects.length === 1 && last.effects[0]!.type === "exile") return { into: last.effects, at: 0 };
        return last?.type === "exile" && last.what.ref === "target" ? { into: effects, at: effects.length - 1 } : null;
      }
      // "Then investigate X times" is a sentence of its own by now: tokens made between don't change which exile it is.
      for (let i = effects.length - 1; i >= 0 && (i >= prevStart || effects.slice(i + 1).every((e) => e.type === "createToken")); i--) if (effects[i]!.type === "exile") return { into: effects, at: i };
      return null;
    })();
    if (later && laterAt) {
      const ex = laterAt.into[laterAt.at] as Extract<Effect, { type: "exile" }>;
      if (ex.until || ex.linked || (ex.what.ref === "target" && (ex.what.sameName || ex.what.sharesColor)) || (ex.what.ref !== "target" && ex.what.ref !== "each" && ex.what.ref !== "self")) return null;
      const under = (later[2] ?? later[4]) === "your" ? "you" : "owner";
      const counter = later[5] ?? later[7];
      // "Return that card to the battlefield under its owner's control at the beginning of that player's next end step"
      // (The Eternal Wanderer): that player is its owner; one card only.
      const owners = later[6] === "that player's";
      if (owners && (later[4] !== "its owner's" || ex.what.ref !== "target" || (ex.what.n !== undefined && ex.what.n !== 1))) return null;
      // Phelia: "If it entered under your control, put a +1/+1 counter on ~", part of the delayed trigger (CR 603.7).
      const ifYours = !ctx.spell && under === "owner" && laterAt.into === effects ? new RegExp(`^If it entered under your control, put an? ${COUNTER} counter on ~$`).exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
      // Teferi's Time Twist: "If it enters as a creature, it enters with an additional +1/+1 counter on it", judged as it
      // would exist on the battlefield (rulings, CR 614.12). One card only.
      const ifCreature = !counter && !ifYours && ex.what.ref === "target" && !ex.what.n && /^If it enters as a creature, it enters with an additional \+1\/\+1 counter on it\.?$/.test(sentences[si + 1] ?? "");
      if (ifCreature) si++;
      // Semester's End: "Each of them enters with an additional +1/+1 counter on it if it's a creature and an additional
      // loyalty counter on it if it's a planeswalker", judged the same way.
      const eachIf = !counter && !ifYours && !ifCreature && /^Each of them enters with an additional \+1\/\+1 counter on it if it's a creature and an additional loyalty counter on it if it's a planeswalker\.?$/.test(sentences[si + 1] ?? "");
      if (eachIf) si++;
      laterAt.into[laterAt.at] = { type: "flicker", what: ex.what, under, at: owners ? "ownersNextEndStep" : "nextEndStep", ...(counter ? { counter: counterKind(counter) } : {}), ...(ifCreature || eachIf ? { counter: "+1/+1" as const, counterIfCreature: true as const } : {}), ...(eachIf ? { loyaltyIfPlaneswalker: true as const } : {}), ...(later[1] || later[3] ? { tapped: true as const } : {}), ...(ifYours ? { selfCounterIfYours: counterKind(ifYours[1]!) } : {}) };
      if (ifYours) si++;
      continue;
    }
    // "Return target creature card from your graveyard to the battlefield. That creature gains haste until end of turn.
    // Exile it at the beginning of the next end step." (Dawn of the Dead, Corpse Dance): about the permanent that card
    // became (CR 400.7), so part of putting it there.
    // "You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice the creature at
    // the beginning of the next end step." (Sneak Attack), "... Return that creature to your hand at the beginning of the
    // next end step." (Ilharg) likewise.
    // "Prevent all damage that would be dealt to those permanents this turn" (Mutational Advantage): the ones the effect just
    // before it affects, as they were when it resolved (CR 611.2c), the same objects.
    // Recommission: "Return target artifact or creature card ... to the battlefield. If a creature enters this way, it enters
    // with an additional +1/+1 counter on it": judged as it would exist on the battlefield (CR 614.12), part of how it enters.
    // What Must Be Done: "It enters with two additional +1/+1 counters on it if it's a creature", the same.
    const ifCreature = /^If a creature enters this way, it enters with an additional \+1\/\+1 counter on it$/.test(s) ? 1 : /^It enters with (two|three) additional \+1\/\+1 counters on it if it's a creature$/.exec(s)?.[1];
    if (ifCreature) {
      const last = effects[effects.length - 1];
      if (last?.type !== "putOntoBattlefield" || last.what.ref !== "target" || last.counters || last.countersFromLast || last.faceDown || last.atNextEndStep) return null;
      last.counters = { "+1/+1": ifCreature === 1 ? 1 : ifCreature === "two" ? 2 : 3 };
      last.countersIfCreature = true;
      continue;
    }
    const those = /^(Prevent all (?:combat )?damage that would be dealt (?:to and dealt by|to|by)) those (?:permanents|creatures) this turn$/.exec(s);
    if (those) {
      const last = effects[effects.length - 1];
      const p = parsePreventAll(`${those[1]} them`);
      if (last?.type !== "continuous" || last.what.ref !== "each" || last.duration !== "endOfTurn" || !p) return null;
      effects.push({ type: "continuous", what: last.what, mods: [p.mod], duration: "endOfTurn" });
      continue;
    }
    // Zara, Renegade Recruiter: "Look at defending player's hand. You may put a creature card from it onto the battlefield
    // under your control tapped and attacking that player or a planeswalker they control." (CR 508.4).
    const fromTheirHand = /^You may put an? ([^.]+? card) from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control$/.exec(s);
    if (fromTheirHand) {
      const last = effects[effects.length - 1];
      const filter = parseSearchFilter(fromTheirHand[1]!);
      if (last?.type !== "lookAtHand" || last.who.ref !== "eventPlayer" || last.atRandom || !filter || !filter.types?.includes("Creature")) return null;
      effects.push({ type: "putFromHand", fromHandOf: last.who, filter, may: true, tapped: true, attacking: true });
      continue;
    }
    // Rally the Ancestors: "Exile those creatures at the beginning of your next upkeep" after returning them all.
    // Lukka, Wayward Bonder: "Return target creature card ... to the battlefield. It gains haste. Exile it at the beginning of
    // your next upkeep.": a delayed trigger for the permanent it became (CR 603.7, 400.7).
    if (s === "Exile it at the beginning of your next upkeep" && last?.type === "putOntoBattlefield" && last.what.ref === "target" && !last.what.n && last.haste === "game" && !last.atEndStep && !last.exileAtYourNextUpkeep) {
      last.exileAtYourNextUpkeep = true;
      continue;
    }
    if (s === "Exile those creatures at the beginning of your next upkeep" && last?.type === "returnAllFromGraveyard" && !last.toHand && !last.owners && !last.exileAtYourNextUpkeep && last.who.ref === "you") {
      last.exileAtYourNextUpkeep = true;
      continue;
    }
    const haste = /^(?:That creature|It) gains haste( until end of turn)?$/.exec(s);
    const atEnd = /^(Exile|Sacrifice) (?:it|that creature|the creature) at the beginning of the next end step$/.exec(s) ?? /^(Return) (?:it|that creature) to (?:your|its owner's) hand at the beginning of the next end step$/.exec(s) ?? (/^Return it to the command zone at the beginning of the next end step$/.test(s) ? ["", "Return to the command zone"] : null);
    if (haste || atEnd) {
      const last = effects[effects.length - 1];
      const put = last?.type === "may" && last.effects.length === 1 ? last.effects[0] : last;
      const fromHand = put?.type === "putFromHand" && !put.any ? put : undefined;
      if (fromHand && haste && !fromHand.haste && !fromHand.atEndStep) {
        fromHand.haste = haste[1] ? "endOfTurn" : "game";
        continue;
      }
      if (fromHand && atEnd && !fromHand.atEndStep) {
        fromHand.atEndStep = atEnd[1] === "Exile" ? "exile" : atEnd[1] === "Return" ? "hand" : "sacrifice";
        continue;
      }
      // Hellkite Courser: "It gains haste. Return it to the command zone at the beginning of the next end step."
      const cmd = put?.type === "commanderToBattlefield" ? put : undefined;
      if (cmd && haste && !cmd.haste && !cmd.atEndStep) {
        cmd.haste = haste[1] ? "endOfTurn" : "game";
        continue;
      }
      if (cmd && atEnd?.[1] === "Return to the command zone" && !cmd.atEndStep) {
        cmd.atEndStep = "command";
        continue;
      }
      const one = put?.type === "putOntoBattlefield" && ((put.what.ref === "target" && !put.what.n) || put.what.ref === "graveyardEnd") ? put : undefined;
      if (one && haste && !one.haste && !one.atEndStep) {
        one.haste = haste[1] ? "endOfTurn" : "game";
        continue;
      }
      if (one && atEnd && !one.atEndStep) {
        one.atEndStep = atEnd[1] === "Exile" ? "exile" : "sacrifice";
        continue;
      }
    }
    if (/^You may choose new targets for the cop(?:y|ies)$/i.test(s)) {
      const prev = effects[effects.length - 1];
      // "You may copy that spell. You may choose new targets for the copy." (Invocation of the Founders): the copy it may make.
      // "You may pay {2}. If you do, copy that ability" (Rings of Brighthearth): the copy paying makes.
      const copy = prev?.type === "nextCast" ? prev.effects[prev.effects.length - 1] : prev?.type === "may" && (!prev.pay || prev.effects[0]?.type === "copySpell") && prev.effects.length === 1 ? prev.effects[0] : prev;
      // "Copy it. If you've completed a dungeon, copy that spell twice instead. You may choose new targets for the
      // copies" (Tomb of Horrors Adventurer): the copies either way.
      const both = prev?.type === "if" ? [...prev.effects, ...(prev.otherwise ?? [])] : [];
      if (both.length === 2 && both.every((e) => e.type === "copySpell")) {
        for (const e of both) if (e.type === "copySpell") e.newTargets = true;
        continue;
      }
      // Wandering Archaic: "If they don't, you may copy that spell. You may choose new targets for the copy."; Firebender
      // Ascension: "Then if it has four or more quest counters on it, you may copy that ability. ..."
      // Alania: "You may have target opponent draw a card. If you do, copy that spell. You may choose new targets for the copy."
      const only = both.length === 1 && both[0]!.type === "may" && both[0]!.effects.length === 1 ? both[0]!.effects[0] : both.length === 1 && prev?.type === "if" && prev.cond.kind === "youDid" && !prev.otherwise ? both[0] : undefined;
      if (only?.type === "copySpell" && prev?.type === "if") {
        only.newTargets = true;
        continue;
      }
      // Narset's Reversal: "Copy target ..., then return it to its owner's hand. You may choose new targets for the copy."
      const before = prev?.type === "counterSpell" && prev.bounce ? effects[effects.length - 2] : undefined;
      if (before?.type === "copySpell") {
        before.newTargets = true;
        continue;
      }
      if (copy?.type !== "copySpell") return null;
      copy.newTargets = true;
      continue;
    }
    // "If it's a permanent spell, the copy gains haste and "At the beginning of the end step, sacrifice this permanent.""
    // (Nalfeshnee): an effect on the copy that goes on applying to the token it becomes (CR 400.7a, 608.3f). A copy of a
    // spell that isn't a permanent spell never becomes one, so the condition needs no check.
    const copyGains = /^If it's a permanent spell, the copy gains (.+)$/.exec(s);
    if (copyGains) {
      const prev = effects[effects.length - 1];
      const mods = parseGrants(copyGains[1]!);
      if (prev?.type !== "copySpell" || prev.spell !== "cause" || prev.gains || !mods?.every((m) => m.kind === "addKeywords" || m.kind === "addAbility")) return null;
      prev.gains = mods;
      continue;
    }
    // "Starting with you, each player may choose an artifact or enchantment you don't control" (Druid of Purification):
    // each one in turn order picks one or none, seeing the earlier picks (rulings); not targeted, and not a vote.
    // Sadistic Shell Game: "Starting with the next opponent in turn order, each player chooses a creature you don't control":
    // the same, but each one must choose one while there's one to choose (rulings: knowing the earlier choices).
    const eachMayChoose = /^[Ss]tarting with (you|the next opponent in turn order), each player (may choose|chooses) an? (.+)$/.exec(s);
    if (eachMayChoose) {
      if (ctx.vote) return null;
      const spec = parseTargetPhrase(eachMayChoose[3]!);
      if (spec?.kind !== "object" || spec.chosen || spec.counter) return null;
      const must = eachMayChoose[2] === "chooses";
      if (must !== (eachMayChoose[1] !== "you")) return null; // the templates printed so far
      effects.push({ type: "vote", among: { ...spec, text: eachMayChoose[3]! }, choose: true, ...(must ? { mustChoose: true as const, startNext: true as const } : {}), text: `choose ${/^[aeiou]/i.test(eachMayChoose[3]!) ? "an" : "a"} ${eachMayChoose[3]}` });
      ctx.vote = { among: true, choose: true };
      continue;
    }
    // "Starting with you, each player votes for death or taxes" (CR 701.38a): the words, or "a nonland permanent you don't
    // control", "an artifact, creature, or enchantment card in your graveyard" (objects, not targeted). One vote per ability.
    const vote = /^(?:[Ss]tarting with you, each player votes|Each player (secretly) votes) for (.+)$/.exec(s);
    if (vote) {
      if (ctx.vote) return null;
      const what = vote[2]!;
      const one = /^an? (.+)$/.exec(what);
      const secret = vote[1] ? { secret: true as const } : {};
      if (one) {
        const spec = parseTargetPhrase(one[1]!);
        if (!spec || (spec.kind !== "object" && spec.kind !== "card") || spec.chosen || spec.counter || (spec.kind === "card" && spec.owner !== "you")) return null;
        effects.push({ type: "vote", among: { ...spec, text: one[1]! }, ...secret, text: `vote for ${what}` });
        ctx.vote = { among: true };
      } else {
        const options = what.split(/, or |, | or /);
        if (options.length < 2 || new Set(options).size !== options.length || options.some((o) => !/^[A-Za-z][A-Za-z' ]*$/.test(o))) return null;
        effects.push({ type: "vote", options, ...secret, text: `vote for ${what}` });
        ctx.vote = { options };
      }
      continue;
    }
    // "Each opponent chooses fame or fortune" (Seize the Spotlight): words chosen in APNAP order (CR 101.4), not a vote.
    // "Each opponent chooses money, friends, or secrets" (Master of Ceremonies).
    // "Each opponent secretly chooses silence or snitch, then the choices are revealed" (Prisoner's Dilemma): all are
    // chosen before any is revealed.
    const choosesWord = /^[Ee]ach (opponent|player) (secretly )?chooses (?:([a-z]+), )?([a-z]+),? or ([a-z]+)(, then the choices are revealed)?$/.exec(s);
    if (choosesWord && !choosesWord[2] === !choosesWord[6]) {
      const options = choosesWord.slice(3, 6).filter((w): w is string => !!w);
      if (ctx.chooseWords || ctx.vote || new Set(options).size !== options.length) return null;
      effects.push({ type: "eachChooses", who: { ref: choosesWord[1] === "opponent" ? "eachOpponent" : "eachPlayer" }, options, text: `${choosesWord[2] ? "secretly " : ""}choose ${options.length > 2 ? `${options.slice(0, -1).join(", ")}, or ${options.at(-1)}` : options.join(" or ")}`, ...(choosesWord[2] ? { secret: true as const } : {}) });
      ctx.chooseWords = options;
      ctx.chooseWho = choosesWord[1] as "opponent" | "player";
      continue;
    }
    // "If each opponent chose silence, ~ deals 4 damage to each of them. If each opponent chose snitch, ... Otherwise, ~
    // deals 12 damage to each opponent who chose silence." (Prisoner's Dilemma): "each of them" are those players; a
    // second "If each ... chose" can only hold when the first doesn't, so it's the first's otherwise, and "Otherwise"
    // is when neither did.
    const allChose = ctx.chooseWords ? /^If each (opponent|player) chose ([a-z]+), (.+)$/.exec(s) : null;
    if (allChose) {
      if (allChose[1] !== ctx.chooseWho || !ctx.chooseWords!.includes(allChose[2]!)) return null;
      const inner = parseOne(capital(allChose[3]!.replace(/\beach of them\b/g, `each ${allChose[1]}`)), ctx);
      if (!inner) return null;
      const before = lastAllChose(effects[effects.length - 1]);
      const e: Effect = { type: "if", cond: { kind: "allChose", option: allChose[2]! }, effects: inner };
      if (before) before.otherwise = [e];
      else effects.push(e);
      continue;
    }
    const otherwiseChose = /^Otherwise, (.+)$/.exec(s);
    const choseChain = otherwiseChose ? lastAllChose(effects[effects.length - 1]) : undefined;
    if (otherwiseChose && choseChain) {
      const inner = parseOne(capital(otherwiseChose[1]!), ctx);
      if (!inner) return null;
      choseChain.otherwise = inner;
      continue;
    }
    // "For each player who chose fame, gain control of a creature that player controls until end of turn": a creature of
    // each of theirs, chosen as it resolves (not targeted); "those creatures" are then those.
    // Expropriate: "For each money vote, choose a permanent owned by the voter and gain control of it" (for good).
    const perVote = ctx.vote && !ctx.vote.among && !ctx.vote.choose ? /^For each ([a-z]+) vote, choose a permanent owned by the voter and gain control of it$/.exec(s) : null;
    if (perVote) {
      if (!ctx.vote!.options?.includes(perVote[1]!)) return null;
      effects.push({ type: "controlFromEach", votedFor: perVote[1]!, duration: "game" });
      continue;
    }
    // "For each player who chose money, you and that player each create a Treasure token" (Master of Ceremonies): you, once
    // for each of them, and each of them once.
    const youAndThey = /^For each player who chose ([a-z]+), you and that player each (create|draw) (.+)$/.exec(s);
    if (youAndThey) {
      if (!ctx.chooseWords?.includes(youAndThey[1]!)) return null;
      const yours = parseOne(`For each player who chose ${youAndThey[1]}, ${youAndThey[2]} ${youAndThey[3]}`, ctx);
      const theirs = parseOne(`Each opponent ${youAndThey[2]}s ${youAndThey[3]}`, ctx);
      const who = { ref: "choseWord" as const, option: youAndThey[1]! };
      if (!yours || theirs?.length !== 1) return null;
      const t = theirs[0]!;
      if (!((t.type === "createToken" || t.type === "draw") && t.who.ref === "eachOpponent")) return null;
      effects.push(...yours, { ...t, who });
      continue;
    }
    const fromEach = /^For each player who chose ([a-z]+), gain control of a creature that player controls until end of turn$/.exec(s);
    if (fromEach) {
      if (!ctx.chooseWords?.includes(fromEach[1]!) || ctx.fromEach) return null;
      effects.push({ type: "controlFromEach", chose: fromEach[1]!, duration: "endOfTurn" });
      ctx.fromEach = true;
      continue;
    }
    if (ctx.fromEach && s === "Untap those creatures and they gain haste until end of turn") {
      effects.push({ type: "untap", what: { ref: "created" } }, { type: "continuous", what: { ref: "created" }, mods: [{ kind: "addKeywords", keywords: ["Haste"] }], duration: "endOfTurn" });
      continue;
    }
    // "If death gets more votes, ...", "If taxes gets more votes or the vote is tied, ...": decided by that vote.
    const ifVote = /^If (.+?) gets more votes( or the vote is tied)?, (.+)$/.exec(s);
    if (ifVote) {
      if (!ctx.vote?.options?.includes(ifVote[1]!)) return null;
      const inner = parseOne(ifVote[3]!.charAt(0).toUpperCase() + ifVote[3]!.slice(1), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "voteWins", option: ifVote[1]!, ...(ifVote[2] ? { orTie: true as const } : {}) }, effects: inner });
      continue;
    }
    // Rise and Shine: "Target noncreature artifact you control becomes a 0/0 artifact creature. Put four +1/+1 counters on
    // each artifact that became a creature this way": the ones that effect changed (overloaded, each of them).
    const became = new RegExp(`^Put ${NUM} ${COUNTER} counters? on each (?:artifact|creature|permanent) that became a creature this way$`).exec(s);
    if (became) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "continuous" || !prev.mods.some((m) => m.kind === "addTypes" && m.types.includes("Creature"))) return null;
      effects.push({ type: "counters", what: { ref: "affected" }, counter: counterKind(became[2]!), n: num(became[1]!) });
      continue;
    }
    // "Destroy target creature. If that creature dies this way, ..." (Saw in Half, Kaervek's Purge): only if it was put
    // into a graveyard, not if it survived or a replacement effect moved it elsewhere (CR 700.4, rulings).
    const ifDies = /^If that creature dies this way, (.+)$/.exec(s);
    if (ifDies) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "destroy" || prev.what.ref !== "target") return null;
      // "The creature's power", "the creature's controller": that creature's.
      const then = ifDies[1]!.replace(/\bthe creature's\b/g, "that creature's");
      const inner = parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "destroyedThisWay", died: true }, effects: inner });
      continue;
    }
    // "You may destroy another target creature. If a creature is destroyed this way, you gain life equal to its toughness"
    // (Noxious Gearhulk): destroyed even if a replacement effect put it elsewhere, not if it survived (rulings); its
    // toughness as it last existed (CR 608.2h).
    // Demonic Junker: "If a creature you controlled was destroyed this way, ...": controlled as it was destroyed
    // (CR 608.2h).
    // Cosmic Horror: "destroy ~ unless you pay {3}{B}{B}{B}. If ~ is destroyed this way, it deals 7 damage to you": only
    // if it was destroyed, not regenerated or indestructible (rulings); the damage from it as it last existed (CR 608.2h).
    const selfDestroyed = /^If ~ is destroyed this way, it deals (\d+) damage to you$/.exec(s);
    const prevMay = effects[effects.length - 1];
    if (selfDestroyed && prevMay?.type === "may" && prevMay.otherwise?.length === 1 && prevMay.otherwise[0]!.type === "destroy" && prevMay.otherwise[0]!.what.ref === "self") {
      const inner = parseOne(`~ deals ${selfDestroyed[1]} damage to you`, ctx);
      if (!inner) return null;
      prevMay.otherwise.push({ type: "if", cond: { kind: "destroyedThisWay" }, effects: inner });
      continue;
    }
    const ifDestroyed = /^If a creature (you controlled was|is) destroyed this way, (.+)$/.exec(s);
    if (ifDestroyed) {
      const prev = effects[effects.length - 1];
      const destroy = prev?.type === "may" && prev.effects.length === 1 ? prev.effects[0] : prev;
      if (destroy?.type !== "destroy" || destroy.what.ref !== "target" || ctx.targets[destroy.what.index]?.types?.join() !== "Creature") return null;
      const yours = ifDestroyed[1] !== "is";
      if (yours && /\bits\b/.test(ifDestroyed[2]!)) return null;
      const then = ifDestroyed[2]!.replace(/\bits\b/g, "that creature's");
      const inner = parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "destroyedThisWay", ...(yours ? { you: true as const } : {}) }, effects: inner });
      continue;
    }
    // Shredder's Technique: "Destroy target creature or enchantment. If an enchantment was destroyed this way, you lose 2
    // life": destroyed even if a replacement effect put it elsewhere, an enchantment as it last existed (CR 608.2h).
    // Smashing Success: "If an artifact is destroyed this way, create a Treasure token": the same.
    const ifTypeDestroyed = /^If an? (artifact|creature|enchantment|land|planeswalker) (?:was|is) destroyed this way, (.+)$/.exec(s);
    if (ifTypeDestroyed) {
      const prev = effects[effects.length - 1];
      const type = capital(ifTypeDestroyed[1]!);
      // Acolyte Hybrid: "If an artifact is destroyed this way, its controller draws a card": the destroyed target's
      // controller as it last existed (CR 608.2h).
      const itsController = /^its controller (?!.*\b(?:its?|that)\b)/.test(ifTypeDestroyed[2]!) && prev?.type === "destroy" && prev.what.ref === "target" && ctx.targets.length === prev.what.index + 1;
      if (prev?.type !== "destroy" || prev.what.ref !== "target" || !ctx.targets[prev.what.index]?.types?.includes(type) || (!itsController && /\b(?:its?|that)\b/.test(ifTypeDestroyed[2]!))) return null;
      const inner = parseOne(capital(ifTypeDestroyed[2]!), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "destroyedThisWay", cardType: type }, effects: inner });
      continue;
    }
    // "Discard a card at random. If an artifact card was discarded this way, ~ deals 2 damage to each opponent" (Reckless
    // Handling): checked against the card this resolution's discard put into the graveyard (CR 701.9a).
    // Vohar, Vodalian Desecrator: "Draw a card, then discard a card. If you discarded an instant or sorcery card this way, ...".
    // Fanatic of the Harrowing: "Each player discards a card. If you discarded a card this way, draw a card.": you did (with
    // an empty hand, you didn't, CR 701.9b).
    const youDiscarded = /^If you discarded a card this way, (.+)$/.exec(s);
    if (youDiscarded) {
      const prev = effects[effects.length - 1];
      const inner = parseOne(capital(youDiscarded[1]!), ctx);
      if (prev?.type !== "discard" || prev.who.ref !== "eachPlayer" || prev.n !== 1 || prev.upTo || prev.filter || prev.hand || !inner) return null;
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "discardedThisWay", who: { ref: "you" } } }, min: 1 }, effects: inner });
      continue;
    }
    // Lukka, Wayward Bonder: "You may discard a card. If you do, draw a card. If a creature card was discarded this way, draw
    // two cards instead.": the draw the discard allows becomes two cards (CR 614.1a), still only if you discarded.
    const discardInstead = /^If an? (.+? card) was discarded this way, draw (two|three) cards instead$/.exec(s);
    if (discardInstead) {
      const last = effects[effects.length - 1];
      const prev = effects[effects.length - 2];
      const draw = last?.type === "if" && last.cond.kind === "youDid" && !last.otherwise && last.effects.length === 1 ? last.effects[0] : undefined;
      const filter = parseSearchFilter(discardInstead[1]!);
      if (!filter || draw?.type !== "draw" || draw.who.ref !== "you" || draw.n !== 1 || prev?.type !== "may" || prev.effects.length !== 1 || prev.effects[0]!.type !== "discard" || (prev.effects[0] as { who: PlayerRef }).who.ref !== "you") return null;
      (last as Extract<Effect, { type: "if" }>).effects = [{ type: "if", cond: { kind: "discardedThisWayIs", filter }, effects: [{ ...draw, n: discardInstead[2] === "two" ? 2 : 3 }], otherwise: [draw] }];
      continue;
    }
    // Lord Windgrace: "Discard a card, then draw a card. If a land card is discarded this way, draw an additional card":
    // the discard before the draw.
    const ifDiscarded = /^If (?:an? (.+? card) (?:was|is) discarded|you discarded an? (.+? card)) this way, (.+)$/.exec(s)?.filter((x) => x !== undefined);
    if (ifDiscarded) {
      const last = effects[effects.length - 1];
      const prev = last?.type === "draw" && last.who.ref === "you" && effects[effects.length - 2]?.type === "discard" ? effects[effects.length - 2] : last;
      if (prev?.type !== "discard" || (/^If you/.test(s) && prev.who.ref !== "you")) return null;
      const filter = parseSearchFilter(ifDiscarded[1]!);
      const then = ifDiscarded[2]!;
      const inner = filter && parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
      if (!filter || !inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "discardedThisWayIs", filter }, effects: inner });
      continue;
    }
    // Glacial Dragonhunt: "Draw a card, then you may discard a card. When you discard a nonland card this way, ~ deals 3
    // damage to target creature.": a reflexive trigger (CR 603.12), its target chosen then, if the card discarded is one.
    // Talion's Messenger: "draw a card, then discard a card. When you discard a card this way, ...": any card.
    const whenDiscarded = /^When you discard (?:an? (.+? card)|(a card)) this way, (.+)$/.exec(s);
    if (whenDiscarded) {
      const yourDiscard = (es: Effect[]): boolean => es.some((e) => (e.type === "discard" && e.who.ref === "you" && e.n === 1 && !e.random) || (e.type === "may" && !e.pay && yourDiscard(e.effects)));
      const filter: TargetSpec | null = whenDiscarded[2] ? { kind: "card", text: "card" } : (parseSearchFilter(whenDiscarded[1]!) ?? null);
      whenDiscarded[2] = whenDiscarded[3]!;
      const reflexive = filter && yourDiscard(effects) && !/\b(?:that card|its?)\b/.test(whenDiscarded[2]!) && reflexiveBody(whenDiscarded[2]!, ctx);
      if (!reflexive) return null;
      effects.push({ type: "if", cond: { kind: "discardedThisWayIs", filter }, effects: [{ type: "reflexive", body: reflexive }] });
      continue;
    }
    // "Flip a coin. If you win the flip, ... If you lose the flip, ...": decided by that flip (CR 705.2); neither if it
    // wasn't flipped ("you may flip a coin").
    const flipped = (es: Effect[]): boolean => es.some((e) => (e.type === "flipCoin" && !e.untilLose) || ((e.type === "may" || e.type === "if") && flipped(e.effects)));
    // "When you win the flip, copy that spell. You may choose new targets for the copy. When you lose the flip, ~ deals
    // damage equal to that spell's mana value to any target." (Breeches, the Blastmaker): two delayed (reflexive)
    // triggers, only one of which triggers, its targets chosen then (CR 603.12; rulings).
    const whenFlip = /^When you (win|lose) the flip, (.+)$/.exec(s);
    if (whenFlip) {
      let text = whenFlip[2]!;
      if (sentences[si + 1] === "You may choose new targets for the copy") {
        text += ". You may choose new targets for the copy";
        si++;
      }
      const reflexive = flipped(effects) && reflexiveBody(text, ctx);
      if (!reflexive) return null;
      effects.push({ type: "if", cond: { kind: "wonFlip", ...(whenFlip[1] === "lose" ? { lost: true as const } : {}) }, effects: [{ type: "reflexive", body: reflexive }] });
      continue;
    }
    const ifFlip = /^If you (win|lose) the flip, (.+)$/.exec(s);
    if (ifFlip) {
      // "If you win the flip, you may exile ~, then return it to the battlefield transformed ..." (Ral, Monsoon Mage):
      // decided as it resolves, after the flip (CR 608.2d).
      const may = /^you may (exile ~, then return it to the battlefield transformed under its owner's control)$/.exec(ifFlip[2]!);
      const inner0 = flipped(effects) && parseOne(capital(may ? may[1]! : ifFlip[2]!), ctx);
      const inner = inner0 && may ? [{ type: "may" as const, effects: inner0, text: may[1]! }] : inner0;
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "wonFlip", ...(ifFlip[1] === "lose" ? { lost: true as const } : {}) }, effects: inner });
      continue;
    }
    // "Clash with an opponent. If you win, ... Otherwise, ...": decided by that clash (CR 701.30d).
    // Eunuchs' Intrigues: "Target opponent chooses a creature they control. Other creatures they control can't block this
    // turn.": all but the one chosen, for the turn.
    if (/^Other creatures they control can't block this turn$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "pick" || prev.action !== "choose" || prev.n !== 1 || prev.who.ref !== "target" || effects.length !== 1) return null;
      effects.push({ type: "cantBlockRule", filter: { kind: "object", types: ["Creature"], text: "other creatures they control" }, ofPlayer: prev.who, exceptChosen: true });
      continue;
    }
    // Crashing Boars: "Whenever ~ attacks, defending player chooses an untapped creature they control. That creature blocks
    // ~ this turn if able.": that player picks as it resolves (not targeted), and the one picked must block ~ if able (CR
    // 509.1c).
    if (/^[Dd]efending player chooses an untapped creature they control$/.test(s) && /^That creature blocks ~ this turn if able\.?$/.test(sentences[si + 1] ?? "") && ctx.defending && !ctx.spell && !effects.length) {
      const filter = pickFilter("untapped creature");
      if (!filter) return null;
      effects.push({ type: "pick", who: { ref: "eventPlayer" }, filter, n: 1, action: "choose" }, { type: "mustBlockSource", what: { ref: "created" }, thisTurn: true });
      si++;
      continue;
    }
    // Truce: "Each player may draw up to two cards. For each card less than two a player draws this way, that player gains 2
    // life.": each chooses how many, and gains life for the ones not chosen.
    const truce = /^Each player may draw up to two cards$/.test(s) ? /^For each card less than two a player draws this way, that player gains (\d+) life\.?$/.exec(sentences[si + 1] ?? "") : null;
    if (truce) {
      effects.push({ type: "drawUpTo", who: { ref: "eachPlayer" }, n: 2, shortLife: Number(truce[1]) });
      si++;
      continue;
    }
    // Sindbad, Fa'adiyah Seer: "Draw a card and reveal it. If it isn't a land card, discard it.": the card drawn (none if the
    // draw was replaced), revealed, and discarded unless it's a land card.
    if (/^Draw a card and reveal it$/.test(s)) {
      const unless = /^If it isn't an? ([a-z]+ card), discard it\.?$/.exec(sentences[si + 1] ?? "");
      const keep = unless && parseSearchFilter(unless[1]!);
      if (!keep) return null;
      effects.push({ type: "draw", who: { ref: "you" }, n: 1 }, { type: "revealDrawn", keep });
      si++;
      continue;
    }
    // Hoarder's Greed: "You lose 2 life and draw two cards, then clash with an opponent. If you win, repeat this process.":
    // all of it again, until a clash isn't won (rulings).
    if (/^If you win, repeat this process$/.test(s)) {
      if (effects[effects.length - 1]?.type !== "clash" || effects.some((e, i) => i < effects.length - 1 && pauses(e)) || si + 1 !== sentences.length) return null;
      effects.splice(0, effects.length, { type: "repeatIf", effects: [...effects], cond: { kind: "wonClash" }, then: [] });
      continue;
    }
    // Whirlpool Whelm: "Clash with an opponent, then return target creature to its owner's hand. If you win, you may put
    // that creature on top of its owner's library instead.": one move or the other, chosen after the clash (rulings).
    if (/^If you win, you may put that creature on top of its owner's library instead$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "bounce" || prev.what.ref !== "target" || !effects.some((e) => e.type === "clash")) return null;
      const top: Effect = { type: "putInLibrary", what: prev.what, position: "top" };
      effects.splice(effects.length - 1, 1, { type: "if", cond: { kind: "wonClash" }, effects: [{ type: "may", effects: [top], text: "put that creature on top of its owner's library", otherwise: [prev] }], otherwise: [prev] });
      continue;
    }
    // Gore Vassal: "Put a -1/-1 counter on target creature. Then if that creature's toughness is 1 or greater, regenerate
    // it.": its toughness with that counter, as it resolves (rulings: the shield lasts the turn or until used).
    const gorePrev = effects[effects.length - 1];
    if (/^If that creature's toughness is 1 or greater, regenerate it$/.test(s) && gorePrev?.type === "counters" && gorePrev.what.ref === "target" && gorePrev.counter === "-1/-1") {
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "toughness", of: gorePrev.what } }, min: 1 }, effects: [{ type: "regenerate", what: gorePrev.what }] });
      continue;
    }
    // Ether Well: "Put target creature on top of its owner's library. If that creature is red, you may put it on the bottom
    // of its owner's library instead.": its color and the choice as it resolves (rulings).
    const wellColor = /^If that creature is (white|blue|black|red|green), you may put it on the bottom of its owner's library instead$/.exec(s);
    const wellPrev = effects[effects.length - 1];
    if (wellColor && wellPrev?.type === "putInLibrary" && wellPrev.position === "top" && wellPrev.what.ref === "target" && Object.keys(wellPrev).length === 3) {
      const bottom: Effect = { type: "putInLibrary", what: wellPrev.what, position: "bottom" };
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], colors: [COLOR_WORDS[wellColor[1]!]!], text: wellColor[1]! };
      effects.splice(effects.length - 1, 1, { type: "if", cond: { kind: "targetIs", index: wellPrev.what.index, filter }, effects: [{ type: "may", effects: [bottom], text: "put it on the bottom of its owner's library", otherwise: [wellPrev] }], otherwise: [wellPrev] });
      continue;
    }
    // "Whenever you clash, ... If you won, ...": the clash the trigger is about (Entangling Trap, Rebellion of the Flamekin).
    const ifWin = /^If you win, (.+)$/.exec(s) ?? (ctx.clashed ? /^If you won, (.+)$/.exec(s) : null);
    if (ifWin) {
      // "If you win, creatures that player controls don't untap ..." (Pollen Lullaby): that player is the one clashed with.
      // Not when it names a player of its own: "If you win, target player discards two cards. Otherwise, that player
      // discards a card." (Pulling Teeth): that target.
      if (!ctx.clashed && !ctx.eventPlayer && !ctx.chosenOpponent && ctx.lastPlayerTarget === undefined && !/\btarget (?:player|opponent)\b/.test(ifWin[1]!) && effects.some((e) => e.type === "clash" && !e.with)) ctx.clashOpp = true;
      const clashed = (es: Effect[]): boolean => es.some((e) => e.type === "clash" || (e.type === "may" && clashed(e.effects)));
      // Fistful of Force: "that creature gets an additional +2/+2": another +2/+2, on top of the first.
      // Gilt-Leaf Ambush: "Create two 1/1 ... creature tokens. Clash with an opponent. If you win, those creatures gain
      // deathtouch": the tokens just made.
      const made = effects[effects.length - 2];
      const winText = ifWin[1]!.replace(/^(that creature|it) gets an additional /, "$1 gets ").replace(/^those creatures (?=gain )/, made?.type === "createToken" && typeof made.n === "number" && made.n > 1 && made.token.types.includes("Creature") && effects[effects.length - 1]?.type === "clash" ? "those tokens " : "those creatures ");
      const inner = (ctx.clashed ? !effects.some((e) => e.type === "clash") : clashed(effects)) && parseOne(winText.charAt(0).toUpperCase() + winText.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "wonClash" }, effects: inner });
      continue;
    }
    // "If it's suspected, exile it. Otherwise, suspect it." (Agrus Kos), "If ~ is suspected, put a +1/+1 counter on it"
    // (Repeat Offender): the object as the instruction is done (CR 701.60).
    const ifSuspected = /^If (it's|~ is|that creature is) suspected, (.+)$/.exec(s);
    if (ifSuspected) {
      // Repeat Offender's "If ~ is suspected, put a +1/+1 counter on it. Otherwise, suspect it.": "it" is ~, named last.
      if (ifSuspected[1] === "~ is" && ctx.lastObjectTarget === undefined && !ctx.spell) ctx.selfIt = true;
      const what = parseObject(ifSuspected[1] === "it's" ? "it" : ifSuspected[1] === "~ is" ? "~" : "that creature", ctx);
      const inner = what && !isGroup(what) && parseOne(ifSuspected[2]!.charAt(0).toUpperCase() + ifSuspected[2]!.slice(1), ctx);
      if (!what || !inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "suspected", what }, effects: inner });
      continue;
    }
    // "Creatures your opponents control get -2/-0 until end of turn. If any of them are suspected, they're no longer
    // suspected." (Eliminate the Impossible): the same group.
    if (/^If any of them are suspected, they're no longer suspected$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "continuous" || prev.what.ref !== "each") return null;
      effects.push({ type: "suspect", what: prev.what, no: true });
      continue;
    }
    // "Choose a card name, then target player mills a card. If a card with the chosen name was milled this way, you draw two
    // cards. Otherwise, you draw a card." (Predict): about the cards that mill instruction put into the graveyard.
    // "Mill a card. If a land card was milled this way, ..." (Lorehold Excavation), several of them after one mill (Old
    // Rutstein): by its printed characteristics in the graveyard.
    // Eladamri, Korvecdal: "Reveal a card from your hand or the top card of your library. If you reveal a creature card
    // this way, put it onto the battlefield." One card, from either place, chosen as it resolves.
    if (/^Reveal a card from your hand or the top card of your library$/.test(s)) {
      const then = /^If you reveal an? ([a-z]+ card) this way, put it onto the battlefield$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      const filter = then && parseSearchFilter(then[1]!);
      if (!filter) return null;
      effects.push({ type: "revealHandOrTop", filter });
      si++;
      continue;
    }
    // Gonti, Lord of Luxury: "Look at the top four cards of target opponent's library, exile one of them face down, then
    // put the rest on the bottom of that library in a random order. You may cast that card for as long as it remains
    // exiled, and mana of any type can be spent to cast that spell." Cast only (no land play), with its usual timing and
    // costs (rulings).
    // Thief of Sanity: "look at the top three cards of that player's library, exile one of them face down, then put the
    // rest into their graveyard. You may cast that card ...", the player dealt combat damage.
    const gonti = new RegExp(`^[Ll]ook at the top ${NUMX} cards of (target opponent's|target player's|that player's) library, exile one of them face down(?:, then put| and put)? ?(the rest on the bottom of that library in a random order|the rest into their graveyard)?$`).exec(s);
    if (gonti && (gonti[2] !== "that player's" || ctx.eventPlayer)) {
      let k = si + 1;
      let toYard = gonti[3] === "the rest into their graveyard";
      if (!gonti[3]) {
        const rest = /^(?:Then )?[Pp]ut the rest (on the bottom of that library in a random order|into their graveyard)$/.exec(sentences[k]?.replace(/\.$/, "") ?? "");
        if (!rest) return null;
        toYard = rest[1] === "into their graveyard";
        k++;
      }
      if ((sentences[k] ?? "").replace(/\.$/, "") !== "You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell") return null;
      const who = parsePlayer(gonti[2]!.replace(/'s$/, ""), ctx);
      if (!who) return null;
      effects.push({ type: "hideaway", n: num(gonti[1]!), from: who, castAnyType: true, ...(toYard ? { restToGraveyard: true as const } : {}) });
      si = k;
      continue;
    }
    // Akiri, Fearless Voyager: "You may unattach an Equipment from a creature you control. If you do, tap that creature
    // and it gains indestructible until end of turn." The Equipment is chosen as it resolves (rulings), whoever controls
    // it; "that creature" is the one it was attached to (run as a pick, the creature becoming "it").
    if (/^You may unattach an Equipment from a creature you control$/.test(s)) {
      const then = /^If you do, tap that creature and it (gains [^.]+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      const rest = then ? parseBody(`Choose a creature you control. Tap it. It ${then[1]}.`, {}) : null;
      if (!rest || rest.targets.length || rest.effects[0]?.type !== "pick") return null;
      const pick: Effect = { type: "pick", who: { ref: "you" }, filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Equipment"], text: "Equipment" }, n: 1, action: "unattach" };
      effects.push({ type: "may", effects: [pick, ...rest.effects.slice(1)], text: `unattach an Equipment from a creature you control. If you do, tap that creature and it ${then![1]}` });
      si++;
      continue;
    }
    // Sunforger: "Search your library for a red or white instant card with mana value 4 or less and cast that card without
    // paying its mana cost. Then shuffle." The card is cast from the library as this resolves (CR 608.2g), then the
    // library is shuffled.
    const searchCast = /^Search your library for an? (.+? card(?: with mana value \d+ or less)?) and cast that card without paying its mana cost$/.exec(s);
    if (searchCast && sentences[si + 1]?.replace(/\.$/, "") === "Then shuffle") {
      const filter = parseSearchFilter(searchCast[1]!);
      if (!filter) return null;
      effects.push({ type: "search", filter, n: 1, upTo: false, dest: { zone: "cast" }, reveal: false, noShuffle: true }, { type: "castSearched" }, { type: "shuffle", who: { ref: "you" }, ifSearched: true });
      si++;
      continue;
    }
    // Grist, the Hunger Tide: "Create a 1/1 black and green Insect creature token, then mill a card. If an Insect card was
    // milled this way, put a loyalty counter on ~ and repeat this process." All of it again, for as long as it hits.
    // Sphinx's Tutelage: "Target opponent mills two cards. If two nonland cards that share a color were milled this way,
    // repeat this process." The same opponent each time, for as long as it hits (rulings).
    if (/^If two nonland cards that share a color were milled this way, repeat this process$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (effects.length !== 1 || prev?.type !== "mill" || prev.n !== 2 || si + 1 !== sentences.length) return null;
      effects.splice(0, 1, { type: "repeatIf", effects: [prev], cond: { kind: "milledShareColor" }, then: [] });
      continue;
    }
    const milledRepeat = /^If an? ([A-Za-z]+ card) was milled this way, (.+) and repeat this process$/.exec(s);
    if (milledRepeat) {
      const filter = parseSearchFilter(milledRepeat[1]!);
      const then = parseOne(capital(milledRepeat[2]!), ctx);
      if (!filter || !then || then.some((e) => pauses(e)) || effects.length < 1 || effects[effects.length - 1]!.type !== "mill" || effects.some((e) => pauses(e)) || si + 1 !== sentences.length) return null;
      effects.splice(0, effects.length, { type: "repeatIf", effects: [...effects], cond: { kind: "milledIs", filter }, then });
      continue;
    }
    // Grist, the Plague Swarm: "Create a 1/1 black and green Insect creature token, then mill two cards. Put a deathtouch
    // counter on the token if a black card was milled this way.": that token, if any of the cards milled is one.
    const tokenMill = /^Create an? [^,.]+? creature token$/.test(s) && /^[Mm]ill (?:a card|\w+ cards)$/.test(sentences[si + 1] ?? "") ? new RegExp(`^Put an? ${COUNTER} counter on the token if an? ([a-z]+ card) was milled this way\\.?$`).exec(sentences[si + 2] ?? "") : null;
    if (tokenMill) {
      const made = parseOne(s, ctx);
      const milled = parseOne(capital(sentences[si + 1]!), ctx);
      const filter = parseSearchFilter(tokenMill[2]!);
      if (made?.length !== 1 || made[0]!.type !== "createToken" || made[0]!.n !== 1 || milled?.length !== 1 || milled[0]!.type !== "mill" || !filter) return null;
      effects.push(made[0]!, milled[0]!, { type: "if", cond: { kind: "milledIs", filter }, effects: [{ type: "counters", what: { ref: "created" }, counter: counterKind(tokenMill[1]!), n: 1 }] });
      si += 2;
      continue;
    }
    const ifMilled = /^If a card with the chosen name was milled this way, (.+)$/.exec(s) ?? /^If (?:an?|at least one) ((?:[A-Za-z]+, )?[A-Za-z]+ card) (?:is|was) milled this way, (.+)$/.exec(s);
    if (ifMilled) {
      const then = ifMilled[ifMilled.length - 1]!;
      const filter: TargetSpec | null = ifMilled.length === 2 ? { kind: "card", chosen: "name", text: "card with the chosen name" } : (parseSearchFilter(ifMilled[1]!.replace(/, (?=non)/, " ")) ?? null);
      // The mill just before, or another "if ... milled this way" after it.
      let back = effects.length - 1;
      while (back >= 0 && effects[back]!.type === "if" && (effects[back] as { cond: SpellCondition }).cond.kind === "milledIs") back--;
      const prev = effects[back];
      // Lammastide Weave: "you gain life equal to its mana value" after milling one card: that card.
      if (filter && prev?.type === "mill" && prev.n === 1 && then === "you gain life equal to its mana value") {
        effects.push({ type: "if", cond: { kind: "milledIs", filter }, effects: [{ type: "gainLife", who: { ref: "you" }, n: { count: { kind: "milledManaValue" } } }] });
        continue;
      }
      if (!filter || prev?.type !== "mill" || /\b(?:it|its)\b|\brepeat\b/.test(then)) return null;
      const inner = parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "milledIs", filter }, effects: inner });
      continue;
    }
    // Demonic Covenant: "mill two cards. If two cards that share all their card types were milled this way, sacrifice ~":
    // the same combination of card types, supertypes and subtypes aside (rulings), as printed in the graveyard.
    const milledSame = /^If two cards that share all their card types were milled this way, (.+)$/.exec(s);
    if (milledSame) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "mill" || prev.n !== 2 || /\b(?:it|its|them|they)\b/.test(milledSame[1]!)) return null;
      const inner = parseOne(capital(milledSame[1]!), ctx);
      if (!inner || inner.some((e) => pauses(e))) return null;
      effects.push({ type: "if", cond: { kind: "milledShareTypes" }, effects: inner });
      continue;
    }
    // "Exile the top two cards of your library. You may play them this turn. If you exiled a land card this way, create a
    // 3/1 red Dinosaur creature token. If you exiled a nonland card this way, create a Treasure token." (Bonehoard
    // Dracosaur): once each, however many of them are (rulings), by their printed characteristics in exile.
    const ifImpulsed = /^If you exiled an? ([A-Za-z]+ card) this way, (.+)$/.exec(s);
    if (ifImpulsed) {
      let back = effects.length - 1;
      while (back >= 0 && effects[back]!.type === "if" && (effects[back] as { cond: SpellCondition }).cond.kind === "impulsedIs") back--;
      const filter = parseSearchFilter(ifImpulsed[1]!);
      if (!filter || effects[back]?.type !== "impulse" || /\b(?:it|its|that card)\b/.test(ifImpulsed[2]!)) return null;
      const inner = parseOne(capital(ifImpulsed[2]!), ctx);
      if (!inner || inner.some((e) => pauses(e))) return null;
      effects.push({ type: "if", cond: { kind: "impulsedIs", filter }, effects: inner });
      continue;
    }
    // "Then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way,
    // you gain 4 life." (Spelunking): about the permanent it became. "If you put an artifact onto the battlefield this way,
    // put two +1/+1 counters on it" (Oviya, Automech Artisan): "it" is that permanent.
    // Howlpack Piper: "You may put a creature card from your hand onto the battlefield. If it's a Wolf or Werewolf, untap
    // this creature": the same, about the permanent put.
    const putThisWay = /^If you put an? ([A-Z][a-z]+|[a-z]+) onto the battlefield this way, (.+)$/.exec(s) ?? (/^If it's an? [A-Z][a-z]+ or [A-Z][a-z]+, untap ~$/.test(s) ? /^If it's an? ([A-Z][a-z]+ or [A-Z][a-z]+), (untap ~)$/.exec(s) : null);
    if (putThisWay) {
      const last = effects[effects.length - 1];
      const put = last?.type === "may" && last.effects.length === 1 ? last.effects[0] : last;
      const filter = parseTargetPhrase(putThisWay[1]!);
      const inner = parseOne(putThisWay[2]!.charAt(0).toUpperCase() + putThisWay[2]!.slice(1), ctx);
      const aboutIt = /\bit\b/.test(putThisWay[2]!) && !(ctx.lastPut && /^put (?:a|an|one|two|three) [^ ]+ counters? on it$/.test(putThisWay[2]!));
      if (put?.type !== "putFromHand" || put.who || put.any || filter?.kind !== "object" || !inner || aboutIt || /\b(?:its|that)\b/.test(putThisWay[2]!)) return null;
      effects.push({ type: "if", cond: { kind: "putThisWayIs", filter }, effects: inner });
      continue;
    }
    // Town Greeter: "mill four cards. You may put a land card from among them into your hand. If you put a Town card into
    // your hand this way, you gain 2 life": the card put there, by its printed types.
    const handThisWay = /^If you put an? ([A-Z][a-z]+|[a-z]+) card into your hand this way, (.+)$/.exec(s);
    if (handThisWay) {
      const last = effects[effects.length - 1];
      const filter = parseSearchFilter(`${handThisWay[1]} card`);
      const before = ctx.targets.length;
      const inner = parseOne(capital(handThisWay[2]!), ctx);
      if (last?.type !== "chooseFromGraveyard" || !last.milled || last.dest || last.who || !filter || !inner || ctx.targets.length !== before || /\b(?:it|its|that card)\b/.test(handThisWay[2]!)) return null;
      effects.push({ type: "if", cond: { kind: "putIntoHandIs", filter }, effects: inner });
      continue;
    }
    // Vengeful Rebirth: "Return target card from your graveyard to your hand. If you return a nonland card to your hand this
    // way, ~ deals damage equal to that card's mana value to any target": only if that card went to the hand (not if it
    // left the graveyard first, rulings), by its printed types; its mana value as it is in the hand.
    const returnedHand = /^If you return an? ([a-z]+ card) to your hand this way, (.+)$/.exec(s);
    if (returnedHand) {
      const last = effects[effects.length - 1];
      const filter = parseSearchFilter(returnedHand[1]!);
      const inner = parseOne(capital(returnedHand[2]!), ctx);
      if (last?.type !== "bounce" || last.what.ref !== "target" || last.what.n || ctx.targets[last.what.index]?.kind !== "card" || !filter || !inner) return null;
      effects.push({ type: "if", cond: { kind: "returnedToHandIs", filter }, effects: inner });
      continue;
    }
    // Return Upon the Tide: "Return target creature card from your graveyard to the battlefield. If it's an Elf, create two
    // 1/1 green Elf Warrior creature tokens": about the permanent it returned as, once it's on the battlefield (rulings).
    const returnedIs = /^If it's an? ([A-Z][a-z]+), (.+)$/.exec(s);
    if (returnedIs && CREATURE_TYPES.has(returnedIs[1]!)) {
      const last = effects[effects.length - 1];
      // Defy Death: "If it's an Angel, put two +1/+1 counters on it": on that permanent.
      const onIt = new RegExp(`^put (an?|${NUM}) \\+1/\\+1 counters? on it$`).exec(returnedIs[2]!);
      const inner: Effect[] | null = onIt ? [{ type: "counters", what: { ref: "created" }, counter: "+1/+1", n: /^an?$/.test(onIt[1]!) ? 1 : num(onIt[1]!) }] : parseOne(capital(returnedIs[2]!), ctx);
      if (last?.type !== "putOntoBattlefield" || last.what.ref !== "target" || last.what.n || !ctx.spell || !inner || (!onIt && /\b(?:it|its|that)\b/.test(returnedIs[2]!))) return null;
      effects.push({ type: "if", cond: { kind: "putThisWayIs", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [returnedIs[1]!], text: returnedIs[1]! } }, effects: inner });
      continue;
    }
    // Hazel of the Rootbloom: "create a token that's a copy of target token you control. If that token is a Squirrel, instead
    // create two tokens that are copies of it": the target as it is when this resolves.
    const insteadTwo = /^If that token is an? ([A-Z][a-z]+), instead create (two|three) tokens that are copies of it$/.exec(s);
    if (insteadTwo) {
      const last = effects[effects.length - 1];
      if (last?.type !== "createTokenCopy" || last.what.ref !== "target" || last.what.n || last.n !== 1 || last.each || !CREATURE_TYPES.has(insteadTwo[1]!)) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [insteadTwo[1]!], text: insteadTwo[1]! };
      effects[effects.length - 1] = { type: "if", cond: { kind: "targetIs", index: last.what.index, filter }, effects: [{ ...last, n: num(insteadTwo[2]!) }], otherwise: [last] };
      continue;
    }
    // Coiling Rebirth: "Return target creature card from your graveyard to the battlefield. Then if the gift was promised and
    // that creature isn't legendary, create a token that's a copy of that creature, except it's 1/1": the permanent it
    // returned as, as it is now (CR 608.2c, 400.7).
    const giftNotLegend = /^(?:Then )?if the gift was promised and that creature isn't legendary, (create a token that's a copy of that creature.*)$/i.exec(s);
    if (giftNotLegend) {
      const last = effects[effects.length - 1];
      const inner = parseOne(capital(giftNotLegend[1]!), ctx);
      if (last?.type !== "putOntoBattlefield" || last.what.ref !== "target" || last.what.n || !ctx.spell || inner?.length !== 1 || inner[0]!.type !== "createTokenCopy" || inner[0]!.what.ref !== "created") return null;
      effects.push({ type: "if", cond: { kind: "gift" }, effects: [{ type: "if", cond: { kind: "putThisWayIs", filter: { kind: "object", types: ["Creature"], notSupertypes: ["Legendary"], text: "nonlegendary creature" } }, effects: inner }] });
      continue;
    }
    // Yenna, Redtooth Regent: "Create a token that's a copy of it, except it isn't legendary. If the token is an Aura, untap
    // ~, then scry 2": the token as it is now.
    const tokenIs = /^If the token is an? ([A-Z][a-z]+), (.+)$/.exec(s);
    if (tokenIs) {
      const last = effects[effects.length - 1];
      const filter = parseTargetPhrase(tokenIs[1]!);
      const inner = parseOne(capital(tokenIs[2]!), ctx);
      if (last?.type !== "createTokenCopy" || last.each || last.n !== 1 || filter?.kind !== "object" || !inner || /\b(?:it|its|that)\b/.test(tokenIs[2]!)) return null;
      effects.push({ type: "if", cond: { kind: "putThisWayIs", filter }, effects: inner });
      continue;
    }
    // Ultron, Artificial Malevolence: "you may pay {2}. If you do, create a token that's a copy of it. If the token isn't a
    // creature, it becomes a 2/2 Robot Villain creature in addition to its other types": the token as it is now, which
    // becomes one for as long as it's on the battlefield (CR 611.2a). That isn't part of the copy effect, so it isn't
    // copiable (CR 707.2): a copy of the token is no creature.
    const tokenNotCreature = /^If the token isn't a creature, it (becomes an? \d+\/\d+ [A-Z][a-z]+(?: [A-Z][a-z]+)* creature in addition to its other types)$/.exec(s);
    if (tokenNotCreature) {
      const last = effects[effects.length - 1];
      const made = last?.type === "may" && last.effects.length === 1 ? last.effects[0] : last;
      const mods = parseChanges(tokenNotCreature[1]!);
      if (made?.type !== "createTokenCopy" || made.each || made.n !== 1 || !mods) return null;
      const filter: TargetSpec = { kind: "object", types: [], notTypes: ["Creature"], notColors: [], text: "noncreature permanent" };
      effects.push({ type: "if", cond: { kind: "putThisWayIs", filter }, effects: [{ type: "continuous", what: { ref: "created" }, mods, duration: "game" }] });
      continue;
    }
    // "For each creature exiled this way, its controller creates a 2/2 green Boar creature token" (Curse of the Swine),
    // "For each creature destroyed this way, its controller draws a card": after the destroy or exile instruction.
    // Winds of Abandon: "For each creature exiled this way, its controller searches their library for a basic land card.
    // Those players put those cards onto the battlefield tapped, then shuffle." Each of those players searches for as many
    // as they controlled (none found is fine, CR 701.19b), in APNAP order (CR 101.4).
    const perSearch = /^For each (creature) exiled this way, its controller searches their library for (a basic land card)$/.exec(s);
    if (perSearch && sentences[si + 1] === "Those players put those cards onto the battlefield tapped, then shuffle") {
      const search = parseSearch(`Search your library for ${perSearch[2]}, put it onto the battlefield tapped, then shuffle`);
      const spec = parseTargetPhrase(perSearch[1]!);
      if (effects[effects.length - 1]?.type !== "exile" || search?.length !== 1 || search[0]!.type !== "search" || spec?.kind !== "object") return null;
      effects.push({ type: "forEachThisWay", which: "exiled", filter: { ...spec, text: perSearch[1]! }, effects: [{ ...search[0]!, who: { ref: "eachOne" } }] });
      si++;
      continue;
    }
    // "Destroy all creatures. Each player loses life equal to the number of creatures they controlled that were destroyed
    // this way" (Deadly Tempest): each player loses that much at once, as they controlled them as they were destroyed
    // (CR 608.2h).
    const lossThisWay = /^Each player loses life equal to the number of (creatures) they controlled that were destroyed this way$/.exec(s);
    if (lossThisWay) {
      const spec = parseTargetPhrase(singularWord(lossThisWay[1]!), { chosen: true });
      if (effects[effects.length - 1]?.type !== "destroy" || spec?.kind !== "object") return null;
      effects.push({ type: "forEachThisWay", which: "destroyed", filter: { ...spec, text: lossThisWay[1]! }, effects: [{ type: "loseLife", who: { ref: "eachOne" }, n: 1 }] });
      continue;
    }
    // Mogg Infestation: "Destroy all creatures target player controls. For each creature that died this way, that player
    // creates two 1/1 red Goblin creature tokens": those put into a graveyard (CR 700.4), all that player's.
    const diedThisWay = /^For each (creature) that died this way, that player (creates (?:an?|two|three) .+ tokens?(?: with [a-z ]+)?)$/.exec(s);
    const destroyedOf = effects[effects.length - 1];
    const perThisWay = /^For each (.+?) (destroyed|exiled|put into a graveyard) this way, its controller (creates an? .+ token(?: with [a-z ]+)?|draws a card)$/.exec(s) ?? (diedThisWay && destroyedOf?.type === "destroy" && destroyedOf.what.ref === "each" && destroyedOf.what.of?.ref === "target" ? ([s, diedThisWay[1]!, "put into a graveyard", diedThisWay[2]!.replace(/^creates (two|three) /, "creates a ")] as unknown as RegExpExecArray) : null);
    if (perThisWay) {
      const times = diedThisWay ? ({ two: 2, three: 3 } as Record<string, number>)[/^creates (two|three) /.exec(diedThisWay[2]!)?.[1] ?? ""] : undefined;
      const graveyard = perThisWay[2] === "put into a graveyard";
      const which = graveyard ? "destroyed" : (perThisWay[2] as "destroyed" | "exiled");
      // Terastodon: "You may destroy up to three target noncreature permanents. For each permanent put into a graveyard
      // this way, ...": after the "you may".
      const last = effects[effects.length - 1];
      const prev = graveyard && last?.type === "may" && !last.pay && !last.otherwise && last.effects.length === 1 ? last.effects[0] : last;
      const spec = parseTargetPhrase(perThisWay[1]!.split(/\s+/).map(singularWord).join(" "), { chosen: true });
      const inner = parseOne(capital(perThisWay[3]!.replace(/^creates/, "create").replace(/^draws/, "draw")), ctx);
      const one = inner?.length === 1 ? inner[0]! : undefined;
      if (prev?.type !== (which === "destroyed" ? "destroy" : "exile") || spec?.kind !== "object" || !one || (one.type !== "createToken" && one.type !== "draw") || one.n !== 1) return null;
      effects.push({ type: "forEachThisWay", which, ...(graveyard ? { graveyard: true as const } : {}), ...(times ? { times } : {}), filter: { ...spec, text: perThisWay[1]! }, effects: [{ ...one, who: { ref: "eachOne" } }] });
      continue;
    }
    // Rampant Frogantua: "You may mill that many cards. Put any number of land cards from among them onto the battlefield
    // tapped": part of milling, if you do, any of the land cards milled, chosen as it resolves.
    const anyMilled = /^Put any number of ([a-z]+) cards from among them onto the battlefield tapped$/.exec(s);
    if (anyMilled) {
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(`${anyMilled[1]} card`);
      if (prev?.type !== "may" || prev.pay || prev.effects.length !== 1 || prev.effects[0]!.type !== "mill" || prev.effects[0]!.who.ref !== "you" || !filter) return null;
      prev.effects.push({ type: "chooseFromGraveyard", n: 99, upTo: true, milled: true, filter, dest: "battlefield", tapped: true });
      continue;
    }
    // "Mill three cards. You may put a land card from among them into your hand." (Six, Eerie Gravestone), "... from among
    // the cards milled this way ..." (Blanchwood Prowler), "You may put an instant or sorcery card milled this way into
    // your hand" (Leyline Dowser): one of the cards your mill just put into your graveyard, if any matches.
    // "Put up to two creature cards from among the milled cards onto the battlefield" (The Grand Evolution): under your
    // control, chosen as it resolves.
    // Gleam of Death: "Mill six cards, then put all instant and sorcery cards from among them into your hand": every one of
    // the milled cards that matches, no choice.
    const allMilled = /^(?:Then )?[Pp]ut all (.+? cards) from among them into your hand$/.exec(s);
    if (allMilled) {
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(allMilled[1]!.replace(/ cards$/, " card").replace(/ and /g, " or "));
      if (prev?.type !== "mill" || prev.who.ref !== "you" || !filter) return null;
      effects.push({ type: "returnAllFromGraveyard", who: { ref: "you" }, filter, toHand: true, milled: true });
      continue;
    }
    const fromMilled =
      // Nashi, Searcher in the Dark: "You may put any number of legendary and/or enchantment cards from among them into your hand".
      /^[Yy]ou may put (an? .+?|up to (?:one|two|three|four|five) .+? cards|any number of .+? cards) from among (?:them|the cards milled this way|the milled cards|those cards) into your hand$/.exec(s) ?? /^[Yy]ou may put (an? .+?) milled this way into your hand$/.exec(s) ?? /^Put (up to one .+? card) milled this way into your hand$/.exec(s) ?? /^Put (up to (?:one|two|three|four|five) .+? cards) from among (?:them|the cards milled this way|the milled cards|those cards) (onto the battlefield)(?: under your control)?$/.exec(s) ?? /^(?:Then )?[Pp]ut (an? .+? card(?: with an? (?:even|odd) mana value)?) from among (?:them|the cards milled this way|the milled cards|those cards) (onto the battlefield)(?: under your control)?$/.exec(s) ??
      // Lluwen, Imperfect Naturalist: "you may put a creature or land card from among the milled cards on top of your library".
      /^[Yy]ou may put (an? .+? card) from among (?:them|the milled cards) (on top of your library)$/.exec(s) ??
      // Free the Fae: "Then put an instant, sorcery, or Faerie card from among the milled cards into your hand": one if any
      // matches, not optional.
      /^(?:Then )?[Pp]ut (an? .+? card) from among (?:them|the cards milled this way|the milled cards) into your hand$/.exec(s) ??
      // Vivien on the Hunt: "Mill five cards, then put any number of creature cards milled this way into your hand".
      /^(?:Then )?[Pp]ut (any number of .+? cards) milled this way into your hand$/.exec(s);
    if (fromMilled) {
      const prev = effects[effects.length - 1];
      // "Up to two creature and/or land cards from among the milled cards" (Smuggler's Surprise).
      const upTo = /^up to (\w+) (.+) cards?$/.exec(fromMilled[1]!) ?? /^any number of() (.+) cards$/.exec(fromMilled[1]!);
      // Nashi: "legendary and/or enchantment cards": either a legendary card or an enchantment card (TargetSpec.anyOf).
      const legOr = upTo ? /^legendary and\/or ([a-z]+)$/.exec(upTo[2]!) : null;
      const legOther = legOr ? parseSearchFilter(`${legOr[1]} card`) : undefined;
      const filter = legOr ? (legOther ? ({ kind: "card", types: [], notTypes: [], notColors: [], anyOf: [{ kind: "card", types: [], notTypes: [], notColors: [], supertypes: ["Legendary"], text: "legendary card" }, legOther], text: `legendary or ${legOr[1]} card` } as TargetSpec) : null) : parseSearchFilter(upTo ? `${upTo[2]!.replace(/ and\/or /g, " or ")} card` : fromMilled[1]!.replace(/^an? /, ""));
      const must = /^(?:Then )?[Pp]ut an? /.test(s);
      // Gyruda, Doom of Depths: "each player mills four cards. Put a creature card with an even mana value from among the
      // milled cards onto the battlefield under your control": one from any of them, chosen as it resolves.
      if (prev?.type === "mill" && prev.who.ref === "eachPlayer" && must && fromMilled[2] === "onto the battlefield" && !upTo && filter) {
        effects.push({ type: "chooseFromGraveyard", n: 1, milled: true, anyGraveyard: true, filter, dest: "battlefield" });
        continue;
      }
      // Bristlebud Farmer: "you may sacrifice a Food. If you do, mill three cards. You may put a permanent card from among
      // them into your hand": part of the milling, so it depends on the sacrifice too.
      const inIf = prev?.type === "if" && prev.cond.kind === "youDid" && !prev.otherwise && prev.effects[prev.effects.length - 1]?.type === "mill" ? prev.effects : undefined;
      const milling = inIf ? inIf[inIf.length - 1] : prev;
      if (milling?.type !== "mill" || milling.who.ref !== "you" || filter === null) return null;
      // "Then put a creature, enchantment, or land card from among the milled cards onto the battlefield" (Fetch Quest): one
      // if any matches, not optional.
      (inIf ?? effects).push({ type: "chooseFromGraveyard", n: upTo ? (upTo[1] ? num(upTo[1]) : 99) : 1, ...(must ? {} : { upTo: true as const }), milled: true, ...(filter ? { filter } : {}), ...(fromMilled[2] ? { dest: fromMilled[2] === "onto the battlefield" ? ("battlefield" as const) : ("libraryTop" as const) } : {}) });
      // "If you don't, put a +1/+1 counter on this creature." (Ainok Wayfarer): no card was put into your hand.
      // Nashi: "If you put no cards into your hand this way, put a +1/+1 counter on ~": the same, none put there.
      const didnt = /^If you don't, (.+)$/.exec(sentences[si + 1] ?? "") ?? (fromMilled[2] ? null : /^If you put no cards into your hand this way, (.+)$/.exec(sentences[si + 1] ?? ""));
      if (didnt) {
        const inner = !inIf && parseOne(capital(didnt[1]!), ctx);
        if (!inner) return null;
        effects.push({ type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner });
        si++;
      }
      continue;
    }
    // "Mill a card. You may play that card this turn." (Tablet of Discovery, Ark of Hunger): each card milled, if a
    // replacement milled more (rulings), from the graveyard this turn, paying its costs at its usual timing (CR 305.1, 601.3).
    if (/^You may play that card this turn$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "mill" || prev.who.ref !== "you" || prev.n !== 1) return null;
      effects.push({ type: "mayCastFromGraveyard", what: { ref: "milled" }, play: true });
      continue;
    }
    // O-Kagachi Made Manifest: "defending player chooses a nonland card in your graveyard. Return that card to your hand.":
    // the defending player picks one as it resolves (not a target), if there is one, for you (CR 608.2c).
    const oppChooses = /^(defending player|target opponent|that player) chooses an? (.+? card) in your graveyard$/i.exec(s);
    if (oppChooses && /^(?:You r|R)eturn that card to your hand$/.test(sentences[si + 1] ?? "")) {
      const chooser = parsePlayer(oppChooses[1]!.toLowerCase(), ctx);
      const filter = parseSearchFilter(oppChooses[2]!);
      if (!chooser || filter === null) return null;
      effects.push({ type: "chooseFromGraveyard", n: 1, chooser, ...(filter ? { filter } : {}) });
      ctx.chosenFromYard = true;
      si++;
      continue;
    }
    // "Mill five cards, then return a creature card milled this way to your hand" (Zoological Study): one of them if
    // any matches, not optional.
    const returnMilled = /^[Rr]eturn an? (.+? card) milled this way to your hand$/.exec(s);
    if (returnMilled) {
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(returnMilled[1]!);
      if (prev?.type !== "mill" || prev.who.ref !== "you" || filter === null) return null;
      effects.push({ type: "chooseFromGraveyard", n: 1, milled: true, ...(filter ? { filter } : {}) });
      continue;
    }
    // Snort: "Each player may discard their hand and draw five cards. Then ~ deals 5 damage to each opponent who discarded
    // their hand this way": those who chose to, an empty hand too (rulings).
    const wheeled = /^(?:Then )?~ deals (\d+) damage to each opponent who discarded their hand this way$/.exec(s);
    if (wheeled) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "eachMay" || prev.wheel === undefined) return null;
      effects.push({ type: "damage", amount: Number(wheeled[1]), to: { ref: "choseThisWay", opponents: true } });
      continue;
    }
    // Elixir: "Shuffle all nonland cards from your graveyard into your library. You gain life equal to the number of cards
    // shuffled into your library this way."
    if (s === "You gain life equal to the number of cards shuffled into your library this way") {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "shuffleZones" || prev.who.ref !== "you" || prev.drawThatMany || prev.bottom) return null;
      prev.gainThatMany = true;
      continue;
    }
    // Oversimplify: "Exile all creatures. Each player creates a 0/0 ... token and puts a number of +1/+1 counters on it equal
    // to the total power of creatures they controlled that were exiled this way": each their own creatures' power as they
    // last existed on the battlefield (rulings), put on the token as it's created (counters on a permanent as it enters
    // count as put on it, CR 122.6).
    const simplified = /^(Each player creates an? 0\/0 [^.]+? creature token) and puts a number of (\+1\/\+1) counters on it equal to the total power of creatures they controlled that were exiled this way$/.exec(s);
    const exiledAll = effects[effects.length - 1];
    if (simplified && exiledAll?.type === "exile" && exiledAll.what.ref === "each" && exiledAll.what.filter.types?.length === 1 && exiledAll.what.filter.types[0] === "Creature") {
      const made = parseOne(simplified[1]!, ctx);
      const e = made?.[0];
      if (made?.length !== 1 || e?.type !== "createToken" || e.who.ref !== "eachPlayer" || e.n !== 1) return null;
      effects.push({ ...e, counters: { counter: simplified[2]!, n: { count: { kind: "exiledPowerOf", who: { ref: "eachOne" } } } } });
      continue;
    }
    const otherwise = /^Otherwise, (.+)$/.exec(s);
    if (otherwise) {
      const prev = effects[effects.length - 1];
      // Spitting Slug: "you may pay {1}{G}. If you do, ~ gains first strike until end of turn. Otherwise, each creature
      // blocking or blocked by ~ gains first strike until end of turn.": whether it was paid (CR 608.2c).
      if (prev?.type === "may" && prev.pay && !prev.payX && !prev.payLife && !prev.otherwise && prev.effects.length && / If you do, /.test(prev.text)) {
        const inner = parseOne(otherwise[1]!.charAt(0).toUpperCase() + otherwise[1]!.slice(1), ctx);
        if (!inner || inner.some((e) => pauses(e))) return null;
        prev.otherwise = inner;
        prev.text = `${prev.text}. Otherwise, ${otherwise[1]}`;
        continue;
      }
      // "If you have no cards in hand, draw a card. Otherwise, discard a card." (Flubs, the Fool): checked as it resolves.
      // "If your life total is greater than your starting life total, draw a card. Otherwise, you gain 2 life." (Cosmos Elixir).
      // "If you control a Demon, each opponent loses 2 life and you gain 2 life. Otherwise, you lose 2 life." (Unholy Annex).
      // Gravelighter: "draw a card if a creature died this turn. Otherwise, each player sacrifices a creature of their
      // choice": whether a creature died, not whether a card was drawn (rulings).
      // "Then if a graveyard has twenty or more cards in it, you draw three cards. Otherwise, you draw a card." (Jace, the
      // Perfected Mind): counted after the mill before it.
      // Wedding Announcement: "If you attacked with two or more creatures this turn, draw a card. Otherwise, create ...".
      const stateElse = prev?.type === "if" && prev.cond.kind === "state" && (prev.cond.cond.kind === "subjectPT" || prev.cond.cond.kind === "selfPT" || prev.cond.cond.kind === "attackedWith" || prev.cond.cond.kind === "subjectCounter" || prev.cond.cond.kind === "selfCounters" || prev.cond.cond.kind === "controlGreatest" || prev.cond.cond.kind === "noneInHand" || prev.cond.cond.kind === "life" || prev.cond.cond.kind === "control" || prev.cond.cond.kind === "eventPlayerNoRad" || prev.cond.cond.kind === "creatureDied" || prev.cond.cond.kind === "opponentGraveyard" || prev.cond.cond.kind === "amount" || prev.cond.cond.kind === "monarch" || (prev.cond.cond.kind === "self" && (prev.cond.cond.is === "tapped" || prev.cond.cond.is === "untapped"))) || (prev?.type === "if" && prev.cond.kind === "amountsCompare" && effects.length === 1);
      // Insatiable Appetite: "You may sacrifice a Food. If you do, target creature gets +5/+5 until end of turn. Otherwise,
      // that creature gets +3/+3 until end of turn.": whether it was done (CR 608.2c).
      const didElse = prev?.type === "if" && prev.cond.kind === "youDid" && effects[effects.length - 2]?.type === "may" && !(effects[effects.length - 2] as Extract<Effect, { type: "may" }>).otherwise;
      // Dire-Strain Rampage: "If a land was destroyed this way, ... Otherwise, ...": a target that wasn't destroyed (an
      // indestructible one) or wasn't a land gets the second (rulings).
      const destroyedElse = prev?.type === "if" && prev.cond.kind === "destroyedThisWay" && !!prev.cond.cardType;
      if (prev?.type !== "if" || (prev.cond.kind !== "wonClash" && prev.cond.kind !== "suspected" && prev.cond.kind !== "milledIs" && prev.cond.kind !== "targetCardWas" && !stateElse && !didElse && !destroyedElse) || prev.otherwise) return null;
      // Captivating Glance: "Otherwise, that player gains control of enchanted creature": the opponent clashed with.
      if (prev.cond.kind === "wonClash" && !ctx.clashed && !ctx.eventPlayer && !ctx.chosenOpponent && ctx.lastPlayerTarget === undefined && effects.some((e) => e.type === "clash" && !e.with)) ctx.clashOpp = true;
      // Lily Bowen: after "... on ~ if its power is 16 or less", "it" is ~.
      const otherText = prev.cond.kind === "state" && prev.cond.cond.kind === "selfPT" ? otherwise[1]!.replace(/("[^"]*")|\bit\b/g, (w, q) => q ?? "~") : otherwise[1]!;
      const inner = parseOne(otherText.charAt(0).toUpperCase() + otherText.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      prev.otherwise = inner;
      continue;
    }
    // Yes Man, Personal Securitron: "Target opponent gains control of ~. When they do, ...": a reflexive trigger (CR
    // 603.12) only if that opponent now controls ~ (rulings: not if ~ left the battlefield or the target is illegal).
    const whenThey = /^When they do, (.+)$/.exec(s);
    if (whenThey) {
      const prev = effects[effects.length - 1];
      if (!(effects.length === 1 && prev?.type === "continuous" && prev.what.ref === "self" && prev.duration === "game" && prev.giveTo?.ref === "target" && prev.mods.length === 1 && prev.mods[0]!.kind === "control")) return null;
      const reflexive = reflexiveBody([whenThey[1]!, ...sentences.slice(si + 1)].join(". "), ctx);
      if (!reflexive) return null;
      si = sentences.length;
      effects.push({ type: "if", cond: { kind: "selfHere", controlledByTarget: prev.giveTo.index ?? 0 }, effects: [{ type: "reflexive", body: reflexive }] });
      continue;
    }
    // "You may collect evidence 3. When you do, put a +1/+1 counter on target creature you control": a reflexive
    // trigger (CR 603.12), with targets of its own chosen as it's put on the stack. The rest of the ability is its.
    // "Search your library for a basic land card or Town card, put it onto the battlefield tapped, then shuffle. When you
    // search your library this way, ..." (Prishe's Wanderings): the search happens whenever the spell resolves, found
    // card or not (CR 701.23a), so it always triggers.
    const searched = /^When you search your library this way, (.+)$/.exec(s);
    const whenDo = /^When you do, (.+)$/.exec(s) ?? (searched && effects.length === 1 && effects[0]!.type === "search" && !effects[0]!.who ? searched : null);
    if (whenDo) {
      const prev = effects[effects.length - 1];
      // "Roll a d20. When you do, put X +1/+1 counters on each of up to two target creatures, where X is the result"
      // (Ancient Bronze Dragon): the roll always happens; the result goes with the reflexive trigger.
      const rolled = prev?.type === "roll" && !prev.chooseOne && effects.length === 1;
      // Wishing Well: "Put a coin counter on ~. When you do, ...": it's put if ~ is still on the battlefield. The rest of
      // the ability is the reflexive trigger's.
      const counted = prev?.type === "counters" && prev.what.ref === "self" && effects.length === 1 && !ctx.selfCard;
      // "You may sacrifice another creature. When you do, destroy target creature an opponent controls." (Cavalier of
      // Night), "you may discard a card. When you do, ..." : doing it triggers the reflexive ability (CR 603.12), so it's a
      // "you may" whose doing the engine can tell (see checkableMay).
      const mayDo = prev?.type === "may" && !prev.pay && !prev.otherwise && prev.effects.every(checkableMay) && effects.length >= 1;
      // "When ~ enters, sacrifice it. When you do, search ..." (Brokers Hideout), "At the beginning of your upkeep,
      // sacrifice ~. When you do, ..." (Smoke Bomb): done if ~ is still there as that object to be sacrificed (CR 400.7).
      const sacSelf = prev?.type === "sacrifice" && prev.what.ref === "self" && !prev.byController && !ctx.selfCard;
      // "Mill three cards. When you do, ..." (Wick's Patrol): only if all of them were milled; with fewer in the library,
      // you mill as many as you can but it doesn't trigger (rulings on Wick's Patrol; CR 701.17b).
      const milled = prev?.type === "mill" && prev.who.ref === "you" && typeof prev.n === "number" && prev.n > 0;
      // "Draw four cards. When you do, ..." (The Royal Scions): only if all of them were drawn; with fewer it doesn't
      // trigger, and with more (a replacement) it triggers once (rulings).
      const drew = prev?.type === "draw" && prev.who.ref === "you" && typeof prev.n === "number" && prev.n > 0 && effects.length === 1;
      // "Create a Food token. When you do, ..." (Eastfarthing Farmer): the token is created, so it triggers.
      const created = prev?.type === "createToken" && prev.who.ref === "you" && typeof prev.n === "number" && prev.n > 0 && !prev.attachTo;
      // "Create a Monster Role token attached to target creature you control. When you do, that creature fights ..." (Curse
      // of the Werefox): only if the Role was created attached to it, which "that creature" then is (rulings).
      const roleOn = prev?.type === "createToken" && prev.who.ref === "you" && prev.n === 1 && prev.attachTo?.ref === "target" && !prev.attachTo.n && effects.length === 1 ? prev.attachTo.index : undefined;
      // "Return target creature card from your graveyard to the battlefield. When you do, it fights ..." (Back for More):
      // only if it was returned, and "it" is the permanent it became (CR 400.7).
      const returned = prev?.type === "putOntoBattlefield" && ctx.lastPut && effects.length === 1;
      // "Sacrifice a creature. When you do, ..." (Tip the Scales): only if one was sacrificed, which "the sacrificed creature" is.
      const sacrificing = prev?.type === "pick" && prev.action === "sacrifice" && prev.who.ref === "you" && prev.n === 1 && !prev.unless;
      // "Amass Orcs 2. When you do, ..." (Foray of Orcs), "Earthbend 2. When you do, ..." (Earth Rumble): a player amassed
      // even if it did nothing (CR 701.47b); earthbending is done whenever the spell resolves, its land the only target.
      // "Reveal any number of Dragon cards from your hand. When you do, ..." (Invasion of Tarkir): revealing none is
      // revealing any number too, so it always triggers (rulings).
      // "Tap any number of untapped creatures you control. When you do, ..." (Teferi Akosa of Zhalfir, Yotia Declares War):
      // tapping none is doing it too, so it always triggers (rulings), with X the number tapped.
      // "Surveil 4. When you do, ..." (Dream Eater): with fewer cards in the library it triggers too (rulings).
      // "Put two +1/+1 counters on target creature. When you do, ..." (Dimension X Pizzasaur): its only target, so if the
      // ability resolves the counters are put (CR 608.2b).
      const countedTarget = prev?.type === "counters" && prev.what.ref === "target" && prev.what.index === 0 && ctx.targets.length === 1 && !ctx.targets[0]!.many && !ctx.targets[0]!.optional && typeof prev.n === "number" && prev.n > 0;
      const always = (whenDo === searched || countedTarget || prev?.type === "amass" || prev?.type === "surveil" || prev?.type === "revealFromHand" || prev?.type === "tapAnyNumber" || (prev?.type === "earthbend" && ctx.targets.length === 1 && ctx.spell)) && effects.length === 1;
      if (!rolled && !counted && !mayDo && !sacSelf && !milled && !drew && !created && roleOn === undefined && !returned && !sacrificing && !always) return null;
      // Mount Velus Manticore: "you may discard a card. When you do, ~ deals X damage to any target, where X is the number
      // of card types the discarded card has": that card's, counted as the reflexive ability triggers (its X, CR 603.12).
      const discTypes = mayDo && where?.[2] === "the number of card types the discarded card has" && prev.effects.length === 1 && prev.effects[0]!.type === "discard" && prev.effects[0]!.n === 1 && prev.effects[0]!.who.ref === "you" && !prev.effects[0]!.random;
      // Its own "where X is ..." goes with it.
      let whenText = [where && !discTypes ? `${whenDo[1]!}, where X is ${where[2]!}` : whenDo[1]!, ...sentences.slice(si + 1)].join(". ");
      // "Tap any number of untapped artifacts you control. When you do, this Saga deals that much damage to target
      // creature" (Yotia Declares War): one damage for each one tapped.
      if (prev?.type === "tapAnyNumber") whenText = whenText.replace(/\bdeals that much damage to\b/, "deals damage equal to the number of permanents tapped this way to");
      // Minsc & Boo: "~ deals X damage to any target, where X is that creature's power. If the sacrificed creature was a
      // Hamster, draw X cards.": the same X in the sentence after.
      const xLater = /^([^.]+), where X is ([^.,]+)\. (If [^.]+, )draw X cards$/.exec(whenText);
      if (xLater) whenText = `${xLater[1]}, where X is ${xLater[2]}. ${xLater[3]}draw cards equal to ${xLater[2]}`;
      si = sentences.length;
      // What the "you may" sacrificed, if the reflexive trigger is about it.
      const sacPick = mayDo && prev.effects.length === 1 && prev.effects[0]!.type === "pick" && prev.effects[0]!.action === "sacrifice";
      // "Put a quest counter on ~. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target
      // creature you control." (Earthbender Ascension): an intervening "if" (CR 603.4), checked as the reflexive ability
      // triggers and again as it resolves.
      const ifHas = counted ? new RegExp(`^if it has ${NUM} or more ${COUNTER} counters on it, (.+)$`).exec(whenText) : null;
      const ifHasCond = ifHas ? parseStaticCondition(`~ has ${ifHas[1]!} or more ${ifHas[2]!} counters on it`, { affects: { kind: "self" }, mods: [], text: "" }) : null;
      if (ifHas && !ifHasCond) return null;
      // "Create a 2/1 white Cat Warrior creature token. When you do, if you control a red permanent other than Ajani, he
      // deals ..." (Ajani, Nacatl Avenger): an intervening "if" (CR 603.4), checked as the reflexive ability triggers and
      // again as it resolves; "he" is the source.
      const ifControl = created ? /^if (you control [^,]+), (.+)$/.exec(whenText) : null;
      const ifControlCond = ifControl ? parseStaticCondition(ifControl[1]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
      if (ifControl && !ifControlCond) return null;
      const reflexive = reflexiveBody(ifHas ? ifHas[3]! : ifControl ? ifControl[2]!.replace(/^(?:he|she) deals /, "~ deals ") : whenText, ctx, sacPick || sacrificing, roleOn !== undefined || returned, discTypes);
      if (!reflexive) return null;
      if (discTypes) {
        effects.push({ type: "if", cond: { kind: "youDid" }, effects: [{ type: "reflexive", body: reflexive, xDiscardedTypes: true }] });
        continue;
      }
      // "Create a Food token. When you do, ...": each token of that kind created is doing it, so with a doubler it triggers
      // once for each (CR 603.12a; rulings on Ajani, Nacatl Avenger), and not for tokens a replacement made instead
      // (Divine Visitation's Angels). Not when it's about "that token" (which one would be ambiguous).
      const perToken = created && prev.n === 1 && !JSON.stringify(reflexive).includes('"ref":"created"') ? { perToken: prev.token } : {};
      if (ifControlCond) {
        reflexive.effects = [{ type: "if", cond: { kind: "state", cond: ifControlCond }, effects: reflexive.effects }];
        effects.push({ type: "if", cond: { kind: "state", cond: ifControlCond }, effects: [{ type: "reflexive", body: reflexive, ...perToken }] });
        continue;
      }
      if (ifHasCond) {
        reflexive.effects = [{ type: "if", cond: { kind: "state", cond: ifHasCond }, effects: reflexive.effects }];
        effects.push({ type: "if", cond: { kind: "selfHere" }, effects: [{ type: "if", cond: { kind: "state", cond: ifHasCond }, effects: [{ type: "reflexive", body: reflexive }] }] });
        continue;
      }
      if (sacrificing) {
        effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: [{ type: "reflexive", body: reflexive, sacrificed: true }] });
        continue;
      }
      if (roleOn !== undefined || returned) {
        effects.push({ type: "reflexive", body: reflexive, about: returned ? "created" : { target: roleOn!, attached: true } });
        continue;
      }
      const aboutSacrificed = sacPick && JSON.stringify(reflexive).includes('"ref":"sacrificed"');
      if (aboutSacrificed) {
        effects.push({ type: "if", cond: { kind: "youDid" }, effects: [{ type: "reflexive", body: reflexive, sacrificed: true }] });
        continue;
      }
      if (sacSelf) {
        effects.pop();
        effects.push({ type: "if", cond: { kind: "selfHere", yours: true }, effects: [prev, { type: "reflexive", body: reflexive }] });
        continue;
      }
      if (milled) {
        effects.pop();
        effects.push({ type: "if", cond: { kind: "libraryHas", n: prev.n as number }, effects: [prev, { type: "reflexive", body: reflexive }], otherwise: [prev] });
        continue;
      }
      if (drew) {
        effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "drawnThisWay" } }, min: prev.n as number }, effects: [{ type: "reflexive", body: reflexive }] });
        continue;
      }
      if (created || always) {
        effects.push({ type: "reflexive", body: reflexive, ...perToken });
        continue;
      }
      effects.push(rolled ? { type: "reflexive", body: reflexive } : { type: "if", cond: counted ? { kind: "selfHere" } : { kind: "youDid" }, effects: [{ type: "reflexive", body: reflexive }] });
      continue;
    }
    // Mnemonic Betrayal: "Exile all opponents' graveyards. You may cast spells from among those cards this turn, and mana
    // of any type can be spent to cast them." Each card exiled may be cast by you this turn (CR 601.2a), its colored mana
    // paid with any type (CR 609.4b); lands can't be cast.
    if (/^Exile all opponents' graveyards$/.test(s) && (sentences[si + 1] ?? "").replace(/\.$/, "") === "You may cast spells from among those cards this turn, and mana of any type can be spent to cast them") {
      effects.push({ type: "impulse", n: 0, until: "thisTurn", who: { ref: "eachOpponent" }, castOnly: true, anyType: true, graveyards: true });
      si++;
      continue;
    }
    // "At the beginning of the next end step, if any of those cards remain exiled, return them to their owners'
    // graveyards" (Mnemonic Betrayal): a delayed trigger (CR 603.7) with an intervening if (CR 603.4) about those cards.
    if (/^At the beginning of the next end step, if any of those cards remain exiled, return them to their owners' graveyards$/.test(s) && effects[effects.length - 1]?.type === "impulse") {
      effects.push({ type: "delayed", when: "nextEndStep", effects: [{ type: "exiledToGraveyard" }], text: "return those cards still exiled to their owners' graveyards" });
      continue;
    }
    // Glimpse the Impossible: "At the beginning of the next end step, if any of those cards remain exiled, put them into
    // your graveyard, then create a 0/1 colorless Eldrazi Spawn creature token for each card put into your graveyard this
    // way. Those tokens have "Sacrifice ~: Add {C}."": a delayed trigger about the cards just exiled to play, triggering
    // only if one is still there (CR 603.4, 603.7).
    // Selective Obliteration: "Each player chooses a color. Then exile each permanent unless it's colorless or it's only the
    // color its controller chose." In turn order (rulings), each player's color sparing only their own monocolored permanents.
    if (/^Each player chooses a color$/.test(s) && /^(?:Then e|E)xile each permanent unless it's colorless or it's only the color its controller chose\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "choose", choice: "color", each: true }, { type: "exile", what: { ref: "each", filter: { kind: "object", notOnlyControllersColor: true, text: "each permanent unless it's colorless or it's only the color its controller chose" } } });
      si++;
      continue;
    }
    const leftovers = /^At the beginning of the next end step, if any of those cards remain exiled, put them into your graveyard$/.test(s) && /^(Create an? .+? token) for each card put into your graveyard this way\.?$/.exec(sentences[si + 1] ?? "");
    const leftoverHave = leftovers && /^Those tokens have "([^"]+)"\.?$/.exec(sentences[si + 2] ?? "");
    if (leftovers && leftoverHave && effects[effects.length - 1]?.type === "impulse") {
      const made = parseOne(`${leftovers[1]!} with "${leftoverHave[1]!}"`, ctx);
      const token = made?.length === 1 ? made[0]! : undefined;
      if (token?.type !== "createToken" || token.n !== 1) return null;
      effects.push({ type: "delayed", when: "nextEndStep", effects: [{ type: "exiledToGraveyard" }, { ...token, n: { count: { kind: "movedLinkedThisWay" } } }], text: `put those cards still exiled into your graveyard, then ${leftovers[1]!.replace(/^C/, "c")} for each card put into your graveyard this way` });
      si += 2;
      continue;
    }
    // Dragonhawk, Fate's Tempest: "At the beginning of your next end step, ~ deals 2 damage to each opponent for each of
    // those cards that are still exiled." A delayed trigger (CR 603.7) counting only the cards this ability exiled to play
    // (rulings), as it resolves; one that left exile and came back is a new object (CR 400.7).
    const stillEx = /^At the beginning of (your|the) next end step, (~ deals (\d+) damage to each opponent) for each of those cards that are still exiled$/.exec(s);
    if (stillEx && effects[effects.length - 1]?.type === "impulse") {
      effects.push({ type: "delayed", when: stillEx[1] === "your" ? "yourNextEndStep" : "nextEndStep", effects: [{ type: "damage", amount: { count: { kind: "stillExiled" }, times: Number(stillEx[3]) }, to: { ref: "eachOpponent" } }], text: `${stillEx[2]!} for each of those cards that are still exiled` });
      continue;
    }
    // Gustha's Scepter: "Exile a card from your hand face down. You may look at it for as long as it remains exiled."
    if (/^You may look at it for as long as it remains exiled$/i.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exileFaceDown" || prev.from !== "handCard") return null;
      effects[effects.length - 1] = { ...prev, look: true };
      continue;
    }
    // "Put a shadow counter on target creature. For as long as that creature has a shadow counter on it, it's a Wraith in
    // addition to its other types" (Minas Morgul), "That land is an Island for as long as it has a flood counter on it"
    // (Quicksilver Fountain): an effect on what the counter was just put on, for as long as it has one of them (CR
    // 611.2b). Read as the "until end of turn" effect it would be, with that duration instead.
    const whileCtr =
      new RegExp(`^For as long as (that creature|that land|that permanent|it) has an? ${COUNTER} counter on it, (?:it's|it is) (.+)$`).exec(s) ??
      new RegExp(`^(That creature|That land|That permanent|It)(?: is|'s) (.+) for as long as it has an? ${COUNTER} counter on it$`).exec(s);
    if (whileCtr) {
      const [subject, counterWord, rest] = whileCtr[0]!.startsWith("For") ? [whileCtr[1]!, whileCtr[2]!, whileCtr[3]!] : [whileCtr[1]!, whileCtr[3]!, whileCtr[2]!];
      const prev = effects[effects.length - 1];
      const counter = counterKind(counterWord);
      const fx = parseSentence(`${capital(subject)} becomes ${rest} until end of turn`, ctx);
      const e = fx?.length === 1 ? fx[0]! : undefined;
      if (prev?.type !== "counters" || prev.counter !== counter || e?.type !== "continuous" || e.duration !== "endOfTurn" || JSON.stringify(e.what) !== JSON.stringify(prev.what)) return null;
      effects.push({ ...e, duration: "game", whileCounter: counter });
      continue;
    }
    // Ultima, Origin of Oblivion: "Put a blight counter on target land. For as long as that land has a blight counter on it,
    // it loses all land types and abilities and has "{T}: Add {C}."": its land types go (CR 305.7; card types and
    // supertypes stay, rulings), then all its abilities, then it has that one, all in this effect's timestamp.
    const blight = new RegExp(`^For as long as that land has an? ${COUNTER} counter on it, it loses all land types and abilities and has "(\\{T\\}: Add \\{[WUBRGC]\\}\\.)"$`).exec(s);
    if (blight) {
      const prev = effects[effects.length - 1];
      const counter = counterKind(blight[1]!);
      if (prev?.type !== "counters" || prev.counter !== counter || prev.what.ref !== "target") return null;
      effects.push({ type: "continuous", what: prev.what, mods: [{ kind: "setLandTypes", subtypes: [] }, { kind: "loseAllAbilities" }, { kind: "addAbility", text: blight[2]! }], duration: "game", whileCounter: counter });
      continue;
    }
    // "Put target creature card from a graveyard onto the battlefield under your control. That creature is a black Zombie in
    // addition to its other colors and types." (Rise from the Grave, Liliana, Death's Majesty, Dread Slaver): an effect on
    // the permanent the card became, from then on (CR 611.2c, 400.7); a later color or type change overwrites it (rulings).
    // "It's a Phyrexian in addition to its other types" (Portal to Phyrexia): the same.
    // Tishana's Tidebinder: "If an ability of an artifact, creature, or planeswalker is countered this way, that permanent
    // loses all abilities for as long as ~ remains on the battlefield": the ability's source, if it's one of those as this
    // resolves (rulings), from then on while ~ stays (CR 611.2b), whoever controls it.
    if (/^If an ability of an artifact, creature, or planeswalker is countered this way, that permanent loses all abilities for as long as ~ remains on the battlefield$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (ctx.spell || prev?.type !== "counterSpell" || prev.unless || !ctx.targets[prev.index]?.noSpells) return null;
      const filter: TargetSpec = { kind: "object", types: ["Artifact", "Creature", "Planeswalker"], notTypes: [], notColors: [], text: "artifact, creature, or planeswalker" };
      effects.push({ type: "continuous", what: { ref: "counteredSource", filter }, mods: [{ kind: "loseAllAbilities" }], duration: "whileControlled", whileOnBattlefield: true });
      continue;
    }
    // Zurgo Stormrender: "draw a card if it was attacking. Otherwise, each opponent loses 1 life": the token the trigger is
    // about, as it last existed (CR 608.2h).
    const wasAttacking = (ctx.subject || ctx.subjectIt) && !effects.length ? /^(.+) if it was attacking$/.exec(s) : null;
    const elseWas = wasAttacking && /^Otherwise, (.+?)\.?$/.exec(sentences[si + 1] ?? "");
    if (wasAttacking && elseWas) {
      const yes = parseOne(capital(wasAttacking[1]!), ctx);
      const no = parseOne(capital(elseWas[1]!), ctx);
      if (!yes || !no) return null;
      effects.push({ type: "if", cond: { kind: "subjectWasAttacking" }, effects: yes, otherwise: no });
      si++;
      continue;
    }
    // Settle the Wreckage: "Exile all attacking creatures target player controls. That player may search their library for
    // that many basic land cards, put those cards onto the battlefield tapped, then shuffle": as many as were exiled
    // (CR 608.2h); they may find fewer (rulings, CR 701.23b).
    const settleLands = /^That player may search their library for that many (basic land cards), put (?:them|those cards) onto the battlefield tapped, then shuffle$/.exec(s);
    if (settleLands) {
      const prev = effects[effects.length - 1];
      const fx = parseSearch(`Search your library for up to two ${settleLands[1]}, put them onto the battlefield tapped, then shuffle`);
      const sr = fx?.length === 1 && fx[0]!.type === "search" ? fx[0]! : undefined;
      if (prev?.type !== "exile" || prev.what.ref !== "each" || prev.what.of?.ref !== "target" || !sr || sr.type !== "search") return null;
      const exiled: TargetSpec = { kind: "object", types: prev.what.filter.types, notTypes: [], notColors: [], text: "creature" };
      effects.push({ type: "eachMay", who: prev.what.of, text: `search their library for that many ${settleLands[1]}`, effects: [{ ...sr, n: { count: { kind: "exiledThisWay", filter: exiled } }, who: { ref: "choseThisWay" } }] });
      continue;
    }
    // "They're Zombies in addition to their other types" after putting one target from each player's graveyard (Afterlife
    // from the Loam): each of them.
    const theyAre = /^They're ([A-Z][a-z]+)s in addition to their other types$/.exec(s);
    if (theyAre) {
      const prev = effects[effects.length - 1];
      const spec = prev?.type === "putOntoBattlefield" && prev.what.ref === "target" && !prev.what.n ? ctx.targets[prev.what.index] : undefined;
      const mods = parseBecomes(`a ${theyAre[1]} in addition to its other types`);
      if (prev?.type !== "putOntoBattlefield" || !spec?.perOpponent || !mods || prev.alsoMods) return null;
      prev.alsoMods = mods;
      continue;
    }
    // Oriq Loremage: "Search your library for a card, put it into your graveyard, then shuffle. If it's an instant or
    // sorcery card, put a +1/+1 counter on ~." The card found, wherever it went.
    const foundIs = /^If it's an? ([a-z]+(?: or [a-z]+)? card), (.+)$/.exec(s);
    const foundSearch = effects[effects.length - 1];
    if (foundIs && foundSearch?.type === "search" && foundSearch.n === 1 && !foundSearch.others && !foundSearch.who && !foundSearch.library) {
      const filter = parseSearchFilter(foundIs[1]!);
      const before = ctx.targets.length;
      const then = filter && parseOne(capital(foundIs[2]!), ctx);
      if (!filter || !then || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "searchFound", filter }, effects: then });
      continue;
    }
    // Grimoire of the Dead: "Put all creature cards from all graveyards onto the battlefield under your control. They're
    // black Zombies in addition to their other colors and types": all of them (as they enter, see returnAllFromGraveyard).
    const theyAreAll = /^They're (white|blue|black|red|green) ([A-Z][a-z]+)s in addition to their other colors and types$/.exec(s);
    if (theyAreAll) {
      const prev = effects[effects.length - 1];
      const mods = parseBecomes(`a ${theyAreAll[1]} ${theyAreAll[2]} in addition to its other colors and types`);
      if (prev?.type !== "returnAllFromGraveyard" || prev.toHand || !mods || prev.alsoMods) return null;
      prev.alsoMods = mods;
      continue;
    }
    // Chainer, Dementia Master: "That creature is black and is a Nightmare in addition to its other creature types": black
    // only, and a Nightmare too (rulings), as it enters.
    const blackAnd = /^That creature is (white|blue|black|red|green) and is an? ([A-Z][a-z]+) in addition to its other creature types$/.exec(s);
    if (blackAnd) {
      const prev = effects[effects.length - 1];
      const color = ({ white: "W", blue: "U", black: "B", red: "R", green: "G" } as const)[blackAnd[1] as "white"];
      if (prev?.type !== "putOntoBattlefield" || (prev.what.ref === "target" && prev.what.n) || prev.alsoMods || !CREATURE_TYPES.has(blackAnd[2]!)) return null;
      prev.alsoMods = [{ kind: "setColors", colors: [color] }, { kind: "addTypes", types: [], subtypes: [blackAnd[2]!] }];
      continue;
    }
    // Valkyrie's Call: "It has flying and is an Angel in addition to its other types": the same as "It's an Angel with
    // flying in addition to its other types".
    const hasAndIs = /^It has ([a-z]+) and is (an? [A-Z][a-z]+) in addition to its other types$/.exec(s);
    if (hasAndIs) s = `It's ${hasAndIs[2]} with ${hasAndIs[1]} in addition to its other types`;
    const isAlso = /^(?:That creature is|It's|It is|Each of them is|Each of those creatures is) (an? .+ in addition to its other (?:colors and )?types)$/.exec(s);
    if (isAlso) {
      const prev = effects[effects.length - 1];
      const mods = parseBecomes(isAlso[1]!);
      // Ghost Vacuum: "Each of them is a 1/1 Spirit ...": the cards it put onto the battlefield.
      if (prev?.type === "moveLinked" && /^Each of them/.test(s)) {
        if (prev.dest !== "battlefield" || !mods || prev.alsoMods) return null;
        prev.alsoMods = mods;
        continue;
      }
      // Storm of Souls: "Return all creature cards from your graveyard to the battlefield. Each of them is a 1/1 Spirit
      // with flying in addition to its other types": the permanents they became.
      if (prev?.type === "returnAllFromGraveyard" && /^Each of them/.test(s)) {
        if (prev.toHand || !mods || prev.alsoMods) return null;
        prev.alsoMods = mods;
        continue;
      }
      if (/^Each of them/.test(s)) return null;
      if (prev?.type === "returnDiedThisWay" && mods && !prev.alsoMods) {
        prev.alsoMods = mods;
        continue;
      }
      // Call a Surprise Witness: "Return target creature card ... to the battlefield. Put a flying counter on it. It's a
      // Spirit in addition to its other types": the same permanent, from then on (CR 611.2c).
      const put = effects[effects.length - 2];
      if (prev?.type === "counters" && prev.what.ref === "created" && put?.type === "putOntoBattlefield" && put.what.ref === "target" && !put.what.n && mods && !put.alsoMods && /^It/.test(s)) {
        put.alsoMods = mods;
        continue;
      }
      // Ever After: "Return up to two target creature cards ... Each of those creatures is a black Zombie ...": each of them.
      if (prev?.type !== "putOntoBattlefield" || !mods || (prev.what.ref === "target" && !!prev.what.n !== /^Each of those creatures/.test(s)) || (prev.what.ref !== "target" && /^Each of those creatures/.test(s)) || prev.alsoMods) return null;
      prev.alsoMods = mods;
      continue;
    }
    // Dance of the Manse: "If X is 6 or more, those permanents are 4/4 creatures in addition to their other types": they
    // enter as 4/4 creatures, not as noncreatures that then become creatures (rulings).
    const xEntersAs = /^If X is (\d+) or more, those permanents are (\d+\/\d+) creatures in addition to their other types$/.exec(s);
    if (xEntersAs) {
      const prev = effects[effects.length - 1];
      const mods = parseBecomes(`a ${xEntersAs[2]} creature in addition to its other types`);
      if (!ctx.spell || ctx.whereX || prev?.type !== "putOntoBattlefield" || !mods || prev.alsoMods || prev.entersAs) return null;
      prev.entersAs = { mods, x: Number(xEntersAs[1]) };
      continue;
    }
    // "Sacrifice the creature when you lose control of ~" (Seraph): about the permanent the card just put onto the
    // battlefield became, a delayed trigger watching ~ (CR 603.7).
    if (/^Sacrifice (?:it|the creature|that creature) when you lose control of ~$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "putOntoBattlefield" || prev.sacrificeOnLostControl || prev.owner) return null;
      prev.sacrificeOnLostControl = true;
      continue;
    }
    // Gilded Drake: "If you don't or can't make an exchange, sacrifice ~." Whether its exchange happened (CR 701.12b).
    if (s === "If you don't or can't make an exchange, sacrifice ~" && effects[effects.length - 1]?.type === "exchangeControl") {
      effects.push({ type: "if", cond: { kind: "youDid" }, effects: [], otherwise: [{ type: "sacrifice", what: { ref: "self" } }] });
      continue;
    }
    // "This ability still resolves if its target becomes illegal" (Gilded Drake): not removed by CR 608.2b.
    if (s === "This ability still resolves if its target becomes illegal" && si === sentences.length - 1 && ctx.targets.length) {
      resolvesAnyway = true;
      continue;
    }
    // Rona, Tolarian Obliterator: "that source's controller exiles a card from their hand at random. If it's a land card,
    // you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost."
    if (/^[Tt]hat player exiles a card from their hand at random$/.test(s) && ctx.eventPlayer && sentences[si + 1]?.replace(/\.$/, "") === "If it's a land card, you may put it onto the battlefield under your control" && sentences[si + 2]?.replace(/\.$/, "") === "Otherwise, you may cast it without paying its mana cost") {
      effects.push({ type: "exileRandomThenPlay", who: { ref: "eventPlayer" } });
      si += 2;
      continue;
    }
    // Illusionist's Gambit: "After this phase, there is an additional combat phase. Each of those creatures attacks that
    // combat if able. They can't attack you or planeswalkers you control that combat." Those it removed from combat.
    if (/^After this phase, there is an additional combat phase$/.test(s) && sentences[si + 1]?.replace(/\.$/, "") === "Each of those creatures attacks that combat if able" && sentences[si + 2]?.replace(/\.$/, "") === "They can't attack you or planeswalkers you control that combat" && effects.some((e) => e.type === "removeFromCombat" && e.remember)) {
      effects.push({ type: "addPhases", phases: ["combat"], thoseAttack: true });
      si += 2;
      continue;
    }
    const ifDid = /^If you (do|don't), (.+)$/.exec(s);
    if (ifDid) {
      const prev = effects[effects.length - 1];
      // "Sacrifice another creature. If you do, ..., where X is that creature's power" (Disciple of Bolas): you must if you can.
      const mustSac = ifDid[1] === "do" && prev?.type === "pick" && prev.action === "sacrifice" && prev.who.ref === "you" && prev.n === 1 && !prev.unless;
      // Volatile Stormdrake: "Exchange control of ~ and target creature an opponent controls. If you do, you get {E}{E}{E}{E},
      // then sacrifice that creature unless ...": both depend on the exchange having happened (rulings).
      const energyThen = ifDid[1] === "do" && prev?.type === "exchangeControl" ? /^you get ((?:\{E\})+), then (.+)$/.exec(ifDid[2]!) : null;
      if (energyThen) {
        const rest = parseOne(capital(energyThen[2]!), ctx);
        if (!rest) return null;
        effects.push({ type: "if", cond: { kind: "youDid" }, effects: [{ type: "getEnergy", who: { ref: "you" }, n: energyThen[1]!.length / 3 }, ...rest] });
        continue;
      }
      // The Misty Mountains Cold: "Then if you control four or more Treasures, sacrifice this Saga. If you do, create a 6/6
      // red Dragon creature token with flying": only if it was sacrificed, which needs the condition first.
      const condSac = ifDid[1] === "do" && prev?.type === "if" && !prev.otherwise && prev.effects.length === 1 ? prev.effects[0] : undefined;
      // Charitable Levy: "If you do, draw a card, then you may search ...": several instructions.
      if (condSac?.type === "sacrifice" && condSac.what.ref === "self") {
        const inner = attempt(ctx, () => parseOne(capital(ifDid[2]!), ctx)) ?? attempt(ctx, () => parseThen(capital(ifDid[2]!), ctx, true));
        if (!inner) return null;
        (prev as Extract<Effect, { type: "if" }>).effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: inner });
        continue;
      }
      // "You may put a land card from your hand onto the battlefield. If you don't, draw a card." (Hakbal of the Surging
      // Soul): whether a card was put. Metathran Aerostat: "You may put a creature card with mana value X from your hand onto
      // the battlefield. If you do, return ~ to its owner's hand." the same.
      if (prev?.type === "putFromHand" && prev.may && !prev.who && !prev.any && prev.upTo === undefined && !prev.drawRepeat) {
        const inner = parseOne(capital(ifDid[2]!), ctx);
        if (!inner) return null;
        effects.push(ifDid[1] === "don't" ? { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner } : { type: "if", cond: { kind: "youDid" }, effects: inner });
        continue;
      }
      const putMay = prev?.type === "may" && !prev.pay && !prev.otherwise && prev.effects.length === 1 ? prev.effects[0] : undefined;
      if (ifDid[1] === "do" && putMay?.type === "putFromHand" && !putMay.may && !putMay.who && !putMay.any && putMay.upTo === undefined && !putMay.drawRepeat) {
        const inner = parseOne(capital(ifDid[2]!), ctx);
        if (!inner) return null;
        effects[effects.length - 1] = { ...putMay, may: true };
        effects.push({ type: "if", cond: { kind: "youDid" }, effects: inner });
        continue;
      }
      // "You may ... If you do, X. If you don't, Y." (Slicer, Hired Muscle): Y is the other branch of the same check.
      const before = effects[effects.length - 2];
      if (ifDid[1] === "don't" && prev?.type === "if" && prev.cond.kind === "youDid" && prev.effects.length && !prev.otherwise && before?.type === "may" && !before.pay && before.effects.every(checkableMay)) {
        const inner = parseOne(capital(ifDid[2]!), ctx);
        if (!inner) return null;
        prev.otherwise = inner;
        continue;
      }
      // "You may mill that many cards. If you do, you may put a creature card from among them into your hand" (Barrowgoyf):
      // part of milling, one of the cards milled if any matches.
      const milledPick = ifDid[1] === "do" && prev?.type === "may" && !prev.pay && prev.effects.length === 1 && prev.effects[0]!.type === "mill" && prev.effects[0]!.who.ref === "you" ? /^you may put (an? .+?) from among them into your hand$/.exec(ifDid[2]!) : null;
      if (milledPick) {
        const filter = parseSearchFilter(milledPick[1]!.replace(/^an? /, ""));
        if (filter === null) return null;
        (prev as Extract<Effect, { type: "may" }>).effects.push({ type: "chooseFromGraveyard", n: 1, upTo: true, milled: true, ...(filter ? { filter } : {}) });
        continue;
      }
      // "Discard a card. If you do, draw a card." (Shadow of the Goblin): not optional; done if a card was discarded (with
      // an empty hand, none is, CR 701.9b).
      if (ifDid[1] === "do" && prev?.type === "discard" && prev.who.ref === "you" && prev.n === 1 && !prev.upTo && !prev.filter && !prev.hand && !prev.downToFewest && !prev.exile) {
        const inner = parseOne(capital(ifDid[2]!), ctx);
        if (!inner) return null;
        effects.push({ type: "if", cond: { kind: "discardedThisWayIs", filter: { kind: "object", types: [], notTypes: [], notColors: [], text: "card" } }, effects: inner });
        continue;
      }
      // Sarulf, Realm Eater: "you may remove all of them. If you do, exile ... the number of counters removed this way": only
      // if any were removed (rulings: none if it's left the battlefield or has none as this resolves).
      const mayRemove = prev?.type === "may" && !prev.pay && !prev.otherwise && prev.effects.length === 1 && prev.effects[0]!.type === "removeCounters" && prev.effects[0]!.what.ref === "self" && prev.effects[0]!.n === "all" ? prev.effects[0]! : undefined;
      if (ifDid[1] === "do" && mayRemove?.type === "removeCounters" && !ctx.spell) {
        const inner = parseOne(capital(ifDid[2]!), { ...ctx, removedCounters: true });
        if (!inner) return null;
        mayRemove.setsDid = true;
        (prev as Extract<Effect, { type: "may" }>).effects.push({ type: "if", cond: { kind: "youDid" }, effects: inner });
        continue;
      }
      // "Remove a hope counter from ~. If you do, draw a card." (Dawn of a New Age): not optional, and done only if that
      // many counters were removed (CR 608.2c).
      if (ifDid[1] === "do" && prev?.type === "removeCounters" && prev.what.ref === "self" && typeof prev.n === "number" && !ctx.spell) {
        const inner = parseOne(capital(ifDid[2]!), ctx);
        if (!inner) return null;
        prev.setsDid = true;
        effects.push({ type: "if", cond: { kind: "youDid" }, effects: inner });
        continue;
      }
      // "Return it to its owner's hand. If you do, you may search your library ..." (Cartographer's Hawk): not optional, and
      // done only if it was returned (rulings: not if it had left the battlefield).
      if (ifDid[1] === "do" && prev?.type === "bounce" && prev.what.ref === "self" && !ctx.spell) {
        const mayThen = /^you may (.+)$/.exec(ifDid[2]!);
        const inner = parseOne(capital(mayThen ? mayThen[1]! : ifDid[2]!), ctx);
        if (!inner) return null;
        prev.setsDid = true;
        effects.push({ type: "if", cond: { kind: "youDid" }, effects: mayThen ? [{ type: "may", effects: inner, text: mayThen[1]! }] : inner });
        continue;
      }
      // Rysorian Badger: "If you do, you gain 1 life for each card exiled this way and ~ assigns no combat damage this turn":
      // both depend on it (CR 510.1: an attacking creature that assigns no combat damage deals none).
      const noDamage = ifDid[1] === "do" ? /^(.+) and ~ assigns no combat damage this turn$/.exec(ifDid[2]!) : null;
      const thenFx = (): Effect[] | null => {
        const fx = parseOne(capital(noDamage ? noDamage[1]! : ifDid[2]!), ctx);
        return fx && noDamage ? [...fx, { type: "noCombatDamage", what: { ref: "self" } }] : fx;
      };
      // Floral Spuzzem: "you may destroy target artifact defending player controls. If you do, ...": only if it was
      // destroyed. An indestructible permanent can't be (CR 702.12b), and regeneration replaces it (CR 701.19a).
      const destroyed = prev?.type === "may" && !prev.pay && !prev.otherwise && prev.effects.length === 1 ? prev.effects[0]! : undefined;
      if (ifDid[1] === "do" && destroyed?.type === "destroy" && destroyed.what.ref === "target" && !destroyed.what.n && ctx.targets[destroyed.what.index]?.kind === "object") {
        const inner = thenFx();
        if (!inner) return null;
        effects.push({ type: "if", cond: { kind: "destroyedThisWay" }, effects: inner });
        continue;
      }
      // Uchuulon: "Exile up to one target creature card from an opponent's graveyard. If you do, create a token that's a copy
      // of ~": only if a card was exiled (none chosen, or the target gone, and it wasn't).
      // Also "You may exile target creature card from a graveyard. If you do, ..." (Boneclad Necromancer): declined, none is.
      const exiled = prev?.type === "may" && !prev.pay && prev.effects.length === 1 ? prev.effects[0]! : prev;
      if (ifDid[1] === "do" && exiled?.type === "exile" && !exiled.until && !exiled.linked && !exiled.ownerMay && !exiled.youMay && exiled.what.ref === "target" && (!exiled.what.n || noDamage) && ctx.targets[exiled.what.index]?.kind === "card") {
        const inner = thenFx();
        if (!inner) return null;
        effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "cardsExiledThisWay" } }, min: 1 }, effects: inner });
        continue;
      }
      // "You may exile target creature. If you do, create a Gold token." (King Macar): only if it was exiled (not if a
      // commander went to the command zone instead, CR 903.9b).
      if (ifDid[1] === "do" && exiled?.type === "exile" && !exiled.until && !exiled.linked && !exiled.ownerMay && !exiled.youMay && exiled.what.ref === "target" && !exiled.what.n && ctx.targets[exiled.what.index]?.kind === "object") {
        const inner = parseOne(capital(ifDid[2]!), ctx);
        if (!inner) return null;
        effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "exiledThisWay", filter: { kind: "object", types: [], notTypes: [], notColors: [], text: "permanent" } } }, min: 1 }, effects: inner });
        continue;
      }
      // "You may exile an artifact or creature card from your hand. If you do, create a token that's a copy of the exiled
      // card" (Nexus of Becoming): only if a card was exiled, which can't be with none that fits in hand (CR 609.3).
      const fromHand = prev?.type === "may" && !prev.pay && !prev.otherwise && prev.effects.length === 1 ? prev.effects[0]! : undefined;
      if (ifDid[1] === "do" && fromHand?.type === "takeFromHand" && fromHand.who.ref === "you" && fromHand.action === "exile" && (fromHand.n === undefined || fromHand.n === 1) && !fromHand.upTo && !fromHand.until && !fromHand.ownerMay && !fromHand.plot && !fromHand.linked && !noDamage && !where) {
        const inner = parseOne(capital(ifDid[2]!), { ...ctx, mayExiledFromHand: true });
        if (!inner) return null;
        effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "tookFromHand" } }, min: 1 }, effects: inner });
        continue;
      }
      // "You may exile a creature card from your graveyard. If you do, exile target artifact or enchantment an opponent
      // controls" (Masked Vandal): whether a card was exiled.
      if (!mustSac && (prev?.type !== "may" || prev.pay || !prev.effects.every(checkableMay))) return null;
      // "You may sacrifice an artifact, creature, ... If you do, each opponent may sacrifice a permanent of their choice that
      // shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card." (Braids,
      // Arisen Nightmare): a punisher, its penalty once for each opponent who doesn't, "it" being what was sacrificed.
      const oppNot = ifDid[1] === "do" && /^each opponent may sacrifice a permanent of their choice that shares a card type with it$/.test(ifDid[2]!) && prev.type === "may" && prev.effects.length === 1 && prev.effects[0]!.type === "pick" && prev.effects[0]!.action === "sacrifice" ? /^For each opponent who doesn't, that player loses (\d+) life(?: and (you .+))?$/.exec(sentences[si + 1] ?? "") : null;
      // "And you draw a card": once for each of them (the penalty runs once for all of them, see the punisher effect).
      const rest0 = oppNot?.[2] ? parseOne(capital(oppNot[2]), ctx) : [];
      const rest = rest0?.every((e) => e.type === "draw" && e.who.ref === "you" && typeof e.n === "number") ? rest0.map((e) => (e.type === "draw" ? { ...e, n: { count: { kind: "punished" as const }, times: e.n as number } } : e)) : null;
      if (oppNot && rest) {
        const filter: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], sharesTypeWithSacrificed: true, text: "permanent that shares a card type with it" };
        effects.push({ type: "if", cond: { kind: "youDid" }, effects: [{ type: "punisher", who: { ref: "eachOpponent" }, options: [{ sacrifice: filter }], effects: [{ type: "loseLife", who: { ref: "punished" }, n: Number(oppNot[1]) }, ...rest], thenText: `loses ${oppNot[1]} life${oppNot[2] ? ` and ${oppNot[2]}` : ""}` }] });
        si++;
        continue;
      }
      // "You may sacrifice another creature. If you do, you gain X life and draw X cards, where X is that creature's power."
      // (Disciple of Freyalise): the sacrificed creature as it last existed (CR 608.2h), its power and nothing else.
      const sacPick = mustSac || (ifDid[1] === "do" && prev.type === "may" && prev.effects.length === 1 && prev.effects[0]!.type === "pick" && prev.effects[0]!.action === "sacrifice");
      const all = `${ifDid[2]!}${where ? `, where X is ${where[2]!}` : ""}`;
      // Shadow, Mysterious Assassin: "... sacrifice another nonland permanent. If you do, ... the mana value of the sacrificed
      // permanent", the same.
      const sacIt = sacPick && /\b(?:that creature|the sacrificed (?:creature|permanent))'s (?:power|toughness|mana value)\b|\b(?:power|toughness|mana value) of the sacrificed (?:creature|permanent)\b/.test(all) && !/\bthat creature(?!'s (?:power|toughness|mana value)\b)/.test(all) && !ctx.sacrificedIt;
      if (sacIt) ctx.sacrificedIt = true;
      // Party Thrasher: "If you do, exile the top two cards of your library, then choose one of them. You may play that
      // card this turn." The permission is about the card chosen, so it depends on the discard too.
      const choosePlay = ifDid[1] === "do" && /^You may play that card this turn$/.test(sentences[si + 1] ?? "") ? new RegExp(`^exile the top (${NUM}) cards of your library, then choose one of them$`).exec(ifDid[2]!) : null;
      if (choosePlay) si++;
      // Redcap Gutter-Dweller: "If you do, put a +1/+1 counter on ~ and exile the top card of your library. You may play that
      // card this turn." The exile and the permission both depend on it.
      const andPlay = ifDid[1] === "do" && !choosePlay && /^You may play that card this turn$/.test(sentences[si + 1] ?? "") ? /^(.+) and exile the top card of your library$/.exec(ifDid[2]!) : null;
      if (andPlay) {
        const first = parseOne(capital(andPlay[1]!), ctx);
        if (!first || first.some((x) => pauses(x))) return null;
        si++;
        effects.push({ type: "if", cond: { kind: sacIt || mustSac ? "sacrificedThisWay" : "youDid" }, effects: [...first, { type: "impulse", n: 1, until: "thisTurn" }] });
        if (sacIt) delete ctx.sacrificedIt;
        if (!defineX()) return null;
        continue;
      }
      // The Master, Gallifrey's End: "If you do, choose an opponent with the most life among your opponents. That player
      // faces a villainous choice — ...": the choice and what that player does both depend on it.
      const chooseThat = ifDid[1] === "do" && !choosePlay && /^choose an opponent(?: with the most life among your opponents)?$/.test(ifDid[2]!) && /^That player /.test(sentences[si + 1] ?? "") && !ctx.chosenOpponent && !ctx.eventPlayer && ctx.lastPlayerTarget === undefined;
      if (chooseThat) {
        ctx.chosenOpponent = true;
        const then = parseOne(sentences[si + 1]!.replace(/\.$/, ""), ctx);
        if (!then) return null;
        si++;
        effects.push({ type: "if", cond: { kind: "youDid" }, effects: [{ type: "choose", choice: "opponent", ...(/ most life /.test(ifDid[2]!) ? { mostLife: "opponents" as const } : {}) }, ...then] });
        continue;
      }
      // "If you do, scry 2, then draw a card" (Lord Skitter's Butcher): an "if" keeps its place among its instructions, so
      // one that waits on a player may come before another.
      const inner = choosePlay ? [{ type: "impulse" as const, n: amt(choosePlay[1]!), until: "thisTurn" as const, choose: true as const }] : attempt(ctx, thenFx) ?? (ifDid[1] === "do" && !noDamage ? attempt(ctx, () => parseThen(capital(ifDid[2]!), ctx, true)) : null);
      if (inner) effects.push(ifDid[1] === "do" ? { type: "if", cond: { kind: sacIt || mustSac ? "sacrificedThisWay" : "youDid" }, effects: inner } : { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner });
      // Its own "where X is ..." (CR 107.3c).
      const ok = !!inner && defineX();
      if (sacIt) delete ctx.sacrificedIt;
      if (!ok) return null;
      continue;
    }
    // Ludevic, Necro-Alchemist: "that player may draw a card if a player other than you lost life this turn": checked only
    // as it resolves (rulings), any other player, the one whose turn it is too (an opponent: Commander has no teams).
    const otherLost = /^([Tt]hat player may draw a card) if a player other than you lost life this turn$/.exec(s);
    if (otherLost) {
      const inner = parseOne(capital(otherLost[1]!), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "opponentLostLife" } }, effects: inner });
      continue;
    }
    // Ashling, the Extinguisher: "choose target creature that player controls. The player sacrifices that creature.": the
    // target is controlled by that player as it resolves, or it's illegal (CR 608.2b), so its controller sacrifices it.
    if (/^[Cc]hoose target creature that player controls$/.test(s) && /^The player sacrifices that creature\.?$/.test(sentences[si + 1] ?? "") && ctx.eventPlayer) {
      const what = parseObject("target creature that player controls", ctx);
      if (what?.ref !== "target") return null;
      effects.push({ type: "sacrifice", what, byController: true });
      si++;
      continue;
    }
    // Arcum Dagsson: "Target artifact creature's controller sacrifices it. That player may search their library for a
    // noncreature artifact card, put it onto the battlefield, then shuffle.": the target's controller as it resolves; they
    // search even if it isn't sacrificed, but not if the target is illegal, when nothing happens (rulings, CR 608.2b).
    const sacTarget = /^Target ([a-z ]+)'s controller sacrifices it$/.exec(s);
    if (sacTarget && !ctx.targets.length) {
      const what = parseObject(`target ${sacTarget[1]}`, ctx);
      if (what?.ref !== "target" || what.n || ctx.targets[what.index]?.kind !== "object") return null;
      effects.push({ type: "sacrifice", what, byController: true });
      const search = /^That player (may search their library for .+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (search) {
        const inner = parseOne(`Its controller ${search[1]}`, ctx);
        if (!inner) return null;
        effects.push(...inner);
        si++;
      }
      continue;
    }
    // Unravel: "Counter target spell. If the amount of mana spent to cast that spell was less than its mana value, you draw a
    // card.": the countered spell as it last existed on the stack (CR 608.2h), X in its mana value (CR 202.3e).
    const spentLess = /^If the amount of mana spent to cast that spell was less than its mana value, (.+)$/.exec(s);
    if (spentLess && effects.at(-1)?.type === "counterSpell" && ctx.spell) {
      const countered = effects.at(-1) as Extract<Effect, { type: "counterSpell" }>;
      const inner = parseOne(capital(spentLess[1]!), ctx);
      const spent = parseCount("the amount of mana spent to cast that spell", ctx);
      const mv = parseCount("that spell's mana value", ctx);
      const on = (a: Amount | null) => {
        const of = a && typeof a === "object" && "count" in a && "of" in a.count ? (a.count.of as ObjRef) : undefined;
        return of?.ref === "target" && of.index === countered.index;
      };
      if (!inner || !spent || !mv || !on(spent) || !on(mv) || typeof spent !== "object" || !("count" in spent)) return null;
      effects.push({ type: "if", cond: { kind: "amountsCompare", a: mv, atLeast: { ...spent, plus: 1 } }, effects: inner });
      continue;
    }
    // Reject Imperfection: "Counter target spell. If that spell's mana value was 3 or less, proliferate.": the countered
    // spell as it last existed on the stack (CR 608.2h), X included (CR 202.3e).
    const mvWas = new RegExp(`^If that spell's mana value was ${NUM} or (less|greater), (.+)$`).exec(s);
    const countered = effects.at(-1);
    if (mvWas && countered?.type === "counterSpell" && ctx.spell) {
      const inner = parseOne(capital(mvWas[3]!), ctx);
      const mv = parseCount("that spell's mana value", ctx);
      if (!inner || !mv || typeof mv !== "object" || !("count" in mv) || mv.count.kind !== "manaValue" || mv.count.of.ref !== "target" || mv.count.of.index !== countered.index) return null;
      const n = num(mvWas[1]!);
      effects.push({ type: "if", cond: { kind: "amountNow", amount: mv, ...(mvWas[2] === "less" ? { max: n } : { min: n }) }, effects: inner });
      continue;
    }
    // "Create four Bear tokens instead if there are seven or more cards in your graveyard" (threshold) is
    // "If there are seven or more cards in your graveyard, create four Bear tokens instead."
    const insteadIf = /^(.+) instead if ([^,]+)$/.exec(s);
    if (insteadIf) s = `If ${insteadIf[2]}, ${insteadIf[1]!.charAt(0).toLowerCase()}${insteadIf[1]!.slice(1)} instead`;
    // "Draw another card if you've completed a dungeon" (Imoen): "If you've completed a dungeon, draw a card". "Target
    // creature an opponent controls gets -4/-4 until end of turn if you gained life this turn" (Poisoner's Apprentice):
    // the target is chosen either way, and the condition checked as it resolves (rulings). Only a
    // condition about the game (one the static parser reads), not about "it".
    // Sorin, Ravenous Neonate: "Gain control of target creature. ... Put a lifelink counter on it if you control a white
    // permanent other than that creature or ~": another white permanent you control, not counting the target either.
    const otherThat = /^(Put .+ on it) if you control an? ((?:white|blue|black|red|green) permanent) other than that creature or ~$/.exec(s);
    if (otherThat) {
      const inner = parseOne(otherThat[1]!, ctx);
      const what = inner?.length === 1 && "what" in inner[0]! ? (inner[0] as { what: ObjRef }).what : undefined;
      const cond = parseStaticCondition(`you control another ${otherThat[2]}`, { affects: { kind: "self" }, mods: [], text: "" });
      if (!inner || what?.ref !== "target" || cond?.kind !== "control") return null;
      effects.push({ type: "if", cond: { kind: "state", cond: { ...cond, otherThanSubject: true }, subject: what }, effects: inner });
      continue;
    }
    // Swirling Sandstorm: "~ deals 5 damage to each creature without flying if there are seven or more cards in your graveyard".
    const trailIf = !insteadIf ? /^((?:[Dd]raw|[Dd]iscard|(?:[Yy]ou )?[Cc]reate|[Yy]ou gain|[Ee]ach opponent loses|Its controller loses|[Pp]ut|[Tt]arget [^,]+ gets|~ deals \d+ damage to each (?!target)[^,]+?) .+) if ((?!it\b|~|that\b(?! player (?:has|controls) more [a-z ]+ than each other player$)|they\b|able\b)[^,]+)$/.exec(s) : null;
    if (trailIf && parseStaticCondition(trailIf[2]!, { affects: { kind: "self" }, mods: [], text: "" }))
      s = `If ${trailIf[2]}, ${trailIf[1]!.charAt(0).toLowerCase()}${trailIf[1]!.slice(1)}`;
    // "It deals that much damage to each other opponent if ~'s power is 7 or greater" (Vincent), "Then if ~'s power is 4
    // or greater, draw a card" (Jor Kadeen): ~'s power as the ability resolves, or as it last existed on the battlefield
    // once it has left (CR 608.2h; rulings on Vincent). "Its" is ~ only where "it" is.
    // Tribute to the World Tree: "draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it": the
    // trigger's subject as it resolves (CR 608.2c), or as it last existed.
    const subjPT = ctx.subjectIt && !ctx.spell ? new RegExp(`^(.+) if its (power|toughness) is ${NUM} or (greater|less)$`).exec(s) : null;
    if (subjPT && !/\binstead$/.test(subjPT[1]!) && !/\b(?:it|its|that creature)\b/.test(subjPT[1]!)) {
      const inner = parseOne(capital(subjPT[1]!), ctx);
      if (!inner) return null;
      const n = num(subjPT[3]!);
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "subjectPT", stat: subjPT[2] as "power" | "toughness", ...(subjPT[4] === "less" ? { max: n } : { min: n }) } }, effects: inner });
      continue;
    }
    // Anax, Hardened in the Forge: "create a 1/1 red Satyr creature token ... If the creature had power 4 or greater, create
    // two of those tokens instead": the creature that died, its power as it last existed (CR 603.10a).
    const hadPower = !ctx.spell ? new RegExp(`^If the creature had power ${NUM} or greater, create (two|three) of those tokens instead$`).exec(s) : null;
    const tokenPrev = effects[effects.length - 1];
    if (hadPower && tokenPrev?.type === "createToken" && tokenPrev.n === 1 && tokenPrev.who.ref === "you" && effects.length === 1) {
      effects[effects.length - 1] = { type: "if", cond: { kind: "amountsCompare", a: { count: { kind: "power", of: { ref: "subject" } } }, atLeast: num(hadPower[1]!) }, effects: [{ ...tokenPrev, n: num(hadPower[2]!) }], otherwise: [tokenPrev] };
      continue;
    }
    // Shelinda, Yevon Acolyte: "put a +1/+1 counter on that creature if its power is less than ~'s power. Otherwise, put a
    // +1/+1 counter on ~": both powers as it resolves, each as it last existed if it has left (CR 608.2h).
    const lessThanSelf = (ctx.subject || ctx.subjectIt) && !ctx.spell ? /^(put an? (?:\+1\/\+1|[a-z]+) counter on that creature) if its power is less than ~'s power$/i.exec(s) : null;
    if (lessThanSelf) {
      const a = parseCount("~'s power", ctx);
      const b = parseCount("that creature's power", ctx);
      const inner = parseOne(capital(lessThanSelf[1]!), ctx);
      if (!a || !b || typeof b !== "object" || !inner) return null;
      effects.push({ type: "if", cond: { kind: "amountsCompare", a, atLeast: { ...b, plus: (b.plus ?? 0) + 1 } }, effects: inner });
      continue;
    }
    // Yorvo, Lord of Garenbrig: "Then if that creature's power is greater than ~'s power, put another +1/+1 counter on ~":
    // both as the ability resolves, after the first counter, the entering creature as it last existed if it has left
    // (rulings; CR 608.2h).
    const subjVsSelf = ctx.subject && !ctx.spell ? /^(?:Then )?[Ii]f that creature's power is greater than ~'s power, put another (\+1\/\+1) counter on ~$/.exec(s) : null;
    if (subjVsSelf) {
      const a = parseCount("that creature's power", ctx);
      const b = parseCount("~'s power", ctx);
      const inner = parseOne(`Put a ${subjVsSelf[1]} counter on ~`, ctx);
      if (!a || !b || typeof b !== "object" || !inner) return null;
      effects.push({ type: "if", cond: { kind: "amountsCompare", a, atLeast: { ...b, plus: (b.plus ?? 0) + 1 } }, effects: inner });
      continue;
    }
    // "Then destroy all other creatures if its power is exactly 20" (Amalia Benavides Aguirre): both bounds.
    const trailPT = !ctx.spell && !ctx.subjectIt ? new RegExp(`^(.+) if (~'s|its) (power|toughness) is (?:${NUM} or (greater|less)|exactly ${NUM})$`).exec(s) : null;
    const leadPT = !ctx.spell && !ctx.subjectIt && !trailPT ? new RegExp(`^If (~'s|its) (power|toughness) is ${NUM} or (greater|less), (.+)$`).exec(s) : null;
    const selfPTIf = trailPT ? { then: trailPT[1]!, whose: trailPT[2]!, stat: trailPT[3]!, n: trailPT[4] ?? trailPT[6]!, cmp: trailPT[5] ?? "exactly" } : leadPT ? { then: leadPT[5]!, whose: leadPT[1]!, stat: leadPT[2]!, n: leadPT[3]!, cmp: leadPT[4]! } : null;
    // Lily Bowen: "double the number of +1/+1 counters on ~ if its power is 16 or less": "its" is the ~ just named, when
    // nothing else is.
    const namesSelfOnly = !!selfPTIf && /~/.test(selfPTIf.then) && !/\b(?:target|that|those|it|them|another|each|all)\b/.test(selfPTIf.then);
    if (selfPTIf && (selfPTIf.whose === "~'s" || ctx.selfIt || namesSelfOnly) && !/\binstead$/.test(selfPTIf.then)) {
      const inner = parseOne(capital(selfPTIf.then), ctx);
      if (!inner) return null;
      const n = num(selfPTIf.n);
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "selfPT", stat: selfPTIf.stat as "power" | "toughness", ...(selfPTIf.cmp === "less" ? { max: n } : selfPTIf.cmp === "exactly" ? { min: n, max: n } : { min: n }) } }, effects: inner });
      continue;
    }
    // Twenty-Toed Toad: "you win the game if there are twenty or more counters on it or you have twenty or more cards in
    // hand": counters of any kind on it, or the hand, as it resolves.
    const toad = !ctx.spell ? new RegExp(`^[Yy]ou win the game if there are ${NUM} or more counters on (?:it|~) or you have ${NUM} or more cards in hand$`).exec(s) : null;
    if (toad) {
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "anyOf", conds: [{ kind: "selfCounters", counter: "*", min: num(toad[1]!) }, { kind: "handAtLeast", n: num(toad[2]!) }] } }, effects: [{ type: "winGame", who: { ref: "you" } }] });
      continue;
    }
    // "If ~ is a Warrior, put a flying counter on it and it becomes a ..." (Figure of Destiny, Ascendant Spirit): its
    // creature types as it resolves (CR 608.2c; rulings: it doesn't matter how it got them). "It" is ~ there.
    const ifSelfIs = !ctx.spell ? /^If ~ is an? ([A-Z][a-z]+), ((?:(?!\btarget\b).)+)$/.exec(s) : null;
    if (ifSelfIs && !/\binstead$/.test(ifSelfIs[2]!)) {
      const filter = parseTargetPhrase(ifSelfIs[1]!.toLowerCase());
      const then = ifSelfIs[2]!.replace(/("[^"]*")|\bit\b/g, (w, q) => q ?? "~");
      const inner = filter?.kind === "object" && parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
      if (!inner || filter?.kind !== "object") return null;
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "selfIs", filter: { ...filter, text: ifSelfIs[1]! } } }, effects: inner });
      continue;
    }
    // "If ~ isn't a creature, it becomes a 2/4 Wizard creature with ... It's still a land." (Great Hall of the Biblioplex),
    // Answered Prayers: only if it isn't one as the ability resolves (CR 608.2c); if it is, nothing happens.
    const ifSelfNot = !ctx.spell ? /^If ~ isn't a creature, (it becomes .+)$/.exec(s) : null;
    if (ifSelfNot) {
      const inner = parseOne(`~${ifSelfNot[1]!.slice(2)}`, ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "selfIs", filter: { kind: "object", types: [], notTypes: ["Creature"], notColors: [], text: "noncreature permanent" } } }, effects: inner });
      continue;
    }
    // "If you attacked this turn, create a Treasure token": checked as it resolves (CR 608.2c).
    // "If X is 10 or more, creatures you control get +X/+X and gain haste until end of turn" (Finale of Devastation), "If
    // X is 5 or more, destroy all other creatures" (Martial Coup): the X the spell was cast with (CR 107.3a), as well as
    // what came before ("also"). Only a spell's own X.
    // "Draw X cards. If X is 10 or more, instead shuffle your graveyard into your library, draw X cards, untap up to five
    // lands, and you have no maximum hand size for the rest of the game." (Finale of Revelation): one or the other, in
    // order (CR 608.2c), each instruction once even when one waits on a choice.
    const xInstead = /^If X is (\d+|ten) or more, instead (.+)$/.exec(s);
    if (xInstead && ctx.spell && !ctx.whereX) {
      const previous = effects.slice(prevWhole);
      const parts = xInstead[2]!.split(/, (?:and )?/);
      const before = ctx.targets.length;
      const inner: Effect[] = [];
      for (const part of parts) {
        const fx = parseOne(capital(part), ctx);
        if (!fx) return null;
        inner.push(...fx);
      }
      if (!previous.length || ctx.targets.length !== before || previous.some((e) => pauses(e))) return null;
      effects.splice(prevWhole, effects.length - prevWhole, { type: "if", cond: { kind: "xAtLeast", n: num(xInstead[1]!) }, effects: inner, otherwise: previous });
      continue;
    }
    const xAtLeast = /^If X is (\d+|one|two|three|four|five|six|seven|eight|nine|ten) or (?:more|greater), (?:also )?(.+)$/.exec(s);
    if (xAtLeast && !/\binstead\b/.test(xAtLeast[2]!)) {
      if (!(ctx.spell || ctx.ownX) || ctx.whereX) return null;
      // Martial Coup: "Create X 1/1 white Soldier creature tokens. If X is 5 or more, destroy all other creatures": all but
      // those Soldiers (rulings).
      const made = effects[effects.length - 1];
      if (ctx.spell && /^destroy all other creatures$/.test(xAtLeast[2]!) && made?.type === "createToken") {
        effects.push({ type: "if", cond: { kind: "xAtLeast", n: num(xAtLeast[1]!) }, effects: [{ type: "destroy", what: { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" }, notCreated: true } }] });
        continue;
      }
      const inner = parseOne(xAtLeast[2]!.charAt(0).toUpperCase() + xAtLeast[2]!.slice(1), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "xAtLeast", n: num(xAtLeast[1]!) }, effects: inner });
      continue;
    }
    // Vexing Radgull: "If that player has no rad counters, that player gets two rad counters. Otherwise, proliferate.":
    // the trigger's player, checked as it resolves.
    const noRad = ctx.eventPlayer ? /^If that player has no rad counters, (.+)$/.exec(s) : null;
    if (noRad) {
      const inner = parseOne(capital(noRad[1]!), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "eventPlayerNoRad" } }, effects: inner });
      continue;
    }
    // Fevered Visions: "If the player is your opponent and has four or more cards in hand, ~ deals 2 damage to that
    // player": the trigger's player, counted as it resolves (CR 608.2c), after the draw before it.
    const oppHand = ctx.eventPlayer ? new RegExp(`^If (?:the|that) player is your opponent and has ${NUM} or more cards in hand, (.+)$`).exec(s) : null;
    if (oppHand) {
      const inner = parseOne(oppHand[2]!.charAt(0).toUpperCase() + oppHand[2]!.slice(1), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "allOf", conds: [{ kind: "eventPlayerOpponent" }, { kind: "eventPlayerHand", min: num(oppHand[1]!) }] } }, effects: inner });
      continue;
    }
    // "Then if that player has no cards in hand, flip ~" (Nezumi Shortfang), after its target opponent discarded; "If no
    // cards are in that graveyard, flip ~" (Nezumi Graverobber): the graveyard its target card was in, its owner's (CR
    // 404.1). Counted as it resolves (CR 608.2c).
    const noCards = /^(?:Then )?[Ii]f (that player has no cards in hand|no cards are in that graveyard), (.+)$/.exec(s);
    if (noCards) {
      const cards = ctx.targets.flatMap((x, i) => (x.kind === "card" ? [i] : []));
      const t = cards.length === 1 ? cards[0] : undefined;
      const amount: Amount | null = noCards[1]!.startsWith("that player")
        ? parseCount("cards in that player's hand", ctx)
        : t !== undefined
          ? { count: { kind: "cardsInGraveyard", who: { ref: "targetOwner", index: t } } }
          : null;
      const inner = amount && parseOne(noCards[2]!.charAt(0).toUpperCase() + noCards[2]!.slice(1), ctx);
      if (!amount || !inner) return null;
      effects.push({ type: "if", cond: { kind: "amountNow", amount, max: 0 }, effects: inner });
      continue;
    }
    // "Target attacking creature gets +1/+1 until end of turn. If it's attacking a battle, put a +1/+1 counter on it
    // instead." (Rampaging Geoderm): which one happens depends on what it's attacking as this resolves (CR 608.2c).
    const atBattle = /^If it's attacking a battle, (put an? [^,]+ counters? on it) instead$/.exec(s);
    const lastT = ctx.lastObjectTarget;
    if (atBattle && lastT !== undefined && effects.length - prevWhole === 1 && mentionsTarget(effects[prevWhole], lastT)) {
      const inner = parseOne(atBattle[1]!.charAt(0).toUpperCase() + atBattle[1]!.slice(1), ctx);
      if (!inner || inner.some((e) => pauses(e))) return null;
      const previous = effects.splice(prevWhole);
      effects.push({ type: "if", cond: { kind: "targetIs", index: lastT, filter: { kind: "object", combat: "attackingBattle", text: "attacking a battle" } }, effects: inner, otherwise: previous });
      continue;
    }
    // "Put a +1/+1 counter on equipped creature. If equipped creature is a Vampire, put two +1/+1 counters on it instead."
    // (Blade of the Bloodchief): which one, by that creature as it is when this resolves (CR 608.2c).
    const hostType = /^If (equipped|enchanted) creature is an? ([A-Z][a-z]+), put (\w+) (\+1\/\+1) counters on it instead$/.exec(s);
    if (hostType && CREATURE_TYPES.has(hostType[2]!) && effects.length - prevWhole === 1 && /^[Pp]ut an? \+1\/\+1 counter on (?:equipped|enchanted) creature$/.test(sentences[si - 1] ?? "")) {
      const inner = parseOne(`Put ${hostType[3]} ${hostType[4]} counters on ${hostType[1]} creature`, ctx);
      if (!inner) return null;
      const previous = effects.splice(prevWhole);
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], subtypes: [hostType[2]!], text: hostType[2]! } } }, effects: inner, otherwise: previous });
      continue;
    }
    // By Invitation Only: "Choose a number between 0 and 13. Each player sacrifices that many creatures of their choice.": the
    // number chosen as it resolves; a player with fewer sacrifices them all (rulings).
    const sacThatMany = /^Each player sacrifices that many (creatures|artifacts|permanents) of their choice$/.exec(s);
    const chose = effects[effects.length - 1];
    if (sacThatMany && chose?.type === "choose" && chose.choice === "number") {
      const fx = parseOne(`Each player sacrifices two ${sacThatMany[1]} of their choice`, ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "pick" || fx[0]!.n !== 2) return null;
      effects.push({ ...fx[0]!, n: { count: { kind: "chosenNumber" } } });
      continue;
    }
    // Expel from Orazca: "Return target nonland permanent to its owner's hand. If you have the city's blessing, you may put
    // that permanent on top of its owner's library instead." With the blessing as it resolves (CR 702.131c), its
    // controller chooses where it goes.
    if (/^If you have the city's blessing, you may put that permanent on top of its owner's library instead$/.test(s) && effects.length - prevWhole === 1 && last?.type === "bounce" && last.what.ref === "target" && !last.what.n) {
      const back = effects.pop()!;
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "citysBlessing" } }, effects: [{ type: "may", effects: [{ type: "putInLibrary", what: last.what, position: "top" }], otherwise: [back], text: "put that permanent on top of its owner's library instead" }], otherwise: [back] });
      continue;
    }
    // Consign to Dream: "Return target permanent to its owner's hand. If that permanent is red or green, put it on top of its
    // owner's library instead." Sweep Away: "Return target creature to its owner's hand. If that creature is attacking, you
    // may put it on top of its owner's library instead." The permanent as it resolves (CR 608.2c), one move or the other.
    const bounceTop = /^If that (?:permanent|creature) is ((white|blue|black|red|green) or (white|blue|black|red|green)|attacking), (you may )?put it on top of its owner's library instead$/.exec(s);
    if (bounceTop && effects.length - prevWhole === 1 && last?.type === "bounce" && last.what.ref === "target" && !last.what.n && Object.keys(last).length === 2) {
      const back = effects.pop()!;
      const base = { kind: "object" as const, types: [], notTypes: [], notColors: [] };
      const filter: TargetSpec = bounceTop[2] ? { ...base, colors: [COLOR_WORDS[bounceTop[2]]!, COLOR_WORDS[bounceTop[3]!]!], text: bounceTop[1]! } : { ...base, combat: "attacking", text: "attacking" };
      const top: Effect = { type: "putInLibrary", what: last.what, position: "top" };
      effects.push({ type: "if", cond: { kind: "targetIs", index: last.what.index, filter }, effects: [bounceTop[4] ? { type: "may", effects: [top], otherwise: [structuredClone(back)], text: "put it on top of its owner's library instead" } : top], otherwise: [back] });
      continue;
    }
    // Consuming Ferocity: "put a +1/+0 counter on enchanted creature. If that creature has three or more +1/+0 counters on
    // it, it deals damage equal to its power to its controller, then destroy that creature and it can't be regenerated.":
    // the creature as this resolves (CR 608.2c); "it" is that creature.
    const auraCounted = /^If (?:that|enchanted) creature has (\w+ or more [^,]+ counters? on it), (.+)$/.exec(s);
    const putOnHost = effects[effects.length - 1];
    if (auraCounted && putOnHost?.type === "counters" && putOnHost.what.ref === "attached") {
      const cond = parseStaticCondition(`that creature has ${auraCounted[1]}`, { affects: { kind: "self" }, mods: [], text: "" });
      if (cond?.kind !== "subjectCounter") return null;
      const fx: Effect[] = [];
      for (const part of auraCounted[2]!.split(/, then /)) {
        const noRegen = /^destroy (?:that|enchanted) creature and it can't be regenerated$/.test(part);
        const one = parseOne(capital(noRegen ? "destroy enchanted creature" : part.replace(/^it deals /, "enchanted creature deals ")), ctx);
        const got = noRegen ? (one?.length === 1 && one[0]!.type === "destroy" ? [{ ...one[0]!, noRegen: true } as Effect] : null) : one;
        if (!got || got.some((e) => pauses(e))) return null;
        fx.push(...got);
      }
      effects.push({ type: "if", cond: { kind: "state", cond, subject: { ref: "attached" } }, effects: fx });
      continue;
    }
    const ifState = /^If ([^,]+), (.+)$/.exec(s);
    // Sphinx Sovereign: "If ~ is untapped, ...": ~ itself, as it resolves or as it last existed (rulings).
    const selfTapped = !!ifState && /^~ is (?:un)?tapped$/.test(ifState[1]!);
    // Ayara's Oathsworn: "Put a +1/+1 counter on it. Then if it has exactly four +1/+1 counters on it, ...": ~, which the
    // counter was just put on, as it resolves (rulings: not if it has left the battlefield).
    const justCounted = effects[effects.length - 1];
    const selfCounted = !!ifState && !ctx.spell && /^(?:it|~) has .+ counters? on it$/.test(ifState[1]!) && justCounted?.type === "counters" && justCounted.what.ref === "self";
    const stateCond = ifState && (selfTapped || selfCounted || !/^(it|~)\b(?!'s (?:your|not your|the first) | isn't your main phase$)/.test(ifState[1]!)) && !/\binstead$/.test(ifState[2]!) ? parseStaticCondition(ifState[1]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    // "Draw two cards. If you have the city's blessing, draw three cards instead.": the condition picks which of the
    // two instructions happens, as it resolves (CR 608.2c). "Instead only you draw a card" says the same.
    const insteadOf = ifState && !/^(it|~)\b(?!'s (?:your|not your|the first) )/.test(ifState[1]!) && /^instead,? |\binstead$/.test(ifState[2]!) ? parseStaticCondition(ifState[1]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    // "If that creature has a +1/+1 counter on it" (Bring Low, Marcus): the trigger's subject, or else the one object
    // target; with neither, unsupported.
    const counterSubject = (c: StaticCondition | null): { subject?: ObjRef } | null => !c || c.kind !== "subjectCounter" || (ctx.subjectIt && !ctx.spell) ? {} : ctx.lastObjectTarget !== undefined && ctx.targets.length === 1 ? { subject: { ref: "target", index: ctx.lastObjectTarget } } : null;
    const insteadSubject = counterSubject(insteadOf);
    const stateSubject = counterSubject(stateCond);
    if (!insteadSubject || !stateSubject) return null;
    if (ifState && insteadOf) {
      const from = thenParts.has(sentences[si]!) ? prevStart : prevWhole;
      const previous = effects.slice(from);
      // Lightning Surge: "instead ~ deals 6 damage to that permanent or player and the damage can't be prevented" (CR 615.12).
      const unpreventable = / and the damage can't be prevented$/.test(ifState[2]!);
      // Dark Temper: "destroy the creature instead" is the creature the sentence before named.
      const t0 = ifState[2]!.replace(/ and the damage can't be prevented$/, "").replace(/^instead,? (?:only )?/, "").replace(/ instead$/, "").replace(/^destroy the creature$/, "destroy that creature");
      // Festering Newt: "target creature ... gets -1/-1 until end of turn. That creature gets -4/-4 instead if ...": the
      // same instruction with the other amount, so for the same duration.
      const prevPT = previous.length === 1 && previous[0]!.type === "continuous" ? previous[0]! : null;
      const t = /^that creature gets [+-]\d+\/[+-]\d+$/.test(t0) && prevPT && prevPT.duration === "endOfTurn" && prevPT.what.ref === "target" && !prevPT.what.n && prevPT.mods.length === 1 && prevPT.mods[0]!.kind === "modifyPT" && ctx.lastObjectTarget === prevPT.what.index ? `${t0} until end of turn` : t0;
      const before = ctx.targets.length;
      // "Create a Treasure token. If you've completed a dungeon, create three of those tokens instead" (Safana).
      const those = new RegExp(`^create ${NUMX} of those tokens$`, "i").exec(t);
      const prevToken = previous.length === 1 && previous[0]!.type === "createToken" ? previous[0]! : null;
      // "Counter target noncreature spell unless its controller pays {1}. If you control a creature with power 4 or
      // greater, counter that spell instead." (Stubborn Denial): the same spell, with no chance to pay.
      const prevCounter = previous.length === 1 && previous[0]!.type === "counterSpell" && previous[0]!.unless ? previous[0]! : null;
      const { unless: _unless, ...uncond } = (prevCounter ?? {}) as Extract<Effect, { type: "counterSpell" }>;
      // "Return target creature card from your graveyard to your hand. Return that card from your graveyard to the
      // battlefield instead if there are seven or more cards in your graveyard." (Stitch Together): the same card.
      const prevBack = previous.length === 1 && previous[0]!.type === "bounce" && previous[0]!.what.ref === "target" && ctx.targets[previous[0]!.what.index]?.kind === "card" ? previous[0]! : null;
      const toField = /^(?:return|put) (?:that (?:permanent )?card|it)(?: from your graveyard)? (?:to|onto) the battlefield$/i.test(t);
      // "~ deals 2 damage to any target. If you're the monarch, it deals 7 damage instead." (Court of Ire): the same target.
      // The Destined Black Mage: "~ deals 1 damage to each opponent. If you have a full party, it deals 3 damage to each
      // opponent instead": the same players.
      // Shower of Coals: "~ deals 4 damage to each of those permanents and/or players instead": the same up to three targets.
      const moreDamage = /^(?:it|~) deals (\d+) damage(?: to (that creature|that player|that permanent or player|it|each opponent|each of those permanents and\/or players))?$/i.exec(t);
      const prevDamage0 = previous.length === 1 && previous[0]!.type === "damage" && !previous[0]!.divided ? previous[0]! : null;
      const several = (to: Extract<Effect, { type: "damage" }>["to"]) => to.ref === "anyTarget" && "n" in to && (to.n ?? 1) > 1;
      const prevDamage = prevDamage0 && (moreDamage?.[2] === "each opponent") === (prevDamage0.to.ref === "eachOpponent") && (moreDamage?.[2] === "each of those permanents and/or players") === several(prevDamage0.to) ? prevDamage0 : null;
      if ((moreDamage && !prevDamage) || (unpreventable && !moreDamage)) return null;
      const inner = moreDamage && prevDamage ? [{ ...prevDamage, amount: num(moreDamage[1]!), ...(unpreventable ? { unpreventable: true as const } : {}) }] : those ? (prevToken ? [{ ...prevToken, n: amt(those[1]!) }] : null) : t === "counter that spell" ? (prevCounter ? [uncond as Effect] : null) : toField ? (prevBack ? [{ type: "putOntoBattlefield" as const, what: prevBack.what }] : null) : parseOne(t.charAt(0).toUpperCase() + t.slice(1), ctx);
      // Only one of the two happens, so neither may wait on a choice or need targets of its own (one "you may"
      // instead would leave nothing done on a "no").
      // A punisher waits on its players but always does its whole process (Court of Ambition's "instead" one), and so do
      // sacrificing and discarding, which only wait on which ones (Vona's Hunger), and so does a search (Entish Restoration),
      // and untapping one of yours (White Plume Adventurer).
      // Toxic Stench: "If there are seven or more cards in your graveyard, instead destroy that creature. It can't be
      // regenerated.": the destroy instead (CR 701.19c).
      if (inner?.length === 1 && inner[0]!.type === "destroy" && /^It can't be regenerated\.?$/.test(sentences[si + 1] ?? "")) {
        inner[0] = { ...inner[0]!, noRegen: true };
        si++;
      }
      if (!inner || !previous.length || ctx.targets.length !== before || [...previous, ...inner].some((e) => pauses(e) && e !== prevCounter && e.type !== "punisher" && !(e.type === "pick" && e.action === "sacrifice") && e.type !== "discard" && e.type !== "search" && e.type !== "untapUpTo" && e.type !== "revealFromHand")) return null;
      const done = insteadOfAffected(inner, previous);
      if (!done) return null;
      effects.splice(from, effects.length - from, { type: "if", cond: { kind: "state", cond: insteadOf, ...insteadSubject }, effects: done, otherwise: previous });
      continue;
    }
    // "You lose 2 life unless you control another Pirate": the instruction happens only if the condition is false as it
    // resolves (CR 608.2c).
    const unlessState = !ifState ? /^(.+) unless ([^,]+)$/.exec(s) : null;
    // Furnace Punisher: "unless they control two or more basic lands": the trigger's player.
    const theyControl = unlessState && ctx.eventPlayer ? /^(?:they control|that player controls) (.+)$/.exec(unlessState[2]!) : null;
    const theirCond = theyControl ? parseStaticCondition(`you control ${theyControl[1]}`, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    const unlessCond = theirCond ? (theirCond.kind === "control" && theirCond.who === "you" && !theirCond.other ? { ...theirCond, who: "eventPlayer" as const } : null) : unlessState && !/^(it|~|they|that player|its controller|he or she)\b/.test(unlessState[2]!) ? parseStaticCondition(unlessState[2]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    if (unlessState && unlessCond) {
      const inner = parseOne(unlessState[1]!, ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: unlessCond }, effects: [], otherwise: inner });
      continue;
    }
    if (ifState && stateCond) {
      // "If you've completed a dungeon, that creature also gets +5/+0" (Rilsa Rael): as well as what came before.
      // "Draw another card": one more.
      const then = ifState[2]!.replace(/^(that creature|that player|those creatures|it|~) also (?=(?:gains?|gets?|deals?|has|loses?) )/i, "$1 ").replace(/^draw another card$/, "draw a card");
      // "If there are four or more charge counters on ~, you may remove all charge counters from ~ and transform ~" (Primal
      // Amulet): optional, decided as it resolves (CR 608.2d).
      // Other "you may" sentences that read on their own come first ("you may cast the discarded card ...", Malcolm).
      const mayThen = /^you may (.+)$/.exec(then);
      // "..., remove those counters, transform ~, and create three Treasure tokens" (Treasure Map): a list of instructions,
      // in order, each read on its own.
      const list = (): Effect[] | null => {
        const parts = then.split(/, (?:and )?/);
        if (parts.length < 3 || !/, and /.test(then)) return null;
        const out: Effect[] = [];
        for (const p of parts) {
          const one = parseOne(capital(p), ctx);
          if (!one) return null;
          out.push(...one);
        }
        return out;
      };
      const own = attempt(ctx, () => parseOne(capital(then), ctx)) ?? (mayThen ? null : attempt(ctx, list));
      const mayInner = !own && mayThen ? parseOne(capital(mayThen[1]!), ctx) : null;
      const inner: Effect[] | null = own ?? (mayInner ? [{ type: "may", effects: mayInner, text: mayThen![1]! }] : null);
      // Its instructions run one at a time, so one may wait on a player ("draw a card, then discard a card", see the "if"
      // effect).
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: stateCond, ...stateSubject }, effects: inner });
      // "Then if you're the monarch, ~ deals X damage to each opponent, where X is the number of creatures you control"
      // (Court of Embereth): the instruction's own X (CR 107.3c), counted as it resolves.
      if (!defineX()) return null;
      continue;
    }
    // "You may draw a card": optional, decided on resolution (CR 608.2d).
    // "You may play the exiled card without paying its mana cost" asks as it plays it (see the playLinked effect).
    // "You may play an additional land this turn" is a permission, not a choice made now (CR 305.2a).
    // "You may draw a card unless that player pays {1}" (Rhystic Study): they decide first (see the punisher sentences).
    // "You may put a permanent card from your hand onto the battlefield for each free vote" (Selvala's Stampede): up to
    // that many, chosen together and entering at the same time.
    const handVotes = /^[Yy]ou may put an? (.+? card) from your hand onto the battlefield for each ([a-z]+) vote$/.exec(s);
    if (handVotes && ctx.vote?.options?.includes(handVotes[2]!)) {
      const filter = parseSearchFilter(handVotes[1]!);
      if (!filter || filter.kind !== "card") return null;
      effects.push({ type: "putFromHand", filter, may: true, any: true, upTo: { count: { kind: "votes", option: handVotes[2]! } } });
      continue;
    }
    // Knollspine Dragon: "you may discard your hand and draw cards equal to ...": the same as ", then draw", in that order
    // (CR 608.2c), one choice for both (Clive, Ifrit's Dominant).
    if (/^[Yy]ou may discard your hand and draw cards equal to /.test(s)) s = s.replace(" and draw ", ", then draw ");
    const may = /^[Yy]ou may (?!attach an Equipment you control to (?:it|that creature)$|attach any number of Equipment you control to (?:target creature you control|it|that creature)$|play the exiled card |play one of the cards exiled with ~ without paying its mana cost$|cast a copy of the exiled card |play (?:an|up to \w+|X) additional lands? this turn|draw [^.]+ unless (?:that player|they|he or she) pays? |draw up to |choose new targets for target |cast (?:(?:sorcery|creature|artifact|enchantment) )?spells this turn as though they had flash$|cast (?:that card|it) this turn$|cast your commander from the command zone without paying its mana cost$|discard your hand, then draw |reveal cards from the top of your library until you reveal [^.]+$|have any number of them phase out$)(.+)$/.exec(s);
    if (may) {
      // "You may have ~ deal damage equal to its power to target creature", "you may have it fight target creature you
      // don't control": ~ does it, if you choose.
      const rest = (may[1]!.charAt(0).toUpperCase() + may[1]!.slice(1)).replace(/^Have (~|it) (deal|fight) /, (_, w: string, verb: string) => `${w === "it" && !ctx.selfIt && !ctx.selfCard ? "It" : "~"} ${verb}s `)
        .replace(/^Have ((?:up to one )?target .+?) block (~|it) this (turn|combat) if able$/, "$1 blocks $2 this $3 if able")
        // "You may gain life equal to the power of target creature you control" (Wall of Reverence).
        .replace(/^Gain life equal to /, "You gain life equal to ")
        // Baron Strucker: "you may have it connive" (CR 701.50a): it connives, if you choose.
        .replace(/^Have (it|that creature) connive$/, (_, w: string) => (w === "it" && (ctx.selfIt || ctx.selfCard) ? "~ connives" : `${w === "it" ? "It" : "That creature"} connives`))
        // "You may have target opponent discard a card", "you may have that player lose 1 life": that player does it, if
        // you choose (the choice is yours, CR 608.2d).
        .replace(/^Have (target player|target opponent|that player|its controller|each opponent) (discard|lose|draw|mill|sacrifice|gain) /, (_, who: string, verb: string) => `${who.charAt(0).toUpperCase()}${who.slice(1)} ${verb}s `)
        // "You may have target creature get -2/-2 until end of turn", "... it gain reach", "... Ally creatures you control
        // gain first strike", "... enchanted creature fight target creature": they do it, if you choose (CR 608.2d).
        // Embodiment of Insight: "you may have target land you control become a 3/3 Elemental creature ...".
        // Shadow Puppeteers: "you may have it become a red Dragon ... until end of turn", "it" being the trigger's subject.
        // Cloak of Confusion: "you may have it assign no combat damage this turn" (CR 510.1).
        .replace(/^Have (.+?) (get|gain|lose|fight|deal|become|assign) (?=\S)/, (all, who: string, verb: string, at: number, whole: string) => {
          if (/^(?:target (?:player|opponent)|that player|its controller|each opponent|you)$/.test(who)) return all;
          const it = /^(?:it|her|him)$/.test(who);
          const subject = it ? (ctx.selfIt || ctx.selfCard ? "~" : "It") : who.charAt(0).toUpperCase() + who.slice(1);
          const plural = !it && /\b(?:creatures|permanents)\b/.test(who);
          if (verb === "become" && (plural || (it && (subject !== "It" || / become an? copy\b/.test(whole) || !/ until end of turn$/.test(whole))))) return all;
          return `${subject} ${plural ? verb : verb === "lose" ? "loses" : `${verb}s`} `;
        });
      ctx.mayNow = true;
      const inner = parseOne(rest, ctx);
      ctx.mayNow = false;
      if (!inner) return null;
      // "You may turn a face-down creature you control face up" (Ugin's Mastery): choosing one is the "may", then that one
      // turns face up.
      if (inner.length === 2 && inner[0]!.type === "pick" && inner[0]!.action === "choose" && inner[1]!.type === "turnFaceUp" && inner[1]!.what.ref === "created") {
        effects.push({ type: "may", effects: [inner[0]!], text: may[1]! }, { type: "if", cond: { kind: "youDid" }, effects: [inner[1]!] });
        continue;
      }
      // An effect that waits on a player has to be the only one, so resuming it doesn't repeat the others.
      if (inner.length > 1 && inner.some((e) => pauses(e))) return null;
      // "You may put a land card from your hand onto the battlefield": choosing none is the "may" (one question).
      const only = inner.length === 1 ? inner[0]! : undefined;
      // "You may tap or untap target permanent": tap, untap or neither, as one question.
      // "You may tap any number of untapped creatures you control": tapping none is the "may".
      if ((only?.type === "putFromHand" || only?.type === "tapOrUntap" || only?.type === "castFromHand" || only?.type === "chooseFromGraveyard" || only?.type === "tapAnyNumber" || only?.type === "attachAny") && !/^If you do\b/.test(sentences[si + 1] ?? "")) {
        // castFromHand offers "Don't cast" itself; returning cards from the graveyard can take none.
        effects.push(only.type === "castFromHand" || only.type === "tapAnyNumber" || only.type === "attachAny" ? only : only.type === "chooseFromGraveyard" ? { ...only, upTo: true } : { ...only, may: true });
        if (!defineX()) return null;
        continue;
      }
      effects.push({ type: "may", effects: inner, text: may[1]! });
      if (!defineX()) return null;
      continue;
    }
    // "Search target opponent's library for ... Then that player shuffles" (Bribery): the search shuffles it.
    if (/^That player shuffles$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type === "search" && prev.library) continue;
      // "Search target player's graveyard, hand, and library for ... Then that player shuffles" (Memoricide); Deicide's
      // under its "if", the search shuffling only if it happens.
      if (prev?.type === "exileNamed" || (prev?.type === "if" && !prev.otherwise && prev.effects[prev.effects.length - 1]?.type === "exileNamed")) continue;
      return null;
    }
    // Thada Adel: "search that player's library for an artifact card and exile it. Then that player shuffles. Until end
    // of turn, you may play that card": the one card exiled face up, by whoever searched (CR 701.23a).
    if (/^Until end of turn, you may play that card$/.test(s) && /\bthat player shuffles\.?$/i.test(sentences[si - 1] ?? "")) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "search" || !prev.library || prev.dest.zone !== "exile" || prev.dest.faceDown || prev.dest.play || prev.n !== 1) return null;
      effects[effects.length - 1] = { ...prev, dest: { ...prev.dest, play: { until: "thisTurn" } } };
      continue;
    }
    // "Choose a nonland card name. Target player reveals their hand and discards all cards with that name." (Cabal
    // Therapy): the name is chosen as it resolves (CR 201.4, 608.2d; rulings), and "that name" or "the chosen name" after
    // it is that one. One per ability.
    const nameChoice = /^Choose (an? (?:[a-z]+(?:, | ))*?card name(?: other than a basic land card name)?)$/.exec(s);
    if (nameChoice) {
      const c = parseCardNameChoice(nameChoice[1]!);
      if (!c || allEffects(effects).some((x) => x.type === "choose" && x.choice === "cardName")) return null;
      effects.push({ type: "choose", choice: "cardName", ...c, purpose: namePurpose(sentences.slice(si + 1).join(" ")) });
      continue;
    }
    // "Reveal cards from the top of your library until you reveal a card with the chosen name. Put that card into your
    // hand and exile all other cards revealed this way." (Demonic Consultation), "..., then put that card into your hand.
    // Exile all other cards revealed this way, and you lose 1 life for each of the exiled cards." (Spoils of the Vault).
    if (/^[Rr]eveal cards from the top of your library until you reveal a card with (?:the chosen|that) name$/.test(s)) {
      const next = [sentences[si + 1], sentences[si + 2]].map((x) => x?.replace(/\.$/, ""));
      const filter: TargetSpec = { kind: "card", chosen: "name", text: "card with the chosen name" };
      if (next[0] === "Put that card into your hand and exile all other cards revealed this way") {
        effects.push({ type: "revealUntil", filter, found: "hand", rest: "exile" });
        si++;
        continue;
      }
      if (next[0] === "Put that card into your hand" && /^Exile all other cards revealed this way(, and you lose 1 life for each of the exiled cards)?$/.test(next[1] ?? "")) {
        effects.push({ type: "revealUntil", filter, found: "hand", rest: "exile", ...(/ life /.test(next[1]!) ? { lifePerRest: true as const } : {}) });
        si += 2;
        continue;
      }
      return null;
    }
    // Consuming Aberration: "each opponent reveals cards from the top of their library until they reveal a land card, then
    // puts those cards into their graveyard".
    const untilLand = /^(Each opponent|Each player|Target opponent|Target player) reveals cards from the top of their library until they reveal a land card$/i.exec(s);
    if (untilLand && /^(?:Then )?puts those cards into their graveyard\.?$/i.test(sentences[si + 1] ?? "")) {
      const who = parsePlayer(untilLand[1]!, ctx);
      if (!who) return null;
      effects.push({ type: "revealUntilLandToGraveyard", who });
      si++;
      continue;
    }
    // Mind Grind: "Each opponent reveals cards from the top of their library until they reveal X land cards, then puts all
    // cards revealed this way into their graveyard." The spell's X (its "X can't be 0" is read by compile).
    const untilXLand = ctx.spell && /^(Each opponent|Target opponent|Target player) reveals cards from the top of their library until they reveal X land cards$/i.exec(s);
    if (untilXLand && /^(?:Then )?puts all cards revealed this way into their graveyard\.?$/i.test(sentences[si + 1] ?? "")) {
      const who = parsePlayer(untilXLand[1]!, ctx);
      if (!who) return null;
      effects.push({ type: "revealUntilLandToGraveyard", who, n: { count: { kind: "x" } } });
      si++;
      continue;
    }
    // Mind Funeral: "Target opponent reveals cards from the top of their library until four land cards are revealed. That
    // player puts all cards revealed this way into their graveyard.": the same, with four.
    const untilNLand = /^(Target opponent|Target player) reveals cards from the top of their library until (two|three|four|five) land cards are revealed$/i.exec(s);
    if (untilNLand && /^That player puts all cards revealed this way into their graveyard\.?$/i.test(sentences[si + 1] ?? "")) {
      const who = parsePlayer(untilNLand[1]!, ctx);
      if (!who) return null;
      effects.push({ type: "revealUntilLandToGraveyard", who, n: num(untilNLand[2]!) });
      si++;
      continue;
    }
    // Mirko Vosk, Mind Drinker: "that player reveals cards from the top of their library until they reveal four land cards,
    // then puts those cards into their graveyard": the same, about the player dealt the damage.
    const mirko = ctx.eventPlayer && /^[Tt]hat player reveals cards from the top of their library until they reveal (two|three|four|five) land cards$/.exec(s);
    if (mirko && /^(?:That player p|P)uts those cards into their graveyard\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "revealUntilLandToGraveyard", who: { ref: "eventPlayer" }, n: num(mirko[1]!) });
      si++;
      continue;
    }
    // "Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and
    // the rest on the bottom of your library in a random order." (Nissa, Leyline Tamer), "... into your hand ...", "...
    // a land card. Put that card onto the battlefield tapped ...". Onto the battlefield only cards that need no choice
    // as they enter there (not Auras, CR 303.4f).
    // Open the Way: "... until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest ...".
    // Skyserpent Seeker: "... until you reveal two land cards. Put those land cards ..." the same with a number.
    const untilN = /^[Rr]eveal cards from the top of your library until you reveal (two|three|four|five) land cards$/.exec(s);
    const untilX = (untilN || /^[Rr]eveal cards from the top of your library until you reveal X land cards$/.test(s)) && /^Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    // Kindred Summons: "Choose a creature type. Reveal cards from the top of your library until you reveal X creature cards
    // of the chosen type, where X is the number of creatures you control of that type. Put those cards onto the
    // battlefield, then shuffle the rest of the revealed cards into your library." X counted as it resolves; all of them
    // enter together; fewer if the library runs out (rulings).
    const untilChosen = /^[Rr]eveal cards from the top of your library until you reveal X creature cards of the chosen type$/.test(s) && where?.[2] === "the number of creatures you control of that type";
    if (untilChosen && /^Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const prev = effects[effects.length - 1];
      const n = parseCount(where[2]!, ctx);
      if (prev?.type !== "choose" || prev.choice !== "creatureType" || !n) return null;
      effects.push({ type: "revealUntil", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], chosen: "type", text: "creature card of the chosen type" }, found: "battlefield", rest: "shuffle", n });
      si++;
      continue;
    }
    // Selvala's Stampede: "Reveal cards from the top of your library until you reveal a creature card for each wild vote.
    // Put those creature cards onto the battlefield, then shuffle the rest into your library." As many creature cards as
    // there were votes for that word (CR 701.38), entering together (rulings); with no such vote, none is revealed.
    const untilVotes = /^[Rr]eveal cards from the top of your library until you reveal a creature card for each ([a-z]+) vote$/.exec(s);
    if (untilVotes && ctx.vote?.options?.includes(untilVotes[1]!) && /^Put those creature cards onto the battlefield, then shuffle the rest into your library$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "revealUntil", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, found: "battlefield", rest: "shuffle", n: { count: { kind: "votes", option: untilVotes[1]! } } });
      si++;
      continue;
    }
    // Old Stickfingers: "When you cast ~, reveal cards from the top of your library until you reveal X creature cards. Put
    // all creature cards revealed this way into your graveyard, then put the rest on the bottom of your library in a random
    // order." X is the spell's, as it was cast (rulings); fewer if the library runs out (CR 701.20a).
    if (ctx.ownX && /^[Rr]eveal cards from the top of your library until you reveal X creature cards$/.test(s) && sentences[si + 1] === "Put all creature cards revealed this way into your graveyard" && /^(?:[Tt]hen )?[Pp]ut the rest on the bottom of your library in a random order\.?$/.test(sentences[si + 2] ?? "") && si + 3 === sentences.length) {
      effects.push({ type: "revealUntil", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, found: "graveyard", rest: "bottom", n: { count: { kind: "x" } } });
      si += 2;
      continue;
    }
    if (untilX) {
      effects.push({ type: "revealUntil", filter: { kind: "card", types: ["Land"], notTypes: [], notColors: [], text: "land card" }, found: "battlefield", rest: "bottom", tapped: true, n: untilN ? num(untilN[1]!) : { count: { kind: "x" } } });
      // The Ring Goes South: "..., where X is the number of legendary creatures you control", counted as it resolves.
      if (untilN ? !!where : !defineX()) return null;
      si++;
      continue;
    }
    // After "Destroy target creature" (Polymorph), "Exile target creature" (Transmogrify), "Destroy target permanent an
    // opponent controls" (Wild Magic Surge): "Its controller reveals cards from the top of their library until they reveal
    // a creature card", "... a permanent card that shares a card type with that permanent" (its types as it last existed,
    // CR 608.2h), and they put that card onto the battlefield (under their control), then the rest. With none found, all
    // the revealed cards are shuffled in, or go to the bottom (CR 701.20a).
    // Curse of Unbinding: "that player reveals cards from the top of their library until they reveal a creature card. Put
    // that card onto the battlefield under your control. That player puts the rest of the revealed cards into their
    // graveyard." The Curse's controller gets it (rulings); with none, every card revealed goes (CR 701.20a).
    if (ctx.eventPlayer && /^[Tt]hat player reveals cards from the top of their library until they reveal a creature card$/.test(s) && sentences[si + 1]?.replace(/\.$/, "") === "Put that card onto the battlefield under your control" && sentences[si + 2]?.replace(/\.$/, "") === "That player puts the rest of the revealed cards into their graveyard") {
      const filter = parseSearchFilter("creature card");
      if (!filter) return null;
      effects.push({ type: "revealUntil", filter, found: "battlefield", rest: "graveyard", who: { ref: "eventPlayer" }, yours: true });
      si += 2;
      continue;
    }
    // Rakdos, the Showstopper: "flip a coin for each creature that isn't a Demon, Devil, or Imp. Destroy each creature
    // whose coin comes up tails." One coin for each, the losers destroyed together (rulings).
    const flipEach = /^[Ff]lip a coin for each (creature[^.]*)$/.exec(s);
    if (flipEach && sentences[si + 1]?.replace(/\.$/, "") === "Destroy each creature whose coin comes up tails") {
      const each = parseObject(`each ${flipEach[1]}`, ctx);
      if (each?.ref !== "each" || each.filter.kind !== "object") return null;
      effects.push({ type: "flipCoinEach", filter: each.filter });
      si++;
      continue;
    }
    // Sméagol, Helpful Guide: "target opponent reveals cards from the top of their library until they reveal a land card.
    // Put that card onto the battlefield tapped under your control and the rest into their graveyard." The same, the
    // target's library and graveyard; with no land card, every card revealed goes to the graveyard (CR 701.20a).
    const targetReveals = /^[Tt]arget (opponent|player) reveals cards from the top of their library until they reveal an? ([a-z]+ card)$/.exec(s);
    const putYours = /^Put that card onto the battlefield( tapped)? under your control and the rest into their graveyard$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (targetReveals && putYours) {
      const filter = parseSearchFilter(targetReveals[2]!);
      const who = parsePlayer(`target ${targetReveals[1]}`, ctx);
      if (!filter || filter.kind !== "card" || !filter.types?.length || !who) return null;
      effects.push({ type: "revealUntil", filter, found: "battlefield", rest: "graveyard", who, yours: true, ...(putYours[1] ? { tapped: true as const } : {}) });
      si++;
      continue;
    }
    // Blessed Reincarnation: "Exile target creature an opponent controls. That player reveals cards from the top of their
    // library until a creature card is revealed": the same, "that player" being the target's controller.
    const theirs = /^(Its controller|That creature's controller|That permanent's controller|That player) reveals cards from the top of their library until (?:they reveal (?:an? )?(.+? card)( that shares a card type with that permanent)?|a (creature card) is revealed)$/.exec(s);
    if (theirs?.[4]) theirs[2] = theirs[4];
    const theirPut = /^(?:(?:The|That) player puts that card onto the battlefield, then shuffles (?:all other cards revealed this way|the rest) into their library|They put that card onto the battlefield and (the rest on the bottom of their library in a random order))$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    const thatPlayerOf = theirs?.[1] === "That player" ? ctx.targets.length === 1 && /^target (?:creature|permanent) an opponent controls$/.test(ctx.targets[0]!.text ?? "") : true;
    if (theirs && theirPut && thatPlayerOf) {
      const who = parsePlayer(theirs[1] === "That player" ? "its controller" : theirs[1]!.toLowerCase(), ctx);
      const filter = parseSearchFilter(theirs[2]!);
      if (who?.ref !== "targetController" || ctx.targets[who.index]?.many || !filter || filter.kind !== "card") return null;
      // Onto the battlefield: creature cards, or (sharing a type) any permanent card, an Aura enchanting what its new
      // controller chooses (CR 303.4f).
      const permanent = theirs[3] && theirs[2] === "permanent card";
      const creature = !theirs[3] && filter.types?.length === 1 && filter.types[0] === "Creature" && !filter.anyOf;
      if (!permanent && !creature) return null;
      effects.push({ type: "revealUntil", filter, found: "battlefield", rest: theirPut[1] ? "bottom" : "shuffle", who, ...(theirs[3] ? { sharesTypeWith: who.index } : {}) });
      si++;
      continue;
    }
    // Spinner of Souls: "you may reveal cards ... until you reveal a creature card. Put that card into your hand and the
    // rest ...": the whole process, if you choose (CR 608.2d).
    const mayUntil = /^[Yy]ou may (reveal cards from the top of your library until you reveal .+)$/.exec(s);
    // Heirloom Blade: "... until you reveal a creature card that shares a creature type with it", "it" being the creature
    // that died, as it last existed (rulings).
    const sharesM = ctx.subjectIt && ctx.subjectLeft ? / that shares a creature type with it$/.exec(mayUntil ? mayUntil[1]! : s) : null;
    const until = /^[Rr]eveal cards from the top of your library until you reveal (?:an? )?(.+? card)$/.exec((mayUntil ? mayUntil[1]! : s).replace(/ that shares a creature type with it$/, sharesM ? "" : "$&"));
    // Songbirds' Blessing: "... until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put
    // it into your hand. Put the rest on the bottom of your library in a random order."
    if (until && !mayUntil && sentences[si + 1] === "You may put that card onto the battlefield" && sentences[si + 2] === "If you don't, put it into your hand" && /^Put the rest on the bottom of your library in a random order\.?$/.test(sentences[si + 3] ?? "") && !/\b(?:named|chosen|that name)\b/.test(until[1]!)) {
      const filter = parseSearchFilter(until[1]!);
      // An Aura card (its host chosen as it enters, CR 303.4f), or a permanent card of a kind that needs no choice.
      const aura = !filter?.types?.length && filter?.subtypes?.length === 1 && filter.subtypes[0] === "Aura";
      if (!filter || filter.kind !== "card" || filter.anyOf || (!aura && (!filter.types?.length || !filter.types.every((x) => x === "Creature" || x === "Artifact" || x === "Land" || x === "Enchantment") || filter.subtypes?.length))) return null;
      effects.push({ type: "revealUntil", filter, found: "battlefield", mayElseHand: true, rest: "bottom" });
      si += 3;
      continue;
    }
    // Hei Bai, Forest Guardian: "... until you reveal a Shrine card. You may put that card onto the battlefield. Then
    // shuffle.": if you don't, it stays in the library with the rest, all shuffled (CR 701.20a).
    if (until && !mayUntil && !sharesM && sentences[si + 1] === "You may put that card onto the battlefield" && /^Then shuffle\.?$/.test(sentences[si + 2] ?? "") && !/\b(?:named|chosen|that name)\b/.test(until[1]!)) {
      const filter = parseSearchFilter(until[1]!);
      // A Shrine (a legendary enchantment, never an Aura) or a permanent card of a kind that needs no choice as it enters.
      const shrine = !filter?.types?.length && filter?.subtypes?.length === 1 && filter.subtypes[0] === "Shrine";
      if (!filter || filter.kind !== "card" || filter.anyOf || (!shrine && (!filter.types?.length || !filter.types.every((x) => x === "Creature" || x === "Artifact" || x === "Land") || filter.subtypes?.length))) return null;
      effects.push({ type: "revealUntil", filter, found: "battlefield", mayStay: true, rest: "shuffle" });
      si += 2;
      continue;
    }
    // Venture Forth: "Exile cards from the top of your library until you exile a land card. Put that card onto the
    // battlefield and the rest on the bottom of your library in a random order." The same as revealing them, but exiled
    // (CR 406.3), so the rest go to the bottom from exile; all of them if none is found (CR 701.20a does the same).
    const exUntil = /^[Ee]xile cards from the top of your library until you exile an? ((?:land|creature|artifact) card)$/.exec(s);
    const exPut = exUntil ? /^Put that card onto the battlefield( tapped)? and the rest on the bottom of your library in a random order$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (exUntil && exPut) {
      const filter = parseSearchFilter(exUntil[1]!);
      if (!filter || filter.kind !== "card") return null;
      effects.push({ type: "revealUntil", filter, found: "battlefield", rest: "bottom", exile: true, ...(exPut[1] ? { tapped: true as const } : {}) });
      si++;
      continue;
    }
    // Aspiring Champion: "Put that card onto the battlefield, then shuffle the rest into your library. If that creature is a
    // Demon, it deals damage equal to its power to each opponent": the permanent it put there, as it is now (CR 608.2c).
    if (until && sentences[si + 1]?.replace(/\.$/, "") === "Put that card onto the battlefield, then shuffle the rest into your library" && !/\b(?:named|chosen|that name)\b/.test(until[1]!)) {
      const filter = parseSearchFilter(until[1]!);
      if (filter?.kind !== "card" || filter.types?.length !== 1 || filter.types[0] !== "Creature" || filter.anyOf || mayUntil) return null;
      effects.push({ type: "revealUntil", filter, found: "battlefield", rest: "shuffle", remember: true });
      si++;
      const demon = /^If that creature is an? ([A-Z][a-z]+), it deals damage equal to its power to each opponent\.?$/.exec(sentences[si + 1] ?? "");
      if (demon && CREATURE_TYPES.has(demon[1]!)) {
        const is: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [demon[1]!], text: demon[1]! };
        effects.push({ type: "if", cond: { kind: "putThisWayIs", filter: is }, effects: [{ type: "damage", amount: { count: { kind: "power", of: { ref: "created" } } }, to: { ref: "eachOpponent" }, by: "created" }] });
        si++;
      }
      continue;
    }
    // Hermit Druid: "Put that card into your hand and all other cards revealed this way into your graveyard."
    // Raph & Mikey: "Put that card onto the battlefield tapped and attacking and the rest ..." (CR 508.4).
    const untilPut = /^Put that card (into your hand|onto the battlefield( tapped(?: and attacking)?)?) and (the rest on the bottom of your library in a random order|all other cards revealed this way into your graveyard|the rest into your graveyard)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (until && untilPut && !/\b(?:named|chosen|that name)\b/.test(until[1]!)) {
      const filter = parseSearchFilter(until[1]!);
      if (!filter || filter.kind !== "card") return null;
      const onto = untilPut[1] !== "into your hand";
      // A planeswalker card enters with its loyalty (CR 306.5b): no choice either (The Prismatic Bridge).
      const safe = !!filter.types?.length && filter.types.every((x) => x === "Creature" || x === "Artifact" || x === "Land" || x === "Planeswalker") && !filter.anyOf;
      const tribal = !filter.types?.length && !!filter.subtypes?.length && filter.subtypes.every((x) => CREATURE_TYPES.has(x));
      // Tom Bombadil: "a Saga card", an enchantment that's never an Aura, entering with its lore counter (CR 714.3a).
      const saga = !filter.types?.length && filter.subtypes?.length === 1 && filter.subtypes[0] === "Saga";
      if (onto && !safe && !tribal && !saga) return null;
      if (sharesM && (onto || filter.types?.length !== 1 || filter.types[0] !== "Creature")) return null;
      const reveal: Effect = { type: "revealUntil", filter, found: onto ? "battlefield" : "hand", rest: /graveyard$/.test(untilPut[3]!) ? "graveyard" : "bottom", ...(untilPut[2] ? { tapped: true as const } : {}), ...(untilPut[2] === " tapped and attacking" ? { attacking: true as const } : {}), ...(sharesM ? { sharesCreatureTypeWithSubject: true as const } : {}) };
      effects.push(mayUntil ? { type: "may", effects: [reveal], text: `reveal cards from the top of your library until ${/^[aeiou]/.test(until[1]!) ? "an" : "a"} ${until[1]!}${sharesM ? " that shares a creature type with it" : ""} is revealed` } : reveal);
      si++;
      continue;
    }
    // "Choose an opponent. That player ..." (Myrkul's Edict, the Offerings): chosen as it resolves (CR 608.2d), not
    // targeted. One per ability.
    // Ezuri's Predation: "For each creature your opponents control, create a 4/4 ... token. Each of those tokens fights a
    // different one of those creatures."
    if (s === "Each of those tokens fights a different one of those creatures") {
      const prev = effects[effects.length - 1];
      const n = prev?.type === "createToken" && typeof prev.n === "object" && "count" in prev.n ? prev.n : undefined;
      if (!n || n.count.kind !== "permanents" || (n.times ?? 1) !== 1 || prev?.type !== "createToken" || !prev.token.types.includes("Creature")) return null;
      effects.push({ type: "createdFightEach", filter: n.count.filter });
      continue;
    }
    // The Ordeals: "Whenever enchanted creature attacks, put a +1/+1 counter on it. Then if it has three or more +1/+1
    // counters on it, sacrifice ~": that creature as the ability resolves (rulings).
    const ordeal = /^(?:Then i|I)f it has (two|three|four|five) or more \+1\/\+1 counters on it, sacrifice ~$/.exec(s);
    const counted = effects[effects.length - 1];
    if (ordeal && counted?.type === "counters" && counted.what.ref === "subject" && counted.counter === "+1/+1") {
      const sac = parseOne("Sacrifice ~", ctx);
      if (!sac) return null;
      effects.push({ type: "if", cond: { kind: "amountsCompare", a: { count: { kind: "counters", counter: "+1/+1", of: { ref: "subject" } } }, atLeast: num(ordeal[1]!) }, effects: sac });
      continue;
    }
    // The Black Gate: "Choose a player with the most life or tied for most life", any of them, you too.
    // The Master, Gallifrey's End: "Choose an opponent with the most life among your opponents", any of those tied.
    // Lowercase after a trigger's condition ("When ~ enters, choose an opponent").
    if (/^[Cc]hoose an opponent at random$/.test(s)) {
      if (ctx.chosenOpponent || ctx.eventPlayer || ctx.lastPlayerTarget !== undefined) return null;
      effects.push({ type: "choose", choice: "opponent", random: true });
      ctx.chosenOpponent = true;
      continue;
    }
    if (/^[Cc]hoose (?:an opponent(?: with the most life among your opponents)?|a player with the most life or tied for most life)$/.test(s)) {
      // The Offerings: a spell's second paragraph starting "Choose an opponent." again, its own choice (rulings on
      // Sylvan Offering: the same opponent or a different one, chosen as it resolves).
      if (ctx.chosenOpponent && ctx.spell && s === "Choose an opponent" && !ctx.eventPlayer && ctx.lastPlayerTarget === undefined) {
        effects.push({ type: "choose", choice: "opponent", again: true });
        continue;
      }
      if (ctx.chosenOpponent || ctx.eventPlayer || ctx.lastPlayerTarget !== undefined) return null;
      effects.push({ type: "choose", choice: "opponent", ...(/^[Cc]hoose a player with the most life/.test(s) ? { mostLife: true as const } : / most life /.test(s) ? { mostLife: "opponents" as const } : {}) });
      ctx.chosenOpponent = true;
      continue;
    }
    // Faramir, Prince of Ithilien: "Choose an opponent. At the beginning of that player's next end step, you draw a card if
    // they didn't attack you that turn. Otherwise, create three 1/1 ... tokens.": a delayed trigger (CR 603.7) at the
    // chosen player's end step, which checks as it resolves whether they attacked you with a creature that turn (not your
    // planeswalkers or battles, rulings).
    const theirEnd = ctx.chosenOpponent ? /^At the beginning of that player's next end step, (you [a-z][^,]+?) if they didn't attack you that turn$/.exec(s) : null;
    const theirElse = theirEnd ? /^Otherwise, ([a-z].+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (theirEnd && theirElse && si + 2 === sentences.length) {
      const sub: Ctx = { ...ctx, chosenOpponent: false, targets: [] };
      const yes = parseSentence(capital(theirEnd[1]!.replace(/^you (\w+)s? /, (_, v: string) => `${v} `)), sub);
      const no = parseSentence(capital(theirElse[1]!), sub);
      if (!yes || !no || sub.targets.length) return null;
      effects.push({ type: "delayed", when: "playersNextEndStep", whose: { ref: "chosenPlayer" }, effects: [{ type: "if", cond: { kind: "eventPlayerAttackedYou", not: true }, effects: yes, otherwise: no }], text: `${theirEnd[1]!} if they didn't attack you that turn. Otherwise, ${theirElse[1]!}` });
      si = sentences.length;
      continue;
    }
    // "Choose artifact or enchantment. Destroy all permanents of the chosen type" (Season of Gathering): a card type,
    // chosen as it resolves (CR 608.2d); "the chosen type" in the next instruction is that one.
    // Creeping Renaissance: "Choose a permanent type": one of the six (CR 110.4a).
    const typeChoice = new RegExp(`^Choose (${CARD_TYPE_WORD}(?:, ${CARD_TYPE_WORD})*,? or ${CARD_TYPE_WORD}|a permanent type)$`).exec(s);
    if (typeChoice && sentences[si + 1]) {
      const options = typeChoice[1] === "a permanent type" ? [...PERMANENT_TYPES] : typeChoice[1]!.split(/,? or |, /).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      const asCardType = (v: unknown): unknown => (Array.isArray(v) ? v.map(asCardType) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "chosen" && x === "type" ? "cardType" : asCardType(x)])) : v);
      // Turnabout: "Tap all untapped permanents of the chosen type target player controls, or untap all tapped
      // permanents of that type that player controls": which one, chosen as it resolves too (rulings), after the type.
      const turn = /^Tap all untapped permanents of the chosen type target player controls, or untap all tapped permanents of that type that player controls\.?$/.test(sentences[si + 1]!);
      if (turn) {
        const tap = attempt(ctx, () => parseOne("Tap all untapped permanents of the chosen type target player controls", ctx));
        const [first] = tap ?? [];
        if (tap?.length !== 1 || first?.type !== "tap" || first.what.ref !== "each" || first.what.filter.tapped !== false) return null;
        const untap: Effect = { type: "untap", what: { ...first.what, filter: { ...first.what.filter, tapped: true, text: "all tapped permanents of the chosen type that player controls" } } };
        effects.push({ type: "choose", choice: "cardType", options }, { type: "either", options: [asCardType([first]) as Effect[], asCardType([untap]) as Effect[]], labels: ["Tap all its untapped permanents of the chosen type", "Untap all its tapped permanents of the chosen type"] });
        si++;
        continue;
      }
      // Winding Way: "Choose creature or land. Reveal the top four cards of your library. Put all cards of the chosen type
      // revealed this way into your hand and the rest into your graveyard." (see the reveal "Put all" below).
      const revealN = new RegExp(`^Reveal the top ${NUMX} cards of your library$`, "i").exec(sentences[si + 1]!.replace(/\.$/, ""));
      if (revealN && revealN[1] !== "X" && /^Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard\.?$/.test(sentences[si + 2] ?? "")) {
        const n = num(revealN[1]!);
        if (!Number.isInteger(n)) return null;
        effects.push({ type: "choose", choice: "cardType", options }, { type: "dig", n, count: n, upTo: false, filter: { kind: "card", chosen: "cardType", text: "card of the chosen type" }, into: "hand", rest: "graveyard", reveal: true, required: true });
        si += 2;
        continue;
      }
      const next = attempt(ctx, () => parseOne(sentences[si + 1]!.replace(/\.$/, ""), ctx));
      if (!next || !JSON.stringify(next).includes('"chosen":"type"')) return null;
      effects.push({ type: "choose", choice: "cardType", options }, ...(asCardType(next) as Effect[]));
      si++;
      continue;
    }
    // "Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}" (High Tide): a
    // triggered mana ability until then (CR 605.1b, 603.7b), also for Islands that arrive later (rulings).
    const manaUntil = /^Until end of turn, (whenever .+ for mana, .+)$/.exec(s);
    if (manaUntil) {
      const trigger = parseManaTrigger(`W${manaUntil[1]!.slice(1)}.`);
      if (!trigger || trigger === "fail" || trigger.attached || trigger.ofChosen || trigger.adds.kind === "chosenColor") return null;
      effects.push({ type: "manaTriggerThisTurn", trigger });
      continue;
    }
    // A delayed triggered ability with a duration (CR 603.7b): the rest of the paragraph is its instructions.
    const floating = floatingTrigger(s, sentences.slice(si + 1), ctx);
    if (floating !== undefined) {
      if (!floating) return null;
      effects.push(floating);
      si = sentences.length;
      continue;
    }
    // Ugin, the Ineffable: "Exile the top card of your library face down and look at it. Create a 2/2 colorless Spirit
    // creature token. When that token leaves the battlefield, put the exiled card into your hand." A delayed trigger for
    // Mysterio, Master of Illusion: "create a 3/3 ... token for each nontoken Villain you control. Exile those tokens when ~
    // leaves the battlefield.": a delayed trigger (CR 603.7) for ~ as it is now, set up only if it's still there (rulings),
    // about the tokens this created.
    if (s === "Exile those tokens when ~ leaves the battlefield" && effects[effects.length - 1]?.type === "createToken" && !ctx.spell) {
      effects.push({ type: "delayed", when: "leaves", of: { ref: "self" }, effects: [{ type: "exileRemembered" }], text: "exile those tokens" });
      continue;
    }
    // each token made (rulings: with two tokens, the first to leave brings the card back), about the card exiled.
    if (s === "When that token leaves the battlefield, put the exiled card into your hand") {
      const [made, faceDown] = [effects[effects.length - 1], effects[effects.length - 2]];
      if (made?.type !== "createToken" || faceDown?.type !== "exileFaceDown" || faceDown.from !== "top" || faceDown.n !== undefined || faceDown.play) return null;
      effects.push({ type: "delayed", when: "leaves", each: "created", effects: [{ type: "returnFaceDownExiled" }], text: "put the exiled card into your hand" });
      continue;
    }
    // Mechtitan Core: "Create Mechtitan, a legendary 10/10 Construct ... token .... When that token leaves the battlefield,
    // return all cards exiled with ~ except ~ to the battlefield tapped under their owners' control." A delayed trigger for
    // the token (CR 603.7c), about the cards this ability's cost exiled (CR 607.2a), still in exile; ~ itself stays there.
    if (s === "When that token leaves the battlefield, return all cards exiled with ~ except ~ to the battlefield tapped under their owners' control") {
      const made = effects[effects.length - 1];
      if (made?.type !== "createToken" || ctx.spell) return null;
      effects.push({ type: "delayed", when: "leaves", each: "created", effects: [{ type: "returnExiled", under: "owner", tapped: true, fromCost: true }], text: "return all cards exiled with ~ except ~ to the battlefield tapped under their owners' control" });
      continue;
    }
    // The Deck of Many Things: "Put a creature card from any graveyard onto the battlefield under your control. When that
    // creature dies, its owner loses the game." A delayed trigger about the permanent it became, for the rest of the game
    // (CR 603.7c, 400.7); the card's owner, whoever controlled it (CR 108.3).
    if (s === "When that creature dies, its owner loses the game") {
      const put = effects[effects.length - 1];
      if (put?.type !== "chooseFromGraveyard" || put.dest !== "battlefield" || !put.anyGraveyard || put.n !== 1 || put.milled) return null;
      effects.push({ type: "delayed", when: "dies", of: { ref: "created" }, effects: [{ type: "loseGame", who: { ref: "subjectOwner" } }], text: "its owner loses the game" });
      continue;
    }
    // "Choose a color. Another target creature you control gains ... hexproof from that color until end of turn. It can't
    // be blocked by creatures of that color this turn." (Skrelv): the color chosen as it resolved (CR 608.2d).
    if (effects.some((x) => x.type === "choose" && x.choice === "color")) s = s.replace(/\b(from|of) that color\b/g, "$1 the chosen color");
    // "Until end of turn, X ..." reads the same as "X ... until end of turn".
    if (/^[Uu]ntil end of turn, /.test(s)) s = `${s.replace(/^[Uu]ntil end of turn, /, "").replace(/^./, (c) => c.toUpperCase())} until end of turn`;
    // "Until your next turn, creatures you control gain "{T}: Add one mana of any color."" (Song of Freyalise): the same.
    const nextTurnGain = /^[Uu]ntil your next turn, ((?:creatures|other creatures|each creature) you control) (gains?|gets?) ([^,]+)$/.exec(s);
    if (nextTurnGain && !/\b(?:until|whenever|this turn)\b/.test(nextTurnGain[3]!.replace(/"[^"]*"/g, ""))) s = `${capital(nextTurnGain[1]!)} ${nextTurnGain[2]!} ${nextTurnGain[3]!} until your next turn`;
    // "Target creature you control gains protection from the color of your choice until end of turn": the
    // color is chosen as it resolves (CR 608.2d), after the target was chosen on casting.
    // "Target creature gains your choice of menace or lifelink until end of turn", "... flying, vigilance, deathtouch, or
    // haste": one of those keywords, chosen as it resolves (CR 608.2d).
    // "Gains protection from colorless or from the color of your choice" (Giver of Runes): one of six, chosen as it resolves.
    // "Gains protection from artifacts or from the color of your choice" (Apostle's Blessing) likewise.
    s = s.replace(/ (gains?) protection from (colorless|artifacts) or from the color of your choice\b/, " $1 your choice of protection from $2, protection from white, protection from blue, protection from black, protection from red, or protection from green");
    const choiceOf = / (gains?|gain|loses?) your choice of ((?:[a-z ]+, )*[a-z ]+,? or [a-z ]+?)(?= until end of turn\b| and |$)/.exec(s);
    if (choiceOf) {
      const options = choiceOf[2]!.split(/,? or |, /).map((w) => keywordOf(w));
      // One such choice per ability: it's kept for the rest of the resolution.
      if (options.length < 2 || options.some((k) => !k || k === CHOSEN_PROTECTION) || effects.some((x) => x.type === "choose" && x.choice === "keyword")) return null;
      effects.push({ type: "choose", choice: "keyword", options: options as string[] });
      s = s.replace(choiceOf[0]!, ` ${choiceOf[1]} ${CHOSEN_KEYWORD}`);
    }
    // "Gains protection from the card type of your choice until end of turn" (Pippin, Guard of the Citadel): any card type
    // (rulings; kindred cards aren't supported), chosen as it resolves (CR 608.2d).
    if (/ gains? protection from the card type of your choice\b/.test(s)) {
      if (effects.some((x) => x.type === "choose" && x.choice === "cardType")) return null;
      effects.push({ type: "choose", choice: "cardType", options: Object.keys(CARD_TYPE_PLURAL) });
      s = s.replace("the card type of your choice", "the chosen card type");
    }
    // Pale Wayfarer, Wishmonger: "Target creature gains protection from the color of its controller's choice until end of
    // turn": that creature's controller chooses as it resolves (CR 608.2d), the target being the next one.
    if (/^Target creature gains protection from the color of its controller's choice until end of turn$/.test(s) && !effects.some((x) => x.type === "choose")) {
      effects.push({ type: "choose", choice: "color", who: { ref: "targetController", index: ctx.targets.length } });
      s = s.replace("the color of its controller's choice", "the chosen color");
    }
    if (/ gains? protection from the color of your choice\b/.test(s)) {
      effects.push({ type: "choose", choice: "color" });
      s = s.replace("the color of your choice", "the chosen color");
    }
    // "~ becomes the creature type of your choice until end of turn", "Creatures of the creature type of your choice
    // get +X/+X until end of turn": the type is chosen as it resolves (CR 608.2d). Not "target creatures of the
    // creature type of your choice", which would need the choice as the targets are chosen.
    // "Target land becomes the basic land type of your choice until end of turn" (Reef Shaman), "~ becomes the color of
    // your choice until end of turn" (Kavu Chameleon): chosen as it resolves too.
    if (/\bbecomes? the basic land type of your choice\b/.test(s)) {
      effects.push({ type: "choose", choice: "basicLandType" });
      s = s.replace(/\b(becomes?) the basic land type of your choice\b/, "$1 the chosen basic land type");
    }
    // Prismatic Lace: "Target permanent becomes the color or colors of your choice": one or more colors, chosen as it
    // resolves (CR 608.2d), which replace its colors (CR 105.3).
    if (/\bbecomes? the color or colors of your choice\b/.test(s)) {
      effects.push({ type: "choose", choice: "colors" });
      s = s.replace(/\b(becomes?) the color or colors of your choice\b/, "$1 the chosen colors");
    }
    if (/\bbecomes? the color of your choice\b/.test(s)) {
      effects.push({ type: "choose", choice: "color" });
      // Mondo Gecko: "~ becomes the color of your choice and gains hexproof from that color": the same color.
      s = s.replace(/\b(becomes?) the color of your choice\b/, "$1 the chosen color").replace(/\b(gains? hexproof) from that color\b/, "$1 from the chosen color");
    }
    // Tundra Kavu: "Target land becomes a Plains or an Island until end of turn": one of the two, chosen as it resolves
    // (CR 608.2d), the same as "the basic land type of your choice" with only those two.
    const landOr = /\bbecomes? an? (Plains|Island|Swamp|Mountain|Forest) or an? (Plains|Island|Swamp|Mountain|Forest)\b/.exec(s);
    if (landOr && landOr[1] !== landOr[2]) {
      effects.push({ type: "choose", choice: "basicLandType", options: [landOr[1]!, landOr[2]!] });
      s = s.replace(/\b(becomes?) an? (?:Plains|Island|Swamp|Mountain|Forest) or an? (?:Plains|Island|Swamp|Mountain|Forest)\b/, "$1 the chosen basic land type");
    }
    if (/\bbecomes? the creature type of your choice\b/.test(s) || (/\bof the creature type of your choice\b/.test(s) && !/\btarget\b/i.test(s))) {
      effects.push({ type: "choose", choice: "creatureType" });
      s = s.replace(/\b(becomes?) the creature type of your choice\b/, "$1 the chosen creature type").replace(/\bof the creature type of your choice\b/, "of the chosen type");
    }
    // Retether: "Return each Aura card from your graveyard to the battlefield. Only creatures can be enchanted this way."
    if (/^Only creatures can be enchanted this way$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "returnAllFromGraveyard" || last.toHand || last.auraOnCreature) return null;
      last.auraOnCreature = true;
      continue;
    }
    // "~ deals 4 damage to target creature. Excess damage is dealt to that creature's controller instead." (Flame Spill):
    // the damage beyond lethal goes to its controller (CR 120.4a).
    if (/^Excess damage is dealt to that creature's controller instead$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "damage" || last.divided || last.evenly || last.also || last.excessToController) return null;
      last.excessToController = true;
      continue;
    }
    // "Target creature you control deals damage equal to its power to target creature you don't control. If the creature
    // you control has trample, excess damage is dealt to that creature's controller instead." (Ram Through)
    if (/^If the creature you control has trample, excess damage is dealt to that creature's controller instead$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "bite" || last.a.ref !== "target" || last.a.n || ctx.targets[last.a.index]?.controller !== "you") return null;
      last.excessIfTrample = true;
      continue;
    }
    // "If excess damage was dealt to that creature this way, investigate" (Torch the Witness), "If excess damage was
    // dealt to a permanent this way, create that many tapped Treasure tokens" (Bottle-Cap Blast): after its damage.
    // "If excess damage was dealt to a creature this way, draw a card" (Vikya): only a creature's counts.
    const ifExcess = ctx.excessDamage ? /^If excess damage was dealt (?:to (that creature|that permanent|a permanent|a creature) )?this way, (.+)$/.exec(s) : null;
    if (ifExcess && !(ifExcess[1] === "a creature" && /\bthat\b/.test(ifExcess[2]!))) {
      const inner = parseOne(ifExcess[2]!.replace(/^create that many (.+) tokens$/, "create a number of $1 tokens equal to the excess damage dealt this way"), ctx);
      if (!inner || inner.some((x) => pauses(x))) return null;
      effects.push({ type: "if", cond: { kind: "excessDealt", ...(ifExcess[1] === "a creature" ? { creature: true as const } : {}) }, effects: inner });
      if (!defineX()) return null;
      continue;
    }
    // After a fight: "If the creature the opponent controls is dealt excess damage this way, add that much {R}" (The Last
    // Agni Kai), "When excess damage is dealt to the creature an opponent controls this way, destroy ..." (Rhino's
    // Rampage, a reflexive trigger, CR 603.12): the excess dealt to that target creature (CR 120.10).
    const fought = effects[effects.length - 1];
    const fightExcess = fought?.type === "fight" && fought.b.ref === "target" && !fought.b.n && ctx.targets[fought.b.index]?.controller === "opponent" ? /^(?:If the creature (?:the|an) opponent controls is dealt excess damage this way, (.+)|When excess damage is dealt to the creature an opponent controls this way, (.+))$/.exec(s) : null;
    if (fightExcess && fought?.type === "fight" && fought.b.ref === "target") {
      const index = fought.b.index;
      if (fightExcess[1]) {
        const add = /^add that much (\{[WUBRGC]\})$/.exec(fightExcess[1]);
        if (!add) return null;
        effects.push({ type: "if", cond: { kind: "excessDealt", target: index }, effects: [{ type: "addMana", mana: add[1]!, times: { count: { kind: "excessThisWay", target: index } } }] });
        continue;
      }
      if (/\b(that|those|it|X)\b/.test(fightExcess[2]!)) return null;
      const reflexive = reflexiveBody([fightExcess[2]!, ...sentences.slice(si + 1)].join(". "), ctx);
      if (!reflexive) return null;
      si = sentences.length;
      effects.push({ type: "if", cond: { kind: "excessDealt", target: index }, effects: [{ type: "reflexive", body: reflexive }] });
      continue;
    }
    // "~ deals 7 damage to target creature or planeswalker. When it deals excess damage this way, destroy target artifact or
    // enchantment an opponent controls with mana value less than or equal to that amount of excess damage" (Unleash the
    // Inferno): a reflexive trigger (CR 603.12) whose X is the excess dealt.
    const whenExcess = ctx.excessDamage && effects[effects.length - 1]?.type === "damage" ? /^When (?:it|~) deals excess damage this way, (.+)$/.exec(s) : null;
    if (whenExcess) {
      const text = [whenExcess[1]!, ...sentences.slice(si + 1)].join(". ");
      const withX = text.replace(/\bwith mana value less than or equal to that amount of excess damage\b/g, "with mana value X or less");
      if (/\b(that|those|it)\b/.test(withX.replace(/^destroy /, "")) || (/\bX\b/.test(text) && withX === text)) return null;
      const reflexive = reflexiveBody(withX, ctx, false, false, withX !== text);
      if (!reflexive) return null;
      si = sentences.length;
      effects.push({ type: "if", cond: { kind: "excessDealt" }, effects: [{ type: "reflexive", body: reflexive, ...(withX !== text ? { xExcess: true as const } : {}) }] });
      continue;
    }
    // Djeru and Hazoret: "Until end of turn, you may cast the exiled card without paying its mana cost": a permission for
    // the rest of the turn, the usual timing rules applying (CR 601.3), unlike The Key to the Vault's cast as it resolves.
    if (/^(?:Until end of turn, you may cast the exiled card without paying its mana cost|You may cast the exiled card (?:this turn )?without paying its mana cost (?:this turn|until end of turn))$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "dig" || prev.into !== "exile" || prev.play || prev.castFree || prev.count !== 1 || prev.filter?.types?.includes("Land") || !prev.filter?.types?.length) return null;
      prev.play = "thisTurn";
      prev.playFree = true;
      continue;
    }
    // "You may play the exiled card this turn" after looking at the top cards and exiling one (Nahiri's Warcrafting).
    if (/^You may play the exiled card this turn$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "dig" || prev.into !== "exile" || prev.play || prev.count !== 1) return null;
      prev.play = "thisTurn";
      continue;
    }
    // Blitzwing, Adaptive Assailant: "choose flying or indestructible at random. ~ gains that ability until end of turn": one
    // of the two, chosen as it resolves (CR 608.2c).
    const kwAtRandom = /^[Cc]hoose ([a-z]+) or ([a-z]+) at random$/.exec(s);
    if (kwAtRandom && sentences[si + 1] === "~ gains that ability until end of turn") {
      const [a, b] = [kwAtRandom[1]!, kwAtRandom[2]!].map((k) => parseOne(`~ gains ${k} until end of turn`, ctx));
      if (!a || !b) return null;
      effects.push({ type: "if", cond: { kind: "atRandom" }, effects: a, otherwise: b });
      si++;
      continue;
    }
    // Blitzwing, Cruel Tormentor: "Target opponent loses life equal to the life that player lost this turn. If no life is lost
    // this way, convert ~": none if the amount was 0 or their life total couldn't change (CR 119.3).
    const noLoss = /^If no life is lost this way, (.+)$/.exec(s);
    if (noLoss) {
      const inner = effects[effects.length - 1]?.type === "loseLife" && parseOne(capital(noLoss[1]!), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "lifeLostThisWay", byLoss: true } }, max: 0 }, effects: inner });
      continue;
    }
    // "Each opponent loses 2 life. You gain life equal to the life lost this way."
    if (/^You gain life equal to the (?:total )?life lost this way$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "loseLife") return null;
      last.drain = true;
      continue;
    }
    // Cruel Entertainment: each of two different target players (CR 115.3) controls the other during the other's next turn
    // (CR 723).
    if (
      s === "Choose target player and another target player" &&
      sentences[si + 1] === "The first player controls the second player during the second player's next turn, and the second player controls the first player during the first player's next turn"
    ) {
      const first = addTarget(ctx, { kind: "player", text: "target player" });
      const second = addTarget(ctx, { kind: "player", text: "another target player", distinctFrom: [first] });
      const [a, b] = [{ ref: "target" as const, index: first }, { ref: "target" as const, index: second }];
      effects.push({ type: "controlPlayer", who: b, controller: a }, { type: "controlPlayer", who: a, controller: b });
      si++;
      continue;
    }
    // Emrakul, the Promised End: "... during that player's next turn. After that turn, that player takes an extra turn."
    // The extra turn comes right after the controlled turn (rulings).
    if (/^After that turn, that player takes an extra turn$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "controlPlayer" || last.who.ref !== "target" || last.extraTurnAfter) return null;
      last.extraTurnAfter = true;
      continue;
    }
    // "Take an extra turn after this one. At the beginning of that turn's end step, you lose the game." (Final Fortune)
    if (/^At the beginning of that turn's end step, you lose the game$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "extraTurn" || last.who.ref !== "you" || last.n !== 1) return null;
      last.loseAtEnd = true;
      continue;
    }
    // "Take an extra turn after this one. Skip the untap step of that turn." (Savor the Moment, CR 614.10)
    if (/^Skip the untap step of that turn$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "extraTurn" || last.who.ref !== "you" || last.n !== 1) return null;
      last.skipUntap = true;
      continue;
    }
    // The Pacts: "At the beginning of your next upkeep, pay {2}{B}. If you don't, you lose the game." A delayed trigger
    // made as the spell resolves (CR 603.7a; none if it doesn't resolve, rulings). Paying is up to you; if you don't or
    // can't, you lose (CR 104.3e).
    const pact = /^At the beginning of your next upkeep, pay ((?:\{[^}]+\})+)$/.exec(s);
    if (pact && opts.spell && sentences[si + 1] === "If you don't, you lose the game") {
      const pay = parsePayCost(pact[1]!);
      if (!pay) return null;
      const text = `pay ${pact[1]} or lose the game`;
      effects.push({ type: "delayed", when: "yourNextUpkeep", effects: [{ type: "may", effects: [], pay, otherwise: [{ type: "loseGame", who: { ref: "you" } }], text }], text });
      si++;
      continue;
    }
    // Cosmic Intervention: "If a permanent you control would be put into a graveyard from the battlefield this turn, exile it
    // instead. Return it to the battlefield under its owner's control at the beginning of the next end step." (CR 614.1a,
    // 603.7a): the "it" returned is each permanent exiled this way.
    if (/^If a permanent you control would be put into a graveyard from the battlefield this turn, exile it instead$/.test(s) && /^Return it to the battlefield under its owner's control at the beginning of the next end step\.?$/.test(sentences[si + 1] ?? "") && opts.spell) {
      effects.push({ type: "exileReturnThisTurn" });
      si++;
      continue;
    }
    // "~ deals 4 damage to target creature. The damage can't be prevented." (CR 615.12)
    if (/^The damage can't be prevented$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "damage") return null;
      last.unpreventable = true;
      continue;
    }
    // "It can't be regenerated." / "They can't be regenerated." after a destroy (CR 701.19c), "That creature", "Those
    // creatures", "Creatures destroyed this way", "A creature destroyed this way".
    if (/^(?:It|They|The creature|That (?:creature|artifact|permanent|Wall)|Those (?:creatures|permanents)|(?:Creatures|A creature) destroyed this way) can't be regenerated$/i.test(s)) {
      // Soul Rend: "Destroy target creature if it's white. A creature destroyed this way can't be regenerated.": the
      // conditional destroy.
      const prev = effects[effects.length - 1];
      // Kirtar's Wrath: "..., instead destroy all creatures, then create two 1/1 white Spirit creature tokens with flying.
      // Creatures destroyed this way can't be regenerated.": the destroy done instead.
      const insteadDestroy = /^Creatures destroyed this way/.test(s) && prev?.type === "if" && prev.otherwise && prev.effects[0]?.type === "destroy" && prev.effects.slice(1).every((e) => e.type !== "destroy") ? prev.effects[0] : undefined;
      if (insteadDestroy?.type === "destroy") {
        insteadDestroy.noRegen = true;
        continue;
      }
      // Reign of Terror: "Destroy all green creatures or all white creatures. They can't be regenerated.": either one.
      if (prev?.type === "either" && /^They\b/.test(s) && prev.options.every((o) => o.length === 1 && o[0]!.type === "destroy")) {
        for (const o of prev.options) if (o[0]!.type === "destroy") o[0]!.noRegen = true;
        continue;
      }
      // Essence Vortex: "Destroy target creature unless its controller pays life equal to its toughness. A creature destroyed
      // this way can't be regenerated.": the destroy if they don't pay.
      const last = (prev?.type === "if" && !prev.otherwise) || (prev?.type === "punisher" && /^A creature destroyed this way/.test(s)) ? (prev.effects.length === 1 ? prev.effects[0] : undefined) : prev;
      if (!last || last.type !== "destroy") return null;
      last.noRegen = true;
      // "Destroy target nonblack creature and target land. They can't be regenerated.": both.
      if (/^They\b/.test(s)) for (let i = effects.length - 2, e = effects[i]; e?.type === "destroy"; e = effects[--i]) e.noRegen = true;
      // Part of the sentence before, for one after it ("If there are seven or more cards in your graveyard, instead ...",
      // Kirtar's Wrath).
      curStart = prevStart;
      if (!thenParts.has(sentences[si]!)) curWhole = prevWhole;
      continue;
    }
    // Taigam, Master Opportunist: "copy it, then exile the spell you cast with four time counters on it. If it doesn't have
    // suspend, it gains suspend.": the spell that triggered it, if it's still on the stack, exiled (not countered, so even
    // one that can't be countered) and suspended (CR 702.62b).
    const exileCast = ctx.castSpell ? new RegExp(`^(?:[Tt]hen )?[Ee]xile the spell you cast with ${NUM} time counters? on it$`).exec(s) : null;
    if (exileCast && /^If it doesn't have suspend, it gains suspend\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "counterSpell", index: -1, cause: true, exileSpell: true, suspend: Number(amt(exileCast[1]!)) });
      si++;
      continue;
    }
    // "If that spell is countered this way, exile it instead of putting it into its owner's graveyard" (CR 701.6a),
    // "... put it on top of its owner's library instead of into that player's graveyard" (Memory Lapse).
    // Remand: "... put it into its owner's hand instead of into that player's graveyard".
    // "Exile target creature and put two time counters on it. If it doesn't have suspend, it gains suspend." (Suspend),
    // "exile target nonland card from your graveyard with two time counters on it. If ..." (Doom's Time Platform), "When ~
    // dies, exile it with three time counters on it and it gains suspend." (Epochrasite): the card in exile is suspended
    // (CR 702.62b), with suspend's abilities for as long as it stays there (CR 400.7).
    const susp = new RegExp(`^([Ee]xile .+?) (?:with ${NUM} time counters? on it|and put ${NUM} time counters? on it)( and it gains suspend)?$`).exec(s);
    if (susp && (susp[4] || /^If it doesn't have suspend, it gains suspend\.?$/.test(sentences[si + 1] ?? ""))) {
      const before = ctx.targets.length;
      const inner = parseOne(susp[1]!, ctx);
      const ex = inner?.length === 1 ? inner[0] : undefined;
      if (ex?.type !== "exile" || ex.until || ex.linked || ex.ownerMay || ex.youMay || ctx.targets.length > before + 1) return null;
      effects.push({ ...ex, suspend: Number(amt(susp[2] ?? susp[3]!)) });
      if (!susp[4]) si++;
      continue;
    }
    // "Put four time counters on the exiled card. If it doesn't have suspend, it gains suspend." (Jhoira of the Ghitu): the
    // card its "Exile a nonland card from your hand" cost exiled (checked in compile.ts).
    const suspendCost = new RegExp(`^Put ${NUM} time counters? on the exiled card$`).exec(s);
    if (suspendCost && /^If it doesn't have suspend, it gains suspend\.?$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "suspendCard", what: { ref: "costExiled" }, n: Number(amt(suspendCost[1]!)) });
      si++;
      continue;
    }
    // Delay: "If the spell is countered this way, exile it with three time counters on it instead of putting it into its
    // owner's graveyard. If it doesn't have suspend, it gains suspend." (CR 702.62).
    const delay = new RegExp(`^If (?:that|the) spell is countered this way, exile it with ${NUM} time counters? on it instead of putting it into its owner's graveyard$`).exec(s);
    if (delay && /^If it doesn't have suspend, it gains suspend\.?$/.test(sentences[si + 1] ?? "")) {
      const last = effects[effects.length - 1];
      if (last?.type !== "counterSpell" || last.bounce || last.unless) return null;
      last.exile = true;
      last.suspend = Number(amt(delay[1]!));
      si++;
      continue;
    }
    // Fold into Aether: "If that spell is countered this way, its controller may put a creature card from their hand onto the
    // battlefield": only if it was countered (rulings: nothing happens for one that can't be), its controller as it was
    // on the stack (CR 608.2h), even if that's you (rulings).
    const foldInto = /^If that spell is countered this way, (its controller may put .+ from their hand onto the battlefield)$/.exec(s);
    if (foldInto) {
      const last = effects[effects.length - 1];
      if (last?.type !== "counterSpell" || last.bounce || last.exileSpell || last.cause || last.unless) return null;
      const before = ctx.targets.length;
      const inner = parseOne(capital(foldInto[1]!), ctx);
      if (!inner || inner.length !== 1 || inner[0]!.type !== "putFromHand" || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "spellCountered" }, effects: inner });
      continue;
    }
    // Hinder: "put that card on your choice of the top or bottom of its owner's library instead ...".
    const lapse = /^If that spell is countered this way, (?:(exile it) instead of putting it into its owner's graveyard|put (?:it|that card) (on top of its owner's library|into its owner's hand|on your choice of the top or bottom of its owner's library) instead of into that player's graveyard)$/i.exec(s);
    if (lapse) {
      const last = effects[effects.length - 1];
      if (last?.type !== "counterSpell" || last.bounce) return null;
      if (lapse[1]) last.exile = true;
      else if (lapse[2] === "into its owner's hand") last.hand = true;
      else if (lapse[2] === "on your choice of the top or bottom of its owner's library") last.libraryChoice = true;
      else last.top = true;
      continue;
    }
    // "It's still a land." keeps the land type a "becomes a creature" effect would replace (CR 205.1a).
    if (/^(?:It's still an? (land|artifact|enchantment)|They're still (?:lands|artifacts|enchantments))$/i.test(s)) {
      // "You may have target land you control become a 3/3 Elemental creature ... It's still a land." (Embodiment of
      // Insight): the effect the "may" makes.
      const lastFx = effects[effects.length - 1];
      const pool = (lastFx?.type === "may" || (lastFx?.type === "if" && !lastFx.otherwise)) && lastFx.effects.length === 1 ? lastFx.effects : effects;
      const last = [...pool].reverse().find((e) => e.type === "continuous" && e.mods.some((x) => x.kind === "setTypes" || (x.kind === "addTypes" && x.types.includes("Creature"))));
      if (!last || last.type !== "continuous") return null;
      // "Becomes a 2/2 Assembly-Worker artifact creature" already keeps its card types (CR 205.1b).
      // Every prior card type, subtype and supertype stays, and a new supertype ("a legendary 6/6 ...") is added (205.1b).
      last.mods = last.mods.map((x) => (x.kind === "setTypes" ? { kind: "addTypes", types: x.types, subtypes: x.subtypes, ...(x.supertypes ? { supertypes: x.supertypes } : {}) } : x));
      continue;
    }
    // "Until end of turn, ~ becomes a 3/2 ... creature. It's still a land. It can't be blocked this turn." (Creeping Tar
    // Pit): one more thing the same effect does, for the same turn.
    const animated = effects[effects.length - 1];
    if (/^It can't be blocked this turn$/.test(s) && animated?.type === "continuous" && animated.what.ref === "self" && animated.duration === "endOfTurn" && animated.mods.some((x) => x.kind === "addTypes" && x.types.includes("Creature"))) {
      animated.mods = [...animated.mods, { kind: "cantBeBlocked" }];
      continue;
    }
    // Flowstone Sculpture: "Put a +1/+1 counter on ~ or ~ gains flying, first strike, or trample": one of the four, chosen
    // as it resolves (CR 608.2d); a keyword gained with no duration lasts indefinitely (CR 611.2a).
    const flowstone = /^Put a \+1\/\+1 counter on ~ or ~ gains ([a-z]+(?: [a-z]+)?), ([a-z]+(?: [a-z]+)?), or ([a-z]+(?: [a-z]+)?)$/.exec(s);
    if (flowstone) {
      const kws = [flowstone[1]!, flowstone[2]!, flowstone[3]!].map((k) => parseKeywordList(k));
      if (kws.some((k) => k?.length !== 1)) return null;
      effects.push({ type: "either", options: [[{ type: "counters", what: { ref: "self" }, counter: "+1/+1", n: 1 }], ...kws.map((k): Effect[] => [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "addKeywords", keywords: k! }], duration: "game" }])], labels: ["Put a +1/+1 counter on it", ...[flowstone[1]!, flowstone[2]!, flowstone[3]!].map((k) => `It gains ${k}`)] });
      continue;
    }
    // 'It has "Sacrifice ~: Add {C}."' gives the tokens just created that ability (CR 111.3).
    const has = /^(?:It has|They have|They each have|Those tokens have) "(.+)"$/.exec(s);
    if (has) {
      const prev = effects[effects.length - 1];
      const last = prev?.type === "may" ? prev.effects[prev.effects.length - 1] : prev;
      if (last?.type !== "createToken" || last.token.abilities || !compileQuoted(has[1]!)) return null;
      last.token = { ...last.token, abilities: has[1]! };
      continue;
    }
    const fx = parseOne(s, ctx);
    if (!fx) return null;
    effects.push(...fx);
    if (!defineX()) return null;
  }
  if (payFirst || dig || !closeGate() || !closeRow()) return null;
  // "Draw X cards, where X is ... as you cast this spell. If ..., you gain twice X life." (Lifestream's Blessing): the X
  // counted as it was cast is the X of the rest of the text too.
  if (castX) effects.splice(castX.from, effects.length - castX.from, ...replaceX(effects.slice(castX.from), castX.def));
  return effects.length ? { targets: ctx.targets, effects, text, ...(resolvesAnyway ? { resolvesAnyway: true as const } : {}) } : null;
}

/** "{2}{U}", "3 life", "{E}{E}", "{1} and 2 life": a cost paid as an ability resolves. */
export function parsePayCost(text: string): PayCost | null {
  let m: RegExpExecArray | null;
  if ((m = /^((?:\{E\})+)$/.exec(text))) return { energy: m[1]!.length / 3 };
  if ((m = /^(\w+) \{E\}$/.exec(text))) {
    const n = num(m[1]!);
    return Number.isFinite(n) ? { energy: n } : null;
  }
  if ((m = /^(\d+) life$/.exec(text))) return { life: Number(m[1]) };
  // {S}: mana from a snow source (CR 107.4h), as in "Cumulative upkeep {S}".
  if ((m = /^((?:\{(?:\d+|[WUBRGCS]|[WUBRG]\/[WUBRG])\})+)(?: and (\d+) life)?$/.exec(text))) return { mana: m[1]!, ...(m[2] ? { life: Number(m[2]) } : {}) };
  return null;
}

/** The ways a spell can have been cast that a sentence may depend on, as said in its text. */
const HOW_CAST: { re: string; cond: SpellCondition; not?: true; spellOnly?: true; activatedOnly?: true; noTargets?: true; ungated?: true }[] = [
  { re: "~ was bargained", cond: { kind: "bargained" }, spellOnly: true },
  { re: "~ was cast from a graveyard", cond: { kind: "castFromGraveyard" }, spellOnly: true, noTargets: true },
  { re: "~ was cast from exile", cond: { kind: "castFromGraveyard", exile: true }, spellOnly: true, noTargets: true },
  { re: "~ was cast from your hand", cond: { kind: "castFromGraveyard", hand: true }, spellOnly: true, noTargets: true },
  // See the Truth: a copy wasn't cast at all (CR 707.10), so it isn't the same as "if ~ wasn't cast from your hand".
  { re: "~ was cast from anywhere other than your hand", cond: { kind: "castFromGraveyard", notHand: true }, spellOnly: true, noTargets: true },
  // Twinned Vision: "if ~ wasn't cast from your hand", true of a copy too.
  { re: "~ wasn't cast from your hand", cond: { kind: "castFromGraveyard", hand: true }, not: true, spellOnly: true, noTargets: true },
  { re: "~ was cast using teamwork", cond: { kind: "teamwork" }, spellOnly: true },
  // Addendum (CR 207.2c). Its targets are chosen whenever it's cast; they're only not acted on (Return to Dust rulings).
  { re: "you cast ~ during your main phase", cond: { kind: "castInMain" }, spellOnly: true, ungated: true },
  // In a spell, or its permanent's enters trigger (compile checks it's one of those).
  { re: "evidence was collected", cond: { kind: "evidence" } },
  { re: "the gift was promised", cond: { kind: "gift" } },
  { re: "the gift wasn't promised", cond: { kind: "gift" }, not: true },
  // The creature a sacrifice cost sacrificed (compile checks there is one). Costs are paid after targets are chosen
  // (CR 601.2c, 601.2h), so no target can depend on it.
  { re: "the sacrificed creature was suspected", cond: { kind: "sacrificedSuspected" }, noTargets: true },
  { re: "the sacrificed (?:creature|artifact) was legendary", cond: { kind: "sacrificedLegendary" }, noTargets: true },
  { re: "~'s surge cost was paid", cond: { kind: "altPaid", alt: "surge" } },
  { re: "~'s sneak cost was paid", cond: { kind: "altPaid", alt: "sneak" }, spellOnly: true },
  // "As an additional cost to cast this spell, you may waterbend {2}" is paid like kicker (CompiledCard.kicker.waterbend).
  { re: "~'s waterbend cost was paid", cond: { kind: "kicked" } },
  // The Masteries: "If the {1}{B} cost was paid" (compile checks it's the card's "rather than pay" cost).
  { re: "the (?:\\{[^}]+\\})+ cost was paid", cond: { kind: "altPaid", alt: "alternative" }, spellOnly: true },
  { re: "~'s madness cost was paid", cond: { kind: "altPaid", alt: "madness" }, spellOnly: true },
  { re: "~'s spectacle cost was paid", cond: { kind: "altPaid", alt: "spectacle" } },
  { re: "~'s prowl cost was paid", cond: { kind: "altPaid", alt: "prowl" } },
  // Mana from a Treasure (CR 106.3) is spent after the targets are chosen (CR 601.2c, 601.2h), so no target can depend on it.
  { re: "mana from a Treasure was spent to cast ~", cond: { kind: "treasure" }, spellOnly: true, noTargets: true },
  { re: "mana from a Treasure was spent to activate this ability", cond: { kind: "treasure" }, activatedOnly: true, noTargets: true },
  // Dragon Whelp: "If this ability has been activated four or more times this turn, sacrifice ~ at the beginning of the
  // next end step": counted as it resolves, activations after it included (rulings).
  { re: "this ability has been activated four or more times this turn", cond: { kind: "activatedTimes", n: 4 }, activatedOnly: true, noTargets: true },
];

/**
 * "If ~ was bargained, X", "X if ~ was cast using teamwork", "Also X if ...", "X instead if ...", "X unless ~ was cast
 * using teamwork" (the same as "if it wasn't"): the condition, and X ("instead" kept for parseKicked).
 */
/**
 * "You gain X life if {G} was spent to cast ~ and X life if {W} was spent to cast ~" (Dawnglow Infusion), "Creatures your
 * opponents control lose flying until end of turn if {G} was spent to cast ~, and creatures you control gain flying until
 * end of turn if {U} was spent to cast ~": two instructions, each with its own condition. A second half that goes on
 * from the first's verb ("X life", "3 damage to ...") takes the first's words before its amount.
 */
function splitSpentPair(x: string): string[] {
  const m = new RegExp(`^(.+? if ${SPENT_TO_CAST}),? and (.+? if ${SPENT_TO_CAST})$`).exec(x);
  if (!m) return [x];
  const [first, second] = [m[1]!, m[4]!];
  const amount = /^(?:X|\d+) /.test(second) && /^(.+?\b)(?:X|\d+) /.exec(first);
  if (amount) return [first, amount[1] + second];
  // "Target player can't play lands this turn if {R} was spent to cast ~ and can't cast creature spells this turn if {W}
  // was spent to cast ~" (Moonhold): the same player, "that player" in the second.
  if (/^can't /.test(second) && /^target player can't /i.test(first)) return [first, `That player ${second}`];
  return /^(?:creatures|target|each|all|you) /i.test(second) ? [first, second.charAt(0).toUpperCase() + second.slice(1)] : [x];
}

function parseHowCast(s: string, ctx: Ctx): { cond: SpellCondition; not: boolean; text: string; noTargets?: true; ungated?: true; ofTarget?: true } | null {
  // "If the discarded card wasn't a land card, ..." after a discard cost (compile checks there is one).
  // Stormscale Anarch: "If the discarded card was multicolored, ..." (its colors, from its mana cost and color indicator).
  const disc = /^If the discarded card (was|wasn't) (an? .+? card|multicolored|monocolored|colorless), (.+)$/.exec(s);
  if (disc) {
    const filter = /^an? /.test(disc[2]!) ? parseSearchFilter(disc[2]!.replace(/^an? /, "")) : ({ kind: "card", colorCount: disc[2] as "multicolored", text: `${disc[2]} card` } as TargetSpec);
    return filter ? { cond: { kind: "discardedIs", filter }, not: disc[1] === "wasn't", text: disc[3]!, noTargets: true } : null;
  }
  // Storm Elemental: "{U}, Exile the top card of your library: If the exiled card is a snow land, ~ gets +1/+1 until end
  // of turn": the card the cost exiled (compile checks the ability has that cost), by its printed characteristics.
  const costExiled = /^If the exiled card is an? (snow land|[a-z]+ card), (.+)$/.exec(s);
  if (costExiled && !ctx.targets.length) {
    const filter = parseSearchFilter(costExiled[1]!.endsWith(" card") ? costExiled[1]! : `${costExiled[1]} card`);
    return filter ? { cond: { kind: "costExiledIs", filter }, not: false, text: costExiled[2]!, noTargets: true } : null;
  }
  // "If the sacrificed creature's toughness was 4 or greater, create two Food tokens instead" (Witch's Oven): as it last
  // existed (CR 608.2h); costs are paid after targets are chosen (CR 601.2c, 601.2h), so no target can depend on it.
  const sacPT = /^If the sacrificed creature's (power|toughness|mana value) was (\d+) or greater, (.+)$/.exec(s);
  if (sacPT) {
    const kind = sacPT[1] === "mana value" ? "manaValue" : (sacPT[1] as "power" | "toughness");
    return { cond: { kind: "amountNow", amount: { count: { kind, of: { ref: "sacrificed" } } }, min: Number(sacPT[2]) }, not: false, text: sacPT[3]!, noTargets: true };
  }
  // "If the sacrificed creature was a Hamster, draw X cards" (Minsc & Boo): its creature types as it last existed (CR
  // 608.2h), a changeling's all of them.
  // "If that spell's mana value is 5 or greater, create three of those tokens instead" (Prismari Pianist), in a cast
  // trigger: the spell's mana value as the ability resolves, or as it last existed on the stack (CR 608.2h).
  // Herald of Ilharg: "If that spell has mana value 5 or greater, ...": the same.
  // Eshki, Temur's Roar: "If that spell's power is 4 or greater, ...": the same, its power.
  const spellMv = ctx.castSpell ? /^If that spell's (mana value|power) is (\d+) or greater, (.+)$/.exec(s) ?? /^If that spell has (mana value) (\d+) or greater, (.+)$/.exec(s) : null;
  if (spellMv) {
    const amount = parseCount(`that spell's ${spellMv[1]}`, ctx);
    return amount ? { cond: { kind: "amountNow", amount, min: Number(spellMv[2]) }, not: false, text: spellMv[3]!, noTargets: true } : null;
  }
  const sacType = /^If the sacrificed creature was an? ([A-Z][a-z]+), (.+)$/.exec(s);
  if (sacType && CREATURE_TYPES.has(sacType[1]!)) return { cond: { kind: "sacrificedSubtype", subtype: sacType[1]! }, not: false, text: sacType[2]!, noTargets: true };
  // Evereth, Viceroy of Plunder: "If the sacrificed permanent was a Treasure": an artifact subtype it had as it last existed.
  const sacArtifact = /^If the sacrificed permanent was an? (Treasure|Food|Clue|Blood|Map|Powerstone|Equipment|Vehicle), (.+)$/.exec(s);
  if (sacArtifact) return { cond: { kind: "sacrificedSubtype", subtype: sacArtifact[1]! }, not: false, text: sacArtifact[2]!, noTargets: true };
  for (const h of HOW_CAST) {
    if (h.spellOnly && !ctx.spell) continue;
    if (h.activatedOnly && !ctx.activated) continue;
    const found = howCastText(s, h);
    if (found) return { ...found, ...(h.noTargets ? { noTargets: true as const } : {}), ...(h.ungated ? { ungated: true as const } : {}) };
  }
  return spentHowCast(s, ctx);
}

/**
 * "If {B} was spent to cast ~, ...", "... if {W} was spent to cast ~", "Sacrifice it unless {U} was spent to cast it" (an
 * enters trigger), "If five or more mana was spent to cast that spell, ..." (a cast trigger): what was spent (CR 601.2h),
 * checked as it resolves. A spell's targets are chosen before it's paid for, so they're chosen whatever is spent
 * (Cankerous Thirst rulings): `ungated`. "Counter target spell if no mana was spent to cast it" (Nix) is about that target.
 */
function spentHowCast(s: string, ctx: Ctx): { cond: SpellCondition; not: boolean; text: string; ungated: true; ofTarget?: true } | null {
  const found = howCastText(s, { re: SPENT_TO_CAST, cond: { kind: "youDid" } });
  const m = found && new RegExp(SPENT_TO_CAST).exec(s);
  const req = m && parseSpentReq(m[1]!);
  if (!found || !m || !req) return null;
  const of = m[2]!;
  // "~": the spell, or the permanent in its enters trigger (compile checks which); "it" and "that spell": the spell a cast
  // trigger is about, or the permanent in its enters trigger; in a spell, "it" is its target spell.
  const ofTarget = ctx.spell && of === "it";
  if (of === "that spell" ? !ctx.castSpell : of === "it" ? !ctx.castSpell && !ctx.selfIt && !ofTarget : !ctx.spell && !ctx.selfIt) return null;
  return { cond: { kind: "spent", req }, not: found.not, text: found.text, ungated: true, ...(ofTarget ? { ofTarget: true as const } : {}) };
}

function howCastText(s: string, h: { re: string; cond: SpellCondition; not?: true }): { cond: SpellCondition; not: boolean; text: string } | null {
  const lead = new RegExp(`^If ${h.re}, (.+)$`).exec(s);
  if (lead) return { cond: h.cond, not: !!h.not, text: lead[lead.length - 1]! };
  const trail = new RegExp(`^(?:Also )?(.+?)( instead)? (if|unless) ${h.re}$`).exec(s);
  if (!trail || (trail[3] === "unless" && trail[2])) return null;
  return { cond: h.cond, not: !!h.not !== (trail[3] === "unless"), text: `${trail[1]!}${trail[2] ?? ""}` };
}

/**
 * The targets a part of a spell that happens only if it was kicked (bargained, ...) just added are chosen only then (CR
 * 702.33g, 702.166d, 702.194c, 702.174m): `fx` added the targets from `curTargets` on. If it's done "instead" of the
 * sentence before, that sentence's own targets (from `prevTargets`) are chosen only if it wasn't: "If the gift was
 * promised, instead return target nonland permanent" (rulings: "alternative or additional targets"). A later "it"
 * can't mean a target that may not be there, so the parse forgets them. False if it can't be done that way.
 */
function gateNewTargets(ctx: Ctx, cond: SpellCondition, not: boolean, fx: { effects: Effect[]; instead: boolean }, previous: Effect[], prevTargets: number, curTargets: number): boolean {
  if (ctx.targets.length === curTargets) return true;
  // Only a spell's targets depend on how it was cast; a trigger's are chosen as it's put on the stack.
  if (!ctx.spell) return false;
  const gate = (i: number, negate: boolean) => {
    if (ctx.targets[i]!.onlyIf) return false;
    ctx.targets[i] = { ...ctx.targets[i]!, onlyIf: { cond: { ...cond }, ...(negate ? { not: true as const } : {}) } };
    return true;
  };
  for (let i = curTargets; i < ctx.targets.length; i++) if (!gate(i, not)) return false;
  if (fx.instead) {
    for (let i = prevTargets; i < curTargets; i++) {
      // "That creature" in the part done instead: the same target either way, so it isn't gated.
      if (mentionsTarget(fx.effects, i)) return false;
      if (!mentionsTarget(previous, i)) continue;
      if (!gate(i, !not)) return false;
    }
  }
  ctx.lastObjectTarget = undefined;
  ctx.lastPlayerTarget = undefined;
  ctx.lastTargets = undefined;
  return true;
}

/** Whether these effects refer to target `i` ("target creature", "its controller", "counter that spell"). */
function mentionsTarget(v: unknown, i: number): boolean {
  if (Array.isArray(v)) return v.some((x) => mentionsTarget(x, i));
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.index === "number" && refCovers(o, i)) return true;
  if (o.target === i) return true;
  return Object.values(o).some((x) => mentionsTarget(x, i));
}

/**
 * What "If ~ was kicked, ..." does. With "instead", it replaces the sentence before (`previous`). `newTargets`: it may
 * add targets of its own (see gateNewTargets).
 */
function parseKicked(text: string, previous: Effect[], ctx: Ctx, newTargets = false): { effects: Effect[]; instead: boolean } | null {
  // "instead ~ deals 6 damage to that permanent or player and the damage can't be prevented" (Lightning Surge, CR 615.12).
  if (/^instead,? .+ and the damage can't be prevented$/i.test(text)) {
    const r = parseKicked(text.replace(/ and the damage can't be prevented$/i, ""), previous, ctx, newTargets);
    if (!r?.instead || r.effects.length !== 1 || r.effects[0]!.type !== "damage") return null;
    return { effects: [{ ...r.effects[0]!, unpreventable: true }], instead: true };
  }
  // Reclaim the Wastes: "If ~ was kicked, search your library for two basic land cards instead of one": the same search,
  // for more cards.
  const moreCards = new RegExp(`^[Ss]earch your library for ${NUM} (.+) cards instead of one$`).exec(text);
  if (moreCards) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "search" || prev.n !== 1 || prev.upTo || prev.filter?.kind !== "card" || `${moreCards[2]} card` !== prev.filter.text) return null;
    return { effects: [{ ...prev, n: num(moreCards[1]!) }], instead: true };
  }
  let t = text;
  const instead = /^instead,? /i.test(t) || / instead$/i.test(t);
  t = t.replace(/^instead,? /i, "").replace(/ instead$/i, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // "That creature also gains flying": in addition to what the sentence before did.
  if (!instead) t = t.replace(/^(That creature|That player|It|~|Permanents you control|Creatures you control|Those creatures) also (?=(?:gains?|gets?|deals?|has|have|loses?) )/, "$1 ");
  if (instead && !previous.length) return null;
  // "If eight or more mana was spent to cast that spell, sacrifice ~ and it deals that much damage to each opponent"
  // (Tellah): two instructions under the one condition, both about ~ (as at the top of parseBody).
  const pair = !instead && /^(.*\b(?:counters? on ~|[Ss]acrifice ~)) and it ((?:gains|gets|can't|deals) .+)$/.exec(t);
  if (pair) {
    const before = ctx.targets.length;
    const first = parseOne(pair[1]!, ctx);
    const second = first && parseOne(`~ ${pair[2]!}`, ctx);
    if (!first || !second || (!newTargets && ctx.targets.length !== before)) return null;
    return { effects: [...first, ...second], instead };
  }
  // "~ deals 2 damage to any target. If ~ was kicked, it deals 5 damage instead": the same damage, more of it.
  const more = /^(?:It|~) deals (\d+|X) damage(?: to (?:that creature|that player|that permanent or player|it))?$/.exec(t);
  if (more && instead) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "damage") return null;
    return { effects: [{ ...prev, amount: amt(more[1]!) }], instead };
  }
  // Dispelling Exhale: "Counter target spell unless its controller pays {2}. If a Dragon was beheld, counter that spell
  // unless its controller pays {4} instead" (beheld read as kicked): the same counter, a bigger payment.
  const morePay = instead ? /^Counter that spell unless its controller pays (\{\d+\})$/.exec(t) : null;
  if (morePay) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "counterSpell" || !prev.unless || Object.keys(prev.unless).join() !== "cost") return null;
    return { effects: [{ ...prev, unless: { cost: morePay[1]! } }], instead };
  }
  // Chocobo Kick: "Target creature you control deals damage equal to its power to target creature an opponent controls. If
  // ~ was kicked, the creature you control deals twice that much damage instead": the same bite, at twice its power.
  if (instead && /^The creature you control deals twice that much damage$/.test(t)) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "bite" || prev.times || prev.self || prev.a.ref !== "target") return null;
    return { effects: [{ ...prev, times: 2 }], instead };
  }
  // Orim's Touch: "Prevent the next 2 damage that would be dealt to any target this turn. If ~ was kicked, prevent the next
  // 4 damage that would be dealt to that permanent or player this turn instead": the same shield, bigger.
  const morePrevented = instead ? /^prevent the next (\d+) damage that would be dealt to that permanent or player this turn$/i.exec(t) : null;
  if (morePrevented) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "preventNext" || prev.to.ref !== "anyTarget" || prev.divided) return null;
    return { effects: [{ ...prev, n: Number(morePrevented[1]) }], instead };
  }
  // "~ deals 7 damage divided as you choose among one, two, or three targets. If at least seven red mana was spent to cast
  // ~, instead ~ deals 7 damage to each of those permanents and/or players" (Sundering Stroke): the damage is still
  // divided as it's cast (CR 601.2d, rulings), then each target is dealt the full amount instead.
  const each = /^(?:It|~) deals (\d+) damage to each of those permanents and\/or players$/.exec(t);
  if (each && instead) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "damage" || !prev.divided || prev.to.ref !== "anyTarget") return null;
    const { divided: _divided, ...rest } = prev;
    return { effects: [{ ...rest, amount: amt(each[1]!) }], instead };
  }
  // "Create a token that's a copy of target creature. If ~ was kicked, create five of those tokens instead" (Rite of
  // Replication): more of the same copies.
  const moreCopies = instead ? new RegExp(`^Create ${NUM} of those tokens$`).exec(t) : null;
  if (moreCopies) {
    const prev = previous[0];
    // "Create five 1/1 white Human creature tokens. If ~ was cast from a graveyard, create ten of those tokens instead"
    // (Increasing Devotion): more of the same tokens.
    if (previous.length === 1 && prev?.type === "createToken" && typeof prev.n === "number") return { effects: [{ ...prev, n: num(moreCopies[1]!) }], instead };
    if (previous.length !== 1 || prev?.type !== "createTokenCopy") return null;
    return { effects: [{ ...prev, n: num(moreCopies[1]!) }], instead };
  }
  // The Final Days: "If ~ was cast from a graveyard, instead create X of those tokens, where X is the number of creature
  // cards in your graveyard": the same tokens, counted as it resolves (the "where X" is read after, by the caller).
  const xTokens = instead && ctx.whereX && /^Create X of those tokens$/.test(t);
  if (xTokens) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "createToken" || typeof prev.n !== "number") return null;
    return { effects: [{ ...prev, n: X }], instead };
  }
  // "Copy target instant or sorcery spell you control. If ~ was cast from a graveyard, copy that spell twice instead"
  // (Increasing Vengeance): more copies of the same spell.
  const moreSpellCopies = instead ? /^Copy that spell (twice|three times)$/.exec(t) : null;
  if (moreSpellCopies) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "copySpell" || prev.n !== 1) return null;
    return { effects: [{ ...prev, n: moreSpellCopies[1] === "twice" ? 2 : 3 }], instead };
  }
  // "If {B}{R} was spent to cast ~, you choose the permanents for each player instead" (Mythos of Snapdax): the same
  // choices, all made by you, and still legal ones (rulings).
  if (instead && /^You choose the permanents for each player$/.test(t)) {
    const prev = previous[0];
    return previous.length === 1 && prev?.type === "keepRest" ? { effects: [{ ...prev, youChoose: true }], instead } : null;
  }
  // "Return target creature card from your graveyard to your hand. If this spell was kicked, instead put that card onto
  // the battlefield tapped" (Zuko's Conviction): the same target card, onto the battlefield.
  const putThat = instead ? /^Put that card onto the battlefield( tapped)?$/.exec(t) : null;
  if (putThat) {
    const prev = previous[0];
    const spec = prev?.type === "bounce" && prev.what.ref === "target" ? ctx.targets[prev.what.index] : undefined;
    if (previous.length !== 1 || prev?.type !== "bounce" || spec?.kind !== "card" || spec.many || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    return { effects: [{ type: "putOntoBattlefield", what: prev.what, ...(putThat[1] ? { tapped: true } : {}) }], instead };
  }
  t = t.replace(/^It deals /, "~ deals ");
  const before = ctx.targets.length;
  // "If you cast this spell during your main phase, instead scry 3, then draw three cards" (Precognitive Perception).
  // Under an "if" its instructions run one at a time, so any of them may wait on a choice (see the "if" effect).
  const thenParts = (): Effect[] | null => {
    const out: Effect[] = [];
    const parts = t.split(/, then (?!shuffle)/);
    for (const [i, p] of parts.entries()) {
      const one = parseOne(i ? thenSubject(parts[0]!, p) : p, ctx);
      if (!one) return null;
      out.push(...one);
    }
    return out;
  };
  // "If this spell's additional cost was paid, whenever a creature dies this turn, you gain 1 life" (Ruinous Waterbending):
  // a trigger for the rest of the turn, made only then (CR 603.7b).
  const floating = instead ? undefined : floatingTrigger(t, [], ctx);
  if (floating !== undefined) return floating && { effects: [floating], instead };
  // "Instead shuffle your graveyard into your library, draw seven cards, and you have no maximum hand size for the rest of
  // the game" (Spirit Water Revival): three instructions in a list, in order.
  const listParts = (): Effect[] | null => {
    const parts = t.split(/, (?:and )?/);
    if (parts.length < 3 || !/, and /.test(t)) return null;
    const out: Effect[] = [];
    for (const p of parts) {
      const one = parseOne(p.charAt(0).toUpperCase() + p.slice(1), ctx);
      if (!one) return null;
      out.push(...one);
    }
    return out;
  };
  const fx = parseOne(t, ctx) ?? (/, then (?!shuffle)/.test(t) ? attempt(ctx, thenParts) : null) ?? (/, and /.test(t) ? attempt(ctx, listParts) : null);
  if (!fx || (!newTargets && ctx.targets.length !== before)) return null;
  // Under an "if", either branch's instructions run one at a time, so one may wait on a player (see the "if" effect).
  const done = instead ? insteadOfAffected(fx, previous) : fx;
  return done && { effects: done, instead };
}

/**
 * "Creatures you control get +1/+1 until end of turn. If this spell was kicked, those creatures get +2/+1 until end of
 * turn instead": the part done instead never ran the one it replaces, so "those creatures" are the ones that one names.
 */
function insteadOfAffected(fx: Effect[], previous: Effect[]): Effect[] | null {
  const uses = (v: unknown): boolean => (Array.isArray(v) ? v.some(uses) : !!v && typeof v === "object" && ((v as { ref?: string }).ref === "affected" || Object.values(v).some(uses)));
  if (!uses(fx)) return fx;
  const prev = previous.length === 1 && previous[0]!.type === "continuous" ? previous[0]! : undefined;
  if (prev?.type !== "continuous") return null;
  const swap = <T>(v: T): T => (Array.isArray(v) ? (v.map(swap) as T) : v && typeof v === "object" ? ((v as { ref?: string }).ref === "affected" ? (prev.what as T) : (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) as T)) : v);
  return swap(fx);
}

/**
 * "Draw a card, then discard a card" after a condition ("If you control a blue creature, ..."): the instructions in order,
 * all under it. Only one of them may wait on a choice, the last, so resuming it doesn't repeat the others.
 */
/** `inIf`: inside an "if", which keeps its place among its instructions, so one that waits on a player may come first. */
function parseThen(s: string, ctx: Ctx, inIf = false): Effect[] | null {
  // "Then shuffle" ends a search; "then shuffle your graveyard into your library" (The Mending of Dominaria) is its own.
  const parts = s.split(/, then (?!shuffle(?! your graveyard into your library$))/);
  if (parts.length < 2) return null;
  const out: Effect[] = [];
  for (const [i, p] of parts.entries()) {
    let fx = attempt(ctx, () => parseOne(i ? p.charAt(0).toUpperCase() + p.slice(1) : p, ctx));
    // "Draw a card, then you may search your library for a Plains card, ..." (Charitable Levy): the choice as it's done.
    const may = i && !fx ? /^you may (.+)$/.exec(p) : null;
    if (may) {
      const inner = attempt(ctx, () => parseOne(capital(may[1]!), ctx));
      fx = inner && [{ type: "may", effects: inner, text: may[1]! }];
    }
    if (!fx) return null;
    out.push(...fx);
  }
  return !inIf && out.slice(0, -1).some((e) => pauses(e)) ? null : out;
}

/**
 * "Put your choice of a +1/+1 counter or two charge counters on up to one other target artifact" (Inspirit, Flagship
 * Vessel), "put your choice of a +1/+1, first strike, or trample counter on that creature" (Assaultron Dominator): one of
 * them, chosen as it resolves (CR 608.2d); a target is chosen once, as it's put on the stack (CR 601.2c).
 */
function parsePutChoice(s: string, ctx: Ctx): Effect[] | null {
  const m = /^[Pp]ut your choice of (.+?) on (.+)$/.exec(s);
  if (!m) return null;
  let opts = m[1]!.split(/,? or |, /);
  // "a +1/+1, first strike, or trample counter": the noun is said once, the article too.
  if (!opts.slice(0, -1).some((o) => / counters?$/.test(o)) && / counter$/.test(opts[opts.length - 1]!)) opts = opts.map((o, i) => (i === opts.length - 1 ? o : `${o} counter`));
  opts = opts.map((o) => (/^(?:an?|one|two|three|four|five) /.test(o) ? o : `${/^[aeiou]/.test(o) ? "an" : "a"} ${o}`));
  const before = ctx.targets.length;
  const first = opts.length >= 2 ? parseOne(`Put ${opts[0]} on ${m[2]}`, ctx) : null;
  const added = ctx.targets.length - before;
  if (first?.length !== 1 || first[0]!.type !== "counters" || added > 1) return null;
  const rest = opts.slice(1).map((o) => parseOne(`Put ${o} on ${added ? "it" : m[2]}`, ctx));
  if (ctx.targets.length !== before + added) return null;
  const same = (x: Effect[] | null) => x?.length === 1 && x[0]!.type === "counters" && JSON.stringify(x[0]!.what) === JSON.stringify((first[0] as Extract<Effect, { type: "counters" }>).what);
  if (!rest.every(same)) return null;
  return [{ type: "either", options: [first, ...(rest as Effect[][])], labels: opts.map((o) => `Put ${o}`) }];
}

/**
 * "If you do, discard a card unless ~ entered this turn" (Moon-Circuit Hacker): the instruction only while ~ didn't enter
 * this turn, checked as it resolves.
 */
function parseUnlessEntered(s: string, ctx: Ctx): Effect[] | null {
  const m = /^(.+) unless ~ entered this turn$/.exec(s);
  if (!m) return null;
  const fx = parseOne(m[1]!, ctx);
  return fx && [{ type: "if", cond: { kind: "state", cond: { kind: "self", is: "enteredThisTurn", not: true } }, effects: fx }];
}

/** One sentence: a plain instruction, two joined by "and", or one with "for each" / "equal to" in it. */
/** The last "If each opponent chose ..." of a chain of them (Prisoner's Dilemma) that has no otherwise yet. */
function lastAllChose(e: Effect | undefined): Extract<Effect, { type: "if" }> | undefined {
  if (e?.type !== "if" || e.cond.kind !== "allChose") return undefined;
  if (!e.otherwise) return e;
  return e.otherwise.length === 1 ? lastAllChose(e.otherwise[0]) : undefined;
}

function parseOne(s: string, ctx: Ctx): Effect[] | null {
  // "{T}: This creature deals 1 damage to itself" (Stuffy Doll): the source is the one dealt the damage.
  s = s.replace(/^~ deals (\d+) damage to itself$/, "~ deals $1 damage to ~");
  // Psionic Entity: "~ deals 2 damage to any target and 3 damage to itself": ~ is dealt the second amount.
  // Sunflare Shaman: "~ deals X damage to any target and X damage to itself, where X is ...": the same.
  s = s.replace(/^(~ deals (?:\d+|X) damage to any target and (?:\d+|X) damage to) itself(?=$|, where X is )/, "$1 ~");
  // "~ deals 1 damage to each opponent and each creature and planeswalker they control" (End the Festivities): theirs.
  s = s.replace(/^(~ deals (?:\d+|X) damage to each opponent and each [a-z ]+?) they control$/, "$1 your opponents control");
  // "Untap ~ and put a +1/+1 counter on it" (Grimgrin, Corpse-Born): "it" is ~.
  s = s.replace(/^((?:Untap|Tap) ~ and put .+ counters? on) it$/, "$1 ~");
  // Support N (CR 701.41a): "other" target creatures on a permanent, any on an instant or sorcery.
  // Support X would need a variable number of targets: not supported.
  const support = /^[Ss]upport (\d+)$/.exec(s);
  if (support) s = `Put a +1/+1 counter on each of up to ${num(support[1]!) === 1 ? "one" : support[1]} ${ctx.spell ? "" : "other "}target creature${support[1] === "1" ? "" : "s"}`;
  // "Target player reveals their hand, you choose a nonland card from it, then that player discards that card" (River's
  // Grasp): the three-sentence hand disruption in one (see parseBody), another player picking the card (CR 701.9b).
  const disrupt = /^(.+? reveals (?:their|his or her) hand), you choose an? (.+?) from it, then that player discards that card$/.exec(s);
  if (disrupt) {
    const look = attempt(ctx, () => parseSentence(disrupt[1]!, ctx));
    const filter = parseSearchFilter(disrupt[2]!);
    if (look?.length !== 1 || look[0]!.type !== "lookAtHand" || !look[0]!.reveal || filter === null) return null;
    return [look[0]!, { type: "takeFromHand", who: look[0]!.who, ...(filter ? { filter } : {}), action: "discard" }];
  }
  const fx = attempt(ctx, () => parsePutChoice(s, ctx)) ?? attempt(ctx, () => parseUnlessEntered(s, ctx)) ?? attempt(ctx, () => parsePerOpponent(s, ctx)) ?? attempt(ctx, () => parseSentence(s, ctx)) ?? attempt(ctx, () => parseConjunction(s, ctx)) ?? attempt(ctx, () => parseSharedSubject(s, ctx)) ?? attempt(ctx, () => parseYouList(s, ctx)) ?? attempt(ctx, () => parseForEach(s, ctx)) ?? attempt(ctx, () => parseEqualTo(s, ctx)) ?? attempt(ctx, () => parseThen(s, ctx)) ?? attempt(ctx, () => parseAndYouMay(s, ctx));
  if (fx) noteLast(ctx, fx);
  // "Then you return up to two creature cards from your graveyard to your hand" (Unseal the Necropolis), "then you return
  // a land card ..." (Witherbloom Command): after another player's instruction, "you" only says who does it.
  const you = fx ? null : /^(Then )?[Yy]ou return (.+)$/.exec(s);
  if (you) return parseOne(you[1] ? `Then return ${you[2]}` : `Return ${you[2]}`, ctx);
  // Olivia, Mobilized for War: "put a +1/+1 counter on that creature, it gains haste until end of turn, and it becomes a
  // Vampire in addition to its other types": three instructions about that creature, in order.
  const thatList = fx ? null : /^(Put a \+1\/\+1 counter on that creature), it (gains [a-z]+ until end of turn), and it (becomes an? [A-Z][a-z]+ in addition to its other types)$/.exec(s);
  if (thatList) {
    const parts = [thatList[1]!, `That creature ${thatList[2]}`, `That creature ${thatList[3]}`].map((p) => parseOne(p, ctx));
    return parts.every((p): p is Effect[] => !!p) ? parts.flat() : null;
  }
  // Gandalf, Goblins' Bane: "~ gets +1/+1 until end of turn and deals 1 damage to each opponent": both, in order.
  const getsDeals = fx ? null : /^(~ gets [^,]+? until end of turn) and (deals .+)$/.exec(s);
  if (getsDeals) {
    const first = parseOne(getsDeals[1]!, ctx);
    const second = first && parseOne(`~ ${getsDeals[2]}`, ctx);
    return first && second ? [...first, ...second] : null;
  }
  // Shadow, Mysterious Assassin: "draw two cards and each opponent loses life equal to the mana value of the sacrificed
  // permanent": both, in order.
  const drawLose = fx ? null : /^([Dd]raw (?:a card|[a-z]+ cards)) and (each opponent loses life equal to .+)$/.exec(s);
  if (drawLose) {
    const first = parseOne(drawLose[1]!, ctx);
    const second = first && parseOne(capital(drawLose[2]!), ctx);
    return first && second ? [...first, ...second] : null;
  }
  // "You may put a land card from your graveyard onto the battlefield tapped" (Wreck and Rebuild): the same as returning it.
  const put = fx ? null : /^(You may p|P)ut (an? [a-z]+ card) from your graveyard onto the battlefield( tapped)?$/.exec(s);
  if (put) return parseOne(`${put[1] === "P" ? "R" : "You may r"}eturn ${put[2]} from your graveyard to the battlefield${put[3] ?? ""}`, ctx);
  return fx;
}

/**
 * "You gain 3 life and you may return up to one target creature card from your graveyard to your hand" (Sword of Light
 * and Shadow): the first done, then the choice of the second, as two sentences.
 */
function parseAndYouMay(s: string, ctx: Ctx): Effect[] | null {
  const m = /^([Yy]ou (?!may )[^,]+?) and you may ([^,]+)$/.exec(s);
  if (!m) return null;
  const first = parseOne(capital(m[1]!), ctx);
  const then = first && parseOne(capital(m[2]!), ctx);
  return first && then ? [...first, { type: "may", effects: then, text: m[2]! }] : null;
}

/**
 * The body of a reflexive trigger, "When you do, [text]" (CR 603.12): its own targets, chosen as it's put on the stack,
 * and the same meaning of ~, "it" and the trigger's subject as the ability that creates it.
 */
function reflexiveBody(text: string, ctx: Ctx, sacrificed = false, about = false, ownX = false): AbilityBody | null {
  // After "you may sacrifice another creature", "that creature" is only ever its power or toughness (Heart-Piercer
  // Manticore, Ziatora): the sacrificed creature as it last existed (CR 608.2h; rulings).
  const sac = sacrificed && /\b(?:that|the sacrificed) creature's (?:power|toughness)\b/.test(text);
  if (sac && /\bthat creature(?!'s (?:power|toughness)\b)/.test(text)) return null;
  // "When ~ enters, you may pay {2}{R}. When you do, it deals 3 damage to any target." (Sparktongue Dragon): "it" is ~,
  // the source of both abilities (CR 603.12, 113.7a).
  if (ctx.selfIt && !ctx.subjectIt) text = text.replace(/^(?:it|he|she) deals /, "~ deals ");
  // About an object the ability acted on (Back for More's "it", Curse of the Werefox's "that creature"): its subject.
  if (about && (ctx.subject || ctx.subjectIt)) return null;
  const body = parseBody(`${text.charAt(0).toUpperCase()}${text.slice(1)}.`, {
    ...(sac ? { sacrificedIt: true } : {}),
    ...(ctx.amassed ? { amassed: true } : {}),
    ...(ctx.revealedFromHand ? { revealedFromHand: true } : {}),
    ...(ctx.tappedThisWay ? { tappedThisWay: true } : {}),
    ...(about || ctx.subjectIt ? { subjectIt: true } : ctx.subject ? { subject: true } : {}),
    ...(ctx.selfIt ? { selfIt: true } : {}),
    ...(ctx.selfCard ? { selfCard: true } : {}),
    ...(ctx.activated ? { activated: true } : {}),
    ...(ctx.eventPlayer ? { eventPlayer: true } : {}),
    ...(ctx.defending ? { defending: true } : {}),
    ...(ctx.castSpell ? { castSpell: true } : {}),
    ...(ownX ? { ownX: true } : {}),
  });
  return body;
}

/** What "it", "they" and "those creatures" can mean after these effects (the token just created, the group changed). */
function noteLast(ctx: Ctx, fx: Effect[]) {
  const last = fx[fx.length - 1];
  // "Exile target enchantment. If the exiled card is a God card, ... as that card" (Deicide), "You choose a nonland card
  // from it and exile that card. ... as the exiled card" (Pick the Brain): what the sentence just read exiled.
  ctx.exiledTarget = last?.type === "exile" && last.what.ref === "target" && !last.what.n ? last.what.index : undefined;
  ctx.exiledFromHand = last?.type === "takeFromHand" && last.action === "exile" && last.n === undefined && !last.until;
  // "Create a 2/2 red Mutant creature token. It gains haste until end of turn. Destroy it at the beginning of the next end
  // step" (Old Hob): an instruction about the tokens just created leaves "it" meaning them.
  if (last && "what" in last && (last.what as ObjRef).ref === "created" && (ctx.lastCreated || ctx.lastCreatedAny)) return;
  // A clash moves no permanents: "those creatures" after it are still the tokens before it (Gilt-Leaf Ambush).
  if (last?.type === "clash") return;

  {
    // A card just manifested or cloaked is "it" too (the dig puts it in `created`).
    const faceDown = last?.type === "dig" && (last.into === "manifest" || last.into === "cloak");
    // One card put onto the battlefield: "Put a +1/+1 counter on it", "It gains haste until your next turn".
    const put = last?.type === "may" && last.effects.length === 1 ? last.effects[0] : last;
    ctx.lastPut =
      (put?.type === "putOntoBattlefield" && ((put.what.ref === "target" && !put.what.n) || put.what.ref === "graveyardEnd") && !put.attachToSubject) ||
      // "Return it to the battlefield ..., then create a Wicked Role token attached to it" (Not Dead After All): the
      // permanent the card became (CR 400.7; no Role if it didn't return as a creature, rulings).
      (put?.type === "putOntoBattlefield" && put.what.ref === "selfCard" && !put.attachToSubject && put.attachToTarget === undefined) ||
      (put?.type === "putFromHand" && !put.any) ||
      // "Put a land card from their graveyard onto the battlefield tapped under your control. It gains ..." (Realmbreaker).
      (put?.type === "chooseFromGraveyard" && put.dest === "battlefield" && put.youChoose === true && put.n === 1 && !put.upTo && put.who?.ref !== "eachPlayer") ||
      // One card searched for and put onto the battlefield (Vision Quest's "it gains haste").
      (put?.type === "search" && put.n === 1 && !put.others && put.dest.zone === "battlefield" && put.who === undefined && put.library === undefined);
    // "Put a +1/+1 counter on a creature you control. It gains vigilance and trample until end of turn" (Season of
    // Gathering): the one creature picked (kept in `created` too).
    // "You may choose a token you control. If you do, ... that token" (Brudiclad): the same, if one was.
    const pk = last?.type === "may" && last.effects.length === 1 ? last.effects[0] : last;
    // "Target opponent chooses a creature they control. Destroy that creature." (Imperial Edict): the one that player chose.
    const picked = pk?.type === "pick" && (pk.action === "counters" || pk.action === "choose") && pk.n === 1 && (pk.who.ref === "you" || (pk.who.ref === "target" && pk.action === "choose" && last === pk)) && !pk.among;
    // "Populate. The token created this way gains haste." (Determined Iteration): the token copy (or copies, with a
    // token doubler) just made.
    const populated = last?.type === "pick" && last.action === "populate" && last.n === 1 && last.who.ref === "you";
    ctx.lastCreated = ((last?.type === "createToken" || last?.type === "createTokenCopy") && last.n === 1) || (faceDown && last.count === 1) || ctx.lastPut || picked || populated;
    ctx.lastCreatedCreature = last?.type === "createToken" && last.n === 1 && last.token.types.includes("Creature") && !last.attachTo;
    // The creature that player chose is "that creature" (Imperial Edict).
    if (picked && pk.who.ref === "target") ctx.lastPut = true;
    ctx.lastCreatedAny = last?.type === "createToken" || last?.type === "createTokenCopy" || last?.type === "myriad" || faceDown || (last?.type === "returnAllFromGraveyard" && !last.toHand);
    ctx.dugToHand = last?.type === "dig" && last.into === "hand" && !last.each && !last.who;
    ctx.lastDugLands = last?.type === "dig" && last.into === "battlefield" && last.filter?.kind === "card" && last.filter.types?.length === 1 && last.filter.types[0] === "Land" && !last.filter.notTypes?.length;
    // "Each opponent discards a card. For each opponent who can't, ..." (Aclazotz).
    // "Each player discards a card. Each opponent who can't loses 3 life." (Liliana, Waker of the Dead): the same opponents.
    ctx.opponentsDiscarded = last?.type === "discard" && (last.who.ref === "eachOpponent" || last.who.ref === "eachPlayer") && last.n === 1 && !last.random && !last.filter;
    if (last?.type === "amass") ctx.amassed = true;
    // "Exile target player's graveyard. For each artifact or land card exiled this way, ..." (Canoptek Scarab Swarm).
    if ((last?.type === "exileGraveyard" && !last.library && !last.until) || (last?.type === "exile" && !last.until && last.what.ref === "target" && ctx.targets[last.what.index]?.kind === "card")) ctx.exiledCards = true;
    if (last?.type === "damage" || last?.type === "bite" || last?.type === "fight") ctx.excessDamage = true;
    // "Creatures you control get +1/+1 until end of turn. Untap those creatures": the ones it changed (CR 611.2c).
    if (last?.type === "continuous" && last.what.ref === "each" && (last.duration === "endOfTurn" || last.duration === "yourNextTurn")) ctx.lastGroup = { ref: "affected" };
    // "Put a +1/+1 counter on each creature you control. Untap those creatures": still the same ones.
    if (last?.type === "counters" && last.what.ref === "each") ctx.lastGroup = last.what;
    // Rally the Righteous: "Untap target creature and each other creature that shares a color with it. Those creatures get
    // +2/+0 until end of turn": the same ones (untapping changes no colors).
    if (last?.type === "untap" && last.what.ref === "target" && last.what.sharesColor) ctx.lastGroup = last.what;
    // "Double the power of each other creature you control until end of turn. Those creatures gain vigilance" (Rhonas).
    if (last?.type === "doublePT" && last.what.ref === "each") ctx.lastGroup = last.what;
    // Thundermaw Hellkite: "deals 1 damage to each creature with flying your opponents control. Tap those creatures": the
    // same group, whether or not the damage was prevented or redirected (rulings); nothing leaves mid-resolution.
    if (last?.type === "damage" && "ref" in last.to && last.to.ref === "each" && last.to.filter.kind === "object" && !last.to.filter.anyOf) ctx.lastGroup = last.to;
    // "Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain indestructible until end
    // of turn" (Inspiring Call): the ones counted, as it resolves (CR 611.2c).
    if (last?.type === "draw" && typeof last.n === "object" && "count" in last.n && last.n.count.kind === "permanents" && last.n.count.filter.kind === "object") ctx.lastGroup = { ref: "each", filter: last.n.count.filter };
  }
}

/**
 * "For each opponent, destroy up to one target artifact or enchantment that player controls", "... tap up to one target
 * creature that player controls": the instruction with one "up to one" target for each opponent, controlled by that
 * opponent (TargetSpec.perOpponent, CR 601.2c, 115.6), all done at once as it resolves. "Those creatures" after it are
 * all of them; "it" and "that player" aren't any one of them.
 */
function parsePerOpponent(s0: string, ctx: Ctx): Effect[] | null {
  // "For any number of opponents, destroy target nonland permanent that player controls" (Windgrace's Judgment): a target
  // for each opponent chosen, the same as up to one for each opponent (CR 601.2c).
  const s = s0.replace(/^For any number of opponents, (\w+) target (.+? that player controls)$/, "For each opponent, $1 up to one target $2");
  // "For each player, put a +1/+1 counter on up to one target creature that player controls" (Nils): you too.
  const every = /^[Ff]or each player, (.+)$/.exec(s);
  const m = every ?? /^[Ff]or each opponent, (.+)$/.exec(s);
  if (!m || ctx.targets.some((t) => t.many || t.perOpponent)) return null;
  // "Up to one other target ..." (Kitesail Larcenist): not the source.
  const who = / up to one (other )?target (.+?) (?:that player|that opponent|they) controls?\b/;
  // "Up to one target creature card from that player's graveyard" (Sepulchral Primordial): owned by that opponent.
  const yard = / up to one target (.+? card) from that player's graveyard\b/;
  // Blatant Thievery: "For each opponent, gain control of target permanent that player controls": one each, required.
  const whoRequired = / target (.+?) that player controls\b/;
  const req = !every && !who.test(` ${m[1]!}`) && !/\bup to\b/.test(m[1]!) ? whoRequired.exec(` ${m[1]!}`) : null;
  const w = who.exec(` ${m[1]!}`);
  const t = w ? [w[0], w[2]] : req ? [req[0], req[1]] : yard.exec(` ${m[1]!}`);
  if (!t) return null;
  const card = !w && !req;
  const other = w?.[1] ? "another " : "";
  if (other && (!every || ctx.spell)) return null;
  const inner = card ? ` ${m[1]!}`.replace(yard, ` target ${t[1]} from ${every ? "a" : "an opponent's"} graveyard`).trim() : ` ${m[1]!}`.replace(req ? whoRequired : who, every ? ` ${other}target ${t[1]}` : ` target ${t[1]} an opponent controls`).trim();
  if (/\b(?:that player|that opponent|they|their)\b/.test(inner)) return null;
  const before = ctx.targets.length;
  // "For each opponent, you may put ...": a choice for each of them, as it resolves.
  const may = /^you may (.+)$/.exec(inner);
  // "For each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying
  // its mana cost" (Diluvian Primordial): each one cast, or not, one at a time as it resolves (CR 608.2g; rulings).
  const castIt = /^cast (target .+? card) from an opponent's graveyard without paying its mana cost$/.exec(may?.[1] ?? "");
  const castWhat = castIt ? parseCardTarget(`${castIt[1]!} from an opponent's graveyard`, ctx) : null;
  const castSpec = castWhat && ctx.targets[before];
  if (castIt && (!castSpec || castSpec.kind !== "card" || !castSpec.types?.length || castSpec.types.includes("Land"))) return null;
  const one = castWhat ? [{ type: "castTargetFree" as const, what: castWhat }] : parseSentence(capital(may ? may[1]! : inner), ctx);
  const fx = one && may && !castWhat ? [{ type: "may" as const, effects: one, text: may[1]!, eachTarget: true as const }] : one;
  if (!fx || ctx.targets.length !== before + 1) return null;
  const spec = ctx.targets[before]!;
  if (card ? spec.kind !== "card" || spec.owner !== (every ? undefined : "opponent") || spec.linkedExile : spec.kind !== "object" || spec.controller !== (every ? undefined : "opponent")) return null;
  if (spec.optional || spec.distinctFrom || (spec.notSource && !other)) return null;
  ctx.targets[before] = { ...spec, perOpponent: true, ...(every ? { perPlayer: true as const } : {}), ...(req ? { perOpponentRequired: true as const } : {}), text: card ? `target ${t[1]} from that player's graveyard` : `target ${t[1]} that player controls` };
  ctx.lastObjectTarget = undefined;
  ctx.lastTargets = { index: before, n: 2 };
  return fx;
}

/** Run a parse that may fail halfway, undoing any targets it added. */
function attempt<T>(ctx: Ctx, f: () => T | null): T | null {
  const saved = { n: ctx.targets.length, o: ctx.lastObjectTarget, p: ctx.lastPlayerTarget, a: ctx.lastAttached, mp: ctx.manyPlayers };
  const r = f();
  if (r === null) {
    ctx.targets.length = saved.n;
    ctx.lastObjectTarget = saved.o;
    ctx.lastPlayerTarget = saved.p;
    ctx.manyPlayers = saved.mp;
    ctx.lastAttached = saved.a;
  }
  return r;
}

/** Replace every X in these effects with what the text defines it as. */
/** The sentence after `si`, without its period. */
const thatManyNext = (sentences: string[], si: number) => sentences[si + 1]?.replace(/\.$/, "") ?? "";

export function replaceX<T>(v: T, def: AmountExpr): T {
  if (Array.isArray(v)) return v.map((x) => replaceX(x, def)) as T;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.count && (o.count as Count).kind === "x") return substituteX(o as unknown as AmountExpr, def) as T;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, replaceX(x, def)])) as T;
  }
  return v;
}

/** Does anything in here use the X announced while casting or activating? */
export function usesX(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(usesX);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    // A reflexive trigger whose X is its own (Unleash the Inferno's excess damage).
    if (o.type === "reflexive" && (o.xExcess || o.xSacrificed || o.xRevealedMv || o.xExiledMv || o.xDiscardedTypes)) return false;
    // "You may pay {X}. If you do, ...": the X paid (Decree of Justice).
    if (o.type === "may" && o.payX) return usesX(o.otherwise);
    if (o.count && (o.count as Count).kind === "x") return true;
    if ((o.many === "x" && !o.manyCount) || o.many === "exactX") return true; // "X target creatures"
    if (o.xRange || (o.total as TargetSpec["total"])?.x || o.kind === "xAtLeast") return true; // "with mana value X or less", "if X is 5 or more"
    return Object.values(o).some(usesX);
  }
  return false;
}

/** What "unless its controller pays ..." asks for: "{2}", "{X}", "{1} for each card in your hand", "{2} and 2 life". */
export function parseUnlessPays(text: string, ctx: Ctx): UnlessPays | null {
  let m: RegExpExecArray | null;
  if (text === "{X}") return { cost: "", generic: X };
  // Thassa's Intervention: "twice {X}", generic mana.
  if (text === "twice {X}") return { cost: "", generic: { count: { kind: "x" }, times: 2 } };
  if ((m = /^((?:\{(?:\d+|[WUBRGC])\})+)(?: and (\d+) life)?$/.exec(text))) return { cost: m[1]!, ...(m[2] ? { life: Number(m[2]) } : {}) };
  // "Pay 5 life" (Dash Hopes): only with that much life (CR 119.4).
  if ((m = /^(\d+) life$/.exec(text))) return { cost: "", life: Number(m[1]) };
  // "Unless its controller pays mana equal to the greatest power among creatures you control" (Repulsive Mutation):
  // generic mana, counted as it resolves.
  if ((m = /^mana equal to (.+)$/.exec(text))) {
    const n = parseCount(m[1]!, ctx);
    return n && typeof n === "object" ? { cost: "", generic: n } : null;
  }
  // Spell Stutter: "{2} plus an additional {1} for each Faerie you control", counted as it resolves.
  if ((m = /^\{(\d+)\} plus an additional \{(\d+)\} for each (.+)$/.exec(text))) {
    const per = parseCount(m[3]!, ctx, true);
    const more = per && scaleAmount(Number(m[2]), per);
    if (!more || typeof more !== "object" || more.negate) return null;
    return { cost: "", generic: { ...more, plus: (more.plus ?? 0) + Number(m[1]) } };
  }
  if ((m = /^\{(\d+)\} for each (.+)$/.exec(text))) {
    const per = parseCount(m[2]!, ctx, true);
    const generic = per && scaleAmount(Number(m[1]), per);
    return generic === null || generic === undefined ? null : { cost: "", generic };
  }
  return null;
}

/** N for each of something: N times the count. Null if N isn't a plain number. */
export function scaleAmount(n: Amount, per: AmountExpr): Amount | null {
  if (typeof n !== "number") return null;
  if (n === 0) return 0;
  // "-1/-1 for each Swamp": the count times 1, made negative.
  // "For each five counters removed this way" (Sage of Hours): each whole group (AmountExpr.per).
  return { count: per.count, times: Math.abs(n) * (per.times ?? 1), ...(per.per ? { per: per.per } : {}), ...(per.plus ? { plus: Math.abs(n) * per.plus } : {}), ...(n < 0 ? { negate: true } : {}) };
}

/**
 * "Draw a card for each creature you control", "You gain 2 life for each Elf you control",
 * "Target creature gets +1/+1 until end of turn for each artifact you control". The count is made
 * as it resolves (CR 608.2h). The number before it is what gets multiplied.
 */
function parseForEach(s: string, ctx: Ctx): Effect[] | null {
  // Lowercase after a trigger's condition: "Whenever ~ deals combat damage to a player, for each token you control, create
  // ..." (Cadira, Caller of the Small).
  const m = /^(.+) for each (.+)$/.exec(s) ?? /^[Ff]or each (.+?), (.+)$/.exec(s);
  if (!m) return null;
  const [main, phrase] = /^[Ff]or each /.test(s) ? [m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1), m[1]!] : [m[1]!, m[2]!];
  const fx = parseSentence(main, ctx);
  if (!fx || fx.length !== 1) return null;
  // "Each player loses 1 life for each creature they control" (Stronghold Discipline), "target player loses 1 life for each
  // tapped artifact they control" (Burden of Greed): each of those players counts their own.
  const theirs = /^(.+) they control$/.exec(phrase);
  if (theirs) {
    const e = fx[0]!;
    // "Whenever ~ deals combat damage to a player, create a Treasure token for each artifact they control" (Hoard Hauler):
    // the player the trigger is about.
    if (e.type === "createToken" && (ctx.eventPlayer || ctx.defending) && ctx.lastPlayerTarget === undefined && !ctx.chosenOpponent) {
      const count = parseCount(`${theirs[1]} on the battlefield`, ctx, true);
      if (!count || count.count.kind !== "permanents" || count.times || count.plus) return null;
      const scaled = scaleEffect(e, { count: { ...count.count, whose: { ref: "eventPlayer" } } });
      return scaled ? [scaled] : null;
    }
    // Waiting in the Weeds: "Each player creates a 1/1 green Cat creature token for each untapped Forest they control": each
    // their own number.
    const eachCreates = e.type === "createToken" && e.who?.ref === "eachPlayer" ? e.who : null;
    const who = e.type === "loseLife" || e.type === "gainLife" || e.type === "draw" ? e.who : eachCreates;
    if (!who) return null;
    // "That player gains 2 life for each creature they control" (Benevolent Offering): the chosen opponent.
    const whose: PlayerRef | null = eachCreates ? { ref: "eachOne" } : who.ref === "eachPlayer" || who.ref === "eachOpponent" ? { ref: "eachOne" } : who.ref === "target" && !who.n ? who : who.ref === "eventPlayer" || (who.ref === "chosenPlayer" && who.nth === undefined) ? who : null;
    // Allied Strategies: "draws a card for each basic land type among lands they control": that player's domain.
    if (whose && /^basic land type among lands$/.test(theirs[1]!)) {
      const scaled = scaleEffect(e, { count: { kind: "basicLandTypes", whose } });
      return scaled ? [scaled] : null;
    }
    const count = whose && parseCount(`${theirs[1]} on the battlefield`, ctx, true);
    if (!count || count.count.kind !== "permanents" || count.times || count.plus) return null;
    const scaled = scaleEffect(e, { count: { ...count.count, whose } });
    return scaled ? [scaled] : null;
  }
  // "Each opponent loses 1 life for each creature card in that player's graveyard" (One Ring to Rule Them All): the same,
  // each one's own graveyard.
  // Other players ("defending player", "target player") are read below, as "their" is for them.
  const theirYard = /^(.+?) in (?:that player's|their) graveyard$/.exec(phrase);
  const e0 = fx[0]!;
  if (theirYard && (e0.type === "loseLife" || e0.type === "gainLife" || e0.type === "draw") && (e0.who.ref === "eachPlayer" || e0.who.ref === "eachOpponent")) {
    const e = e0;
    const who: PlayerRef = { ref: "eachOne" };
    const count = parseCount(`${theirYard[1]} in your graveyard`, ctx, true);
    if (!count || count.count.kind !== "cardsInGraveyard" || count.times || count.plus) return null;
    const scaled = scaleEffect(e, { count: { ...count.count, who } });
    return scaled ? [scaled] : null;
  }
  // "Target attacking creature gets +1/+1 until end of turn for each other attacking creature" (Paladin Class): other than
  // that target, so with one attacker it gets nothing (rulings).
  const e1 = fx[0]!;
  const ofTarget = /^other (attacking creatures?)$/.exec(phrase) && e1.type === "continuous" && e1.what.ref === "target" && !e1.what.n ? e1.what.index : undefined;
  const per = parseCount(ofTarget !== undefined ? phrase.slice("other ".length) : phrase, ctx, true);
  if (!per) return null;
  if (ofTarget !== undefined) {
    if (per.count.kind !== "permanents" || per.count.other) return null;
    per.count = { ...per.count, otherThanTarget: ofTarget, filter: { ...per.count.filter, text: phrase } };
  }
  const scaled = scaleEffect(fx[0]!, per);
  return scaled ? [scaled] : null;
}

/** Multiply an effect's number by a count. */
function scaleEffect(e: Effect, per: AmountExpr): Effect | null {
  const sc = (n: Amount) => scaleAmount(n, per);
  switch (e.type) {
    case "damage": {
      const amount = sc(e.amount);
      return amount === null ? null : { ...e, amount };
    }
    case "draw":
    case "gainLife":
    case "loseLife":
    case "counters":
    case "createToken":
    case "mill":
    case "discard":
    case "scry":
    case "surveil":
    case "preventNext":
    case "extraTurn":
    case "pick": {
      if ((e.type === "counters" && (e.perLastKnownCounter || e.double)) || (e.type === "extraTurn" && (e.n !== 1 || e.loseAtEnd))) return null;
      const n = sc(e.n);
      return n === null ? null : ({ ...e, n } as Effect);
    }
    // "For each flip you won, create a token that's a copy of that creature" (Mirror March): that many, at once.
    case "createTokenCopy": {
      if (e.each || e.attackingEach) return null;
      const n = sc(e.n);
      return n === null ? null : { ...e, n };
    }
    case "continuous": {
      if (e.mods.length !== 1 || e.mods[0]!.kind !== "modifyPT") return null;
      const [p, t] = [sc(e.mods[0]!.power), sc(e.mods[0]!.toughness)];
      return p === null || t === null ? null : { ...e, mods: [{ kind: "modifyPT", power: p, toughness: t }] };
    }
    default:
      return null;
  }
}

/**
 * "~ deals damage to target creature equal to the number of lands you control", "You gain life
 * equal to its power", "Draw cards equal to ...": the same as X with X defined as that number.
 */
function parseEqualTo(s: string, ctx: Ctx): Effect[] | null {
  // The count is the last group, except where the text puts it in the middle.
  const forms: [RegExp, (m: RegExpExecArray) => string, number?][] = [
    [/^(.+?) deals damage to (.+) equal to (.+)$/i, (m) => `${m[1]} deals X damage to ${m[2]}`],
    [/^(.+?) deals damage equal to (.+?) to (.+)$/i, (m) => `${m[1]} deals X damage to ${m[3]}`, 2],
    [/^(.+?) (gains?|loses?) life equal to (.+)$/i, (m) => `${m[1]} ${m[2]} X life`],
    [/^(.*?)([Dd]raws?) cards equal to (.+)$/, (m) => `${m[1]}${m[2]} X cards`],
    [/^(.*?)([Mm]ills?) cards equal to (.+)$/, (m) => `${m[1]}${m[2]} X cards`],
    [/^Put a number of ([+-]1\/[+-]1|[a-z]+) counters on (.+) equal to (.+)$/i, (m) => `Put X ${m[1]} counters on ${m[2]}`],
    // "Put a number of +1/+1 counters equal to ~'s power on another target creature you control" (Maester Seymour).
    // "Equal to its power on up to one target creature" (Galuf's Final Act): "its" comes before the target, so it's ~'s.
    [/^Put a number of ([+-]1\/[+-]1|[a-z]+) counters equal to (.+?) on (.+)$/i, (m) => `Put X ${m[1]} counters on ${m[3]}`, 2],
    [/^(?:You )?[Cc]reate a number of (.+?) tokens( with [^,]+?)? equal to (.+)$/, (m) => `Create X ${m[1]} tokens${m[2] ?? ""}`],
  ];
  // "You gain life and draw cards equal to its power" (Lifeblood Hydra): both by that much.
  const both = /^you gain life and draw cards equal to (.+)$/i.exec(s);
  if (both) {
    const gain = parseSentence("you gain X life", ctx);
    const draw = parseSentence("draw X cards", ctx);
    const def = parseCount(both[1]!, ctx);
    return gain && draw && def ? replaceX([...gain, ...draw], def) : null;
  }
  for (const [re, rewrite, group] of forms) {
    const m = re.exec(s);
    if (!m) continue;
    if (group === 2 && /^Put a number of /i.test(s)) m[2] = m[2]!.replace(/^its (power|toughness)$/, "~'s $1");
    const fx = parseSentence(rewrite(m), ctx);
    // "Draw cards equal to the power of target creature you control" (Soul's Majesty): that target's power as it resolves,
    // a target of its own after the sentence's others.
    const of = /^(?:the (power|toughness) of (target creature(?: you control)?)|(target creature(?: you control)?)'s (power|toughness))$/.exec(m[group ?? m.length - 1]!);
    if (fx && of) {
      const what = (of[2] ?? of[3])!;
      const index = addTarget(ctx, { kind: "object", types: ["Creature"], ...(/you control$/.test(what) ? { controller: "you" as const } : {}), text: what });
      return replaceX(fx, { count: { kind: (of[1] ?? of[4]) as "power" | "toughness", of: { ref: "target", index } } });
    }
    // "Each opponent loses life equal to the number of creatures attacking them" (Within Range): each that player's own
    // number, "them" being the one losing life.
    const each = /^each (?:opponent|player) (?:gains|loses) life equal to /i.test(s);
    if (each) ctx.eachOne = true;
    const def = fx && parseCount(m[group ?? m.length - 1]!, ctx);
    if (each) ctx.eachOne = undefined;
    return fx && def ? replaceX(fx, def) : null;
  }
  return null;
}

// "Choose one —" and its bulleted modes; "choose one that hasn't been chosen [this turn] —" (GameObject.modesChosen) and
// "choose one at random —". Spree's "+ {cost} —" modes, escalate, pawprints and repeated modes are read in compile.ts.
const MODAL = /^[Cc]hoose (one|two|three|four|five|one or both|one or more|up to one|any number)( that hasn't been chosen(?: this turn)?| at random)? —\s*((?:•[^•]+)+)$/;

/** How many modes each "Choose ..." allows (CR 700.2), given how many there are. */
const MODE_COUNTS: Record<string, (n: number) => [number, number]> = {
  one: () => [1, 1],
  two: () => [2, 2],
  three: () => [3, 3],
  // "Choose five. You may choose the same mode more than once." (Unite the Coalition).
  four: () => [4, 4],
  five: () => [5, 5],
  "one or both": () => [1, 2],
  "one or more": (n) => [1, n],
  "up to one": () => [0, 1],
  // "Choose any number —" (Rankle and Torbran): none, some or all, in the order printed (rulings).
  "any number": (n) => [0, n],
};

function parseModal(count: string, bullets: string, text: string, opts: Parameters<typeof parseBody>[1] = {}): AbilityBody | null {
  const modes: AbilityBody[] = [];
  for (const b of bullets.split("•").map((x) => x.trim()).filter(Boolean)) {
    // "Street Justice — Exile target creature ...": a mode's name is a flavor word, with no rules meaning (CR 207.2d).
    // A trigger's modes can say what its event was about: "Create a Royal Role token attached to that creature".
    const body = parseBody(b.replace(/^[A-Z][A-Za-z' ,!-]* — /, ""), opts);
    if (!body) return null; // every mode has to work, or the card isn't supported
    modes.push(body);
  }
  // Only a triggered ability's, whose modes may all be left out (CR 700.2b, 603.3c).
  if (count === "any number" && (opts.spell || opts.activated)) return null;
  const [min, max] = MODE_COUNTS[count]!(modes.length);
  if (modes.length < 2 || max > modes.length) return null;
  return { targets: [], effects: [], text, modal: { min, max, modes } };
}

/** "X and Y" where each half is its own effect. */
function parseConjunction(s: string, ctx: Ctx): Effect[] | null {
  // "You create a 2/2 green Wolf creature token and that player mills ten cards" (Sword of Body and Mind): "that player"
  // after a part about you. "Draw a card and ~ can't be blocked this turn" (Vampire Gourmand), "... and ~ gets +2/+0 until
  // end of turn" (Reckless Detective).
  // "You gain 3 life and that creature fights up to one target creature you don't control" (Tolsimir, Friend to Wolves).
  // "Remove all time counters from ~ and ~ deals 20 damage to you" (Cursed Recording).
  // Gloom Ripper: "target creature you control gets +X/+0 until end of turn and up to one target creature an opponent
  // controls gets -0/-X until end of turn": an unchosen "up to one" target's part does nothing (CR 115.6).
  const parts = s.split(/,? and (?=(?:you|each|target|up to one target|draw|~|its|create|put|return|exile|destroy|tap|untap|mill|suspect|convert|transform|manifest|after this phase|they gain|that creature(?= fights)|scry \d+$|surveil \d+$|blight \d+$)\b|~ (?=can't be blocked this turn$|gets [+-]\d+\/[+-]\d+ until end of turn$|deals \d+ damage to you$)|get (?:\{E\}|\w+ \{E\}|an amount of \{E\})|that player (?=mills|draws|discards|loses|gains)(?<=^you [^,]+ and that player ))/i);
  if (parts.length < 2) return null;
  const out: Effect[] = [];
  for (const p of parts) {
    // "that player discards a card and you untap all lands you control" (Sword of Feast and Famine): "you untap" is
    // "untap", done by the ability's controller.
    const part = (p.charAt(0).toUpperCase() + p.slice(1)).replace(/^You (untap|tap|create|exile|destroy|return) /, (_, v: string) => `${capital(v)} `);
    // "Put a +1/+1 counter on ~ for each strength vote and create a 1/1 white Soldier creature token for each numbers vote"
    // (Lieutenants of the Guard): either part may count.
    const fx = attempt(ctx, () => parseSentence(part, ctx)) ?? attempt(ctx, () => parseForEach(part, ctx));
    if (!fx) return null;
    // "Create a 2/1 black Skeleton creature token and suspect it" (Case of the Stashed Skeleton): it's the token.
    noteLast(ctx, fx);
    out.push(...fx);
  }
  return out;
}

/**
 * "Target player draws two cards and loses 2 life", "You draw a card and lose 1 life": one subject doing two things in
 * order. A target is chosen once; the second verb is about the same player ("that player").
 */
function parseSharedSubject(s: string, ctx: Ctx): Effect[] | null {
  const VERB = String.raw`(?:draws?|loses?|gains?|discards?|mills?|sacrifices?|exiles|gets?(?= (?:a|an|one|two|three) poison counters?))`;
  const m = new RegExp(`^(.+?) (${VERB} .+?),? and (${VERB} .+|scry \\d+|surveil \\d+)$`).exec(s);
  if (!m) return null;
  const subject = m[1]!;
  // "You gain 1 life and scry 1": scry and surveil are only ever yours.
  if (/^(scry|surveil) /.test(m[3]!)) {
    if (!/^you$/i.test(subject)) return null;
    const first = parseSentence(`${subject} ${m[2]}`, ctx);
    const second = first && parseSentence(`${m[3]!.charAt(0).toUpperCase()}${m[3]!.slice(1)}`, ctx);
    return first && second ? [...first, ...second] : null;
  }
  // "Any number of target players each mill a card and lose 1 life" (Tinybones Joins Up): all of them both times.
  const again = /^target (player|opponent)$/i.test(subject) ? "That player" : /^any number of target (players|opponents) each$/i.test(subject) ? "Each of those players" : /^(you|each player|each opponent|that player|each of its controller's opponents)$/i.test(subject) ? subject : null;
  if (!again) return null;
  // "Target player draws cards equal to half the number of cards in their library and loses half their life" (Peer into
  // the Abyss): either part may be "... equal to ...".
  // "Each opponent sacrifices a creature of their choice for each death vote and discards a card for each taxes vote"
  // (Capital Punishment): or "... for each ...".
  const one = (t: string) => attempt(ctx, () => parseSentence(t, ctx)) ?? attempt(ctx, () => parseEqualTo(t, ctx)) ?? attempt(ctx, () => parseForEach(t, ctx));
  // "Target player draws three cards, loses 3 life, and gets three poison counters" (Caress of Phyrexia): three of them,
  // in order.
  const three = new RegExp(`^(${VERB} [^,]+), (${VERB} [^,]+)$`).exec(m[2]!);
  if (three) {
    const first = one(`${subject} ${three[1]}`);
    const rest = first && parseSharedSubject(`${again.charAt(0).toUpperCase()}${again.slice(1)} ${three[2]} and ${m[3]}`, ctx);
    return first && rest ? [...first, ...rest] : null;
  }
  const first = one(`${subject} ${m[2]}`);
  const second = first && one(`${again.charAt(0).toUpperCase()}${again.slice(1)} ${m[3]}`);
  return first && second ? [...first, ...second] : null;
}

/**
 * "You take the initiative, gain 3 life, draw a card, and create a Treasure token" (Dungeoneer's Pack): a list of three
 * or more instructions for you, in order. Each part has to read on its own.
 */
function parseYouList(s: string, ctx: Ctx): Effect[] | null {
  const m = /^[Yy]ou (.+), and (.+)$/.exec(s);
  if (!m) return null;
  const parts = [...m[1]!.split(", "), m[2]!];
  if (parts.length < 3) return null;
  const out: Effect[] = [];
  for (const p of parts) {
    // "You draw a card, gain 1 life, and put a +1/+1 counter on ~" (Helga, Skittish Seer): "put" reads as an instruction.
    const fx = parseSentence(`You ${p}`, ctx) ?? (/^put an? [^ ]+ counter on ~$/.test(p) ? parseSentence(capital(p), ctx) : null);
    if (!fx) return null;
    out.push(...fx);
  }
  return out;
}

export function addTarget(ctx: Ctx, spec: TargetSpec): number {
  ctx.targets.push(spec);
  ctx.lastCreated = false;
  ctx.lastCreatedCreature = false;
  ctx.lastPut = false;
  const i = ctx.targets.length - 1;
  if (spec.kind === "object" || spec.kind === "spell") ctx.lastObjectTarget = i;
  return i;
}

/**
 * What each player may do in a tempting offer, as if they were "you" ("put a +1/+1 counter on each creature they
 * control" is "... each creature you control" for each of them). No targets: they're the spell's or ability's own.
 */
function parseOffer(text: string, ctx: Ctx): Effect[] | null {
  const mine = text.replace(/\bthey control\b/g, "you control").replace(/\btheir\b/g, "your").replace(/\bthey\b/g, "you");
  const before = ctx.targets.length;
  const fx = attempt(ctx, () => parseOne(capital(mine), ctx));
  if (!fx || ctx.targets.length !== before || fx.some((e) => e.type === "eachMay")) {
    ctx.targets.length = before;
    return null;
  }
  return fx;
}

/** "For each opponent who does, ...": "you gain protection from that player until your next turn", or what you do. */
function parseOfferRest(text: string, ctx: Ctx): Effect[] | null {
  if (/^you gain protection from that player until your next turn$/.test(text)) return [{ type: "playerGains", keywords: [THAT_PLAYER_PROTECTION], untilYourNextTurn: true }];
  if (/\b(?:that player|they|their|them|it)\b/.test(text)) return null;
  const before = ctx.targets.length;
  const fx = attempt(ctx, () => parseOne(capital(text), ctx));
  if (!fx || ctx.targets.length !== before) {
    ctx.targets.length = before;
    return null;
  }
  return fx;
}

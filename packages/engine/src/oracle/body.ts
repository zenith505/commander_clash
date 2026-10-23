import { parseFromTop } from "./compile";
import { allEffects, refCovers, type SearchDest, type AbilityBody, type FaceDownPlay, type Amount, type AmountExpr, type Count, type Effect, type ObjRef, type PlayerRef, type SpellCondition, type TargetSpec, type UnlessPays, type PayCost, type NamePurpose } from "../abilities";
import { substituteX } from "../amounts";
import { differenceInHand, num, NUM, NUMX, X, amt, ROLL_ROW, counterKind, COUNTER, isGroup, keywordOf, parseSpentReq, SPENT_TO_CAST, WHEEL, capital, COLOR_WORDS, singularWord, NUMBER_WORDS } from "./words";
import { canonicalKeyword, CARD_TYPE_PLURAL, CHOSEN_KEYWORD, CHOSEN_PROTECTION, CREATURE_TYPES, THAT_PLAYER_PROTECTION } from "../keywords";
import { parsePreventAll, parseStaticCondition } from "./statics";
import { parseBoundCount, parseCount } from "./counts";
import { parseBecomes, parseDig, parseSentence } from "./sentence";
import { parsePreventionRider } from "./sentences/prevention";
import { compileQuoted, parseGrants } from "./grants";
import { boundAtTargeting, parseCardTarget, parseDamageRecipient, parseObject, parsePlayer, parseTargetPhrase, pickFilter, PERMANENT_TYPES } from "./targets";
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
  /** A reflexive trigger after "you may sacrifice another creature": "that creature's power" is the sacrificed one's. */
  sacrificedIt?: boolean;
  /** A revealFromHand instruction came before, here or in the ability whose reflexive trigger this is: "for each card revealed this way". */
  revealedFromHand?: boolean;
  /** After "may have you ...": "you mill three cards, then ... the total mana value of those cards" (Combustible Gearhulk). */
  milledThisWay?: boolean;
  /** A damage instruction came before: "the excess damage dealt this way" (CR 120.10). */
  excessDamage?: boolean;
  /** A tapAnyNumber instruction came before, here or in the ability whose reflexive trigger this is: "for each creature tapped this way". */
  tappedThisWay?: boolean;
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
  /**
   * The last sentence put one card onto the battlefield ("Return target creature card from your graveyard to the
   * battlefield"): "it" and "that creature" are the permanent it became (CR 400.7), kept in `created` like a token.
   */
  lastPut?: boolean;
  /** The last sentence created tokens, any number: "Sacrifice them at the beginning of the next end step". */
  lastCreatedAny?: boolean;
  /** "Put all land cards from among them onto the battlefield tapped": "those lands" after (Animist's Awakening). */
  lastDugLands?: boolean;
  /** The instruction before was "mill N cards" (yours): "those cards" in what follows can be the milled cards (Ripples of Undeath). */
  afterMill?: boolean;
  /** An instruction before discarded one card of yours: "the discarded card" is that card (Malcolm). */
  discardedOne?: boolean;
  /** An instant or sorcery: "other" can't mean other than its source, which isn't a permanent. */
  spell?: boolean;
  /** A "whenever a player casts a spell" trigger: "it" or "that spell" can be the spell cast. */
  castSpell?: boolean;
  /** A "whenever you activate an ability" trigger: "that ability" is the ability activated (Rings of Brighthearth). */
  activatedAbility?: boolean;
  /** A cast trigger's first instruction: "it gains haste" (Tyvar Kell's emblem) is the spell cast. */
  spellIt?: boolean;
  /** In a "when you cast this spell" ability: "copy it" is the spell itself. */
  selfCastSpell?: boolean;
  /** An exchange of life totals came before: "the life lost this way", "those players' life totals" are about it. */
  exchanged?: boolean;
  /** "Whenever ~ deals combat damage to a player": "that player" is that player. */
  eventPlayer?: boolean;
  /** While counting for "each player ... that player controls" (Price of Progress): "that player" is each of them in turn (PlayerRef eachOne). */
  eachOne?: boolean;
  /** "Choose an opponent." came before: "that player" is the one chosen. */
  chosenOpponent?: boolean;
  /** "Roll two d8 and choose one result" came before: "that result" and "the other result" mean something. */
  chooseResult?: boolean;
  /** In "whenever ~ attacks" and "becomes blocked" triggers: "defending player" is the event player. */
  defending?: boolean;
  /** "Whenever another creature dies": the subject left the battlefield, so "it" and "that card" are the card where it went. */
  subjectLeft?: boolean;
  /**
   * An enters trigger of a card with {X} in its cost (or a "when you cast this spell" one): X is the X its spell was cast
   * with (CR 107.3m, 107.3a), known as the trigger's targets are chosen, like a spell's.
   */
  ownX?: boolean;
  /** This sentence defines its own X ("..., where X is ..."): "up to X target ..." isn't the spell's X then. */
  whereX?: boolean;
  /** The ability ends "Round up each time." (CR 107.1a): every "half ..." in it is rounded that way. */
  halfRound?: "up" | "down";
  /** A vote came before (CR 701.38): its words ("death vote", "if taxes gets more votes"), or that it's for objects. */
  vote?: { options?: string[]; among?: true; /** "Each player may choose ..." (not a vote): "each permanent chosen this way". */ choose?: true };
  /** "Each opponent chooses fame or fortune" came before: its words ("for each player who chose fortune"). */
  chooseWords?: string[];
  /** "Gain control of a creature that player controls" for each player who chose a word: "those creatures" are they. */
  fromEach?: boolean;
}

/**
 * The instruction after ", then": "Target player draws a card, then discards a card" (Cephalid Looter) is the same player
 * discarding, "that player"; "each player draws ..., then discards ..." each of them.
 */
function thenSubject(first: string, next: string): string {
  const who = /^(Target player|Target opponent|That player|Each player|Each opponent) /.exec(first);
  if (who && /^(?:draws|discards|mills|loses|gains|sacrifices|shuffles|creates) /.test(next)) return `${/^Target /.test(who[1]!) ? "That player" : who[1]} ${next}`;
  // Oblation: "The owner of target nonland permanent shuffles it into their library, then draws two cards": that owner.
  if (/^The owner of target [^,]+ shuffles it into their library$/.test(first) && /^draws /.test(next)) return `Its owner ${next}`;
  return next.charAt(0).toUpperCase() + next.slice(1);
}

/** A card type a player can be told to choose among (CR 205.2a). */
const CARD_TYPE_WORD = "(?:artifact|battle|creature|enchantment|instant|land|planeswalker|sorcery)";

/**
 * The events a delayed triggered ability with a duration can wait for (see GameState.floatingTriggers), and the parts of
 * a trigger it can have: an intervening "if" or a zone would need more about its source than it has.
 */
const FLOATING_EVENTS = new Set<string>(["castSpell", "permanentDies", "selfDealsCombatDamageToPlayer", "creatureYouControlDealsCombatDamageToPlayer", "creaturesYouControlDealCombatDamageToPlayer", "eachBeginCombat", "creaturesYouControlAttack"]);
const FLOATING_KEYS = new Set<string>(["event", "cast", "dies", "dealer", "toOpponent", "orPlaneswalker", "body"]);

/**
 * "Until end of turn, whenever you cast a spell, copy it. You may choose new targets for the copy.": a delayed triggered
 * ability that triggers each time until then (CR 603.7b), the sentences after it its instructions. Undefined when `s`
 * isn't one, null when it can't be compiled.
 */
function floatingTrigger(s: string, after: string[], ctx?: Ctx): Effect | null | undefined {
  // "Choose target creature you control. Whenever that creature deals combat damage to a player or planeswalker this
  // turn, draw that many cards." (Hunter's Insight): a delayed trigger about that creature (CR 603.7b-c), this turn.
  const that = ctx?.lastObjectTarget !== undefined ? /^Whenever (?:that creature|it) (deals combat damage to a player(?: or planeswalker)?) this turn, (.+)$/.exec(s) : null;
  if (that) {
    const trigger = parseTrigger(`Whenever ~ ${that[1]!}, ${[that[2]!, ...after.map((x) => x.replace(/\.$/, ""))].join(". ")}.`);
    if (!trigger || trigger === "fail" || trigger.event !== "selfDealsCombatDamageToPlayer" || Object.keys(trigger).some((k) => !FLOATING_KEYS.has(k))) return null;
    return { type: "floatingTrigger", trigger, until: "endOfTurn", about: ctx!.lastObjectTarget! };
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
  // "Whenever one or more creatures you control deal combat damage to one or more players this turn, you become the
  // monarch" (Forth Eorlingas!): the same, once for each combat damage step (CR 510.2, 603.2c).
  const dealt = /^Whenever (one or more creatures you control deal combat damage to one or more players) this turn, (.+)$/.exec(s);
  if (dealt) return floatingTrigger(`This turn, whenever ${dealt[1]!}, ${dealt[2]!}`, after, ctx);
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
const PAUSING = new Set<Effect["type"]>(["vote", "attachAny", "discard", "reorderGraveyard", "takeFromHand", "scry", "surveil", "orderTop", "handToTop", "may", "explore", "search", "choose", "connive", "recruit", "pick", "clash", "endure", "tapOrUntap", "untapUpTo", "castFromHand", "punisher", "sacrificeEach", "venture", "chooseFromGraveyard", "keepRest", "villainous", "putFromExiledTop"]);
/** Effects that can stop for a choice partway: they can't share a conditional or a loop with other effects. */
const pauses = (e: Effect) => PAUSING.has(e.type) || (e.type === "putInLibrary" && e.position === "ownersChoice") || (e.type === "roll" && !!e.chooseOne);

/** "You may [this]. If you do, ...": whether it was done is known (see canDoNow in effects.ts). */
const checkableMay = (e: Effect) =>
  e.type === "collectEvidence" ||
  // "You may exile all cards from your hand face down. If you do, ..." (Duplicity): even an empty hand (rulings on
  // exiling or discarding your hand, Herigast).
  (e.type === "exileFaceDown" && e.from === "hand") ||
  (e.type === "discard" && e.who.ref === "you" && e.n === 1 && !e.random) ||
  // "You may discard your hand. If you do, draw three cards." (Phyrexian Dragon Engine): even an empty one (rulings on
  // Moonveil Regent).
  (e.type === "discard" && e.who.ref === "you" && e.hand && !e.filter) ||
  (e.type === "draw" && e.who.ref === "you") ||
  // "You may have that player lose 2 life. If you do, you gain 2 life." (Bloodchief Ascension): one player, who can lose
  // life now (CR 119.8).
  (e.type === "loseLife" && (e.who.ref === "eventPlayer" || (e.who.ref === "target" && !("n" in e.who && e.who.n))) && typeof e.n === "number" && e.n > 0) ||
  // "You may put a card from your hand on the bottom of your library. If you do, draw a card." (Volcanic Spite): only
  // with a card in hand.
  (e.type === "handToTop" && e.n === 1) ||
  // "You may exile a creature card from your graveyard. If you do, ..." (Masked Vandal): only with one there.
  (e.type === "chooseFromGraveyard" && e.dest === "exile" && e.n === 1 && !e.upTo && !e.who && !e.milled && !e.eventGroup && !e.notSacrificed && e.totalMv === undefined && e.mvMax === undefined) ||
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
  // "You may tap it. When you do, ..." (The Fire Nation Drill): only an untapped permanent can be tapped (CR 701.26a).
  (e.type === "tap" && e.what.ref === "self") ||
  // "You may remove a hit counter from a card that player owns in exile. If you do, ..." (Mari): only with one there.
  e.type === "removeExiledCounter" ||
  // "You may remove a charge counter from ~. If you do, you gain 1 life" (Sun Droplet): only with that many on it.
  (e.type === "removeCounters" && e.what.ref === "self" && typeof e.n === "number") ||
  // "You may put the top creature card of defending player's graveyard onto the battlefield. If you do, ..." (Bone Dancer).
  (e.type === "putOntoBattlefield" && e.what.ref === "graveyardEnd" && !e.atEndStep && !e.haste) ||
  // "You may return another creature you control to its owner's hand. If you do, ...": only with one to return. "You may
  // sacrifice a Zombie. If you do, ..." (Wilhelt): only with one to sacrifice.
  // "You may choose a token you control. If you do, ..." (Brudiclad): only with one to choose.
  (e.type === "pick" && e.who.ref === "you" && (e.action === "bounce" || e.action === "sacrifice" || e.action === "choose") && e.n === 1 && !e.unless) ||
  // "You may tap five untapped artifacts and/or creatures you control. If you do, ..." (Thousand Moons Smithy): only with
  // that many untapped.
  (e.type === "pick" && e.who.ref === "you" && e.action === "tap" && typeof e.n === "number" && !e.unless && !e.anyNumber) ||
  // "You may have it deal 3 damage to target creature. If you do, ...": done if that target is still legal.
  (e.type === "damage" && (e.to.ref === "target" || e.to.ref === "anyTarget") && !("n" in e.to && e.to.n) && !e.also && !e.divided) ||
  (e.type === "bite" && e.b.ref === "target" && !e.b.n && (e.a.ref === "self" || e.a.ref === "target")) ||
  // "You may have target creature you control get +2/+0 and gain haste until end of turn. If you do, ..." (Hazoret's
  // Favor), "you may have it get +4/+0 until end of turn" (Attack-in-the-Box): done if that permanent is still there.
  (e.type === "continuous" && (e.what.ref === "self" || (e.what.ref === "target" && !e.what.n)) && e.duration === "endOfTurn") ||
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
  const first = anyOfChosen ? (["", "", "card", anyOfChosen[1]!] as const) : (/^If (?:it's|that card is) (not |)(an? .+?|snow) card, (.+)$/.exec(sentences[at] ?? "") ?? /^If it (isn't) (an? .+?) card, (.+)$/.exec(sentences[at] ?? "") ?? /^If that card is ()(snow), (.+)$/.exec(sentences[at] ?? ""));
  // "If that card has the chosen name, sacrifice ~ and draw three cards" (Diviner's Lockbox), after "choose a card name".
  const named = !first && /^If (?:it|that card) has the chosen name, (.+)$/.exec(sentences[at] ?? "");
  if (named) {
    // Its targets are chosen as it's put on the stack, whatever the card turns out to be (CR 601.2c, 602.2b).
    const then = revealedAction(named[1]!, ctx, true);
    return then && { effect: { type: "if", cond: { kind: "revealedIs", filter: { kind: "card", chosen: "name", text: "card with the chosen name" } }, effects: then }, next: at + 1 };
  }
  if (!first) return null;
  const filter0: TargetSpec | null = anyOfChosen ? { kind: "card", chosen: "type", text: "card of the chosen type" } : (parseSearchFilter(`${first[2]!.replace(/^an? /, "")} card`) ?? null);
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
  if (!head && !lookThen && !they) return null;
  let next = at + (lookThen ? 2 : 1);
  const m = head ?? (lookThen ? look : null);
  const count = m ? m[1]! : they![2]!;
  const n = count === "card" ? 1 : amt(new RegExp(`^${NUMX} cards$`).exec(count)![1]!);
  // Not yet: whose library is read last, after the permission is known to be there (it may add a target).
  const whose = m ? (m[m.length - 1] === "your" ? "you" : m[m.length - 1]!.replace(/'s$/, "")) : they![1]!;
  let seen = false;
  let play: FaceDownPlay | undefined;
  let upkeepGraveyard = false;
  let endStepHand = false;
  const ANY = "(?:mana of any type can be spent to cast (?:it|them|that spell|those spells)|you may spend mana as though it were mana of any type to cast (?:it|them|that spell|those spells))";
  for (;;) {
    const t = sentences[next];
    if (t === undefined) break;
    if (/^You may look at (?:it|that card|those cards|them) for as long as (?:it remains|they remain) exiled$/.test(t)) seen = true;
    else {
      const may = new RegExp(`^You may (look at and )?(play|cast) (?:it|that card|those cards|them)( without paying (?:its mana cost|their mana costs))? (for as long as (?:it remains|they remain) exiled|this turn|for as long as ~ remains on the battlefield)(?:, and ${ANY})?$`).exec(t);
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
  const effect: Effect = { type: "exileFaceDown", from: "top", ...(n !== 1 ? { n } : {}), ...(who.ref !== "you" ? { who } : {}), ...(seen ? { look: true as const } : {}), ...(play ? { play } : {}), ...(upkeepGraveyard ? { upkeepGraveyard: true as const } : {}), ...(endStepHand ? { endStepHand: true as const } : {}) };
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
  // "Put two time counters on that card. If it doesn't have suspend, it gains suspend." (Kang Prime, CR 702.62).
  const suspend = exile && !then ? new RegExp(`^Put ${NUM} time counters? on that card$`).exec(cast) : null;
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
  const m = /^(you may )?put (?:it|that card) (into your hand|into your graveyard|on the bottom of your library|onto the battlefield( tapped)?(?: under your control)?)$/.exec(text);
  if (!m) {
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
const LIVING_DEATH = /^Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then /;

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
export function parseBody(text: string, opts: { sacrificedIt?: boolean; amassed?: boolean; subject?: boolean; subjectIt?: boolean; subjectLeft?: boolean; selfIt?: boolean; selfCard?: boolean; auraCard?: boolean; activated?: boolean; costLinked?: boolean; spell?: boolean; castSpell?: boolean; activatedAbility?: boolean; eventPlayer?: boolean; defending?: boolean; selfCastSpell?: boolean; ownX?: boolean; revealedFromHand?: boolean; tappedThisWay?: boolean; discardedSelf?: true; /** "Those creatures" are the trigger event's group (Frontier Warmonger). */ eventGroup?: true } = {}): AbilityBody | null {
  const body = parseBodyText(text, opts);
  // Éowyn: "protection from each of that creature's colors" is the colors of the ability's one target (TARGET_COLORS_PROTECTION).
  if (body && text.includes("each of that creature's colors") && (body.targets.length !== 1 || body.targets[0]!.kind !== "object")) return null;
  return body;
}

function parseBodyText(text: string, opts: { sacrificedIt?: boolean; amassed?: boolean; subject?: boolean; subjectIt?: boolean; subjectLeft?: boolean; selfIt?: boolean; selfCard?: boolean; auraCard?: boolean; activated?: boolean; costLinked?: boolean; spell?: boolean; castSpell?: boolean; activatedAbility?: boolean; eventPlayer?: boolean; defending?: boolean; selfCastSpell?: boolean; ownX?: boolean; revealedFromHand?: boolean; tappedThisWay?: boolean; discardedSelf?: true; /** "Those creatures" are the trigger event's group (Frontier Warmonger). */ eventGroup?: true } = {}): AbilityBody | null {
  // "Put a +1/+1 counter on ~ and untap it" (Gwenna): "it" is ~, the one thing named.
  text = differenceInHand(text).replace(/\b(counters? on ~ and (?:un)?tap) it\b/g, "$1 ~");
  // Witch-king of Angmar: "sacrifices a creature of their choice that dealt combat damage to you this turn" (the
  // sacrificing player chooses anyway, CR 701.21a).
  text = text.replace(/\b(sacrifices a creature) of their choice (that dealt combat damage to you this turn)\b/, "$1 $2");
  // Thousand-Faced Shadow: "create a token that's a copy of another target attacking creature. The token enters tapped and
  // attacking." (CR 508.4).
  text = text.replace(/\b([Cc]reate) a token that's a copy of ([^.]+)\. The token enters tapped and attacking\./, "$1 a tapped and attacking token that's a copy of $2.");
  // Echoing Assault: "... The token enters tapped and attacking that player." after "Whenever you attack a player".
  text = text.replace(/\b([Cc]reate) a token that's a copy of ([^.]+)\. The token enters tapped and attacking that player\./, "$1 a tapped and attacking that player token that's a copy of $2.");
  // Ichormoon Gauntlet: "choose a counter on target permanent. Put an additional counter of that kind on that permanent."
  text = text.replace(/\b[Cc]hoose a counter on (target [a-z ]+?)\. Put an additional counter of that kind on that permanent\./, "Put another counter of a kind already on $1 on it.");
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
    ...(opts.selfCastSpell ? { selfCastSpell: true } : {}),
    ...(opts.ownX ? { ownX: true } : {}),
    ...(opts.sacrificedIt ? { sacrificedIt: true } : {}),
    ...(opts.amassed ? { amassed: true } : {}),
    ...(opts.revealedFromHand ? { revealedFromHand: true } : {}),
    ...(opts.tappedThisWay ? { tappedThisWay: true } : {}),
    ...(opts.eventGroup ? { lastGroup: { ref: "eventGroup" as const } } : {}),
  };
  // "Each player loses half their life, then discards half the cards in their hand, ... Round up each time." (Fraying
  // Omnipotence): the last sentence says how each "half" in the others is rounded (CR 107.1a).
  const roundEach = /(?:^|\s)Round (up|down) each time\.?$/.exec(text.trim());
  if (roundEach) {
    text = text.trim().slice(0, roundEach.index);
    ctx.halfRound = roundEach[1] as "up" | "down";
  }
  const effects: Effect[] = [];
  // "... gains flashback until end of turn. The flashback cost is equal to its mana cost." is one instruction.
  // "Choose target artifact or enchantment. Its owner shuffles it into their library." (Deglamer) is one instruction.
  text = text.replace(/^Choose (target [^.]+?)\. Its owner shuffles it into their library\./, "The owner of $1 shuffles it into their library.");
  // Night Nurse: "choose target permanent card in your graveyard that was put there from anywhere this turn. Return it to
  // your hand." is one instruction.
  text = text.replace(/^[Cc]hoose (target [^.]+? in your graveyard(?: that was put there (?:from anywhere )?this turn)?)\. Return it to your hand\.$/, "Return $1 to your hand.");
  // Autumn's Veil: "Spells you control can't be countered by blue or black spells this turn, and creatures you control
  // can't be the targets of blue or black spells this turn": two instructions.
  text = text.replace(/^(Spells you control can't be countered by [a-z]+ or [a-z]+ spells this turn), and (creatures you control can't be the targets of [a-z]+ or [a-z]+ spells this turn)\./, "$1. $2.");
  // Meathook Massacre II: "return that card under your control" (its Oracle wording) is from the graveyard to the battlefield.
  text = text.replace(/\breturn that card under your control\b/g, "return that card to the battlefield under your control");
  // Tibalt's Trickery: one instruction about the countered spell's controller (read in parseUntilNonland).
  // "Search your library for up to X basic land cards, where X is .... Put those cards onto the battlefield tapped, then
  // shuffle." (Traverse the Outlands): the same as "... put them onto the battlefield tapped, then shuffle, where X is ...".
  text = text.replace(/(^|\. )Search your library for up to X ([^.,]+), where X is ([^.]+)\. Put those cards onto the battlefield( tapped)?, then shuffle\./, "$1Search your library for up to X $2, put them onto the battlefield$4, then shuffle, where X is $3.");
  // Harvest Season: "Search your library for up to X basic land cards, where X is ..., put those cards onto the
  // battlefield tapped, then shuffle." The same; "put them" too (Rampant Rejuvenator, its power as it last existed).
  text = text.replace(/(^|\. )([Ss])earch your library for up to X ([^.,]+), where X is ([^.,]+), put (?:those cards|them) onto the battlefield( tapped)?, then shuffle\./, "$1$2earch your library for up to X $3, put them onto the battlefield$5, then shuffle, where X is $4.");
  // Avatar's Wrath: "Choose up to one target creature, then airbend all other creatures": the target only says which one
  // isn't airbent (CR 701.65a), the same as two sentences.
  // "Put a night counter on ~. Then if it has eight or more night counters on it, remove all of them and create ..."
  // (Replicating Ring): ~'s counters, checked as it resolves (rulings).
  // The Scarab God: "each opponent loses X life and you scry X, where X is the number of Zombies you control": the same X
  // for both, which losing life doesn't change, so two instructions each with it.
  // "Untap it and all Samurai you control" (Godo, Bandit Warlord): two untaps, nothing in between.
  text = text.replace(/(^|\. )([Uu])ntap (it|~) and all ([^.]+)\./, "$1$2ntap $3. Untap all $4.");
  // "~ deals damage to each opponent equal to the number of tapped creatures that opponent controls" (Mjölnir, Storm
  // Hammer): each opponent's own count.
  text = text.replace(/(deals damage to each opponent equal to the number of [^.]+?) that opponent controls\b/g, "$1 that player controls");
  // "~ deals X damage to each opponent, where X is the number of artifacts you control. You gain X life." (Tezzeret, Master
  // of the Bridge): the same X, counted again (nothing between them changes it).
  text = text.replace(/(^|\. )(~ deals X damage to [^.]+), where X is ([^.]+)\. You gain X life\./, "$1$2, where X is $3. You gain X life, where X is $3.");
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
  text = text.replace(/(^|\. )([Ee]ach opponent loses X life) and you (scry X|draw X cards), where X is ([^.]+)\./, (_, lead: string, a: string, b: string, x: string) => `${lead}${a}, where X is ${x}. ${b.charAt(0).toUpperCase()}${b.slice(1)}, where X is ${x}.`);
  // Brass's Tunnel-Grinder: "Then if there are three or more bore counters on it, remove those counters and transform it."
  // Primal Amulet: "..., you may remove those counters and transform it."
  text = text.replace(/(^|\. )([Pp]ut an? ([a-z]+) counter on ~\.) Then if (?:it has|there are) ([a-z]+) or more \3 counters on it, (you may )?remove (?:all of them|those counters)( and |(?=, transform ~, and ))/, (_, lead: string, put: string, kind: string, n: string, may: string | undefined, and: string) => `${lead}${put} If there are ${n} or more ${kind} counters on ~, ${may ?? ""}remove all ${kind} counters from ~${and}`);
  // Firebender Ascension: "Put a quest counter on ~. Then if it has four or more quest counters on it, you may copy that
  // ability": the same check of ~'s counters as it resolves.
  text = text.replace(/^([Pp]ut an? ([a-z]+) counter on ~\.) Then if it has ([a-z]+) or more \2 counters on it, (you may copy that ability\.)/, "$1 If there are $3 or more $2 counters on ~, $4");
  text = text.replace(/^([Pp]ut an? [a-z]+ counter on ~\. If there are [a-z]+ or more [a-z]+ counters on ~, (?:you may )?remove all [a-z]+ counters from ~ and transform) it\.$/, "$1 ~.");
  text = text.replace(/^Choose (up to one target [a-z]+), then (airbend|exile|destroy) all other ([a-z]+)\./, (_, t: string, verb: string, what: string) => `Choose ${t}. ${verb.charAt(0).toUpperCase()}${verb.slice(1)} all other ${what}.`);
  // "Transform ~, then untap it" (Westvale Abbey): the same permanent, now its back face (CR 712.18).
  text = text.replace(/^Transform ~, then untap it\.$/, "Transform ~, then untap ~.");
  text = text.replace(/Choose 1, 2, or 3 at random\. Its controller mills that many cards, then exiles cards from the top of their library until they exile a nonland card with a different name than that spell\. They may cast that card without paying its mana cost\. Then they put the exiled cards on the bottom of their library in a random order\./, `${TIBALT}.`);
  // Nissa's Pilgrimage: "..., reveal those cards, and put one onto the battlefield tapped and the rest into your hand. Then
  // shuffle." is Cultivate's search.
  text = text.replace(/^(Search your library for up to \w+ [^.]+? cards, reveal those cards), and (put one [^.]+? and the rest into your hand)\. Then shuffle\./, "$1, $2, then shuffle.");
  // Out of the Tombs: "put two eon counters on ~, then mill cards equal to the number of eon counters on it": ~ is the
  // only object named, so "it" is ~.
  text = text.replace(/^([Pp]ut [^.~]+ counters? on ~, then [^.~]+ counters on )it\./, "$1~.");
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
  // Cosmos Elixir: "draw a card if your life total is greater than your starting life total. Otherwise, you gain 2 life."
  text = text.replace(/(^|\. )[Dd]raw a card if (you have no cards in hand|your life total is greater than your starting life total)\. Otherwise,/, (_, lead: string, cond: string) => `${lead}If ${cond}, draw a card. Otherwise,`);
  text = text.replace(/An opponent chooses a card at random in your graveyard\. If it's a creature card, put it onto the battlefield\. Otherwise, exile it\./, "Put a card chosen at random from your graveyard onto the battlefield if it's a creature card, otherwise exile it.");
  // Ral, Leyline Prodigy: "Draw a card if you control a blue permanent other than ~": another blue permanent.
  text = text.replace(/\bif you control an? ((?:white|blue|black|red|green) (?:permanent|creature)) other than ~\./g, "if you control another $1.");
  // Ral, Monsoon Mage: "If you win the flip, you may exile ~. If you do, return ~ to the battlefield transformed under ~'s
  // owner's control": one choice, exiling it and returning it (a blink, CR 712.14a); if it's gone by then, nothing happens.
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
  // control" (Brokers Ascendancy, in a trigger): two kinds of counters on two groups, one after the other.
  text = text.replace(/(^|\. )[Pp]ut (an?|one|two|three) ([^.]*?counters?) on (each [^.]+?) and (an?|one|two|three) ([^.]*?counters?) on (each [^.]+?)\./g, "$1Put $2 $3 on $4. Put $5 $6 on $7.");
  // "Search your library for up to four cards with different names and reveal them. Target opponent chooses two of those
  // cards. Put the chosen cards into your graveyard and the rest into your hand. Then shuffle." (Gifts Ungiven), and
  // "Reveal the top three cards of your library. An opponent chooses one of them. Put that card into your graveyard and
  // the rest into your hand." (Murmurs from Beyond): one instruction each, the opponent choosing among the revealed cards.
  text = text.replace(
    /\bSearch your library for ([^.]+?) and reveal them\. (Target opponent|An opponent) chooses (one|two)(?: of (?:them|those cards))?\. Put (?:that card|the chosen cards?) (into your hand|into your graveyard) and the rest (into your hand|into your graveyard|onto the battlefield tapped)(?:\. Then shuffle|, then shuffle)\./g,
    (_, what, who, n, to, rest) => `Search your library for ${what}; ${who.toLowerCase()} chooses ${n}; put them ${to} and the rest ${rest}.`,
  );
  text = text.replace(
    /\bReveal the top (\w+) cards of your library\. (Target opponent|An opponent) chooses (one of (?:them|those cards)|an? [a-z]+ card from among them)\. Put that card (into your hand|into your graveyard|onto the battlefield)(?: and the rest (into your hand|into your graveyard))?(\.|, then )/g,
    (_, n, who, which, to, rest, end) => `Reveal the top ${n} cards of your library; ${who.toLowerCase()} chooses ${which.replace(/ of (?:them|those cards)$/, "")}; put it ${to}${rest ? ` and the rest ${rest}` : ""}.${end === "." ? "" : " Then "}`,
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
  // "Create a token that's a copy of a permanent you control" (Awaken the Maelstrom): not targeted, so chosen as it
  // resolves (CR 608.2d, rulings), the same as "Choose a permanent you control. Create a token that's a copy of it."
  text = text.replace(/(^|\. )Create a token that's a copy of an? (permanent|creature|artifact) you control\./g, "$1Choose a $2 you control. Create a token that's a copy of it.");
  // "Choose target battle. If an opponent protects it, remove a defense counter from it. Otherwise, put a defense counter
  // on it." (Portent Tracker) is one instruction about one battle.
  text = text.replace(/Choose target battle\. If an opponent protects it, remove (a|\w+) defense counters? from it\. Otherwise, put \1 defense counters? on it\./, (_, n: string) => `Remove ${n} defense counter${n === "a" ? "" : "s"} from target battle if an opponent protects it, otherwise put that many on it.`);
  // "Create a Treasure token and exile the top card of that player's library. Until end of turn, you may cast that card."
  // (Ragavan): two instructions, the second an impulse with its permission.
  text = text.replace(/(^|\. )([Cc]reate an? [^.]+? token) and exile the top card of (your|that player's) library\. (?=(?:Until end of turn, )?[Yy]ou may (?:cast|play) that card)/, "$1$2. Exile the top card of $3 library. ");
  // "..., then shuffle and you gain 1 life" (Brokers Hideout): the search, then the life.
  // "Loses two times X life" (Debt to the Deathless) is "loses twice X life".
  text = text.replace(/\bloses two times X life\b/g, "loses twice X life");
  text = text.replace(/, then shuffle and you gain (\d+) life\./g, ", then shuffle. You gain $1 life.");
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
  text = text.replace(/(^|\. )That creature also gains ([^.]+?) until end of turn if (you control [^.,]+)\./, "$1If $3, that creature gains $2 until end of turn.");
  // "Sacrifice another creature. You gain X life and draw X cards, where X is that creature's power." (Disciple of Bolas):
  // with none sacrificed, X is 0 and nothing happens, the same as "If you do, ...".
  text = text.replace(/(^|\. )([Ss]acrifice (?:another|a) creature)\. You ([^.]+, where X is that creature's (?:power|toughness))\./, "$1$2. If you do, you $3.");
  // "You lose 1 life and amass Zombies 1." (Dreadhorde Invasion): two instructions, in that order.
  text = text.replace(/(^|\. )([Yy]ou (?:lose|gain) \d+ life) and (amass [A-Z][a-z]+ \d+)\./, (_, a, b, c) => `${a}${b}. ${capital(c)}.`);
  // "You add {B}{B} and draw a card." (Priest of Forgotten Gods): the same as "Add {B}{B}".
  text = text.replace(/(^|\. )You add ((?:\{[WUBRGC]\})+)(?= and |\.)/, "$1Add $2");
  // "~ deals 2 damage to each other player" (Syphon Soul): with no teams, every other player is an opponent (CR 102.3).
  text = text.replace(/\b(deals \w+ damage to) each other player\b/g, "$1 each opponent");
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
  // "Until end of turn, target creature gains trample and gets +1/+0 for each card you've drawn this turn" (Fists of
  // Flame): both until end of turn, the bonus counted as it resolves (rulings, CR 608.2h).
  text = text.replace(/(^|\. )Until end of turn, target creature gains ([a-z]+) and gets ([+-]\d+\/[+-]\d+) for each ([^.]+)\./, "$1Target creature gains $2 until end of turn. It gets $3 until end of turn for each $4.");
  // "Each creature other than ~ gets -1/-1 until end of turn" (Massacre Girl) is "each other creature".
  text = text.replace(/\b([Ee])ach creature other than ~/g, "$1ach other creature");
  // "Choose any number of target creatures you control. For each of them, create a token that's a copy of that creature,
  // except it has haste." (Twinflame): a copy of each of them.
  text = text.replace(/^Choose any number of target ([^.]+?)\. For each of them, create a token that's a copy of that (?:creature|permanent)(, except [^.]+)?\./, "Create a token that's a copy of each of any number of target $1$2.");
  // "Target creature you control other than ~" (Rosie Cotton) is "another target creature you control"; "each creature you
  // control other than ~" (Dawnstrike Vanguard) is "each other creature you control".
  text = text.replace(/\b([Tt])arget (creature|permanent) you control other than ~/g, (_, t: string, w: string) => `${t === "T" ? "A" : "a"}nother target ${w} you control`);
  text = text.replace(/\beach (creature|permanent) you control other than ~/g, "each other $1 you control");
  // "Each player secretly votes for truth or consequences, then those votes are revealed" is one instruction (a vote whose
  // votes nobody sees until all are made), not two.
  text = text.replace(/\b(secretly votes for [^.]+?), then those votes are revealed\./g, "$1.");
  // Ifrit, Warden of Inferno: "If ~ has three or more lore counters on it, exile it, then return it ...": "it" is ~.
  text = text.replace(/\b(If ~ has [^,.]+ counters on it), exile it, then return it to the battlefield\./, "$1, exile ~, then return it to the battlefield.");
  // Gisa, Glorious Resurrector: "They gain decayed" is about the cards just put onto the battlefield.
  text = text.replace(/([Pp]ut all creature cards exiled with ~ onto the battlefield under your control)\. They gain decayed\./, "$1, and they gain decayed.");
  // "Until your next turn, it gains indestructible." (Hydaelyn) says the same as "It gains indestructible until your next turn."
  text = text.replace(/\bUntil your next turn, it gains ([a-z ]+)\./g, "It gains $1 until your next turn.");
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
    // of Denial) is all conditional.
    // Nor "exile the top two cards of your library, then choose one of them" (Party Thrasher): the choice is of those cards.
    // Nor "you may exile target creature you control, then return that card to the battlefield" (Conjurer's Closet), "...
    // transformed" (Ral, Monsoon Mage): one blink, all of it optional.
    .flatMap((x) => (/^If [^,]+, /.test(x) || / faces? a villainous choice — /.test(x) || /^[Yy]ou may exile [^,]+, then return (?:it|that card) to the battlefield(?: transformed)? under (?:its owner's|your) control\.?$/.test(x) || WHEEL.test(x) || /^(?:\w+ player shuffles (?:their|the cards from their) .+ into their library, then draws|[Ss]huffle the cards from your hand into your library, then draw) /.test(x) || /^The owner of target [^,]+ shuffles it into their library, then reveals the top card of their library\.?$/.test(x) || LIVING_DEATH.test(x) ? [x] : splitOutsideQuotes(x, /, then (?!shuffle|sacrifices the rest$|sacrifices all other creatures they control$|destroy the rest$|meld them into |choose one of them$|exile them again$)/g).map((p, i, all) => (i ? thenPart(thenSubject(all[0]!, p)) : p))))
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
      const m = /^If /.test(x) ? null : /^(.*\b(?:counters? on ~|[Ss]acrifice ~)) and it ((?:gains|gets|can't|deals) .+)$/.exec(x);
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
      const m = /^(~ gets [+-]\d+\/[+-]\d+ until end of turn) and (deals \d+ damage to you)$/.exec(x);
      return m ? [m[1]!, `~ ${m[2]!}`] : [x];
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
  let payFirst: { pay: PayCost; text: string; payX?: { max?: Amount; color?: "W" | "U" | "B" | "R" | "G" }; /** "Pay X life, where X is its power" (Mask of Griselbrand). */ payLife?: AmountExpr } | null = null;
  // "Look at the top four cards of your library" waits for what to do with them (see parseDig).
  let dig: Partial<Extract<Effect, { type: "dig" }>> | null = null;
  // The look's own "where X is ...", for "with mana value X or less" after it (Hatchery Spider).
  let digWhere: AmountExpr | undefined;
  // A look that a "you may pay ... If you do," before it depends on (see payFirst).
  let digPaid: { pay: PayCost; text: string } | null = null;
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
    ctx.afterMill = last?.type === "mill" && last.who.ref === "you";
    if (last?.type === "discard" && last.who.ref === "you" && last.n === 1) ctx.discardedOne = true;
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
      effects.push({ type: "graveyardCastThisTurn", filter: { kind: "card", types: [type], notTypes: [], notColors: [], text: `${yardCast[1]} card` } });
      continue;
    }
    // "{T}: You may cast target Zombie creature card from your graveyard this turn" (Zul Ashur, Lich Lord): a permission
    // for that card, paying its costs and following the normal timing (rulings).
    const yardTarget = /^You may cast (target .+? card) from your graveyard this turn$/.exec(s.replace(/\.$/, ""));
    if (yardTarget) {
      const before = ctx.targets.length;
      const what = parseCardTarget(`${yardTarget[1]} from your graveyard`, ctx, "you");
      const t = ctx.targets[before];
      if (what?.ref !== "target" || ctx.targets.length !== before + 1 || t?.kind !== "card" || !t.types?.length || t.types.includes("Land")) return null;
      effects.push({ type: "mayCastFromGraveyard", what });
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
    // "Sacrifice any number of lands. Search your library for up to that many land cards, put them onto the battlefield
    // tapped, then shuffle." (Scapeshift): the same count.
    const anySac = /^(?:[Yy]ou may )?[Ss]acrifice any number of (other )?(.+)$/.exec(s);
    const thatMany = sentences[si + 1]?.replace(/\.$/, "").replace(/^If you do, /, "") ?? "";
    if (anySac && /\bthat many\b/.test(thatMany) && !/\bthat many\b.*\bthat many\b/.test(thatMany)) {
      const filter = pickFilter(anySac[2]!);
      if (!filter) return null;
      const before = ctx.targets.length;
      const next = parseOne(capital(thatMany.replace(/\bthat many\b/, "X")), ctx);
      if (!next || ctx.targets.length !== before) return null;
      effects.push({ type: "pick", who: { ref: "you" }, filter: anySac[1] ? { ...filter, notSource: true, text: `other ${filter.text}` } : filter, n: 1, action: "sacrifice", anyNumber: true }, ...replaceX(next, { count: { kind: "sacrificedThisWayCount" } }));
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
    const cant = /^Each (player|opponent) who can't discards (a card|two cards)$/.exec(s);
    const pickPrev = effects[effects.length - 1];
    if (cant && pickPrev?.type === "pick" && pickPrev.action === "sacrifice" && pickPrev.who.ref === (cant[1] === "player" ? "eachPlayer" : "eachOpponent") && !pickPrev.unless) {
      effects.push({ type: "discard", who: { ref: "couldntPick" }, n: cant[2] === "a card" ? 1 : 2, random: false });
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
    // "Sacrifice a creature. If you do, ...": only if one was sacrificed (you must if you can, rulings on Victimize).
    const sacDo = /^If you do, (.+)$/.exec(s);
    const sacPrev = effects[effects.length - 1];
    // "Sacrifice ~. If you do, create Marit Lage ..." (Dark Depths): only if it was sacrificed (it may have left already,
    // or be one that can't be sacrificed).
    if (sacDo && !/, where X is /.test(s) && ((sacPrev?.type === "pick" && sacPrev.action === "sacrifice" && sacPrev.who.ref === "you" && sacPrev.n === 1 && !sacPrev.unless) || (sacPrev?.type === "sacrifice" && sacPrev.what.ref === "self" && !sacPrev.byController))) {
      // A target in it ("If you do, return target artifact card from your graveyard to the battlefield", Daretti) is
      // chosen as the ability is put on the stack, like any other (CR 601.2c).
      const back = /^return the chosen cards to the battlefield( tapped)?$/.exec(sacDo[1]!);
      const inner: Effect[] | null = back ? (chosenCards ? [{ type: "putOntoBattlefield", what: chosenCards, ...(back[1] ? { tapped: true } : {}) }] : null) : parseOne(capital(sacDo[1]!), ctx);
      if (!inner) return null;
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: inner });
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
    const sacYou = /^If you sacrificed a creature this way, you may return another permanent card from your graveyard to the battlefield$/.exec(s);
    if (sacYou && sacPrev?.type === "pick" && sacPrev.action === "sacrifice" && sacPrev.who.ref === "eachPlayer" && sacPrev.n === 1 && !sacPrev.unless && sacPrev.filter?.types?.join() === "Creature") {
      const inner = parseOne("Return a permanent card from your graveyard to the battlefield", ctx);
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
    // "Sacrifice a creature. If you can't, sacrifice ~." (Eldrazi Monument): you must if you can, so only when none was.
    const sacCant = /^If you can't, (.+)$/.exec(s);
    if (sacCant && sacPrev?.type === "pick" && sacPrev.action === "sacrifice" && sacPrev.who.ref === "you" && sacPrev.n === 1 && !sacPrev.unless) {
      const before = ctx.targets.length;
      const inner = parseOne(capital(sacCant[1]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
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
    const aboutSelf = si > 0 && /^(?:~ (?:gets|gains|has|becomes)\b|Put [^.]+ counters? on ~$)/.test(sentences[si - 1]!) && !/\b(?:target|it|them)\b/.test(sentences[si - 1]!);
    if (aboutSelf && /^It (?:becomes|gains|gets) /.test(s)) s = s.replace(/^It /, "~ ");
    if (aboutSelf && /^Put [^.]+ counters? on it(?: and |$)/.test(s)) s = s.replace(/ counters? on it\b/, (w) => w.replace(/it$/, "~"));
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
      const spendBefore = si > 0 && /^(?:[Ss]pend this mana only |This mana can't be spent to cast non)/.test(sentences[si - 1]!);
      const added = spendBefore ? spendAdded : allEffects(effects.slice(prevStart)).filter((e): e is Extract<Effect, { type: "addMana" }> => e.type === "addMana");
      if (!added.length || si === 0 || (!spendBefore && /can't be spent/.test(sentences[si - 1]!)) || (!spendBefore && /[Ss]pend this mana only/.test(sentences[si - 1]!))) return null;
      for (const e of added) e.keep = "turn";
      continue;
    }
    // "Add {U}{R}. Spend this mana only to cast instant and sorcery spells" (Abstract Paintmage, CR 106.6): the mana the
    // sentence before added.
    if (/^(?:Spend this mana only |This mana can't be spent to cast non)/.test(s)) {
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
    const youCast0 = /^You may cast (?:that card|it) (for as long as it remains exiled|this turn)(, and mana of any type can be spent to cast (?:that spell|it))?$/.exec(s);
    // "You may cast that card this turn" after something other than an exile (Emry) is read elsewhere.
    const youCast = youCast0 && (youCast0[1] !== "this turn" || effects[effects.length - 1]?.type === "exile") ? youCast0 : null;
    if (youCast) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exile" || prev.linked || prev.ownerMay || prev.youMay || prev.what.ref !== "target" || (prev.what.n ?? 1) !== 1) return null;
      const thisTurn = youCast[1] === "this turn";
      const exileAfter = sentences[si + 1]?.replace(/\.$/, "") === "If that spell would be put into a graveyard, exile it instead";
      if (thisTurn && ctx.targets[prev.what.index]?.kind !== "card") return null;
      prev.youMay = { ...(youCast[2] ? { anyType: true as const } : {}), ...(thisTurn ? { thisTurn: true as const } : {}), ...(exileAfter ? { exileAfter: true as const } : {}) };
      if (exileAfter) si++;
      continue;
    }
    // A tempting offer and the like: "Each opponent may create a Treasure token. For each opponent who does, you create a
    // Treasure token." (Tempting Contract), "each player may put two +1/+1 counters on a creature they control. For each
    // opponent who does, you gain protection from that player until your next turn" (Noble Heritage). Each decides in
    // turn order, then it happens for each who accepted, then the rest for each opponent who did (rulings).
    // Only with "For each ... who does": a plain "each player may" (Will of the Jeskai's wheel) is parsed elsewhere.
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
    const haveYou = /^(?:Then )?([Tt]arget opponent|[Dd]efending player) may have you (.+)$/.exec(s);
    const haveIf = haveYou && /^If (?:the player|that player|they) (doesn't|don't|does|do), (.+)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (haveYou && haveIf) {
      const who = parsePlayer(haveYou[1]!.toLowerCase(), ctx);
      if (!who || who.ref === "you") return null;
      const what = attempt(ctx, () => parseOne(`You ${haveYou[2]!}`, ctx));
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
      effects.push({ type: "eachMay", who, effects: what, text: `have ~'s controller ${haveYou[2]!}` }, { type: "if", cond: { kind: "theyChose", ...(/n't$/.test(haveIf[1]!) ? { not: true as const } : {}) }, effects: then });
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
    const mayLose = mayOut && new RegExp(`^If (?:they|that player|the player) (?:doesn't|don't), (?:they|that player|the player) loses? (\\d+) life$`).exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (mayOut && mayLose) {
      const fx = parseOne(`${mayOut[1]!} loses ${mayLose[1]!} life unless they ${mayOut[2]!}s ${mayOut[3]!}`, ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "punisher") return null;
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
    const thatMay = /^([Tt]hat player|[Tt]hey|[Tt]arget opponent|[Tt]arget player|[Ee]ach opponent) may pay (.+)$/.exec(s);
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
    const thatDo = thatMay && /^If (?:the player|that player|they) (?:does|do), (.+)$/.exec(sentences[si + 1] ?? "");
    if (thatMay && thatDo && /^(?:\{[^}]+\})+$/.test(thatMay[2]!)) {
      const who = parsePlayer(thatMay[1]!.toLowerCase(), ctx);
      const then = parseOne(capital(thatDo[1]!), ctx);
      if (!who || who.ref === "you" || !then || then.some((e) => pauses(e))) return null;
      effects.push({ type: "eachMay", who, effects: [], pay: { mana: thatMay[2]! }, text: `pay ${thatMay[2]!}` }, { type: "if", cond: { kind: "theyChose" }, effects: then });
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
    const exChoose2 = !impulseIf && new RegExp(`^[Ee]xile the top (${NUM}) cards of your library$`).exec(s);
    const playChosen = exChoose2 && /^Choose one of them\.?$/.test(sentences[si + 1] ?? "") ? /^(?:Until (end of turn|the end of your next turn), you may play that card|You may play that card (this turn|until the end of your next turn))\.?$/.exec(sentences[si + 2] ?? "") : null;
    if (exChoose2 && playChosen) {
      effects.push({ type: "impulse", n: amt(exChoose2[1]!), until: /next turn/.test(playChosen[0]) ? "nextTurn" : "thisTurn", choose: true });
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
    // Cunning Rhetoric: "exile the top card of that player's library. You may play that card for as long as it remains
    // exiled, and you may spend mana as though it were mana of any color to cast it." Face up (CR 406.3), a land played
    // as your land play (rulings), mana of any type for a spell (CR 609.4b).
    if (!exTop && !impulseIf && ctx.eventPlayer && /^[Ee]xile the top card of that player's library$/.test(s) && /^You may play that card for as long as it remains exiled(, and you may spend mana as though it were mana of any color to cast it)?$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "impulse", n: 1, until: "exiled", who: { ref: "eventPlayer" }, ...(/any color/.test(sentences[si + 1]!) ? { anyType: true as const } : {}) });
      ctx.exiledTop = true;
      si++;
      continue;
    }
    // Grenzo, Havoc Raiser: "... and you may spend mana as though it were mana of any color to cast that spell" (CR 609.4b).
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
    const playRe = /^(?:(Until the end of your next turn|Until end of turn|Until your next end step), you may play (?:that card|those cards|them|it)|You may play (?:that card|those cards|them|it|cards exiled this way)(?: (this turn|until the end of your next turn|until your next end step)| for as long as (?:it remains|they remain) exiled)?)( without paying its mana cost)?$/;
    const playIt = exTop && sentences[si + 1] && playRe.exec(sentences[si + 1]!.replace(/\.$/, ""));
    // "Exile the top card of your library. ~ gets +X/+0 until end of turn, where X is that card's mana value. You may play
    // that card this turn." (Tavern Brawler, Daredevil): the permission and the sentence between, about that card.
    const playAfter = exTop && !exTop[1] && !playIt && sentences[si + 2] && /\b(?:that|the exiled) card's mana value\b/.test(sentences[si + 1] ?? "") ? playRe.exec(sentences[si + 2]!.replace(/\.$/, "")) : null;
    if (playAfter && !impulseIf && !playAfter[3]) {
      const when = (playAfter[1] ?? playAfter[2] ?? "").toLowerCase();
      effects.push({ type: "impulse", n: 1, until: !when ? "exiled" : /next end step/.test(when) ? "yourNextEndStep" : /next turn/.test(when) ? "nextTurn" : "thisTurn" });
      ctx.exiledTop = true;
      sentences.splice(si + 2, 1);
      continue;
    }
    if (exTop && !exTop[1]) ctx.exiledTop = true;
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
    if (exTop && playIt) {
      const when = (playIt[1] ?? playIt[2] ?? "").toLowerCase();
      const free = playIt[3] ? { free: true as const } : {};
      if (free.free && (exTop[1] || exEqualN || impulseIf)) return null;
      const impulse: Effect = { type: "impulse", n: exEqualN ?? (exTop[1] ? amt(exTop[1]) : 1), until: !when ? "exiled" : /next end step/.test(when) ? "yourNextEndStep" : /next turn/.test(when) ? "nextTurn" : "thisTurn", ...free };
      // Ignite the Future: "If this spell was cast from a graveyard, you may play cards this way without paying their mana
      // costs": then each may be cast for its mana cost, an alternative cost, or without paying its mana cost (rulings).
      const freeIf = !free.free && !impulseIf && ctx.spell && /^If ~ was cast from a graveyard, you may play cards this way without paying their mana costs\.?$/.test(sentences[si + 2] ?? "");
      if (freeIf) {
        effects.push({ type: "if", cond: { kind: "castFromGraveyard" }, effects: [{ ...impulse, free: true, orPay: true }], otherwise: [impulse] });
        si += 2;
        continue;
      }
      effects.push(impulseIf && !impulseIf.not ? { type: "if", cond: impulseIf.cond, effects: [impulse] } : impulse);
      si++;
      continue;
    }
    // "Exile all cards from your hand, then draw that many cards. Until the end of your next turn, you may play cards exiled
    // this way." (Invasion of Kaldheim): face up (CR 406.3), each card's permission its own (CR 400.7).
    // "Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one" (Valakut
    // Awakening, Into the Fire).
    // "Discard any number of cards, then draw that many cards plus one" (Celes, Brass's Tunnel-Grinder), "You may discard
    // up to two cards. If you do, draw that many cards." (Fable of the Mirror-Breaker): none up to that many, chosen as it
    // resolves (CR 107.1c); "that many" is how many were discarded.
    const anyDiscard = /^(?:([Yy]ou may) d|[Dd])iscard (any number of|up to two|up to three) cards$/.exec(s);
    const drawThat = anyDiscard && /^(If you do, d|D)raw that many cards( plus one)?$/.exec(sentences[si + 1] ?? "");
    if (anyDiscard && drawThat && !!anyDiscard[1] === !!drawThat[1]?.startsWith("If")) {
      const max = anyDiscard[2] === "any number of" ? 99 : num(anyDiscard[2]!.slice(6));
      effects.push({ type: "discard", who: { ref: "you" }, n: max, upTo: true }, { type: "draw", who: { ref: "you" }, n: { count: { kind: "discardedThisWay", who: { ref: "you" } }, ...(drawThat[2] ? { plus: 1 } : {}) } });
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
    if (/^[Ee]xile all cards from your hand$/.test(s) && /^Draw that many cards$/.test(sentences[si + 1] ?? "") && /^Until the end of your next turn, you may play cards exiled this way$/.test(sentences[si + 2] ?? "")) {
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
    const castAmong = castAmongHead && /^You may (?:play lands and )?cast (?:(any number of|up to two|an?) )?(?:(instant or sorcery|instant and sorcery|sorcery|instant) )?spells?(?: with (total )?mana value (\d+|X) or less)? from among (?:them|cards exiled this way) without paying (?:their mana costs|its mana cost)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
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
      const types = kinds ? (kinds === "sorcery" ? ["Sorcery"] : kinds === "instant" ? ["Instant"] : ["Instant", "Sorcery"]) : undefined;
      const filter: TargetSpec | undefined = types ? { kind: "card", types: types as TargetSpec["types"] & string[], notTypes: [], notColors: [], text: `${kinds} card` } : undefined;
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
            : /^Put the exiled cards not cast this way on the bottom of your library in a random order$/.test(restText)
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
    const castTarget = /^[Yy]ou may cast (target .+? card(?: with .+?)? from your graveyard) without paying its mana cost$/.exec(s);
    if (castTarget) {
      const rider = sentences[si + 1]?.replace(/\.$/, "");
      const exileAfter = rider === "If that spell would be put into your graveyard, exile it instead" ? (true as const) : rider === "If an instant or sorcery spell cast this way would be put into your graveyard, exile it instead" ? ("instantOrSorcery" as const) : undefined;
      const before = ctx.targets.length;
      const what = parseCardTarget(castTarget[1]!, ctx, "you");
      const t = ctx.targets[before];
      // A land card can't be cast (CR 305.9).
      if (!what || !exileAfter || ctx.targets.length !== before + 1 || t?.kind !== "card" || !t.types?.length || t.types.includes("Land")) return null;
      effects.push({ type: "castTargetFree", what, exileAfter });
      si++;
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
    const eachYard = /^For each player, choose an? (.+? card) in that player's graveyard$/.exec(s);
    if (eachYard && /^Put those cards onto the battlefield under your control$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const filter = parseSearchFilter(eachYard[1]!);
      if (!filter?.types?.length || filter.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
      effects.push({ type: "chooseFromGraveyard", n: 1, dest: "battlefield", filter, who: { ref: "eachPlayer" }, youChoose: true });
      si++;
      continue;
    }
    // "Look at the top three cards of target player's library, then put them back in any order." The player
    // looking orders them (CR 401.4 lets nobody else see them). "You may shuffle." after it is a choice to shuffle.
    const order = new RegExp(`^(You may )?[Ll]ook at the top ${NUMX} cards of (your|target player's|target opponent's) library$`).exec(s);
    if (order && /^[Pp]ut them back in any order$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      const who = parsePlayer(order[3] === "your" ? "you" : order[3]!.replace(/'s$/, ""), ctx);
      if (!who) return null;
      const e: Effect = { type: "orderTop", who, n: amt(order[2]!) };
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
    const atRandom = /^[Rr]eveal a card at random from your hand$/.test(s);
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
    // Essence Flux: "Exile target creature you control, then return that card to the battlefield under its owner's
    // control. If it's a Spirit, put a +1/+1 counter on it.": checked once it has returned (rulings).
    const fluxIf = /^If it's an? ([A-Z][a-z]+), put a \+1\/\+1 counter on it$/.exec(s);
    if (fluxIf) {
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
    const ifIts = /^If it's (not )?an? ([a-z]+(?: [a-z]+)?), (.+)$/.exec(s);
    if (ifIts) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      const typed = parseTargetPhrase(ifIts[2]!);
      const known = typed?.kind === "object" && Object.entries(typed).every(([k, v]) => v === undefined || ["kind", "types", "allTypes", "notTypes", "notColors", "text"].includes(k));
      const types = typed?.kind === "object" ? [...(typed.types ?? []), ...(typed.allTypes ?? [])] : [];
      // Anything else is left to the readings below (Carbonize's "If it's a creature, it can't be regenerated ...").
      if (t?.kind === "object" && !t.optional && !t.many && known && prev && ["untap", "tap", "counters", "continuous"].includes(prev.type) && mentionsTarget(prev, i) && (!ifIts[1] || types.length === 1) && !/,/.test(ifIts[3]!)) {
        const fx = parseOne(ifIts[3]!.charAt(0).toUpperCase() + ifIts[3]!.slice(1), ctx);
        if (!fx || ctx.targets.length !== i + 1 || !fx.every((e) => mentionsTarget(e, i))) return null;
        const filter: TargetSpec = ifIts[1] ? { kind: "object", types: [], notTypes: types, notColors: [], text: `not ${ifIts[2]}` } : { ...typed, text: ifIts[2]! };
        effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter }, effects: fx });
        continue;
      }
    }
    // Hydaelyn, the Mothercrystal: "Put a +1/+1 counter on another target creature you control. ... If that creature is
    // legendary, draw a card." The target as it is as this resolves (CR 608.2c); the instruction needn't be about it.
    const ifLegendary = /^If (?:it's|that creature is|that permanent is) legendary, (.+)$/.exec(s);
    if (ifLegendary) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      if (t?.kind !== "object" || t.optional || t.many || !prev || !mentionsTarget(prev, i)) return null;
      const fx = parseOne(capital(ifLegendary[1]!), ctx);
      if (!fx || ctx.targets.length !== i + 1 || fx.some((e) => pauses(e))) return null;
      effects.push({ type: "if", cond: { kind: "targetIs", index: i, filter: { kind: "object", types: [], notTypes: [], notColors: [], supertypes: ["Legendary"], text: "legendary" } }, effects: fx });
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
    const rider = toCreature ? { dealBack: { creatureToIt: true as const } } : tokenRider?.type === "createToken" ? { tokens: tokenRider.token } : parsePreventionRider(s);
    if (rider) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "damageRule" || prev.rule.redirect) return null;
      effects[effects.length - 1] = { ...prev, rule: { ...prev.rule, ...rider } };
      continue;
    }
    // Elite Spellbinder, Invasion of Gobakhan: "Look at target opponent's hand. You may exile a nonland card from it. For
    // as long as that card remains exiled, its owner may play it. A spell cast this way costs {2} more to cast." You
    // choose one or none among those you looked at (CR 402.3); the permission is the owner's, for that card in exile.
    const mayExile = /^You may exile an? (.+?) from it$/.exec(s);
    if (mayExile) {
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(mayExile[1]!);
      if (prev?.type !== "lookAtHand" || filter === null) return null;
      const take: Effect = { type: "takeFromHand", who: prev.who, ...(filter ? { filter } : {}), action: "exile", optional: true };
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
    // "Target opponent reveals their hand. You may choose a creature or battle card from it. If you do, that player
    // discards that card. If you don't, incubate 3." (Traumatic Revelation): one or none (rulings), then what follows
    // depends on which.
    const mayChoose = /^You may choose an? (.+?) from it$/.exec(s);
    if (mayChoose) {
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(mayChoose[1]!);
      if (prev?.type !== "lookAtHand" || filter === null) return null;
      const next = sentences[si + 1] ?? "";
      const act = /^(?:If you do, )?(?:(that player discards that card|they discard it)(?:, then (?:they )?draws? a card)?|(?:that player exiles|exile) that card)$/i.exec(next);
      if (!act || (/^If you do, (?:that player exiles|exile)/.test(next) && /^If a /.test(sentences[si + 2] ?? ""))) return null;
      effects.push({ type: "takeFromHand", who: prev.who, ...(filter ? { filter } : {}), action: act[1] ? "discard" : "exile", optional: true });
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
    const choose = /^You choose an? (.+?) from it( with mana value \d+ or (?:less|greater))?( and exile that card)?$/.exec(s);
    if (choose) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "lookAtHand" || !prev.reveal) return null;
      // Lost Hours: "That player puts that card into their library third from the top."
      const then = choose[3] ? "exile" : /^(?:That player discards that card|(?:That player exiles|Exile) that card( until ~ leaves the battlefield)?|That player puts that card into their library third from the top)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (!then) return null;
      // "Exile that card until ~ leaves the battlefield" (Kitesail Freebooter, CR 610.3): only an ability of a permanent.
      const until = typeof then !== "string" && !!then[1];
      if (until && opts.spell) return null;
      const filter = parseSearchFilter(`${choose[1]}${choose[2] ?? ""}`);
      if (filter === null) return null;
      effects.push({ type: "takeFromHand", who: prev.who, ...(filter ? { filter } : {}), action: typeof then !== "string" && /discards/.test(then[0]) ? "discard" : typeof then !== "string" && /third from the top/.test(then[0]) ? "libraryThird" : "exile", ...(until ? { until: "sourceLeaves" as const } : {}) });
      if (!choose[3]) si++;
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
    const look = new RegExp(`^(Look at|Reveal) the top ${NUMX} cards? of your library(?:, where X is (.+))?$`, "i").exec(s);
    if (look && !dig && (!look[3] || look[2] === "X")) {
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
    // Armored Skyhunter: the one card put onto the battlefield, if it's an Equipment.
    if (dig?.into === "battlefield" && dig.count === 1 && !afterDig.length && /^If an Equipment is put onto the battlefield this way, you may attach it to a creature you control$/.test(s)) {
      afterDig = [{ type: "attachToChosen", source: { ref: "created" }, filter: { kind: "object", types: ["Creature"], controller: "you", text: "a creature you control" }, may: true, equipmentOnly: true }];
      continue;
    }
    if (dig) {
      const done = parseDig(s, dig, ctx, digWhere);
      if (!done) return null;
      if (done === "more") continue;
      if (digPaid) effects.push({ type: "may", effects: [done], pay: digPaid.pay, text: digPaid.text });
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
      const then = /^If you do, (.+)$/.exec(s);
      if (!then) return null;
      // Mask of Griselbrand: "If you do, draw X cards", the X of the life paid; that sentence alone.
      if (payFirst.payLife) {
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
      // "If you do, create a 2/2 black Zombie Berserker creature token, then attach ~ to it": both parts depend
      // on the payment, in order.
      const inner =
        attempt(ctx, () => parseOne(cap(then[1]!), ctx)) ??
        attempt(ctx, () => {
          const parts = then[1]!.split(/, then (?!shuffle)/);
          if (parts.length < 2) return null;
          const all: Effect[] = [];
          for (const p of parts) {
            const fx = parseOne(cap(p), ctx);
            if (!fx) return null;
            all.push(...fx);
          }
          return all;
        });
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "may", effects: inner, pay: payFirst.pay, text: `${payFirst.text}. If you do, ${then[1]}`, ...(payFirst.payX ? { payX: payFirst.payX } : {}) });
      payFirst = null;
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
    // "You may pay X life, where X is its power" (Mask of Griselbrand): counted as it resolves (CR 608.2h).
    const payLifeX = /^[Yy]ou may pay X life, where X is (.+)$/.exec(s);
    if (payLifeX) {
      const n = parseCount(payLifeX[1]!, ctx);
      if (!n || typeof n !== "object" || !("count" in n)) return null;
      payFirst = { pay: {}, payLife: n, text: `pay X life, where X is ${payLifeX[1]}` };
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
    // "Exile target card from a graveyard. If it was a creature card, ..." (Scavenging Ooze, Cling to Dust, Deluge of the
    // Dead): about the card the instruction before exiled, by its characteristics in the graveyard, which are its printed
    // ones (CR 608.2h). A target that's illegal by then stops the whole ability (rulings), so it never gets here.
    const wasCard = /^If it was an? ((?:[a-z]+ )?[a-z]+) card, (.+)$/.exec(s);
    if (wasCard) {
      const i = ctx.targets.length - 1;
      const t = ctx.targets[i];
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(`${wasCard[1]!} card`);
      if (!t || t.kind !== "card" || t.many || t.optional || prev?.type !== "exile" || prev.what.ref !== "target" || prev.what.index !== i || !filter) return null;
      const inner = parseOne(wasCard[2]!.charAt(0).toUpperCase() + wasCard[2]!.slice(1), ctx);
      if (!inner || ctx.targets.length !== i + 1 || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "targetCardWas", index: i, filter }, effects: inner });
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
    // "Counter target spell if it's blue", "Destroy target permanent if it's blue" (Pyroblast): any spell or permanent can
    // be targeted, and its color is checked as it resolves (rulings).
    const ifColor = /^(.+) if it's (white|blue|black|red|green)$/.exec(s);
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
      if (!fx || (howCast.not && fx.instead) || (howCast.noTargets && ctx.targets.length !== curTargets)) return null;
      if (howCast.ofTarget) {
        // "Counter target spell if no mana was spent to cast it": the one target spell this sentence chose.
        const spell = ctx.targets.length === curTargets + 1 && ctx.targets[curTargets]!.kind === "spell";
        if (!spell || fx.instead || howCast.cond.kind !== "spent") return null;
        howCast.cond.target = curTargets;
      } else if (!howCast.ungated && !gateNewTargets(ctx, howCast.cond, howCast.not, fx, effects.slice(prevStart), prevTargets, curTargets)) return null;
      if (howCast.not) effects.push({ type: "if", cond: howCast.cond, effects: [], otherwise: fx.effects });
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
    const double = /^[Dd]ouble (?:(its|target creature's) power( and toughness)?|the power( and toughness)? of (target creature(?: you control)?)) until end of turn$/.exec(s);
    const doubleBoth = !!double && !!(double[2] ?? double[3]);
    if (double) s = `${double[1] === "its" ? "It" : double[4] ? double[4].charAt(0).toUpperCase() + double[4].slice(1) : "Target creature"} gets +X/+0 until end of turn, where X is its power`;
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
    ctx.whereX = !!where;
    const before = effects.length;
    const targetsBefore = ctx.targets.length;
    const defineX = () => {
      if (!where) return true;
      // "X damage divided as you choose ..., where X is the number of Mountains you control as you cast this spell": the
      // amount is worked out as the targets are chosen, while it's being cast, anyway (TargetSpec.divided.amount).
      const asCast = / as you (?:cast ~|cast this spell|activate this ability)$/.exec(where[2]!);
      const added = effects.slice(before);
      const dividedOnly = added.length === 1 && added[0]!.type === "damage" && !!added[0]!.divided && ctx.targets.slice(targetsBefore).some((t) => t.divided?.amount);
      // Otherwise this spell's own amount, counted once as it's cast (Count asCast; rulings on Lifestream's Blessing).
      const castOnce = asCast && !dividedOnly && ctx.spell && /^ as you cast (?:~|this spell)$/.test(asCast[0]);
      if (asCast && !dividedOnly && !castOnce) return false;
      // "~ deals X damage ..., where X is the number of age counters on it" (Magmatic Core): "it" is ~.
      const what = /^~ /.test(s) ? where[2]!.replace(/ counters on it$/, " counters on ~") : where[2]!;
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
    // "You may discard a card. If you do, draw a card." (CR 608.2c): what follows depends on whether it was
    // done. Only for things the engine can tell weren't possible (discarding with no cards in hand, ...).
    // "Exile target creature. Return that card to the battlefield under its owner's control at the beginning of
    // the next end step": the exile becomes a blink that comes back with a delayed trigger (CR 603.7).
    // "Exile any number of target creatures you control. Return those cards ..." (Eerie Interlude), "Exile all creatures. At
    // the beginning of the next end step, return those cards to the battlefield under their owners' control" (Planar
    // Guide), "... return it to the battlefield tapped ..." (Mystifying Maze), "... with a flying counter on it" (Salvation
    // Swan); after "you may exile ~ target creature", "If you do, return that card ..." (Astral Slide).
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
      for (let i = effects.length - 1; i >= prevStart && i >= 0; i--) if (effects[i]!.type === "exile") return { into: effects, at: i };
      return null;
    })();
    if (later && laterAt) {
      const ex = laterAt.into[laterAt.at] as Extract<Effect, { type: "exile" }>;
      if (ex.until || ex.linked || (ex.what.ref === "target" && ex.what.sameName) || (ex.what.ref !== "target" && ex.what.ref !== "each" && ex.what.ref !== "self")) return null;
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
    const those = /^(Prevent all (?:combat )?damage that would be dealt (?:to and dealt by|to|by)) those (?:permanents|creatures) this turn$/.exec(s);
    if (those) {
      const last = effects[effects.length - 1];
      const p = parsePreventAll(`${those[1]} them`);
      if (last?.type !== "continuous" || last.what.ref !== "each" || last.duration !== "endOfTurn" || !p) return null;
      effects.push({ type: "continuous", what: last.what, mods: [p.mod], duration: "endOfTurn" });
      continue;
    }
    const haste = /^(?:That creature|It) gains haste( until end of turn)?$/.exec(s);
    const atEnd = /^(Exile|Sacrifice) (?:it|that creature|the creature) at the beginning of the next end step$/.exec(s) ?? /^(Return) (?:it|that creature) to your hand at the beginning of the next end step$/.exec(s) ?? (/^Return it to the command zone at the beginning of the next end step$/.test(s) ? ["", "Return to the command zone"] : null);
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
      const only = both.length === 1 && both[0]!.type === "may" && both[0]!.effects.length === 1 ? both[0]!.effects[0] : undefined;
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
    const eachMayChoose = /^[Ss]tarting with you, each player may choose an? (.+)$/.exec(s);
    if (eachMayChoose) {
      if (ctx.vote) return null;
      const spec = parseTargetPhrase(eachMayChoose[1]!);
      if (spec?.kind !== "object" || spec.chosen || spec.counter) return null;
      effects.push({ type: "vote", among: { ...spec, text: eachMayChoose[1]! }, choose: true, text: `choose ${/^[aeiou]/i.test(eachMayChoose[1]!) ? "an" : "a"} ${eachMayChoose[1]}` });
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
    const choosesWord = /^[Ee]ach (opponent|player) chooses (?:([a-z]+), )?([a-z]+),? or ([a-z]+)$/.exec(s);
    if (choosesWord) {
      const options = choosesWord.slice(2).filter((w): w is string => !!w);
      if (ctx.chooseWords || ctx.vote || new Set(options).size !== options.length) return null;
      effects.push({ type: "eachChooses", who: { ref: choosesWord[1] === "opponent" ? "eachOpponent" : "eachPlayer" }, options, text: `choose ${options.length > 2 ? `${options.slice(0, -1).join(", ")}, or ${options.at(-1)}` : options.join(" or ")}` });
      ctx.chooseWords = options;
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
    const ifDestroyed = /^If a creature is destroyed this way, (.+)$/.exec(s);
    if (ifDestroyed) {
      const prev = effects[effects.length - 1];
      const destroy = prev?.type === "may" && prev.effects.length === 1 ? prev.effects[0] : prev;
      if (destroy?.type !== "destroy" || destroy.what.ref !== "target" || ctx.targets[destroy.what.index]?.types?.join() !== "Creature") return null;
      const then = ifDestroyed[1]!.replace(/\bits\b/g, "that creature's");
      const inner = parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "destroyedThisWay" }, effects: inner });
      continue;
    }
    // "Discard a card at random. If an artifact card was discarded this way, ~ deals 2 damage to each opponent" (Reckless
    // Handling): checked against the card this resolution's discard put into the graveyard (CR 701.9a).
    const ifDiscarded = /^If an? (.+? card) was discarded this way, (.+)$/.exec(s);
    if (ifDiscarded) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "discard") return null;
      const filter = parseSearchFilter(ifDiscarded[1]!);
      const then = ifDiscarded[2]!;
      const inner = filter && parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
      if (!filter || !inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "discardedThisWayIs", filter }, effects: inner });
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
    const ifWin = /^If you win, (.+)$/.exec(s);
    if (ifWin) {
      const clashed = (es: Effect[]): boolean => es.some((e) => e.type === "clash" || (e.type === "may" && clashed(e.effects)));
      const inner = clashed(effects) && parseOne(ifWin[1]!.charAt(0).toUpperCase() + ifWin[1]!.slice(1), ctx);
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
    const milledRepeat = /^If an? ([A-Za-z]+ card) was milled this way, (.+) and repeat this process$/.exec(s);
    if (milledRepeat) {
      const filter = parseSearchFilter(milledRepeat[1]!);
      const then = parseOne(capital(milledRepeat[2]!), ctx);
      if (!filter || !then || then.some((e) => pauses(e)) || effects.length < 1 || effects[effects.length - 1]!.type !== "mill" || effects.some((e) => pauses(e)) || si + 1 !== sentences.length) return null;
      effects.splice(0, effects.length, { type: "repeatIf", effects: [...effects], cond: { kind: "milledIs", filter }, then });
      continue;
    }
    const ifMilled = /^If a card with the chosen name was milled this way, (.+)$/.exec(s) ?? /^If an? ((?:[A-Za-z]+, )?[A-Za-z]+ card) (?:is|was) milled this way, (.+)$/.exec(s);
    if (ifMilled) {
      const then = ifMilled[ifMilled.length - 1]!;
      const filter: TargetSpec | null = ifMilled.length === 2 ? { kind: "card", chosen: "name", text: "card with the chosen name" } : (parseSearchFilter(ifMilled[1]!.replace(/, (?=non)/, " ")) ?? null);
      // The mill just before, or another "if ... milled this way" after it.
      let back = effects.length - 1;
      while (back >= 0 && effects[back]!.type === "if" && (effects[back] as { cond: SpellCondition }).cond.kind === "milledIs") back--;
      const prev = effects[back];
      // Not "its mana value" (Lammastide Weave): which card that is isn't kept.
      if (!filter || prev?.type !== "mill" || /\b(?:it|its)\b|\brepeat\b/.test(then)) return null;
      const inner = parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "milledIs", filter }, effects: inner });
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
    const putThisWay = /^If you put an? ([A-Z][a-z]+|[a-z]+) onto the battlefield this way, (.+)$/.exec(s);
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
    // Yenna, Redtooth Regent: "Create a token that's a copy of it, except it isn't legendary. If the token is an Aura, untap
    // ~, then scry 2": the token as it is now.
    const tokenIs = /^If the token is an? ([A-Z][a-z]+), (.+)$/.exec(s);
    if (tokenIs) {
      const last = effects[effects.length - 1];
      const filter = parseTargetPhrase(tokenIs[1]!);
      const inner = parseOne(capital(tokenIs[2]!), ctx);
      if (last?.type !== "createTokenCopy" || last.each || last.n !== 1 || filter?.kind !== "object" || !inner || /(?:it|its|that)/.test(tokenIs[2]!)) return null;
      effects.push({ type: "if", cond: { kind: "putThisWayIs", filter }, effects: inner });
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
    const perThisWay = /^For each (.+?) (destroyed|exiled|put into a graveyard) this way, its controller (creates an? .+ token(?: with [a-z ]+)?|draws a card)$/.exec(s);
    if (perThisWay) {
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
      effects.push({ type: "forEachThisWay", which, ...(graveyard ? { graveyard: true as const } : {}), filter: { ...spec, text: perThisWay[1]! }, effects: [{ ...one, who: { ref: "eachOne" } }] });
      continue;
    }
    // "Mill three cards. You may put a land card from among them into your hand." (Six, Eerie Gravestone), "... from among
    // the cards milled this way ..." (Blanchwood Prowler), "You may put an instant or sorcery card milled this way into
    // your hand" (Leyline Dowser): one of the cards your mill just put into your graveyard, if any matches.
    // "Put up to two creature cards from among the milled cards onto the battlefield" (The Grand Evolution): under your
    // control, chosen as it resolves.
    const fromMilled =
      /^[Yy]ou may put (an? .+?|up to (?:one|two|three|four|five) .+? cards) from among (?:them|the cards milled this way|the milled cards|those cards) into your hand$/.exec(s) ?? /^[Yy]ou may put (an? .+?) milled this way into your hand$/.exec(s) ?? /^Put (up to (?:one|two|three|four|five) .+? cards) from among (?:them|the cards milled this way|the milled cards|those cards) (onto the battlefield)(?: under your control)?$/.exec(s);
    if (fromMilled) {
      const prev = effects[effects.length - 1];
      // "Up to two creature and/or land cards from among the milled cards" (Smuggler's Surprise).
      const upTo = /^up to (\w+) (.+) cards$/.exec(fromMilled[1]!);
      const filter = parseSearchFilter(upTo ? `${upTo[2]!.replace(/ and\/or /g, " or ")} card` : fromMilled[1]!.replace(/^an? /, ""));
      if (prev?.type !== "mill" || prev.who.ref !== "you" || filter === null) return null;
      effects.push({ type: "chooseFromGraveyard", n: upTo ? num(upTo[1]!) : 1, upTo: true, milled: true, ...(filter ? { filter } : {}), ...(fromMilled[2] ? { dest: "battlefield" as const } : {}) });
      // "If you don't, put a +1/+1 counter on this creature." (Ainok Wayfarer): no card was put into your hand.
      const didnt = /^If you don't, (.+)$/.exec(sentences[si + 1] ?? "");
      if (didnt) {
        const inner = parseOne(capital(didnt[1]!), ctx);
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
    const otherwise = /^Otherwise, (.+)$/.exec(s);
    if (otherwise) {
      const prev = effects[effects.length - 1];
      // "If you have no cards in hand, draw a card. Otherwise, discard a card." (Flubs, the Fool): checked as it resolves.
      // "If your life total is greater than your starting life total, draw a card. Otherwise, you gain 2 life." (Cosmos Elixir).
      // "If you control a Demon, each opponent loses 2 life and you gain 2 life. Otherwise, you lose 2 life." (Unholy Annex).
      const stateElse = prev?.type === "if" && prev.cond.kind === "state" && (prev.cond.cond.kind === "subjectPT" || prev.cond.cond.kind === "noneInHand" || prev.cond.cond.kind === "life" || prev.cond.cond.kind === "control");
      if (prev?.type !== "if" || (prev.cond.kind !== "wonClash" && prev.cond.kind !== "suspected" && prev.cond.kind !== "milledIs" && prev.cond.kind !== "targetCardWas" && !stateElse) || prev.otherwise) return null;
      const inner = parseOne(otherwise[1]!.charAt(0).toUpperCase() + otherwise[1]!.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      prev.otherwise = inner;
      continue;
    }
    // "You may collect evidence 3. When you do, put a +1/+1 counter on target creature you control": a reflexive
    // trigger (CR 603.12), with targets of its own chosen as it's put on the stack. The rest of the ability is its.
    const whenDo = /^When you do, (.+)$/.exec(s);
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
      const always = (prev?.type === "amass" || prev?.type === "revealFromHand" || prev?.type === "tapAnyNumber" || (prev?.type === "earthbend" && ctx.targets.length === 1 && ctx.spell)) && effects.length === 1;
      if (!rolled && !counted && !mayDo && !sacSelf && !milled && !created && roleOn === undefined && !returned && !sacrificing && !always) return null;
      // Its own "where X is ..." goes with it.
      let whenText = [where ? `${whenDo[1]!}, where X is ${where[2]!}` : whenDo[1]!, ...sentences.slice(si + 1)].join(". ");
      // "Tap any number of untapped artifacts you control. When you do, this Saga deals that much damage to target
      // creature" (Yotia Declares War): one damage for each one tapped.
      if (prev?.type === "tapAnyNumber") whenText = whenText.replace(/\bdeals that much damage to\b/, "deals damage equal to the number of permanents tapped this way to");
      si = sentences.length;
      // What the "you may" sacrificed, if the reflexive trigger is about it.
      const sacPick = mayDo && prev.effects.length === 1 && prev.effects[0]!.type === "pick" && prev.effects[0]!.action === "sacrifice";
      // "Put a quest counter on ~. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target
      // creature you control." (Earthbender Ascension): an intervening "if" (CR 603.4), checked as the reflexive ability
      // triggers and again as it resolves.
      const ifHas = counted ? new RegExp(`^if it has ${NUM} or more ${COUNTER} counters on it, (.+)$`).exec(whenText) : null;
      const ifHasCond = ifHas ? parseStaticCondition(`~ has ${ifHas[1]!} or more ${ifHas[2]!} counters on it`, { affects: { kind: "self" }, mods: [], text: "" }) : null;
      if (ifHas && !ifHasCond) return null;
      const reflexive = reflexiveBody(ifHas ? ifHas[3]! : whenText, ctx, sacPick || sacrificing, roleOn !== undefined || returned);
      if (!reflexive) return null;
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
      if (created || always) {
        effects.push({ type: "reflexive", body: reflexive });
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
    const isAlso = /^(?:That creature is|It's|It is|Each of them is) (an? .+ in addition to its other (?:colors and )?types)$/.exec(s);
    if (isAlso) {
      const prev = effects[effects.length - 1];
      const mods = parseBecomes(isAlso[1]!);
      // Ghost Vacuum: "Each of them is a 1/1 Spirit ...": the cards it put onto the battlefield.
      if (prev?.type === "moveLinked" && /^Each of them/.test(s)) {
        if (prev.dest !== "battlefield" || !mods || prev.alsoMods) return null;
        prev.alsoMods = mods;
        continue;
      }
      if (/^Each of them/.test(s)) return null;
      if (prev?.type === "returnDiedThisWay" && mods && !prev.alsoMods) {
        prev.alsoMods = mods;
        continue;
      }
      if (prev?.type !== "putOntoBattlefield" || !mods || (prev.what.ref === "target" && prev.what.n) || prev.alsoMods) return null;
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
      // "You may ... If you do, X. If you don't, Y." (Slicer, Hired Muscle): Y is the other branch of the same check.
      const before = effects[effects.length - 2];
      if (ifDid[1] === "don't" && prev?.type === "if" && prev.cond.kind === "youDid" && prev.effects.length && !prev.otherwise && before?.type === "may" && !before.pay && before.effects.every(checkableMay)) {
        const inner = parseOne(capital(ifDid[2]!), ctx);
        if (!inner) return null;
        prev.otherwise = inner;
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
      const sacIt = sacPick && /\b(?:that|the sacrificed) creature's (?:power|toughness|mana value)\b/.test(all) && !/\bthat creature(?!'s (?:power|toughness|mana value)\b)/.test(all) && !ctx.sacrificedIt;
      if (sacIt) ctx.sacrificedIt = true;
      // Party Thrasher: "If you do, exile the top two cards of your library, then choose one of them. You may play that
      // card this turn." The permission is about the card chosen, so it depends on the discard too.
      const choosePlay = ifDid[1] === "do" && /^You may play that card this turn$/.test(sentences[si + 1] ?? "") ? new RegExp(`^exile the top (${NUM}) cards of your library, then choose one of them$`).exec(ifDid[2]!) : null;
      if (choosePlay) si++;
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
      const inner = choosePlay ? [{ type: "impulse" as const, n: amt(choosePlay[1]!), until: "thisTurn" as const, choose: true as const }] : parseOne(ifDid[2]!.charAt(0).toUpperCase() + ifDid[2]!.slice(1), ctx);
      if (inner) effects.push(ifDid[1] === "do" ? { type: "if", cond: { kind: sacIt || mustSac ? "sacrificedThisWay" : "youDid" }, effects: inner } : { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner });
      // Its own "where X is ..." (CR 107.3c).
      const ok = !!inner && defineX();
      if (sacIt) delete ctx.sacrificedIt;
      if (!ok) return null;
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
    const trailIf = !insteadIf ? /^((?:[Dd]raw|(?:[Yy]ou )?[Cc]reate|[Yy]ou gain|[Ee]ach opponent loses|[Pp]ut|[Tt]arget [^,]+ gets) .+) if ((?!it\b|~|that\b(?! player (?:has|controls) more [a-z ]+ than each other player$)|they\b|able\b)[^,]+)$/.exec(s) : null;
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
    const trailPT = !ctx.spell && !ctx.subjectIt ? new RegExp(`^(.+) if (~'s|its) (power|toughness) is ${NUM} or (greater|less)$`).exec(s) : null;
    const leadPT = !ctx.spell && !ctx.subjectIt && !trailPT ? new RegExp(`^If (~'s|its) (power|toughness) is ${NUM} or (greater|less), (.+)$`).exec(s) : null;
    const selfPTIf = trailPT ? { then: trailPT[1]!, whose: trailPT[2]!, stat: trailPT[3]!, n: trailPT[4]!, cmp: trailPT[5]! } : leadPT ? { then: leadPT[5]!, whose: leadPT[1]!, stat: leadPT[2]!, n: leadPT[3]!, cmp: leadPT[4]! } : null;
    if (selfPTIf && (selfPTIf.whose === "~'s" || ctx.selfIt) && !/\binstead$/.test(selfPTIf.then)) {
      const inner = parseOne(capital(selfPTIf.then), ctx);
      if (!inner) return null;
      const n = num(selfPTIf.n);
      effects.push({ type: "if", cond: { kind: "state", cond: { kind: "selfPT", stat: selfPTIf.stat as "power" | "toughness", ...(selfPTIf.cmp === "less" ? { max: n } : { min: n }) } }, effects: inner });
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
    const ifState = /^If ([^,]+), (.+)$/.exec(s);
    const stateCond = ifState && !/^(it|~)\b(?!'s (?:your|not your|the first) )/.test(ifState[1]!) && !/\binstead$/.test(ifState[2]!) ? parseStaticCondition(ifState[1]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    // "Draw two cards. If you have the city's blessing, draw three cards instead.": the condition picks which of the
    // two instructions happens, as it resolves (CR 608.2c). "Instead only you draw a card" says the same.
    const insteadOf = ifState && !/^(it|~)\b(?!'s (?:your|not your|the first) )/.test(ifState[1]!) && /^instead,? |\binstead$/.test(ifState[2]!) ? parseStaticCondition(ifState[1]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    if (ifState && insteadOf) {
      const from = thenParts.has(sentences[si]!) ? prevStart : prevWhole;
      const previous = effects.slice(from);
      const t = ifState[2]!.replace(/^instead,? (?:only )?/, "").replace(/ instead$/, "");
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
      const toField = /^(?:return|put) (?:that card|it)(?: from your graveyard)? (?:to|onto) the battlefield$/i.test(t);
      // "~ deals 2 damage to any target. If you're the monarch, it deals 7 damage instead." (Court of Ire): the same target.
      const moreDamage = /^(?:it|~) deals (\d+) damage$/i.exec(t);
      const prevDamage = previous.length === 1 && previous[0]!.type === "damage" && !previous[0]!.divided ? previous[0]! : null;
      if (moreDamage && !prevDamage) return null;
      const inner = moreDamage && prevDamage ? [{ ...prevDamage, amount: num(moreDamage[1]!) }] : those ? (prevToken ? [{ ...prevToken, n: amt(those[1]!) }] : null) : t === "counter that spell" ? (prevCounter ? [uncond as Effect] : null) : toField ? (prevBack ? [{ type: "putOntoBattlefield" as const, what: prevBack.what }] : null) : parseOne(t.charAt(0).toUpperCase() + t.slice(1), ctx);
      // Only one of the two happens, so neither may wait on a choice or need targets of its own (one "you may"
      // instead would leave nothing done on a "no").
      // A punisher waits on its players but always does its whole process (Court of Ambition's "instead" one), and so do
      // sacrificing and discarding, which only wait on which ones (Vona's Hunger), and so does a search (Entish Restoration),
      // and untapping one of yours (White Plume Adventurer).
      if (!inner || !previous.length || ctx.targets.length !== before || [...previous, ...inner].some((e) => pauses(e) && e !== prevCounter && e.type !== "punisher" && !(e.type === "pick" && e.action === "sacrifice") && e.type !== "discard" && e.type !== "search" && e.type !== "untapUpTo")) return null;
      const done = insteadOfAffected(inner, previous);
      if (!done) return null;
      effects.splice(from, effects.length - from, { type: "if", cond: { kind: "state", cond: insteadOf }, effects: done, otherwise: previous });
      continue;
    }
    // "You lose 2 life unless you control another Pirate": the instruction happens only if the condition is false as it
    // resolves (CR 608.2c).
    const unlessState = !ifState ? /^(.+) unless ([^,]+)$/.exec(s) : null;
    const unlessCond = unlessState && !/^(it|~|they|that player|its controller|he or she)\b/.test(unlessState[2]!) ? parseStaticCondition(unlessState[2]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    if (unlessState && unlessCond) {
      const inner = parseOne(unlessState[1]!, ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => pauses(e)))) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: unlessCond }, effects: [], otherwise: inner });
      continue;
    }
    if (ifState && stateCond) {
      // "If you've completed a dungeon, that creature also gets +5/+0" (Rilsa Rael): as well as what came before.
      // "Draw another card": one more.
      const then = ifState[2]!.replace(/^(that creature|that player|it|~) also (?=(?:gains?|gets?|deals?|has|loses?) )/i, "$1 ").replace(/^draw another card$/, "draw a card");
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
      effects.push({ type: "if", cond: { kind: "state", cond: stateCond }, effects: inner });
      continue;
    }
    // "You may draw a card": optional, decided on resolution (CR 608.2d).
    // "You may play the exiled card without paying its mana cost" asks as it plays it (see the playLinked effect).
    // "You may play an additional land this turn" is a permission, not a choice made now (CR 305.2a).
    // "You may draw a card unless that player pays {1}" (Rhystic Study): they decide first (see the punisher sentences).
    const may = /^[Yy]ou may (?!play the exiled card |cast a copy of the exiled card |play (?:an|up to \w+) additional lands? this turn|draw [^.]+ unless (?:that player|they|he or she) pays? |draw up to |choose new targets for target |cast spells this turn as though they had flash$|cast (?:that card|it) this turn$|cast your commander from the command zone without paying its mana cost$|discard your hand, then draw )(.+)$/.exec(s);
    if (may) {
      // "You may have ~ deal damage equal to its power to target creature", "you may have it fight target creature you
      // don't control": ~ does it, if you choose.
      const rest = (may[1]!.charAt(0).toUpperCase() + may[1]!.slice(1)).replace(/^Have (~|it) (deal|fight) /, (_, w: string, verb: string) => `${w === "it" && !ctx.selfIt && !ctx.selfCard ? "It" : "~"} ${verb}s `)
        .replace(/^Have ((?:up to one )?target .+?) block (~|it) this (turn|combat) if able$/, "$1 blocks $2 this $3 if able")
        // "You may have target opponent discard a card", "you may have that player lose 1 life": that player does it, if
        // you choose (the choice is yours, CR 608.2d).
        .replace(/^Have (target player|target opponent|that player|its controller|each opponent) (discard|lose|draw|mill|sacrifice|gain) /, (_, who: string, verb: string) => `${who.charAt(0).toUpperCase()}${who.slice(1)} ${verb}s `)
        // "You may have target creature get -2/-2 until end of turn", "... it gain reach", "... Ally creatures you control
        // gain first strike", "... enchanted creature fight target creature": they do it, if you choose (CR 608.2d).
        .replace(/^Have (.+?) (get|gain|lose|fight|deal) (?=\S)/, (all, who: string, verb: string) => {
          if (/^(?:target (?:player|opponent)|that player|its controller|each opponent|you)$/.test(who)) return all;
          const it = /^(?:it|her|him)$/.test(who);
          const subject = it ? (ctx.selfIt || ctx.selfCard ? "~" : "It") : who.charAt(0).toUpperCase() + who.slice(1);
          const plural = !it && /\b(?:creatures|permanents)\b/.test(who);
          return `${subject} ${plural ? verb : verb === "lose" ? "loses" : `${verb}s`} `;
        });
      ctx.mayNow = true;
      const inner = parseOne(rest, ctx);
      ctx.mayNow = false;
      if (!inner) return null;
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
      // "Search target player's graveyard, hand, and library for ... Then that player shuffles" (Memoricide).
      if (prev?.type === "exileNamed") continue;
      return null;
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
    // "Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and
    // the rest on the bottom of your library in a random order." (Nissa, Leyline Tamer), "... into your hand ...", "...
    // a land card. Put that card onto the battlefield tapped ...". Onto the battlefield only cards that need no choice
    // as they enter there (not Auras, CR 303.4f).
    // Open the Way: "... until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest ...".
    const untilX = /^[Rr]eveal cards from the top of your library until you reveal X land cards$/.test(s) && /^Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "");
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
    if (untilX) {
      effects.push({ type: "revealUntil", filter: { kind: "card", types: ["Land"], notTypes: [], notColors: [], text: "land card" }, found: "battlefield", rest: "bottom", tapped: true, n: { count: { kind: "x" } } });
      si++;
      continue;
    }
    // After "Destroy target creature" (Polymorph), "Exile target creature" (Transmogrify), "Destroy target permanent an
    // opponent controls" (Wild Magic Surge): "Its controller reveals cards from the top of their library until they reveal
    // a creature card", "... a permanent card that shares a card type with that permanent" (its types as it last existed,
    // CR 608.2h), and they put that card onto the battlefield (under their control), then the rest. With none found, all
    // the revealed cards are shuffled in, or go to the bottom (CR 701.20a).
    const theirs = /^(Its controller|That creature's controller|That permanent's controller) reveals cards from the top of their library until they reveal (?:an? )?(.+? card)( that shares a card type with that permanent)?$/.exec(s);
    const theirPut = /^(?:(?:The|That) player puts that card onto the battlefield, then shuffles (?:all other cards revealed this way|the rest) into their library|They put that card onto the battlefield and (the rest on the bottom of their library in a random order))$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (theirs && theirPut) {
      const who = parsePlayer(theirs[1]!.toLowerCase(), ctx);
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
    const until = /^[Rr]eveal cards from the top of your library until you reveal (?:an? )?(.+? card)$/.exec(s);
    // Songbirds' Blessing: "... until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put
    // it into your hand. Put the rest on the bottom of your library in a random order."
    if (until && sentences[si + 1] === "You may put that card onto the battlefield" && sentences[si + 2] === "If you don't, put it into your hand" && /^Put the rest on the bottom of your library in a random order\.?$/.test(sentences[si + 3] ?? "") && !/\b(?:named|chosen|that name)\b/.test(until[1]!)) {
      const filter = parseSearchFilter(until[1]!);
      // An Aura card (its host chosen as it enters, CR 303.4f), or a permanent card of a kind that needs no choice.
      const aura = !filter?.types?.length && filter?.subtypes?.length === 1 && filter.subtypes[0] === "Aura";
      if (!filter || filter.kind !== "card" || filter.anyOf || (!aura && (!filter.types?.length || !filter.types.every((x) => x === "Creature" || x === "Artifact" || x === "Land" || x === "Enchantment") || filter.subtypes?.length))) return null;
      effects.push({ type: "revealUntil", filter, found: "battlefield", mayElseHand: true, rest: "bottom" });
      si += 3;
      continue;
    }
    // Hermit Druid: "Put that card into your hand and all other cards revealed this way into your graveyard."
    const untilPut = /^Put that card (into your hand|onto the battlefield( tapped)?) and (the rest on the bottom of your library in a random order|all other cards revealed this way into your graveyard|the rest into your graveyard)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    if (until && untilPut && !/\b(?:named|chosen|that name)\b/.test(until[1]!)) {
      const filter = parseSearchFilter(until[1]!);
      if (!filter || filter.kind !== "card") return null;
      const onto = untilPut[1] !== "into your hand";
      // A planeswalker card enters with its loyalty (CR 306.5b): no choice either (The Prismatic Bridge).
      const safe = !!filter.types?.length && filter.types.every((x) => x === "Creature" || x === "Artifact" || x === "Land" || x === "Planeswalker") && !filter.anyOf;
      const tribal = !filter.types?.length && !!filter.subtypes?.length && filter.subtypes.every((x) => CREATURE_TYPES.has(x));
      if (onto && !safe && !tribal) return null;
      effects.push({ type: "revealUntil", filter, found: onto ? "battlefield" : "hand", rest: /graveyard$/.test(untilPut[3]!) ? "graveyard" : "bottom", ...(untilPut[2] ? { tapped: true as const } : {}) });
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
    // The Black Gate: "Choose a player with the most life or tied for most life", any of them, you too.
    // The Master, Gallifrey's End: "Choose an opponent with the most life among your opponents", any of those tied.
    // Lowercase after a trigger's condition ("When ~ enters, choose an opponent").
    if (/^[Cc]hoose (?:an opponent(?: with the most life among your opponents)?|a player with the most life or tied for most life)$/.test(s)) {
      if (ctx.chosenOpponent || ctx.eventPlayer || ctx.lastPlayerTarget !== undefined) return null;
      effects.push({ type: "choose", choice: "opponent", ...(/^[Cc]hoose a player with the most life/.test(s) ? { mostLife: true as const } : / most life /.test(s) ? { mostLife: "opponents" as const } : {}) });
      ctx.chosenOpponent = true;
      continue;
    }
    // "Choose artifact or enchantment. Destroy all permanents of the chosen type" (Season of Gathering): a card type,
    // chosen as it resolves (CR 608.2d); "the chosen type" in the next instruction is that one.
    const typeChoice = new RegExp(`^Choose (${CARD_TYPE_WORD}(?:, ${CARD_TYPE_WORD})*,? or ${CARD_TYPE_WORD})$`).exec(s);
    if (typeChoice && sentences[si + 1]) {
      const options = typeChoice[1]!.split(/,? or |, /).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      const next = attempt(ctx, () => parseOne(sentences[si + 1]!.replace(/\.$/, ""), ctx));
      const asCardType = (v: unknown): unknown => (Array.isArray(v) ? v.map(asCardType) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "chosen" && x === "type" ? "cardType" : asCardType(x)])) : v);
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
    // each token made (rulings: with two tokens, the first to leave brings the card back), about the card exiled.
    if (s === "When that token leaves the battlefield, put the exiled card into your hand") {
      const [made, faceDown] = [effects[effects.length - 1], effects[effects.length - 2]];
      if (made?.type !== "createToken" || faceDown?.type !== "exileFaceDown" || faceDown.from !== "top" || faceDown.n !== undefined || faceDown.play) return null;
      effects.push({ type: "delayed", when: "leaves", each: "created", effects: [{ type: "returnFaceDownExiled" }], text: "put the exiled card into your hand" });
      continue;
    }
    // "Choose a color. Another target creature you control gains ... hexproof from that color until end of turn. It can't
    // be blocked by creatures of that color this turn." (Skrelv): the color chosen as it resolved (CR 608.2d).
    if (effects.some((x) => x.type === "choose" && x.choice === "color")) s = s.replace(/\b(from|of) that color\b/g, "$1 the chosen color");
    // "Until end of turn, X ..." reads the same as "X ... until end of turn".
    if (/^[Uu]ntil end of turn, /.test(s)) s = `${s.replace(/^[Uu]ntil end of turn, /, "").replace(/^./, (c) => c.toUpperCase())} until end of turn`;
    // "Target creature you control gains protection from the color of your choice until end of turn": the
    // color is chosen as it resolves (CR 608.2d), after the target was chosen on casting.
    // "Target creature gains your choice of menace or lifelink until end of turn", "... flying, vigilance, deathtouch, or
    // haste": one of those keywords, chosen as it resolves (CR 608.2d).
    // "Gains protection from colorless or from the color of your choice" (Giver of Runes): one of six, chosen as it resolves.
    s = s.replace(/ (gains?) protection from colorless or from the color of your choice\b/, " $1 your choice of protection from colorless, protection from white, protection from blue, protection from black, protection from red, or protection from green");
    const choiceOf = / (gains?|gain) your choice of ((?:[a-z ]+, )*[a-z ]+,? or [a-z ]+?)(?= until end of turn\b| and |$)/.exec(s);
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
    if (/\bbecomes? the color of your choice\b/.test(s)) {
      effects.push({ type: "choose", choice: "color" });
      s = s.replace(/\b(becomes?) the color of your choice\b/, "$1 the chosen color");
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
    // "You may play the exiled card this turn" after looking at the top cards and exiling one (Nahiri's Warcrafting).
    if (/^You may play the exiled card this turn$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "dig" || prev.into !== "exile" || prev.play || prev.count !== 1) return null;
      prev.play = "thisTurn";
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
      const last = effects[effects.length - 1];
      if (!last || last.type !== "destroy") return null;
      last.noRegen = true;
      // "Destroy target nonblack creature and target land. They can't be regenerated.": both.
      if (/^They\b/.test(s)) for (let i = effects.length - 2, e = effects[i]; e?.type === "destroy"; e = effects[--i]) e.noRegen = true;
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
    const lapse = /^If that spell is countered this way, (?:(exile it) instead of putting it into its owner's graveyard|put it (on top of its owner's library|into its owner's hand) instead of into that player's graveyard)$/i.exec(s);
    if (lapse) {
      const last = effects[effects.length - 1];
      if (last?.type !== "counterSpell" || last.bounce) return null;
      if (lapse[1]) last.exile = true;
      else if (lapse[2] === "into its owner's hand") last.hand = true;
      else last.top = true;
      continue;
    }
    // "It's still a land." keeps the land type a "becomes a creature" effect would replace (CR 205.1a).
    if (/^(?:It's still an? (land|artifact|enchantment)|They're still (?:lands|artifacts|enchantments))$/i.test(s)) {
      const last = [...effects].reverse().find((e) => e.type === "continuous" && e.mods.some((x) => x.kind === "setTypes" || (x.kind === "addTypes" && x.types.includes("Creature"))));
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
    // 'It has "Sacrifice ~: Add {C}."' gives the tokens just created that ability (CR 111.3).
    const has = /^(?:It has|They have|They each have) "(.+)"$/.exec(s);
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
  { re: "the sacrificed creature was legendary", cond: { kind: "sacrificedLegendary" }, noTargets: true },
  { re: "~'s surge cost was paid", cond: { kind: "altPaid", alt: "surge" } },
  // "As an additional cost to cast this spell, you may waterbend {2}" is paid like kicker (CompiledCard.kicker.waterbend).
  { re: "~'s waterbend cost was paid", cond: { kind: "kicked" } },
  // The Masteries: "If the {1}{B} cost was paid" (compile checks it's the card's "rather than pay" cost).
  { re: "the (?:\\{[^}]+\\})+ cost was paid", cond: { kind: "altPaid", alt: "alternative" }, spellOnly: true },
  { re: "~'s madness cost was paid", cond: { kind: "altPaid", alt: "madness" }, spellOnly: true },
  { re: "~'s spectacle cost was paid", cond: { kind: "altPaid", alt: "spectacle" } },
  // Mana from a Treasure (CR 106.3) is spent after the targets are chosen (CR 601.2c, 601.2h), so no target can depend on it.
  { re: "mana from a Treasure was spent to cast ~", cond: { kind: "treasure" }, spellOnly: true, noTargets: true },
  { re: "mana from a Treasure was spent to activate this ability", cond: { kind: "treasure" }, activatedOnly: true, noTargets: true },
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
  const disc = /^If the discarded card (was|wasn't) (an? .+? card), (.+)$/.exec(s);
  if (disc) {
    const filter = parseSearchFilter(disc[2]!.replace(/^an? /, ""));
    return filter ? { cond: { kind: "discardedIs", filter }, not: disc[1] === "wasn't", text: disc[3]!, noTargets: true } : null;
  }
  // "If the sacrificed creature's toughness was 4 or greater, create two Food tokens instead" (Witch's Oven): as it last
  // existed (CR 608.2h); costs are paid after targets are chosen (CR 601.2c, 601.2h), so no target can depend on it.
  const sacPT = /^If the sacrificed creature's (power|toughness|mana value) was (\d+) or greater, (.+)$/.exec(s);
  if (sacPT) {
    const kind = sacPT[1] === "mana value" ? "manaValue" : (sacPT[1] as "power" | "toughness");
    return { cond: { kind: "amountNow", amount: { count: { kind, of: { ref: "sacrificed" } } }, min: Number(sacPT[2]) }, not: false, text: sacPT[3]!, noTargets: true };
  }
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
  let t = text;
  const instead = /^instead,? /i.test(t) || / instead$/i.test(t);
  t = t.replace(/^instead,? /i, "").replace(/ instead$/i, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // "That creature also gains flying": in addition to what the sentence before did.
  if (!instead) t = t.replace(/^(That creature|That player|It|~|Permanents you control|Creatures you control) also (?=(?:gains?|gets?|deals?|has|have|loses?) )/, "$1 ");
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
function parseThen(s: string, ctx: Ctx): Effect[] | null {
  // "Then shuffle" ends a search; "then shuffle your graveyard into your library" (The Mending of Dominaria) is its own.
  const parts = s.split(/, then (?!shuffle(?! your graveyard into your library$))/);
  if (parts.length < 2) return null;
  const out: Effect[] = [];
  for (const [i, p] of parts.entries()) {
    const fx = parseOne(i ? p.charAt(0).toUpperCase() + p.slice(1) : p, ctx);
    if (!fx) return null;
    out.push(...fx);
  }
  return out.slice(0, -1).some((e) => pauses(e)) ? null : out;
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

/** One sentence: a plain instruction, two joined by "and", or one with "for each" / "equal to" in it. */
function parseOne(s: string, ctx: Ctx): Effect[] | null {
  // "{T}: This creature deals 1 damage to itself" (Stuffy Doll): the source is the one dealt the damage.
  s = s.replace(/^~ deals (\d+) damage to itself$/, "~ deals $1 damage to ~");
  // "~ deals 1 damage to each opponent and each creature and planeswalker they control" (End the Festivities): theirs.
  s = s.replace(/^(~ deals (?:\d+|X) damage to each opponent and each [a-z ]+?) they control$/, "$1 your opponents control");
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
  const fx = attempt(ctx, () => parsePutChoice(s, ctx)) ?? attempt(ctx, () => parsePerOpponent(s, ctx)) ?? attempt(ctx, () => parseSentence(s, ctx)) ?? attempt(ctx, () => parseConjunction(s, ctx)) ?? attempt(ctx, () => parseSharedSubject(s, ctx)) ?? attempt(ctx, () => parseYouList(s, ctx)) ?? attempt(ctx, () => parseForEach(s, ctx)) ?? attempt(ctx, () => parseEqualTo(s, ctx)) ?? attempt(ctx, () => parseThen(s, ctx)) ?? attempt(ctx, () => parseAndYouMay(s, ctx));
  if (fx) noteLast(ctx, fx);
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
  // "Create a 2/2 red Mutant creature token. It gains haste until end of turn. Destroy it at the beginning of the next end
  // step" (Old Hob): an instruction about the tokens just created leaves "it" meaning them.
  if (last && "what" in last && (last.what as ObjRef).ref === "created" && (ctx.lastCreated || ctx.lastCreatedAny)) return;
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
      // One card searched for and put onto the battlefield (Vision Quest's "it gains haste").
      (put?.type === "search" && put.n === 1 && !put.others && put.dest.zone === "battlefield" && put.who === undefined && put.library === undefined);
    // "Put a +1/+1 counter on a creature you control. It gains vigilance and trample until end of turn" (Season of
    // Gathering): the one creature picked (kept in `created` too).
    // "You may choose a token you control. If you do, ... that token" (Brudiclad): the same, if one was.
    const pk = last?.type === "may" && last.effects.length === 1 ? last.effects[0] : last;
    const picked = pk?.type === "pick" && (pk.action === "counters" || pk.action === "choose") && pk.n === 1 && pk.who.ref === "you" && !pk.among;
    ctx.lastCreated = ((last?.type === "createToken" || last?.type === "createTokenCopy") && last.n === 1) || (faceDown && last.count === 1) || ctx.lastPut || picked;
    ctx.lastCreatedAny = last?.type === "createToken" || last?.type === "createTokenCopy" || last?.type === "myriad" || faceDown || (last?.type === "returnAllFromGraveyard" && !last.toHand);
    ctx.lastDugLands = last?.type === "dig" && last.into === "battlefield" && last.filter?.kind === "card" && last.filter.types?.length === 1 && last.filter.types[0] === "Land" && !last.filter.notTypes?.length;
    // "Each opponent discards a card. For each opponent who can't, ..." (Aclazotz).
    ctx.opponentsDiscarded = last?.type === "discard" && last.who.ref === "eachOpponent" && last.n === 1 && !last.random && !last.filter;
    if (last?.type === "amass") ctx.amassed = true;
    if (last?.type === "damage" || last?.type === "bite" || last?.type === "fight") ctx.excessDamage = true;
    // "Creatures you control get +1/+1 until end of turn. Untap those creatures": the ones it changed (CR 611.2c).
    if (last?.type === "continuous" && last.what.ref === "each" && (last.duration === "endOfTurn" || last.duration === "yourNextTurn")) ctx.lastGroup = { ref: "affected" };
    // "Put a +1/+1 counter on each creature you control. Untap those creatures": still the same ones.
    if (last?.type === "counters" && last.what.ref === "each") ctx.lastGroup = last.what;
    // "Double the power of each other creature you control until end of turn. Those creatures gain vigilance" (Rhonas).
    if (last?.type === "doublePT" && last.what.ref === "each") ctx.lastGroup = last.what;
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
  const m = /^[Ff]or each opponent, (.+)$/.exec(s);
  if (!m || ctx.targets.some((t) => t.many || t.perOpponent)) return null;
  const who = / up to one target (.+?) (?:that player|that opponent|they) controls?\b/;
  // "Up to one target creature card from that player's graveyard" (Sepulchral Primordial): owned by that opponent.
  const yard = / up to one target (.+? card) from that player's graveyard\b/;
  const t = who.exec(` ${m[1]!}`) ?? yard.exec(` ${m[1]!}`);
  if (!t) return null;
  const card = !who.test(` ${m[1]!}`);
  const inner = card ? ` ${m[1]!}`.replace(yard, ` target ${t[1]} from an opponent's graveyard`).trim() : ` ${m[1]!}`.replace(who, ` target ${t[1]} an opponent controls`).trim();
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
  if (card ? spec.kind !== "card" || spec.owner !== "opponent" || spec.linkedExile : spec.kind !== "object" || spec.controller !== "opponent") return null;
  if (spec.optional || spec.distinctFrom || spec.notSource) return null;
  ctx.targets[before] = { ...spec, perOpponent: true, text: card ? `target ${t[1]} from that player's graveyard` : `target ${t[1]} that player controls` };
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
    if (o.type === "reflexive" && o.xExcess) return false;
    // "You may pay {X}. If you do, ...": the X paid (Decree of Justice).
    if (o.type === "may" && o.payX) return usesX(o.otherwise);
    if (o.count && (o.count as Count).kind === "x") return true;
    if (o.many === "x" || o.many === "exactX") return true; // "X target creatures"
    if (o.xRange || (o.total as TargetSpec["total"])?.x || o.kind === "xAtLeast") return true; // "with mana value X or less", "if X is 5 or more"
    return Object.values(o).some(usesX);
  }
  return false;
}

/** What "unless its controller pays ..." asks for: "{2}", "{X}", "{1} for each card in your hand", "{2} and 2 life". */
export function parseUnlessPays(text: string, ctx: Ctx): UnlessPays | null {
  let m: RegExpExecArray | null;
  if (text === "{X}") return { cost: "", generic: X };
  if ((m = /^((?:\{(?:\d+|[WUBRGC])\})+)(?: and (\d+) life)?$/.exec(text))) return { cost: m[1]!, ...(m[2] ? { life: Number(m[2]) } : {}) };
  // "Pay 5 life" (Dash Hopes): only with that much life (CR 119.4).
  if ((m = /^(\d+) life$/.exec(text))) return { cost: "", life: Number(m[1]) };
  // "Unless its controller pays mana equal to the greatest power among creatures you control" (Repulsive Mutation):
  // generic mana, counted as it resolves.
  if ((m = /^mana equal to (.+)$/.exec(text))) {
    const n = parseCount(m[1]!, ctx);
    return n && typeof n === "object" ? { cost: "", generic: n } : null;
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
  return { count: per.count, times: Math.abs(n) * (per.times ?? 1), ...(per.plus ? { plus: Math.abs(n) * per.plus } : {}), ...(n < 0 ? { negate: true } : {}) };
}

/**
 * "Draw a card for each creature you control", "You gain 2 life for each Elf you control",
 * "Target creature gets +1/+1 until end of turn for each artifact you control". The count is made
 * as it resolves (CR 608.2h). The number before it is what gets multiplied.
 */
function parseForEach(s: string, ctx: Ctx): Effect[] | null {
  const m = /^(.+) for each (.+)$/.exec(s) ?? /^For each (.+?), (.+)$/.exec(s);
  if (!m) return null;
  const [main, phrase] = s.startsWith("For each ") ? [m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1), m[1]!] : [m[1]!, m[2]!];
  const fx = parseSentence(main, ctx);
  if (!fx || fx.length !== 1) return null;
  // "Each player loses 1 life for each creature they control" (Stronghold Discipline), "target player loses 1 life for each
  // tapped artifact they control" (Burden of Greed): each of those players counts their own.
  const theirs = /^(.+) they control$/.exec(phrase);
  if (theirs) {
    const e = fx[0]!;
    if (e.type !== "loseLife" && e.type !== "gainLife" && e.type !== "draw") return null;
    const whose: PlayerRef | null = e.who.ref === "eachPlayer" || e.who.ref === "eachOpponent" ? { ref: "eachOne" } : e.who.ref === "target" && !e.who.n ? e.who : e.who.ref === "eventPlayer" ? e.who : null;
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
  const per = parseCount(phrase, ctx, true);
  if (!per) return null;
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
    const def = fx && parseCount(m[group ?? m.length - 1]!, ctx);
    return fx && def ? replaceX(fx, def) : null;
  }
  return null;
}

// "Choose one —" and its bulleted modes; "choose one that hasn't been chosen [this turn] —" (GameObject.modesChosen) and
// "choose one at random —". Spree's "+ {cost} —" modes, escalate, pawprints and repeated modes are read in compile.ts.
const MODAL = /^[Cc]hoose (one|two|three|one or both|one or more|up to one|any number)( that hasn't been chosen(?: this turn)?| at random)? —\s*((?:•[^•]+)+)$/;

/** How many modes each "Choose ..." allows (CR 700.2), given how many there are. */
const MODE_COUNTS: Record<string, (n: number) => [number, number]> = {
  one: () => [1, 1],
  two: () => [2, 2],
  three: () => [3, 3],
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
  const parts = s.split(/,? and (?=(?:you|each|target|draw|~|its|create|put|return|exile|destroy|tap|untap|mill|suspect|convert|transform|after this phase|they gain|scry \d+$|surveil \d+$)\b|get (?:\{E\}|\w+ \{E\}|an amount of \{E\}))/i);
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
  const again = /^target (player|opponent)$/i.test(subject) ? "That player" : /^any number of target (players|opponents) each$/i.test(subject) ? "Each of those players" : /^(you|each player|each opponent|that player)$/i.test(subject) ? subject : null;
  if (!again) return null;
  // "Target player draws cards equal to half the number of cards in their library and loses half their life" (Peer into
  // the Abyss): either part may be "... equal to ...".
  // "Each opponent sacrifices a creature of their choice for each death vote and discards a card for each taxes vote"
  // (Capital Punishment): or "... for each ...".
  const one = (t: string) => attempt(ctx, () => parseSentence(t, ctx)) ?? attempt(ctx, () => parseEqualTo(t, ctx)) ?? attempt(ctx, () => parseForEach(t, ctx));
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
    const fx = parseSentence(`You ${p}`, ctx);
    if (!fx) return null;
    out.push(...fx);
  }
  return out;
}

export function addTarget(ctx: Ctx, spec: TargetSpec): number {
  ctx.targets.push(spec);
  ctx.lastCreated = false;
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

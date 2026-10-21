import { allEffects, refCovers, type SearchDest, type AbilityBody, type FaceDownPlay, type Amount, type AmountExpr, type Count, type Effect, type ObjRef, type PlayerRef, type SpellCondition, type TargetSpec, type UnlessPays, type PayCost, type NamePurpose } from "../abilities";
import { substituteX } from "../amounts";
import { num, NUM, NUMX, X, amt, ROLL_ROW, counterKind, COUNTER, isGroup, keywordOf, parseSpentReq, SPENT_TO_CAST, WHEEL, capital, COLOR_WORDS, singularWord } from "./words";
import { CHOSEN_KEYWORD, CHOSEN_PROTECTION, CREATURE_TYPES, THAT_PLAYER_PROTECTION } from "../keywords";
import { parseStaticCondition } from "./statics";
import { parseBoundCount, parseCount } from "./counts";
import { parseBecomes, parseDig, parseSentence } from "./sentence";
import { parsePreventionRider } from "./sentences/prevention";
import { compileQuoted, parseGrants } from "./grants";
import { boundAtTargeting, parseCardTarget, parseDamageRecipient, parseObject, parsePlayer, parseTargetPhrase, PERMANENT_TYPES } from "./targets";
import { parseCardNameChoice, parseSearchFilter } from "./search";
import { parseManaSpend, parseManaTrigger } from "./mana-abilities";
import { parseTrigger } from "./triggers";
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
  /** An Aura's "when enchanted creature dies": "return ~ ..." is the Aura card, in the graveyard it went to (ObjRef selfCard `moved`). */
  auraCard?: boolean;
  /** "Exile the top card of your library" came before: "that card's mana value" is that card's. */
  exiledTop?: boolean;
  /** A reflexive trigger after "you may sacrifice another creature": "that creature's power" is the sacrificed one's. */
  sacrificedIt?: boolean;
  /** A revealFromHand instruction came before, here or in the ability whose reflexive trigger this is: "for each card revealed this way". */
  revealedFromHand?: boolean;
  /** A damage instruction came before: "the excess damage dealt this way" (CR 120.10). */
  excessDamage?: boolean;
  /** A tapAnyNumber instruction came before, here or in the ability whose reflexive trigger this is: "for each creature tapped this way". */
  tappedThisWay?: boolean;
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
  /** The instruction before was "mill N cards" (yours): "those cards" in what follows can be the milled cards (Ripples of Undeath). */
  afterMill?: boolean;
  /** An instant or sorcery: "other" can't mean other than its source, which isn't a permanent. */
  spell?: boolean;
  /** A "whenever a player casts a spell" trigger: "it" or "that spell" can be the spell cast. */
  castSpell?: boolean;
  /** A cast trigger's first instruction: "it gains haste" (Tyvar Kell's emblem) is the spell cast. */
  spellIt?: boolean;
  /** In a "when you cast this spell" ability: "copy it" is the spell itself. */
  selfCastSpell?: boolean;
  /** An exchange of life totals came before: "the life lost this way", "those players' life totals" are about it. */
  exchanged?: boolean;
  /** "Whenever ~ deals combat damage to a player": "that player" is that player. */
  eventPlayer?: boolean;
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
  vote?: { options?: string[]; among?: true };
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
const FLOATING_EVENTS = new Set<string>(["castSpell", "permanentDies", "selfDealsCombatDamageToPlayer", "creatureYouControlDealsCombatDamageToPlayer"]);
const FLOATING_KEYS = new Set<string>(["event", "cast", "dies", "dealer", "toOpponent", "body"]);

/**
 * "Until end of turn, whenever you cast a spell, copy it. You may choose new targets for the copy.": a delayed triggered
 * ability that triggers each time until then (CR 603.7b), the sentences after it its instructions. Undefined when `s`
 * isn't one, null when it can't be compiled.
 */
function floatingTrigger(s: string, after: string[]): Effect | null | undefined {
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
const PAUSING = new Set<Effect["type"]>(["vote", "discard", "reorderGraveyard", "takeFromHand", "scry", "surveil", "orderTop", "handToTop", "may", "explore", "search", "choose", "connive", "recruit", "pick", "clash", "endure", "tapOrUntap", "untapUpTo", "castFromHand", "punisher", "sacrificeEach", "venture", "chooseFromGraveyard", "keepRest"]);
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
  (e.type === "sacrifice" && e.what.ref === "self") ||
  // "Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it." (Gorbag): the subject.
  (e.type === "sacrifice" && e.what.ref === "subject") ||
  // "When ~ dies, you may exile it. When you do, ..." (Undead Butler): only while it's still that card in the graveyard.
  (e.type === "exile" && e.what.ref === "selfCard") ||
  // "You may tap it. When you do, ..." (The Fire Nation Drill): only an untapped permanent can be tapped (CR 701.26a).
  (e.type === "tap" && e.what.ref === "self") ||
  // "You may remove a charge counter from ~. If you do, you gain 1 life" (Sun Droplet): only with that many on it.
  (e.type === "removeCounters" && e.what.ref === "self" && typeof e.n === "number") ||
  // "You may put the top creature card of defending player's graveyard onto the battlefield. If you do, ..." (Bone Dancer).
  (e.type === "putOntoBattlefield" && e.what.ref === "graveyardEnd" && !e.atEndStep && !e.haste) ||
  // "You may return another creature you control to its owner's hand. If you do, ...": only with one to return. "You may
  // sacrifice a Zombie. If you do, ..." (Wilhelt): only with one to sacrifice.
  (e.type === "pick" && e.who.ref === "you" && (e.action === "bounce" || e.action === "sacrifice") && e.n === 1 && !e.unless) ||
  // "You may have it deal 3 damage to target creature. If you do, ...": done if that target is still legal.
  (e.type === "damage" && (e.to.ref === "target" || e.to.ref === "anyTarget") && !("n" in e.to && e.to.n) && !e.also && !e.divided) ||
  (e.type === "bite" && e.b.ref === "target" && !e.b.n && (e.a.ref === "self" || e.a.ref === "target")) ||
  // "You may have target creature you control get +2/+0 and gain haste until end of turn. If you do, ..." (Hazoret's
  // Favor), "you may have it get +4/+0 until end of turn" (Attack-in-the-Box): done if that permanent is still there.
  (e.type === "continuous" && (e.what.ref === "self" || (e.what.ref === "target" && !e.what.n)) && e.duration === "endOfTurn");

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
  const first = /^If (?:it's|that card is) (not |)(an? .+?|snow) card, (.+)$/.exec(sentences[at] ?? "") ?? /^If it (isn't) (an? .+?) card, (.+)$/.exec(sentences[at] ?? "") ?? /^If that card is ()(snow), (.+)$/.exec(sentences[at] ?? "");
  // "If that card has the chosen name, sacrifice ~ and draw three cards" (Diviner's Lockbox), after "choose a card name".
  const named = !first && /^If (?:it|that card) has the chosen name, (.+)$/.exec(sentences[at] ?? "");
  if (named) {
    // Its targets are chosen as it's put on the stack, whatever the card turns out to be (CR 601.2c, 602.2b).
    const then = revealedAction(named[1]!, ctx, true);
    return then && { effect: { type: "if", cond: { kind: "revealedIs", filter: { kind: "card", chosen: "name", text: "card with the chosen name" } }, effects: then }, next: at + 1 };
  }
  if (!first) return null;
  const filter0 = parseSearchFilter(`${first[2]!.replace(/^an? /, "")} card`);
  const filter = filter0 && ofChosen ? { ...filter0, chosen: "type" as const, text: `${filter0.text} of the chosen type` } : filter0;
  const then = filter && revealedAction(first[3]!, ctx);
  if (!filter || !then) return null;
  let next = at + 1;
  const other = /^Otherwise, (.+)$/.exec(sentences[next] ?? "");
  const otherwise = other ? revealedAction(other[1]!, ctx) : undefined;
  if (otherwise === null) return null;
  if (other) next++;
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
  const look = !head && new RegExp(`^[Ll]ook at the top (card|${NUMX} cards) of ${LIB} library$`).exec(s);
  const lookThen = look && /^Exile (?:it|that card|those cards|them) face down$/.test(sentences[at + 1] ?? "");
  const they = new RegExp(`^(Target opponent|Target player|That player|Each opponent) exiles? the top (card|${NUMX} cards) of their library face down$`).exec(s);
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
  // "Shuffle your library, then reveal ...", "..., then put all cards revealed this way ...": split at ", then" by now.
  const shuffleFirst = /^[Ss]huffle your library$/.test(sentences[at]!);
  const s = sentences[shuffleFirst ? at + 1 : at] ?? "";
  const reveal = (shuffleFirst ? /^Reveal cards from the top of it until you reveal a nonland card$/ : /^[Rr]eveal cards from the top of your library until you reveal a nonland card$/).test(s);
  const exile = !shuffleFirst && /^[Ee]xile cards from the top of your library until you exile a nonland card$/.test(s);
  const they = shuffleFirst ? null : /^(Target opponent|Target player) exiles cards from the top of their library until they exile a nonland card$/.exec(s);
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
  if (!then) return null;
  const who = they ? parsePlayer(they[1]!, ctx) : undefined;
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

export function parseBody(text: string, opts: { sacrificedIt?: boolean; amassed?: boolean; subject?: boolean; subjectIt?: boolean; subjectLeft?: boolean; selfIt?: boolean; selfCard?: boolean; auraCard?: boolean; activated?: boolean; costLinked?: boolean; spell?: boolean; castSpell?: boolean; eventPlayer?: boolean; defending?: boolean; selfCastSpell?: boolean; ownX?: boolean; revealedFromHand?: boolean; tappedThisWay?: boolean } = {}): AbilityBody | null {
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
    ...(opts.auraCard ? { auraCard: true } : {}),
    ...(opts.activated ? { activated: true } : {}),
    ...(opts.costLinked ? { costLinked: true } : {}),
    ...(opts.spell ? { spell: true } : {}),
    ...(opts.castSpell ? { castSpell: true, spellIt: true } : {}),
    ...(opts.eventPlayer ? { eventPlayer: true } : {}),
    ...(opts.defending ? { defending: true } : {}),
    ...(opts.selfCastSpell ? { selfCastSpell: true } : {}),
    ...(opts.ownX ? { ownX: true } : {}),
    ...(opts.sacrificedIt ? { sacrificedIt: true } : {}),
    ...(opts.amassed ? { amassed: true } : {}),
    ...(opts.revealedFromHand ? { revealedFromHand: true } : {}),
    ...(opts.tappedThisWay ? { tappedThisWay: true } : {}),
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
  // Tibalt's Trickery: one instruction about the countered spell's controller (read in parseUntilNonland).
  text = text.replace(/Choose 1, 2, or 3 at random\. Its controller mills that many cards, then exiles cards from the top of their library until they exile a nonland card with a different name than that spell\. They may cast that card without paying its mana cost\. Then they put the exiled cards on the bottom of their library in a random order\./, `${TIBALT}.`);
  text = text.replace(/If you haven't cast a spell this turn, you may cast that card\. If you do, you can't cast additional spells this turn\./, "If you haven't cast a spell this turn, you may cast that card, and if you do, you can't cast additional spells this turn.");
  text = text.replace(/ gains flashback until end of turn\. (?:The|Its) flashback cost is equal to (?:its|that card's) mana cost\./g, " gains flashback with its mana cost until end of turn.");
  // Search for Survivors: "An opponent chooses a card at random in your graveyard. If it's a creature card, put it onto the
  // battlefield. Otherwise, exile it." The choice is at random, so who makes it changes nothing: one instruction.
  text = text.replace(/An opponent chooses a card at random in your graveyard\. If it's a creature card, put it onto the battlefield\. Otherwise, exile it\./, "Put a card chosen at random from your graveyard onto the battlefield if it's a creature card, otherwise exile it.");
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
  // Descent into Avernus: "Then each player creates X Treasure tokens and ~ deals X damage to each player, where X is the
  // number of descent counters on ~": the same X for both, which nothing in between changes.
  text = text.replace(/(^|\. )Then each player creates X ([^.]+?) tokens and ~ deals X damage to each player, where X is ([^.]+)\./, "$1Then each player creates X $2 tokens, where X is $3. ~ deals X damage to each player, where X is $3.");
  // Gamble: "Search your library for a card, put that card into your hand, discard a card at random, then shuffle." The
  // discard comes before the shuffle, but the discarded card goes to the graveyard, so the order changes nothing that can
  // be seen: the search, then the discard (at random from the whole hand, the found card included).
  text = text.replace(/^Search your library for a card, put that card into your hand, discard a card at random, then shuffle\.$/, "Search your library for a card, put that card into your hand, then shuffle. Discard a card at random.");
  // "Put a +1/+1 counter on each creature you control and a loyalty counter on each other planeswalker you control"
  // (Ajani Steadfast): two kinds of counters on two groups, one after the other.
  text = text.replace(/(^|\. )Put (an?|one|two|three) ([^.]*?counters?) on (each [^.]+?) and (an?|one|two|three) ([^.]*?counters?) on (each [^.]+?)\./g, "$1Put $2 $3 on $4. Put $5 $6 on $7.");
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
  text = text.replace(/, then shuffle and you gain (\d+) life\./g, ", then shuffle. You gain $1 life.");
  // "Destroy all creatures other than ~" (Magister of Worth) is "destroy all other creatures".
  text = text.replace(/\ball creatures other than ~/g, "all other creatures");
  // "Each player secretly votes for truth or consequences, then those votes are revealed" is one instruction (a vote whose
  // votes nobody sees until all are made), not two.
  text = text.replace(/\b(secretly votes for [^.]+?), then those votes are revealed\./g, "$1.");
  // "You may pay eight {E}. If you pay, ..." (Lightning Runner) says the same as "If you do".
  text = text.replace(/(you may pay [^.]+\.) If you pay, /g, "$1 If you do, ");
  let rowToken: string | undefined;
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
      rowToken = /^Create an? ([^,.]+?) token$/.exec(fx)?.[1] ?? rowToken;
      return [`${ROW_MARK}${row[1]}|${row[2] ?? (row[3] || row[4] === "more" || row[4] === "higher" ? "+" : row[4] === "less" ? "-" : row[1])}`, fx];
    })
    // "Draw two cards, then discard a card": two instructions, in order.
    // A search's "then shuffle" is part of the search (CR 701.23): "you may search" covers it too.
    // Not before "meld them into": meld (CR 701.42a) is one instruction with the exile (sentences/zones.ts).
    // Not after "If you do,": all of it depends on the payment ("If you do, choose a color, then ...").
    // Not after a leading condition either: "If you control a blue creature, draw a card, then discard a card" (Statute
    // of Denial) is all conditional.
    // Nor "you may exile target creature you control, then return that card to the battlefield" (Conjurer's Closet): one
    // blink, all of it optional.
    .flatMap((x) => (/^If [^,]+, /.test(x) || /^[Yy]ou may exile [^,]+, then return (?:it|that card) to the battlefield under (?:its owner's|your) control\.?$/.test(x) || WHEEL.test(x) || /^\w+ player shuffles their .+ into their library, then draws /.test(x) || /^The owner of target [^,]+ shuffles it into their library, then reveals the top card of their library\.?$/.test(x) || LIVING_DEATH.test(x) ? [x] : splitOutsideQuotes(x, /, then (?!shuffle|sacrifices the rest$|meld them into )/g).map((p, i, all) => (i ? thenPart(thenSubject(all[0]!, p)) : p))))
    // "Target opponent reveals their hand and you choose a nonland card from it": two instructions, in order.
    .flatMap((x) => x.split(/(?<=reveals (?:their|his or her) hand) and (?=you choose )/).map((p, i) => (i ? p.charAt(0).toUpperCase() + p.slice(1) : p)))
    .flatMap(splitSpentPair)
    // "Put a +1/+1 counter on ~ and it can't be blocked this turn" (Sahagin): two instructions, both about ~.
    .flatMap((x) => {
      // Not under a leading condition ("If you do, put ... and it gains menace"): the condition is for both.
      const m = /^If /.test(x) ? null : /^(.*\b(?:counters? on ~|[Ss]acrifice ~)) and it ((?:gains|gets|can't|deals) .+)$/.exec(x);
      return m ? [m[1]!, `~ ${m[2]!}`] : [x];
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
  let curStart = 0;
  // Where the sentence before started, counting the parts split off at ", then" as one sentence with it: "Draw a card,
  // then discard a card. If you have a full party, instead draw three cards." (The Destined Thief) replaces both.
  let prevWhole = 0;
  let curWhole = 0;
  // Where the targets of the sentence before and of this one start.
  let prevTargets = 0;
  let curTargets = 0;
  // "You may pay {2}" waits for the sentence after: "If you do, draw a card."
  let payFirst: { pay: PayCost; text: string } | null = null;
  // "Look at the top four cards of your library" waits for what to do with them (see parseDig).
  let dig: Partial<Extract<Effect, { type: "dig" }>> | null = null;
  // The look's own "where X is ...", for "with mana value X or less" after it (Hatchery Spider).
  let digWhere: AmountExpr | undefined;
  // A look that a "you may pay ... If you do," before it depends on (see payFirst).
  let digPaid: { pay: PayCost; text: string } | null = null;
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
  for (let si = 0; si < sentences.length; si++) {
    // "It" is the spell cast only as the first instruction: "Untap ~. It gains ..." is about ~ (Pristine Skywise).
    if (si > 0) delete ctx.spellIt;
    let s = sentences[si]!.replace(/^Then,? (.)/, (_, c: string) => c.toUpperCase());
    const last = effects[effects.length - 1];
    ctx.afterMill = last?.type === "mill" && last.who.ref === "you";
    // "At the beginning of the next end step, sacrifice that creature" (Meek Attack) is "Sacrifice that creature at the
    // beginning of the next end step" (one instruction, no condition).
    const atNext = /^At the beginning of (the|your) next end step, ((?:sacrifice|exile|destroy|return) [^,]+)$/.exec(s);
    if (atNext && !/\b(?:if|unless|then|instead)\b| to the battlefield/.test(atNext[2]!)) s = `${atNext[2]!.charAt(0).toUpperCase()}${atNext[2]!.slice(1)} at the beginning of ${atNext[1]} next end step`;
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
    const searchReveal = /^Search your library for (an? [a-z ]+? card) and reveal it$/.exec(s);
    if (searchReveal && sentences[si + 1] === "Put it onto the battlefield tapped if it's a land card" && sentences[si + 2] === "Otherwise, put it into your hand" && /^Then,? shuffle$/.test(sentences[si + 3] ?? "")) {
      const fx = parseOne(`Search your library for ${searchReveal[1]}, reveal it, put it into your hand, then shuffle`, ctx);
      if (fx?.length !== 1 || fx[0]!.type !== "search") return null;
      effects.push({ ...fx[0]!, landTo: { zone: "battlefield", tapped: true } });
      si += 3;
      continue;
    }
    // "Sacrifice a creature. If you do, ...": only if one was sacrificed (you must if you can, rulings on Victimize).
    const sacDo = /^If you do, (.+)$/.exec(s);
    const sacPrev = effects[effects.length - 1];
    if (sacDo && sacPrev?.type === "pick" && sacPrev.action === "sacrifice" && sacPrev.who.ref === "you" && sacPrev.n === 1 && !sacPrev.unless) {
      const before = ctx.targets.length;
      const back = /^return the chosen cards to the battlefield( tapped)?$/.exec(sacDo[1]!);
      const inner: Effect[] | null = back ? (chosenCards ? [{ type: "putOntoBattlefield", what: chosenCards, ...(back[1] ? { tapped: true } : {}) }] : null) : parseOne(capital(sacDo[1]!), ctx);
      if (!inner || ctx.targets.length !== before) return null;
      effects.push({ type: "if", cond: { kind: "sacrificedThisWay" }, effects: inner });
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
    if (/^Until end of turn, you don't lose this mana as steps and phases end$/.test(s)) {
      const added = allEffects(effects.slice(prevStart)).filter((e): e is Extract<Effect, { type: "addMana" }> => e.type === "addMana");
      if (!added.length || si === 0 || /[Ss]pend this mana only|can't be spent/.test(sentences[si - 1]!)) return null;
      for (const e of added) e.keep = "turn";
      continue;
    }
    // "Add {U}{R}. Spend this mana only to cast instant and sorcery spells" (Abstract Paintmage, CR 106.6): the mana the
    // sentence before added.
    if (/^Spend this mana only /.test(s)) {
      const added = allEffects(effects.slice(prevStart)).filter((e): e is Extract<Effect, { type: "addMana" }> => e.type === "addMana");
      const only = parseManaSpend(`${s}.`);
      if (!added.length || !only || added.some((e) => e.only)) return null;
      for (const e of added) e.only = only;
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
    // "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token."
    // (Smothering Tithe): a punisher whose only way out is the payment.
    const thatMay = /^([Tt]hat player|[Tt]hey|[Tt]arget opponent|[Tt]arget player|[Ee]ach opponent) may pay (.+)$/.exec(s);
    const thatThen = thatMay && /^If (?:the player|that player|they|he or she) (?:doesn't|don't), (you .+)$/.exec(sentences[si + 1] ?? "");
    if (thatMay && thatThen) {
      const who = parsePlayer(thatMay[1]!.toLowerCase(), ctx);
      const options = parsePunisherOptions(`pays ${thatMay[2]!}`, ctx);
      const then = options && parseOne(capital(thatThen[1]!), ctx);
      if (!who || who.ref === "you" || !options || !then || then.some((e) => pauses(e))) return null;
      effects.push({ type: "punisher", who, options, effects: then, thenText: thatThen[1]!.replace(/^you (\w+)/, (_, v: string) => `${v}s`) });
      si++;
      continue;
    }
    // "Each player may scry 1" (Eager Construct), "then each opponent may scry 1" (Myr Custodian), "each player may draw a
    // card" (Kwain): each decides in turn order, knowing the earlier answers, then those who did each do it, in turn
    // order (rulings on Eager Construct and Kaya, Intangible Slayer).
    const alone = offer && !does && /^(?:scry \d+|surveil \d+|draw a card)$/.test(offer[2]!) ? parseOffer(offer[2]!, ctx) : null;
    if (offer && alone) {
      effects.push({ type: "eachMay", who: { ref: offer[1] === "player" ? "eachPlayer" : "eachOpponent" }, effects: alone, text: offer[2]!, each: true });
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
    const exEqual = /^Exile cards from the top of your library equal to (.+)$/.exec(s);
    const exEqualN = exEqual ? parseCount(exEqual[1]!, ctx) : null;
    if (exEqual && !exEqualN) return null;
    // "Shuffle your library, then exile the top card." (Urza, Lord High Artificer): the top card of your library, after.
    if (/^Shuffle your library$/.test(s) && /^[Ee]xile the top card$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "shuffle", who: { ref: "you" } });
      sentences[si + 1] = "Exile the top card of your library";
      continue;
    }
    const exTop = exEqual ? (["", "X"] as unknown as RegExpExecArray) : new RegExp(`^[Ee]xile the top (?:card|${NUMX} cards) of your library$`).exec(impulseIf && !impulseIf.not ? impulseIf.text : s);
    // "Exile the top card of that player's library. Until end of turn, you may cast that card." (Ragavan, after combat
    // damage to a player): that player's card, cast only (no land play, rulings), paying its costs.
    const theirTop = !exTop && !impulseIf && ctx.eventPlayer && /^[Ee]xile the top card of that player's library$/.test(s) ? /^(?:Until end of turn, you may cast that card|You may cast that card this turn)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "") : null;
    if (theirTop) {
      effects.push({ type: "impulse", n: 1, until: "thisTurn", who: { ref: "eventPlayer" }, castOnly: true });
      ctx.exiledTop = true;
      si++;
      continue;
    }
    // With no duration (Dungeon of the Mad Mage's Runestone Caverns), for as long as each card stays exiled (CR 611.2a, 400.7).
    // "Until your next end step, you may play it" (Yasmin Khan, Wiccan, Ob Nixilis): over as your next end step begins.
    // "Until end of turn, you may play that card without paying its mana cost" (Urza, CR 118.9): `free`.
    const playRe = /^(?:(Until the end of your next turn|Until end of turn|Until your next end step), you may play (?:that card|those cards|them|it)|You may play (?:that card|those cards|them|it)(?: (this turn|until the end of your next turn|until your next end step))?)( without paying its mana cost)?$/;
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
    if (exTop && playIt) {
      const when = (playIt[1] ?? playIt[2] ?? "").toLowerCase();
      const free = playIt[3] ? { free: true as const } : {};
      if (free.free && (exTop[1] || exEqualN || impulseIf)) return null;
      const impulse: Effect = { type: "impulse", n: exEqualN ?? (exTop[1] ? amt(exTop[1]) : 1), until: !when ? "exiled" : /next end step/.test(when) ? "yourNextEndStep" : /next turn/.test(when) ? "nextTurn" : "thisTurn", ...free };
      effects.push(impulseIf && !impulseIf.not ? { type: "if", cond: impulseIf.cond, effects: [impulse] } : impulse);
      si++;
      continue;
    }
    // "Exile all cards from your hand, then draw that many cards. Until the end of your next turn, you may play cards exiled
    // this way." (Invasion of Kaldheim): face up (CR 406.3), each card's permission its own (CR 400.7).
    // "Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one" (Valakut
    // Awakening, Into the Fire).
    if (/^[Pp]ut any number of cards from your hand on the bottom of your library$/.test(s) && /^Draw that many cards plus one$/.test(sentences[si + 1] ?? "")) {
      effects.push({ type: "revealFromHand", bottom: true }, { type: "draw", who: { ref: "you" }, n: { count: { kind: "bottomedFromHand" }, plus: 1 } });
      si++;
      continue;
    }
    // By now split at ", then".
    if (/^[Ee]xile all cards from your hand$/.test(s) && /^Draw that many cards$/.test(sentences[si + 1] ?? "") && /^Until the end of your next turn, you may play cards exiled this way$/.test(sentences[si + 2] ?? "")) {
      effects.push({ type: "exileHand", until: "nextTurn" }, { type: "draw", who: { ref: "you" }, n: { count: { kind: "exiledFromHandThisWay" } } });
      si += 2;
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
    const castAmong = castAmongHead && /^You may cast (?:(any number of|up to two|an?) )?(?:(instant or sorcery|instant and sorcery|sorcery|instant) )?spells?(?: with (total )?mana value (\d+|X) or less)? from among (?:them|cards exiled this way) without paying (?:their mana costs|its mana cost)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
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
    // Etali, Primal Conqueror: "each player exiles cards from the top of their library until they exile a nonland card.
    // You may cast any number of spells from among the nonland cards exiled this way without paying their mana costs."
    if (/^[Ee]ach player exiles cards from the top of their library until they exile a nonland card$/.test(s) && /^You may cast any number of spells from among the nonland cards exiled this way without paying their mana costs$/.test(sentences[si + 1]?.replace(/\.$/, "") ?? "")) {
      effects.push({ type: "castFromAmong", who: { ref: "you" }, n: 1, each: true, untilNonland: true });
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
    if (castAmongHead && castAmong && (castAmongHead[2] || castAmongHead[3] || afterShuffle)) {
      const n = castAmongHead[1] ?? castAmongHead[4]!;
      const whose = castAmongHead[2] ? (castAmongHead[2] === "your" ? "you" : castAmongHead[2] === "their" ? "that player" : castAmongHead[2].replace(/'s$/, "")) : castAmongHead[3] ?? "you";
      const who = parsePlayer(whose, ctx);
      if (!who) return null;
      const [, many, kinds, total, mv] = castAmong;
      const one = many === "a" || many === "an";
      // Plain "spells" needs "any number of"; "instant and sorcery spells" says it without (Epic Experiment).
      if (!many && kinds !== "instant and sorcery") return null;
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
      effects.push({ type: "castFromAmong", who, n: amt(n), ...(limit !== undefined ? (total ? { totalMv: limit } : { maxMv: limit }) : {}), ...(filter ? { filter } : {}), ...(one ? { max: 1 } : many === "up to two" ? { max: 2 } : {}), ...(rest ? { rest } : {}) });
      si += rest ? 2 : 1;
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
    if (lookTop && si === sentences.length - 1) {
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
    const atRandom = /^[Rr]eveal a card at random from your hand$/.test(s);
    if (/^[Rr]eveal the top card of your library$/.test(s) || (atRandom && /^If that card has the chosen name, /.test(sentences[si + 1] ?? ""))) {
      const r = parseRevealedIf(sentences, si + 1, ctx);
      if (!r) return null;
      effects.push({ type: "revealTop", ...(atRandom ? { randomFromHand: true as const } : {}) }, r.effect);
      si = r.next - 1;
      continue;
    }
    // Dark Confidant: "Reveal the top card of your library and put that card into your hand. You lose life equal to
    // its mana value."
    if (/^[Rr]eveal the top card of your library and put (?:that card|it) into your hand$/.test(s)) {
      const life = /^(You|Each opponent) (?:loses?|(gains?)) life equal to (?:its|that card's|the card's) mana value$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      effects.push({ type: "revealTopToHand", ...(life ? { life: { who: life[1] === "You" ? { ref: "you" } : { ref: "eachOpponent" }, ...(life[2] ? { gain: true } : {}) } } : {}) });
      if (life) si++;
      continue;
    }
    // "Repeat this process once" after a punisher (Remorseless Punishment); "Repeat the following process X times" before
    // one (Torment of Hailfire): the whole process again, the same players each time (rulings).
    if (/^Repeat this process once$/.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "punisher" || prev.times !== undefined) return null;
      effects[effects.length - 1] = { ...prev, times: 2 };
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
    // "You gain life equal to the damage prevented this way": part of the prevention effect before it (CR 615.5).
    // Inkshield: "For each 1 damage prevented this way, create a 2/1 ... token": also part of the prevention (CR 615.5).
    const perDamage = /^For each 1 damage prevented this way, (create an? [^.]+ token(?: with [a-z ]+)?)$/.exec(s);
    const made = perDamage && parseBody(`${perDamage[1]![0]!.toUpperCase()}${perDamage[1]!.slice(1)}.`, {});
    const tokenRider = made && made.targets.length === 0 && made.effects.length === 1 && made.effects[0]!.type === "createToken" ? made.effects[0]! : undefined;
    if (perDamage && !(tokenRider?.type === "createToken" && JSON.stringify(tokenRider.n) === "1" && Object.keys(tokenRider).every((k) => ["type", "token", "n", "who"].includes(k)) && (!tokenRider.who || JSON.stringify(tokenRider.who) === '{"ref":"you"}'))) return null;
    const rider = tokenRider?.type === "createToken" ? { tokens: tokenRider.token } : parsePreventionRider(s);
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
    if (dig) {
      const done = parseDig(s, dig, ctx, digWhere);
      if (!done) return null;
      if (done === "more") continue;
      if (digPaid) effects.push({ type: "may", effects: [done], pay: digPaid.pay, text: digPaid.text });
      else effects.push(done);
      dig = null;
      digPaid = null;
      continue;
    }
    if (payFirst) {
      // "You may pay {2}{W}. When you do, tap target creature." (Thousand Moons Crackshot): paying triggers a reflexive
      // ability with targets of its own, chosen as it's put on the stack (CR 603.12; rulings). The rest of the ability is its.
      const whenPaid = /^When you do, (.+)$/.exec(s);
      if (whenPaid) {
        const reflexive = reflexiveBody([whenPaid[1]!, ...sentences.slice(si + 1)].join(". "), ctx);
        if (!reflexive) return null;
        effects.push({ type: "may", effects: [{ type: "reflexive", body: reflexive }], pay: payFirst.pay, text: `${payFirst.text}. When you do, ${[whenPaid[1]!, ...sentences.slice(si + 1)].join(". ")}` });
        payFirst = null;
        si = sentences.length;
        continue;
      }
      const then = /^If you do, (.+)$/.exec(s);
      if (!then) return null;
      // "You may pay {1}. If you do, look at the top two cards of your library. Put one of them into your hand and the
      // other into your graveyard." (Marchesa): the whole look depends on the payment.
      const lookPaid = new RegExp(`^look at the top ${NUMX} cards? of your library$`).exec(then[1]!);
      if (lookPaid) {
        dig = { type: "dig", n: amt(lookPaid[1]!), reveal: false };
        digPaid = { pay: payFirst.pay, text: `${payFirst.text}. If you do, ${then[1]}` };
        payFirst = null;
        continue;
      }
      const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
      // "You may pay {R}{G}{W}{U}. If you do, until end of turn, whenever he deals combat damage to an opponent, ..."
      // (Human Torch): the delayed triggered ability, and the rest of the paragraph its instructions, if paid.
      const floatingPaid = floatingTrigger(then[1]!, sentences.slice(si + 1));
      if (floatingPaid !== undefined) {
        if (!floatingPaid) return null;
        effects.push({ type: "may", effects: [floatingPaid], pay: payFirst.pay, text: `${payFirst.text}. If you do, ${[then[1]!, ...sentences.slice(si + 1)].join(". ")}` });
        payFirst = null;
        si = sentences.length;
        continue;
      }
      // "You may pay {2}{U}. If you do, exile the top card of your library face down. You may look at that card ... You
      // may play that card ..." (Intet): the exile and its permissions depend on the payment.
      const paidFaceDown = parseFaceDownPlay([cap(then[1]!), ...sentences.slice(si + 1)], 0, ctx);
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
      effects.push({ type: "may", effects: inner, pay: payFirst.pay, text: `${payFirst.text}. If you do, ${then[1]}` });
      payFirst = null;
      continue;
    }
    const mayPay = /^[Yy]ou may pay (.+)$/.exec(s);
    if (mayPay) {
      const pay = parsePayCost(mayPay[1]!);
      if (!pay) return null;
      payFirst = { pay, text: `pay ${mayPay[1]}` };
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
    if (howCast?.ungated && !howCast.not && !howCast.ofTarget && /^you may /i.test(howCast.text) && !/ instead$/.test(howCast.text)) {
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
      if (asCast && !dividedOnly) return false;
      // "~ deals X damage ..., where X is the number of age counters on it" (Magmatic Core): "it" is ~.
      const what = /^~ /.test(s) ? where[2]!.replace(/ counters on it$/, " counters on ~") : where[2]!;
      const counted = parseCount(asCast ? what.slice(0, asCast.index) : what, ctx);
      if (!counted) return false;
      const def = double ? { ...counted, signed: true as const } : counted;
      let replaced = replaceX(added, def);
      if (doubleBoth) {
        const c = def.count;
        const e0 = replaced[0];
        if (replaced.length !== 1 || e0?.type !== "continuous" || e0.mods.length !== 1 || e0.mods[0]!.kind !== "modifyPT" || c.kind !== "power") return false;
        replaced = [{ ...e0, mods: [{ ...e0.mods[0]!, toughness: { count: { ...c, kind: "toughness" }, signed: true } }] }];
      }
      effects.splice(before, effects.length - before, ...replaced);
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
    const BACK = "(?:it|that card|the exiled card|those cards|the exiled cards|them|~)";
    const UNDER = "(its owner's|their owner's|their owners'|your)";
    const laterRe = new RegExp(`^(?:If you do, )?(?:At the beginning of the next end step, return ${BACK} to the battlefield( tapped)? under ${UNDER} control|[Rr]eturn ${BACK} to the battlefield( tapped)? under ${UNDER} control(?: with an? ${COUNTER} counter on it)? at the beginning of the next end step)(?: with an? ${COUNTER} counter on it)?$`);
    const later = laterRe.exec(s);
    // "Exile this Saga, then return it to the battlefield transformed under your control": its back face up (CR 712.14a).
    const now = /^(?:[Tt]hen )?[Rr]eturn (?:it|that card|them|those cards) to the battlefield( transformed)? under (its owner's|their owners'|your) control$/.exec(s);
    if (now && effects[effects.length - 1]?.type === "exile") {
      const prev = effects[effects.length - 1] as Extract<Effect, { type: "exile" }>;
      if (prev.until || prev.linked || isGroup(prev.what) || (now[1] && prev.what.ref !== "self")) return null;
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under: now[2] === "your" ? "you" : "owner", ...(now[1] ? { transformed: true as const } : {}) };
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
      const counter = later[5] ?? later[6];
      laterAt.into[laterAt.at] = { type: "flicker", what: ex.what, under, at: "nextEndStep", ...(counter ? { counter: counterKind(counter) } : {}), ...(later[1] || later[3] ? { tapped: true as const } : {}) };
      continue;
    }
    // "Return target creature card from your graveyard to the battlefield. That creature gains haste until end of turn.
    // Exile it at the beginning of the next end step." (Dawn of the Dead, Corpse Dance): about the permanent that card
    // became (CR 400.7), so part of putting it there.
    // "You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice the creature at
    // the beginning of the next end step." (Sneak Attack), "... Return that creature to your hand at the beginning of the
    // next end step." (Ilharg) likewise.
    const haste = /^(?:That creature|It) gains haste( until end of turn)?$/.exec(s);
    const atEnd = /^(Exile|Sacrifice) (?:it|that creature|the creature) at the beginning of the next end step$/.exec(s) ?? /^(Return) (?:it|that creature) to your hand at the beginning of the next end step$/.exec(s);
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
      const copy = prev?.type === "nextCast" ? prev.effects[prev.effects.length - 1] : prev?.type === "may" && !prev.pay && prev.effects.length === 1 ? prev.effects[0] : prev;
      // "Copy it. If you've completed a dungeon, copy that spell twice instead. You may choose new targets for the
      // copies" (Tomb of Horrors Adventurer): the copies either way.
      const both = prev?.type === "if" ? [...prev.effects, ...(prev.otherwise ?? [])] : [];
      if (both.length === 2 && both.every((e) => e.type === "copySpell")) {
        for (const e of both) if (e.type === "copySpell") e.newTargets = true;
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
    // "Flip a coin. If you win the flip, ... If you lose the flip, ...": decided by that flip (CR 705.2); neither if it
    // wasn't flipped ("you may flip a coin").
    const ifFlip = /^If you (win|lose) the flip, (.+)$/.exec(s);
    if (ifFlip) {
      const flipped = (es: Effect[]): boolean => es.some((e) => (e.type === "flipCoin" && !e.untilLose) || (e.type === "may" && flipped(e.effects)));
      const inner = flipped(effects) && parseOne(ifFlip[2]!.charAt(0).toUpperCase() + ifFlip[2]!.slice(1), ctx);
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
    // "Then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way,
    // you gain 4 life." (Spelunking): about the permanent it became.
    const putThisWay = /^If you put an? ([A-Z][a-z]+|[a-z]+) onto the battlefield this way, (.+)$/.exec(s);
    if (putThisWay) {
      const last = effects[effects.length - 1];
      const put = last?.type === "may" && last.effects.length === 1 ? last.effects[0] : last;
      const filter = parseTargetPhrase(putThisWay[1]!);
      const inner = parseOne(putThisWay[2]!.charAt(0).toUpperCase() + putThisWay[2]!.slice(1), ctx);
      if (put?.type !== "putFromHand" || put.who || put.any || filter?.kind !== "object" || !inner || /(?:it|its|that)/.test(putThisWay[2]!)) return null;
      effects.push({ type: "if", cond: { kind: "putThisWayIs", filter }, effects: inner });
      continue;
    }
    // "For each creature exiled this way, its controller creates a 2/2 green Boar creature token" (Curse of the Swine),
    // "For each creature destroyed this way, its controller draws a card": after the destroy or exile instruction.
    const perThisWay = /^For each (.+?) (destroyed|exiled) this way, its controller (creates an? .+ token(?: with [a-z ]+)?|draws a card)$/.exec(s);
    if (perThisWay) {
      const which = perThisWay[2] as "destroyed" | "exiled";
      const prev = effects[effects.length - 1];
      const spec = parseTargetPhrase(perThisWay[1]!.split(/\s+/).map(singularWord).join(" "), { chosen: true });
      const inner = parseOne(capital(perThisWay[3]!.replace(/^creates/, "create").replace(/^draws/, "draw")), ctx);
      const one = inner?.length === 1 ? inner[0]! : undefined;
      if (prev?.type !== (which === "destroyed" ? "destroy" : "exile") || spec?.kind !== "object" || !one || (one.type !== "createToken" && one.type !== "draw") || one.n !== 1) return null;
      effects.push({ type: "forEachThisWay", which, filter: { ...spec, text: perThisWay[1]! }, effects: [{ ...one, who: { ref: "eachOne" } }] });
      continue;
    }
    // "Mill three cards. You may put a land card from among them into your hand." (Six, Eerie Gravestone), "... from among
    // the cards milled this way ..." (Blanchwood Prowler), "You may put an instant or sorcery card milled this way into
    // your hand" (Leyline Dowser): one of the cards your mill just put into your graveyard, if any matches.
    const fromMilled =
      /^[Yy]ou may put (an? .+?) from among (?:them|the cards milled this way|the milled cards|those cards) into your hand$/.exec(s) ?? /^[Yy]ou may put (an? .+?) milled this way into your hand$/.exec(s);
    if (fromMilled) {
      const prev = effects[effects.length - 1];
      const filter = parseSearchFilter(fromMilled[1]!.replace(/^an? /, ""));
      if (prev?.type !== "mill" || prev.who.ref !== "you" || filter === null) return null;
      effects.push({ type: "chooseFromGraveyard", n: 1, upTo: true, milled: true, ...(filter ? { filter } : {}) });
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
    const otherwise = /^Otherwise, (.+)$/.exec(s);
    if (otherwise) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "if" || (prev.cond.kind !== "wonClash" && prev.cond.kind !== "suspected" && prev.cond.kind !== "milledIs" && prev.cond.kind !== "targetCardWas" && !(prev.cond.kind === "state" && prev.cond.cond.kind === "subjectPT")) || prev.otherwise) return null;
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
      const reflexive = reflexiveBody(whenText, ctx, sacPick || sacrificing, roleOn !== undefined || returned);
      if (!reflexive) return null;
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
    // Gustha's Scepter: "Exile a card from your hand face down. You may look at it for as long as it remains exiled."
    if (/^You may look at it for as long as it remains exiled$/i.test(s)) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exileFaceDown" || prev.from !== "handCard") return null;
      effects[effects.length - 1] = { ...prev, look: true };
      continue;
    }
    // "Put target creature card from a graveyard onto the battlefield under your control. That creature is a black Zombie in
    // addition to its other colors and types." (Rise from the Grave, Liliana, Death's Majesty, Dread Slaver): an effect on
    // the permanent the card became, from then on (CR 611.2c, 400.7); a later color or type change overwrites it (rulings).
    const isAlso = /^That creature is (an? .+ in addition to its other (?:colors and )?types)$/.exec(s);
    if (isAlso) {
      const prev = effects[effects.length - 1];
      const mods = parseBecomes(isAlso[1]!);
      if (prev?.type !== "putOntoBattlefield" || !mods || (prev.what.ref === "target" && prev.what.n) || prev.alsoMods) return null;
      prev.alsoMods = mods;
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
    const ifDid = /^If you (do|don't), (.+)$/.exec(s);
    if (ifDid) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "may" || prev.pay || !prev.effects.every(checkableMay)) return null;
      // "You may sacrifice an artifact, creature, ... If you do, each opponent may sacrifice a permanent of their choice that
      // shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card." (Braids,
      // Arisen Nightmare): a punisher, its penalty once for each opponent who doesn't, "it" being what was sacrificed.
      const oppNot = ifDid[1] === "do" && /^each opponent may sacrifice a permanent of their choice that shares a card type with it$/.test(ifDid[2]!) && prev.effects.length === 1 && prev.effects[0]!.type === "pick" && prev.effects[0]!.action === "sacrifice" ? /^For each opponent who doesn't, that player loses (\d+) life(?: and (you .+))?$/.exec(sentences[si + 1] ?? "") : null;
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
      const sacPick = ifDid[1] === "do" && prev.effects.length === 1 && prev.effects[0]!.type === "pick" && prev.effects[0]!.action === "sacrifice";
      const all = `${ifDid[2]!}${where ? `, where X is ${where[2]!}` : ""}`;
      const sacIt = sacPick && /\b(?:that|the sacrificed) creature's (?:power|toughness|mana value)\b/.test(all) && !/\bthat creature(?!'s (?:power|toughness|mana value)\b)/.test(all) && !ctx.sacrificedIt;
      if (sacIt) ctx.sacrificedIt = true;
      const inner = parseOne(ifDid[2]!.charAt(0).toUpperCase() + ifDid[2]!.slice(1), ctx);
      if (inner) effects.push(ifDid[1] === "do" ? { type: "if", cond: { kind: sacIt ? "sacrificedThisWay" : "youDid" }, effects: inner } : { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner });
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
    const trailIf = !insteadIf ? /^((?:[Dd]raw|[Cc]reate|[Yy]ou gain|[Ee]ach opponent loses|[Pp]ut|[Tt]arget [^,]+ gets) .+) if ((?!it\b|~|that\b|they\b|able\b)[^,]+)$/.exec(s) : null;
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
    const xAtLeast = /^If X is (\d+|one|two|three|four|five|six|seven|eight|nine|ten) or (?:more|greater), (?:also )?(.+)$/.exec(s);
    if (xAtLeast && !/\binstead\b/.test(xAtLeast[2]!)) {
      if (!(ctx.spell || ctx.ownX) || ctx.whereX) return null;
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
      const inner = those ? (prevToken ? [{ ...prevToken, n: amt(those[1]!) }] : null) : parseOne(t.charAt(0).toUpperCase() + t.slice(1), ctx);
      // Only one of the two happens, so neither may wait on a choice or need targets of its own (one "you may"
      // instead would leave nothing done on a "no").
      // A punisher waits on its players but always does its whole process (Court of Ambition's "instead" one), and so do
      // sacrificing and discarding, which only wait on which ones (Vona's Hunger), and so does a search (Entish Restoration).
      if (!inner || !previous.length || ctx.targets.length !== before || [...previous, ...inner].some((e) => pauses(e) && e.type !== "punisher" && !(e.type === "pick" && e.action === "sacrifice") && e.type !== "discard" && e.type !== "search")) return null;
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
      const inner = parseOne(then.charAt(0).toUpperCase() + then.slice(1), ctx);
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
    const may = /^[Yy]ou may (?!play the exiled card |cast a copy of the exiled card |play (?:an|up to \w+) additional lands? this turn|draw [^.]+ unless (?:that player|they|he or she) pays? |draw up to |choose new targets for target |cast spells this turn as though they had flash$|cast (?:that card|it) this turn$)(.+)$/.exec(s);
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
      if ((only?.type === "putFromHand" || only?.type === "tapOrUntap" || only?.type === "castFromHand" || only?.type === "chooseFromGraveyard" || only?.type === "tapAnyNumber") && !/^If you do\b/.test(sentences[si + 1] ?? "")) {
        // castFromHand offers "Don't cast" itself; returning cards from the graveyard can take none.
        effects.push(only.type === "castFromHand" || only.type === "tapAnyNumber" ? only : only.type === "chooseFromGraveyard" ? { ...only, upTo: true } : { ...only, may: true });
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
    // "Choose an opponent. That player ..." (Myrkul's Edict, the Offerings): chosen as it resolves (CR 608.2d), not
    // targeted. One per ability.
    if (/^Choose an opponent$/.test(s)) {
      if (ctx.chosenOpponent || ctx.eventPlayer || ctx.lastPlayerTarget !== undefined) return null;
      effects.push({ type: "choose", choice: "opponent" });
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
    const floating = floatingTrigger(s, sentences.slice(si + 1));
    if (floating !== undefined) {
      if (!floating) return null;
      effects.push(floating);
      si = sentences.length;
      continue;
    }
    // "Until end of turn, X ..." reads the same as "X ... until end of turn".
    if (/^[Uu]ntil end of turn, /.test(s)) s = `${s.replace(/^[Uu]ntil end of turn, /, "").replace(/^./, (c) => c.toUpperCase())} until end of turn`;
    // "Target creature you control gains protection from the color of your choice until end of turn": the
    // color is chosen as it resolves (CR 608.2d), after the target was chosen on casting.
    // "Target creature gains your choice of menace or lifelink until end of turn", "... flying, vigilance, deathtouch, or
    // haste": one of those keywords, chosen as it resolves (CR 608.2d).
    const choiceOf = / (gains?|gain) your choice of ((?:[a-z ]+, )*[a-z ]+,? or [a-z ]+?)(?= until end of turn\b| and |$)/.exec(s);
    if (choiceOf) {
      const options = choiceOf[2]!.split(/,? or |, /).map((w) => keywordOf(w));
      // One such choice per ability: it's kept for the rest of the resolution.
      if (options.length < 2 || options.some((k) => !k || k === CHOSEN_PROTECTION) || effects.some((x) => x.type === "choose" && x.choice === "keyword")) return null;
      effects.push({ type: "choose", choice: "keyword", options: options as string[] });
      s = s.replace(choiceOf[0]!, ` ${choiceOf[1]} ${CHOSEN_KEYWORD}`);
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
  return effects.length ? { targets: ctx.targets, effects, text } : null;
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
const HOW_CAST: { re: string; cond: SpellCondition; not?: true; spellOnly?: true; activatedOnly?: true; noTargets?: true }[] = [
  { re: "~ was bargained", cond: { kind: "bargained" }, spellOnly: true },
  { re: "~ was cast from a graveyard", cond: { kind: "castFromGraveyard" }, spellOnly: true, noTargets: true },
  { re: "~ was cast using teamwork", cond: { kind: "teamwork" }, spellOnly: true },
  // Addendum (CR 207.2c). Not for targets: CastHow doesn't know when it's cast.
  { re: "you cast ~ during your main phase", cond: { kind: "castInMain" }, spellOnly: true, noTargets: true },
  // In a spell, or its permanent's enters trigger (compile checks it's one of those).
  { re: "evidence was collected", cond: { kind: "evidence" } },
  { re: "the gift was promised", cond: { kind: "gift" } },
  { re: "the gift wasn't promised", cond: { kind: "gift" }, not: true },
  // The creature a sacrifice cost sacrificed (compile checks there is one). Costs are paid after targets are chosen
  // (CR 601.2c, 601.2h), so no target can depend on it.
  { re: "the sacrificed creature was suspected", cond: { kind: "sacrificedSuspected" }, noTargets: true },
  { re: "~'s surge cost was paid", cond: { kind: "altPaid", alt: "surge" } },
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
  for (const h of HOW_CAST) {
    if (h.spellOnly && !ctx.spell) continue;
    if (h.activatedOnly && !ctx.activated) continue;
    const found = howCastText(s, h);
    if (found) return { ...found, ...(h.noTargets ? { noTargets: true as const } : {}) };
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
    if (previous.length !== 1 || prev?.type !== "createTokenCopy") return null;
    return { effects: [{ ...prev, n: num(moreCopies[1]!) }], instead };
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
  const fx = parseOne(t, ctx) ?? (/, then (?!shuffle)/.test(t) ? attempt(ctx, thenParts) : null);
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
  const parts = s.split(/, then (?!shuffle)/);
  if (parts.length < 2) return null;
  const out: Effect[] = [];
  for (const [i, p] of parts.entries()) {
    const fx = parseOne(i ? p.charAt(0).toUpperCase() + p.slice(1) : p, ctx);
    if (!fx) return null;
    out.push(...fx);
  }
  return out.slice(0, -1).some((e) => pauses(e)) ? null : out;
}

/** One sentence: a plain instruction, two joined by "and", or one with "for each" / "equal to" in it. */
function parseOne(s: string, ctx: Ctx): Effect[] | null {
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
  const fx = attempt(ctx, () => parsePerOpponent(s, ctx)) ?? attempt(ctx, () => parseSentence(s, ctx)) ?? attempt(ctx, () => parseConjunction(s, ctx)) ?? attempt(ctx, () => parseSharedSubject(s, ctx)) ?? attempt(ctx, () => parseYouList(s, ctx)) ?? attempt(ctx, () => parseForEach(s, ctx)) ?? attempt(ctx, () => parseEqualTo(s, ctx)) ?? attempt(ctx, () => parseThen(s, ctx));
  if (fx) noteLast(ctx, fx);
  return fx;
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
    const picked = last?.type === "pick" && (last.action === "counters" || last.action === "choose") && last.n === 1 && last.who.ref === "you" && !last.among;
    ctx.lastCreated = ((last?.type === "createToken" || last?.type === "createTokenCopy") && last.n === 1) || (faceDown && last.count === 1) || ctx.lastPut || picked;
    ctx.lastCreatedAny = last?.type === "createToken" || last?.type === "createTokenCopy" || last?.type === "myriad" || faceDown;
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
function parsePerOpponent(s: string, ctx: Ctx): Effect[] | null {
  const m = /^[Ff]or each opponent, (.+)$/.exec(s);
  if (!m || ctx.targets.some((t) => t.many || t.perOpponent)) return null;
  const who = / up to one target (.+?) (?:that player|that opponent|they) controls?\b/;
  const t = who.exec(` ${m[1]!}`);
  if (!t) return null;
  const inner = ` ${m[1]!}`.replace(who, ` target ${t[1]} an opponent controls`).trim();
  if (/\b(?:that player|that opponent|they|their)\b/.test(inner)) return null;
  const before = ctx.targets.length;
  const fx = parseSentence(inner.charAt(0).toUpperCase() + inner.slice(1), ctx);
  if (!fx || ctx.targets.length !== before + 1) return null;
  const spec = ctx.targets[before]!;
  if (spec.kind !== "object" || spec.controller !== "opponent" || spec.optional || spec.distinctFrom || spec.notSource) return null;
  ctx.targets[before] = { ...spec, perOpponent: true, text: `target ${t[1]} that player controls` };
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
    case "pick": {
      if (e.type === "counters" && (e.perLastKnownCounter || e.double)) return null;
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
    [/^(?:You )?[Cc]reate a number of (.+?) tokens( with [^,]+?)? equal to (.+)$/, (m) => `Create X ${m[1]} tokens${m[2] ?? ""}`],
  ];
  for (const [re, rewrite, group] of forms) {
    const m = re.exec(s);
    if (!m) continue;
    const fx = parseSentence(rewrite(m), ctx);
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
  const parts = s.split(/,? and (?=(?:you|each|target|draw|~|its|create|put|return|exile|destroy|tap|untap|mill|suspect|convert|transform|after this phase|they gain)\b|get (?:\{E\}|\w+ \{E\}|an amount of \{E\}))/i);
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
  const VERB = String.raw`(?:draws?|loses?|gains?|discards?|mills?|sacrifices?|exiles)`;
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

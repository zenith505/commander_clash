import { allEffects, refCovers, type AbilityBody, type FaceDownPlay, type Amount, type AmountExpr, type Count, type Effect, type ObjRef, type PlayerRef, type SpellCondition, type TargetSpec, type UnlessPays, type PayCost } from "../abilities";
import { substituteX } from "../amounts";
import { num, NUMX, X, amt, ROLL_ROW, counterKind, COUNTER, isGroup, keywordOf, parseSpentReq, SPENT_TO_CAST, WHEEL } from "./words";
import { CHOSEN_KEYWORD, CHOSEN_PROTECTION } from "../keywords";
import { parseStaticCondition } from "./statics";
import { parseCount } from "./counts";
import { parseBecomes, parseDig, parseSentence } from "./sentence";
import { parsePreventionRider } from "./sentences/prevention";
import { compileQuoted } from "./grants";
import { boundAtTargeting, parseObject, parsePlayer, parseTargetPhrase, PERMANENT_TYPES } from "./targets";
import { parseSearchFilter } from "./search";
import { parseManaSpend } from "./mana-abilities";

export interface Ctx {
  targets: TargetSpec[];
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
  /** An instant or sorcery: "other" can't mean other than its source, which isn't a permanent. */
  spell?: boolean;
  /** A "whenever a player casts a spell" trigger: "it" or "that spell" can be the spell cast. */
  castSpell?: boolean;
  /** In a "when you cast this spell" ability: "copy it" is the spell itself. */
  selfCastSpell?: boolean;
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
  /** This sentence defines its own X ("..., where X is ..."): "up to X target ..." isn't the spell's X then. */
  whereX?: boolean;
  /** The ability ends "Round up each time." (CR 107.1a): every "half ..." in it is rounded that way. */
  halfRound?: "up" | "down";
}

/**
 * The instruction after ", then": "Target player draws a card, then discards a card" (Cephalid Looter) is the same player
 * discarding, "that player"; "each player draws ..., then discards ..." each of them.
 */
function thenSubject(first: string, next: string): string {
  const who = /^(Target player|Target opponent|That player|Each player|Each opponent) /.exec(first);
  if (who && /^(?:draws|discards|mills|loses|gains|sacrifices|shuffles) /.test(next)) return `${/^Target /.test(who[1]!) ? "That player" : who[1]} ${next}`;
  return next.charAt(0).toUpperCase() + next.slice(1);
}

/** Starts a results table row's marker sentence (see parseBody). */
const ROW_MARK = "\u0001";

/** Effects that can stop a resolution to wait for a player's choice. */
const PAUSING = new Set<Effect["type"]>(["discard", "reorderGraveyard", "takeFromHand", "scry", "surveil", "orderTop", "handToTop", "may", "explore", "search", "choose", "connive", "recruit", "pick", "clash", "endure", "tapOrUntap", "castFromHand", "punisher", "sacrificeEach", "venture", "chooseFromGraveyard", "keepRest"]);
/** Effects that can stop for a choice partway: they can't share a conditional or a loop with other effects. */
const pauses = (e: Effect) => PAUSING.has(e.type) || (e.type === "putInLibrary" && e.position === "ownersChoice") || (e.type === "roll" && !!e.chooseOne);

/** "You may [this]. If you do, ...": whether it was done is known (see canDoNow in effects.ts). */
const checkableMay = (e: Effect) =>
  e.type === "collectEvidence" ||
  // "You may exile all cards from your hand face down. If you do, ..." (Duplicity): even an empty hand (rulings on
  // exiling or discarding your hand, Herigast).
  (e.type === "exileFaceDown" && e.from === "hand") ||
  (e.type === "discard" && e.who.ref === "you" && e.n === 1 && !e.random) ||
  (e.type === "draw" && e.who.ref === "you") ||
  (e.type === "sacrifice" && e.what.ref === "self") ||
  // "You may remove a charge counter from ~. If you do, you gain 1 life" (Sun Droplet): only with that many on it.
  (e.type === "removeCounters" && e.what.ref === "self" && typeof e.n === "number") ||
  // "You may put the top creature card of defending player's graveyard onto the battlefield. If you do, ..." (Bone Dancer).
  (e.type === "putOntoBattlefield" && e.what.ref === "graveyardEnd" && !e.atEndStep && !e.haste) ||
  // "You may return another creature you control to its owner's hand. If you do, ...": only with one to return. "You may
  // sacrifice a Zombie. If you do, ..." (Wilhelt): only with one to sacrifice.
  (e.type === "pick" && e.who.ref === "you" && (e.action === "bounce" || e.action === "sacrifice") && e.n === 1 && !e.unless) ||
  // "You may have it deal 3 damage to target creature. If you do, ...": done if that target is still legal.
  (e.type === "damage" && (e.to.ref === "target" || e.to.ref === "anyTarget") && !("n" in e.to && e.to.n) && !e.also && !e.divided) ||
  (e.type === "bite" && e.b.ref === "target" && !e.b.n && (e.a.ref === "self" || e.a.ref === "target"));

/**
 * What follows "Reveal the top card of your library": "If it's a creature card, put it into your hand", "If it isn't a
 * creature card, put it into your graveyard", then maybe "Otherwise, [you may] put it ..." and, after "put it onto the
 * battlefield", "That creature gains haste [until end of turn]" and "Sacrifice it at the beginning of the next end step".
 * `next`: the sentence after the last one used.
 */
function parseRevealedIf(sentences: string[], at: number, ctx: Ctx): { effect: Effect; next: number } | null {
  const first = /^If (?:it's|that card is) (not |)(an? .+?|snow) card, (.+)$/.exec(sentences[at] ?? "") ?? /^If it (isn't) (an? .+?) card, (.+)$/.exec(sentences[at] ?? "") ?? /^If that card is ()(snow), (.+)$/.exec(sentences[at] ?? "");
  if (!first) return null;
  const filter = parseSearchFilter(`${first[2]!.replace(/^an? /, "")} card`);
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
      else break;
    }
    next++;
  }
  if (!play && !seen) return null;
  // A face-down card nobody may look at: Duplicity's, without the look (read as a plain sentence).
  const who = parsePlayer(whose, ctx);
  if (!who) return "fail";
  const effect: Effect = { type: "exileFaceDown", from: "top", ...(n !== 1 ? { n } : {}), ...(who.ref !== "you" ? { who } : {}), ...(seen ? { look: true as const } : {}), ...(play ? { play } : {}), ...(upkeepGraveyard ? { upkeepGraveyard: true as const } : {}) };
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
function parseUntilNonland(sentences: string[], at: number, ctx: Ctx): { effect: Effect; next: number } | null | "fail" {
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
function revealedAction(text: string, ctx: Ctx): Effect[] | null {
  // "You may reveal it and put it into your hand" (Frost Augur): a card only looked at is revealed as it's put there.
  const shown = /^you may reveal it and put it into your hand$/.test(text);
  if (shown) return [{ type: "may", effects: [{ type: "revealRevealed" }, { type: "bounce", what: { ref: "revealed" } }], text: "reveal the revealed card and put it into your hand" }];
  const m = /^(you may )?put (?:it|that card) (into your hand|into your graveyard|on the bottom of your library|onto the battlefield( tapped)?(?: under your control)?)$/.exec(text);
  if (!m) {
    // Not about the card: "draw a card" (Track Down, Thrasios).
    if (/(?:it|its|that card|that card's)/.test(text)) return null;
    const before = ctx.targets.length;
    const fx = parseSentence(text.charAt(0).toUpperCase() + text.slice(1), ctx);
    return fx && ctx.targets.length === before && !allEffects(fx).some((e) => PAUSING.has(e.type)) ? fx : null;
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

export function parseBody(text: string, opts: { subject?: boolean; subjectIt?: boolean; subjectLeft?: boolean; selfIt?: boolean; selfCard?: boolean; activated?: boolean; costLinked?: boolean; spell?: boolean; castSpell?: boolean; eventPlayer?: boolean; defending?: boolean; selfCastSpell?: boolean } = {}): AbilityBody | null {
  const modal = MODAL.exec(text.trim());
  if (modal) {
    const body = parseModal(modal[1]!, modal[3]!, text.trim(), opts);
    const how = modal[2]?.trim();
    // Only "choose one", and an ability's (no spell has these).
    if (!body || !how) return body;
    if (modal[1] !== "one" || opts.spell) return null;
    return { ...body, modal: { ...body.modal!, ...(how === "at random" ? { random: true as const } : { unchosen: how.endsWith("this turn") ? ("turn" as const) : ("ever" as const) }) } };
  }
  if (text.includes("•")) return null; // modes with text before them, or a kind of choice we don't support
  const ctx: Ctx = {
    targets: [],
    ...(opts.subject ? { subject: true } : {}),
    ...(opts.subjectIt ? { subject: true, subjectIt: true } : {}),
    ...(opts.subjectLeft ? { subjectLeft: true } : {}),
    ...(opts.selfIt ? { selfIt: true } : {}),
    ...(opts.selfCard ? { selfCard: true } : {}),
    ...(opts.activated ? { activated: true } : {}),
    ...(opts.costLinked ? { costLinked: true } : {}),
    ...(opts.spell ? { spell: true } : {}),
    ...(opts.castSpell ? { castSpell: true } : {}),
    ...(opts.eventPlayer ? { eventPlayer: true } : {}),
    ...(opts.defending ? { defending: true } : {}),
    ...(opts.selfCastSpell ? { selfCastSpell: true } : {}),
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
  text = text.replace(/ gains flashback until end of turn\. (?:The|Its) flashback cost is equal to (?:its|that card's) mana cost\./g, " gains flashback with its mana cost until end of turn.");
  // Search for Survivors: "An opponent chooses a card at random in your graveyard. If it's a creature card, put it onto the
  // battlefield. Otherwise, exile it." The choice is at random, so who makes it changes nothing: one instruction.
  text = text.replace(/An opponent chooses a card at random in your graveyard\. If it's a creature card, put it onto the battlefield\. Otherwise, exile it\./, "Put a card chosen at random from your graveyard onto the battlefield if it's a creature card, otherwise exile it.");
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
    // Not after "If you do,": all of it depends on the payment ("If you do, choose a color, then ...").
    // Not after a leading condition either: "If you control a blue creature, draw a card, then discard a card" (Statute
    // of Denial) is all conditional.
    .flatMap((x) => (/^If [^,]+, /.test(x) || WHEEL.test(x) || /^\w+ player shuffles their .+ into their library, then draws /.test(x) ? [x] : x.split(/, then (?!shuffle|sacrifices the rest$)/).map((p, i, all) => (i ? thenPart(thenSubject(all[0]!, p)) : p))))
    // "Target opponent reveals their hand and you choose a nonland card from it": two instructions, in order.
    .flatMap((x) => x.split(/(?<=reveals (?:their|his or her) hand) and (?=you choose )/).map((p, i) => (i ? p.charAt(0).toUpperCase() + p.slice(1) : p)))
    .flatMap(splitSpentPair)
    // "Put a +1/+1 counter on ~ and it can't be blocked this turn" (Sahagin): two instructions, both about ~.
    .flatMap((x) => {
      // Not under a leading condition ("If you do, put ... and it gains menace"): the condition is for both.
      const m = /^If /.test(x) ? null : /^(.*\b(?:counters? on ~|[Ss]acrifice ~)) and it ((?:gains|gets|can't|deals) .+)$/.exec(x);
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
  for (let si = 0; si < sentences.length; si++) {
    let s = sentences[si]!.replace(/^Then,? (.)/, (_, c: string) => c.toUpperCase());
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
    // Impulse draw: "Exile the top two cards of your library. Until the end of your next turn, you may play those cards."
    // Under a condition about how it was cast (Elemental Mascot's "If five or more mana was spent to cast that spell, exile
    // the top card of your library. You may play that card until the end of your next turn."), both sentences are.
    const impulseIf = /^If [^,]+, exile the top /.test(s) ? parseHowCast(s, ctx) : null;
    const exTop = new RegExp(`^[Ee]xile the top (?:card|${NUMX} cards) of your library$`).exec(impulseIf && !impulseIf.not ? impulseIf.text : s);
    // With no duration (Dungeon of the Mad Mage's Runestone Caverns), for as long as each card stays exiled (CR 611.2a, 400.7).
    const playIt = exTop && sentences[si + 1] && /^(?:(Until the end of your next turn|Until end of turn), you may play (?:that card|those cards|them)|You may play (?:that card|those cards|them|it)(?: (this turn|until the end of your next turn))?)$/.exec(sentences[si + 1]!.replace(/\.$/, ""));
    if (exTop && playIt) {
      const when = (playIt[1] ?? playIt[2] ?? "").toLowerCase();
      const impulse: Effect = { type: "impulse", n: exTop[1] ? amt(exTop[1]) : 1, until: !when ? "exiled" : /next turn/.test(when) ? "nextTurn" : "thisTurn" };
      effects.push(impulseIf && !impulseIf.not ? { type: "if", cond: impulseIf.cond, effects: [impulse] } : impulse);
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
    const castAmong = castAmongHead && /^You may cast any number of spells(?: with (total )?mana value (\d+|X) or less)? from among (?:them|cards exiled this way) without paying their mana costs$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
    // Improvisation Capstone: "Exile cards from the top of your library until you exile cards with total mana value 4 or
    // greater."
    const untilMv = /^Exile cards from the top of your library until you exile cards with total mana value (\d+) or greater$/.exec(s);
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
      const limit = castAmong[2] ? amt(castAmong[2]) : undefined;
      effects.push({ type: "castFromAmong", who, n: amt(n), ...(limit !== undefined ? (castAmong[1] ? { totalMv: limit } : { maxMv: limit }) : {}) });
      si++;
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
    if (lookTop && si === sentences.length - 1) {
      const who = parsePlayer(lookTop[1] === "your" ? "you" : lookTop[1]!.replace(/'s$/, ""), ctx);
      if (!who) return null;
      effects.push({ type: "orderTop", who, n: 1 });
      continue;
    }
    // "Reveal the top card of your library. If it's a creature card, put it into your hand. Otherwise, you may put it into
    // your graveyard." (Nylea, Keen-Eyed; CR 701.20a): what's done depends on the revealed card's printed characteristics;
    // it stays in the library until an instruction moves it.
    if (/^[Rr]eveal the top card of your library$/.test(s)) {
      const r = parseRevealedIf(sentences, si + 1, ctx);
      if (!r) return null;
      effects.push({ type: "revealTop" }, r.effect);
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
    // "You gain life equal to the damage prevented this way": part of the prevention effect before it (CR 615.5).
    const rider = parsePreventionRider(s);
    if (rider) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "damageRule" || prev.rule.redirect) return null;
      effects[effects.length - 1] = { ...prev, rule: { ...prev.rule, ...rider } };
      continue;
    }
    // Hand disruption: "Target opponent reveals their hand. You choose a nonland card from it. That player discards
    // that card." Another player picks the card (CR 701.9b), among those that match.
    const choose = /^You choose an? (.+?) from it( with mana value \d+ or (?:less|greater))?( and exile that card)?$/.exec(s);
    if (choose) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "lookAtHand" || !prev.reveal) return null;
      const then = choose[3] ? "exile" : /^(?:That player discards that card|(?:That player exiles|Exile) that card( until ~ leaves the battlefield)?)$/.exec(sentences[si + 1]?.replace(/\.$/, "") ?? "");
      if (!then) return null;
      // "Exile that card until ~ leaves the battlefield" (Kitesail Freebooter, CR 610.3): only an ability of a permanent.
      const until = typeof then !== "string" && !!then[1];
      if (until && opts.spell) return null;
      const filter = parseSearchFilter(`${choose[1]}${choose[2] ?? ""}`);
      if (filter === null) return null;
      effects.push({ type: "takeFromHand", who: prev.who, ...(filter ? { filter } : {}), action: typeof then !== "string" && /discards/.test(then[0]) ? "discard" : "exile", ...(until ? { until: "sourceLeaves" as const } : {}) });
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
    const atMost = /^(.+) if (?:its|that creature's|that card's) (power|toughness|mana value) is less than or equal to (.+)$/.exec(s);
    if (atMost) {
      const fx = parseOne(atMost[1]!, ctx);
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
    // "..., where X is the number of creatures you control": X is defined by the text (CR 107.3c).
    // It's read after the rest of the sentence, which may name what it counts ("that player's hand").
    const where = /^(.+), where X is (.+)$/.exec(s);
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
      const def = parseCount(asCast ? what.slice(0, asCast.index) : what, ctx);
      if (!def) return false;
      effects.splice(before, effects.length - before, ...replaceX(added, def));
      for (let k = targetsBefore; k < ctx.targets.length; k++) {
        const t = ctx.targets[k]!;
        // "Counter target spell with mana value X or less, where X is the number of Faeries you control": not the X
        // announced but an amount compared as the target is chosen and again as it resolves (TargetSpec.bound; CR 601.2c,
        // 608.2b; rulings on Spellstutter Sprite). Only an amount that can be worked out then.
        if (t.xRange) {
          if (t.xRange.at === "exact" || !boundAtTargeting(def)) return false;
          const { xRange, ...rest } = t;
          ctx.targets[k] = { ...rest, bound: { key: xRange.key, at: xRange.at === "least" ? "least" : "most", amount: def } };
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
    const later =
      /^(?:At the beginning of the next end step, return (?:it|that card|the exiled card) to the battlefield under (its owner's|your) control|Return (?:it|that card|the exiled card) to the battlefield under (its owner's|your) control at the beginning of the next end step)(?: with an? (\+1\/\+1) counter on it)?$/i.exec(s);
    const now = /^(?:[Tt]hen )?[Rr]eturn (?:it|that card|them|those cards) to the battlefield under (its owner's|their owners'|your) control$/.exec(s);
    if (now && effects[effects.length - 1]?.type === "exile") {
      const prev = effects[effects.length - 1] as Extract<Effect, { type: "exile" }>;
      if (prev.until || prev.linked || isGroup(prev.what)) return null;
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under: now[1] === "your" ? "you" : "owner" };
      continue;
    }
    if (later) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exile" || prev.until || prev.linked || isGroup(prev.what) || effects.length - 1 < 0) return null;
      const under = (later[1] ?? later[2]) === "your" ? "you" : "owner";
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under, at: "nextEndStep", ...(later[3] ? { counter: "+1/+1" as const } : {}) };
      continue;
    }
    // "Return target creature card from your graveyard to the battlefield. That creature gains haste until end of turn.
    // Exile it at the beginning of the next end step." (Dawn of the Dead, Corpse Dance): about the permanent that card
    // became (CR 400.7), so part of putting it there.
    const haste = /^(?:That creature|It) gains haste( until end of turn)?$/.exec(s);
    const atEnd = /^(Exile|Sacrifice) (?:it|that creature) at the beginning of the next end step$/.exec(s);
    if (haste || atEnd) {
      const last = effects[effects.length - 1];
      const put = last?.type === "may" && last.effects.length === 1 ? last.effects[0] : last;
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
      const copy = prev?.type === "nextCast" ? prev.effects[prev.effects.length - 1] : prev;
      // "Copy it. If you've completed a dungeon, copy that spell twice instead. You may choose new targets for the
      // copies" (Tomb of Horrors Adventurer): the copies either way.
      const both = prev?.type === "if" ? [...prev.effects, ...(prev.otherwise ?? [])] : [];
      if (both.length === 2 && both.every((e) => e.type === "copySpell")) {
        for (const e of both) if (e.type === "copySpell") e.newTargets = true;
        continue;
      }
      if (copy?.type !== "copySpell") return null;
      copy.newTargets = true;
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
    const otherwise = /^Otherwise, (.+)$/.exec(s);
    if (otherwise) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "if" || (prev.cond.kind !== "wonClash" && prev.cond.kind !== "suspected") || prev.otherwise) return null;
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
      if ((!rolled && (prev?.type !== "may" || prev.pay || !prev.effects.every((e) => e.type === "collectEvidence"))) || si !== sentences.length - 1) return null;
      // Its own "where X is ..." goes with it.
      const whenText = where ? `${whenDo[1]!}, where X is ${where[2]!}` : whenDo[1]!;
      const reflexive = parseBody(`${whenText.charAt(0).toUpperCase()}${whenText.slice(1)}.`, {
        ...(ctx.subjectIt ? { subjectIt: true } : ctx.subject ? { subject: true } : {}),
        ...(ctx.selfIt ? { selfIt: true } : {}),
        ...(ctx.selfCard ? { selfCard: true } : {}),
        ...(ctx.activated ? { activated: true } : {}),
        ...(ctx.eventPlayer ? { eventPlayer: true } : {}),
        ...(ctx.defending ? { defending: true } : {}),
      });
      if (!reflexive || reflexive.modal) return null;
      effects.push(rolled ? { type: "reflexive", body: reflexive } : { type: "if", cond: { kind: "youDid" }, effects: [{ type: "reflexive", body: reflexive }] });
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
      const inner = parseOne(ifDid[2]!.charAt(0).toUpperCase() + ifDid[2]!.slice(1), ctx);
      if (!inner) return null;
      effects.push(ifDid[1] === "do" ? { type: "if", cond: { kind: "youDid" }, effects: inner } : { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner });
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
      // sacrificing and discarding, which only wait on which ones (Vona's Hunger).
      if (!inner || !previous.length || ctx.targets.length !== before || [...previous, ...inner].some((e) => pauses(e) && e.type !== "punisher" && !(e.type === "pick" && e.action === "sacrifice") && e.type !== "discard")) return null;
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
    const may = /^[Yy]ou may (?!play the exiled card |play (?:an|up to \w+) additional lands? this turn)(.+)$/.exec(s);
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
      if ((only?.type === "putFromHand" || only?.type === "tapOrUntap" || only?.type === "castFromHand" || only?.type === "chooseFromGraveyard") && !/^If you do\b/.test(sentences[si + 1] ?? "")) {
        // castFromHand offers "Don't cast" itself; returning cards from the graveyard can take none.
        effects.push(only.type === "castFromHand" ? only : only.type === "chooseFromGraveyard" ? { ...only, upTo: true } : { ...only, may: true });
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
    const lapse = /^If that spell is countered this way, (?:(exile it) instead of putting it into its owner's graveyard|put it on top of its owner's library instead of into that player's graveyard)$/i.exec(s);
    if (lapse) {
      const last = effects[effects.length - 1];
      if (last?.type !== "counterSpell") return null;
      if (lapse[1]) last.exile = true;
      else last.top = true;
      continue;
    }
    // "It's still a land." keeps the land type a "becomes a creature" effect would replace (CR 205.1a).
    if (/^(?:It's still an? (land|artifact|enchantment)|They're still (?:lands|artifacts|enchantments))$/i.test(s)) {
      const last = [...effects].reverse().find((e) => e.type === "continuous" && e.mods.some((x) => x.kind === "setTypes" || (x.kind === "addTypes" && x.types.includes("Creature"))));
      if (!last || last.type !== "continuous") return null;
      // "Becomes a 2/2 Assembly-Worker artifact creature" already keeps its card types (CR 205.1b).
      last.mods = last.mods.map((x) => (x.kind === "setTypes" ? { kind: "addTypes", types: x.types, subtypes: x.subtypes } : x));
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
  { re: "~ was cast using teamwork", cond: { kind: "teamwork" }, spellOnly: true },
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
  const more = /^(?:It|~) deals (\d+|X) damage(?: to (?:that creature|that player|it))?$/.exec(t);
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
  // "If {B}{R} was spent to cast ~, you choose the permanents for each player instead" (Mythos of Snapdax): the same
  // choices, all made by you, and still legal ones (rulings).
  if (instead && /^You choose the permanents for each player$/.test(t)) {
    const prev = previous[0];
    return previous.length === 1 && prev?.type === "keepRest" ? { effects: [{ ...prev, youChoose: true }], instead } : null;
  }
  t = t.replace(/^It deals /, "~ deals ");
  const before = ctx.targets.length;
  const fx = parseOne(t, ctx);
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

/** What "it", "they" and "those creatures" can mean after these effects (the token just created, the group changed). */
function noteLast(ctx: Ctx, fx: Effect[]) {
  const last = fx[fx.length - 1];
  {
    // A card just manifested or cloaked is "it" too (the dig puts it in `created`).
    const faceDown = last?.type === "dig" && (last.into === "manifest" || last.into === "cloak");
    // One card put onto the battlefield: "Put a +1/+1 counter on it", "It gains haste until your next turn".
    const put = last?.type === "may" && last.effects.length === 1 ? last.effects[0] : last;
    ctx.lastPut = put?.type === "putOntoBattlefield" && ((put.what.ref === "target" && !put.what.n) || put.what.ref === "graveyardEnd") && !put.attachToSubject;
    ctx.lastCreated = ((last?.type === "createToken" || last?.type === "createTokenCopy") && last.n === 1) || (faceDown && last.count === 1) || ctx.lastPut;
    ctx.lastCreatedAny = last?.type === "createToken" || last?.type === "createTokenCopy" || faceDown;
    // "Creatures you control get +1/+1 until end of turn. Untap those creatures": the ones it changed (CR 611.2c).
    if (last?.type === "continuous" && last.what.ref === "each" && (last.duration === "endOfTurn" || last.duration === "yourNextTurn")) ctx.lastGroup = { ref: "affected" };
    // "Put a +1/+1 counter on each creature you control. Untap those creatures": still the same ones.
    if (last?.type === "counters" && last.what.ref === "each") ctx.lastGroup = last.what;
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
    if (o.count && (o.count as Count).kind === "x") return true;
    if (o.many === "x" || o.many === "exactX") return true; // "X target creatures"
    return Object.values(o).some(usesX);
  }
  return false;
}

/** What "unless its controller pays ..." asks for: "{2}", "{X}", "{1} for each card in your hand", "{2} and 2 life". */
export function parseUnlessPays(text: string, ctx: Ctx): UnlessPays | null {
  let m: RegExpExecArray | null;
  if (text === "{X}") return { cost: "", generic: X };
  if ((m = /^((?:\{(?:\d+|[WUBRGC])\})+)(?: and (\d+) life)?$/.exec(text))) return { cost: m[1]!, ...(m[2] ? { life: Number(m[2]) } : {}) };
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
    case "preventNext": {
      if (e.type === "counters" && e.perLastKnownCounter) return null;
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
const MODAL = /^[Cc]hoose (one|two|three|one or both|one or more|up to one)( that hasn't been chosen(?: this turn)?| at random)? —\s*((?:•[^•]+)+)$/;

/** How many modes each "Choose ..." allows (CR 700.2), given how many there are. */
const MODE_COUNTS: Record<string, (n: number) => [number, number]> = {
  one: () => [1, 1],
  two: () => [2, 2],
  three: () => [3, 3],
  "one or both": () => [1, 2],
  "one or more": (n) => [1, n],
  "up to one": () => [0, 1],
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
  const [min, max] = MODE_COUNTS[count]!(modes.length);
  if (modes.length < 2 || max > modes.length) return null;
  return { targets: [], effects: [], text, modal: { min, max, modes } };
}

/** "X and Y" where each half is its own effect. */
function parseConjunction(s: string, ctx: Ctx): Effect[] | null {
  const parts = s.split(/,? and (?=(?:you|each|target|draw|~|its|create|put|return|exile|destroy|tap|untap|mill|suspect|after this phase)\b|get (?:\{E\}|\w+ \{E\}|an amount of \{E\}))/i);
  if (parts.length < 2) return null;
  const out: Effect[] = [];
  for (const p of parts) {
    const fx = parseSentence(p.charAt(0).toUpperCase() + p.slice(1), ctx);
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
  const VERB = String.raw`(?:draws?|loses?|gains?|discards?|mills?)`;
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
  const one = (t: string) => attempt(ctx, () => parseSentence(t, ctx)) ?? attempt(ctx, () => parseEqualTo(t, ctx));
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

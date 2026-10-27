import type { Amount, AmountExpr, Modification, Effect, PlayerRef, TargetSpec } from "../abilities";
import { CHOSEN_LAND_TYPE, CHOSEN_TYPE, CREATURE_TYPES } from "../keywords";
import type { Color } from "../types";
import { num, PT, ptAmt, COLOR_WORDS, TYPE_WORDS, WHEEL, COUNTER, counterKind, X, capital } from "./words";
import { Ctx, parseBody } from "./body";
import { parseSearchFilter } from "./search";
import { parseCount } from "./counts";
import { parseKeywordList, parseObject, parsePlayer } from "./targets";
import { parseGrants } from "./grants";
import { parseBasicsSentence } from "./sentences/basics";
import { parseEveryPlayerZonesSentence, parseZonesSentence } from "./sentences/zones";
import { parsePermanentsSentence } from "./sentences/permanents";
import { parseTokensSentence } from "./sentences/tokens";
import { parseSpellsSentence } from "./sentences/spells";
import { parseCopiesSentence } from "./sentences/copies";
import { parsePreventionSentence } from "./sentences/prevention";
import { parseNamesSentence } from "./sentences/names";

/**
 * The sentences after "Look at (Reveal) the top N cards of your library": which to take ("Put one of them
 * into your hand", "You may reveal a creature card from among them and put it into your hand", "You may
 * put one of those cards back on top of your library") and where the rest go ("Put the rest into your
 * graveyard", "on the bottom of your library in a random order"). "more" while the rest is still to come.
 */
/** The card types a card in a library can have (CR 205.2a); not the ones of cards outside the game (plane, scheme, ...). */
const CARD_TYPES_IN_DECKS = ["Artifact", "Battle", "Creature", "Enchantment", "Instant", "Kindred", "Land", "Planeswalker", "Sorcery"];

export function parseDig(s: string, dig: Partial<Extract<Effect, { type: "dig" }>>, ctx?: Ctx, whereX?: AmountExpr): Extract<Effect, { type: "dig" }> | "more" | null {
  const REST = "(into your graveyard|into your hand|on the bottom(?: of your library)?(?: in (?:any|a random) order)?)";
  // "You may reveal a creature card ... from among them and put it onto the battlefield" (Loot, Exuberant Explorer): the
  // same as putting it there, revealed.
  s = s.replace(/^You may reveal (an? .+?) from among them and put it onto the battlefield$/, "You may put $1 from among them onto the battlefield");
  // "Onto the battlefield tapped and attacking" (Winota): attacking as it enters, during combat (CR 508.4).
  const attacking = dig.into === undefined && / from among them onto the battlefield tapped and attacking$/.test(s);
  if (attacking) s = s.replace(/ tapped and attacking$/, " tapped");
  // Without "in a random order", the owner arranges the cards going to the bottom (CR 401.4).
  const restOf = (r: string) => (r === "into your graveyard" ? { rest: "graveyard" as const } : r === "into your hand" ? { rest: "hand" as const } : / random /.test(r) ? { rest: "bottom" as const, random: true as const } : { rest: "bottom" as const });
  let m: RegExpExecArray | null;
  // Consult the Star Charts: "Put one of those cards into your hand. If ~ was kicked, put two of those cards into your hand
  // instead." More of them, when it was kicked (CR 702.33e).
  if (dig.into === "hand" && dig.rest === undefined && dig.kickedCount === undefined && ctx?.spell && (m = /^If (?:~|this spell) was kicked, put (two|three) of (?:them|those cards) into your hand instead$/.exec(s))) {
    dig.kickedCount = num(m[1]!);
    return "more";
  }
  if (dig.into === undefined) {
    // Stargaze: "Put X cards from among them into your hand", the X it was cast with.
    if ((m = new RegExp(`^Put (one|two|three|X) (?:of (?:them|those cards)|cards? from among them) into your hand(?: and (?:the rest|the other) ${REST})?$`).exec(s))) {
      if (m[1] === "X" && !ctx?.spell) return null;
      Object.assign(dig, m[1] === "X" ? { count: 0, countX: true, upTo: false, into: "hand" } : { count: num(m[1]!), upTo: false, into: "hand" });
      if (m[2]) Object.assign(dig, restOf(m[2]));
    } else if ((m = /^You may (?:reveal (an? [^,]+? card) and\/or (an? [^,]+? card) from among them and put (?:them|the revealed cards)|put (an? [^,]+? card) and\/or (an? [^,]+? card) from among them) into your hand$/.exec(s))) {
      // "You may put a creature card and/or a land card from among them into your hand" (Kiora, Master of the Depths): up
      // to one card for each, a card that's both being either one (as Krosan Verge's search, oneOfEach).
      const specs = [m[1] ?? m[3], m[2] ?? m[4]].map((w) => parseSearchFilter(w!.replace(/^an? /, "")));
      if (specs.some((f) => !f)) return null;
      const anyOf = specs as NonNullable<(typeof specs)[number]>[];
      Object.assign(dig, { count: 2, upTo: true, filter: { kind: "card", anyOf, text: `${m[1] ?? m[3]} and/or ${m[2] ?? m[4]}`.replace(/^an? /, "") }, oneOfEach: anyOf, into: "hand" });
    } else if ((m = /^You may reveal (an? [A-Z][a-z]+ card), (an? [A-Z][a-z]+ card), and\/or (an? [A-Z][a-z]+ card) from among them and put them into your hand$/.exec(s))) {
      // "You may reveal an Angel card, a Demon card, and/or a Dragon card from among them and put them into your hand"
      // (Kaalia, Zenith Seeker): up to one of each, as Kiora's two above.
      const specs = [m[1]!, m[2]!, m[3]!].map((w) => parseSearchFilter(w.replace(/^an? /, "")));
      if (specs.some((f) => !f)) return null;
      const anyOf = specs as NonNullable<(typeof specs)[number]>[];
      Object.assign(dig, { count: 3, upTo: true, filter: { kind: "card", anyOf, text: `${m[1]}, ${m[2]}, and/or ${m[3]}`.replace(/^an? /, "") }, oneOfEach: anyOf, into: "hand" });
    } else if (/^For each card type, you may put a card of that type from among (?:them|the revealed cards) into your hand$/.test(s)) {
      // Atraxa, Grand Unifier: up to one card for each card type (CR 205.2a), a card with more than one type taken as any
      // one of them (rulings), as Kiora's "and/or" (oneOfEach).
      const anyOf: TargetSpec[] = CARD_TYPES_IN_DECKS.map((t) => ({ kind: "card", types: [t], text: `${t.toLowerCase()} card` }));
      Object.assign(dig, { count: anyOf.length, upTo: true, filter: { kind: "card", anyOf, text: "card of each card type" }, oneOfEach: anyOf, into: "hand" });
    } else if ((m = new RegExp(`^Put any number of ([^,]+? cards) from among them into your hand and the rest ${REST}$`).exec(s))) {
      // "Put any number of legendary cards from among them into your hand and the rest into your graveyard" (Dihada).
      const filter = parseSearchFilter(m[1]!.replace(/\bcards\b/, "card"));
      if (!filter || / of the chosen /.test(m[1]!)) return null;
      Object.assign(dig, { count: 99, upTo: true, filter, into: "hand" }, restOf(m[2]!));
    } else if (dig.reveal && (m = new RegExp(`^Put (an? .+? card) from among them into your hand(?: and the rest ${REST})?$`).exec(s))) {
      // "Reveal the top six cards ... Put an Assassin, Pirate, or Vehicle card from among them into your hand and the rest
      // on the bottom" (Adéwalé, Breaker of Chains): one that fits must be taken, if there's one (the cards are revealed).
      const filter = parseSearchFilter(m[1]!.replace(/^an? /, ""));
      if (!filter || / of the chosen /.test(m[1]!)) return null;
      Object.assign(dig, { count: 1, upTo: false, required: true, filter, into: "hand" });
      if (m[2]) Object.assign(dig, restOf(m[2]));
    } else if ((m = /^You may reveal (any number of|up to two|up to three) ([^,]+? cards) from among them and put (?:them|the revealed cards) into your hand$/.exec(s))) {
      // "You may reveal any number of Rat cards from among them and put the revealed cards into your hand" (Karumonix).
      // Reality Heist: "You may reveal up to two artifact cards from among them and put them into your hand".
      const filter = parseSearchFilter(m[2]!.replace(/\bcards\b/, "card"));
      if (!filter || / of the chosen /.test(m[2]!)) return null;
      Object.assign(dig, { count: m[1] === "any number of" ? 99 : num(m[1]!.slice(6)), upTo: true, filter, into: "hand", reveal: true });
    } else if ((m = /^You may (?:reveal (an? .+?) from among them and put (?:it|that card)|put (an? .+?) from among them) into your hand$/.exec(s))) {
      // "A creature card of the chosen type" (Icon of Ancestry): the type chosen as the permanent entered (bindChosen).
      const phrase = (m[1] ?? m[2])!.replace(/^an? /, "");
      const ofChosen = / of the chosen type$/.exec(phrase);
      const filter = parseSearchFilter(ofChosen ? phrase.slice(0, ofChosen.index) : phrase);
      if (!filter || (ofChosen && (!ctx || ctx.spell || !filter.types?.includes("Creature")))) return null;
      Object.assign(dig, { count: 1, upTo: true, filter: ofChosen ? { ...filter, chosen: "type", text: phrase } : filter, into: "hand" });
    } else if ((m = new RegExp(`^(You may put|Put) (an?|up to (?:one|two|three)|any number of|all) (.+?) from among them onto the battlefield( tapped)?(?: with an? ${COUNTER} counter on it)?(?: and the rest ${REST})?$`).exec(s.replace(/, then shuffle$/, "")))) {
      // "You may put a land card from among them onto the battlefield tapped" (Freestrider Lookout), "Put up to two creature
      // cards with mana value 3 or less from among them onto the battlefield" (Collected Company): several enter at the
      // same time (enterTogether). "Put a land card ..." takes one if there is one; "all" every one that matches.
      const how = m[2]!;
      const count = /^an?$/.test(how) ? 1 : /^up to /.test(how) ? num(how.slice(6)) : 99;
      const required = how === "all" || (/^an?$/.test(how) && m[1] === "Put");
      if (/^(?:an?|up to one)$/.test(how) === /cards\b/.test(m[3]!)) return null;
      // "With mana value X or less": the X it was cast or activated with (TargetSpec.xRange), or the X the look's "where X
      // is ..." defined (Hatchery Spider), counted as it resolves (TargetSpec.bound).
      let what = m[3]!.replace(/\bcards\b/, "card").replace(/ and\/or /, " or ");
      // "Any number of nonland permanent cards with total mana value 4 or less" (Ao, the Dawn Sky): all the cards taken
      // together, a card with {X} in its mana cost counting X as 0 (CR 202.3e).
      const total = how === "any number of" ? / with total mana value (\d+) or less$/.exec(what) : null;
      if (total) what = what.slice(0, total.index);
      const mvX = / with mana value X or less$/.exec(what);
      // "With mana value less than or equal to the number of lands you control" (Loot): counted as it resolves.
      const mvCount = / with mana value less than or equal to (.+)$/.exec(what);
      if (mvCount) {
        const amount = parseCount(mvCount[1]!, ctx ?? null);
        if (!amount) return null;
        whereX = amount;
        what = what.slice(0, mvCount.index);
      }
      if (mvX) {
        if (!ctx || (!whereX && !(ctx.spell || ctx.activated || ctx.selfCastSpell)) || ctx.whereX) return null;
        what = what.slice(0, mvX.index);
      }
      const filter = parseSearchFilter(what);
      if (!filter) return null;
      if (mvX || mvCount) Object.assign(filter, { ...(whereX ? { bound: { key: "manaValue", at: "most", amount: whereX } } : { xRange: { key: "manaValue", at: "most" } }), text: mvCount ? `${filter.text} with mana value less than or equal to ${mvCount[1]}` : `${filter.text} with mana value X or less` });
      if (total) Object.assign(filter, { text: `${filter.text} with total mana value ${total[1]} or less` });
      if (attacking && (count !== 1 || !filter.types?.includes("Creature"))) return null;
      Object.assign(dig, { count, upTo: !required, ...(required ? { required: true } : {}), filter, ...(total ? { totalMv: Number(total[1]) } : {}), into: "battlefield", ...(m[4] ? { tapped: true } : {}), ...(attacking ? { attacking: true } : {}), ...(m[5] ? { counters: { counter: counterKind(m[5]), n: 1 } } : {}) });
      if (m[6]) Object.assign(dig, restOf(m[6]));
      // "Put any number of land cards from among them onto the battlefield tapped, then shuffle" (Famished Worldsire).
      else if (/, then shuffle$/.test(s)) Object.assign(dig, { rest: "shuffle" });
    } else if ((m = new RegExp(`^(You may exile|Exile) one of (?:them|those cards)(?: and put the rest ${REST})?$`).exec(s))) {
      // "You may exile one of those cards ... You may play the exiled card this turn" (Nahiri's Warcrafting, Florian): the
      // permission is the sentence after (see parseBody).
      Object.assign(dig, { count: 1, upTo: m[1] === "You may exile", into: "exile" });
      if (m[2]) Object.assign(dig, restOf(m[2]));
    } else if ((m = /^You may exile (an? .+? card) from among them$/.exec(s))) {
      // "You may exile a nonland card from among them" (The Key to the Vault): what's done with it is the sentence after the
      // rest go to the bottom (see parseBody).
      const filter = parseSearchFilter(m[1]!.replace(/^an? /, ""));
      if (!filter) return null;
      Object.assign(dig, { count: 1, upTo: true, filter, into: "exile" });
    } else if (/^You may put one of (?:them|those cards) back on top of your library$/.test(s)) {
      Object.assign(dig, { count: 1, upTo: true, into: "libraryTop" });
    } else if ((m = new RegExp(`^Put one of (?:them|those cards) on top of your library(?: and the rest ${REST})?$`).exec(s))) {
      // Cream of the Crop: one of them must go back on top.
      Object.assign(dig, { count: 1, upTo: false, required: true, into: "libraryTop" });
      if (m[1]) Object.assign(dig, restOf(m[1]));
    } else if ((m = new RegExp(`^Put up to one of them on top of your library(?: and the rest ${REST})?$`).exec(s))) {
      // Thassa's Oracle.
      Object.assign(dig, { count: 1, upTo: true, into: "libraryTop" });
      if (m[1]) Object.assign(dig, restOf(m[1]));
    } else return null;
    return dig.rest ? (dig as Extract<Effect, { type: "dig" }>) : "more";
  }
  // Turntimber Symbiosis: "If that card has mana value 3 or less, it enters with three additional +1/+1 counters on it":
  // a replacement for how it enters (CR 614.1c), checked as it's put there.
  if ((m = /^If that card has mana value (\d+) or less, it enters with (one|two|three|four|five|an) additional \+1\/\+1 counters? on it$/.exec(s))) {
    if (dig.into !== "battlefield" || dig.count !== 1 || dig.counters || dig.countersIfMv) return null;
    Object.assign(dig, { countersIfMv: { max: Number(m[1]), counter: "+1/+1", n: m[2] === "an" ? 1 : num(m[2]!) } });
    return "more";
  }
  if ((m = new RegExp(`^Put (?:the rest(?: of (?:those|the) cards)?|all cards revealed this way that weren't put onto the battlefield) ${REST}$`).exec(s))) return { ...(dig as Extract<Effect, { type: "dig" }>), ...restOf(m[1]!) };
  // "Then shuffle" (the "Then" is gone by now), "Then shuffle the rest into your library" (CR 701.20).
  if (/^Shuffle(?: the rest into your library)?$/.test(s)) return { ...(dig as Extract<Effect, { type: "dig" }>), rest: "shuffle" };
  return null;
}

/** The sentence parsers, tried in this order; the first that recognizes the sentence decides (null = can't compile). */
const SENTENCE_PARSERS = [parseNamesSentence, parsePreventionSentence, parseCopiesSentence, parseBasicsSentence, parseZonesSentence, parsePermanentsSentence, parseTokensSentence, parseSpellsSentence];

/** One sentence of an ability's text to effects, or null if it can't be compiled. */
export function parseSentence(s: string, ctx: Ctx): Effect[] | null {
  // "Each other player sacrifices a creature" (Grave Pact): in a free-for-all game every other player is an opponent
  // (CR 102.3, 903.2). Not where another player is in play ("Whenever a player casts ..., each other player draws a card",
  // Zenith Chronicler: other than that player).
  if (/^[Ee]ach other player /.test(s) && !ctx.eventPlayer) s = s.replace(/^[Ee]ach other player /, "Each opponent ");
  // CR 701.55a: "[A player] faces a villainous choice — [option A], or [option B]".
  const villain = /^(.+?) faces? a villainous choice — (.+)$/.exec(s);
  if (villain) return parseVillainous(villain[1]!, villain[2]!, ctx);
  if (WHEEL.test(s)) return parseSpellsSentence(s, ctx) ?? null;
  // "Target player untaps all basic lands they control" (Early Harvest): the same as "untap all basic lands target player
  // controls"; who untaps them changes nothing (CR 701.26b).
  const untapsAll = /^Target player untaps all ([a-z ]+?lands) they control$/.exec(s);
  if (untapsAll) return parseSentence(`Untap all ${untapsAll[1]} target player controls`, ctx);
  // "Target opponent exiles a creature they control and their graveyard" (Strategic Betrayal): the creature first, then the
  // graveyard.
  if (/^Target opponent exiles a creature they control and their graveyard$/.test(s)) {
    const pick = parseSentence("Target opponent exiles a creature they control", ctx);
    return pick?.length === 1 && pick[0]!.type === "pick" ? [...pick, { type: "exileGraveyard", who: pick[0]!.who }] : null;
  }
  // "Copy that spell, and you may choose new targets for the copy" (Krark, the Thumbless): the same as two sentences.
  const copyNew = /^([Cc]opy (?:that spell|it)), and you may choose new targets for the copy$/.exec(s);
  if (copyNew) {
    const copy = parseSentence(copyNew[1]!, ctx);
    return copy?.length === 1 && copy[0]!.type === "copySpell" ? [{ ...copy[0]!, newTargets: true }] : null;
  }
  // "Add an amount of {C} equal to the amount of mana spent to cast that spell at the beginning of your next main phase"
  // (Mana Sculpt): the same as with the time first (Mana Drain).
  const addLater = /^([Aa]dd .+) at the beginning of your next main phase$/.exec(s);
  if (addLater) return parseSentence(`At the beginning of your next main phase, ${addLater[1]!.replace(/^A/, "a")}`, ctx);
  // "It gets +2/+0 until end of combat" (Murk Dwellers): read as "until end of turn", then ended with the combat phase
  // instead (CR 500.5a). Only effects that change objects for a while.
  const combat = /^(.+) until end of combat$/.exec(s);
  if (combat && !/\buntil\b/.test(combat[1]!)) {
    const fx = parseSentence(`${combat[1]} until end of turn`, ctx);
    return fx?.every((e) => e.type === "continuous" && e.duration === "endOfTurn") ? fx.map((e) => ({ ...e, duration: "endOfCombat" }) as Effect) : null;
  }
  const tapped = /^(?:For as long as ~ remains tapped, (.+)|(.+?) for as long as (you control ~ and )?~ remains tapped)$/i.exec(s);
  if (tapped) return parseWhileTapped((tapped[1] ?? tapped[2])!, !!tapped[3], ctx);
  // Take the Bait: "Untap all attacking creatures and goad them": the same creatures, untapped then goaded (CR 701.15a).
  const untapGoad = /^Untap (all [^,]+?) and goad them$/.exec(s);
  if (untapGoad) {
    const untap = parseSentence(`Untap ${untapGoad[1]}`, ctx);
    const goad = untap && parseSentence(`Goad ${untapGoad[1]}`, ctx);
    return untap && goad ? [...untap, ...goad] : null;
  }
  // Besmirch: "Untap and goad that creature": untapped, then goaded (CR 701.15a).
  if (/^Untap and goad (?:that creature|it)$/.test(s)) {
    const untap = parseSentence("Untap that creature", ctx);
    const goad = untap && parseSentence("Goad it", ctx);
    return untap && goad ? [...untap, ...goad] : null;
  }
  const controlled = /^(.+?) for as long as you control ~$/.exec(s);
  if (controlled?.[1] === "You have no maximum hand size") return ctx.spell ? null : [{ type: "noMaxHandSize", whileControlled: true }];
  if (controlled) return parseWhileTapped(controlled[1]!, "controlled", ctx);
  // Sower of Temptation: "gain control of target creature for as long as ~ remains on the battlefield": whoever controls
  // ~ then (CR 611.2b), ending when it leaves the battlefield.
  const remains = /^((?:[Yy]ou )?[Gg]ain control of .+?) for as long as ~ remains on the battlefield$/.exec(s);
  if (remains) {
    const fx = parseWhileTapped(remains[1]!.replace(/^[Yy]ou g/, "G"), "controlled", ctx);
    return fx?.length === 1 && fx[0]!.type === "continuous" ? [{ ...fx[0]!, whileOnBattlefield: true }] : null;
  }
  // Kitesail Larcenist: "target ... becomes a Treasure artifact with "..." and loses all other card types and abilities for
  // as long as ~ remains on the battlefield": whoever controls ~, ending when it leaves (CR 611.2b).
  const remainsBecomes = !ctx.spell && /^(.+? becomes an? .+? and loses all other card types and abilities) for as long as ~ remains on the battlefield$/.exec(s);
  if (remainsBecomes) {
    const fx = parseSentence(remainsBecomes[1]!, ctx);
    return fx?.length === 1 && fx[0]!.type === "continuous" && fx[0].duration === "game" ? [{ ...fx[0]!, duration: "whileControlled", whileOnBattlefield: true }] : null;
  }
  // Tide Shaper: "target land becomes an Island for as long as ~ remains on the battlefield": the same as until end of turn,
  // ending when ~ leaves instead (CR 611.2b, 305.7).
  const remainsLand = !ctx.spell && /^([Tt]arget land becomes an? (?:Plains|Island|Swamp|Mountain|Forest)) for as long as ~ remains on the battlefield$/.exec(s);
  if (remainsLand) {
    const fx = parseSentence(`${remainsLand[1]} until end of turn`, ctx);
    return fx?.length === 1 && fx[0]!.type === "continuous" && fx[0].duration === "endOfTurn" ? [{ ...fx[0]!, duration: "whileControlled", whileOnBattlefield: true }] : null;
  }
  // "You and target opponent each draw a card", "you and that player each create a Food token": the same instruction for
  // each of them, you first. Only verbs where doing it one after the other can't be told from doing it at once.
  const both = /^[Yy]ou and (target opponent|target player|that player|that opponent) each (draw|create|gain|lose|mill) (.+)$/.exec(s);
  if (both) {
    const mine = parseSentence(`You ${both[2]} ${both[3]}`, ctx);
    const theirs = mine && parseSentence(`${both[1]!.replace(/^./, (c) => c.toUpperCase())} ${both[2]}s ${both[3]}`, ctx);
    return mine && theirs ? [...mine, ...theirs] : null;
  }
  // "Then each opponent who didn't draws a card" (Kynaios and Tiro), "each player who doesn't loses 3 life": right after
  // an "each player may", those who didn't.
  let m: RegExpExecArray | null;
  if (ctx.eachChose && (m = /^(?:Then )?[Ee]ach (opponent|player) who (?:didn't|doesn't) (draws (a card|\w+ cards)|loses (\d+) life)$/.exec(s))) {
    const who: PlayerRef = { ref: "notChoseThisWay", ...(m[1] === "opponent" ? { opponents: true as const } : {}) };
    if (m[4]) return [{ type: "loseLife", who, n: Number(m[4]) }];
    const n = m[3] === "a card" ? 1 : num(m[3]!.replace(/ cards$/, ""));
    return Number.isInteger(n) ? [{ type: "draw", who, n }] : null;
  }
  // "You draw a card and target opponent may draw a card" (Tataru Taru): that player decides as it resolves (CR 608.2d).
  if ((m = /^(?:[Tt]arget opponent|[Tt]arget player|[Tt]hat player) may draw (a card|two cards|three cards)$/.exec(s))) {
    const who = parsePlayer(s.slice(0, s.indexOf(" may ")).toLowerCase(), ctx);
    if (!who || who.ref === "you") return null;
    return [{ type: "eachMay", who, effects: [{ type: "draw", who: { ref: "you" }, n: m[1] === "a card" ? 1 : num(m[1]!.replace(/ cards$/, "")) }], text: `draw ${m[1]}`, each: true }];
  }
  // "You may draw a card and proliferate" (Tidus, Yuna's Guardian): the draw, then the proliferate, as one instruction
  // (so "you may" is both or neither).
  if (/^[Dd]raw a card and proliferate$/.test(s)) return [{ type: "draw", who: { ref: "you" }, n: 1 }, { type: "proliferate" }];
  // "Each opponent who does can't attack you or permanents you control during their next turn" (The Second Doctor): the
  // opponents who chose to.
  if (ctx.eachChose && /^[Ee]ach opponent who does can't attack you or permanents you control during their next turn$/.test(s)) return [{ type: "attackBanNextTurn", who: { ref: "choseThisWay", opponents: true } }];
  // "Then each player who drew a card this way gains 1 life" (Kwain): those who chose to.
  if (ctx.eachChose && (m = /^(?:Then )?[Ee]ach player who drew a card this way gains (\d+) life$/.exec(s))) return [{ type: "gainLife", who: { ref: "choseThisWay" }, n: Number(m[1]) }];
  // Flare of Fortitude: "Until end of turn, your life total can't change, and permanents you control gain hexproof and
  // indestructible" (CR 119.7-8).
  // (The body reads a leading "Until end of turn," as a trailing one.)
  if ((m = /^(?:Until end of turn, your life total can't change(?:,? and (.+))?|Your life total can't change(?:,? and (.+?))? until end of turn)$/.exec(s))) {
    const more = m[1] ?? m[2];
    const rest = more ? parseSentence(`${capital(more)} until end of turn`, ctx) : [];
    return rest ? [{ type: "playerGains", keywords: [], lifeCantChangeThisTurn: true }, ...rest] : null;
  }
  // Angel's Grace, Angel of Grace: "Until end of turn, damage that would reduce your life total to less than 1 reduces it to
  // 1 instead": a replacement effect on damage dealt to you (CR 614.1a, rulings on Ali from Cairo).
  if (/^(?:Until end of turn, damage that would reduce your life total to less than 1 reduces it to 1 instead|Damage that would reduce your life total to less than 1 reduces it to 1 instead until end of turn)$/.test(s)) return [{ type: "playerGains", keywords: [], lifeFloorThisTurn: true }];
  // Summon: Yojimbo, Forbidding Spirit: "Until your next turn, creatures can't attack you (or planeswalkers you control)
  // unless their controller pays {2} for each of those creatures" (CR 508.1g-h).
  if ((m = /^[Uu]ntil your next turn, creatures can't attack you( or planeswalkers you control)? unless their controller pays \{(\d+)\} for each of those creatures$/.exec(s)))
    return [{ type: "playerGains", keywords: [], attackTax: { n: Number(m[2]), ...(m[1] ? { planeswalkers: true as const } : {}) } }];
  const whole = parseEveryPlayerZonesSentence(s, ctx);
  if (whole) return whole;
  // Perennation: "Return target permanent card from your graveyard to the battlefield with a hexproof counter and an
  // indestructible counter on it": one target, entering with both (CR 614.1c).
  if ((m = new RegExp(`^(Return target .+ to the battlefield) with an? ${COUNTER} counter and an? ${COUNTER} counter on it$`).exec(s))) {
    const fx = parseSentence(`${m[1]} with a ${m[2]} counter on it`, ctx);
    const e = fx?.length === 1 ? fx[0] : undefined;
    if (e?.type !== "putOntoBattlefield" || e.what.ref !== "target" || e.what.n || !e.counters || counterKind(m[2]!) === counterKind(m[3]!)) return null;
    return [{ ...e, counters: { ...e.counters, [counterKind(m[3]!)]: 1 } }];
  }
  const list = parseTargetList(s, ctx);
  if (list !== undefined) return list;
  // "When that creature dies this turn, you draw a card" (A Good Day to Die): a delayed trigger (sentences/permanents.ts),
  // not a draw with a long subject.
  if (/^When that creature dies this turn, /.test(s)) return parsePermanentsSentence(s, ctx) ?? null;
  // "Target creature gets +3/+0 until end of turn. When it dies this turn, manifest dread." (Turn Inside Out): "it" is
  // that target creature.
  if (/^When it dies (?:under your control )?this turn, /.test(s) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && ctx.targets.length === 1)
    return parsePermanentsSentence(s.replace(/^When it dies/, "When that creature dies"), ctx) ?? null;
  for (const parse of SENTENCE_PARSERS) {
    const r = parse(s, ctx);
    if (r !== undefined) return r;
  }
  return null;
}

/**
 * A villainous choice (CR 701.55): the player (each of them in APNAP order, 701.55d) chooses one of the two options, then
 * all of it is done (701.55a), as much as can be (701.55b). In the options the player facing it is "that player",
 * "that opponent" or "they": the event player as each option runs (Effect villainous). Each option is one sentence that
 * doesn't target; the text is split at the ", or " that leaves two options that are both understood.
 */
function parseVillainous(subject: string, rest: string, ctx: Ctx): Effect[] | null {
  const facing = subject.replace(/^Then /, "").toLowerCase();
  const who = facing === "each opponent" ? ({ ref: "eachOpponent" } as const) : facing === "target opponent" || facing === "that player" || facing === "defending player" || /^each opponent who lost /.test(facing) ? parsePlayer(facing, ctx) : null;
  if (!who || /\bvillainous\b/.test(rest)) return null;
  const option = (text: string): Effect[] | null => {
    const before = ctx.targets.length;
    const t = capital(text.replace(/\b([Tt])hat opponent\b/g, "$1hat player"));
    const sub: Ctx = { ...ctx, eventPlayer: true, chosenOpponent: false, lastPlayerTarget: undefined };
    const fx = parseSentence(t, sub);
    if (ctx.targets.length !== before) {
      ctx.targets.length = before;
      return null;
    }
    if (fx) return fx;
    // Two instructions in one option ("they lose 2 life and you draw two cards"): read as a text of their own.
    // "That player exiles the top four cards of their library and ~ deals damage ...": two instructions, in order.
    const body = parseBody(`${t.replace(/ and (?=~ deals )/, ". ")}.`, { eventPlayer: true, ...(ctx.spell ? { spell: true } : {}) });
    return body && !body.targets.length && !body.modal ? body.effects : null;
  };
  for (const m of rest.matchAll(/, or /g)) {
    const a = rest.slice(0, m.index);
    const b = rest.slice(m.index + m[0].length);
    const first = option(a);
    const second = first && option(b);
    if (first && second) return [{ type: "villainous", who, options: [first, second], labels: [capital(a), capital(b)] }];
  }
  return null;
}

/**
 * "Destroy up to one target artifact, up to one target creature, and up to one target land" (Boom Box), "Return up to
 * one target instant card and up to one target sorcery card from your graveyard to your hand" (Pull from the Deep): the
 * same instruction for each target, in order. Each "target" is its own instance of the word, so one object may be chosen
 * for several of them if it fits each (CR 115.3), and any "up to one" may be left unchosen (CR 115.6). Afterwards "it"
 * can't mean one of them. Undefined when the sentence isn't such a list.
 */
function parseTargetList(s: string, ctx: Ctx): Effect[] | null | undefined {
  // Lowercase after a trigger's condition ("Whenever equipped creature deals combat damage to a player, destroy ...", Sword
  // of Sinew and Steel); not "exile", which a following "Then return them" would make one flicker of the last target only.
  const m = /^(Destroy|Exile|Tap|Untap|Return) ((?:up to one )?target .+?)( from your graveyard to your hand| to (?:its|their) owners?'s? hands?)?$/.exec(s.replace(/^destroy /, "Destroy "));
  if (!m) return undefined;
  const parts = m[2]!.split(/,? (?:and\/or|and) (?=(?:up to one )?target )|, (?=(?:up to one )?target )/);
  if (parts.length < 2 || parts.some((p) => !/^(?:up to one )?target [^,]+$/.test(p) || / and /.test(p))) return undefined;
  if (m[1] === "Return" && !m[3]) return undefined;
  // Two required targets of a removal spell are already a sentence of their own (Plague Spores).
  if (parts.length === 2 && parts.every((p) => /^target /.test(p)) && /^(Destroy|Exile)$/.test(m[1]!)) return undefined;
  const to = m[3]?.replace(/ to (?:its|their) owners?'s? hands?$/, " to its owner's hand") ?? "";
  const out: Effect[] = [];
  for (const p of parts) {
    const one = parseSentence(`${m[1]} ${p}${to}`, ctx);
    if (!one) return null;
    out.push(...one);
  }
  ctx.lastObjectTarget = undefined;
  ctx.lastTargets = undefined;
  return out;
}

/** "3/3", or "X/X" with the X of the spell or ability (or its "where X is ..."), worked out as it resolves (CR 608.2h). */
function basePT(p: string, t: string): [Amount, Amount] | null {
  if ((p === "X") !== (t === "X")) return null;
  return p === "X" ? [X, X] : [Number(p), Number(t)];
}

/**
 * The changes in "gets +2/+2 and gains flying", "loses all abilities and becomes a blue
 * Frog with base power and toughness 1/1", "becomes a 3/3 Elemental creature", ...
 */
export function parseChanges(text: string): Modification[] | null {
  const parts = text.split(/,? and (?=(?:gets?|gains?|loses?|has|have|becomes?|assigns?|can attack) )|, (?=(?:assigns?|can attack) )/i);
  const out: Modification[] = [];
  for (const part of parts) {
    const p = part.trim();
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^gets? ${PT}/${PT}$`, "i").exec(p))) out.push({ kind: "modifyPT", power: ptAmt(m[1]!), toughness: ptAmt(m[2]!) });
    else if ((m = /^gains? (.+)$/i.exec(p))) {
      const k = parseGrants(m[1]!);
      if (!k) return null;
      out.push(...k);
    } else if (/^loses? all abilities$/i.test(p)) out.push({ kind: "loseAllAbilities" });
    // Amoeboid Changeling: "loses all creature types" (layer 4).
    else if (/^loses? all creature types$/i.test(p)) out.push({ kind: "loseCreatureTypes" });
    // "Lose hexproof and shroud and can't have hexproof or shroud" (Arcane Lighthouse): effects with later timestamps
    // can't give them back either (rulings).
    else if ((m = /^loses? (.+?) and can't have (?:or gain )?(.+)$/i.exec(p))) {
      const k = parseKeywordList(m[1]!);
      const again = parseKeywordList(m[2]!.replace(/ or /g, " and "));
      if (!k || !again || JSON.stringify([...k].sort()) !== JSON.stringify([...again].sort())) return null;
      out.push({ kind: "removeKeywords", keywords: k }, { kind: "cantHaveKeywords", keywords: k });
    } else if ((m = /^loses? (.+)$/i.exec(p))) {
      // "Lose hexproof, indestructible, protection, shroud, and ward" (Shay Cormac): bare "protection" and "ward" are
      // every protection and ward ability (see removeKeywords).
      const words = m[1]!.split(/,? and |, /);
      const bare: string[] = words.filter((w) => w === "protection" || w === "ward");
      const k = bare.length === words.length ? [] : parseKeywordList(words.filter((w) => !bare.includes(w)).join(", "));
      if (!k) return null;
      out.push({ kind: "removeKeywords", keywords: [...k, ...bare.map((w) => (w === "ward" ? "Ward" : "Protection"))] });
    }
    // Zur, Eternal Schemer: "becomes a creature in addition to its other types and has base power and base toughness each
    // equal to its mana value": the object's own, set in layer 7b (CR 613.4b), X counting as 0 on the battlefield (rulings).
    else if (/^has base power and base toughness each equal to its mana value$/.test(p)) {
      const mv = { count: { kind: "affectedManaValue" as const } };
      out.push({ kind: "setPT", power: mv, toughness: mv });
    } else if ((m = /^(?:has|have) base power and toughness (\d+|X)\/(\d+|X)$/i.exec(p))) {
      const base = basePT(m[1]!, m[2]!);
      if (!base) return null;
      out.push({ kind: "setPT", power: base[0], toughness: base[1] });
    }
    // Doran (CR 510.1a as modified) and defender (CR 702.3b), for a while.
    else if (/^assigns? combat damage equal to (?:its|their) toughness rather than (?:its|their) power$/i.test(p)) out.push({ kind: "assignsToughness" });
    else if (/^can attack (?:this turn )?as though (?:it|they) didn't have defender$/i.test(p)) out.push({ kind: "attackDespiteDefender" });
    else if ((m = /^becomes? (.+)$/i.exec(p))) {
      // Tezzeret the Seeker: "Artifacts you control become artifact creatures with base power and toughness 5/5": each
      // one a 5/5 artifact creature, in addition to its other types (rulings; layers 4 and 7b, CR 613.1d, 613.4b).
      // Karn, the Great Creator: "becomes an artifact creature with power and toughness each equal to its mana value": each
      // object's own, set in layer 7b (CR 613.4b).
      if (/^an artifact creature with power and toughness each equal to its mana value$/.test(m[1]!)) {
        const mv = { count: { kind: "affectedManaValue" as const } };
        out.push(...parseBecomes("a 0/0 artifact creature")!.map((x) => (x.kind === "setPT" ? { kind: "setPT" as const, power: mv, toughness: mv } : x)));
        continue;
      }
      const plural = /^((?:artifact )?creature)s with base power and toughness (\d+)\/(\d+)$/.exec(m[1]!);
      const b = parseBecomes(plural ? `a ${plural[2]}/${plural[3]} ${plural[1]}` : m[1]!);
      if (!b) return null;
      out.push(...b);
    } else return null;
  }
  return out.length ? out : null;
}

/**
 * After "becomes": "a blue Frog with base power and toughness 1/1", "a 3/3 Elemental
 * creature", "a 2/2 artifact creature", "black". Colors set layer 5 (CR 105.3); new
 * creature types replace old ones (CR 205.1a); a new card type replaces the old ones
 * unless the text keeps them, as "artifact creature" does (CR 205.1b).
 */
export function parseBecomes(text: string): Modification[] | null {
  let rest = text.trim();
  const out: Modification[] = [];
  let m: RegExpExecArray | null;
  if ((m = /^(?:the color of your choice)$/i.exec(rest))) return null;
  // The color or basic land type chosen as it resolves (see parseBody). A land's basic land type replaces its land
  // types and the abilities from its rules text (CR 305.7): "becomes an Island" too.
  if (/^the chosen color$/i.test(rest)) return [{ kind: "setColors", colors: [], chosen: true }];
  if (/^the chosen basic land type$/i.test(rest)) return [{ kind: "setLandTypes", subtypes: [CHOSEN_LAND_TYPE] }];
  if ((m = /^an? (Plains|Island|Swamp|Mountain|Forest)$/.exec(rest))) return [{ kind: "setLandTypes", subtypes: [m[1]!] }];
  // "Becomes an Island in addition to its other types" (Xolatoyac's flood counters): the land keeps its types and abilities
  // and has the basic land type's mana ability too (CR 305.6, 305.7; rulings).
  if ((m = /^an? (Plains|Island|Swamp|Mountain|Forest) in addition to its other types$/.exec(rest))) return [{ kind: "addTypes", types: [], subtypes: [m[1]!] }];
  // The creature type chosen as it resolves (see parseBody): it replaces the other creature types (CR 205.1b), unless
  // "in addition to its other types".
  if ((m = /^the chosen creature type( in addition to its other types)?$/i.exec(rest)))
    return [m[1] ? { kind: "addTypes", types: [], subtypes: [CHOSEN_TYPE] } : { kind: "setSubtypes", subtypes: [CHOSEN_TYPE] }];
  // "Becomes a Dinosaur in addition to its other creature types" (Allosaurus Shepherd): a creature type added (CR 205.1b).
  if ((m = /^an? ([A-Z][a-z]+) in addition to its other creature types$/.exec(rest)) && CREATURE_TYPES.has(m[1]!)) return [{ kind: "addTypes", types: [], subtypes: [m[1]!] }];
  // Just a color: "becomes black", "becomes blue and red"
  if (/^(white|blue|black|red|green|colorless)( and (white|blue|black|red|green))*$/i.test(rest)) {
    return [{ kind: "setColors", colors: rest.split(/ and /).map((w) => COLOR_WORDS[w.toLowerCase()]).filter((c): c is Color => !!c) }];
  }
  // "... that's still a land" keeps its card types, like "It's still a land." after it (CR 205.1b).
  let still = false;
  if ((m = /^(.+?) that(?:'s| is) still an? land$|^(.+?) that are still lands$/i.exec(rest))) {
    rest = (m[1] ?? m[2])!;
    still = true;
  }
  // "Becomes a 0/0 Bird creature with flying in addition to its other types" (Case of the Filched Falcon): it keeps its
  // card types and subtypes (CR 205.1b).
  // "... a black Demon in addition to its other colors and types" (Possessed Goat): it keeps its colors too (CR 105.3).
  let addition = false;
  let addColors = false;
  if ((m = /^(.+?) in addition to its other (types|colors and types)$/i.exec(rest)) && !still) {
    rest = m[1]!;
    addition = true;
    addColors = m[2] !== "types";
  }
  // "1/1 Elemental creatures" (Kamahl's Will's "any number of target lands ... become"): each of them becomes one.
  if ((m = /^(\d+\/\d+ (?:[A-Z]\w* )*creature)s\b(.*)$/.exec(rest))) rest = `a ${m[1]}${m[2]}`;
  if (!(m = /^an? (.+)$/i.exec(rest))) return null;
  rest = m[1]!;
  // "A legendary 4/4 red Dragon creature" (Sarkhan, the Dragonspeaker): new card types replace the old ones (CR 205.1a),
  // and it gains the supertype, keeping any others (205.4b).
  let legendary = false;
  if ((m = /^legendary (.+)$/.exec(rest))) {
    legendary = true;
    rest = m[1]!;
  }
  // "A 2/2 creature with all creature types" (Mutavault), "with vigilance and all creature types" (Faceless Haven): every
  // creature type, like changeling (CR 702.73a), in the type-changing layer.
  let everyType = false;
  if ((m = /^(.+?) with (?:(.+?),? and )?all creature types$/i.exec(rest))) {
    rest = m[2] ? `${m[1]} with ${m[2]}` : m[1]!;
    everyType = true;
  }
  // "A 3/3 Elemental creature with haste", "... with vigilance, indestructible, and haste": it also gains those.
  const grants: Modification[] = [];
  if ((m = /^(.+?) with (?!base power and toughness )(.+)$/i.exec(rest))) {
    const g = parseGrants(m[2]!);
    if (!g) return null;
    grants.push(...g);
    rest = m[1]!;
  }
  let pt: [Amount, Amount] | null = null;
  if ((m = /^(\d+|X)\/(\d+|X) (.+)$/.exec(rest))) {
    pt = basePT(m[1]!, m[2]!);
    if (!pt) return null;
    rest = m[3]!;
  }
  // "... with base power and toughness 8/8, flying, and first strike" (Figure of Destiny): it gains those too.
  if ((m = /^(.+?) with base power and toughness (\d+|X)\/(\d+|X)(?:(?:,? and |, )(.+))?$/i.exec(rest))) {
    pt = basePT(m[2]!, m[3]!);
    if (!pt) return null;
    rest = m[1]!;
    if (m[4]) {
      const g = parseGrants(m[4]);
      if (!g) return null;
      grants.push(...g);
    }
  }
  const colors: Color[] = [];
  const subtypes: string[] = [];
  const types: string[] = [];
  for (const w of rest.split(/\s+/)) {
    const lw = w.toLowerCase();
    if (COLOR_WORDS[lw]) colors.push(COLOR_WORDS[lw]!);
    else if (lw === "and" || lw === "colorless") continue;
    else if (TYPE_WORDS[lw]) types.push(TYPE_WORDS[lw]!);
    else if (CREATURE_TYPES.has(w)) subtypes.push(w);
    else return null;
  }
  if (addition) {
    if (!types.length && !subtypes.length) return null;
    out.push({ kind: "addTypes", types, subtypes });
  } else if (types.join(" ") === "Artifact Creature") {
    // "Becomes an artifact creature" keeps its other card types and subtypes; "a Golem artifact
    // creature" keeps them too, except that its creature types are replaced (CR 205.1b).
    out.push({ kind: "addTypes", types, subtypes: [] });
    if (subtypes.length) out.push({ kind: "setSubtypes", subtypes });
  } else if (types.length) out.push(still ? { kind: "addTypes", types, subtypes } : { kind: "setTypes", types, subtypes, ...(legendary ? { supertypes: ["Legendary"] } : {}) });
  else if (subtypes.length && !still) out.push({ kind: "setSubtypes", subtypes });
  else if (still) return null;
  if (legendary && (still || addition || !types.length || types.join(" ") === "Artifact Creature")) return null;
  if (everyType) {
    if (!types.includes("Creature") || subtypes.length) return null;
    out.push({ kind: "addTypes", types: [], subtypes: [], allCreatureTypes: true });
  }
  if (addColors) {
    if (!colors.length) return null;
    out.push({ kind: "addColors", colors });
  } else if (colors.length || /colorless/i.test(rest)) out.push({ kind: "setColors", colors });
  if (pt) out.push({ kind: "setPT", power: pt[0], toughness: pt[1] });
  out.push(...grants);
  return out.length ? out : null;
}

/**
 * "Target creature gets +1/+1 for as long as ~ remains tapped", "gain control of target creature for as long as you
 * control ~ and ~ remains tapped", "it doesn't untap during its controller's untap step for as long as ~ remains
 * tapped" (CR 611.2b): one continuous effect lasting while its source stays tapped. Only a permanent's ability.
 * `controlled` "only": "gain control of target artifact for as long as you control ~" (Master Thief), "another target
 * permanent gains indestructible for as long as you control ~" (Aegis Angel): lasting while you control the source.
 */
function parseWhileTapped(inner: string, controlled: boolean | "controlled", ctx: Ctx): Effect[] | null {
  if (ctx.spell) return null;
  inner = inner.charAt(0).toUpperCase() + inner.slice(1);
  const lasting = (fx: Effect[] | null): Effect[] | null => {
    const e = fx?.length === 1 ? fx[0]! : undefined;
    if (e?.type !== "continuous") return null;
    return [controlled === "controlled" ? { ...e, duration: "whileControlled" } : { ...e, duration: "whileTapped", ...(controlled ? { whileControlled: true as const } : {}) }];
  };
  const m = /^(.+?) (?:doesn't|don't) untap during (?:its|their) controllers?'s? untap steps?$/i.exec(inner);
  if (m) {
    const what = parseObject(m[1]!, ctx);
    return what ? lasting([{ type: "continuous", what, mods: [{ kind: "doesntUntap" }], duration: "game" }]) : null;
  }
  if (/^Gain control of /i.test(inner)) {
    const fx = parseSentence(inner, ctx);
    return fx?.[0]?.type === "continuous" && fx[0].duration === "game" ? lasting(fx) : null;
  }
  // "That creature can't attack or block for as long as ..." (Extraction Specialist): as "this turn", for longer.
  if (/^[^,]+ can't (?:attack|block|attack or block)$/.test(inner)) {
    const fx = parseSentence(`${inner} this turn`, ctx);
    return fx?.[0]?.type === "continuous" && fx[0].duration === "endOfTurn" ? lasting(fx) : null;
  }
  if (!/ (?:gets?|has|have|loses?|gains?) /.test(inner)) return null;
  // "Gets +2/+2 and has trample" for as long as it lasts is "gains trample" from when it starts.
  const fx = parseSentence(`${inner.replace(/ (has|have) /, (_, w: string) => (w === "has" ? " gains " : " gain "))} until end of turn`, ctx);
  return fx?.[0]?.type === "continuous" && fx[0].duration === "endOfTurn" ? lasting(fx) : null;
}

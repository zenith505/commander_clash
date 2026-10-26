// Sentences about damage, drawing, life, energy, the monarch, prevention, and "at end of combat" delayed triggers.

import { DUNGEONS, UNDERCITY, dungeonSupported } from "../dungeons";
import { allEffects } from "../../abilities";
import type { Amount, AmountExpr, DamageRecipient, Effect, ObjRef, PlayerRef, PunisherOption, TargetSpec } from "../../abilities";
import { COLOR_WORDS, NUM, NUMX, amt, isGroup, num, plainMana, sacrificeSelf } from "../words";
import { parsePayCost, addTarget, parseUnlessPays } from "../body";
import { halfX, parseBoundCount, parseCount, roundOf } from "../counts";
import { parseSearch, parseSearchFilter } from "../search";
import { parseDamageRecipient, parsePlayer, parseObject, parseTargetPhrase, pickFilter } from "../targets";
import { parseSentence } from "../sentence";
import type { Ctx } from "../body";
import { STARTING_LIFE } from "../../types";
import type { ManaType } from "../../types";
import { parsePreventAll } from "../statics";
import { emblemAbilityOk } from "../grants";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseBasicsSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  // Rad counters (CR 728): "target player gets two rad counters", "each player gets X", "that player gets twice that many"
  // (twice X), "each opponent gets a number of rad counters equal to its power", "you get half X rad counters, rounded up".
  if ((m = /^(.+?) gets? half X rad counters, rounded (up|down)$/.exec(s))) {
    const who = parsePlayer(m[1]!.replace(/^[A-Z]/, (c) => c.toLowerCase()), ctx);
    return who && [{ type: "getRad", who, n: { count: { kind: "x" }, half: m[2] as "up" | "down" } }];
  }
  // "You may get two rad counters" (Tato Farmer): "get ..." once "you may" is read.
  if ((m = new RegExp(`^(?:(.+?) gets?|Get) (?:(twice) )?(?:${NUMX}|(a number of)) rad counters?(?: equal to (.+))?$`).exec(s))) {
    const who = parsePlayer((m[1] ?? "you").replace(/^[A-Z]/, (c) => c.toLowerCase()), ctx);
    if (!who || !!m[4] !== !!m[5]) return null;
    let n: Amount | null = m[5] ? parseCount(m[5], ctx) : /^an?$/.test(m[3]!) ? 1 : amt(m[3]!);
    if (n === null) return null;
    if (m[2]) n = typeof n === "number" ? 2 * n : { ...n, times: 2 * (n.times ?? 1) };
    return [{ type: "getRad", who, n }];
  }
  // Klothys, God of Destiny: "you gain 2 life and ~ deals 2 damage to each opponent": two instructions, in order.
  if ((m = /^(You gain \d+ life) and (~ deals \d+ damage to each opponent)$/.exec(s))) {
    const first = parseSentence(m[1]!, ctx);
    const second = first && parseSentence(m[2]!, ctx);
    return first && second ? [...first, ...second] : null;
  }
  // "Each creature gets twice -X/-X until end of turn" (Nuclear Fallout): -X/-X with X doubled.
  if ((m = /^(.+? gets?) twice ([+-]X\/[+-]X .+)$/.exec(s))) {
    const fx = parseSentence(`${m[1]} ${m[2]}`, ctx);
    const pt = fx?.length === 1 && fx[0]!.type === "continuous" && fx[0]!.mods.length === 1 ? fx[0]!.mods[0]! : undefined;
    if (fx?.[0]?.type !== "continuous" || pt?.kind !== "modifyPT") return null;
    const twice = (a: Amount): Amount | null => (typeof a === "object" && "count" in a && a.count.kind === "x" && !a.times ? { ...a, times: 2 } : null);
    const [power, toughness] = [twice(pt.power), twice(pt.toughness)];
    return power && toughness ? [{ ...fx[0]!, mods: [{ ...pt, power, toughness }] }] : null;
  }

  // "You get an emblem with "..."", "Each opponent gets an emblem with ...", "Target opponent gets ..." (CR 114.2), one
  // or more quoted abilities ('with "..." and "..."'). "This emblem" in them is the emblem; a quoted ability inside one
  // is in single quotes ("Mountains you control have '{T}: This land deals 1 damage to any target.'").
  if ((m = /^(You|Each opponent|Target opponent|Target player) gets? an emblem with ("[^"]+"(?: and "[^"]+")*)\.?$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const abilities = [...m[2]!.matchAll(/"([^"]+)"/g)].map((q) =>
      q[1]!
        .replace(/\b(ha(?:s|ve)(?: [^']*? and)? )'([^']+?)'/g, '$1"$2"')
        .replace(/\b[Tt]his emblem\b/g, "~")
        .replace(/([^.!?"])$/, "$1."),
    );
    return who && abilities.every(emblemAbilityOk) ? [{ type: "emblem", who, abilities }] : null;
  }
  // "Each opponent loses all counters" (Final Act): every counter they have (CR 122.1); poison and energy are the
  // player counters this engine has.
  if ((m = /^(Each opponent|Each player|Target opponent|Target player) loses all counters$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    return who ? [{ type: "loseAllCounters", who }] : null;
  }
  // Aetheric Amplifier: "Double the number of each kind of counter you have": that many more of each (CR 701.10e).
  if ((m = /^Double the number of each kind of counter (you have|target player has)$/.exec(s))) {
    const who = parsePlayer(m[1] === "you have" ? "you" : "target player", ctx);
    return who ? [{ type: "doublePlayerCounters", who }] : null;
  }
  // "Exchange life totals with target opponent" (Mirror Universe), "two target players exchange life totals" (Axis of
  // Mortality): CR 701.12c.
  if ((m = /^[Ee]xchange life totals with (target opponent|target player)$/.exec(s))) {
    const b = parsePlayer(m[1]!, ctx);
    ctx.exchanged = true;
    return b ? [{ type: "exchangeLife", a: { ref: "you" }, b }] : null;
  }
  // Tree of Perdition: "Exchange target opponent's life total with ~'s toughness" (CR 701.12g): the life total and the
  // toughness each become the other's previous value.
  if ((m = /^[Ee]xchange (your|target opponent's|target player's) life total with ~'s (power|toughness)$/.exec(s))) {
    const who = m[1] === "your" ? ({ ref: "you" } as const) : parsePlayer(m[1]!.replace(/'s$/, ""), ctx);
    return who ? [{ type: "exchangeLifeWithSelf", who, stat: m[2] as "power" | "toughness" }] : null;
  }
  // Psychic Transfer: "If the difference between your life total and target player's life total is 5 or less, exchange
  // life totals with that player": checked as it resolves; the target is chosen either way.
  if ((m = new RegExp(`^If the difference between your life total and target player's life total is ${NUM} or less, exchange life totals with that player$`).exec(s))) {
    const index = addTarget(ctx, { kind: "player", text: "target player" });
    return [{ type: "exchangeLife", a: { ref: "you" }, b: { ref: "target", index }, maxDiff: num(m[1]!) }];
  }
  if (/^(?:Have t|T)wo target players exchange life totals$/.test(s)) {
    const first = addTarget(ctx, { kind: "player", text: "target player" });
    const second = addTarget(ctx, { kind: "player", text: "target player", distinctFrom: [first] });
    ctx.lastPlayerTarget = undefined;
    ctx.exchanged = true;
    return [{ type: "exchangeLife", a: { ref: "target", index: first }, b: { ref: "target", index: second } }];
  }
  // Mister Negative: "If you lost life this way, draw that many cards" (none if you didn't).
  if (ctx.exchanged && /^If you lost life this way, draw that many cards$/.test(s)) return [{ type: "draw", who: { ref: "you" }, n: { count: { kind: "lifeLostThisWay" } } }];
  // Sandstone Oracle: "choose an opponent. If that player has more cards in hand than you, draw cards equal to the
  // difference": both hands as it resolves (CR 608.2h).
  if (ctx.chosenOpponent && /^If that player has more cards in hand than you, draw cards equal to the difference$/.test(s)) {
    const theirs = { kind: "cardsInHand" as const, who: { ref: "chosenPlayer" as const } };
    const mine = { kind: "cardsInHand" as const, who: { ref: "you" as const } };
    return [{ type: "if", cond: { kind: "amountsCompare", a: { count: theirs }, atLeast: { count: mine, plus: 1 } }, effects: [{ type: "draw", who: { ref: "you" }, n: { count: { kind: "difference", of: [theirs, mine] } } }] }];
  }

  // "Search target opponent's library for a creature card and put that card onto the battlefield under your control. Then
  // that player shuffles." (Bribery), "Search target player's library for a card and exile it." (Extract): you search
  // their library (CR 701.23a); a permanent found comes under your control.
  const theirs = /^Search (target opponent's|target player's) library for (an? (?:.+? )?card) and (put that card onto the battlefield under your control|exile it)$/.exec(s);
  if (theirs) {
    const filter = parseSearchFilter(theirs[2]!.replace(/^an? /, ""));
    if (filter === null) return null;
    const library = parsePlayer(theirs[1]!.replace(/'s$/, ""), ctx);
    return library ? [{ type: "search", ...(filter ? { filter } : {}), n: 1, upTo: false, reveal: false, dest: { zone: theirs[3] === "exile it" ? "exile" : "battlefield" }, library }] : null;
  }
  // "Search your library for a number of basic land cards equal to the other result, put them onto the battlefield
  // tapped, then shuffle" (Wild Endeavor): that many, counted as it resolves.
  const howMany = /^Search your library for a number of (.+? cards) equal to (.+?)((?:,| and) (?:put|then) .+)$/i.exec(s);
  if (howMany) {
    const n = parseCount(howMany[2]!, ctx);
    const fx = n && parseSearch(`Search your library for two ${howMany[1]}${howMany[3]}`);
    return n && fx?.length === 1 && fx[0]!.type === "search" && !fx[0]!.others ? [{ ...fx[0]!, n }] : null;
  }
  // An opponent choosing among the cards found or revealed (Gifts Ungiven, Murmurs from Beyond), as parseBody rewrites them.
  const zoneOf = (to: string) => (to === "into your hand" ? { zone: "hand" as const } : to === "into your graveyard" ? { zone: "graveyard" as const } : { zone: "battlefield" as const, ...(to.endsWith("tapped") ? { tapped: true } : {}) });
  const opp = /^Search your library for (.+?); (target opponent|an opponent) chooses (one|two); put them (into your hand|into your graveyard) and the rest (into your hand|into your graveyard|onto the battlefield tapped)$/.exec(s);
  if (opp) {
    const fx = parseSearch(`Search your library for ${opp[1]!}, reveal them, put them ${opp[5]!}, then shuffle`);
    const chooser = opp[2] === "target opponent" ? parsePlayer("target opponent", ctx) : undefined;
    if (fx?.length !== 1 || fx[0]!.type !== "search" || fx[0]!.others || chooser === null) return null;
    return [{ ...fx[0]!, split: { ...(chooser ? { chooser } : {}), n: opp[3] === "one" ? 1 : 2, to: zoneOf(opp[4]!) } }];
  }
  const revealPick = /^Reveal the top (two|three|four|five) cards of your library; (target opponent|an opponent) chooses (one|an? ([a-z]+) card from among them); put it (into your hand|into your graveyard|onto the battlefield)(?: and the rest (into your hand|into your graveyard))?$/.exec(s);
  if (revealPick) {
    const filter = revealPick[4] ? parseSearchFilter(`${revealPick[4]} card`) : undefined;
    const chooser = revealPick[2] === "target opponent" ? parsePlayer("target opponent", ctx) : undefined;
    if (filter === null || chooser === null) return null;
    return [{ type: "revealPick", n: num(revealPick[1]!), ...(chooser ? { chooser } : {}), ...(filter ? { filter } : {}), to: zoneOf(revealPick[5]!), ...(revealPick[6] ? { rest: zoneOf(revealPick[6]) } : {}) }];
  }
  // Fact or Fiction, Steam Augury (as parseBody rewrites them): piles (CR 700.3).
  const piles = /^[Rr]eveal the top (two|three|four|five|six|seven|X|X plus one) cards of your library; (an opponent separates them into two piles|you separate them into two piles and an opponent chooses one); put one pile into your hand and the other (into your graveyard|on the bottom of your library in any order)$/.exec(s);
  if (piles) {
    const n: Amount = piles[1] === "X plus one" ? { count: { kind: "x" }, plus: 1 } : amt(piles[1]!);
    return [{ type: "piles", n, separator: piles[2]!.startsWith("an opponent") ? "opponent" : "you", rest: piles[3] === "into your graveyard" ? "graveyard" : "bottom" }];
  }
  // "Search your library for an Equipment card, put it onto the battlefield, attach it to a creature you control, then
  // shuffle" (Stonehewer Giant): attached as it resolves, to a creature chosen then (not targeted); the shuffle comes last
  // but nothing in between sees the library order.
  const attach = /^(Search your library for an Equipment card, put it onto the battlefield), attach it to a creature you control(, then shuffle)$/.exec(s);
  if (attach) {
    const fx = parseSearch(attach[1]! + attach[2]!);
    const sr = fx?.length === 1 ? fx[0]! : undefined;
    if (sr?.type !== "search" || sr.n !== 1 || sr.dest.zone !== "battlefield") return null;
    return [sr, { type: "attachToChosen", source: { ref: "created" }, filter: { kind: "object", types: ["Creature"], controller: "you", text: "a creature you control" } }];
  }
  if (/^Search your library /i.test(s)) return parseSearch(s, (t) => parseBoundCount(t, ctx));
  // "Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then
  // shuffle" (Path to Exile): that player chooses whether to search, and doesn't shuffle if they don't (rulings). "That
  // player" after "target ... an opponent controls" (Boseiju) is that permanent's controller. Last known information
  // says who controlled it if it's gone by then (CR 608.2h).
  // "Target player may search their library for a card named [name]" (Partner with, CR 702.124j).
  if ((m = /^(Its controller|That creature's controller|That permanent's controller|That land's controller|That player|[Tt]arget player) may search their library for (.+)$/.exec(s))) {
    const who = m[1] === "That player" ? (ctx.lastPlayerTarget === undefined && ctx.lastObjectTarget !== undefined ? { ref: "targetController" as const, index: ctx.lastObjectTarget } : null) : parsePlayer(m[1]!.toLowerCase(), ctx);
    if (!who || / your /.test(m[2]!)) return null;
    const fx = parseSearch(`Search your library for ${m[2]!.replace(/ their hand\b/, " your hand")}`);
    if (fx?.length !== 1 || fx[0]!.type !== "search") return null;
    return [{ type: "eachMay", who, text: `search their library for ${m[2]!}`, effects: [{ ...fx[0]!, who: { ref: "choseThisWay" } }] }];
  }
  // Fertilid: "Target player searches their library for a basic land card, puts it onto the battlefield tapped, then
  // shuffles": that player searches, and must (CR 701.23).
  if ((m = /^([Tt]arget player|[Tt]arget opponent) searches their library for (.+?), puts (it|that card) onto the battlefield( tapped)?, then shuffles$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const fx = who && parseSearch(`Search your library for ${m[2]!}, put ${m[3]} onto the battlefield${m[4] ?? ""}, then shuffle`);
    if (fx?.length !== 1 || fx[0]!.type !== "search") return null;
    return [{ ...fx[0]!, who: who! }];
  }
  // "Its controller may draw a card if its power is greater than each other creature's power" (Selvala, Heart of the
  // Wilds): the creature the trigger is about, its controller deciding; its power compared as it resolves, or as it last
  // existed (rulings).
  if ((ctx.subjectIt || ctx.subject) && (m = /^[Ii]ts controller may draw a card( if its power is greater than each other creature's power)?$/.exec(s))) {
    const may: Effect = { type: "eachMay", who: { ref: "subjectController" }, text: "draw a card", effects: [{ type: "draw", who: { ref: "choseThisWay" }, n: 1 }] };
    return m[1] ? [{ type: "if", cond: { kind: "state", cond: { kind: "subjectPT", stat: "power", greatest: true } }, effects: [may] }] : [may];
  }
  // Brood Sliver: "its controller may create a 1/1 colorless Sliver creature token": the creature's controller decides,
  // and the token is theirs.
  if ((ctx.subjectIt || ctx.subject) && (m = /^[Ii]ts controller may create (.+)$/.exec(s))) {
    const fx = parseSentence(`Create ${m[1]!}`, ctx);
    if (fx?.length !== 1 || fx[0]!.type !== "createToken" || fx[0]!.who.ref !== "you") return null;
    return [{ type: "eachMay", who: { ref: "subjectController" }, text: `create ${m[1]!}`, effects: [{ ...fx[0]!, who: { ref: "choseThisWay" } }] }];
  }
  // Scheming Symmetry: "Choose two target players. Each of them searches their library for a card, then shuffles and
  // puts that card on top." The targets, then each player's search in APNAP order (CR 101.4); each shuffles before
  // putting the card on top, one action (rulings on Vampiric Tutor).
  if ((m = /^(Each of them|Target player) searches their library for (.+?), then shuffles and puts that card on top$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const fx = parseSearch(`Search your library for ${m[2]!}, then shuffle and put that card on top`);
    if (!who || fx?.length !== 1 || fx[0]!.type !== "search") return null;
    return [{ ...fx[0]!, who }];
  }
  // "Each player searches their library for a basic land card, puts it onto the battlefield, then shuffles" (Field of
  // Ruin, Avatar of Growth): each player chooses in APNAP order, then the cards go there at the same time (CR 101.4).
  if ((m = /^[Ee]ach player searches their library for (.+?), puts (it|them|that card|those cards) (onto the battlefield(?: tapped)?|into their hand), then shuffles$/.exec(s))) {
    const fx = parseSearch(`Search your library for ${m[1]!}, put ${m[2]!} ${m[3]!.replace(/ their hand$/, " your hand")}, then shuffle`);
    if (fx?.length !== 1 || fx[0]!.type !== "search") return null;
    return [{ ...fx[0]!, who: { ref: "eachPlayer" } }];
  }
  // "Each player may search their library for up to two basic land cards, put them onto the battlefield, then shuffle"
  // (Veteran Explorer), "each opponent may search ... for a creature card and put it onto the battlefield. Then each
  // player who searched their library this way shuffles" (Boldwyr Heavyweights): the active player searches or chooses
  // not to, then each other player in turn order; then those who searched shuffle (rulings).
  if ((m = /^[Ee]ach (player|opponent) may search their library for (.+?)(?:, (reveal (?:it|them|those cards), )?put (it|them|that card|those cards) (onto the battlefield(?: tapped)?|into their hand), then shuffle| and put (it|them|that card|those cards) (onto the battlefield(?: tapped)?|into their hand))$/.exec(s))) {
    const [it, to] = m[4] ? [m[4], m[5]!] : [m[6]!, m[7]!];
    const fx = parseSearch(`Search your library for ${m[2]!}, ${m[3] ?? ""}put ${it} ${to.replace(/ their hand$/, " your hand")}, then shuffle`, (x) => parseBoundCount(x, ctx));
    if (fx?.length !== 1 || fx[0]!.type !== "search" || fx[0]!.others) return null;
    if (m[6]) ctx.eachSearched = true;
    return [{ ...fx[0]!, who: { ref: m[1] === "player" ? "eachPlayer" : "eachOpponent" }, may: true }];
  }
  // Its "Then each player who searched their library this way shuffles": the search above does that.
  if (ctx.eachSearched && /^(?:Then )?[Ee]ach player who searched their library this way shuffles$/.test(s)) {
    ctx.eachSearched = false;
    return [];
  }
  // "For each blight counter on it, each opponent loses 4 life unless that player sacrifices a nonland permanent of their
  // choice or discards a card" (Rottenmouth Viper): each player makes all the choices, then they all happen (rulings).
  if ((m = /^[Ff]or each ([a-z+\/0-9-]+) counter on (?:it|~), (.+)$/.exec(s)) && (ctx.selfIt || /on ~,/.test(s))) {
    const fx = parseSentence(`${m[2]!.charAt(0).toUpperCase()}${m[2]!.slice(1)}`, ctx);
    const p = fx?.length === 1 ? fx[0] : undefined;
    if (p?.type !== "punisher" || p.times !== undefined || p.picks !== undefined) return undefined;
    // One kind of permanent to sacrifice and no payment, so the picks can be made all together.
    if (p.options.some((o) => "pay" in o) || p.options.filter((o) => "sacrifice" in o).length > 1) return null;
    return [{ ...p, picks: { count: { kind: "counters", counter: m[1]!, of: { ref: "self" } } } }];
  }
  // Punishers: "Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a
  // card", "that player loses 2 life unless they pay {2}" (see the punisher effect).
  if ((m = new RegExp(`^(.+?) (?:loses|lose) ${NUMX} life unless (?:they|that player|he or she) (.+)$`).exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const options = parsePunisherOptions(m[3]!, ctx);
    if (!who || who.ref === "you" || !options) return null;
    return [{ type: "punisher", who, options, effects: [{ type: "loseLife", who: { ref: "punished" }, n: amt(m[2]!) }] }];
  }
  // Waterbending Lesson: "Then discard a card unless you waterbend {2}." You choose as it resolves whether to pay {2},
  // tapping artifacts and creatures you control for its generic mana (CR 701.67a, rulings), or to discard.
  if ((m = new RegExp(`^[Dd]iscard ${NUM} cards? unless you waterbend \\{(\\d+)\\}$`).exec(s))) {
    const n = Number(m[2]);
    return [{ type: "punisher", who: { ref: "you" }, options: [{ pay: { cost: `{${n}}`, waterbend: n } }], effects: [{ type: "discard", who: { ref: "punished" }, n: num(m[1]!), random: false }] }];
  }
  // "Its controller may draw up to two cards" (Arcane Denial), "each opponent may draw up to three cards": each chooses how
  // many, none to that many (rulings).
  if ((m = new RegExp(`^(?:(.+?) (?:may )?draws?|(?:You may )?[Dd]raw) up to ${NUM} cards$`).exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const n = num(m[2]!);
    return who && Number.isInteger(n) ? [{ type: "drawUpTo", who, n }] : null;
  }
  // "Draw a card unless that player pays {X}, where X is ~'s power" (Esper Sentinel), and "you may draw a card unless that
  // player pays {1}" (Rhystic Study, through parseBody): that player decides whether to pay first, then you whether to
  // draw (rulings on Rhystic Study). The draw is the penalty; its "may" is asked only if they didn't pay.
  if ((m = new RegExp(`^(?:[Yy]ou )?(may )?[Dd]raw ${NUM} cards? unless (that player|they|he or she) (pays? .+)$`).exec(s))) {
    const who = parsePlayer(m[3] === "he or she" ? "they" : m[3]!, ctx);
    const options = parsePunisherOptions(m[4]!, ctx);
    if (!who || who.ref === "you" || !options || options.some((o) => !("pay" in o))) return null;
    const draw: Effect = { type: "draw", who: { ref: "you" }, n: num(m[2]!) };
    const text = `draw ${m[2] === "a" || m[2] === "one" ? "a card" : `${m[2]} cards`}`;
    return [{ type: "punisher", who, options, effects: [m[1] ? { type: "may", effects: [draw], text } : draw], thenText: m[1] ? `may ${text}` : text.replace(/^draw/, "draws") }];
  }
  // Indulgent Tormentor: "draw a card unless target opponent sacrifices a creature of their choice or pays 3 life": that
  // opponent chooses as it resolves (CR 608.2d), an option they can't do not being one (CR 608.2d); you draw if they don't.
  if ((m = new RegExp(`^(?:[Yy]ou )?[Dd]raw ${NUM} cards? unless target opponent ((?:sacrifices?|discards?|pays?) .+)$`).exec(s))) {
    const who = parsePlayer("target opponent", ctx);
    const options = who && parsePunisherOptions(m[2]!, ctx);
    if (!who || !options) return null;
    const text = `draw ${m[1] === "a" || m[1] === "one" ? "a card" : `${m[1]} cards`}`;
    return [{ type: "punisher", who, options, effects: [{ type: "draw", who: { ref: "you" }, n: num(m[1]!) }], thenText: text.replace(/^draw/, "draws") }];
  }
  // Athreos, God of Passage: "return it to your hand unless target opponent pays 3 life": that opponent decides as it
  // resolves (rulings); with no legal target, nothing happens.
  if ((m = /^(.+?) unless target opponent (pays? .+)$/.exec(s)) && /^return it to /i.test(m[1]!)) {
    const before = ctx.targets.length;
    const fx = parseSentence(`${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)}`, ctx);
    if (!fx || ctx.targets.length !== before) return null;
    const who = parsePlayer("target opponent", ctx);
    const options = parsePunisherOptions(m[2]!, ctx);
    if (!who || !options || options.some((o) => !("pay" in o))) return null;
    return [{ type: "punisher", who, options, effects: fx }];
  }
  // "~ deals 5 damage to target opponent unless that player sacrifices a creature of their choice" (Demanding Dragon).
  if ((m = new RegExp(`^(?:~|It) deals ${NUMX} damage to (.+?) unless (?:they|that player|he or she) ((?:sacrifices?|discards?|pays?) .+)$`).exec(s))) {
    if (/^It /.test(s) && !ctx.selfIt) return null;
    const who = parsePlayer(m[2]!, ctx);
    const options = parsePunisherOptions(m[3]!, ctx);
    if (!who || who.ref === "you" || !options) return null;
    return [{ type: "punisher", who, options, effects: [{ type: "damage", amount: amt(m[1]!), to: { ref: "punished" } }] }];
  }
  // "Put the cards in your hand on the bottom of your library in any order, then draw that many cards" (Mindmoil), "that
  // player puts the cards in their hand ... then draws that many cards" (Teferi's Puzzle Box).
  if ((m = /^(?:([Tt]hat player) puts|[Pp]ut) the cards in (?:their|your) hand on the bottom of (?:their|your) library in any order, then draws? that many cards$/.exec(s))) {
    const who = m[1] ? parsePlayer("that player", ctx) : ({ ref: "you" } as const);
    return who ? [{ type: "handToBottomDraw", who }] : null;
  }
  // "Your life total becomes 10", "target player's life total becomes 20" (CR 119.5).
  if ((m = /^(Your|Target player's|Target opponent's|That player's|Each player's|Defending player's) life total becomes (\d+)$/i.exec(s))) {
    const who = m[1]!.toLowerCase() === "your" ? ({ ref: "you" } as const) : parsePlayer(m[1]!.replace(/'s$/, "").toLowerCase(), ctx);
    return who ? [{ type: "setLife", who, n: Number(m[2]) }] : null;
  }
  // "Your life total becomes half your starting life total, rounded up" (The Endstone), "up to one target player's life
  // total becomes half their starting life total, rounded down" (Torgaar): 20 in Commander (CR 903.7, 119.5).
  if ((m = /^(Your|Target player's|Up to one target player's|Target opponent's) life total becomes half (?:your|their) starting life total, rounded (up|down)$/i.exec(s))) {
    const who = m[1]!.toLowerCase() === "your" ? ({ ref: "you" } as const) : parsePlayer(m[1]!.replace(/'s$/, "").toLowerCase(), ctx);
    return who ? [{ type: "setLife", who, n: (m[2] === "up" ? Math.ceil : Math.floor)(STARTING_LIFE / 2) }] : null;
  }
  // Beacon of Immortality: "Double target player's life total": they gain (or, below 0, lose) as much life as it takes
  // (CR 701.10d).
  if ((m = /^Double (your|target player's|target opponent's|that player's|each player's) life total$/i.exec(s))) {
    const who = m[1]!.toLowerCase() === "your" ? ({ ref: "you" } as const) : parsePlayer(m[1]!.replace(/'s$/, "").toLowerCase(), ctx);
    return who ? [{ type: "setLife", who, n: 0, double: true }] : null;
  }
  // Nazgûl Battle-Mace: "Whenever an opponent sacrifices a nontoken permanent, put that card onto the battlefield under your
  // control unless that player pays 3 life": they decide as it resolves (CR 608.2d), even if the card has left the zone it
  // went to, which then stays where it is (rulings). Any public zone a replacement effect sent it to (rulings).
  if (/^[Pp]ut that card onto the battlefield under your control unless that player pays (\d+) life$/.test(s) && ctx.subjectLeft && ctx.eventPlayer) {
    const who = parsePlayer("that player", ctx);
    const options = parsePunisherOptions(s.replace(/^.* unless that player /, ""), ctx);
    if (!who || who.ref === "you" || !options || options.some((o) => !("pay" in o))) return null;
    return [{ type: "punisher", who, options, effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "public" } }] }];
  }
  // Kazuul, Tyrant of the Cliffs: "create a 3/3 red Ogre creature token unless that creature's controller pays {3}": the
  // attacking creature's controller chooses as it resolves (rulings), as it last existed if it has left (CR 608.2h).
  if ((m = /^[Cc]reate (.+?) unless that creature's controller (pays? .+)$/.exec(s)) && ctx.subjectIt) {
    const options = parsePunisherOptions(m[2]!, ctx);
    const before = ctx.targets.length;
    const fx = options && parseSentence(`Create ${m[1]!}`, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    if (!options || options.some((o) => !("pay" in o)) || tok?.type !== "createToken" || ctx.targets.length !== before) return null;
    return [{ type: "punisher", who: { ref: "subjectController" }, options, effects: [tok] }];
  }
  // "For each opponent, you create a 2/2 black Zombie creature token unless that player sacrifices a creature of their
  // choice" (Acererak): one token for each opponent who doesn't, all made at once after the sacrifices (rulings).
  if ((m = /^[Ff]or each opponent, you (create .+?) unless (?:that player|they) ((?:sacrifices?|discards?) .+)$/.exec(s))) {
    const options = parsePunisherOptions(m[2]!, ctx);
    const before = ctx.targets.length;
    const fx = options && parseSentence(`${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)}`, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    if (!options || tok?.type !== "createToken" || typeof tok.n !== "number" || ctx.targets.length !== before) return null;
    return [{ type: "punisher", who: { ref: "eachOpponent" }, options, effects: [{ ...tok, n: { count: { kind: "punished" }, times: tok.n } }] }];
  }
  // "You may collect evidence 4" as it resolves (CR 701.59a): only after "you may" (a player can't be made to).
  if ((m = /^Collect evidence (\d+)$/.exec(s))) return ctx.mayNow ? [{ type: "collectEvidence", n: Number(m[1]) }] : null;
  // Additional phases (CR 500.8): "After this main phase, there is an additional combat phase followed by an additional
  // main phase", "after this phase, there are two additional combat phases", and, after "If it's your main phase,",
  // "there is an additional combat phase after this phase".
  if (
    (m = /^After this (main |combat )?phase, there(?: is|'s| are) (an|two) additional combat phases?(,? followed by an additional main phase)?$/i.exec(s)) ??
    (m = /^There(?: is|'s| are) (an|two) additional combat phases? after this phase(,? followed by an additional main phase)?$/i.exec(s))
  ) {
    const [after, n, main] = m.length === 4 ? [m[1]?.trim(), m[2]!, m[3]] : [undefined, m[1]!, m[2]];
    if (n.toLowerCase() === "two" && main) return null;
    const phases: ("combat" | "main")[] = n.toLowerCase() === "two" ? ["combat", "combat"] : main ? ["combat", "main"] : ["combat"];
    return [{ type: "addPhases", phases, ...(after ? { after: after as "main" | "combat" } : {}) }];
  }
  // Y'shtola Rhul: "Then if it's the first end step of the turn, there is an additional end step after this step".
  if (/^(?:[Tt]hen )?[Ii]f it's the first end step of the turn, there is an additional end step after this step$/.test(s)) return [{ type: "addEndStep" }];
  // Sphinx of the Second Sun: "there is an additional beginning phase after this phase" (CR 500.8).
  if (/^[Tt]here is an additional beginning phase after this phase$/.test(s)) return [{ type: "addPhases", phases: ["beginning"] }];
  // Timetwister: "Each player shuffles their hand and graveyard into their library, then draws seven cards." Reminisce:
  // "Target player shuffles their graveyard into their library."
  // Endurance: "up to one target player puts all the cards from their graveyard on the bottom of their library in a random
  // order" (no shuffle).
  if ((m = /^((?:[Uu]p to one t|[Tt])arget player|[Ee]ach player) puts all the cards from their graveyard on the bottom of their library in a random order$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    return who ? [{ type: "shuffleZones", who, graveyard: true, bottom: true }] : null;
  }
  // "Shuffle all creature cards from your graveyard into your library" (Rooting Kavu, Barishi): those cards only.
  if ((m = /^[Ss]huffle all (?:(.+?) )?cards from your graveyard into your library$/.exec(s))) {
    const filter = m[1] ? parseSearchFilter(`${m[1]} card`) : undefined;
    if (filter === null || /\bthat\b/.test(m[1] ?? "")) return null;
    return [{ type: "shuffleZones", who: { ref: "you" }, graveyard: true, ...(filter ? { filter } : {}) }];
  }
  // Winds of Change: "Each player shuffles the cards from their hand into their library, then draws that many cards."
  // Whirlpool Warrior: "shuffle the cards from your hand into your library, then draw that many cards".
  if ((m = /^(?:([Tt]arget player|[Ee]ach player|[Tt]arget opponent) shuffles the cards from their hand into their library, then draws|[Ss]huffle the cards from your hand into your library, then draw) that many cards$/.exec(s))) {
    const who: PlayerRef | null = m[1] ? parsePlayer(m[1].toLowerCase(), ctx) : { ref: "you" };
    return who ? [{ type: "shuffleZones", who, hand: true, drawThatMany: true }] : null;
  }
  // "..., then that player shuffles their hand into their library" (Jace, the Mind Sculptor): the player targeted before.
  if ((m = /^(?:([Tt]arget player|[Ee]ach player|[Tt]arget opponent|[Tt]hat player) shuffles their|[Ss]huffle your) (hand and graveyard|graveyard and hand|graveyard|hand) into (?:their|your) library(?:, then (?:draws|draw) (\w+) cards?)?$/.exec(s))) {
    const who: PlayerRef | null = m[1] ? parsePlayer(m[1].toLowerCase(), ctx) : { ref: "you" };
    if (!who) return null;
    const out: Effect[] = [{ type: "shuffleZones", who, ...(m[2] !== "graveyard" ? { hand: true as const } : {}), ...(m[2] !== "hand" ? { graveyard: true as const } : {}) }];
    if (m[3]) {
      const n = num(m[3]);
      if (!Number.isInteger(n)) return null;
      out.push({ type: "draw", who, n });
    }
    return out;
  }
  // "Sacrifice it at end of combat", "destroy that creature at end of combat" (CR 511.2, 603.7), "return ~ to its
  // owner's hand at the beginning of the next cleanup step" (514.3a): a delayed trigger
  // about the source or about the object the trigger was about, with no targets of its own.
  // "At the beginning of the next end step, sacrifice it" (Apprentice Necromancer, Momo's Heist): the same instruction.
  if ((m = /^At the beginning of (the|your) next end step, ([a-z].+)$/.exec(s)) && !/\b(?:if|unless|then|instead)\b|,/.test(m[2]!)) return parseSentence(`${m[2]!.charAt(0).toUpperCase()}${m[2]!.slice(1)} at the beginning of ${m[1]} next end step`, ctx);
  if ((m = /^(.+?) at (end of combat|the beginning of the next cleanup step|the beginning of (?:the|your) next end step)$/i.exec(s)) && !(ctx.lastCreatedAny && /^(Sacrifice|Exile) (?:it|them|the tokens?|that token|those tokens)$/i.test(m[1]!))) {
    const before = ctx.targets.length;
    // "Sacrifice it", "its controller sacrifices it" (Celestial Sword): only a permanent its controller controls then
    // (CR 701.21a), or whoever controls it then. In an activated ability of a permanent that names nothing else before
    // ("{2}: ~ gets +1/+1 until end of turn. Sacrifice it at the beginning of the next end step", Deathknell Kami), "it" is ~.
    const selfItNow = ctx.activated && !ctx.spell && !ctx.selfIt && ctx.lastObjectTarget === undefined && !ctx.lastCreated && !ctx.lastAttached && !ctx.subject && !ctx.subjectIt && !ctx.selfCard;
    const withSelfIt = <T,>(f: () => T): T => {
      const r = f();
      if (r || !selfItNow) return r;
      ctx.selfIt = true;
      try {
        return f();
      } finally {
        delete ctx.selfIt;
      }
    };
    const sac = /^(Sacrifice|(?:Its|That creature's) controller sacrifices) (it|that creature|that token|the token|them|those creatures|those tokens)$/i.exec(m[1]!);
    const sacWhat = sac && withSelfIt(() => parseObject(sac[2]!, ctx));
    const inner: Effect[] | null = sac ? (sacWhat ? [{ type: "sacrifice", what: sacWhat, ...(/controller/.test(sac[1]!) ? { byController: true as const } : {}) }] : null) : withSelfIt(() => parseSentence(m![1]!.replace(/^./, (c) => c.toUpperCase()), ctx));
    if (!inner || ctx.targets.length !== before) return null;
    const refs = new Set<string>();
    const whats = new Set<string>();
    let players = true;
    for (const y of allEffects(inner)) {
      if ("what" in y) {
        refs.add((y.what as ObjRef).ref);
        whats.add(JSON.stringify(y.what));
      }
      if ("who" in y && (y.who as PlayerRef).ref !== "you") players = false;
      if (y.type === "delayed") players = false;
    }
    const when = m[2] === "end of combat" ? "endOfCombat" : /cleanup/.test(m[2]!) ? "nextCleanup" : /your next/.test(m[2]!) ? "yourNextEndStep" : "nextEndStep";
    // "Discard three cards at the beginning of the next end step" (Ideas Unbound), "create a 4/4 red Bird creature token
    // with flying at the beginning of the next end step" (Rukh Egg), "you lose the game" (Glorious End): about no object,
    // only its controller.
    // "Untap up to two lands" (Teferi, Hero of Dominaria): chosen then (rulings).
    if (players && refs.size === 0 && allEffects(inner).every((y) => ["draw", "discard", "createToken", "loseLife", "gainLife", "loseGame", "untapUpTo"].includes(y.type)))
      return [{ type: "delayed", when, effects: inner, text: m[1]! }];
    if (!players || refs.size !== 1) return null;
    const [ref] = refs;
    // "Target creature you control gets +2/+2 until end of turn. Return it to its owner's hand at the beginning of the next
    // end step" (Dragon Mask), "Sacrifice those creatures ..." (Tears of Rage, Wake the Dead), "Exile that token ..."
    // (Manaform Hellkite): about each of those objects as it is now; if one leaves the battlefield first, it's a new
    // object the delayed trigger doesn't know (CR 603.7c, 400.7). One delayed trigger for each object.
    if ((ref === "target" || ref === "created" || ref === "affected" || ref === "attached") && whats.size === 1 && when !== "nextCleanup") {
      const of = JSON.parse([...whats][0]!) as ObjRef;
      const effects = JSON.parse(JSON.stringify(inner).split(JSON.stringify(of)).join('{"ref":"subject"}')) as Effect[];
      return [{ type: "delayed", when, of, effects, text: m[1]! }];
    }
    if (ref === "subject") return [{ type: "delayed", when, each: "subject", effects: inner, text: m[1]! }];
    // The Locust God: "When ~ dies, return it to its owner's hand at the beginning of the next end step": about the card
    // in the graveyard now; if it leaves there first, it stays where it went (rulings).
    // Seraph: "put that card onto the battlefield under your control at the beginning of the next end step": the card in
    // the graveyard now, if it's still there then (rulings).
    if (ref === "subjectCard" && when === "nextEndStep" && inner.length === 1 && inner[0]!.type === "putOntoBattlefield") return [{ ...inner[0]!, atNextEndStep: true }];
    // Liesa: "Whenever another nontoken creature you control dies, return that card to its owner's hand at the beginning of
    // the next end step": the card in the graveyard now, if it's still there then (rulings; CR 400.7).
    if (ref === "subjectCard" && when === "nextEndStep") return [{ type: "delayed", when, each: "subjectCard", effects: inner, text: m[1]! }];
    if (ref === "selfCard") return [{ type: "delayed", when, each: "selfCard", effects: JSON.parse(JSON.stringify(inner).replace(/\{"ref":"selfCard"\}/g, '{"ref":"subjectCard"}')) as Effect[], text: m[1]! }];
    if (ref !== "self") return null;
    // The delayed trigger is about the source as it is now: if it leaves, it's a new object (CR 400.7).
    const effects = JSON.parse(JSON.stringify(inner).replace(/\{"ref":"self"\}/g, '{"ref":"subject"}')) as Effect[];
    return [{ type: "delayed", when, effects, text: m[1]! }];
  }
  // Uro: "When ~ enters, sacrifice it unless it escaped" (CR 702.138b): whether it escaped can't change.
  if (/^[Ss]acrifice (?:~|it) unless (?:it|~) escaped$/.test(s) && ctx.selfIt && ctx.lastObjectTarget === undefined)
    return [{ type: "if", cond: { kind: "state", cond: { kind: "self", is: "escaped" } }, effects: [], otherwise: [sacrificeSelf] }];
  // "Sacrifice ~ unless you pay {U}" (upkeep costs): pay to keep it, or it's sacrificed.
  if ((m = /^[Ss]acrifice (~|it) unless you pay (.+)$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const pay = parsePayCost(m[2]!);
    if (!pay || (pay.mana && !plainMana(pay.mana))) return null;
    return [{ type: "may", effects: [], pay, otherwise: [sacrificeSelf], keep: true, text: `Pay ${m[2]} to keep ~` }];
  }
  // Volatile Stormdrake: "sacrifice that creature unless you pay an amount of {E} equal to its mana value", the creature
  // it targeted (now yours): its mana value as this resolves.
  if ((m = /^[Ss]acrifice (that creature) unless you pay an amount of \{E\} equal to its mana value$/.exec(s)) && ctx.lastObjectTarget !== undefined) {
    const what = parseObject(m[1]!, ctx);
    const n = parseCount("its mana value", ctx);
    if (what?.ref !== "target" || !n) return null;
    return [{ type: "may", effects: [], payEnergy: n, otherwise: [{ type: "sacrifice", what }], keep: true, text: "Pay {E} equal to that creature's mana value to keep it" }];
  }
  // "Tap ~ unless you pay 1 life" (Carnophage): chosen as it resolves; paying while it's tapped is allowed and doesn't
  // untap it (rulings).
  if ((m = /^[Tt]ap ~ unless you pay (\d+ life)$/.exec(s))) {
    const pay = parsePayCost(m[1]!);
    if (!pay) return null;
    return [{ type: "may", effects: [], pay, otherwise: [{ type: "tap", what: { ref: "self" } }], keep: true, text: `Pay ${m[1]} to keep ~ untapped` }];
  }
  // "Sacrifice ~ unless you discard a card" (Masticore), "sacrifice it unless you discard a card at random" (Balduvian
  // Horde): the choice is made on resolution; with no card to discard, it's sacrificed (rulings).
  if ((m = /^[Ss]acrifice (~|it) unless you discard a card( at random)?$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const discard: Effect = { type: "discard", who: { ref: "you" }, n: 1, ...(m[2] ? { random: true } : {}) };
    return [{ type: "may", effects: [discard], otherwise: [sacrificeSelf], keep: true, text: `Discard a card${m[2] ?? ""} to keep ~` }];
  }
  // "Sacrifice ~ unless you discard a land card" (Fallow Wurm), "exile it unless you discard a creature card" (Body
  // Snatcher): only such a card can be discarded; with none, it's sacrificed (exiled).
  if ((m = /^(Sacrifice|Exile) (~|it) unless you discard (an? .+? card)$/i.exec(s)) && (m[2] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const filter = parseSearchFilter(m[3]!.replace(/^an? /, ""));
    if (!filter) return null;
    const away: Effect = /^sacrifice/i.test(m[1]!) ? sacrificeSelf : { type: "exile", what: { ref: "self" } };
    return [{ type: "may", effects: [{ type: "discard", who: { ref: "you" }, n: 1, filter }], otherwise: [away], keep: true, text: `Discard ${m[3]} to keep ~` }];
  }
  // "Sacrifice ~ unless you exile the top creature card of your graveyard" (Barrow Ghoul): with none there, it's sacrificed;
  // without ~, it can still be exiled (rulings).
  if ((m = /^[Ss]acrifice (~|it) unless you exile the top (.+?) of your graveyard$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const filter = parseSearchFilter(m[2]!);
    if (filter === null) return null;
    const exile: Effect = { type: "exile", what: { ref: "graveyardEnd", who: { ref: "you" }, ...(filter ? { filter } : {}) } };
    return [{ type: "may", effects: [exile], otherwise: [sacrificeSelf], keep: true, text: `Exile the top ${m[2]} of your graveyard to keep ~` }];
  }
  // Bandit's Talent: "each opponent discards two cards unless they discard a nonland card", Compulsive Research's "that
  // player discards two cards unless they discard a land card": each chooses in APNAP order, then all discard at once
  // (a punisher). With no card of that kind, two cards; they may discard two of that kind too (rulings).
  if ((m = new RegExp(`^(.+?) discards? (two|three) cards unless (?:they|that player) discards? (an? .+? card)$`).exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const filter = parseSearchFilter(m[3]!.replace(/^an? /, ""));
    if (!who || who.ref === "you" || !filter) return null;
    return [{ type: "punisher", who, options: [{ discard: 1, filter }], effects: [{ type: "discard", who: { ref: "punished" }, n: num(m[2]!) }] }];
  }
  // Highway Robbery: "You may discard a card or sacrifice a land. If you do, ...": one or the other, as it resolves, only
  // one that can be done (rulings).
  if ((m = /^[Dd]iscard a card or sacrifice an? ([a-z]+)$/.exec(s))) {
    const filter = pickFilter(m[1]!);
    if (filter?.kind !== "object") return null;
    return [{ type: "either", options: [[{ type: "discard", who: { ref: "you" }, n: 1 }], [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "sacrifice" }]], labels: ["Discard a card", `Sacrifice ${/^[aeiou]/.test(m[1]!) ? "an" : "a"} ${m[1]}`], onlyDoable: true }];
  }
  // "Then discard two cards unless you discard a creature card" (Mystic Meditation, Thirst for Knowledge): a card of
  // that kind, or two cards. With none of that kind, two cards (rulings).
  if ((m = new RegExp(`^(?:[Tt]hen )?[Dd]iscard (two|three|\\d+) cards unless you discard (an? .+? card)$`).exec(s))) {
    const filter = parseSearchFilter(m[2]!.replace(/^an? /, ""));
    if (!filter) return null;
    return [{ type: "may", effects: [{ type: "discard", who: { ref: "you" }, n: 1, filter }], otherwise: [{ type: "discard", who: { ref: "you" }, n: num(m[1]!) }], keep: true, text: `Discard ${m[2]} rather than ${m[1]} cards` }];
  }
  // The Lairs: "sacrifice it unless you return a non-Lair land you control to its owner's hand". Returning one keeps it;
  // with none to return, it's sacrificed. Quickling: "unless you return another creature you control".
  if ((m = /^[Ss]acrifice (~|it) unless you return (an? .+?|another .+?) you control to its owner's hand$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const another = /^another /.test(m[2]!);
    const filter = pickFilter(m[2]!.replace(/^(?:an?|another) /, ""));
    if (!filter) return null;
    return [{ type: "may", effects: [{ type: "pick", who: { ref: "you" }, filter: another ? { ...filter, notSource: true, text: `other ${filter.text}` } : filter, n: 1, action: "bounce" }], otherwise: [sacrificeSelf], keep: true, text: `Return ${m[2]} you control to its owner's hand to keep ~` }];
  }
  // Command Bridge: "sacrifice it unless you tap an untapped permanent you control". Tapping one keeps it; with none
  // untapped, or choosing not to, it's sacrificed.
  if ((m = /^[Ss]acrifice (~|it) unless you tap an untapped ([a-z]+) you control$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const filter = pickFilter(m[2]!);
    if (filter?.kind !== "object") return null;
    return [{ type: "may", effects: [{ type: "pick", who: { ref: "you" }, filter: { ...filter, tapped: false, text: `untapped ${filter.text}` }, n: 1, action: "tap" }], otherwise: [sacrificeSelf], keep: true, text: `Tap an untapped ${m[2]} you control to keep ~` }];
  }
  // "Sacrifice ~ unless you sacrifice a land" (Bog Elemental, The Gitrog Monster): sacrificing one keeps it; with none to
  // sacrifice, or choosing not to, it's sacrificed.
  if ((m = /^[Ss]acrifice (~|it) unless you sacrifice (an? .+?|another .+?)$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const filter = pickFilter(m[2]!.replace(/^(?:an?|another) /, ""));
    if (!filter || / or |,/.test(m[2]!)) return null;
    return [{ type: "may", effects: [{ type: "pick", who: { ref: "you" }, filter: { ...filter, notSource: true }, n: 1, action: "sacrifice" }], otherwise: [sacrificeSelf], keep: true, text: `Sacrifice ${m[2]} to keep ~` }];
  }
  // Bandit's Talent: "draw an additional card for each opponent who has one or fewer cards in hand" (in your draw step).
  if ((m = /^(.*?\b[Dd]raws?) an additional card for each (.+)$/.exec(s))) return parseSentence(`${m[1]} a card for each ${m[2]}`, ctx);
  // "That player draws an additional card" (Howling Mine): just another draw.
  if ((m = /^(.*?\b[Dd]raws?) an additional card$/.exec(s))) return parseSentence(`${m[1]} a card`, ctx);
  // "Draw two additional cards" (Sarkhan, the Dragonspeaker's emblem, in your draw step): two more draws.
  if ((m = /^(.*?\b[Dd]raws?) (two|three) additional cards$/.exec(s))) return parseSentence(`${m[1]} ${m[2]} cards`, ctx);
  // Poison counters on a player (CR 122.1f): "defending player gets a poison counter", "each opponent gets two".
  if ((m = new RegExp(`^(.+?) gets? (a|${NUMX}) poison counters?$`).exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && [{ type: "poison", who, n: m[2] === "a" ? 1 : amt(m[2]!) }];
  }
  // Vraska, Betrayal's Sting: "If target player has fewer than nine poison counters, they get a number of poison counters
  // equal to the difference": worked out as it resolves; replacement effects can still change how many (rulings).
  if ((m = /^If (target player|target opponent) has fewer than (nine|ten) poison counters, they get a number of poison counters equal to the difference$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && [{ type: "poison", who, n: 0, upTo: m[2] === "nine" ? 9 : 10 }];
  }
  // Adding mana from a spell or a non-mana triggered ability (CR 605.5a: it uses the stack): "Add {B}{B}{B}" (Dark
  // Ritual), "add one mana of any color", "add three mana of any one color" (the color is chosen as it resolves).
  if ((m = /^[Aa]dd ((?:\{[WUBRGC]\})+)$/.exec(s))) return [{ type: "addMana", mana: m[1]! }];
  if ((m = new RegExp(`^[Aa]dd ${NUM} (\\{[WUBRGC]\\})$`).exec(s)) && num(m[1]!) > 1) return [{ type: "addMana", mana: m[2]!.repeat(num(m[1]!)) }];
  // Another player adds the mana (CR 106.4): "target player adds two mana of any one color" (Bigger on the Inside), "that
  // player adds {G}{G}" (Eladamri's Vineyard), "the active player adds {C}{C} for each ..." (Belbe). The player who adds
  // it chooses its color (608.2d: the player doing the instruction).
  if ((m = /^([Tt]arget player|[Tt]hat player|[Tt]he active player) adds (.+)$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    // "That player adds {C} for each artifact they control" (Blinkmoth Urn): that player counts their own.
    const theirs = /^((?:\{[WUBRGC]\})+) for each (.+) they control$/.exec(m[2]!);
    if (theirs) {
      const count = who && who.ref !== "target" ? parseCount(`${theirs[2]} on the battlefield`, ctx, true) : null;
      if (!who || !count || count.count.kind !== "permanents" || count.times || count.plus) return null;
      return [{ type: "addMana", mana: theirs[1]!, times: { count: { ...count.count, whose: who } }, who }];
    }
    const inner = who && parseSentence(`Add ${m[2]!}`, ctx);
    if (!who || !inner?.length || !inner.every((e) => (e.type === "addMana" && !e.anyColors) || (e.type === "choose" && e.choice === "color"))) return null;
    return inner.map((e) => ({ ...e, who }));
  }
  // "Add {R} for each card in target opponent's hand" (Jeska's Will): counted as it resolves.
  if ((m = /^[Aa]dd ((?:\{[WUBRGC]\})+) for each (.+)$/.exec(s))) {
    const times = parseCount(m[2]!, ctx, true);
    return times && [{ type: "addMana", mana: m[1]!, times }];
  }
  // "Add {B} or {G} for each permanent destroyed this way" (Culling Ritual): either color for each one, chosen as it
  // resolves (rulings: "You aren't limited to one color").
  // "+1: Add {R} or {G}" (Domri, Anarch of Bolas): one mana of either, chosen as it resolves.
  if ((m = /^[Aa]dd \{([WUBRG])\} or \{([WUBRG])\}$/.exec(s)) && m[1] !== m[2]) return [{ type: "addMana", split: [m[1] as ManaType, m[2] as ManaType], times: 1 }];
  // "Add three mana in any combination of {R} and/or {G}" (Orcish Lumberjack): each of either, chosen as it resolves.
  // "Add X mana in any combination of {B} and/or {R}, where X is the sacrificed creature's mana value" (Burnt Offering).
  if ((m = new RegExp(`^[Aa]dd ${NUMX} mana in any combination of \\{([WUBRG])\\} and/or \\{([WUBRG])\\}$`).exec(s)) && m[2] !== m[3])
    return [{ type: "addMana", split: [m[2] as ManaType, m[3] as ManaType], times: amt(m[1]!) }];
  if ((m = /^[Aa]dd \{([WUBRG])\} or \{([WUBRG])\} for each (.+)$/.exec(s)) && m[1] !== m[2]) {
    const times = parseCount(m[3]!, ctx, true);
    return times && [{ type: "addMana", split: [m[1] as ManaType, m[2] as ManaType], times }];
  }
  // "Add an amount of {R} equal to ~'s power" (Molten-Core Maestro): counted as it resolves.
  if ((m = /^[Aa]dd an amount of (\{[WUBRGC]\}) equal to (.+)$/.exec(s))) {
    const times = parseCount(m[2]!, ctx);
    return times && [{ type: "addMana", mana: m[1]!, times }];
  }
  if ((m = new RegExp(`^[Aa]dd ${NUM} mana of any (one )?color$`).exec(s)) && (num(m[1]!) === 1 || m[2])) return [{ type: "choose", choice: "color" }, { type: "addMana", chosen: num(m[1]!) }];
  // "Add X mana of any one color, where X is 1 plus the exiled creature's mana value" (Food Chain): one color, chosen as
  // it resolves (CR 605.3b), X of it.
  if (/^[Aa]dd X mana of any one color$/.test(s)) return [{ type: "choose", choice: "color" }, { type: "addMana", chosen: 1, times: amt("X") }];
  // "Add two mana in any combination of colors" (Manamorphose), "add X mana in any combination of colors" (Klauth, with
  // its "where X is ..."): the colors are chosen as it resolves (CR 106.1b, 608.2d).
  if ((m = new RegExp(`^[Aa]dd ${NUMX} mana in any combination of colors$`).exec(s))) return [{ type: "addMana", anyColors: true, times: amt(m[1]!) }];
  // Coalition Relic: "Add one mana of any color for each charge counter removed this way": a color for each one.
  if ((m = /^[Aa]dd one mana of any color for each [a-z]+ counter removed this way$/.exec(s))) return [{ type: "addMana", anyColors: true, times: { count: { kind: "countersRemovedThisWay" } } }];
  // Energy (CR 107.14): "You get {E}{E}", "you get X {E}", "you get an amount of {E} equal to ~'s power".
  if ((m = /^(?:[Yy]ou )?[Gg]et ((?:\{E\})+)$/.exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: m[1]!.length / 3 }];
  if ((m = new RegExp(`^(?:[Yy]ou )?[Gg]et ${NUMX} \\{E\\}$`).exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = /^(?:[Yy]ou )?[Gg]et an amount of \{E\} equal to (.+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    return n && [{ type: "getEnergy", who: { ref: "you" }, n }];
  }
  // Experience counters (CR 122.1): "you get an experience counter", "... for each player who discarded a card this turn".
  if ((m = new RegExp(`^(?:[Yy]ou )?[Gg]et ${NUMX} experience counters?$`).exec(s))) return [{ type: "getExperience", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = /^(?:[Yy]ou )?[Gg]et an experience counter for each (.+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx, true);
    return n && [{ type: "getExperience", who: { ref: "you" }, n }];
  }
  // The monarch (CR 725).
  if (/^You become the monarch$/i.test(s)) return [{ type: "becomeMonarch", who: { ref: "you" } }];
  // "You may play an additional land this turn", "you may play up to two additional lands this turn" (CR 305.2a).
  if ((m = new RegExp(`^You may play (?:an|up to ${NUM}) additional lands? this turn$`, "i").exec(s))) return [{ type: "extraLandThisTurn", n: m[1] ? num(m[1]) : 1 }];
  // Nahiri's Lithoforming: "You may play X additional lands this turn", the spell's X.
  if (/^You may play X additional lands this turn$/i.test(s)) return [{ type: "extraLandThisTurn", n: { count: { kind: "x" } } }];
  // The initiative (CR 726), which ventures into Undercity; and venturing into Undercity itself (CR 701.49d). Plain
  // "venture into the dungeon" lets its player pick a dungeon that isn't modeled yet (see oracle/dungeons.ts).
  if (/^(?:You )?take the initiative$/i.test(s)) return dungeonSupported(UNDERCITY) ? [{ type: "takeInitiative", who: { ref: "you" } }] : null;
  if (/^(?:You )?venture into Undercity$/i.test(s)) return dungeonSupported(UNDERCITY) ? [{ type: "venture", undercity: true }] : null;
  if (/^(?:You )?venture into the dungeon$/i.test(s)) return DUNGEONS.length > 1 && DUNGEONS.every(dungeonSupported) ? [{ type: "venture" }] : null;
  // "Venture into the dungeon and you gain 3 life", "Create a Treasure token and venture into the dungeon": in order.
  if ((m = /^(?:Venture into the dungeon and (.+)|(.+?) and venture into the dungeon)$/.exec(s))) {
    const other = parseSentence((m[1] ?? m[2])!.replace(/^./, (c) => c.toUpperCase()), ctx);
    return other && (m[1] ? [{ type: "venture" }, ...other] : [...other, { type: "venture" }]);
  }
  // The Ring tempts you (CR 701.54).
  if (/^the Ring tempts you$/i.test(s)) return [{ type: "ringTempts" }];
  if (/^Target player becomes the monarch$/i.test(s)) return [{ type: "becomeMonarch", who: { ref: "target", index: addTarget(ctx, { kind: "player", text: "target player" }) } }];
  // "Choose a creature type." / "Choose a color." (the rest of the text says what it's for).
  // "Each player chooses a creature type." (Patriarch's Bidding, Harsh Mercy): one each, "a type chosen this way" after.
  if (/^Each player chooses a creature type$/.test(s)) return [{ type: "choose", choice: "creatureType", each: true }];
  // "Choose a number between 0 and 10." (Expel the Interlopers): as it resolves, kept for the rest (CR 608.2d).
  if ((m = /^Choose a number between (\d+) and (\d+)$/.exec(s)) && Number(m[1]) <= Number(m[2])) return [{ type: "choose", choice: "number", range: { min: Number(m[1]), max: Number(m[2]) } }];
  if ((m = /^Choose an? (creature type|color)(?: other than (\w+))?$/i.exec(s)))
    return [{ type: "choose", choice: m[1]!.toLowerCase() === "color" ? "color" : "creatureType", ...(m[2] ? { except: m[2] } : {}) }];

  // "~ gets +1/+1 until end of turn for each creature blocking it (beyond the first)" (rampage, CR 702.23)
  if ((m = /^~ gets ([+-]\d+)\/([+-]\d+) until end of turn for each creature blocking it( beyond the first)?$/.exec(s)))
    return [{ type: "pumpPerBlocker", what: { ref: "self" }, power: Number(m[1]), toughness: Number(m[2]), beyondFirst: !!m[3] }];
  // Prevention (CR 615): shields for the next N damage this turn, and Fog.
  if ((m = new RegExp(`^Prevent the next ${NUMX} damage that would be dealt to (any target|target .+?) this turn$`, "i").exec(s))) {
    const to = /^any target$/i.test(m[2]!) ? parseDamageRecipient(m[2]!, ctx) : parseObject(m[2]!, ctx);
    return to ? [{ type: "preventNext", n: amt(m[1]!), to }] : null;
  }
  if (/^Prevent all combat damage that would be dealt this turn$/i.test(s)) return [{ type: "preventCombatDamage" }];
  // "You can't lose life this turn, you can't lose the game this turn, and your opponents can't win the game this turn"
  // (Courageous Resolve; CR 119.8, 104.3), "You can't lose the game this turn and your opponents can't win the game this turn".
  if (/^(?:you can't (?:lose life|lose the game) this turn(?:,? and |, )?)+(?:your opponents can't win the game this turn)?$/i.test(s) && /\bthis turn$/.test(s)) {
    const rules: Extract<Effect, { type: "turnRules" }>["rules"] = [];
    if (/you can't lose life this turn/i.test(s)) rules.push("cantLoseLife");
    if (/you can't lose the game this turn/i.test(s)) rules.push("cantLoseGame");
    if (/your opponents can't win the game this turn/i.test(s)) rules.push("opponentsCantWin");
    return [{ type: "turnRules", rules }];
  }
  // Everybody Lives!: "Players can't lose life this turn and players can't lose the game or win the game this turn" (CR
  // 119.8, 104.3): every player in the game as it resolves.
  // Detection Tower: hexproof ignored for its controller's spells and abilities, this turn (CR 702.11e).
  if (/^(?:Until end of turn, your|Your) opponents and creatures your opponents control with hexproof can be the targets of spells and abilities you control as though they didn't have hexproof(?: until end of turn)?$/.test(s) && /\buntil end of turn\b/i.test(s)) return [{ type: "turnRules", rules: ["seeHexproof"] }];
  if (/^Players can't lose life this turn and players can't lose the game or win the game this turn$/.test(s)) return [{ type: "turnRules", rules: ["cantLoseLife", "cantLoseGame", "cantWinGame"], everyone: true }];
  if (/^Players gain hexproof until end of turn$/.test(s)) return [{ type: "playerGains", keywords: ["Hexproof"], everyone: true }];
  if (/^You may cast spells this turn as though they had flash$/i.test(s)) return [{ type: "turnRules", rules: ["flash"] }];
  // The Chain Veil (CR 606.3, rulings): planeswalkers that come under your control later this turn too.
  if (/^For each planeswalker you control, you may activate one of its loyalty abilities once this turn as though none of its loyalty abilities have been activated this turn$/.test(s)) return [{ type: "turnRules", rules: ["extraLoyalty"] }];
  if ((m = /^Until your next turn, you may cast (sorcery|creature|artifact|enchantment) spells as though they had flash$/.exec(s))) {
    const filter = parseTargetPhrase(`${m[1]} spell`);
    return filter?.kind === "spell" ? [{ type: "flashUntilNextTurn", filter: { ...filter, text: `${m[1]} spells` } }] : null;
  }
  if (/^Until your next turn, your opponents can't cast spells from anywhere other than their hands$/.test(s)) return [{ type: "opponentsHandOnlyUntilNextTurn" }];
  if (/^Spells you control can't be countered this turn$/i.test(s)) return [{ type: "turnRules", rules: ["spellsUncounterable"] }];
  // Autumn's Veil: "Spells you control can't be countered by blue or black spells this turn".
  if ((m = /^Spells you control can't be countered by (white|blue|black|red|green) or (white|blue|black|red|green) spells this turn$/i.exec(s)) && m[1] !== m[2])
    return [{ type: "turnRules", rules: ["spellsUncounterable"], byColors: [COLOR_WORDS[m[1]!.toLowerCase()]!, COLOR_WORDS[m[2]!.toLowerCase()]!] }];
  // Domri, Anarch of Bolas: "Creature spells you cast this turn can't be countered" (rulings: every one, after it resolves).
  if (/^Creature spells you cast this turn can't be countered$/i.test(s)) return [{ type: "turnRules", rules: ["creatureSpellsUncounterable"] }];
  // Screaming Nemesis: each player the damage just before was dealt to (CR 119.7), for good.
  if (/^If a player is dealt damage this way, they can't gain life for the rest of the game$/.test(s)) return [{ type: "noLifeGainForGame", who: { ref: "damagedThisWay" } }];
  if ((m = /^(Players|Your opponents) can't gain life this turn$/i.exec(s))) return [{ type: "noLifeGain", players: /^players$/i.test(m[1]!) ? "all" : "opponents" }];
  if (/^Damage can't be prevented this turn$/i.test(s)) return [{ type: "noPrevention" }];
  // "Your opponents can't cast spells this turn" (Silence), "Target player can't ..." (Orim's Chant), "Its controller
  // can't ..." (Render Silent), "defending player can't ..." (Xantid Swarm), "Players can't cast noncreature spells this
  // turn" (Calamity's Wake), "Players dealt damage this way can't ..." (Aurelia's Fury): a "can't" for those players
  // until the turn ends, which wins over anything that says they can (CR 101.2).
  // "Players can't cast creature or planeswalker spells until the end of your next turn" (Single Combat): until the end
  // of this effect's controller's next turn.
  if ((m = /^(.+?) can't cast (?:(noncreature|creature|instant|sorcery|artifact|creature or planeswalker) )?spells (this turn|until the end of your next turn)$/i.exec(s))) {
    const w = m[1]!.toLowerCase();
    const who: PlayerRef | null = w === "players" ? { ref: "eachPlayer" } : w === "your opponents" ? { ref: "eachOpponent" } : w === "players dealt damage this way" ? { ref: "damagedThisWay" } : parsePlayer(w, ctx);
    if (!who) return null;
    const filter = m[2] ? parseTargetPhrase(`${m[2].toLowerCase()} spell`) : undefined;
    if (filter === null || (filter && filter.kind !== "spell")) return null;
    return [{ type: "cantCast", who, ...(filter ? { filter: { ...filter, text: `${m[2]!.toLowerCase()} spell` } } : {}), ...(m[3] !== "this turn" ? { untilYourNextTurnEnds: true as const } : {}) }];
  }
  // Hope of Ghirapur: "Until your next turn, target player ... can't cast noncreature spells": until this effect's
  // controller's next turn begins (CR 611.2b).
  if ((m = /^Until your next turn, (.+?) can't cast (?:(noncreature) )?spells$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    if (!who || who.ref !== "target") return null;
    const filter = m[2] ? parseTargetPhrase("noncreature spell") : undefined;
    if (filter === null || (filter && filter.kind !== "spell")) return null;
    return [{ type: "cantCast", who, ...(filter ? { filter: { ...filter, text: "noncreature spell" } } : {}), untilYourNextTurn: true }];
  }
  // "Target player can't play lands this turn" (Moonhold): one player, until the turn ends.
  if ((m = /^(target player|that player) can't play lands this turn$/i.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    return who ? [{ type: "cantPlayLands", who }] : null;
  }
  // "Prevent all combat damage that would be dealt to and dealt by that creature this turn" (Maze of Ith), "Prevent all
  // damage target creature would deal this turn": a prevention effect on that creature until the turn ends (CR 615.1).
  const wouldDeal = /^Prevent all (combat )?damage (.+?) would deal this turn$/i.exec(s);
  if (((m = /^(Prevent all .+) this turn$/i.exec(s)) && parsePreventAll(m[1]!)) || (m = wouldDeal)) {
    const p = m !== wouldDeal ? parsePreventAll(m[1]!) : { subject: m[2]!, mod: { kind: "preventDamage" as const, by: true as const, ...(m[1] ? { combat: "only" as const } : {}) } };
    const what = p && /^(~|it|that creature|target .+)$/i.test(p.subject) ? parseObject(p.subject, ctx) : null;
    return p && what ? [{ type: "continuous", what, mods: [p.mod], duration: "endOfTurn" }] : null;
  }
  // Redirection shields (CR 614.9): "The next 1 damage that would be dealt to ~ this turn is dealt to target creature
  // you control instead" (the en-Kor), "... dealt this turn to target white creature you control is dealt to ~ instead".
  if ((m = new RegExp(`^The next ${NUMX} damage that would be dealt (this turn )?to (.+?)( this turn)? is dealt to (.+) instead$`, "i").exec(s)) && !m[2] !== !m[4]) {
    const from = /^(~|any target|target .+)$/i.test(m[3]!) ? parseDamageRecipient(m[3]!, ctx) : null;
    const to = from && /^(~|any target|any other target|another target|target .+|another target .+)$/i.test(m[5]!) ? parseDamageRecipient(m[5]!, ctx) : null;
    return from && to ? [{ type: "redirectNext", n: amt(m[1]!), from, to }] : null;
  }
  // "Each creature deals 1 damage to its controller" (Rakdos Charm): each one deals it.
  if ((m = new RegExp(`^(each (?:[a-z]+ )?creature(?: [a-z ]+)?) deals ${NUMX} damage to its controller$`, "i").exec(s))) {
    const what = parseObject(m[1]!.toLowerCase(), ctx);
    return what && isGroup(what) ? [{ type: "eachDealsDamage", what, amount: amt(m[2]!), toController: true }] : null;
  }
  // "~ deals 2 damage to any target and 1 damage to any other target" (Arc Trail): both at once.
  if ((m = new RegExp(`^~ deals ${NUMX} damage to (.+?) and ${NUMX} damage to (.+)$`, "i").exec(s))) {
    const a = parseDamageRecipient(m[2]!, ctx);
    const b = a && parseDamageRecipient(m[4]!, ctx);
    return a && b ? [{ type: "damage", amount: amt(m[1]!), to: a }, { type: "damage", amount: amt(m[3]!), to: b }] : null;
  }
  // "~ deals 3 damage divided as you choose among one, two, or three targets": how many targets and how much each
  // gets are chosen with the targets, at least 1 each (CR 601.2d); "any number of targets" is one to that many.
  // "X damage" ("X plus 1"): the spell's X, announced before the targets (CR 601.2b), so one to X targets.
  // "Damage equal to its power" (Orca, Siege Demon): worked out the same way, with what the ability knows then.
  // "Among up to X target creatures" with X damage (Ravenous Gigantotherium) is the same: at least 1 each. "8 damage
  // divided as you choose among X target creatures" (Meteor Swarm): exactly the spell's X targets, so X is 8 at most.
  if ((m = /^~ deals (\d+|one|two|three|four|five|six|seven|eight|nine|ten|X|X plus 1|damage equal to .+?) (?:damage )?divided as you choose among (one or two|one, two, or three|any number of|up to X|X|up to (?:two|three|four|five|six|seven|eight|nine|ten)) (targets|target .+)$/i.exec(s))) {
    const equal = /^damage equal to (.+)$/.exec(m[1]!);
    const counted = equal ? parseCount(equal[1]!, ctx) : null;
    if (equal && !counted) return null;
    const to = addDivided(ctx, counted ?? m[1]!, m[2]!, m[3]!);
    return to && [{ type: "damage", amount: to.amount, to: { ref: "anyTarget", index: to.index, n: to.n }, divided: true }];
  }
  // "~ deals X damage divided evenly, rounded down, among any number of targets" (Fireball): no division is chosen; it's
  // worked out among the targets still legal as it resolves (rulings), so any number of targets, X or not (CR 115.6).
  if ((m = /^~ deals (X|\d+) damage divided evenly, rounded down, among any number of targets$/i.exec(s))) {
    if (ctx.targets.some((t) => t.many) || (m[1] === "X" && !ctx.spell)) return null;
    const index = addTarget(ctx, { kind: "any", text: "any target", many: "any" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index, n: 2 };
    return [{ type: "damage", amount: amt(m[1]!), to: { ref: "anyTarget", index, n: 2 }, evenly: true }];
  }
  // "Prevent the next 5 damage that would be dealt this turn to any number of targets, divided as you choose" (Remedy):
  // a shield of its part on each target, divided as for damage (CR 601.2d, 615.7).
  if ((m = /^Prevent the next (\d+|one|two|three|four|five|six|seven|eight|nine|ten|X) damage that would be dealt this turn to (any number of|one or two|one, two, or three) (targets|target .+), divided as you choose$/i.exec(s))) {
    const to = addDivided(ctx, m[1]!, m[2]!, m[3]!);
    return to && [{ type: "preventNext", n: to.amount, to: { ref: "anyTarget", index: to.index, n: to.n }, divided: true }];
  }
  // "~ deals X plus 2 damage to any other target, where X is ..." (Invasion of Tarkir): X, then 2 more.
  if ((m = /^(~|it|that creature) deals X plus (\d+) damage to (.+)$/i.exec(s))) {
    const fx = parseSentence(`${m[1]} deals X damage to ${m[3]}`, ctx);
    const d = fx?.length === 1 ? fx[0] : undefined;
    if (d?.type !== "damage" || typeof d.amount === "number" || d.amount.count.kind !== "x" || d.amount.plus || d.amount.times) return null;
    return [{ ...d, amount: { ...d.amount, plus: Number(m[2]) } }];
  }
  // "~ deals twice X damage to target creature" (Torch the Witness): X times 2; "five times X damage to each of up to X
  // targets" (Crackle with Power).
  if ((m = /^(~|it|that creature) deals (twice|three times|four times|five times) X damage to (.+)$/i.exec(s))) {
    const fx = parseSentence(`${m[1]} deals X damage to ${m[3]}`, ctx);
    const d = fx?.length === 1 ? fx[0] : undefined;
    if (d?.type !== "damage" || typeof d.amount === "number" || d.amount.count.kind !== "x" || d.amount.plus || d.amount.times) return null;
    return [{ ...d, amount: { ...d.amount, times: m[2] === "twice" ? 2 : num(m[2]!.replace(/ times$/, "")) } }];
  }
  // "~ deals damage to each player equal to twice the number of nonbasic lands that player controls" (Price of
  // Progress): each player their own amount, all dealt at once (CR 120.3).
  if ((m = /^~ deals damage to (each player|each opponent) equal to (twice )?the number of (.+)$/i.exec(s))) {
    const to = parseDamageRecipient(m[1]!, ctx);
    ctx.eachOne = true;
    const c = parseCount(m[3]!, ctx);
    ctx.eachOne = undefined;
    if (!to || !c || typeof c !== "object" || !("count" in c) || c.times || !JSON.stringify(c).includes('"eachOne"')) return null;
    return [{ type: "damage", amount: m[2] ? { ...c, times: 2 } : c, to }];
  }
  // Olórin's Searing Light: "~ deals damage to each opponent equal to the power of the creature they exiled": after
  // "each opponent exiles a creature ...", each that creature's power as it last existed (rulings, CR 608.2h), all
  // dealt at once (CR 120.3).
  if (/^~ deals damage to each opponent equal to the power of the creature they exiled$/.test(s) && ctx.spell) {
    const to = parseDamageRecipient("each opponent", ctx);
    return to ? [{ type: "damage", amount: { count: { kind: "exiledPowerOf", who: { ref: "eachOne" } } }, to }] : null;
  }
  // "~ deals damage to each player equal to half that player's life total, rounded down" (Heartless Hidetsugu): each
  // player half their own life total as it resolves, all dealt at once (CR 107.1a, 120.3).
  if ((m = /^~ deals damage to (each player|each opponent) equal to half (?:that player's|their) life total(?:, rounded (up|down))?$/i.exec(s))) {
    const to = parseDamageRecipient(m[1]!, ctx);
    const half = roundOf(m[2], ctx);
    return to && half ? [{ type: "damage", amount: { count: { kind: "life", who: { ref: "eachOne" } }, half }, to }] : null;
  }
  // "Whenever you cast an instant or sorcery spell, that spell deals damage to each opponent equal to ..." (Sorcerer
  // Class): the spell is the source, as it last existed if it has left the stack (rulings, CR 608.2h).
  if (ctx.castSpell && (m = /^[Tt]hat spell (deals .+)$/.exec(s))) {
    const fx = parseSentence(`~ ${m[1]}`, ctx);
    const d = fx?.length === 1 ? fx[0] : undefined;
    return d?.type === "damage" && !d.by && !d.divided && !d.evenly && !d.excessToController ? [{ ...d, by: "castSpell" }] : null;
  }
  // Damage: "~ deals 3 damage to any target"; "it deals that much damage to each other opponent" after "Whenever a
  // commander you control deals combat damage to an opponent" (Kediss): that creature deals it.
  const bySubject = ctx.subjectIt && !ctx.selfIt ? new RegExp(`^(?:it|that creature) deals ${NUMX} damage to (.+)$`, "i").exec(s) : null;
  if ((m = bySubject ?? new RegExp(`^~ deals ${NUMX} damage to (.+)$`, "i").exec(s))) {
    // "to each creature and each player": dealt to all of them at once (CR 120.3).
    const tos: DamageRecipient[] = [];
    // "To target creature and each other creature with the same name as that creature" is one recipient.
    for (const part of /with the same name as that/i.test(m[2]!) ? [m[2]!] : m[2]!.split(/,? and (?=each )/i)) {
      // "Each opponent and each battle they protect" (Joyful Stormsculptor): the battles any opponent protects (CR 310.9).
      // "Each opponent and each creature they control" (Delayed Blast Fireball): the creatures any opponent controls.
      if (/^each creature they control$/i.test(part) && tos.length === 1 && tos[0]!.ref === "eachOpponent") {
        tos.push({ ref: "each", filter: { kind: "object", types: ["Creature"], controller: "opponent", text: "each creature they control" } });
        continue;
      }
      if (/^each battle they protect$/i.test(part) && tos.length === 1 && tos[0]!.ref === "eachOpponent") {
        tos.push({ ref: "each", filter: { kind: "object", types: ["Battle"], protector: "opponent", text: "each battle they protect" } });
        continue;
      }
      // "Target opponent and each creature they control" (The Great Work): that player's creatures.
      const theirs = /^each creature they control$/i.test(part) && tos.length === 1 && tos[0]!.ref === "target" && ctx.lastPlayerTarget === tos[0]!.index;
      const to = parseDamageRecipient(theirs ? "each creature that player controls" : part, ctx);
      if (!to) return null;
      tos.push(to);
    }
    return [{ type: "damage", amount: amt(m[1]!), to: tos[0]!, ...(tos.length > 1 ? { also: tos.slice(1) } : {}), ...(bySubject ? { by: "subject" as const } : {}) }];
  }
  // Drawing
  if ((m = new RegExp(`^(?:You )?[Dd]raw ${NUMX} cards?$`).exec(s))) return [{ type: "draw", who: { ref: "you" }, n: amt(m[1]!) }];
  // "An opponent draws a card" (Baleful Mastery): one its controller chooses as it resolves (rulings).
  if ((m = new RegExp(`^[Aa]n opponent draws ${NUMX} cards?$`).exec(s))) return [{ type: "choose", choice: "opponent" }, { type: "draw", who: { ref: "chosenPlayer" }, n: amt(m[1]!) }];
  // "Draw half X cards, rounded down" (Wan Shi Tong), "you gain half X life and draw half X cards. Round down each time."
  // (Hydroid Krasis, CR 107.1a).
  if ((m = /^(?:(.+?) )?(draws?|gains?|loses?) half X (cards|life)(?:, rounded (up|down))?$/i.exec(s)) && /^draw/i.test(m[2]!) === (m[3] === "cards")) {
    const who = m[1] ? parsePlayer(m[1], ctx) : ({ ref: "you" } as const);
    const n = halfX(m[4], ctx);
    if (!who || !n) return null;
    const verb = m[2]!.toLowerCase();
    return [{ type: verb.startsWith("draw") ? "draw" : verb.startsWith("gain") ? "gainLife" : "loseLife", who, n }];
  }
  if ((m = new RegExp(`^(.+?) draws? ${NUMX} cards?$`, "i").exec(s)) && !/ may /i.test(m[1]!)) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "draw", who, n: amt(m[2]!) }] : null;
  }
  // "Each player ~ attacked this turn loses the game" (Angel of Destiny, CR 104.3e).
  if (/^[Ee]ach player ~ attacked this turn loses the game$/.test(s)) return [{ type: "loseGame", who: { ref: "attackedThisTurnBySelf" } }];
  // "Each opponent who doesn't control a legendary creature or planeswalker loses the game" (Nicol Bolas, Dragon-God).
  if ((m = /^(Each opponent who doesn't control .+) loses the game$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who?.ref === "opponentsControllingNo" ? [{ type: "loseGame", who }] : null;
  }
  // Life. "You may gain 1 life" leaves "Gain 1 life": yours.
  if ((m = new RegExp(`^Gain ${NUMX} life$`).exec(s))) return [{ type: "gainLife", who: { ref: "you" }, n: amt(m[1]!) }];
  // "You lose half your life, rounded up", "each opponent loses half their life, rounded up": each of them half their own
  // life total (CR 107.1a).
  if ((m = /^(.+?) (?:loses?) half (your|their|that player's|his or her) life(?:, rounded (up|down))?$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const half = roundOf(m[3], ctx);
    if (!who || !half || (who.ref === "you") !== (m[2]!.toLowerCase() === "your")) return null;
    return [{ type: "loseLife", who, n: { count: { kind: "life", who: { ref: "eachOne" } }, half } }];
  }
  // "Each opponent loses life equal to the life they lost this turn" (Wound Reflection): each their own, counted as the
  // ability resolves, so a second one counts the first one's loss too (rulings).
  if ((m = /^(Each opponent|Each player|Target opponent|Target player) loses life equal to the (?:amount of )?life (?:they|that player) lost this turn$/i.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    return who ? [{ type: "loseLife", who, n: { count: { kind: "lifeLostThisTurn", who: who.ref === "eachOpponent" || who.ref === "eachPlayer" ? { ref: "eachOne" } : who } } }] : null;
  }
  // "Target player gains twice X life" (Heliod's Intervention): X times 2.
  if ((m = /^(.+?) (gains?|loses?) twice X life$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    if (!who) return null;
    const x = amt("X") as AmountExpr;
    return [{ type: m[2]!.startsWith("gain") ? "gainLife" : "loseLife", who, n: { ...x, times: 2 } }];
  }
  if ((m = new RegExp(`^(.+?) (gains?|loses?) ${NUMX} life$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    if (!who) return null;
    return [{ type: m[2]!.startsWith("gain") ? "gainLife" : "loseLife", who, n: amt(m[3]!) }];
  }
  return undefined;
}

/**
 * The targets something "divided as you choose" is divided among (CR 601.2d): `amount` ("3", "X", "X plus 1", or an
 * amount counted otherwise), `among` ("one or two", "one, two, or three", "any number of"), `what` ("targets", "target
 * creatures and/or planeswalkers your opponents control"). A fixed amount gets a target for each part there could be; an
 * amount worked out as they're chosen gets one `many` target (TargetSpec.divided.amount). Null if it isn't one we can.
 */
function addDivided(ctx: Ctx, amount: string | AmountExpr, among: string, what: string): { index: number; n: number; amount: Amount } | null {
  const counted = typeof amount !== "string";
  const isX = counted || amount.startsWith("X");
  // X is the spell's own, or defined by the text ("where X is ...", body.ts defineX).
  // An ability's own X is checked with the ability (compile.ts checkX, activated.ts).
  if (among === "up to X") {
    if (amount !== "X") return null;
    among = "any number of";
  }
  // "5 damage divided as you choose among up to five targets" (Iron Fist): at least 1 each (CR 601.2d), so as many
  // targets as there is damage at most, like "any number of", but none at all is fine too (CR 115.6; rulings on
  // Ravenous Gigantotherium: "You may choose zero targets").
  const upTo = /^up to (\w+)$/.exec(among);
  // "X damage divided as you choose among up to two target creatures and/or planeswalkers" (Shatterskull Smashing): up to
  // that many targets, each dealt at least 1 of the X announced as it's cast (CR 601.2d, rulings).
  if (upTo && amount === "X" && upTo[1] !== "X" && !ctx.whereX) {
    const n = num(upTo[1]!);
    if (!(n >= 2 && n <= 10) || what === "targets") return null;
    const words = what.replace(/^target /, "").replace(/ your opponents control$/, " an opponent controls").replace(/ and\/or /g, " or ");
    const one = words.replace(/\bcreatures\b/g, "creature").replace(/\bplaneswalkers\b/g, "planeswalker");
    const spec0 = one === words ? null : parseTargetPhrase(one);
    if (spec0?.kind !== "object") return null;
    const spec: TargetSpec = { ...spec0, text: `target ${one}` };
    const x: AmountExpr = { count: { kind: "x" } };
    const first = ctx.targets.length;
    const divided = { first, n, total: 0, amount: x, upTo: true as const };
    for (let k = 0; k < n; k++) addTarget(ctx, { ...spec, divided, optional: true, ...(k ? { distinctFrom: Array.from({ length: k }, (_, j) => first + j) } : {}) });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n };
    return { index: first, n, amount: x };
  }
  if (upTo && upTo[1] !== "X") {
    if (typeof amount !== "string" || !/^\w+$/.test(amount) || amount === "X" || num(upTo[1]!) !== num(amount)) return null;
    among = "any number of";
  }
  const none = !!upTo && upTo[1] !== "X";
  if (isX && (among !== "any number of" || (ctx.whereX && amount !== "X"))) return null;
  if (among === "X" && (isX || !ctx.spell)) return null;
  const total = isX ? 0 : num(amount as string);
  const n = among === "one or two" ? 2 : among === "one, two, or three" ? 3 : total;
  let spec: TargetSpec | null = { kind: "any", text: "any target" };
  if (what !== "targets") {
    const words = what.replace(/^target /, "").replace(/ your opponents control$/, " an opponent controls").replace(/ and\/or /g, " or ");
    const one = words.replace(/\bcreatures\b/g, "creature").replace(/\bplaneswalkers\b/g, "planeswalker");
    spec = one === words ? null : parseTargetPhrase(one);
    if (spec?.kind !== "object") return null;
    spec = { ...spec, text: `target ${one}` };
  }
  const first = ctx.targets.length;
  if (among === "X") {
    if (ctx.targets.some((t) => t.many)) return null;
    addTarget(ctx, { ...spec, divided: { first, n: 1, total }, many: "exactX" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return { index: first, n: 2, amount: total };
  }
  if (isX) {
    if (ctx.targets.some((t) => t.many)) return null;
    const x: AmountExpr = counted ? amount : { count: { kind: "x" }, ...(amount === "X plus 1" ? { plus: 1 } : {}) };
    addTarget(ctx, { ...spec, divided: { first, n: 1, total: 0, amount: x }, many: "any" });
    // "Those creatures" are all of them, however many (see TargetSpec.many).
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return { index: first, n: 2, amount: x };
  }
  const divided = { first, n, total, ...(none ? { upTo: true as const } : {}) };
  for (let k = 0; k < n; k++)
    addTarget(ctx, { ...spec, divided, ...(k || none ? { optional: true } : {}), ...(k ? { distinctFrom: Array.from({ length: k }, (_, j) => first + j) } : {}) });
  // "Those permanents": all the target creatures or planeswalkers (Mythos of Vadrok); not with "targets", which may be players.
  if (what !== "targets") {
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n };
  }
  return { index: first, n, amount: total };
}

/**
 * A punisher's ways out: "sacrifices a nonland permanent of their choice or discards a card", "discards two cards or
 * sacrifices a creature or planeswalker of their choice", "pay {2}". Null if one isn't understood.
 */
export function parsePunisherOptions(text: string, ctx: Ctx): PunisherOption[] | null {
  const out: PunisherOption[] = [];
  for (const part of text.split(/,? or (?=(?:discards?|sacrifices?|pays?) )/)) {
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^discards? ${NUM} cards?$`).exec(part))) out.push({ discard: num(m[1]!) });
    // "Sacrifice two creatures of their choice" (Prowling Pangolin).
    // "Two nonland, nontoken permanents of their choice" (Rakdos, Patron of Chaos).
    else if ((m = /^sacrifices? (two|three) (creatures|lands|nonland, nontoken permanents)(?: of (?:their|his or her) choice)?$/.exec(part))) {
      const filter = pickFilter(m[2]!.replace(/s$/, "").replace(/^nonland, nontoken/, "nonland nontoken"));
      if (!filter) return null;
      out.push({ sacrifice: filter, n: num(m[1]!) });
    }
    // "Have it deal 4 damage to them" (Vexing Devil), "have Browbeat deal 5 damage to them": the source deals it.
    else if ((m = /^ha(?:ve|s) (?:it|~) deal (\d+) damage to (?:them|that player)$/.exec(part))) out.push({ damage: Number(m[1]) });
    else if ((m = /^sacrifices? (?:an?|one) (.+?)(?: of (?:their|his or her) choice)?$/.exec(part))) {
      // "An artifact, a creature, or a land": one permanent that's any of them.
      const filter = pickFilter(m[1]!.replace(/, (?:or )?an? /g, (x) => x.replace(/an? $/, "")).replace(/ or an? /, " or "));
      if (!filter) return null;
      out.push({ sacrifice: filter });
    } else if ((m = /^pays? (.+)$/.exec(part))) {
      const pay = parseUnlessPays(m[1]!, ctx);
      if (!pay) return null;
      out.push({ pay });
    } else return null;
  }
  return out.length ? out : null;
}

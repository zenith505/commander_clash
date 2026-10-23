import type { AmountExpr, Count, ObjRef, PlayerRef, TargetSpec } from "../abilities";
import { ANY_COUNTER } from "../abilities";
import { NUM, num, COUNTER, counterKind, COLOR_WORDS, capital, singularWord } from "./words";
import { CREATURE_TYPES } from "../keywords";
import { Ctx, addTarget } from "./body";
import { parseGroup, parsePlayer, parseTargetPhrase, subtypeClause } from "./targets";
import { parseSearchFilter } from "./search";

/**
 * A count: "the number of creatures you control", "cards in your hand", "~'s power", "your
 * devotion to black", "twice the number of ...", "1 plus the number of ...". With `each`, the
 * singular form after "for each": "creature you control", "card in your graveyard".
 * `ctx` is the ability being read (null for a static ability, where "it" is the permanent itself).
 */
export function parseCount(text: string, ctx: Ctx | null, each = false): AmountExpr | null {
  // "For each artifact and/or enchantment you control" (All That Glitters): each that's one or the other, counted once.
  // "For each creature you control that's an Insect, Rat, Spider, or Squirrel" (Swarmyard Massacre): see subtypeClause.
  let p = subtypeClause(text.trim().replace(/\.$/, "").replace(/ and\/or /g, " or "));
  // "The mana value of that spell" (Ovika, Enigma Goliath): the same as "that spell's mana value".
  p = p.replace(/^the (power|toughness|mana value) of (that spell|that creature|~)$/, "$2's $1");
  let m: RegExpExecArray | null;
  // "The number of other Squirrels, Bats, Lizards, and Rats you control" (Valley Rotcaller): each that's any of them,
  // counted once, as "A or B" is.
  if ((m = /^(the number of (?:other )?)((?:[A-Z][a-z]+, )+)(?:and|or) ([A-Z][a-z]+)( you control)$/.exec(p))) {
    const types = [...m[2]!.split(", ").filter(Boolean), m[3]!].map(singularWord);
    if (!types.every((x) => CREATURE_TYPES.has(x))) return null;
    const c = parseCount(`${m[1]}${m[3]} or ${m[2]!.split(", ")[0]}${m[4]}`, ctx);
    if (!c || !("count" in c) || c.count.kind !== "permanents" || c.count.filter.subtypes?.length !== 2) return null;
    return { ...c, count: { ...c.count, filter: { ...c.count.filter, subtypes: types, text: p.replace(/^the number of /, "") } } };
  }
  if (ctx?.milledThisWay && /^the total mana value of those cards$/i.test(p)) return { count: { kind: "milledManaValue" } };
  // "The number of experience counters you have", "for each experience counter you have" (CR 122.1).
  if ((each && /^experience counter you have$/i.test(p)) || /^the number of experience counters you have$/i.test(p)) return { count: { kind: "experience", who: { ref: "you" } } };
  // "For each Urza's land you control" (Urza's Workshop): the land type Urza's (CR 205.3i), not a possessive.
  if ((m = /^(?:the number of )?(Urza's lands? you control)$/.exec(p))) {
    const g = parseGroup(m[1]!.replace(/land you/, "lands you"), true);
    return g && !g.other ? { count: { kind: "permanents", filter: { ...g.filter, text: m[1]! } } } : null;
  }
  // Arithmetic around a count.
  if ((m = /^twice (.+)$/i.exec(p))) {
    const c = parseCount(m[1]!, ctx);
    return c && { ...c, times: 2 * (c.times ?? 1), ...(c.plus ? { plus: 2 * c.plus } : {}) };
  }
  if ((m = new RegExp(`^${NUM} plus (.+)$`, "i").exec(p))) {
    const c = parseCount(m[2]!, ctx);
    return c && { ...c, plus: (c.plus ?? 0) + num(m[1]!) };
  }
  // "The number of creatures you control plus the number of planeswalkers you control" (Ajani, Strength of the Pride).
  if ((m = /^(the number of .+?) plus (the number of .+)$/i.exec(p))) {
    const [a, b] = [parseCount(m[1]!, ctx), parseCount(m[2]!, ctx)];
    return a && b && typeof a === "object" && typeof b === "object" && "count" in a && "count" in b && !a.times && !a.plus && !b.times && !b.plus && !a.half && !b.half ? { count: { kind: "sum", of: [a.count, b.count] } } : null;
  }
  if ((m = new RegExp(`^${NUM} minus (.+)$`, "i").exec(p))) {
    const c = parseCount(m[2]!, ctx);
    return c && { count: c.count, times: -(c.times ?? 1), plus: num(m[1]!) - (c.plus ?? 0) };
  }
  // "Loses 1 life for each card fewer than three in their hand" (Stabwhisker the Odious): three minus that many, none
  // with three or more.
  if ((m = new RegExp(`^cards? fewer than ${NUM} in (your|their|that player's) hand$`, "i").exec(p))) return parseCount(`${m[1]} minus cards in ${m[2]} hand`, ctx);
  if ((m = new RegExp(`^(.+) (plus|minus) ${NUM}$`, "i").exec(p))) {
    const c = parseCount(m[1]!, ctx);
    const n = num(m[3]!) * (m[2]!.toLowerCase() === "minus" ? -1 : 1);
    return c && { ...c, plus: (c.plus ?? 0) + n };
  }
  // "Half your life total, rounded up", "half the number of Forests you control, rounded down" (CR 107.1a), or rounded as
  // the ability's "Round up each time." says.
  if ((m = /^half (.+?)(?:,? rounded (up|down))?$/i.exec(p))) {
    const round = (m[2]?.toLowerCase() ?? ctx?.halfRound) as "up" | "down" | undefined;
    const c = m[1] === "X" ? { count: { kind: "x" } as Count } : parseCount(m[1]!, ctx);
    return round && c && !c.half && !c.negate ? { ...c, half: round } : null;
  }
  // "The greatest power among creatures you control" (0 with none), "among other creatures you control", "the greatest
  // toughness among Wurms you control", "among creatures they control" (that player's).
  // "The greatest power among other attacking creatures" (Ghalta and Mavren): anyone's, like "attacking creatures" below.
  if (!each && (m = /^the greatest (power|toughness) among (other )?((?:attacking )?(?:non-[A-Z][a-z]+ )?(?:creatures|[A-Z][a-z]+s)) (you control|on the battlefield|they control|that player controls|target player controls|target opponent controls)$/.exec(p.replace(/^The/, "the").replace(/^(the greatest (?:power|toughness) among (?:other )?attacking creatures)$/, "$1 on the battlefield")))) {
    const words = m[3]!.split(/\s+/).map(singularWord).join(" ");
    const who = m[4]!;
    const spec = parseTargetPhrase(`${words}${who === "you control" ? " you control" : ""}`, { chosen: true });
    if (spec?.kind !== "object") return null;
    const theirs = /^(?:they|that player|target player|target opponent) control/.test(who);
    const whose = theirs ? whosePlayer(who === "they control" ? "their" : who.replace(/ controls$/, "'s"), ctx) : undefined;
    if (whose === null) return null;
    const text = `${m[3]!} ${who}`;
    return { count: { kind: "greatestPower", filter: { ...spec, text }, ...(m[2] ? { other: true as const } : {}), ...(m[1] === "toughness" ? { toughness: true as const } : {}), ...(whose ? { whose } : {}) } };
  }
  // "The total power of creatures you control" (Ghalta, Primal Hunger), "... of creatures you control with flying" (The
  // Lord of the Eagles): a sum, so a negative power takes some off (rulings).
  // "The total power of attacking creatures" (Klauth): every player's attackers.
  if (!each && (m = /^the total (power|toughness) of (creatures you control(?: with [a-z]+)?|attacking creatures)$/i.exec(p))) {
    const spec = parseTargetPhrase(m[2]!.replace(/creatures/, "creature"), { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: "greatestPower", total: true, filter: { ...spec, text: m[2]! }, ...(m[1] === "toughness" ? { toughness: true as const } : {}) } };
  }
  // "For each death vote", "the number of profit votes": the votes for that word in the ability's vote (CR 701.38).
  if ((m = /^(?:the number of )?(.+?) votes?$/i.exec(p)) && ctx?.vote?.options?.includes(m[1]!)) return { count: { kind: "votes", option: m[1]! } };
  // "For each player who chose fortune" (Seize the Spotlight): how many chose that word.
  if ((m = /^player who chose ([a-z]+)$/.exec(p)) && ctx?.chooseWords?.includes(m[1]!)) return { count: { kind: "choseWord", option: m[1]! } };
  // "Draw a card for each counter removed this way" (Nexus Mentality, after "remove all counters").
  if (each && /^counter removed this way$/i.test(p)) return { count: { kind: "countersRemovedThisWay" } };
  // Profane Transfusion: "where X is the difference between those players' life totals", after they exchanged them.
  if (!each && ctx?.exchanged && /^the difference between those players' life totals$/i.test(p)) return { count: { kind: "exchangedLifeDifference" } };
  // "Draw a card for each creature destroyed this way" (Decree of Pain), "for each permanent destroyed this way", "the
  // number of enchantments destroyed this way": what this spell's or ability's destroy instructions destroyed.
  if ((m = /^(.+?) (destroyed|exiled) this way$/i.exec(p)) && !/\b(you|your|that|they|their|cards?)\b/i.test(m[1]!)) {
    const spec = parseTargetPhrase(m[1]!.split(/\s+/).map(singularWord).join(" "), { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: m[2]!.toLowerCase() === "destroyed" ? "destroyedThisWay" : "exiledThisWay", filter: { ...spec, text: m[1]! } } };
  }
  // "The greatest power among creature cards exiled this way" (Szat's Will, after exiling graveyards).
  if (!each && /^the greatest power among creature cards exiled this way$/i.test(p)) return { count: { kind: "greatestPowerExiled" } };
  if (!each && /^the greatest mana value among cards in exile$/i.test(p)) return { count: { kind: "greatestMvInExile" } };
  // "The greatest mana value among permanents you control" (Will of the Temur), 0 with none.
  if (!each && (m = /^the greatest mana value among (.+?) you control$/i.exec(p))) {
    const spec = parseTargetPhrase(`${m[1]!.split(/\s+/).map(singularWord).join(" ")} you control`, { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: "greatestManaValue", filter: { ...spec, text: `${m[1]} you control` } } };
  }
  // "The total mana value of historic permanents you control" (Excalibur, Sword of Eden): the sum, X counting 0 (CR 107.3).
  // Summon: Bahamut: "the total mana value of other permanents you control", the source left out.
  if (!each && (m = /^the total mana value of other (.+?) you control$/i.exec(p))) {
    const spec = parseTargetPhrase(`${m[1]!.split(/\s+/).map(singularWord).join(" ")} you control`, { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: "greatestManaValue", total: true, other: true, filter: { ...spec, text: `${m[1]} you control` } } };
  }
  if (!each && (m = /^the total mana value of (.+?) you control$/i.exec(p))) {
    // Historic: legendary, an artifact, or a Saga (CR 700.6).
    const historic: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], controller: "you", anyOf: [{ kind: "object", types: ["Artifact"], text: "artifact" }, { kind: "object", types: [], supertypes: ["Legendary"], text: "legendary permanent" }, { kind: "object", types: [], subtypes: ["Saga"], text: "Saga" }], text: "historic permanent you control" };
    const spec = m[1] === "historic permanents" ? historic : parseTargetPhrase(`${m[1]!.split(/\s+/).map(singularWord).join(" ")} you control`, { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: "greatestManaValue", total: true, filter: { ...spec, text: `${m[1]} you control` } } };
  }
  // "The greatest number of creatures a player controls" (Investigator's Journal), "... an opponent controls".
  if (!each && (m = /^the greatest number of (.+?) (a player|an opponent) controls$/i.exec(p))) {
    const spec = parseTargetPhrase(m[1]!.split(/\s+/).map(singularWord).join(" "), { chosen: true });
    if (spec?.kind !== "object" || spec.controller) return null;
    return { count: { kind: "greatestControlled", filter: { ...spec, text: m[1]! }, ...(m[2] === "an opponent" ? { opponents: true as const } : {}) } };
  }
  if (!each && /^the greatest number of cards an opponent has drawn this turn$/i.test(p)) return { count: { kind: "greatestDrawn" } };
  // "For each card you've drawn this turn", "the number of cards they've drawn this turn" (CR 121.1: cards drawn, not put
  // into the hand otherwise).
  if ((m = /^cards? (you've|you have|they've|they have|that player has) drawn this turn$/i.exec(p))) {
    const who = /^you/i.test(m[1]!) ? ({ ref: "you" } as PlayerRef) : whosePlayer(/^they/i.test(m[1]!) ? "their" : "that player's", ctx);
    return who && { count: { kind: "drawnThisTurn", who } };
  }
  if (!each) {
    const nb = /^the (?:total )?number of (.+)$/i.exec(p);
    if (nb) return parseCount(nb[1]!, ctx, true);
  }
  const count = (c: Count): AmountExpr => ({ count: c });
  // "Draw cards equal to the result", "where X is the result" (CR 706.2), "the total of those results" (Neverwinter Hydra).
  if (!each && /^(?:the result|the total of those results)$/i.test(p)) return count({ kind: "rollResult" });
  // "Roll two d4 and choose one result. Create a number of ... equal to that result. Then ... equal to the other result."
  if (!each && ctx?.chooseResult && /^that result$/i.test(p)) return count({ kind: "rollResult" });
  if (!each && ctx?.chooseResult && /^the other result$/i.test(p)) return count({ kind: "rollOther" });
  // "Put a +1/+1 counter on ~ for each flip you won" (Crazed Firecat).
  if (each && /^flip you won$/i.test(p)) return count({ kind: "flipsWon" });
  // Life and hands.
  if ((m = /^(your|their|that player's|target player's|target opponent's|enchanted player's) life total$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: "life", who });
  }
  if (/^your speed$/i.test(p)) return count({ kind: "speed" });
  // "For each unspent green mana you have" (Omnath, Locus of Mana): in your mana pool (CR 106.4).
  if (each && (m = /^unspent (?:(white|blue|black|red|green) )?mana you have$/i.exec(p))) return count({ kind: "unspentMana", ...(m[1] ? { color: COLOR_WORDS[m[1].toLowerCase()]! } : {}) });
  if (each && /^player$/i.test(p)) return count({ kind: "players" });
  // "For each card revealed this way", "the number of cards revealed this way" after "reveal any number of red cards in
  // your hand" (Scent of Cinder), or in its reflexive trigger (Invasion of Tarkir).
  if (ctx?.revealedFromHand && /^(?:the number of )?cards? revealed this way$/i.test(p)) return { count: { kind: "revealedFromHand" } };
  // Parley: "for each nonland card revealed this way", "for each land card revealed this way".
  if (ctx?.parley && (m = /^(nonland|land) cards? revealed this way$/i.exec(p))) return { count: { kind: "parleyRevealed", ...(m[1]!.toLowerCase() === "land" ? { land: true as const } : {}) } };
  // "The amount of excess damage dealt to that creature this way" (Hell to Pay), "that excess damage" (Contest of Claws):
  // after a damage instruction (CR 120.10).
  if (ctx?.excessDamage && /^the damage dealt this way$/i.test(p)) return { count: { kind: "damageThisWay" } };
  if (ctx?.excessDamage && /^(?:the )?(?:amount of )?excess damage dealt(?: to (?:that creature|that permanent))? this way$|^that excess damage$/i.test(p)) return { count: { kind: "excessThisWay" } };
  // "For each creature tapped this way", "the number of creatures tapped this way" after "tap any number of untapped
  // creatures you control" (Harmony of Nature), or in its reflexive trigger (Teferi Akosa of Zhalfir).
  if (ctx?.tappedThisWay && /^(?:the number of )?(?:[A-Z][a-z]+ )?(?:creatures?|artifacts?|Gates?|Humans?|permanents?) tapped this way$/.test(p)) return { count: { kind: "tappedThisWay" } };
  // "For each card manifested this way" (Kozilek, the Broken Reality), after its manifest-from-hand instruction.
  if (ctx?.manifested && each && /^card manifested this way$/i.test(p)) return { count: { kind: "manifestedThisWay" } };
  // "For each card exiled from their hand this way" (Lost Legacy), after its exileNamed instruction.
  if (each && /^card exiled from (?:their|your) hand this way$/i.test(p)) return count({ kind: "exiledFromHandThisWay" });
  // "For each player being attacked", "the number of opponents being attacked" (Pack Attack, Dimir Strandcatcher).
  if (/^(?:players?|opponents?) being attacked$/i.test(p)) return count({ kind: "playersAttacked" });
  // "For each opponent you have", "the number of opponents you have" (Inspired Sphinx).
  if (each && /^opponents?(?: you have)?$/i.test(p)) return count({ kind: "players", opponents: true });
  // "The number of opponents who control a creature with power 4 or greater" (Summon: Yojimbo), "for each opponent who
  // controls an artifact": opponents controlling at least one such permanent.
  if (each && (m = /^opponents? who controls? (?:an?|one or more) (.+)$/i.exec(p))) {
    const spec = parseTargetPhrase(m[1]!);
    return spec?.kind === "object" && !spec.controller ? count({ kind: "players", opponents: true, controlling: { ...spec, text: m[1]! } }) : null;
  }
  if (each && /^(?:of your opponents|opponent) who lost life this turn$/i.test(p)) return count({ kind: "players", opponents: true, lostLife: true });
  // Aclazotz: "Each opponent discards a card. For each opponent who can't, you draw a card": those with no card to discard.
  if (each && ctx?.opponentsDiscarded && /^opponent who can't$/i.test(p)) return count({ kind: "players", opponents: true, discardedNone: true });
  if (each && /^opponent who drew a card this way$/i.test(p)) return count({ kind: "players", opponents: true, drewThisWay: true });
  // Kefka, Court Mage: "for each card type among cards discarded this way" (CR 205.2a: card types, not supertypes or subtypes).
  if (each && /^card type among cards discarded this way$/i.test(p)) return count({ kind: "discardedTypes" });
  // Struggle for Project Purity: "Each opponent draws a card. You draw a card for each card drawn this way."
  if (each && /^card drawn this way$/i.test(p)) return count({ kind: "drawnThisWay" });
  // Smuggler's Share: "for each opponent who drew two or more cards this turn", "... who had two or more lands enter the
  // battlefield under their control this turn".
  if (each && (m = /^opponent who drew (two|three|four) or more cards this turn$/i.exec(p))) return count({ kind: "players", opponents: true, drewAtLeast: num(m[1]!) });
  if (each && (m = /^opponent who had (two|three|four) or more lands enter the battlefield under their control this turn$/i.exec(p))) return count({ kind: "players", opponents: true, landsEnteredAtLeast: num(m[1]!) });
  if ((m = /^creatures? that died (under your control )?this turn$/i.exec(p))) return count({ kind: "diedThisTurn", ...(m[1] ? { yours: true as const } : {}) });
  if (/^creatures? that attacked this turn$/i.test(p)) return count({ kind: "attackersThisTurn" });
  if ((m = /^(?:([A-Z][a-z]+) )?tokens you created this turn$/.exec(p))) return count({ kind: "tokensCreatedThisTurn", ...(m[1] ? { subtype: m[1] } : {}) });
  if (/^times? you've cast your commander from the command zone this game$/i.test(p)) return count({ kind: "commanderCasts" });
  // "For each creature in your party", "the number of creatures in your party" (CR 700.8).
  if (/^creatures? in your party$/i.test(p)) return count({ kind: "party" });
  if (each ? /^1 life you(?:'ve| have)? gained this turn$/i.test(p) : /^the (?:total )?amount of life you(?:'ve| have)? gained this turn$/i.test(p)) return count({ kind: "lifeGainedThisTurn" });
  if (!each && /^the total amount of noncombat damage dealt to your opponents this turn$/i.test(p)) return count({ kind: "opponentsNoncombatDamage" });
  if (each ? /^1 life your opponents have lost this turn$/i.test(p) : /^the (?:total )?amount of life your opponents (?:have )?lost this turn$/i.test(p)) return count({ kind: "opponentsLifeLost" });
  if ((m = /^cards? in (your|that player's|target player's|their|target opponent's) (hand|library)$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: m[2]!.toLowerCase() === "hand" ? "cardsInHand" : "cardsInLibrary", who });
  }
  // "Card types among cards in all graveyards" (Tarmogoyf), "in your graveyard", "in your opponents' graveyards" (CR 205.2a).
  if ((m = /^card types? among cards in (your|all|your opponents') graveyards?$/i.exec(p)))
    return count({ kind: "graveyardCardTypes", who: { ref: m[1] === "your" ? "you" : m[1] === "all" ? "eachPlayer" : "eachOpponent" } as PlayerRef });
  // "Cards named ~ in all graveyards" (Kindle), "for each card named ~ in each graveyard" (Rite of Flame), "in your graveyard".
  if ((m = /^cards? named ~ in (your|all|each) graveyards?$/i.exec(p)))
    return count({ kind: "cardsInGraveyard", who: { ref: m[1] === "your" ? "you" : "eachPlayer" }, filter: { kind: "card", named: "~", text: "card named ~" } });
  // Graveyards: "card in your graveyard", "creature card in your graveyard", "instant and sorcery card in all graveyards".
  // "Cards in your opponents' graveyards" (Consuming Aberration): each opponent's.
  if ((m = /^(.*?)cards? in (your|all|that player's|target player's|their|your opponents') graveyards?$/i.exec(p))) {
    const who = /^all$/i.test(m[2]!) ? ({ ref: "eachPlayer" } as PlayerRef) : /^your opponents'$/i.test(m[2]!) ? ({ ref: "eachOpponent" } as PlayerRef) : whosePlayer(m[2]!, ctx);
    if (!who) return null;
    const kinds = m[1]!.trim().replace(/ and /g, " or ");
    if (!kinds) return count({ kind: "cardsInGraveyard", who });
    const spec = parseTargetPhrase(`${kinds.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    return spec?.kind === "card" ? count({ kind: "cardsInGraveyard", who, filter: { ...spec, text: `${kinds} card` } }) : null;
  }
  // Devotion (CR 700.5): "your devotion to black", "your devotion to black and red".
  if ((m = /^your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))?$/i.exec(p)))
    return count({ kind: "devotion", colors: [m[1]!, m[2]].filter(Boolean).map((w) => COLOR_WORDS[w!.toLowerCase()]!) });
  // Domain.
  if (/^basic land types? among lands you control$/i.test(p)) return count({ kind: "basicLandTypes" });
  // Vivid: "the number of colors among permanents you control".
  if (/^colou?rs? among permanents you control$/i.test(p)) return count({ kind: "colorsAmongPermanents" });
  if (/^spells? you've cast this turn$/i.test(p)) return count({ kind: "spellsCastThisTurn" });
  // "Instant and sorcery spells you've cast this turn" (Rionya, Fire Dancer): copies aren't cast (CR 707.10).
  if ((m = /^((?:instant|sorcery|creature|noncreature|artifact|enchantment)(?: (?:and|or) (?:instant|sorcery|creature|artifact|enchantment))?) spells you've cast this turn$/i.exec(p))) {
    const filter = parseSearchFilter(`${m[1]!.replace(/ and /, " or ")} card`);
    return filter ? count({ kind: "spellsCastThisTurn", filter }) : null;
  }
  if ((m = /^the total mana value of (other )?spells you've cast this turn$/i.exec(p))) return count({ kind: "manaValueCastThisTurn", ...(m[1] ? { other: true as const } : {}) });
  // "For each creature it devoured" (CR 702.82b): only the permanent's own abilities know what it devoured.
  if (/^creatures? (?:it|~) devoured$/i.test(p) && (ctx === null || ctx.selfIt)) return count({ kind: "devoured" });
  if (/^times ~ has mutated$/i.test(p)) return count({ kind: "mutations" });
  // Converge: "the number of colors of mana spent to cast this spell", "for each color of mana spent to cast it".
  // "It" is the object itself only where nothing else can be "it" (not "whenever you cast a spell").
  if ((m = /^colou?rs? of mana spent to cast (~|it)$/i.exec(p)) && (m[1] === "~" || ctx === null || ctx.selfIt || ctx.spell)) return count({ kind: "colorsSpent" });
  // "For each mana from a Treasure spent to cast it" (CR 106.3): the spell's, or its permanent's enters trigger's (compile
  // checks it's one of those).
  // "For each mana from Treasures spent to activate this ability" (Mr. House): an activated ability's own.
  if (each && /^mana from Treasures spent to activate this ability$/i.test(p) && ctx?.activated) return count({ kind: "treasureSpent", activated: true });
  if ((m = /^mana from a Treasure (?:that was )?spent to cast (~|it)$/i.exec(p)) && ctx !== null && (ctx.spell || (ctx.selfIt && m[1] === "it"))) return count({ kind: "treasureSpent" });
  // "For each {S} spent to cast ~", "the amount of {S} spent to cast ~" (CR 107.4h): the spell's, or its permanent's
  // enters trigger's (compile checks it's one of those).
  if ((m = /^(?:the )?(?:amount of )?\{S\} spent to cast (~|it)$/i.exec(p)) && ctx !== null && (ctx.spell || (ctx.selfIt && m[1] === "it") || m[1] === "~")) return count({ kind: "snowSpent" });
  // Multikicker: "for each time it was kicked", "the number of times ~ was kicked" (CR 702.33d).
  if (/^times? (?:~|it) was kicked$/i.test(p)) return count({ kind: "kicked" });
  // "For each of that spell's colors" in a cast trigger (Ramos, Dragon Engine).
  if (/^of that spell's colors$/i.test(p) && ctx?.castSpell) return count({ kind: "castSpellColors" });
  // "Your Ring-bearer's power" (One Ring to Rule Them All): 0 without one (CR 701.54a, 107.1b).
  if ((m = /^your Ring-bearer's (power|toughness)$/.exec(p))) return count({ kind: m[1] as "power" | "toughness", of: { ref: "ringBearer" } });
  // Power, toughness, mana value: "~'s power", "its power", "that creature's toughness".
  if ((m = /^(~'s|its|that creature's|that artifact's|that enchantment's|the creature's|that permanent's|that spell's|the spell's|that card's|the sacrificed (?:creature|artifact|enchantment|permanent)'s|the exiled creature's|the amassed Army's) (power|toughness|mana value)$/i.exec(p))) {
    const of = whoseObject(m[1]!, ctx);
    const kind = m[2]!.toLowerCase() === "mana value" ? "manaValue" : (m[2]!.toLowerCase() as "power" | "toughness");
    if (of?.ref === "castSpell" && kind !== "manaValue") return null;
    return of && count({ kind, of });
  }
  // "For each counter on ~" (Twitching Doll): every kind.
  if ((m = /^counters? on (~|it)$/.exec(p))) {
    const of = whoseObject(m[1] === "~" ? "~'s" : "its", ctx);
    return of && count({ kind: "counters", counter: ANY_COUNTER, of });
  }
  // "Charge counter on ~", "+1/+1 counters on it".
  if ((m = new RegExp(`^${COUNTER} counters? on (~|it|that creature)$`).exec(p))) {
    const of = whoseObject(m[2] === "~" ? "~'s" : m[2] === "it" ? "its" : "that creature's", ctx);
    return of && count({ kind: "counters", counter: counterKind(m[1]!), of });
  }
  // "The number of +1/+1 counters on lands you control" (Toph, the Blind Bandit), "counters on permanents you control"
  // (Hydra Trainer): the counters on those permanents added up.
  if ((m = new RegExp(`^(?:${COUNTER} )?counters on ((?:creatures|lands|permanents|artifacts) you control)$`).exec(p))) {
    const c = parseCount(m[2]!, ctx, each);
    return c && typeof c === "object" && "count" in c && c.count.kind === "permanents" && !c.count.differentNames ? { count: { ...c.count, counter: m[1] ? counterKind(m[1]) : ANY_COUNTER } } : null;
  }
  // "Cards put into enchanted player's graveyard from anywhere this turn" (Fraying Sanity): tokens aren't cards.
  if ((m = /^cards? put into (your|their|that player's|enchanted player's) graveyard from anywhere this turn$/i.exec(p))) {
    const whose = whosePlayer(m[1]!, ctx);
    return whose && count({ kind: "cardsToGraveyardThisTurn", whose });
  }
  // "Aura attached to it", "Equipment attached to ~": only the permanent's own.
  // "Aura and Equipment attached to it" (Champion of the Flame): one of either.
  if ((m = /^(Aura|Equipment|Aura and Equipment)s? attached to (it|~)$/i.exec(p)) && (ctx === null || ctx.selfIt || /~/.test(m[2]!)))
    return count({ kind: "attachedToSelf", subtypes: /and/.test(m[1]!) ? ["Aura", "Equipment"] : [capital(m[1]!.toLowerCase()) === "Aura" ? "Aura" : "Equipment"] });
  // "Differently named lands you control" (Awakened Amalgam), "differently named artifact tokens you control" (Gimbal).
  if ((m = /^differently named (.+?) you control$/i.exec(p))) {
    const c = parseCount(`${m[1]} you control`, ctx, each);
    return c && typeof c === "object" && "count" in c && c.count.kind === "permanents" && !c.count.other ? { count: { ...c.count, differentNames: true, filter: { ...c.count.filter, text: `differently named ${c.count.filter.text}` } } } : null;
  }
  // Permanents: "creature you control", "other Elf you control", "land on the battlefield", "artifacts your opponents control".
  // "Creatures target player controls" (Will of the Mardu), "that player controls": that player's permanents.
  // "Damage to defending player equal to the number of artifacts they control" (Generous Plunderer): the defending player's.
  if (ctx?.defending) p = p.replace(/ (?:they control|defending player controls)$/, " that player controls");
  // "Target player draws X cards and loses X life, where X is the number of creatures they control of the chosen type"
  // (Pact of the Serpent): the player targeted.
  else if (ctx?.lastPlayerTarget !== undefined && !ctx.eventPlayer) p = p.replace(/ they control( of the chosen type)?$/, " that player controls$1");
  if ((m = /^(other )?(.+?) (you control|on the battlefield|your opponents control|an opponent controls|target player controls|target opponent controls|that player controls|those players control|those opponents control)(?: ((?:with|of the chosen|of that|that aren't|that's attached to|that are attached to) .+))?$/i.exec(p))) {
    const words = m[2]!.split(/\s+/).map(singularWord).join(" ");
    const who = m[3]!.toLowerCase();
    const theirs = /^(target|that|those) /.test(who);
    const suffix = who === "you control" ? " you control" : who === "on the battlefield" || theirs ? "" : " an opponent controls";
    const spec = parseTargetPhrase(`${words}${suffix}${m[4] ? ` ${m[4]}` : ""}`, { chosen: true });
    if (spec?.kind !== "object") return null;
    const whose = theirs ? whosePlayer(who.replace(/ controls$/, "'s").replace(/^(those \w+) control$/, "$1'"), ctx) : undefined;
    if (whose === null) return null;
    return count({ kind: "permanents", filter: { ...spec, text: `${m[1] ?? ""}${m[2]} ${m[3]}` }, ...(m[1] ? { other: true } : {}), ...(whose ? { whose } : {}) });
  }
  // "The number of creatures attacking you" (Arachnogenesis): attacking you, not your planeswalkers (CR 506.3).
  if (/^creatures? attacking you$/i.test(p)) return count({ kind: "permanents", filter: { kind: "object", types: ["Creature"], combat: "attackingYou", text: p } });
  // "attacking creature", "tapped creature": any controller. "Other attacking creatures" (Ghalta and Mavren): not the
  // object with the ability.
  if ((m = /^(other )?(attacking|blocking|tapped) (creatures?)$/i.exec(p))) {
    const spec = parseTargetPhrase(`${m[2]} creature`);
    return spec?.kind === "object" ? count({ kind: "permanents", filter: { ...spec, text: p }, ...(m[1] ? { other: true } : {}) }) : null;
  }
  // Shared Animosity: "it gets +1/+0 until end of turn for each other attacking creature that shares a creature type with
  // it", "it" the attacker the trigger is about (counted as it resolves, CR 608.2h).
  if ((m = /^other (attacking|blocking) creatures? that shares? a creature type with it$/i.exec(p)) && ctx?.subjectIt) {
    const spec = parseTargetPhrase(`${m[1]} creature`);
    return spec?.kind === "object" ? count({ kind: "permanents", filter: { ...spec, text: p }, sharesTypeWithSubject: true }) : null;
  }
  // "Whenever ~ attacks, it gets +2/+0 until end of turn for each other attacking Goblin" (Goblin Piledriver): "other"
  // is the permanent itself, so only in its own abilities.
  if ((m = /^other (attacking|blocking) (.+)$/i.exec(p)) && ctx?.selfIt) {
    const spec = parseTargetPhrase(`${m[1]} ${m[2]!.split(/\s+/).map(singularWord).join(" ")}`);
    return spec?.kind === "object" && (spec.types?.length || spec.subtypes?.length) ? count({ kind: "permanents", filter: { ...spec, text: p }, other: true }) : null;
  }
  return null;
}

/** How "half ..." is rounded: as its own ", rounded up" says, else as the ability's "Round up each time." (CR 107.1a). */
export function roundOf(word: string | undefined, ctx: Ctx | null): "up" | "down" | undefined {
  return (word?.toLowerCase() ?? ctx?.halfRound) as "up" | "down" | undefined;
}

/** "Half X", rounded as `roundOf` says: the X it was cast or activated with. */
export function halfX(word: string | undefined, ctx: Ctx | null): AmountExpr | null {
  const half = roundOf(word, ctx);
  return half ? { count: { kind: "x" }, half } : null;
}

/**
 * The amount of a filter's "with mana value less than or equal to ..." worked out as it resolves (TargetSpec.bound): a count,
 * or X, which a trigger's "that damage" has become ("Whenever ~ deals combat damage, you may cast a sorcery spell from your
 * hand with mana value less than or equal to that damage", see HOST_TRIGGERS).
 */
export function parseBoundCount(text: string, ctx: Ctx): AmountExpr | null {
  // "Destroy all creatures with power greater than target creature's power" (Fell the Mighty): a spell's own target, its
  // power as the spell resolves (rulings).
  const of = ctx.spell && /^target creature's (power|toughness)$/.exec(text);
  if (of) return { count: { kind: of[1] as "power" | "toughness", of: { ref: "target", index: addTarget(ctx, { kind: "object", types: ["Creature"], text: "target creature" }) } } };
  return text === "X" ? { count: { kind: "x" } } : parseCount(text, ctx);
}

function whosePlayer(w: string, ctx: Ctx | null): PlayerRef | null {
  const x = w.toLowerCase();
  if (x === "your") return { ref: "you" };
  if (!ctx) return null;
  if (x === "target player's" || x === "target opponent's") {
    const i = addTarget(ctx, { kind: "player", opponent: x === "target opponent's", text: x.replace(/'s$/, "") });
    ctx.lastPlayerTarget = i;
    return { ref: "target", index: i };
  }
  // "Any number of target players' graveyards" (Stonespeaker Crystal), "their" after them: all of them.
  if (/^any number of target (?:players|opponents)'$/.test(x)) return parsePlayer(x.slice(0, -1), ctx);
  if (ctx.manyPlayers !== undefined && ctx.lastPlayerTarget === ctx.manyPlayers) return x === "their" || x === "those players'" || x === "those opponents'" ? { ref: "target", index: ctx.manyPlayers, n: 2 } : null;
  if ((x === "that player's" || x === "their") && ctx.eachOne) return { ref: "eachOne" };
  if (x === "that player's" && ctx.chosenOpponent) return { ref: "chosenPlayer" };
  if ((x === "that player's" || x === "their") && ctx.lastPlayerTarget !== undefined) return { ref: "target", index: ctx.lastPlayerTarget };
  // "At the beginning of each opponent's upkeep, ~ deals X damage to that player, where X is the number of cards in their hand".
  if ((x === "that player's" || x === "their") && (ctx.eventPlayer || ctx.defending)) return { ref: "eventPlayer" };
  if (x === "enchanted player's" || x === "enchanted opponent's") return { ref: "enchantedPlayer" };
  return null;
}

function whoseObject(w: string, ctx: Ctx | null): ObjRef | null {
  const x = w.toLowerCase();
  if (x === "~'s") return { ref: "self" };
  // What was sacrificed to cast the spell, as it last existed (CR 608.2h); compile() checks there's such a cost.
  if (/^the sacrificed (creature|artifact|enchantment|permanent)'s$/.test(x)) return ctx ? { ref: "sacrificed" } : null;
  // "The exiled creature's mana value" after an "Exile a creature you control" cost (Food Chain); compile() checks it has one.
  if (x === "the exiled creature's") return ctx ? { ref: "sacrificed", exiledCost: true } : null;
  // A reflexive trigger after "you may sacrifice another creature": that creature, as it last existed (CR 608.2h).
  if (x === "that creature's" && ctx?.sacrificedIt) return { ref: "sacrificed" };
  // "Where X is the amassed Army's power" (CR 701.47c), after amassing.
  if (x === "the amassed army's") return ctx?.amassed ? { ref: "amassed" } : null;
  if (!ctx) return x === "its" ? { ref: "self" } : null;
  // "That spell's mana value": the targeted spell (Imp's Mischief).
  if ((x === "that spell's" || x === "the spell's") && ctx.lastObjectTarget !== undefined) return ctx.targets[ctx.lastObjectTarget]?.kind === "spell" ? { ref: "target", index: ctx.lastObjectTarget } : null;
  // "Return target card from your graveyard to your hand. You gain life equal to that card's mana value": the card
  // targeted, wherever it went (Healing Technique, Razor Hippogriff).
  // "Exile the top card of your library. ~ gets +X/+0 until end of turn, where X is that card's mana value" (Tavern Brawler).
  if ((x === "that card's" || x === "the exiled card's") && ctx.exiledTop) return { ref: "exiledTop" };
  if (x === "that card's") return ctx.targets.length === 1 && ctx.targets[0]!.kind === "card" ? { ref: "target", index: 0 } : null;
  // In a cast trigger, the spell cast ("discover X, where X is that spell's mana value").
  if (x === "that spell's") return ctx.castSpell ? { ref: "castSpell" } : null;
  // "The creature's power" after "that creature's controller" (Boros Fury-Shield): the creature targeted.
  if (x === "the creature's") return ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" ? { ref: "target", index: ctx.lastObjectTarget } : null;
  // "Destroy target artifact. ... where X is that artifact's mana value" (Artifact Mutation): the target, as it last existed.
  // "Destroy target enchantment. ... that enchantment's mana value" (Aura Mutation): the same.
  if (x === "that artifact's" || x === "that enchantment's") {
    const type = x === "that artifact's" ? "Artifact" : "Enchantment";
    return ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && ctx.targets[ctx.lastObjectTarget]!.types?.includes(type) ? { ref: "target", index: ctx.lastObjectTarget } : null;
  }
  if (x === "its" || x === "that creature's" || x === "that permanent's") {
    if (ctx.lastObjectTarget !== undefined) return { ref: "target", index: ctx.lastObjectTarget };
    if ((x === "that creature's" && ctx.subject) || ctx.subjectIt) return { ref: "subject" };
    // The permanent itself; after it left the battlefield, as it last existed (CR 608.2h).
    if (x === "its" && (ctx.selfIt || ctx.selfCard || ctx.activated)) return { ref: "self" };
    // "Return target creature card from your graveyard to the battlefield. You gain life equal to that creature's
    // toughness" (Cleric Class): the card targeted, as the permanent it became (rulings).
    if (x === "that creature's" && ctx.targets.length === 1 && ctx.targets[0]!.kind === "card" && ctx.targets[0]!.types?.includes("Creature")) return { ref: "target", index: 0 };
  }
  return null;
}

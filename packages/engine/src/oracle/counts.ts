import type { AmountExpr, Count, ObjRef, PlayerRef, TargetSpec } from "../abilities";
import { ANY_COUNTER } from "../abilities";
import { NUM, num, COUNTER, counterKind, COLOR_WORDS, capital, singularWord } from "./words";
import { CREATURE_TYPES, SUPPORTED_KEYWORDS, canonicalKeyword, type SupportedKeyword } from "../keywords";
import { STARTING_LIFE, type Color } from "../types";
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
  // Katilda, Dawnhart Martyr: "the number of permanents you control that are Spirits and/or enchantments": each that's
  // one or the other, counted once, as "Spirits or enchantments you control" is.
  p = p.replace(/^the number of permanents you control that are ([A-Z][a-z]+s) or (enchantments|artifacts)$/, "the number of $1 or $2 you control");
  // Collision Course: "the number of permanents you control that are creatures and/or Vehicles".
  p = p.replace(/^the number of permanents you control that are (creatures|artifacts) or (Vehicles)$/, "the number of $1 or $2 you control");
  // Bronze Cudgels: "the number of times this ability has resolved this turn" (see Count resolvedThisTurn).
  if (!each && /^the number of times this ability has resolved this turn$/.test(p) && (!ctx || ctx.activated)) return { count: { kind: "resolvedThisTurn" } };
  // Erestor of the Council: in its "whenever players finish voting" trigger, the opponents who voted for a choice you
  // didn't (each counted once, even with several votes; one may count both ways, rulings).
  if (!each && p === "the number of opponents who voted for a choice you didn't vote for" && ctx?.votesEvent) return { count: { kind: "opponentsVotedOtherwise" } };
  // Ral Zarek, Guest Lecturer: "where X is the number of coins that came up heads", after uncalled flips (see body.ts).
  if (!each && /^the number of coins that came up heads$/i.test(p) && ctx?.uncalledFlips) return { count: { kind: "flipsWon", heads: true } };
  // "The mana value of that spell" (Ovika, Enigma Goliath): the same as "that spell's mana value".
  p = p.replace(/^the (power|toughness|mana value) of (that spell|that creature|that card|~)$/, "$2's $1");
  // Thundering Raiju: "the number of modified creatures you control other than this creature" is "the number of other
  // modified creatures you control".
  p = p.replace(/^(the number of )?(?!other )([a-z ]+? creatures?) you control other than ~$/, "$1other $2 you control");
  // Toil to Renown: "for each tapped artifact, creature, and land you control": each that's any of them, counted once.
  if (each) p = p.replace(/^(tapped |untapped )?(artifact|creature|land|enchantment), (artifact|creature|land|enchantment), and (artifact|creature|land|enchantment) you control$/, "$1$2, $3, or $4 you control");
  let m: RegExpExecArray | null;
  // Luxurious Locomotive: "for each creature that crewed it this turn" (CR 702.122d), those gone since included (rulings).
  if (each && ctx && !ctx.spell && /^creature that (crewed|saddled) (?:it|~) this turn$/.test(p)) return { count: { kind: "crewedSource", ...(/saddled/.test(p) ? { saddled: true as const } : {}) } };
  // Perrie, the Pulverizer: "the number of different kinds of counters among permanents you control"; each kind once, as
  // Hundred-Battle Veteran counts them.
  if (!each && (m = /^the number of different kinds of counters among (creatures|permanents) you control$/i.exec(p))) {
    const c = parseCount(`${m[1]} you control`, ctx);
    return c && typeof c === "object" && "count" in c && c.count.kind === "permanents" && !c.count.other && !c.count.counter ? { count: { ...c.count, counterKinds: true } } : null;
  }
  // Superior Numbers: "the number of creatures you control in excess of the number of creatures target opponent controls":
  // the first less the second, 0 if it's not more (CR 107.1b).
  if (!each && (m = /^(the number of .+?) in excess of (the number of .+)$/.exec(p))) {
    const a = parseCount(m[1]!, ctx);
    const b = a && parseCount(m[2]!, ctx);
    return a && b && Object.keys(a).length === 1 && Object.keys(b).length === 1 ? { count: { kind: "difference", of: [a.count, b.count] } } : null;
  }
  // Seize the Storm: "the number of cards with flashback you own in exile": face-up cards with a printed flashback.
  if (!each && /^the number of cards with flashback you own in exile$/i.test(p)) return { count: { kind: "cardsInExile", who: { ref: "you" }, filter: { kind: "card", types: [], notTypes: [], notColors: [], keywords: ["Flashback"], text: "card with flashback" } } };
  // Alrund, God of the Cosmos: "for each foretold card you own in exile" (CR 702.143a): foretold cards are face down, so
  // only the foretold mark counts.
  if (each ? /^foretold card you own in exile$/i.test(p) : /^the number of foretold cards you own in exile$/i.test(p)) return { count: { kind: "cardsInExile", who: { ref: "you" }, foretold: true } };
  // Cosmogoyf: "the number of cards you own in exile": face down or not, wherever ~ is (its rulings: it counts itself in
  // exile, CR 604.3).
  if (!each && /^the number of cards you own in exile$/i.test(p)) return { count: { kind: "cardsInExile", who: { ref: "you" } } };
  // Kaya, Orzhov Usurper: "the number of cards that player owns in exile" (the target player), face down or not.
  if (!each && (m = /^the number of cards (that player|target player|target opponent) owns in exile$/i.exec(p))) {
    const who = whosePlayer(`${m[1]!}'s`, ctx);
    return who ? { count: { kind: "cardsInExile", who } } : null;
  }
  // Crackling Drake: "the total number of instant and sorcery cards you own in exile and in your graveyard".
  if (!each && /^the total number of instant and sorcery cards you own in exile and in your graveyard$/i.test(p)) return { count: { kind: "cardsInExile", who: { ref: "you" }, filter: { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" }, graveyardToo: true } };
  // Ravenloft Adventurer: "defending player loses 1 life for each card they own in exile with a hit counter on it": the
  // cards that player owns in exile with one, however they got it.
  if (each && (m = /^card they own in exile with an? ([a-z]+) counter on it$/.exec(p))) {
    const who = whosePlayer("their", ctx);
    return who?.ref === "eventPlayer" ? { count: { kind: "cardsInExile", who, counter: counterKind(m[1]!) } } : null;
  }
  // Umbris, Fear Manifest: "for each card your opponents own in exile": face down or not (like Cosmogoyf), however they
  // got there (rulings).
  if (each && /^card your opponents own in exile$/.test(p)) return { count: { kind: "cardsInExile", who: { ref: "eachOpponent" } } };
  // Huskburster Swarm: "for each creature card you own in exile and in your graveyard": face-up ones in exile (a face-down
  // card has no characteristics, CR 406.3, 708.2).
  if (each && /^creature card you own in exile and in your graveyard$/.test(p)) return { count: { kind: "cardsInExile", who: { ref: "you" }, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, graveyardToo: true } };
  // Slime Against Humanity: "the total number of cards you own in exile and in your graveyard that are Oozes or are named
  // ~": face-up ones only (rulings), either kind counted once.
  if (!each && (m = /^the total number of cards you own in exile and in your graveyard that are ([A-Z][a-z]+)s or are named ~$/.exec(p)) && CREATURE_TYPES.has(m[1]!)) {
    const card = { kind: "card" as const, types: [], notTypes: [], notColors: [] };
    return { count: { kind: "cardsInExile", who: { ref: "you" }, filter: { ...card, anyOf: [{ ...card, subtypes: [m[1]!], text: `${m[1]} card` }, { ...card, named: "~", text: "card named ~" }], text: `${m[1]} card or card named ~` }, graveyardToo: true } };
  }
  // Frantic Firebolt, Hearth Elemental: "the number of cards in your graveyard that are instant cards, sorcery cards,
  // and/or have an Adventure"; Candlekeep Inspiration: "... cards you own in exile and in your graveyard that are instant
  // cards, are sorcery cards, and/or have an Adventure" (face-up ones in exile); Sailors' Bane: "for each card you own in
  // exile and in your graveyard that's an instant card, a sorcery card, or a card that has an Adventure". An adventurer
  // card has an Adventure in every zone but the stack (rulings).
  const advCards = each
    ? /^card (you own in exile and )?in your graveyard that's an instant card, a sorcery card, or a card that has an Adventure$/.exec(p)
    : /^(?:the number of )?cards (you own in exile and )?in your graveyard that are instant cards, (?:are )?sorcery cards, (?:and\/)?or have an Adventure$/i.exec(p);
  if (advCards) {
    const filter: TargetSpec = { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], orAdventure: true, text: "instant or sorcery card or card that has an Adventure" };
    return { count: advCards[1] ? { kind: "cardsInExile", who: { ref: "you" }, filter, graveyardToo: true } : { kind: "cardsInGraveyard", who: { ref: "you" }, filter } };
  }
  // Embodiment of Agonies: "for each different mana cost among nonland cards in your graveyard".
  if (each && (m = /^different mana cost among (nonland cards in your graveyard)$/i.exec(p))) {
    const c = parseCount(m[1]!, ctx);
    return c && typeof c === "object" && "count" in c && c.count.kind === "cardsInGraveyard" && !c.count.greatestPower && !c.count.totalMv && !c.count.greatestMv ? { count: { ...c.count, differentManaCosts: true } } : null;
  }
  // Eris, Roar of the Storm: "for each different mana value among instant and sorcery cards in your graveyard": each mana
  // value once (CR 202.3).
  // Sudden Insight: "for each different mana value among nonland cards in your graveyard".
  if (each && /^different mana value among nonland cards in your graveyard$/i.test(p)) return { count: { kind: "graveyardManaValues", who: { ref: "you" }, filter: { kind: "card", types: [], notTypes: ["Land"], notColors: [], text: "nonland card" } } };
  if (each && (m = /^different mana value among (instant (?:and|or) sorcery) cards in your graveyard$/i.exec(p))) return { count: { kind: "graveyardManaValues", who: { ref: "you" }, filter: { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" } } };
  // Treva, the Renewer: "you gain 1 life for each permanent of the chosen color", the color chosen as it resolves.
  if ((m = each ? /^(permanent|creature) of the chosen color$/.exec(p) : /^the number of (permanent|creature)s of the chosen color$/.exec(p)))
    return { count: { kind: "permanents", filter: { kind: "object", types: m[1] === "creature" ? ["Creature"] : [], notTypes: [], notColors: [], chosen: "color", text: `${m[1]} of the chosen color` } } };
  // Curse of Thirst: "the number of Curses attached to them", them being the enchanted player whose upkeep it is.
  if (ctx?.eventPlayer && /^the number of Curses attached to (?:them|that player)$/.test(p))
    return { count: { kind: "permanents", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Curse"], text: "Curse" }, attachedToPlayer: { ref: "eventPlayer" } } };
  // Unlicensed Hearse: "the number of cards exiled with it" ("with ~"), the cards its one exile ability exiled (CR 607.2a,
  // linked by compile.ts).
  if (/^the number of cards exiled with (?:it|~)$/.test(p)) return { count: { kind: "linkedExiled" } };
  // The Kenriths' Royal Funeral: "for each card exiled with ~", the same (still in exile, rulings).
  if (each && /^card exiled with (?:it|~)$/.test(p)) return { count: { kind: "linkedExiled" } };
  // Strata Scythe: "for each land on the battlefield with the same name as the exiled card", anyone's (rulings), the card
  // its imprint ability exiled (CR 607.2a, linked by compile.ts).
  if (each && /^land on the battlefield with the same name as the exiled card$/.test(p))
    return { count: { kind: "permanents", filter: { kind: "object", types: ["Land"], notTypes: [], notColors: [], text: "land" }, sameNameAsLinked: true } };
  // Jadeheart Attendant: "the mana value of the exiled card used to craft it" (CR 702.167c): the cards its craft cost exiled.
  if (/^the mana value of the exiled card used to craft (?:it|~)$/.test(p) && (ctx === null || ctx.selfIt)) return { count: { kind: "linkedExiledMv" } };
  // Wood Elemental: "the number of Forests sacrificed as it entered", what its "As ~ enters, sacrifice any number of
  // untapped Forests" sacrificed (CompiledCard.devour), as devour's count. Only its own abilities know it.
  if (/^the number of Forests sacrificed as (?:it|~) entered$/.test(p) && (ctx === null || ctx.selfIt)) return { count: { kind: "devoured" } };
  // Minion of the Wastes, Phyrexian Processor: "the life paid as it entered" ("as ~ entered"), by its "As ~ enters, pay any
  // amount of life" (CompiledCard.entersPayLife).
  if (/^the life paid as (?:it|~) entered$/.test(p) && (/~/.test(p) || ctx === null || ctx.selfIt)) return { count: { kind: "lifePaidAsEntered" } };
  // Mana Cannons: "where X is the number of colors that spell is", in a cast trigger: as Ramos's "that spell's colors".
  if (/^the number of colors that spell is$/i.test(p) && ctx?.castSpell) return { count: { kind: "castSpellColors" } };
  // "The number of other Squirrels, Bats, Lizards, and Rats you control" (Valley Rotcaller): each that's any of them,
  // counted once, as "A or B" is.
  if ((m = /^(the number of (?:other )?)((?:[A-Z][a-z]+, )+)(?:and|or) ([A-Z][a-z]+)( you control)$/.exec(p))) {
    const types = [...m[2]!.split(", ").filter(Boolean), m[3]!].map(singularWord);
    if (!types.every((x) => CREATURE_TYPES.has(x))) return null;
    const c = parseCount(`${m[1]}${m[3]} or ${m[2]!.split(", ")[0]}${m[4]}`, ctx);
    if (!c || !("count" in c) || c.count.kind !== "permanents" || c.count.filter.subtypes?.length !== 2) return null;
    return { ...c, count: { ...c.count, filter: { ...c.count.filter, subtypes: types, text: p.replace(/^the number of /, "") } } };
  }
  // Timberpack Wolf: "for each other creature you control named ~", Cleric of the Forward Order: "for each creature you
  // control named ~": the same count.
  // She-Hulk, Wallbreaker: "Whenever a Hero you control becomes blocked, put a +1/+1 counter on that Hero for each creature
  // blocking it": the trigger's attacker's blockers as it resolves, like rampage's (CR 702.23b).
  if (each && /^creature blocking (?:it|~)$/.test(p) && (ctx?.subjectIt || /~$/.test(p))) return { count: ctx?.subjectIt && !/~$/.test(p) ? { kind: "blockingIt", subject: true } : { kind: "blockingIt" } };
  // Guardian of the Gateless: "Whenever ~ blocks, it gets +1/+1 until end of turn for each creature it's blocking".
  if (each && /^creature (?:it's|~ is) blocking$/.test(p) && (ctx?.selfIt || /~/.test(p))) return { count: { kind: "itBlocks" } };
  // Staff of Eden: "for each permanent you control but don't own" (CR 108.3); The Horus Heresy: "for each creature ...".
  if (each && (p === "permanent you control but don't own" || p === "creature you control but don't own")) {
    const filter = parseTargetPhrase(p);
    return filter?.kind === "object" ? { count: { kind: "permanents", filter: { ...filter, text: p } } } : null;
  }
  // Seven Dwarves: "for each other creature named ~ you control"; Relentless Rats: "for each other creature on the
  // battlefield named ~", any player's.
  if (each && (m = /^((?:other )?)creature (?:(you control|on the battlefield) named ~|named ~ you control)$/.exec(p))) return parseCount(`the number of ${m[1]}creatures ${m[2] ?? "you control"} named ~`, ctx);
  // Plague Rats: "the number of creatures named ~ on the battlefield": the same as "creatures on the battlefield named ~",
  // ~ itself included.
  if ((m = /^the number of creatures named ~ on the battlefield$/.exec(p))) return parseCount("the number of creatures on the battlefield named ~", ctx);
  // Hare Apparent: "the number of other creatures you control named ~": with the source's name (CR 201.5), as it is now.
  if ((m = /^(the number of (?:other )?(?:creatures|permanents) (?:you control|on the battlefield)) named ~$/.exec(p))) {
    const c = parseCount(m[1]!, ctx);
    if (!c || !("count" in c) || c.count.kind !== "permanents" || c.count.filter.named !== undefined) return null;
    return { ...c, count: { ...c.count, filter: { ...c.count.filter, named: "~", text: `${c.count.filter.text} named ~` } } };
  }
  // Food Fight's granted "the number of permanents named Food Fight you control": the card's name, as written (compile
  // keeps a quoted ability's own card name).
  if ((m = /^the number of (permanents|creatures) named ([A-Z][\w'-]*(?: (?:[A-Z][\w'-]*|of|the|a))*) you control$/.exec(p))) {
    const c = parseCount(`the number of ${m[1]} you control`, ctx);
    if (!c || !("count" in c) || c.count.kind !== "permanents" || c.count.filter.named !== undefined) return null;
    return { ...c, count: { ...c.count, filter: { ...c.count.filter, named: m[2]!, text: `${c.count.filter.text} named ${m[2]}` } } };
  }
  // Maraxus of Keld: "the number of untapped artifacts, creatures, and lands you control": each permanent that's any of
  // them, once.
  if ((m = /^the number of (untapped )?artifacts, creatures, and lands you control$/.exec(p))) {
    return { count: { kind: "permanents", filter: { kind: "object", types: ["Artifact", "Creature", "Land"], notTypes: [], notColors: [], controller: "you", ...(m[1] ? { tapped: false } : {}), text: p.replace(/^the number of /, "") } } };
  }
  // Road Rage: "the number of Mounts and Vehicles you control": each permanent that's either, once.
  if ((m = /^the number of ([A-Z][a-z]+s) and ([A-Z][a-z]+s) you control$/.exec(p))) {
    const [a, b] = [parseCount(`the number of ${m[1]} you control`, ctx), parseCount(`the number of ${m[2]} you control`, ctx)];
    const one = (c: ReturnType<typeof parseCount>) => (c && typeof c === "object" && c.count.kind === "permanents" && !c.plus && !c.times && c.count.filter.subtypes?.length === 1 && !c.count.filter.types?.length && c.count.filter.controller === "you" && Object.keys(c.count).length === 2 ? c.count.filter.subtypes[0]! : null);
    const [sa, sb] = [one(a), one(b)];
    return sa && sb && sa !== sb ? { count: { kind: "permanents", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [sa, sb], controller: "you", text: `${m[1]} and ${m[2]} you control` } } } : null;
  }
  // Walker of the Wastes: "for each land you control named Wastes": by that name (CR 201.2).
  if (each && (m = /^(land|creature|artifact) you control named ([A-Z][A-Za-z',-]+(?: [A-Z][A-Za-z',-]+)*)$/.exec(p))) {
    const c = parseCount(`the number of ${m[1]}s you control`, ctx);
    if (!c || !("count" in c) || c.count.kind !== "permanents" || c.count.filter.named !== undefined) return null;
    return { ...c, count: { ...c.count, filter: { ...c.count.filter, named: m[2]!, text: `${c.count.filter.text} named ${m[2]}` } } };
  }
  // "Each opponent sacrifices a creature of their choice. Create a Food token for each creature sacrificed this way."
  // (Voracious Fell Beast): the permanents this ability's sacrifice took.
  // Shadowgrange Archfiend: "the greatest power among creatures sacrificed this way".
  if (ctx && /^the greatest power among creatures sacrificed this way$/.test(p)) return { count: { kind: "sacrificedThisWayGreatestPower" } };
  // Bound: "Sacrifice a creature. ... where X is the number of colors that creature was" (rewritten in body.ts).
  if (ctx && /^the number of colors of the creature sacrificed this way$/.test(p)) return { count: { kind: "sacrificedThisWayColors" } };
  // Corpse Cobble: "the total power of the sacrificed creatures", those sacrificed to cast the spell (compile checks it has
  // that cost), as each last existed (CR 608.2h).
  if (ctx?.costSacrificedX && /^the total power of the sacrificed creatures$/.test(p)) return { count: { kind: "costSacrificedTotalPower" } };
  // Angrath, Minotaur Pirate (rewritten in body.ts).
  if (ctx && (m = /^the total power of creatures destroyed this way and creatures (that player) controls$/.exec(p))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? { count: { kind: "destroyedThisWayTotalPower", survivorsOf: who } } : null;
  }
  // Reign of the Pit: "the total power of the creatures sacrificed this way".
  if (ctx && /^the total power of (?:the )?creatures sacrificed this way$/.test(p)) return { count: { kind: "sacrificedThisWayTotalPower" } };
  // Vicious Betrayal: "for each creature sacrificed this way" after a cost that sacrifices any number is that cost's X (below).
  if (ctx && !(each && ctx.costSacrificedX && p === `${ctx.costSacrificedX} sacrificed this way`) && ((each && /^(?:creature|artifact) sacrificed this way$/.test(p)) || /^the number of (?:creature|artifact)s sacrificed this way$/.test(p))) return { count: { kind: "sacrificedThisWayCount" } };
  // Rise of the Deathbringer: "Draw cards equal to ... You lose life equal to the number of cards drawn this way": those
  // really drawn (a replaced draw isn't one, CR 121.6).
  if (!each && /^the number of cards drawn this way$/i.test(p)) return { count: { kind: "drawnThisWay" } };
  if (!each && /^the number of unlocked doors among Rooms you control$/.test(p)) return { count: { kind: "unlockedDoors" } };
  if (/^the number of poison counters lost this way$/.test(p)) return { count: { kind: "poisonLostThisWay" } };
  if (each && /^spell countered this way$/.test(p)) return { count: { kind: "spellsCounteredThisWay" } };
  if (each && /^spell and ability countered this way$/.test(p)) return { count: { kind: "stackCounteredThisWay" } };
  if (each && /^creature goaded this way$/.test(p)) return { count: { kind: "goadedThisWay" } };
  // Heed the Mists: "the milled card's mana value" after "mill a card": that card's, 0 if none was milled.
  if (ctx?.afterMillOne && /^the milled card's mana value$/.test(p)) return { count: { kind: "milledManaValue" } };
  // Seek: "Search target opponent's library for a card and exile it. You gain life equal to its mana value."
  if (ctx?.afterSearchExileOne && /^the exiled card's mana value$/.test(p)) return { count: { kind: "searchFoundMv" } };
  if (ctx?.milledThisWay && /^the total mana value of those cards$/i.test(p)) return { count: { kind: "milledManaValue" } };
  // Heretic's Punishment: "the greatest mana value among the milled cards", after "mill three cards".
  if (ctx?.afterMill && /^the greatest mana value among the milled cards$/i.test(p)) return { count: { kind: "milledManaValue", greatest: true } };
  // "Exiles the top four cards of their library and ~ deals damage equal to the total mana value of those exiled cards"
  // (Ensnared by the Mara): the cards it exiled, a card with {X} in its mana cost counting 0 (CR 202.3e).
  if (/^the total mana value of those exiled cards$/i.test(p)) return { count: { kind: "exiledTopManaValue" } };
  // Iridescent Hornbeetle: "for each +1/+1 counter you've put on creatures under your control this turn", as they were
  // put, even on creatures that have left since (rulings).
  if (each && /^\+1\/\+1 counter you've put on creatures under your control this turn$/.test(p)) return { count: { kind: "plusOnesPutThisTurn", byYou: true, onYours: true, creature: true } };
  // Lumbering Megasloth: "for each counter among players and permanents": all of them, every kind (CR 122.1).
  if (each && /^counter among players and permanents$/i.test(p)) return { count: { kind: "allCounters" } };
  // Vault 12: The Necropolis: "the total number of rad counters among players" (CR 728, 122.1), every player's together.
  if (/^the total number of rad counters among players$/i.test(p)) return { count: { kind: "rad" } };
  // Mariposa Military Base: "for each rad counter you have" (CR 122.1), yours only.
  if ((each && /^rad counter you have$/i.test(p)) || /^the number of rad counters you have$/i.test(p)) return { count: { kind: "rad", who: { ref: "you" } } };
  // Razorfield Ripper: "the amount of {E} you have", your energy counters (CR 107.14, 122.1) as it resolves (rulings).
  if (!each && /^the amount of \{E\} you have$/i.test(p)) return { count: { kind: "energy", who: { ref: "you" } } };
  // "The number of experience counters you have", "for each experience counter you have" (CR 122.1).
  if ((each && /^experience counter you have$/i.test(p)) || /^the number of experience counters you have$/i.test(p)) return { count: { kind: "experience", who: { ref: "you" } } };
  // "Each creature your opponents control gets -1/-1 until end of turn for each poison counter its controller has" (Phyresis
  // Outbreak): each creature's own controller's (Count affectedControllerPoison).
  if (each && /^poison counter its controller has$/i.test(p)) return { count: { kind: "affectedControllerPoison" } };
  // Righteous Authority: "Enchanted creature gets +1/+1 for each card in its controller's hand".
  if (each && /^card in its controller's hand$/i.test(p)) return { count: { kind: "affectedControllerHand" } };
  // Whispering Specter: "that player discards a card for each poison counter they have": the player the trigger is about.
  if (ctx?.eventPlayer && each && /^poison counter that player has$/i.test(p)) return { count: { kind: "poison", who: { ref: "eventPlayer" } } };
  // Phyrexian Swarmlord: "for each poison counter your opponents have", together.
  if ((each && /^poison counter your opponents have$/i.test(p)) || /^the number of poison counters your opponents have$/i.test(p)) return { count: { kind: "poison", who: { ref: "eachOpponent" } } };
  // "For each Urza's land you control" (Urza's Workshop): the land type Urza's (CR 205.3i), not a possessive.
  if ((m = /^(?:the number of )?(Urza's lands? you control)$/.exec(p))) {
    const g = parseGroup(m[1]!.replace(/land you/, "lands you"), true);
    return g && !g.other ? { count: { kind: "permanents", filter: { ...g.filter, text: m[1]! } } } : null;
  }
  // Arithmetic around a count.
  // Rootwire Amalgam: "three times ~'s power".
  if ((m = /^(twice|three times) (.+)$/i.exec(p))) {
    const k = /^twice$/i.test(m[1]!) ? 2 : 3;
    const c = parseCount(m[2]!, ctx);
    return c && { ...c, times: k * (c.times ?? 1), ...(c.plus ? { plus: k * c.plus } : {}) };
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
  // Phthisis: "its power plus its toughness"; Predator's Rapport: "that creature's power plus its toughness": the one
  // object's, added up.
  if ((m = /^(its|~'s|that creature's) power plus its toughness$/i.exec(p))) {
    const [a, b] = [parseCount(`${m[1]} power`, ctx), parseCount(`${m[1]} toughness`, ctx)];
    return a && b && !a.times && !a.plus && !b.times && !b.plus && !a.half && !b.half ? { count: { kind: "sum", of: [a.count, b.count] } } : null;
  }
  // Prophet of the Scarab: "the number of Zombies you control or the number of Zombie cards in your graveyard, whichever
  // is greater".
  if ((m = /^(the number of .+?) or (the number of .+), whichever is greater$/i.exec(p))) {
    const [a, b] = [parseCount(m[1]!, ctx), parseCount(m[2]!, ctx)];
    return a && b && !a.times && !a.plus && !b.times && !b.plus && !a.half && !b.half ? { count: { kind: "greater", of: [a.count, b.count] } } : null;
  }
  // Triumphant Chomp: "2 or the greatest power among Dinosaurs you control, whichever is greater".
  if ((m = new RegExp(`^${NUM} or (the greatest .+), whichever is greater$`, "i").exec(p))) {
    const c = parseCount(m[2]!, ctx);
    return c && !c.times && !c.plus && !c.half ? { count: { kind: "greater", of: [{ kind: "constant", n: num(m[1]!) }, c.count] } } : null;
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
  // Skanos Dragonheart: "the greatest power among other Dragons you control and Dragon cards in your graveyard": the
  // greater of the two (0 with neither).
  if (!each && (m = /^the greatest power among ((?:other )?(?:creatures|[A-Z][a-z]+s) you control) and ((?:creature|[A-Z][a-z]+) cards) in your graveyard$/i.exec(p))) {
    const a = parseCount(`the greatest power among ${m[1]}`, ctx);
    const filter = parseSearchFilter(m[2]!.replace(/cards$/, "card"));
    if (!a || a.times || a.plus || a.half || a.negate || filter?.kind !== "card") return null;
    return { count: { kind: "greater", of: [a.count, { kind: "cardsInGraveyard", who: { ref: "you" }, filter: { ...filter, text: m[2]!.replace(/cards$/, "card") }, greatestPower: true }] } };
  }
  // Freelance Muscle: "the greatest power and/or toughness among other creatures you control": the greatest of all those
  // powers and toughnesses, 0 with none.
  if (!each && (m = /^the greatest power or toughness among (.+)$/.exec(p))) {
    const a = parseCount(`the greatest power among ${m[1]}`, ctx);
    const b = parseCount(`the greatest toughness among ${m[1]}`, ctx);
    if (!a || !b || a.times || a.plus || a.half || a.negate || b.times || b.plus || b.half || b.negate) return null;
    return { count: { kind: "greater", of: [a.count, b.count] } };
  }
  // Alena, Kessig Trapper: "the greatest power among creatures you control that entered this turn": the ones on the
  // battlefield now that came onto it this turn, whoever controlled them then and whatever they were (rulings).
  if (!each && /^the greatest power among creatures you control that entered this turn$/.test(p)) {
    const c = parseCount("the greatest power among creatures you control", ctx);
    return c && "count" in c && c.count.kind === "greatestPower" ? { count: { ...c.count, filter: { ...c.count.filter, enteredThisTurn: true, text: "creatures you control that entered this turn" } } } : null;
  }
  // "The greatest power among creatures you control" (0 with none), "among other creatures you control", "the greatest
  // toughness among Wurms you control", "among creatures they control" (that player's).
  // "The greatest power among other attacking creatures" (Ghalta and Mavren): anyone's, like "attacking creatures" below.
  // Impetuous Protege: "the greatest power among tapped creatures your opponents control" (0 with none, rulings).
  if (!each && (m = /^the greatest (power|toughness) among (other )?((?:attacking |tapped )?(?:non-[A-Z][a-z]+ )?(?:creatures|[A-Z][a-z]+s)) (you control|on the battlefield|they control|that player controls|target player controls|target opponent controls|your opponents control)$/.exec(p.replace(/^The/, "the").replace(/^(the greatest (?:power|toughness) among (?:other )?attacking creatures)$/, "$1 on the battlefield")))) {
    const words = m[3]!.split(/\s+/).map(singularWord).join(" ");
    const who = m[4]!;
    const spec = parseTargetPhrase(`${words}${who === "you control" ? " you control" : who === "your opponents control" ? " an opponent controls" : ""}`, { chosen: true });
    if (spec?.kind !== "object") return null;
    const theirs = /^(?:they|that player|target player|target opponent) control/.test(who);
    const whose = theirs ? whosePlayer(who === "they control" ? "their" : who.replace(/ controls$/, "'s"), ctx) : undefined;
    if (whose === null) return null;
    const text = `${m[3]!} ${who}`;
    return { count: { kind: "greatestPower", filter: { ...spec, text }, ...(m[2] ? { other: true as const } : {}), ...(m[1] === "toughness" ? { toughness: true as const } : {}), ...(whose ? { whose } : {}) } };
  }
  // Shriekwood Devourer: "the greatest power among those creatures": the attackers of the trigger's event, those still on
  // the battlefield as it resolves (rulings).
  // Aloy, Savior of Meridian: "... attack, discover X, where X is the greatest power among them": the same.
  if (!each && /^the greatest power among (?:those creatures|them)$/i.test(p) && ctx?.lastGroup && "ref" in ctx.lastGroup && ctx.lastGroup.ref === "eventGroup")
    return { count: { kind: "greatestPower", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "those creatures" }, inEventGroup: true } };
  // Witch-king, Sky Scourge: "the total power of those creatures": the attackers of the trigger's event, as they last
  // existed if they've left the battlefield (rulings).
  if (!each && /^the total power of those creatures$/i.test(p) && ctx?.lastGroup && "ref" in ctx.lastGroup && ctx.lastGroup.ref === "eventGroup")
    return { count: { kind: "greatestPower", total: true, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "those creatures" }, inEventGroup: true } };
  // "The total power of creatures you control" (Ghalta, Primal Hunger), "... of creatures you control with flying" (The
  // Lord of the Eagles): a sum, so a negative power takes some off (rulings).
  // "The total power of attacking creatures" (Klauth): every player's attackers.
  // Towering Titan: "the total toughness of other creatures you control" (as it enters, those entering with it not
  // counted, rulings; see enterTogether).
  if (!each && (m = /^the total (power|toughness) of (other )?(creatures you control(?: with [a-z]+)?|attacking creatures)$/i.exec(p))) {
    const spec = parseTargetPhrase(m[3]!.replace(/creatures/, "creature"), { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: "greatestPower", total: true, filter: { ...spec, text: m[3]! }, ...(m[1] === "toughness" ? { toughness: true as const } : {}), ...(m[2] ? { other: true as const } : {}) } };
  }
  // "For each death vote", "the number of profit votes": the votes for that word in the ability's vote (CR 701.38).
  if ((m = /^(?:the number of )?(.+?) votes?$/i.exec(p)) && ctx?.vote?.options?.includes(m[1]!)) return { count: { kind: "votes", option: m[1]! } };
  // "For each player who chose fortune" (Seize the Spotlight): how many chose that word.
  if ((m = /^player who chose ([a-z]+)$/.exec(p)) && ctx?.chooseWords?.includes(m[1]!)) return { count: { kind: "choseWord", option: m[1]! } };
  // Recursive Recruitment: "for every three cards in your graveyard": each whole group of three, rounded down.
  if (each && (m = /^(two|three|four|five|six|seven|eight|nine|ten) cards in your graveyard$/.exec(p))) return { count: { kind: "cardsInGraveyard", who: { ref: "you" } }, per: num(m[1]!) };
  // "Draw a card for each counter removed this way" (Nexus Mentality, after "remove all counters").
  // Ventifact Bottle: "Add {C} for each charge counter removed this way" in a triggered ability (no cost to remove them).
  if (each && (/^counter removed this way$/i.test(p) || (!ctx?.activated && /^(?:[+-]1\/[+-]1|[a-z]+) counter removed this way$/i.test(p)))) return { count: { kind: "countersRemovedThisWay" } };
  // After "Remove all +1/+1 counters from ~" paid as a cost (StackItem.countersRemoved): "for each +1/+1 counter removed
  // this way" (Vish Kal), "the number of charge counters removed this way" (Geometric Nexus), "for each five counters
  // removed this way" (Sage of Hours: each whole group of five).
  if (ctx?.activated && each && (m = /^(?:(five) counters|(?:(?:[+-]1\/[+-]1|[a-z]+) )?counter) removed this way$/i.exec(p))) return { count: { kind: "countersRemovedThisWay" }, ...(m[1] ? { per: 5 } : {}) };
  if ((ctx?.activated || ctx?.removedCounters) && !each && /^the number of (?:(?:[+-]1\/[+-]1|[a-z]+) )?counters removed this way$/i.test(p)) return { count: { kind: "countersRemovedThisWay" } };
  // Profane Transfusion: "where X is the difference between those players' life totals", after they exchanged them.
  if (!each && ctx?.exchanged && /^the difference between those players' life totals$/i.test(p)) return { count: { kind: "exchangedLifeDifference" } };
  // "Draw a card for each creature destroyed this way" (Decree of Pain), "for each permanent destroyed this way", "the
  // number of enchantments destroyed this way": what this spell's or ability's destroy instructions destroyed. "Incubate
  // X, where X is the number of creatures exiled this way" (Sunfall): the same.
  // Kaya's Wrath: "the number of creatures you controlled that were destroyed this way": controlled by you as they last
  // existed on the battlefield (CR 608.2h).
  // Ceaseless Conflict: "for each nontoken creature you controlled that was destroyed this way": the same, one at a time.
  if ((m = /^(?:the number of )?([a-z]+s) you controlled that were (destroyed|exiled) this way$/i.exec(p) ?? (each ? /^((?:nontoken )?[a-z]+) you controlled that was (destroyed|exiled) this way$/i.exec(p) : null))) {
    const spec = parseTargetPhrase(`${m[1]!.split(" ").map(singularWord).join(" ")} you control`, { chosen: true });
    if (spec?.kind !== "object" || spec.controller !== "you") return null;
    return { count: { kind: m[2]!.toLowerCase() === "destroyed" ? "destroyedThisWay" : "exiledThisWay", filter: { ...spec, text: `${m[1]!} you controlled` } } };
  }
  // Reign of Terror: "for each creature that died this way": those the destroy put into a graveyard (CR 700.4).
  // Hellfire: "the number of creatures that died this way": the same.
  if ((each && (m = /^([a-z]+) that died this way$/i.exec(p))) || (m = /^the number of ([a-z]+?)s that died this way$/i.exec(p))) {
    const spec = parseTargetPhrase(m[1]!, { chosen: true });
    return spec?.kind === "object" ? { count: { kind: "destroyedThisWay", filter: { ...spec, text: m[1]! }, died: true } } : null;
  }
  // Volcanic Eruption: "Destroy X target Mountains. ~ deals damage ... equal to the number of Mountains put into a
  // graveyard this way": those the destroy put into a graveyard, as they last existed (CR 608.2h); one regenerated or
  // replaced to go elsewhere doesn't count. Builder's Bane: "... to each player equal to the number of artifacts they
  // controlled that were put into a graveyard this way": each player's own, as they controlled them (PlayerRef eachOne).
  if (!each && ctx?.afterDestroy && (m = /^the number of ([a-z]+?)s( they controlled that were)? put into a graveyard this way$/i.exec(p))) {
    const spec = parseTargetPhrase(m[1]!, { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: "destroyedThisWay", filter: { ...spec, text: `${m[1]!}s` }, died: true, ...(m[2] ? { controlledBy: { ref: "eachOne" as const } } : {}) } };
  }
  // Convert to Slime: "the total mana value of permanents destroyed this way", each as it last existed (rulings).
  if (!each && /^the total mana value of permanents destroyed this way$/.test(p))
    return { count: { kind: "destroyedThisWay", filter: { kind: "object", types: [], notTypes: [], notColors: [], text: "permanents" }, totalMv: true } };
  if ((m = /^(?:the number of )?(.+?) (destroyed|exiled) this way$/i.exec(p)) && !/\b(you|your|that|they|their|cards?)\b/i.test(m[1]!)) {
    const spec = parseTargetPhrase(m[1]!.split(/\s+/).map(singularWord).join(" "), { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: m[2]!.toLowerCase() === "destroyed" ? "destroyedThisWay" : "exiledThisWay", filter: { ...spec, text: m[1]! } } };
  }
  // Oona, Queen of the Fae: "for each card of the chosen color exiled this way", after "target opponent exiles the top X
  // cards of their library": the cards that exile took, still in exile (CR 400.7).
  if (each && ctx?.afterExileTop && (m = /^(.+? card|card of the chosen color) exiled this way$/.exec(p))) {
    const filter: TargetSpec | null | undefined = m[1] === "card of the chosen color" ? { kind: "card", types: [], notTypes: [], notColors: [], chosen: "color", text: m[1] } : parseSearchFilter(m[1]!);
    return filter ? { count: { kind: "exiledTopMatching", filter } } : null;
  }
  // Shellshock: "You create a Mutagen token for each creature dealt damage this way": what this spell's damage hit.
  if (each && /^creature dealt damage this way$/.test(p)) return { count: { kind: "damagedThisWayCount", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" } } };
  // "The greatest power among creature cards exiled this way" (Szat's Will, after exiling graveyards).
  if (!each && /^the greatest power among creature cards exiled this way$/i.test(p)) return { count: { kind: "greatestPowerExiled" } };
  // "You gain 1 life for each card exiled this way" (Titania's Command), "for each artifact or land card exiled this way"
  // (Canoptek Scarab Swarm), "the number of creature cards exiled this way": after exiling cards from graveyards.
  // The Kenriths' Royal Funeral: "the greatest mana value among cards exiled this way", as they are in exile.
  if (!each && ctx?.exiledCards && /^the greatest mana value among cards exiled this way$/i.test(p)) return { count: { kind: "cardsExiledThisWay", greatestMv: true } };
  if (ctx?.exiledCards && (m = /^(?:the number of )?(?!the greatest )(?:(.+?) )?cards? exiled this way$/i.exec(p))) {
    const filter = m[1] ? parseSearchFilter(`${m[1]} card`) : undefined;
    if (filter === null || (filter && filter.kind !== "card")) return null;
    return { count: { kind: "cardsExiledThisWay", ...(filter ? { filter } : {}) } };
  }
  if (!each && /^the greatest mana value among cards in exile$/i.test(p)) return { count: { kind: "greatestMvInExile" } };
  // Hapatra, the Desert Fang: "the greatest mana value among cards in your graveyard", 0 with none.
  // Inferno Project: "the total mana value of instant and sorcery cards in your graveyard": a split card's halves added (CR 709.4).
  if (!each && /^the total mana value of instant and sorcery cards in your graveyard$/i.test(p)) return { count: { kind: "cardsInGraveyard", who: { ref: "you" }, totalMv: true, filter: { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" } } };
  if (!each && /^the greatest mana value among cards in your graveyard$/i.test(p)) return { count: { kind: "cardsInGraveyard", who: { ref: "you" }, greatestMv: true } };
  // Dragon Man, Reformed Robot: "the greatest mana value among noncreature permanents you control and noncreature cards in
  // your graveyard": the greatest of both groups together, 0 with none.
  if (!each && /^the greatest mana value among noncreature permanents you control and noncreature cards in your graveyard$/i.test(p))
    return {
      count: {
        kind: "greaterOf",
        of: [
          { kind: "greatestManaValue", filter: { kind: "object", types: [], notTypes: ["Creature"], notColors: [], controller: "you", text: "noncreature permanent you control" } },
          { kind: "cardsInGraveyard", who: { ref: "you" }, greatestMv: true, filter: { kind: "card", types: [], notTypes: ["Creature"], notColors: [], text: "noncreature card" } },
        ],
      },
    };
  // "The greatest mana value among permanents you control" (Will of the Temur), 0 with none.
  // Emissary Escort: "the greatest mana value among other artifacts you control", the source left out.
  if (!each && (m = /^the greatest mana value among (other )?(.+?) you control$/i.exec(p))) {
    const spec = parseTargetPhrase(`${m[2]!.split(/\s+/).map(singularWord).join(" ")} you control`, { chosen: true });
    if (spec?.kind !== "object") return null;
    return { count: { kind: "greatestManaValue", ...(m[1] ? { other: true } : {}), filter: { ...spec, text: `${m[2]} you control` } } };
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
  if (!each && /^the greatest number of creatures you control that have a creature type in common$/i.test(p)) return { count: { kind: "mostSharingCreatureType" } };
  if (!each && /^the greatest number of cards an opponent has drawn this turn$/i.test(p)) return { count: { kind: "greatestDrawn" } };
  // "For each card you've drawn this turn", "the number of cards they've drawn this turn" (CR 121.1: cards drawn, not put
  // into the hand otherwise).
  // Heliod, the Warped Eclipse: "for each card your opponents have drawn this turn": all of them together.
  if (/^cards? your opponents have drawn this turn$/i.test(p)) return { count: { kind: "drawnThisTurn", who: { ref: "eachOpponent" } } };
  // Hollow One: "each card you've cycled or discarded this turn": cycling discards the card (CR 702.29a), so each is one
  // card discarded, counted once; it counts wherever those cards are now (rulings).
  if (/^cards? you've (?:cycled or )?discarded this turn$/i.test(p)) return { count: { kind: "discardedThisTurn", who: { ref: "you" } } };
  // Dream Salvage: "the number of cards target opponent discarded this turn" (every discard this turn, CR 701.9a).
  if ((m = /^(?:the number of )?cards? (target opponent|target player|that player) discarded this turn$/i.exec(p))) {
    const who = whosePlayer(`${m[1]!.toLowerCase()}'s`, ctx);
    return who && { count: { kind: "discardedThisTurn", who } };
  }
  if ((m = /^cards? (you've|you have|they've|they have|that player has) drawn this turn$/i.exec(p))) {
    const who = /^you/i.test(m[1]!) ? ({ ref: "you" } as PlayerRef) : whosePlayer(/^they/i.test(m[1]!) ? "their" : "that player's", ctx);
    return who && { count: { kind: "drawnThisTurn", who } };
  }
  if (!each) {
    const nb = /^the (?:total )?number of (.+)$/i.exec(p);
    if (nb) return parseCount(nb[1]!, ctx, true);
  }
  const count = (c: Count): AmountExpr => ({ count: c });
  // Chroma: "the number of red mana symbols in the mana costs of permanents you control" counts as devotion does (hybrid
  // symbols of that color count, rulings; CR 700.5); "of cards in your graveyard" (Umbra Stalker), "in its mana cost" in
  // a static ability (Light from Within: each permanent's own), "in the sacrificed creature's mana cost" (Fiery
  // Bombardment), "in those cards' mana costs" after revealing cards from your hand (Phosphorescent Feast).
  if (each && (m = /^(white|blue|black|red|green) mana symbols? in (.+)$/i.exec(p))) {
    const color = COLOR_WORDS[m[1]!.toLowerCase()]!;
    const where = m[2]!;
    if (/^the mana costs of permanents you control$/i.test(where)) return count({ kind: "devotion", colors: [color] });
    if (/^the mana costs of cards in your graveyard$/i.test(where)) return count({ kind: "manaSymbols", color, in: "graveyard" });
    if (/^its mana cost$/i.test(where) && ctx === null) return count({ kind: "manaSymbols", color, in: "affected" });
    if (/^the sacrificed creature's mana cost$/i.test(where) && ctx) return count({ kind: "manaSymbols", color, of: { ref: "sacrificed" } });
    if (/^those cards' mana costs$/i.test(where) && ctx?.revealedFromHand) return count({ kind: "manaSymbols", color, in: "revealedFromHand" });
    if (/^the mana costs of the revealed cards$/i.test(where) && ctx?.revealedTopN) return count({ kind: "manaSymbols", color, in: "revealed" });
    return null;
  }
  // "Draw cards equal to the result", "where X is the result" (CR 706.2), "the total of those results" (Neverwinter Hydra).
  if (!each && /^(?:the result|the total of those results)$/i.test(p)) return count({ kind: "rollResult" });
  // "Roll two d4 and choose one result. Create a number of ... equal to that result. Then ... equal to the other result."
  if (!each && ctx?.chooseResult && /^that result$/i.test(p)) return count({ kind: "rollResult" });
  if (!each && ctx?.chooseResult && /^the other result$/i.test(p)) return count({ kind: "rollOther" });
  // Clown Car: "For each odd result, create ...", "for each even result, put ..." after "roll X six-sided dice": each die's
  // own result (CR 706.2).
  if (each && /^(odd|even) result$/i.test(p)) return count({ kind: "rollParity", odd: /^odd/i.test(p) });
  // "Put a +1/+1 counter on ~ for each flip you won" (Crazed Firecat).
  // "For each flip you win, create ..." (Goblin Traprunner, after "flip three coins") too.
  if (each && /^flip you w(?:on|in)$/i.test(p)) return count({ kind: "flipsWon" });
  // Yusri, Fortune's Flame: "For each flip you lose, ~ deals 2 damage to you", after "flip that many coins".
  if (each && /^flip you lose$/i.test(p)) return count({ kind: "flipsWon", lost: true });
  // Ral Zarek: "for each coin that comes up heads", after uncalled flips (see body.ts).
  if (each && /^coin that comes up heads$/i.test(p) && ctx?.uncalledFlips) return count({ kind: "flipsWon", heads: true });
  // Life and hands.
  if ((m = /^(your|their|that player's|target player's|target opponent's|enchanted player's) life total$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: "life", who });
  }
  // Sengir, the Dark Baron: "that player's life total as the turn began".
  if (ctx?.eventPlayer && /^that player's life total as the turn began$/i.test(p)) return count({ kind: "eventPlayerLifeAsTurnBegan" });
  // Roiling Horror: "your life total minus the life total of an opponent with the most life": whichever opponent has the
  // most now, never one chosen (rulings), and less than 0 when you have less (its toughness then kills it, rulings).
  if (/^your life total minus the life total of an opponent with the most life$/i.test(p))
    return { count: { kind: "difference", of: [{ kind: "life", who: { ref: "you" } }, { kind: "life", who: { ref: "eachOpponent" }, highest: true }] }, signed: true };
  // Malignus: "the highest life total among your opponents" (those still in the game).
  if (/^the highest life total among your opponents$/i.test(p)) return count({ kind: "life", who: { ref: "eachOpponent" }, highest: true });
  // Scourge of the Skyclaves: "the highest life total among players" (those still in the game, you too); Sorin, Grim
  // Nemesis: "among all players".
  if (/^the highest life total among (?:all )?players$/i.test(p)) return count({ kind: "life", who: { ref: "eachPlayer" }, highest: true });
  if (/^your speed$/i.test(p)) return count({ kind: "speed" });
  // "For each unspent green mana you have" (Omnath, Locus of Mana): in your mana pool (CR 106.4).
  if (each && (m = /^unspent (?:(white|blue|black|red|green) )?mana you have$/i.exec(p))) return count({ kind: "unspentMana", ...(m[1] ? { color: COLOR_WORDS[m[1].toLowerCase()]! } : {}) });
  // Glissa Sunseeker: "the amount of unspent mana you have", all of it (restricted mana too).
  if (!each && /^the amount of unspent mana you have$/i.test(p)) return count({ kind: "unspentMana" });
  if (each && /^player$/i.test(p)) return count({ kind: "players" });
  if (each && /^player who has lost the game$/i.test(p)) return count({ kind: "players", lostGame: true });
  // "For each card revealed this way", "the number of cards revealed this way" after "reveal any number of red cards in
  // your hand" (Scent of Cinder), or in its reflexive trigger (Invasion of Tarkir).
  if (ctx?.revealedFromHand && /^(?:the number of )?cards? revealed this way$/i.test(p)) return { count: { kind: "revealedFromHand" } };
  // Parley: "for each nonland card revealed this way", "for each land card revealed this way".
  // Naya Soulbeast: "the total mana value of all cards revealed this way" after parley's reveal.
  if (ctx?.parley && /^the total mana value of all cards revealed this way$/.test(p)) return { count: { kind: "parleyRevealed", mv: true } };
  if (ctx?.parley && (m = /^(nonland|land) cards? revealed this way$/i.exec(p))) return { count: { kind: "parleyRevealed", ...(m[1]!.toLowerCase() === "land" ? { land: true as const } : {}) } };
  // "The amount of excess damage dealt to that creature this way" (Hell to Pay), "that excess damage" (Contest of Claws):
  // after a damage instruction (CR 120.10).
  if (ctx?.excessDamage && /^the damage dealt this way$/i.test(p)) return { count: { kind: "damageThisWay" } };
  if (ctx?.excessDamage && /^(?:the )?(?:amount of )?excess damage dealt(?: to (?:that creature|that permanent))? this way$|^that excess damage$/i.test(p)) return { count: { kind: "excessThisWay" } };
  // "For each creature tapped this way", "the number of creatures tapped this way" after "tap any number of untapped
  // creatures you control" (Harmony of Nature), or in its reflexive trigger (Teferi Akosa of Zhalfir).
  // Keldon Battlewagon: "Tap an untapped creature you control: ~ gets +X/+0 until end of turn, where X is the power of the
  // creature tapped this way"; Unerring Sling: "the tapped creature's power". compile() checks the ability has that cost.
  if (ctx?.activated && /^(?:the power of the creature tapped this way|the tapped creature's power)$/i.test(p)) return { count: { kind: "stationPower" } };
  // Burn at the Stake: "the number of creatures tapped this way" by its additional cost, the X announced for it (CR
  // 107.3a); a copy has the same X (CR 707.10).
  if (ctx?.costTappedX && /^(?:the number of )?creatures tapped this way$/.test(p)) return { count: { kind: "x" } };
  if (ctx?.tappedThisWay && /^(?:the number of )?(?:[A-Z][a-z]+ )?(?:creatures?|artifacts?|Gates?|Humans?|permanents?) tapped this way$/.test(p)) return { count: { kind: "tappedThisWay" } };
  // "For each card manifested this way" (Kozilek, the Broken Reality), after its manifest-from-hand instruction.
  if (ctx?.manifested && each && /^card manifested this way$/i.test(p)) return { count: { kind: "manifestedThisWay" } };
  // "For each card exiled from their hand this way" (Lost Legacy), after its exileNamed instruction.
  if (each && /^card exiled from (?:their|your) hand this way$/i.test(p)) return count({ kind: "exiledFromHandThisWay" });
  // "For each player being attacked", "the number of opponents being attacked" (Pack Attack, Dimir Strandcatcher).
  if (/^(?:players?|opponents?) being attacked$/i.test(p)) return count({ kind: "playersAttacked" });
  // Astral Confrontation: "for each opponent you're attacking": opponents your creatures are attacking, counted as it's cast.
  if (each && /^opponents? you're attacking$/i.test(p)) return count({ kind: "playersAttacked", byYou: true });
  // Custodi Soulcaller: "where X is the number of players you attacked this combat": as melee counts them (CR 702.121a;
  // rulings: players, not planeswalkers, attacked with at least one creature, whether or not they're still in the game).
  if (/^(?:the number of )?(?:players|opponents) you attacked this combat$/i.test(p)) return { count: { kind: "opponentsAttacked" } };
  // "For each opponent you attacked [this turn]" (Rose, Cutthroat Raider).
  if (each && /^opponents? you attacked(?: this turn)?$/i.test(p)) return count({ kind: "players", opponents: true, attacked: true });
  // "For each opponent you have", "the number of opponents you have" (Inspired Sphinx).
  if (each && /^opponents?(?: you have)?$/i.test(p)) return count({ kind: "players", opponents: true });
  // "The number of opponents who control a creature with power 4 or greater" (Summon: Yojimbo), "for each opponent who
  // controls an artifact": opponents controlling at least one such permanent.
  if (each && (m = /^opponents? who controls? (?:an?|one or more) (.+)$/i.exec(p))) {
    const spec = parseTargetPhrase(m[1]!);
    return spec?.kind === "object" && !spec.controller ? count({ kind: "players", opponents: true, controlling: { ...spec, text: m[1]! } }) : null;
  }
  // Consuming Tide: "for each opponent who has more cards in their hand than you", counted as it resolves.
  if (each && /^opponent who has more cards in (?:their )?hand than you$/i.test(p)) return count({ kind: "players", opponents: true, handMoreThanYou: true });
  // Birth of the Imperium: "for each opponent who controls fewer creatures than you", counted as it resolves.
  if (each && /^opponent who controls fewer creatures than you$/i.test(p)) return count({ kind: "players", opponents: true, fewerCreaturesThanYou: true });
  // Heidegger, Shinra Executive: "the number of opponents who control more creatures than you", counted as it resolves.
  if (/^(?:the number of )?opponents? who controls? more creatures than you$/i.test(p)) return count({ kind: "players", opponents: true, moreCreaturesThanYou: true });
  // Surveyor's Scope: "the number of players who control at least two more lands than you", counted as it resolves.
  if (each && (m = /^players? who controls? at least (one|two|three) more lands? than you$/i.exec(p))) return count({ kind: "players", moreLandsThanYou: num(m[1]!) });
  // Oreskos Explorer: "the number of players who control more lands than you" (at least one more), counted as it resolves.
  if (each && /^players? who controls? more lands than you$/i.test(p)) return count({ kind: "players", moreLandsThanYou: 1 });
  // Priest of the Blessed Graf: "the number of opponents who control more lands than you", counted as it resolves.
  if (each && /^opponents? who controls? more lands than you$/i.test(p)) return count({ kind: "players", opponents: true, moreLandsThanYou: 1 });
  // Great Unclean One: "for each opponent who has less life than you", counted as it resolves.
  // Anya, Merciless Angel: "for each opponent whose life total is less than half their starting life total" (CR 903.7:
  // 40 in Commander).
  if (each && /^opponent whose life total is less than half their starting life total$/i.test(p)) return count({ kind: "players", opponents: true, lifeAtMost: Math.ceil(STARTING_LIFE / 2) - 1 });
  if (each && /^opponent who has less life than you$/i.test(p)) return count({ kind: "players", opponents: true, lifeLessThanYou: true });
  // Bandit's Talent: "for each opponent who has one or fewer cards in hand", counted as it resolves.
  if (each && (m = /^opponent who has (one|two|three|zero|no) or fewer cards in hand$/i.exec(p))) return count({ kind: "players", opponents: true, handAtMost: m[1] === "no" ? 0 : num(m[1]!) });
  // Wolfcaller's Howl: "the number of your opponents with four or more cards in hand", counted as it resolves.
  if (each && (m = /^(?:your )?opponents? (?:with|who ha(?:s|ve)) (one|two|three|four|five|six|seven) or more cards in (?:their )?hand$/i.exec(p))) return count({ kind: "players", opponents: true, handAtLeast: num(m[1]!) });
  // Glissa's Retriever: "the number of opponents who have three or more poison counters", counted as it's needed.
  if (each && (m = /^opponents? who ha(?:s|ve) (one|two|three|four|five|six|seven|eight|nine) or more poison counters$/i.exec(p))) return count({ kind: "players", opponents: true, poisonAtLeast: num(m[1]!) });
  // Excess: "for each creature you controlled that dealt combat damage to a player this turn": as it dealt it (rulings).
  if (each && /^creature you controlled that dealt combat damage to a player this turn$/i.test(p)) return count({ kind: "yourCombatDamagers" });
  // Tymna the Weaver: "the number of opponents that were dealt combat damage this turn", those who've lost since too (rulings).
  if (each && /^opponents? (?:that|who) (?:were|was) dealt combat damage this turn$/i.test(p)) return count({ kind: "players", opponents: true, combatDamaged: true });
  // Estinien Varlineau: "the number of your opponents who were dealt combat damage by ~ or a Dragon this turn".
  const bySelfOr = each ? /^(?:your )?opponents (?:that|who) were dealt combat damage by ~ or an? ([A-Z][a-z]+) this turn$/.exec(p) : null;
  if (bySelfOr && CREATURE_TYPES.has(bySelfOr[1]!)) return count({ kind: "players", opponents: true, combatDamagedBySelfOr: bySelfOr[1]! });
  if (each && /^opponents? (?:that|who) (?:were|was) dealt damage this turn$/i.test(p)) return count({ kind: "players", opponents: true, damaged: true });
  if (each && /^(?:of your opponents|opponent) who lost life this turn$/i.test(p)) return count({ kind: "players", opponents: true, lostLife: true });
  if (ctx && each && /^card returned to your hand this way$/.test(p)) return { count: { kind: "returnedToYourHand" } };
  // Search for Blex: "You lose 3 life for each card you put into your hand this way", after its look at the top cards.
  if (ctx?.dugToHand && each && /^card you put into your hand this way$/.test(p)) return { count: { kind: "dugToHand" } };
  if (ctx?.untilToHand && each && /^card put into your hand this way$/.test(p)) return { count: { kind: "dugToHand" } };
  // Reviving Vapors: "put one of them into your hand. You gain life equal to that card's mana value."
  if (ctx?.dugOneToHand && /^that card's mana value$/.test(p)) return { count: { kind: "dugToHandMv" } };
  // Reaper's Scythe: "for each player who lost life this turn", you too.
  if (each && /^player who lost life this turn$/i.test(p)) return count({ kind: "players", lostLife: true });
  // The Master of Lake-town: "for each graveyard with seven or more cards in it": each player's graveyard (CR 404.1), of
  // the players still in the game (a player who left takes their cards along, CR 800.4a).
  if (each && (m = /^graveyard with (one|two|three|four|five|six|seven|eight|nine|ten) or more cards in it$/i.exec(p))) return count({ kind: "players", yardAtLeast: num(m[1]!) });
  // Aclazotz: "Each opponent discards a card. For each opponent who can't, you draw a card": those with no card to discard.
  if (each && ctx?.opponentsDiscarded && /^opponent who can't$/i.test(p)) return count({ kind: "players", opponents: true, discardedNone: true });
  if (each && ctx?.opponentsDiscardedTwo && /^opponent who didn't discard two nonland cards this way$/i.test(p)) return count({ kind: "players", opponents: true, discardedFewerNonland: 2 });
  if (each && /^opponent who drew a card this way$/i.test(p)) return count({ kind: "players", opponents: true, drewThisWay: true });
  // Wernog, Rider's Chaplain: "the number of opponents who investigated this way", after "each opponent may investigate":
  // those who chose to (each of them did).
  if (ctx?.eachChose && /^opponents? who investigated this way$/i.test(p)) return count({ kind: "players", opponents: true, choseThisWay: true });
  // Kefka, Court Mage: "for each card type among cards discarded this way" (CR 205.2a: card types, not supertypes or subtypes).
  if (each && /^card type among cards discarded this way$/i.test(p)) return count({ kind: "discardedTypes" });
  // Wanderwine Farewell: "for each permanent returned to its owner's hand this way": each the spell's return put into a hand,
  // a token too (it goes there before it ceases to exist, CR 111.7), not a commander sent to the command zone instead
  // (CR 903.9b); compile checks the spell returns permanents before it.
  if (each && ctx?.spell && /^permanent returned to its owner's hand this way$/.test(p)) return count({ kind: "returnedFromCount" });
  // Sweep (Plow Through Reito): "for each Plains returned this way", "the number of Mountains returned this way".
  if (ctx?.bouncedAny && (m = /^(?:the number of )?([A-Z][a-z]+) returned this way$/.exec(p)) && (each || p.startsWith("the number")) && singularWord(m[1]!) === singularWord(ctx.bouncedAny))
    return count({ kind: "bouncedThisWayCount" });
  // Devouring Rage: "For each Spirit sacrificed this way" is its X, the number its additional cost sacrificed (CR 107.3a).
  if (each && ctx?.costSacrificedX && p === `${ctx.costSacrificedX} sacrificed this way`) return count({ kind: "x" });
  // Pyretic Charge: "Discard your hand, then draw four cards. For each card discarded this way, ...": the cards you discarded.
  // Balin, Loremaster: "you may discard your hand. Draw X cards, where X is the number of cards discarded this way".
  if (each && (ctx?.afterYourDiscard || ctx?.afterTargetDiscard) && /^cards? discarded this way$/i.test(p)) return count({ kind: "discardedThisWay" });
  // Captain Howler: "Whenever you discard one or more cards, ... for each card discarded this way": the trigger event's cards.
  if (each && ctx?.discardBatch && /^card discarded this way$/i.test(p)) return count({ kind: "eventAmount" });
  // Seasoned Pyromancer: "for each nonland card discarded this way".
  if (each && (m = /^(non[a-z]+|creature|land|artifact|instant|sorcery|enchantment) card discarded this way$/i.exec(p))) {
    const filter = parseSearchFilter(`${m[1]!.toLowerCase()} card`);
    return filter?.kind === "card" ? count({ kind: "discardedMatching", filter: { ...filter, text: `${m[1]!.toLowerCase()} card` } }) : null;
  }
  // Dread Summons: "Each player mills X cards. For each creature card put into a graveyard this way, ...": the milled
  // cards that went there (one replaced to go elsewhere doesn't count, rulings).
  // Coerced Confession: "Target player mills four cards. You draw a card for each creature card put into their graveyard
  // this way": the same, the cards milled going to their owner's graveyard (CR 701.17a).
  // Liliana's Indignation: "Mill X cards. Target player loses 2 life for each creature card put into your graveyard this
  // way": your own mill.
  if (each && ctx?.afterAnyMill && (m = /^(.+? card) (?:put into (a|their|your) graveyard this way|milled this way)$/i.exec(p)) && (m[2] !== "your" || ctx.afterMill)) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? count({ kind: "milledThisWay", filter }) : null;
  }
  // Intrude on the Mind: "for each card put into your graveyard this way", after the piles: the pile put there (one put
  // somewhere else instead by a replacement doesn't count).
  if (each && ctx?.afterPilesGraveyard && /^card put into your graveyard this way$/i.test(p)) return count({ kind: "pilesToGraveyard" });
  // Struggle for Project Purity: "Each opponent draws a card. You draw a card for each card drawn this way."
  if (each && /^card drawn this way$/i.test(p)) return count({ kind: "drawnThisWay" });
  // Smuggler's Share: "for each opponent who drew two or more cards this turn", "... who had two or more lands enter the
  // battlefield under their control this turn".
  if (each && (m = /^opponent who drew (two|three|four) or more cards this turn$/i.exec(p))) return count({ kind: "players", opponents: true, drewAtLeast: num(m[1]!) });
  if (each && (m = /^opponent who had (two|three|four) or more lands enter the battlefield under their control this turn$/i.exec(p))) return count({ kind: "players", opponents: true, landsEnteredAtLeast: num(m[1]!) });
  // Azula, Ruthless Firebender: "for each player who discarded a card this turn": players still in the game who discarded
  // one or more cards this turn (a discard as a cost too), counted as it resolves.
  if (each && /^player who discarded a card this turn$/i.test(p)) return count({ kind: "players", discardedThisTurn: true });
  // Gadrak, the Crown-Scourge: "for each nontoken creature that died this turn".
  if (/^creatures? that left the battlefield under your control this turn$/i.test(p)) return count({ kind: "creaturesLeftThisTurn" });
  // Caller of the Claw: "for each nontoken creature put into your graveyard from the battlefield this turn".
  if (/^artifacts that were put into graveyards from the battlefield this turn$/i.test(p)) return count({ kind: "artifactsToGraveyardThisTurn" });
  if ((m = /^(nontoken )?creatures? put into your graveyard from the battlefield this turn$/i.exec(p))) return count({ kind: "creaturesToYourGraveyard", ...(m[1] ? { nontoken: true as const } : {}) });
  if ((m = /^(nontoken )?creatures? that died (under your control )?this turn$/i.exec(p))) return count({ kind: "diedThisTurn", ...(m[2] ? { yours: true as const } : {}), ...(m[1] ? { nontoken: true as const } : {}) });
  // Tobias, Doomed Conqueror: "for each nontoken creature you controlled that died this turn": died under your control.
  if ((m = /^(nontoken )?creatures? you controlled that died this turn$/i.exec(p))) return count({ kind: "diedThisTurn", yours: true, ...(m[1] ? { nontoken: true as const } : {}) });
  // The Zubera: "for each Zubera that died this turn", any player's.
  if ((m = /^([A-Z][a-z]+) that died this turn$/.exec(p)) && CREATURE_TYPES.has(m[1]!)) return count({ kind: "diedThisTurn", subtype: m[1]! });
  if (/^creatures? that attacked this turn$/i.test(p)) return count({ kind: "attackersThisTurn" });
  if (/^creatures? you attacked with this turn$/i.test(p)) return count({ kind: "youAttackedWithThisTurn" });
  // Geralf, the Fleshwright: "for each other Zombie that entered the battlefield under your control this turn", after
  // "Whenever a Zombie you control enters": all of them but the one whose entering triggered it (rulings).
  if (each && ctx?.subjectIt && (m = /^other ([A-Z][a-z]+) that entered the battlefield under your control this turn$/.exec(p)) && CREATURE_TYPES.has(m[1]!)) return count({ kind: "enteredThisTurn", subtype: m[1]!, notSubject: true });
  // "The number of Goblins that entered the battlefield under your control this turn" (Hobgoblin, Bandit Lord).
  if ((m = /^(creature|artifact|land|permanent|[A-Z][a-z]+?)s? that entered the battlefield under your control this turn$/.exec(p)) && !["Elve", "Dwarve"].includes(m[1]!))
    return count({ kind: "enteredThisTurn", ...(/^[A-Z]/.test(m[1]!) ? { subtype: m[1]! } : m[1] === "permanent" ? {} : { types: [capital(m[1]!)] }) });
  // Gyome, Master Chef: "the number of nontoken creatures you had enter the battlefield under your control this turn":
  // every one that entered, wherever it is now and whatever it is now (rulings), as it entered.
  if (/^nontoken creatures you had enter the battlefield under your control this turn$/.test(p)) return count({ kind: "enteredThisTurn", types: ["Creature"], nontoken: true });
  // Emergent Sequence: "for each land you had enter the battlefield under your control this turn": every land that
  // entered under your control, the one it just put there included (rulings), as it entered.
  if (each && /^land you had enter the battlefield under your control this turn$/.test(p)) return count({ kind: "enteredThisTurn", types: ["Land"] });
  // The Balrog, Durin's Bane: "for each permanent sacrificed this turn": by any player (rulings).
  if (each && /^permanent sacrificed this turn$/.test(p)) return count({ kind: "sacrificedThisTurn", anyPlayer: true });
  // Korvold, Gleeful Glutton: "for each card type among permanents you've sacrificed this turn" (CR 205.2a), as each last
  // existed.
  if (each && /^card type among permanents you(?:'ve)? sacrificed this turn$/.test(p)) return count({ kind: "sacrificedThisTurn", cardTypes: true });
  // Sawblade Skinripper: "the number of permanents you sacrificed this turn".
  if (/^(?:the number of )?permanents you(?:'ve)? sacrificed this turn$/.test(p)) return count({ kind: "sacrificedThisTurn" });
  if ((m = /^(?:([A-Z][a-z]+) )?tokens you created this turn$/.exec(p))) return count({ kind: "tokensCreatedThisTurn", ...(m[1] ? { subtype: m[1] } : {}) });
  // Jeska, Thrice Reborn: "each time you've cast a commander from the command zone": only your own are cast from there (CR 903.8).
  if (/^times? you've cast (?:your|a) commander from the command zone this game$/i.test(p)) return count({ kind: "commanderCasts" });
  if (/^the chosen commander's mana value$/i.test(p)) return count({ kind: "chosenCommanderMv" });
  if (!each && /^the greatest mana value among your commanders$/i.test(p)) return count({ kind: "commandersMv" });
  // Cloudkill, Majestic Genesis, the Visions cycle: "the greatest mana value of a commander you own on the battlefield or
  // in the command zone", 0 with none there. Imposing Grandeur: "... a commander they own ...", each player's own.
  if (!each && (m = /^the greatest mana value of a commander (you|they) own on the battlefield or in the command zone$/i.exec(p)))
    return count({ kind: "commandersMv", onBattlefieldOrCommand: true, ...(m[1] === "they" ? { who: { ref: "eachOne" } as const } : {}) });
  // "For each creature in your party", "the number of creatures in your party" (CR 700.8).
  if (/^creatures? in your party$/i.test(p)) return count({ kind: "party" });
  if (each && /^\{E\}(?: \(energy counter\))? you've paid or lost this turn$/i.test(p)) return count({ kind: "energyLostThisTurn" });
  if (/^(?:the number of )?times you(?:'ve)? descended this turn$/i.test(p)) return count({ kind: "descendedThisTurn" });
  if (/^(?:the number of )?creatures that were exiled under your opponents' control this turn$/.test(p)) return count({ kind: "opponentsCreaturesExiledThisTurn" });
  // The Mycotyrant: "the number of creatures you control that are Fungi and/or Saprolings": one with either creature type,
  // counted once (rulings).
  if (/^(?:the number of )?creatures you control that are Fungi or Saprolings$/.test(p))
    return count({ kind: "permanents", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], subtypes: ["Fungus", "Saproling"], controller: "you", text: "creatures you control that are Fungi and/or Saprolings" } });
  if (each ? /^1 life you(?:'ve| have)? gained this turn$/i.test(p) : /^the (?:total )?amount of life you(?:'ve| have)? gained this turn$/i.test(p)) return count({ kind: "lifeGainedThisTurn" });
  // Willowdusk, Essence Seer: "the amount of life you gained this turn or the amount of life you lost this turn, whichever
  // is greater".
  if (!each && /^the amount of life you gained this turn or the amount of life you lost this turn, whichever is greater$/i.test(p)) return count({ kind: "greaterOf", of: [{ kind: "lifeGainedThisTurn" }, { kind: "lifeLostThisTurn", who: { ref: "you" } }] });
  // Children of Korlis: "the life you've lost this turn", all of it, whatever you gained (rulings).
  if (!each && /^the (?:total )?(?:amount of )?life you(?:'ve| have)? lost this turn$/i.test(p)) return count({ kind: "lifeLostThisTurn", who: { ref: "you" } });
  // Tainted Sigil: "the total life lost by all players this turn": each player's (still in the game, CR 102.1), you too,
  // however they lost it and whatever they gained (rulings).
  if (!each && /^the total life lost by all players this turn$/i.test(p)) return count({ kind: "lifeLostThisTurn", who: { ref: "eachPlayer" } });
  if (!each && /^the total amount of noncombat damage dealt to your opponents this turn$/i.test(p)) return count({ kind: "opponentsNoncombatDamage" });
  // Notorious Throng: all the damage dealt this turn to players who are your opponents, by any source (rulings).
  if (!each && /^the (?:total )?(?:amount of )?damage dealt to your opponents this turn$/i.test(p)) return count({ kind: "opponentsDamage" });
  // Discordant Spirit: "for each 1 damage dealt to you this turn": by any source, what was really dealt.
  if (each ? /^1 damage dealt to you this turn$/i.test(p) : /^the (?:total )?(?:amount of )?damage dealt to you this turn$/i.test(p)) return count({ kind: "playerDamageThisTurn", who: { ref: "you" } });
  // Reverse Polarity: "the damage dealt to you so far this turn by artifacts": by sources that were artifacts as they dealt
  // it (TurnLog.artifactDamage), what was really dealt.
  if (!each && /^the damage dealt to you so far this turn by artifacts$/i.test(p)) return count({ kind: "playerDamageThisTurn", who: { ref: "you" }, byArtifacts: true });
  // Knollspine Dragon: "the damage dealt to target opponent this turn": by any source, what was really dealt (rulings).
  if (!each && ctx && /^the damage dealt to target opponent this turn$/i.test(p)) {
    const i = addTarget(ctx, { kind: "player", opponent: true, text: "target opponent" });
    ctx.lastPlayerTarget = i;
    return count({ kind: "playerDamageThisTurn", who: { ref: "target", index: i } });
  }
  // Final Punishment: "Target player loses life equal to the damage already dealt to that player this turn": by any
  // source, what was really dealt.
  if (!each && ctx && /^the damage already dealt to that player this turn$/i.test(p) && ctx.lastPlayerTarget !== undefined) return count({ kind: "playerDamageThisTurn", who: { ref: "target", index: ctx.lastPlayerTarget } });
  // Cryptborn Horror: "where X is the total life lost by your opponents this turn", the same total.
  if (each ? /^1 life your opponents have lost this turn$/i.test(p) : (/^the (?:total )?amount of life your opponents (?:have )?lost this turn$/i.test(p) || /^the total life lost by your opponents this turn$/i.test(p))) return count({ kind: "opponentsLifeLost" });
  // Inquisition: "the number of white cards in their hand" (revealed just before).
  if ((m = /^((?:white|blue|black|red|green|creature|land|nonland|artifact|enchantment|instant|sorcery) cards?) in (your|that player's|target player's|their|target opponent's) hand$/i.exec(p))) {
    const who = whosePlayer(m[2]!, ctx);
    const filter = parseSearchFilter(m[1]!.replace(/s$/, ""));
    return who && filter ? count({ kind: "cardsInHand", who, filter }) : null;
  }
  // Darigaaz, the Igniter: "the number of cards of the chosen color in their hand": the color chosen as it resolves.
  if ((m = /^cards of the chosen color in (that player's|their) hand$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: "cardsInHand", who, filter: { kind: "card", types: [], notTypes: [], notColors: [], chosen: "color", text: "card of the chosen color" } });
  }
  // Dark Suspicions: "the number of cards in that player's hand minus the number of cards in your hand", 0 if fewer.
  // Mr. Foxglove: "the number of cards in defending player's hand minus the number of cards in your hand" (rulings: none
  // if that's 0 or less).
  if ((m = /^(?:the number of )?cards in (that player's|target opponent's|target player's|defending player's) hand minus the number of cards in your hand$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: "handMoreThanYou", who });
  }
  // Bulwark: "the number of cards in your hand minus the number of cards in that player's hand": the other way round, 0 if
  // that's less (CR 107.1b).
  if ((m = /^(?:the number of )?cards in your hand minus the number of cards in (that player's|target opponent's|target player's|defending player's) hand$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: "handMoreThanYou", who, yoursMinus: true });
  }
  // Enemy of Enlightenment: "for each card in your opponents' hands": all of them together.
  if (/^cards? in (?:your opponents'|all opponents') hands$/i.test(p)) return count({ kind: "cardsInHand", who: { ref: "eachOpponent" } });
  // Adamaro, First to Desire: "the number of cards in the hand of the opponent with the most cards in hand": that one hand.
  if (/^cards in the hand of the opponent with the most cards in hand$/i.test(p)) return count({ kind: "cardsInHand", who: { ref: "eachOpponent" }, most: true });
  // Realm Seekers: "the total number of cards in all players' hands", every player's added up.
  if (/^cards? in all players' hands$/i.test(p)) return count({ kind: "cardsInHand", who: { ref: "eachPlayer" } });
  // Flunk: "the number of cards in that creature's controller's hand": the targeted creature's controller as this resolves.
  if (/^cards? in that creature's controller's hand$/i.test(p) && ctx) {
    const i = ctx.targets.length - 1;
    const t = ctx.targets[i];
    return t?.kind === "object" && !t.many && t.types?.includes("Creature") ? count({ kind: "cardsInHand", who: { ref: "targetController", index: i } }) : null;
  }
  if ((m = /^cards? in (your|that player's|target player's|their|target opponent's|the chosen player's) (hand|library)$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: m[2]!.toLowerCase() === "hand" ? "cardsInHand" : "cardsInLibrary", who });
  }
  // "Card types among cards in all graveyards" (Tarmogoyf), "in your graveyard", "in your opponents' graveyards" (CR 205.2a).
  // Korvold, Gleeful Glutton: "the number of permanent types among cards in your graveyard" (CR 110.4a).
  if ((m = /^(?:the number of )?(card|permanent) types? among cards in (your|all|your opponents') graveyards?$/i.exec(p)))
    return count({ kind: "graveyardCardTypes", who: { ref: m[2] === "your" ? "you" : m[2] === "all" ? "eachPlayer" : "eachOpponent" } as PlayerRef, ...(m[1] === "permanent" ? { permanent: true as const } : {}) });
  // The Shrines: "the number of cards in all graveyards with the same name as that spell" in a cast trigger (Aven Shrine;
  // "as the spell", Cephalid Shrine): the name it has on the stack (a split card's half's, CR 709.3b), as it was cast.
  if (/^cards in all graveyards with the same name as (?:that|the) spell$/i.test(p) && ctx?.castSpell)
    return count({ kind: "cardsInGraveyard", who: { ref: "eachPlayer" }, sameNameAsCast: true });
  // "Cards named ~ in all graveyards" (Kindle), "for each card named ~ in each graveyard" (Rite of Flame), "in your graveyard".
  // Sound the Call's Wolf: "for each card named Sound the Call in each graveyard", another card's name (compile keeps it).
  if ((m = /^[Cc]ards? named (~|[A-Z][\w'-]*(?: (?:[A-Z][\w'-]*|of|the|a))*) in (your|all|each) graveyards?$/.exec(p)))
    return count({ kind: "cardsInGraveyard", who: { ref: m[2] === "your" ? "you" : "eachPlayer" }, filter: { kind: "card", named: m[1]!, text: `card named ${m[1]}` } });
  // Carrion Grub: "the greatest power among creature cards in your graveyard" (0 with none).
  if (!each && (m = /^the greatest power among creature cards in your graveyard$/i.exec(p))) return { count: { kind: "cardsInGraveyard", who: { ref: "you" }, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, greatestPower: true } };
  // Graveyards: "card in your graveyard", "creature card in your graveyard", "instant and sorcery card in all graveyards".
  // Revivify: "the number of creature cards in your graveyard that were put there from the battlefield this turn".
  // Wreck Hunter: "for each nonland card in that player's graveyard that was put there from the battlefield this turn".
  if ((m = /^(?:the number of )?([a-z]+ )?cards? in (your|that player's) graveyard that (?:was|were) put there from the battlefield this turn$/i.exec(p))) {
    const spec = m[1] ? parseTargetPhrase(`${m[1].trim()} card from a graveyard`, { chosen: true }) : { kind: "card" as const, types: [], notTypes: [], notColors: [], text: "card" };
    const who = m[2] === "your" ? ({ ref: "you" } as const) : ctx ? parsePlayer("that player", ctx) : null;
    return spec?.kind === "card" && who ? count({ kind: "cardsInGraveyard", who, filter: { ...spec, fromBattlefieldThisTurn: true, text: `${m[1] ?? ""}card that was put there from the battlefield this turn` } }) : null;
  }
  // Risen Executioner: "each other creature card in your graveyard": not ~ itself (it's on the stack as its cost is
  // determined, CR 601.2a, 601.2f).
  if (each && (m = /^other ([a-z]+) card in your graveyard$/i.exec(p))) {
    const spec = parseTargetPhrase(`${m[1]} card from a graveyard`, { chosen: true });
    return spec?.kind === "card" ? count({ kind: "cardsInGraveyard", who: { ref: "you" }, filter: { ...spec, notSource: true, text: `other ${m[1]} card` } }) : null;
  }
  // "Cards in your opponents' graveyards" (Consuming Aberration): each opponent's. "Creature cards in defending player's
  // graveyard" (Animus of Night's Reach): the player its attack trigger is about.
  if ((m = /^(.*?)cards? in (your|all|that player's|target player's|target opponent's|their|your opponents'|the chosen player's|defending player's) graveyards?$/i.exec(p))) {
    const who = /^all$/i.test(m[2]!) ? ({ ref: "eachPlayer" } as PlayerRef) : /^your opponents'$/i.test(m[2]!) ? ({ ref: "eachOpponent" } as PlayerRef) : whosePlayer(m[2]!, ctx);
    if (!who) return null;
    const kinds = m[1]!.trim().replace(/ and /g, " or ");
    if (!kinds) return count({ kind: "cardsInGraveyard", who });
    const spec = parseTargetPhrase(`${kinds.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    return spec?.kind === "card" ? count({ kind: "cardsInGraveyard", who, filter: { ...spec, text: `${kinds} card` } }) : null;
  }
  // Roiling Terrain: "the number of land cards in that land's controller's graveyard": the target's controller, as it last
  // existed if it's gone.
  if (ctx && (m = /^(.*?)cards? in that (land|creature|permanent)'s controller's graveyard$/i.exec(p))) {
    const i = ctx.targets.length - 1;
    const t = ctx.targets[i];
    const kinds = m[1]!.trim();
    const spec = kinds ? (/^[a-z]+$/.test(kinds) ? parseTargetPhrase(`${kinds} card from a graveyard`, { chosen: true }) : null) : undefined;
    if (t?.kind !== "object" || t.many || t.optional || (m[2] !== "permanent" && !t.types?.includes(capital(m[2]!))) || spec === null || (spec && spec.kind !== "card")) return null;
    return count({ kind: "cardsInGraveyard", who: { ref: "targetController", index: i }, ...(spec ? { filter: { ...spec, text: `${kinds} card` } } : {}) });
  }
  // Death's Approach: "Enchanted creature gets -X/-X, where X is the number of creature cards in its controller's
  // graveyard": a static ability's, counted for the permanent it affects (whoever controls it now).
  if (!ctx && (m = /^(.*?)cards? in its controller's graveyard$/i.exec(p))) {
    const kinds = m[1]!.trim();
    if (!kinds) return count({ kind: "cardsInGraveyard", who: { ref: "you" }, affectedController: true });
    const spec = /^[a-z]+$/.test(kinds) ? parseTargetPhrase(`${kinds} card from a graveyard`, { chosen: true }) : null;
    return spec?.kind === "card" ? count({ kind: "cardsInGraveyard", who: { ref: "you" }, filter: { ...spec, text: `${kinds} card` }, affectedController: true }) : null;
  }
  // Vile Manifestation: "for each card with cycling in your graveyard": its printed cycling or typecycling (see
  // parseTargetPhrase's graveyard keywords).
  // Zenith Flare: "the number of cards with a cycling ability in your graveyard": the same cards.
  if ((m = /^cards? with (cycling|a cycling ability) in your graveyard$/i.exec(p))) {
    const spec = parseTargetPhrase(`card with ${m[1]} from a graveyard`, { chosen: true });
    return spec?.kind === "card" ? count({ kind: "cardsInGraveyard", who: { ref: "you" }, filter: { ...spec, text: `card with ${m[1]}` } }) : null;
  }
  // Devotion (CR 700.5): "your devotion to black", "your devotion to black and red".
  if ((m = /^your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))?$/i.exec(p)))
    return count({ kind: "devotion", colors: [m[1]!, m[2]].filter(Boolean).map((w) => COLOR_WORDS[w!.toLowerCase()]!) });
  // Rose Tyler: "for each suspended card you own and each other permanent you control with a time counter on it".
  if (/^suspended card you own and each other permanent you control with a time counter on it$/.test(p)) return count({ kind: "timeCountedObjects" });
  // Domain.
  if (/^basic land types? among lands you control$/i.test(p)) return count({ kind: "basicLandTypes" });
  // Niv-Mizzet, Guildpact: "the number of different color pairs among permanents you control that are exactly two colors".
  if (/^different color pairs among permanents you control that are exactly two colors$/i.test(p)) return count({ kind: "colorPairs" });
  // Vivid: "the number of colors among permanents you control".
  if (/^colou?rs? among permanents you control$/i.test(p)) return count({ kind: "colorsAmongPermanents" });
  // Loot, the Key to Everything: "the number of card types among other nonland permanents you control" (CR 205.2a; a
  // land's other card types don't count, rulings).
  if ((m = /^(?:the number of )?card types among (other )?(nonland )?permanents you control$/i.exec(p)))
    return count({ kind: "cardTypesAmongPermanents", ...(m[1] ? { other: true as const } : {}), ...(m[2] ? { nonland: true as const } : {}) });
  if (each && /^creature type among creatures you control$/i.test(p)) return count({ kind: "creatureTypesAmong" });
  if (/^planeswalker types among planeswalkers you control$/i.test(p)) return count({ kind: "planeswalkerTypesAmong" });
  // Odric, Blood-Cursed: "the number of abilities from among flying, first strike, ... found among creatures you control":
  // each one once, however many creatures have it (rulings).
  if ((m = /^(?:the number of )?abilities from among ((?:[a-z ]+, )+and [a-z ]+) found among creatures you control$/i.exec(p))) {
    const keywords = m[1]!.split(/, (?:and )?/).map((k) => canonicalKeyword(k));
    return keywords.every((k) => k && SUPPORTED_KEYWORDS.includes(k as SupportedKeyword)) ? count({ kind: "keywordsAmong", keywords: keywords as string[] }) : null;
  }
  // Sisay, Weatherlight Captain: "for each color among other legendary permanents you control".
  if ((m = /^colou?rs? among (other )?legendary permanents you control$/i.exec(p)))
    return count({ kind: "colorsAmongPermanents", filter: { kind: "object", types: [], notTypes: [], notColors: [], supertypes: ["Legendary"], controller: "you", text: "legendary permanents you control" }, ...(m[1] ? { other: true as const } : {}) });
  // Karn, Gilded Guardian: "for each color among other artifacts you control".
  if ((m = /^colou?rs? among (other )?(artifacts|creatures|enchantments) you control$/i.exec(p)))
    return count({ kind: "colorsAmongPermanents", filter: { kind: "object", types: [capital(m[2]!.slice(0, -1)) as "Artifact"], notTypes: [], notColors: [], controller: "you", text: `${m[2]} you control` }, ...(m[1] ? { other: true as const } : {}) });
  // General Tazri: "the number of colors among Ally creatures you control" (colorless isn't a color, rulings).
  if ((m = /^colou?rs? among ([A-Z][a-z]+) creatures you control$/.exec(p)) && CREATURE_TYPES.has(m[1]!))
    return count({ kind: "colorsAmongPermanents", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], subtypes: [m[1]!], controller: "you", text: `${m[1]} creatures you control` } });
  // Earthen Ally: "for each color among Allies you control" (itself included).
  if ((m = /^colou?rs? among ([A-Z][a-z]+) you control$/.exec(p)) && CREATURE_TYPES.has(singularWord(m[1]!)))
    return count({ kind: "colorsAmongPermanents", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [singularWord(m[1]!)], controller: "you", text: `${m[1]} you control` } });
  if (/^spells? you've cast this turn$/i.test(p)) return count({ kind: "spellsCastThisTurn" });
  // April O'Neil, Hacktivist: "for each card type among spells you've cast this turn" (CR 205.2a).
  if (each && /^card type among spells you've cast this turn$/i.test(p)) return count({ kind: "spellsCastThisTurn", cardTypes: true });
  // Delightful Discovery: "for each spell your opponents have cast this turn" (CR 601.2f: counted as it's cast). A player
  // who has left isn't an opponent any more (CR 800.4a).
  if (/^spells? your opponents have cast this turn$/i.test(p)) return count({ kind: "spellsCastThisTurn", opponents: true });
  // Outlaw Stitcher: "for each spell you've cast this turn other than the first": all of them but one.
  if (each && /^spell you've cast this turn other than the first$/i.test(p)) return count({ kind: "spellsCastThisTurn", beyondFirst: true });
  // Storm Entity: "for each other spell cast this turn", every player's, not its own cast (rulings: counted as it enters,
  // spells cast while it was on the stack too; copies weren't cast, CR 707.10).
  if (each && (ctx === null || ctx.spell) && /^other spells? cast this turn$/i.test(p)) return count({ kind: "spellsCastThisTurn", anyone: true, notSource: true });
  // Thunder Salvo: "the number of other spells you've cast this turn": not its own cast (rulings: resolved or not).
  if (ctx?.spell && /^other spells you've cast this turn$/i.test(p)) return count({ kind: "spellsCastThisTurn", other: true });
  // Surge of Brilliance: "for each spell you've cast this turn from anywhere other than your hand", itself too when it was
  // (rulings).
  // Impending Flux: "the number of spells you've cast from anywhere other than your hand this turn" likewise.
  if (/^spells? you've cast (?:this turn from anywhere other than your hand|from anywhere other than your hand this turn)$/i.test(p)) return count({ kind: "spellsCastThisTurn", notFromHand: true });
  // Rug of Smothering: "for each spell they've cast this turn", the player the trigger is about.
  if (ctx?.eventPlayer && /^spells? (?:they've|that player has) cast this turn$/i.test(p)) return count({ kind: "spellsCastThisTurn", eventPlayer: true });
  // Magebane Lizard: "the number of noncreature spells they've cast this turn", that one included (it's cast by now).
  if (ctx?.eventPlayer && (m = /^((?:instant|sorcery|creature|noncreature|artifact|enchantment)(?: (?:and|or) (?:instant|sorcery|creature|artifact|enchantment))?) spells (?:they've|that player has) cast this turn$/i.exec(p))) {
    const filter = parseSearchFilter(`${m[1]!.replace(/ and /, " or ")} card`);
    return filter ? count({ kind: "spellsCastThisTurn", filter, eventPlayer: true }) : null;
  }
  // Sentinel Tower: "the number of instant and sorcery spells cast before that spell this turn", in a cast trigger: every
  // player's, only those cast before the spell the trigger is about (copies weren't cast, CR 707.10), however many are
  // cast after it before this resolves.
  if (ctx?.castSpell && /^instant and sorcery spells cast before that spell this turn$/i.test(p)) {
    const filter = parseSearchFilter("instant or sorcery card");
    return filter ? count({ kind: "spellsCastThisTurn", filter, anyone: true, beforeCause: true }) : null;
  }
  // "Instant and sorcery spells you've cast this turn" (Rionya, Fire Dancer): copies aren't cast (CR 707.10).
  // "For each other instant and sorcery spell you've cast this turn" (Lock and Load, a spell): not its own cast.
  if ((m = /^(other )?((?:instant|sorcery|creature|noncreature|artifact|enchantment)(?: (?:and|or) (?:instant|sorcery|creature|artifact|enchantment))?) spells? you've cast this turn$/i.exec(p)) && (!m[1] || (each && ctx?.spell))) {
    const filter = parseSearchFilter(`${m[2]!.replace(/ and /, " or ")} card`);
    return filter ? count({ kind: "spellsCastThisTurn", filter, ...(m[1] ? { other: true as const } : {}) }) : null;
  }
  if ((m = /^the total mana value of (other )?spells you've cast this turn$/i.exec(p))) return count({ kind: "manaValueCastThisTurn", ...(m[1] ? { other: true as const } : {}) });
  // Rootha, Mastering the Moment: "the greatest mana value among instant and sorcery spells you've cast this turn", each as
  // it was cast (CR 202.3e).
  if (!each && (m = /^the greatest mana value among (instant and sorcery|instant|sorcery|creature|noncreature) spells you've cast this turn$/i.exec(p))) {
    const filter = parseSearchFilter(`${m[1]!.replace(/ and /, " or ")} card`);
    return filter ? count({ kind: "manaValueCastThisTurn", greatest: true, filter }) : null;
  }
  // "For each creature it devoured" (CR 702.82b): only the permanent's own abilities know what it devoured.
  if (/^creatures? (?:it|~) devoured$/i.test(p) && (ctx === null || ctx.selfIt)) return count({ kind: "devoured" });
  // Voracious Dragon: "the number of Goblins it devoured": each creature it devoured that was a Goblin as it last existed on
  // the battlefield (rulings).
  if ((m = /^([A-Z][a-z]+)s (?:it|~) devoured$/.exec(p)) && (ctx === null || ctx.selfIt)) return count({ kind: "devoured", subtype: m[1]! });
  if (/^times ~ has mutated$/i.test(p)) return count({ kind: "mutations" });
  // Spiny Starfish: "for each time it regenerated this turn": the permanent's own abilities only.
  if (each && (m = /^time (it|~) regenerated this turn$/i.exec(p)) && ctx && !ctx.subject && !ctx.subjectIt && (m[1] === "~" || ctx.selfIt || ctx.lastObjectTarget === undefined)) return count({ kind: "regenerations" });
  // Converge: "the number of colors of mana spent to cast this spell", "for each color of mana spent to cast it".
  // "It" is the object itself only where nothing else can be "it" (not "whenever you cast a spell").
  // Wildgrowth Archaic: "whenever you cast a creature spell, ... where X is the number of colors of mana spent to cast
  // it": that spell's.
  if (/^colou?rs? of mana spent to cast it$/i.test(p) && ctx?.castSpell && !ctx.selfIt && !ctx.spell) return count({ kind: "colorsSpent", of: { ref: "castSpell" } });
  if ((m = /^colou?rs? of mana spent to cast (~|it)$/i.exec(p)) && (m[1] === "~" || ctx === null || ctx.selfIt || ctx.spell)) return count({ kind: "colorsSpent" });
  // "For each mana from a Treasure spent to cast it" (CR 106.3): the spell's, or its permanent's enters trigger's (compile
  // checks it's one of those).
  // "For each mana from Treasures spent to activate this ability" (Mr. House): an activated ability's own.
  if (each && /^mana from Treasures spent to activate this ability$/i.test(p) && ctx?.activated) return count({ kind: "treasureSpent", activated: true });
  if ((m = /^mana from a Treasure (?:that was )?spent to cast (~|it)$/i.exec(p)) && ctx !== null && (ctx.spell || (ctx.selfIt && m[1] === "it"))) return count({ kind: "treasureSpent" });
  // Cataclysmic Prospecting: "for each mana from a Desert spent to cast this spell": the spell's own.
  if (/^mana from a Desert spent to cast ~$/i.test(p) && ctx?.spell) return count({ kind: "spentFrom", origin: "desert" });
  // "For each {S} spent to cast ~", "the amount of {S} spent to cast ~" (CR 107.4h): the spell's, or its permanent's
  // enters trigger's (compile checks it's one of those).
  if ((m = /^(?:the )?(?:amount of )?\{S\} spent to cast (~|it)$/i.exec(p)) && ctx !== null && (ctx.spell || (ctx.selfIt && m[1] === "it") || m[1] === "~")) return count({ kind: "snowSpent" });
  // Bladecoil Serpent, Clay Champion: "for each {U}{U} spent to cast it (this creature)": whole pairs of that color, the
  // spell's or its permanent's (compile checks it's one of those, CR 601.2h).
  if (each && (m = /^\{([WUBRG])\}\{\1\} spent to cast (~|it)$/.exec(p)) && ctx !== null && (ctx.spell || ctx.selfIt || m[2] === "~")) return count({ kind: "spentPairs", color: m[1] as Color });
  // Blood Tyrant: "each player loses 1 life. Put a +1/+1 counter on ~ for each 1 life lost this way": what its loseLife
  // took off life totals, every player's (rulings: yours too).
  if (each && /^1 life lost this way$/i.test(p) && ctx !== null) return count({ kind: "lifeLostThisWay", byLoss: true });
  // Multikicker: "for each time it was kicked", "the number of times ~ was kicked" (CR 702.33d).
  if (/^times? (?:~|it) was kicked$/i.test(p)) return count({ kind: "kicked" });
  // "For each of that spell's colors" in a cast trigger (Ramos, Dragon Engine).
  if (/^of that spell's colors$/i.test(p) && ctx?.castSpell) return count({ kind: "castSpellColors" });
  // Tablet of the Guilds: "for each of the chosen colors that spell is".
  if (/^of the chosen colors that spell is$/i.test(p) && ctx?.castSpell) return count({ kind: "castSpellChosenColors" });
  // Rumbling Aftershocks: "the number of times that spell was kicked", in a cast trigger.
  if (/^times that spell was kicked$/i.test(p) && ctx?.castSpell) return count({ kind: "castSpellKicked" });
  // Civic Saber: "Equipped creature gets +1/+0 for each of its colors" (a static ability: the permanent it applies to,
  // colors as layer 5 left them, CR 613.4).
  if (each && ctx === null && /^of its colors$/i.test(p)) return count({ kind: "affectedColors" });
  // Breathe Your Last: "Destroy target creature or planeswalker. You gain 1 life for each of its colors."
  if (/^of its colors$/i.test(p) && ctx?.lastObjectTarget !== undefined) {
    const of = whoseObject("its", ctx);
    return of && count({ kind: "colorsOf", of });
  }
  // "Your Ring-bearer's power" (One Ring to Rule Them All): 0 without one (CR 701.54a, 107.1b).
  if ((m = /^your Ring-bearer's (power|toughness)$/.exec(p))) return count({ kind: m[1] as "power" | "toughness", of: { ref: "ringBearer" } });
  // Ninja's Blades: "draw a card, then discard a card. That player loses life equal to the discarded card's mana value."
  // Pyromancy: "equal to the mana value of the discarded card" (a discard cost's card, X counted as 0, rulings).
  if (/^(?:the discarded card's mana value|the mana value of the discarded card)$/i.test(p) && ctx) return count({ kind: "discardedManaValue" });
  // Nahiri's Wrath: "the total mana value of the discarded cards", those its "discard X cards" cost discarded, each as it is
  // in the graveyard (StackItem.costDiscarded).
  if (/^the total mana value of the discarded cards$/i.test(p) && ctx?.spell) return count({ kind: "discardedManaValue" });
  // Morbid Curiosity: "the mana value of the sacrificed permanent" is "the sacrificed permanent's mana value".
  if ((m = /^the (power|toughness|mana value) of the sacrificed (creature|artifact|enchantment|permanent)$/i.exec(p))) p = `the sacrificed ${m[2]}'s ${m[1]}`;
  // Ellie and Alan, Paleontologists: "where X is the mana value of the exiled card" is "the exiled card's mana value".
  if ((m = /^the (power|toughness|mana value) of the exiled card$/i.exec(p))) p = `the exiled card's ${m[1]}`;
  // Havoc Eater: "for each opponent, goad up to one target creature that player controls. Put X +1/+1 counters on ~, where
  // X is the total power of creatures goaded this way": the targets still there as it resolves.
  if (/^the total power of creatures goaded this way$/.test(p) && ctx?.lastTargets && ctx.targets[ctx.lastTargets.index]?.perOpponent && ctx.targets[ctx.lastTargets.index]?.types?.includes("Creature")) return count({ kind: "totalPowerOf", of: { ref: "target", ...ctx.lastTargets } });
  // Goliath Hatchery: "its total toxic value" (CR 702.164b), of the creature chosen just before.
  if ((m = /^(its|that creature's) total toxic value$/.exec(p))) {
    const of = whoseObject(m[1]!, ctx);
    return of && count({ kind: "toxicValue", of });
  }
  // Power, toughness, mana value: "~'s power", "its power", "that creature's toughness".
  if ((m = /^(~'s|its|equipped creature's|enchanted creature's|that creature's|that land's|that artifact's|that enchantment's|the creature's|that permanent's|that spell's|the spell's|that card's|the exiled card's|the sacrificed (?:creature|artifact|enchantment|permanent)'s|the exiled creature's|the revealed card's|the amassed Army's) (power|toughness|mana value)$/i.exec(p))) {
    const of = whoseObject(m[1]!, ctx);
    const kind = m[2]!.toLowerCase() === "mana value" ? "manaValue" : (m[2]!.toLowerCase() as "power" | "toughness");
    if (of?.ref === "castSpell" && kind !== "manaValue" && !/^that spell's$/i.test(m[1]!)) return null;
    return of && count({ kind, of });
  }
  // Whipkeeper: "~ deals damage to target creature equal to the damage already dealt to it this turn".
  if (/^the damage already dealt to it this turn$/.test(p)) {
    const of = whoseObject("its", ctx);
    return of?.ref === "target" ? count({ kind: "damageDealtToThisTurn", of }) : null;
  }
  // Tangled Colony: "When ~ dies, create X ... tokens ..., where X is the amount of damage dealt to it this turn": the
  // permanent it was (CR 400.7), all the damage dealt to it this turn (TurnLog.damageDealtTo).
  // Blazing Effigy: "3 plus the amount of damage dealt to ~ this turn by other sources named ~".
  if (/^the amount of damage dealt to ~ this turn by other sources named ~$/.test(p)) return count({ kind: "damageDealtToThisTurn", of: { ref: "self" }, byOtherNamed: true });
  // Grothama, All-Devouring: "each player draws cards equal to the amount of damage dealt to ~ this turn by sources they
  // controlled": each player's own (PlayerRef eachOne), by sources that player controlled as they dealt it (TurnLog.damageDealtTo).
  if (/^the amount of damage dealt to ~ this turn by sources they controlled$/.test(p)) return count({ kind: "damageDealtToThisTurn", of: { ref: "self" }, byEachOne: true });
  if (/^the amount of damage dealt to it this turn$/.test(p)) {
    const of = whoseObject("its", ctx);
    return of?.ref === "self" || of?.ref === "target" ? count({ kind: "damageDealtToThisTurn", of }) : null;
  }
  // "The difference between that creature's power and its toughness" (Jaws of Defeat): the larger less the smaller
  // (rulings).
  // Doran, Besieged by Time: "the difference between its power and toughness".
  if ((m = /^the difference between (~'s|its|that creature's) power and (?:its )?toughness$/i.exec(p))) {
    const of = whoseObject(m[1]!, ctx);
    return of && count({ kind: "absDifference", of: [{ kind: "power", of }, { kind: "toughness", of }] });
  }
  // "Where X is ~'s loyalty" (Nissa, Ascended Animist): a planeswalker's loyalty is its loyalty counters (CR 306.5b), as
  // it last existed if it's gone (rulings).
  if (/^~'s loyalty$/.test(p)) return count({ kind: "counters", counter: "loyalty", of: { ref: "self" } });
  // "The amount of mana spent to cast that spell" (Mana Sculpt): the targeted spell's, as it last existed on the stack.
  if ((m = /^(?:the )?amount of mana spent to cast that spell$/.exec(p))) {
    const of = whoseObject("that spell's", ctx);
    // Manaform Hellkite: in "whenever you cast" the spell cast, the mana actually spent on it (rulings: 0 if none was).
    if (of?.ref === "castSpell") return count({ kind: "eventAmount" });
    return of?.ref === "target" ? count({ kind: "manaSpentOn", of }) : null;
  }
  // "The amount of mana spent to cast this spell" (Memory Deluge, Toph): the spell's own, or in its own enters trigger the
  // spell the permanent was (0 if it wasn't cast, rulings), or in "when you cast this spell" (Prossh) the spell's (CR 601.2h).
  if (/^(?:the )?amount of mana spent to cast (?:this spell|this creature|~|it|her|him|them)$/.test(p)) {
    return ctx?.spell || ctx?.selfEntered || ctx?.selfCastSpell ? count({ kind: "manaSpent" }) : null;
  }
  // "For each counter on ~" (Twitching Doll): every kind. Parting Thoughts: "the number of counters on that creature",
  // every kind (rulings), the target as it last existed if it's gone (CR 608.2h).
  // Dismantle: "that artifact", the target as it last existed.
  if ((m = /^counters? on (~|it|that creature|that artifact)$/.exec(p))) {
    const of = whoseObject(m[1] === "~" ? "~'s" : m[1] === "it" ? "its" : `${m[1]}'s`, ctx);
    return of && count({ kind: "counters", counter: ANY_COUNTER, of });
  }
  // Blitzball Stadium's granted "draw a card for each kind of counter on it": the kinds it has, each once (CR 122.1).
  if (each && (m = /^kind of counter on (~|it)$/.exec(p))) {
    const of = whoseObject(m[1] === "~" ? "~'s" : "its", ctx);
    return of && count({ kind: "counters", counter: ANY_COUNTER, of, kinds: true });
  }
  // Flesh // Blood: "where X is the power of the card you exiled": the one card targeted, as it last existed in the
  // graveyard (rulings), as Lobelia's "the exiled card's power".
  if ((m = /^the (power|toughness) of the card you exiled$/.exec(p)) && ctx) {
    const of = whoseObject("the exiled card's", ctx);
    return of?.ref === "target" ? count({ kind: m[1] as "power" | "toughness", of }) : null;
  }
  // Death's Presence: "where X is the power of the creature that died": the trigger's subject as it last existed on the
  // battlefield (rulings, CR 603.10a).
  if ((m = /^the (power|toughness) of the creature that died$/.exec(p)) && ctx?.subjectIt) return count({ kind: m[1] as "power" | "toughness", of: { ref: "subject" } });
  // Felisa, Fang of Silverquill: "where X is the number of counters it had on it", the creature that died: every kind
  // (rulings), as it last existed on the battlefield (CR 603.10a, 608.2h).
  if (/^counters it had on it$/.test(p) && ctx?.subjectIt) {
    const of = whoseObject("its", ctx);
    return of?.ref === "subject" ? count({ kind: "counters", counter: ANY_COUNTER, of }) : null;
  }
  // "Charge counter on ~", "+1/+1 counters on it". Archery Training: "arrow counters on Archery Training" in an ability it
  // gives, that Aura.
  if ((m = new RegExp(`^${COUNTER} counters? on (~|it|that creature|\u27easource\u27eb)$`).exec(p))) {
    const of = m[2] === "\u27easource\u27eb" ? ({ ref: "grantSource" } as const) : whoseObject(m[2] === "~" ? "~'s" : m[2] === "it" ? "its" : "that creature's", ctx);
    return of && count({ kind: "counters", counter: counterKind(m[1]!), of });
  }
  // "The number of +1/+1 counters on lands you control" (Toph, the Blind Bandit), "counters on permanents you control"
  // (Hydra Trainer): the counters on those permanents added up.
  // "Counters among artifacts and creatures you control" (Lux Artillery): each permanent that's either, once.
  // Ferrafor, Young Yew: "counters among creatures target player controls": that player's.
  // Deepwood Denizen: "for each +1/+1 counter on creatures you control", the same.
  // Bioessence Hydra: "for each loyalty counter on planeswalkers you control", the same. Jace, Reality Sculptor: "loyalty
  // counters among Jaces you control", Jace planeswalkers, tokens or not.
  // Gleam of Authority: "for each +1/+1 counter on other creatures you control" (an Aura's: other than the enchanted
  // creature, statics.ts ofAffected); Ascendant Acolyte: "among other creatures you control".
  if ((m = new RegExp(`^(?:${COUNTER} )?counter${each ? "s?" : "s"} (?:on|among) ((?:other )?(?:creatures|lands|permanents|artifacts|planeswalkers|artifacts and creatures|Sagas|Jaces) (?:you control|target player controls))$`).exec(p))) {
    const c = parseCount(m[2]!.replace(/^artifacts and creatures /, "artifacts or creatures "), ctx, each);
    return c && typeof c === "object" && "count" in c && c.count.kind === "permanents" && !c.count.differentNames ? { count: { ...c.count, counter: m[1] ? counterKind(m[1]) : ANY_COUNTER } } : null;
  }
  // "Cards put into enchanted player's graveyard from anywhere this turn" (Fraying Sanity): tokens aren't cards.
  if ((m = /^cards? put into (your|their|that player's|enchanted player's) graveyard from anywhere this turn$/i.exec(p))) {
    const whose = whosePlayer(m[1]!, ctx);
    return whose && count({ kind: "cardsToGraveyardThisTurn", whose });
  }
  // Cruel Calculations: "the number of cards that were put into target player's graveyard from their library this turn":
  // milled or otherwise, owned by that player (a card goes to its owner's graveyard, CR 404.2), tokens aren't cards.
  if ((m = /^cards? (?:that were )?put into (target player's) graveyard from their library this turn$/i.exec(p))) {
    const whose = whosePlayer(m[1]!, ctx);
    return whose && count({ kind: "cardsToGraveyardThisTurn", whose, fromLibrary: true });
  }
  // Welcome the Dead: "cards that were put into your graveyard from your hand or library this turn": cards, not tokens.
  if ((m = /^cards? (?:that were )?put into your graveyard from your hand or library this turn$/i.exec(p)))
    return count({ kind: "cardsToGraveyardThisTurn", whose: { ref: "you" }, fromHandOrLibrary: true });
  // "Aura attached to it", "Equipment attached to ~": only the permanent's own.
  // "Aura and Equipment attached to it" (Champion of the Flame): one of either.
  if ((m = /^(Aura|Equipment|Aura and Equipment)s? attached to (it|~)$/i.exec(p)) && (ctx === null || ctx.selfIt || /~/.test(m[2]!)))
    return count({ kind: "attachedToSelf", subtypes: /and/.test(m[1]!) ? ["Aura", "Equipment"] : [capital(m[1]!.toLowerCase()) === "Aura" ? "Aura" : "Equipment"] });
  // Lunar Insight: "for each different mana value among nonland permanents you control".
  if (each && (m = /^different mana value among (.+?) you control$/i.exec(p))) {
    const c = parseCount(`${m[1]} you control`, ctx);
    return c && typeof c === "object" && "count" in c && c.count.kind === "permanents" && !c.count.other && !c.count.counter ? { count: { ...c.count, differentManaValues: true } } : null;
  }
  // Golden Ratio: "for each different power among creatures you control": each power once, as the creatures have it.
  if (each && (m = /^different power among (creatures) you control$/i.exec(p))) {
    const c = parseCount(`${m[1]} you control`, ctx);
    return c && typeof c === "object" && "count" in c && c.count.kind === "permanents" && !c.count.other && !c.count.counter ? { count: { ...c.count, differentPowers: true } } : null;
  }
  // "Differently named lands you control" (Awakened Amalgam), "differently named artifact tokens you control" (Gimbal).
  if ((m = /^differently named (.+?) you control$/i.exec(p))) {
    const c = parseCount(`${m[1]} you control`, ctx, each);
    return c && typeof c === "object" && "count" in c && c.count.kind === "permanents" && !c.count.other ? { count: { ...c.count, differentNames: true, filter: { ...c.count.filter, text: `differently named ${c.count.filter.text}` } } } : null;
  }
  // Permanents: "creature you control", "other Elf you control", "land on the battlefield", "artifacts your opponents control".
  // "Nontoken creatures you control that entered this turn" (Tromell, Seymour's Butler): ones that entered this turn.
  // "Creatures target player controls" (Will of the Mardu), "that player controls": that player's permanents; "... that
  // didn't attack this turn" (Kratos, God of War).
  // "Damage to defending player equal to the number of artifacts they control" (Generous Plunderer): the defending player's.
  if (ctx?.defending) p = p.replace(/ (?:they control|defending player controls)$/, " that player controls");
  // "Target player draws X cards and loses X life, where X is the number of creatures they control of the chosen type"
  // (Pact of the Serpent): the player targeted.
  else if (ctx?.lastPlayerTarget !== undefined && !ctx.eventPlayer) p = p.replace(/ they control( of the chosen type)?$/, " that player controls$1");
  // Zedruu the Greathearted: "the number of permanents you own that your opponents control" (CR 108.3, 108.4).
  if ((m = /^([a-z]+) you own that your opponents control$/i.exec(p))) {
    const spec = parseTargetPhrase(`${singularWord(m[1]!)} an opponent controls`, { chosen: true });
    return spec?.kind === "object" && !spec.owner ? count({ kind: "permanents", filter: { ...spec, owner: "you", text: p } }) : null;
  }
  if ((m = /^(other )?(.+?) (you control|on the battlefield|your opponents control|an opponent controls|target player controls|target opponent controls|that player controls|that opponent or that planeswalker's controller controls|the chosen player controls|those players control|those opponents control|enchanted creature's controller controls|that creature's controller controls)(?: ((?:with|of the chosen|of that|that aren't|that's attached to|that are attached to|that entered) .+|that didn't attack this turn))?$/i.exec(p))) {
    const words = m[2]!.split(/\s+/).map(singularWord).join(" ");
    const who = m[3]!.toLowerCase();
    const theirs = /^(target|that|those|the chosen|enchanted creature's) /.test(who);
    const suffix = who === "you control" ? " you control" : who === "on the battlefield" || theirs ? "" : " an opponent controls";
    const spec = parseTargetPhrase(`${words}${suffix}${m[4] ? ` ${m[4]}` : ""}`, { chosen: true });
    if (spec?.kind !== "object") return null;
    const whose = theirs ? whosePlayer(who.replace(/ controls$/, "'s").replace(/^(those \w+) control$/, "$1'"), ctx) : undefined;
    if (whose === null) return null;
    return count({ kind: "permanents", filter: { ...spec, text: `${m[1] ?? ""}${m[2]} ${m[3]}${m[4]?.startsWith("that entered") ? ` ${m[4]}` : ""}` }, ...(m[1] ? { other: true } : {}), ...(whose ? { whose } : {}) });
  }
  // "The number of creatures attacking you" (Arachnogenesis): attacking you, not your planeswalkers (CR 506.3).
  if (/^creatures? attacking you$/i.test(p)) return count({ kind: "permanents", filter: { kind: "object", types: ["Creature"], combat: "attackingYou", text: p } });
  // "Each opponent loses life equal to the number of creatures attacking them" (Within Range): each that player's own,
  // attacking them and not their planeswalkers (CR 506.3).
  if (ctx?.eachOne && /^creatures? attacking (?:them|that player)$/i.test(p)) return count({ kind: "permanents", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], combat: "attacking", text: p }, attackingWho: { ref: "eachOne" } });
  // "attacking creature", "tapped creature": any controller. "Other attacking creatures" (Ghalta and Mavren): not the
  // object with the ability.
  // Cybermat: "the number of attacking artifact creatures", any controller's. Siani, Eye of the Storm: "the number of
  // attacking creatures with flying". Sophina, Spearsage Deserter: "for each nontoken attacking creature".
  if ((m = /^(other )?(nontoken )?(attacking|blocking|tapped) ((?:artifact |enchantment )?creatures?)( with flying)?$/i.exec(p))) {
    const spec = parseTargetPhrase(`${m[2] ?? ""}${m[3]} ${m[4]!.replace(/s$/, "")}${m[5] ?? ""}`);
    return spec?.kind === "object" ? count({ kind: "permanents", filter: { ...spec, text: p }, ...(m[1] ? { other: true } : {}) }) : null;
  }
  // Shared Animosity: "it gets +1/+0 until end of turn for each other attacking creature that shares a creature type with
  // it", "it" the attacker the trigger is about (counted as it resolves, CR 608.2h).
  if ((m = /^other (attacking|blocking) creatures? that shares? a creature type with it$/i.exec(p)) && ctx?.subjectIt) {
    const spec = parseTargetPhrase(`${m[1]} creature`);
    return spec?.kind === "object" ? count({ kind: "permanents", filter: { ...spec, text: p }, sharesTypeWithSubject: true }) : null;
  }
  // Hateful Eidolon: "draw a card for each Aura you controlled that was attached to it", after "an enchanted creature dies".
  if (/^Auras? you controlled that (?:was|were) attached to it$/.test(p) && ctx?.subjectIt) return count({ kind: "aurasYouControlledAttached" });
  // Titan of Littjara: "for each other creature you control that shares a creature type with it", "it" being ~.
  if (/^other creatures? you control that shares? a creature type with (?:it|~)$/i.test(p) && ctx?.selfIt) return count({ kind: "permanents", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: p }, other: true, sharesTypeWithSource: true });
  // Mana Echoes: "the number of creatures you control that share a creature type with it", "it" the creature the trigger
  // is about, which counts too if you control it (rulings), counted as it resolves.
  if (/^creatures you control that share a creature type with it$/i.test(p) && ctx?.subjectIt) return count({ kind: "permanents", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: p }, sharesTypeWithSubject: true, includeSubject: true });
  // "Whenever ~ attacks, it gets +2/+0 until end of turn for each other attacking Goblin" (Goblin Piledriver): "other"
  // is the permanent itself, so only in its own abilities.
  // Márton Stromgald: "for each attacking creature other than ~", the same count.
  if ((m = /^other (attacking|blocking) (.+)$/i.exec(p) ?? /^(attacking|blocking) (\w+) other than ~$/i.exec(p)) && ctx?.selfIt) {
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
  // Sewer Nemesis, Nyxathid, Black Vise: the player chosen as the permanent entered ("As ~ enters, choose an opponent",
  // CR 614.12; compile checks it has one), counted in its static and triggered abilities alike.
  if (x === "the chosen player's") return { ref: "selfChosenPlayer" };
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
  // Observed Stasis: "each tapped creature its controller controls", its being enchanted creature (CR 303.4).
  if (x === "enchanted creature's controller's" && !ctx.spell) return { ref: "hostController" };
  // Weight of Spires: "the number of nonbasic lands that creature's controller controls", the creature it targets (as it
  // last existed if it has left, CR 608.2h).
  if (x === "that creature's controller's" && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object") return { ref: "targetController", index: ctx.lastObjectTarget };
  if (x === "defending player's" && ctx.defending) return { ref: "eventPlayer" };
  // Goblin Lyre: "creatures that opponent or that planeswalker's controller controls": the opponent it targets, or the
  // targeted planeswalker's controller (as it last existed, CR 608.2h).
  if (x === "that opponent or that planeswalker's controller's") {
    const i = ctx.targets.length - 1;
    const t = ctx.targets[i];
    return t?.kind === "any" && t.types?.includes("Planeswalker") && !t.types.includes("Creature") ? { ref: "targetOrController", index: i } : null;
  }
  return null;
}

function whoseObject(w: string, ctx: Ctx | null): ObjRef | null {
  const x = w.toLowerCase();
  if (x === "~'s") return { ref: "self" };
  // What was sacrificed to cast the spell, as it last existed (CR 608.2h); compile() checks there's such a cost.
  if (/^the sacrificed (creature|artifact|enchantment|permanent)'s$/.test(x)) return ctx ? { ref: "sacrificed" } : null;
  // "The exiled creature's mana value" after an "Exile a creature you control" cost (Food Chain); compile() checks it has one.
  if (x === "the exiled creature's") return ctx ? { ref: "sacrificed", exiledCost: true } : null;
  // "The revealed card's power" after a "reveal a colorless creature card from your hand" cost (Titan's Presence).
  // "Target opponent reveals a card at random from their hand. Target creature gets -X/-X until end of turn, where X is
  // the revealed card's mana value" (Planeswalker's Scorn): that card.
  if (x === "the revealed card's" && ctx?.revealedTop) return { ref: "revealed" };
  if (x === "the revealed card's") return ctx ? { ref: "sacrificed", revealedCost: true } : null;
  // A reflexive trigger after "you may sacrifice another creature": that creature, as it last existed (CR 608.2h).
  if (x === "that creature's" && ctx?.sacrificedIt) return { ref: "sacrificed" };
  // "Where X is the amassed Army's power" (CR 701.47c), after amassing.
  if (x === "the amassed army's") return ctx?.amassed ? { ref: "amassed" } : null;
  // "Where X is equipped creature's power" (Glamdring, Foe-hammer): the permanent the source is attached to.
  if (x === "equipped creature's" || x === "enchanted creature's") return { ref: "attached" };
  if (!ctx) return x === "its" ? { ref: "self" } : null;
  // "That spell's mana value": the targeted spell (Imp's Mischief).
  // With a target that isn't a spell, in a cast trigger, the spell cast (Dancing from Dark to Dawn), below.
  if ((x === "that spell's" || x === "the spell's") && ctx.lastObjectTarget !== undefined && !(x === "that spell's" && ctx.castSpell && ctx.targets[ctx.lastObjectTarget]?.kind !== "spell")) return ctx.targets[ctx.lastObjectTarget]?.kind === "spell" ? { ref: "target", index: ctx.lastObjectTarget } : null;
  // "Return target card from your graveyard to your hand. You gain life equal to that card's mana value": the card
  // targeted, wherever it went (Healing Technique, Razor Hippogriff).
  // "Exile the top card of your library. ~ gets +X/+0 until end of turn, where X is that card's mana value" (Tavern Brawler).
  if ((x === "that card's" || x === "the exiled card's") && ctx.exiledTop) return { ref: "exiledTop" };
  // Corpse Lunge: "the exiled card's power" after an "exile a creature card from your graveyard" cost, with no card
  // targeted (Lobelia's, below); compile() checks it has that cost.
  if (x === "the exiled card's" && !ctx.targets.some((t) => t.kind === "card")) return { ref: "sacrificed", exiledCost: true };
  if (x === "that card's" && ctx.revealedTop) return { ref: "revealed" };
  if (x === "that card's" && ctx.chosenFromYard) return { ref: "chosenFromYard" };
  // Pyretic Rebirth: "... ~ deals damage equal to that card's mana value to up to one target creature": the one card targeted.
  // Lobelia Sackville-Baggins: "exile target creature card from an opponent's graveyard ..., then create X Treasure
  // tokens, where X is the exiled card's power": that card, as it last existed in the graveyard (rulings).
  if (x === "that card's" || x === "the exiled card's") {
    const cards = ctx.targets.flatMap((t, i) => (t.kind === "card" ? [i] : []));
    return cards.length === 1 && ctx.targets.every((t) => t.kind === "card" || t.kind === "object" || t.kind === "any") ? { ref: "target", index: cards[0]! } : null;
  }
  // In a cast trigger, the spell cast ("discover X, where X is that spell's mana value").
  // Dovescape: "where X is the spell's mana value", the same.
  if (x === "that spell's" || x === "the spell's") return ctx.castSpell ? { ref: "castSpell" } : null;
  // "Whenever you cast a spell, you lose life equal to its mana value" (Teval, Arbiter of Virtue): in a cast trigger's
  // first sentence with no target, "it" is the spell cast.
  if (x === "its" && ctx.castSpell && ctx.spellIt && !ctx.targets.length && !ctx.selfIt) return { ref: "castSpell" };
  // Earthshape: "Earthbend 3. Then each creature you control with power less than or equal to that land's power ...": the
  // one land targeted, as it is when that's checked (after earthbending made it a creature).
  if (x === "that land's") {
    const lands = ctx.targets.flatMap((t, i) => (t.kind === "object" ? [i] : []));
    return lands.length === 1 && ctx.targets[lands[0]!]!.kind === "object" && ctx.targets[lands[0]!]!.types?.length === 1 && ctx.targets[lands[0]!]!.types![0] === "Land" ? { ref: "target", index: lands[0]! } : null;
  }
  // "The creature's power" after "that creature's controller" (Boros Fury-Shield): the creature targeted.
  if (x === "the creature's") return ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" ? { ref: "target", index: ctx.lastObjectTarget } : null;
  // "Destroy target artifact. ... where X is that artifact's mana value" (Artifact Mutation): the target, as it last existed.
  // "Destroy target enchantment. ... that enchantment's mana value" (Aura Mutation): the same.
  if (x === "that artifact's" || x === "that enchantment's") {
    const type = x === "that artifact's" ? "Artifact" : "Enchantment";
    return ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && ctx.targets[ctx.lastObjectTarget]!.types?.includes(type) ? { ref: "target", index: ctx.lastObjectTarget } : null;
  }
  // Goliath Hatchery: "choose a creature you control, then draw cards equal to its total toxic value": the one chosen.
  if ((x === "its" || x === "that creature's") && ctx.lastChosen && ctx.lastObjectTarget === undefined) return { ref: "created" };
  if (x === "its" || x === "that creature's" || x === "that permanent's") {
    if (ctx.lastObjectTarget !== undefined) return { ref: "target", index: ctx.lastObjectTarget };
    if ((x === "that creature's" && ctx.subject) || ctx.subjectIt) return { ref: "subject" };
    // Queen's Bay Paladin: "return up to one target Vampire card from your graveyard to the battlefield ... You lose life
    // equal to its mana value": the one card targeted, not the permanent with the ability.
    if (x === "its" && !ctx.spell && ctx.targets.length === 1 && ctx.targets[0]!.kind === "card" && !ctx.targets[0]!.many && (ctx.targets[0]!.types?.includes("Creature") || ctx.targets[0]!.subtypes?.length)) return { ref: "target", index: 0 };
    // The permanent itself; after it left the battlefield, as it last existed (CR 608.2h).
    if (x === "its" && (ctx.selfIt || ctx.selfCard || ctx.activated)) return { ref: "self" };
    // "Return target creature card from your graveyard to the battlefield. You gain life equal to that creature's
    // toughness" (Cleric Class): the card targeted, as the permanent it became (rulings).
    // Death: "Return target creature card from your graveyard to the battlefield. You lose life equal to its mana value."
    if ((x === "that creature's" || (x === "its" && ctx.spell)) && ctx.targets.length === 1 && ctx.targets[0]!.kind === "card" && ctx.targets[0]!.types?.includes("Creature")) return { ref: "target", index: 0 };
  }
  return null;
}

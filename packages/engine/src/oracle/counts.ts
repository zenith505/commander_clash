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
  p = p.replace(/^the (power|toughness|mana value) of (that spell|that creature|that card|~)$/, "$2's $1");
  // Thundering Raiju: "the number of modified creatures you control other than this creature" is "the number of other
  // modified creatures you control".
  p = p.replace(/^(the number of )?(?!other )([a-z ]+? creatures?) you control other than ~$/, "$1other $2 you control");
  let m: RegExpExecArray | null;
  // Unlicensed Hearse: "the number of cards exiled with it" ("with ~"), the cards its one exile ability exiled (CR 607.2a,
  // linked by compile.ts).
  if (/^the number of cards exiled with (?:it|~)$/.test(p)) return { count: { kind: "linkedExiled" } };
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
  if (each && (m = /^((?:other )?)creature you control named ~$/.exec(p))) return parseCount(`the number of ${m[1]}creatures you control named ~`, ctx);
  // Hare Apparent: "the number of other creatures you control named ~": with the source's name (CR 201.5), as it is now.
  if ((m = /^(the number of (?:other )?creatures you control) named ~$/.exec(p))) {
    const c = parseCount(m[1]!, ctx);
    if (!c || !("count" in c) || c.count.kind !== "permanents" || c.count.filter.named !== undefined) return null;
    return { ...c, count: { ...c.count, filter: { ...c.count.filter, named: "~", text: `${c.count.filter.text} named ~` } } };
  }
  // "Each opponent sacrifices a creature of their choice. Create a Food token for each creature sacrificed this way."
  // (Voracious Fell Beast): the permanents this ability's sacrifice took.
  if (ctx && ((each && /^creature sacrificed this way$/.test(p)) || /^the number of creatures sacrificed this way$/.test(p))) return { count: { kind: "sacrificedThisWayCount" } };
  if (ctx?.milledThisWay && /^the total mana value of those cards$/i.test(p)) return { count: { kind: "milledManaValue" } };
  // "Exiles the top four cards of their library and ~ deals damage equal to the total mana value of those exiled cards"
  // (Ensnared by the Mara): the cards it exiled, a card with {X} in its mana cost counting 0 (CR 202.3e).
  if (/^the total mana value of those exiled cards$/i.test(p)) return { count: { kind: "exiledTopManaValue" } };
  // Iridescent Hornbeetle: "for each +1/+1 counter you've put on creatures under your control this turn", as they were
  // put, even on creatures that have left since (rulings).
  if (each && /^\+1\/\+1 counter you've put on creatures under your control this turn$/.test(p)) return { count: { kind: "plusOnesPutThisTurn", byYou: true, onYours: true, creature: true } };
  // "The number of experience counters you have", "for each experience counter you have" (CR 122.1).
  if ((each && /^experience counter you have$/i.test(p)) || /^the number of experience counters you have$/i.test(p)) return { count: { kind: "experience", who: { ref: "you" } } };
  // "Each creature your opponents control gets -1/-1 until end of turn for each poison counter its controller has" (Phyresis
  // Outbreak): each creature's own controller's (Count affectedControllerPoison).
  if (each && /^poison counter its controller has$/i.test(p)) return { count: { kind: "affectedControllerPoison" } };
  // Phyrexian Swarmlord: "for each poison counter your opponents have", together.
  if ((each && /^poison counter your opponents have$/i.test(p)) || /^the number of poison counters your opponents have$/i.test(p)) return { count: { kind: "poison", who: { ref: "eachOpponent" } } };
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
  // Prophet of the Scarab: "the number of Zombies you control or the number of Zombie cards in your graveyard, whichever
  // is greater".
  if ((m = /^(the number of .+?) or (the number of .+), whichever is greater$/i.exec(p))) {
    const [a, b] = [parseCount(m[1]!, ctx), parseCount(m[2]!, ctx)];
    return a && b && !a.times && !a.plus && !b.times && !b.plus && !a.half && !b.half ? { count: { kind: "greater", of: [a.count, b.count] } } : null;
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
  // Shriekwood Devourer: "the greatest power among those creatures": the attackers of the trigger's event, those still on
  // the battlefield as it resolves (rulings).
  if (!each && /^the greatest power among those creatures$/i.test(p) && ctx?.lastGroup && "ref" in ctx.lastGroup && ctx.lastGroup.ref === "eventGroup")
    return { count: { kind: "greatestPower", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "those creatures" }, inEventGroup: true } };
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
  // "Draw a card for each counter removed this way" (Nexus Mentality, after "remove all counters").
  if (each && /^counter removed this way$/i.test(p)) return { count: { kind: "countersRemovedThisWay" } };
  // After "Remove all +1/+1 counters from ~" paid as a cost (StackItem.countersRemoved): "for each +1/+1 counter removed
  // this way" (Vish Kal), "the number of charge counters removed this way" (Geometric Nexus), "for each five counters
  // removed this way" (Sage of Hours: each whole group of five).
  if (ctx?.activated && each && (m = /^(?:(five) counters|(?:(?:[+-]1\/[+-]1|[a-z]+) )?counter) removed this way$/i.exec(p))) return { count: { kind: "countersRemovedThisWay" }, ...(m[1] ? { per: 5 } : {}) };
  if (ctx?.activated && !each && /^the number of (?:(?:[+-]1\/[+-]1|[a-z]+) )?counters removed this way$/i.test(p)) return { count: { kind: "countersRemovedThisWay" } };
  // Profane Transfusion: "where X is the difference between those players' life totals", after they exchanged them.
  if (!each && ctx?.exchanged && /^the difference between those players' life totals$/i.test(p)) return { count: { kind: "exchangedLifeDifference" } };
  // "Draw a card for each creature destroyed this way" (Decree of Pain), "for each permanent destroyed this way", "the
  // number of enchantments destroyed this way": what this spell's or ability's destroy instructions destroyed. "Incubate
  // X, where X is the number of creatures exiled this way" (Sunfall): the same.
  // Kaya's Wrath: "the number of creatures you controlled that were destroyed this way": controlled by you as they last
  // existed on the battlefield (CR 608.2h).
  if ((m = /^(?:the number of )?([a-z]+) you controlled that were (destroyed|exiled) this way$/i.exec(p))) {
    const spec = parseTargetPhrase(`${singularWord(m[1]!)} you control`, { chosen: true });
    if (spec?.kind !== "object" || spec.controller !== "you") return null;
    return { count: { kind: m[2]!.toLowerCase() === "destroyed" ? "destroyedThisWay" : "exiledThisWay", filter: { ...spec, text: `${m[1]!} you controlled` } } };
  }
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
  // "The greatest power among creature cards exiled this way" (Szat's Will, after exiling graveyards).
  if (!each && /^the greatest power among creature cards exiled this way$/i.test(p)) return { count: { kind: "greatestPowerExiled" } };
  // "You gain 1 life for each card exiled this way" (Titania's Command), "for each artifact or land card exiled this way"
  // (Canoptek Scarab Swarm), "the number of creature cards exiled this way": after exiling cards from graveyards.
  if (ctx?.exiledCards && (m = /^(?:the number of )?(?!the greatest )(?:(.+?) )?cards? exiled this way$/i.exec(p))) {
    const filter = m[1] ? parseSearchFilter(`${m[1]} card`) : undefined;
    if (filter === null || (filter && filter.kind !== "card")) return null;
    return { count: { kind: "cardsExiledThisWay", ...(filter ? { filter } : {}) } };
  }
  if (!each && /^the greatest mana value among cards in exile$/i.test(p)) return { count: { kind: "greatestMvInExile" } };
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
  if (/^cards? you've discarded this turn$/i.test(p)) return { count: { kind: "discardedThisTurn", who: { ref: "you" } } };
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
  // Clown Car: "For each odd result, create ...", "for each even result, put ..." after "roll X six-sided dice": each die's
  // own result (CR 706.2).
  if (each && /^(odd|even) result$/i.test(p)) return count({ kind: "rollParity", odd: /^odd/i.test(p) });
  // "Put a +1/+1 counter on ~ for each flip you won" (Crazed Firecat).
  // "For each flip you win, create ..." (Goblin Traprunner, after "flip three coins") too.
  if (each && /^flip you w(?:on|in)$/i.test(p)) return count({ kind: "flipsWon" });
  // Life and hands.
  if ((m = /^(your|their|that player's|target player's|target opponent's|enchanted player's) life total$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: "life", who });
  }
  // Malignus: "the highest life total among your opponents" (those still in the game).
  if (/^the highest life total among your opponents$/i.test(p)) return count({ kind: "life", who: { ref: "eachOpponent" }, highest: true });
  if (/^your speed$/i.test(p)) return count({ kind: "speed" });
  // "For each unspent green mana you have" (Omnath, Locus of Mana): in your mana pool (CR 106.4).
  if (each && (m = /^unspent (?:(white|blue|black|red|green) )?mana you have$/i.exec(p))) return count({ kind: "unspentMana", ...(m[1] ? { color: COLOR_WORDS[m[1].toLowerCase()]! } : {}) });
  if (each && /^player$/i.test(p)) return count({ kind: "players" });
  if (each && /^player who has lost the game$/i.test(p)) return count({ kind: "players", lostGame: true });
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
  // Surveyor's Scope: "the number of players who control at least two more lands than you", counted as it resolves.
  if (each && (m = /^players? who controls? at least (one|two|three) more lands? than you$/i.exec(p))) return count({ kind: "players", moreLandsThanYou: num(m[1]!) });
  // Great Unclean One: "for each opponent who has less life than you", counted as it resolves.
  if (each && /^opponent who has less life than you$/i.test(p)) return count({ kind: "players", opponents: true, lifeLessThanYou: true });
  // Bandit's Talent: "for each opponent who has one or fewer cards in hand", counted as it resolves.
  if (each && (m = /^opponent who has (one|two|three|zero|no) or fewer cards in hand$/i.exec(p))) return count({ kind: "players", opponents: true, handAtMost: m[1] === "no" ? 0 : num(m[1]!) });
  // Tymna the Weaver: "the number of opponents that were dealt combat damage this turn", those who've lost since too (rulings).
  if (each && /^opponents? (?:that|who) (?:were|was) dealt combat damage this turn$/i.test(p)) return count({ kind: "players", opponents: true, combatDamaged: true });
  if (each && /^(?:of your opponents|opponent) who lost life this turn$/i.test(p)) return count({ kind: "players", opponents: true, lostLife: true });
  if (ctx && each && /^card returned to your hand this way$/.test(p)) return { count: { kind: "returnedToYourHand" } };
  // Reaper's Scythe: "for each player who lost life this turn", you too.
  if (each && /^player who lost life this turn$/i.test(p)) return count({ kind: "players", lostLife: true });
  // Aclazotz: "Each opponent discards a card. For each opponent who can't, you draw a card": those with no card to discard.
  if (each && ctx?.opponentsDiscarded && /^opponent who can't$/i.test(p)) return count({ kind: "players", opponents: true, discardedNone: true });
  if (each && /^opponent who drew a card this way$/i.test(p)) return count({ kind: "players", opponents: true, drewThisWay: true });
  // Kefka, Court Mage: "for each card type among cards discarded this way" (CR 205.2a: card types, not supertypes or subtypes).
  if (each && /^card type among cards discarded this way$/i.test(p)) return count({ kind: "discardedTypes" });
  // Dread Summons: "Each player mills X cards. For each creature card put into a graveyard this way, ...": the milled
  // cards that went there (one replaced to go elsewhere doesn't count, rulings).
  if (each && ctx?.afterAnyMill && (m = /^(.+? card) (?:put into a graveyard this way|milled this way)$/i.exec(p))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? count({ kind: "milledThisWay", filter }) : null;
  }
  // Struggle for Project Purity: "Each opponent draws a card. You draw a card for each card drawn this way."
  if (each && /^card drawn this way$/i.test(p)) return count({ kind: "drawnThisWay" });
  // Smuggler's Share: "for each opponent who drew two or more cards this turn", "... who had two or more lands enter the
  // battlefield under their control this turn".
  if (each && (m = /^opponent who drew (two|three|four) or more cards this turn$/i.exec(p))) return count({ kind: "players", opponents: true, drewAtLeast: num(m[1]!) });
  if (each && (m = /^opponent who had (two|three|four) or more lands enter the battlefield under their control this turn$/i.exec(p))) return count({ kind: "players", opponents: true, landsEnteredAtLeast: num(m[1]!) });
  // Gadrak, the Crown-Scourge: "for each nontoken creature that died this turn".
  if ((m = /^(nontoken )?creatures? that died (under your control )?this turn$/i.exec(p))) return count({ kind: "diedThisTurn", ...(m[2] ? { yours: true as const } : {}), ...(m[1] ? { nontoken: true as const } : {}) });
  // The Zubera: "for each Zubera that died this turn", any player's.
  if ((m = /^([A-Z][a-z]+) that died this turn$/.exec(p)) && CREATURE_TYPES.has(m[1]!)) return count({ kind: "diedThisTurn", subtype: m[1]! });
  if (/^creatures? that attacked this turn$/i.test(p)) return count({ kind: "attackersThisTurn" });
  // "The number of Goblins that entered the battlefield under your control this turn" (Hobgoblin, Bandit Lord).
  if ((m = /^(creature|artifact|land|permanent|[A-Z][a-z]+?)s? that entered the battlefield under your control this turn$/.exec(p)) && !["Elve", "Dwarve"].includes(m[1]!))
    return count({ kind: "enteredThisTurn", ...(/^[A-Z]/.test(m[1]!) ? { subtype: m[1]! } : m[1] === "permanent" ? {} : { types: [capital(m[1]!)] }) });
  // Gyome, Master Chef: "the number of nontoken creatures you had enter the battlefield under your control this turn":
  // every one that entered, wherever it is now and whatever it is now (rulings), as it entered.
  if (/^nontoken creatures you had enter the battlefield under your control this turn$/.test(p)) return count({ kind: "enteredThisTurn", types: ["Creature"], nontoken: true });
  if ((m = /^(?:([A-Z][a-z]+) )?tokens you created this turn$/.exec(p))) return count({ kind: "tokensCreatedThisTurn", ...(m[1] ? { subtype: m[1] } : {}) });
  // Jeska, Thrice Reborn: "each time you've cast a commander from the command zone": only your own are cast from there (CR 903.8).
  if (/^times? you've cast (?:your|a) commander from the command zone this game$/i.test(p)) return count({ kind: "commanderCasts" });
  if (/^the chosen commander's mana value$/i.test(p)) return count({ kind: "chosenCommanderMv" });
  if (!each && /^the greatest mana value among your commanders$/i.test(p)) return count({ kind: "commandersMv" });
  // "For each creature in your party", "the number of creatures in your party" (CR 700.8).
  if (/^creatures? in your party$/i.test(p)) return count({ kind: "party" });
  if (each ? /^1 life you(?:'ve| have)? gained this turn$/i.test(p) : /^the (?:total )?amount of life you(?:'ve| have)? gained this turn$/i.test(p)) return count({ kind: "lifeGainedThisTurn" });
  // Children of Korlis: "the life you've lost this turn", all of it, whatever you gained (rulings).
  if (!each && /^the (?:total )?(?:amount of )?life you(?:'ve| have)? lost this turn$/i.test(p)) return count({ kind: "lifeLostThisTurn", who: { ref: "you" } });
  if (!each && /^the total amount of noncombat damage dealt to your opponents this turn$/i.test(p)) return count({ kind: "opponentsNoncombatDamage" });
  // Notorious Throng: all the damage dealt this turn to players who are your opponents, by any source (rulings).
  if (!each && /^the (?:total )?(?:amount of )?damage dealt to your opponents this turn$/i.test(p)) return count({ kind: "opponentsDamage" });
  // Knollspine Dragon: "the damage dealt to target opponent this turn": by any source, what was really dealt (rulings).
  if (!each && ctx && /^the damage dealt to target opponent this turn$/i.test(p)) {
    const i = addTarget(ctx, { kind: "player", opponent: true, text: "target opponent" });
    ctx.lastPlayerTarget = i;
    return count({ kind: "playerDamageThisTurn", who: { ref: "target", index: i } });
  }
  if (each ? /^1 life your opponents have lost this turn$/i.test(p) : /^the (?:total )?amount of life your opponents (?:have )?lost this turn$/i.test(p)) return count({ kind: "opponentsLifeLost" });
  // Inquisition: "the number of white cards in their hand" (revealed just before).
  if ((m = /^((?:white|blue|black|red|green|creature|land|nonland|artifact|enchantment|instant|sorcery) cards?) in (your|that player's|target player's|their|target opponent's) hand$/i.exec(p))) {
    const who = whosePlayer(m[2]!, ctx);
    const filter = parseSearchFilter(m[1]!.replace(/s$/, ""));
    return who && filter ? count({ kind: "cardsInHand", who, filter }) : null;
  }
  // Enemy of Enlightenment: "for each card in your opponents' hands": all of them together.
  if (/^cards? in (?:your opponents'|all opponents') hands$/i.test(p)) return count({ kind: "cardsInHand", who: { ref: "eachOpponent" } });
  // Realm Seekers: "the total number of cards in all players' hands", every player's added up.
  if (/^cards? in all players' hands$/i.test(p)) return count({ kind: "cardsInHand", who: { ref: "eachPlayer" } });
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
  // Sisay, Weatherlight Captain: "for each color among other legendary permanents you control".
  if ((m = /^colou?rs? among (other )?legendary permanents you control$/i.exec(p)))
    return count({ kind: "colorsAmongPermanents", filter: { kind: "object", types: [], notTypes: [], notColors: [], supertypes: ["Legendary"], controller: "you", text: "legendary permanents you control" }, ...(m[1] ? { other: true as const } : {}) });
  if (/^spells? you've cast this turn$/i.test(p)) return count({ kind: "spellsCastThisTurn" });
  // Surge of Brilliance: "for each spell you've cast this turn from anywhere other than your hand", itself too when it was
  // (rulings).
  if (/^spells? you've cast this turn from anywhere other than your hand$/i.test(p)) return count({ kind: "spellsCastThisTurn", notFromHand: true });
  // Rug of Smothering: "for each spell they've cast this turn", the player the trigger is about.
  if (ctx?.eventPlayer && /^spells? (?:they've|that player has) cast this turn$/i.test(p)) return count({ kind: "spellsCastThisTurn", eventPlayer: true });
  // Magebane Lizard: "the number of noncreature spells they've cast this turn", that one included (it's cast by now).
  if (ctx?.eventPlayer && (m = /^((?:instant|sorcery|creature|noncreature|artifact|enchantment)(?: (?:and|or) (?:instant|sorcery|creature|artifact|enchantment))?) spells (?:they've|that player has) cast this turn$/i.exec(p))) {
    const filter = parseSearchFilter(`${m[1]!.replace(/ and /, " or ")} card`);
    return filter ? count({ kind: "spellsCastThisTurn", filter, eventPlayer: true }) : null;
  }
  // "Instant and sorcery spells you've cast this turn" (Rionya, Fire Dancer): copies aren't cast (CR 707.10).
  // "For each other instant and sorcery spell you've cast this turn" (Lock and Load, a spell): not its own cast.
  if ((m = /^(other )?((?:instant|sorcery|creature|noncreature|artifact|enchantment)(?: (?:and|or) (?:instant|sorcery|creature|artifact|enchantment))?) spells? you've cast this turn$/i.exec(p)) && (!m[1] || (each && ctx?.spell))) {
    const filter = parseSearchFilter(`${m[2]!.replace(/ and /, " or ")} card`);
    return filter ? count({ kind: "spellsCastThisTurn", filter, ...(m[1] ? { other: true as const } : {}) }) : null;
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
  // Breathe Your Last: "Destroy target creature or planeswalker. You gain 1 life for each of its colors."
  if (/^of its colors$/i.test(p) && ctx?.lastObjectTarget !== undefined) {
    const of = whoseObject("its", ctx);
    return of && count({ kind: "colorsOf", of });
  }
  // "Your Ring-bearer's power" (One Ring to Rule Them All): 0 without one (CR 701.54a, 107.1b).
  if ((m = /^your Ring-bearer's (power|toughness)$/.exec(p))) return count({ kind: m[1] as "power" | "toughness", of: { ref: "ringBearer" } });
  // Ninja's Blades: "draw a card, then discard a card. That player loses life equal to the discarded card's mana value."
  if (/^the discarded card's mana value$/i.test(p) && ctx) return count({ kind: "discardedManaValue" });
  // Morbid Curiosity: "the mana value of the sacrificed permanent" is "the sacrificed permanent's mana value".
  if ((m = /^the (power|toughness|mana value) of the sacrificed (creature|artifact|enchantment|permanent)$/i.exec(p))) p = `the sacrificed ${m[2]}'s ${m[1]}`;
  // Power, toughness, mana value: "~'s power", "its power", "that creature's toughness".
  if ((m = /^(~'s|its|that creature's|that artifact's|that enchantment's|the creature's|that permanent's|that spell's|the spell's|that card's|the sacrificed (?:creature|artifact|enchantment|permanent)'s|the exiled creature's|the revealed card's|the amassed Army's) (power|toughness|mana value)$/i.exec(p))) {
    const of = whoseObject(m[1]!, ctx);
    const kind = m[2]!.toLowerCase() === "mana value" ? "manaValue" : (m[2]!.toLowerCase() as "power" | "toughness");
    if (of?.ref === "castSpell" && kind !== "manaValue") return null;
    return of && count({ kind, of });
  }
  // "The difference between that creature's power and its toughness" (Jaws of Defeat): the larger less the smaller
  // (rulings).
  if ((m = /^the difference between (~'s|its|that creature's) power and its toughness$/i.exec(p))) {
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
  // "For each counter on ~" (Twitching Doll): every kind.
  if ((m = /^counters? on (~|it)$/.exec(p))) {
    const of = whoseObject(m[1] === "~" ? "~'s" : "its", ctx);
    return of && count({ kind: "counters", counter: ANY_COUNTER, of });
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
  // "Charge counter on ~", "+1/+1 counters on it".
  if ((m = new RegExp(`^${COUNTER} counters? on (~|it|that creature)$`).exec(p))) {
    const of = whoseObject(m[2] === "~" ? "~'s" : m[2] === "it" ? "its" : "that creature's", ctx);
    return of && count({ kind: "counters", counter: counterKind(m[1]!), of });
  }
  // "The number of +1/+1 counters on lands you control" (Toph, the Blind Bandit), "counters on permanents you control"
  // (Hydra Trainer): the counters on those permanents added up.
  // "Counters among artifacts and creatures you control" (Lux Artillery): each permanent that's either, once.
  // Ferrafor, Young Yew: "counters among creatures target player controls": that player's.
  if ((m = new RegExp(`^(?:${COUNTER} )?counters (?:on|among) ((?:creatures|lands|permanents|artifacts|artifacts and creatures|Sagas) (?:you control|target player controls))$`).exec(p))) {
    const c = parseCount(m[2]!.replace(/^artifacts and creatures /, "artifacts or creatures "), ctx, each);
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
  // Lunar Insight: "for each different mana value among nonland permanents you control".
  if (each && (m = /^different mana value among (.+?) you control$/i.exec(p))) {
    const c = parseCount(`${m[1]} you control`, ctx);
    return c && typeof c === "object" && "count" in c && c.count.kind === "permanents" && !c.count.other && !c.count.counter ? { count: { ...c.count, differentManaValues: true } } : null;
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
  if ((m = /^(other )?(.+?) (you control|on the battlefield|your opponents control|an opponent controls|target player controls|target opponent controls|that player controls|those players control|those opponents control)(?: ((?:with|of the chosen|of that|that aren't|that's attached to|that are attached to|that entered) .+|that didn't attack this turn))?$/i.exec(p))) {
    const words = m[2]!.split(/\s+/).map(singularWord).join(" ");
    const who = m[3]!.toLowerCase();
    const theirs = /^(target|that|those) /.test(who);
    const suffix = who === "you control" ? " you control" : who === "on the battlefield" || theirs ? "" : " an opponent controls";
    const spec = parseTargetPhrase(`${words}${suffix}${m[4] ? ` ${m[4]}` : ""}`, { chosen: true });
    if (spec?.kind !== "object") return null;
    const whose = theirs ? whosePlayer(who.replace(/ controls$/, "'s").replace(/^(those \w+) control$/, "$1'"), ctx) : undefined;
    if (whose === null) return null;
    return count({ kind: "permanents", filter: { ...spec, text: `${m[1] ?? ""}${m[2]} ${m[3]}${m[4]?.startsWith("that entered") ? ` ${m[4]}` : ""}` }, ...(m[1] ? { other: true } : {}), ...(whose ? { whose } : {}) });
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
  // Hateful Eidolon: "draw a card for each Aura you controlled that was attached to it", after "an enchanted creature dies".
  if (/^Auras? you controlled that (?:was|were) attached to it$/.test(p) && ctx?.subjectIt) return count({ kind: "aurasYouControlledAttached" });
  // Titan of Littjara: "for each other creature you control that shares a creature type with it", "it" being ~.
  if (/^other creatures? you control that shares? a creature type with (?:it|~)$/i.test(p) && ctx?.selfIt) return count({ kind: "permanents", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: p }, other: true, sharesTypeWithSource: true });
  // Mana Echoes: "the number of creatures you control that share a creature type with it", "it" the creature the trigger
  // is about, which counts too if you control it (rulings), counted as it resolves.
  if (/^creatures you control that share a creature type with it$/i.test(p) && ctx?.subjectIt) return count({ kind: "permanents", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: p }, sharesTypeWithSubject: true, includeSubject: true });
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
  // "The revealed card's power" after a "reveal a colorless creature card from your hand" cost (Titan's Presence).
  if (x === "the revealed card's") return ctx ? { ref: "sacrificed", revealedCost: true } : null;
  // A reflexive trigger after "you may sacrifice another creature": that creature, as it last existed (CR 608.2h).
  if (x === "that creature's" && ctx?.sacrificedIt) return { ref: "sacrificed" };
  // "Where X is the amassed Army's power" (CR 701.47c), after amassing.
  if (x === "the amassed army's") return ctx?.amassed ? { ref: "amassed" } : null;
  if (!ctx) return x === "its" ? { ref: "self" } : null;
  // "That spell's mana value": the targeted spell (Imp's Mischief).
  // With a target that isn't a spell, in a cast trigger, the spell cast (Dancing from Dark to Dawn), below.
  if ((x === "that spell's" || x === "the spell's") && ctx.lastObjectTarget !== undefined && !(x === "that spell's" && ctx.castSpell && ctx.targets[ctx.lastObjectTarget]?.kind !== "spell")) return ctx.targets[ctx.lastObjectTarget]?.kind === "spell" ? { ref: "target", index: ctx.lastObjectTarget } : null;
  // "Return target card from your graveyard to your hand. You gain life equal to that card's mana value": the card
  // targeted, wherever it went (Healing Technique, Razor Hippogriff).
  // "Exile the top card of your library. ~ gets +X/+0 until end of turn, where X is that card's mana value" (Tavern Brawler).
  if ((x === "that card's" || x === "the exiled card's") && ctx.exiledTop) return { ref: "exiledTop" };
  if (x === "that card's" && ctx.chosenFromYard) return { ref: "chosenFromYard" };
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
    // Death: "Return target creature card from your graveyard to the battlefield. You lose life equal to its mana value."
    if ((x === "that creature's" || (x === "its" && ctx.spell)) && ctx.targets.length === 1 && ctx.targets[0]!.kind === "card" && ctx.targets[0]!.types?.includes("Creature")) return { ref: "target", index: 0 };
  }
  return null;
}

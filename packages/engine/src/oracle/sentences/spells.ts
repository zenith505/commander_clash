// Sentences about sacrificing, milling, discarding, scry/surveil, fighting, counterspells, and copying spells.

import { parseBoundCount, parseCount, roundOf } from "../counts";
import type { Effect, PlayerRef, TargetSpec } from "../../abilities";
import type { SkipWhat } from "../../types";
import { COLOR_WORDS, NUM, NUMX, X, amt, isGroup, isSeveral, num } from "../words";
import { parseUnlessPays, addTarget, parseBody, replaceX } from "../body";
import { parseDamageRecipient, parsePlayer, parseObject, parseTargetPhrase } from "../targets";
import { parseSentence } from "../sentence";
import type { Ctx } from "../body";
import { PREDEFINED_TOKENS, parseCopyExcept } from "../tokens";
import { parseSearchFilter } from "../search";
import { parseCostChange } from "../statics";
import { parsePunisherOptions } from "./basics";
import { CREATURE_TYPES } from "../../keywords";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseSpellsSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  // Sacrificing (CR 701.21): "sacrifice ~", "sacrifice it" (the permanent itself)
  // "You may sacrifice Sunfire Torch" in an ability it gives: that Equipment, only if you control it (CR 701.21a).
  if (s === "Sacrifice \u27easource\u27eb") return [{ type: "sacrifice", what: { ref: "grantSource" } }];
  if ((m = /^Sacrifice (~|it)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    // "It" in a trigger about another permanent (Grafted Wargear's "sacrifice that permanent"): only if you control it (CR 701.21a).
    if (what?.ref === "self" || what?.ref === "subject") return [{ type: "sacrifice", what }];
    // Special Move: "Target creature you control deals damage equal to its power to any other target. Then sacrifice it.":
    // that creature, still only if you control it as this resolves (CR 701.21a); none if it's an illegal target (CR 608.2b).
    const spec = what?.ref === "target" && !what.n ? ctx.targets[what.index] : undefined;
    return spec?.kind === "object" && spec.controller === "you" && !spec.optional ? [{ type: "sacrifice", what: what! }] : null;
  }
  // Lingering Death: "that player sacrifices enchanted creature" ("that creature", the enchanted creature, in a trigger at
  // the beginning of a step of its controller's): that player, if they still control it (CR 701.21a).
  if (ctx.eventPlayer && /^[Tt]hat player sacrifices enchanted creature$/.test(s)) return [{ type: "sacrifice", what: { ref: "attached" }, byEventPlayer: true }];
  // Reality Acid: "When this Aura leaves the battlefield, enchanted permanent's controller sacrifices it": the permanent it
  // was attached to as it left, sacrificed by whoever controls it then (CR 701.21a); nothing if that one left too.
  if (/^[Ee]nchanted (?:permanent|creature)'s controller sacrifices it$/.test(s)) return [{ type: "sacrifice", what: { ref: "attached" }, byController: true }];
  // Soul Tithe: "that player sacrifices it unless they pay {X}, where X is its mana value" (rewritten in compile.ts): that
  // player decides as it resolves (CR 608.2d); its mana value then, a token's 0 unless it copies a mana cost, an {X} in it
  // 0 (rulings).
  if (ctx.eventPlayer && /^[Tt]hat player sacrifices enchanted permanent unless they pay mana equal to its mana value$/.test(s))
    return [{ type: "punisher", who: { ref: "eventPlayer" }, options: [{ pay: { cost: "", generic: { count: { kind: "manaValue", of: { ref: "attached" } } } } }], effects: [{ type: "sacrifice", what: { ref: "attached" }, byEventPlayer: true }], penalty: "Sacrifice it" }];
  // "Sacrifice all creatures you control" (CR 701.21a), "Each player sacrifices all permanents they control that are one or
  // more colors" (All Is Dust): every one of them, each by its controller (rulings: all at the same time).
  if ((m = /^([Ss]acrifice|[Ee]ach player sacrifices) all (.+?) (you|they) control( that .+)?$/.exec(s)) && /^sacrifice$/i.test(m[1]!) === (m[3] === "you")) {
    const what = parseObject(`all ${m[2]}${m[3] === "you" ? " you control" : ""}${m[4] ?? ""}`, ctx);
    if (what?.ref !== "each" || what.filter.kind !== "object" || (m[3] === "they" && what.filter.controller)) return null;
    return [{ type: "sacrifice", what, ...(m[3] === "they" ? { byController: true as const } : {}) }];
  }
  // Plague Reaver: "sacrifice each other creature you control", the same as "all other creatures".
  if ((m = /^[Ss]acrifice each ((?:other )?[a-z]+ you control)$/.exec(s))) {
    const what = parseObject(`each ${m[1]}`, ctx);
    return what?.ref === "each" && what.filter.kind === "object" && what.filter.controller === "you" ? [{ type: "sacrifice", what }] : null;
  }
  // "Artifact, instant, and sorcery spells you cast this turn cost {2} less to cast" (Urza, Planeswalker): a cost change
  // for the spells its controller casts later this turn (CR 601.2f, 611.2a). Only generic mana comes off (CR 118.7a).
  if ((m = /^(.+? spells) you cast this turn cost (\{\d+\}) less to cast$/.exec(s)) && !/\bwith\b|\bfrom\b/.test(m[1]!)) {
    const change = parseCostChange(`${m[1]} you cast cost ${m[2]} less to cast`);
    if (!change || change === "fail" || !("costMod" in change) || change.costMod.who !== "you" || change.costMod.turn || change.costMod.fromGraveyard) return null;
    return [{ type: "costModThisTurn", mod: { ...change.costMod, text: `${s}.` } }];
  }
  // Will, Scion of Peace: "Spells you cast this turn that are white and/or blue cost {X} less to cast, where X is the amount
  // of life you gained this turn": X counted once, as it resolves (rulings), generic mana only.
  if ((m = /^Spells you cast this turn that are (white|blue|black|red|green) and\/or (white|blue|black|red|green) cost \{X\} less to cast(?:, where X is (.+))?$/.exec(s)) && (!!m[3] || !!ctx.whereX)) {
    const change = parseCostChange(`${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)} and ${m[2]} spells you cast cost {1} less to cast`);
    if (!change || change === "fail" || !("costMod" in change) || change.costMod.who !== "you" || change.costMod.turn || change.costMod.fromGraveyard || change.costMod.times || change.costMod.nth) return null;
    const times = m[3] ? parseCount(m[3], ctx) : X;
    if (!times) return null;
    return [{ type: "costModThisTurn", mod: { ...change.costMod, text: `${s}.` }, times }];
  }
  // "The next spell you cast this turn costs {1} less to cast" (Hardened Berserker), "the next instant or sorcery spell
  // you cast this turn costs {X} less to cast, where X is ~'s power as this ability resolves" (Maelstrom Muse), "... for
  // each counter removed this way" (Mutated Cultist): a reduction to only the next such spell its controller casts this
  // turn, generic mana only (CR 601.2f, 118.7a; rulings), counted as it resolves.
  // Invasion of the Giants: "The next Giant spell you cast this turn costs {2} less to cast": a spell with that creature type
  // (a kindred one too, CR 205.3m).
  if ((m = /^[Tt]he next ((?:instant or sorcery |noncreature |creature |artifact |[A-Z][a-z]+ )?spell) you cast this turn costs \{(\d+|X)\} less to cast(?:, where X is (.+?)| for each (.+))?$/.exec(s)) && (m[2] === "X") === !!(m[3] || ctx.whereX) && (!/^[A-Z]/.test(m[1]!) || CREATURE_TYPES.has(m[1]!.split(" ")[0]!))) {
    const what = m[1] === "spell" ? "Spells" : `${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1).replace(/ or /, " and ")}s`;
    const change = parseCostChange(`${what} you cast cost {${m[2] === "X" ? 1 : m[2]}} less to cast`);
    if (!change || change === "fail" || !("costMod" in change) || change.costMod.who !== "you" || change.costMod.turn || change.costMod.fromGraveyard || change.costMod.times || change.costMod.nth) return null;
    // With the X defined after the sentence (ctx.whereX), the X is filled in afterwards (replaceX).
    const times = m[3] ? parseCount(m[3].replace(/ as this ability resolves$/, ""), ctx) : m[4] ? parseCount(m[4], ctx, true) : m[2] === "X" ? X : undefined;
    if ((m[3] || m[4]) && !times) return null;
    return [{ type: "costModThisTurn", mod: { ...change.costMod, text: `${s}.` }, next: true, ...(times ? { times } : {}) }];
  }
  // Saheeli, the Gifted: "The next spell you cast this turn has affinity for artifacts": that spell costs {1} less for
  // each artifact you control as you cast it (CR 702.41a), counted as its total cost is determined (CR 601.2f; rulings),
  // generic mana only (rulings).
  // Don & Raph, Hard Science: "the next noncreature spell you cast this turn has affinity for artifacts": the next
  // noncreature one; two of them make two instances, which add up (rulings).
  if ((m = /^[Tt]he next (noncreature )?spell you cast this turn has affinity for (artifacts)$/.exec(s))) {
    const change = parseCostChange(`${m[1] ? "Noncreature spells" : "Spells"} you cast cost {1} less to cast for each ${m[2]!.slice(0, -1)} you control`);
    if (!change || change === "fail" || !("costMod" in change) || change.costMod.who !== "you" || !change.costMod.times) return null;
    return [{ type: "costModThisTurn", mod: { ...change.costMod, text: `${s}.` }, next: true }];
  }
  // Ral, Leyline Prodigy: "Until your next turn, instant and sorcery spells you cast cost {1} less to cast": the same,
  // until its controller's next turn begins (CR 611.2b).
  if ((m = /^Until your next turn, (.+? spells) you cast cost (\{\d+\}) less to cast$/.exec(s)) && !/\bwith\b|\bfrom\b/.test(m[1]!)) {
    const change = parseCostChange(`${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)} you cast cost ${m[2]} less to cast`);
    if (!change || change === "fail" || !("costMod" in change) || change.costMod.who !== "you" || change.costMod.turn || change.costMod.fromGraveyard) return null;
    return [{ type: "costModThisTurn", mod: { ...change.costMod, text: `${s}.` }, untilYourNextTurn: true }];
  }
  // Elspeth Conquers Death: "Noncreature spells your opponents cast cost {2} more to cast until your next turn": the same,
  // until its controller's next turn begins (CR 611.2b).
  // "Until your next turn, spells your opponents cast cost {1} more to cast" (Tax Collector) likewise.
  if ((m = /^(.+? spells) your opponents cast cost (\{\d+\}) more to cast until your next turn$/.exec(s) ?? /^Until your next turn, ((?:.+? )?spells) your opponents cast cost (\{\d+\}) more to cast$/.exec(s)) && !/\bwith\b|\bfrom\b/.test(m[1]!)) {
    const change = parseCostChange(`${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)} your opponents cast cost ${m[2]} more to cast`);
    if (!change || change === "fail" || !("costMod" in change) || change.costMod.who !== "opponents" || change.costMod.turn || change.costMod.fromGraveyard) return null;
    return [{ type: "costModThisTurn", mod: { ...change.costMod, text: `${s}.` }, untilYourNextTurn: true }];
  }
  // Extra turns (CR 500.7): "Take an extra turn after this one", "Target player takes two extra turns after this one".
  // Ral Zarek: "Take an extra turn after this one for each coin that comes up heads", counted as it resolves.
  if ((m = /^Take an extra turn after this one for each (.+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx, true);
    return n ? [{ type: "extraTurn", who: { ref: "you" }, n }] : null;
  }
  if ((m = /^(?:(.+?) )?(?:take|takes) (an|two|three) extra turns? after this one$/i.exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    return who ? [{ type: "extraTurn", who, n: m[2] === "an" ? 1 : m[2] === "two" ? 2 : 3 }] : null;
  }
  // "End the turn." (CR 724.1): Sundial of the Infinite, Time Stop.
  if (/^End the turn$/i.test(s)) return [{ type: "endTurn" }];
  // Mandate of Peace: "End the combat phase." (CR 724.2).
  if (/^End the combat phase$/i.test(s)) return [{ type: "endCombatPhase" }];
  // Obeka, Brute Chronologist: "The player whose turn it is may end the turn" (CR 724.1): that player decides as it
  // resolves, whoever controls the ability.
  if (/^The player whose turn it is may end the turn$/.test(s)) return [{ type: "eachMay", who: { ref: "activePlayer" }, effects: [{ type: "endTurn" }], text: "end the turn" }];
  // Soothsaying: "Shuffle your library."
  if (/^Shuffle your library$/.test(s)) return [{ type: "shuffle", who: { ref: "you" } }];
  // Boggart Forager, Soldier of Fortune: "Target player shuffles their library." Lantern of Insight: "Target player
  // shuffles." (a library, CR 701.24a).
  if (/^Target player shuffles(?: their library)?$/.test(s)) {
    const who = parsePlayer("target player", ctx);
    return who ? [{ type: "shuffle", who }] : null;
  }
  // Controlling another player (CR 723): "You control target player during that player's next turn" (Mindslaver),
  // "you gain control of target opponent during that player's next turn" (Emrakul), "... during their next turn".
  if ((m = /^You (?:gain control of|control) (target player|target opponent) during (?:that player's|their) next turn$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who?.ref === "target" ? [{ type: "controlPlayer", who, controller: { ref: "you" } }] : null;
  }
  // Skipping (CR 614.10): "Target player skips their next combat phase", "You skip your next two turns", "Skip your next
  // turn", "... their next combat phase this turn" (Moment of Silence). Elfhame Sanctuary (at the beginning of your upkeep):
  // "you skip your draw step this turn", the one still to come this turn (none once it's begun, or on another's turn).
  // Ral Zarek, Guest Lecturer: "Target opponent skips their next X turns, where X is ..." (the X filled in by body.ts).
  if ((m = /^(?:(.+?) )?(skips?) (?:their|your) (?:next (?:(two|three|X) )?(untap step|draw step|combat phase|turn)s?( this turn)?|(draw step)( this turn))$/i.exec(s))) {
    if (m[6]) [m[4], m[5]] = [m[6], m[7]!];
    if (m[3] === "X" && (!ctx.whereX || m[4] !== "turn" || m[5] || !m[1] || /^you$/i.test(m[1]))) return null;
    const self = !m[1] || /^you$/i.test(m[1]);
    if (!m[1] && m[2] !== "Skip") return null;
    const who = self ? { ref: "you" as const } : parsePlayer(m[1]!, ctx);
    const skips: Record<string, SkipWhat> = { "untap step": "untap", "draw step": "draw", "combat phase": "combat", turn: "turn" };
    const skip = skips[m[4]!.toLowerCase()]!;
    if (!who || (m[3] && skip !== "turn") || (m[5] && skip !== "combat" && !m[6])) return null;
    return [{ type: "skip", who, skip, n: m[3] === "X" ? { count: { kind: "x" } } : m[3] === "two" ? 2 : m[3] === "three" ? 3 : 1, ...(m[5] ? { thisTurn: true as const } : {}) }];
  }
  // False Peace, Empty City Ruse: "Target player skips all combat phases of their next turn" (CR 614.10).
  if ((m = /^(Target player|Target opponent) skips all combat phases of their next turn$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    return who ? [{ type: "skip", who, skip: "combat", n: 1, wholeTurn: true }] : null;
  }
  // Celestial Convergence (one sentence by now, body.ts): the one player with the most life wins; a tie is a draw.
  if (/^the player with the highest life total wins the game, a tie being a draw$/i.test(s)) return [{ type: "highestLifeWins" }];
  if ((m = /^(.+?) (loses?|wins?) the game$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: /^lose/.test(m[2]!) ? "loseGame" : "winGame", who }] : null;
  }
  // Mill
  if ((m = new RegExp(`^Mill ${NUMX} cards?$`, "i").exec(s))) return [{ type: "mill", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = new RegExp(`^(.+?) mills? ${NUMX} cards?$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "mill", who, n: amt(m[2]!) }] : null;
  }
  // "Target player mills half their library, rounded down" (Traumatize): each of them half their own library (CR 107.1a).
  if ((m = /^(.+?) mills? half (your|their|that player's|his or her) library(?:, rounded (up|down))?$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const half = roundOf(m[3], ctx);
    if (!who || !half || (who.ref === "you") !== (m[2]!.toLowerCase() === "your")) return null;
    return [{ type: "mill", who, n: { count: { kind: "cardsInLibrary", who: { ref: "eachOne" } }, half } }];
  }
  // "Each opponent mills cards equal to the number of cards in their hand" (Folio of Fancies): each their own hand.
  if ((m = /^(.+?) mills? cards equal to the number of cards in (?:their|his or her) hand$/i.exec(s)) && !/^you$/i.test(m[1]!)) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "mill", who, n: { count: { kind: "cardsInHand", who: who.ref === "eachPlayer" || who.ref === "eachOpponent" ? { ref: "eachOne" } : who } } }] : null;
  }
  // "Target player mills twice X cards" (Drown in Dreams), "mill twice X cards" (The Master of Keys).
  // "Target player mills three times X cards" (Jace, the Perfected Mind).
  if ((m = /^(?:(.+?) mills|[Mm]ill) (twice|three times) X cards$/.exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    return who ? [{ type: "mill", who, n: { count: { kind: "x" }, times: m[2] === "twice" ? 2 : 3 } }] : null;
  }
  // "Target opponent exiles the top half of their library, rounded up" (Ulamog, the Defiler): half their own library.
  if ((m = /^(.+?) exiles the top half of (?:their|his or her) library(?:, rounded (up|down))?$/i.exec(s)) && !/^you$/i.test(m[1]!)) {
    const who = parsePlayer(m[1]!, ctx);
    const half = roundOf(m[2], ctx);
    return who && half ? [{ type: "exileTop", who, n: { count: { kind: "cardsInLibrary", who: { ref: "eachOne" } }, half } }] : null;
  }
  // "That player exiles the top card of their library" (ingest's text); "you" exiling your own goes through impulse draw.
  if ((m = new RegExp(`^(.+?) exiles the top (card|${NUMX} cards) of (?:their|his or her) library$`, "i").exec(s)) && !/^you$/i.test(m[1]!)) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "exileTop", who, n: m[2] === "card" ? 1 : amt(m[3]!) }] : null;
  }
  // Circu, Dimir Lobotomist: "exile the top card of target player's library": that player's card, face up (CR 406.3).
  if ((m = new RegExp(`^[Ee]xile the top (card|${NUMX} cards) of (target player|target opponent)'s library$`).exec(s))) {
    const who = parsePlayer(m[3]!, ctx);
    return who ? [{ type: "exileTop", who, n: m[1] === "card" ? 1 : amt(m[2]!) }] : null;
  }
  // Mystic Forge, Precognition Field: "Exile the top card of your library" with nothing more (a sentence after it that
  // lets you play the card is impulse draw, read with it).
  if ((m = new RegExp(`^[Ee]xile the top (card|${NUMX} cards) of your library$`).exec(s))) return [{ type: "exileTop", who: { ref: "you" }, n: m[1] === "card" ? 1 : amt(m[2]!) }];
  // Discarding (CR 701.9): "Target player discards two cards", "Each opponent discards a card at random", "Discard a card"
  if ((m = new RegExp(`^Discard ${NUMX} cards?( at random)?$`, "i").exec(s))) return [{ type: "discard", who: { ref: "you" }, n: amt(m[1]!), random: !!m[2] }];
  // Felothar the Steadfast: "then discard cards equal to its power", the sacrificed creature's (as it last existed, CR 608.2h).
  if ((m = /^Discard cards equal to (the sacrificed creature's (?:power|toughness))$/i.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    return n ? [{ type: "discard", who: { ref: "you" }, n }] : null;
  }
  // "Then you may discard a nonland card" (Hypothesizzle): only a card of that kind can be discarded (CR 701.9a).
  if ((m = /^Discard an? ((?:(?!\bcards?\b).)+ card)$/i.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? [{ type: "discard", who: { ref: "you" }, n: 1, filter }] : null;
  }
  // "Look at target opponent's hand", "target player reveals their hand" (CR 402.3, 701.20).
  if ((m = /^Look at a card at random in (.+?)'s? hand$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "lookAtHand", who, atRandom: true }] : null;
  }
  if ((m = /^Look at (.+?)'s? hand$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "lookAtHand", who }] : null;
  }
  // Smoke Teller, Aven Soulgazer: "Look at target face-down creature": only its controller sees what it is, as this
  // resolves (CR 708.5, rulings).
  if (/^Look at target face-down creature$/.test(s)) return [{ type: "lookAtFaceDown", what: { ref: "target", index: addTarget(ctx, { kind: "object", types: ["Creature"], faceDown: true, text: "target face-down creature" }) } }];
  if ((m = /^(.+?) reveals? (?:their|his or her) hand$/i.exec(s)) && !/^you$/i.test(m[1]!)) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "lookAtHand", who, reveal: true }] : null;
  }
  // "Each player may discard their hand and draw five cards" (Will of the Jeskai, Ruin Grinder): each decides (CR 101.4),
  // then those who chose to discard their hands at the same time, then draw (CR 608.2c).
  if ((m = new RegExp(`^Each (player|opponent) may discard their hand and draw ${NUM} cards$`, "i").exec(s))) {
    const who: PlayerRef = { ref: m[1]!.toLowerCase() === "player" ? "eachPlayer" : "eachOpponent" };
    const n = num(m[2]!);
    return [{ type: "eachMay", who, text: `discard your hand and draw ${m[2]} cards`, wheel: n, effects: [{ type: "discard", who: { ref: "choseThisWay" }, n: 0, hand: true }, { type: "draw", who: { ref: "choseThisWay" }, n }] }];
  }
  // Imposing Grandeur: "Each player may discard their hand and draw cards equal to the greatest mana value of a commander
  // they own on the battlefield or in the command zone": each player's own number, counted as they draw.
  if ((m = /^Each player may discard their hand and draw cards equal to (the greatest mana value of a commander they own .+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    if (!n || !("count" in n) || n.count.kind !== "commandersMv" || !n.count.who) return null;
    return [{ type: "eachMay", who: { ref: "eachPlayer" }, text: "discard your hand and draw cards equal to the greatest mana value of a commander you own on the battlefield or in the command zone", wheel: n, effects: [{ type: "discard", who: { ref: "choseThisWay" }, n: 0, hand: true }, { type: "draw", who: { ref: "choseThisWay" }, n }] }];
  }
  // "Discard your hand", "each opponent discards their hand", "discard all the cards in your hand" (CR 701.9b: no
  // choice to make). Wheels: "each player discards their hand, then draws seven cards" (all of them discard, then all
  // of them draw, CR 608.2c), "then draw that many cards", "then draws cards equal to the greatest number of cards a
  // player discarded this way" (Windfall).
  // Clive, Ifrit's Dominant: "you may discard your hand, then draw cards equal to your devotion to red": both, if you
  // choose to, even with no cards in hand (rulings).
  if ((m = /^[Yy]ou may discard your hand, then draw (.+)$/.exec(s))) {
    const inner = parseSpellsSentence(`Discard your hand, then draw ${m[1]}`, ctx);
    return inner ? [{ type: "may", effects: inner, text: `discard your hand, then draw ${m[1]}` }] : null;
  }
  // Flux: "Each player discards any number of cards, then draws that many cards": each chooses how many in APNAP order,
  // they discard at the same time (CR 101.4), then each draws as many as they discarded.
  if (/^Each player discards any number of cards, then draws that many cards$/.test(s))
    return [{ type: "discard", who: { ref: "eachPlayer" }, n: 99, upTo: true }, { type: "draw", who: { ref: "eachPlayer" }, n: { count: { kind: "discardedThisWay", who: { ref: "eachOne" } } } }];
  // Awaken the Erstwhile: "Each player discards all the cards in their hand, then creates that many 2/2 black Zombie
  // creature tokens": each as many as they discarded themselves, all of them created at once after the discards.
  if ((m = /^Each player discards all the cards in their hand, then creates that many (.+ tokens?)$/.exec(s))) {
    const fx = parseSentence(`Create two ${m[1]}`, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    if (tok?.type !== "createToken" || tok.who.ref !== "you" || tok.n !== 2 || tok.tapped || tok.attacking || tok.counters || tok.attachTo) return null;
    return [{ type: "discard", who: { ref: "eachPlayer" }, n: 0, hand: true }, { ...tok, who: { ref: "eachPlayer" }, n: { count: { kind: "discardedThisWay", who: { ref: "eachOne" } } } }];
  }
  if ((m = /^(Discard|.+? discards?) (?:all the cards in |all cards from )?(?:your|their|his or her) hand(?:, then draws? (.+))?$/i.exec(s)) && !/^Counter .+ unless /i.test(s)) {
    const who = /^Discard$/i.test(m[1]!) ? ({ ref: "you" } as const) : parsePlayer(m[1]!.replace(/ discards?$/i, ""), ctx);
    if (!who || (/^Discard$/i.test(m[1]!) && /your/.test(s) === false)) return null;
    const out: Effect[] = [{ type: "discard", who, n: 0, hand: true }];
    if (m[2] !== undefined) {
      // Each player draws as many as they discarded themselves.
      const own = who.ref === "eachPlayer" || who.ref === "eachOpponent" || who.ref === "choseWord" ? { who: { ref: "eachOne" } as const } : {};
      const k = new RegExp(`^${NUMX} cards?$`, "i").exec(m[2]);
      const n =
        k && !/^that many$/i.test(k[1]!) ? amt(k[1]!)
        : /^that many cards$/i.test(m[2]) ? { count: { kind: "discardedThisWay" as const, ...own } }
        // Dark Deal: "that many cards minus one", none for a player who discarded one or none (rulings).
        : /^that many cards minus one$/i.test(m[2]) ? { count: { kind: "discardedThisWay" as const, ...own }, plus: -1 }
        // Chandra, Flamecaller: "that many cards plus one".
        : /^that many cards plus one$/i.test(m[2]) ? { count: { kind: "discardedThisWay" as const, ...own }, plus: 1 }
        : /^cards equal to the greatest number of cards a player discarded this way$/i.test(m[2]) ? { count: { kind: "discardedThisWay" as const, greatest: true as const } }
        // "Then draw cards equal to your devotion to red" (Clive), counted after the discard (rulings).
        : who.ref === "you" && /^cards equal to your devotion to /i.test(m[2]) ? parseCount(m[2].replace(/^cards equal to /i, ""), ctx)
        // Change of Fortune: "then draw a card for each card you've discarded this turn": for any reason, this discard
        // too (rulings).
        : who.ref === "you" && /^a card for each card you've discarded this turn$/i.test(m[2]) ? parseCount(m[2].replace(/^a card for each /i, ""), ctx)
        : null;
      if (!n) return null;
      out.push({ type: "draw", who, n });
    }
    return out;
  }
  // "Target opponent discards half the cards in their hand, rounded down" (Lord Xander), "each player ... discards half the
  // cards in their hand. Round up each time." (Fraying Omnipotence): each player half their own hand, worked out before
  // anyone discards (rulings on Fraying Omnipotence, CR 107.1a).
  // Pox: "then discards a third of the cards in their hand. Round up each time.": a third, the same way (rulings: worked
  // out when that part is done).
  if ((m = /^(.+?) discards? (half|a third of) the cards in (your|their|his or her) hand(?:, rounded (up|down))?$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const half = roundOf(m[4], ctx);
    if (!who || !half || (who.ref === "you") !== (m[3]!.toLowerCase() === "your")) return null;
    return [{ type: "discard", who, n: { count: { kind: "cardsInHand", who: { ref: "eachOne" } }, half, ...(m[2] === "half" ? {} : { third: true as const }) } }];
  }
  // "Target opponent exiles a card from their hand" (Skullcap Snail): they choose it (rulings on Parallax Nexus).
  if ((m = /^(.+?) exiles (a|two|three) cards? from their hand$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "discard", who, n: num(m[2]!), exile: true }] : null;
  }
  // Ego Drain: "Exile a card from your hand": one of your choice, the same way.
  if ((m = /^Exile (a|two|three) cards? from your hand$/.exec(s))) return [{ type: "discard", who: { ref: "you" }, n: num(m[1]!), exile: true }];
  if ((m = new RegExp(`^(.+?) discards? ${NUMX} cards?( at random)?$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "discard", who, n: amt(m[2]!), random: !!m[3] }] : null;
  }
  // Disciple of Phenax, Cabal Interrogator (joined in body.ts): "Target player reveals a number of cards from their hand
  // equal to your devotion to black and discards the one of them you choose": they reveal that many of their choice, you
  // choose one (CR 701.9b), counted as it resolves (rulings).
  // Blackmail, Noggin Whack: "reveals three cards from their hand. You choose two of them. That player discards those
  // cards.": three of their choice, or all of them if they have fewer, then you choose two (rulings).
  if ((m = /^(.+?) reveals (X cards|a number of cards|three cards) from their hand(?: equal to (.+?))? and discards the (one|two) of them you choose$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const n = m[2] === "three cards" ? (m[3] ? null : 3) : m[2] === "X cards" ? (m[3] ? null : X) : m[3] ? parseCount(m[3], ctx) : null;
    return who && n ? [{ type: "takeFromHand", who, action: "discard", reveal: n, ...(m[4] === "two" ? { n: 2 } : {}) }] : null;
  }
  // Rag Man: "Target opponent reveals their hand and discards a creature card at random": one of the creature cards in it,
  // chosen at random (none if there are none).
  if ((m = /^(.+?) reveals their hand and discards an? ((?:(?!\bcards?\b).)+ card) at random$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const filter = parseSearchFilter(m[2]!);
    return who && filter ? [{ type: "lookAtHand", who, reveal: true }, { type: "discard", who, n: 1, random: true, filter }] : null;
  }
  // "Forage" as an instruction ("you may forage. If you do, ...", Treetop Sentries): exile three cards from your graveyard
  // or sacrifice a Food (CR 701.61a), the way chosen as it resolves; only a way that can be done fully can be chosen, and
  // with neither there's no foraging (rulings).
  if (/^[Ff]orage$/.test(s))
    return [
      {
        type: "either",
        options: [
          [{ type: "chooseFromGraveyard", n: 3, dest: "exile" }],
          [{ type: "pick", who: { ref: "you" }, filter: { kind: "object", types: [], subtypes: ["Food"], text: "Food" }, n: 1, action: "sacrifice" }],
        ],
        labels: ["Exile three cards from your graveyard", "Sacrifice a Food"],
        onlyDoable: true,
        forage: true,
      },
    ];
  // Flipping a coin (CR 705): see "If you win the flip, ..." in body.ts.
  if (/^[Ff]lip a coin$/.test(s)) return [{ type: "flipCoin" }];
  // Planar Chaos: "Whenever a player casts a spell, that player flips a coin. If they lose the flip, ...".
  if (ctx.eventPlayer && /^[Tt]hat player flips a coin$/.test(s)) {
    const who = parsePlayer("that player", ctx);
    return who ? [{ type: "flipCoin", who }] : null;
  }
  if (/^[Ff]lip a coin until you lose a flip$/.test(s)) return [{ type: "flipCoin", untilLose: true }];
  // Goblin Traprunner: "flip three coins", then "for each flip you win" counts the wins (CR 705).
  if ((m = /^[Ff]lip (two|three|four|five) coins$/.exec(s))) return [{ type: "flipCoin", n: num(m[1]!), ...(ctx.uncalledFlips ? { uncalled: true as const } : {}) }];
  // Clash (CR 701.30b): see "If you win, ..." in body.ts.
  if (/^Clash with an opponent$/i.test(s)) return [{ type: "clash" }];
  // Marvo, Deep Operative: "Whenever ~ attacks, clash with defending player": that opponent (CR 701.30b).
  if (/^Clash with defending player$/i.test(s) && ctx.defending) return [{ type: "clash", with: { ref: "eventPlayer" } }];
  // Rolling dice (CR 706.1a: "a d20", "N-sided dice"). A modifier in the same instruction ("and add the number of cards
  // in your hand", 706.2); "plus an additional six-sided die for each mana from Treasures spent to activate this
  // ability" (Mr. House).
  if ((m = new RegExp(`^[Rr]oll ${NUMX} (?:d(\\d+)|(\\w+)-sided (?:die|dice))( and ignore the lower roll| and choose one result)?(?: plus an additional (?:d\\d+|\\w+-sided die) for each (.+)| and (add|subtract) (.+))?$`).exec(s))) {
    const sides = m[2] ? Number(m[2]) : num(m[3]!);
    const n = amt(m[1]!);
    if (!sides || (m[4] && n !== 2)) return null;
    const choose = m[4] === " and choose one result";
    if (choose && (ctx.chooseResult || m[5] || m[6])) return null;
    if (choose) ctx.chooseResult = true;
    const roll: Extract<Effect, { type: "roll" }> = { type: "roll", sides, ...(n !== 1 ? { n } : {}), ...(m[4] ? (choose ? { chooseOne: true as const } : { keepHighest: true as const }) : {}) };
    if (m[5]) {
      const per = n === 1 ? parseCount(m[5], ctx, true) : null;
      if (!per) return null;
      roll.n = { ...per, plus: (per.plus ?? 0) + 1 };
    }
    if (m[6]) {
      // A modifier changes one die's result (every card with one rolls one die).
      const by = n === 1 ? parseCount(m[7]!, ctx) : null;
      if (!by) return null;
      roll[m[6] === "add" ? "add" : "subtract"] = by;
    }
    return [roll];
  }
  // Iron Mastiff: "roll a d20 for each player being attacked and ignore all but the highest roll": one die per player a
  // creature is attacking as it resolves (not a planeswalker or battle, CR 506.2), the highest the result (CR 706.1);
  // none for none.
  if ((m = /^[Rr]oll a d(\d+) for each (player|opponent) being attacked and ignore all but the highest roll$/.exec(s))) {
    const per = parseCount(`${m[2]}s being attacked`, ctx, true);
    return per ? [{ type: "roll", sides: Number(m[1]), n: per, keepHighest: true }] : null;
  }
  // "Each player rolls a d20" (Chaos Dragon): every player rolls one die; see Modification "cantAttackPlayers".
  if ((m = /^[Ee]ach player rolls a d(\d+)$/.exec(s))) return [{ type: "roll", sides: Number(m[1]), eachPlayer: true }];
  // Scry and surveil (CR 701.22, 701.25)
  // "... and you scry X" (Alibou, Ancient Witness).
  if ((m = new RegExp(`^(?:you )?(Scry|Surveil) ${NUMX}$`, "i").exec(s))) return [{ type: m[1]!.toLowerCase() === "scry" ? "scry" : "surveil", n: amt(m[2]!) }];
  // "Target player scries X, then draws a card" (Kozilek's Command, CR 701.22): that player looks and chooses.
  if ((m = new RegExp(`^(Target player|Target opponent) scries ${NUMX}$`).exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "scry", n: amt(m[2]!), who }] : null;
  }
  // Mesmeric Sliver: "fateseal 1" (CR 701.29a): look at the top N cards of an opponent's library, chosen as it resolves,
  // and put any number of them on the bottom, the rest on top, as a scry of their library.
  if ((m = new RegExp(`^(?:you )?[Ff]ateseal ${NUM}$`).exec(s))) return [{ type: "orderTop", who: { ref: "chosenPlayer" }, n: num(m[1]!), mayBottom: true, fateseal: true }];
  // "Discover 4" (CR 701.57a): exile until a nonland card with mana value 4 or less, cast it free or put it into your hand.
  // "Discover X, where X is its toughness": X is worked out as the instruction starts (body.ts defineX).
  if ((m = /^(?:[Yy]ou )?[Dd]iscover (\d+|X)$/.exec(s))) return [{ type: "discover", n: amt(m[1]!) }];
  // "If the discovered card's mana value is less than 10, create a number of tapped Treasure tokens equal to the
  // difference" (Hit the Mother Lode, CR 701.57c): none if it isn't less, or if nothing was discovered.
  if ((m = /^If the discovered card's mana value is less than (\d+), create a number of tapped Treasure tokens equal to the difference$/.exec(s)))
    return [{ type: "createToken", who: { ref: "you" }, n: { count: { kind: "discoveredBelow", n: Number(m[1]) } }, token: PREDEFINED_TOKENS.Treasure!, tapped: true }];
  // Learn (CR 701.48a): "You may discard a card. If you do, draw a card. If you didn't discard a card, you may reveal a
  // Lesson card you own from outside the game and put it into your hand." Players here have no sideboard (CR 100.4:
  // one is optional) and nothing else outside the game, so only the first part can happen.
  if (/^Learn$/i.test(s))
    return [
      { type: "may", effects: [{ type: "discard", who: { ref: "you" }, n: 1, random: false }], text: "discard a card" },
      { type: "if", cond: { kind: "youDid" }, effects: [{ type: "draw", who: { ref: "you" }, n: 1 }] },
    ];
  // Empower Jace (CR 701.71a)
  if ((m = new RegExp(`^Empower Jace ${NUMX}$`, "i").exec(s))) return [{ type: "empowerJace", n: amt(m[1]!) }];
  // Fighting (CR 701.14) and "deals damage equal to its power to"
  // Rivals' Duel: "Choose two target creatures that share no creature types. Those creatures fight each other." (body.ts
  // makes it one sentence): the two targets, neither dealing damage if either is illegal (CR 701.14b).
  if (/^Two target creatures that share no creature types fight each other$/.test(s) && !ctx.targets.length) {
    const what = parseObject("two target creatures that share no creature types", ctx);
    return what?.ref === "target" && what.n === 2 ? [{ type: "fight", a: { ref: "target", index: what.index }, b: { ref: "target", index: what.index + 1 } }] : null;
  }
  // "Choose target creature you control and target creature you don't control. ... Then those creatures fight each other"
  // (Tail Swipe): the two targets, neither dealing damage if either is illegal (CR 701.14b).
  if (/^(?:Then )?[Tt]hose creatures fight each other$/.test(s)) {
    const [a, b] = ctx.targets;
    const creature = (t: TargetSpec | undefined) => t?.kind === "object" && t.types?.length === 1 && t.types[0] === "Creature" && !t.optional && !t.divided;
    return ctx.targets.length === 2 && creature(a) && creature(b) && a!.controller === "you" && b!.controller === "opponent" ? [{ type: "fight", a: { ref: "target", index: 0 }, b: { ref: "target", index: 1 } }] : null;
  }
  // Beastie Beatdown: "Choose target creature you control and target creature an opponent controls. ... The creature you
  // control deals damage equal to its power to the creature an opponent controls": the two targets, no damage if either is
  // illegal (rulings).
  if (/^The creature you control deals damage equal to its power to the creature an opponent controls$/.test(s)) {
    const [a, b] = ctx.targets;
    const creature = (t: TargetSpec | undefined) => t?.kind === "object" && t.types?.length === 1 && t.types[0] === "Creature" && !t.optional && !t.divided && !t.many;
    return ctx.targets.length === 2 && creature(a) && creature(b) && a!.controller === "you" && b!.controller === "opponent" ? [{ type: "bite", a: { ref: "target", index: 0 }, b: { ref: "target", index: 1 } }] : null;
  }
  if ((m = /^(.+?) fights (.+)$/i.exec(s))) {
    // "Choose target creature an opponent controls. ... Target creature you control fights that creature" (Time to Feed):
    // "that creature" is the one named before this sentence's new target.
    const thatFirst = /^that creature$/i.test(m[2]!) && /\btarget\b/i.test(m[1]!);
    const b0 = thatFirst ? parseObject(m[2]!, ctx) : undefined;
    const a = thatFirst && !b0 ? null : parseObject(m[1]!, ctx);
    const b = a && (b0 ?? parseObject(m[2]!, ctx));
    return a && b && !isGroup(a) && !isGroup(b) && !isSeveral(a) && !isSeveral(b) ? [{ type: "fight", a, b }] : null;
  }
  // "It deals damage equal to its power to target creature an opponent controls and that creature deals damage equal to
  // its power to ~" (Stalking Yeti): each deals damage to the other at once, and neither does if either is gone, as in a
  // fight (CR 701.14b; rulings).
  if ((m = /^(it|~) deals damage equal to its power to (target creature .+?) and that creature deals damage equal to its power to (it|~)$/i.exec(s)) && (m[1] === "~" || ctx.selfIt) && (m[3] === "~" || ctx.selfIt)) {
    const b = parseObject(m[2]!, ctx);
    return b?.ref === "target" && !isSeveral(b) ? [{ type: "fight", a: { ref: "self" }, b }] : null;
  }
  if ((m = /^(.+?) deals damage to itself equal to its power$/i.exec(s)) && m[1] !== "~") {
    // The creature is the source of damage to itself (its deathtouch, lifelink, infect apply).
    const a = parseObject(m[1]!, ctx);
    // Wave of Reckoning: "Each creature deals damage to itself equal to its power": each one, all at the same time.
    // The Akroan War: "Each tapped creature ..." the same, those tapped as it resolves.
    if (a && isGroup(a) && /^each (?:tapped )?creature\b/i.test(m[1]!)) return [{ type: "bite", a, b: a, self: true }];
    return a && !isGroup(a) && !isSeveral(a) ? [{ type: "bite", a, b: a }] : null;
  }
  // "Each of those creatures deals damage equal to its power to ~" (Polukranos, Living Inferno): each of the targets
  // still legal (CR 608.2b), all at the same time, each as the source of its own damage.
  if ((m = /^Each of (those creatures|them) deals damage equal to its power to (.+)$/i.exec(s))) {
    const a = parseObject(m[1]!, ctx);
    const b = a && parseObject(m[2]!, ctx);
    return a?.ref === "target" && b && !isGroup(b) && !isSeveral(b) ? [{ type: "bite", a, b }] : null;
  }
  // Signature Slam: "each modified creature you control deals damage equal to its power to target creature you don't
  // control": each of them as this resolves, all at once, each the source of its own damage; none if the target is illegal.
  // Bartz and Boko: "each other Bird you control" the same way. Moonlight Hunt: "Choose target creature you don't control.
  // Each creature you control that's a Wolf or a Werewolf deals damage equal to its power to that creature" (body.ts).
  // Nissa's Judgment: "each creature you control with a +1/+1 counter on it ... to up to one target creature an opponent
  // controls": with no target chosen, nothing is dealt damage.
  if ((m = /^[Ee]ach ((?:modified )?creature you control|creature you control with a \+1\/\+1 counter on it|other [A-Z][a-z]+ you control|creature you control that's an? [A-Z][a-z]+ or an? [A-Z][a-z]+) deals damage equal to its power to ((?:up to one )?target creature (?:you don't control|an opponent controls))$/.exec(s))) {
    const a = parseObject(`each ${m[1]}`, ctx);
    const b = a && parseObject(m[2]!, ctx);
    return a?.ref === "each" && a.filter.controller === "you" && b?.ref === "target" && !isSeveral(b) ? [{ type: "bite", a, b }] : null;
  }
  // "Up to two target creatures you control each deal damage equal to their power to another target creature" (Band
  // Together), "... each get +1/+0 until end of turn. They each deal damage equal to their power to ..." (Tandem
  // Takedown): each target still legal, all at once, each the source of its own damage; none if the last target is
  // illegal (rulings on Tandem Takedown).
  if ((m = /^(They|(?:Up to two|One or two|Two) target creatures you control) each deal damage equal to their power to (.+)$/.exec(s))) {
    const a = parseObject(m[1] === "They" ? "them" : m[1]!, ctx);
    const b = a && parseObject(m[2]!, ctx);
    return a?.ref === "target" && a.n && b?.ref === "target" && !isGroup(b) && !isSeveral(b) ? [{ type: "bite", a, b }] : null;
  }
  // "Target creature you control deals damage equal to its power to each other creature and each opponent" (Chandra's
  // Ignition): that creature is the source (rulings), its power as this resolves; "other" is other than it.
  if ((m = /^(Target creature(?: you control)?) deals damage equal to its power to (each other creature)(?: and (each opponent|each player))?$/.exec(s))) {
    const a = parseObject(m[1]!.toLowerCase(), ctx);
    if (a?.ref !== "target" || a.n) return null;
    const to = parseDamageRecipient(m[2]!, ctx);
    if (to?.ref !== "each" || !(to.other || to.otherThan === a.index)) return null;
    const { other: _, ...rest } = to;
    return [{ type: "damage", amount: { count: { kind: "power", of: a } }, to: { ...rest, otherThan: a.index }, ...(m[3] ? { also: [{ ref: m[3] === "each opponent" ? "eachOpponent" : "eachPlayer" }] } : {}), by: { target: a.index } }];
  }
  // Showstopping Surprise: "Choose target creature you control. Turn it face up if it's face down. Then it deals damage
  // equal to its power to each other creature": the target, as above, its power as it is now (rulings: a face-down one
  // that stayed face down deals 2).
  if ((m = /^(?:[Tt]hen it|It) deals damage equal to its power to (each other creature)$/.exec(s)) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]!.many && !ctx.targets[ctx.lastObjectTarget]!.optional && !ctx.selfIt && !ctx.subjectIt) {
    const index = ctx.lastObjectTarget;
    const to = parseDamageRecipient(m[1]!, ctx);
    if (to?.ref !== "each" || !(to.other || to.otherThan === index)) return null;
    const { other: _, ...rest } = to;
    return [{ type: "damage", amount: { count: { kind: "power", of: { ref: "target", index } } }, to: { ...rest, otherThan: index }, by: { target: index } }];
  }
  // "Target creature you control deals X damage to any other target and X damage to itself, where X is its power"
  // (Self-Destruct): both at once, from that creature, X as this resolves; with the other target illegal, it's still dealt
  // to itself; with that creature illegal, none (rulings).
  if ((m = /^(Target creature you control) deals damage equal to its power to (any other target) and to itself$/.exec(s))) {
    const a = parseObject(m[1]!.toLowerCase(), ctx);
    if (a?.ref !== "target" || a.n) return null;
    const to = parseDamageRecipient(m[2]!, ctx);
    return to?.ref === "anyTarget" ? [{ type: "damage", amount: { count: { kind: "power", of: a } }, to, also: [{ ref: "target", index: a.index }], by: { target: a.index } }] : null;
  }
  // Asmoranomardicadaistinaculdacar: "Target creature deals 6 damage to itself": that creature is the source (its
  // deathtouch, lifelink and infect apply); none if it's an illegal target as this resolves (CR 608.2b).
  if ((m = /^(Target creature) deals (\d+) damage to itself$/.exec(s))) {
    const a = parseObject(m[1]!.toLowerCase(), ctx);
    return a?.ref === "target" && !a.n ? [{ type: "damage", amount: Number(m[2]), to: a, by: { target: a.index } }] : null;
  }
  // "Target creature you control deals damage equal to its power to target player" (Gravitic Punch): from that creature,
  // its power as this resolves; none if either target is illegal (rulings).
  // Origin of Thor: "... to each opponent", each of them at once, from that creature.
  if ((m = /^(Target creature you control) deals damage equal to its power to (target (?:player|opponent)|each opponent)$/.exec(s))) {
    const a = parseObject(m[1]!.toLowerCase(), ctx);
    if (a?.ref !== "target" || a.n) return null;
    const to = parseDamageRecipient(m[2]!, ctx);
    return (to?.ref === "target" && !to.n) || to?.ref === "eachOpponent" ? [{ type: "damage", amount: { count: { kind: "power", of: a } }, to, by: { target: a.index } }] : null;
  }
  // "Target creature you control deals damage equal to twice its power to target creature you don't control" (Polliwallop).
  if ((m = /^(target creature you control) deals damage equal to twice its power to (target .+)$/i.exec(s))) {
    const a = parseObject(m[1]!, ctx);
    const b = a && parseObject(m[2]!, ctx);
    return a?.ref === "target" && b?.ref === "target" && !a.n && !b.n ? [{ type: "bite", a, b, times: 2 }] : null;
  }
  // Goblin Tinkerer: "Destroy target artifact. That artifact deals damage equal to its mana value to ~": from the artifact
  // as it last existed on the battlefield (CR 608.2h), destroyed or not (an indestructible one is still there).
  if (/^That artifact deals damage equal to its mana value to ~$/.test(s) && ctx.lastObjectTarget !== undefined && ctx.lastObjectTarget === ctx.targets.length - 1) {
    const spec = ctx.targets[ctx.lastObjectTarget]!;
    if (spec.kind !== "object" || spec.many || spec.types?.join() !== "Artifact") return null;
    const a = { ref: "target" as const, index: ctx.lastObjectTarget };
    return [{ type: "damage", amount: { count: { kind: "manaValue", of: a } }, to: { ref: "self" }, by: { target: a.index, lastKnown: true } }];
  }
  // Dizzying Gaze: "{R}: Enchanted creature deals 1 damage to target creature with flying": damage from the creature the
  // Aura enchants as the ability resolves (as it last existed if the Aura has left, CR 608.2h), not from the Aura.
  if ((m = /^Enchanted creature deals (\d+) damage to (target creature(?: with [a-z]+)?)$/.exec(s)) && !ctx.spell && ctx.activated) {
    const to = parseDamageRecipient(m[2]!, ctx);
    return to && "ref" in to && to.ref === "target" ? [{ type: "damage", amount: Number(m[1]), to, by: "attached" }] : null;
  }
  // Enslave: "At the beginning of your upkeep, enchanted creature deals 1 damage to its owner": from that creature (not the
  // Aura), to whoever owns it (CR 108.3).
  if ((m = /^[Ee]nchanted creature deals (\d+) damage to its owner$/.exec(s)) && !ctx.spell) return [{ type: "damage", amount: Number(m[1]), to: { ref: "hostOwner" }, by: "attached" }];
  // Compel Brutality: "Target planeswalker you control deals damage equal to its loyalty to target creature or
  // planeswalker an opponent controls": from that planeswalker, its loyalty as this resolves (rulings); none if it's gone.
  if ((m = /^(Target planeswalker you control) deals damage equal to its loyalty to (target creature or planeswalker an opponent controls)$/.exec(s))) {
    const a = parseObject(m[1]!, ctx);
    const b = a && parseObject(m[2]!, ctx);
    return a?.ref === "target" && !a.n && b?.ref === "target" && !b.n ? [{ type: "bite", a, b, loyalty: true }] : null;
  }
  if ((m = /^(.+?) deals damage equal to its power to (.+)$/i.exec(s))) {
    // The source dealing damage equal to its own power: damage from it, its power as it is or as it last
    // existed if it's gone, like after it's sacrificed to pay for this (CR 608.2h).
    if (m[1] === "~") {
      const to = parseDamageRecipient(m[2]!, ctx);
      return to ? [{ type: "damage", amount: { count: { kind: "power", of: { ref: "self" } } }, to }] : null;
    }
    // Flourishing Grapple: "Target creature you control deals damage equal to its power to that permanent": "that
    // permanent" is the one named before, not this new target, so it's read first.
    const thatOne = /^target /i.test(m[1]!) && /^that (?:permanent|creature|planeswalker)$/i.test(m[2]!) ? parseObject(m[2]!, ctx) : undefined;
    if (thatOne !== undefined) {
      const a = parseObject(m[1]!, ctx);
      return a?.ref === "target" && !a.n && thatOne?.ref === "target" && !thatOne.n && thatOne.index !== a.index ? [{ type: "bite", a, b: thatOne }] : null;
    }
    const a = parseObject(m[1]!, ctx);
    // "Enchanted creature deals damage equal to its power to any other target" (Pain for All): damage from that creature,
    // which can't be the target.
    if (a?.ref === "attached" && /^enchanted creature$/i.test(m[1]!) && /^any other target$/i.test(m[2]!)) {
      const to = parseDamageRecipient("any target", ctx);
      if (to?.ref !== "anyTarget") return null;
      ctx.targets[to.index] = { ...ctx.targets[to.index]!, notSourceHost: true, text: "any other target" };
      return [{ type: "damage", amount: { count: { kind: "power", of: a } }, to, by: "attached" }];
    }
    // Consuming Ferocity: "it deals damage equal to its power to its controller", the enchanted creature, to whoever controls it.
    if (a?.ref === "attached" && /^enchanted creature$/i.test(m[1]!) && /^its controller$/i.test(m[2]!)) return [{ type: "damage", amount: { count: { kind: "power", of: a } }, to: { ref: "hostController" }, by: "attached" }];
    // Bind the Monster: "Enchanted creature deals damage equal to its power to you" (reworded from "It deals damage to you
    // equal to its power"): from that creature, to the Aura's controller.
    if (a?.ref === "attached" && /^enchanted creature$/i.test(m[1]!) && /^you$/i.test(m[2]!)) return [{ type: "damage", amount: { count: { kind: "power", of: a } }, to: { ref: "you" }, by: "attached" }];
    // "Target creature you control deals damage equal to its power to any target" (Soul's Fire): damage from that creature.
    // "... to any other target" (Special Move): not that creature (CR 115.3).
    if (a?.ref === "target" && !a.n && /^any (?:other )?target$/i.test(m[2]!)) {
      const to = parseDamageRecipient(m[2]!, ctx);
      return to ? [{ type: "damage", amount: { count: { kind: "power", of: a } }, to, by: { target: a.index } }] : null;
    }
    // Backlash: "Tap target untapped creature. That creature deals damage equal to its power to its controller": damage
    // from that creature, its power as this resolves, to whoever controls it then (CR 608.2c); none if it's illegal.
    if (a?.ref === "target" && !a.n && /^its controller$/i.test(m[2]!)) {
      const to = parseDamageRecipient(m[2]!, ctx);
      return to && "ref" in to && to.ref === "targetController" && to.index === a.index ? [{ type: "damage", amount: { count: { kind: "power", of: a } }, to, by: { target: a.index } }] : null;
    }
    const b = a && parseObject(m[2]!, ctx);
    return a && b && !isGroup(a) && !isGroup(b) && !isSeveral(a) ? [{ type: "bite", a, b }] : null;
  }
  // Counterspells, maybe "unless its controller pays {2}" (CR 118.12)
  // "When you next cast an instant or sorcery spell this turn, copy that spell" (a delayed trigger, CR 603.7).
  // "When you cast your next instant or sorcery spell this turn, ..." (Twinferno): the same.
  if ((m = /^[Ww]hen you cast your next (.+? spell) this turn, (.+)$/.exec(s))) s = `When you next cast ${/^[aeiou]/.test(m[1]!) ? "an" : "a"} ${m[1]} this turn, ${m[2]}`;
  if ((m = /^[Ww]hen you next cast (an? .+?)( from your hand)? this turn, (.+?)(?:,? and you may choose new targets for the cop(?:y|ies))?$/.exec(s))) {
    const fromHand = !!m[2];
    m.splice(2, 1);
    const filter = parseTargetPhrase(m[1]!.replace(/^an? /, ""));
    if (filter?.kind !== "spell") return null;
    const before = ctx.targets.length;
    // Brass Infiniscope: "When you next cast a spell with {X} in its mana cost this turn, you draw a card and gain half X
    // life, rounded down": the X of that spell (CR 107.3a), as it is on the stack, or last was (rulings).
    const spellX = filter.xInCost && /\bX\b/.test(m[2]!) && !/\bwhere X is\b/.test(m[2]!);
    const xBody = spellX ? parseBody(`${m[2]!.replace(/^./, (c) => c.toUpperCase())}.`, { castSpell: true, ownX: true }) : undefined;
    if (xBody === null || (xBody && xBody.targets.length)) return null;
    // Vivien, Monsters' Advocate: "search your library for a creature card with lesser mana value, put it onto the
    // battlefield, then shuffle": less than that spell's mana value, X included (rulings), as it resolves.
    const lesser = !xBody ? /^(search your library for an? [a-z]+ card) with lesser mana value(, .+)$/.exec(m[2]!) : null;
    const inner0 = xBody ? replaceX(xBody.effects, { count: { kind: "castSpellX" } }) : parseSentence((lesser ? `${lesser[1]}${lesser[2]}` : m[2]!).replace(/^./, (c) => c.toUpperCase()), { ...ctx, castSpell: true, spellIt: true });
    if (!inner0 || ctx.targets.length !== before) return null;
    let inner = inner0;
    if (lesser) {
      const search = inner0[0];
      if (inner0.length !== 1 || search?.type !== "search" || !search.filter || search.filter.bound || search.filter.manaValue) return null;
      inner = [{ ...search, filter: { ...search.filter, bound: { key: "manaValue", at: "most", amount: { count: { kind: "manaValue", of: { ref: "castSpell" } }, plus: -1 } }, text: `${search.filter.text} with lesser mana value` } }];
    }
    if (/choose new targets/.test(s)) for (const y of inner) if (y.type === "copySpell") y.newTargets = true;
    return [{ type: "nextCast", filter, effects: inner, text: m[2]!, ...(fromHand ? { fromHand: true as const } : {}) }];
  }
  // "The next noncreature spell you cast this turn has cascade" (Dark Apostle), "the next instant spell and the next sorcery
  // spell you cast this turn each have cascade" (Smoldering Stagecoach): the spell gains cascade as it's cast and it
  // triggers then; each such effect is an instance of its own (rulings, CR 702.85c).
  // TARDIS's "and you may planeswalk": only in a Planechase game; in any other, nothing happens (CR 701.31a, rulings).
  // "Target player adds two mana of any one color. The next spell they cast this turn has cascade" (Bigger on the Inside):
  // the targeted player's next spell (rulings: the effect applies to it as they start casting it).
  // Crackling Spellslinger: "the next instant or sorcery spell you cast this turn has storm": its own storm ability, the
  // same way (CR 702.40a).
  if ((m = /^[Tt]he next (instant or sorcery spell|(?:[a-z]+ )?spell) you cast this turn has storm$/.exec(s))) {
    const filter = parseTargetPhrase(m[1]!);
    return filter?.kind === "spell" ? [{ type: "nextCast", filter, effects: [], text: `the next ${m[1]} you cast this turn has storm`, storm: true }] : null;
  }
  if ((m = /^[Tt]he next ((?:[a-z]+ )?spell)(?: and the next ([a-z]+ spell))? (you|they) cast this turn (?:has|each have) cascade(?: and you may planeswalk)?$/.exec(s)) && !!m[2] === /each have/.test(s)) {
    const who: PlayerRef | null = m[3] === "you" ? null : ctx.lastPlayerTarget !== undefined && !ctx.targets[ctx.lastPlayerTarget]?.many ? { ref: "target", index: ctx.lastPlayerTarget } : null;
    if (m[3] === "they" && !who) return null;
    const out: Effect[] = [];
    for (const w of [m[1]!, m[2]].filter((x): x is string => !!x)) {
      const filter = parseTargetPhrase(w);
      if (filter?.kind !== "spell") return null;
      out.push({ type: "nextCast", filter, effects: [], text: `the next ${w} ${m[3]} cast this turn has cascade`, cascade: true, ...(who ? { who } : {}) });
    }
    return out;
  }
  // "The next spell you cast this turn can't be countered" (Mistrise Village), "the next creature spell ..." (Insist): the
  // first such spell, as it's cast; each such effect is used up by it.
  if ((m = /^[Tt]he next ((?:[a-z]+ |instant or sorcery )?spell) you cast this turn can't be countered$/.exec(s))) {
    const filter = parseTargetPhrase(m[1]!);
    return filter?.kind === "spell" ? [{ type: "nextCast", filter, effects: [], text: `the next ${m[1]} you cast this turn can't be countered`, uncounterable: true }] : null;
  }
  // Progenitor's Icon: "The next spell of the chosen type you cast this turn can be cast as though it had flash" (CR
  // 702.8a): the type chosen as the source entered, bound as this resolves; the first such spell uses it up.
  // Scout's Warning: "The next creature card you play this turn can be played as though it had flash": a creature card
  // is only ever cast, so the next creature spell (CR 702.8a).
  if (/^[Tt]he next creature card you play this turn can be played as though it had flash$/.test(s)) s = "The next creature spell you cast this turn can be cast as though it had flash";
  if ((m = /^[Tt]he next (spell of the chosen type|(?:[a-z]+ )?spell) you cast this turn can be cast as though it had flash$/.exec(s))) {
    const filter: TargetSpec | null = m[1] === "spell of the chosen type" ? { kind: "spell", chosen: "type", text: "spell of the chosen type" } : parseTargetPhrase(m[1]!);
    return filter?.kind === "spell" ? [{ type: "nextCast", filter, effects: [], text: `the next ${m[1]} you cast this turn can be cast as though it had flash`, flash: true }] : null;
  }
  // Copying spells (CR 707.10): "Copy target instant or sorcery spell", and in "when you cast" abilities "copy it".
  // Double Major: "Copy target creature spell you control, except it isn't legendary if the spell is legendary" (CR 707.9b):
  // the copy's copiable values aren't legendary, nor is the token it becomes (CR 608.3f).
  // Resonance Technician: "Copy target instant or sorcery spell you control with mana value X", the X of the ability's
  // "Tap X untapped artifacts you control" (CR 107.3a, TargetSpec.xRange).
  // Myojin of Cryptic Dreams: "Copy target permanent spell you control three times" (each copy becomes a token, CR 608.3f).
  // Errant, Street Artist: "Copy target spell you control that wasn't cast" (a copy, CR 707.10).
  // Mirror Sheen: "Copy target instant or sorcery spell that targets you": one with you among its targets, whoever
  // controls it (rulings).
  const targetsYou = /^(Copy target (?:instant or sorcery |instant |sorcery )?spell) that targets you$/i.exec(s);
  if (targetsYou) s = targetsYou[1]!;
  // Fork: "Copy target instant or sorcery spell, except that the copy is red": its copiable color is red, whatever its mana
  // cost says (CR 707.9b, rulings), the mana cost the same.
  if ((m = /^Copy target (.*?spell(?: you control)?(?: with mana value (?:X|\d+ or less)| that wasn't cast)?)(, except it isn't legendary if the spell is legendary|, except that the copy is (white|blue|black|red|green))?( twice| three times)?$/i.exec(s))) {
    if (/ X$/.test(m[1]!) && !ctx.activated) return null;
    const parsed = parseTargetPhrase(m[1]!, { x: true });
    const spec = targetsYou && parsed?.kind === "spell" ? { ...parsed, targetsWhat: "you" as const, text: `${parsed.text} that targets you` } : parsed;
    const n = m[4] === " twice" ? 2 : m[4] ? 3 : 1;
    const except = m[3] ? { colors: [COLOR_WORDS[m[3].toLowerCase()]!] } : m[2] ? { notLegendary: true } : undefined;
    return spec?.kind === "spell" ? [{ type: "copySpell", spell: { target: addTarget(ctx, spec) }, n, newTargets: false, ...(except ? { except } : {}) }] : null;
  }
  // Meletis Charlatan: "The controller of target instant or sorcery spell copies it and may choose new targets for the
  // copy" (body.ts joins the two sentences): any such spell, anyone's; its controller controls the copy and chooses the new
  // targets (rulings, CR 707.10).
  if ((m = /^The controller of target ((?:instant or sorcery |instant |sorcery )?spell) copies it and may choose new targets for the copy$/.exec(s))) {
    const spec = parseTargetPhrase(m[1]!);
    return spec?.kind === "spell" ? [{ type: "copySpell", spell: { target: addTarget(ctx, spec) }, n: 1, newTargets: true, byController: true }] : null;
  }
  // Copying an ability on the stack (CR 707.10, 707.10c): Strionic Resonator's "Copy target triggered ability you control.
  // You may choose new targets for the copy." (the copy is controlled by you, its source the same, CR 113.7a).
  // Gogo, Master of Mimicry: "... you control X times", the X paid for the ability (CR 107.3a).
  // The Peregrine Dynamo: "... from another legendary source that's not a commander": a legendary permanent, spell or
  // card in any zone (rulings), not the Dynamo itself, and not a commander (CR 903.3).
  if ((m = /^Copy target ((?:activated or )?triggered ability|activated ability) you control( from an? (colorless|artifact|creature|enchantment|land|planeswalker) source| from another legendary source that's not a commander)?( X times| twice)?$/i.exec(s))) {
    // Mister Fantastic: "Copy target triggered ability you control twice": two copies (CR 707.10).
    const twice = m[4] === " twice";
    if (m[4] && !twice && (!ctx.activated || m[2])) return null;
    const from = m[3]?.toLowerCase();
    const legendary = !!m[2] && !m[3];
    if (legendary && !ctx.activated) return null;
    const abilityFrom = legendary ? { supertypes: ["Legendary"], another: true as const, notCommander: true as const } : from === "colorless" ? { colorless: true as const } : from ? { types: [from[0]!.toUpperCase() + from.slice(1)] } : undefined;
    const spec: TargetSpec = { ...stackSpec(m[1]!), controller: "you", ...(abilityFrom ? { abilityFrom } : {}), text: `target ${m[1]!.toLowerCase()} you control${m[2] ?? ""}` };
    return [{ type: "copySpell", spell: { target: addTarget(ctx, spec) }, n: twice ? 2 : m[4] ? X : 1, newTargets: false }];
  }
  // Return the Favor: "Copy target instant spell, sorcery spell, activated ability, or triggered ability": a spell or an
  // ability on the stack (CR 707.10, 115.1c-d).
  if ((m = /^Copy target (.+)$/i.exec(s)) && /\babilit/.test(m[1]!) && /\bspell\b/.test(m[1]!)) {
    const spec = mixedStackSpec(m[1]!);
    return spec && [{ type: "copySpell", spell: { target: addTarget(ctx, spec) }, n: 1, newTargets: false }];
  }
  // Sevinne's Reclamation: "you may copy ~ and may choose a new target for the copy", made as it resolves (rulings).
  if (ctx.spell && /^[Yy]ou may copy ~ and may choose a new target for the copy$/.test(s))
    return [{ type: "may", effects: [{ type: "copySpell", spell: "self", n: 1, newTargets: true }], text: "copy ~ (you may choose a new target for the copy)" }];
  // Malicious Affliction: "When you cast ~, if a creature died this turn, you may copy ~ and may choose a new target for the
  // copy": the spell that triggered it (CR 707.10, 707.10c); the "you may" is its own.
  if (ctx.selfCastSpell && /^[Cc]opy ~ and may choose a new target for the copy$/.test(s)) return [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }];
  // Wild Ricochet: "You may choose new targets for target instant or sorcery spell. Then copy that spell."
  if (!ctx.castSpell && !ctx.selfCastSpell && /^(?:Then )?copy that spell$/i.test(s) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "spell" && !ctx.targets[ctx.lastObjectTarget]!.stackAbilities)
    return [{ type: "copySpell", spell: { target: ctx.lastObjectTarget }, n: 1, newTargets: false }];
  // Aether Spike: "Choose target spell. ... Counter that spell unless its controller pays {1} for each {E} paid this way"
  // (body.ts makes the payment {X}, the energy paid): the spell chosen first.
  if (!ctx.castSpell && !ctx.selfCastSpell && (m = /^Counter that spell unless its controller pays (.+)$/.exec(s)) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "spell" && !ctx.targets[ctx.lastObjectTarget]!.stackAbilities) {
    const unless = parseUnlessPays(m[1]!, ctx);
    return unless ? [{ type: "counterSpell", index: ctx.lastObjectTarget, unless }] : null;
  }
  // "When you cast this spell, any player may sacrifice a creature of their choice. If a player does, counter ~" (Brain Gorgers).
  if (ctx.selfCastSpell && /^[Cc]ounter (?:~|it|this spell)$/.test(s)) return [{ type: "counterSpell", index: -1, cause: true }];
  // Storm of Saruman: "copy it, except the copy isn't legendary" (CR 707.9b; a permanent spell's copy becomes a
  // nonlegendary token, CR 608.3f).
  // Storm King's Thunder: "copy that spell X times", the X of the spell that made the delayed trigger; Photon Blast
  // Barrage: "When you cast ~, copy it X times", its own X (rulings: X copies, none if X is 0).
  // Bygone Marvels: "When you cast this spell, ... copy this spell twice" ("this spell" is ~ by now).
  // Tawnos, the Toymaker: "copy it, except the copy is an artifact in addition to its other types" (CR 707.9b): the token
  // the copy becomes is one too (CR 608.3f).
  if ((ctx.castSpell || ctx.selfCastSpell) && (m = /^[Cc]opy (?:it|that spell|this spell), except the copy is (an artifact) in addition to its other types$/.exec(s))) {
    const except = parseCopyExcept(`it's ${m[1]} in addition to its other types`);
    return except?.addTypes?.length === 1 && !except.addSubtypes?.length ? [{ type: "copySpell", spell: "cause", n: 1, newTargets: false, except }] : null;
  }
  if ((ctx.castSpell || ctx.selfCastSpell) && (m = /^[Cc]opy (?:it|that spell|this spell)( twice| X times)?(, except the copy isn't legendary)?$/.exec(s) ?? (ctx.selfCastSpell ? /^[Cc]opy ~( twice)?()$/.exec(s) : null))) return [{ type: "copySpell", spell: "cause", n: m[1] === " X times" ? X : m[1] ? 2 : 1, newTargets: false, ...(m[2] ? { except: { notLegendary: true as const } } : {}) }];
  // Bonus Round: "that player copies it and may choose new targets for the copy": the caster copies it and controls the
  // copy (rulings, CR 707.10).
  if (ctx.castSpell && /^[Tt]hat player copies (?:it|that spell) and may choose new targets for the copy$/.test(s)) return [{ type: "copySpell", spell: "cause", n: 1, newTargets: true, byController: true }];
  // Unbound Flourishing: "Whenever you cast a permanent spell with a mana cost that contains {X}, double the value of X":
  // the X of that spell while it's on the stack (CR 107.3a); no more mana is paid (rulings).
  if (ctx.castSpell && /^[Dd]ouble the value of X$/.test(s)) return [{ type: "doubleX" }];
  // Rings of Brighthearth: "copy that ability", the one activated (CR 707.10).
  if (ctx.activatedAbility && /^[Cc]opy that ability$/.test(s)) return [{ type: "copySpell", spell: "cause", n: 1, newTargets: false }];
  // Thousand-Year Storm: "copy it for each other instant and sorcery spell you've cast before it this turn": those cast
  // before it, not after (counted from when it was cast), countered ones too (rulings).
  if (ctx.castSpell && /^[Cc]opy it for each other instant and sorcery spell you've cast before it this turn$/.test(s)) return [{ type: "copySpell", spell: "cause", n: "stormInstantSorcery", newTargets: false }];
  // Show of Confidence: "When you cast this spell, copy it for each other instant and sorcery spell you've cast this turn":
  // every one cast before the ability resolves, those cast in response too (rulings), but not this one.
  if (ctx.selfCastSpell && /^[Cc]opy it for each other instant and sorcery spell you've cast this turn$/.test(s)) return [{ type: "copySpell", spell: "cause", n: "otherInstantSorcery", newTargets: false }];
  // "When you cast this spell, copy it for each time you've cast your commander from the command zone this game", counted
  // as the ability resolves (rulings on the commander Storms).
  if ((ctx.castSpell || ctx.selfCastSpell) && (m = /^[Cc]opy (?:it|that spell|this spell) for each (.+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx, true);
    return n && [{ type: "copySpell", spell: "cause", n, newTargets: false }];
  }
  // Abilities on the stack (CR 115.1c-d): "Counter target spell, activated ability, or triggered ability", "Counter target
  // activated ability", "Counter target spell or ability unless its controller pays {2}".
  if ((m = /^Counter (up to one )?target (spell, activated ability, or triggered ability|spell or ability|activated or triggered ability|activated ability|triggered ability)(?: unless its controller pays (.+))?$/i.exec(s))) {
    const unless = m[3] === undefined ? undefined : parseUnlessPays(m[3], ctx);
    if (unless === null || (m[1] && unless)) return null;
    const spec = stackSpec(m[2]!);
    return [{ type: "counterSpell", index: addTarget(ctx, m[1] ? { ...spec, optional: true, text: `up to one ${spec.text}` } : spec), ...(unless ? { unless } : {}) }];
  }
  // Nimble Obstructionist: "Counter target activated or triggered ability you don't control" (no teammates here: an
  // opponent's). Green Slime: "... from an artifact or enchantment source" (its source as it is, or as it last existed).
  // Then "If a permanent's ability is countered this way, destroy that permanent" (Green Slime), "... activated abilities
  // of that permanent can't be activated this turn" (Trickbind), joined to it by body.ts.
  if ((m = /^Counter target (activated or triggered ability|activated ability|triggered ability)(?: (you don't control)| from an? (artifact|enchantment|creature|land)(?: or (artifact|enchantment|creature|land))? source)?(?:, and if a permanent's ability is countered this way, (destroy that permanent|activated abilities of that permanent can't be activated this turn))?(?: unless its controller pays (.+))?$/i.exec(s)) && (m[2] || m[3] || m[5])) {
    // Ayesha Tanaka: "... from an artifact source unless that ability's controller pays {W}" (body.ts made it "its").
    const unless = m[6] === undefined ? undefined : parseUnlessPays(m[6], ctx);
    if (unless === null || (unless && m[5])) return null;
    const from = [m[3], m[4]].filter((x): x is string => !!x).map((x) => x[0]!.toUpperCase() + x.slice(1));
    const spec: TargetSpec = { ...stackSpec(m[1]!), ...(m[2] ? { controller: "opponent" as const } : {}), ...(from.length ? { abilityFrom: { types: from } } : {}), text: `target ${m[1]!.toLowerCase()}${m[2] ? " you don't control" : from.length ? ` from an ${from.join(" or ").toLowerCase()} source` : ""}` };
    return [{ type: "counterSpell", index: addTarget(ctx, spec), ...(m[5] ? { thenSource: m[5] === "destroy that permanent" ? ("destroy" as const) : ("cantActivate" as const) } : {}), ...(unless ? { unless } : {}) }];
  }
  // Verdant Command: "Counter target loyalty ability of a planeswalker": an activated ability with a loyalty symbol in
  // its cost (CR 606.3), on the stack.
  if (/^Counter target loyalty ability of a planeswalker$/i.test(s)) return [{ type: "counterSpell", index: addTarget(ctx, { ...stackSpec("activated ability"), loyaltyOnly: true, text: "target loyalty ability of a planeswalker" }) }];
  // Siren Stormtamer: "Counter target spell or ability that targets you or a creature you control".
  // Avoid Fate: "Counter target instant or Aura spell that targets a permanent you control": a spell of those kinds.
  // Mistfolk: "Counter target spell that targets ~": its source (TargetSpec.targetsSource).
  if (ctx.activated && /^Counter target spell that targets ~$/.test(s)) return [{ type: "counterSpell", index: addTarget(ctx, { kind: "spell", targetsSource: true, text: "target spell that targets ~" }) }];
  if ((m = /^Counter target (spell|spell or ability|instant or Aura spell) that targets (you or )?(you|an? .+)$/i.exec(s)) && !(m[2] && m[3] === "you")) {
    const what = m[3] === "you" ? "you" : parseTargetPhrase(m[3]!.replace(/^an? /, ""));
    // Outwit: "Counter target spell that targets a player": any player (targetsMatch).
    if (what !== "you" && what?.kind !== "object" && !(what?.kind === "player" && m[3] === "a player" && !what.opponent)) return null;
    const kinds = /^instant or Aura spell$/.test(m[1]!) ? parseTargetPhrase(m[1]!) : null;
    if (/^instant or Aura spell$/.test(m[1]!) && kinds?.kind !== "spell") return null;
    const base = kinds ? { ...kinds } : m[1]!.toLowerCase() === "spell" ? { kind: "spell" as const } : stackSpec("spell or ability");
    return [{ type: "counterSpell", index: addTarget(ctx, { ...base, targetsWhat: what, ...(m[2] ? { targetsYouToo: true as const } : {}), text: `target ${m[1]!.toLowerCase()} that targets ${m[2] ?? ""}${m[3]}` }) }];
  }
  // A mix of abilities and spells (CR 115.1c-d): "Counter target triggered ability or colorless spell" (Consign to Memory),
  // "... activated ability, triggered ability, or legendary spell" (Tale's End), "instant spell, sorcery spell, or
  // triggered ability".
  if ((m = /^Counter target (.+)$/i.exec(s)) && /\babilit/.test(m[1]!) && /\bspell\b/.test(m[1]!)) {
    const spec = mixedStackSpec(m[1]!);
    return spec && [{ type: "counterSpell", index: addTarget(ctx, spec) }];
  }
  // "Return target spell or nonland permanent an opponent controls to its owner's hand" (Sink into Stupor), "... spell or
  // permanent" (Venser, Shaper Savant), "... spell or creature" (Unsubstantiate): one target, a spell (it leaves the stack
  // without being countered, rulings) or a permanent. "An opponent controls" is said of both (spells have controllers too,
  // CR 110.2, 112.1).
  if ((m = /^Return target spell or (.+?) to its owner's hand$/i.exec(s))) {
    const perm = parseTargetPhrase(m[1]!);
    if (perm?.kind !== "object" || perm.tapped !== undefined || perm.combat || perm.xRange || perm.bound) return null;
    const spec: TargetSpec = { kind: "spell", types: [], notTypes: [], notColors: [], ...(perm.controller ? { controller: perm.controller } : {}), orPermanent: perm, text: `target spell or ${m[1]!.toLowerCase()}` };
    const i = addTarget(ctx, spec);
    return [{ type: "counterSpell", index: i, bounce: true }, { type: "bounce", what: { ref: "target", index: i } }];
  }
  // Commit: "Put target spell or nonland permanent into its owner's library second from the top": a spell isn't countered
  // (rulings), a permanent goes there as for "put target creature ...".
  if ((m = /^Put target spell or (.+?) into its owner's library second from the top$/i.exec(s))) {
    const perm = parseTargetPhrase(m[1]!);
    if (perm?.kind !== "object" || perm.controller || perm.tapped !== undefined || perm.combat || perm.xRange || perm.bound) return null;
    const i = addTarget(ctx, { kind: "spell", types: [], notTypes: [], notColors: [], orPermanent: perm, text: `target spell or ${m[1]!.toLowerCase()}` });
    return [{ type: "counterSpell", index: i, bounce: true, librarySecond: true }, { type: "putInLibrary", what: { ref: "target", index: i }, position: "second" }];
  }
  // "Return target spell to its owner's hand" (Reprieve): it leaves the stack without being countered.
  // Obscura Interceptor: "return up to one target spell to its owner's hand": the same, or nothing.
  if ((m = /^Return (up to one )?target (.*?spell(?: you don't control| an opponent controls)?) to its owner's hand$/i.exec(s))) {
    const spec = parseTargetPhrase(m[2]!);
    return spec?.kind === "spell" && !spec.xRange ? [{ type: "counterSpell", index: addTarget(ctx, m[1] ? { ...spec, optional: true } : spec), bounce: true }] : null;
  }
  // "Counter target spell that targets a permanent you control" (Rebuff the Wicked), "... that targets you".
  // "Counter target spell if its mana value is X" (Disrupting Shoal): any spell can be targeted; only one with that mana
  // value, as it resolves, is countered (rulings).
  if (/^Target spell can't be countered$/i.test(s)) return [{ type: "spellUncounterable", index: addTarget(ctx, { kind: "spell", text: "target spell" }) }];
  // Double Negative: "Counter up to two target spells": each one chosen, two different spells (CR 115.3, 115.6).
  // Katara's Reversal: "Counter up to four target spells and/or abilities": spells, activated and triggered abilities.
  if ((m = /^Counter up to (two|four) target spells( and\/or abilities)?$/.exec(s))) {
    const base: TargetSpec = m[2] ? { ...stackSpec("spell or ability"), text: "target spell or ability" } : { kind: "spell", text: "target spell" };
    const idx: number[] = [];
    for (let i = 0; i < num(m[1]!); i++) idx.push(addTarget(ctx, { ...base, optional: true, ...(idx.length ? { distinctFrom: [...idx] } : {}) }));
    return idx.map((index): Effect => ({ type: "counterSpell", index }));
  }
  // Parallectric Feedback: "~ deals damage to target spell's controller equal to that spell's mana value": its mana value
  // with the X chosen for it (CR 202.3e), and the spell stays on the stack.
  if (/^~ deals damage to target spell's controller equal to that spell's mana value$/.test(s)) {
    const index = addTarget(ctx, { kind: "spell", types: [], notTypes: [], notColors: [], text: "target spell" });
    return [{ type: "damage", amount: { count: { kind: "manaValue", of: { ref: "target", index } } }, to: { ref: "targetController", index } }];
  }
  // Second Guess: "Counter target spell that's the second spell cast this turn": the second cast by any player, as it was
  // cast (CR 601.2i); a copy wasn't cast (CR 707.10).
  if (/^Counter target spell that's the second spell cast this turn$/i.test(s)) return [{ type: "counterSpell", index: addTarget(ctx, { kind: "spell", castNth: 1, text: "target spell that's the second spell cast this turn" }) }];
  if (/^Counter target spell if its mana value is X$/i.test(s)) return [{ type: "counterSpell", index: addTarget(ctx, { kind: "spell", text: "target spell" }), ifMvX: true }];
  // Unified Will: "Counter target spell if you control more creatures than that spell's controller": counted as it resolves
  // (CR 608.2c); a spell of yours is never countered by it.
  if (/^Counter target spell if you control more creatures than that spell's controller$/i.test(s)) {
    const index = addTarget(ctx, { kind: "spell", text: "target spell" });
    const creatures: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creatures" };
    return [{ type: "if", cond: { kind: "amountsCompare", a: { count: { kind: "permanents", filter: creatures, whose: { ref: "you" } } }, atLeast: { count: { kind: "permanents", filter: creatures, whose: { ref: "targetController", index } }, plus: 1 } }, effects: [{ type: "counterSpell", index }] }];
  }
  // Corrupted Resolve: "Counter target spell if its controller is poisoned": has a poison counter as it resolves (CR
  // 122.1f), checked then (CR 608.2c).
  if (/^Counter target spell if its controller is poisoned$/i.test(s)) {
    const index = addTarget(ctx, { kind: "spell", text: "target spell" });
    return [{ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "poison", who: { ref: "targetController", index } } }, min: 1 }, effects: [{ type: "counterSpell", index }] }];
  }
  // Hisoka, Minamo Sensei: "Counter target spell if it has the same mana value as the discarded card": any spell can be
  // targeted; the discard cost's card decides (compile checks there is one).
  if (/^Counter target spell if it has the same mana value as the discarded card$/i.test(s) && ctx.activated) return [{ type: "counterSpell", index: addTarget(ctx, { kind: "spell", text: "target spell" }), ifMvDiscarded: true }];
  if (/^Counter target spell if it was kicked$/i.test(s)) return [{ type: "counterSpell", index: addTarget(ctx, { kind: "spell", text: "target spell" }), ifKicked: true }];
  // Jester's Scepter: "Counter target spell if it has the same name as that card", the card put into a graveyard for the
  // cost; any spell can be targeted (rulings).
  if (/^Counter target spell if it has the same name as that card$/i.test(s) && ctx.activated && ctx.costLinked) return [{ type: "counterSpell", index: addTarget(ctx, { kind: "spell", text: "target spell" }), ifCostCardName: true }];
  // "Counter target spell with mana value 4 or less", "... with mana value X" (Spell Blast: the X it's cast with).
  // "Counter up to one target creature spell" (Repel Intruders): none at all is fine too (CR 115.6).
  // "Counter target spell with the chosen name" (Declaration of Naught): the name chosen as its source entered.
  // "Counter target spell that wasn't cast from its owner's hand" (Wash Away).
  // Thrull Wizard: "Counter target black spell unless that spell's controller pays {B} or {3}": they choose which, if
  // either, to pay as it resolves (CR 118.12, 608.2d).
  if ((m = /^Counter target ((?:white|blue|black|red|green) spell) unless that spell's controller pays ((?:\{[^}]+\})+) or ((?:\{[^}]+\})+)$/.exec(s))) {
    const spec = parseTargetPhrase(m[1]!);
    const options = parsePunisherOptions(`pays ${m[2]} or pays ${m[3]}`, ctx);
    if (spec?.kind !== "spell" || !options) return null;
    const index = addTarget(ctx, spec);
    return [{ type: "punisher", who: { ref: "targetController", index }, options, effects: [{ type: "counterSpell", index }], penalty: "Let ~ counter it" }];
  }
  // Molten Influence: "Counter target instant or sorcery spell unless its controller has ~ deal 4 damage to them": that
  // spell's controller decides as it resolves (CR 608.2d).
  if ((m = /^Counter target (instant or sorcery spell|spell) unless its controller (has ~ deal \d+ damage to them)$/.exec(s))) {
    const spec = parseTargetPhrase(m[1]!);
    const options = parsePunisherOptions(m[2]!, ctx);
    if (spec?.kind !== "spell" || !options) return null;
    const index = addTarget(ctx, spec);
    return [{ type: "punisher", who: { ref: "targetController", index }, options, effects: [{ type: "counterSpell", index }], penalty: "Let ~ counter it" }];
  }
  // "Counter target spell unless its controller discards their hand" (Perplex): a choice they make as it resolves (CR 118.12).
  // "... unless its controller exiles all cards from their graveyard" (Grip of Amnesia): the same.
  if ((m = /^Counter (up to one )?target (.*?spell(?: with mana value (?:\d+|X)(?: or (?:less|greater))?| with the chosen name| with mana value less than or equal to the number of cards in its controller's graveyard| that wasn't cast from its owner's hand| cast from a graveyard| with \{X\} in its mana cost| with power or toughness \d+ or less)?(?: you don't control| an opponent controls)?)(?: unless its controller (pays (.+)|discards their hand|exiles all cards from their graveyard))?$/i.exec(s))) {
    m.splice(3, 1);
    const spec = parseTargetPhrase(m[2]!, { x: true, chosen: !!ctx.activated && / with the chosen name\b/.test(m[2]!) });
    const unless = /discards their hand$/.test(s) ? { cost: "{0}", discardHand: true as const } : /exiles all cards from their graveyard$/.test(s) ? { cost: "{0}", exileGraveyard: true as const } : m[3] === undefined ? undefined : parseUnlessPays(m[3], ctx);
    // An ability's X: one announced for its cost (Kozilek, the Great Distortion; checked in oracle/activated.ts).
    if (!spec || unless === null || (spec.xRange && !ctx.spell && !ctx.activated && !ctx.whereX)) return null;
    return [{ type: "counterSpell", index: addTarget(ctx, m[1] ? { ...spec, optional: true, text: `up to one target ${m[2]}` } : spec), ...(unless ? { unless } : {}) }];
  }
  // Press the Enemy, after "Return target spell or nonland permanent ...": "You may cast an instant or sorcery spell with
  // equal or lesser mana value from your hand without paying its mana cost": no more than that target's mana value as it
  // last existed (a spell's with its X, rulings), as this resolves (TargetSpec.bound).
  // Reinterpret: "Counter target spell. You may cast a spell with equal or lesser mana value ...": any spell.
  if ((m = /^(?:You may c|C)ast an? ((?:.+? )?spell) with equal or lesser mana value from your hand without paying its mana cost$/.exec(s)) && (/^You/.test(s) || ctx.mayNow) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget] && !ctx.targets[ctx.lastObjectTarget]!.many) {
    const filter = parseTargetPhrase(m[1]!);
    if (filter?.kind !== "spell" || filter.controller || filter.targetsWhat || filter.manaValue || filter.bound) return null;
    const amount = { count: { kind: "manaValue" as const, of: { ref: "target" as const, index: ctx.lastObjectTarget } } };
    return [{ type: "castFromHand", filter: { ...filter, bound: { key: "manaValue", at: "most", amount }, text: `${m[1]} with equal or lesser mana value` } }];
  }
  // Kellan, the Kid, in a cast trigger: "you may cast a permanent spell with equal or lesser mana value from your hand
  // without paying its mana cost": no more than the triggering spell's mana value, with the X chosen for it (rulings), as
  // it last existed if it has left the stack, counted as this resolves (TargetSpec.bound).
  if ((m = /^(?:You may c|C)ast an? ((?:.+? )?spell) with equal or lesser mana value from your hand without paying its mana cost$/.exec(s)) && (/^You/.test(s) || ctx.mayNow) && ctx.castSpell && ctx.lastObjectTarget === undefined) {
    const filter = parseTargetPhrase(m[1]!);
    if (filter?.kind !== "spell" || filter.controller || filter.targetsWhat || filter.manaValue || filter.bound) return null;
    const amount = { count: { kind: "manaValue" as const, of: { ref: "castSpell" as const } } };
    return [{ type: "castFromHand", filter: { ...filter, bound: { key: "manaValue", at: "most", amount }, text: `${m[1]} with equal or lesser mana value` } }];
  }
  // "You may cast a spell with mana value 3 or less from your hand without paying its mana cost" (Sram's Expertise),
  // "... with mana value X or less ..." (Electrodominance: its X), "... an instant or sorcery spell from your hand ...",
  // "... with mana value less than or equal to the other result ..." (Arcane Endeavor: counted as it resolves).
  // "A spell from your hand with mana value less than or equal to that damage" (Glamdring): the same, written the other way.
  // In Search of Greatness: "... from your hand with mana value equal to 1 plus the greatest mana value among other
  // permanents you control ...": exactly that, counted as it resolves.
  if ((m = /^(You may c|C)ast an? (.*?spell(?: with mana value (?:(?:\d+|X) or less|less than or equal to .+?))?) from your hand( with mana value (?:(?:\d+|X) or less|(?:less than or )?equal to .+?))? without paying its mana cost$/.exec(s)) && (m[1] === "You may c" || ctx.mayNow) && !(m[3] && / with /.test(m[2]!))) {
    m.splice(1, 1);
    m[1] = `${m[1]!}${m[2] ?? ""}`;
    // With "where X is ...", X is that amount, counted as it resolves (TargetSpec.bound, replaced in body.ts).
    const filter = parseTargetPhrase(m[1]!, { x: !ctx.whereX, count: (t) => parseBoundCount(t, ctx) });
    if (filter?.kind !== "spell" || filter.controller || filter.targetsWhat || (filter.xRange && (!ctx.spell || ctx.whereX || filter.xRange.at !== "most"))) return null;
    return [{ type: "castFromHand", filter: { ...filter, text: m[1]! } }];
  }
  // Overloaded Counterflux: "Counter each spell you don't control" (CR 702.96a), no targets.
  if ((m = /^Counter each (.*?spell (?:you don't control|an opponent controls))$/i.exec(s))) {
    const filter = parseTargetPhrase(m[1]!);
    return filter?.kind === "spell" && filter.controller === "opponent" ? [{ type: "counterEach", filter: { ...filter, text: `each ${m[1]!}` } }] : null;
  }
  // Reverse the Polarity: "Counter all other spells": every spell on the stack but this one, anyone's (CR 701.6a).
  if (/^Counter all other spells$/.test(s) && ctx.spell) return [{ type: "counterEach", filter: { kind: "spell", types: [], notTypes: [], notColors: [], text: "all other spells" } }];
  // Deflection: "Change the target of target spell with a single target" (CR 115.7a); Bolt Bend's "spell or ability".
  // Hydroelectric Specimen: "... target instant or sorcery spell with a single target to ~".
  if ((m = /^Change the target of target instant or sorcery spell with a single target to ~$/i.exec(s)))
    return [{ type: "changeTarget", index: addTarget(ctx, { kind: "spell", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], singleTarget: true, text: "target instant or sorcery spell with a single target" }), toSelf: true }];
  // Spellskite: "Change a target of target spell or ability to ~" (rulings: any one of its targets, chosen as it resolves).
  if (/^Change a target of target spell or ability to ~$/i.test(s))
    return [{ type: "changeTarget", index: addTarget(ctx, { ...stackSpec("spell or ability"), text: "target spell or ability" }), toSelf: true, anyOne: true }];
  // Torchling: "Change the target of target spell that targets only ~"; Silver Wyvern: "... target spell or ability that
  // targets only ~"; Rebound: "... target spell that targets only a player" (TargetSpec.targetsOnly). Every target naming
  // that one thing changes to the same new one (rulings on Torchling). "The new target must be ..." follows (body.ts).
  if ((m = /^Change the target of target spell( or ability)? that targets only (~|a player)$/.exec(s)) && (m[2] === "a player" || ctx.activated)) {
    const base = m[1] ? stackSpec("spell or ability") : { kind: "spell" as const, text: "target spell" };
    const only = m[2] === "~" ? { targetsSource: true as const } : { targetsWhat: { kind: "player" as const, text: "a player" } };
    return [{ type: "changeTarget", index: addTarget(ctx, { ...base, ...only, targetsOnly: true, text: `target spell${m[1] ?? ""} that targets only ${m[2]}` }), all: true }];
  }
  if ((m = /^Change the target of target spell( or ability)? with a single target(?: unless that spell's controller pays (.+))?$/i.exec(s)) && !(m[1] && m[2])) {
    const unless = m[2] === undefined ? undefined : parseUnlessPays(m[2], ctx);
    if (unless === null) return null;
    const spec = { ...(m[1] ? stackSpec("spell or ability") : { kind: "spell" as const, text: "target spell" }), singleTarget: true, text: `target spell${m[1] ?? ""} with a single target` };
    return [{ type: "changeTarget", index: addTarget(ctx, spec), ...(unless ? { unless } : {}) }];
  }
  // Wyll's Reversal: "Choose target spell or ability ... You may choose new targets for that spell or ability. Then copy
  // it. You may choose new targets for the copy." (CR 707.10; the new targets in body.ts).
  const named = ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "spell" ? ctx.lastObjectTarget : undefined;
  if (named !== undefined && !ctx.castSpell && !ctx.selfCastSpell && /^(?:[Tt]hen )?[Cc]opy it$/.test(s)) return [{ type: "copySpell", spell: { target: named }, n: 1, newTargets: false }];
  // Goblin Flectomancer: "You may change the targets of target instant or sorcery spell" (CR 115.7a): all or none.
  if ((m = /^You may change the targets of target (instant or sorcery spell)$/.exec(s))) {
    const spec = parseTargetPhrase(m[1]!);
    return spec?.kind === "spell" ? [{ type: "newTargets", index: addTarget(ctx, { ...spec, text: `target ${m[1]!}` }), allOrNone: true }] : null;
  }
  // Deflecting Swat, Redirect: "You may choose new targets for target spell or ability" (CR 115.7d).
  if ((m = /^You may choose new targets for target (spell or ability|(?:instant or sorcery )?spell)$/i.exec(s))) {
    const spec = m[1] === "spell or ability" ? { ...stackSpec("spell or ability"), text: "target spell or ability" } : parseTargetPhrase(m[1]!);
    if (spec?.kind !== "spell") return null;
    return [{ type: "newTargets", index: addTarget(ctx, { ...spec, text: `target ${m[1]!}` }) }];
  }
  // "Return that spell to its owner's hand" in a cast trigger (Krark, the Thumbless): not countering it, so a spell that
  // can't be countered goes too; nothing happens if it has left the stack (rulings).
  if (ctx.castSpell && /^[Rr]eturn (?:it|that spell) to its owner's hand$/.test(s)) return [{ type: "counterSpell", index: -1, cause: true, bounce: true, hand: true }];
  // "Whenever a player casts a spell, if no mana was spent to cast it, counter that spell." (Vexing Bauble)
  if (ctx.castSpell && /^Counter (?:it|that spell)$/i.test(s)) return [{ type: "counterCause" }];
  // "Whenever a player casts a spell, counter it unless that player pays {1}."
  if (ctx.castSpell && (m = /^Counter (?:it|that spell) unless (?:that player|its controller) pays (.+)$/i.exec(s))) {
    const unless = parseUnlessPays(m[1]!, ctx);
    return unless && [{ type: "counterUnlessPays", unless }];
  }
  return undefined;
}

/** "Triggered ability or colorless spell": the kinds of abilities, and one kind of spell (several only if they're just card types). */
function mixedStackSpec(what: string): TargetSpec | null {
  let activated = false;
  let triggered = false;
  const spells: TargetSpec[] = [];
  for (const item of what.split(/,? or |, /)) {
    if (item === "activated ability") activated = true;
    else if (item === "triggered ability") triggered = true;
    else if (item === "legendary spell") spells.push({ kind: "spell", supertypes: ["Legendary"], text: item });
    else if (/ spell$/.test(item)) {
      const spec = parseTargetPhrase(item);
      if (spec?.kind !== "spell") return null;
      spells.push(spec);
    } else return null;
  }
  if (!(activated || triggered) || !spells.length) return null;
  const onlyTypes = (x: TargetSpec) => Object.entries(x).every(([k, v]) => ["kind", "text", "types"].includes(k) || (Array.isArray(v) && !v.length));
  if (spells.length > 1 && !spells.every(onlyTypes)) return null;
  const spell: TargetSpec = spells.length > 1 ? { kind: "spell", types: spells.flatMap((x) => x.types ?? []), text: "" } : spells[0]!;
  return { ...spell, kind: "spell", stackAbilities: activated && triggered ? "both" : activated ? "activated" : "triggered", text: `target ${what.toLowerCase()}` };
}

/** "Target spell or ability", "target activated ability": a stack target that can be an ability (CR 115.1c-d). */
export function stackSpec(what: string): TargetSpec {
  const w = what.toLowerCase();
  const spells = w.startsWith("spell");
  const activated = w.includes("activated") || w === "spell or ability";
  const triggered = w.includes("triggered") || w === "spell or ability";
  return { kind: "spell", stackAbilities: activated && triggered ? "both" : activated ? "activated" : "triggered", ...(spells ? {} : { noSpells: true as const }), text: `target ${w}` };
}

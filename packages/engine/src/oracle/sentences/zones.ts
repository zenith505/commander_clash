// Sentences that move cards between zones (graveyard, library, exile until it leaves), attach, "can't block this turn", and picking your own permanents.

import type { Effect, Modification, ObjRef, PlayerRef, TargetSpec } from "../../abilities";
import { NUM, NUMX, COUNTER, BASIC_TYPES, amt, capital, counterKind, isGroup, num, singularWord } from "../words";
import { parseManaCost } from "../../mana";
import { CREATURE_TYPES } from "../../keywords";
import { parseSearchFilter } from "../search";
import { parseSentence } from "../sentence";
import { parseBoundCount, parseCount, roundOf } from "../counts";
import { pickFilter, parsePlayer, parseObject, parseTargetPhrase, PERMANENT_TYPES, parseCardTarget } from "../targets";
import { addTarget, parseUnlessPays, type Ctx } from "../body";
import { parseAffected, parseStaticCondition, parseStaticMods, parseUntargetable } from "../statics";

/**
 * Whole sentences about every player's cards that other templates would take apart (tried before them), or undefined.
 */

/** "Any number of" cards: as many as there are. */
export const ANY_NUMBER = 999;
export function parseEveryPlayerZonesSentence(s: string, ctx: Ctx): Effect[] | undefined {
  if (s === "Put all creatures on the bottom of their owners' libraries") return [{ type: "putAllOnBottom", filter: { kind: "object", types: ["Creature"], text: "creature" } }];
  // Living Death: each part for all players at once (rulings, Effect livingDeath).
  if (s === "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield") return [{ type: "livingDeath" }];
  // Scrap Mastery: the same with artifacts (rulings: only the cards exiled by the first part come back).
  if (s === "Each player exiles all artifact cards from their graveyard, then sacrifices all artifacts they control, then puts all cards they exiled this way onto the battlefield") return [{ type: "livingDeath", cardType: "Artifact" }];
  if (ctx.spell) return undefined;
  // Memory Jar: each player's hand, face down, then everyone draws seven (CR 608.2c); at the next end step, everyone
  // discards their hand and gets back the cards they exiled (only the same objects, CR 400.7).
  if (s === "Each player exiles all cards from their hand face down and draws seven cards")
    return [{ type: "exileFaceDown", from: "hand", who: { ref: "eachPlayer" } }, { type: "draw", who: { ref: "eachPlayer" }, n: 7 }];
  if (s === "At the beginning of the next end step, each player discards their hand and returns to their hand each card they exiled this way")
    return [{ type: "delayed", when: "nextEndStep", effects: [{ type: "discard", who: { ref: "eachPlayer" }, n: 0, hand: true }, { type: "returnFaceDownExiled" }], text: "each player discards their hand and returns to their hand each card they exiled this way" }];
  return undefined;
}

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseZonesSentence(s0: string, ctx: Ctx): Effect[] | null | undefined {
  // Breakthrough: "choose X cards in your hand and discard the rest": all but X of them, chosen as it resolves (none if
  // X is at least the hand's size; all with X 0).
  if (/^[Cc]hoose X cards in your hand and discard the rest$/.test(s0) && ctx.spell) return [{ type: "discard", who: { ref: "you" }, n: 0, keep: { count: { kind: "x" } } }];
  // Monomania: "Target player chooses a card in their hand and discards the rest": that player keeps one of their choice.
  if (/^Target player chooses a card in their hand and discards the rest$/.test(s0)) {
    const who = parsePlayer("target player", ctx);
    return who ? [{ type: "discard", who, n: 0, keep: 1 }] : null;
  }
  // The Eldrazi processors: "put a card an opponent owns from exile into that player's graveyard", "put two cards your
  // opponents own from exile into their owners' graveyards" (Effect processExile).
  if (/^[Pp]ut a card an opponent owns from exile into that player's graveyard$/.test(s0)) return [{ type: "processExile", n: 1 }];
  if (/^[Pp]ut two cards your opponents own from exile into their owners' graveyards$/.test(s0)) return [{ type: "processExile", n: 2 }];
  // Memory Theft: "You may put a card that has an Adventure that player owns from exile into that player's graveyard":
  // any face-up one (rulings), not only one cast as an Adventure; chosen after seeing their hand, none too.
  if (/^[Pp]ut a card that has an Adventure that player owns from exile into that player's graveyard$/.test(s0) && ctx.lastPlayerTarget !== undefined) return [{ type: "processExile", n: 1, adventureOf: { ref: "target", index: ctx.lastPlayerTarget } }];
  let m: RegExpExecArray | null;
  // Cybership: "put the top two cards of that player's library onto the battlefield face down under your control. They're
  // 2/2 Cyberman artifact creatures." (one instruction, see wholeTextForms): face down as nameless, colorless 2/2 Cyberman
  // artifact creatures (FaceDownKind "cyberman", CR 708.2a, rulings), lands too; their owner is still that player.
  if ((m = new RegExp(`^Put the top ${NUM} cards of (that player's) library onto the battlefield under your control as face-down 2/2 Cyberman artifact creatures$`, "i").exec(s0))) {
    const library = parsePlayer(m[2]!.replace(/'s$/, ""), ctx);
    const n = num(m[1]!);
    return library && library.ref !== "you" && n > 0 ? [{ type: "dig", n, count: n, upTo: false, required: true, into: "cyberman", rest: "graveyard", reveal: false, library }] : null;
  }
  // Not Forgotten: "Put target card from a graveyard on your choice of the top or bottom of its owner's library": chosen as
  // it resolves by its controller (rulings).
  if ((m = /^[Pp]ut (target card from a graveyard) on your choice of the top or bottom of its owner's library$/.exec(s0))) {
    const before = ctx.targets.length;
    const what = parseCardTarget(m[1]!, ctx);
    if (what?.ref !== "target" || ctx.targets.length !== before + 1 || ctx.targets[before]!.kind !== "card") return null;
    return [{ type: "putInLibrary", what, position: "yourChoice" }];
  }
  // "Return from your graveyard to the battlefield any number of target creature cards ..." (Agadeem's Awakening): the
  // same as "Return any number of target creature cards ... from your graveyard to the battlefield".
  const fromYard = /^Return from your graveyard to the battlefield (any number of target .+)$/.exec(s0);
  let s = fromYard ? `Return ${fromYard[1]} from your graveyard to the battlefield` : s0;
  // Narset's Reversal: "Copy target instant or sorcery spell, then return it to its owner's hand": it leaves the stack
  // without being countered, so even a spell that can't be countered goes (rulings).
  if (/^(?:Then )?[Rr]eturn (?:it|that spell) to its owner's hand$/.test(s) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "spell")
    return ctx.targets[ctx.lastObjectTarget]!.stackAbilities ? null : [{ type: "counterSpell", index: ctx.lastObjectTarget, bounce: true }];
  // Nicol Bolas, the Arisen: "Exile all but the bottom card of target player's library": the top cards, as many as there
  // are less one. Jace, Reality Sculptor: "of each opponent's library", each one's own.
  if ((m = /^Exile all but the bottom card of (target player|target opponent|each opponent)'s library$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "exileTop", who, n: { count: { kind: "cardsInLibrary", who: { ref: "eachOne" } }, plus: -1 } }] : null;
  }
  // Doomsday Excruciator: "each player exiles all but the bottom six cards of their library face down": each their own top
  // cards, none with six or fewer (rulings); nobody may look at them (CR 406.3).
  // Pyxis of Pandemonium: "Each player exiles the top card of their library face down": nobody may look at them (CR
  // 406.3, rulings); they're linked to the source (CR 607.2a).
  if (/^[Ee]ach player exiles the top card of their library face down$/.test(s) && !ctx.spell) return [{ type: "exileFaceDown", from: "top", who: { ref: "eachPlayer" }, n: 1 }];
  if ((m = new RegExp(`^[Ee]ach (player|opponent) exiles all but the bottom (${NUM}) cards of their library face down$`).exec(s)))
    return [{ type: "exileFaceDown", from: "top", who: { ref: m[1] === "player" ? "eachPlayer" : "eachOpponent" }, n: { count: { kind: "cardsInLibrary", who: { ref: "eachOne" } }, plus: -num(m[2]!) } }];
  // Everything Comes to Dust: "Exile all creatures except those that share a creature type with a creature that convoked
  // ~, all artifacts, and all enchantments": an artifact or enchantment creature goes too, as an artifact or enchantment.
  if (s === "Exile all creatures except those that share a creature type with a creature that convoked ~, all artifacts, and all enchantments" && ctx.spell)
    return [{ type: "exile", what: { ref: "each", filter: { kind: "object", types: ["Artifact", "Creature", "Enchantment"], notTypes: [], notColors: [], text: "creatures, artifacts, and enchantments" }, spareConvokerTypes: true } }];
  // Nicol Bolas, Dragon-God: "Each opponent exiles a card from their hand or a permanent they control" (rulings: chosen in
  // turn order, exiled together).
  if ((m = /^(Each opponent|Each player) exiles a card from their hand or a permanent they control$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    return who ? [{ type: "exileHandOrPermanent", who }] : null;
  }
  // Lich's Mastery: "for each 1 life you lost, exile a permanent you control or a card from your hand or graveyard" (read
  // as "exile that many ..." in its "whenever you lose life" trigger, triggers.ts): any mix of the three (rulings).
  if (/^[Ee]xile X permanents you control and\/or cards from your hand and\/or graveyard$/.test(s)) return [{ type: "exileHandOrPermanent", who: { ref: "you" }, graveyard: true, n: amt("X") }];
  // Court of Locthwain: "until end of turn, you may cast a spell from among cards exiled with ~ without paying its mana
  // cost": one spell, from the cards its linked exile took (compile.ts links it, CR 607.2a).
  // Idol of Endurance: "... a creature spell from among ...": only a spell of that kind.
  // (A leading "Until end of turn," comes here as a trailing one.)
  if ((m = /^(?:[Uu]ntil end of turn, you|You) may cast an? (?:([a-z]+(?: or [a-z]+)?) )?spell from among cards exiled with ~ without paying its mana cost(?<until> until end of turn)?$/.exec(s)) && (m.groups?.until !== undefined) === /^You/.test(s)) {
    const filter = m[1] ? parseSearchFilter(`${m[1]} card`) : undefined;
    if (filter === null || (m[1] && !filter)) return null;
    return [{ type: "castLinkedFree", ...(filter ? { filter } : {}) }];
  }
  // Raphael, Most Attitude: "until end of turn, you may play a card exiled with ~"; Serpent's Soul-Jar: "... you may cast a
  // creature spell from among cards exiled with ~"; Kayla's Music Box: "... you may play cards you own exiled with ~": the
  // cards its own exile took (compile.ts links them, CR 607.2a), paid for as usual with the usual timing (rulings).
  if ((m = /^(?:[Uu]ntil end of turn, you|You) may (play a card|cast an? (creature|artifact|instant or sorcery|noncreature) spell from among cards|play cards you own) exiled with ~(?<until> until end of turn)?$/.exec(s)) && (m.groups?.until !== undefined) === /^You/.test(s) && !ctx.spell) {
    const filter = m[2] ? parseSearchFilter(`${m[2]} card`) : undefined;
    if (m[2] && !filter) return null;
    return [{ type: "playLinkedThisTurn", ...(filter ? { filter } : {}), ...(m[2] ? { castOnly: true as const } : {}), ...(m[1] === "play cards you own" ? { all: true as const, owned: true as const } : {}) }];
  }
  // Kaho, Minamo Historian: "You may cast a spell with mana value X from among cards exiled with ~ without paying its mana
  // cost"; Jeleva: "an instant or sorcery spell"; Shell of the Last Kappa: "a spell": one spell now, as this resolves
  // (CR 608.2g), from the cards linked to it (compile.ts links them, CR 607.2a). The spell as it's cast is checked
  // (an Adventure or a modal double-faced card's face, CR 715.3, 712.11c).
  if ((m = /^[Yy]ou may cast an? (?:(instant or sorcery|instant|sorcery|creature|artifact|enchantment) )?spell( with mana value X)? from among cards exiled with ~ without paying its mana cost$/.exec(s)) && !ctx.spell) {
    const types = m[1] ? m[1].split(" or ").map((x) => x[0]!.toUpperCase() + x.slice(1)) : undefined;
    return [{ type: "castFromAmong", who: { ref: "you" }, n: 0, fromLinked: true, max: 1, ...(types ? { filter: { kind: "card", types, notTypes: [], notColors: [], text: `${m[1]} card` }, asSpell: true as const } : {}), ...(m[2] ? { exactMv: { count: { kind: "x" as const } } } : {}) }];
  }
  // Scarlet Witch, Chaotic Avenger: "You may cast a Hero or noncreature spell from among cards exiled with ~ without paying
  // its mana cost": one spell now, from the linked cards, the spell as it's cast fitting (an Adventure's half, CR 715.3).
  if ((m = /^[Yy]ou may cast a (Hero or noncreature) spell from among cards exiled with ~ without paying its mana cost$/.exec(s)) && !ctx.spell) {
    const filter = parseSearchFilter(`${m[1]} card`);
    if (!filter) return null;
    return [{ type: "castFromAmong", who: { ref: "you" }, n: 0, fromLinked: true, max: 1, filter, asSpell: true }];
  }
  // Boiling Rock Rioter: "you may cast an Ally spell from among cards you own exiled with ~": one, paid for as it resolves,
  // its timing ignored (CR 608.2g), from the cards its exile ability exiled (CR 607.2a) that you own.
  if ((m = /^[Yy]ou may cast an? (Ally) spell from among cards you own exiled with ~$/.exec(s)) && !ctx.spell) {
    const filter = parseSearchFilter(`${m[1]} card`);
    if (!filter) return null;
    return [{ type: "castFromAmong", who: { ref: "you" }, n: 0, fromLinked: true, ownedOnly: true, max: 1, filter, asSpell: true, paid: true }];
  }
  // Rod of Absorption: "You may cast any number of spells from among cards exiled with ~ with total mana value X or less
  // without paying their mana costs": as this resolves, in any order (rulings), each one's mana value counted against X;
  // those not cast stay exiled.
  if (/^[Yy]ou may cast any number of spells from among cards exiled with ~ with total mana value X or less without paying their mana costs$/.test(s) && !ctx.spell) return [{ type: "castFromAmong", who: { ref: "you" }, n: 0, fromLinked: true, totalMv: { count: { kind: "x" } } }];
  // Goliath Daydreamer: "you may cast a spell from among cards you own in exile with dream counters on them without paying
  // its mana cost": one now, as this resolves (rulings), from every card you own in exile with one (not only those it
  // exiled), timing ignored.
  if (/^[Yy]ou may cast a spell from among cards you own in exile with dream counters on them without paying its mana cost$/.test(s) && !ctx.spell) return [{ type: "castFromAmong", who: { ref: "you" }, n: 0, ownExileCounter: "dream", max: 1 }];
  // Ashiok, Nightmare Muse: "You may cast up to three spells from among face-up cards your opponents own from exile without
  // paying their mana costs": one at a time as this resolves, timing ignored (rulings), not later.
  if (/^[Yy]ou may cast up to three spells from among face-up cards your opponents own from exile without paying their mana costs$/.test(s) && !ctx.spell) return [{ type: "castFromAmong", who: { ref: "you" }, n: 0, opponentsExile: true, max: 3 }];
  // Tasha, the Witch Queen: "You may cast a spell from among cards in exile with page counters on them without paying its
  // mana cost": anyone's cards in exile with one (not only those this Tasha exiled), cast only as this resolves (rulings).
  if (/^[Yy]ou may cast a spell from among cards in exile with page counters on them without paying its mana cost$/.test(s) && !ctx.spell) return [{ type: "castFromAmong", who: { ref: "you" }, n: 0, ownExileCounter: "page", anyOwnerExile: true, max: 1 }];
  // Amy Pond: "choose a suspended card you own and remove that many time counters from it" ("that many" read as X by the
  // trigger): one chosen as it resolves, not targeted (CR 702.62b: in exile, with suspend and a time counter); the last
  // one removed, its suspend casts it (rulings).
  if (/^[Cc]hoose a suspended card you own and remove X time counters from it$/.test(s) && !ctx.spell) return [{ type: "removeTimeSuspended", n: { count: { kind: "x" } } }];
  // Izzet Chemister: "Cast any number of cards exiled with ~ without paying their mana costs": one at a time as this
  // resolves, any number of them (none too), the rest staying exiled (rulings).
  if (/^Cast any number of cards exiled with ~ without paying their mana costs$/.test(s) && !ctx.spell) return [{ type: "castFromAmong", who: { ref: "you" }, n: 0, fromLinked: true }];
  // Idol of Endurance: "Exile all creature cards with mana value 3 or less from your graveyard until ~ leaves the
  // battlefield": they return to the graveyard when it leaves (CR 610.3).
  if ((m = /^[Ee]xile all (.+?) cards( with mana value \d+ or less)? from your graveyard until ~ leaves the battlefield$/.exec(s)) && !ctx.spell) {
    const filter = parseSearchFilter(`${m[1]} card${m[2] ?? ""}`);
    return filter ? [{ type: "exileGraveyard", who: { ref: "you" }, filter, until: "sourceLeaves" }] : null;
  }
  // Emry: "Choose target artifact card in your graveyard. You may cast that card this turn."
  // The one target so far is that card, in your graveyard.
  if (/^You may cast (?:that card|it) this turn$/.test(s) && ctx.targets.length === 1) {
    const t = ctx.targets[0]!;
    if (t.kind === "card" && t.owner === "you" && !t.many) return [{ type: "mayCastFromGraveyard", what: { ref: "target", index: 0 } }];
  }
  // Cosmic Rebirth (joined in body.ts): its hand otherwise, for a greater mana value too (rulings).
  if ((m = /^Put that card onto the battlefield if it has mana value (\d+) or less and you choose to, else into your hand$/.exec(s)) && ctx.targets.length === 1) {
    const t = ctx.targets[0]!;
    if (t.kind !== "card" || t.owner !== "you" || t.many) return null;
    const what = { ref: "target", index: 0 } as const;
    const hand: Effect[] = [{ type: "bounce", what }];
    return [{ type: "if", cond: { kind: "targetIs", index: 0, filter: { kind: "card", manaValue: { max: Number(m[1]) }, text: `card with mana value ${m[1]} or less` } }, effects: [{ type: "may", text: "put that card onto the battlefield", effects: [{ type: "putOntoBattlefield", what }], otherwise: hand }], otherwise: structuredClone(hand) }];
  }
  // Conduit of Worlds: "Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you
  // may cast that card. If you do, you can't cast additional spells this turn." (joined into one sentence in body.ts):
  // cast as it resolves or not at all (rulings).
  if (/^If you haven't cast a spell this turn, you may cast that card, and if you do, you can't cast additional spells this turn$/.test(s) && ctx.targets.length === 1) {
    const t = ctx.targets[0]!;
    if (t.kind === "card" && t.owner === "you" && !t.many) return [{ type: "castNow", what: { ref: "target", index: 0 }, unlessCast: true, thenNoMore: true }];
  }
  // "Exile any number of target spells" (Mindbreak Trap): they leave the stack without being countered (rulings).
  if ((m = /^Exile (target spell|any number of target spells)$/i.exec(s))) {
    const spec: TargetSpec = { kind: "spell", types: [], notTypes: [], notColors: [], text: "target spell", ...(m[1] === "target spell" ? {} : { many: "any" as const }) };
    return [{ type: "counterSpell", index: addTarget(ctx, spec), exileSpell: true }];
  }
  // Smirking Spelljacker: "exile target spell an opponent controls": the same, a spell an opponent controls (CR 115.1).
  if (/^[Ee]xile target spell an opponent controls$/.test(s)) {
    const spec: TargetSpec = { kind: "spell", types: [], notTypes: [], notColors: [], controller: "opponent", text: "target spell an opponent controls" };
    return [{ type: "counterSpell", index: addTarget(ctx, spec), exileSpell: true }];
  }
  // "Reveal any number of red cards in your hand" (Scent of Cinder), "Reveal any number of Dragon cards from your hand"
  // (Invasion of Tarkir): which ones is chosen as it resolves (Effect revealFromHand).
  if ((m = /^[Rr]eveal any number of (?:(.+?) )?cards (?:in|from) your hand$/.exec(s))) {
    const filter = m[1] ? parseSearchFilter(`${m[1]} card`) : undefined;
    if (filter === null || (m[1] && !filter)) return null;
    ctx.revealedFromHand = true;
    return [{ type: "revealFromHand", ...(filter ? { filter } : {}) }];
  }
  // Vault 21: House Gambit: "Reveal up to five nonland cards from your hand": at most five, chosen as it resolves.
  if ((m = new RegExp(`^[Rr]eveal up to ${NUM} (?:(.+?) )?cards (?:in|from) your hand$`).exec(s))) {
    const filter = m[2] ? parseSearchFilter(`${m[2]} card`) : undefined;
    const max = num(m[1]!);
    if (filter === null || (m[2] && !filter) || !Number.isInteger(max) || max < 2) return null;
    ctx.revealedFromHand = true;
    return [{ type: "revealFromHand", ...(filter ? { filter } : {}), max }];
  }
  // "Reveal a creature card in your hand" (Assembly Hall), "Reveal a card from your hand" (Infernal Tutor): one, chosen as
  // it resolves, if you have one (not a "may"); "that card" is it for the search after ("with the same name as that card").
  if ((m = /^[Rr]eveal an? (?:(.+?) )?card (?:in|from) your hand$/.exec(s)) && !ctx.revealedFromHand) {
    const filter = m[1] ? parseSearchFilter(`${m[1]} card`) : undefined;
    if (filter === null || (m[1] && !filter)) return null;
    ctx.revealedFromHand = true;
    return [{ type: "revealFromHand", ...(filter ? { filter } : {}), one: true, must: true }];
  }
  // Parley: "Each player reveals the top card of their library." Then "For each nonland card revealed this way, you create
  // a Treasure token" is "create a Treasure token for each nonland card revealed this way" (Selvala's "add {G} and you gain
  // 1 life" is split in parseBody).
  if (/^[Ee]ach player reveals the top card of their library$/.test(s)) {
    ctx.parley = true;
    return [{ type: "parleyReveal" }];
  }
  // Dakra Mystic: "You may put the revealed cards into their owners' graveyards", decided once all are revealed (rulings),
  // after a parley reveal.
  if (/^(?:[Yy]ou may p|P|p)ut the revealed cards into their owners' graveyards$/.test(s) && ctx.parley) return /^[Yy]ou may/.test(s) ? [{ type: "may", effects: [{ type: "parleyToGraveyards" }], text: "put the revealed cards into their owners' graveyards" }] : [{ type: "parleyToGraveyards" }];
  // Naya Soulbeast: "~ enters with X +1/+1 counters on it, where X is the total mana value of all cards revealed this way" in
  // its own cast trigger: the spell enters with them if it resolves (CR 614.1c; rulings: known once the trigger resolves).
  // (The "where X is" amount is put in for X afterwards.)
  if (ctx.parley && ctx.selfCastSpell && ctx.whereX && /^~ enters with X \+1\/\+1 counters on it$/.test(s)) return [{ type: "spellEntersWith", counter: "+1/+1", n: amt("X") }];
  if (ctx.parley && (m = /^For each ((?:non)?land card revealed this way), (?:you )?(.+)$/.exec(s))) return parseSentence(`${m[2]!.charAt(0).toUpperCase()}${m[2]!.slice(1)} for each ${m[1]}`, ctx);
  // "Put your commander into your hand from the command zone" (Command Beacon): one you own, of your choice with two
  // (rulings); nothing if none is there (CR 903.3).
  if (/^[Pp]ut your commander into your hand from the command zone$/.test(s)) return [{ type: "commanderToHand" }];
  // Campfire: "Put all commanders you own from the command zone and from your graveyard into your hand".
  if (/^[Pp]ut all commanders you own from the command zone and from your graveyard into your hand$/.test(s)) return [{ type: "commandersToHand" }];
  if (/^[Cc]hoose a commander you own on the battlefield or in the command zone$/.test(s)) return [{ type: "chooseOwnCommander" }];
  // Geode Golem: the pending free cast is the "may" (it can be declined).
  if (/^[Yy]ou may cast your commander from the command zone without paying its mana cost$/.test(s)) return [{ type: "castCommanderFree" }];
  // Hellkite Courser: "you may put a commander you own from the command zone onto the battlefield" (not cast, so no tax).
  if (/^[Pp]ut a commander you own from the command zone onto the battlefield$/.test(s)) return [{ type: "commanderToBattlefield" }];
  // Shadow of the Grave: "Return to your hand all cards in your graveyard that you cycled or discarded this turn": any
  // card you discarded for any reason (cycling is discarding, CR 702.29a), still in your graveyard as that object (rulings:
  // not a madness card you cast).
  if (/^Return to your hand all cards in your graveyard that you cycled or discarded this turn$/.test(s))
    return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { kind: "card", discardedThisTurn: true, text: "card you cycled or discarded this turn" }, toHand: true }];
  // "Put there from the battlefield this turn" (GameObject.fromBattlefieldTurn): Faith's Reward's "return to the
  // battlefield all permanent cards in your graveyard ...", Gerrard's Hourglass Pendant's "return to the battlefield tapped
  // all ...", Second Sunrise's "each player returns to the battlefield all ... in their graveyard ...", Gleancrawler's
  // "return to your hand all creature cards ...", Twilight Shepherd's "all cards", Thrilling Encore's "put onto the
  // battlefield under your control all creature cards in all graveyards ...": which cards, worked out as it resolves; the
  // cards enter at the same time (CR 608.2f; rulings on Faith's Reward: an Aura can't enchant one entering with it).
  if ((m = /^([Rr]eturn to the battlefield( tapped)?|[Ee]ach player returns to the battlefield|[Rr]eturn to your hand|Put onto the battlefield under your control) all (?:(.+?) )?cards in (your|their|all) graveyards? that were put there from the battlefield this turn$/.exec(s))) {
    const [, how, tapped, what, whose] = m;
    const each = /^[Ee]ach player/.test(how!);
    const encore = /^Put onto/.test(how!);
    if ((whose === "their") !== each || (whose === "all") !== encore || (whose === "all" ? "graveyards" : "graveyard") !== /graveyards? that/.exec(s)![0].slice(0, -5)) return null;
    // "Artifact, creature, enchantment, and land cards": a card of any of those types.
    const words = what ? what.replace(/(,?) and /g, "$1 or ").split(/\s+/).map(singularWord).join(" ") : "";
    const spec = parseTargetPhrase(`${words ? `${words} ` : ""}card from a graveyard`, { chosen: true });
    if (spec?.kind !== "card") return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: each || encore ? "eachPlayer" : "you" }, filter: { ...spec, fromBattlefieldThisTurn: true, text: `${what ? `${what} ` : ""}card that was put there from the battlefield this turn` }, ...(tapped ? { tapped: true } : {}), ...(each ? { owners: true as const } : {}), ...(/hand$/.test(how!) ? { toHand: true as const } : {}) }];
  }
  // Trusty Boomerang: "Return Trusty Boomerang to its owner's hand" in an ability it gives: that Equipment, if it's still
  // on the battlefield as the same object (rulings on Razor Boomerang).
  if (s === "Return \u27easource\u27eb to its owner's hand") return [{ type: "bounce", what: { ref: "grantSource" } }];
  // "Return to their owners' hands all creatures with ..." (Engulf the Shore), "Return to the battlefield target ... card in
  // your graveyard" (Squirming Emergence): the destination first, for a long object; the same instruction.
  if ((m = /^Return to (their owners' hands|its owner's hand|the battlefield) ((?:all|each|target) .+)$/.exec(s))) return parseSentence(`Return ${m[2]!} to ${m[1]!}`, ctx);
  // Forcemage Advocate: "Return target card from an opponent's graveyard to their hand": that opponent owns it (a card
  // is in its owner's graveyard, CR 404.2), so it's its owner's hand.
  // Nullmage Advocate: "Return two target cards from an opponent's graveyard to their hand", the same.
  if ((m = /^(Return (?:target [a-z ]*card|two target cards) from an opponent's graveyard) to their hand$/.exec(s))) return parseSentence(`${m[1]} to ${/^Return two/.test(m[1]!) ? "their owner's" : "its owner's"} hand`, ctx);
  // "Return all creatures to their owners' hands except for Krakens, Leviathans, Octopuses, and Serpents" (Whelming Wave),
  // "... all permanents ... except for Giants, Wizards, and lands", "Destroy all permanents except for artifacts and lands":
  // every one that has none of those subtypes or card types.
  // "Destroy all other permanents except for artifacts, lands, and Phyrexians" (The Argent Etchings): other than ~ too.
  // "Destroy all creatures and planeswalkers except for commanders" (Slash the Ranks): each one that isn't a commander
  // (CR 903.3).
  if ((m = /^([Rr]eturn all (?:creatures|permanents) to their owners' hands|[Dd]estroy all (?:other )?(?:creatures and planeswalkers|creatures|permanents)) except for (.+)$/.exec(s))) {
    const names = m[2]!.split(/,? and |, /).map((w) => (/^(Octopus|Platypus)es$/.test(w) ? w.slice(0, -2) : singularWord(w)));
    const types = names.filter((w) => PERMANENT_TYPES.includes(capital(w) as never)).map(capital);
    const subtypes = names.filter((w) => CREATURE_TYPES.has(w));
    const commanders = names.includes("commander");
    if (types.length + subtypes.length + (commanders ? 1 : 0) !== names.length) return null;
    const fx = parseSentence(m[1]!, ctx);
    const e = fx?.length === 1 ? fx[0] : undefined;
    if (!e || (e.type !== "bounce" && e.type !== "destroy") || e.what.ref !== "each" || e.what.filter.kind !== "object") return null;
    const f = e.what.filter;
    if (commanders && f.commander !== undefined) return null;
    return [{ ...e, what: { ...e.what, filter: { ...f, notTypes: [...(f.notTypes ?? []), ...types], ...(subtypes.length ? { notSubtypes: [...(f.notSubtypes ?? []), ...subtypes] } : {}), ...(commanders ? { commander: false } : {}), text: `${f.text} except ${m[2]}` } } } as Effect];
  }
  // Meld (CR 701.42a), as normalizeSelf words it: "exile ~ and the creature named Bruna, the Fading Light, then meld them
  // into Brisela, Voice of Nightmares", after "if you both own and control ~ and a creature named ..." (checked again as
  // it melds) or "if ~ and a creature named ... are attacking, and you both own and control them" (with "tapped and
  // attacking"). The names are the card data's (CardDef.meld).
  if ((m = /^(?:If (?:(you both own and control ~ and an? (creature|land|artifact) named .+?)|(~ and an? (creature) named .+? are attacking, and you both own and control them)), )?[Ee]xile ~ and the (attacking )?(creature|land|artifact) named .+?, then meld them into .+?( tapped and attacking)?$/.exec(s))) {
    const partnerType = (m[6]!.charAt(0).toUpperCase() + m[6]!.slice(1)) as "Creature" | "Land" | "Artifact";
    const attacking = !!m[5];
    if ((m[2] && m[2] !== m[6]) || (m[4] && m[4] !== m[6]) || !!m[3] !== attacking || !!m[7] !== attacking) return null;
    return [{ type: "meld", partnerType, ...(attacking ? { attacking: true as const } : {}) }];
  }
  // Airbend (CR 701.65a): exile them; for as long as each card stays exiled, its owner may cast it by paying {2} rather
  // than its mana cost (a token ceases to exist, a land can't be played, rulings on Airbending Lesson).
  if ((m = /^[Aa]irbend (.+)$/.exec(s))) {
    // "Airbend up to one other target creature or spell" (Aang, Swift Savior): one target, a spell (removed from the
    // stack, not countered, so even one that can't be countered, rulings) or a permanent other than the source.
    const orSpell = /^(up to one )?(other )?target (creature|nonland permanent|permanent) or spell$/.exec(m[1]!);
    if (orSpell) {
      const perm = parseTargetPhrase(orSpell[3]!);
      if (perm?.kind !== "object") return null;
      const i = addTarget(ctx, { kind: "spell", types: [], notTypes: [], notColors: [], orPermanent: perm, ...(orSpell[2] ? { notSource: true } : {}), ...(orSpell[1] ? { optional: true } : {}), text: `${orSpell[1] ?? ""}${orSpell[2] ?? ""}target ${orSpell[3]} or spell` });
      return [
        { type: "counterSpell", index: i, exileSpell: true, ownerMayCost: "{2}" },
        { type: "exile", what: { ref: "target", index: i }, ownerMay: { cost: "{2}" } },
      ];
    }
    const fx = parseSentence(`Exile ${m[1]!}`, ctx);
    const ex = fx?.length === 1 ? fx[0] : undefined;
    if (ex?.type !== "exile" || ex.until || ex.linked || !["target", "each", "subject"].includes(ex.what.ref)) return null;
    return [{ ...ex, ownerMay: { cost: "{2}" } }];
  }
  // "Discard a card and sacrifice an artifact, a creature, and a land": in that order.
  if ((m = /^Discard a card and (sacrifice .+)$/.exec(s))) {
    const rest = parseZonesSentence(m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1), ctx);
    return rest && [{ type: "discard", who: { ref: "you" }, n: 1 }, ...rest];
  }
  // "Sacrifice an artifact, a creature, and a land" (Tomb of Annihilation's Oubliette), "target player sacrifices an
  // artifact and a land of their choice": a different permanent for each (see the sacrificeEach effect).
  // Perilous Predicament: "an artifact creature and a nonartifact creature of their choice".
  if ((m = /^(?:(.+?) )?[Ss]acrifices? (an? \w+(?: creature)?(?:, an? \w+(?: creature)?)*,? and an? \w+(?: creature)?)(?: of (?:their|his or her) choice)?$/.exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const filters = m[2]!.split(/,? and |, /).map((x) => pickFilter(x.replace(/^an? /, "")));
    return who && filters.every(Boolean) ? [{ type: "sacrificeEach", who, filters: filters as TargetSpec[] }] : null;
  }

  // Manifest dread: "Look at the top two cards of your library. Manifest one of them, then put the cards you looked at
  // that were not manifested this way into your graveyard" (CR 701.62a). With one card left it's manifested; with none,
  // nothing happens (rulings). "Its controller manifests dread": that player's library and choice.
  if ((m = /^(?:(Its controller|That creature's controller|That permanent's controller) manifests|[Mm]anifest) dread( twice)?$/.exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : undefined;
    if (who === null) return null;
    const one: Effect = { type: "dig", n: 2, count: 1, upTo: false, required: true, into: "manifest", rest: "graveyard", reveal: false, ...(who ? { who } : {}) };
    return m[2] ? [one, one] : [one];
  }
  // Unidentified Hovership: "When ~ leaves the battlefield, the exiled card's owner manifests dread": each owner of a card
  // its own exile ability took that's still exiled, one after another (rulings); compile() links the two.
  if (/^[Tt]he exiled card's owner manifests dread$/.test(s) && ctx.selfCard)
    return [{ type: "dig", n: 2, count: 1, upTo: false, required: true, into: "manifest", rest: "graveyard", reveal: false, each: true, eachOf: { ref: "linkedExileOwners" } }];
  // Valgavoth's Onslaught: "Manifest dread X times" (the spell's X): one manifest dread after another (rulings: players
  // can't act between them), every face-down creature remembered for "each of those creatures".
  if (/^Manifest dread X times$/.test(s) && ctx.spell) return [{ type: "repeat", n: amt("X"), gather: true, effects: [{ type: "dig", n: 2, count: 1, upTo: false, required: true, into: "manifest", rest: "graveyard", reveal: false }] }];
  // "Manifest the top card of your library", "Cloak the top two cards of your library" (CR 701.40a, 701.58a): one at a
  // time (CR 701.40e).
  if ((m = new RegExp(`^(?:(Its controller) (manifests|cloaks)|(Manifest|Cloak)) the top (card|${NUM} cards) of (?:your|their) library$`, "i").exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : undefined;
    if (who === null) return null;
    if (m[1] ? !/their library$/.test(s) : !/your library$/.test(s)) return null;
    const n = m[4] === "card" ? 1 : num(m[5]!);
    if (!Number.isInteger(n) || n < 1) return null;
    const into = /^cloak/i.test(m[2] ?? m[3]!) ? "cloak" : "manifest";
    return [{ type: "dig", n, count: n, upTo: false, required: true, into, rest: "graveyard", reveal: false, ...(who ? { who } : {}) }];
  }

  // Omarthis, Ghostfire Initiate: "manifest a number of cards from the top of your library equal to the number of counters
  // on it": counted as it resolves, then one at a time (rulings, CR 701.40e), all of them.
  if ((m = /^[Mm]anifest a number of cards from the top of your library equal to (.+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    return n ? [{ type: "dig", n, count: 0, countAll: true, upTo: false, required: true, into: "manifest", rest: "graveyard", reveal: false }] : null;
  }
  // Tevesh Szat: "Put all commanders from the command zone onto the battlefield under your control."
  if (/^Put all commanders from the command zone onto the battlefield under your control$/.test(s)) return [{ type: "commandersOntoBattlefield" }];
  // "Manifest the top card of that player's library" (Orochi Soul-Reaver): their card, onto the battlefield face down under
  // your control (CR 701.40a); its owner is still that player.
  // Thieving Amalgam: "At the beginning of each opponent's upkeep, you manifest the top card of that player's library": the
  // same, that player the one whose upkeep it is.
  if ((m = /^(?:you )?Manifest the top card of (that player's) library$/i.exec(s))) {
    const library = parsePlayer(m[1]!.replace(/'s$/, ""), ctx);
    return library && library.ref !== "you" ? [{ type: "dig", n: 1, count: 1, upTo: false, required: true, into: "manifest", rest: "graveyard", reveal: false, library }] : null;
  }
  // "Up to two target players each manifest two cards from their hands" (Kozilek, the Broken Reality): each chooses that
  // many cards from their hand (all of them with fewer, rulings), and they're put onto the battlefield face down
  // (CR 701.40a). "For each card manifested this way" counts them.
  // "Manifest a card from your hand" (Scroll of Fate): you.
  // "Cloak a card from your hand" (Vannifar, Evolved Enigma): the same, cloaked (CR 701.58a).
  if (/^Cloak a card from your hand$/.test(s)) {
    ctx.manifested = true;
    return [{ type: "putFromHand", who: { ref: "you" }, may: false, manifest: 1, cloak: true }];
  }
  if ((m = new RegExp(`^(?:(.+?) (?:each )?manifests?|[Mm]anifest) (a card|${NUM} cards) from (their|your) hands?$`).exec(s))) {
    if (!m[1] && m[4] !== "your") return null;
    const who = m[1] ? parsePlayer(m[1], ctx) : undefined;
    if (m[1] && !who) return null;
    const n = m[2] === "a card" ? 1 : num(m[3]!);
    if (!Number.isInteger(n) || n < 1) return null;
    ctx.manifested = true;
    return [{ type: "putFromHand", who: who ?? { ref: "you" }, may: false, manifest: n }];
  }

  // An instant or sorcery that exiles itself as it resolves, so it isn't put into the graveyard (CR 608.2n);
  // with suspend, it's suspended again (Arc Blade). If it doesn't resolve, it isn't exiled.
  if ((m = new RegExp(`^Exile ~ with ${NUM} time counters? on it$`, "i").exec(s))) return ctx.spell ? [{ type: "exileSelfWithTime", n: num(m[1]!) }] : null;
  if (/^Exile ~$/i.test(s) && ctx.spell) return [{ type: "exileSpell" }];
  // Esper Origins: "exile it, then put it onto the battlefield transformed under its owner's control with a finality
  // counter on it": the spell's card, back face up (CR 712.14a), as a new object (CR 400.7).
  if (/^[Ee]xile (?:it|~), then put it onto the battlefield transformed under its owner's control with a finality counter on it$/.test(s) && ctx.spell) return [{ type: "exileSpell", thenTransformed: { counter: "finality" } }];
  // Elixir of Immortality: "Shuffle ~ and your graveyard into their owner's library": the permanent into its owner's
  // library if it's still on the battlefield, your graveyard into yours (rulings).
  if (/^Shuffle ~ and your graveyard into their owner's library$/.test(s) && !ctx.spell)
    return [{ type: "shuffleIntoLibrary", what: { ref: "self" } }, { type: "shuffleZones", who: { ref: "you" }, graveyard: true }];
  // Leadership Vacuum: "Target player returns each commander they control from the battlefield to the command zone": any
  // player's commander they control, without adding to its tax (rulings, CR 903.8); the player is the target, so a
  // commander with hexproof can be returned (rulings).
  if ((m = /^(Target player|Target opponent) returns each commander they control from the battlefield to the command zone$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    return who?.ref === "target" ? [{ type: "toCommandZone", what: { ref: "each", filter: { kind: "object", types: [], notTypes: [], notColors: [], commander: true, text: "commander" }, of: who } }] : null;
  }
  // Floodpits Drowner: "Shuffle ~ and target creature with a stun counter on it into their owners' libraries": each into
  // its owner's library; with the target illegal, the ability doesn't resolve and ~ stays (rulings, CR 608.2b).
  if ((m = /^Shuffle ~ and (target [^,]+?) into their owners' libraries$/.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "shuffleIntoLibrary", what: { ref: "self" } }, { type: "shuffleIntoLibrary", what }] : null;
  }
  // Giant Trap Door Spider: "Exile ~ and target creature without flying that's attacking you"; Wall of Vipers: "Destroy ~ and
  // target creature it's blocking": both, ~ staying if the target is illegal and the ability doesn't resolve, the target
  // still exiled if ~ has left (rulings, CR 608.2b).
  if ((m = /^(Exile|Destroy) ~ and (target [^,]+?)$/.exec(s)) && !ctx.spell) {
    const what = parseObject(m[2]!, ctx);
    const type = m[1] === "Exile" ? ("exile" as const) : ("destroy" as const);
    return what?.ref === "target" && !what.n ? [{ type, what: { ref: "self" } }, { type, what }] : null;
  }
  // Coastal Wizard: "Return ~ and another target creature to their owners' hands": the same way, ~ staying if the target
  // is illegal and the ability doesn't resolve (CR 608.2b). Wizard Mentor: "Return ~ and target creature you control to
  // their owner's hand" (it can target itself, rulings: it's returned once).
  if ((m = /^Return ~ and ((?:another )?target [^,]+?) to their (?:owners' hands|owner's hand)$/.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "bounce", what: { ref: "self" } }, { type: "bounce", what }] : null;
  }
  // Disappear: "Return enchanted creature and ~ to their owners' hands": the creature, then the Aura, before any state-based
  // action could put the Aura into its owner's graveyard (CR 608.2c, 704.3).
  // Mark of Eviction: "return enchanted creature and all Auras attached to that creature to their owners' hands": the
  // creature and every Aura on it as it resolves (this one too), all at once.
  if (/^[Rr]eturn enchanted creature and all Auras attached to that creature to their owners' hands$/.test(s) && !ctx.spell) return [{ type: "bounce", what: { ref: "attached", aurasToo: true } }];
  if (/^Return enchanted creature and ~ to their owners' hands$/.test(s) && !ctx.spell) return [{ type: "bounce", what: { ref: "attached" } }, { type: "bounce", what: { ref: "self" } }];
  // Black Sun's Zenith: "Shuffle ~ into its owner's library" as it resolves (CR 608.2n, 701.24c).
  if (/^Shuffle ~ into its owner's library$/i.test(s) && ctx.spell) return [{ type: "shuffleSpell" }];
  // Fblthp, the Lost: "When ~ becomes the target of a spell, shuffle ~ into its owner's library": the permanent, while it's
  // still the same object on the battlefield (CR 400.7); its owner's library is shuffled (CR 701.24c).
  if (/^[Ss]huffle ~ into its owner's library$/.test(s) && !ctx.spell && !ctx.selfCard && ctx.selfIt) return [{ type: "shuffleIntoLibrary", what: { ref: "self" } }];
  // Seasons Past: "Put ~ on the bottom of its owner's library", likewise the resolving spell itself (CR 608.2n).
  if (/^Put ~ on the bottom of its owner's library$/i.test(s) && ctx.spell) return [{ type: "shuffleSpell", bottom: true }];
  // "When ~ dies, shuffle it into its owner's library", "When ~ is put into a graveyard from anywhere, ...": the card where
  // it went. "At the beginning of the end step, ~'s owner shuffles it into their library": the permanent.
  // Lembas: "When ~ is put into a graveyard from the battlefield, its owner shuffles it into their library."
  if (ctx.selfCard && /^(?:[Ss]huffle (?:it|~) into its owner's library|[Ii]ts owner shuffles (?:it|~) into their library)$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "selfCard" } }];
  // Kogla and Yidaro: "{2}{R}{G}, Discard this card: ... Shuffle this card into your library from your graveyard": the
  // card discarded to pay for it, while it's still there (CR 400.7).
  // Skyfisher Spider: "When ~ dies, ... exile ~ from your graveyard": the card it became, only from your own graveyard.
  if (ctx.selfCard && !ctx.discardedSelf && /^[Ee]xile ~ from your graveyard$/.test(s)) return [{ type: "exile", what: { ref: "selfCard", yours: true } }];
  if (ctx.discardedSelf && /^[Ss]huffle ~ into your library from your graveyard$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "selfCard", moved: true, yours: true } }];
  // "When ~ dies, put it on top of its owner's library" (Dark Revenant): the card in the graveyard, if it's still there.
  if (ctx.selfCard && (m = /^[Pp]ut (?:it|~) on (top|the bottom) of its owner's library$/.exec(s))) return [{ type: "putInLibrary", what: { ref: "selfCard" }, position: m[1] === "top" ? "top" : "bottom" }];
  // Arashin Sovereign: "put it on your choice of the top or bottom of its owner's library": chosen as it resolves by this
  // ability's controller (rulings).
  if (ctx.selfCard && /^[Pp]ut (?:it|~) on your choice of the top or bottom of its owner's library$/.test(s)) return [{ type: "putInLibrary", what: { ref: "selfCard" }, position: "yourChoice" }];
  // The God-Eternals: "you may put it into its owner's library third from the top"; Enigma Sphinx's "into your library"
  // (it triggers only from its owner's graveyard); Bookwurm's "Put ~ from your graveyard into your library ...".
  // Gandalf, White Rider: "fifth from the top". Screaming Swarm: "second from the top".
  if (ctx.selfCard && (m = /^[Pp]ut (?:it|~|her|him) (?:from your graveyard )?into (?:its owner's|her owner's|his owner's|~'s owner's|your) library (second|third|fifth) from the top$/.exec(s))) return [{ type: "putInLibrary", what: { ref: "selfCard" }, position: m[1] as "second" | "third" | "fifth" }];
  if (!ctx.spell && !ctx.selfCard && /^~'s owner shuffles (?:it|~) into their library$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "self" } }];
  // Watery Grasp: "Enchanted creature's owner shuffles it into their library": the permanent the Aura is attached to as
  // the ability resolves (CR 701.24c).
  if (!ctx.spell && /^Enchanted creature's owner shuffles it into their library$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "attached" } }];
  // "Shuffle target nontoken permanent you control into its owner's library" (Rishadan Pawnshop): it's put into that
  // library, then that library is shuffled (CR 701.24c).
  if ((m = /^[Ss]huffle (target [^,]+?) into its owner's library$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "shuffleIntoLibrary", what }] : null;
  }
  // Gomazoa: "Put ~ and each creature it's blocking on top of their owners' libraries, then those players shuffle" (body.ts
  // makes it this): the owners of the cards put there shuffle, which is shuffling them in (CR 701.24c); without a creature
  // it blocks, only ~ (rulings).
  if (!ctx.spell && !ctx.selfCard && /^Shuffle ~ and each creature it's blocking into their owners' libraries$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "inCombatWithSelf", blocked: true, andSelf: true } }];
  // Vortex Elemental: "Shuffle ~ and each creature blocking or blocked by it ...": both ways (CR 509.1h); without one,
  // only ~ (rulings).
  if (!ctx.spell && !ctx.selfCard && /^Shuffle ~ and each creature blocking or blocked by it into their owners' libraries$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "inCombatWithSelf", andSelf: true } }];
  // Dramatic Accusation: "Shuffle enchanted creature into its owner's library": the permanent it's attached to.
  if (/^[Ss]huffle enchanted creature into its owner's library$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "attached" } }];
  // "Shuffle any number of target cards from your graveyard into your library" (Perpetual Timepiece, Piper's Melody),
  // "... up to four target cards ..." (Cathartic Parting): those cards, then your library is shuffled even with no
  // target chosen (rulings on Perpetual Timepiece). Not when every target chosen has become illegal (CR 608.2b).
  if ((m = /^[Ss]huffle ((?:any number of|up to (?:one|two|three|four|five)) target (?:.+? )?cards?(?: with [^,]+?)? from your graveyard) into your library$/.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, "you");
    return what?.ref === "target" ? [{ type: "shuffleIntoLibrary", what, yours: true }] : null;
  }
  // "Target player shuffles up to three target cards from their graveyard into their library" (Memory's Journey, Quandrix
  // Command): cards in that player's graveyard (TargetSpec.inGraveyardOfTarget); that player shuffles their library even
  // when every card target has become illegal, as long as the player is still a legal target (rulings on Quandrix Command).
  // Loaming Shaman: "target player shuffles any number of target cards from their graveyard into their library" too.
  if ((m = /^[Tt]arget player shuffles (up to (?:one|two|three|four|five)|any number of) target cards from their graveyard into their library$/.exec(s))) {
    const who = parsePlayer("target player", ctx);
    const pi = ctx.targets.length - 1;
    const first = ctx.targets.length;
    const what = who?.ref === "target" ? parseCardTarget(`${m[1]} target cards from a graveyard`, ctx) : null;
    if (!what || what.ref !== "target" || ctx.targets[pi]?.kind !== "player") return null;
    for (let i = first; i < ctx.targets.length; i++) ctx.targets[i] = { ...ctx.targets[i]!, inGraveyardOfTarget: pi, text: "target card from that player's graveyard" };
    return [{ type: "shuffleIntoLibrary", what, who: who! }];
  }
  // Suffer the Past: "Exile X target cards from target player's graveyard": the player is a target too, and the cards must
  // be in that player's graveyard (TargetSpec.inGraveyardOfTarget), X of them (CR 601.2c, 107.3a).
  if ((m = /^[Ee]xile (X) target cards from target player's graveyard$/.exec(s))) {
    const who = parsePlayer("target player", ctx);
    const pi = ctx.targets.length - 1;
    const first = ctx.targets.length;
    const what = who?.ref === "target" ? parseCardTarget(`${m[1]} target cards from a graveyard`, ctx) : null;
    if (!what || what.ref !== "target" || ctx.targets[pi]?.kind !== "player") return null;
    for (let i = first; i < ctx.targets.length; i++) ctx.targets[i] = { ...ctx.targets[i]!, inGraveyardOfTarget: pi, text: "target card from that player's graveyard" };
    return [{ type: "exile", what }];
  }
  // Turn the Earth: "Choose up to three target cards in graveyards. The owners of those cards shuffle them into their
  // libraries." (body.ts reads it as this): each card into its owner's library, each library shuffled once (rulings, CR
  // 701.24c).
  // Serene Remembrance: "Shuffle ~ and up to three target cards from a single graveyard into their owners' libraries": the
  // cards, then the spell itself (with no targets chosen, only the spell; with all of them illegal, it doesn't resolve,
  // rulings, CR 608.2b).
  if ((m = /^Shuffle ~ and (up to (?:two|three|four|five) target cards from a single graveyard) into their owners' libraries$/.exec(s)) && ctx.spell) {
    const what = parseCardTarget(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "shuffleIntoLibrary", what }, { type: "shuffleSpell" }] : null;
  }
  if ((m = /^Shuffle (up to (?:one|two|three|four|five)|any number of) target cards from graveyards into their owners' libraries$/.exec(s))) {
    const what = parseCardTarget(`${m[1]} target cards from graveyards`, ctx);
    return what?.ref === "target" ? [{ type: "shuffleIntoLibrary", what }] : null;
  }
  // Teferi, Temporal Pilgrim: "Then they shuffle each nonland permanent they control into its owner's library", "they"
  // being the target opponent: each of them goes into its owner's library, then each of those libraries is shuffled (CR
  // 701.24c).
  if (ctx.lastPlayerTarget !== undefined && (m = /^(?:[Tt]hey shuffle|[Tt]hat player shuffles) (each [^,]+?) they control into its owner's library$/.exec(s))) {
    const what = parseObject(`${m[1]} that player controls`, ctx);
    return what?.ref === "each" ? [{ type: "shuffleIntoLibrary", what }] : null;
  }
  // "The owner of target nonland permanent shuffles it into their library."
  // Ice Magic: "Target creature's owner shuffles it into their library": the same.
  // Riftsweeper: "Choose target face-up exiled card. Its owner shuffles it into their library": a card in exile (CR 406).
  if ((m = /^The owner of (target face-up exiled card) shuffles it into their library$/.exec(s))) {
    const i = ctx.targets.length;
    const what = parseCardTarget(m[1]!, ctx);
    if (what?.ref !== "target" || !ctx.targets[i]?.inExile) {
      ctx.targets.length = i;
      return null;
    }
    return [{ type: "shuffleIntoLibrary", what }];
  }
  if ((m = /^The owner of (target .+?) shuffles it into their library$/i.exec(s) ?? /^([Tt]arget [a-z ]+?)'s owner shuffles it into their library$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "shuffleIntoLibrary", what }] : null;
  }


  // The Grim Captain's Locker: "Until end of turn, each creature card in your graveyard gains "Escape—{3}{B}, Exile four
  // other cards from your graveyard."": the cards there now (CR 611.2c), escape with that cost (CR 702.138a).
  if ((m = /^(?:[Uu]ntil end of turn, )?[Ee]ach ([a-z]+) card in your graveyard gains "Escape—((?:\{[WUBRGC\d]\})+), Exile (two|three|four|five|six) other cards from your graveyard\.?"(?: until end of turn)?$/.exec(s))) {
    if (!/^[Uu]ntil end of turn, /.test(s) === !/ until end of turn$/.test(s)) return null;
    const filter = parseTargetPhrase(`${m[1]} card from your graveyard`);
    if (filter?.kind !== "card" || !parseManaCost(m[2]!).supported) return null;
    return [{ type: "grantFlashback", each: { ...filter, owner: "you", text: `${m[1]} card in your graveyard` }, escape: { mana: m[2]!, exile: num(m[3]!) } }];
  }
  // Case of the Uneaten Feast: "Creature cards in your graveyard gain "You may cast this card from your graveyard" until end
  // of turn": the cards there now (CR 611.2c), each with a permission to cast it from there (game.ts grantedWays).
  if ((m = /^([A-Z][a-z]+) cards in your graveyard gain "You may cast (?:~|this card) from your graveyard\.?" until end of turn$/.exec(s))) {
    const filter = parseTargetPhrase(`${m[1]!.toLowerCase()} card from your graveyard`);
    if (filter?.kind !== "card") return null;
    return [{ type: "grantFlashback", each: { ...filter, owner: "you", text: `${m[1]!.toLowerCase()} card in your graveyard` }, cast: true }];
  }
  // Confession Dial: "Target legendary creature card in your graveyard gains escape until end of turn. The escape cost is
  // equal to its mana cost plus exile three other cards from your graveyard" (parseBody joins the two sentences): escape
  // (CR 702.138a) with the card's own mana cost, until end of turn (the cleanup step, CR 514.2).
  if ((m = /^(target .+? card in your graveyard(?: that's .+?)?) gains escape with its mana cost and exile (two|three|four|five) other cards until end of turn$/i.exec(s))) {
    const i = ctx.targets.length;
    // Desdemona, Freedom's Edge: "target creature card in your graveyard that's an artifact or that has mana value 3 or
    // less": a creature card that's either.
    const either = /^(target [a-z]+ card in your graveyard) that's an artifact or that has mana value (\d+) or less$/.exec(m[1]!);
    const what = parseCardTarget(either ? either[1]! : m[1]!, ctx, "you");
    if (either && ctx.targets[i]?.kind === "card" && !ctx.targets[i]!.anyOf) {
      const t = ctx.targets[i]!;
      ctx.targets[i] = { ...t, anyOf: [{ kind: "card", types: ["Artifact"], notTypes: [], notColors: [], text: "artifact" }, { kind: "card", types: [], notTypes: [], notColors: [], manaValue: { max: Number(either[2]) }, text: `mana value ${either[2]} or less` }], text: m[1]!.replace(/^target /, "") };
    }
    const spec = ctx.targets[i];
    // A land card can't be cast (CR 305.9).
    if (what?.ref !== "target" || spec?.kind !== "card" || ctx.targets.length !== i + 1 || spec.types?.includes("Land") || !(spec.types?.length || spec.anyOf?.length)) return null;
    return [{ type: "grantFlashback", what, escape: { exile: num(m[2]!) } }];
  }
  // Cursecloth Wrappings: "Target creature card in your graveyard gains embalm until end of turn. The embalm cost is equal
  // to its mana cost" (joined by parseBody): an activated ability of that card (CR 702.128a), with its mana cost.
  if ((m = /^(target creature card in your graveyard) gains (embalm|encore) with its mana cost until end of turn$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, "you");
    return what ? [{ type: "grantYardKeyword", what, keyword: m[2]!.toLowerCase() === "embalm" ? "Embalm" : "Encore" }] : null;
  }
  // Snapcaster Mage, Past in Flames: "... gains flashback until end of turn. The flashback cost is equal to its mana cost"
  // (parseBody joins the two sentences).
  if ((m = /^(target .+? card in your graveyard|each instant and sorcery card in your graveyard) gains flashback with its mana cost until end of turn$/i.exec(s))) {
    if (/^each/i.test(m[1]!)) return [{ type: "grantFlashback", each: { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], owner: "you", text: "instant and sorcery card in your graveyard" } }];
    const i = ctx.targets.length;
    const what = parseCardTarget(m[1]!, ctx, "you");
    const spec = ctx.targets[i];
    // Only instants and sorceries can be cast with flashback (CR 702.34a): other cards would gain it for nothing.
    if (!what || !spec?.types?.length || spec.types.some((t) => t !== "Instant" && t !== "Sorcery")) return null;
    return [{ type: "grantFlashback", what }];
  }

  // Graveyards. Cards in a graveyard (CR 109.2a): returning them, reanimating them, exiling them.
  // A graveyard ability's "{2}{B}: Return this card from your graveyard to your hand" (CR 113.6j) or "Whenever you
  // cast a multicolored spell, you may return ~ from your graveyard to your hand" (CR 113.6m): the card itself,
  // while it's still the object whose ability was activated or triggered (CR 400.7).
  // Persistent Marshstalker: "return ~ from your graveyard to the battlefield tapped and attacking" (attacking what its
  // controller chooses, CR 508.4).
  // Phoenix Chick: "... tapped and attacking with a +1/+1 counter on it" (it enters with it, CR 614.1c).
  // Retrofitted Transmogrant: "{3}{B}: Return ~ from your graveyard to the battlefield tapped with two +1/+1 counters on it".
  // Relentless X-ATM092: "... tapped with a finality counter on it" (CR 122.1h). Gallia, Tragic Host: "on her" (~).
  // Sinister Waltz (see body.ts): two of the three at random onto the battlefield, the other on the bottom; with only one or
  // two still legal targets, all of them onto the battlefield (rulings).
  if (/^Return two of three target creature cards from your graveyard at random to the battlefield and put the other on the bottom of your library$/.test(s)) {
    const what = parseObject("three target creature cards from your graveyard", ctx, true);
    if (what?.ref !== "target" || what.n !== 3) return null;
    return [{ type: "randomTargetsToBottom", what, keep: 2 }, { type: "putOntoBattlefield", what }];
  }
  // Wild Swing: one of the three targets still legal as it resolves, chosen at random then (rulings: one of the other two if
  // one has become illegal, the last one if two have; no time to respond between the choice and the destruction).
  if (/^Destroy one of three target nonenchantment permanents at random$/.test(s)) {
    const what = parseObject("three target nonenchantment permanents", ctx);
    if (what?.ref !== "target" || what.n !== 3) return null;
    return [{ type: "destroyRandomTarget", what }];
  }
  // Reins of the Vinesteed: "When enchanted creature dies, you may return this card from your graveyard to the battlefield
  // attached to a creature that shares a creature type with that creature": any such creature (not targeted, CR 303.4f) the
  // Aura could enchant, sharing a type with the dead creature as it last existed (rulings); none, and it stays.
  if (ctx.auraCard && /^[Rr]eturn ~ from your graveyard to the battlefield attached to a creature that shares a creature type with that creature$/.test(s))
    return [{ type: "putOntoBattlefield", what: { ref: "selfCard", moved: true, yours: true }, attachSharesTypeWithSubject: true }];
  if ((ctx.selfCard || ctx.auraCard) && (m = /^[Rr]eturn ~ from your graveyard to (your hand|the battlefield)( tapped)?( and attacking)?( with (a|two|three) (\+1\/\+1|finality) counters? on (?:it|~))?$/.exec(s))) {
    // An Aura's card only from its controller's graveyard (rulings on Screams from Within).
    const what = { ref: "selfCard" as const, ...(ctx.auraCard ? { moved: true as const, yours: true as const } : {}) };
    if ((m[3] || m[4]) && (m[1] === "your hand" || ctx.auraCard)) return null;
    if (m[3] && !m[2]) return null;
    return m[1] === "your hand" ? (m[2] ? null : [{ type: "bounce", what }]) : [{ type: "putOntoBattlefield", what, ...(m[2] ? { tapped: true } : {}), ...(m[3] ? { attacking: true as const } : {}), ...(m[4] ? { counters: { [m[6]!]: num(m[5]!) } } : {}) }];
  }
  // Startled Awake: "{3}{U}{U}: Put ~ from your graveyard onto the battlefield transformed": its back face up (CR 712.14a),
  // under your control (CR 110.2a).
  // Garland, Knight of Cornelia: "Return this card from your graveyard to the battlefield transformed", the same.
  if (ctx.selfCard && ctx.activated && /^(?:Put ~ from your graveyard onto|Return ~ from your graveyard to) the battlefield transformed$/.test(s)) return [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, transformed: true }];
  // Sandman, Shifting Scoundrel: "{3}{G}{G}: Return ~ and target land card from your graveyard to the battlefield tapped":
  // the card and the target enter at the same time (CR 608.2c); with the target illegal the ability doesn't resolve, so
  // the card stays too (CR 608.2b).
  // Slimefoot and Squee: "Return this card and up to one other target creature card ...": with no target chosen, only
  // the card (rulings).
  if (ctx.selfCard && ctx.activated && !ctx.targets.length && (m = /^Return ~ and ((?:up to one other )?target [a-z]+ card) from your graveyard to the battlefield( tapped)?$/.exec(s))) {
    const what = parseObject(`${m[1]} from your graveyard`, ctx, true);
    return what?.ref === "target" && !what.n && ctx.targets[what.index]?.kind === "card" && ctx.targets[what.index]?.owner === "you" ? [{ type: "putOntoBattlefield", what: { ...what, andSelfCard: true }, ...(m[2] ? { tapped: true } : {}) }] : null;
  }
  // Thwart the Grave: "Return target creature card and up to one target Cleric, Rogue, Warrior, or Wizard creature card from
  // your graveyard to the battlefield": both enter at the same time (CR 608.2c), and with one target illegal the other
  // still returns (CR 608.2b). The first needn't have a party type (rulings). Choosing one card for both targets (CR
  // 115.3) would return it once, so the second must be another card.
  if (!ctx.targets.length && (m = /^Return (target [a-z]+ card) and (up to one target [A-Za-z, ]+? card) from your graveyard to the battlefield$/.exec(s))) {
    const a = parseObject(`${m[1]} from your graveyard`, ctx, true);
    const b = a?.ref === "target" ? parseObject(`${m[2]} from your graveyard`, ctx, true) : null;
    if (a?.ref !== "target" || b?.ref !== "target" || a.n || b.n || b.index !== a.index + 1) return null;
    const ta = ctx.targets[a.index]!, tb = ctx.targets[b.index]!;
    if (ta.kind !== "card" || tb.kind !== "card" || ta.owner !== "you" || tb.owner !== "you" || ta.optional || !tb.optional) return null;
    tb.distinctFrom = [a.index];
    return [{ type: "putOntoBattlefield", what: { ref: "target", index: a.index, n: 2 } }];
  }
  // Relive the Past: "Return up to one target artifact card, up to one target land card, and up to one target non-Aura
  // enchantment card from your graveyard to the battlefield": all enter at the same time (CR 608.2c). One card could be
  // chosen for two of them (CR 115.3) but would return once all the same, so each must be another card.
  if (!ctx.targets.length && (m = /^Return (up to one target [a-z]+ card), (up to one target [a-z]+ card), and (up to one target [A-Za-z-]+ [a-z]+ card) from your graveyard to the battlefield$/.exec(s))) {
    const refs = [m[1]!, m[2]!, m[3]!].map((p) => parseObject(`${p} from your graveyard`, ctx, true));
    if (refs.some((r, i) => r?.ref !== "target" || r.n || r.index !== i)) return null;
    const specs = ctx.targets.slice(0, 3);
    if (specs.length !== 3 || specs.some((t) => t.kind !== "card" || t.owner !== "you" || !t.optional)) return null;
    specs[1]!.distinctFrom = [0];
    specs[2]!.distinctFrom = [0, 1];
    return [{ type: "putOntoBattlefield", what: { ref: "target", index: 0, n: 3 } }];
  }
  // Narcomoeba: "When ~ is put into your graveyard from your library, you may put it onto the battlefield": the card,
  // if it's still there (CR 400.7).
  if (ctx.selfCard && !ctx.activated && /^[Pp]ut (?:it|~) onto the battlefield$/.test(s)) return [{ type: "putOntoBattlefield", what: { ref: "selfCard" } }];
  // Gate Colossus: "Whenever a Gate you control enters, you may put ~ from your graveyard on top of your library": the card,
  // if it's still there (CR 400.7).
  if (ctx.selfCard && !ctx.activated && /^[Pp]ut ~ from your graveyard on top of your library$/.test(s)) return [{ type: "putInLibrary", what: { ref: "selfCard" }, position: "top" }];
  // Dragon Breath: "When a creature with mana value 6 or greater enters, you may return this card from your graveyard
  // to the battlefield attached to that creature."
  // An ability that works only while the card is in your graveyard (Loathsome Troll's rows): "~" is the card there.
  if (ctx.selfCard && ctx.activated && (m = /^(?:Return ~ to (your hand|the battlefield)( tapped)?|Put ~ (?:from your graveyard )?on top of your library)$/.exec(s)))
    return !m[1] ? [{ type: "putInLibrary", what: { ref: "selfCard" }, position: "top" }] : m[1] === "your hand" ? (m[2] ? null : [{ type: "bounce", what: { ref: "selfCard" } }]) : [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, ...(m[2] ? { tapped: true } : {}) }];
  // Gryff's Boon: "{3}{W}: Return ~ from your graveyard to the battlefield attached to target creature": the target, which
  // the ability targets (the Aura isn't cast, so it targets nothing itself, CR 303.4f); with that creature an illegal
  // target, the ability doesn't resolve and the card stays (rulings).
  // Eagle's Rescue: "... attached to target creature you control with power 1 or less": that target.
  if (ctx.selfCard && ctx.activated && (m = /^Return ~ from your graveyard to the battlefield attached to (target creature(?: you control(?: with power \d+ or less)?)?)$/.exec(s))) {
    const attachToTarget = ctx.targets.length;
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, attachToTarget }] : null;
  }
  // Traveling Plague: "When enchanted creature leaves the battlefield, that creature's controller returns ~ from its owner's
  // graveyard to the battlefield": the Aura's card that state-based actions put there (CR 704.5m), under the control of
  // the creature's controller as it last existed (CR 608.2h, 110.2a), who chooses what it enchants (CR 303.4f, rulings);
  // with nothing it could enchant, it stays (303.4g). It's a new object, with no counters (CR 400.7).
  if (ctx.auraCard && ctx.subject && /^[Tt]hat creature's controller returns ~ from its owner's graveyard to the battlefield$/.test(s)) {
    const who = parsePlayer("that creature's controller", ctx);
    return who?.ref === "subjectController" ? [{ type: "putOntoBattlefield", what: { ref: "selfCard", moved: true }, under: who }] : null;
  }
  if (ctx.selfCard && ctx.subject && /^Return ~ from your graveyard to the battlefield attached to that creature$/.test(s))
    return [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, attachToSubject: true }];
  // Sword of the Meek: "Return ~ from your graveyard to the battlefield, then attach it to that creature": it returns,
  // then the Equipment is attached if it can be (CR 701.3b); it stays unattached otherwise (rulings).
  if (ctx.selfCard && ctx.subject && /^Return ~ from your graveyard to the battlefield and then attach it to that creature$/.test(s))
    return [{ type: "putOntoBattlefield", what: { ref: "selfCard" } }, { type: "attach", what: { ref: "subject" }, source: { ref: "created" }, equipmentOnly: true }];
  // Ratonhnhaké꞉ton: "return target Equipment card from your graveyard to the battlefield, then attach it to that token":
  // it returns, then it's attached to the token the ability is about if it can be; otherwise it stays unattached (rulings).
  if (ctx.subjectIt && /^Return target Equipment card from your graveyard to the battlefield and then attach it to that token$/.test(s)) {
    const what = parseObject("target Equipment card from your graveyard", ctx, true);
    return what?.ref === "target" ? [{ type: "putOntoBattlefield", what }, { type: "attach", what: { ref: "subject" }, source: { ref: "created" }, equipmentOnly: true }] : null;
  }
  // The order of a graveyard (CR 404.1; see graveyard.ts): "Return the top creature card of your graveyard to the
  // battlefield" (Corpse Dance), "put the top creature card of defending player's graveyard onto the battlefield under
  // your control" (Bone Dancer), "Put the top card of your graveyard on the bottom of your library" (Soldevi Digger),
  // "If the top card of target player's graveyard is a creature card, put that card on top of that player's library"
  // (Guiding Spirit), "Exile the bottom card of target player's graveyard" (Phyrexian Furnace).
  if ((m = /^(Return|Put) the top (.+?) of (your|defending player's) graveyard (?:to|onto) the battlefield( under your control)?$/i.exec(s)) && (m[3] === "your") === !m[4] && (m[1] === "Return") === (m[3] === "your")) {
    const what = graveyardEnd(m[2]!, m[3]!, ctx);
    // An Aura's controller chooses what it enchants as it enters (CR 303.4f).
    if (!what?.filter?.types?.length || what.filter.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    return [{ type: "putOntoBattlefield", what }];
  }
  // "Return a creature card at random from your graveyard to your hand" (Haunted Fengraf), "Reorder your graveyard as you
  // choose" (Fossil Find), "Reorder your graveyard at random" (Search for Survivors).
  if ((m = /^[Rr]eturn an? (.+?) at random from your graveyard to your hand$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter === null ? null : [{ type: "randomFromGraveyard", dest: "hand", ...(filter ? { filter } : {}) }];
  }
  // Make a Wish: "Return two cards at random from your graveyard to your hand".
  if ((m = /^[Rr]eturn (two|three) cards at random from your graveyard to your hand$/.exec(s))) return [{ type: "randomFromGraveyard", dest: "hand", n: num(m[1]!) }];
  // Reap the Past: "Return X cards at random from your graveyard to your hand" (the spell itself is still on the stack,
  // rulings).
  if (/^[Rr]eturn X cards at random from your graveyard to your hand$/.test(s)) return [{ type: "randomFromGraveyard", dest: "hand", n: { count: { kind: "x" } } }];
  // Tomb Tyrant: "Return a Zombie creature card at random from your graveyard to the battlefield": a creature card, so a
  // permanent card (CR 110.4b).
  // Kheru Lich Lord: "return a creature card at random from your graveyard to the battlefield" ("it" after it is the
  // permanent it became, see noteLast).
  if ((m = /^[Rr]eturn an? ((?:.+? )?creature card) at random from your graveyard to the battlefield$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter?.types?.includes("Creature") ? [{ type: "randomFromGraveyard", dest: "battlefield", filter }] : null;
  }
  // Moldgraf Monstrosity: "return two creature cards at random from your graveyard to the battlefield": that many
  // different ones, chosen as it resolves, all of them if there are fewer; they enter at the same time.
  if ((m = /^[Rr]eturn (two|three) (.+? creature cards) at random from your graveyard to the battlefield$/.exec(s)) || (m = /^[Rr]eturn (two|three) (creature cards) at random from your graveyard to the battlefield$/.exec(s))) {
    const filter = parseSearchFilter(m[2]!.replace(/cards$/, "card"));
    return filter?.types?.includes("Creature") ? [{ type: "randomFromGraveyard", dest: "battlefield", filter, n: num(m[1]!) }] : null;
  }
  // Tariel, Reckoner of Souls: "Put a creature card chosen at random from target opponent's graveyard onto the battlefield
  // under your control": chosen as it resolves (rulings); the opponent is the only target.
  if (/^Put a creature card chosen at random from target opponent's graveyard onto the battlefield under your control$/.test(s)) {
    const from = parsePlayer("target opponent", ctx);
    return from?.ref === "target" ? [{ type: "randomFromGraveyard", dest: "battlefield", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, from }] : null;
  }
  // Druidic Ritual: "return up to one creature card and up to one land card from your graveyard to your hand": one choice
  // for each, as it resolves (not targeted); a creature land card can be either one.
  if ((m = /^[Rr]eturn up to one ([a-z]+ card) and up to one ([a-z]+ card) from your graveyard to your hand$/.exec(s))) {
    const f1 = parseSearchFilter(m[1]!);
    const f2 = parseSearchFilter(m[2]!);
    return f1 && f2 ? [{ type: "chooseFromGraveyard", n: 1, upTo: true, filter: f1 }, { type: "chooseFromGraveyard", n: 1, upTo: true, filter: f2 }] : null;
  }
  // Uncle's Musings: "Return up to X permanent cards from your graveyard to your hand, where X is the number of colors of
  // mana spent to cast ~": chosen as it resolves, as many as that (replaced in body.ts), not targeted.
  if ((m = /^[Rr]eturn up to X (.+?) from your graveyard to your hand$/.exec(s)) && ctx.whereX && !/\b(?:target|other|another|that|those)\b/.test(m[1]!)) {
    // Bound: "up to X cards", any cards.
    const filter = parseSearchFilter(m[1]!.replace(/ and\/or /g, " or "));
    if (filter === null || (!filter && m[1] !== "cards")) return null;
    return [{ type: "chooseFromGraveyard", n: 0, nAmount: { count: { kind: "x" } }, upTo: true, ...(filter ? { filter } : {}) }];
  }
  // "Return a creature or planeswalker card from your graveyard to your hand" (Takenuma), "return up to two instant
  // and/or sorcery cards ...": chosen as it resolves, not targeted.
  if ((m = /^[Rr]eturn (an?|one|two|three|up to one|up to two|up to three) (.+?) from your graveyard to your hand$/.exec(s)) && !/\b(?:target|other|another|that|those)\b/.test(m[2]!)) {
    const filter = parseSearchFilter(m[2]!.replace(/ and\/or /g, " or "));
    const n = num(m[1]!.replace(/^up to /, "").replace(/^an?$/, "one"));
    if (filter === null || !Number.isInteger(n) || n < 1) return null;
    return [{ type: "chooseFromGraveyard", n, ...(filter ? { filter } : {}), ...(/^up to /.test(m[1]!) ? { upTo: true as const } : {}) }];
  }
  // Karn, the Great Creator; Coax from the Blind Eternities: "... or choose a face-up artifact card you own in exile. Put
  // that card into your hand" (see parseBody): chosen as it resolves, never a face-down card (rulings on Karn).
  if ((m = /^(?:[Yy]ou may )?[Pp]ut a face-up (.+?) you own in exile into your hand$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter === null ? null : [{ type: "chooseFromGraveyard", n: 1, upTo: true, fromExile: true, ...(filter ? { filter } : {}) }];
  }
  // Karn, Scion of Urza: "Put a card you own with a silver counter on it from exile into your hand": one of them, chosen as
  // it resolves (not targeted).
  if ((m = /^[Pp]ut a card you own with an? ([a-z]+) counter on it from exile into your hand$/.exec(s)))
    return [{ type: "chooseFromGraveyard", n: 1, fromExile: true, filter: { kind: "card", types: [], notTypes: [], notColors: [], counter: counterKind(m[1]!), text: `card with a ${m[1]} counter on it` } }];
  // Oblivion Sower: "you may put any number of land cards that player owns from exile onto the battlefield under your
  // control": face-up cards in exile, however they got there (rulings), chosen as it resolves.
  if ((m = /^(?:[Tt]hen )?(?:[Yy]ou may )?[Pp]ut any number of (.+?) (that player|target opponent|target player) owns from exile onto the battlefield under your control$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!.replace(/ cards$/, " card"));
    const who = parsePlayer(m[2]!, ctx);
    if (!filter || !who || who.ref !== "target") return null;
    return [{ type: "chooseFromGraveyard", n: 0, anyNumber: true, upTo: true, fromExile: true, who, dest: "battlefield", filter }];
  }
  // Ripples of Undeath: "Mill three cards. Then you may pay {1} and 3 life. If you do, put a card from among those cards into
  // your hand": one of the cards just milled, still in your graveyard.
  if (ctx.afterMill && /^[Pp]ut a card from among (?:those cards|them) into your hand$/.test(s)) return [{ type: "chooseFromGraveyard", n: 1, milled: true }];
  // "You may put a land card from your graveyard on top of your library" (Halo-Charged Skaab, after milling): chosen as
  // it resolves, not targeted.
  // Ardent Dustspeaker: "you may put an instant or sorcery card from your graveyard on the bottom of your library".
  if ((m = /^(?:[Yy]ou may )?[Pp]ut (an?|one) (.+?) from your graveyard on (top|the bottom) of your library$/.exec(s)) && !/\b(?:target|other|another|that|those)\b/.test(m[2]!) && (m[3] === "top" || (m[1] !== "one" && m[2] !== "card"))) {
    const filter = parseSearchFilter(m[2]!.replace(/ and\/or /g, " or "));
    if (filter === null) return null;
    return [{ type: "chooseFromGraveyard", n: 1, dest: m[3] === "top" ? "libraryTop" : "libraryBottom", ...(filter ? { filter } : {}), ...(/^[Yy]ou may /.test(s) ? { upTo: true as const } : {}) }];
  }
  // Anurid Scavenger: "sacrifice ~ unless you put a card from your graveyard on the bottom of your library": any card,
  // chosen as it resolves (not targeted).
  if (/^[Pp]ut a card from your graveyard on the bottom of your library$/.test(s)) return [{ type: "chooseFromGraveyard", n: 1, dest: "libraryBottom" }];
  // Crown of Convergence: "Put the top card of your library on the bottom of your library".
  if (/^[Pp]ut the top card of your library on the bottom of your library$/.test(s)) return [{ type: "topToBottom" }];
  // Stream of Thought: "You shuffle up to four cards from your graveyard into your library": not targeted, chosen as it
  // resolves (rulings), put into the library, which is then shuffled (CR 701.24a), even with none chosen.
  if ((m = /^You shuffle up to (one|two|three|four|five) cards from your graveyard into your library$/.exec(s))) return [{ type: "chooseFromGraveyard", n: num(m[1]!), upTo: true, dest: "libraryBottom" }, { type: "shuffle", who: { ref: "you" } }];
  // Stillness in Motion: "put five cards from your graveyard on top of your library in any order": chosen as it resolves
  // (all of them with fewer), then put in the order you choose (CR 401.4).
  if ((m = /^(?:[Tt]hen )?[Pp]ut (two|three|four|five|six|seven) cards from your graveyard on top of your library in any order$/.exec(s))) {
    const n = num(m[1]!);
    return [{ type: "chooseFromGraveyard", n, dest: "libraryTop" }, { type: "orderTop", who: { ref: "you" }, n }];
  }
  // "Return any number of cards with different mana values from your graveyard to your hand" (Seasons Past): chosen as it
  // resolves (rulings), no two with the same mana value; X in a mana cost is 0 and a card with no mana cost has 0 (CR 202.3).
  if ((m = /^[Rr]eturn any number of (.+?) with different mana values from your graveyard to your hand$/.exec(s)) && !/\b(?:target|other|another|that|those)\b/.test(m[1]!)) {
    const filter = parseSearchFilter(m[1]!.replace(/\bcards\b/, "card").replace(/ and\/or /g, " or "));
    if (filter === null) return null;
    return [{ type: "chooseFromGraveyard", n: 0, upTo: true, distinctManaValues: true, ...(filter ? { filter } : {}) }];
  }
  // Gruesome Menagerie (rewritten in body.ts): one creature card of each mana value from 1 to 3 that's in your graveyard,
  // as many as there are of those mana values (a card with {X} in its cost has mana value 0 there, rulings).
  if (s === "Return a creature card with mana value 1, 2, and 3 each from your graveyard to the battlefield")
    return [{ type: "chooseFromGraveyard", n: 3, distinctManaValues: true, dest: "battlefield", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], manaValue: { min: 1, max: 3 }, text: "creature card with mana value 1, 2 or 3" } }];
  // Queen Kayla bin-Kroog (rewritten in body.ts): up to one artifact or creature card of each mana value from 1 to 3 among
  // the cards the discard before put into your graveyard, or into exile instead (rulings), all at once.
  if (s === "Return up to one artifact or creature card with mana value 1, 2, and 3 each discarded this way to the battlefield")
    return [{ type: "chooseFromGraveyard", n: 3, upTo: true, distinctManaValues: true, discarded: true, discardedExiled: true, dest: "battlefield", filter: { kind: "card", types: ["Artifact", "Creature"], notTypes: [], notColors: [], manaValue: { min: 1, max: 3 }, text: "artifact or creature card with mana value 1, 2 or 3" } }];
  // "Return any number of permanent cards with different names from your graveyard to the battlefield" (Eerie Ultimatum):
  // chosen as it resolves (rulings), one of each name; an Aura can't enchant another card entering with it (rulings).
  if ((m = /^[Rr]eturn any number of (.+?) with different names from your graveyard to the battlefield$/.exec(s)) && !/\b(?:target|other|another|that|those)\b/.test(m[1]!)) {
    const filter = parseSearchFilter(m[1]!.replace(/\bcards\b/, "card"));
    if (filter === null) return null;
    return [{ type: "chooseFromGraveyard", n: 99, upTo: true, oneEach: true, dest: "battlefield", ...(filter ? { filter } : {}) }];
  }
  // "Return a creature card from your graveyard to the battlefield" (Summon Undead), "... tapped" (Port of Karfell), "... with
  // a finality counter on it" (Charnel Serenade): chosen as it resolves, not targeted, under your control (CR 110.2a).
  // "Each player puts a creature card from their graveyard onto the battlefield" (Exhume), "... a creature card with mana
  // value 3 or less ..." (Crypt Champion): each chooses one of their own as it resolves. Only creature cards, so no Aura
  // needs something to enchant.
  if ((m = /^[Ee]ach player puts an? (creature card(?: with mana value \d+ or less)?) from their graveyard onto the battlefield$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    if (!filter || !filter.types?.includes("Creature")) return null;
    return [{ type: "chooseFromGraveyard", n: 1, dest: "battlefield", filter, who: { ref: "eachPlayer" } }];
  }
  // Enslaved Horror: "each other player may return a creature card from their graveyard to the battlefield": each
  // opponent (every other player is one here) chooses one of their own or none as it resolves, all entering together.
  if ((m = /^[Ee]ach (?:other player|opponent) may return an? (creature card) from their graveyard to the battlefield$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? [{ type: "chooseFromGraveyard", n: 1, upTo: true, dest: "battlefield", filter, who: { ref: "eachOpponent" } }] : null;
  }
  // Ill-Gotten Gains: "Each player ... returns up to three cards from their graveyard to their hand": each chooses their own
  // as it resolves (fewer if they want, rulings), in APNAP order, all returned together.
  if ((m = /^[Ee]ach player returns up to (one|two|three) cards from their graveyard to their hand$/.exec(s))) return [{ type: "chooseFromGraveyard", n: num(m[1]!), upTo: true, who: { ref: "eachPlayer" } }];
  // Virtus's Maneuver: "Each friend returns a creature card from their graveyard to their hand": each chooses one of their
  // own as it resolves, in APNAP order, all returned together.
  if ((m = /^[Ee]ach player who chose ([a-z]+) returns an? ([a-z]+ card) from their graveyard to their hand$/.exec(s)) && ctx.chooseWords?.includes(m[1]!)) {
    const filter = parseSearchFilter(m[2]!);
    return filter ? [{ type: "chooseFromGraveyard", n: 1, filter, who: { ref: "choseWord", option: m[1]! } }] : null;
  }
  // Fall of the Thran: "Each player returns two land cards from their graveyard to the battlefield": each chooses their own
  // as it resolves, all at the same time, the one card if they have only one (rulings).
  if ((m = /^[Ee]ach player returns (an?|two|three) land cards? from their graveyard to the battlefield$/.exec(s)))
    return [{ type: "chooseFromGraveyard", n: num(m[1]!.replace(/^an?$/, "one")), dest: "battlefield", filter: { kind: "card", types: ["Land"], notTypes: [], notColors: [], text: "land card" }, who: { ref: "eachPlayer" } }];
  // Moratorium Stone: "Exile target nonland card from a graveyard, all other cards from graveyards with the same name as that
  // card, and all permanents with that name": one target, and the rest by its name as this resolves; nothing if it's gone.
  if ((m = /^Exile (target [a-z ]*card from a graveyard), all other cards from graveyards with the same name as that card, and all permanents with that name$/.exec(s))) {
    const fx = parseZonesSentence(`Exile ${m[1]}`, ctx);
    const one = fx?.length === 1 ? fx[0] : undefined;
    if (one?.type !== "exile" || one.what.ref !== "target" || one.what.n || Object.keys(one).some((k) => !["type", "what"].includes(k))) return null;
    return [{ type: "exile", what: { ...one.what, sameNameYardsAndPermanents: true } }];
  }
  // Echoing Return: "Return target creature card and all other cards with the same name as that card from your graveyard to
  // your hand": all at once; nothing if the target is gone (rulings).
  if ((m = /^Return (target .+? card) and all other cards with the same name as that card from your graveyard to your hand$/.exec(s))) {
    const fx = parseZonesSentence(`Return ${m[1]} from your graveyard to your hand`, ctx);
    const one = fx?.length === 1 ? fx[0] : undefined;
    if (one?.type !== "bounce" || one.what.ref !== "target") return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { kind: "card", text: "card with the same name as that card" }, toHand: true, sameNameAs: one.what.index }];
  }
  // Rat King, Verminister: "Return target creature card and all other cards with the same name as that card from your
  // graveyard to the battlefield tapped": the same, onto the battlefield, all at once (CR 608.2c).
  if ((m = /^Return (target .+? card) and all other cards with the same name as that card from your graveyard to the battlefield( tapped)?$/.exec(s))) {
    const fx = parseZonesSentence(`Return ${m[1]} from your graveyard to the battlefield`, ctx);
    const one = fx?.length === 1 ? fx[0] : undefined;
    if (one?.type !== "putOntoBattlefield" || one.what.ref !== "target" || Object.keys(one).some((k) => !["type", "what"].includes(k))) return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { kind: "card", text: "card with the same name as that card" }, sameNameAs: one.what.index, ...(m[2] ? { tapped: true } : {}) }];
  }
  // Visions of Dread: "Target opponent puts a creature card of their choice from their graveyard onto the battlefield under
  // your control": that player chooses one of their own as it resolves, not targeted; it enters under your control.
  // Scrounge (body.ts makes it this sentence): "an artifact card" the same way.
  if ((m = /^(Target opponent|Target player) puts an? (creature card|artifact card) of their choice from their graveyard onto the battlefield under your control$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const filter = parseSearchFilter(m[2]!);
    if (!who || !filter) return null;
    return [{ type: "chooseFromGraveyard", n: 1, dest: "battlefield", filter, who, underYours: true }];
  }
  // "... with a number of +1/+1 counters on it equal to that result" (Grave Endeavor): counted as it resolves.
  const counted = new RegExp(`^([Rr]eturn an? .+? from your graveyard to the battlefield(?: tapped)?) with a number of (${COUNTER}) counters on it equal to (.+)$`).exec(s);
  if (counted) {
    const n = parseCount(counted[4]!, ctx); // COUNTER has a group of its own
    const fx = n && parseZonesSentence(`${counted[1]} with a ${counted[2]} counter on it`, ctx);
    return n && fx?.length === 1 && fx[0]!.type === "chooseFromGraveyard" && fx[0]!.counters ? [{ ...fx[0]!, countersN: n }] : null;
  }
  // Rofellos's Gift: "Reveal any number of green cards in your hand. Return an enchantment card from your graveyard to your
  // hand for each card revealed this way": that many, chosen as it resolves (rulings), not targeted.
  if ((m = /^[Rr]eturn an? ([a-z]+ card) from your graveyard to your hand for each card revealed this way$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? [{ type: "chooseFromGraveyard", n: 1, nAmount: { count: { kind: "revealedFromHand" } }, filter }] : null;
  }
  // Recall: "Discard X cards, then return a card from your graveyard to your hand for each card discarded this way": as many
  // as were discarded, chosen after the discard, the discarded cards among them (rulings), not targeted.
  if (ctx.afterYourDiscard && /^[Rr]eturn a card from your graveyard to your hand for each card discarded this way$/.test(s)) return [{ type: "chooseFromGraveyard", n: 1, nAmount: { count: { kind: "discardedThisWay" } } }];
  // "Return X creature cards from your graveyard to the battlefield", after "sacrifice any number of ..." (Lich-Knights'
  // Conquest): that many, chosen as it resolves.
  if ((m = /^[Rr]eturn X (creature cards) from your graveyard to the battlefield$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? [{ type: "chooseFromGraveyard", n: 1, nAmount: amt("X"), dest: "battlefield", filter }] : null;
  }
  if ((m = new RegExp(`^[Rr]eturn (an?|one|two|up to one|up to two|any number of) (.+?) from your graveyard to the battlefield( tapped)?(?: with an? (${COUNTER}) counter on it)?$`).exec(s)) && !/\b(?:target|other|another|that|those|at random)\b/.test(m[2]!)) {
    // "... with mana value X or less ..., where X is the amount of {S} spent to cast this spell" (Blood on the Snow): X
    // as it resolves.
    const mvX = / with mana value X or less$/.exec(m[2]!);
    if (mvX && !ctx.spell && !ctx.activated && !ctx.whereX) return null;
    // "Up to two creature cards with total mana value 4 or less" (Lively Dirge): the cards chosen together.
    const total = !mvX ? / with total mana value (\d+) or less$/.exec(m[2]!) : null;
    // "Up to two creature cards of the chosen type" (Haunting Voyage): bound to the type as it resolves.
    const ofChosen = !mvX && !total && / cards? of the chosen type$/.test(m[2]!);
    const parsed = parseSearchFilter(m[2]!.slice(0, (mvX ?? total)?.index).replace(/ of the chosen type$/, "").replace(/ and\/or /g, " or "));
    const filter = parsed && ofChosen ? { ...parsed, chosen: "type" as const, text: `${parsed.text} of the chosen type` } : parsed;
    // Technomancer: "return any number of artifact creature cards with total mana value 6 or less": only with a total.
    const anyNumber = m[1] === "any number of";
    if (anyNumber && !total) return null;
    const n = anyNumber ? 99 : num(m[1]!.replace(/^up to /, "").replace(/^an?$/, "one"));
    if (filter === null || !Number.isInteger(n) || n < 1) return null;
    if (ofChosen && !filter?.types?.includes("Creature")) return null;
    if (total && (!filter || n < 2)) return null;
    return [{ type: "chooseFromGraveyard", n, dest: "battlefield", ...(anyNumber ? { upTo: true as const } : {}), ...(total ? { totalMv: Number(total[1]) } : {}), ...(filter ? { filter: mvX ? { ...filter, text: `${filter.text} with mana value X or less` } : filter } : {}), ...(mvX ? { mvMax: amt("X") } : {}), ...(/^up to /.test(m[1]!) ? { upTo: true as const } : {}), ...(m[3] ? { tapped: true as const } : {}), ...(m[4] ? { counters: { [counterKind(m[4])]: 1 } } : {}) }];
  }
  // "Target player exiles a card from their graveyard" (Relic of Progenitus), "Exile a card from your graveyard"
  // (Decaying Soil): that player chooses as it resolves.
  // Emeritus of Ideation: "exile eight cards from your graveyard". Curse of Oblivion: "that player exiles two cards from
  // their graveyard" (all of them with fewer, rulings).
  if ((m = new RegExp(`^(?:(Target player|Target opponent|[Tt]hat player) exiles|[Ee]xile) ${NUM} (.+?) from (their|your) graveyard$`).exec(s)) && (m[4] === "their") === !!m[1]) {
    const who = m[1] ? parsePlayer(m[1].toLowerCase(), ctx) : undefined;
    // Ichorid: "exile a black creature card other than ~ from your graveyard": not the card with the ability itself.
    const other = !m[1] ? /^(.+? cards?) other than ~$/.exec(m[3]!) : null;
    const filter = parseSearchFilter(other ? other[1]! : m[3]!);
    const n = num(m[2]!.replace(/^an?$/, "one"));
    if (who === null || filter === null || !Number.isInteger(n) || (other && !filter)) return null;
    return [{ type: "chooseFromGraveyard", n, dest: "exile", ...(who ? { who } : {}), ...(filter ? { filter: other ? { ...filter, text: `${filter.text} other than ~` } : filter } : {}), ...(other ? { notSelf: true as const } : {}) }];
  }
  // Augusta, Order Returned: "each player exiles a card from their graveyard": each chooses one in APNAP order, then all
  // the chosen cards are exiled at the same time (CR 101.4, rulings).
  if (/^[Ee]ach player exiles a card from their graveyard$/.test(s)) return [{ type: "chooseFromGraveyard", n: 1, dest: "exile", who: { ref: "eachPlayer" } }];
  // Grave Consequences: "Each player may exile any number of cards from their graveyard": each chooses theirs in APNAP
  // order, then they're all exiled at the same time (CR 101.4).
  if (/^[Ee]ach player may exile any number of cards from their graveyard$/.test(s)) return [{ type: "chooseFromGraveyard", n: ANY_NUMBER, upTo: true, dest: "exile", who: { ref: "eachPlayer" } }];
  // Watchers of the Dead: "Each opponent chooses two cards in their graveyard and exiles the rest": each chooses in APNAP
  // order, knowing the choices before, then all the other cards are exiled at once; with two or fewer, none (rulings).
  if ((m = /^(Each opponent|Each player) chooses (a|one|two|three) cards? in their graveyard and exiles the rest$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const n = num(m[2]!.replace(/^an?$/, "one"));
    if (!who || !Number.isInteger(n) || (n === 1) !== /^(a|one)$/.test(m[2]!)) return null;
    return [{ type: "chooseFromGraveyard", n, dest: "keep", who }];
  }
  // "Choose an opponent. That player returns a card from their graveyard to their hand" (Skullwinder): that player
  // chooses which, as it resolves (rulings).
  if ((m = /^(Target player|Target opponent|That player) returns (an?|one|two|three) (.+?) from their graveyard to their hand$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const filter = parseSearchFilter(m[3]!);
    const n = num(m[2]!.replace(/^an?$/, "one"));
    if (!who || filter === null || !Number.isInteger(n)) return null;
    return [{ type: "chooseFromGraveyard", n, who, ...(filter ? { filter } : {}) }];
  }
  // "Exile a card from a graveyard" (Cemetery Prowler): any player's, chosen as it resolves (not targeted).
  if (/^[Ee]xile a card from a graveyard$/.test(s)) return [{ type: "chooseFromGraveyard", n: 1, dest: "exile", anyGraveyard: true }];
  // Entrails Feaster: "exile a creature card from a graveyard": the same, a card of that kind.
  if ((m = /^[Ee]xile an? ((?:creature|artifact|land|instant|sorcery|enchantment) card) from a graveyard$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? [{ type: "chooseFromGraveyard", n: 1, dest: "exile", anyGraveyard: true, filter }] : null;
  }
  // Realmbreaker, the Invasion Tree: "Target opponent mills three cards. Put a land card from their graveyard onto the
  // battlefield tapped under your control." Not targeted: you choose it as this resolves, any land card there, milled
  // just now or not (rulings).
  if ((m = /^[Pp]ut an? (.+? card) from (their|that player's) graveyard onto the battlefield( tapped)? under your control$/.exec(s))) {
    const who = parsePlayer(m[2] === "their" ? "that player" : m[2]!.replace(/'s$/, ""), ctx);
    const filter = parseSearchFilter(m[1]!);
    if (!who || who.ref === "you" || !filter) return null;
    return [{ type: "chooseFromGraveyard", n: 1, dest: "battlefield", who, youChoose: true, filter, ...(m[3] ? { tapped: true as const } : {}) }];
  }
  // "Put a creature card from a graveyard onto the battlefield under your control" (Extract from Darkness): the same,
  // under your control; "from any graveyard" (The Deck of Many Things) the same; "... onto the battlefield tapped under your
  // control" (Soul of Windgrace).
  if ((m = /^(?:[Yy]ou put|[Pp]ut) an? (.+? card) from (?:a|any) graveyard onto the battlefield( tapped)? under your control$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    if (!filter) return null;
    return [{ type: "chooseFromGraveyard", n: 1, dest: "battlefield", anyGraveyard: true, filter, ...(m[2] ? { tapped: true as const } : {}) }];
  }
  if (/^Put a card chosen at random from your graveyard onto the battlefield if it's a creature card, otherwise exile it$/.test(s)) return [{ type: "randomFromGraveyard", dest: "creatureOrExile" }];
  if (/^Put a card chosen at random from your graveyard onto the battlefield if it's a creature card, otherwise into your hand$/.test(s)) return [{ type: "randomFromGraveyard", dest: "creatureOrHand" }];
  if ((m = /^Reorder your graveyard (as you choose|at random)$/.exec(s))) return [{ type: "reorderGraveyard", ...(m[1] === "at random" ? { random: true as const } : {}) }];
  if ((m = /^Put the top card of your graveyard on (top|the bottom) of your library$/i.exec(s))) return [{ type: "putInLibrary", what: { ref: "graveyardEnd", who: { ref: "you" } }, position: m[1] === "top" ? "top" : "bottom" }];
  if ((m = /^If the top card of (target player's|your) graveyard is an? (.+?), put that card on top of (that player's|your) library$/i.exec(s)) && (m[1] === "your") === (m[3] === "your")) {
    const what = graveyardEnd(m[2]!, m[1]!, ctx);
    return what?.filter ? [{ type: "putInLibrary", what: { ...what, only: true }, position: "top" }] : null;
  }
  if ((m = /^Exile the (top|bottom) card of (target player's|your) graveyard$/i.exec(s))) {
    const what = graveyardEnd("card", m[2]!, ctx);
    return what ? [{ type: "exile", what: { ...what, ...(m[1] === "bottom" ? { bottom: true as const } : {}) } }] : null;
  }
  // "Return all land cards from your graveyard to the battlefield tapped" (Will of the Sultai), "Return all basic land cards
  // from all graveyards to the battlefield tapped under their owners' control" (Planar Birth), "Return all enchantment
  // cards from your graveyard to the battlefield" (Replenish: each Aura's controller chooses what it enchants, CR 303.4f).
  // "Each player returns each creature card from their graveyard to the battlefield" (Magister of Worth): the same as from
  // all graveyards under their owners' control.
  // "Each player returns all creature cards from their graveyard to the battlefield" (Twilight's Call), "... all creature
  // cards of a type chosen this way ..." (Patriarch's Bidding) likewise.
  // Pyrrhic Revival: "... to the battlefield with an additional -1/-1 counter on it": each enters with one (CR 614.1c).
  const withCounter = /^(Each player returns each creature card from their graveyard to the battlefield) with an additional (-1\/-1|\+1\/\+1) counter on it$/.exec(s);
  if (withCounter) {
    const fx = parseZonesSentence(withCounter[1]!, ctx);
    if (fx?.length !== 1 || fx[0]!.type !== "returnAllFromGraveyard") return null;
    return [{ ...fx[0]!, counters: { [withCounter[2]!]: 1 } }];
  }
  // Shilgengar, Sire of Famine: "Return each creature card from your graveyard to the battlefield with a finality counter
  // on it": each enters with one (CR 614.1c, 122.1h).
  const yardWithCounter = /^Return each (creature|artifact|enchantment|permanent) card from your graveyard to the battlefield with a (finality|\+1\/\+1) counter on it$/.exec(s);
  if (yardWithCounter) {
    const fx = parseZonesSentence(`Return all ${yardWithCounter[1]} cards from your graveyard to the battlefield`, ctx);
    if (fx?.length !== 1 || fx[0]!.type !== "returnAllFromGraveyard" || fx[0]!.toHand || fx[0]!.who.ref !== "you") return null;
    return [{ ...fx[0]!, counters: { [yardWithCounter[2]!]: 1 } }];
  }
  const eachReturns = /^Each player returns each (.+?) card from their graveyard to the battlefield( tapped)?$/.exec(s) ?? /^Each player returns all (.+?) cards from their graveyard to the battlefield( tapped)?$/.exec(s);
  // Balthor the Defiled: "all black and all red creature cards": each card that is either.
  if (eachReturns) s = `Return all ${eachReturns[1]!.replace(/^(white|blue|black|red|green) and all (white|blue|black|red|green) creature$/, "$1 or $2 creature")} cards from all graveyards to the battlefield${eachReturns[2] ?? ""} under their owners' control`;
  const ofChosen = /^Each player returns all (\w+) cards of a type chosen this way from their graveyard to the battlefield$/.exec(s);
  if (ofChosen) {
    const spec = parseTargetPhrase(`${ofChosen[1]} card of a type chosen this way from a graveyard`, { chosen: true });
    if (spec?.kind !== "card" || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { ...spec, text: `${ofChosen[1]} card of a type chosen this way` }, owners: true }];
  }
  // "Choose a creature type. Return all creature cards of the chosen type from your graveyard to the battlefield."
  // (Bloodline Bidding).
  if ((m = /^[Rr]eturn all (creature) cards of the chosen type from your graveyard to (the battlefield|your hand)$/.exec(s))) {
    const spec = parseTargetPhrase(`${m[1]} card of the chosen type from a graveyard`, { chosen: true });
    if (spec?.kind !== "card" || spec.chosen !== "type") return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { ...spec, text: `${m[1]} card of the chosen type` }, ...(m[2] === "your hand" ? { toHand: true as const } : {}) }];
  }
  // Creeping Renaissance: "Choose a permanent type. Return all cards of the chosen type from your graveyard to your hand."
  if (/^[Rr]eturn all cards of the chosen type from your graveyard to your hand$/.test(s)) return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { kind: "card", chosen: "type", text: "card of the chosen type" }, toHand: true }];
  // "Put all creature cards from all graveyards onto the battlefield under your control" (Rise of the Dark Realms).
  const yours = /^(?:Put|Return) all (.+?) cards from all graveyards (?:onto|to) the battlefield( tapped)? under your control$/.exec(s);
  if (yours) {
    const spec = parseTargetPhrase(`${yours[1]!.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    if (spec?.kind !== "card" || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { ...spec, text: `${yours[1]} card` }, ...(yours[2] ? { tapped: true } : {}) }];
  }
  // Saprazzan Bailiff: "Return all artifact and enchantment cards from all graveyards to their owners' hands": each card
  // that's either, to its owner's hand.
  if ((m = /^[Rr]eturn all (artifact|creature|enchantment|instant|sorcery|land) and (artifact|creature|enchantment|instant|sorcery|land) cards from all graveyards to their owners' hands$/.exec(s))) {
    const filter = parseSearchFilter(`${m[1]} or ${m[2]} card`);
    return filter ? [{ type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { ...filter, text: `${m[1]} and ${m[2]} card` }, toHand: true }] : null;
  }
  // Soulquake: "Return all creatures on the battlefield and all creature cards in graveyards to their owners' hands": one
  // instruction; the permanents and then the cards (nothing moved by the first part lands in a graveyard).
  if (/^[Rr]eturn all creatures on the battlefield and all creature cards in graveyards to their owners' hands$/.test(s)) {
    return [
      { type: "bounce", what: { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "all creatures" } } },
      { type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { kind: "card", types: ["Creature"], text: "creature card" }, toHand: true },
    ];
  }
  // Infernal Caretaker: "return all Zombie cards from all graveyards to their owners' hands": each card with that creature
  // type (a changeling card too, CR 702.73a), to its owner's hand.
  if ((m = /^[Rr]eturn all ([A-Z][a-z]+) cards from all graveyards to their owners' hands$/.exec(s)) && CREATURE_TYPES.has(m[1]!)) {
    return [{ type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { kind: "card", subtypes: [m[1]!], text: `${m[1]} card` }, toHand: true }];
  }
  // Demigod of Revenge: "return all cards named ~ from your graveyard to the battlefield" (its cast trigger): the source's
  // name (CR 201.5); the spell itself is on the stack, not there (rulings).
  if (/^[Rr]eturn all cards named ~ from your graveyard to the battlefield$/.test(s)) {
    return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { kind: "card", named: "~", text: "card named ~" } }];
  }
  // Myr Servitor: "each player returns all cards named ~ from their graveyard to the battlefield": every card with the
  // source's name (CR 201.5) from all graveyards, each under its owner's control.
  if (/^[Ee]ach player returns all cards named ~ from their graveyard to the battlefield$/.test(s)) {
    return [{ type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { kind: "card", named: "~", text: "card named ~" }, owners: true }];
  }
  // "Return each Aura card from your graveyard to the battlefield" (Retether): its controller chooses what each enchants as
  // it enters (CR 303.4f); one with nothing to enchant stays in the graveyard (303.4g).
  if (/^[Rr]eturn each Aura card from your graveyard to the battlefield$/.test(s)) {
    return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { kind: "card", types: [], notTypes: [], notColors: [], subtypes: ["Aura"], text: "Aura card" } }];
  }
  // Bringer of the Last Gift: "Then each player returns all creature cards from their graveyard that weren't put there
  // this way to the battlefield": each player's own, under their control (CR 110.2a), all at once, but not the cards the
  // sacrifice before it put there.
  if ((m = /^(?:Then )?[Ee]ach player returns all creature cards from their graveyard that weren't put there this way to the battlefield$/.exec(s))) {
    return [{ type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card that wasn't put there this way" }, owners: true, notSacrificedThisWay: true }];
  }
  // "Return all creature cards with mana value 2 or less from your graveyard to the battlefield" (Raise the Past).
  // Fix What's Broken: "Return each artifact and creature card with mana value X from your graveyard to the battlefield":
  // exactly the X it was cast with (CR 107.3), the same as "all ... cards".
  // Rally the Ancestors: "Return each creature card with mana value X or less ...".
  const eachX = /^[Rr]eturn each (.+? card with mana value X(?: or less)?) from your graveyard to the battlefield$/.exec(s);
  if (eachX) s = `Return all ${eachX[1]!.replace(/ card with /, " cards with ")} from your graveyard to the battlefield`;
  if ((m = /^[Rr]eturn all (.+? cards(?: with mana value (?:X|\d+) or less| with mana value X)?) from (your graveyard|all graveyards) to the battlefield( tapped)?( under their owners' control)?$/.exec(s)) && (m[2] === "your graveyard") === !m[4]) {
    m[1] = m[1]!.replace(/ cards( with mana value (?:X|\d+) or less| with mana value X)?$/, "$1");
    // "Return all creature and planeswalker cards with mana value X or less from your graveyard to the battlefield"
    // (Ascend from Avernus): the X it was cast with (TargetSpec.xRange).
    const kinds = m[1]!.replace(/,? and /g, " or ").replace(/, /g, " or ");
    const withN = / with mana value (\d+) or less$/.exec(kinds);
    const exactX = / with mana value X$/.exec(kinds);
    const withX = / with mana value X or less$/.exec(kinds) ?? withN ?? exactX;
    const words = withX ? kinds.slice(0, withX.index) : kinds;
    const spec = parseTargetPhrase(`${words.split(/\s+/).map(singularWord).join(" ")} card${withX ? ` with mana value ${withN ? withN[1] : "X"}${exactX ? "" : " or less"}` : ""} from a graveyard`, { chosen: true, x: !!withX && !withN });
    if (withN && spec?.kind === "card" && spec.manaValue?.max !== Number(withN[1])) return null;
    // "Return all Aura cards" (Estrid): Aura is only an enchantment subtype (CR 303.4).
    if (spec?.kind === "card" && !spec.types?.length && spec.subtypes?.length === 1 && spec.subtypes[0] === "Aura") spec.types = ["Enchantment"];
    if (spec?.kind !== "card" || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    // Hourglass of the Lost: "{T}, Remove X time counters from ~ and exile it: Return each nonland permanent card with mana
    // value X ...": the X announced for the ability's cost (CR 107.3a, 602.2b), like a spell's.
    if (withX && !withN && (spec.xRange?.key !== "manaValue" || spec.xRange.at !== (exactX ? "exact" : "most") || !(ctx.spell || ctx.ownX))) return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: m[4] ? "eachPlayer" : "you" }, filter: { ...spec, text: withX ? `${m[1]!.slice(0, -withX[0].length)} card${withX[0]}` : `${m[1]} card` }, ...(m[3] ? { tapped: true } : {}), ...(m[4] ? { owners: true as const } : {}) }];
  }
  // Garna, the Bloodflame: "return to your hand all creature cards in your graveyard that were put there from anywhere
  // this turn", which cards worked out as it resolves (rulings).
  if ((m = /^[Rr]eturn to your hand all (.+?) cards in your graveyard that were put there from anywhere this turn$/.exec(s))) {
    const spec = parseTargetPhrase(`${m[1]!.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    if (spec?.kind !== "card") return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { ...spec, putThereThisTurn: true, text: `${m[1]} card that was put there this turn` }, toHand: true }];
  }
  // Myojin of Grim Betrayal: "Put onto the battlefield under your control all creature cards in all graveyards that were
  // put there from anywhere this turn."
  if ((m = /^Put onto the battlefield under your control all (.+?) cards in all graveyards that were put there from anywhere this turn$/.exec(s))) {
    const spec = parseTargetPhrase(`${m[1]!.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    if (spec?.kind !== "card") return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { ...spec, putThereThisTurn: true, text: `${m[1]} card that was put there this turn` } }];
  }
  // "Return all instant and sorcery cards from your graveyard to your hand" (Wisdom of Ages), "Return all cards from your
  // graveyard to your hand" (Praetor's Counsel), "Return all creature cards with power 2 or less from your graveyard to
  // your hand" (Dawn).
  // Empty the Catacombs: "Each player returns all creature cards from their graveyard to their hand": the same for each.
  if ((m = /^(?:[Rr]eturn|(Each player) returns) all (?:(.+?) )?cards( with (?:power|toughness|mana value) \d+ or (?:less|greater))? from (?:your|(their)) graveyard to (?:your|(their)) hand$/.exec(s)) && !m[1] === !m[4] && !m[1] === !m[5]) {
    const kinds = (m[2] ?? "").replace(/,? and /g, " or ").replace(/, /g, " or ");
    const spec = parseTargetPhrase(`${kinds ? `${kinds.split(/\s+/).map(singularWord).join(" ")} ` : ""}card${m[3] ?? ""} from a graveyard`, { chosen: true });
    if (spec?.kind !== "card") return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: m[1] ? "eachPlayer" : "you" }, filter: { ...spec, text: `${m[2] ? `${m[2]} ` : ""}card${m[3] ?? ""}` }, toHand: true }];
  }
  // "You may put a land card from your hand onto the battlefield (tapped)".
  // Brainstorm: "put two cards from your hand on top of your library in any order", "put a card from your hand on top
  // of your library".
  if ((m = new RegExp(`^Put (a|${NUM}) cards? from your hand on top of your library( in any order)?$`, "i").exec(s)) && (m[1] === "a" || !!m[2]))
    return [{ type: "handToTop", n: m[1] === "a" ? 1 : num(m[1]!) }];
  // Dream Cache: "put two cards from your hand both on top of your library or both on the bottom of your library": where
  // is chosen as it resolves, then the cards.
  if ((m = new RegExp(`^[Pp]ut (${NUM}) cards from your hand both on top of your library or both on the bottom of your library$`).exec(s))) {
    const n = num(m[1]!);
    return [{ type: "either", options: [[{ type: "handToTop", n }], [{ type: "handToTop", n, bottom: true }]], labels: [`Put ${m[1]} cards from your hand on top of your library`, `Put ${m[1]} cards from your hand on the bottom of your library`] }];
  }
  // Chimney Imp: "target opponent puts a card from their hand on top of their library"; Sadistic Augermage: "each player
  // puts ..."; Stunted Growth: "Target player chooses three cards from their hand and puts them on top of their library in
  // any order": each from their own hand, chosen as it resolves.
  if ((m = new RegExp(`^(.+?) (?:puts? (a) card|chooses (${NUM}) cards) from their hand (?:and puts them )?on top of their library( in any order)?$`, "i").exec(s)) && (m[2] ? !m[4] : !!m[4] && / and puts them /.test(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "handToTop", n: m[2] ? 1 : num(m[3]!), who }] : null;
  }
  // See Beyond: "shuffle a card from your hand into your library".
  if ((m = new RegExp(`^[Ss]huffle (a|${NUM}) cards? from your hand into your library$`).exec(s)))
    return [{ type: "handToTop", n: m[1] === "a" ? 1 : num(m[1]!), shuffle: true }];
  // "Draw three cards, then put a card from your hand on the bottom of your library": in any order (CR 401.4).
  if ((m = new RegExp(`^Put (a|${NUM}) cards? from your hand on the bottom of your library( in any order)?$`, "i").exec(s)))
    return [{ type: "handToTop", n: m[1] === "a" ? 1 : num(m[1]!), bottom: true }];
  // "Each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield" (Show and
  // Tell), "each opponent may put a legendary creature card ..." (Iwamori), "any number of ... cards" (Tempting Wurm):
  // chosen in turn order without revealing them, then put there at the same time (see the putFromHand effect). "Then
  // each opponent who didn't draws a card" (Kynaios and Tiro): those who put none.
  // Charmed Griffin: "each other player may put an artifact or enchantment card onto the battlefield from their hand": the
  // same, in the other order ("each other player" is "each opponent" by now, CR 102.3).
  if ((m = /^[Ee]ach (player|opponent) may put (a|an|any number of) (.+?) from their hand onto the battlefield( tapped)?$/.exec(s) ?? /^[Ee]ach (player|opponent) may put (a|an) (.+?) onto the battlefield from their hand()$/.exec(s))) {
    const filter = parseSearchFilter(m[3]!.replace(/\band\/or\b/g, "or"));
    if (filter === null) return null;
    const put: Effect = { type: "putFromHand", who: { ref: m[1] === "player" ? "eachPlayer" : "eachOpponent" }, ...(filter ? { filter } : {}), ...(m[4] ? { tapped: true } : {}), may: true, ...(m[2] === "any number of" ? { any: true } : {}) };
    ctx.eachChose = true;
    return [put];
  }
  // Pendant of Prosperity: "~'s owner may put a land card from their hand onto the battlefield": that player chooses.
  // Braids, Conjurer Adept: "At the beginning of each player's upkeep, that player may put an artifact, creature, or land
  // card from their hand onto the battlefield": the player whose upkeep it is, under their control.
  // Fold into Aether: "its controller may put a creature card from their hand onto the battlefield": the countered spell's.
  // Wumpus Aberration: "target opponent may put a creature card from their hand onto the battlefield": that player.
  if ((m = /^(~'s owner|[Tt]hat player|That opponent|[Ii]ts controller|[Tt]arget opponent) may put (a|an) (.+?) from their hand onto the battlefield( tapped)?$/.exec(s))) {
    // Divine Gambit: "Exile target artifact, creature, or enchantment an opponent controls. That player may put ...": the
    // target's controller, as it last existed (CR 608.2h). Metamorphose: "Put target permanent an opponent controls on top
    // of its owner's library. That opponent may put ...": the same.
    const lastTarget = ctx.lastObjectTarget !== undefined ? ctx.targets[ctx.lastObjectTarget] : undefined;
    const theirs = /^That (?:player|opponent)$/.test(m[1]!) && ctx.spell && ctx.targets.length === 1 && lastTarget?.kind === "object" && lastTarget.controller === "opponent" && !lastTarget.many;
    if (m[1] === "That opponent" && !theirs) return null;
    const who = theirs ? { ref: "targetController" as const, index: ctx.lastObjectTarget! } : parsePlayer(m[1]!.replace(/^T/, "t").replace(/^I/, "i"), ctx);
    const filter = parseSearchFilter(m[3]!.replace(/\band\/or\b/g, "or"));
    if (!who || filter === null) return null;
    return [{ type: "putFromHand", who, ...(filter ? { filter } : {}), ...(m[4] ? { tapped: true } : {}), may: true }];
  }
  // "You may put a creature card with mana value X or less from your hand onto the battlefield tapped and attacking"
  // (Kinscaer Sentry): one card, attacking a player its controller chooses (CR 508.4).
  // "Put up to seven permanent cards from your hand onto the battlefield" (Ugin, the Spirit Dragon), "you may put up to
  // two creature cards ..." (Smuggler's Surprise): any number of them up to that many.
  // "Put up to X land cards from your hand and/or graveyard onto the battlefield tapped" (Worldsoul's Rage): from either zone.
  // Cryptic Gateway: "You may put a creature card from your hand that shares a creature type with each creature tapped this
  // way onto the battlefield": with each of the creatures its cost tapped, not necessarily the same type (rulings).
  if (ctx.activated && (m = /^(You may )?[Pp]ut a creature card from your hand that shares a creature type with each creature tapped this way onto the battlefield$/.exec(s)))
    return [{ type: "putFromHand", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card that shares a creature type with each creature tapped" }, may: !!m[1], kinOfCostTapped: true }];
  // Yuna's Decision: "you may put a creature card and/or a land card from your hand onto the battlefield": up to one of
  // each, put onto the battlefield at the same time; a card that's both (Dryad Arbor) counts as either.
  if ((m = /^(?:[Yy]ou may )?[Pp]ut an? ([a-z]+) card and\/or an? ([a-z]+) card from your hand onto the battlefield$/.exec(s))) {
    const a = parseSearchFilter(`${m[1]} card`);
    const b = parseSearchFilter(`${m[2]} card`);
    if (!a || !b || a.kind !== "card" || b.kind !== "card") return null;
    const either = parseSearchFilter(`${m[1]} or ${m[2]} card`);
    if (!either) return null;
    return [{ type: "putFromHand", filter: { ...either, text: `${m[1]} card and/or ${/^[aeiou]/.test(m[2]!) ? "an" : "a"} ${m[2]} card` }, may: true, any: true, upTo: 2, oneOfEach: [a, b] }];
  }
  if ((m = /^(?:You may )?[Pp]ut up to (two|three|four|five|six|seven|X) (.+?) cards from your hand( and\/or graveyard)? onto the battlefield( tapped)?$/.exec(s))) {
    const filter = parseSearchFilter(`${m[2]!} card`);
    if (filter === null) return null;
    return [{ type: "putFromHand", ...(filter ? { filter } : {}), may: true, any: true, upTo: m[1] === "X" ? amt("X") : num(m[1]!), ...(m[3] ? { orGraveyard: true as const } : {}), ...(m[4] ? { tapped: true } : {}) }];
  }
  // "You may put a land card from your hand or graveyard onto the battlefield" (Bonny Pall): one card, from either zone.
  // "... with a finality counter on it" (Kastral, the Windcrested): it enters with that counter (CR 122.6).
  // Nissa of Shadowed Boughs: "You may put a creature card with mana value less than or equal to the number of lands you
  // control onto the battlefield from your hand or graveyard with two +1/+1 counters on it": the same, worded the other
  // way round, entering with those counters (CR 122.6); the mana value checked where the card is (rulings).
  const reordered = /^(You may )?([Pp])ut (a|an) (.+?) onto the battlefield from your hand( or graveyard)?( with (?:a|two|three) (?:finality|\+1\/\+1) counters? on it)?$/.exec(s);
  // Dermoplasm: "... from your hand onto the battlefield face up": as any permanent enters unless told otherwise (CR 110.5b).
  const sx = reordered ? `${reordered[1] ?? ""}${reordered[2]}ut ${reordered[3]} ${reordered[4]} from your hand${reordered[5] ?? ""} onto the battlefield${reordered[6] ?? ""}` : s.replace(/ from your hand onto the battlefield face up$/, " from your hand onto the battlefield");
  const withCounters = / with (a|two|three) (finality|\+1\/\+1) counters? on it$/.exec(sx);
  const finality = !!withCounters;
  // "You may put an Aura or Equipment card from your hand or graveyard onto the battlefield attached to ~" (Danitha,
  // Benalia's Hope): only to the source permanent (see Effect putFromHand's `attachToSelf`).
  const toSelf = / attached to ~$/.test(sx);
  // Holy Avenger: "... onto the battlefield attached to it": the trigger's creature (Effect putFromHand's `attachToSubject`).
  const toSubject = !toSelf && !!ctx.subjectIt && / attached to it$/.test(sx);
  // "You may put a creature card from your hand onto the battlefield and attach ~ to it" (Deathrender): the Equipment to
  // the creature it became, if it can equip it (rulings).
  const attachSelf = / and attach ~ to it$/.test(sx);
  if ((m = /^(You may )?[Pp]ut (a|an|any number of) (.+?) from your hand( or graveyard)? onto the battlefield( tapped)?( and attacking( that opponent)?)?$/.exec(finality ? sx.replace(withCounters![0], "") : toSelf ? sx.replace(/ attached to ~$/, "") : toSubject ? sx.replace(/ attached to it$/, "") : attachSelf ? sx.replace(/ and attach ~ to it$/, "") : sx))) {
    const orYard = !!m[4];
    if (toSelf && (ctx.spell || m[2] === "any number of" || m[5] || m[6])) return null;
    if (toSubject && (ctx.spell || m[2] === "any number of" || m[4] || m[5] || m[6] || m[3] !== "Aura card")) return null;
    if (attachSelf && (ctx.spell || m[2] === "any number of" || m[4] || m[5] || m[6] || m[3] !== "creature card")) return null;
    if (finality && (m[2] === "any number of" || m[6])) return null;
    m.splice(4, 1);
    if (orYard && (m[2] === "any number of" || m[5])) return null;
    if (m[5] && m[2] === "any number of") return null;
    // "Tapped and attacking that opponent" (Kaalia of the Vast): the player the trigger's creature attacked.
    if (m[6] && !ctx.defending) return null;
    // "A creature card with lesser power" (Shadowfax): than the source's power (rulings).
    const lesser = / with lesser power$/.exec(m[3]!);
    if (lesser && (ctx.spell || !(ctx.selfIt || ctx.activated))) return null;
    // "A permanent card with equal or lesser mana value" (Kodama of the East Tree): than the permanent that entered.
    // Bane, Lord of Darkness: "a creature card with equal or lesser toughness": than the creature that died, as it last
    // existed (rulings: not Bane's).
    const equal = / with equal or lesser (mana value|toughness)$/.exec(m[3]!);
    if (equal && !ctx.subjectIt) return null;
    const phrase = lesser ? m[3]!.slice(0, lesser.index) : equal ? `${m[3]!.slice(0, equal.index)} with ${equal[1]} less than or equal to that ${equal[1] === "toughness" ? "creature" : "permanent"}'s ${equal[1]}` : m[3]!;
    // "A permanent card with mana value less than or equal to that damage" (Covert Technician): counted as it resolves.
    const filter0 = parseSearchFilter(phrase, (t) => parseBoundCount(t, ctx));
    if (filter0 === null) return null;
    const filter = filter0 && (lesser || equal) ? { ...filter0, text: m[3]! } : filter0;
    return [{ type: "putFromHand", ...(filter ? { filter } : {}), ...(m[4] ? { tapped: true } : {}), ...(m[5] ? { attacking: true } : {}), may: !!m[1] || m[2] === "any number of", ...(m[2] === "any number of" ? { any: true } : {}), ...(lesser ? { lesserPower: true as const } : {}), ...(m[6] ? { attackingEvent: true as const } : {}), ...(orYard ? { orGraveyard: true as const } : {}), ...(withCounters ? { counters: { [withCounters[2]!]: withCounters[1] === "a" ? 1 : num(withCounters[1]!) } } : {}), ...(toSelf ? { attachToSelf: true as const } : {}), ...(toSubject ? { attachToSubject: true as const } : {}), ...(attachSelf ? { attachSelf: true as const } : {}) }];
  }
  // Imprint: "You may exile a nonartifact, nonland card from your hand" (Chrome Mox), "... an instant card with mana value 2
  // or less ..." (Isochron Scepter): one card of your own hand, chosen as it resolves; linked to the ability that refers
  // to "the exiled card" (CR 607.2a, compile.ts).
  if ((m = /^(You may )?[Ee]xile (?:a|an) (.+? card(?: with mana value \d+ or (?:less|greater))?) from your hand$/.exec(s)) && !ctx.spell) {
    const filter = parseSearchFilter(m[2]!);
    if (filter === null) return null;
    return [{ type: "takeFromHand", who: { ref: "you" }, ...(filter ? { filter } : {}), action: "exile", ...(m[1] ? { optional: true as const } : {}) }];
  }
  // Jace, the Mind Sculptor: "Exile all cards from target player's library, then that player shuffles their hand into their
  // library." With no cards in hand, their library stays empty (rulings).
  // Leveler: "When ~ enters, exile all cards from your library."
  if ((m = /^Exile all cards from (target player's|target opponent's|your) library$/i.exec(s))) {
    const who = m[1]!.toLowerCase() === "your" ? ({ ref: "you" } as const) : parsePlayer(m[1]!.replace(/'s$/, ""), ctx);
    return who ? [{ type: "exileGraveyard", who, library: true }] : null;
  }
  // Worldfire: "Exile all cards from all hands and graveyards."
  if (s === "Exile all cards from all hands and graveyards") return [{ type: "exileGraveyard", who: { ref: "eachPlayer" }, hand: true }];
  // Ashiok, Nightmare Weaver: "Exile all cards from all opponents' hands and graveyards": each opponent's hand, then graveyard.
  if (s === "Exile all cards from all opponents' hands and graveyards") return [{ type: "exileGraveyard", who: { ref: "eachOpponent" }, hand: true }];
  // Ashiok, Nightmare Weaver: "Exile the top three cards of target opponent's library": face up (CR 406.3), fewer if the
  // library has fewer.
  if ((m = new RegExp(`^Exile the top (card|${NUM} cards) of (target opponent|target player)'s library$`).exec(s))) {
    const who = parsePlayer(m[3]!, ctx);
    return who ? [{ type: "exileTop", who, n: m[1] === "card" ? 1 : num(m[2]!) }] : null;
  }
  // Identity Crisis: "Exile all cards from target player's hand and graveyard."
  if ((m = /^Exile all cards from (target player's|target opponent's) hand and graveyard$/.exec(s))) {
    const who = parsePlayer(m[1]!.replace(/'s$/, ""), ctx);
    return who ? [{ type: "exileGraveyard", who, hand: true }] : null;
  }
  // Thought Distortion: "Target opponent reveals their hand. Exile all noncreature, nonland cards from that player's hand
  // and graveyard."
  if ((m = /^Exile all (.+?) cards from (that player's) hand and graveyard$/.exec(s))) {
    const who = parsePlayer(m[2]!.replace(/'s$/, ""), ctx);
    const filter = parseSearchFilter(`${m[1]!} card`);
    return who && filter ? [{ type: "exileGraveyard", who, hand: true, filter }] : null;
  }
  // Go Blank: "Target player discards two cards. Then exile that player's graveyard.": the target's.
  if ((m = /^Exile (target player's|target opponent's|that player's|each opponent's|all opponents'|all|any number of target players') graveyards?$/i.exec(s))) {
    const w = m[1]!.toLowerCase();
    const who: PlayerRef | null =
      w === "all" ? { ref: "eachPlayer" } : w === "each opponent's" || w === "all opponents'" ? { ref: "eachOpponent" } : parsePlayer(w.replace(/'s?$/, ""), ctx);
    return who ? [{ type: "exileGraveyard", who }] : null;
  }
  // "Exile all creature cards from target player's graveyard" (Crypt Incursion), "... from all graveyards" (Honor the Fallen),
  // "... from your graveyard" (Zombie Mob). Tombfire: "Target player exiles all cards with flashback from their
  // graveyard": the same, that player doing it.
  // Haunting Echoes: "Exile all cards from target player's graveyard other than basic land cards".
  const butBasics = /^Exile all cards from (target player's|target opponent's) graveyard other than basic land cards$/.exec(s);
  if (butBasics) {
    const who = parsePlayer(butBasics[1]!.replace(/'s$/, ""), ctx);
    const filter = parseSearchFilter("card other than a basic land card");
    return who && filter ? [{ type: "exileGraveyard", who, filter }] : null;
  }
  // Cry of the Carnarium: "Exile all creature cards in all graveyards that were put there from the battlefield this turn."
  if ((m = /^Exile all ([a-z]+) cards in all graveyards that were put there from the battlefield this turn$/.exec(s))) {
    const filter = parseSearchFilter(`${m[1]} card`);
    return filter?.kind === "card" ? [{ type: "exileGraveyard", who: { ref: "eachPlayer" }, filter: { ...filter, fromBattlefieldThisTurn: true, text: `${m[1]} card that was put there from the battlefield this turn` } }] : null;
  }
  const theirs = /^(Target player|Target opponent) exiles all (.+?) from their graveyard$/.exec(s);
  const all = theirs ? { what: theirs[2]!, whose: `${theirs[1]!.toLowerCase()}'s` } : (m = /^[Ee]xile all (.+?) from (target player's|target opponent's|each opponent's|your|all) graveyards?$/.exec(s)) && { what: m[1]!, whose: m[2]! };
  if (all) {
    const flashback = all.what === "cards with flashback";
    // Shadows' Verdict: "all creature and planeswalker cards with mana value 3 or less from all graveyards".
    const kind = /^(.+?) cards( with mana value \d+ or (?:less|greater))?$/.exec(all.what);
    // Sphere of Annihilation (body.ts rewrites its sentence): "... with mana value less than or equal to the number of void
    // counters on ~", worked out as it resolves (TargetSpec.bound; the exile binds it).
    const bounded = !kind ? /^(.+?) cards with mana value less than or equal to (the number of [a-z]+ counters on ~)$/.exec(all.what) : null;
    const bound = bounded ? parseBoundCount(bounded[2]!, ctx) : null;
    if (bounded && !bound) return null;
    const kindOf = kind ?? bounded;
    // "All cards": the whole graveyard.
    // "All artifact and enchantment cards" (Saprazzan Bailiff): each card that's either.
    const filter0 = flashback || all.what === "cards" ? undefined : kindOf ? parseSearchFilter(`${kindOf[1]!.replace(/^(artifact|creature|enchantment|instant|sorcery|land|planeswalker) and (artifact|creature|enchantment|instant|sorcery|land|planeswalker)$/, "$1 or $2")} card${kind?.[2] ?? ""}`) : null;
    const filter = filter0 && bound ? { ...filter0, bound: { key: "manaValue" as const, at: "most" as const, amount: bound }, text: `${filter0.text} with mana value less than or equal to ${bounded![2]}` } : filter0;
    const w = all.whose;
    const who: PlayerRef | null = w === "all" ? { ref: "eachPlayer" } : w === "each opponent's" ? { ref: "eachOpponent" } : w === "your" ? { ref: "you" } : parsePlayer(w.replace(/'s$/, ""), ctx);
    return filter !== null && who ? [{ type: "exileGraveyard", who, ...(filter ? { filter } : {}), ...(flashback ? { withFlashback: true as const } : {}) }] : null;
  }
  if ((m = /^Exile ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?|up to twice X )?target .+ graveyards?(?: that was put there (?:from anywhere |from the battlefield )?this turn)?)$/i.exec(s))) {
    // "Creatures from the battlefield and/or creature cards from graveyards" (Angel of Serenity): permanents or cards.
    // Savior of Ollenbock: "up to one other target creature from the battlefield or creature card from a graveyard", the same.
    const what = parseObject(m[1]!, ctx, !/ from the battlefield (?:and\/or|or) /.test(m[1]!));
    return what ? [{ type: "exile", what }] : null;
  }
  if ((m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ graveyard(?: that was put there (?:from anywhere |from the battlefield )?this turn| that wasn't put there this combat)?) to (your|its owner's) hand$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, m[2]!.toLowerCase() === "your" ? "you" : undefined);
    return what ? [{ type: "bounce", what }] : null;
  }
  // A card in exile back to its owner's hand (CR 406): "Return target exiled card with flashback you own to your hand"
  // (Runic Repetition), "... target card with flashback you own from exile ..." (Rootcoil Creeper), "... target instant or
  // sorcery card from your graveyard or exiled card with flashback you own ..." (Sorceress's Schemes).
  if ((m = /^Return (target (?:.+ )?(?:exiled card .+ you own|card .+ you own from exile)) to (your|its owner's) hand$/.exec(s))) {
    const i = ctx.targets.length;
    const what = parseCardTarget(m[1]!, ctx);
    const t = ctx.targets[i];
    if (what?.ref !== "target" || !(t?.inExile || t?.orExile) || t.owner !== "you") {
      ctx.targets.length = i;
      return null;
    }
    return [{ type: "bounce", what }];
  }
  // Pull from Eternity: "Put target face-up exiled card into its owner's graveyard", whoever exiled it (CR 406).
  if ((m = /^Put (target face-up exiled card) into its owner's graveyard$/.exec(s))) {
    const i = ctx.targets.length;
    const what = parseCardTarget(m[1]!, ctx);
    if (what?.ref !== "target" || !ctx.targets[i]?.inExile) {
      ctx.targets.length = i;
      return null;
    }
    return [{ type: "putInGraveyard", what }];
  }
  // Bronzebeak Foragers: "Put target card with mana value X exiled with ~ into its owner's graveyard": a card its exile
  // ability exiled (CR 607.2a), with the X it's activated with.
  if ((m = /^Put (target (?:[a-z]+ )?card(?: with mana value X)? exiled with ~) into its owner's graveyard$/.exec(s))) {
    const i = ctx.targets.length;
    const what = parseCardTarget(m[1]!, ctx);
    return what?.ref === "target" && ctx.targets[i]?.linkedExile ? [{ type: "putInGraveyard", what }] : null;
  }
  // "... to the battlefield with an additional +1/+1 counter on it" (Cauldron's Gift): it enters with it (CR 614.1c).
  // Chorale of the Void: "onto the battlefield under your control tapped and attacking" is the same as "tapped and
  // attacking under your control": attacking what you choose (rulings, CR 508.4).
  // Immortal Obligation: "Return target creature card from an opponent's graveyard to the battlefield under their control":
  // "their" is that opponent, the card's owner, so the same as "under its owner's control".
  if (/^Return target [a-z ]+ card from an opponent's graveyard to the battlefield under their control\b/.test(s)) s = s.replace(/ under their control\b/, " under its owner's control");
  if ((m = new RegExp(`^(Return|Put) ((?:(?:up to )?(?:one|two|three|four|five|six|\\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ (?:graveyards?(?: that was (?:put there from their library|milled) this turn| that (?:was|were) put there from the battlefield this turn)?|exiled with ~)) (?:to|onto) the battlefield( tapped(?: and attacking)?)?( under your control| under its owner's control)?(?: with (an additional|an?|two additional|three additional) (${COUNTER}) counters? on it)?( attached to enchanted creature| attached to that creature| attached to ~)?$`, "i").exec(s.replace(/ onto the battlefield under your control tapped and attacking$/, " onto the battlefield tapped and attacking under your control")))) {
    // Without "under your control", only your own cards: the card then enters under your control (CR 110.2a)
    // either way, but "return" text that reaches other graveyards always says whose control. "Under its owner's
    // control" (Bilbo, Unexpected Adventurer): a card from any graveyard, for its owner.
    const underYou = !!m[4];
    const owner = m[4] === " under its owner's control";
    if (m[1]!.toLowerCase() === "put" && !underYou) return null;
    const i = ctx.targets.length;
    const what = parseCardTarget(m[2]!, ctx, underYou ? undefined : "you");
    const spec = ctx.targets[i];
    // Only permanent cards can be put onto the battlefield (CR 110.4b); an Aura's controller chooses what it enchants as it
    // enters (CR 303.4f).
    // "Target Equipment card" (Forge Anew), "Vehicle card": artifact subtypes, so permanent cards (CR 205.3g).
    // "Aura and/or Equipment cards ... attached to enchanted creature" (Mantle of the Ancients): an enchantment subtype too.
    const attach = !!m[8];
    // Unfinished Business: "then return up to two target Aura and/or Equipment cards from your graveyard to the
    // battlefield attached to that creature": the creature card the instruction before returned (CR 400.7).
    const toThat = m[8] === " attached to that creature";
    // Magnetic Snuffler: "return target Equipment card from your graveyard to the battlefield attached to ~": attached to
    // the creature if it's still on the battlefield and could be equipped, else unattached (rulings).
    const toSelf = m[8] === " attached to ~";
    // Iridescent Drake: "put target Aura card from a graveyard onto the battlefield under your control attached to ~": any
    // graveyard's Aura, which stays there if it can't enchant ~ (rulings, CR 303.4g). Hakim, Loreweaver: "{U}{U}: Return
    // target Aura card from your graveyard to the battlefield attached to ~", in an activated ability likewise.
    if (toSelf && !(spec?.subtypes?.length === 1 && (spec.subtypes[0] === "Equipment" || spec.subtypes[0] === "Aura") && !spec.types?.length && what?.ref === "target" && !what.n && (ctx.selfIt || ctx.activated))) return null;
    const before = ctx.targets[i - 1];
    if (toThat && !(i === 1 && before?.kind === "card" && before.owner === "you" && before.types?.length === 1 && before.types[0] === "Creature" && !before.many && !before.optional)) return null;
    // "Target Saga card" (Rydia, Summoner of Mist): an enchantment subtype (CR 205.3h), and a Saga isn't an Aura.
    // "Target Cave card" (Glimpse the Core): a land subtype (CR 205.3i).
    // Rise to Glory: "Return target Aura card from your graveyard to the battlefield": an enchantment, so a permanent card;
    // its controller chooses what it enchants as it enters, or it stays in the graveyard (CR 303.4f-g).
    // "Target Vampire card" (Queen's Bay Paladin): a creature type; a Kindred card that isn't a permanent card stays where it
    // is (CR 110.4b, putOntoBattlefield checks it as it resolves).
    const artifactSub = !spec?.types?.length && !!spec?.subtypes?.length && spec.subtypes.every((st) => st === "Equipment" || st === "Vehicle" || st === "Saga" || st === "Cave" || st === "Desert" || st === "Gate" || st === "Aura" || (!attach && CREATURE_TYPES.has(st)));
    // "Target artifact creature card" (Scarecrone): every one of its types (allTypes) is a permanent type.
    const types = spec?.types?.length ? spec.types : spec?.allTypes ?? [];
    // "Target card named Rekindling Phoenix" (its token's ability): the card that made the token, a permanent card.
    const namedCard = !!spec?.named && !types.length && !spec.subtypes?.length;
    if (!what || !spec || (!artifactSub && !namedCard && (!types.length || types.some((ty) => !PERMANENT_TYPES.includes(ty)))) || (m[6] && (what.ref !== "target" || (what.n && m[5]?.toLowerCase() !== "an additional")))) return null;
    // Attached to the creature an Aura's own ability is about: only from an Aura (compile checks it enchants a creature).
    if (attach && (!spec.subtypes?.length || spec.types?.length || m[3] || (m[4] && !(toSelf && underYou && !owner)) || m[6])) return null;
    // Aberrant Return: one, two, or three target cards, each "with an additional -1/-1 counter on it".
    // "With two additional +1/+1 counters on it" (The Darkness Crystal): it enters with them (CR 614.1c).
    const n = m[5] ? ({ "two additional": 2, "three additional": 3 } as Record<string, number>)[m[5].toLowerCase()] ?? 1 : 0;
    // "Tapped and attacking" (Alesha, Yore-Tiller Nephilim): attacking what its controller chooses (CR 508.4, rulings).
    // Chorale of the Void: "under your control tapped and attacking", another player's card under your control.
    const attacking = / and attacking$/.test(m[3] ?? "");
    if (attacking && (owner || attach)) return null;
    return [{ type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}), ...(attacking ? { attacking: true as const } : {}), ...(owner ? { owner: true } : {}), ...(m[6] ? { counters: { [counterKind(m[6])]: n } } : {}), ...(attach ? (toSelf ? { attachToSource: true as const } : toThat ? { attachToCreated: true as const } : { attachToEnchanted: true as const }) : {}) }];
  }
  // "When this creature dies, return it to the battlefield under its owner's control and suspect it" (Presumed Dead's
  // granted ability): the card that went to the graveyard, if it's still there (CR 400.7), and then the permanent it
  // became (CR 701.60a).
  // "Return it to the battlefield tapped under its owner's control" (Supernatural Stamina, Fungal Fortitude), "... with a
  // +1/+1 counter on it" (Undying Malice; it enters with it, CR 614.1c).
  // "Return it to the battlefield tapped and transformed" (Hanweir Garrison's kin): its back face up (CR 712.14a).
  // "Return it to the battlefield transformed under your control attached to target opponent" (Accursed Witch): an Aura
  // back face, attached as it enters to what the ability targets, if it could enchant that (CR 303.4f, 712.14a).
  // An Aura's "when enchanted creature dies, return ~ to the battlefield transformed" (Skin Invasion): the Aura card.
  // "When ~ dies, return it to the battlefield converted under its owner's control" (Optimus Prime): its back face up,
  // converting working as transforming does (CR 701.28a).
  // "When Homura dies, return it to the battlefield flipped": under the ability's controller's control (CR 110.2a), as
  // Homura's Essence (710.1b).
  if ((ctx.selfCard || (ctx.auraCard && /^[Rr]eturn ~ /.test(s))) && (m = new RegExp(`^[Rr]eturn (?:it|~) to the battlefield( tapped)?((?: and)? (?:transformed|converted)| flipped)?(?: under (your|its owner's) control)?(?: with ${NUM} ${COUNTER} counters? on it)?( and suspect it)?(?: attached to (target .+))?$`).exec(s))) {
    const flipped = m[2] === " flipped";
    if (m[2] && !flipped && !m[1] !== !/ and/.test(m[2])) return null; // "tapped and transformed", or "transformed" alone
    if (flipped && (m[1] || m[3] || m[4] || m[6] || m[7])) return null; // only Homura's "return it to the battlefield flipped"
    // No "under ... control": the ability's controller puts it there, so it enters under their control (CR 110.2a);
    // Galian Beast's "return it to the battlefield tapped (front face up)": a double-faced card enters front face up
    // (CR 712.14). Only with "tapped" and nothing else, as yet.
    if (!m[3] && !flipped && !(m[1] && !m[2] && !m[4] && !m[6] && !m[7])) return null;
    let attachToTarget: number | undefined;
    if (m[7]) {
      if (!m[2] || m[6] || m[4]) return null;
      attachToTarget = ctx.targets.length;
      const what = /^target (player|opponent)$/.test(m[7]) ? parsePlayer(m[7], ctx) : parseObject(m[7], ctx);
      if (!what || what.ref !== "target" || ctx.targets.length !== attachToTarget + 1) return null;
    }
    return [
      { type: "putOntoBattlefield", what: { ref: "selfCard", ...(ctx.selfCard ? {} : { moved: true as const }) }, ...(m[1] ? { tapped: true } : {}), ...(m[2] ? (flipped ? { flipped: true as const } : { transformed: true as const }) : {}), ...(m[3] === "its owner's" ? { owner: true } : {}), ...(m[4] ? { counters: { [counterKind(m[5]!)]: num(m[4]) } } : {}), ...(attachToTarget !== undefined ? { attachToTarget } : {}) },
      ...(m[6] ? [{ type: "suspect" as const, what: { ref: "created" as const } }] : []),
    ];
  }
  // "When enchanted creature dies, return that card to the battlefield under your control" (False Demise): the card
  // that went to the graveyard, if it's still there (CR 400.7); a token is gone (CR 111.7).
  // "Put that card onto the battlefield under your control" (Seraph) is the same instruction.
  // Grave Betrayal: "... with an additional +1/+1 counter on it" (it enters with it, CR 614.1c; rulings); Luminous
  // Broodmoth: "... with a flying counter on it" (a keyword counter, CR 122.1b).
  // With no "under ... control" (Daretti's emblem: "return that card to the battlefield"), under the control of the player
  // who puts it there, the ability's controller (CR 110.2a).
  // "Return that card to the battlefield under your control if it's a Samurai card" (Oathkeeper, Takeno's Daisho): the
  // card's own creature types, not the creature's as it left the battlefield (rulings).
  if ((m = /^([Rr]eturn that card to the battlefield under your control) if it's an? ([A-Z][a-z]+) card$/.exec(s)) && ctx.subjectLeft && CREATURE_TYPES.has(m[2]!)) {
    const inner = parseZonesSentence(m[1]!, ctx);
    if (!inner || inner.length !== 1 || inner[0]!.type !== "putOntoBattlefield" || inner[0]!.what.ref !== "subjectCard") return null;
    return [{ type: "if", cond: { kind: "subjectCardIs", filter: { kind: "card", types: [], subtypes: [m[2]!], text: `${m[2]} card` } }, effects: inner }];
  }
  if ((m = new RegExp(`^(?:Return (that card|it) to|Put (that card) onto) the battlefield( tapped)?(?: under (your|its owner's) control)?(?: with an additional (\\+1\\/\\+1) counter on it| with an? ${COUNTER} counter on it| with (two|three) (\\+1\\/\\+1) counters on it)?( and attach ~ to it)?$`, "i").exec(s)) && ctx.subjectLeft && !(m[9] && ctx.spell)) {
    // Nim Deathmantle: "return that card to the battlefield and attach ~ to it": the permanent it became (CR 701.3).
    // Infernal Vessel: "with two +1/+1 counters on it".
    const what = parseObject(m[1] ?? m[2]!, ctx);
    const counter = m[5] ?? m[6] ?? m[8];
    return what?.ref === "subjectCard" ? [{ type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}), ...(m[4]?.toLowerCase() === "its owner's" ? { owner: true } : {}), ...(counter ? { counters: { [counterKind(counter)]: m[7] ? num(m[7]) : 1 } } : {}), ...(m[9] ? { attachSelf: true as const } : {}) }] : null;
  }
  // Pre-War Formalwear: "return target creature card with mana value 3 or less from your graveyard to the battlefield and
  // attach ~ to it": the permanent it became, if ~ is still on the battlefield and can be attached to it; otherwise ~
  // stays where it is (CR 701.3b; rulings).
  if ((m = /^([Rr]eturn target .+? from your graveyard to the battlefield) and attach ~ to it$/.exec(s)) && !ctx.spell) {
    const inner = parseZonesSentence(m[1]!, ctx);
    const e = inner?.length === 1 ? inner[0]! : undefined;
    return e?.type === "putOntoBattlefield" && e.what.ref === "target" && !e.what.n && ctx.targets[e.what.index]?.kind === "card" ? [{ ...e, attachSelf: true }] : null;
  }
  // "... on the bottom of your library in any order" (Bow of Nylea): in the order the targets were chosen, which the
  // controller picks (CR 401.4).
  if ((m = /^Put ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ graveyard) on (top|the bottom) of (your|its owner's) library(?: in any order)?$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, m[3]!.toLowerCase() === "your" ? "you" : undefined);
    return what ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() === "top" ? "top" : "bottom" }] : null;
  }
  // Blade of the Swarm: "Put target exiled card with warp on the bottom of its owner's library": a face-up card in exile,
  // whoever exiled it (CR 406, rulings: not only one its warp exiled).
  if ((m = /^Put (target (?:face-up )?exiled card(?: with [a-z]+)?) on (top|the bottom) of its owner's library$/.exec(s))) {
    const i = ctx.targets.length;
    const what = parseCardTarget(m[1]!, ctx);
    if (what?.ref !== "target" || !ctx.targets[i]?.inExile) {
      ctx.targets.length = i;
      return null;
    }
    return [{ type: "putInLibrary", what, position: m[2] === "top" ? "top" : "bottom" }];
  }
  // Drafna's Restoration: "Put any number of target artifact cards from target player's graveyard on top of their library in
  // any order": the player is a target too and the cards must be in that player's graveyard (TargetSpec.inGraveyardOfTarget,
  // as Suffer the Past's), put on that player's library in the order the spell's controller chooses (CR 401.4: the order is
  // the one the effect gives, here "in any order" for its controller, as Misinformation's rulings say).
  if ((m = /^Put (any number of target (?:[a-z]+ )?cards) from target player's graveyard on top of their library in any order$/.exec(s))) {
    const who = parsePlayer("target player", ctx);
    const pi = ctx.targets.length - 1;
    const first = ctx.targets.length;
    const what = who?.ref === "target" ? parseCardTarget(`${m[1]} from a graveyard`, ctx) : null;
    if (!what || what.ref !== "target" || ctx.targets[pi]?.kind !== "player" || ctx.targets.length !== first + 1 || ctx.targets[first]!.many !== "any") return null;
    ctx.targets[first] = { ...ctx.targets[first]!, inGraveyardOfTarget: pi, text: `${ctx.targets[first]!.text.replace(/ from a graveyard$/, "")} from that player's graveyard` };
    return [{ type: "putInLibrary", what, position: "top", youOrder: true }];
  }
  // Misinformation: "Put up to three target cards from an opponent's graveyard on top of their library in any order": all
  // from one opponent's graveyard (into "their" library), in the order the spell's controller chooses (rulings), not
  // their owner (CR 401.4).
  if ((m = /^Put ((?:up to )?(?:two|three|four|five) target cards from an opponent's graveyard) on (top|the bottom) of their library in any order$/.exec(s))) {
    const first = ctx.targets.length;
    const what = parseCardTarget(m[1]!, ctx);
    if (what?.ref !== "target" || !what.n || ctx.targets.slice(first).some((t) => t.kind !== "card" || t.owner !== "opponent")) return null;
    for (let i = first + 1; i < ctx.targets.length; i++) ctx.targets[i] = { ...ctx.targets[i]!, sameGraveyardAs: Array.from({ length: i - first }, (_, j) => first + j) };
    return [{ type: "putInLibrary", what, position: m[2] === "top" ? "top" : "bottom", youOrder: true }];
  }
  // "Target creature's owner puts it on their choice of the top or bottom of their library", "The owner of target
  // nonland permanent puts it ...": one permanent, its owner choosing as it resolves.
  if ((m = /^(?:(target .+?)'s owner|The owner of ((?:up to one (?:other )?)?target .+?)|Its owner) puts it (on their choice of the top or bottom of their library|into their library second from the top or on the bottom)$/i.exec(s))) {
    // Subtlety: "up to one target creature or planeswalker spell": one spell, or none (CR 115.6, 601.2c).
    // Sudden Setback: "The owner of target spell or nonland permanent puts it ...": one target, a spell (it leaves the
    // stack, not countered, so even one that can't be countered) or a nonland permanent, its owner choosing as it
    // resolves (rulings); like Airbend's spell or permanent.
    // Swat Away: "target spell or creature", the same with a creature.
    const orPerm = m[2] && /^target spell or (nonland permanent|creature)$/.exec(m[2]);
    // Aether Gust: "target spell or permanent that's red or green": a spell or a permanent of either color (as it resolves).
    const colored = m[2] && /^target spell or permanent that's ([a-z]+) or ([a-z]+)$/.exec(m[2]);
    if (colored && !/second from the top/.test(m[3]!)) {
      const words = `${colored[1]} or ${colored[2]}`;
      const spell = parseTargetPhrase(`${words} spell`);
      const perm = parseTargetPhrase(`${words} permanent`);
      if (spell?.kind !== "spell" || perm?.kind !== "object" || !spell.colors?.length) return null;
      const i = addTarget(ctx, { ...spell, orPermanent: perm, text: m[2]! });
      return [{ type: "counterSpell", index: i, bounce: true, libraryChoice: true }, { type: "putInLibrary", what: { ref: "target", index: i }, position: "ownersChoice" }];
    }
    // Endless Detour: "The owner of target spell, nonland permanent, or card in a graveyard puts it ...": one target of
    // any of the three kinds; a spell leaves the stack without being countered (rulings), its owner choosing as it resolves.
    const orPermCard = m[2] && /^target spell, (nonland permanent), or (card in a graveyard)$/.exec(m[2]);
    if (orPermCard && !/second from the top/.test(m[3]!)) {
      const perm = parseTargetPhrase(orPermCard[1]!);
      const card = parseTargetPhrase(orPermCard[2]!);
      if (perm?.kind !== "object" || card?.kind !== "card") return null;
      const i = addTarget(ctx, { kind: "spell", types: [], notTypes: [], notColors: [], orPermanent: { ...perm, orCard: card }, text: m[2]! });
      return [{ type: "counterSpell", index: i, bounce: true, libraryChoice: true }, { type: "putInLibrary", what: { ref: "target", index: i }, position: "ownersChoice" }];
    }
    if (orPerm && !/second from the top/.test(m[3]!)) {
      const perm = parseTargetPhrase(orPerm[1]!);
      if (perm?.kind !== "object") return null;
      const i = addTarget(ctx, { kind: "spell", types: [], notTypes: [], notColors: [], orPermanent: perm, text: m[2]! });
      return [{ type: "counterSpell", index: i, bounce: true, libraryChoice: true }, { type: "putInLibrary", what: { ref: "target", index: i }, position: "ownersChoice" }];
    }
    const spellUpTo = m[2] && /^up to one target (.+ spell)$/.exec(m[2]);
    const spellSpec = spellUpTo ? parseTargetPhrase(spellUpTo[1]!) : undefined;
    // Temporal Cleansing: "puts it into their library second from the top or on the bottom", a permanent only. Wan Shi
    // Tong, All-Knowing: "target nonland permanent's owner puts it ...", the same.
    const second = /second from the top/.test(m[3]!);
    if (second && spellUpTo) return null;
    if (spellUpTo) return spellSpec?.kind === "spell" && !spellSpec.orPermanent && !spellSpec.xRange ? [{ type: "counterSpell", index: addTarget(ctx, { ...spellSpec, optional: true, text: `up to one ${spellSpec.text}` }), bounce: true, libraryChoice: true }] : null;
    const what = parseObject(m[1] ?? m[2] ?? "it", ctx);
    if (what?.ref !== "target" || (what.n ?? 1) !== 1) return null;
    const spec = ctx.targets[what.index];
    // Subtlety: "Choose up to one target creature spell or planeswalker spell. Its owner puts it on their choice of the
    // top or bottom of their library." It leaves the stack without being countered (like Commit's, rulings).
    if (spec?.kind === "spell" && !spec.orPermanent && !second) return [{ type: "counterSpell", index: what.index, bounce: true, libraryChoice: true }];
    if (!spec || spec.kind !== "object") return null; // a permanent, not a spell or a card in a graveyard
    return [{ type: "putInLibrary", what, position: second ? "ownersChoiceSecond" : "ownersChoice" }];
  }
  // Aetherspouts: "For each attacking creature, its owner puts it on their choice of the top or bottom of their library":
  // one at a time, each owner choosing for each of theirs (their order among them being the order they're put there).
  if (/^For each attacking creature, its owner puts it on their choice of the top or bottom of their library$/.test(s)) {
    const what = parseObject("each attacking creature", ctx);
    return what?.ref === "each" ? [{ type: "putInLibrary", what, position: "ownersChoice" }] : null;
  }
  // "Put target creature into its owner's library second from the top" (Bury in Books), "third from the top" (Teferi,
  // Hero of Dominaria; Shattered Ego's "enchanted creature"), "fourth from the top" (Lost to Legend).
  if ((m = /^Put (target .+?|~|enchanted creature) into its owner's library (second|third|fourth) from the top$/i.exec(s)) && !/graveyard$/i.test(m[1]!) && !/^target spell or /i.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what && (what.ref === "target" || what.ref === "self" || what.ref === "attached") ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() as "second" | "third" | "fourth" }] : null;
  }
  // Unexpectedly Absent: "Put target nonland permanent into its owner's library just beneath the top X cards of that
  // library": the X it was cast with.
  // Quarry Colossus: "..., where X is the number of Plains you control": X as the text defines it, counted as it resolves.
  // Underdark Rift: "Roll a d10. Put target artifact, creature, or planeswalker into its owner's library just beneath the
  // top X cards of that library, where X is the result": the roll's result (CR 706.2).
  if ((m = /^[Pp]ut (target [a-z ]+?|target [a-z]+, [a-z]+, or [a-z]+) into its owner's library just beneath the top X cards of that library$/.exec(s)) && (ctx.spell || ctx.whereX)) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "putInLibrary", what, position: "top", beneath: amt("X") }] : null;
  }
  // Mortuary: "Whenever a creature is put into your graveyard from the battlefield, put that card on top of your
  // library": the card, if it's still in your graveyard (CR 400.7); yours, so its owner's library.
  if (/^[Pp]ut that card on top of your library$/.test(s) && ctx.subjectLeft) {
    const what = parseObject("that card", ctx);
    return what?.ref === "subjectCard" ? [{ type: "putInLibrary", what, position: "top" }] : null;
  }
  // Neera, Wild Mage: "Whenever you cast a spell, you may put it on the bottom of its owner's library": the spell that
  // triggered it, if it's still on the stack; not a counter, so one that can't be countered goes too (CR 701.6a).
  if (/^[Pp]ut it on the bottom of its owner's library$/.test(s) && ctx.castSpell && !ctx.subjectLeft) return [{ type: "causeToBottom" }];
  // The Cauldron of Eternity: "Whenever a creature you control dies, put it on the bottom of its owner's library": the card,
  // if it's still in the graveyard (CR 400.7).
  if ((m = /^[Pp]ut (it|that card) on (top|the bottom) of its owner's library$/.exec(s)) && ctx.subjectLeft) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "subjectCard" ? [{ type: "putInLibrary", what, position: m[2] === "top" ? "top" : "bottom" }] : null;
  }
  // Tel-Jilad Stylus: "Put target permanent you own on the bottom of your library": its owner's library is yours.
  if ((m = /^Put (target [a-z ]+ you own) on (top|the bottom) of your library$/i.exec(s))) return parseSentence(`Put ${m[1]} on ${m[2]} of its owner's library`, ctx);
  // "Put target creature on top of its owner's library", "on the bottom of its owner's library" (Excommunicate).
  // Elven Warhounds: "Whenever ~ becomes blocked by a creature, put that creature on top of its owner's library": the
  // trigger's subject.
  // Dovin's Dismissal: "Put up to one target tapped creature on top of its owner's library": the same, or nothing with no
  // target chosen (CR 115.1, 601.2c).
  if ((m = /^Put ((?:up to one )?target .+?|~|that creature) on (top|the bottom) of its owner's library$/i.exec(s)) && !/graveyard$/i.test(m[1]!) && (m[1] !== "that creature" || (ctx.subject && ctx.lastObjectTarget === undefined))) {
    const what = parseObject(m[1]!, ctx);
    return what && (what.ref === "target" || what.ref === "self" || (what.ref === "subject" && m[1] === "that creature")) ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() === "top" ? "top" : "bottom" }] : null;
  }
  // "Put two target lands on top of their owners' libraries" (Plow Under), "Put all enchantments on top of their owners'
  // libraries" (Harmonic Convergence): each owner arranges their own cards there (CR 401.4, rulings).
  if ((m = /^Put ((?:two|three) target .+?|all .+?) on (top|the bottom) of their owners' libraries$/i.exec(s)) && !/graveyards?$/i.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what && (what.ref === "target" || what.ref === "each") ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() === "top" ? "top" : "bottom" }] : null;
  }
  // Ugin's Labyrinth: "{T}: Return the exiled card to its owner's hand": the card its imprint ability exiled, while it's
  // still in exile (CR 607.2a, 400.7); compile() links the two.
  if (ctx.activated && /^Return the exiled card to its owner's hand$/.test(s)) return [{ type: "bounce", what: { ref: "linkedCard" } }];
  // "When ~ leaves the battlefield, return the exiled card to the battlefield under its owner's control" (Fiend
  // Hunter): the cards its own exile ability took (CR 607.2a); compile() links the two.
  // Realm Razer: "return the exiled cards to the battlefield tapped under their owners' control", the same, tapped.
  if ((m = /^Return the exiled (?:card|cards|permanent|permanents|creature|creatures) to (the battlefield (tapped )?under (?:its|their) owners?'s? control|(?:its|their) owners?'s? hands?)$/i.exec(s)) && ctx.selfCard)
    return [{ type: "returnLinked", dest: /^the battlefield/i.test(m[1]!) ? "battlefield" : "hand", ...(m[2] ? { tapped: true as const } : {}) }];
  // Savior of Ollenbock: "When ~ leaves the battlefield, put the exiled cards onto the battlefield under their owners'
  // control": the same, the cards its own exile ability took (CR 607.2a).
  if (/^Put the exiled cards onto the battlefield under their owners' control$/i.test(s) && ctx.selfCard) return [{ type: "returnLinked", dest: "battlefield" }];
  // Gravegouger: "When ~ leaves the battlefield, return the exiled cards to their owner's graveyard": the cards its enters
  // ability exiled, while they're still in exile (CR 607.2a, 400.7); compile() links the two.
  if (/^Return the exiled cards to their owner's graveyard$/i.test(s) && ctx.selfCard) return [{ type: "returnLinked", dest: "graveyard" }];
  // Parallax Wave: "When ~ leaves the battlefield, each player returns to the battlefield all cards they own exiled with
  // it": the same, the cards its own exile ability took, under their owners' control (CR 607.2a, 610.3).
  if ((m = /^[Ee]ach player returns to (the battlefield|their hand) all cards they own exiled with (?:it|~)$/.exec(s)) && ctx.selfCard)
    return [{ type: "returnLinked", dest: m[1] === "the battlefield" ? "battlefield" : "hand" }];
  // Pyxis of Pandemonium: "Each player turns face up all cards they own exiled with ~, then puts all permanent cards among
  // them onto the battlefield": its own face-down exiles (CR 607.2a), each owner's under their control.
  if (/^[Ee]ach player turns face up all cards they own exiled with ~ and puts all permanent cards among them onto the battlefield$/.test(s) && ctx.activated && !ctx.spell)
    return [{ type: "returnLinked", dest: "battlefield", permanentCards: true }];
  // Admonition Angel: "When ~ leaves the battlefield, return all cards exiled with it to the battlefield under their owners'
  // control": the same.
  if (/^[Rr]eturn all cards exiled with (?:it|~) to the battlefield under their owners' control$/.test(s) && ctx.selfCard) return [{ type: "returnLinked", dest: "battlefield" }];
  // Prowling Geistcatcher: "return each card exiled with it to the battlefield under your control": the same, under the
  // ability's controller's control (rulings: cards it doesn't own too).
  if (/^[Rr]eturn each card exiled with (?:it|~) to the battlefield under your control$/.test(s) && ctx.selfCard) return [{ type: "returnLinked", dest: "battlefield", yours: true }];
  // Dual Nature: "Whenever a nontoken creature leaves the battlefield, exile all tokens with the same name as that creature":
  // every token (anyone's) with that creature's name as it last existed (CR 201.2, 603.10a).
  if (/^[Ee]xile all tokens with the same name as that creature$/.test(s) && ctx.subject && !ctx.spell) return [{ type: "exile", what: { ref: "each", filter: { kind: "object", types: [], notTypes: [], notColors: [], token: true, text: "tokens" }, sameNameAsSubject: true } }];
  // Wormfang Behemoth: "When ~ enters, exile all cards from your hand." Face up (CR 406.3); compile() links them to its
  // leaves ability.
  // Herigast, Erupting Nullkite: "exile your hand", the same.
  if (/^[Ee]xile (?:all cards from )?your hand$/.test(s)) return [{ type: "exileHand" }];
  // Decree of Annihilation: "exile all cards from all hands": every player's, face up (CR 406.3).
  if (/^[Ee]xile all cards from all hands$/.test(s)) return [{ type: "exileHand", who: { ref: "eachPlayer" } }];
  // Hypnox: "exile all cards from target opponent's hand": the same for that player's hand, face up (CR 406.3).
  if ((m = /^[Ee]xile all cards from (target opponent|target player)'s hand$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "exileHand", who }] : null;
  }
  // Fear of Abduction: "When ~ leaves the battlefield, put each card exiled with it into its owner's hand": the card its
  // enters ability exiled and the one exiled to pay its cost (CR 607.2a, 607.2q; compile() links them).
  if (/^Put each card exiled with (?:it|~) into its owner's hand$/i.test(s) && ctx.selfCard) return [{ type: "returnLinked", dest: "hand" }];
  // Watcher for Tomorrow: "When ~ leaves the battlefield, put the exiled card into its owner's hand."
  if (/^Put the exiled card into its owner's hand$/i.test(s) && ctx.selfCard) return [{ type: "returnLinked", dest: "hand" }];
  // Isochron Scepter: "You may copy the exiled card. If you do, you may cast the copy without paying its mana cost." (one
  // sentence by then, body.ts): the card its imprint ability exiled (linked in compile.ts).
  if (/^You may cast a copy of the exiled card without paying its mana cost$/.test(s) && !ctx.spell) return [{ type: "castLinkedCopy" }];
  // Hideaway (CR 702.75a): "You may play the exiled card without paying its mana cost", the card its hideaway exiled;
  // "... if each player has no cards in hand": only if that's true as it resolves.
  // Malcolm: "Draw a card, then discard a card. ... you may cast the discarded card without paying its mana cost": as this
  // resolves (CR 608.2g), from the graveyard it went to; a land card can't be cast (CR 305.9).
  if (/^[Yy]ou may cast the discarded card without paying its mana cost$/.test(s)) return ctx.discardedOne ? [{ type: "castTargetFree", what: { ref: "discarded" } }] : null;
  // Evercoat Ursine: "you may play one of them without paying its mana cost", the cards its two hideaways exiled: one
  // of them, chosen as this resolves (rulings).
  if (/^[Yy]ou may play one of the cards exiled with ~ without paying its mana cost$/.test(s) && !ctx.spell) return [{ type: "playLinked", one: true }];
  // Smirking Spelljacker: "you may cast the exiled card without paying its mana cost", the spell its enters ability exiled
  // (linked in compile.ts), cast as this resolves or not at all (rulings); cast, so never played as a land.
  if (/^[Yy]ou may cast the exiled card without paying its mana cost$/.test(s) && !ctx.spell && !ctx.activated) return [{ type: "playLinked", castOnly: true }];
  if ((m = /^[Yy]ou may play the exiled card without paying its mana cost(?: if (.+))?$/.exec(s)) && !ctx.spell) {
    if (!m[1]) return [{ type: "playLinked" }];
    const cond = parseStaticCondition(m[1], { affects: { kind: "self" }, mods: [], text: "" });
    return cond ? [{ type: "if", cond: { kind: "state", cond }, effects: [{ type: "playLinked" }] }] : null;
  }
  // "Exile target creature an opponent controls until ~ leaves the battlefield" (CR 610.3), "up to one other target
  // creature you control" (Mardu Siegebreaker).
  // Quarantine Field (body.ts rewrites its sentence): "up to X target nonland permanents an opponent controls until ~ leaves
  // the battlefield, where X is ...": X counted as the targets are chosen (TargetSpec.manyCount), all of them returned together.
  if ((m = /^Exile (target .+|up to one (?:other )?target .+|another target .+|up to X target .+) until ~ leaves the battlefield$/i.exec(s)) && !ctx.spell && (!/^up to X /i.test(m[1]!) || ctx.whereX)) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "exile", what, until: "sourceLeaves" }] : null;
  }
  // Grasping Giant: "Whenever ~ becomes blocked by a creature, exile that creature until ~ leaves the battlefield": the
  // blocking creature the trigger is about (CR 610.3).
  // Hixus, Prison Warden: "Whenever a creature deals combat damage to you, ..., exile that creature until ~ leaves the
  // battlefield" ("it", the creature the trigger is about).
  if (((/^Exile that creature until ~ leaves the battlefield$/i.test(s) && ctx.subject) || (/^Exile it until ~ leaves the battlefield$/i.test(s) && ctx.subjectIt)) && !ctx.spell) {
    const what = parseObject(ctx.subject ? "that creature" : "it", ctx);
    return what?.ref === "subject" ? [{ type: "exile", what, until: "sourceLeaves" }] : null;
  }
  // Calix, Destiny's Hand: "Exile target creature or enchantment you don't control until target enchantment you control
  // leaves the battlefield" (CR 610.3): the card returns when that permanent leaves; if it's an illegal target as this
  // resolves (it left), nothing is exiled (rulings, CR 610.3a).
  if ((m = /^Exile (target .+?) until (target .+?) leaves the battlefield$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const anchor = what?.ref === "target" && !what.n ? parseObject(m[2]!, ctx) : null;
    return what?.ref === "target" && anchor?.ref === "target" && !anchor.n && anchor.index !== what.index ? [{ type: "exile", what, until: "targetLeaves", untilTarget: anchor.index }] : null;
  }
  // Consulate Crackdown: "exile all artifacts your opponents control until ~ leaves the battlefield", Temporary Lockdown:
  // "exile each nonland permanent with mana value 2 or less ...": the permanents there as it resolves, all returned
  // together when ~ leaves (CR 610.3); a token exiled this way ceases to exist (CR 704.5d).
  if ((m = /^Exile ((?:all|each) .+) until ~ leaves the battlefield$/i.exec(s)) && !ctx.spell) {
    const before = ctx.targets.length;
    const fx = parseSentence(`Exile ${m[1]}`, ctx);
    const ex = fx?.length === 1 && fx[0]!.type === "exile" ? fx[0]! : undefined;
    if (!ex || ex.until || ex.linked || ex.youMay || ex.ownerMay || !isGroup(ex.what) || ctx.targets.length !== before) return null;
    return [{ ...ex, until: "sourceLeaves" }];
  }
  // Palace Jailer: "exile target creature an opponent controls until an opponent becomes the monarch": it returns when one
  // of your opponents next becomes the monarch, whatever happens to the source (rulings, CR 610.3).
  if ((m = /^Exile (target .+) until an opponent becomes the monarch$/i.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "exile", what, until: "opponentMonarch" }] : null;
  }
  // "When ~ enters, create a 1/1 white Soldier creature token, then attach ~ to it." (Ancestral Blade, like living
  // weapon, CR 702.92a): the token just created, or the creature just manifested ("manifest dread, then attach ~ to
  // that creature"). If ~ has left the battlefield, or can't legally be attached, it
  // stays where it is (CR 701.3b).
  if (/^Attach ~ to (?:it|that creature)$/i.test(s) && ctx.lastCreated && !ctx.spell) return [{ type: "attach", what: { ref: "created" } }];
  // "Whenever a legendary creature you control enters, you may attach ~ to it" (Hero's Blade, Cloak and Dagger): the
  // creature that entered, if it's still on the battlefield and ~ could be attached to it (CR 701.3b).
  if (/^Attach ~ to (?:it|that creature)$/i.test(s) && ctx.subjectIt && !ctx.lastCreated && !ctx.spell) return [{ type: "attach", what: { ref: "subject" } }];
  // Duplicity, Gustha's Scepter: cards exiled face down with ~, and what happens to them later (CR 406.3, 607.2a).
  if (!ctx.spell) {
    if ((m = new RegExp(`^Exile the top ${NUM} cards of your library face down$`, "i").exec(s))) return [{ type: "exileFaceDown", from: "top", n: num(m[1]!) }];
    // Kayla's Music Box: "Look at the top card of your library, then exile it face down. (You may look at it any time.)"
    if (/^Look at and exile the top card of your library face down$/.test(s)) return [{ type: "exileFaceDown", from: "top", n: 1, look: true }];
    if (/^Look at and exile the top two cards of your library face down$/.test(s)) return [{ type: "exileFaceDown", from: "top", n: 2, look: true }];
    // Connecting the Dots: "exile the top card of your library face down" (no one may look at it, CR 406.3).
    if (/^Exile the top card of your library face down$/i.test(s)) return [{ type: "exileFaceDown", from: "top", n: 1 }];
    if (/^Exile all cards from your hand face down$/i.test(s)) return [{ type: "exileFaceDown", from: "hand" }];
    if (/^Exile a card from your hand face down$/i.test(s)) return [{ type: "exileFaceDown", from: "handCard" }];
    if (/^Put all cards exiled with ~ into their owners?'s? graveyards?$/i.test(s)) return [{ type: "moveLinked", dest: "graveyard" }];
    // Knowledge Vault: "When ~ leaves the battlefield, put all cards exiled with it into their owner's graveyard".
    if (/^Put all cards exiled with it into their owners?'s? graveyards?$/i.test(s) && ctx.selfCard) return [{ type: "moveLinked", dest: "graveyard" }];
    // Underworld Sentinel: "When ~ dies, put all cards exiled with it onto the battlefield": under the control of the
    // ability's controller, who puts them there (its rulings).
    if (/^Put all cards exiled with (?:it|~) onto the battlefield$/i.test(s) && ctx.selfCard) return [{ type: "moveLinked", dest: "battlefield" }];
    if ((m = /^Put (?:all (creature )?cards|each (creature )?card) exiled with ~ onto the battlefield under your control(, and they gain decayed)?(?: with an? (flying|\+1\/\+1) counter on it)?( as face-down 2\/2 Cyberman artifact creatures)?$/i.exec(s)))
      return [{ type: "moveLinked", dest: "battlefield", ...(m[1] || m[2] ? { filter: { kind: "card", types: ["Creature"], text: "creature card" } } : {}), ...(m[3] ? { gain: ["Decayed"] } : {}), ...(m[4] ? { counters: { [m[4]]: 1 } } : {}), ...(m[5] ? { faceDown: "cyberman" as const } : {}) }];
    // Safe Haven: "return each card exiled with ~ to the battlefield under its owner's control", all at once and whatever
    // they are now (rulings).
    if (/^Return each card exiled with ~ to the battlefield under its owner's control$/i.test(s)) return [{ type: "moveLinked", dest: "battlefield", ownersControl: true }];
    // Trove Warden: "When ~ dies, put each permanent card exiled with it onto the battlefield under the control of that
    // card's owner": the cards its landfall ability exiled (CR 607.2a), all at once; others stay in exile.
    if (/^Put each permanent card exiled with (?:it|~) onto the battlefield under the control of that card's owner$/i.test(s) && ctx.selfCard)
      return [{ type: "moveLinked", dest: "battlefield", ownersControl: true, filter: { kind: "card", types: [...PERMANENT_TYPES], notTypes: [], notColors: [], text: "permanent card" } }];
    // Bane Alley Broker: "Return a card exiled with ~ to its owner's hand": one of them, chosen as it resolves (CR 607.2a).
    if (/^Return a card exiled with ~ to its owner's hand$/.test(s)) return [{ type: "moveLinked", dest: "hand", exactly: 1 }];
    // Vault 13: Dweller's Journey: "Return two cards exiled with ~ to the battlefield under their owners' control and put the
    // rest on the bottom of their owners' libraries": two chosen as it resolves, returned at once; the others to the bottom.
    if (/^Return two cards exiled with ~ to the battlefield under their owners' control and put the rest on the bottom of their owners' libraries$/.test(s)) return [{ type: "moveLinked", dest: "battlefield", ownersControl: true, exactly: 2 }, { type: "linkedToBottom" }];
    // Cold Storage, Endless Sands: "Return each creature card exiled with ~ to the battlefield under your control / its
    // owner's control": the creature cards among them as they are now, all at once (CR 607.2a, 608.2f).
    // Synod Sanctum: "Return all cards exiled with ~ to the battlefield under your control": the same, all of them.
    if (/^Return all cards exiled with ~ to the battlefield under your control$/i.test(s)) return [{ type: "moveLinked", dest: "battlefield" }];
    if ((m = /^Return each creature card exiled with ~ to the battlefield under (your|its owner's) control$/i.exec(s))) return [{ type: "moveLinked", dest: "battlefield", filter: { kind: "card", types: ["Creature"], text: "creature card" }, ...(m[1] === "your" ? {} : { ownersControl: true }) }];
    if (/^Put all other cards you own exiled with ~ into your hand$/i.test(s)) return [{ type: "moveLinked", dest: "hand", yours: true, other: true }];
    // Bottled Cloister: "return all cards you own exiled with this artifact to your hand": only the ones you own (rulings:
    // the errata), face down ones too.
    if (/^Return all cards you own exiled with ~ to your hand$/i.test(s)) return [{ type: "moveLinked", dest: "hand", yours: true }];
    // Endless Horizons: "put a card you own exiled with ~ into your hand": the same.
    if (/^(?:Return a card you own exiled with ~ to|Put a card you own exiled with ~ into) your hand$/i.test(s)) return [{ type: "moveLinked", dest: "hand", yours: true, one: true }];
    // Bag of Holding: "Return all cards exiled with ~ to their owner's hand": the ones its discard trigger exiled (CR 607.2a).
    // Connecting the Dots: "Put all cards exiled with ~ into their owners' hands": the same, face down ones too.
    if (/^Return all cards exiled with ~ to their owner's hand$|^Put all cards exiled with ~ into their (?:owners' hands|owner's hand)$/.test(s)) return [{ type: "moveLinked", dest: "hand" }];
    // Asmodeus the Archfiend: "... and you lose that much life": as many as were returned (face-down ones too).
    if (/^Return all cards exiled with ~ to their owner's hand and you lose that much life$/.test(s)) return [{ type: "moveLinked", dest: "hand" }, { type: "loseLife", who: { ref: "you" }, n: { count: { kind: "movedLinkedThisWay" } } }];
    // Ethereal Forager: "return an instant or sorcery card exiled with ~ to its owner's hand": one of them, chosen as it
    // resolves.
    if (/^Return an instant or sorcery card exiled with ~ to its owner's hand$/i.test(s)) return [{ type: "moveLinked", dest: "hand", one: true, filter: { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" } }];
    // Purgatory: "return a card exiled with ~ to the battlefield": one of them, chosen as it resolves, under the control of
    // the player who puts it there, the ability's controller (CR 110.2a; rulings: even if an opponent took Purgatory).
    if (/^Return a card exiled with ~ to the battlefield$/.test(s)) return [{ type: "moveLinked", dest: "battlefield", one: true }];
    // Roads Go Ever, Ever On: "Put a card exiled with this Saga into its owner's hand": one of them, chosen as it resolves.
    if (/^Put a card exiled with ~ into its owner's hand$/.test(s)) return [{ type: "moveLinked", dest: "hand", one: true }];
    // Currency Converter: one of them, chosen as it resolves.
    if (/^Put a card exiled with ~ into its owner's graveyard$/i.test(s)) return [{ type: "moveLinked", dest: "graveyard", one: true }];
    // Nautiloid Ship: "put a creature card exiled with ~ onto the battlefield under your control".
    // Chaos Shrine's Black Crystal: "... with a finality counter on it": it enters with it (CR 122.6).
    // Sothera, the Supervoid: "with two additional +1/+1 counters on it", as it enters (CR 614.1c), on top of any it would
    // enter with anyway.
    if ((m = /^Put a creature card exiled with ~ onto the battlefield under your control( with a finality counter on it| with two additional \+1\/\+1 counters on it)?$/i.exec(s))) return [{ type: "moveLinked", dest: "battlefield", one: true, filter: { kind: "card", types: ["Creature"], text: "creature card" }, ...(m[1] ? { counters: /finality/.test(m[1]) ? { finality: 1 } : { "+1/+1": 2 } } : {}) }];
    // Clone Shell: the controller looks at the top four, exiles one of them face down (one must be exiled, rulings) and puts
    // the rest on the bottom in the order they choose.
    if (/^Exile one of the top four cards of your library face down and put the rest on the bottom of your library in any order$/.test(s)) return [{ type: "exileFaceDown", from: "top", n: 4, pickOne: true, bottomAnyOrder: true }];
    // Clone Shell, Summoner's Egg: the card exiled face down with it is turned face up; a creature card goes onto the
    // battlefield under your control, anything else stays exiled face up (rulings). compile.ts checks it has one imprint.
    if (/^Turn the exiled card face up and put it onto the battlefield under your control if it's a creature card$/.test(s)) return [{ type: "moveLinked", dest: "battlefield", turnFaceUp: true, filter: { kind: "card", types: ["Creature"], text: "creature card" } }];
    // Skyship Weatherlight: a card exiled with it chosen at random as it resolves, into its owner's hand (rulings: the
    // errata's owner).
    if (/^Put a card exiled with ~ chosen at random into its owner's hand$/.test(s)) return [{ type: "moveLinked", dest: "hand", one: true, random: true }];
    // Negative Zone Portal: "sacrifice ~ and return a card exiled with it at random to its owner's hand": one, chosen at
    // random as it resolves, from the cards linked to it as it was (CR 607.2a), even once it's gone.
    if (/^[Ss]acrifice ~ and return a card exiled with it at random to its owner's hand$/.test(s)) return [{ type: "sacrifice", what: { ref: "self" } }, { type: "moveLinked", dest: "hand", one: true, random: true }];
    // Omenpath Journey: "choose a card at random exiled with ~ and put it onto the battlefield tapped": under this ability's
    // controller's control (CR 110.2a).
    if (/^[Cc]hoose a card at random exiled with ~ and put it onto the battlefield tapped$/.test(s)) return [{ type: "moveLinked", dest: "battlefield", one: true, random: true, tapped: true }];
    // Bag of Devouring: "Return up to X cards from among cards exiled with ~ to their owners' hands, where X is the result":
    // chosen as it resolves, from the cards its sacrifice trigger exiled (CR 607.2a).
    if (/^Return up to X cards from among cards exiled with ~ to their owners' hands$/.test(s)) return [{ type: "moveLinked", dest: "hand", upTo: { count: { kind: "x" } } }];
    // Yggdrasil, Rebirth Engine: "Put a creature card exiled with ~ onto the battlefield under your control. It gains haste
    // until end of turn." The permanent it became (CR 400.7).
    if (/^Put a creature card exiled with ~ onto the battlefield under your control, and it gains haste until end of turn$/i.test(s)) return [{ type: "moveLinked", dest: "battlefield", one: true, filter: { kind: "card", types: ["Creature"], text: "creature card" }, haste: "endOfTurn" }];
    // Ashiok, Nightmare Weaver: "Put a creature card with mana value X exiled with ~ onto the battlefield under your control":
    // chosen as it resolves, the X announced for the loyalty cost (rulings; none, nothing happens).
    if (/^Put a creature card with mana value X exiled with ~ onto the battlefield under your control$/.test(s)) {
      const filter = parseSearchFilter("creature card with mana value X");
      return filter ? [{ type: "moveLinked", dest: "battlefield", one: true, filter }] : null;
    }
    if (/^Put a creature card exiled with ~ onto the battlefield under your control with a finality counter on it, and it gains haste until it is sacrificed when the next end step begins$/i.test(s))
      return [{ type: "moveLinked", dest: "battlefield", one: true, filter: { kind: "card", types: ["Creature"], text: "creature card" }, counters: { finality: 1 }, haste: "game", atEndStep: "sacrifice" }];
  }
  // "Attach target Equipment you control to target creature you control" (Brass Squire), "attach up to one target
  // Equipment you control to ~" (Cloud), "... to that creature" (Kemba: the creature that entered), Magnetic Theft's
  // "Attach target Equipment to target creature" (CR 701.3a). Either target illegal: the Equipment doesn't move (rulings).
  // "Attach target Aura attached to a creature to another creature" (Crown of the Ages, Autumn-Tail): moving an Aura to a
  // creature chosen as it resolves (rulings), not targeted.
  // Simic Guildmage: "Attach target Aura attached to a permanent to another permanent with the same controller": one
  // controlled by whoever controls the permanent it's attached to as it resolves (rulings). Enchantment Alteration: "Attach
  // target Aura attached to a creature or land to another permanent of that type": of a type (creature, land) the
  // permanent it's attached to has as it resolves. Only the Aura is targeted (rulings).
  if ((m = /^[Aa]ttach (target Aura attached to a (?:creature|permanent|creature or land)) to another (creature|permanent with the same controller|permanent of that type)$/.exec(s))) {
    const host = m[2] === "creature" ? undefined : m[2] === "permanent of that type" ? ("sameType" as const) : ("sameController" as const);
    if ((host === "sameType") !== m[1]!.endsWith("creature or land") || (host === "sameController") !== m[1]!.endsWith("permanent")) return null;
    const source = parseObject(m[1]!, ctx);
    return source?.ref === "target" && !source.n ? [{ type: "attachElsewhere", source, ...(host ? { host } : {}) }] : null;
  }
  // Glamer Spinners: "attach all Auras enchanting target permanent to another permanent with the same controller": one
  // permanent, chosen as it resolves, that every one of those Auras could enchant; none move if there's none (rulings).
  if (/^[Aa]ttach all Auras enchanting target permanent to another permanent with the same controller$/.test(s)) {
    const source = parseObject("target permanent", ctx);
    return source?.ref === "target" && !source.n ? [{ type: "attachElsewhere", source, host: "sameController", aurasOn: true }] : null;
  }
  // "Attach target Aura you control to target creature" (Aura Finesse), "target Aura or Equipment you control" (Codsworth).
  // Armory Automaton: "attach any number of target Equipment to it", all of them to the source (rulings).
  if ((m = /^Attach ((?:up to one |any number of )?target (?:Equipment|Aura|Aura or Equipment)\b(?:(?! to )(?! attached to ).)*(?: attached to an? creature(?: you control)?)?) to (~|it|him|her|that creature|(?:up to one |another )?target .+)$/i.exec(s))) {
    const pronoun = !/\btarget\b/i.test(m[2]!);
    if (pronoun && ctx.spell) return null;
    const hostFirst = pronoun ? parseObject(m[2]!, ctx) : null;
    const source = parseObject(m[1]!, ctx);
    const what = hostFirst ?? (pronoun ? null : parseObject(m[2]!, ctx));
    const many = /^any number of /i.test(m[1]!);
    // Thorin, Mountain-king: "any number of target Equipment you control to target creature you control", each to the
    // one creature.
    if (source?.ref !== "target" || (source.n && !many) || !what || (what.ref === "target" && what.n) || !["self", "subject", "target"].includes(what.ref) || (many && what.ref !== "self" && what.ref !== "target" && !(what.ref === "subject" && ctx.subject))) return null;
    return [{ type: "attach", what, source }];
  }
  // Inventory Management: "For each Aura and Equipment you control, you may attach it to a creature you control": each in
  // turn, to a creature chosen as it resolves (not targeted), or left where it is; only where it could legally be attached
  // (rulings, CR 701.3a-b).
  if (/^For each Aura and Equipment you control, you may attach it to a creature you control$/.test(s))
    return [{ type: "attachToChosen", source: { ref: "each", filter: { kind: "object", subtypes: ["Aura", "Equipment"], controller: "you", text: "Aura or Equipment you control" } }, filter: { kind: "object", types: ["Creature"], controller: "you", text: "a creature you control" }, may: true }];
  // Balan, Wandering Knight: "Attach all Equipment you control to ~": each that could be attached to it (CR 701.3a-b).
  if (/^Attach all Equipment you control to ~$/.test(s) && !ctx.spell) return [{ type: "attachAll", filter: { kind: "object", subtypes: ["Equipment"], controller: "you", text: "Equipment you control" } }];
  // Rhuk, Hexgold Nabber: "attach all Equipment attached to that creature to ~": the trigger's creature's, all or none
  // (rulings).
  if (/^[Aa]ttach all Equipment attached to (?:that creature|it) to ~$/.test(s) && !ctx.spell && ctx.subject) return [{ type: "attachAll", filter: { kind: "object", subtypes: ["Equipment"], text: "Equipment" }, fromSubject: true }];
  // Vulshok Battlemaster: "attach all Equipment on the battlefield to it": every player's, still under its controller's
  // control (rulings).
  if ((m = /^[Aa]ttach all Equipment on the battlefield to (~|it)$/.exec(s)) && !ctx.spell && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) return [{ type: "attachAll", filter: { kind: "object", subtypes: ["Equipment"], text: "Equipment" } }];
  // Ardenn: "attach any number of Auras and Equipment you control to target permanent or player": chosen as it resolves
  // (rulings), each that could be attached to it (CR 701.3a-b).
  if ((m = /^(?:you may )?attach any number of Auras and Equipment you control to (target permanent or player)$/i.exec(s)) && !ctx.spell) {
    const host = addTarget(ctx, { kind: "any", types: [...PERMANENT_TYPES], text: m[1]! });
    return [{ type: "attachAny", host }];
  }
  // Heavenly Blademaster: "When ~ enters, you may attach any number of Auras and Equipment you control to it": to the
  // source, chosen as it resolves; each only if it could be attached (rulings, CR 701.3a-b).
  // Yuffie, Materia Hunter: "Then you may attach an Equipment you control to ~": one, chosen as it resolves (not targeted),
  // only one that could be attached to it (CR 701.3a-b).
  if (/^(?:you may )?attach an Equipment you control to ~$/i.test(s) && !ctx.spell && (ctx.selfIt || ctx.selfCard) && !ctx.subjectIt) return [{ type: "attachAny", host: -1, self: true, equipment: true, one: true }];
  if (/^(?:you may )?attach any number of Auras and Equipment you control to (?:it|~)$/i.test(s) && !ctx.spell && (ctx.selfIt || ctx.selfCard) && !ctx.subjectIt && ctx.lastObjectTarget === undefined) return [{ type: "attachAny", host: -1, self: true }];
  // Stolen Uniform: "Attach it to the chosen creature": the target Equipment to the target creature (CR 701.3a); if
  // either is an illegal target, it doesn't move (rulings).
  if ((m = /^Attach (?:it|that Equipment) to (the chosen creature)$/.exec(s)) && ctx.spell) {
    const source = parseObject("that Equipment", ctx);
    const what = parseObject(m[1]!, ctx);
    return source?.ref === "target" && what?.ref === "target" && source.index !== what.index ? [{ type: "attach", what, source }] : null;
  }
  // Auriok Survivors: "you may return target Equipment card from your graveyard to the battlefield. If you do, you may
  // attach it to ~": the Equipment that card became (CR 400.7), onto ~ if it's still there and could be equipped (CR 701.3b).
  if (/^Attach it to ~$/i.test(s) && !ctx.spell && ctx.selfIt && ctx.lastObjectTarget === undefined && ctx.targets.length === 1) {
    const t = ctx.targets[0];
    if (t?.kind !== "card" || t.owner !== "you" || t.many || t.subtypes?.length !== 1 || t.subtypes[0] !== "Equipment" || t.types?.length) return null;
    return [{ type: "attach", what: { ref: "self" }, source: { ref: "created" } }];
  }
  // U.S.Agent, John Walker: "create a colorless Equipment artifact token named Sturdy Shield ... Attach it to ~": that token,
  // onto ~ if it's still there and could be equipped (CR 701.3b); otherwise it stays unattached.
  if (/^Attach it to ~$/i.test(s) && !ctx.spell && ctx.selfIt && ctx.lastCreatedEquipment && ctx.lastObjectTarget === undefined) return [{ type: "attach", what: { ref: "self" }, source: { ref: "created" } }];
  // "Gain control of target Equipment an opponent controls until end of turn. Attach it to ~." (Ogre Geargrabber)
  if ((m = /^Attach (?:it|that Equipment) to (~|him|her)$/i.exec(s)) && !ctx.spell && ctx.lastObjectTarget !== undefined) {
    const t = ctx.targets[ctx.lastObjectTarget];
    if (t?.kind !== "object" || !t.subtypes?.includes("Equipment")) return null;
    return [{ type: "attach", what: { ref: "self" }, source: { ref: "target", index: ctx.lastObjectTarget } }];
  }
  // Thieving Skydiver: "gain control of target artifact ... If that artifact is an Equipment, attach it to ~": only an
  // Equipment moves (an artifact Aura wouldn't).
  if (/^If that artifact is an Equipment, attach it to ~$/.test(s) && !ctx.spell && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.types?.includes("Artifact"))
    return [{ type: "attach", what: { ref: "self" }, source: { ref: "target", index: ctx.lastObjectTarget }, equipmentOnly: true }];
  // "When ~ enters, attach it to target creature you control." (CR 701.3)
  // "Whenever an Equipment you control enters, you may attach it to target creature you control" (Sigarda's Aid), "...
  // ~ or another Equipment you control enters, you may attach that Equipment ..." (Hammer of Nazahn): the one that entered.
  // "+1: Attach ~ to up to one target creature you control" (The Aetherspark): with none chosen, nothing happens.
  if ((m = /^Attach (~|it|that Equipment) to ((?:up to one )?target .+)$/i.exec(s)) && !ctx.spell) {
    const what = parseObject(m[2]!, ctx);
    const entered = m[1] !== "~" && (ctx.subject || ctx.subjectIt);
    if (m[1] === "that Equipment" && !entered) return null;
    return what?.ref === "target" ? [{ type: "attach", what, ...(entered ? { source: { ref: "subject" as const } } : {}) }] : null;
  }
  // Mirri, Weatherlight Duelist: "Each opponent can't block with more than one creature this combat" (CR 509.1b).
  if (/^[Ee]ach opponent can't block with more than one creature this combat$/.test(s)) return [{ type: "blockLimitThisCombat", who: { ref: "eachOpponent" }, n: 1 }];
  // "Target creature can't block this turn", "~ can't attack or block this turn", "~ can't be blocked this
  // turn": until the turn ends.
  // "Target creature can't attack until your next turn" ends as your next turn begins (CR 611.2b).
  // "Creatures with power 3 or less can't block this turn" (Temur Charm): those entering later too, and each creature's
  // power as blockers are declared (rulings).
  // Awe for the Guilds: "Monocolored creatures can't block this turn", each creature's colors as blockers are declared.
  if (/^Monocolored creatures can't block this turn$/.test(s)) return [{ type: "cantBlockRule", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], colorCount: "monocolored", text: "monocolored creatures" } }];
  // Goblin Locksmith: "creatures with defender can't block this turn".
  // Twins of Discord: "Creatures with mana value of that quality can't block this turn", after "choose odd or even".
  if ((m = /^[Cc]reatures( without flying| with power \d+ or less| with defender| with mana value of that quality)? can't block this turn$/.exec(s))) {
    const filter = parseTargetPhrase(`creature${m[1] ?? ""}`, { chosen: true });
    return filter?.kind === "object" ? [{ type: "cantBlockRule", filter: { ...filter, text: `creatures${m[1] ?? ""}` } }] : null;
  }
  // The Motherlode, Excavator: "creatures that player controls without flying can't block this turn" (that player being the
  // defending player): a rule for the turn, so also creatures that lose flying or come under their control later
  // (rulings).
  if ((m = /^[Cc]reatures defending player controls( without flying)? can't block this turn$/.exec(s))) {
    const filter = parseTargetPhrase(`creature${m[1] ?? ""}`);
    const of = parsePlayer("defending player", ctx);
    return filter?.kind === "object" && of ? [{ type: "cantBlockRule", filter: { ...filter, text: `creatures${m[1] ?? ""}` }, ofPlayer: of }] : null;
  }
  // Concussive Bolt: "creatures controlled by that player or by that planeswalker's controller can't block this turn": a
  // rule for the turn, so creatures that come under that player's control later can't block either (rulings).
  if (/^[Cc]reatures controlled by that player or by that planeswalker's controller can't block this turn$/.test(s)) {
    const of = parsePlayer("that player or that planeswalker's controller", ctx);
    return of ? [{ type: "cantBlockRule", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creatures" }, ofPlayer: of }] : null;
  }
  // Rumbling Ruin (body.ts makes it one sentence): "creatures your opponents control with power less than or equal to the
  // number of +1/+1 counters on creatures you control can't block this turn": the number counted once as it resolves
  // (CR 608.2h), a rule for the turn for every creature in the group, its power as blockers are declared (CR 611.2c).
  if ((m = /^[Cc]reatures your opponents control with power less than or equal to (the number of \+1\/\+1 counters on creatures you control) can't block this turn$/.exec(s))) {
    const amount = parseCount(m[1]!, ctx);
    return amount ? [{ type: "cantBlockRule", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "opponent", bound: { key: "power", at: "most", amount }, text: `creatures your opponents control with power less than or equal to ${m[1]}` } }] : null;
  }
  // Pyrophobia: "Cowards can't block this turn": each creature of that type as blockers are declared, those entering later too.
  if ((m = /^([A-Z][a-z]+)s can't block this turn$/.exec(s)) && CREATURE_TYPES.has(m[1]!)) return [{ type: "cantBlockRule", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], subtypes: [m[1]!], text: `${m[1]}s` } }];
  // "~ must be blocked each combat this turn if able" (Anzrag, the Quake-Mole): a blocking requirement (CR 509.1c) until
  // the turn ends.
  if ((m = /^(.+?) must be blocked (?:each combat )?this turn if able$/i.exec(s)) && !/ and$/.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    if (what) return [{ type: "continuous", what, mods: [{ kind: "mustBeBlocked" }], duration: "endOfTurn" }];
  }
  // Flummoxed Cyclops: "~ can't block this combat": until the combat ends (CR 500.5a: "until end of combat").
  // Forgestoker Dragon: "That creature can't block this combat", the one it just dealt damage to.
  if ((m = /^(~|That creature|Target creature) can't block this combat$/.exec(s))) {
    const what = m[1] === "~" ? ({ ref: "self" } as const) : parseObject(m[1]!.replace(/^That/, "that").replace(/^Target/, "target"), ctx);
    return what && !isGroup(what) ? [{ type: "continuous", what, mods: [{ kind: "cantBlock" }], duration: "endOfCombat" }] : null;
  }
  // Neyith of the Dire Hunt: "That creature must be blocked this combat if able": in the combat going on only.
  if ((m = /^(That creature|It|Target creature) must be blocked this combat if able$/i.exec(s))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    if (what) return [{ type: "continuous", what, mods: [{ kind: "mustBeBlocked", combat: "this" }], duration: "endOfTurn" }];
  }
  // Dulcet Sirens: "Target creature attacks target opponent this turn if able": that player, not a planeswalker of theirs
  // (rulings), in each combat this turn (CR 508.1d). With either target illegal, nothing happens (rulings). Ravener: the
  // same after a trigger's condition ("When ~ enters, target creature attacks ...").
  // Alluring Siren: "Target creature an opponent controls attacks you this turn if able": you, not a planeswalker of yours
  // (rulings), the same way.
  if (/^[Tt]arget creature an opponent controls attacks you this turn if able$/.test(s)) {
    const what = parseObject("target creature an opponent controls", ctx);
    return what && !isGroup(what) && what.ref === "target" ? [{ type: "continuous", what, mods: [{ kind: "mustAttackPlayer", player: "you" }], duration: "endOfTurn" }] : null;
  }
  if (/^[Tt]arget creature attacks target opponent this turn if able$/.test(s)) {
    const what = parseObject("target creature", ctx);
    const whom = parsePlayer("target opponent", ctx);
    if (what && !isGroup(what) && whom?.ref === "target") return [{ type: "continuous", what, mods: [{ kind: "mustAttackPlayer", player: { target: whom.index } }], duration: "endOfTurn" }];
    return null;
  }
  // Hustle: "Target creature attacks or blocks this turn if able": both requirements for the turn (CR 508.1d, 509.1c), as
  // with "attacks or blocks each combat if able"; a tapped one, or one that can't, does neither (rulings).
  if ((m = /^(target creature) attacks or blocks this turn if able$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "attacksIfAble" }, { kind: "mustBlock" }], duration: "endOfTurn" }] : null;
  }
  // Siren's Call: "Creatures the active player controls attack this turn if able": the ones that player controls as it
  // resolves (CR 611.2c), in each combat this turn (CR 508.1d).
  if (/^Creatures the active player controls attack this turn if able$/.test(s))
    return [{ type: "continuous", what: { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creatures the active player controls" }, of: { ref: "activePlayer" } }, mods: [{ kind: "attacksIfAble" }], duration: "endOfTurn" }];
  // Ashcloud Phoenix: "When ~ dies, return it to the battlefield face down under your control": the card, if it's still
  // in the graveyard it went to (CR 400.7, rulings), a 2/2 face-down creature (CR 708.2) that its own morph can turn face
  // up (CR 702.37e, rulings).
  if (/^[Rr]eturn it to the battlefield face down under your control$/.test(s) && ctx.selfCard && !ctx.spell) return [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, faceDown: "plain" }];
  // "Target creature an opponent controls attacks during its controller's next combat phase if able" (Trench Behemoth,
  // Sizzling Soloist): an attack requirement (CR 508.1d) in the next combat phase of the player controlling it as this
  // resolves, until that combat phase ends (CR 500.5a); it can attack whom its controller chooses (rulings).
  if ((m = /^(target creature an opponent controls|that creature) attacks during its controller's next combat phase if able$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "attacksIfAble", turnOf: "controller" }], duration: "controllersNextCombat" }] : null;
  }
  // "Target creature attacks this turn if able": in each combat this turn (CR 508.1d).
  if ((m = /^(.+?) attacks? (?:each combat )?this turn if able$/i.exec(s)) && !/ and$/.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "attacksIfAble" }], duration: "endOfTurn" }] : null;
  }
  if (/^Creatures can't attack this turn$/.test(s)) return [{ type: "cantAttackRule", filter: { kind: "object", types: ["Creature"], text: "creatures" } }];
  // Oriss, Samite Guardian: "Creatures that player controls can't attack this turn", after a target player: the creatures
  // they control when attackers are declared, ones that arrive later too (a rule for the turn, not a change to the
  // creatures there now, CR 611.2c).
  if (/^Creatures that player controls can't attack this turn$/.test(s)) {
    const of = parsePlayer("that player", ctx);
    if (of?.ref === "target") return [{ type: "cantAttackRule", filter: { kind: "object", types: ["Creature"], text: "creatures" }, ofPlayer: of }];
  }
  // Intimidation Bolt: "~ deals 3 damage to target creature. Other creatures can't attack this turn.": every creature but
  // that one, also ones that arrive later, and all of them if it left the battlefield (rulings).
  if (/^Other creatures can't attack this turn$/.test(s) && ctx.spell && ctx.lastObjectTarget !== undefined && !ctx.targets[ctx.lastObjectTarget]?.many)
    return [{ type: "cantAttackRule", filter: { kind: "object", types: ["Creature"], text: "other creatures" }, exceptTarget: ctx.lastObjectTarget }];
  // Venser, the Sojourner: "Creatures can't be blocked this turn": all creatures, also ones that arrive later (rulings).
  if (/^Creatures can't be blocked this turn$/.test(s)) return [{ type: "cantBeBlockedRule", filter: { kind: "object", types: ["Creature"], text: "creatures" } }];
  // Leitmotif Composer: "Creatures named ~ can't be blocked this turn": with the source's name as this resolves, anyone's,
  // also ones that arrive later this turn (a rule, not a change to characteristics, CR 611.2c).
  if (/^Creatures named ~ can't be blocked this turn$/.test(s) && !ctx.spell) return [{ type: "cantBeBlockedRule", filter: { kind: "object", types: ["Creature"], named: "~", text: "creatures named ~" } }];
  // "Until your next turn, those permanents can't attack or block and their activated abilities can't be activated" (Mythos
  // of Vadrok): what detain does, in words (CR 701.35a); mana abilities too (CR 605.1a).
  if ((m = /^Until your next turn, (.+?) can't attack or block and (?:its|their) activated abilities can't be activated$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "cantAttack" }, { kind: "cantBlock" }, { kind: "cantActivate" }], duration: "yourNextTurn" }] : null;
  }
  // "Tap target permanent. Its activated abilities can't be activated this turn." (Koma): mana abilities too (CR 605.1a).
  // Xathrid Gorgon: "Its activated abilities can't be activated." after an activated ability's target: with no duration,
  // for as long as it's that permanent (CR 611.2a; rulings).
  if ((m = /^(Its|Their|.+?'s) activated abilities can't be activated(?: (this turn|until your next turn))?$/.exec(s)) && (m[2] || (m[1] === "Its" && ctx.activated))) {
    const who = m[1]!;
    const what = parseObject(who === "Its" ? "it" : who === "Their" ? "them" : who.replace(/'s$/, ""), ctx);
    if (!m[2] && what?.ref !== "target") return null;
    return what ? [{ type: "continuous", what, mods: [{ kind: "cantActivate" }], duration: m[2] === "this turn" ? "endOfTurn" : m[2] ? "yourNextTurn" : "game" }] : null;
  }
  // "Until your next turn, those creatures can't block" (Taunt from the Rampart): the same, said first.
  const front = /^Until your next turn, (.+? can't (?:block|attack|attack or block|be blocked))$/.exec(s);
  if (front) s = `${front[1]} until your next turn`;
  // Rikku, Resourceful Guardian: "until end of turn, that creature can't be blocked by creatures your opponents control"
  // (the duration moved to the end by then).
  const eot = /^([^"]+? can't be blocked by [^"]+) until end of turn$/i.exec(s);
  if (eot) s = `${eot[1]} this turn`;
  if ((m = /^(?!.* until end of turn and )(.+?) can't (block|attack|attack or block|be blocked) (this turn|until your next turn)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods: Modification[] =
      m[2] === "block" ? [{ kind: "cantBlock" }] : m[2] === "attack" ? [{ kind: "cantAttack" }] : m[2] === "be blocked" ? [{ kind: "cantBeBlocked" }] : [{ kind: "cantAttack" }, { kind: "cantBlock" }];
    return what ? [{ type: "continuous", what, mods, duration: m[3] === "this turn" ? "endOfTurn" : "yourNextTurn" }] : null;
  }
  // "~ can't be blocked this turn except by snow creatures" (Rime Transfusion), "can't be blocked by Walls this turn": the
  // static ability's evasion (CR 509.1b), until end of turn.
  // Kick in the Door: "That creature gains haste until end of turn and can't be blocked by Walls this turn" is both
  // changes at once (sentences/permanents.ts).
  if ((m = /^(?!.* until end of turn and )(.+?) can't be blocked (this turn except by .+|by .+? this turn)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    // The Black Gate: "... by creatures that player controls this turn", the player chosen as it resolves.
    if (m[2] === "by creatures that player controls this turn")
      return what && ctx.chosenOpponent ? [{ type: "continuous", what, mods: [{ kind: "cantBeBlockedBy", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "chosenPlayer", text: "creatures that player controls" } }], duration: "endOfTurn" }] : null;
    // Rikku, Resourceful Guardian: "... by creatures your opponents control this turn": the opponents of the effect's
    // controller (bound as it resolves, fixMods), whoever controls the creature.
    if (m[2] === "by creatures your opponents control this turn")
      return what ? [{ type: "continuous", what, mods: [{ kind: "cantBeBlockedBy", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "opponent", text: "creatures your opponents control" } }], duration: "endOfTurn" }] : null;
    // Skrelv: "... by creatures of the chosen color this turn", the color chosen as it resolves.
    const ofChosen = /^by (.+?) of the chosen color this turn$/.exec(m[2]!);
    if (ofChosen) {
      const filter = parseTargetPhrase(ofChosen[1]!.split(" ").map(singularWord).join(" "));
      return what && filter?.kind === "object" && !filter.controller && !filter.colors?.length ? [{ type: "continuous", what, mods: [{ kind: "cantBeBlockedBy", filter: { ...filter, chosen: "color", text: `${ofChosen[1]} of the chosen color` } }], duration: "endOfTurn" }] : null;
    }
    const mods = what && parseStaticMods(`can't be blocked ${m[2]!.replace(/^this turn (except by .+)$/, "$1").replace(/ this turn$/, "")}`);
    return what && mods ? [{ type: "continuous", what, mods, duration: "endOfTurn" }] : null;
  }
  // "Target creature can't be the target of spells or abilities your opponents control this turn" (Vines of Vastwood): the
  // opponents of whoever controls the effect, its spell's controller (rulings on Vines of Vastwood).
  // Autumn's Veil: "creatures you control can't be the targets of blue or black spells this turn": a rule about every
  // creature you control this turn, those that come later too (rulings; CR 611.2c is only for characteristics).
  // Display of Dominance: "Permanents you control can't be the targets of blue or black spells your opponents control this
  // turn": the same for every permanent you control during the rest of the turn (rulings).
  if ((m = /^(Creatures|Permanents) you control can't be the targets of (.+) this turn$/i.exec(s))) {
    const affects = parseAffected(`${m[1]} you control`);
    const by = parseUntargetable(m[2]!);
    return affects && by ? [{ type: "groupRules", affects, text: `${m[1]!.toLowerCase()} you control`, mods: [{ kind: "untargetable", by }], duration: "endOfTurn" }] : null;
  }
  if ((m = /^(.+?) can't be the target of (.+) this turn$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const by = parseUntargetable(m[2]!);
    return what && by ? [{ type: "continuous", what, mods: [{ kind: "untargetable", by }], duration: "endOfTurn" }] : null;
  }
  // Picking your own permanents, not targeted: "sacrifice a creature", "each opponent sacrifices a creature
  // of their choice", "return a land you control to its owner's hand" (CR 701.21).
  // "Return another creature you control to its owner's hand" (Ambush Krotiq): not the source.
  // Cloudstone Curio: "Return another permanent you control that shares a permanent type with it to its owner's hand",
  // "it" being the permanent that entered.
  if (ctx.subjectIt && (m = /^Return another (permanent) you control that shares a permanent type with it to its owner's hand$/.exec(s))) {
    const filter = pickFilter(m[1]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter: { ...filter, sharesPermanentTypeWithSubject: true, text: "other permanent that shares a permanent type with it" }, n: 1, action: "bounce" }];
  }
  if ((m = /^Return another (?!target )(.+?) you control to its owner's hand$/i.exec(s))) {
    const filter = pickFilter(m[1]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter: { ...filter, notSource: true, text: `other ${filter.text}` }, n: 1, action: "bounce" }];
  }
  // Phenomenon Investigators: "return a nonland permanent you own to your hand": any of yours on the battlefield, whoever
  // controls it, chosen as it resolves (CR 108.3).
  if ((m = /^Return an? (?!target )([a-z]+(?: [a-z]+)?) you own to your hand$/i.exec(s))) {
    const filter = pickFilter(m[1]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter: { ...filter, owner: "you", text: `${filter.text} you own` }, n: 1, action: "bounce", anyController: true }];
  }
  // Nulltread Gargantuan: "Put a creature you control on top of its owner's library": chosen as it resolves, not targeted,
  // itself too (rulings).
  if ((m = /^Put an? (?!target )([a-z]+) you control on top of its owner's library$/i.exec(s))) {
    const filter = pickFilter(m[1]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "libraryTop" }];
  }
  // (Sea Drake's "return two target lands you control" targets: sentences/permanents.ts.)
  // Kazandu Stomper: "return up to two lands you control to their owner's hand": none to that many, chosen as it resolves.
  if ((m = new RegExp(`^Return (up to )?${NUM} (?!target )(.+?) you control to (?:its|their) owners?'s? hands?$`, "i").exec(s)) && !/\btarget\b/.test(m[3]!)) {
    const filter = pickFilter(m[3]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: amt(m[2]!), action: "bounce", ...(m[1] ? { upTo: true as const } : {}) }];
  }
  // Killing Wave: "For each creature, its controller sacrifices it unless they pay X life": each player chooses which of
  // theirs to keep, paying X life for each, the active player first and each knowing the choices before theirs; then
  // they all pay and sacrifice at the same time (rulings). No more than they can pay for (CR 119.4).
  if ((m = /^For each creature, its controller sacrifices it unless they pay (X|\d+) life$/.exec(s))) {
    const among: TargetSpec = { kind: "object", types: ["Creature"], text: "creature" };
    return [{ type: "keepRest", who: { ref: "eachPlayer" }, keep: [{ filter: among, n: 0, upTo: true }], among, payLife: m[1] === "X" ? { count: { kind: "x" } } : Number(m[1]) }];
  }
  // "Each player chooses from among the permanents they control an artifact, a creature, an enchantment, and a land,
  // then sacrifices the rest" (Cataclysm), "... an artifact, a creature, an enchantment, and a planeswalker from among the
  // nonland permanents they control ..." (Cataclysmic Gearhulk), "... up to two creatures they control ..." (Covetous
  // Elegy), "... a land of each basic land type" (Global Ruin), "... a permanent they control of each permanent type"
  // (Liliana, Dreadhorde General). The choices aren't targeted, and are made as it resolves (rulings).
  // Divine Reckoning: "Each player chooses a creature they control. Destroy the rest." (joined in body.ts): the rest are
  // destroyed instead, at once.
  // Keldon Firebombers: "each player sacrifices all lands they control except for three": each chooses three to keep (all
  // they have if three or fewer) and sacrifices the rest, as Cataclysm does.
  if ((m = /^([Ee]ach player) sacrifices all (lands|creatures) they control except for (two|three|four|five)$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const among = pickFilter(m[2]!.replace(/s$/, ""));
    return who && among?.kind === "object" ? [{ type: "keepRest", who, keep: [{ filter: among, n: num(m[3]!) }], among }] : null;
  }
  // Stick Together: "Each player chooses a party from among creatures they control, then sacrifices the rest": for each of
  // Cleric, Rogue, Warrior and Wizard, up to one creature of that type, each creature only once (CR 700.8b, 700.8d); then
  // the other creatures are sacrificed at once.
  if (/^Each player chooses a party from among creatures they control, then sacrifices the rest$/.test(s)) {
    const creature: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
    return [{ type: "keepRest", who: { ref: "eachPlayer" }, keep: (["Cleric", "Rogue", "Warrior", "Wizard"] as const).map((t) => ({ filter: { ...creature, subtypes: [t], text: t }, n: 1, upTo: true as const, notKept: true as const })), among: creature }];
  }
  if ((m = /^(.+?) chooses (.+?),? (?:then|and) (?:sacrifices (?:the rest|all other creatures they control)|the rest are destroyed)$/.exec(s))) {
    const destroy = / the rest are destroyed$/.test(s);
    const who = parsePlayer(m[1]!, ctx);
    const what = m[2]!;
    let r: RegExpExecArray | null;
    let among: TargetSpec | null = null;
    let list: string | undefined;
    let keep: { filter: TargetSpec; n: number; upTo?: true; fewest?: true; maxTotalPower?: number }[] | null = null;
    // "Each player chooses a number of lands they control equal to the number of lands controlled by the player who
    // controls the fewest, then sacrifices the rest" (Restore Balance, Balancing Act).
    if ((r = /^a number of (lands|creatures|permanents) they control equal to the number of \1 controlled by the player who controls the fewest$/.exec(what))) {
      among = pickFilter(r[1]!.replace(/s$/, ""));
      keep = among && [{ filter: among, n: 0, fewest: true }];
    } else if ((r = /^from among the permanents they control (.+)$/.exec(what))) [among, list] = [{ kind: "object", text: "permanent" }, r[1]!];
    else if ((r = /^(.+) from among the (nonland permanents|creatures) they control$/.exec(what))) [among, list] = [pickFilter(r[2]!), r[1]!];
    else if ((r = /^from the lands they control a land of each basic land type$/.exec(what))) {
      among = { kind: "object", types: ["Land"], text: "land" };
      keep = BASIC_TYPES.map((t) => ({ filter: { kind: "object", types: ["Land"], subtypes: [t], text: t }, n: 1 }));
    } else if (/^a permanent they control of each permanent type$/.test(what)) {
      // The permanent types (CR 110.4).
      among = { kind: "object", text: "permanent" };
      keep = (["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"] as const).map((t) => ({ filter: { kind: "object", types: [t], text: t.toLowerCase() }, n: 1 }));
    } else if ((r = /^any number of creatures they control with total power (\d+) or less$/.exec(what)) && /all other creatures they control$/.test(s)) {
      // Slaughter the Strong: any number whose powers add up to N or less, a negative power subtracting (rulings).
      among = { kind: "object", types: ["Creature"], text: "creature" };
      keep = [{ filter: among, n: 0, upTo: true, maxTotalPower: Number(r[1]) }];
    } else if (/all other creatures they control$/.test(s)) return null;
    else if ((r = new RegExp(`^(up to )?${NUM} (.+?) they control$`).exec(what))) {
      const filter = pickFilter(r[3]!);
      const n = amt(r[2]!);
      if (!filter || typeof n !== "number") return null;
      among = filter;
      keep = [{ filter, n, ...(r[1] ? { upTo: true as const } : {}) }];
    }
    if (list !== undefined) {
      const parts = list.split(/,? and |, /);
      const filters = parts.map((x) => /^an? (.+)$/.exec(x)).map((x) => (x ? pickFilter(x[1]!) : null));
      if (filters.some((f) => !f)) return null;
      keep = filters.map((filter) => ({ filter: filter!, n: 1 }));
    }
    if (!who || !among || among.kind !== "object" || !keep?.length || keep.some((k) => k.filter.kind !== "object")) return null;
    return [{ type: "keepRest", who, keep, among, ...(destroy ? { destroy: true as const } : {}) }];
  }
  // "Each opponent exiles cards from the top of their library until that player has exiled cards with total mana value
  // 20 or greater" (Tasha's Hideous Laughter).
  if ((m = /^(Each opponent|Each player|Target opponent|Target player) exiles cards from the top of their library until (?:that player has|they have) exiled cards with total mana value (\d+) or greater$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "exileUntilTotalMv", who, total: Number(m[2]) }] : null;
  }
  // "Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile
  // of their choice." (Liliana of the Veil; joined into one sentence in body.ts).
  if ((m = /^Separate all permanents (.+?) controls into two piles for that player to sacrifice the pile of their choice$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref === "target" ? [{ type: "permanentPiles", who }] : null;
  }
  // Do or Die, Make an Example (joined into one sentence in body.ts): creatures only.
  if ((m = /^Separate all creatures (.+?) controls into two piles for that player to choose the pile to destroy without regeneration$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref === "target" ? [{ type: "permanentPiles", who, types: ["Creature"], destroy: true }] : null;
  }
  if (/^Each opponent separates the creatures they control into two piles for you to choose the pile they sacrifice$/.test(s))
    return [{ type: "permanentPiles", who: { ref: "eachOpponent" }, types: ["Creature"], theySeparate: true }];
  // "Each opponent sacrifices a creature with the greatest power among creatures they control", "... a creature they
  // control with the greatest power" (Szat's Will), "a creature or planeswalker with the greatest mana value among
  // creatures and planeswalkers they control" (Soul Shatter).
  if ((m = /^(.+?) sacrifices? a creature (?:with the greatest power among creatures (?:they control|that player controls)|they control with the greatest power)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "pick", who, filter: { kind: "object", types: ["Creature"], text: "creature" }, n: 1, action: "sacrifice", greatest: "power" }] : null;
  }
  // Witch-king, Bringer of Ruin: "defending player sacrifices a creature with the least power among creatures they
  // control": the least, or tied for it, that player choosing among those tied.
  if ((m = /^(.+?) sacrifices? a creature with the least power among creatures (?:they control|that player controls)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "pick", who, filter: { kind: "object", types: ["Creature"], text: "creature" }, n: 1, action: "sacrifice", least: "power" }] : null;
  }
  // Olórin's Searing Light: "Each opponent exiles a creature with the greatest power among creatures that player
  // controls": each chooses in turn order, then they're exiled at once (rulings, CR 101.4).
  if ((m = /^(.+?) exiles? a creature with the greatest power among creatures (?:they control|that player controls)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "pick", who, filter: { kind: "object", types: ["Creature"], text: "creature" }, n: 1, action: "exile", greatest: "power" }] : null;
  }
  // Fall of the Impostor: "Exile a creature with the greatest power among creatures target opponent controls": not a target
  // (rulings); you choose among those that player controls tied for the greatest power.
  if ((m = /^[Ee]xile a creature with the greatest power among creatures (target opponent) controls$/.exec(s))) {
    const among = parsePlayer(m[1]!, ctx);
    return among?.ref === "target" ? [{ type: "pick", who: { ref: "you" }, among, filter: { kind: "object", types: ["Creature"], text: "creature" }, n: 1, action: "exile", greatest: "power" }] : null;
  }
  // Blot Out: "Target opponent exiles a creature or planeswalker they control with the greatest mana value among creatures
  // and planeswalkers they control": that player chooses among those tied.
  if ((m = /^(.+?) (sacrifices?|exiles?) a creature or planeswalker (?:they control )?with the greatest mana value among creatures and planeswalkers (?:they control|that player controls)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "pick", who, filter: { kind: "object", types: ["Creature", "Planeswalker"], text: "creature or planeswalker" }, n: 1, action: /^sac/i.test(m[2]!) ? "sacrifice" : "exile", greatest: "manaValue" }] : null;
  }
  // Dispersal: "Each opponent returns a nonland permanent they control with the greatest mana value among permanents they
  // control to its owner's hand": the greatest among all their permanents, lands too (a land's back face can have one), so
  // a player whose greatest is a land's returns nothing; each chooses in turn order, then they return at once (rulings).
  if ((m = /^(.+?) returns? a nonland permanent they control with the greatest mana value among permanents they control to its owner's hand$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const filter = pickFilter("nonland permanent");
    return who && who.ref !== "you" && filter ? [{ type: "pick", who, filter, n: 1, action: "bounce", greatest: "manaValue", greatestOfAll: true }] : null;
  }
  // "Each player sacrifices half the non-God creatures they control of their choice, rounded down" (Zodiark), "sacrifice
  // half the non-Demon permanents you control, rounded up" (Rakdos): each player half of their own, worked out before
  // anyone chooses (rulings on Fraying Omnipotence, CR 107.1a).
  // Legate Lanius: "each opponent sacrifices a tenth of the creatures they control of their choice, rounded up": one for
  // one to ten creatures, two for eleven to twenty (rulings).
  // Pox: "then sacrifices a third of the creatures they control of their choice, ... Round up each time." (CR 107.1a).
  if ((m = /^(?:(.+?) )?[Ss]acrifices? (half|a tenth of|a third of) the (.+?) (you|they|that player) controls?(?: of (?:their|his or her) choice)?(?:, rounded (up|down))?$/.exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : ({ ref: "you" } as const);
    const filter = pickFilter(m[3]!);
    const half = m[2] === "a tenth of" ? (m[5] as "up" | "down" | undefined) : roundOf(m[5], ctx);
    if (!who || !filter || filter.kind !== "object" || !half || (who.ref === "you") !== (m[4] === "you")) return null;
    return [{ type: "pick", who, filter, n: { count: { kind: "permanents", filter, whose: { ref: "eachOne" } }, half, ...(m[2] === "half" ? {} : m[2] === "a third of" ? { third: true as const } : { tenth: true as const }) }, action: "sacrifice" }];
  }
  // "Choose target player. Return half the creatures they control to their owner's hand, rounded up" (Split the Party):
  // half of that player's, which you choose as it resolves (rulings, CR 107.1a).
  if ((m = /^Return half the (.+?) (they|that player) controls? to (?:its|their) owners?'s? hands?(?:, rounded (up|down))?$/.exec(s))) {
    const among = ctx.lastPlayerTarget !== undefined ? parsePlayer("that player", ctx) : null;
    const filter = pickFilter(m[1]!);
    const half = roundOf(m[3], ctx);
    if (among?.ref !== "target" || !filter || filter.kind !== "object" || !half) return null;
    return [{ type: "pick", who: { ref: "you" }, among, filter, n: { count: { kind: "permanents", filter, whose: among }, half }, action: "bounce" }];
  }
  // Neyam Shai Murad (as parseBody joins it): the trigger's player chooses the card in your graveyard, for you (as
  // O-Kagachi Made Manifest's `chooser`); it enters under your control.
  if (ctx.eventPlayer && /^[Tt]hat player chooses a permanent card in your graveyard for you to put onto the battlefield under your control$/.test(s)) {
    const filter = parseSearchFilter("permanent card");
    return filter ? [{ type: "chooseFromGraveyard", n: 1, dest: "battlefield", filter, chooser: { ref: "eventPlayer" } }] : null;
  }
  // Malik, Grim Manipulator (as parseBody joins it): the two secret choices, then that player sacrifices the one or two
  // creatures chosen (CR 701.21a).
  if (/^You and target opponent each secretly choose a creature that player controls for that player to sacrifice$/.test(s)) {
    const who = parsePlayer("target opponent", ctx);
    const filter = pickFilter("creature");
    return who && filter?.kind === "object" ? [{ type: "secretChoose", who, filter: { ...filter, text: "creature" } }, { type: "sacrifice", what: { ref: "created" }, byController: true }] : null;
  }
  // Call to the Void (as parseBody joins it): every choice made before any is revealed (rulings), then each creature
  // chosen is destroyed, once however often it was chosen (rulings).
  if (/^Each player secretly chooses a creature they control and a creature they don't control for those creatures to be destroyed$/.test(s)) return [{ type: "secretChooseEach" }, { type: "destroy", what: { ref: "created" } }];
  // Gut, True Soul Zealot: "you may sacrifice another creature or an artifact": an artifact or a creature other than the
  // source, and the source too while it's an artifact (rulings).
  if ((m = /^[Ss]acrifice another creature or an artifact$/.exec(s)) && !ctx.spell) {
    const filter = pickFilter("artifact or creature");
    return filter && filter.kind === "object" ? [{ type: "pick", who: { ref: "you" }, filter: { ...filter, notSource: true, notSourceUnlessArtifact: true, text: "other creature or an artifact" }, n: 1, action: "sacrifice" }] : null;
  }
  // "You may sacrifice another creature" (Cavalier of Night): one other than the source (a permanent's ability).
  if ((m = /^[Ss]acrifice another ([a-z][^,]*?)$/.exec(s)) && !ctx.spell) {
    const filter = pickFilter(m[1]!);
    return filter && filter.kind === "object" ? [{ type: "pick", who: { ref: "you" }, filter: { ...filter, notSource: true, text: `other ${filter.text}` }, n: 1, action: "sacrifice" }] : null;
  }
  // "You may sacrifice three other nonland permanents" (Scavenger's Talent): others than the source (a permanent's ability).
  if ((m = new RegExp(`^[Ss]acrifice ${NUM} other ([a-z][^,]*?)$`).exec(s)) && !ctx.spell && num(m[1]!) > 1) {
    const filter = pickFilter(m[2]!);
    return filter && filter.kind === "object" ? [{ type: "pick", who: { ref: "you" }, filter: { ...filter, notSource: true, text: `other ${filter.text}` }, n: num(m[1]!), action: "sacrifice" }] : null;
  }
  // Teferi, Temporal Pilgrim: "Target opponent chooses a permanent they control and returns it to its owner's hand": theirs,
  // chosen as it resolves, not targeted.
  if ((m = /^(.+?) chooses (?:a|an) (.+?) they control and returns it to its owner's hand$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const filter = pickFilter(m[2]!);
    return who && who.ref !== "you" && filter?.kind === "object" ? [{ type: "pick", who, filter, n: 1, action: "bounce" }] : null;
  }
  // Mana Breach: "that player returns a land they control to its owner's hand": theirs, chosen as it resolves, not targeted.
  if ((m = /^(.+?) returns (?:a|an) (.+?) they control to its owner's hand$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const filter = pickFilter(m[2]!);
    return who && who.ref !== "you" && filter?.kind === "object" ? [{ type: "pick", who, filter, n: 1, action: "bounce" }] : null;
  }
  // The War Games: "You may exile a nontoken creature you control. When you do, ...": one of yours, chosen as it resolves
  // (not targeted).
  // Wormfang Newt: "When ~ enters, exile a land you control": linked to its "return the exiled card" ability (CR 607.2a).
  if ((m = /^[Ee]xile a (nontoken creature|land) you control$/.exec(s))) {
    const filter = pickFilter(m[1]!);
    return filter?.kind === "object" ? [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "exile" }] : null;
  }
  // Wormfang Crab: "an opponent chooses a permanent you control other than ~ and exiles it": an opponent you choose as it
  // resolves picks one of your permanents (not targeted) and exiles it.
  if (/^[Aa]n opponent chooses a permanent you control other than ~ and exiles it$/.test(s)) {
    const filter = pickFilter("permanent");
    return filter?.kind === "object" ? [{ type: "choose", choice: "opponent" }, { type: "pick", who: { ref: "chosenPlayer" }, among: { ref: "you" }, filter: { ...filter, notSource: true, text: "permanent other than ~" }, n: 1, action: "exile" }] : null;
  }
  // Fugitive of the Judoon: "You may exile a Human you control and an artifact you control. If you do, ...": two different
  // permanents of yours, chosen as it resolves (not targeted); doing it means exiling both (CR 609.3).
  if ((m = /^[Ee]xile an? ([A-Za-z]+) you control and an? ([A-Za-z]+) you control$/.exec(s))) {
    const first = pickFilter(m[1]!);
    const second = pickFilter(m[2]!);
    if (first?.kind !== "object" || second?.kind !== "object") return null;
    return [
      { type: "pick", who: { ref: "you" }, filter: first, n: 1, action: "exile", leaving: second },
      { type: "pick", who: { ref: "you" }, filter: second, n: 1, action: "exile" },
    ];
  }
  // "Defending player exiles two permanents they control" (Bane of Bala Ged): their own, chosen as it resolves, not
  // targeted; with no more than that many, all of them (rulings).
  if ((m = new RegExp(`^(.+?) exiles ${NUMX} (.+?) they control$`).exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const filter = pickFilter(m[3]!);
    return who && who.ref !== "you" && filter?.kind === "object" ? [{ type: "pick", who, filter, n: amt(m[2]!), action: "exile" }] : null;
  }
  // Exile into Darkness: "Target player sacrifices a creature of their choice with mana value 3 or less": the same as "a
  // creature with mana value 3 or less of their choice".
  if ((m = new RegExp(`^(?:(.+?) )?[Ss]acrifices? ${NUMX} (.+?)(?: of (?:their|his or her) choice)?(?: unless (?:they pay|that player pays) (.+))?$`).exec(s.replace(/ of their choice (with mana value \d+ or (?:less|greater))$/, " $1"))) && !/^(~|it|them|that creature)$/i.test(m[3]!)) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const filter = pickFilter(m[3]!);
    // "Unless they pay {3}": mana only (a discard would need its own choice).
    const unless = m[4] === undefined ? undefined : parseUnlessPays(m[4], ctx);
    if (unless === null || (unless && (unless.discard || !m[1]))) return null;
    return who && filter && [{ type: "pick", who, filter, n: amt(m[2]!), action: "sacrifice", ...(unless ? { unless } : {}) }];
  }
  return undefined;
}

/** "The top creature card of your graveyard": `kind` is "creature card", `whose` "your", "target player's" or "defending player's". */
function graveyardEnd(kind: string, whose: string, ctx: Ctx): Extract<ObjRef, { ref: "graveyardEnd" }> | null {
  const filter = parseSearchFilter(kind);
  const who = whose === "your" ? ({ ref: "you" } as const) : parsePlayer(whose.replace(/'s$/, ""), ctx);
  if (filter === null || !who) return null;
  return { ref: "graveyardEnd", who, ...(filter ? { filter } : {}) };
}

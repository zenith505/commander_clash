// Sentences that move cards between zones (graveyard, library, exile until it leaves), attach, "can't block this turn", and picking your own permanents.

import type { Effect, Modification, ObjRef, PlayerRef, TargetSpec } from "../../abilities";
import { NUM, COUNTER, BASIC_TYPES, amt, counterKind, num, singularWord } from "../words";
import { parseSearchFilter } from "../search";
import { parseSentence } from "../sentence";
import { parseBoundCount, parseCount, roundOf } from "../counts";
import { pickFilter, parsePlayer, parseObject, parseTargetPhrase, PERMANENT_TYPES, parseCardTarget } from "../targets";
import { addTarget, parseUnlessPays, type Ctx } from "../body";
import { parseStaticCondition, parseStaticMods, parseUntargetable } from "../statics";

/**
 * Whole sentences about every player's cards that other templates would take apart (tried before them), or undefined.
 */
export function parseEveryPlayerZonesSentence(s: string, ctx: Ctx): Effect[] | undefined {
  if (s === "Put all creatures on the bottom of their owners' libraries") return [{ type: "putAllOnBottom", filter: { kind: "object", types: ["Creature"], text: "creature" } }];
  // Living Death: each part for all players at once (rulings, Effect livingDeath).
  if (s === "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield") return [{ type: "livingDeath" }];
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
export function parseZonesSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;
  // Narset's Reversal: "Copy target instant or sorcery spell, then return it to its owner's hand": it leaves the stack
  // without being countered, so even a spell that can't be countered goes (rulings).
  if (/^(?:Then )?[Rr]eturn (?:it|that spell) to its owner's hand$/.test(s) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "spell")
    return ctx.targets[ctx.lastObjectTarget]!.stackAbilities ? null : [{ type: "counterSpell", index: ctx.lastObjectTarget, bounce: true }];
  // Emry: "Choose target artifact card in your graveyard. You may cast that card this turn."
  // The one target so far is that card, in your graveyard.
  if (/^You may cast (?:that card|it) this turn$/.test(s) && ctx.targets.length === 1) {
    const t = ctx.targets[0]!;
    if (t.kind === "card" && t.owner === "you" && !t.many) return [{ type: "mayCastFromGraveyard", what: { ref: "target", index: 0 } }];
  }
  // "Exile any number of target spells" (Mindbreak Trap): they leave the stack without being countered (rulings).
  if ((m = /^Exile (target spell|any number of target spells)$/i.exec(s))) {
    const spec: TargetSpec = { kind: "spell", types: [], notTypes: [], notColors: [], text: "target spell", ...(m[1] === "target spell" ? {} : { many: "any" as const }) };
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
  // "Put your commander into your hand from the command zone" (Command Beacon): one you own, of your choice with two
  // (rulings); nothing if none is there (CR 903.3).
  if (/^[Pp]ut your commander into your hand from the command zone$/.test(s)) return [{ type: "commanderToHand" }];
  // "Return to their owners' hands all creatures with ..." (Engulf the Shore), "Return to the battlefield target ... card in
  // your graveyard" (Squirming Emergence): the destination first, for a long object; the same instruction.
  if ((m = /^Return to (their owners' hands|its owner's hand|the battlefield) ((?:all|each|target) .+)$/.exec(s))) return parseSentence(`Return ${m[2]!} to ${m[1]!}`, ctx);
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
  if ((m = /^(?:(.+?) )?[Ss]acrifices? (an? \w+(?:, an? \w+)*,? and an? \w+)(?: of (?:their|his or her) choice)?$/.exec(s))) {
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

  // An instant or sorcery that exiles itself as it resolves, so it isn't put into the graveyard (CR 608.2n);
  // with suspend, it's suspended again (Arc Blade). If it doesn't resolve, it isn't exiled.
  if ((m = new RegExp(`^Exile ~ with ${NUM} time counters? on it$`, "i").exec(s))) return ctx.spell ? [{ type: "exileSelfWithTime", n: num(m[1]!) }] : null;
  if (/^Exile ~$/i.test(s) && ctx.spell) return [{ type: "exileSpell" }];
  // Black Sun's Zenith: "Shuffle ~ into its owner's library" as it resolves (CR 608.2n, 701.24c).
  if (/^Shuffle ~ into its owner's library$/i.test(s) && ctx.spell) return [{ type: "shuffleSpell" }];
  // Seasons Past: "Put ~ on the bottom of its owner's library", likewise the resolving spell itself (CR 608.2n).
  if (/^Put ~ on the bottom of its owner's library$/i.test(s) && ctx.spell) return [{ type: "shuffleSpell", bottom: true }];
  // "When ~ dies, shuffle it into its owner's library", "When ~ is put into a graveyard from anywhere, ...": the card where
  // it went. "At the beginning of the end step, ~'s owner shuffles it into their library": the permanent.
  if (ctx.selfCard && /^[Ss]huffle (?:it|~) into its owner's library$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "selfCard" } }];
  // "When ~ dies, put it on top of its owner's library" (Dark Revenant): the card in the graveyard, if it's still there.
  if (ctx.selfCard && (m = /^[Pp]ut (?:it|~) on (top|the bottom) of its owner's library$/.exec(s))) return [{ type: "putInLibrary", what: { ref: "selfCard" }, position: m[1] === "top" ? "top" : "bottom" }];
  // The God-Eternals: "you may put it into its owner's library third from the top"; Enigma Sphinx's "into your library"
  // (it triggers only from its owner's graveyard); Bookwurm's "Put ~ from your graveyard into your library ...".
  if (ctx.selfCard && /^[Pp]ut (?:it|~|her|him) (?:from your graveyard )?into (?:its owner's|her owner's|his owner's|your) library third from the top$/.test(s)) return [{ type: "putInLibrary", what: { ref: "selfCard" }, position: "third" }];
  if (!ctx.spell && !ctx.selfCard && /^~'s owner shuffles (?:it|~) into their library$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "self" } }];
  // "Shuffle target nontoken permanent you control into its owner's library" (Rishadan Pawnshop): it's put into that
  // library, then that library is shuffled (CR 701.24c).
  if ((m = /^[Ss]huffle (target [^,]+?) into its owner's library$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "shuffleIntoLibrary", what }] : null;
  }
  // "The owner of target nonland permanent shuffles it into their library."
  if ((m = /^The owner of (target .+?) shuffles it into their library$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "shuffleIntoLibrary", what }] : null;
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
  if ((ctx.selfCard || ctx.auraCard) && (m = /^[Rr]eturn ~ from your graveyard to (your hand|the battlefield)( tapped)?$/.exec(s))) {
    // An Aura's card only from its controller's graveyard (rulings on Screams from Within).
    const what = { ref: "selfCard" as const, ...(ctx.auraCard ? { moved: true as const, yours: true as const } : {}) };
    return m[1] === "your hand" ? (m[2] ? null : [{ type: "bounce", what }]) : [{ type: "putOntoBattlefield", what, ...(m[2] ? { tapped: true } : {}) }];
  }
  // Dragon Breath: "When a creature with mana value 6 or greater enters, you may return this card from your graveyard
  // to the battlefield attached to that creature."
  // An ability that works only while the card is in your graveyard (Loathsome Troll's rows): "~" is the card there.
  if (ctx.selfCard && ctx.activated && (m = /^(?:Return ~ to (your hand|the battlefield)( tapped)?|Put ~ on top of your library)$/.exec(s)))
    return !m[1] ? [{ type: "putInLibrary", what: { ref: "selfCard" }, position: "top" }] : m[1] === "your hand" ? (m[2] ? null : [{ type: "bounce", what: { ref: "selfCard" } }]) : [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, ...(m[2] ? { tapped: true } : {}) }];
  if (ctx.selfCard && ctx.subject && /^Return ~ from your graveyard to the battlefield attached to that creature$/.test(s))
    return [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, attachToSubject: true }];
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
  // "Return a creature or planeswalker card from your graveyard to your hand" (Takenuma), "return up to two instant
  // and/or sorcery cards ...": chosen as it resolves, not targeted.
  if ((m = /^[Rr]eturn (an?|one|two|three|up to one|up to two|up to three) (.+?) from your graveyard to your hand$/.exec(s)) && !/\b(?:target|other|another|that|those)\b/.test(m[2]!)) {
    const filter = parseSearchFilter(m[2]!.replace(/ and\/or /g, " or "));
    const n = num(m[1]!.replace(/^up to /, "").replace(/^an?$/, "one"));
    if (filter === null || !Number.isInteger(n) || n < 1) return null;
    return [{ type: "chooseFromGraveyard", n, ...(filter ? { filter } : {}), ...(/^up to /.test(m[1]!) ? { upTo: true as const } : {}) }];
  }
  // Ripples of Undeath: "Mill three cards. Then you may pay {1} and 3 life. If you do, put a card from among those cards into
  // your hand": one of the cards just milled, still in your graveyard.
  if (ctx.afterMill && /^[Pp]ut a card from among (?:those cards|them) into your hand$/.test(s)) return [{ type: "chooseFromGraveyard", n: 1, milled: true }];
  // "You may put a land card from your graveyard on top of your library" (Halo-Charged Skaab, after milling): chosen as
  // it resolves, not targeted.
  if ((m = /^(?:[Yy]ou may )?[Pp]ut (an?|one) (.+?) from your graveyard on top of your library$/.exec(s)) && !/\b(?:target|other|another|that|those)\b/.test(m[2]!)) {
    const filter = parseSearchFilter(m[2]!.replace(/ and\/or /g, " or "));
    if (filter === null) return null;
    return [{ type: "chooseFromGraveyard", n: 1, dest: "libraryTop", ...(filter ? { filter } : {}), ...(/^[Yy]ou may /.test(s) ? { upTo: true as const } : {}) }];
  }
  // "Return any number of cards with different mana values from your graveyard to your hand" (Seasons Past): chosen as it
  // resolves (rulings), no two with the same mana value; X in a mana cost is 0 and a card with no mana cost has 0 (CR 202.3).
  if ((m = /^[Rr]eturn any number of (.+?) with different mana values from your graveyard to your hand$/.exec(s)) && !/\b(?:target|other|another|that|those)\b/.test(m[1]!)) {
    const filter = parseSearchFilter(m[1]!.replace(/\bcards\b/, "card").replace(/ and\/or /g, " or "));
    if (filter === null) return null;
    return [{ type: "chooseFromGraveyard", n: 0, upTo: true, distinctManaValues: true, ...(filter ? { filter } : {}) }];
  }
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
  // "... with a number of +1/+1 counters on it equal to that result" (Grave Endeavor): counted as it resolves.
  const counted = new RegExp(`^([Rr]eturn an? .+? from your graveyard to the battlefield(?: tapped)?) with a number of (${COUNTER}) counters on it equal to (.+)$`).exec(s);
  if (counted) {
    const n = parseCount(counted[4]!, ctx); // COUNTER has a group of its own
    const fx = n && parseZonesSentence(`${counted[1]} with a ${counted[2]} counter on it`, ctx);
    return n && fx?.length === 1 && fx[0]!.type === "chooseFromGraveyard" && fx[0]!.counters ? [{ ...fx[0]!, countersN: n }] : null;
  }
  if ((m = new RegExp(`^[Rr]eturn (an?|one|two|up to one|up to two) (.+?) from your graveyard to the battlefield( tapped)?(?: with an? (${COUNTER}) counter on it)?$`).exec(s)) && !/\b(?:target|other|another|that|those|at random)\b/.test(m[2]!)) {
    // "... with mana value X or less ..., where X is the amount of {S} spent to cast this spell" (Blood on the Snow): X
    // as it resolves.
    const mvX = / with mana value X or less$/.exec(m[2]!);
    if (mvX && !ctx.spell && !ctx.activated && !ctx.whereX) return null;
    const filter = parseSearchFilter(m[2]!.slice(0, mvX?.index).replace(/ and\/or /g, " or "));
    const n = num(m[1]!.replace(/^up to /, "").replace(/^an?$/, "one"));
    if (filter === null || !Number.isInteger(n) || n < 1) return null;
    return [{ type: "chooseFromGraveyard", n, dest: "battlefield", ...(filter ? { filter: mvX ? { ...filter, text: `${filter.text} with mana value X or less` } : filter } : {}), ...(mvX ? { mvMax: amt("X") } : {}), ...(/^up to /.test(m[1]!) ? { upTo: true as const } : {}), ...(m[3] ? { tapped: true as const } : {}), ...(m[4] ? { counters: { [counterKind(m[4])]: 1 } } : {}) }];
  }
  // "Target player exiles a card from their graveyard" (Relic of Progenitus), "Exile a card from your graveyard"
  // (Decaying Soil): that player chooses as it resolves.
  if ((m = /^(?:(Target player|Target opponent) exiles|[Ee]xile) (an?|one|two|three) (.+?) from (their|your) graveyard$/.exec(s)) && (m[4] === "their") === !!m[1]) {
    const who = m[1] ? parsePlayer(m[1].toLowerCase(), ctx) : undefined;
    const filter = parseSearchFilter(m[3]!);
    const n = num(m[2]!.replace(/^an?$/, "one"));
    if (who === null || filter === null || !Number.isInteger(n)) return null;
    return [{ type: "chooseFromGraveyard", n, dest: "exile", ...(who ? { who } : {}), ...(filter ? { filter } : {}) }];
  }
  if (/^Put a card chosen at random from your graveyard onto the battlefield if it's a creature card, otherwise exile it$/.test(s)) return [{ type: "randomFromGraveyard", dest: "creatureOrExile" }];
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
  const eachReturns = /^Each player returns each (.+?) card from their graveyard to the battlefield( tapped)?$/.exec(s);
  if (eachReturns) s = `Return all ${eachReturns[1]} cards from all graveyards to the battlefield${eachReturns[2] ?? ""} under their owners' control`;
  // "Put all creature cards from all graveyards onto the battlefield under your control" (Rise of the Dark Realms).
  const yours = /^(?:Put|Return) all (.+?) cards from all graveyards (?:onto|to) the battlefield( tapped)? under your control$/.exec(s);
  if (yours) {
    const spec = parseTargetPhrase(`${yours[1]!.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    if (spec?.kind !== "card" || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { ...spec, text: `${yours[1]} card` }, ...(yours[2] ? { tapped: true } : {}) }];
  }
  if ((m = /^[Rr]eturn all (.+?) cards from (your graveyard|all graveyards) to the battlefield( tapped)?( under their owners' control)?$/.exec(s)) && (m[2] === "your graveyard") === !m[4]) {
    const kinds = m[1]!.replace(/,? and /g, " or ").replace(/, /g, " or ");
    const spec = parseTargetPhrase(`${kinds.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    if (spec?.kind !== "card" || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: m[4] ? "eachPlayer" : "you" }, filter: { ...spec, text: `${m[1]} card` }, ...(m[3] ? { tapped: true } : {}), ...(m[4] ? { owners: true as const } : {}) }];
  }
  // "Return all instant and sorcery cards from your graveyard to your hand" (Wisdom of Ages), "Return all cards from your
  // graveyard to your hand" (Praetor's Counsel).
  if ((m = /^[Rr]eturn all (?:(.+?) )?cards from your graveyard to your hand$/.exec(s))) {
    const kinds = (m[1] ?? "").replace(/,? and /g, " or ").replace(/, /g, " or ");
    const spec = parseTargetPhrase(`${kinds ? `${kinds.split(/\s+/).map(singularWord).join(" ")} ` : ""}card from a graveyard`, { chosen: true });
    if (spec?.kind !== "card") return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { ...spec, text: `${m[1] ? `${m[1]} ` : ""}card` }, toHand: true }];
  }
  // "You may put a land card from your hand onto the battlefield (tapped)".
  // Brainstorm: "put two cards from your hand on top of your library in any order", "put a card from your hand on top
  // of your library".
  if ((m = new RegExp(`^Put (a|${NUM}) cards? from your hand on top of your library( in any order)?$`, "i").exec(s)) && (m[1] === "a" || !!m[2]))
    return [{ type: "handToTop", n: m[1] === "a" ? 1 : num(m[1]!) }];
  // "Draw three cards, then put a card from your hand on the bottom of your library": in any order (CR 401.4).
  if ((m = new RegExp(`^Put (a|${NUM}) cards? from your hand on the bottom of your library( in any order)?$`, "i").exec(s)))
    return [{ type: "handToTop", n: m[1] === "a" ? 1 : num(m[1]!), bottom: true }];
  // "Each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield" (Show and
  // Tell), "each opponent may put a legendary creature card ..." (Iwamori), "any number of ... cards" (Tempting Wurm):
  // chosen in turn order without revealing them, then put there at the same time (see the putFromHand effect). "Then
  // each opponent who didn't draws a card" (Kynaios and Tiro): those who put none.
  if ((m = /^[Ee]ach (player|opponent) may put (a|an|any number of) (.+?) from their hand onto the battlefield( tapped)?$/.exec(s))) {
    const filter = parseSearchFilter(m[3]!.replace(/\band\/or\b/g, "or"));
    if (filter === null) return null;
    const put: Effect = { type: "putFromHand", who: { ref: m[1] === "player" ? "eachPlayer" : "eachOpponent" }, ...(filter ? { filter } : {}), ...(m[4] ? { tapped: true } : {}), may: true, ...(m[2] === "any number of" ? { any: true } : {}) };
    ctx.eachChose = true;
    return [put];
  }
  // "You may put a creature card with mana value X or less from your hand onto the battlefield tapped and attacking"
  // (Kinscaer Sentry): one card, attacking a player its controller chooses (CR 508.4).
  if ((m = /^(You may )?[Pp]ut (a|an|any number of) (.+?) from your hand onto the battlefield( tapped)?( and attacking( that opponent)?)?$/.exec(s))) {
    if (m[5] && m[2] === "any number of") return null;
    // "Tapped and attacking that opponent" (Kaalia of the Vast): the player the trigger's creature attacked.
    if (m[6] && !ctx.defending) return null;
    // "A creature card with lesser power" (Shadowfax): than the source's power (rulings).
    const lesser = / with lesser power$/.exec(m[3]!);
    if (lesser && (ctx.spell || !(ctx.selfIt || ctx.activated))) return null;
    const phrase = lesser ? m[3]!.slice(0, lesser.index) : m[3]!;
    // "A permanent card with mana value less than or equal to that damage" (Covert Technician): counted as it resolves.
    const filter0 = parseSearchFilter(phrase, (t) => parseBoundCount(t, ctx));
    if (filter0 === null) return null;
    const filter = filter0 && lesser ? { ...filter0, text: m[3]! } : filter0;
    return [{ type: "putFromHand", ...(filter ? { filter } : {}), ...(m[4] ? { tapped: true } : {}), ...(m[5] ? { attacking: true } : {}), may: !!m[1] || m[2] === "any number of", ...(m[2] === "any number of" ? { any: true } : {}), ...(lesser ? { lesserPower: true as const } : {}), ...(m[6] ? { attackingEvent: true as const } : {}) }];
  }
  // Imprint: "You may exile a nonartifact, nonland card from your hand" (Chrome Mox), "... an instant card with mana value 2
  // or less ..." (Isochron Scepter): one card of your own hand, chosen as it resolves; linked to the ability that refers
  // to "the exiled card" (CR 607.2a, compile.ts).
  if ((m = /^(You may )?[Ee]xile (?:a|an) (.+? card) from your hand$/.exec(s)) && !ctx.spell) {
    const filter = parseSearchFilter(m[2]!);
    if (filter === null) return null;
    return [{ type: "takeFromHand", who: { ref: "you" }, ...(filter ? { filter } : {}), action: "exile", ...(m[1] ? { optional: true as const } : {}) }];
  }
  if ((m = /^Exile (target player's|target opponent's|each opponent's|all opponents'|all|any number of target players') graveyards?$/i.exec(s))) {
    const w = m[1]!.toLowerCase();
    const who: PlayerRef | null =
      w === "all" ? { ref: "eachPlayer" } : w === "each opponent's" || w === "all opponents'" ? { ref: "eachOpponent" } : parsePlayer(w.replace(/'s?$/, ""), ctx);
    return who ? [{ type: "exileGraveyard", who }] : null;
  }
  if ((m = /^Exile ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ graveyard)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx, true);
    return what ? [{ type: "exile", what }] : null;
  }
  if ((m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ graveyard) to (your|its owner's) hand$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, m[2]!.toLowerCase() === "your" ? "you" : undefined);
    return what ? [{ type: "bounce", what }] : null;
  }
  // "... to the battlefield with an additional +1/+1 counter on it" (Cauldron's Gift): it enters with it (CR 614.1c).
  if ((m = new RegExp(`^(Return|Put) ((?:(?:up to )?(?:one|two|three|four|five|six|\\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ graveyard) (?:to|onto) the battlefield( tapped)?( under your control| under its owner's control)?(?: with (?:an additional|an?) (${COUNTER}) counter on it)?$`, "i").exec(s))) {
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
    if (!what || !spec || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty)) || (m[5] && (what.ref !== "target" || what.n))) return null;
    return [{ type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}), ...(owner ? { owner: true } : {}), ...(m[5] ? { counters: { [counterKind(m[5])]: 1 } } : {}) }];
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
    // No "under ... control": the ability's controller puts it there, so it enters under their control (CR 110.2a).
    if (!m[3] && !flipped) return null;
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
  if ((m = new RegExp(`^(?:Return (that card|it) to|Put (that card) onto) the battlefield( tapped)? under (your|its owner's) control(?: with an additional (\\+1\\/\\+1) counter on it| with an? ${COUNTER} counter on it)?$`, "i").exec(s)) && ctx.subjectLeft) {
    const what = parseObject(m[1] ?? m[2]!, ctx);
    const counter = m[5] ?? m[6];
    return what?.ref === "subjectCard" ? [{ type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}), ...(m[4]!.toLowerCase() === "its owner's" ? { owner: true } : {}), ...(counter ? { counters: { [counterKind(counter)]: 1 } } : {}) }] : null;
  }
  if ((m = /^Put ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ graveyard) on (top|the bottom) of (your|its owner's) library$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, m[3]!.toLowerCase() === "your" ? "you" : undefined);
    return what ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() === "top" ? "top" : "bottom" }] : null;
  }
  // "Target creature's owner puts it on their choice of the top or bottom of their library", "The owner of target
  // nonland permanent puts it ...": one permanent, its owner choosing as it resolves.
  if ((m = /^(?:(target .+?)'s owner|The owner of ((?:up to one (?:other )?)?target .+?)|Its owner) puts it on their choice of the top or bottom of their library$/i.exec(s))) {
    const what = parseObject(m[1] ?? m[2] ?? "it", ctx);
    if (what?.ref !== "target" || (what.n ?? 1) !== 1) return null;
    const spec = ctx.targets[what.index];
    if (!spec || spec.kind !== "object") return null; // a permanent, not a spell or a card in a graveyard
    return [{ type: "putInLibrary", what, position: "ownersChoice" }];
  }
  // "Put target creature into its owner's library second from the top" (Bury in Books), "third from the top" (Teferi,
  // Hero of Dominaria; Shattered Ego's "enchanted creature").
  if ((m = /^Put (target .+?|~|enchanted creature) into its owner's library (second|third) from the top$/i.exec(s)) && !/graveyard$/i.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what && (what.ref === "target" || what.ref === "self" || what.ref === "attached") ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() as "second" | "third" }] : null;
  }
  // "Put target creature on top of its owner's library", "on the bottom of its owner's library" (Excommunicate).
  if ((m = /^Put (target .+?|~) on (top|the bottom) of its owner's library$/i.exec(s)) && !/graveyard$/i.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what && (what.ref === "target" || what.ref === "self") ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() === "top" ? "top" : "bottom" }] : null;
  }
  // "When ~ leaves the battlefield, return the exiled card to the battlefield under its owner's control" (Fiend
  // Hunter): the cards its own exile ability took (CR 607.2a); compile() links the two.
  if ((m = /^Return the exiled (?:card|cards|permanent|permanents|creature|creatures) to (the battlefield under (?:its|their) owners?'s? control|(?:its|their) owners?'s? hands?)$/i.exec(s)) && ctx.selfCard)
    return [{ type: "returnLinked", dest: /^the battlefield/i.test(m[1]!) ? "battlefield" : "hand" }];
  // Parallax Wave: "When ~ leaves the battlefield, each player returns to the battlefield all cards they own exiled with
  // it": the same, the cards its own exile ability took, under their owners' control (CR 607.2a, 610.3).
  if ((m = /^[Ee]ach player returns to (the battlefield|their hand) all cards they own exiled with (?:it|~)$/.exec(s)) && ctx.selfCard)
    return [{ type: "returnLinked", dest: m[1] === "the battlefield" ? "battlefield" : "hand" }];
  // Watcher for Tomorrow: "When ~ leaves the battlefield, put the exiled card into its owner's hand."
  if (/^Put the exiled card into its owner's hand$/i.test(s) && ctx.selfCard) return [{ type: "returnLinked", dest: "hand" }];
  // Hideaway (CR 702.75a): "You may play the exiled card without paying its mana cost", the card its hideaway exiled;
  // "... if each player has no cards in hand": only if that's true as it resolves.
  if ((m = /^You may play the exiled card without paying its mana cost(?: if (.+))?$/.exec(s)) && !ctx.spell) {
    if (!m[1]) return [{ type: "playLinked" }];
    const cond = parseStaticCondition(m[1], { affects: { kind: "self" }, mods: [], text: "" });
    return cond ? [{ type: "if", cond: { kind: "state", cond }, effects: [{ type: "playLinked" }] }] : null;
  }
  // "Exile target creature an opponent controls until ~ leaves the battlefield" (CR 610.3).
  if ((m = /^Exile (target .+|up to one target .+|another target .+) until ~ leaves the battlefield$/i.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "exile", what, until: "sourceLeaves" }] : null;
  }
  // "When ~ enters, create a 1/1 white Soldier creature token, then attach ~ to it." (Ancestral Blade, like living
  // weapon, CR 702.92a): the token just created, or the creature just manifested ("manifest dread, then attach ~ to
  // that creature"). If ~ has left the battlefield, or can't legally be attached, it
  // stays where it is (CR 701.3b).
  if (/^Attach ~ to (?:it|that creature)$/i.test(s) && ctx.lastCreated && !ctx.spell) return [{ type: "attach", what: { ref: "created" } }];
  // Duplicity, Gustha's Scepter: cards exiled face down with ~, and what happens to them later (CR 406.3, 607.2a).
  if (!ctx.spell) {
    if ((m = new RegExp(`^Exile the top ${NUM} cards of your library face down$`, "i").exec(s))) return [{ type: "exileFaceDown", from: "top", n: num(m[1]!) }];
    if (/^Exile all cards from your hand face down$/i.test(s)) return [{ type: "exileFaceDown", from: "hand" }];
    if (/^Exile a card from your hand face down$/i.test(s)) return [{ type: "exileFaceDown", from: "handCard" }];
    if (/^Put all cards exiled with ~ into their owners?'s? graveyards?$/i.test(s)) return [{ type: "moveLinked", dest: "graveyard" }];
    if (/^Put all other cards you own exiled with ~ into your hand$/i.test(s)) return [{ type: "moveLinked", dest: "hand", yours: true, other: true }];
    if (/^Return a card you own exiled with ~ to your hand$/i.test(s)) return [{ type: "moveLinked", dest: "hand", yours: true, one: true }];
  }
  // "Attach target Equipment you control to target creature you control" (Brass Squire), "attach up to one target
  // Equipment you control to ~" (Cloud), "... to that creature" (Kemba: the creature that entered), Magnetic Theft's
  // "Attach target Equipment to target creature" (CR 701.3a). Either target illegal: the Equipment doesn't move (rulings).
  // "Attach target Aura attached to a creature to another creature" (Crown of the Ages, Autumn-Tail): moving an Aura to a
  // creature chosen as it resolves (rulings), not targeted.
  if ((m = /^Attach (target Aura attached to a creature) to another creature$/.exec(s))) {
    const source = parseObject(m[1]!, ctx);
    return source?.ref === "target" && !source.n ? [{ type: "attachElsewhere", source }] : null;
  }
  // "Attach target Aura you control to target creature" (Aura Finesse), "target Aura or Equipment you control" (Codsworth).
  if ((m = /^Attach ((?:up to one )?target (?:Equipment|Aura|Aura or Equipment)\b(?:(?! to )(?! attached to ).)*(?: attached to an? creature(?: you control)?)?) to (~|it|him|her|that creature|(?:up to one |another )?target .+)$/i.exec(s))) {
    const pronoun = !/\btarget\b/i.test(m[2]!);
    if (pronoun && ctx.spell) return null;
    const hostFirst = pronoun ? parseObject(m[2]!, ctx) : null;
    const source = parseObject(m[1]!, ctx);
    const what = hostFirst ?? (pronoun ? null : parseObject(m[2]!, ctx));
    if (source?.ref !== "target" || source.n || !what || (what.ref === "target" && what.n) || !["self", "subject", "target"].includes(what.ref)) return null;
    return [{ type: "attach", what, source }];
  }
  // Stolen Uniform: "Attach it to the chosen creature": the target Equipment to the target creature (CR 701.3a); if
  // either is an illegal target, it doesn't move (rulings).
  if ((m = /^Attach (?:it|that Equipment) to (the chosen creature)$/.exec(s)) && ctx.spell) {
    const source = parseObject("that Equipment", ctx);
    const what = parseObject(m[1]!, ctx);
    return source?.ref === "target" && what?.ref === "target" && source.index !== what.index ? [{ type: "attach", what, source }] : null;
  }
  // "Gain control of target Equipment an opponent controls until end of turn. Attach it to ~." (Ogre Geargrabber)
  if ((m = /^Attach (?:it|that Equipment) to (~|him|her)$/i.exec(s)) && !ctx.spell && ctx.lastObjectTarget !== undefined) {
    const t = ctx.targets[ctx.lastObjectTarget];
    if (t?.kind !== "object" || !t.subtypes?.includes("Equipment")) return null;
    return [{ type: "attach", what: { ref: "self" }, source: { ref: "target", index: ctx.lastObjectTarget } }];
  }
  // "When ~ enters, attach it to target creature you control." (CR 701.3)
  if ((m = /^Attach (?:~|it) to (target .+)$/i.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "attach", what }] : null;
  }
  // "Target creature can't block this turn", "~ can't attack or block this turn", "~ can't be blocked this
  // turn": until the turn ends.
  // "Target creature can't attack until your next turn" ends as your next turn begins (CR 611.2b).
  if ((m = /^Creatures( without flying)? can't block this turn$/.exec(s))) {
    const filter = parseTargetPhrase(m[1] ? "creature without flying" : "creature");
    return filter?.kind === "object" ? [{ type: "cantBlockRule", filter: { ...filter, text: m[1] ? "creatures without flying" : "creatures" } }] : null;
  }
  // "Target creature attacks this turn if able": in each combat this turn (CR 508.1d).
  if ((m = /^(.+?) attacks? (?:each combat )?this turn if able$/i.exec(s)) && !/ and$/.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "attacksIfAble" }], duration: "endOfTurn" }] : null;
  }
  if (/^Creatures can't attack this turn$/.test(s)) return [{ type: "cantAttackRule", filter: { kind: "object", types: ["Creature"], text: "creatures" } }];
  // "Until your next turn, those permanents can't attack or block and their activated abilities can't be activated" (Mythos
  // of Vadrok): what detain does, in words (CR 701.35a); mana abilities too (CR 605.1a).
  if ((m = /^Until your next turn, (.+?) can't attack or block and (?:its|their) activated abilities can't be activated$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "cantAttack" }, { kind: "cantBlock" }, { kind: "cantActivate" }], duration: "yourNextTurn" }] : null;
  }
  // "Until your next turn, those creatures can't block" (Taunt from the Rampart): the same, said first.
  const front = /^Until your next turn, (.+? can't (?:block|attack|attack or block|be blocked))$/.exec(s);
  if (front) s = `${front[1]} until your next turn`;
  if ((m = /^(?!.* until end of turn and )(.+?) can't (block|attack|attack or block|be blocked) (this turn|until your next turn)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods: Modification[] =
      m[2] === "block" ? [{ kind: "cantBlock" }] : m[2] === "attack" ? [{ kind: "cantAttack" }] : m[2] === "be blocked" ? [{ kind: "cantBeBlocked" }] : [{ kind: "cantAttack" }, { kind: "cantBlock" }];
    return what ? [{ type: "continuous", what, mods, duration: m[3] === "this turn" ? "endOfTurn" : "yourNextTurn" }] : null;
  }
  // "~ can't be blocked this turn except by snow creatures" (Rime Transfusion), "can't be blocked by Walls this turn": the
  // static ability's evasion (CR 509.1b), until end of turn.
  if ((m = /^(.+?) can't be blocked (this turn except by .+|by .+? this turn)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && parseStaticMods(`can't be blocked ${m[2]!.replace(/^this turn (except by .+)$/, "$1").replace(/ this turn$/, "")}`);
    return what && mods ? [{ type: "continuous", what, mods, duration: "endOfTurn" }] : null;
  }
  // "Target creature can't be the target of spells or abilities your opponents control this turn" (Vines of Vastwood): the
  // opponents of whoever controls the effect, its spell's controller (rulings on Vines of Vastwood).
  if ((m = /^(.+?) can't be the target of (.+) this turn$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const by = parseUntargetable(m[2]!);
    return what && by ? [{ type: "continuous", what, mods: [{ kind: "untargetable", by }], duration: "endOfTurn" }] : null;
  }
  // Picking your own permanents, not targeted: "sacrifice a creature", "each opponent sacrifices a creature
  // of their choice", "return a land you control to its owner's hand" (CR 701.21).
  // "Return another creature you control to its owner's hand" (Ambush Krotiq): not the source.
  if ((m = /^Return another (?!target )(.+?) you control to its owner's hand$/i.exec(s))) {
    const filter = pickFilter(m[1]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter: { ...filter, notSource: true, text: `other ${filter.text}` }, n: 1, action: "bounce" }];
  }
  if ((m = new RegExp(`^Return ${NUM} (.+?) you control to (?:its|their) owners?'s? hands?$`, "i").exec(s))) {
    const filter = pickFilter(m[2]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: amt(m[1]!), action: "bounce" }];
  }
  // "Each player chooses from among the permanents they control an artifact, a creature, an enchantment, and a land,
  // then sacrifices the rest" (Cataclysm), "... an artifact, a creature, an enchantment, and a planeswalker from among the
  // nonland permanents they control ..." (Cataclysmic Gearhulk), "... up to two creatures they control ..." (Covetous
  // Elegy), "... a land of each basic land type" (Global Ruin), "... a permanent they control of each permanent type"
  // (Liliana, Dreadhorde General). The choices aren't targeted, and are made as it resolves (rulings).
  if ((m = /^(.+?) chooses (.+?),? (?:then|and) sacrifices the rest$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const what = m[2]!;
    let r: RegExpExecArray | null;
    let among: TargetSpec | null = null;
    let list: string | undefined;
    let keep: { filter: TargetSpec; n: number; upTo?: true; fewest?: true }[] | null = null;
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
    } else if ((r = new RegExp(`^(up to )?${NUM} (.+?) they control$`).exec(what))) {
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
    return [{ type: "keepRest", who, keep, among }];
  }
  // "Each opponent sacrifices a creature with the greatest power among creatures they control", "... a creature they
  // control with the greatest power" (Szat's Will), "a creature or planeswalker with the greatest mana value among
  // creatures and planeswalkers they control" (Soul Shatter).
  if ((m = /^(.+?) sacrifices? a creature (?:with the greatest power among creatures (?:they control|that player controls)|they control with the greatest power)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "pick", who, filter: { kind: "object", types: ["Creature"], text: "creature" }, n: 1, action: "sacrifice", greatest: "power" }] : null;
  }
  if ((m = /^(.+?) sacrifices? a creature or planeswalker (?:they control )?with the greatest mana value among creatures and planeswalkers (?:they control|that player controls)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "pick", who, filter: { kind: "object", types: ["Creature", "Planeswalker"], text: "creature or planeswalker" }, n: 1, action: "sacrifice", greatest: "manaValue" }] : null;
  }
  // "Each player sacrifices half the non-God creatures they control of their choice, rounded down" (Zodiark), "sacrifice
  // half the non-Demon permanents you control, rounded up" (Rakdos): each player half of their own, worked out before
  // anyone chooses (rulings on Fraying Omnipotence, CR 107.1a).
  if ((m = /^(?:(.+?) )?[Ss]acrifices? half the (.+?) (you|they|that player) controls?(?: of (?:their|his or her) choice)?(?:, rounded (up|down))?$/.exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : ({ ref: "you" } as const);
    const filter = pickFilter(m[2]!);
    const half = roundOf(m[4], ctx);
    if (!who || !filter || filter.kind !== "object" || !half || (who.ref === "you") !== (m[3] === "you")) return null;
    return [{ type: "pick", who, filter, n: { count: { kind: "permanents", filter, whose: { ref: "eachOne" } }, half }, action: "sacrifice" }];
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
  // "You may sacrifice another creature" (Cavalier of Night): one other than the source (a permanent's ability).
  if ((m = /^[Ss]acrifice another ([a-z][^,]*?)$/.exec(s)) && !ctx.spell) {
    const filter = pickFilter(m[1]!);
    return filter && filter.kind === "object" ? [{ type: "pick", who: { ref: "you" }, filter: { ...filter, notSource: true, text: `other ${filter.text}` }, n: 1, action: "sacrifice" }] : null;
  }
  if ((m = new RegExp(`^(?:(.+?) )?[Ss]acrifices? ${NUM} (.+?)(?: of (?:their|his or her) choice)?(?: unless (?:they pay|that player pays) (.+))?$`).exec(s)) && !/^(~|it|them|that creature)$/i.test(m[3]!)) {
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

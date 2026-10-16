// Sentences that move cards between zones (graveyard, library, exile until it leaves), attach, "can't block this turn", and picking your own permanents.

import type { Effect, Modification, ObjRef, PlayerRef, TargetSpec } from "../../abilities";
import { NUM, COUNTER, amt, counterKind, num, singularWord } from "../words";
import { parseSearchFilter } from "../search";
import { pickFilter, parsePlayer, parseObject, parseTargetPhrase, PERMANENT_TYPES, parseCardTarget } from "../targets";
import { parseUnlessPays, type Ctx } from "../body";
import { parseStaticCondition, parseStaticMods, parseUntargetable } from "../statics";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseZonesSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;
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
  // "When ~ dies, shuffle it into its owner's library", "When ~ is put into a graveyard from anywhere, ...": the card where
  // it went. "At the beginning of the end step, ~'s owner shuffles it into their library": the permanent.
  if (ctx.selfCard && /^[Ss]huffle (?:it|~) into its owner's library$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "selfCard" } }];
  if (!ctx.spell && !ctx.selfCard && /^~'s owner shuffles (?:it|~) into their library$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "self" } }];
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
  if (ctx.selfCard && (m = /^Return ~ from your graveyard to (your hand|the battlefield)( tapped)?$/.exec(s)))
    return m[1] === "your hand" ? (m[2] ? null : [{ type: "bounce", what: { ref: "selfCard" } }]) : [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, ...(m[2] ? { tapped: true } : {}) }];
  // Dragon Breath: "When a creature with mana value 6 or greater enters, you may return this card from your graveyard
  // to the battlefield attached to that creature."
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
  if ((m = /^Return all (.+?) cards from (your graveyard|all graveyards) to the battlefield( tapped)?( under their owners' control)?$/.exec(s)) && (m[2] === "your graveyard") === !m[4]) {
    const kinds = m[1]!.replace(/,? and /g, " or ").replace(/, /g, " or ");
    const spec = parseTargetPhrase(`${kinds.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    if (spec?.kind !== "card" || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: m[4] ? "eachPlayer" : "you" }, filter: { ...spec, text: `${m[1]} card` }, ...(m[3] ? { tapped: true } : {}), ...(m[4] ? { owners: true as const } : {}) }];
  }
  // "You may put a land card from your hand onto the battlefield (tapped)".
  // Brainstorm: "put two cards from your hand on top of your library in any order", "put a card from your hand on top
  // of your library".
  if ((m = new RegExp(`^Put (a|${NUM}) cards? from your hand on top of your library( in any order)?$`, "i").exec(s)) && (m[1] === "a" || !!m[2]))
    return [{ type: "handToTop", n: m[1] === "a" ? 1 : num(m[1]!) }];
  if ((m = /^(You may )?[Pp]ut (a|an|any number of) (.+?) from your hand onto the battlefield( tapped)?$/.exec(s))) {
    const filter = parseSearchFilter(m[3]!);
    if (filter === null) return null;
    return [{ type: "putFromHand", ...(filter ? { filter } : {}), ...(m[4] ? { tapped: true } : {}), may: !!m[1] || m[2] === "any number of", ...(m[2] === "any number of" ? { any: true } : {}) }];
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
  if ((m = new RegExp(`^(Return|Put) ((?:(?:up to )?(?:one|two|three|four|five|six|\\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ graveyard) (?:to|onto) the battlefield( tapped)?( under your control)?(?: with (?:an additional|a) (${COUNTER}) counter on it)?$`, "i").exec(s))) {
    // Without "under your control", only your own cards: the card then enters under your control (CR 110.2a)
    // either way, but "return" text that reaches other graveyards always says whose control.
    const underYou = !!m[4];
    if (m[1]!.toLowerCase() === "put" && !underYou) return null;
    const i = ctx.targets.length;
    const what = parseCardTarget(m[2]!, ctx, underYou ? undefined : "you");
    const spec = ctx.targets[i];
    // Only permanent cards can be put onto the battlefield (CR 110.4b); an Aura's controller chooses what it enchants as it
    // enters (CR 303.4f).
    if (!what || !spec || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty)) || (m[5] && (what.ref !== "target" || what.n))) return null;
    return [{ type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}), ...(m[5] ? { counters: { [counterKind(m[5])]: 1 } } : {}) }];
  }
  // "When this creature dies, return it to the battlefield under its owner's control and suspect it" (Presumed Dead's
  // granted ability): the card that went to the graveyard, if it's still there (CR 400.7), and then the permanent it
  // became (CR 701.60a).
  // "Return it to the battlefield tapped under its owner's control" (Supernatural Stamina, Fungal Fortitude), "... with a
  // +1/+1 counter on it" (Undying Malice; it enters with it, CR 614.1c).
  if (ctx.selfCard && (m = new RegExp(`^[Rr]eturn (?:it|~) to the battlefield( tapped)? under (your|its owner's) control(?: with ${NUM} ${COUNTER} counters? on it)?( and suspect it)?$`).exec(s)))
    return [
      { type: "putOntoBattlefield", what: { ref: "selfCard" }, ...(m[1] ? { tapped: true } : {}), ...(m[2] === "its owner's" ? { owner: true } : {}), ...(m[3] ? { counters: { [counterKind(m[4]!)]: num(m[3]) } } : {}) },
      ...(m[5] ? [{ type: "suspect" as const, what: { ref: "created" as const } }] : []),
    ];
  // "When enchanted creature dies, return that card to the battlefield under your control" (False Demise): the card
  // that went to the graveyard, if it's still there (CR 400.7); a token is gone (CR 111.7).
  if ((m = /^Return (that card|it) to the battlefield( tapped)? under (your|its owner's) control$/i.exec(s)) && ctx.subjectLeft) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "subjectCard" ? [{ type: "putOntoBattlefield", what, ...(m[2] ? { tapped: true } : {}), ...(m[3]!.toLowerCase() === "its owner's" ? { owner: true } : {}) }] : null;
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
  // "Put target creature into its owner's library second from the top" (Bury in Books).
  if ((m = /^Put (target .+?|~) into its owner's library second from the top$/i.exec(s)) && !/graveyard$/i.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what && (what.ref === "target" || what.ref === "self") ? [{ type: "putInLibrary", what, position: "second" }] : null;
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
  // "Each opponent sacrifices a creature with the greatest power among creatures they control", "... a creature they
  // control with the greatest power" (Szat's Will).
  if ((m = /^(.+?) sacrifices? a creature (?:with the greatest power among creatures (?:they control|that player controls)|they control with the greatest power)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "pick", who, filter: { kind: "object", types: ["Creature"], text: "creature" }, n: 1, action: "sacrifice", greatest: "power" }] : null;
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

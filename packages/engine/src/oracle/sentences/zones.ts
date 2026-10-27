// Sentences that move cards between zones (graveyard, library, exile until it leaves), attach, "can't block this turn", and picking your own permanents.

import type { Effect, Modification, ObjRef, PlayerRef, TargetSpec } from "../../abilities";
import { NUM, NUMX, COUNTER, BASIC_TYPES, amt, capital, counterKind, num, singularWord } from "../words";
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
export function parseZonesSentence(s0: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;
  // "Return from your graveyard to the battlefield any number of target creature cards ..." (Agadeem's Awakening): the
  // same as "Return any number of target creature cards ... from your graveyard to the battlefield".
  const fromYard = /^Return from your graveyard to the battlefield (any number of target .+)$/.exec(s0);
  let s = fromYard ? `Return ${fromYard[1]} from your graveyard to the battlefield` : s0;
  // Narset's Reversal: "Copy target instant or sorcery spell, then return it to its owner's hand": it leaves the stack
  // without being countered, so even a spell that can't be countered goes (rulings).
  if (/^(?:Then )?[Rr]eturn (?:it|that spell) to its owner's hand$/.test(s) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "spell")
    return ctx.targets[ctx.lastObjectTarget]!.stackAbilities ? null : [{ type: "counterSpell", index: ctx.lastObjectTarget, bounce: true }];
  // Nicol Bolas, the Arisen: "Exile all but the bottom card of target player's library": the top cards, as many as there
  // are less one.
  if ((m = /^Exile all but the bottom card of (target player|target opponent)'s library$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "exileTop", who, n: { count: { kind: "cardsInLibrary", who: { ref: "eachOne" } }, plus: -1 } }] : null;
  }
  // Doomsday Excruciator: "each player exiles all but the bottom six cards of their library face down": each their own top
  // cards, none with six or fewer (rulings); nobody may look at them (CR 406.3).
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
  // Court of Locthwain: "until end of turn, you may cast a spell from among cards exiled with ~ without paying its mana
  // cost": one spell, from the cards its linked exile took (compile.ts links it, CR 607.2a).
  // Idol of Endurance: "... a creature spell from among ...": only a spell of that kind.
  // (A leading "Until end of turn," comes here as a trailing one.)
  if ((m = /^(?:[Uu]ntil end of turn, you|You) may cast an? (?:([a-z]+(?: or [a-z]+)?) )?spell from among cards exiled with ~ without paying its mana cost(?<until> until end of turn)?$/.exec(s)) && (m.groups?.until !== undefined) === /^You/.test(s)) {
    const filter = m[1] ? parseSearchFilter(`${m[1]} card`) : undefined;
    if (filter === null || (m[1] && !filter)) return null;
    return [{ type: "castLinkedFree", ...(filter ? { filter } : {}) }];
  }
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
  // "Reveal any number of red cards in your hand" (Scent of Cinder), "Reveal any number of Dragon cards from your hand"
  // (Invasion of Tarkir): which ones is chosen as it resolves (Effect revealFromHand).
  if ((m = /^[Rr]eveal any number of (?:(.+?) )?cards (?:in|from) your hand$/.exec(s))) {
    const filter = m[1] ? parseSearchFilter(`${m[1]} card`) : undefined;
    if (filter === null || (m[1] && !filter)) return null;
    ctx.revealedFromHand = true;
    return [{ type: "revealFromHand", ...(filter ? { filter } : {}) }];
  }
  // Parley: "Each player reveals the top card of their library." Then "For each nonland card revealed this way, you create
  // a Treasure token" is "create a Treasure token for each nonland card revealed this way" (Selvala's "add {G} and you gain
  // 1 life" is split in parseBody).
  if (/^[Ee]ach player reveals the top card of their library$/.test(s)) {
    ctx.parley = true;
    return [{ type: "parleyReveal" }];
  }
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
  // "Return to their owners' hands all creatures with ..." (Engulf the Shore), "Return to the battlefield target ... card in
  // your graveyard" (Squirming Emergence): the destination first, for a long object; the same instruction.
  if ((m = /^Return to (their owners' hands|its owner's hand|the battlefield) ((?:all|each|target) .+)$/.exec(s))) return parseSentence(`Return ${m[2]!} to ${m[1]!}`, ctx);
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

  // Tevesh Szat: "Put all commanders from the command zone onto the battlefield under your control."
  if (/^Put all commanders from the command zone onto the battlefield under your control$/.test(s)) return [{ type: "commandersOntoBattlefield" }];
  // "Manifest the top card of that player's library" (Orochi Soul-Reaver): their card, onto the battlefield face down under
  // your control (CR 701.40a); its owner is still that player.
  if ((m = /^Manifest the top card of (that player's) library$/i.exec(s))) {
    const library = parsePlayer(m[1]!.replace(/'s$/, ""), ctx);
    return library && library.ref !== "you" ? [{ type: "dig", n: 1, count: 1, upTo: false, required: true, into: "manifest", rest: "graveyard", reveal: false, library }] : null;
  }
  // "Up to two target players each manifest two cards from their hands" (Kozilek, the Broken Reality): each chooses that
  // many cards from their hand (all of them with fewer, rulings), and they're put onto the battlefield face down
  // (CR 701.40a). "For each card manifested this way" counts them.
  // "Manifest a card from your hand" (Scroll of Fate): you.
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
  // Coastal Wizard: "Return ~ and another target creature to their owners' hands": the same way, ~ staying if the target
  // is illegal and the ability doesn't resolve (CR 608.2b). Wizard Mentor: "Return ~ and target creature you control to
  // their owner's hand" (it can target itself, rulings: it's returned once).
  if ((m = /^Return ~ and ((?:another )?target [^,]+?) to their (?:owners' hands|owner's hand)$/.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "bounce", what: { ref: "self" } }, { type: "bounce", what }] : null;
  }
  // Black Sun's Zenith: "Shuffle ~ into its owner's library" as it resolves (CR 608.2n, 701.24c).
  if (/^Shuffle ~ into its owner's library$/i.test(s) && ctx.spell) return [{ type: "shuffleSpell" }];
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
  // The God-Eternals: "you may put it into its owner's library third from the top"; Enigma Sphinx's "into your library"
  // (it triggers only from its owner's graveyard); Bookwurm's "Put ~ from your graveyard into your library ...".
  // Gandalf, White Rider: "fifth from the top".
  if (ctx.selfCard && (m = /^[Pp]ut (?:it|~|her|him) (?:from your graveyard )?into (?:its owner's|her owner's|his owner's|~'s owner's|your) library (third|fifth) from the top$/.exec(s))) return [{ type: "putInLibrary", what: { ref: "selfCard" }, position: m[1] as "third" | "fifth" }];
  if (!ctx.spell && !ctx.selfCard && /^~'s owner shuffles (?:it|~) into their library$/.test(s)) return [{ type: "shuffleIntoLibrary", what: { ref: "self" } }];
  // "Shuffle target nontoken permanent you control into its owner's library" (Rishadan Pawnshop): it's put into that
  // library, then that library is shuffled (CR 701.24c).
  if ((m = /^[Ss]huffle (target [^,]+?) into its owner's library$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "shuffleIntoLibrary", what }] : null;
  }
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
  // Turn the Earth: "Choose up to three target cards in graveyards. The owners of those cards shuffle them into their
  // libraries." (body.ts reads it as this): each card into its owner's library, each library shuffled once (rulings, CR
  // 701.24c).
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
  if ((m = /^The owner of (target .+?) shuffles it into their library$/i.exec(s) ?? /^([Tt]arget [a-z ]+?)'s owner shuffles it into their library$/.exec(s))) {
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
  // Persistent Marshstalker: "return ~ from your graveyard to the battlefield tapped and attacking" (attacking what its
  // controller chooses, CR 508.4).
  // Phoenix Chick: "... tapped and attacking with a +1/+1 counter on it" (it enters with it, CR 614.1c).
  // Retrofitted Transmogrant: "{3}{B}: Return ~ from your graveyard to the battlefield tapped with two +1/+1 counters on it".
  // Relentless X-ATM092: "... tapped with a finality counter on it" (CR 122.1h).
  if ((ctx.selfCard || ctx.auraCard) && (m = /^[Rr]eturn ~ from your graveyard to (your hand|the battlefield)( tapped)?( and attacking)?( with (a|two|three) (\+1\/\+1|finality) counters? on it)?$/.exec(s))) {
    // An Aura's card only from its controller's graveyard (rulings on Screams from Within).
    const what = { ref: "selfCard" as const, ...(ctx.auraCard ? { moved: true as const, yours: true as const } : {}) };
    if ((m[3] || m[4]) && (m[1] === "your hand" || ctx.auraCard)) return null;
    if (m[3] && !m[2]) return null;
    return m[1] === "your hand" ? (m[2] ? null : [{ type: "bounce", what }]) : [{ type: "putOntoBattlefield", what, ...(m[2] ? { tapped: true } : {}), ...(m[3] ? { attacking: true as const } : {}), ...(m[4] ? { counters: { [m[6]!]: num(m[5]!) } } : {}) }];
  }
  // Narcomoeba: "When ~ is put into your graveyard from your library, you may put it onto the battlefield": the card,
  // if it's still there (CR 400.7).
  if (ctx.selfCard && !ctx.activated && /^[Pp]ut (?:it|~) onto the battlefield$/.test(s)) return [{ type: "putOntoBattlefield", what: { ref: "selfCard" } }];
  // Dragon Breath: "When a creature with mana value 6 or greater enters, you may return this card from your graveyard
  // to the battlefield attached to that creature."
  // An ability that works only while the card is in your graveyard (Loathsome Troll's rows): "~" is the card there.
  if (ctx.selfCard && ctx.activated && (m = /^(?:Return ~ to (your hand|the battlefield)( tapped)?|Put ~ (?:from your graveyard )?on top of your library)$/.exec(s)))
    return !m[1] ? [{ type: "putInLibrary", what: { ref: "selfCard" }, position: "top" }] : m[1] === "your hand" ? (m[2] ? null : [{ type: "bounce", what: { ref: "selfCard" } }]) : [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, ...(m[2] ? { tapped: true } : {}) }];
  // Gryff's Boon: "{3}{W}: Return ~ from your graveyard to the battlefield attached to target creature": the target, which
  // the ability targets (the Aura isn't cast, so it targets nothing itself, CR 303.4f); with that creature an illegal
  // target, the ability doesn't resolve and the card stays (rulings).
  if (ctx.selfCard && ctx.activated && /^Return ~ from your graveyard to the battlefield attached to target creature$/.test(s)) {
    const attachToTarget = ctx.targets.length;
    const what = parseObject("target creature", ctx);
    return what?.ref === "target" ? [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, attachToTarget }] : null;
  }
  if (ctx.selfCard && ctx.subject && /^Return ~ from your graveyard to the battlefield attached to that creature$/.test(s))
    return [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, attachToSubject: true }];
  // Sword of the Meek: "Return ~ from your graveyard to the battlefield, then attach it to that creature": it returns,
  // then the Equipment is attached if it can be (CR 701.3b); it stays unattached otherwise (rulings).
  if (ctx.selfCard && ctx.subject && /^Return ~ from your graveyard to the battlefield and then attach it to that creature$/.test(s))
    return [{ type: "putOntoBattlefield", what: { ref: "selfCard" } }, { type: "attach", what: { ref: "subject" }, source: { ref: "created" }, equipmentOnly: true }];
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
  // Tomb Tyrant: "Return a Zombie creature card at random from your graveyard to the battlefield": a creature card, so a
  // permanent card (CR 110.4b).
  if ((m = /^[Rr]eturn an? (.+? creature card) at random from your graveyard to the battlefield$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter?.types?.includes("Creature") ? [{ type: "randomFromGraveyard", dest: "battlefield", filter }] : null;
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
  // Echoing Return: "Return target creature card and all other cards with the same name as that card from your graveyard to
  // your hand": all at once; nothing if the target is gone (rulings).
  if ((m = /^Return (target .+? card) and all other cards with the same name as that card from your graveyard to your hand$/.exec(s))) {
    const fx = parseZonesSentence(`Return ${m[1]} from your graveyard to your hand`, ctx);
    const one = fx?.length === 1 ? fx[0] : undefined;
    if (one?.type !== "bounce" || one.what.ref !== "target") return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { kind: "card", text: "card with the same name as that card" }, toHand: true, sameNameAs: one.what.index }];
  }
  // Visions of Dread: "Target opponent puts a creature card of their choice from their graveyard onto the battlefield under
  // your control": that player chooses one of their own as it resolves, not targeted; it enters under your control.
  if ((m = /^(Target opponent|Target player) puts an? (creature card) of their choice from their graveyard onto the battlefield under your control$/.exec(s))) {
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
  // "Return X creature cards from your graveyard to the battlefield", after "sacrifice any number of ..." (Lich-Knights'
  // Conquest): that many, chosen as it resolves.
  if ((m = /^[Rr]eturn X (creature cards) from your graveyard to the battlefield$/.exec(s))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? [{ type: "chooseFromGraveyard", n: 1, nAmount: amt("X"), dest: "battlefield", filter }] : null;
  }
  if ((m = new RegExp(`^[Rr]eturn (an?|one|two|up to one|up to two) (.+?) from your graveyard to the battlefield( tapped)?(?: with an? (${COUNTER}) counter on it)?$`).exec(s)) && !/\b(?:target|other|another|that|those|at random)\b/.test(m[2]!)) {
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
    const n = num(m[1]!.replace(/^up to /, "").replace(/^an?$/, "one"));
    if (filter === null || !Number.isInteger(n) || n < 1) return null;
    if (ofChosen && !filter?.types?.includes("Creature")) return null;
    if (total && (!filter || n < 2)) return null;
    return [{ type: "chooseFromGraveyard", n, dest: "battlefield", ...(total ? { totalMv: Number(total[1]) } : {}), ...(filter ? { filter: mvX ? { ...filter, text: `${filter.text} with mana value X or less` } : filter } : {}), ...(mvX ? { mvMax: amt("X") } : {}), ...(/^up to /.test(m[1]!) ? { upTo: true as const } : {}), ...(m[3] ? { tapped: true as const } : {}), ...(m[4] ? { counters: { [counterKind(m[4])]: 1 } } : {}) }];
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
  // "Put all creature cards from all graveyards onto the battlefield under your control" (Rise of the Dark Realms).
  const yours = /^(?:Put|Return) all (.+?) cards from all graveyards (?:onto|to) the battlefield( tapped)? under your control$/.exec(s);
  if (yours) {
    const spec = parseTargetPhrase(`${yours[1]!.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    if (spec?.kind !== "card" || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    return [{ type: "returnAllFromGraveyard", who: { ref: "eachPlayer" }, filter: { ...spec, text: `${yours[1]} card` }, ...(yours[2] ? { tapped: true } : {}) }];
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
    if (spec?.kind !== "card" || !spec.types?.length || spec.types.some((ty) => !PERMANENT_TYPES.includes(ty))) return null;
    if (withX && !withN && (spec.xRange?.key !== "manaValue" || spec.xRange.at !== (exactX ? "exact" : "most") || !ctx.spell)) return null;
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
  if ((m = /^[Ee]ach (player|opponent) may put (a|an|any number of) (.+?) from their hand onto the battlefield( tapped)?$/.exec(s))) {
    const filter = parseSearchFilter(m[3]!.replace(/\band\/or\b/g, "or"));
    if (filter === null) return null;
    const put: Effect = { type: "putFromHand", who: { ref: m[1] === "player" ? "eachPlayer" : "eachOpponent" }, ...(filter ? { filter } : {}), ...(m[4] ? { tapped: true } : {}), may: true, ...(m[2] === "any number of" ? { any: true } : {}) };
    ctx.eachChose = true;
    return [put];
  }
  // Pendant of Prosperity: "~'s owner may put a land card from their hand onto the battlefield": that player chooses.
  // Braids, Conjurer Adept: "At the beginning of each player's upkeep, that player may put an artifact, creature, or land
  // card from their hand onto the battlefield": the player whose upkeep it is, under their control.
  if ((m = /^(~'s owner|[Tt]hat player) may put (a|an) (.+?) from their hand onto the battlefield( tapped)?$/.exec(s))) {
    const who = parsePlayer(m[1]!.replace(/^T/, "t"), ctx);
    const filter = parseSearchFilter(m[3]!.replace(/\band\/or\b/g, "or"));
    if (!who || filter === null) return null;
    return [{ type: "putFromHand", who, ...(filter ? { filter } : {}), ...(m[4] ? { tapped: true } : {}), may: true }];
  }
  // "You may put a creature card with mana value X or less from your hand onto the battlefield tapped and attacking"
  // (Kinscaer Sentry): one card, attacking a player its controller chooses (CR 508.4).
  // "Put up to seven permanent cards from your hand onto the battlefield" (Ugin, the Spirit Dragon), "you may put up to
  // two creature cards ..." (Smuggler's Surprise): any number of them up to that many.
  // "Put up to X land cards from your hand and/or graveyard onto the battlefield tapped" (Worldsoul's Rage): from either zone.
  if ((m = /^(?:You may )?[Pp]ut up to (two|three|four|five|six|seven|X) (.+?) cards from your hand( and\/or graveyard)? onto the battlefield( tapped)?$/.exec(s))) {
    const filter = parseSearchFilter(`${m[2]!} card`);
    if (filter === null) return null;
    return [{ type: "putFromHand", ...(filter ? { filter } : {}), may: true, any: true, upTo: m[1] === "X" ? amt("X") : num(m[1]!), ...(m[3] ? { orGraveyard: true as const } : {}), ...(m[4] ? { tapped: true } : {}) }];
  }
  // "You may put a land card from your hand or graveyard onto the battlefield" (Bonny Pall): one card, from either zone.
  // "... with a finality counter on it" (Kastral, the Windcrested): it enters with that counter (CR 122.6).
  const finality = / with a finality counter on it$/.test(s);
  // "You may put an Aura or Equipment card from your hand or graveyard onto the battlefield attached to ~" (Danitha,
  // Benalia's Hope): only to the source permanent (see Effect putFromHand's `attachToSelf`).
  const toSelf = / attached to ~$/.test(s);
  // "You may put a creature card from your hand onto the battlefield and attach ~ to it" (Deathrender): the Equipment to
  // the creature it became, if it can equip it (rulings).
  const attachSelf = / and attach ~ to it$/.test(s);
  if ((m = /^(You may )?[Pp]ut (a|an|any number of) (.+?) from your hand( or graveyard)? onto the battlefield( tapped)?( and attacking( that opponent)?)?$/.exec(finality ? s.replace(/ with a finality counter on it$/, "") : toSelf ? s.replace(/ attached to ~$/, "") : attachSelf ? s.replace(/ and attach ~ to it$/, "") : s))) {
    const orYard = !!m[4];
    if (toSelf && (ctx.spell || m[2] === "any number of" || m[5] || m[6])) return null;
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
    const equal = / with equal or lesser mana value$/.exec(m[3]!);
    if (equal && !ctx.subjectIt) return null;
    const phrase = lesser ? m[3]!.slice(0, lesser.index) : equal ? `${m[3]!.slice(0, equal.index)} with mana value less than or equal to that permanent's mana value` : m[3]!;
    // "A permanent card with mana value less than or equal to that damage" (Covert Technician): counted as it resolves.
    const filter0 = parseSearchFilter(phrase, (t) => parseBoundCount(t, ctx));
    if (filter0 === null) return null;
    const filter = filter0 && (lesser || equal) ? { ...filter0, text: m[3]! } : filter0;
    return [{ type: "putFromHand", ...(filter ? { filter } : {}), ...(m[4] ? { tapped: true } : {}), ...(m[5] ? { attacking: true } : {}), may: !!m[1] || m[2] === "any number of", ...(m[2] === "any number of" ? { any: true } : {}), ...(lesser ? { lesserPower: true as const } : {}), ...(m[6] ? { attackingEvent: true as const } : {}), ...(orYard ? { orGraveyard: true as const } : {}), ...(finality ? { counters: { finality: 1 } } : {}), ...(toSelf ? { attachToSelf: true as const } : {}), ...(attachSelf ? { attachSelf: true as const } : {}) }];
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
  // Identity Crisis: "Exile all cards from target player's hand and graveyard."
  if ((m = /^Exile all cards from (target player's|target opponent's) hand and graveyard$/.exec(s))) {
    const who = parsePlayer(m[1]!.replace(/'s$/, ""), ctx);
    return who ? [{ type: "exileGraveyard", who, hand: true }] : null;
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
  const theirs = /^(Target player|Target opponent) exiles all (.+?) from their graveyard$/.exec(s);
  const all = theirs ? { what: theirs[2]!, whose: `${theirs[1]!.toLowerCase()}'s` } : (m = /^[Ee]xile all (.+?) from (target player's|target opponent's|each opponent's|your|all) graveyards?$/.exec(s)) && { what: m[1]!, whose: m[2]! };
  if (all) {
    const flashback = all.what === "cards with flashback";
    const kind = /^(.+?) cards$/.exec(all.what);
    // "All cards": the whole graveyard.
    const filter = flashback || all.what === "cards" ? undefined : kind ? parseSearchFilter(`${kind[1]} card`) : null;
    const w = all.whose;
    const who: PlayerRef | null = w === "all" ? { ref: "eachPlayer" } : w === "each opponent's" ? { ref: "eachOpponent" } : w === "your" ? { ref: "you" } : parsePlayer(w.replace(/'s$/, ""), ctx);
    return filter !== null && who ? [{ type: "exileGraveyard", who, ...(filter ? { filter } : {}), ...(flashback ? { withFlashback: true as const } : {}) }] : null;
  }
  if ((m = /^Exile ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ graveyards?(?: that was put there (?:from anywhere )?this turn)?)$/i.exec(s))) {
    // "Creatures from the battlefield and/or creature cards from graveyards" (Angel of Serenity): permanents or cards.
    const what = parseObject(m[1]!, ctx, !/ from the battlefield and\/or /.test(m[1]!));
    return what ? [{ type: "exile", what }] : null;
  }
  if ((m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ graveyard(?: that was put there (?:from anywhere |from the battlefield )?this turn)?) to (your|its owner's) hand$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, m[2]!.toLowerCase() === "your" ? "you" : undefined);
    return what ? [{ type: "bounce", what }] : null;
  }
  // Bronzebeak Foragers: "Put target card with mana value X exiled with ~ into its owner's graveyard": a card its exile
  // ability exiled (CR 607.2a), with the X it's activated with.
  if ((m = /^Put (target (?:[a-z]+ )?card(?: with mana value X)? exiled with ~) into its owner's graveyard$/.exec(s))) {
    const i = ctx.targets.length;
    const what = parseCardTarget(m[1]!, ctx);
    return what?.ref === "target" && ctx.targets[i]?.linkedExile ? [{ type: "putInGraveyard", what }] : null;
  }
  // "... to the battlefield with an additional +1/+1 counter on it" (Cauldron's Gift): it enters with it (CR 614.1c).
  if ((m = new RegExp(`^(Return|Put) ((?:(?:up to )?(?:one|two|three|four|five|six|\\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+ (?:graveyards?(?: that was (?:put there from their library|milled) this turn| that (?:was|were) put there from the battlefield this turn)?|exiled with ~)) (?:to|onto) the battlefield( tapped(?: and attacking)?)?( under your control| under its owner's control)?(?: with (an additional|an?|two additional|three additional) (${COUNTER}) counters? on it)?( attached to enchanted creature| attached to that creature)?$`, "i").exec(s))) {
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
    const before = ctx.targets[i - 1];
    if (toThat && !(i === 1 && before?.kind === "card" && before.owner === "you" && before.types?.length === 1 && before.types[0] === "Creature" && !before.many && !before.optional)) return null;
    // "Target Saga card" (Rydia, Summoner of Mist): an enchantment subtype (CR 205.3h), and a Saga isn't an Aura.
    // "Target Cave card" (Glimpse the Core): a land subtype (CR 205.3i).
    const artifactSub = !spec?.types?.length && !!spec?.subtypes?.length && spec.subtypes.every((st) => st === "Equipment" || st === "Vehicle" || st === "Saga" || st === "Cave" || st === "Desert" || st === "Gate" || (attach && st === "Aura"));
    // "Target artifact creature card" (Scarecrone): every one of its types (allTypes) is a permanent type.
    const types = spec?.types?.length ? spec.types : spec?.allTypes ?? [];
    if (!what || !spec || (!artifactSub && (!types.length || types.some((ty) => !PERMANENT_TYPES.includes(ty)))) || (m[6] && (what.ref !== "target" || (what.n && m[5]?.toLowerCase() !== "an additional")))) return null;
    // Attached to the creature an Aura's own ability is about: only from an Aura (compile checks it enchants a creature).
    if (attach && (!spec.subtypes?.length || spec.types?.length || m[3] || m[4] || m[6])) return null;
    // Aberrant Return: one, two, or three target cards, each "with an additional -1/-1 counter on it".
    // "With two additional +1/+1 counters on it" (The Darkness Crystal): it enters with them (CR 614.1c).
    const n = m[5] ? ({ "two additional": 2, "three additional": 3 } as Record<string, number>)[m[5].toLowerCase()] ?? 1 : 0;
    // "Tapped and attacking" (Alesha, Yore-Tiller Nephilim): attacking what its controller chooses (CR 508.4, rulings).
    const attacking = / and attacking$/.test(m[3] ?? "");
    if (attacking && (m[4] || attach)) return null;
    return [{ type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}), ...(attacking ? { attacking: true as const } : {}), ...(owner ? { owner: true } : {}), ...(m[6] ? { counters: { [counterKind(m[6])]: n } } : {}), ...(attach ? (toThat ? { attachToCreated: true as const } : { attachToEnchanted: true as const }) : {}) }];
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
  if ((m = new RegExp(`^(?:Return (that card|it) to|Put (that card) onto) the battlefield( tapped)?(?: under (your|its owner's) control)?(?: with an additional (\\+1\\/\\+1) counter on it| with an? ${COUNTER} counter on it)?( and attach ~ to it)?$`, "i").exec(s)) && ctx.subjectLeft && !(m[7] && ctx.spell)) {
    // Nim Deathmantle: "return that card to the battlefield and attach ~ to it": the permanent it became (CR 701.3).
    const what = parseObject(m[1] ?? m[2]!, ctx);
    const counter = m[5] ?? m[6];
    return what?.ref === "subjectCard" ? [{ type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}), ...(m[4]?.toLowerCase() === "its owner's" ? { owner: true } : {}), ...(counter ? { counters: { [counterKind(counter)]: 1 } } : {}), ...(m[7] ? { attachSelf: true as const } : {}) }] : null;
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
  // "Target creature's owner puts it on their choice of the top or bottom of their library", "The owner of target
  // nonland permanent puts it ...": one permanent, its owner choosing as it resolves.
  if ((m = /^(?:(target .+?)'s owner|The owner of ((?:up to one (?:other )?)?target .+?)|Its owner) puts it (on their choice of the top or bottom of their library|into their library second from the top or on the bottom)$/i.exec(s))) {
    // Subtlety: "up to one target creature or planeswalker spell": one spell, or none (CR 115.6, 601.2c).
    const spellUpTo = m[2] && /^up to one target (.+ spell)$/.exec(m[2]);
    const spellSpec = spellUpTo ? parseTargetPhrase(spellUpTo[1]!) : undefined;
    // Temporal Cleansing: "puts it into their library second from the top or on the bottom", a permanent only.
    const second = /second from the top/.test(m[3]!);
    if (second && (m[1] || spellUpTo)) return null;
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
  if ((m = /^Put (target [a-z ]+?) into its owner's library just beneath the top X cards of that library$/.exec(s)) && ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "putInLibrary", what, position: "top", beneath: amt("X") }] : null;
  }
  // Mortuary: "Whenever a creature is put into your graveyard from the battlefield, put that card on top of your
  // library": the card, if it's still in your graveyard (CR 400.7); yours, so its owner's library.
  if (/^[Pp]ut that card on top of your library$/.test(s) && ctx.subjectLeft) {
    const what = parseObject("that card", ctx);
    return what?.ref === "subjectCard" ? [{ type: "putInLibrary", what, position: "top" }] : null;
  }
  // Tel-Jilad Stylus: "Put target permanent you own on the bottom of your library": its owner's library is yours.
  if ((m = /^Put (target [a-z ]+ you own) on (top|the bottom) of your library$/i.exec(s))) return parseSentence(`Put ${m[1]} on ${m[2]} of its owner's library`, ctx);
  // "Put target creature on top of its owner's library", "on the bottom of its owner's library" (Excommunicate).
  // Elven Warhounds: "Whenever ~ becomes blocked by a creature, put that creature on top of its owner's library": the
  // trigger's subject.
  if ((m = /^Put (target .+?|~|that creature) on (top|the bottom) of its owner's library$/i.exec(s)) && !/graveyard$/i.test(m[1]!) && (m[1] !== "that creature" || (ctx.subject && ctx.lastObjectTarget === undefined))) {
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
  if ((m = /^Return the exiled (?:card|cards|permanent|permanents|creature|creatures) to (the battlefield under (?:its|their) owners?'s? control|(?:its|their) owners?'s? hands?)$/i.exec(s)) && ctx.selfCard)
    return [{ type: "returnLinked", dest: /^the battlefield/i.test(m[1]!) ? "battlefield" : "hand" }];
  // Parallax Wave: "When ~ leaves the battlefield, each player returns to the battlefield all cards they own exiled with
  // it": the same, the cards its own exile ability took, under their owners' control (CR 607.2a, 610.3).
  if ((m = /^[Ee]ach player returns to (the battlefield|their hand) all cards they own exiled with (?:it|~)$/.exec(s)) && ctx.selfCard)
    return [{ type: "returnLinked", dest: m[1] === "the battlefield" ? "battlefield" : "hand" }];
  // Admonition Angel: "When ~ leaves the battlefield, return all cards exiled with it to the battlefield under their owners'
  // control": the same.
  if (/^[Rr]eturn all cards exiled with (?:it|~) to the battlefield under their owners' control$/.test(s) && ctx.selfCard) return [{ type: "returnLinked", dest: "battlefield" }];
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
  if ((m = /^You may play the exiled card without paying its mana cost(?: if (.+))?$/.exec(s)) && !ctx.spell) {
    if (!m[1]) return [{ type: "playLinked" }];
    const cond = parseStaticCondition(m[1], { affects: { kind: "self" }, mods: [], text: "" });
    return cond ? [{ type: "if", cond: { kind: "state", cond }, effects: [{ type: "playLinked" }] }] : null;
  }
  // "Exile target creature an opponent controls until ~ leaves the battlefield" (CR 610.3), "up to one other target
  // creature you control" (Mardu Siegebreaker).
  if ((m = /^Exile (target .+|up to one (?:other )?target .+|another target .+) until ~ leaves the battlefield$/i.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "exile", what, until: "sourceLeaves" }] : null;
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
    if (/^Exile all cards from your hand face down$/i.test(s)) return [{ type: "exileFaceDown", from: "hand" }];
    if (/^Exile a card from your hand face down$/i.test(s)) return [{ type: "exileFaceDown", from: "handCard" }];
    if (/^Put all cards exiled with ~ into their owners?'s? graveyards?$/i.test(s)) return [{ type: "moveLinked", dest: "graveyard" }];
    if ((m = /^Put (?:all (creature )?cards|each (creature )?card) exiled with ~ onto the battlefield under your control(, and they gain decayed)?(?: with an? (flying|\+1\/\+1) counter on it)?$/i.exec(s)))
      return [{ type: "moveLinked", dest: "battlefield", ...(m[1] || m[2] ? { filter: { kind: "card", types: ["Creature"], text: "creature card" } } : {}), ...(m[3] ? { gain: ["Decayed"] } : {}), ...(m[4] ? { counters: { [m[4]]: 1 } } : {}) }];
    if (/^Put all other cards you own exiled with ~ into your hand$/i.test(s)) return [{ type: "moveLinked", dest: "hand", yours: true, other: true }];
    if (/^Return a card you own exiled with ~ to your hand$/i.test(s)) return [{ type: "moveLinked", dest: "hand", yours: true, one: true }];
    // Bag of Holding: "Return all cards exiled with ~ to their owner's hand": the ones its discard trigger exiled (CR 607.2a).
    if (/^Return all cards exiled with ~ to their owner's hand$/.test(s)) return [{ type: "moveLinked", dest: "hand" }];
    // Currency Converter: one of them, chosen as it resolves.
    if (/^Put a card exiled with ~ into its owner's graveyard$/i.test(s)) return [{ type: "moveLinked", dest: "graveyard", one: true }];
    // Nautiloid Ship: "put a creature card exiled with ~ onto the battlefield under your control".
    if (/^Put a creature card exiled with ~ onto the battlefield under your control$/i.test(s)) return [{ type: "moveLinked", dest: "battlefield", one: true, filter: { kind: "card", types: ["Creature"], text: "creature card" } }];
    if (/^Put a creature card exiled with ~ onto the battlefield under your control with a finality counter on it, and it gains haste until it is sacrificed when the next end step begins$/i.test(s))
      return [{ type: "moveLinked", dest: "battlefield", one: true, filter: { kind: "card", types: ["Creature"], text: "creature card" }, counters: { finality: 1 }, haste: "game", atEndStep: "sacrifice" }];
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
  // Inventory Management: "For each Aura and Equipment you control, you may attach it to a creature you control": each in
  // turn, to a creature chosen as it resolves (not targeted), or left where it is; only where it could legally be attached
  // (rulings, CR 701.3a-b).
  if (/^For each Aura and Equipment you control, you may attach it to a creature you control$/.test(s))
    return [{ type: "attachToChosen", source: { ref: "each", filter: { kind: "object", subtypes: ["Aura", "Equipment"], controller: "you", text: "Aura or Equipment you control" } }, filter: { kind: "object", types: ["Creature"], controller: "you", text: "a creature you control" }, may: true }];
  // Balan, Wandering Knight: "Attach all Equipment you control to ~": each that could be attached to it (CR 701.3a-b).
  if (/^Attach all Equipment you control to ~$/.test(s) && !ctx.spell) return [{ type: "attachAll", filter: { kind: "object", subtypes: ["Equipment"], controller: "you", text: "Equipment you control" } }];
  // Vulshok Battlemaster: "attach all Equipment on the battlefield to it": every player's, still under its controller's
  // control (rulings).
  if ((m = /^[Aa]ttach all Equipment on the battlefield to (~|it)$/.exec(s)) && !ctx.spell && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) return [{ type: "attachAll", filter: { kind: "object", subtypes: ["Equipment"], text: "Equipment" } }];
  // Ardenn: "attach any number of Auras and Equipment you control to target permanent or player": chosen as it resolves
  // (rulings), each that could be attached to it (CR 701.3a-b).
  if ((m = /^(?:you may )?attach any number of Auras and Equipment you control to (target permanent or player)$/i.exec(s)) && !ctx.spell) {
    const host = addTarget(ctx, { kind: "any", types: [...PERMANENT_TYPES], text: m[1]! });
    return [{ type: "attachAny", host }];
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
  if ((m = /^[Cc]reatures( without flying| with power \d+ or less| with defender)? can't block this turn$/.exec(s))) {
    const filter = parseTargetPhrase(`creature${m[1] ?? ""}`);
    return filter?.kind === "object" ? [{ type: "cantBlockRule", filter: { ...filter, text: `creatures${m[1] ?? ""}` } }] : null;
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
  if (/^~ can't block this combat$/.test(s)) return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "cantBlock" }], duration: "endOfCombat" }];
  // Neyith of the Dire Hunt: "That creature must be blocked this combat if able": in the combat going on only.
  if ((m = /^(That creature|It|Target creature) must be blocked this combat if able$/i.exec(s))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    if (what) return [{ type: "continuous", what, mods: [{ kind: "mustBeBlocked", combat: "this" }], duration: "endOfTurn" }];
  }
  // "Target creature attacks this turn if able": in each combat this turn (CR 508.1d).
  if ((m = /^(.+?) attacks? (?:each combat )?this turn if able$/i.exec(s)) && !/ and$/.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "attacksIfAble" }], duration: "endOfTurn" }] : null;
  }
  if (/^Creatures can't attack this turn$/.test(s)) return [{ type: "cantAttackRule", filter: { kind: "object", types: ["Creature"], text: "creatures" } }];
  // Intimidation Bolt: "~ deals 3 damage to target creature. Other creatures can't attack this turn.": every creature but
  // that one, also ones that arrive later, and all of them if it left the battlefield (rulings).
  if (/^Other creatures can't attack this turn$/.test(s) && ctx.spell && ctx.lastObjectTarget !== undefined && !ctx.targets[ctx.lastObjectTarget]?.many)
    return [{ type: "cantAttackRule", filter: { kind: "object", types: ["Creature"], text: "other creatures" }, exceptTarget: ctx.lastObjectTarget }];
  // Venser, the Sojourner: "Creatures can't be blocked this turn": all creatures, also ones that arrive later (rulings).
  if (/^Creatures can't be blocked this turn$/.test(s)) return [{ type: "cantBeBlockedRule", filter: { kind: "object", types: ["Creature"], text: "creatures" } }];
  // "Until your next turn, those permanents can't attack or block and their activated abilities can't be activated" (Mythos
  // of Vadrok): what detain does, in words (CR 701.35a); mana abilities too (CR 605.1a).
  if ((m = /^Until your next turn, (.+?) can't attack or block and (?:its|their) activated abilities can't be activated$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "cantAttack" }, { kind: "cantBlock" }, { kind: "cantActivate" }], duration: "yourNextTurn" }] : null;
  }
  // "Tap target permanent. Its activated abilities can't be activated this turn." (Koma): mana abilities too (CR 605.1a).
  if ((m = /^(Its|Their|.+?'s) activated abilities can't be activated (this turn|until your next turn)$/.exec(s))) {
    const who = m[1]!;
    const what = parseObject(who === "Its" ? "it" : who === "Their" ? "them" : who.replace(/'s$/, ""), ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "cantActivate" }], duration: m[2] === "this turn" ? "endOfTurn" : "yourNextTurn" }] : null;
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
  if ((m = /^(Creatures you control) can't be the targets of (.+) this turn$/i.exec(s))) {
    const affects = parseAffected("Creatures you control");
    const by = parseUntargetable(m[2]!);
    return affects && by ? [{ type: "groupRules", affects, text: "creatures you control", mods: [{ kind: "untargetable", by }], duration: "endOfTurn" }] : null;
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
  // (Sea Drake's "return two target lands you control" targets: sentences/permanents.ts.)
  if ((m = new RegExp(`^Return ${NUM} (?!target )(.+?) you control to (?:its|their) owners?'s? hands?$`, "i").exec(s))) {
    const filter = pickFilter(m[2]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: amt(m[1]!), action: "bounce" }];
  }
  // "Each player chooses from among the permanents they control an artifact, a creature, an enchantment, and a land,
  // then sacrifices the rest" (Cataclysm), "... an artifact, a creature, an enchantment, and a planeswalker from among the
  // nonland permanents they control ..." (Cataclysmic Gearhulk), "... up to two creatures they control ..." (Covetous
  // Elegy), "... a land of each basic land type" (Global Ruin), "... a permanent they control of each permanent type"
  // (Liliana, Dreadhorde General). The choices aren't targeted, and are made as it resolves (rulings).
  // Divine Reckoning: "Each player chooses a creature they control. Destroy the rest." (joined in body.ts): the rest are
  // destroyed instead, at once.
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
  // Blot Out: "Target opponent exiles a creature or planeswalker they control with the greatest mana value among creatures
  // and planeswalkers they control": that player chooses among those tied.
  if ((m = /^(.+?) (sacrifices?|exiles?) a creature or planeswalker (?:they control )?with the greatest mana value among creatures and planeswalkers (?:they control|that player controls)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && who.ref !== "you" ? [{ type: "pick", who, filter: { kind: "object", types: ["Creature", "Planeswalker"], text: "creature or planeswalker" }, n: 1, action: /^sac/i.test(m[2]!) ? "sacrifice" : "exile", greatest: "manaValue" }] : null;
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

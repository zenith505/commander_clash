// Sentences that act on permanents: destroy, tap, connive, regenerate, counters, gaining control, continuous changes until end of turn.

import type { AmountExpr, Count, Effect, Modification, ObjRef, TargetSpec } from "../../abilities";
import { NUM, NUMX, COUNTER, counterKind, amt, isGroup, num, capital, singular, X } from "../words";
import { pickFilter, parseGroup, parseObject, parsePlayer, parseTargetPhrase, PERMANENT_TYPES } from "../targets";
import { addTarget, parseBody } from "../body";
import { parseCount } from "../counts";
import { parseBecomes, parseChanges, parseSentence } from "../sentence";
import { parseAffected, parseExtraBlocks, parseIsA, parseMostStat, parseStaticMods } from "../statics";
import type { Ctx } from "../body";
import { canonicalKeyword, CREATURE_TYPES } from "../../keywords";
import { parseGrants } from "../grants";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parsePermanentsSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  if (/^You have no maximum hand size for the rest of the game$/.test(s)) return [{ type: "noMaxHandSize" }];
  let m: RegExpExecArray | null;
  // Kolodin, Triumph Caster: "Whenever a Mount you control enters, it becomes saddled until end of turn": the designation
  // saddling gives (CR 702.171b), with no creature having saddled it.
  if ((m = /^(It|That creature|Target .+?) becomes saddled until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it").replace(/^That creature$/, "that creature"), ctx);
    if (what && what.ref !== "self") return [{ type: "becomeSaddled", what }];
  }
  // The Laces: "Target spell or permanent becomes green": with no duration, for as long as it's that spell or that
  // permanent (CR 611.2a, 105.3); a permanent spell's new color stays with the permanent it becomes (CR 112.4, 400.7a).
  // Blind Seer, Eight-and-a-Half-Tails: "... becomes the color of your choice / white until end of turn" (rulings: the
  // permanent a spell becomes keeps it until end of turn). Vodalian Mystic: "Target instant or sorcery spell becomes ...".
  if ((m = /^[Tt]arget (spell or permanent|instant or sorcery spell) becomes (white|blue|black|red|green|the chosen color)( until end of turn)?$/.exec(s))) {
    const perm = m[1] === "spell or permanent" ? parseTargetPhrase("permanent") : undefined;
    const spell: TargetSpec | null = perm ? { kind: "spell", types: [], notTypes: [], notColors: [], orPermanent: perm, text: "target spell or permanent" } : parseTargetPhrase(m[1]!);
    const mods = parseBecomes(m[2]!);
    return mods && spell?.kind === "spell" && (!perm || perm.kind === "object") ? [{ type: "continuous", what: { ref: "target", index: addTarget(ctx, spell) }, mods, duration: m[3] ? "endOfTurn" : "game" }] : null;
  }
  // Sleight of Mind: "Change the text of target spell or permanent by replacing all instances of one color word with
  // another"; Mind Bend: "... one color word with another or one basic land type with another"; Crystal Spray: "... until
  // end of turn"; Artificial Evolution: "one creature type with another"; New Blood: "Change the text of that creature by
  // replacing all instances of one creature type with Vampire" (CR 612; the words are chosen as it resolves, rulings).
  if ((m = /^Change the text of (target spell or permanent|target .+?|that creature) by replacing all instances of one (color word|basic land type|creature type) with (another|[A-Z][a-z]+)(?: or one (color word|basic land type) with another)?( until end of turn)?( except Wall)?$/.exec(s))) {
    const kindOf = (w: string) => (w === "color word" ? ("color" as const) : w === "basic land type" ? ("basicLandType" as const) : ("creatureType" as const));
    const kinds = [kindOf(m[2]!), ...(m[4] ? [kindOf(m[4])] : [])];
    // A named new word only for a creature type (New Blood's Vampire), with one kind.
    if (m[3] !== "another" && (kinds.length > 1 || kinds[0] !== "creatureType" || !CREATURE_TYPES.has(m[3]!))) return null;
    if (new Set(kinds).size !== kinds.length || (m[6] && kinds[0] !== "creatureType")) return null;
    let what: ObjRef | null;
    if (m[1] === "target spell or permanent") {
      const perm = parseTargetPhrase("permanent");
      if (perm?.kind !== "object") return null;
      what = { ref: "target", index: addTarget(ctx, { kind: "spell", types: [], notTypes: [], notColors: [], orPermanent: perm, text: "target spell or permanent" }) };
    } else {
      what = parseObject(m[1] === "that creature" ? "that creature" : m[1]!, ctx);
      // Only a target permanent or the one an earlier sentence targeted.
      if (!what || what.ref !== "target") return null;
      const spec = ctx.targets[what.index];
      if (spec?.kind !== "object") return null;
    }
    return [{ type: "changeText", what, kinds, ...(m[3] !== "another" ? { newWord: m[3]! } : {}), ...(m[5] ? { endOfTurn: true as const } : {}), ...(m[6] ? { notTo: ["Wall"] } : {}) }];
  }
  // "Turn target face-down creature face up" (CR 708.8), "you may turn a face-down creature you control face up" (Ugin's
  // Mastery): chosen as it resolves (CR 608.2d), with no cost paid.
  let fu: RegExpExecArray | null;
  // Cyber Conversion: "Turn target creature face down. It's a 2/2 Cyberman artifact creature." (joined by parseBody).
  if ((fu = /^[Tt]urn (target creature) face down as a 2\/2 Cyberman artifact creature$/.exec(s))) {
    const what = parseObject(fu[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "turnFaceDown", what, as: "cyberman" }] : null;
  }
  // Wall of Deceit, Mischievous Quanar, Obscuring Aether: "Turn ~ face down" (an activated ability of its own): a 2/2 with
  // no text (CR 708.2a).
  if (/^[Tt]urn ~ face down$/.test(s)) return [{ type: "turnFaceDown", what: { ref: "self" }, as: "morph" }];
  // Master of the Veil: "turn target creature with a morph ability face down"; Weaver of Lies: "turn any number of target
  // creatures with morph abilities other than ~ face down": each a face-down 2/2 its controller may turn face up again
  // for its morph cost (CR 702.37e, 708.2), still the same object (708.8 for the other way).
  if ((fu = /^[Tt]urn ((?:any number of )?target creatures? with (?:a morph ability|morph abilities)(?: other than ~)?) face down$/.exec(s))) {
    const what = parseObject(fu[1]!.replace(/^any number of target (.+) other than ~$/, "any number of other target $1"), ctx);
    return what?.ref === "target" ? [{ type: "turnFaceDown", what, as: "morph" }] : null;
  }
  if ((fu = /^[Tt]urn (target face-down .+?) face up$/.exec(s))) {
    const what = parseObject(fu[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "turnFaceUp", what }] : null;
  }
  // Hauntwoods Shrieker: "Reveal target face-down permanent. If it's a creature card, you may turn it face up" (as parseBody
  // joins it): revealed to all (CR 701.20a), then turned face up with no cost paid only if the card is a creature card as
  // printed (rulings); otherwise it stays face down.
  if ((fu = /^[Rr]eveal (target face-down permanent) and you may turn it face up if it's a creature card$/.exec(s))) {
    const what = parseObject(fu[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "turnFaceUp", what, revealOnly: true }, { type: "may", effects: [{ type: "turnFaceUp", what, ifCreatureCard: true }], text: "turn it face up" }] : null;
  }
  // Showstopping Surprise: "Choose target creature you control. Turn it face up if it's face down": the target, turned face
  // up with no cost paid (CR 708.8) if it's face down; a face-up one stays as it is.
  if (/^[Tt]urn it face up if it's face down$/.test(s) && ctx.lastObjectTarget !== undefined && !ctx.targets[ctx.lastObjectTarget]?.many) return [{ type: "turnFaceUp", what: { ref: "target", index: ctx.lastObjectTarget } }];
  // Staff Room: "turn that creature face up or put a +1/+1 counter on it", its controller's choice as it resolves (CR
  // 608.2d). A face-down instant or sorcery card can't be turned face up (rulings), so that option does nothing then.
  if ((fu = /^[Tt]urn (that creature) face up or (put an? \+1\/\+1 counter on it)$/.exec(s)) && ctx.subject) {
    const what = parseObject(fu[1]!, ctx);
    const put = what?.ref === "subject" ? parseSentence(fu[2]!.replace(/^p/, "P"), ctx) : null;
    return put ? [{ type: "either", options: [[{ type: "turnFaceUp", what: what! }], put], labels: ["Turn it face up", "Put a +1/+1 counter on it"] }] : null;
  }
  // Zimone, Mystery Unraveler: "you may turn a permanent you control face up": only a face-down one can be (CR 708.8;
  // a face-up one has no face-up side to turn to), so it's the same choice.
  // Bustle: "You may turn a creature you control face up": a face-down one, likewise.
  if ((fu = /^[Tt]urn an? (face-down (?:creature|permanent) you control|(?:creature|permanent) you control) face up$/.exec(s))) {
    const filter = parseTargetPhrase(fu[1]!.replace(/^(creature|permanent)/, "face-down $1"));
    return filter?.kind === "object" ? [{ type: "pick", who: { ref: "you" }, filter: { ...filter, text: fu[1]! }, n: 1, action: "choose" }, { type: "turnFaceUp", what: { ref: "created" } }] : null;
  }
  // Nahiri, Heir of the Ancients: "You may attach an Equipment you control to it", the token just created; Goldwardens'
  // Gambit: "For each of those tokens, you may attach an Equipment you control to it".
  // Unexpected Request: "... until the next end step" (as parseBody joins it): a
  // delayed trigger about the Equipment attached this way (CR 603.7c), none if none was.
  if ((fu = /^(?:For each of those tokens, y|Y)ou may attach an Equipment you control to (it|that creature)( until the next end step)?$/.exec(s))) {
    const each = /^For each /.test(s);
    if (each && (!ctx.lastCreatedAny || fu[2])) return null;
    const what = each ? ({ ref: "created" } as ObjRef) : parseObject(fu[1]!, ctx);
    if (!what || (what.ref === "target" && what.n) || what.ref === "each") return null;
    return [{ type: "attachEquipmentTo", what }, ...(fu[2] ? [{ type: "delayed" as const, when: "nextEndStep" as const, each: "attachedThisWay" as const, effects: [{ type: "unattach" as const, what: { ref: "subject" as const } }], text: "unattach it" }] : [])];
  }
  // Beatrix, Loyal General: "you may attach any number of Equipment you control to target creature you control"; Battlefield
  // Improvisation: "... to it". Only those that can be attached to it (rulings; CR 301.5c).
  if ((fu = /^[Yy]ou may attach any number of Equipment you control to (target creature you control|it|that creature)$/.exec(s))) {
    const what = parseObject(fu[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "attachAny", host: what.index, equipment: true }] : null;
  }
  // Energybending: "Lands you control gain all basic land types until end of turn": added to their other types, each with
  // its mana ability (CR 305.6; rulings).
  if ((fu = /^(.+?) gains? all basic land types until end of turn$/.exec(s))) {
    const what = parseObject(fu[1]!, ctx);
    return what && (what.ref === "each" || what.ref === "target") ? [{ type: "continuous", what, mods: [{ kind: "addTypes", types: [], subtypes: ["Plains", "Island", "Swamp", "Mountain", "Forest"] }], duration: "endOfTurn" }] : null;
  }
  if (/^You have no maximum hand size until your next turn$/.test(s)) return [{ type: "noMaxHandSize", untilYourNextTurn: true }];
  // Illusion of Choice (CR 701.38): the votes of every vote this turn are this player's to make.
  if (/^You choose how each player votes this turn$/.test(s)) return [{ type: "chooseVotes" }];
  // Odric, Master Tactician: the defending players' blocks are declared by you (rulings: they must still be legal).
  if (/^[Yy]ou choose which creatures block this combat and how those creatures block$/.test(s)) return [{ type: "chooseBlocks" }];
  // "Until your next turn, creatures your opponents control enter tapped" (Cone of Cold): a replacement effect that lasts
  // (CR 614.1c, 611.2b).
  const untilTapped = /^Until your next turn, ([a-z][^,]*?) enter tapped$/.exec(s);
  if (untilTapped) {
    const g = parseGroup(untilTapped[1]!, true);
    return g && !g.other ? [{ type: "enterTappedUntil", filter: g.filter }] : null;
  }
  // "Lands you control enter tapped this turn" (Nahiri's Lithoforming): the same, ending in the cleanup step (CR 514.2).
  const thisTurnTapped = /^([A-Z][^,]*?) enter tapped this turn$/.exec(s);
  if (thisTurnTapped) {
    const g = parseGroup(thisTurnTapped[1]!.charAt(0).toLowerCase() + thisTurnTapped[1]!.slice(1), true);
    return g && !g.other ? [{ type: "enterTappedUntil", filter: g.filter, thisTurn: true }] : null;
  }

  // Zameck Guildmage, Combine Guildmage: "This turn, each creature you control enters with an additional +1/+1 counter on
  // it": a replacement effect on creatures entering for the rest of the turn (CR 614.1c, 611.2a), as they'd exist there.
  const turnCounters = new RegExp(`^This turn, each (creature you control) enters with an additional ${COUNTER} counter on it$`).exec(s);
  if (turnCounters) {
    const g = parseGroup(`each ${turnCounters[1]}`);
    return g && !g.other && g.filter.kind === "object" && g.filter.controller === "you" ? [{ type: "entersWithCountersThisTurn", filter: g.filter, counter: counterKind(turnCounters[2]!), n: 1 }] : null;
  }

  // Maddening Hex: "Then attach ~ to another one of your opponents chosen at random."
  if (/^(?:[Tt]hen )?[Aa]ttach ~ to another one of your opponents chosen at random$/.test(s)) return [{ type: "attachToRandomOpponent" }];
  // "Unlock a locked door of a Room you control" (CR 709.5f), "... of up to one target Room you control" (Ghostly
  // Keybearer): its controller chooses which locked door.
  if (/^[Uu]nlock a locked door of a Room you control$/.test(s)) return [{ type: "unlockDoor" }];
  if (/^[Uu]nlock a locked door of up to one target Room you control$/.test(s)) {
    // A Room is an enchantment subtype (CR 709.5j, 205.3h).
    const what = parseObject("up to one target enchantment you control", ctx);
    if (what?.ref !== "target") return null;
    const t = ctx.targets[what.index]!;
    ctx.targets[what.index] = { ...t, subtypes: ["Room"], text: "target Room you control" };
    return [{ type: "unlockDoor", what }];
  }
  // Marina Vendrell, Keys to the House: "Lock or unlock a door of target Room you control" (CR 709.5f-g): its controller
  // chooses one of its doors, locked or unlocked, and it becomes the other.
  if (/^[Ll]ock or unlock a door of target Room you control$/.test(s)) {
    const what = parseObject("target enchantment you control", ctx);
    if (what?.ref !== "target") return null;
    ctx.targets[what.index] = { ...ctx.targets[what.index]!, subtypes: ["Room"], text: "target Room you control" };
    return [{ type: "unlockDoor", what, orLock: true }];
  }
  // "Return an enchantment card from your graveyard to your hand or unlock a locked door of a Room you control" (Ghostly
  // Dancers): one or the other, chosen as it resolves, never one that can't be done (CR 608.2d).
  if ((m = /^[Rr](eturn an? [^,]+? card from your graveyard to your hand) or (unlock a locked door of a Room you control)$/.exec(s))) {
    const first = parseSentence(`R${m[1]!}`, ctx);
    if (first?.length !== 1 || first[0]!.type !== "chooseFromGraveyard") return null;
    return [{ type: "either", options: [first, [{ type: "unlockDoor" }]], labels: [`R${m[1]!.replace(/ from your graveyard to your hand$/, "")}`, "Unlock a locked door"], onlyDoable: true }];
  }

  // "Double the power of each creature you control until end of turn" (Double Trouble), "double the power and toughness
  // of each creature you control", "double the toughness of each creature you control" (CR 701.10b-c): each gets +X/+0
  // (+X/+Y, +0/+Y), X its own power and Y its own toughness as this resolves.
  if ((m = /^[Dd]ouble the (power|toughness|power and toughness) of (each .+?|other creatures you control|creatures you control) until end of turn$/.exec(s))) {
    const what = parseObject(m[2]!.startsWith("each") ? m[2]! : `each ${m[2]!.replace(/^other creatures/, "other creature").replace(/^creatures/, "creature")}`, ctx);
    if (!what || !isGroup(what)) return null;
    return [{ type: "doublePT", what, power: m[1] !== "toughness", toughness: m[1] !== "power" }];
  }
  // "Double ~'s power until end of turn" (Tifa Lockhart), "double target creature's power and toughness": the same, for
  // one creature. "Triple target creature's power and toughness" (Tifa's Limit Break): +X/+Y, twice each (CR 701.11b-c).
  // Junk Jet: "Double equipped creature's power until end of turn": the creature it's attached to as this resolves.
  if ((m = /^([Dd]ouble|[Tt]riple) (~'s|target creature's|that creature's|its|equipped creature's|enchanted creature's) (power|toughness|power and toughness) until end of turn$/.exec(s))) {
    const what = parseObject(m[2] === "its" ? "it" : m[2]!.slice(0, -2), ctx);
    if (!what || isGroup(what)) return null;
    return [{ type: "doublePT", what, power: m[3] !== "toughness", toughness: m[3] !== "power", ...(/^t/i.test(m[1]!) ? { triple: true as const } : {}) }];
  }
  // "Until end of turn, ~'s base power becomes equal to the number of Towns you control" (PuPu UFO): its power set in
  // layer 7b (CR 613.4b), the number counted as it resolves (rulings).
  // The body has moved the "Until end of turn, " to the end.
  // Riptide Mangler: "~'s base power becomes equal to target creature's power" (lasting indefinitely): that creature's
  // power as it resolves, locked in then (CR 608.2h), set in layer 7b; later effects that set it win (rulings).
  if ((m = /^~'s base power becomes equal to (target creature)'s power$/.exec(s))) {
    const of = parseObject(m[1]!, ctx);
    if (of?.ref !== "target") return null;
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "setPower", power: { count: { kind: "power", of } } }], duration: "game" }];
  }
  // Wall of Tombstones: "~'s base toughness becomes equal to 1 plus the number of creature cards in your graveyard" (lasting
  // indefinitely): counted as it resolves and locked in (CR 608.2h), set in layer 7b (CR 613.4b).
  if ((m = /^~'s base (power|toughness) becomes equal to (\d+) plus (the number of .+)$/.exec(s))) {
    const n = parseCount(m[3]!, ctx);
    if (!n || typeof n !== "object" || n.plus || n.times || n.half || n.negate) return null;
    const amount = { ...n, plus: Number(m[2]) };
    return [{ type: "continuous", what: { ref: "self" }, mods: [m[1] === "power" ? { kind: "setPower", power: amount } : { kind: "setToughness", toughness: amount }], duration: "game" }];
  }
  if ((m = /^~'s base power becomes equal to (the number of .+) until end of turn$/.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    if (!n) return null;
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "setPower", power: n }], duration: "endOfTurn" }];
  }

  // "Tap any number of untapped creatures you control" (Devout Invocation), "you may tap any number of untapped Gates you
  // control" (Guild Summit): chosen as it resolves, none allowed, so "you may" changes nothing (CR 608.2d). Followed by
  // "for each creature tapped this way" or "When you do, ... the number of creatures tapped this way".
  // Augusta, Dean of Order: "then tap any number of creatures you control": only an untapped one can be tapped (CR 701.26a),
  // so the same.
  if ((m = /^(?:[Yy]ou may )?[Tt]ap any number of (?:untapped )?((?:[A-Z][a-z]+ )?(?:creatures|artifacts|Gates|Humans)) you control$/.exec(s))) {
    // A land type isn't read as a plural by parseGroup, but "each Gate you control" is the same group.
    const g = m[1] === "Gates" ? parseGroup("each Gate you control") : parseGroup(`${m[1]!} you control`);
    if (!g || g.other) return null;
    ctx.tappedThisWay = true;
    return [{ type: "tapAnyNumber", filter: { ...g.filter, text: `${m[1]!} you control` } }];
  }

  // "That creature enters with an additional +1/+1 counter on it" about a creature spell a cast trigger is about (Boreal
  // Outrider): the spell, as it resolves (CR 614.1c).
  if ((m = new RegExp(`^[Tt]hat creature enters with (an|${NUMX}) additional ${COUNTER} counters? on it$`).exec(s)))
    // "That creature enters with X additional +1/+1 counters on it, where X is the number of ingredient counters on ~"
    // (Communal Brewing): X counted as the trigger resolves (rulings), with ~'s last known counters if it has left.
    return ctx.castSpell && (m[1] !== "X" || ctx.whereX) ? [{ type: "spellEntersWith", counter: counterKind(m[m.length - 1]!), n: m[1] === "an" ? 1 : amt(m[1]!) }] : null;
  // Torgal, A Fine Hound: "that creature enters with an additional +1/+1 counter on it for each Dog and/or Wolf you
  // control": counted as the trigger resolves, like X above.
  if ((m = new RegExp(`^[Tt]hat creature enters with an additional ${COUNTER} counter on it for each (.+)$`).exec(s))) {
    const n = ctx.castSpell ? parseCount(m[2]!.replace(/\band\/or\b/g, "or"), ctx) : null;
    return n ? [{ type: "spellEntersWith", counter: counterKind(m[1]!), n }] : null;
  }
  // "It gains haste until end of turn" about the spell a cast trigger is about (Tyvar Kell's emblem): the permanent it
  // becomes has it until end of turn (CR 400.7a, rulings on Tyvar Kell).
  // "It gains rebound" (Narset Transcendent): as it resolves (CR 702.88a).
  if (ctx.castSpell && (m = /^(?:[Ii]t|[Tt]hat spell) gains (.+?)( until end of turn)?$/.exec(s)) && (ctx.spellIt || /^[Tt]hat spell/.test(s))) {
    if (m[1] === "rebound" && !m[2]) return [{ type: "spellGains", mods: [{ kind: "addKeywords", keywords: ["Rebound"] }] }];
    // "It gains sunburst" (Lux Artillery): it works as the permanent enters from the stack (CR 702.44a), each instance
    // apart (rulings).
    if (m[1] === "sunburst" && !m[2]) return [{ type: "spellGains", mods: [{ kind: "addKeywords", keywords: ["Sunburst"] }] }];
    // "It gains bloodthirst 3" (Bloodlord of Vaasgoth): it works as the permanent enters (CR 702.54a; rulings: with its
    // own bloodthirst, both apply).
    if (/^bloodthirst \d+$/.test(m[1]!) && !m[2]) return [{ type: "spellGains", mods: [{ kind: "addKeywords", keywords: [`Bloodthirst ${m[1]!.split(" ")[1]}`] }] }];
    // Rivaz of the Claw: 'it gains "When this creature dies, exile it."': the permanent it becomes has it, with no end
    // (rulings), even if it stops being a creature.
    if (!m[2] && /^"[^"]+"$/.test(m[1]!)) {
      const grant = parseGrants(m[1]!);
      return grant?.length && grant.every((x) => x.kind === "addAbility") ? [{ type: "spellGains", mods: grant, forever: true }] : null;
    }
    // Judith, Carnage Connoisseur: "That spell gains deathtouch and lifelink": what the spell has as a source of damage
    // (CR 702.2b, 702.15b) while it's that spell.
    if (!m[2] && /^[Tt]hat spell/.test(s)) {
      const mods = parseGrants(m[1]!);
      return mods?.length && mods.every((x) => x.kind === "addKeywords" && x.keywords.every((k) => k === "Deathtouch" || k === "Lifelink")) ? [{ type: "spellGains", mods, whileSpell: true }] : null;
    }
    const mods = m[2] ? parseGrants(m[1]!) : null;
    return mods?.length && mods.every((x) => x.kind === "addKeywords") ? [{ type: "spellGains", mods }] : null;
  }
  // A class level bar's activated ability (CR 716.2a; see striations.ts): only in an activated ability of its own.
  if ((m = /^~'s level becomes (\d+)$/.exec(s))) return ctx.activated ? [{ type: "classLevel", n: Number(m[1]) }] : null;
  // A Case's "To solve" trigger (CR 719.3a; see compile.ts): "this Case becomes solved".
  if (s === "~ becomes solved") return [{ type: "solve" }];
  if (s === "Harness ~") return [{ type: "harness" }];
  if (s === "The next spell you cast this turn has improvise") return [{ type: "nextSpellImprovise" }];
  // Wand of the Worldsoul: "The next spell you cast this turn has convoke" (CR 702.51), the same way.
  // Flockchaser Phantom: "Whenever ~ attacks, the next spell you cast this turn has convoke": the same, in a trigger.
  if (/^[Tt]he next spell you cast this turn has convoke$/.test(s)) return [{ type: "nextSpellImprovise", convoke: true }];
  // "Transform ~" (CR 701.27a); "you may transform it" in a trigger about itself (Vincent Valentine).
  // Elbrus, the Binding Blade: "unattach ~" in a trigger (CR 701.3d): it stays on the battlefield, attached to nothing.
  if (/^[Uu]nattach ~$/.test(s)) return [{ type: "unattachSelf" }];
  if (/^[Tt]ransform ~$/.test(s) || (ctx.selfIt && /^[Tt]ransform it$/.test(s))) return [{ type: "transform", what: { ref: "self" } }];
  // "Transform up to one target Incubator token you control" (Attentive Skywarden), "transform target Werewolf you
  // control", "up to one other target double-faced artifact you control" (The Golden-Gear Colossus): a permanent that
  // isn't a transforming one doesn't (CR 701.27c).
  if ((m = /^[Tt]ransform ((?:up to one (?:other )?)?target .+|another target .+)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "transform", what }] : null;
  }
  // "Transform all Incubator tokens you control" (The Argent Etchings): each of them, as it resolves (CR 701.27a).
  if ((m = /^[Tt]ransform (all .+)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" ? [{ type: "transform", what }] : null;
  }
  // "Convert ~" (CR 701.28a): turned so its other face is up, just as transforming does (701.28a, rulings); "convert it"
  // in a trigger about itself.
  if (/^[Cc]onvert ~$/.test(s) || (ctx.selfIt && /^[Cc]onvert it$/.test(s))) return [{ type: "transform", what: { ref: "self" }, convert: true }];
  // "Flip ~" (CR 710); "flip it" in a trigger about itself.
  if (/^[Ff]lip ~$/.test(s) || (ctx.selfIt && /^[Ff]lip it$/.test(s))) return [{ type: "flip", what: { ref: "self" } }];
  // "~ becomes prepared" (CR 722.3a); "it" in a trigger about itself.
  if (/^~ becomes prepared$/.test(s) || (ctx.selfIt && /^[Ii]t becomes prepared$/.test(s))) return [{ type: "becomePrepared", what: { ref: "self" } }];
  // Lost Isle Calling: "{4}{U}{U}, Exile ~: Draw a card for each verse counter on ~. If it had seven or more verse counters
  // on it, take an extra turn after this one": the counters on it as it last existed on the battlefield (CR 608.2h).
  if (ctx.activated && !ctx.spell && (m = new RegExp(`^If (?:it|~) had ${NUM} or more ${COUNTER} counters on it, (.+)$`).exec(s))) {
    const inner = parseSentence(capital(m[3]!), ctx);
    return inner ? [{ type: "if", cond: { kind: "amountNow", amount: { count: { kind: "counters", counter: counterKind(m[2]!), of: { ref: "self" } } }, min: num(m[1]!) }, effects: inner }] : null;
  }
  // "Target creature becomes prepared" (Skycoach Waypoint), "Each creature you control becomes prepared" (Codie), "Target
  // creature becomes unprepared" (Biblioplex Tomekeeper, CR 722.3b): any creature can be the target, only one with a
  // prepare spell that isn't prepared yet becomes prepared, and only a prepared one becomes unprepared (rulings).
  // Infinite Coursework: "Tap enchanted creature. It becomes unprepared": "it" is the enchanted creature.
  if ((m = /^(.+?) becomes? (prepared|unprepared)$/.exec(s))) {
    const what = parseObject(m[1]!.charAt(0).toLowerCase() + m[1]!.slice(1), ctx);
    return what ? [{ type: "becomePrepared", what, ...(m[2] === "unprepared" ? { un: true as const } : {}) }] : null;
  }
  // "Tap that creature and it doesn't untap during its controller's next untap step" (Kashi-Tribe Warriors).
  if ((m = /^Tap (target .+?|that creature|it) and it doesn't untap during its controller's next untap step$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "tap", what }, { type: "skipUntap", what }] : null;
  }
  // "Untap up to seven lands" (Palinchron), "You untap up to six lands" (Time Spiral): chosen as it resolves (CR 608.2d),
  // anyone's (rulings).
  // "Untap up to three lands you control" (Likeness of the Seeker): only yours.
  // Shriekwood Devourer: "untap up to X lands, where X is ...".
  if ((m = new RegExp(`^(?:You )?[Uu]ntap up to ${NUMX} lands?( you control)?$`).exec(s))) return [{ type: "untapUpTo", n: amt(m[1]!), filter: { kind: "object", types: ["Land"], notTypes: [], notColors: [], ...(m[2] ? { controller: "you" as const, text: "land you control" } : { text: "land" }) } }];
  // "Untap a creature you control" (White Plume Adventurer): one of yours, chosen as it resolves (CR 608.2d); choosing an
  // untapped one does nothing, so the choice is among the tapped ones, or none.
  if ((m = new RegExp(`^[Uu]ntap (a|an|${NUM}) ([a-z][a-z ]*?) you control$`).exec(s))) {
    const filter = pickFilter(m.at(-1)!);
    return filter?.kind === "object" ? [{ type: "untapUpTo", n: /^an?$/.test(m[1]!) ? 1 : num(m[1]!), filter: { ...filter, controller: "you", text: `${filter.text} you control` } }] : null;
  }
  // Hokori, Dust Drinker: "At the beginning of each player's upkeep, that player untaps a land they control": that player's
  // choice among their tapped ones, as White Plume Adventurer's above.
  if (/^[Tt]hat player untaps a land they control$/.test(s)) {
    const who = parsePlayer("that player", ctx);
    return who ? [{ type: "untapUpTo", n: 1, filter: { kind: "object", types: ["Land"], notTypes: [], notColors: [], controller: "you", text: "land they control" }, who }] : null;
  }
  // "Tap or untap target permanent" (Twiddle, Pestermite): which is chosen as it resolves (CR 608.2d).
  if ((m = /^Tap or untap ((?:another )?target .+|that creature|it|~|enchanted \w+|equipped \w+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) && !(what.ref === "target" && what.n) ? [{ type: "tapOrUntap", what }] : null;
  }
  // Plague Boiler: "Put a plague counter on ~ or remove a plague counter from it": one or the other, chosen as it resolves,
  // removing only with one there to remove (rulings, CR 608.2d).
  if ((m = /^Put an? ([a-z]+) counter on ~ or remove an? ([a-z]+) counter from (?:it|~)$/.exec(s)) && m[1] === m[2] && !ctx.spell) {
    const k = m[1]!;
    return [{ type: "either", options: [[{ type: "counters", what: { ref: "self" }, counter: k, n: 1 }], [{ type: "removeCounters", what: { ref: "self" }, counter: k, n: 1 }]], labels: [`Put a ${k} counter on ~`, `Remove a ${k} counter from ~`], onlyDoable: true }];
  }
  // Sigurd, Jarl of Ravensthorpe: "Put a lore counter on target Saga you control or remove one from it"; Jinxed Choker: "Put
  // a charge counter on ~ or remove one from it": the same choice, as it resolves (CR 608.2d).
  if ((m = /^Put an? ([a-z]+) counter on (~|target [A-Za-z ]+?) or remove one from it$/.exec(s)) && !ctx.spell) {
    const k = m[1]!;
    const what = m[2] === "~" ? { ref: "self" as const } : parseObject(m[2]!, ctx);
    if (!what || isGroup(what) || (what.ref === "target" && what.n)) return null;
    const on = m[2] === "~" ? "~" : "it";
    return [{ type: "either", options: [[{ type: "counters", what, counter: k, n: 1 }], [{ type: "removeCounters", what, counter: k, n: 1 }]], labels: [`Put a ${k} counter on ${on}`, `Remove a ${k} counter from ${on}`], onlyDoable: true }];
  }
  // Telekinetic Bonds: "If you do, you may tap or untap target permanent": tap, untap or neither, as one question.
  if ((m = /^You may tap or untap (target permanent)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "tapOrUntap", what, may: true }] : null;
  }
  // Portal Manipulator: "choose target player and any number of target attacking creatures their opponents control. Those
  // creatures are now attacking that player." (rewritten in body.ts as one sentence).
  if (s === "Any number of target attacking creatures controlled by opponents of target player are now attacking that player") {
    const p = addTarget(ctx, { kind: "player", text: "target player" });
    const c = addTarget(ctx, { kind: "object", types: ["Creature"], notTypes: [], notColors: [], combat: "attacking", controlledByOpponentOfTarget: p, many: "any", text: "target attacking creature that player's opponents control" });
    return [{ type: "reselectAttack", what: { ref: "target", index: c }, toPlayer: { ref: "target", index: p } }];
  }
  // Misleading Signpost, Portal Mage: "reselect which player or permanent target attacking creature is attacking".
  if ((m = /^[Rr]eselect which player or permanent (target attacking creature) is attacking$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "reselectAttack", what }] : null;
  }
  if (/^[Ff]or each attacking creature, you may reselect which player or permanent that creature is attacking$/.test(s)) return [{ type: "reselectAttack", what: { ref: "allCreatures", attacking: true }, each: true }];
  // Illusionist's Gambit: "Remove all attacking creatures from combat and untap them" (CR 506.4): "them" are those removed.
  if (/^[Rr]emove all attacking creatures from combat and untap them$/.test(s)) {
    const what = parseObject("each attacking creature", ctx);
    return what && isGroup(what) ? [{ type: "removeFromCombat", what, remember: true }, { type: "untap", what: { ref: "created" } }] : null;
  }
  // Dazzling Beauty, Trap Runner: "Target unblocked attacking creature becomes blocked"; Choking Vines: "X target
  // attacking creatures become blocked"; Fog Patch: "Attacking creatures become blocked" (CR 509.1h).
  if ((m = /^(Target unblocked attacking creature|X target attacking creatures|Attacking creatures) becomes? blocked$/.exec(s))) {
    const what = parseObject(m[1] === "Attacking creatures" ? "each attacking creature" : m[1]!.replace(/^T/, "t"), ctx);
    return what && (m[1] === "Attacking creatures") === isGroup(what) ? [{ type: "becomeBlocked", what }] : null;
  }
  // Removing from combat (CR 506.4): Gustcloak Runner's "untap it and remove it from combat", "remove ~ from combat".
  // Observed Stasis: "remove enchanted creature from combat".
  if (/^[Rr]emove enchanted creature from combat$/.test(s) && !ctx.spell) return [{ type: "removeFromCombat", what: { ref: "attached" } }];
  if ((m = /^(?:(Untap) (~|it|target .+?) and )?[Rr]emove (~|it|target .+?) from combat$/.exec(s))) {
    if (m[1] && m[3] !== "it" && m[3] !== m[2]) return null;
    const what = parseObject(m[2] ?? m[3]!, ctx);
    if (!what || isGroup(what)) return null;
    return [...(m[1] ? [{ type: "untap" as const, what }] : []), { type: "removeFromCombat", what }];
  }
  // Mount Doom: "Choose up to two creatures, then destroy the rest": any players' (not targeted), chosen as it resolves.
  if ((m = new RegExp(`^Choose up to ${NUM} (creatures|permanents|nonland permanents|artifacts), then destroy the rest$`).exec(s))) {
    const filter = pickFilter(m[2]!.replace(/s$/, ""));
    return filter ? [{ type: "keepDestroyRest", filter: { ...filter, text: m[2]!.replace(/s$/, "") }, n: num(m[1]!) }] : null;
  }
  // Deadly Vanity: "Choose a creature or planeswalker, then destroy all other creatures and planeswalkers": any player's,
  // not targeted; one must be chosen if there is one (rulings).
  if (/^Choose a creature or planeswalker, then destroy all other creatures and planeswalkers$/.test(s)) return [{ type: "keepDestroyRest", filter: { kind: "object", types: ["Creature", "Planeswalker"], notTypes: [], notColors: [], text: "creature or planeswalker" }, n: 1, exactly: true }];
  // Last One Standing: "Choose a creature at random, then destroy the rest": any player's, not targeted (rulings).
  if (/^Choose a creature at random, then destroy the rest$/.test(s)) return [{ type: "keepDestroyRest", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" }, n: 1, random: true }];
  // Fight to the Death: "Destroy all blocking creatures and all blocked creatures": all of them at once (CR 701.8a), each
  // creature that's either one.
  if (/^Destroy all blocking creatures and all blocked creatures$/.test(s)) {
    const anyOf: TargetSpec[] = [{ kind: "object", combat: "blocking", text: "blocking" }, { kind: "object", combat: "blocked", text: "blocked" }];
    return [{ type: "destroy", what: { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], anyOf, text: "all blocking creatures and all blocked creatures" } } }];
  }
  // End Hostilities: "Destroy all creatures and all permanents attached to creatures": all at once (CR 701.8a), each
  // permanent that's either, what's attached seen before anything is destroyed.
  if (/^Destroy all creatures and all permanents attached to creatures$/.test(s)) {
    const creature: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
    const anyOf: TargetSpec[] = [creature, { kind: "object", types: [], notTypes: [], notColors: [], attachedTo: creature, text: "permanent attached to a creature" }];
    return [{ type: "destroy", what: { ref: "each", filter: { kind: "object", types: [], notTypes: [], notColors: [], anyOf, text: "all creatures and all permanents attached to creatures" } } }];
  }
  // Steel Hellkite: "Destroy each nonland permanent with mana value X whose controller was dealt combat damage by ~ this
  // turn": whoever controls it now (rulings).
  if ((m = /^Destroy (each .+?) whose controller was dealt combat damage by ~ this turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" && !what.of ? [{ type: "destroy", what: { ...what, of: { ref: "combatDamagedBySelf" } } }] : null;
  }
  // "Destroy target nonblack creature and target land" (Plague Spores): two targets, each destroyed. Relic Crush: "...
  // and up to one other target artifact or enchantment", a different one, maybe none (CR 115.3).
  if ((m = /^(Destroy|Exile) (target [^,]+?) and ((?:up to one other )?target .+)$/i.exec(s)) && !/ and target /.test(m[3]!)) {
    const a = parseObject(m[2]!, ctx);
    const b = a && parseObject(m[3]!, ctx);
    const type = m[1]!.toLowerCase() as "destroy" | "exile";
    return a?.ref === "target" && b?.ref === "target" ? [{ type, what: a }, { type, what: b }] : null;
  }
  // Homeward Path: "Each player gains control of all creatures they own"; Brooding Saurian's "nontoken permanents".
  if ((m = /^Each player gains control of all (.+) they own$/i.exec(s))) {
    const g = parseGroup(`all ${m[1]!}`);
    return g && !g.other && !g.filter.controller ? [{ type: "ownersGainControl", filter: g.filter }] : null;
  }
  // Aura Thief: "You gain control of all enchantments", for as long as each stays on the battlefield (CR 611.2c).
  if ((m = /^You gain control of all (.+)$/i.exec(s))) {
    const g = parseGroup(`all ${m[1]!}`);
    return g && !g.other ? [{ type: "continuous", what: { ref: "each", filter: g.filter }, mods: [{ kind: "control" }], duration: "game" }] : null;
  }
  // Threaten: "Untap target creature and gain control of it until end of turn" (Spinal Embrace without a duration: for as
  // long as it stays on the battlefield, CR 611.2a).
  if ((m = /^Untap ((?:another )?target .+?) and gain control of it( until end of turn)?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "untap", what }, { type: "continuous", what, mods: [{ kind: "control" }], duration: m[2] ? "endOfTurn" : "game" }] : null;
  }
  // Ray of Command: "When you lose control of the creature, tap it." A delayed trigger about the creature it took control
  // of (CR 603.7): it taps when the control effect ends or another player takes it (rulings).
  // Ogre Geargrabber: "When you lose control of that Equipment, unattach it" (CR 701.3d), from whatever it's attached to
  // then, for any reason it's lost (rulings).
  // Stolen Uniform: "When you lose control of that Equipment this turn, if it's attached to a creature you control,
  // unattach it": for the rest of this turn only, as control ends in the cleanup step too (rulings).
  if ((m = /^When you lose control of (the creature|the artifact|it|that creature|that artifact|that Equipment)( this turn)?, (if it's attached to a creature you control, )?(tap|unattach) it$/i.exec(s))) {
    const equipment = /Equipment$/.test(m[1]!);
    const of = equipment ? (ctx.spell ? parseObject(m[1]!, ctx) : ctx.lastObjectTarget !== undefined ? { ref: "target" as const, index: ctx.lastObjectTarget } : null) : parseObject(m[1]!.replace(/^the /i, "that "), ctx) ?? parseObject("it", ctx);
    const tap = m[4]!.toLowerCase() === "tap";
    if (m[3] && tap) return null;
    return of?.ref === "target"
      ? [{ type: "delayed", when: "lostControl", of, effects: [tap ? { type: "tap", what: { ref: "subject" } } : { type: "unattach", what: { ref: "subject" }, ...(m[3] ? { ifAttachedToYours: true as const } : {}) }], text: `${m[3] ?? ""}${m[4]!.toLowerCase()} it`, ...(m[2] ? { thisTurn: true as const } : {}) }]
      : null;
  }
  // Initiate of Blood: "When that creature dies this turn, flip ~." A delayed trigger about the creature it targeted
  // (CR 603.7), for the rest of this turn.
  if ((m = /^When that creature dies this turn, flip ~$/.exec(s))) {
    const of = ctx.lastObjectTarget !== undefined ? ({ ref: "target", index: ctx.lastObjectTarget } as const) : null;
    return of && !ctx.spell ? [{ type: "delayed", when: "dies", of, effects: [{ type: "flip", what: { ref: "self" } }], text: "flip ~", thisTurn: true }] : null;
  }
  // Kjeldoran Elite Guard, Heart Wolf: "{T}: Target creature gets +2/+2 until end of turn. When that creature leaves the
  // battlefield this turn, sacrifice ~." A delayed trigger about the creature it targeted (CR 603.7c, 400.7), for the rest
  // of this turn, whatever zone it goes to; ~ is this ability's source as it is now (a new object after a zone change).
  if (/^When (?:that|the) creature leaves the battlefield this turn, sacrifice ~$/.test(s) && ctx.lastObjectTarget !== undefined && !ctx.spell && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]?.many)
    return [{ type: "delayed", when: "leaves", of: { ref: "target", index: ctx.lastObjectTarget }, effects: [{ type: "sacrifice", what: { ref: "self" } }], text: "sacrifice ~", thisTurn: true }];
  // War Barge: "{3}: Target creature gains islandwalk until end of turn. When ~ leaves the battlefield this turn, destroy
  // that creature. A creature destroyed this way can't be regenerated.": a delayed trigger watching this ability's source as
  // it is now, whatever zone it goes to, for the rest of this turn (CR 603.7c, 400.7), about the creature it targeted.
  if (/^When ~ leaves the battlefield this turn, destroy that creature$/.test(s) && ctx.activated && !ctx.spell && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]?.many)
    return [{ type: "delayed", when: "leaves", of: { ref: "self" }, about: ctx.lastObjectTarget, effects: [{ type: "destroy", what: { ref: "subject" } }], text: "destroy that creature", thisTurn: true }];
  // Barreling Attack: "When that creature becomes blocked this turn, it gets +1/+1 until end of turn for each creature
  // blocking it": a delayed trigger about the target (CR 603.7), its blockers counted as it resolves (rulings).
  if ((m = /^When that creature becomes blocked this turn, it gets ([+-]\d+)\/([+-]\d+) until end of turn for each creature blocking it$/.exec(s)) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]?.many)
    return [{ type: "delayed", when: "becomesBlocked", of: { ref: "target", index: ctx.lastObjectTarget }, effects: [{ type: "pumpPerBlocker", what: { ref: "subject" }, power: Number(m[1]), toughness: Number(m[2]), beyondFirst: false }], text: `it gets ${m[1]}/${m[2]} until end of turn for each creature blocking it`, thisTurn: true }];
  // Golden Guardian: "{2}: ~ fights another target creature you control. When ~ dies this turn, return it to the battlefield
  // transformed under your control": a delayed trigger about ~ as it is when the ability resolves (CR 603.7c, 400.7), for
  // the rest of the turn, whatever kills it (rulings: none if it left before then); back face up (CR 712.14a).
  if (/^When ~ dies this turn, return it to the battlefield transformed under your control$/.test(s) && ctx.activated && !ctx.spell)
    return [{ type: "delayed", when: "dies", of: { ref: "self" }, effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "graveyard" }, transformed: true }], text: "return it to the battlefield transformed under your control", thisTurn: true }];
  // Rushed Rebirth: "Choose target creature. When that creature dies this turn, search your library for a creature card
  // with lesser mana value, put it onto the battlefield tapped, then shuffle." A delayed trigger about the target (CR
  // 603.7), for the rest of this turn; lesser than its mana value as it last existed (CR 608.2h), an X in either counted
  // as 0 (rulings, CR 202.3b); with a mana value 0 creature nothing can be found.
  if ((m = /^When that creature dies this turn, search your library for (an? [a-z ]+ card) with lesser mana value, put it onto the battlefield( tapped)?, then shuffle$/.exec(s)) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]?.many) {
    const found = parseSentence(`Search your library for ${m[1]!}, put it onto the battlefield${m[2] ?? ""}, then shuffle`, ctx);
    const e = found?.length === 1 ? found[0]! : null;
    if (e?.type !== "search" || !e.filter || e.filter.bound || e.filter.manaValue) return null;
    const filter: TargetSpec = { ...e.filter, bound: { key: "manaValue", at: "most", amount: { count: { kind: "manaValue", of: { ref: "subject" } }, plus: -1, signed: true } }, text: `${e.filter.text} with lesser mana value` };
    return [{ type: "delayed", when: "dies", of: { ref: "target", index: ctx.lastObjectTarget }, effects: [{ ...e, filter }], text: s.replace(/^When that creature dies this turn, /, ""), thisTurn: true }];
  }
  // Heroic Sacrifice: "When that creature dies this turn, put its counters on up to one target creature you control and
  // draw a card": a delayed trigger about the target (CR 603.7) with a target of its own, chosen as it's put on the stack
  // (CR 603.3d); as many of each kind of counter as the creature had as it last existed, put on (CR 608.2h), and the draw
  // either way.
  if (/^When that creature dies this turn, put its counters on up to one target creature you control and draw a card$/.test(s) && ctx.spell && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]?.many) {
    const inner = parseBody("Put those counters on up to one target creature you control. Draw a card.", { subjectLeft: true });
    if (!inner || inner.targets.length !== 1 || inner.effects.length !== 2 || inner.effects[0]!.type !== "lastKnownCounters") return null;
    return [{ type: "delayed", when: "dies", of: { ref: "target", index: ctx.lastObjectTarget }, effects: inner.effects, targets: inner.targets, lkiCounters: true, text: "put its counters on up to one target creature you control and draw a card", thisTurn: true }];
  }
  // Together Forever: "When that creature dies this turn, return that card to its owner's hand": the card it became in
  // the graveyard (CR 400.7, 603.7c).
  if (/^When that creature dies this turn, return that card to its owner's hand$/.test(s) && ctx.lastObjectTarget !== undefined)
    return [{ type: "delayed", when: "dies", of: { ref: "target", index: ctx.lastObjectTarget }, effects: [{ type: "bounce", what: { ref: "subjectCard", zone: "graveyard" } }], text: "return that card to its owner's hand", thisTurn: true }];
  // Kelsien, the Plague: "When that creature dies this turn, you get an experience counter": a delayed trigger about the
  // creature it targeted (CR 603.7), for the rest of this turn, with an effect that doesn't refer to that creature.
  // A spell's too (Scarblade's Malice: "When that creature dies this turn, create a 2/2 black and green Elf creature
  // token"), when the instruction isn't about the spell.
  // Desperate Measures: "Target creature gets +1/-1 until end of turn. When it dies under your control this turn, draw two
  // cards": the same, only if it dies while its controller is the spell's (ev.controller, as it last existed).
  // Devouring Tendrils: "When the permanent you don't control dies this turn": the target that names it, the last one.
  if ((m = /^When (?:that creature|it|the permanent you don't control) dies( under your control)? this turn, (.+)$/.exec(s)) && ctx.lastObjectTarget !== undefined && (!/^When the permanent/.test(s) || (ctx.targets[ctx.lastObjectTarget]?.controller === "opponent" && /you don't control$/.test(ctx.targets[ctx.lastObjectTarget]!.text))) && !ctx.targets[ctx.lastObjectTarget]?.many && !(ctx.spell && /~/.test(m[2]!)) && !/\b(?:it|its|that creature|that card|target|this way)\b/i.test(m[2]!) && (/^When that/.test(s) || ctx.targets.length === ctx.lastObjectTarget + 1)) {
    // Not one that targets (Fatal Fissure's earthbend): that target would be chosen as the trigger is put on the stack.
    const of = ctx.lastObjectTarget;
    const before = ctx.targets.length;
    const inner = parseSentence(capital(m[2]!), ctx);
    return inner && ctx.targets.length === before ? [{ type: "delayed", when: "dies", of: { ref: "target", index: of }, effects: inner, text: m[2]!, thisTurn: true, ...(m[1] ? { underYourControl: true as const } : {}), ...(/^When the permanent/.test(s) ? { anyPermanent: true as const } : {}) }] : null;
  }
  // Xira, the Golden Sting: "When that creature dies, if it has an egg counter on it, draw a card and create ...": a delayed
  // trigger about the creature it targeted, for as long as it's that object (CR 603.7c, 400.7), even after ~ leaves
  // (rulings); its intervening if checked as it last existed (CR 603.4, 603.10a).
  if ((m = new RegExp(`^When that creature dies, if it has an? ${COUNTER} counter on it, (.+)$`).exec(s)) && ctx.lastObjectTarget !== undefined && !ctx.spell && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]?.many && !/\b(?:it|its|that creature|that card|target|this way|~)\b/i.test(m[2]!)) {
    const before = ctx.targets.length;
    // "Draw a card and create ...": both instructions.
    const parts = /^(draw a card) and (create .+)$/.exec(m[2]!)?.slice(1) ?? [m[2]!];
    const fx = parts.map((x) => parseSentence(capital(x), ctx));
    const inner = fx.every((x) => !!x) ? fx.flatMap((x) => x!) : null;
    return inner && ctx.targets.length === before ? [{ type: "delayed", when: "dies", of: { ref: "target", index: ctx.lastObjectTarget }, effects: inner, text: m[2]!, ifHadCounter: counterKind(m[1]!) }] : null;
  }
  // Virulent Wound: "When that creature dies this turn, its controller gets a poison counter": the player who controlled
  // it as it last existed on the battlefield (CR 603.10a, 608.2h).
  if (/^When that creature dies this turn, its controller gets a poison counter$/.test(s) && ctx.lastObjectTarget !== undefined && !ctx.targets[ctx.lastObjectTarget]?.many)
    return [{ type: "delayed", when: "dies", of: { ref: "target", index: ctx.lastObjectTarget }, effects: [{ type: "poison", who: { ref: "subjectController" }, n: 1 }], text: "its controller gets a poison counter", thisTurn: true }];
  // Burn Away: "When that creature dies this turn, exile its controller's graveyard": that player's, the one who
  // controlled it as it last existed on the battlefield (CR 603.10a), its own card included.
  if (/^When that creature dies this turn, exile its controller's graveyard$/.test(s) && ctx.lastObjectTarget !== undefined && !ctx.targets[ctx.lastObjectTarget]?.many)
    return [{ type: "delayed", when: "dies", of: { ref: "target", index: ctx.lastObjectTarget }, effects: [{ type: "exileGraveyard", who: { ref: "subjectController" } }], text: "exile its controller's graveyard", thisTurn: true }];
  // Adarkar Valkyrie: "{T}: When target creature other than ~ dies this turn, return that card to the battlefield under
  // your control": a delayed trigger about the target (CR 603.7), the card it became in the graveyard (CR 400.7); a token
  // doesn't return (rulings).
  // Cryptek: "Choose another target artifact creature you control. When that creature dies this turn, return it to the
  // battlefield tapped under your control" (rewritten in body.ts): the same, tapped.
  if ((m = /^When (another target (?:artifact )?creature(?: you control)?|target creature) dies this turn, return that card to the battlefield( tapped)? under your control$/.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "delayed", when: "dies", of: what, effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "graveyard" }, ...(m[2] ? { tapped: true } : {}) }], text: `return that card to the battlefield${m[2] ?? ""} under your control`, thisTurn: true }] : null;
  }
  // Graceful Reprieve: "When target creature dies this turn, return that card to the battlefield under its owner's
  // control": the same, for its owner (CR 110.2); once only, a token doesn't return (rulings).
  if (/^When target creature dies this turn, return that card to the battlefield under its owner's control$/.test(s)) {
    const what = parseObject("target creature", ctx);
    return what?.ref === "target" && !what.n ? [{ type: "delayed", when: "dies", of: what, effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "graveyard" }, owner: true }], text: "return that card to the battlefield under its owner's control", thisTurn: true }] : null;
  }
  // Saffi Eriksdotter: "Sacrifice ~: When target creature is put into your graveyard this turn, return that card to the
  // battlefield": the same, only if it goes to your graveyard, so only one you own (CR 404.1, 400.3). Returned under your
  // control, the player putting it there, who owns it (CR 110.2). Once: back on the battlefield it's a new object (rulings).
  if (/^When target creature is put into your graveyard this turn, return that card to the battlefield$/.test(s) && !ctx.spell) {
    const what = parseObject("target creature", ctx);
    return what?.ref === "target" && !what.n ? [{ type: "delayed", when: "dies", of: what, effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "graveyard" } }], text: "return that card to the battlefield", thisTurn: true, intoYourGraveyard: true }] : null;
  }
  // Wight: "Whenever a creature dealt damage by ~ this turn dies, create a ... token and exile that card": the card it
  // became in the graveyard (CR 400.7), the trigger's subject.
  if (/^[Ee]xile that card$/.test(s) && ctx.subjectLeft && ctx.lastObjectTarget === undefined) return [{ type: "exile", what: { ref: "subjectCard" } }];
  // Removal and tapping. Not a blink ("Exile target creature you control, then return that card ...", sentences/tokens.ts).
  if (!/^Exile [^,]+, then return /i.test(s) && (m = /^(Destroy|Exile|Tap|Untap) ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|up to (?:seven|eight|nine|ten) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?|up to twice X )?target .+|all .+|each .+|~|~ and (?:each|all) .+|it|that creature|that permanent|that land|that artifact|them|those creatures|those permanents|those lands|the chosen creatures|enchanted \w+|equipped \w+|any of them that are [A-Z][a-z]+s)$/i.exec(s))) {
    let what = parseObject(m[2]!, ctx);
    if (!what) return null;
    // "Create a token that's a copy of it .... Then exile all other Nightmare tokens you control" (Abyssal Harvester): other
    // than the token just created (rulings).
    if (what.ref === "each" && what.other && ctx.lastCreated && /^all other .+ tokens you control$/i.test(m[2]!)) {
      const { other: _, ...rest } = what;
      what = { ...rest, notCreated: true };
    }
    const type = ({ destroy: "destroy", exile: "exile", tap: "tap", untap: "untap" } as const)[m[1]!.toLowerCase() as "destroy" | "exile" | "tap" | "untap"];
    if ((type === "tap" || type === "untap") && (what.ref === "each" || what.ref === "blockHistory")) ctx.lastGroup = what;
    return [{ type, what }];
  }
  // Connive (CR 701.50): "~ connives", "it connives", "target creature you control connives", "connives X".
  if ((m = new RegExp(`^(.+?) connives?(?: ${NUMX})?$`, "i").exec(s))) {
    const what = parseObject(m[1]!.replace(/^(he|she)$/i, "it"), ctx);
    return what && !isGroup(what) ? [{ type: "connive", what, n: m[2] ? amt(m[2]) : 1 }] : null;
  }
  // "All creatures able to block target creature this turn do so" (a blocking requirement, CR 509.1c). Only the
  // defending player's creatures can block it, so "creatures your opponents control" is the same.
  if ((m = /^All creatures (?:your opponents control )?able to block (target creature|it|that creature|~) this turn do so$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "continuous", what, mods: [{ kind: "allMustBlock" }], duration: "endOfTurn" }] : null;
  }
  // "Target creature blocks ~ this turn if able" (Matsu-Tribe Decoy), "target creature defending player controls blocks
  // it this combat if able" in ~'s own attack trigger: a blocking requirement (CR 509.1c), like provoke's.
  if ((m = /^((?:up to one )?target .+?) blocks (~|it) this (turn|combat) if able$/i.exec(s)) && (m[2] === "~" || ctx.selfIt)) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "mustBlockSource", what, ...(m[3] === "turn" ? { thisTurn: true as const } : {}) }] : null;
  }
  // Fighter Class: "Whenever a creature you control attacks, up to one target creature blocks it this combat if able":
  // the attacking creature (the trigger's subject). Tolsimir, Midnight's Light: "blocks that Wolf this combat if able".
  // Grappling Hook: "Whenever equipped creature attacks, you may have target creature block it this turn if able": the
  // creature equipped as it triggered (rulings), for the rest of the turn.
  if ((m = /^((?:[Uu]p to one )?[Tt]arget .+?) blocks (?:it|that [A-Z][a-z]+) this (combat|turn) if able$/.exec(s)) && ctx.subjectIt && (/ blocks it /.test(s) || CREATURE_TYPES.has(/ blocks that ([A-Z][a-z]+) /.exec(s)?.[1] ?? ""))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "mustBlockSource", what, attacker: { ref: "subject" }, ...(m[2] === "turn" ? { thisTurn: true as const } : {}) }] : null;
  }
  // "Target creature can't block ~ this turn" (Duct Crawler, Burning-Tree Bloodscale).
  if ((m = /^(target .+?) can't block (~|it) this turn$/i.exec(s)) && (m[2] === "~" || ctx.selfIt)) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "cantBlockSource", what }] : null;
  }
  // "Target creature blocks target creature this turn if able" (Rimehorn Aurochs): the first must block the second if
  // able; if it can't, it's free to block as it likes (rulings).
  if (/^Target creature blocks target creature this turn if able$/.test(s)) {
    const what = parseObject("target creature", ctx);
    const attacker = what && parseObject("target creature", ctx);
    return what?.ref === "target" && attacker?.ref === "target" ? [{ type: "mustBlockSource", what, attacker, thisTurn: true }] : null;
  }
  // Feral Contest: "Put a +1/+1 counter on target creature you control. Another target creature blocks it this turn if
  // able"; Monstrous Step: "Up to one other target creature blocks it this turn if able": the target before as the
  // attacker it must block if able (CR 509.1c), as for Rimehorn Aurochs.
  if ((m = /^(Another|Up to one other) target creature blocks it this turn if able$/.exec(s)) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]!.optional) {
    const prev = ctx.lastObjectTarget;
    const spec = parseTargetPhrase("creature");
    if (spec?.kind !== "object") return null;
    const index = addTarget(ctx, { ...spec, distinctFrom: [prev], ...(m[1] !== "Another" ? { optional: true as const } : {}), text: `${m[1]!.toLowerCase()} target creature` });
    return [{ type: "mustBlockSource", what: { ref: "target", index }, attacker: { ref: "target", index: prev }, thisTurn: true }];
  }
  // "Target creature blocks this turn if able": any attacking creature (CR 509.1c).
  // Call for Aid: "You can't attack that player this turn": the target opponent, not their planeswalkers (CR 506.2), and
  // "You can't sacrifice those creatures this turn": the ones it gained control of, for a cost or by an effect (rulings).
  if (/^You can't attack that player this turn$/.test(s) && ctx.spell) {
    const that = parsePlayer("that player", ctx);
    return that?.ref === "target" ? [{ type: "attackBanThisTurn", who: { ref: "you" }, protects: that }] : null;
  }
  if (/^You can't sacrifice those creatures this turn$/.test(s) && ctx.spell) {
    const what = parseObject("those creatures", ctx);
    return what?.ref === "affected" ? [{ type: "continuous", what, mods: [{ kind: "cantBeSacrificedBy", player: "you" }], duration: "endOfTurn" }] : null;
  }
  // Domineering Will: "They block this turn if able": the creatures the sentence before named (those creatures).
  if ((m = /^(target .+?|it|that creature|each creature(?: your opponents control)?) blocks this turn if able$/i.exec(s)) || (m = /^(those creatures|they) block this turn if able$/i.exec(s))) {
    const what = parseObject(/^they$/i.test(m[1]!) ? "those creatures" : m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "mustBlock" }], duration: "endOfTurn" }] : null;
  }
  // Earthbend N (CR 701.66a): "target land you control becomes a 0/0 land creature with haste ...". Each instance has its
  // own target, which may be the same land (rulings).
  if ((m = /^(?:you )?earthbend (\d+|X)$/i.exec(s))) {
    const what = parseObject("target land you control", ctx);
    return what?.ref === "target" ? [{ type: "earthbend", what, n: amt(m[1]!) }] : null;
  }
  // Recruit (CR 701.70a): "recruit", "you recruit".
  if (/^(?:you )?recruit$/i.test(s)) return [{ type: "recruit" }];
  // "If that creature would die this turn, exile it instead" (CR 614.1a), for what an earlier sentence targeted
  // or damaged: "If a creature dealt damage this way would die this turn, exile it instead".
  if ((m = /^If (that creature|that permanent|that creature or planeswalker|that planeswalker|an? (?:creature|permanent) dealt damage this way) would die this turn, exile it instead$/i.exec(s))) {
    const what: ObjRef | null = / this way$/.test(m[1]!) ? { ref: "damagedThisWay" } : parseObject(m[1]!.startsWith("that creature") ? "that creature" : "that permanent", ctx);
    return what ? [{ type: "exileIfDies", what }] : null;
  }
  // Unnatural Aggression: "If the creature an opponent controls would die this turn, exile it instead": the one target an
  // opponent controls, even if it survives the fight and would die later this turn (rulings).
  if (/^If the creature an opponent controls would die this turn, exile it instead$/.test(s)) {
    const idx = ctx.targets.flatMap((t, i) => (t.kind === "object" && t.controller === "opponent" && t.types?.includes("Creature") && !t.many && !t.optional ? [i] : []));
    return idx.length === 1 && ctx.targets.length === 2 ? [{ type: "exileIfDies", what: { ref: "target", index: idx[0]! } }] : null;
  }
  if (/^If a creature would die this turn, exile it instead$/.test(s)) return [{ type: "exileDyingThisTurn" }];
  // Mistcaller: "Until end of turn, if a nontoken creature would enter and it wasn't cast, exile it instead" (CR 614.1a),
  // Containment Priest's replacement for the rest of the turn, from any zone but the stack (rulings).
  if (/^(?:Until end of turn, if a nontoken creature would enter and it wasn't cast, exile it instead|If a nontoken creature would enter and it wasn't cast, exile it instead until end of turn)$/.test(s)) return [{ type: "exileUncastThisTurn" }];
  // Malicious Eclipse: "If a creature an opponent controls would die this turn, exile it instead": only those an opponent of
  // the spell's controller controls as they would die (CR 614.1a).
  if (/^If a creature an opponent controls would die this turn, exile it instead$/.test(s)) return [{ type: "exileDyingThisTurn", opponentsOfYou: true }];
  // Shadow of Doubt: effects that use the word "search" do nothing this turn; "then shuffle" still shuffles (rulings).
  if (/^Players can't search libraries this turn$/.test(s)) return [{ type: "noSearchThisTurn" }];
  // "Return target creature card from your graveyard to the battlefield. ... If it would leave the battlefield, exile it
  // instead of putting it anywhere else." (Whip of Erebos): a replacement effect for as long as it's that permanent (CR
  // 614.1a, 400.7), from the resolved ability, so it doesn't go away if the permanent loses its abilities.
  if ((m = /^If (it|that creature) would leave the battlefield, exile it instead of putting it anywhere else$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && (what.ref === "created" || (what.ref === "target" && !what.n)) ? [{ type: "exileIfLeaves", what }] : null;
  }
  // "Target creature can't be regenerated this turn", "It can't be regenerated this turn", "A creature dealt damage this
  // way can't be regenerated this turn" (CR 701.19c).
  if ((m = /^(.+?) can't be regenerated this turn$/i.exec(s))) {
    const what: ObjRef | null = /^(?:an? creature|creatures) dealt damage this way$/i.test(m[1]!) ? { ref: "damagedThisWay" } : parseObject(m[1]!, ctx);
    return what && (!isGroup(what) || /^creatures dealt/i.test(m[1]!)) ? [{ type: "noRegen", what }] : null;
  }
  // "If it's a creature, it can't be regenerated this turn, and if it would die this turn, exile it instead" (Carbonize,
  // Disintegrate): about the target of "any target", only if it's a creature.
  // Scorching Lava: "If ~ was kicked, that creature can't be regenerated this turn and if it would die this turn, exile it
  // instead": "that creature" is the "any target" if it's a creature, the same.
  if (/^(?:If it's a creature, it can't be regenerated this turn, and|that creature can't be regenerated this turn and) if it would die this turn, exile it instead$/i.test(s)) {
    const i = ctx.targets.length - 1;
    if (ctx.targets[i]?.kind !== "any") return null;
    const what: ObjRef = { ref: "target", index: i };
    return [{ type: "noRegen", what, ifCreature: true }, { type: "exileIfDies", what, ifCreature: true }];
  }
  // Tamiyo's Compleation (rewritten in body.ts): the enchanted permanent, if it's an Equipment as this resolves (CR 701.3d).
  if (s === "Unattach enchanted permanent if it's an Equipment") return [{ type: "unattach", what: { ref: "attached" }, ifEquipment: true }];
  // Disarm: "Unattach all Equipment from target creature": they stay on the battlefield, attached to nothing (CR 701.3d).
  // Fulgent Distraction: "Tap two target creatures, then unattach all Equipment from them": from both.
  if ((m = /^Unattach all Equipment from (target creature|them)$/.exec(s))) {
    const what = parseObject(`all Equipment attached to ${m[1]}`, ctx);
    return what ? [{ type: "unattach", what }] : null;
  }
  // "~ assigns no combat damage this turn" (CR 510.1): the Laccoliths, Ophidian.
  if ((m = /^(.+?) assigns no combat damage this (turn|combat)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "noCombatDamage", what, ...(m[2] === "combat" ? { combat: true as const } : {}) }] : null;
  }
  // Bontu's Last Reckoning: "Lands you control don't untap during your next untap step"; Mana Vapors: "Lands target player
  // controls don't untap during their next untap step"; Exhaustion: "Creatures and lands target opponent controls ...":
  // whatever of those that player controls when that step comes, also ones they got since (Mana Vapors rulings). Misstep:
  // "Creatures target player controls don't untap during that player's next untap step" (also ones that entered since, rulings).
  // Icebreaker Kraken: "Artifacts and creatures target opponent controls don't untap during that player's next untap step":
  // the same, also ones they didn't control as it resolved (rulings).
  if ((m = /^([Ll]ands|[Cc]reatures|[Cc]reatures and lands|[Aa]rtifacts and creatures) (you control|target player controls|target opponent controls) don't untap during (your|their|that player's) next untap step$/.exec(s)) && (m[2] === "you control") === (m[3] === "your")) {
    const who = m[2] === "you control" ? { ref: "you" as const } : parsePlayer(m[2]!.replace(/ controls$/, ""), ctx);
    const kinds = m[1]!.toLowerCase();
    return who ? [{ type: "noUntapNext", who, types: kinds === "lands" ? ["Land"] : kinds === "creatures" ? ["Creature"] : kinds === "artifacts and creatures" ? ["Artifact", "Creature"] : ["Creature", "Land"] }] : null;
  }
  // Blinding Beam: "Creatures don't untap during target player's next untap step": every creature during that step,
  // another player's too (one that would untap then, like with Seedborn Muse), also ones that entered since (rulings).
  if ((m = /^Creatures don't untap during (target player's|target opponent's) next untap step$/.exec(s))) {
    const who = parsePlayer(m[1]!.replace(/'s$/, ""), ctx);
    return who ? [{ type: "noUntapNext", who, types: ["Creature"], all: true }] : null;
  }
  // Imaginary Threats: "Creatures target opponent controls attack this turn if able. During that player's next untap step,
  // creatures they control don't untap.": the targeted player's, every creature they control then (rulings).
  if (/^During that player's next untap step, creatures they control don't untap$/.test(s) && ctx.lastPlayerTarget !== undefined) return [{ type: "noUntapNext", who: { ref: "target", index: ctx.lastPlayerTarget }, types: ["Creature"] }];
  // Pollen Lullaby: "If you win, creatures that player controls don't untap during the player's next untap step": the
  // opponent clashed with, whatever creatures they control when that step comes, as for Misstep.
  if (/^Creatures that player controls don't untap during the player's next untap step$/.test(s) && ctx.clashOpp) return [{ type: "noUntapNext", who: { ref: "clashOpponent" }, types: ["Creature"] }];
  // "That creature doesn't untap during its controller's next untap step", "Those creatures don't untap during their controllers' next untap steps"
  // Telekinesis: "It doesn't untap during its controller's next two untap steps": the next two it would untap in.
  if ((m = /^(.+?) (?:doesn't|don't|do not|does not) untap during (?:its controller's|their controllers?'s?|your) next (two )?untap steps?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    // "Tap all creatures your opponents control. Those creatures don't untap ..." (Cone of Cold): the group just tapped.
    const tapped = what && what === ctx.lastGroup && /^(?:those creatures|they)$/i.test(m[1]!);
    // Tangle: "Each attacking creature doesn't untap during its controller's next untap step": those attacking as it
    // resolves (CR 611.2c).
    // Spore Cloud: "each blocking creature" the same.
    const attackers = /^each (?:attacking|blocking) creature$/i.test(m[1]!);
    return what && (!isGroup(what) || tapped || attackers) ? [{ type: "skipUntap", what, ...(m[2] ? { n: 2 } : {}) }] : null;
  }
  // Sleep: "Tap all creatures target player controls. Those creatures don't untap during that player's next untap step":
  // the creatures that player controls, so their controller's untap step.
  if ((m = /^(those creatures|they) don't untap during that player's next untap step$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const theirs = what && what === ctx.lastGroup && what.ref === "each" && what.of?.ref === "target" && ctx.targets[what.of.index]?.kind === "player";
    return what && theirs ? [{ type: "skipUntap", what }] : null;
  }
  // Change of Plans: "Each of X target creatures you control connive. You may have any number of them phase out.": the
  // targets still on the battlefield, chosen after they've all connived (rulings), none too.
  if (/^You may have any number of them phase out$/.test(s) && ctx.lastTargets) {
    const what = parseObject("them", ctx);
    return what?.ref === "target" ? [{ type: "phaseOut", what, anyNumber: true }] : null;
  }
  // Kudzu, Steam Vines: "Its controller (may) attach(es) ~ to a land of their choice": the trigger's land's controller.
  if ((m = /^Its controller (may attach|attaches) ~ to a land of their choice$/.exec(s)) && ctx.subjectIt)
    return [{ type: "attachToChosen", source: { ref: "self" }, filter: { kind: "object", types: ["Land"], notTypes: [], notColors: [], text: "a land" }, chooser: { ref: "subjectController" }, ...(m[1] === "may attach" ? { may: true as const } : {}) }];
  // Sands of Time: "that player simultaneously untaps each tapped artifact, creature, and land they control and taps each
  // untapped artifact, creature, and land they control".
  if ((m = /^(that player|you) simultaneously untaps? each tapped artifact, creature, and land (?:they|you) control and taps? each untapped artifact, creature, and land (?:they|you) control$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "toggleTapped", who, filter: { kind: "object", types: ["Artifact", "Creature", "Land"], notTypes: [], notColors: [], text: "artifact, creature, or land" } }] : null;
  }
  // Time and Tide: both lists are read first, then the two happen together (CR 702.26).
  if (/^Simultaneously, all phased-out creatures phase in and all creatures with phasing phase out$/.test(s)) return [{ type: "phaseSwap" }];
  // Phasing out (CR 702.26b): "~ phases out", "target creature phases out", "all permanents you control phase out".
  // Shape Stealer: "~'s base power and toughness become equal to that creature's power and toughness until end of turn": the
  // trigger's creature's as it resolves, locked in then (layer 7b; rulings, CR 608.2h).
  if (/^~'s base power and toughness become equal to that creature's power and toughness until end of turn$/.test(s) && ctx.subject && !ctx.subjectIt)
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "setPT", power: { count: { kind: "power", of: { ref: "subject" } } }, toughness: { count: { kind: "toughness", of: { ref: "subject" } } } }], duration: "endOfTurn" }];
  // Galion, Elvenking's Butler: "choose up to one other target creature you control. Its base power and toughness become
  // equal to ~'s power and toughness until end of turn"; Exuberant Wolfbear: "you may have the base power and toughness of
  // target Human you control become equal to ~'s power and toughness until end of turn"; Unruly Krasis: "... become X/X
  // until end of turn, where X is ~'s power". ~'s actual power and toughness as this resolves, locked in then (as it last
  // existed if it has left, rulings; CR 608.2h), in layer 7b (CR 613.4b); the "you may" is chosen as it resolves (rulings).
  const ptOfSelf = (): Modification => ({ kind: "setPT", power: { count: { kind: "power", of: { ref: "self" } } }, toughness: { count: { kind: "toughness", of: { ref: "self" } } } });
  if (/^(?:Its|That creature's) base power and toughness become equal to ~'s power and toughness until end of turn$/.test(s) && !ctx.spell && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]?.many)
    return [{ type: "continuous", what: { ref: "target", index: ctx.lastObjectTarget }, mods: [ptOfSelf()], duration: "endOfTurn" }];
  // (body.ts turns "You may have the base power and toughness of X become ..." into a may of "The base power and toughness
  // of X becomes ...".)
  if ((m = /^The base power and toughness of ((?:another )?target [a-zA-Z ]+? you control) becomes (equal to ~'s power and toughness|X\/X) until end of turn$/.exec(s)) && !ctx.spell && ctx.mayNow && (m[2] === "X/X") === !!ctx.whereX) {
    const what = parseObject(m[1]!, ctx);
    if (what?.ref !== "target" || what.n) return null;
    // "X/X ..., where X is ~'s power": the X the "where" defines, both numbers (body.ts defineX).
    return [{ type: "continuous", what, mods: [m[2] === "X/X" ? { kind: "setPT", power: X, toughness: X } : ptOfSelf()], duration: "endOfTurn" }];
  }
  // Master of Winds: "you may have ~'s base power and toughness become 4/1 or 1/4 until end of turn": either one or neither,
  // chosen as it resolves (rulings), in layer 7b (CR 613.4b). (The may is body.ts's, as above.)
  if ((m = /^~'s base power and toughness becomes (\d+)\/(\d+) or (\d+)\/(\d+) until end of turn$/.exec(s)) && !ctx.spell && ctx.mayNow) {
    const pt = (p: string, t: string): Effect[] => [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "setPT", power: Number(p), toughness: Number(t) }], duration: "endOfTurn" }];
    return [{ type: "either", options: [pt(m[1]!, m[2]!), pt(m[3]!, m[4]!)], labels: [`${m[1]}/${m[2]}`, `${m[3]}/${m[4]}`] }];
  }
  // Tanazir Quandrix: "the base power and toughness of other creatures you control become equal to ~'s power and toughness
  // until end of turn": its actual power and toughness as this resolves, locked in then (rulings, CR 608.2h), in layer 7b
  // (CR 613.4b), for the creatures there then (CR 611.2c).
  if ((m = /^(?:have )?the base power and toughness of (other creatures you control) become equal to ~'s power and toughness until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    if (what?.ref !== "each") return null;
    return [{ type: "continuous", what, mods: [{ kind: "setPT", power: { count: { kind: "power", of: { ref: "self" } } }, toughness: { count: { kind: "toughness", of: { ref: "self" } } } }], duration: "endOfTurn" }];
  }
  // Dream Fighter: "Whenever ~ blocks or becomes blocked by a creature, ~ and that creature phase out": both, as it resolves.
  // Temporal Firestorm (as parseBody joins it): "up to X creatures and/or planeswalkers you control" chosen as it resolves,
  // not targeted, then they phase out (CR 702.26).
  if (/^Up to X creatures and\/or planeswalkers you control of your choice phase out$/.test(s))
    return [{ type: "pick", who: { ref: "you" }, filter: { kind: "object", types: [], notTypes: [], notColors: [], anyOf: [{ kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" }, { kind: "object", types: ["Planeswalker"], notTypes: [], notColors: [], text: "planeswalker" }], text: "creature or planeswalker" }, n: X, action: "choose", upTo: true, prompt: "choose creatures and/or planeswalkers you control to phase out, up to one for each time ~ was kicked" }, { type: "phaseOut", what: { ref: "created" } }];
  if (/^~ and that creature phase out$/.test(s) && ctx.subject && !ctx.subjectIt) return [{ type: "phaseOut", what: { ref: "self" } }, { type: "phaseOut", what: { ref: "subject" } }];
  if ((m = /^(.+?) phases? out$/i.exec(s))) {
    const what = parseObject(m[1]!.replace(/^(he|she)$/i, "it"), ctx);
    return what ? [{ type: "phaseOut", what }] : null;
  }
  // Endure N (CR 701.63a): "~ endures 2", "it endures X, where X is ...".
  if ((m = /^(~|it|that creature) endures (\d+|X)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "endure", what, n: amt(m[2]!) }] : null;
  }
  // Biomancer's Familiar: "The next time target creature adapts this turn, it adapts as though it had no +1/+1
  // counters on it" (CR 701.46a: adapting normally does nothing if it has any).
  if ((m = /^The next time (target creature) adapts this turn, it adapts as though it had no \+1\/\+1 counters on it$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "adaptFresh", what }] : null;
  }
  // Adapt N (CR 701.46a), Monstrosity N (CR 701.37a): only the permanent's own activated abilities do it.
  if ((m = /^(Adapt|Monstrosity) (\d+|X)$/.exec(s))) return ctx.activated ? [{ type: m[1] === "Adapt" ? "adapt" : "monstrosity", n: amt(m[2]!) }] : null;
  // Regeneration (CR 701.19a)
  // "Regenerate each creature you control" (Golgari Charm): a shield for each, as it resolves (CR 701.19a, 611.2c).
  // "Regenerate all Werewolf creatures you control" (Full Moon's Rise), "each other creature you control" (Dark Dabbling).
  // Experiment One: "Remove two +1/+1 counters from ~: Regenerate it.": the permanent itself, in its own activated ability.
  if (/^Regenerate it$/.test(s) && ctx.activated && !ctx.targets.length && !ctx.subject) return [{ type: "regenerate", what: { ref: "self" } }];
  // Duskworker: "Whenever ~ becomes blocked, regenerate it.": ~ itself, in its own trigger.
  if (/^[Rr]egenerate it$/.test(s) && ctx.selfIt && !ctx.subjectIt && !ctx.targets.length && !ctx.subject) return [{ type: "regenerate", what: { ref: "self" } }];
  if ((m = /^Regenerate (~|(?:another )?target .+|enchanted creature|equipped creature|each (?:other )?creature you control|all (?:[A-Z][a-z]+ )?creatures you control)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "regenerate", what }] : null;
  }
  // Necrobite: "Target creature gains deathtouch until end of turn. Regenerate it.": the target before.
  if (/^Regenerate it$/.test(s) && ctx.lastObjectTarget !== undefined) return [{ type: "regenerate", what: { ref: "target", index: ctx.lastObjectTarget } }];
  // "Return each card with the most votes or tied for most votes to your hand" (Custodi Squire): cards in your graveyard.
  if (ctx.vote?.among && (m = /^Return (each card with the most votes or tied for most votes) to your hand$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "bounce", what }] : null;
  }
  // Hurkyl's Recall: "Return all artifacts target player owns to their hand".
  if ((m = /^Return (all .+? target player owns) to their hand$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" && what.ofOwner ? [{ type: "bounce", what }] : null;
  }
  // Scarab of the Unseen: "Return all Auras attached to target permanent you own to their owners' hands": the Auras, not the
  // permanent (as Street Sweeper's "destroy all Auras attached to target land").
  if ((m = /^Return (all (?:Auras|Equipment) attached to target [a-z ]+) to their owners' hands$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && what.attachedToo?.only ? [{ type: "bounce", what }] : null;
  }
  if ((m = /^Return ((?:all|each) .+?) to (?:their|its) owners?'s? hands?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    // Trial: "Return all creatures blocking or blocked by target creature to their owner's hand".
    return what?.ref === "each" || (what?.ref === "inCombatWithSelf" && what.ofTarget !== undefined) ? [{ type: "bounce", what }] : null;
  }
  // Get Out: "Return one or two target creatures and/or enchantments you own to your hand": targets you own (CR 108.3),
  // to their owner's hand, yours.
  // Obelisk of Undoing: "Return target permanent you both own and control to your hand": yours both ways (CR 108.3-4).
  // Leave: "Return any number of target permanents you own to your hand" the same.
  if ((m = /^Return ((?:one or two |up to (?:one|two|three) |any number of )?target (?!.*\bspells?\b).+?) you (both own and control|own) to your hand$/.exec(s))) {
    const before = ctx.targets.length;
    const both = m[2] !== "own";
    const fx = parseSentence(`Return ${m[1]}${both ? " you control" : ""} to their owners' hands`, ctx);
    const added = ctx.targets.slice(before);
    if (!fx || !added.length || added.some((t) => t.kind !== "object" || t.owner || (both ? t.controller !== "you" : t.controller))) {
      ctx.targets.length = before;
      return null;
    }
    for (let i = before; i < ctx.targets.length; i++) ctx.targets[i] = { ...ctx.targets[i]!, owner: "you" } as typeof ctx.targets[number];
    return fx;
  }
  if (!/^Return (?:up to one )?target (?:[a-z]+ )*spell(?: you don't control| an opponent controls| or [^,]+)? to/i.test(s) && (m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+?|~|it|that card|that creature|those creatures|enchanted creature|equipped creature) to (?:its owner's hand|their owners' hands|their owner's hand)$/i.exec(s))) {
    // Nullmage Advocate: "two target cards from an opponent's graveyard" (zones.ts), cards in a graveyard.
    const what = parseObject(m[1]!, ctx, /^two target cards from an opponent's graveyard$/.test(m[1]!));
    return what ? [{ type: "bounce", what }] : null;
  }
  // Counters
  // "Put a flying counter on ~ and ~ becomes a Spirit Warrior Angel with base power and toughness 4/4", "Put two +1/+1
  // counters on ~ and ~ gains ...": one instruction after the other.
  if ((m = /^(Put .+? counters? on ~) and (~ (?:becomes?|gains?) .+)$/.exec(s)) && !ctx.spell) {
    const first = parseSentence(m[1]!, ctx);
    const second = first && parseSentence(m[2]!, ctx);
    if (first && second) return [...first, ...second];
  }
  // "Put a +1/+1 counter and an indestructible counter on ~", "Put two +1/+1 counters and a flying counter on ~": both
  // kinds at once, one after the other here.
  if ((m = new RegExp(`^Put (${NUMX} ${COUNTER} counters?) and (${NUMX} ${COUNTER} counters?) on ~$`, "i").exec(s))) {
    const first = parseSentence(`Put ${m[1]} on ~`, ctx);
    const second = first && parseSentence(`Put ${m[4]} on ~`, ctx);
    if (first && second) return [...first, ...second];
  }
  // "Put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature" (Gift of the Viper): each kind
  // in turn, on the same permanent. "... on that creature" (Abigale, Eloquent First-Year): the one an earlier sentence named.
  const list = new RegExp(`^Put ((?:${NUMX} ${COUNTER} counters?, )+)and (${NUMX} ${COUNTER} counters?) on (target .+|~|that creature)$`, "i").exec(s);
  if (list) {
    const kinds = [...list[1]!.split(", ").filter(Boolean), list[4]!];
    const before = ctx.targets.length;
    const out: Effect[] = [];
    const targeted = /^target /i.test(list[7]!);
    for (const [i, k] of kinds.entries()) {
      const fx = parseSentence(`Put ${k} on ${i === 0 || !targeted ? list[7] : "it"}`, ctx);
      if (!fx || (i === 0 && targeted && (ctx.targets.length !== before + 1 || ctx.lastObjectTarget !== before))) {
        ctx.targets.length = before;
        return null;
      }
      out.push(...fx);
    }
    return out;
  }
  // "Put a +1/+1 counter and a lifelink counter on that creature and a +1/+1 counter and a lifelink counter on ~"
  // (Arwen, Mortal Queen): the first on that creature, then the rest on ~.
  if ((m = /^Put (.+? counters?) on (that creature|it) and (an? .+? counters?|two .+? counters?) on ~$/i.exec(s))) {
    const first = parseSentence(`Put ${m[1]} on ${m[2]}`, ctx);
    const second = first && parseSentence(`Put ${m[3]} on ~`, ctx);
    if (first && second) return [...first, ...second];
  }
  // "Put a +1/+1 counter and a lifelink counter on that creature": both kinds on the same one.
  if ((m = new RegExp(`^Put (${NUMX} ${COUNTER} counters?) and (${NUMX} ${COUNTER} counters?) on (that creature|it)$`, "i").exec(s))) {
    const first = parseSentence(`Put ${m[1]} on ${m[7]}`, ctx);
    const second = first && parseSentence(`Put ${m[4]} on ${m[7]}`, ctx);
    if (first && second) return [...first, ...second];
  }
  // Elspeth Resplendent: "Put a +1/+1 counter and a counter from among flying, first strike, lifelink, or vigilance on it":
  // the kind chosen as it resolves, then both kinds, one after the other here (rulings: at the same time).
  if ((m = new RegExp(`^Put (${NUMX} ${COUNTER} counters?) and a counter from among ${COUNTER}, ${COUNTER}, ${COUNTER}, or ${COUNTER} on (that creature|it)$`, "i").exec(s)) && new Set(m.slice(4, 8)).size === 4) {
    const what = parseObject(m[8]!, ctx);
    const first = parseSentence(`Put ${m[1]} on ${m[8]}`, ctx);
    if (!what || isGroup(what) || !first) return null;
    return [{ type: "counters", what, counter: counterKind(m[4]!), orCounter: counterKind(m[5]!), orCounters: [counterKind(m[6]!), counterKind(m[7]!)], n: 1 }, ...first];
  }
  // "Put a +1/+1 counter and a lifelink counter on target creature" (Unexpected Fangs): the same on the target.
  if ((m = new RegExp(`^Put (${NUMX} ${COUNTER} counters?) and (${NUMX} ${COUNTER} counters?) on (target .+)$`, "i").exec(s))) {
    const before = ctx.targets.length;
    const first = parseSentence(`Put ${m[1]} on ${m[7]}`, ctx);
    const second = first && ctx.targets.length === before + 1 && ctx.lastObjectTarget === before ? parseSentence(`Put ${m[4]} on it`, ctx) : null;
    if (first && second) return [...first, ...second];
    ctx.targets.length = before;
  }
  // Stand Together: "Put two +1/+1 counters on target creature and two +1/+1 counters on another target creature": two
  // targets, each getting its counters.
  // Evolutionary Escalation: "... on target creature you control and three +1/+1 counters on target creature an opponent
  // controls"; River Heralds' Boon: "... and a +1/+1 counter on up to one target Merfolk" (the same creature may be both
  // targets, CR 115.3).
  if ((m = new RegExp(`^Put (${NUMX} ${COUNTER} counters?) on (target creature(?: you control)?) and (${NUMX} ${COUNTER} counters?) on (another target creature|target creature an opponent controls|up to one target Merfolk)$`, "i").exec(s))) {
    const before = ctx.targets.length;
    const first = parseSentence(`Put ${m[1]} on ${m[4]}`, ctx);
    const second = first && ctx.targets.length === before + 1 ? parseSentence(`Put ${m[5]} on ${m[8]}`, ctx) : null;
    if (first && second && ctx.targets.length === before + 2) return [...first, ...second];
    ctx.targets.length = before;
    return null;
  }
  // "Choose an artifact or creature you control. Create a token that's a copy of it" (Season of Weaving): picked as it
  // resolves, not targeted (rulings); "it" is the one picked.
  if ((m = /^Choose (an? .+?) you control$/i.exec(s))) {
    const filter = pickFilter(m[1]!.replace(/^an? /i, ""));
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "choose" }];
  }
  // Mikey & Mona, Mutant Sitters: "Target player chooses a creature they control and puts two +1/+1 counters on it": that
  // player picks one as this resolves (not targeted) and is the one putting the counters (Hapatra's "whenever you put").
  if ((m = /^([Tt]arget player|[Tt]arget opponent) chooses a creature they control and puts (a|two|three) \+1\/\+1 counters? on it$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const filter = pickFilter("creature");
    return who?.ref === "target" && filter ? [{ type: "pick", who, filter, n: 1, action: "choose" }, { type: "counters", what: { ref: "created" }, counter: "+1/+1", n: m[2] === "a" ? 1 : m[2] === "two" ? 2 : 3, by: who }] : null;
  }
  // Imperial Edict: "Target opponent chooses a creature they control. Destroy that creature.": that player picks as it
  // resolves (not targeted); "that creature" is the one picked.
  if ((m = /^([Tt]arget opponent|[Tt]arget player) chooses (an? [a-z]+) they control$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const filter = pickFilter(m[2]!.replace(/^an? /i, ""));
    return who?.ref === "target" && filter ? [{ type: "pick", who, filter, n: 1, action: "choose" }] : null;
  }
  // Riches: "Each opponent chooses a creature they control. You gain control of those creatures.": each opponent in turn
  // order picks one, not targeted (rulings), then control of all of them changes at once, indefinitely.
  if (/^Each opponent chooses a creature they control and you gain control of those creatures$/.test(s)) {
    const filter = pickFilter("creature");
    return filter ? [{ type: "pick", who: { ref: "eachOpponent" }, filter, n: 1, action: "choose" }, { type: "continuous", what: { ref: "created" }, mods: [{ kind: "control" }], duration: "game" }] : null;
  }
  // "You may tap five untapped artifacts and/or creatures you control. If you do, transform ~." (Thousand Moons Smithy):
  // picked as it resolves, not targeted, all of them or none (it can't be done with fewer, CR 101.3).
  // Tidal Terror: "tap two other untapped creatures you control"; Gravelgill Scoundrel: "tap another untapped creature you
  // control"; Redcap Raiders: "tap an untapped non-Human creature you control": not ~ itself when "other".
  if ((m = /^[Tt]ap (an?|another|two|three|four|five|six|seven)( other)? untapped (.+?) you control$/.exec(s))) {
    const one = /^(?:an?|another)$/.test(m[1]!);
    if (one === /s$/.test(m[3]!) && !/^(?:Humans?|non-Human creatures?)$/.test(m[3]!)) return null;
    const noun = one ? m[3]! : m[3]!.replace(/ and\/or /g, " or ").split(" ").map((w) => (w === "or" ? w : singular(w))).join(" ");
    const base = pickFilter(`untapped ${noun}`);
    const filter = base && (m[1] === "another" || m[2]) ? { ...base, notSource: true as const, text: `other ${base.text}` } : base;
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: one ? 1 : num(m[1]!), action: "tap" }];
  }
  // Tangle Wire: "that player taps an untapped artifact, creature, or land they control for each fade counter on ~": as
  // many as it has as this resolves (CR 608.2h), that player's choice, all of them if they have fewer (CR 101.3).
  if ((m = /^[Tt]hat player taps an untapped artifact, creature, or land they control for each ([a-z]+) counter on ~$/.exec(s))) {
    const who = parsePlayer("that player", ctx);
    const kind = counterKind(m[1]!);
    if (!who || !kind) return null;
    const filter: TargetSpec = { kind: "object", types: ["Artifact", "Creature", "Land"], notTypes: [], notColors: [], tapped: false, controller: "you", text: "untapped artifact, creature, or land they control" };
    return [{ type: "pick", who, filter, n: { count: { kind: "counters", counter: kind, of: { ref: "self" } } }, action: "tap" }];
  }
  // Zimone's Hypothesis: "Put a +1/+1 counter on a creature": any player's, picked as it resolves, not targeted. Gix's
  // Command: "Put two +1/+1 counters on up to one creature": the same, or none (rulings: chosen as it resolves).
  if ((m = /^Put (a|two|three) \+1\/\+1 counters? on (a|up to one) creature$/i.exec(s)) && (m[1] === "a") === !/counters/.test(s)) {
    const pick: Effect = { type: "pick", who: { ref: "you" }, filter: pickFilter("creature")!, n: 1, action: "counters", counter: { kind: "+1/+1", n: amt(m[1] === "a" ? "1" : m[1]!) }, anyController: true };
    return m[2] === "a" ? [pick] : [{ type: "may", effects: [pick], text: s.charAt(0).toLowerCase() + s.slice(1) }];
  }
  // SOLDIER Military Program: "Put a +1/+1 counter on each of up to two Soldiers you control": chosen as it resolves, not
  // targeted, none to two of them.
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on each of up to (two|three) (?!target )(.+?)s you control$`, "i").exec(s)) && (m[1] === "a") === !/counters/.test(s) && pickFilter(m[4]!)) {
    const filter = pickFilter(m[4]!)!;
    const counter = { kind: counterKind(m[2]!), n: amt(m[1]!) };
    return [{ type: "pick", who: { ref: "you" }, filter, n: num(m[3]!), action: "counters", counter, upTo: true, prompt: `~: click up to ${m[3]} ${m[4]}s of yours to put ${m[1] === "a" ? `a ${counter.kind} counter` : `${m[1]} ${counter.kind} counters`} on each.` }];
  }
  // "Put a +1/+1 counter on a creature you control": picked as it resolves, not targeted.
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on (an? .+?) you control$`, "i").exec(s))) {
    const filter = pickFilter(m[3]!.replace(/^an? /i, ""));
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "counters", counter: { kind: counterKind(m[2]!), n: amt(m[1]!) } }];
  }
  // Blight N (CR 701.68a): "put N -1/-1 counters on a creature you control", one creature for all of them, chosen as it
  // resolves, not targeted (rulings on High Perfect Morcant); "each opponent blights 1": each their own, in APNAP order.
  if ((m = /^(?:(.+?) )?[Bb]lights? (\d+)$/.exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    return who && [{ type: "pick", who, filter: pickFilter("creature")!, n: 1, action: "counters", counter: { kind: "-1/-1", n: amt(m[2]!) } }];
  }
  // Bolster N (CR 701.39a): "Choose a creature you control with the least toughness or tied for least toughness among
  // creatures you control. Put N +1/+1 counters on that creature." Chosen as it resolves, not targeted (rulings).
  if ((m = /^Bolster (\d+|X)$/i.exec(s))) {
    const filter = pickFilter("creature")!;
    return [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "counters", counter: { kind: "+1/+1", n: amt(m[1]!) }, least: "toughness" }];
  }
  // Lily Bowen: "remove all but one +1/+1 counter from it, then you gain 1 life for each +1/+1 counter removed this way":
  // the life is for the counters actually removed (ResolvingState.countersRemoved).
  if ((m = /^Remove all but one (\+1\/\+1) counter from (~|it)(?:, then you gain 1 life for each \+1\/\+1 counter removed this way)?$/i.exec(s))) {
    const what = parseObject(m[2]!, ctx);
    if (!what || isGroup(what)) return null;
    return [{ type: "removeCounters", what, counter: m[1]!, n: "allButOne" }, ...(/gain 1 life/.test(s) ? [{ type: "gainLife" as const, who: { ref: "you" as const }, n: { count: { kind: "countersRemovedThisWay" as const } } }] : [])];
  }
  // "Remove all counters from target permanent" (every kind), "Remove all counters from that creature".
  if ((m = /^Remove all counters from (~|it|that creature|enchanted creature|target .+|up to one target .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "removeAllCounters", what }] : null;
  }
  // Suncleanser: "It can't have counters put on it for as long as ~ remains on the battlefield" (CR 611.2b).
  if ((m = /^(It|That creature) can't have counters put on it for as long as ~ remains on the battlefield$/.exec(s))) {
    const what = parseObject(m[1]!.toLowerCase(), ctx);
    return what && !isGroup(what) ? [{ type: "banCounters", what }] : null;
  }
  // Aether Snap: "Remove all counters from all permanents": from each of them at once.
  if (/^Remove all counters from all permanents$/i.test(s)) return [{ type: "removeAllCounters", what: { ref: "each", filter: { kind: "object", types: [], notTypes: [], notColors: [], text: "permanent" } } }];
  // "Move all counters from target creature onto another target creature" (CR 122.5).
  // The Ozolith: "move all counters from ~ onto target creature" (rulings: all of them or none).
  if ((m = /^Move all counters from (target .+?|~) onto ((?:another )?target .+)$/i.exec(s)) && (m[1] === "~") === !/^another /i.test(m[2]!)) {
    const from = parseObject(m[1]!, ctx);
    const to = from && !isGroup(from) ? parseObject(m[2]!, ctx) : null;
    return from && to && !isGroup(to) ? [{ type: "moveAllCounters", from, to }] : null;
  }
  // Black Panther, Wakandan King: "Move all +1/+1 counters from target land you control onto target creature": that kind
  // only; one permanent chosen for both targets moves nothing (CR 115.3, 122.5).
  if ((m = new RegExp(`^Move all ${COUNTER} counters from (target [^,]+?) onto (target [^,]+)$`, "i").exec(s))) {
    const from = parseObject(m[2]!, ctx);
    const to = from && !isGroup(from) ? parseObject(m[3]!, ctx) : null;
    return from?.ref === "target" && to?.ref === "target" ? [{ type: "moveAllCounters", from, to, only: counterKind(m[1]!) }] : null;
  }
  // Spike Cannibal: "move all +1/+1 counters from all creatures onto it": each other creature's, at once (CR 122.5).
  if (ctx.selfEntered && /^Move all \+1\/\+1 counters from all creatures onto (?:it|~)$/i.test(s))
    return [{ type: "moveAllCounters", from: { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" } }, to: { ref: "self" }, only: "+1/+1" }];
  // Resourceful Defense: "Move any number of counters from target permanent you control onto a second target permanent
  // you control": any kinds, chosen one at a time as it resolves (CR 122.5).
  // "Another" or "a second" target: not the first one (CR 115.3 lets one object be both targets otherwise).
  if ((m = /^Move any number of counters from (target .+?) onto (?:another|a second) (target .+)$/i.exec(s))) {
    const from = parseObject(m[1]!, ctx);
    const to = from && !isGroup(from) ? parseObject(`another ${m[2]!}`, ctx) : null;
    return from && to && !isGroup(to) ? [{ type: "removeAnyCounters", what: from, n: 0, upTo: true, moveTo: to }] : null;
  }
  // "Move a +1/+1 counter from target creature you control onto another target creature", Nesting Grounds' "move a
  // counter from target permanent you control onto a second target permanent" (a kind it has, chosen as it resolves).
  // Diamond City: "Move a shield counter from ~ onto target creature".
  if ((m = new RegExp(`^Move (?:a|one) (?:(?<kind>${COUNTER}) )?counter from (?:(?<from>target .+?) onto (?<to>another target .+|a second target .+)|(?<self>~) onto (?<to2>target [^,]+))$`, "i").exec(s))) {
    const g = m.groups!;
    const from = parseObject(g.from ?? g.self!, ctx);
    const to = from && !isGroup(from) ? parseObject((g.to ?? g.to2!).replace(/^a second /i, "another "), ctx) : null;
    return from && to && !isGroup(to) ? [{ type: "moveCounter", counter: g.kind ? counterKind(g.kind) : "any", from, to }] : null;
  }
  // Cytoplast Root-Kin: "Move a +1/+1 counter from target creature you control onto ~" (with none on it, none moves; ~
  // itself as the target moves nothing, CR 122.5).
  if ((m = new RegExp(`^Move (?:a|one) ${COUNTER} counter from (target [^,]+?) onto ~$`, "i").exec(s))) {
    const from = parseObject(m[2]!, ctx);
    return from?.ref === "target" && !from.n ? [{ type: "moveCounter", counter: counterKind(m[1]!), from, to: { ref: "self" } }] : null;
  }
  // Gatewatch Beacon: "you may move a loyalty counter from ~ onto that planeswalker": the one that entered (CR 122.5: none
  // moves if ~ has none).
  if ((m = new RegExp(`^Move (?:a|one) ${COUNTER} counter from ~ onto (it|that (?:planeswalker|creature|permanent))$`, "i").exec(s))) {
    const to = parseObject(m[2]!, ctx);
    return to?.ref === "subject" ? [{ type: "moveCounter", counter: counterKind(m[1]!), from: { ref: "self" }, to }] : null;
  }
  // Scrounging Bandar: "you may move any number of +1/+1 counters from ~ onto another target creature": that kind only,
  // as many as you choose (none is choosing not to) as it resolves.
  if ((m = new RegExp(`^(?:[Yy]ou may )?[Mm]ove any number of ${COUNTER} counters from ~ onto (another target .+)$`).exec(s))) {
    const to = parseObject(m[2]!, ctx);
    return to?.ref === "target" && !to.n ? [{ type: "removeAnyCounters", what: { ref: "self" }, n: 0, upTo: true, moveTo: to, kinds: [counterKind(m[1]!)] }] : null;
  }
  // Rikku, Resourceful Guardian: "Move a counter from target creature an opponent controls onto target creature you
  // control": two targets that can't be the same object (their controllers differ), so no "another" is needed.
  if ((m = new RegExp(`^Move (?:a|one) (?:(?<kind>${COUNTER}) )?counter from (?<from>target [a-z]+ an opponent controls) onto (?<to>target [a-z]+ you control)$`, "i").exec(s))) {
    const g = m.groups!;
    const from = parseObject(g.from!, ctx);
    const to = from && !isGroup(from) ? parseObject(g.to!, ctx) : null;
    return from && to && !isGroup(to) ? [{ type: "moveCounter", counter: g.kind ? counterKind(g.kind) : "any", from, to }] : null;
  }
  // Portent Tracker (see parseBody): an opponent's battle loses defense, anyone else's gains it.
  if ((m = /^Remove (a|\w+) defense counters? from (target battle) if an opponent protects it, otherwise put that many on it$/.exec(s))) {
    const n = m[1] === "a" ? 1 : num(m[1]!);
    const what = Number.isInteger(n) && n > 0 ? parseObject(m[2]!, ctx) : null;
    return what && !isGroup(what) ? [{ type: "battleDefense", what, n }] : null;
  }
  // Oblivion Stone: "remove all fate counters from all permanents".
  if ((m = new RegExp(`^Remove all ${COUNTER} counters from all permanents$`, "i").exec(s))) {
    const what = parseObject("all permanents", ctx);
    return what?.ref === "each" ? [{ type: "removeCounters", what, counter: counterKind(m[1]!), n: "all" }] : null;
  }
  // Temporal Distortion: "At the beginning of each player's upkeep, remove all hourglass counters from permanents that
  // player controls": the upkeep's player's permanents, every one of that kind from each.
  if ((m = new RegExp(`^Remove all ${COUNTER} counters from permanents that player controls$`, "i").exec(s))) {
    const what = parseObject("each permanent that player controls", ctx);
    return what?.ref === "each" && what.of ? [{ type: "removeCounters", what, counter: counterKind(m[1]!), n: "all" }] : null;
  }
  // Heartmender: "remove a -1/-1 counter from each creature you control": one from each that has one.
  if ((m = new RegExp(`^Remove (a|all) ${COUNTER} counters? from (each creature you control)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what?.ref === "each" ? [{ type: "removeCounters", what, counter: counterKind(m[2]!), n: /^all$/i.test(m[1]!) ? "all" : 1 }] : null;
  }
  // Pestilent Haze: "Remove two loyalty counters from each planeswalker": that many from each, all it has if fewer.
  if ((m = new RegExp(`^Remove (two|three) ${COUNTER} counters from (each planeswalker)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what?.ref === "each" ? [{ type: "removeCounters", what, counter: counterKind(m[2]!), n: amt(m[1]!) }] : null;
  }
  // Magnanimous Magistrate (as compile.ts reads "that many"): "remove a number of reprieve counters equal to its
  // mana value from ~" (its mana value: the card's as it last existed).
  if ((m = new RegExp(`^[Rr]emove a number of ${COUNTER} counters equal to (its mana value) from ~$`).exec(s))) {
    const n = parseCount(m[2]!, ctx, true);
    return n ? [{ type: "removeCounters", what: { ref: "self" }, counter: counterKind(m[1]!), n }] : null;
  }
  // Descendant of Masumaro: "then remove a +1/+1 counter from ~ for each card in target opponent's hand": as many as there
  // are (all of them if fewer, rulings), counted as it resolves.
  if ((m = new RegExp(`^(?:Then )?[Rr]emove an? ${COUNTER} counter from ~ for each (.+)$`).exec(s))) {
    const n = parseCount(m[2]!, ctx, true);
    return n ? [{ type: "removeCounters", what: { ref: "self" }, counter: counterKind(m[1]!), n }] : null;
  }
  // Venarian Gold: "remove a sleep counter from that creature", the enchanted creature as it resolves. Defiant Greatmaw:
  // "remove a -1/-1 counter from another target creature you control".
  // Confront the Past: "Remove twice X loyalty counters from target planeswalker an opponent controls".
  if ((m = new RegExp(`^Remove (all|twice X|${NUMX.slice(1, -1)}) ${COUNTER} counters? from (~|it|(?:another )?target .+|enchanted creature)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    const n = /^all$/i.test(m[1]!) ? "all" : m[1] === "twice X" ? { count: { kind: "x" as const }, times: 2 } : amt(m[1]!);
    return what && !isGroup(what) ? [{ type: "removeCounters", what, counter: counterKind(m[2]!), n }] : null;
  }
  // "Remove up to three counters from target permanent" (Glissa Sunslayer), "Remove X counters from target permanent,
  // where X is ..." (Thornmantle Striker), "Remove a counter from target nonland permanent" (Thrull Parasite).
  if ((m = new RegExp(`^Remove (up to )?(a|${NUMX.slice(1, -1)}) counters? from (~|it|(?:another )?target .+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what && !isGroup(what) ? [{ type: "removeAnyCounters", what, n: /^a$/i.test(m[2]!) ? 1 : amt(m[2]!), ...(m[1] ? { upTo: true as const } : {}) }] : null;
  }
  // Rhys, the Evermore: "Remove any number of counters from target creature you control": chosen one at a time as it
  // resolves, any kinds and as many as there are, none too; then removed together.
  if ((m = /^Remove any number of counters from (target .+)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "removeAnyCounters", what, n: { count: { kind: "counters", counter: "any", of: what } }, upTo: true }] : null;
  }
  // Gremlin Mine: "Remove up to four charge counters from target noncreature artifact": as many of them as its controller
  // chooses as it resolves, none to four (only that kind).
  if ((m = new RegExp(`^Remove up to (${NUM.slice(1, -1)}) ${COUNTER} counters from (target .+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what && !isGroup(what) ? [{ type: "removeAnyCounters", what, n: num(m[1]!), upTo: true, kinds: [counterKind(m[2]!)] }] : null;
  }
  // The Ozolith: "Whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on
  // ~": as many of each kind as that creature had as it last existed, put on (rulings: not moved).
  // Resourceful Defense: "... put those counters on target permanent you control", the same way.
  // Reluctant Role Model: "... on up to one target creature": none chosen, none put.
  // Buzzard-Wasp Colony: "Whenever another creature you control dies, if it had counters on it, put its counters on ~": the
  // same ("its" is the creature that died).
  // Ambitious Augmenter: "When ~ dies, if it had one or more counters on it, create a ... token, then put ~'s counters on
  // that token": every kind it had as it died, on each token created (rulings).
  if ((m = /^Put (?:those|its) counters on (~|that token|(?:up to one )?target .+)$/i.exec(s)) && ctx.subjectLeft && (/^Put those/i.test(s) || !ctx.selfCard)) {
    const what = m[1] === "~" ? ({ ref: "self" } as const) : /^that token$/i.test(m[1]!) ? ({ ref: "created" } as const) : parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "lastKnownCounters", what }] : null;
  }
  // Mari's granted trigger: "you may remove a hit counter from a card that player owns in exile".
  if ((m = new RegExp(`^Remove an? ${COUNTER} counter from a card (that player) owns in exile$`, "i").exec(s)) && ctx.eventPlayer) {
    const owner = parsePlayer(m[2]!, ctx);
    return owner ? [{ type: "removeExiledCounter", owner, counter: counterKind(m[1]!) }] : null;
  }
  // Mari, the Killing Quill: "Whenever a creature an opponent controls dies, exile it with a hit counter on it": the card,
  // if it's still in the graveyard it went to (CR 400.7), with the counter on it in exile (CR 122.1).
  if ((m = new RegExp(`^Exile (it|that card) with an? ${COUNTER} counter on it$`, "i").exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "subjectCard" ? [{ type: "exile", what, counters: { [counterKind(m[2]!)]: 1 } }] : null;
  }
  // Zack Fair, after "{1}, Sacrifice ~: Target creature you control gains indestructible until end of turn.": "Put ~'s
  // counters on that creature and attach an Equipment that was attached to ~ to that creature": as many of each kind as
  // it had as it was sacrificed, put on, not moved (rulings); one of the Equipment that was attached to it.
  if ((m = /^Put ~'s counters on (that creature)(?: and attach an Equipment that was attached to ~ to that creature)?$/i.exec(s)) && ctx.activated) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "lastKnownCounters", what }, ...(/attach/.test(s) ? [{ type: "attachLastKnown" as const, what }] : [])] : null;
  }
  // "When ~ dies, put its counters on target creature you control": as many of each kind as it had as it last
  // existed, put on, not moved (rulings on Dockworker Drone); "its +1/+1 counters" only that kind.
  if ((m = new RegExp(`^Put its (?:${COUNTER} )?counters on (.+)$`, "i").exec(s)) && ctx.selfCard) {
    const what = parseObject(m[2]!, ctx);
    return what && !isGroup(what) ? [{ type: "lastKnownCounters", what, ...(m[1] ? { only: counterKind(m[1]) } : {}) }] : null;
  }
  // Orzhov Advokist (the two sentences joined in body.ts).
  if ((m = new RegExp(`^[Ee]ach player may put (two|three) ${COUNTER} counters on a creature they control; if a player does, creatures that player controls can't attack you or planeswalkers you control until your next turn$`).exec(s)))
    return [{ type: "eachMayCounter", n: num(m[1]!), counter: counterKind(m[2]!), attackBan: true }];
  // "Distribute three +1/+1 counters among one, two, or three target creatures you control": how many targets and how
  // many each gets are chosen with the targets, at least one each (CR 601.2d), like divided damage.
  if ((m = /^Distribute (two|three|four|five|six|seven|eight) ([+-]1\/[+-]1) counters among (one or two|one, two, or three|any number of|up to (?:two|three|four)) ((?:other )?target .+)$/i.exec(s))) {
    const total = num(m[1]!);
    const upTo = /^up to /.test(m[3]!);
    const n = m[3] === "one or two" ? 2 : m[3] === "one, two, or three" ? 3 : upTo ? num(m[3]!.slice(6)) : total;
    const words = m[4]!.replace(/^(other )?target /, "$1").replace(/ and\/or /g, " or ");
    const one = words.replace(/\bcreatures\b/g, "creature").replace(/\bVehicles\b/g, "Vehicle").replace(/\bElves\b/g, "Elf");
    // Cloudspire Skycycle: "other target Vehicles and/or creatures you control": other than the source (a Vehicle itself),
    // each a creature or a Vehicle.
    const other = /^other /.test(one) && !ctx.spell;
    const phrase = other ? one.slice(6).replace(/^Vehicle or creature /, "creature or Vehicle ") : one;
    const spec = one === words ? null : parseTargetPhrase(phrase);
    if (spec?.kind !== "object") return null;
    const first = ctx.targets.length;
    const divided = { first, n, total, counter: counterKind(m[2]!), ...(upTo ? { upTo: true as const } : {}) };
    for (let k = 0; k < n; k++)
      addTarget(ctx, { ...spec, text: `target ${one}`, divided, ...(other ? { notSource: true as const } : {}), ...(k || upTo ? { optional: true } : {}), ...(k ? { distinctFrom: Array.from({ length: k }, (_, j) => first + j) } : {}) });
    ctx.lastTargets = { index: first, n };
    return [{ type: "counters", what: { ref: "target", index: first, n }, counter: counterKind(m[2]!), n: total, divided: true }];
  }
  // "Distribute up to X +1/+1 counters among any number of other target creatures, where X is ..." (Lathiel, rewritten in
  // triggers.ts): X worked out as the targets are chosen, then any number of them each getting at least 1, X in all at
  // most (rulings; CR 601.2d).
  // Quirion Beastcaller: "When ~ dies, distribute X +1/+1 counters among any number of target creatures you control, where X
  // is the number of +1/+1 counters on ~": all X, each target getting at least one, divided as it's put on the stack
  // (rulings), X counted then (as ~ last existed).
  if ((m = /^[Dd]istribute (up to )?X ([+-]1\/[+-]1) counters among any number of ((?:other )?target creatures(?: you control)?)$/.exec(s)) && ctx.whereX) {
    const upTo = !!m[1];
    m.splice(1, 1);
    const spec = parseTargetPhrase(m[2]!.replace(/^(?:other )?target /, "").replace(/creatures/, "creature"));
    if (spec?.kind !== "object" || ctx.targets.some((t) => t.many)) return null;
    const first = ctx.targets.length;
    const x: AmountExpr = { count: { kind: "x" } };
    addTarget(ctx, { ...spec, ...(/^other /.test(m[2]!) ? { notSource: true } : {}), text: m[2]!.replace(/creatures/, "creature"), divided: { first, n: 1, total: 0, amount: x, counter: counterKind(m[1]!), ...(upTo ? { atMost: true as const } : {}) }, many: "any" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return [{ type: "counters", what: { ref: "target", index: first, n: 2 }, counter: counterKind(m[1]!), n: x, divided: true }];
  }
  // Grove's Bounty: "Distribute X +1/+1 counters among any number of target creatures you control": the spell's X, all of
  // it, chosen with the targets, each getting at least one (rulings, CR 601.2d).
  // Broodlord: "When ~ enters, distribute X +1/+1 counters among any number of other target creatures you control": the X it
  // was cast with, divided as the ability is put on the stack (rulings).
  // Numa, Joraga Chieftain: "among any number of target Elves" after "you may pay {X}{X}. When you do": any Elves, the X paid.
  if ((m = /^[Dd]istribute X ([+-]1\/[+-]1) counters among any number of ((?:other )?target (?:creatures you control|[A-Z][a-z]+))$/.exec(s)) && !ctx.whereX && (ctx.spell || ctx.ownX)) {
    const tribe = /target ([A-Z][a-z]+)$/.exec(m[2]!)?.[1];
    if (tribe && !CREATURE_TYPES.has(singular(tribe))) return null;
    const spec = parseTargetPhrase(tribe ? singular(tribe) : m[2]!.replace(/^(?:other )?target /, "").replace(/creatures/, "creature"));
    if (spec?.kind !== "object" || ctx.targets.some((t) => t.many)) return null;
    const first = ctx.targets.length;
    const x: AmountExpr = { count: { kind: "x" } };
    addTarget(ctx, { ...spec, ...(/^other /.test(m[2]!) ? { notSource: true } : {}), text: tribe ? `target ${singular(tribe)}` : m[2]!.replace(/creatures/, "creature"), divided: { first, n: 1, total: 0, amount: x, counter: counterKind(m[1]!) }, many: "any" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return [{ type: "counters", what: { ref: "target", index: first, n: 2 }, counter: counterKind(m[1]!), n: x, divided: true }];
  }
  // "Distribute X +1/+1 counters among any number of creatures you control" (Blessing of Frost), "distribute a number of
  // +1/+1 counters equal to the number of +1/+1 counters on ~ among ..." (Vastwood Hydra): no targets, divided as it
  // resolves (CR 608.2d).
  // "Among one, two, or three creatures you control" with three counters (Awaken the Maelstrom) is the same: each chosen
  // one gets at least one.
  if ((m = new RegExp(`^Distribute (?:${NUMX}|a number of) ${COUNTER} counters (?:equal to (.+?) )?among (any number of|one or two|one, two, or three) (.+?) you control$`, "i").exec(s))) {
    if (!m[1] === !m[3]) return null;
    if (m[4] !== "any number of" && m[1] !== (m[4] === "one or two" ? "two" : "three")) return null;
    m.splice(4, 1);
    const filter = pickFilter(m[4]!);
    const n = m[3] ? parseCount(m[3], ctx) : amt(m[1]!);
    return filter && n ? [{ type: "distribute", counter: counterKind(m[2]!), n, filter: { ...filter, text: `${m[4]!} you control` } }] : null;
  }
  // Slippery Bogbonder: "Then move any number of counters from among creatures you control onto that creature" (see Effect
  // "gatherCounters").
  if (/^(?:Then )?[Mm]ove any number of counters from among creatures you control onto that creature$/.test(s) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object")
    return [{ type: "gatherCounters", onto: { ref: "target", index: ctx.lastObjectTarget }, from: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creatures you control" } }];
  // Forgotten Ancient: "you may move any number of +1/+1 counters from ~ onto other creatures". Chosen as it resolves, not
  // targeted (rulings); any creatures but ~, whoever controls them.
  if ((m = new RegExp(`^(?:[Yy]ou may )?[Mm]ove any number of ${COUNTER} counters from ~ onto other creatures$`).exec(s)))
    return [{ type: "distribute", counter: counterKind(m[1]!), n: { count: { kind: "counters", counter: counterKind(m[1]!), of: { ref: "self" } } }, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "other creatures" }, move: true }];
  // Conformer Shuriken: "If that creature has greater power than this creature, put a number of +1/+1 counters on this
  // creature equal to the difference": both as they are as it resolves.
  if ((m = new RegExp(`^If (that creature) has greater power than ~, put a number of ${COUNTER} counters on ~ equal to the difference$`).exec(s))) {
    const of = parseObject(m[1]!, ctx);
    if (!of || isGroup(of)) return null;
    const theirs: Count = { kind: "power", of };
    const mine: Count = { kind: "power", of: { ref: "self" } };
    return [{ type: "if", cond: { kind: "amountsCompare", a: { count: theirs }, atLeast: { count: mine, plus: 1 } }, effects: [{ type: "counters", what: { ref: "self" }, counter: counterKind(m[2]!), n: { count: { kind: "difference", of: [theirs, mine] } } }] }];
  }
  // Sovereign Okinec Ahau: "for each creature you control with power greater than that creature's base power, put a number
  // of +1/+1 counters on that creature equal to the difference": each its own number, all worked out first.
  if (/^[Ff]or each creature you control with power greater than that creature's base power, put a number of \+1\/\+1 counters on that creature equal to the difference$/.test(s))
    return [{ type: "counters", what: { ref: "each", filter: { kind: "object", types: ["Creature"], controller: "you", powerAboveBase: true, text: "each creature you control with power greater than its base power" } }, counter: "+1/+1", n: 1, aboveBase: true }];
  // Canopy Gargantuan: "put a number of +1/+1 counters on each other creature you control equal to that creature's
  // toughness": each its own number, all worked out first.
  if ((m = new RegExp(`^[Pp]ut a number of ${COUNTER} counters on (each (?:other )?creature you control) equal to (?:that creature's|its) (power|toughness)$`).exec(s))) {
    const what = parseObject(m[2]!, ctx);
    return what?.ref === "each" ? [{ type: "counters", what, counter: counterKind(m[1]!), n: 1, perOwn: m[3] as "power" | "toughness" }] : null;
  }
  // "Double the number of +1/+1 counters on each creature you control" (Kalonian Hydra), "... of each kind of counter on
  // any number of target permanents" (Deepglow Skate): as many more as each has as it resolves (CR 701.10e), put on it.
  if ((m = new RegExp(`^Double the number of (?:${COUNTER} counters|(each kind of) counter) on (.+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what ? [{ type: "counters", what, counter: m[2] ? "+1/+1" : counterKind(m[1]!), n: 1, double: true, ...(m[2] ? { everyKind: true as const } : {}) }] : null;
  }
  // Reluctant Role Model: "... on up to one target creature": none chosen, none put.
  // Buzzard-Wasp Colony: "Whenever another creature you control dies, if it had counters on it, put its counters on ~": the
  // same ("its" is the creature that died).
  // Ambitious Augmenter: "When ~ dies, if it had one or more counters on it, create a ... token, then put ~'s counters on
  // that token": every kind it had as it died, on each token created (rulings).
  if ((m = /^Put (?:those|its) counters on (~|that token|(?:up to one )?target .+)$/i.exec(s)) && ctx.subjectLeft && (/^Put those/i.test(s) || !ctx.selfCard)) {
    const what = m[1] === "~" ? ({ ref: "self" } as const) : /^that token$/i.test(m[1]!) ? ({ ref: "created" } as const) : parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "lastKnownCounters", what }] : null;
  }
  // Mari's granted trigger: "you may remove a hit counter from a card that player owns in exile".
  if ((m = new RegExp(`^Remove an? ${COUNTER} counter from a card (that player) owns in exile$`, "i").exec(s)) && ctx.eventPlayer) {
    const owner = parsePlayer(m[2]!, ctx);
    return owner ? [{ type: "removeExiledCounter", owner, counter: counterKind(m[1]!) }] : null;
  }
  // Mari, the Killing Quill: "Whenever a creature an opponent controls dies, exile it with a hit counter on it": the card,
  // if it's still in the graveyard it went to (CR 400.7), with the counter on it in exile (CR 122.1).
  if ((m = new RegExp(`^Exile (it|that card) with an? ${COUNTER} counter on it$`, "i").exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "subjectCard" ? [{ type: "exile", what, counters: { [counterKind(m[2]!)]: 1 } }] : null;
  }
  // Zack Fair, after "{1}, Sacrifice ~: Target creature you control gains indestructible until end of turn.": "Put ~'s
  // counters on that creature and attach an Equipment that was attached to ~ to that creature": as many of each kind as
  // it had as it was sacrificed, put on, not moved (rulings); one of the Equipment that was attached to it.
  if ((m = /^Put ~'s counters on (that creature)(?: and attach an Equipment that was attached to ~ to that creature)?$/i.exec(s)) && ctx.activated) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "lastKnownCounters", what }, ...(/attach/.test(s) ? [{ type: "attachLastKnown" as const, what }] : [])] : null;
  }
  // "When ~ dies, put its counters on target creature you control": as many of each kind as it had as it last
  // existed, put on, not moved (rulings on Dockworker Drone); "its +1/+1 counters" only that kind.
  if ((m = new RegExp(`^Put its (?:${COUNTER} )?counters on (.+)$`, "i").exec(s)) && ctx.selfCard) {
    const what = parseObject(m[2]!, ctx);
    return what && !isGroup(what) ? [{ type: "lastKnownCounters", what, ...(m[1] ? { only: counterKind(m[1]) } : {}) }] : null;
  }
  // Orzhov Advokist (the two sentences joined in body.ts).
  if ((m = new RegExp(`^[Ee]ach player may put (two|three) ${COUNTER} counters on a creature they control; if a player does, creatures that player controls can't attack you or planeswalkers you control until your next turn$`).exec(s)))
    return [{ type: "eachMayCounter", n: num(m[1]!), counter: counterKind(m[2]!), attackBan: true }];
  // "Distribute three +1/+1 counters among one, two, or three target creatures you control": how many targets and how
  // many each gets are chosen with the targets, at least one each (CR 601.2d), like divided damage.
  if ((m = /^Distribute (two|three|four|five|six|seven|eight) ([+-]1\/[+-]1) counters among (one or two|one, two, or three|any number of|up to (?:two|three|four)) ((?:other )?target .+)$/i.exec(s))) {
    const total = num(m[1]!);
    const upTo = /^up to /.test(m[3]!);
    const n = m[3] === "one or two" ? 2 : m[3] === "one, two, or three" ? 3 : upTo ? num(m[3]!.slice(6)) : total;
    const words = m[4]!.replace(/^(other )?target /, "$1").replace(/ and\/or /g, " or ");
    const one = words.replace(/\bcreatures\b/g, "creature").replace(/\bVehicles\b/g, "Vehicle").replace(/\bElves\b/g, "Elf");
    // Cloudspire Skycycle: "other target Vehicles and/or creatures you control": other than the source (a Vehicle itself),
    // each a creature or a Vehicle.
    const other = /^other /.test(one) && !ctx.spell;
    const phrase = other ? one.slice(6).replace(/^Vehicle or creature /, "creature or Vehicle ") : one;
    const spec = one === words ? null : parseTargetPhrase(phrase);
    if (spec?.kind !== "object") return null;
    const first = ctx.targets.length;
    const divided = { first, n, total, counter: counterKind(m[2]!), ...(upTo ? { upTo: true as const } : {}) };
    for (let k = 0; k < n; k++)
      addTarget(ctx, { ...spec, text: `target ${one}`, divided, ...(other ? { notSource: true as const } : {}), ...(k || upTo ? { optional: true } : {}), ...(k ? { distinctFrom: Array.from({ length: k }, (_, j) => first + j) } : {}) });
    ctx.lastTargets = { index: first, n };
    return [{ type: "counters", what: { ref: "target", index: first, n }, counter: counterKind(m[2]!), n: total, divided: true }];
  }
  // "Distribute up to X +1/+1 counters among any number of other target creatures, where X is ..." (Lathiel, rewritten in
  // triggers.ts): X worked out as the targets are chosen, then any number of them each getting at least 1, X in all at
  // most (rulings; CR 601.2d).
  // Quirion Beastcaller: "When ~ dies, distribute X +1/+1 counters among any number of target creatures you control, where X
  // is the number of +1/+1 counters on ~": all X, each target getting at least one, divided as it's put on the stack
  // (rulings), X counted then (as ~ last existed).
  if ((m = /^[Dd]istribute (up to )?X ([+-]1\/[+-]1) counters among any number of ((?:other )?target creatures(?: you control)?)$/.exec(s)) && ctx.whereX) {
    const upTo = !!m[1];
    m.splice(1, 1);
    const spec = parseTargetPhrase(m[2]!.replace(/^(?:other )?target /, "").replace(/creatures/, "creature"));
    if (spec?.kind !== "object" || ctx.targets.some((t) => t.many)) return null;
    const first = ctx.targets.length;
    const x: AmountExpr = { count: { kind: "x" } };
    addTarget(ctx, { ...spec, ...(/^other /.test(m[2]!) ? { notSource: true } : {}), text: m[2]!.replace(/creatures/, "creature"), divided: { first, n: 1, total: 0, amount: x, counter: counterKind(m[1]!), ...(upTo ? { atMost: true as const } : {}) }, many: "any" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return [{ type: "counters", what: { ref: "target", index: first, n: 2 }, counter: counterKind(m[1]!), n: x, divided: true }];
  }
  // Grove's Bounty: "Distribute X +1/+1 counters among any number of target creatures you control": the spell's X, all of
  // it, chosen with the targets, each getting at least one (rulings, CR 601.2d).
  // Broodlord: "When ~ enters, distribute X +1/+1 counters among any number of other target creatures you control": the X it
  // was cast with, divided as the ability is put on the stack (rulings).
  // Numa, Joraga Chieftain: "among any number of target Elves" after "you may pay {X}{X}. When you do": any Elves, the X paid.
  if ((m = /^[Dd]istribute X ([+-]1\/[+-]1) counters among any number of ((?:other )?target (?:creatures you control|[A-Z][a-z]+))$/.exec(s)) && !ctx.whereX && (ctx.spell || ctx.ownX)) {
    const tribe = /target ([A-Z][a-z]+)$/.exec(m[2]!)?.[1];
    if (tribe && !CREATURE_TYPES.has(singular(tribe))) return null;
    const spec = parseTargetPhrase(tribe ? singular(tribe) : m[2]!.replace(/^(?:other )?target /, "").replace(/creatures/, "creature"));
    if (spec?.kind !== "object" || ctx.targets.some((t) => t.many)) return null;
    const first = ctx.targets.length;
    const x: AmountExpr = { count: { kind: "x" } };
    addTarget(ctx, { ...spec, ...(/^other /.test(m[2]!) ? { notSource: true } : {}), text: tribe ? `target ${singular(tribe)}` : m[2]!.replace(/creatures/, "creature"), divided: { first, n: 1, total: 0, amount: x, counter: counterKind(m[1]!) }, many: "any" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return [{ type: "counters", what: { ref: "target", index: first, n: 2 }, counter: counterKind(m[1]!), n: x, divided: true }];
  }
  // "Distribute X +1/+1 counters among any number of creatures you control" (Blessing of Frost), "distribute a number of
  // +1/+1 counters equal to the number of +1/+1 counters on ~ among ..." (Vastwood Hydra): no targets, divided as it
  // resolves (CR 608.2d).
  // "Among one, two, or three creatures you control" with three counters (Awaken the Maelstrom) is the same: each chosen
  // one gets at least one.
  if ((m = new RegExp(`^Distribute (?:${NUMX}|a number of) ${COUNTER} counters (?:equal to (.+?) )?among (any number of|one or two|one, two, or three) (.+?) you control$`, "i").exec(s))) {
    if (!m[1] === !m[3]) return null;
    if (m[4] !== "any number of" && m[1] !== (m[4] === "one or two" ? "two" : "three")) return null;
    m.splice(4, 1);
    const filter = pickFilter(m[4]!);
    const n = m[3] ? parseCount(m[3], ctx) : amt(m[1]!);
    return filter && n ? [{ type: "distribute", counter: counterKind(m[2]!), n, filter: { ...filter, text: `${m[4]!} you control` } }] : null;
  }
  // Slippery Bogbonder: "Then move any number of counters from among creatures you control onto that creature" (see Effect
  // "gatherCounters").
  if (/^(?:Then )?[Mm]ove any number of counters from among creatures you control onto that creature$/.test(s) && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object")
    return [{ type: "gatherCounters", onto: { ref: "target", index: ctx.lastObjectTarget }, from: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creatures you control" } }];
  // Forgotten Ancient: "you may move any number of +1/+1 counters from ~ onto other creatures". Chosen as it resolves, not
  // targeted (rulings); any creatures but ~, whoever controls them.
  if ((m = new RegExp(`^(?:[Yy]ou may )?[Mm]ove any number of ${COUNTER} counters from ~ onto other creatures$`).exec(s)))
    return [{ type: "distribute", counter: counterKind(m[1]!), n: { count: { kind: "counters", counter: counterKind(m[1]!), of: { ref: "self" } } }, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "other creatures" }, move: true }];
  // Conformer Shuriken: "If that creature has greater power than this creature, put a number of +1/+1 counters on this
  // creature equal to the difference": both as they are as it resolves.
  if ((m = new RegExp(`^If (that creature) has greater power than ~, put a number of ${COUNTER} counters on ~ equal to the difference$`).exec(s))) {
    const of = parseObject(m[1]!, ctx);
    if (!of || isGroup(of)) return null;
    const theirs: Count = { kind: "power", of };
    const mine: Count = { kind: "power", of: { ref: "self" } };
    return [{ type: "if", cond: { kind: "amountsCompare", a: { count: theirs }, atLeast: { count: mine, plus: 1 } }, effects: [{ type: "counters", what: { ref: "self" }, counter: counterKind(m[2]!), n: { count: { kind: "difference", of: [theirs, mine] } } }] }];
  }
  // Sovereign Okinec Ahau: "for each creature you control with power greater than that creature's base power, put a number
  // of +1/+1 counters on that creature equal to the difference": each its own number, all worked out first.
  if (/^[Ff]or each creature you control with power greater than that creature's base power, put a number of \+1\/\+1 counters on that creature equal to the difference$/.test(s))
    return [{ type: "counters", what: { ref: "each", filter: { kind: "object", types: ["Creature"], controller: "you", powerAboveBase: true, text: "each creature you control with power greater than its base power" } }, counter: "+1/+1", n: 1, aboveBase: true }];
  // Canopy Gargantuan: "put a number of +1/+1 counters on each other creature you control equal to that creature's
  // toughness": each its own number, all worked out first.
  if ((m = new RegExp(`^[Pp]ut a number of ${COUNTER} counters on (each (?:other )?creature you control) equal to (?:that creature's|its) (power|toughness)$`).exec(s))) {
    const what = parseObject(m[2]!, ctx);
    return what?.ref === "each" ? [{ type: "counters", what, counter: counterKind(m[1]!), n: 1, perOwn: m[3] as "power" | "toughness" }] : null;
  }
  // "Double the number of +1/+1 counters on each creature you control" (Kalonian Hydra), "... of each kind of counter on
  // any number of target permanents" (Deepglow Skate): as many more as each has as it resolves (CR 701.10e), put on it.
  if ((m = new RegExp(`^Double the number of (?:${COUNTER} counters|(each kind of) counter) on (.+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what ? [{ type: "counters", what, counter: m[2] ? "+1/+1" : counterKind(m[1]!), n: 1, double: true, ...(m[2] ? { everyKind: true as const } : {}) }] : null;
  }
  // Quarry Hauler, Dramatist's Puppet: "for each kind of counter on target permanent, put another counter of that kind on
  // it or remove one from it": each kind it has as this resolves, chosen separately (rulings).
  if ((m = /^[Ff]or each kind of counter on target (permanent), put another counter of that kind on it or remove one from it$/.exec(s))) {
    const spec = parseTargetPhrase(m[1]!);
    return spec?.kind === "object" ? [{ type: "counterKindsAddOrRemove", what: { ref: "target", index: addTarget(ctx, spec) } }] : null;
  }
  // Clockspinning (body.ts): "for one kind of counter on target permanent or suspended card, ...": one kind it has, chosen
  // as it resolves (rulings). Jhoira's Timebug: "for the time counters on target permanent you control or suspended card
  // you own, you may ...": only time counters, and doing neither is allowed.
  if ((m = /^For (one kind of counter|the time counters) on target (permanent or suspended card|permanent you control or suspended card you own), (you may )?put another counter of that kind on it or remove one from it$/.exec(s))) {
    const spec = parseTargetPhrase(m[2]!);
    if (spec?.kind !== "object" || !spec.orSuspended || (m[1] === "one kind of counter") === !!m[3]) return null;
    return [{ type: "counterKindsAddOrRemove", what: { ref: "target", index: addTarget(ctx, spec) }, ...(m[1] === "one kind of counter" ? { one: true as const } : { kind: "time", may: true as const }) }];
  }
  // Reluctant Role Model: "put a flying, lifelink, or +1/+1 counter on it": one of the three kinds, chosen as it resolves.
  if ((m = new RegExp(`^[Pp]ut an? ${COUNTER}, ${COUNTER}, or ${COUNTER} counter on (.+)$`).exec(s)) && new Set([m[1], m[2], m[3]]).size === 3) {
    const what = parseObject(m[4]!, ctx);
    return what && !isGroup(what) ? [{ type: "counters", what, counter: counterKind(m[1]!), orCounter: counterKind(m[2]!), orCounters: [counterKind(m[3]!)], n: 1 }] : null;
  }
  // Dismantle: "If that artifact had counters on it, put that many +1/+1 counters or charge counters on an artifact you
  // control": as many as the target had of every kind as it last existed (rulings, CR 608.2h), even if it wasn't destroyed;
  // you choose the artifact (not targeted) and then the kind as it resolves (rulings), none of that if it had none.
  if ((m = new RegExp(`^If that artifact had counters on it, put that many ${COUNTER} counters or ${COUNTER} counters on an artifact you control$`).exec(s)) && m[1] !== m[2]) {
    const n = parseCount("the number of counters on that artifact", ctx);
    const filter = pickFilter("artifact");
    if (!n || !filter) return null;
    return [{ type: "if", cond: { kind: "amountNow", amount: n, min: 1 }, effects: [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "choose" }, { type: "counters", what: { ref: "created" }, counter: counterKind(m[1]!), orCounter: counterKind(m[2]!), n }] }];
  }
  // Elspeth Conquers Death: "Put a +1/+1 counter or a loyalty counter on it": either kind, chosen as it resolves (rulings).
  if ((m = new RegExp(`^Put an? ${COUNTER} counter or an? ${COUNTER} counter on (.+)$`, "i").exec(s)) && m[1] !== m[2]) {
    const what = parseObject(m[3]!, ctx);
    return what && !isGroup(what) ? [{ type: "counters", what, counter: counterKind(m[1]!), orCounter: counterKind(m[2]!), n: 1 }] : null;
  }
  // Dusty Parlor: "put a number of +1/+1 counters equal to that spell's mana value on up to one target creature", counted
  // as it resolves.
  if ((m = new RegExp(`^Put a number of ${COUNTER} counters equal to (.+?) on ((?:up to one )?target [a-z ]+)$`, "i").exec(s))) {
    const n = parseCount(m[2]!, ctx);
    const what = n && parseObject(m[3]!, ctx);
    return n && what && !isGroup(what) ? [{ type: "counters", what, counter: counterKind(m[1]!), n }] : null;
  }
  // Procrastinate: "Put twice X stun counters on it": 2X of them.
  if ((m = new RegExp(`^Put twice X ${COUNTER} counters on (.+)$`).exec(s))) {
    const fx = parseSentence(`Put X ${m[1]} counters on ${m[2]}`, ctx);
    const e = fx?.length === 1 ? fx[0] : undefined;
    if (e?.type !== "counters" || typeof e.n !== "object" || !("count" in e.n) || e.n.count.kind !== "x" || e.n.times !== undefined) return null;
    return [{ ...e, n: { count: { kind: "x" }, times: 2 } }];
  }
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on (.+)$`, "i").exec(s))) {
    // Command the Stage: "Create a ... token named Cadet, then put a +1/+1 counter on each other Wizard token you control":
    // other than the token just created, on a spell too.
    const otherTokens = ctx.lastCreated ? /^each other ([A-Z][a-z]+ tokens? you control)$/.exec(m[3]!) : null;
    if (otherTokens) {
      const each = parseObject(`each ${otherTokens[1]}`, ctx);
      return each?.ref === "each" && !each.other ? [{ type: "counters", what: { ...each, notCreated: true }, counter: counterKind(m[2]!), n: amt(m[1]!) }] : null;
    }
    const what = parseObject(m[3]!, ctx);
    return what ? [{ type: "counters", what, counter: counterKind(m[2]!), n: amt(m[1]!) }] : null;
  }
  // Commandeer, Aethersnatch: "Gain control of target noncreature spell" (CR 110.2b: a permanent spell becomes a permanent
  // under your control).
  if ((m = /^Gain control of target ((?:noncreature )?spell)$/i.exec(s))) {
    const spec = parseTargetPhrase(m[1]!);
    if (spec?.kind !== "spell") return null;
    return [{ type: "controlSpell", index: addTarget(ctx, { ...spec, text: `target ${m[1]!}` }) }];
  }
  // Gaining control (layer 2). "Gain control of target creature until end of turn."
  if ((m = /^Gain control of ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+?)( until end of turn| until the end of your next turn)?$/i.exec(s))) {
    // Stilt-Man, Towering Terror: "until the end of your next turn": through your next turn's cleanup (CR 514.2).
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: m[2] === " until the end of your next turn" ? "endOfYourNextTurn" : m[2] ? "endOfTurn" : "game" }] : null;
  }
  // The Wretched: "gain control of all creatures blocking ~" (with "for as long as you control ~"): those blocking it as this
  // resolves (CR 509.1h; none once it has left combat, CR 506.4), the set locked in then (CR 611.2c). Layer 2.
  if (/^Gain control of all creatures blocking ~$/.test(s) && !ctx.spell) return [{ type: "continuous", what: { ref: "blockingIt" }, mods: [{ kind: "control" }], duration: "game" }];
  // Captivating Glance: "If you win, gain control of enchanted creature. Otherwise, that player gains control of enchanted
  // creature.": the creature it's attached to as this resolves, for the rest of the game, even once the Aura is gone
  // (rulings). Layer 2.
  if ((m = /^(Gain|That player gains) control of enchanted creature$/.exec(s)) && !ctx.spell && (m[1] === "Gain" || ctx.clashOpp))
    return [{ type: "continuous", what: { ref: "attached" }, mods: [{ kind: "control" }], duration: "game", ...(m[1] === "Gain" ? {} : { giveTo: { ref: "clashOpponent" as const } }) }];
  // Sensei Golden-Tail: "Put a training counter on target creature. That creature gains bushido 1 and becomes a Samurai in
  // addition to its other creature types.": with no duration, for as long as it's that permanent (CR 611.2a); the counter
  // only marks it (rulings).
  // Xathrid Gorgon: "Put a petrification counter on target creature. It gains defender and becomes a colorless artifact in
  // addition to its other types.": the same (rulings).
  if ((m = /^(That creature|It) gains (bushido \d+|defender) and (becomes an? (?:[A-Z][a-z]+ in addition to its other creature types|colorless artifact in addition to its other types))$/.exec(s)) && ctx.activated) {
    const what = parseObject(m[1]!.toLowerCase(), ctx);
    const mods = what?.ref === "target" ? parseChanges(`gains ${m[2]} and ${m[3]}`) : null;
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // The Bears of Littjara: "Any number of target Shapeshifter creatures you control have base power and toughness 4/4":
  // with no duration, for as long as each is that permanent (CR 611.2a), in layer 7b (CR 613.4b).
  if ((m = /^(Any number of target [A-Z][a-z]+ creatures you control) have base power and toughness (\d+)\/(\d+)$/.exec(s))) {
    const what = parseObject(m[1]!.replace(/^Any/, "any"), ctx);
    const mods = what?.ref === "target" ? parseChanges(`has base power and toughness ${m[2]}/${m[3]}`) : null;
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // Frenzied Fugue: "gain control of enchanted permanent until end of turn": the permanent it's attached to as this resolves
  // (layer 2), until the turn ends.
  if ((m = /^[Gg]ain control of enchanted (creature|permanent) until end of turn$/.exec(s)) && !ctx.spell)
    return [{ type: "continuous", what: { ref: "attached" }, mods: [{ kind: "control" }], duration: "endOfTurn" }];
  // Oft-Nabbed Goat: "Gain control of ~ and put a -1/-1 counter on it" in an ability only its controller's opponents may
  // activate: the activator controls the ability (CR 113.8) and takes the creature for the rest of the game (layer 2).
  if ((m = /^Gain control of ~( and put an? (-1\/-1|\+1\/\+1) counter on it)?$/.exec(s)) && ctx.activated)
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game" }, ...(m[1] ? [{ type: "counters" as const, what: { ref: "self" as const }, counter: m[2]! as "-1/-1" | "+1/+1", n: 1 }] : [])];
  // Treasure Nabber: "gain control of that artifact until the end of your next turn", the trigger's subject; ends in the
  // cleanup step of your next turn (CR 514.2, 611.2a).
  if ((m = /^[Gg]ain control of it( until end of turn| until the end of your next turn)?$/.exec(s)) && ctx.subjectIt)
    return [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "control" }], duration: m[1] === " until end of turn" ? "endOfTurn" : m[1] ? "endOfYourNextTurn" : "game" }];
  // "Target player gains control of target permanent you control" (Donate), "An opponent gains control of ~" (Wishclaw
  // Talisman): an opponent you choose as it resolves (rulings). Layer 2, for the rest of the game.
  // Stiltzkin, Moogle Merchant: "... of another target permanent you control": not the source.
  // Domineering Will: "Target player gains control of up to three target nonattacking creatures until end of turn": each
  // of them, until the cleanup step (CR 514.2); the player may be you (rulings for Donate-like targets: any player).
  if ((m = /^(Target player|Target opponent) gains control of ((?:another )?target .+?|up to (?:two|three) target .+?)( until end of turn)?$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const what = who && parseObject(m[2]!, ctx);
    if (!who || what?.ref !== "target" || (what.n && !m[3])) return null;
    return [{ type: "continuous", what, mods: [{ kind: "control" }], duration: m[3] ? "endOfTurn" : "game", giveTo: who }];
  }
  // Sky Swallower: "target opponent gains control of all other permanents you control": each of them at once, the ones you
  // control as it resolves (CR 611.2c), for the rest of the game (rulings: Auras stay where they are; they don't come
  // back when ~ leaves).
  if ((m = /^([Tt]arget player|[Tt]arget opponent) gains control of all other permanents you control$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const what = who && parseObject("all other permanents you control", ctx);
    return who?.ref === "target" && what?.ref === "each" ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: "game", giveTo: who }] : null;
  }
  // Starke of Rath: "Destroy target artifact or creature. That permanent's controller gains control of ~": whoever
  // controlled it as it last existed (CR 608.2h), destroyed or not; nobody if it's an illegal target (CR 608.2b). For the
  // rest of the game, layer 2.
  if (/^That permanent's controller gains control of ~$/.test(s) && !ctx.spell && ctx.lastObjectTarget !== undefined && ctx.targets.length === 1 && !ctx.targets[0]!.many && !ctx.targets[0]!.optional)
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "targetController", index: ctx.lastObjectTarget } }];
  // Aisling Leprechaun: "Whenever ~ blocks or becomes blocked by a creature, that creature becomes green": its color for
  // the rest of the game (layer 5, CR 105.3; "This effect lasts indefinitely").
  if ((m = /^[Tt]hat creature becomes (white|blue|black|red|green)$/.exec(s))) {
    const what = parseObject("that creature", ctx);
    const mods = parseChanges(`becomes ${m[1]}`);
    return what?.ref === "subject" && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // Thoughtbound Primoc: "the player who controls the most Wizards gains control of ~", Ghazbán Ogre: "the player with the
  // most life", Sokenzan Renegade: "the player who has the most cards in hand": counted as it resolves, nobody if two or
  // more are tied (rulings). For the rest of the game (layer 2).
  if ((m = /^[Tt]he player (?:who controls the most ([A-Za-z]+)|with the most (life)|who has the most (cards in hand)) gains control of ~$/.exec(s))) {
    const stat = parseMostStat(m[1] ?? m[2] ?? m[3]!);
    return stat ? [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "uniqueMost", stat } }] : null;
  }
  // "That player gains control of ~" (Coveted Jewel): the trigger's player, for the rest of the game (layer 2).
  // Jeweled Amulet: "Note the type of mana spent to pay this activation cost."
  if (s === "Note the type of mana spent to pay this activation cost" && ctx.activated) return [{ type: "noteManaSpent" }];
  // Slicer, Hired Muscle: "... until end of turn" (CR 611.2a), ending in the cleanup step (514.2).
  // Discerning Financier: "Choose another player. That player gains control of target Treasure you control": the one chosen
  // as it resolves, for the rest of the game (layer 2).
  if ((m = /^That player gains control of (target .+ you control)$/.exec(s)) && ctx.chosenOpponent && !ctx.eventPlayer) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "chosenPlayer" } }] : null;
  }
  // Fateful Handoff: "... target artifact or creature you control. An opponent gains control of that permanent": the one
  // target, given to the opponent chosen as it resolves, for the rest of the game (layer 2).
  if (/^That player gains control of that permanent$/.test(s) && ctx.chosenOpponent && !ctx.eventPlayer && ctx.lastObjectTarget !== undefined && ctx.targets.length === 1 && ctx.targets[0]!.kind === "object" && !ctx.targets[0]!.many && !ctx.targets[0]!.optional)
    return [{ type: "continuous", what: { ref: "target", index: ctx.lastObjectTarget }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "chosenPlayer" } }];
  if (/^That player gains control of ~$/.test(s) && ctx.chosenOpponent && !ctx.eventPlayer) return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "chosenPlayer" } }];
  // Act of Authority: "you may exile target artifact or enchantment. If you do, its controller gains control of ~": who
  // controlled it, as it last existed on the battlefield (CR 608.2h), for the rest of the game (layer 2).
  if (/^[Ii]ts controller gains control of ~$/.test(s) && !ctx.spell && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]!.many)
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "targetController", index: ctx.lastObjectTarget } }];
  // Contested War Zone: "Whenever a creature deals combat damage to you, that creature's controller gains control of ~":
  // the trigger's creature's controller, as it last existed if it's gone (CR 608.2h), for the rest of the game (layer 2).
  if (/^[Tt]hat creature's controller gains control of ~$/.test(s) && !ctx.spell && (ctx.subject || ctx.subjectIt) && !ctx.targets.length)
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "subjectController" } }];
  // Pumpkin Bombs: "... to target opponent. They gain control of ~": that target player, for the rest of the game.
  if (/^(?:They gain|That player gains) control of ~$/.test(s) && !ctx.eventPlayer && !ctx.chosenOpponent && ctx.lastPlayerTarget !== undefined && ctx.targets[ctx.lastPlayerTarget]?.kind === "player" && !ctx.targets[ctx.lastPlayerTarget]!.many && !ctx.targets[ctx.lastPlayerTarget]!.optional)
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "target", index: ctx.lastPlayerTarget } }];
  // Karona, False God: "At the beginning of each player's upkeep, that player untaps ~ and gains control of it": untapped,
  // then theirs for the rest of the game (layer 2, the newest control effect winning, CR 613.7).
  if (/^[Tt]hat player untaps ~ and gains control of it$/.test(s) && ctx.eventPlayer && !ctx.spell && !ctx.targets.length)
    return [
      { type: "untap", what: { ref: "self" } },
      { type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "eventPlayer" } },
    ];
  if ((m = /^[Tt]hat player gains control of ~( until end of turn)?$/.exec(s)) && ctx.eventPlayer) return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: m[1] ? "endOfTurn" : "game", giveTo: { ref: "eventPlayer" } }];
  // Fractured Loyalty: "that spell or ability's controller gains control of that creature": the trigger's creature (its
  // subject) for the rest of the game (layer 2), given to the trigger's player.
  if (/^[Tt]hat player gains control of that creature$/.test(s) && ctx.eventPlayer && ctx.subject && !ctx.spell && !ctx.targets.length)
    return [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "eventPlayer" } }];
  // Assault Suit: "that player gains control of equipped creature until end of turn": the creature it's attached to as
  // this resolves (CR 611.2c), until the cleanup step (514.2).
  if (/^[Tt]hat player gains control of equipped creature until end of turn$/.test(s) && ctx.eventPlayer && !ctx.spell)
    return [{ type: "continuous", what: { ref: "attached" }, mods: [{ kind: "control" }], duration: "endOfTurn", giveTo: { ref: "eventPlayer" } }];
  // Slicer, Hired Muscle: "untap ~, goad it, and it can't be sacrificed this turn". Goaded by the ability's controller
  // (CR 701.15a), even while another player controls it; "can't be sacrificed" (CR 701.21) until the cleanup step.
  if (/^Untap ~, goad it, and it can't be sacrificed this turn$/.test(s))
    return [
      { type: "untap", what: { ref: "self" } },
      { type: "continuous", what: { ref: "self" }, mods: [{ kind: "goad" }], duration: "yourNextTurn" },
      { type: "continuous", what: { ref: "self" }, mods: [{ kind: "cantBeSacrificed" }], duration: "endOfTurn" },
    ];
  // Alexios: "that player gains control of ~, untaps it, and puts a +1/+1 counter on it": that player puts the counter.
  if ((m = /^[Tt]hat player gains control of ~, untaps it, and puts (a|two|three) \+1\/\+1 counters? on it$/.exec(s)) && ctx.eventPlayer)
    return [
      { type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "eventPlayer" } },
      { type: "untap", what: { ref: "self" } },
      { type: "counters", what: { ref: "self" }, counter: "+1/+1", n: m[1] === "a" ? 1 : m[1] === "two" ? 2 : 3, by: { ref: "eventPlayer" } },
    ];
  if (s === "Put another counter of a kind already on target permanent or player on it") {
    const host = addTarget(ctx, { kind: "any", types: [...PERMANENT_TYPES], text: "target permanent or player" });
    return [{ type: "counterOfKindOnIt", what: { ref: "target", index: host }, host }];
  }
  // Maulfist Revolutionary, Skyship Plunderer: "for each kind of counter on target permanent or player, give that
  // permanent or player another counter of that kind": one of each kind it has, not double (rulings, CR 122.1).
  if (/^[Ff]or each kind of counter on target permanent or player, give that permanent or player another counter of that kind$/.test(s)) {
    const host = addTarget(ctx, { kind: "any", types: [...PERMANENT_TYPES], text: "target permanent or player" });
    return [{ type: "counterOfKindOnIt", what: { ref: "target", index: host }, host, eachKind: true }];
  }
  // Denry Klin, Editor in Chief: "put the same number of each kind of counter on that creature" as ~ has, after "if ~ has
  // counters on it": each kind ~ has as it resolves, that many (CR 122.1).
  if (ctx.subject && /^[Pp]ut the same number of each kind of counter on that creature$/.test(s)) return [{ type: "counters", what: { ref: "subject" }, counter: "+1/+1", n: 0, copyFrom: { ref: "self" } }];
  if ((m = /^Put another counter of a kind already on (target [a-z ]+?) on it$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "counterOfKindOnIt", what }] : null;
  }
  // Shadrix Silverquill: "Target player puts a +1/+1 counter on each creature they control": that player puts them.
  if ((m = /^(Target player|Target opponent) puts (a|two|three) \+1\/\+1 counters? on each creature they control$/.exec(s))) {
    const fx = parseSentence(`Put ${m[2]} +1/+1 counter${m[2] === "a" ? "" : "s"} on each creature ${m[1]!.toLowerCase()} controls`, ctx);
    const e = fx?.length === 1 ? fx[0]! : undefined;
    return e?.type === "counters" && e.what.ref === "each" && e.what.of?.ref === "target" ? [{ ...e, by: e.what.of }] : null;
  }
  // Humble Defector: "Target opponent gains control of ~", for the rest of the game (layer 2); if ~ has left the
  // battlefield, nothing happens (rulings).
  // Sleeper Agent: "When ~ enters, target opponent gains control of it": the same, "it" being ~.
  // Crown of Doom: "Target player other than ~'s owner gains control of it" (an activated ability: "it" is ~).
  if (ctx.activated && !ctx.spell && /^Target player other than ~'s owner gains control of (?:it|~)$/.test(s)) {
    const who = parsePlayer("target player", ctx);
    if (who?.ref !== "target") return null;
    ctx.targets[who.index] = { ...ctx.targets[who.index]!, notSourceOwner: true, text: "target player other than ~'s owner" };
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: who }];
  }
  if (((m = /^([Tt]arget player|[Tt]arget opponent) gains control of ~$/.exec(s)) || (ctx.selfIt && (m = /^([Tt]arget player|[Tt]arget opponent) gains control of it$/.exec(s)))) && !ctx.spell) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    return who ? [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: who }] : null;
  }
  // Bucknard's Everfull Purse: "The player to your right gains control of ~": seats follow turn order, which goes to each
  // player's left (CR 101.4), so the player to your right is the one before you in turn order.
  if ((m = /^The player to your (right|left) gains control of ~$/.exec(s)) && !ctx.spell)
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "neighbor", side: m[1] as "right" | "left" } }];
  if (/^An opponent(?: of your choice)? gains control of ~$/.test(s))
    return [{ type: "choose", choice: "opponent" }, { type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "chosenPlayer" } }];
  // "Gain control of that Equipment until end of turn" (Stolen Uniform): a target an earlier sentence chose.
  // Jet's Brainwashing: "If ~ was kicked, gain control of that creature until end of turn": the target before.
  // Crown of Empires: "Tap target creature. Gain control of that creature instead if ...": an activated ability's target the
  // same way, for good (CR 611.2a).
  // Tolarian Entrancer: "Whenever ~ becomes blocked by a creature, gain control of that creature at end of combat": the
  // blocking creature the trigger is about (the delayed part is "at end of combat", see sentences/basics.ts), for good,
  // whether or not ~ is still around then (rulings).
  // Loki, God of Lies: "Whenever you cast a spell that targets only a single creature, gain control of that creature until
  // end of turn": the creature that spell targets (the trigger's subject), until the turn ends.
  if ((m = /^[Gg]ain control of that creature( until end of turn)?$/.exec(s)) && ctx.subject && !ctx.spell && !ctx.activated) {
    const what = parseObject("that creature", ctx);
    return what?.ref === "subject" ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: m[1] ? "endOfTurn" : "game" }] : null;
  }
  if ((m = /^Gain control of (that Equipment|that creature)( until end of turn)?$/.exec(s)) && (ctx.spell || ctx.activated)) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: m[2] ? "endOfTurn" : "game" }] : null;
  }
  // "Gain control of all creatures until end of turn", "... all creatures target opponent controls", "... all artifacts
  // your opponents control": the permanents that match as it resolves, locked in then (CR 611.2c).
  // Subjugate the Hobbits: "Gain control of each noncommander creature with mana value 3 or less": the same.
  if ((m = /^Gain control of (all .+?|each (?!other\b)[^,]+?)( until end of turn)?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: m[2] ? "endOfTurn" : "game" }] : null;
  }
  // Serene Master: "exchange its power and the power of target creature it's blocking" (CR 701.12g), "its" being ~.
  if ((m = /^[Ee]xchange (its|~'s) power and the power of (target creature .+) until end of turn$/.exec(s)) && (m[1] === "~'s" || ctx.selfIt)) {
    const what = parseObject(m[2]!, ctx);
    return what?.ref === "target" ? [{ type: "exchangePower", what, duration: "endOfTurn" }] : null;
  }
  // Switching power and toughness (layer 7d). Valakut Fireboar: "Whenever ~ attacks, switch its power and toughness".
  if (ctx.selfIt && /^[Ss]witch its power and toughness until end of turn$/.test(s)) return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "switchPT" }], duration: "endOfTurn" }];
  // "Switch the power and toughness of each of up to two target creatures until end of turn" (Invert), "... of each of any
  // number of target creatures ..." (Inversion Behemoth): each of them (CR 613.4d).
  if ((m = /^[Ss]witch the power and toughness of each of ((?:up to (?:one|two|three)|any number of) target creatures) until end of turn$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "continuous", what, mods: [{ kind: "switchPT" }], duration: "endOfTurn" }] : null;
  }
  if ((m = /^Switch (.+?)'s? power and toughness until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "switchPT" }], duration: "endOfTurn" }] : null;
  }
  // Joint Assault: "If it's paired with a creature, that creature also gets +2/+2 until end of turn", checked as it
  // resolves (rulings, CR 702.95b).
  if ((m = /^If it's paired with a creature, that creature also ((?:gets?|gains?) .+) until end of turn$/i.exec(s))) {
    const it = parseObject("it", ctx);
    const mods = parseChanges(m[1]!);
    return it?.ref === "target" && mods ? [{ type: "continuous", what: { ref: "pairedWithTarget", index: it.index }, mods, duration: "endOfTurn" }] : null;
  }
  // "Target creature can block any number of creatures this turn", "~ can block an additional creature this
  // turn", "It gets +2/+2 until end of turn and can block an additional creature this turn" (CR 509.1a).
  if ((m = /^(.+?) (can block .+ this turn)$/i.exec(s))) {
    const extra = parseExtraBlocks(m[2]!);
    const head = /^(.+?) ((?:gets?|gains?) .+) until end of turn and$/i.exec(m[1]!);
    const what = parseObject(head ? head[1]! : m[1]!, ctx);
    const mods = head ? parseChanges(head[2]!) : [];
    return extra && what && mods ? [{ type: "continuous", what, mods: [...mods, extra], duration: "endOfTurn" }] : null;
  }
  // The Pride of Hull Clade: "Until end of turn, target creature you control gets +1/+0, gains "Whenever this creature deals
  // combat damage to a player, draw cards equal to its toughness," and can attack as though it didn't have defender": all
  // three until end of turn, one after the other here (the body moves "until end of turn" to the end).
  if ((m = /^(Target .+?) gets ([+-]\d+\/[+-]\d+), gains "([^"]+?),?" and can attack as though it didn't have defender until end of turn$/.exec(s))) {
    const before = ctx.targets.length;
    const first = parseSentence(`${m[1]} gets ${m[2]} and gains "${m[3]}." until end of turn`, ctx);
    const second = first && ctx.targets.length === before + 1 && ctx.lastObjectTarget === before ? parseSentence("It can attack this turn as though it didn't have defender", ctx) : null;
    if (first && second) return [...first, ...second];
    ctx.targets.length = before;
    return null;
  }
  // Continuous changes until end of turn: "X gets +2/+2 and gains flying", "X loses all abilities
  // and becomes a blue Frog with base power and toughness 1/1", "X has base power and toughness 0/1".
  // "~ can attack this turn as though it didn't have defender" (CR 702.3b), "target creature you control assigns combat
  // damage equal to its toughness rather than its power this turn"; "~ gets +3/+0 until end of turn and can attack this
  // turn as though it didn't have defender" (Nivix Cyclops).
  if ((m = /^(.+?) (?:((?:gets?|gains?) .+) until end of turn and )?(can attack this turn as though (?:it|they) didn't have defender|assigns combat damage equal to its toughness rather than its power this turn)$/i.exec(s))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    const mods = what && parseChanges([m[2], m[3]!.replace(/ this turn$/, "")].filter(Boolean).join(" and "));
    return what && mods ? [{ type: "continuous", what, mods, duration: "endOfTurn" }] : null;
  }
  // The Mimics: "~ has base power and toughness 5/3 until end of turn and gains trample until end of turn", "... 3/3 until
  // end of turn and can't be blocked this turn": both until the cleanup step (CR 514.2), one effect (base power and
  // toughness in layer 7b, the ability in layer 6, CR 613.1f, 613.4b).
  if ((m = /^(.+?) has base power and toughness (\d+\/\d+) until end of turn and (gains .+? until end of turn|can't be blocked this turn)$/i.exec(s))) {
    const gains = /^gains (.+) until end of turn$/.exec(m[3]!);
    if (gains) return parseSentence(`${m[1]} has base power and toughness ${m[2]} and gains ${gains[1]} until end of turn`, ctx);
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    const first = what && parseChanges(`has base power and toughness ${m[2]}`);
    const second = first && parseStaticMods("can't be blocked");
    return what && first && second ? [{ type: "continuous", what, mods: [...first, ...second], duration: "endOfTurn" }] : null;
  }
  // "Target creature gets +1/+0 until end of turn and can't be blocked this turn" (Teleportal), "... and must be blocked
  // this turn if able" (Compelled Duel, CR 509.1c): "this turn" ends with "until end of turn", in the cleanup step (CR
  // 514.2), so it's one change until end of turn.
  if ((m = /^(.+?) ((?:gets?|gains?) .+) until end of turn and (can't be blocked(?: by .+?)?|can't block|must be blocked) this turn( if able)?$/i.exec(s))) {
    if (!!m[4] !== (m[3] === "must be blocked")) return null;
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    const first = what && parseChanges(m[2]!);
    const second = first && parseStaticMods(m[3] === "must be blocked" ? "must be blocked if able" : m[3]!);
    return what && first && second ? [{ type: "continuous", what, mods: [...first, ...second], duration: "endOfTurn" }] : null;
  }
  // "... gets -2/-0 until end of turn and attacks this turn if able" (Chemister's Trick): an attack requirement for each
  // combat this turn (CR 508.1d), ending with the turn like the rest. "That token gains haste until end of turn and
  // attacks this combat if able" (Legion Warboss): in the combat going on only.
  if ((m = /^(.+?) ((?:gets?|gains?) .+) until end of turn and attacks? this (turn|combat) if able$/i.exec(s))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    const first = what && parseChanges(m[2]!);
    return what && first ? [{ type: "continuous", what, mods: [...first, { kind: "attacksIfAble", ...(m[3] === "combat" ? { combat: "this" as const } : {}) }], duration: "endOfTurn" }] : null;
  }
  // Chaos Dragon: "If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they
  // control this combat." Ties count: an opponent with the same result as yours had the highest result (rulings).
  if (/^If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they control this combat$/.test(s))
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "cantAttackPlayers", players: "highestRoll", combat: "this" }], duration: "endOfTurn" }];
  // Raving Dead: "Choose an opponent at random. ~ attacks that player this combat if able": a requirement to attack that
  // player (CR 508.1d), as encore's; one that can't attack them needn't attack at all.
  if (/^~ attacks that player this combat if able$/.test(s) && ctx.chosenOpponent) return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "mustAttackPlayer", player: "chosen", combat: "this" }], duration: "endOfTurn" }];
  // "That token attacks this combat if able" (Howlsquad Heavy): the same requirement, nothing else gained.
  if ((m = /^(That token|That creature|It) attacks this (turn|combat) if able$/i.exec(s))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "attacksIfAble", ...(m[2]!.toLowerCase() === "combat" ? { combat: "this" as const } : {}) }], duration: "endOfTurn" }] : null;
  }
  // "You gain shroud until end of turn" (Gilded Light), "You and permanents you control gain hexproof until end of turn"
  // (Lazotep Plating), "You and target permanent you control each gain protection from the chosen player until end of
  // turn" (Guardian Archon), "you gain protection from the chosen color" (Seht's Tiger): the player gains it too (CR
  // 702.11d, 702.16b-e, 702.16k, 702.18d).
  // "You and permanents you control gain hexproof from blue and from black until end of turn" (Veil of Summer): two
  // hexproof abilities (CR 702.11f).
  if ((m = /^You(?: and (.+?))?(?: each)? gains? (hexproof(?: from [a-z]+(?: and from [a-z]+)?)?|shroud|protection from [a-z ]+?) until end of turn$/i.exec(s))) {
    const keywords = m[2]!.replace(/^hexproof from (\w+) and from (\w+)$/i, "hexproof from $1|hexproof from $2").split("|").map(canonicalKeyword);
    if (!keywords.every((k) => k && /^(?:Hexproof|Shroud|Protection from )/.test(k))) return null;
    const out: Effect[] = [{ type: "playerGains", keywords: keywords as string[] }];
    if (m[1]) {
      const what = parseObject(m[1], ctx);
      if (!what) return null;
      out.push({ type: "continuous", what, mods: [{ kind: "addKeywords", keywords: keywords as string[] }], duration: "endOfTurn" });
    }
    return out;
  }
  // "All permanents you control phase out, and until your next turn, your life total can't change and you gain protection
  // from everything" (Perch Protection): Teferi's Protection's two sentences in one.
  if ((m = /^(All permanents you control phase out), and (until your next turn, .+)$/.exec(s))) {
    const a = parsePermanentsSentence(m[1]!, ctx);
    const b = parsePermanentsSentence(capital(m[2]!), ctx);
    return a && b ? [...a, ...b] : null;
  }
  // Teferi's Reproach (body.ts): "Until target opponent's next turn, that player gains protection from everything and their
  // life total can't change": both end as that player's next turn begins (CR 702.16j, 119.7-8, 611.2b).
  if ((m = /^Until (target opponent)'s next turn, that player gains (protection from everything) and their life total can't change$/.exec(s))) {
    const k = canonicalKeyword(m[2]!);
    if (!k) return null;
    const index = addTarget(ctx, { kind: "player", opponent: true, text: m[1]! });
    ctx.lastPlayerTarget = index;
    return [{ type: "playerGains", keywords: [k], untilYourNextTurn: true, lifeCantChange: true, who: { ref: "target", index } }];
  }
  // "You gain protection from everything until your next turn" (The One Ring); "Until your next turn, your life total
  // can't change and you gain protection from everything" (Teferi's Protection).
  if ((m = /^You gain (hexproof|shroud|protection from [a-z ]+?) until your next turn$/i.exec(s)) || (m = /^Until your next turn, (.+)$/i.exec(s))) {
    const parts = /^Until /i.test(s) ? m[1]!.split(/,? and /) : [`you gain ${m[1]!}`];
    const keywords: string[] = [];
    let lifeCantChange = false;
    const ok = parts.every((p) => {
      const g = /^you gain (hexproof|shroud|protection from [a-z ]+)$/i.exec(p);
      const k = g && canonicalKeyword(g[1]!);
      if (k && /^(?:Hexproof|Shroud|Protection from )/.test(k)) keywords.push(k);
      else if (/^your life total can't change$/i.test(p)) lifeCantChange = true;
      else return false;
      return true;
    });
    // Anything else "until your next turn" is for the rules below.
    if (ok) return [{ type: "playerGains", keywords, untilYourNextTurn: true, ...(lifeCantChange ? { lifeCantChange: true as const } : {}) }];
  }
  // "Target creature gets +X/+X or -X/-X until end of turn" (Liliana of the Dark Realms): only the target is chosen as
  // it's activated; which one, as it resolves (rulings; CR 608.2d), and X then too.
  if ((m = /^(target creature) gets \+X\/\+X or -X\/-X until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const up = parseChanges("gets +X/+X");
    const down = parseChanges("gets -X/-X");
    if (!what || !up || !down) return null;
    return [{ type: "either", options: [[{ type: "continuous", what, mods: up, duration: "endOfTurn" }], [{ type: "continuous", what, mods: down, duration: "endOfTurn" }]], labels: ["It gets +X/+X until end of turn", "It gets -X/-X until end of turn"] }];
  }
  // Urborg: "Target creature loses first strike or swampwalk until end of turn": which one is chosen as it resolves, and
  // with both it loses just that one (rulings; CR 608.2d). Losing first strike leaves double strike alone (rulings).
  if ((m = /^(target creature) loses ([a-z]+(?: [a-z]+)?) or ([a-z]+(?: [a-z]+)?) until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!.toLowerCase(), ctx);
    const a = parseChanges(`loses ${m[2]}`);
    const b = parseChanges(`loses ${m[3]}`);
    if (!what || a?.length !== 1 || b?.length !== 1 || a[0]!.kind !== "removeKeywords" || b[0]!.kind !== "removeKeywords") return null;
    return [{ type: "either", options: [[{ type: "continuous", what, mods: a, duration: "endOfTurn" }], [{ type: "continuous", what, mods: b, duration: "endOfTurn" }]], labels: [`It loses ${m[2]} until end of turn`, `It loses ${m[3]} until end of turn`] }];
  }
  // "Enchanted creature gets +1/-1 or -1/+1 until end of turn" (Pemmin's Aura): which one is chosen as it resolves
  // (CR 608.2d), like the above. Shaper Parasite: "target creature gets +2/-2 or -2/+2 until end of turn", the target
  // chosen as the trigger is put on the stack, the bonus as it resolves (rulings).
  if ((m = /^(enchanted creature|~|target creature) gets ([+-]\d+\/[+-]\d+) or ([+-]\d+\/[+-]\d+) until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!.toLowerCase() === "~" ? "~" : m[1]!.toLowerCase(), ctx);
    const a = parseChanges(`gets ${m[2]}`);
    const b = parseChanges(`gets ${m[3]}`);
    if (!what || !a || !b) return null;
    return [{ type: "either", options: [[{ type: "continuous", what, mods: a, duration: "endOfTurn" }], [{ type: "continuous", what, mods: b, duration: "endOfTurn" }]], labels: [`It gets ${m[2]} until end of turn`, `It gets ${m[3]} until end of turn`] }];
  }
  // "Until your next turn, up to one target noncreature artifact becomes an artifact creature ..." (Karn, the Great
  // Creator): the same as with the duration after it.
  // Hydro-Man, Fluid Felon: "Until your next turn, ~ becomes a land and gains "{T}: Add {U}."": itself.
  // Xenic Poltergeist: "Until your next upkeep, target noncreature artifact becomes ...": over as your next upkeep begins
  // (rulings).
  if ((m = /^Until (end of turn|your next turn|your next upkeep), ((?:up to one )?target .+?|~) ((?:gets?|gains?|loses?|has|becomes?) .+)$/.exec(s))) {
    const what = parseObject(m[2]!, ctx);
    const mods = what && parseChanges(m[3]!);
    return what && mods ? [{ type: "continuous", what, mods, duration: m[1] === "end of turn" ? "endOfTurn" : m[1] === "your next upkeep" ? "yourNextUpkeep" : "yourNextTurn" }] : null;
  }
  // Thermal Flux: "Target snow permanent isn't snow until end of turn" (parseChanges).
  // Erhnam Djinn: "... gains forestwalk until your next upkeep": it ends as your next upkeep begins.
  // Stilt-Man, Towering Terror: "It gains "This permanent can't be sacrificed" until the end of your next turn": through
  // your next turn's cleanup (CR 514.2).
  if ((m = /^(.+?) ((?:gets?|gains?|loses?|has|have|becomes?|assigns?|can attack) .+|isn't snow) until (end of turn|your next turn|your next upkeep|the end of your next turn)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && parseChanges(m[2]!);
    return what && mods ? [{ type: "continuous", what, mods, duration: m[3] === "end of turn" ? "endOfTurn" : m[3] === "your next upkeep" ? "yourNextUpkeep" : m[3] === "the end of your next turn" ? "endOfYourNextTurn" : "yourNextTurn" }] : null;
  }
  // "Gain control of target artifact. Untap it. It gains haste." (Momo's Heist), "Create a token that's a copy of target
  // artifact. That token gains haste." (Cogwork Assembler), "Populate. The token created this way gains haste." (Determined
  // Iteration), "Those tokens gain haste" (Mirror March): keywords with no duration last for as long as it stays on
  // the battlefield (CR 611.2a; a new object after a zone change, CR 400.7).
  // Cocoon: "that creature gains flying", the creature it enchants (locked in as it resolves, CR 611.2c).
  if ((m = /^([Tt]arget .+?|It|That token|That creature|That artifact|That [A-Z][a-z]+|They|Those tokens|The token created this way|Enchanted creature) (gains? .+)$/.exec(s)) && !/ until | this turn$/.test(m[2]!)) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && (what.ref === "target" || what.ref === "created" || (what.ref === "attached" && m[1] === "Enchanted creature")) ? parseChanges(m[2]!) : null;
    // A quoted ability too, on a token just created: "It gains haste and "When this token dies, draw a card."" (Jaxis).
    if (what && mods?.length && mods.every((x) => x.kind === "addKeywords" || (x.kind === "addAbility" && what.ref === "created"))) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // Riding the Dilu Horse: "Target creature gets +2/+2 and gains horsemanship.": no duration, so for as long as it stays
  // on the battlefield (CR 611.2a, rulings).
  // Goblin Ski Patrol: "~ gets +2/+0 and gains flying" the same.
  if ((m = /^([Tt]arget creature|~) (gets [+-]\d+\/[+-]\d+(?: and gains [a-z]+)?)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" || (what?.ref === "self" && m[1] === "~") ? parseChanges(m[2]!) : null;
    if (what && mods?.length && mods.every((x) => x.kind === "addKeywords" || x.kind === "modifyPT")) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // Chance for Glory: "Creatures you control gain indestructible": the creatures there as it resolves (CR 611.2c), for as
  // long as each stays on the battlefield (CR 611.2a).
  if ((m = /^(Creatures you control) (gain [a-z ,]+)$/.exec(s)) && ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "each" ? parseChanges(m[2]!) : null;
    if (what && mods?.length && mods.every((x) => x.kind === "addKeywords")) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // Awakening of Vitu-Ghazi: "It becomes a legendary 0/0 Elemental creature with haste named Vitu-Ghazi. It's still a land.":
  // the target, with no duration (rulings); its name is just the new one (rulings, layer 3 setName, CR 613.1c).
  if ((m = /^(It|[Tt]arget [a-z ]+?) becomes (a legendary \d+\/\d+ [A-Z][a-z]+ creature(?: with [a-z, ]+)?) named ([A-Z][A-Za-z'-]+(?: [A-Z][A-Za-z'-]+)*)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" && !what.n ? parseChanges(`becomes ${m[2]!}`) : null;
    return what && mods ? [{ type: "continuous", what, mods: [...mods, { kind: "setName", name: m[3]! }], duration: "game" }] : null;
  }
  // "Target land you control becomes a 3/3 Elemental creature with haste that's still a land" (Brave the Wilds): with no
  // duration, for as long as it stays on the battlefield (CR 611.2a; a new object after a zone change, CR 400.7).
  // "Put four +1/+1 counters on target noncreature artifact. It becomes a 0/0 Bird creature" (Case of the Filched Falcon): the target.
  // Druid Class: 'becomes a creature with haste and "This creature's power and toughness are each equal to the number of
  // lands you control."': no number of its own; the ability it gains sets them, in layer 7b (CR 604.3a, 613.4b).
  // Overloaded Rise and Shine: "Each noncreature artifact you control becomes a 0/0 artifact creature": the ones there as
  // it resolves, locked in (CR 611.2c).
  // Zur, Eternal Schemer: "Target non-Aura enchantment you control becomes a creature in addition to its other types and has
  // base power and base toughness each equal to its mana value": no duration either (rulings).
  // Tatyova, Steward of Tides: "up to one target land you control becomes a 3/3 Elemental creature with haste": the same.
  // Wall of Resurgence: "that land becomes a 0/0 Elemental creature with haste that's still a land": the land targeted.
  // Kenku Artificer: "put three +1/+1 counters on up to one target noncreature artifact. That artifact becomes a 0/0
  // Homunculus artifact creature with flying": the one target, keeping its other types and subtypes (CR 205.1b, rulings).
  if ((m = /^((?:up to one )?target .+?|It|[Tt]hat land|[Tt]hat artifact|each [a-z ]+? you control) becomes? (an? \d+\/\d+ .+|a creature with [a-z, ]+ and "(?:This creature|~)'s power and toughness are each equal to [^"]+"|a creature in addition to its other types and has base power and base toughness each equal to its mana value)$/i.exec(s))) {
    const what = parseObject(m[1]!.replace(/^That artifact$/, "that artifact"), ctx);
    const mods = (what?.ref === "target" || (what?.ref === "each" && /^each /i.test(m[1]!))) && parseChanges(`becomes ${m[2]!}`);
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // Arcum's Weathervane: "Target snow land is no longer snow", "Target nonsnow basic land becomes snow": with no duration,
  // for as long as it stays on the battlefield (CR 611.2a, 400.7); only the supertype changes (CR 205.4a, rulings).
  if ((m = /^([Tt]arget [a-z ]+?) (is no longer snow|becomes snow)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" && !what.n ? parseChanges(m[2]!) : null;
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // Cyclopean Giant: "target land becomes a Swamp"; Sealock Monster: "... becomes an Island in addition to its other types"
  // (it keeps its other land types and abilities, CR 305.7); Alchor's Tomb: "Target permanent you control becomes the color of your
  // choice"; Prismatic Lace: "... the color or colors of your choice". With no duration, for as long as it stays on the
  // battlefield (CR 611.2a, 400.7): a land loses its other land types and the abilities from its rules text (CR 305.7), a
  // permanent's new colors replace its old ones (CR 105.3).
  // Dream Coat: "{0}: Enchanted creature becomes the color or colors of your choice": the creature it enchants as the
  // ability resolves (CR 611.2c), for as long as it's on the battlefield, attached or not (rulings: it doesn't wear off).
  if ((m = /^((?:up to one )?[Tt]arget (?:land|permanent|creature)(?: you control)?|Enchanted creature) becomes (an? (?:Plains|Island|Swamp|Mountain|Forest)(?: in addition to its other types)?|the chosen (?:color|colors|basic land type))$/.exec(s))) {
    const what = parseObject(m[1]!.replace(/^Enchanted/, "enchanted"), ctx);
    const mods = (what?.ref === "target" && !what.n) || (m[1] === "Enchanted creature" && !ctx.spell) ? parseBecomes(m[2]!) : null;
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // Depthshaker Titan: "Any number of target noncreature artifacts you control become 3/3 artifact creatures": each of
  // them, as with one target (no duration: for as long as each stays on the battlefield, CR 611.2a).
  // Nissa, Sage Animist: "Untap up to six target lands. They become 6/6 Elemental creatures. They're still lands." The same.
  // Primal Adversary: "up to that many target lands you control become 3/3 Wolf creatures with haste that are still lands"
  // (as "up to X", X its reflexive trigger's own): the same, each keeping its land type (CR 205.1b).
  if ((m = /^((?:[Aa]ny number of|[Uu]p to (?:two|three|four|five|six|X)) target .+?|They) become (\d+\/\d+) ((?:[a-z]+ |[A-Z][a-z]+ )*)creatures( with [a-z]+(?:(?:, | and )[a-z]+)*)?( that are still lands)?$/.exec(s)) && (!/^[Uu]p to X /.test(m[1]!) || ctx.ownX || ctx.spell)) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" && parseChanges(`becomes a ${m[2]} ${m[3]}creature${m[4] ?? ""}${m[5] ? " that's still a land" : ""}`);
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // Oko, Thief of Crowns: "Exchange control of target artifact or creature you control and target creature an opponent
  // controls with power 3 or less" (CR 701.12b).
  // Volatile Stormdrake: "Exchange control of ~ and target creature an opponent controls": ~ as it is (rulings: it must
  // still be on the battlefield).
  // Gilded Drake: "Exchange control of ~ and up to one target creature an opponent controls" (with none chosen, no exchange).
  // Shrewd Negotiation: "... and target artifact or creature you don't control": the same (no teammates here).
  if ((m = /^[Ee]xchange control of (~|target .+? you control) and ((?:up to one )?target .+? (?:an opponent controls|you don't control)(?: with .+)?)$/.exec(s))) {
    if (m[2]!.startsWith("up to") && m[1] !== "~") return null;
    const a: ObjRef | null = m[1] === "~" ? { ref: "self" } : parseObject(m[1]!, ctx);
    // Spawnbroker: "... and target creature with power less than or equal to that creature's power an opponent controls":
    // the first target's power, as they're chosen and as it resolves (TargetSpec.powerAtMostOf).
    if (a?.ref === "target" && !a.n && /^target creature with power less than or equal to that creature's power an opponent controls$/.test(m[2]!) && ctx.targets[a.index]?.kind === "object" && ctx.targets[a.index]!.types?.includes("Creature")) {
      const b = addTarget(ctx, { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "opponent", powerAtMostOf: [a.index], text: m[2]! });
      return [{ type: "exchangeControl", a, b: { ref: "target", index: b } }];
    }
    const b = a?.ref === "self" || (a?.ref === "target" && !a.n) ? parseObject(m[2]!, ctx) : null;
    return a && b?.ref === "target" && !b.n ? [{ type: "exchangeControl", a, b }] : null;
  }
  // Legerdemain: "Exchange control of target artifact or creature and another target permanent that shares one of those
  // types with it": an artifact or creature type in common, as they're chosen and again as it resolves (rulings, CR
  // 701.12b).
  if (/^[Ee]xchange control of target artifact or creature and another target permanent that shares one of those types with it$/.test(s)) {
    const a = addTarget(ctx, { kind: "object", types: ["Artifact", "Creature"], text: "target artifact or creature" });
    const b = addTarget(ctx, { kind: "object", types: [], distinctFrom: [a], sharesCardTypeWith: [a], sharesCardTypeAmong: ["Artifact", "Creature"], text: "another target permanent that shares one of those types with it" });
    return [{ type: "exchangeControl", a: { ref: "target", index: a }, b: { ref: "target", index: b } }];
  }
  // Role Reversal: "Exchange control of two target permanents that share a permanent type": a permanent type in common
  // (CR 110.4: artifact, battle, creature, enchantment, land, planeswalker; supertypes don't count, rulings), as they're
  // chosen and again as it resolves (CR 608.2b); either illegal, or both under one player's control, and nothing happens.
  if (/^[Ee]xchange control of two target permanents that share a permanent type$/.test(s)) {
    const types = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];
    const a = addTarget(ctx, { kind: "object", types: [], text: "target permanent" });
    const b = addTarget(ctx, { kind: "object", types: [], distinctFrom: [a], sharesCardTypeWith: [a], sharesCardTypeAmong: types, text: "another target permanent that shares a permanent type with it" });
    return [{ type: "exchangeControl", a: { ref: "target", index: a }, b: { ref: "target", index: b } }];
  }
  // "Exchange control of two target creatures" (Switcheroo), "... two target lands" (Shifting Borders), "... two other
  // target creatures controlled by different players" (Kitsune, Dragon's Daughter); "Exchange control of ~ and target
  // nonland permanent" (Avarice Totem): whoever controls them; with both under one player's control, or either target
  // illegal, nothing happens (CR 701.12b).
  if ((m = /^[Ee]xchange control of (two (?:other )?target .+|~ and target .+)$/.exec(s))) {
    const self = m[1]!.startsWith("~");
    const first = ctx.targets.length;
    const what = parseObject(self ? m[1]!.replace(/^~ and /, "") : m[1]!, ctx);
    if (what?.ref !== "target" || ctx.targets.length !== first + (self ? 1 : 2) || ctx.targets.slice(first).some((t) => t.kind !== "object" || t.skip)) return null;
    return [{ type: "exchangeControl", a: self ? { ref: "self" } : { ref: "target", index: first }, b: { ref: "target", index: self ? first : first + 1 } }];
  }
  // Gornog, the Red Reaper: "target creature that player controls becomes a Coward": its creature types replaced by that
  // one (CR 205.1a, 613.1d), other types and subtypes kept, with no duration: for as long as it stays on the battlefield
  // (CR 611.2a; rulings).
  if ((m = /^([Tt]arget creature(?: that player controls| an opponent controls)?) becomes an? ([A-Z][a-z]+)$/.exec(s)) && CREATURE_TYPES.has(m[2]!)) {
    const what = parseObject(m[1]!, ctx);
    if (what?.ref === "target" && !what.n) return [{ type: "continuous", what, mods: [{ kind: "setSubtypes", subtypes: [m[2]!] }], duration: "game" }];
  }
  // Curious Colossus: "each creature target opponent controls loses all abilities, becomes a Coward in addition to its other
  // types, and has base power and toughness 1/1": with no duration, for as long as each stays on the battlefield (CR
  // 611.2a; rulings), the creatures there as it resolves (CR 611.2c).
  if ((m = /^((?:target|each) .+?) (loses all abilities(?:, [^,]+)*,? and has base power and toughness \d+\/\d+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" || (what?.ref === "each" && /^each /i.test(m[1]!)) ? parseChanges(m[2]!.replace(/,? and /, " and ").replace(/, /g, " and ")) : null;
    if (what && mods) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // "Target artifact or creature loses all abilities and becomes a green Elk creature with base power and toughness 3/3"
  // (Oko, Thief of Crowns): with no duration, for as long as it stays on the battlefield (CR 611.2a, 400.7). Its colors,
  // card and creature types are replaced; its supertypes stay (rulings). "Up to one other target creature" (Lizard,
  // Connors's Curse) the same.
  if ((m = /^((?:up to one )?(?:other )?target .+?) (loses all abilities and becomes an? .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" ? parseChanges(m[2]!) : null;
    if (what && mods) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // "Target artifact or creature becomes an artifact creature with base power and toughness 5/5 and gains flying" (Iron
  // Man, Futurist Paragon; Tezzeret the Schemer's emblem): with no duration, for as long as it stays on the battlefield
  // (CR 611.2a, 400.7; rulings), keeping its other types (rulings on Tezzeret, Agent of Bolas).
  if ((m = /^(target (?:artifact|artifact or creature|artifact you control)) (becomes an artifact creature with base power and toughness \d+\/\d+(?: and gains [a-z]+)?)$/i.exec(s))) {
    const what = parseObject(m[1]!.toLowerCase(), ctx);
    const mods = what?.ref === "target" && !what.n ? parseChanges(m[2]!) : null;
    if (what && mods?.some((x) => x.kind === "setPT")) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // "Up to one other target creature loses all abilities" (Abigale, Eloquent First-Year): with no duration, for as long as
  // it stays on the battlefield (CR 611.2a, 400.7; rulings), an effect with a timestamp, so abilities it gains later stay.
  if ((m = /^((?:up to one )?(?:other )?target .+?) loses all abilities$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    if (what?.ref === "target") return [{ type: "continuous", what, mods: [{ kind: "loseAllAbilities" }], duration: "game" }];
  }
  // "Target creature becomes a Treasure artifact with "..." and loses all other card types and abilities" (Vraska,
  // Betrayal's Sting): for as long as it stays on the battlefield (CR 611.2a). Its supertypes stay (rulings, CR 205.1a);
  // losing its abilities comes before the one it gains, in layer 6.
  if ((m = /^((?:another )?target .+?) becomes (an? .+?) and loses all other card types and abilities$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" ? parseIsA(m[2]!, true) : null;
    return what && mods ? [{ type: "continuous", what, mods: [{ kind: "loseAllAbilities" }, ...mods], duration: "game" }] : null;
  }
  // "Target legendary creature becomes a God in addition to its other types" (Tyrite Sanctum), "That creature becomes a
  // Vampire in addition to its other types" (Olivia Voldaren), "each creature you control becomes a Phyrexian in addition
  // to its other types" (Breach the Multiverse): no duration, so for as long as each stays on the battlefield (CR 611.2a,
  // 400.7), and only the creatures there as it resolves (CR 611.2c). A creature type, which goes if the permanent stops
  // being a creature (CR 205.3d, rulings).
  // "Earthbend X, .... That land becomes an Island in addition to its other types" (The Legend of Kyoshi): a basic land
  // type, with its mana ability (CR 305.6), for as long as it's on the battlefield.
  // "Put a +1/+1 counter on up to one target creature. That creature becomes an artifact in addition to its other types"
  // (Phyrexian Scriptures): a card type added in layer 4 (CR 205.1b, 613.1d), indefinitely (rulings).
  if ((m = /^([Tt]arget .+?|That creature|That land|It|[Ee]ach creature you control) becomes an? ([A-Z][a-z]+|artifact) in addition to its other types$/.exec(s)) && (m[2] === "artifact" ? m[1] !== "That land" : (m[1] === "That land" ? ["Plains", "Island", "Swamp", "Mountain", "Forest"] : [...CREATURE_TYPES]).includes(m[2]!))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it").replace(/^Each/, "each").replace(/^That land$/, "that land"), ctx);
    const mods: Modification[] = m[2] === "artifact" ? [{ kind: "addTypes", types: ["Artifact"], subtypes: [] }] : [{ kind: "addTypes", types: [], subtypes: [m[2]!] }];
    // Olivia, Mobilized for War: "that creature" being the trigger's subject, for as long as it's that object (CR 400.7).
    if (what && (what.ref === "target" || what.ref === "each" || what.ref === "subject")) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // Origin of Spider-Man: "Put a +1/+1 counter on target creature you control. It becomes a legendary Spider Hero in
  // addition to its other types": the supertype and creature types added in layer 4 (CR 205.1b, 613.1d), indefinitely.
  if ((m = /^(It|That creature) becomes a (legendary )?((?:[A-Z][a-z]+ )*[A-Z][a-z]+) in addition to its other types$/.exec(s)) && m[3]!.split(" ").every((t) => CREATURE_TYPES.has(t)) && (m[2] || m[3]!.includes(" "))) {
    const what = parseObject(m[1] === "It" ? "it" : "that creature", ctx);
    if (what?.ref === "target") return [{ type: "continuous", what, mods: [{ kind: "addTypes", types: [], subtypes: m[3]!.split(" "), ...(m[2] ? { supertypes: ["Legendary"] } : {}) }], duration: "game" }];
  }
  // "~ becomes a Kithkin Spirit with base power and toughness 2/2" (Figure of Destiny), '~ gains "Whenever ~ deals combat
  // damage to a player, draw a card."' (Ascendant Spirit): no duration, so for as long as it stays on the battlefield
  // (CR 611.2a; a new object after a zone change, CR 400.7). New creature types replace its others (rulings).
  // Clavileño: 'It gains "When this creature dies, ..."' about a target: no duration, so for as long as it stays on the
  // battlefield (CR 611.2a), even if it stops being what it was targeted as.
  if ((m = /^([Tt]arget .+?|It) gains ("[^"]+")$/.exec(s))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    const grant = what?.ref === "target" && !what.n ? parseGrants(m[2]!) : null;
    if (what && grant?.length && grant.every((x) => x.kind === "addAbility")) return [{ type: "continuous", what, mods: grant, duration: "game" }];
  }
  // Mindbender Spores: "Whenever ~ blocks a creature, put four fungus counters on that creature. The creature gains "This
  // creature doesn't untap during your untap step if it has a fungus counter on it" and "At the beginning of your upkeep,
  // remove a fungus counter from this creature."": the trigger's creature, with no duration, so for as long as it stays on
  // the battlefield (CR 611.2a, 400.7); "your" in them is that creature's controller (CR 109.5).
  if ((m = /^The creature gains ("[^"]+" and "[^"]+")$/.exec(s)) && ctx.subject) {
    const grant = parseGrants(m[1]!);
    if (grant?.length === 2 && grant.every((x) => x.kind === "addAbility")) return [{ type: "continuous", what: { ref: "subject" }, mods: grant, duration: "game" }];
  }
  // Mist Dragon: "~ loses flying. (This effect lasts indefinitely.)" the same.
  // Elder Land Wurm: "When ~ blocks, it loses defender." (rulings: indefinitely) likewise, "it" being ~.
  if ((m = /^(~|[Ii]t) ((?:becomes?|gains?|loses?) .+)$/.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1] === "~" ? "~" : "it", ctx);
    const mods = what?.ref === "self" ? parseChanges(m[2]!) : null;
    if (what && mods) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // Wall of Dust: "Whenever ~ blocks a creature, that creature can't attack during its controller's next turn."
  if (/^[Tt]hat creature can't attack during its controller's next turn$/.test(s)) {
    const what = parseObject("that creature", ctx);
    return what && !isGroup(what) ? [{ type: "cantAttackNextTurn", what }] : null;
  }
  // Gideon, Battle-Forged: "up to one target creature an opponent controls attacks ~ during its controller's next turn if
  // able"; Gideon Jura: "during target opponent's next turn, creatures that player controls attack ~ if able". Only a
  // planeswalker's own ability (walkersToAttack checks it is one): ~ is what they attack (CR 508.1d).
  if ((m = /^((?:[Uu]p to one t|T)arget creature an opponent controls) attacks ~ during its controller's next turn if able$/.exec(s)) && ctx.activated) {
    const what = parseObject(m[1]!.replace(/^Up/, "up"), ctx);
    return what?.ref === "target" && !what.n ? [{ type: "attackWalkerNextTurn", what }] : null;
  }
  if (/^[Dd]uring target opponent's next turn, creatures that player controls attack ~ if able$/.test(s) && ctx.activated) {
    const who = parsePlayer("target opponent", ctx);
    return who ? [{ type: "attackWalkerNextTurn", who }] : null;
  }
  // Taunt: "During target player's next turn, creatures that player controls attack you if able": whatever they control as
  // attackers are declared that turn (CR 508.1d); one that can't attack you needn't attack at all.
  if (/^[Dd]uring target player's next turn, creatures that player controls attack you if able$/.test(s)) {
    const who = parsePlayer("target player", ctx);
    return who ? [{ type: "attackYouNextTurn", who }] : null;
  }
  // "Until your next turn, creatures your opponents control attack each combat if able and attack a player other than you
  // if able" (Kardur, Doomscourge), "until your next turn, each creature attacks ..." (Maximum Carnage): goad's
  // requirements (CR 701.15b, 508.1d) without goading them, for every creature in the group at any time, those that
  // enter later too (rulings; CR 611.2c is only for effects that change characteristics).
  if ((m = /^[Uu]ntil your next turn, (creatures your opponents control|each creature) attacks? each combat if able and attacks? a player other than you if able$/.exec(s))) {
    const affects = parseAffected(m[1] === "each creature" ? "Each creature" : "Creatures your opponents control");
    return affects ? [{ type: "groupRules", affects, text: m[1]!, mods: [{ kind: "goad", notGoaded: true }], duration: "yourNextTurn" }] : null;
  }
  // The Akroan War: "Until your next turn, creatures your opponents control attack each combat if able": the same way,
  // every creature in the group at any time (CR 611.2c is only for characteristics), unless it can't (rulings).
  if (/^[Uu]ntil your next turn, creatures your opponents control attack each combat if able$/.test(s)) {
    const affects = parseAffected("Creatures your opponents control");
    return affects ? [{ type: "groupRules", affects, text: "creatures your opponents control", mods: [{ kind: "attacksIfAble" }], duration: "yourNextTurn" }] : null;
  }
  // Akroma, Vision of Ixidor: "until end of turn, each other creature you control gets +1/+1 if it has flying, +1/+1 if
  // it has first strike, and so on for double strike, ...": +1/+1 for each of those keywords it has as this resolves
  // (rulings).
  if ((m = /^[Uu]ntil end of turn, each other creature you control gets \+1\/\+1 if it has flying, \+1\/\+1 if it has first strike, and so on for ((?:[a-z ]+, )+and [a-z]+)$/.exec(s)) && !ctx.spell) {
    const rest = m[1]!.replace(/, and /, ", ").split(", ");
    const keywords = ["flying", "first strike", ...rest].map((k) => canonicalKeyword(k) ?? (k === "protection" || k === "partner" ? capital(k) : undefined));
    if (keywords.some((k) => !k)) return null;
    const n = { count: { kind: "affectedKeywordCount" as const, keywords: keywords as string[] } };
    return [{ type: "continuous", what: { ref: "each", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "other creature you control" }, other: true }, mods: [{ kind: "modifyPT", power: n, toughness: n }], duration: "endOfTurn" }];
  }
  // "The tokens are goaded for the rest of the game" (Life of the Party, Balefang, Rendmaw): goaded by you (CR 701.15),
  // with no end; still goaded after you leave the game (rulings, CR 800.4a ends only control effects).
  // Serene Sleuth: "Then each creature you control is no longer goaded" (see the ungoad effect).
  if (/^(?:Then )?[Ee]ach creature you control is no longer goaded$/.test(s)) {
    const what = parseObject("each creature you control", ctx);
    return what ? [{ type: "ungoad", what }] : null;
  }
  if ((m = /^The (tokens are|token is) goaded for the rest of the game$/.exec(s)) && (ctx.lastCreatedAny || ctx.lastCreated)) return [{ type: "continuous", what: { ref: "created" }, mods: [{ kind: "goad" }], duration: "game" }];
  // Goad (CR 701.15a): "until your next turn, that creature attacks each combat if able and attacks a player other than you if able".
  // "Goad all creatures you don't control" (Disrupt Decorum), "goad all suspected creatures" (Nelly Borca): the creatures
  // there as it resolves (CR 611.2c; Disrupt Decorum's ruling: creatures entering later aren't goaded).
  // "Goad up to X target creatures your opponents control" (Death Kiss): each of them.
  // Coronation of Chaos: "Up to three target creatures can't block this turn. Goad them.": the same targets.
  if ((m = /^Goad (them|it|that creature)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "continuous", what, mods: [{ kind: "goad" }], duration: "yourNextTurn" }] : null;
  }
  if ((m = /^Goad ((?:up to (?:one|two|three|four|five|X) |any number of |two |three |X )?target .+|(?:all|each) .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" || what?.ref === "countersPutThisWay" || (what?.ref === "each" && /^(?:all|each) /i.test(m[1]!)) ? [{ type: "continuous", what, mods: [{ kind: "goad" }], duration: "yourNextTurn" }] : null;
  }
  // "Choose up to one target creature. If it's suspected, exile it. Otherwise, suspect it." (Agrus Kos): the target alone;
  // what follows says what happens to it.
  // "Choose target creature you control. Whenever that creature deals combat damage ... this turn, ..." (Hunter's Insight).
  if ((m = /^[Cc]hoose ((?:up to one )?target creature(?: you control)?)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [] : null;
  }
  // Suspect (CR 701.60a): "suspect up to one target creature", "suspect it", "suspect enchanted creature".
  if ((m = /^[Ss]uspect (.+)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "suspect", what }] : null;
  }
  // "All suspected creatures are no longer suspected", "you may have it become no longer suspected" (CR 701.60a).
  // "If it's suspected, it's no longer suspected" (Airtight Alibi).
  if ((m = /^(.+?) (?:is|are) no longer suspected$/.exec(s)) || (m = /^Have (it|~|that creature) become no longer suspected$/.exec(s)) || (m = /^(It)'s no longer suspected$/.exec(s))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    return what ? [{ type: "suspect", what, no: true }] : null;
  }
  // Detain (CR 701.35a): "until your next turn, that permanent can't attack or block and its activated abilities can't be activated".
  // Lyev Decree: "Detain up to two target creatures your opponents control": each of them. Lavinia of the Tenth: "detain each
  // nonland permanent your opponents control with mana value 4 or less".
  if ((m = /^Detain (each .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" ? [{ type: "continuous", what, mods: [{ kind: "cantAttack" }, { kind: "cantBlock" }, { kind: "cantActivate" }], duration: "yourNextTurn" }] : null;
  }
  if ((m = /^Detain ((?:up to (?:one|two|three) )?target .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "continuous", what, mods: [{ kind: "cantAttack" }, { kind: "cantBlock" }, { kind: "cantActivate" }], duration: "yourNextTurn" }] : null;
  }
  return undefined;
}

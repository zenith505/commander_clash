// Sentences that act on permanents: destroy, tap, connive, regenerate, counters, gaining control, continuous changes until end of turn.

import type { AmountExpr, Count, Effect, Modification, ObjRef } from "../../abilities";
import { NUM, NUMX, COUNTER, counterKind, amt, isGroup, num, capital, singular } from "../words";
import { pickFilter, parseGroup, parseObject, parsePlayer, parseTargetPhrase, PERMANENT_TYPES } from "../targets";
import { addTarget } from "../body";
import { parseCount } from "../counts";
import { parseChanges, parseSentence } from "../sentence";
import { parseAffected, parseExtraBlocks, parseIsA, parseStaticMods } from "../statics";
import type { Ctx } from "../body";
import { canonicalKeyword, CREATURE_TYPES } from "../../keywords";
import { parseGrants } from "../grants";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parsePermanentsSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  if (/^You have no maximum hand size for the rest of the game$/.test(s)) return [{ type: "noMaxHandSize" }];
  // "Turn target face-down creature face up" (CR 708.8), "you may turn a face-down creature you control face up" (Ugin's
  // Mastery): chosen as it resolves (CR 608.2d), with no cost paid.
  let fu: RegExpExecArray | null;
  if ((fu = /^[Tt]urn (target face-down .+?) face up$/.exec(s))) {
    const what = parseObject(fu[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "turnFaceUp", what }] : null;
  }
  if ((fu = /^[Tt]urn an? (face-down (?:creature|permanent) you control) face up$/.exec(s))) {
    const filter = parseTargetPhrase(fu[1]!);
    return filter?.kind === "object" ? [{ type: "pick", who: { ref: "you" }, filter: { ...filter, text: fu[1]! }, n: 1, action: "choose" }, { type: "turnFaceUp", what: { ref: "created" } }] : null;
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
  let m: RegExpExecArray | null;

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
  if ((m = /^([Dd]ouble|[Tt]riple) (~'s|target creature's|that creature's|its) (power|toughness|power and toughness) until end of turn$/.exec(s))) {
    const what = parseObject(m[2] === "its" ? "it" : m[2]!.slice(0, -2), ctx);
    if (!what || isGroup(what)) return null;
    return [{ type: "doublePT", what, power: m[3] !== "toughness", toughness: m[3] !== "power", ...(/^t/i.test(m[1]!) ? { triple: true as const } : {}) }];
  }
  // "Until end of turn, ~'s base power becomes equal to the number of Towns you control" (PuPu UFO): its power set in
  // layer 7b (CR 613.4b), the number counted as it resolves (rulings).
  // The body has moved the "Until end of turn, " to the end.
  if ((m = /^~'s base power becomes equal to (the number of .+) until end of turn$/.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    if (!n) return null;
    return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "setPower", power: n }], duration: "endOfTurn" }];
  }

  // "Tap any number of untapped creatures you control" (Devout Invocation), "you may tap any number of untapped Gates you
  // control" (Guild Summit): chosen as it resolves, none allowed, so "you may" changes nothing (CR 608.2d). Followed by
  // "for each creature tapped this way" or "When you do, ... the number of creatures tapped this way".
  if ((m = /^(?:[Yy]ou may )?[Tt]ap any number of untapped ((?:[A-Z][a-z]+ )?(?:creatures|artifacts|Gates|Humans)) you control$/.exec(s))) {
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
  // "Transform ~" (CR 701.27a); "you may transform it" in a trigger about itself (Vincent Valentine).
  if (/^[Tt]ransform ~$/.test(s) || (ctx.selfIt && /^[Tt]ransform it$/.test(s))) return [{ type: "transform", what: { ref: "self" } }];
  // "Transform up to one target Incubator token you control" (Attentive Skywarden), "transform target Werewolf you
  // control": a permanent that isn't a transforming one doesn't (CR 701.27c).
  if ((m = /^[Tt]ransform ((?:up to one )?target .+)$/.exec(s))) {
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
  // "Tap or untap target permanent" (Twiddle, Pestermite): which is chosen as it resolves (CR 608.2d).
  if ((m = /^Tap or untap ((?:another )?target .+|that creature|it|~|enchanted \w+|equipped \w+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) && !(what.ref === "target" && what.n) ? [{ type: "tapOrUntap", what }] : null;
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
  // Removing from combat (CR 506.4): Gustcloak Runner's "untap it and remove it from combat", "remove ~ from combat".
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
  // Steel Hellkite: "Destroy each nonland permanent with mana value X whose controller was dealt combat damage by ~ this
  // turn": whoever controls it now (rulings).
  if ((m = /^Destroy (each .+?) whose controller was dealt combat damage by ~ this turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" && !what.of ? [{ type: "destroy", what: { ...what, of: { ref: "combatDamagedBySelf" } } }] : null;
  }
  // "Destroy target nonblack creature and target land" (Plague Spores): two targets, each destroyed.
  if ((m = /^(Destroy|Exile) (target [^,]+?) and (target .+)$/i.exec(s)) && !/ and target /.test(m[3]!)) {
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
  // Together Forever: "When that creature dies this turn, return that card to its owner's hand": the card it became in
  // the graveyard (CR 400.7, 603.7c).
  if (/^When that creature dies this turn, return that card to its owner's hand$/.test(s) && ctx.lastObjectTarget !== undefined)
    return [{ type: "delayed", when: "dies", of: { ref: "target", index: ctx.lastObjectTarget }, effects: [{ type: "bounce", what: { ref: "subjectCard", zone: "graveyard" } }], text: "return that card to its owner's hand", thisTurn: true }];
  // Kelsien, the Plague: "When that creature dies this turn, you get an experience counter": a delayed trigger about the
  // creature it targeted (CR 603.7), for the rest of this turn, with an effect that doesn't refer to that creature.
  if ((m = /^When that creature dies this turn, (.+)$/.exec(s)) && ctx.lastObjectTarget !== undefined && !ctx.spell && !/\b(?:it|its|that creature|that card|target|this way)\b/i.test(m[1]!)) {
    const inner = parseSentence(capital(m[1]!), ctx);
    return inner ? [{ type: "delayed", when: "dies", of: { ref: "target", index: ctx.lastObjectTarget }, effects: inner, text: m[1]!, thisTurn: true }] : null;
  }
  // Adarkar Valkyrie: "{T}: When target creature other than ~ dies this turn, return that card to the battlefield under
  // your control": a delayed trigger about the target (CR 603.7), the card it became in the graveyard (CR 400.7); a token
  // doesn't return (rulings).
  if ((m = /^When (another target creature|target creature) dies this turn, return that card to the battlefield under your control$/.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" && !what.n ? [{ type: "delayed", when: "dies", of: what, effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "graveyard" } }], text: "return that card to the battlefield under your control", thisTurn: true }] : null;
  }
  // Removal and tapping. Not a blink ("Exile target creature you control, then return that card ...", sentences/tokens.ts).
  if (!/^Exile [^,]+, then return /i.test(s) && (m = /^(Destroy|Exile|Tap|Untap) ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+|all .+|each .+|~|~ and (?:each|all) .+|it|that creature|that permanent|that land|them|those creatures|those permanents|those lands|the chosen creatures|enchanted \w+|equipped \w+)$/i.exec(s))) {
    let what = parseObject(m[2]!, ctx);
    if (!what) return null;
    // "Create a token that's a copy of it .... Then exile all other Nightmare tokens you control" (Abyssal Harvester): other
    // than the token just created (rulings).
    if (what.ref === "each" && what.other && ctx.lastCreated && /^all other .+ tokens you control$/i.test(m[2]!)) {
      const { other: _, ...rest } = what;
      what = { ...rest, notCreated: true };
    }
    const type = ({ destroy: "destroy", exile: "exile", tap: "tap", untap: "untap" } as const)[m[1]!.toLowerCase() as "destroy" | "exile" | "tap" | "untap"];
    if ((type === "tap" || type === "untap") && what.ref === "each") ctx.lastGroup = what;
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
  // the attacking creature (the trigger's subject).
  if ((m = /^((?:up to one )?target .+?) blocks it this combat if able$/i.exec(s)) && ctx.subjectIt) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "mustBlockSource", what, attacker: { ref: "subject" } }] : null;
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
  // "Target creature blocks this turn if able": any attacking creature (CR 509.1c).
  if ((m = /^(target .+?|it|that creature|each creature(?: your opponents control)?) blocks this turn if able$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
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
  if (/^If it's a creature, it can't be regenerated this turn, and if it would die this turn, exile it instead$/i.test(s)) {
    const i = ctx.targets.length - 1;
    if (ctx.targets[i]?.kind !== "any") return null;
    const what: ObjRef = { ref: "target", index: i };
    return [{ type: "noRegen", what, ifCreature: true }, { type: "exileIfDies", what, ifCreature: true }];
  }
  // "~ assigns no combat damage this turn" (CR 510.1): the Laccoliths, Ophidian.
  if ((m = /^(.+?) assigns no combat damage this (turn|combat)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "noCombatDamage", what, ...(m[2] === "combat" ? { combat: true as const } : {}) }] : null;
  }
  // "That creature doesn't untap during its controller's next untap step", "Those creatures don't untap during their controllers' next untap steps"
  if ((m = /^(.+?) (?:doesn't|don't|do not|does not) untap during (?:its controller's|their controllers?'s?|your) next untap steps?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    // "Tap all creatures your opponents control. Those creatures don't untap ..." (Cone of Cold): the group just tapped.
    const tapped = what && what === ctx.lastGroup && /^(?:those creatures|they)$/i.test(m[1]!);
    // Tangle: "Each attacking creature doesn't untap during its controller's next untap step": those attacking as it
    // resolves (CR 611.2c).
    const attackers = /^each attacking creature$/i.test(m[1]!);
    return what && (!isGroup(what) || tapped || attackers) ? [{ type: "skipUntap", what }] : null;
  }
  // Sleep: "Tap all creatures target player controls. Those creatures don't untap during that player's next untap step":
  // the creatures that player controls, so their controller's untap step.
  if ((m = /^(those creatures|they) don't untap during that player's next untap step$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const theirs = what && what === ctx.lastGroup && what.ref === "each" && what.of?.ref === "target" && ctx.targets[what.of.index]?.kind === "player";
    return what && theirs ? [{ type: "skipUntap", what }] : null;
  }
  // Phasing out (CR 702.26b): "~ phases out", "target creature phases out", "all permanents you control phase out".
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
  if ((m = /^Regenerate (~|(?:another )?target .+|enchanted creature|equipped creature|each (?:other )?creature you control|all (?:[A-Z][a-z]+ )?creatures you control)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "regenerate", what }] : null;
  }
  // "Return each card with the most votes or tied for most votes to your hand" (Custodi Squire): cards in your graveyard.
  if (ctx.vote?.among && (m = /^Return (each card with the most votes or tied for most votes) to your hand$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "bounce", what }] : null;
  }
  if ((m = /^Return ((?:all|each) .+?) to (?:their|its) owners?'s? hands?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" ? [{ type: "bounce", what }] : null;
  }
  // Get Out: "Return one or two target creatures and/or enchantments you own to your hand": targets you own (CR 108.3),
  // to their owner's hand, yours.
  if ((m = /^Return ((?:one or two |up to (?:one|two|three) )?target (?!.*\bspells?\b).+?) you own to your hand$/.exec(s))) {
    const before = ctx.targets.length;
    const fx = parseSentence(`Return ${m[1]} to their owners' hands`, ctx);
    const added = ctx.targets.slice(before);
    if (!fx || !added.length || added.some((t) => t.kind !== "object" || t.owner || t.controller)) {
      ctx.targets.length = before;
      return null;
    }
    for (let i = before; i < ctx.targets.length; i++) ctx.targets[i] = { ...ctx.targets[i]!, owner: "you" } as typeof ctx.targets[number];
    return fx;
  }
  if (!/^Return target (?:[a-z]+ )*spell(?: you don't control| an opponent controls| or [^,]+)? to/i.test(s) && (m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+?|~|it|that card|that creature|those creatures|enchanted creature|equipped creature) to (?:its owner's hand|their owners' hands|their owner's hand)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
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
  // in turn, on the same permanent.
  const list = new RegExp(`^Put ((?:${NUMX} ${COUNTER} counters?, )+)and (${NUMX} ${COUNTER} counters?) on (target .+|~)$`, "i").exec(s);
  if (list) {
    const kinds = [...list[1]!.split(", ").filter(Boolean), list[4]!];
    const before = ctx.targets.length;
    const out: Effect[] = [];
    for (const [i, k] of kinds.entries()) {
      const fx = parseSentence(`Put ${k} on ${i === 0 || list[7] === "~" ? list[7] : "it"}`, ctx);
      if (!fx || (i === 0 && list[7] !== "~" && (ctx.targets.length !== before + 1 || ctx.lastObjectTarget !== before))) {
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
  if ((m = new RegExp(`^Put (${NUMX} ${COUNTER} counters?) on (target creature) and (${NUMX} ${COUNTER} counters?) on (another target creature)$`, "i").exec(s))) {
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
  // Imperial Edict: "Target opponent chooses a creature they control. Destroy that creature.": that player picks as it
  // resolves (not targeted); "that creature" is the one picked.
  if ((m = /^(Target opponent|Target player) chooses (an? [a-z]+) they control$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const filter = pickFilter(m[2]!.replace(/^an? /i, ""));
    return who?.ref === "target" && filter ? [{ type: "pick", who, filter, n: 1, action: "choose" }] : null;
  }
  // "You may tap five untapped artifacts and/or creatures you control. If you do, transform ~." (Thousand Moons Smithy):
  // picked as it resolves, not targeted, all of them or none (it can't be done with fewer, CR 101.3).
  if ((m = /^[Tt]ap (two|three|four|five|six|seven) untapped (.+?s) you control$/.exec(s))) {
    const filter = pickFilter(`untapped ${m[2]!.replace(/ and\/or /g, " or ").split(" ").map((w) => (w === "or" ? w : singular(w))).join(" ")}`);
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: num(m[1]!), action: "tap" }];
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
  // "Remove all counters from target permanent" (every kind), "Remove all counters from that creature".
  if ((m = /^Remove all counters from (~|it|that creature|target .+|up to one target .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "removeAllCounters", what }] : null;
  }
  // "Move all counters from target creature onto another target creature" (CR 122.5).
  // The Ozolith: "move all counters from ~ onto target creature" (rulings: all of them or none).
  if ((m = /^Move all counters from (target .+?|~) onto ((?:another )?target .+)$/i.exec(s)) && (m[1] === "~") === !/^another /i.test(m[2]!)) {
    const from = parseObject(m[1]!, ctx);
    const to = from && !isGroup(from) ? parseObject(m[2]!, ctx) : null;
    return from && to && !isGroup(to) ? [{ type: "moveAllCounters", from, to }] : null;
  }
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
  // Heartmender: "remove a -1/-1 counter from each creature you control": one from each that has one.
  if ((m = new RegExp(`^Remove (a|all) ${COUNTER} counters? from (each creature you control)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what?.ref === "each" ? [{ type: "removeCounters", what, counter: counterKind(m[2]!), n: /^all$/i.test(m[1]!) ? "all" : 1 }] : null;
  }
  if ((m = new RegExp(`^Remove (all|${NUMX.slice(1, -1)}) ${COUNTER} counters? from (~|it|target .+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what && !isGroup(what) ? [{ type: "removeCounters", what, counter: counterKind(m[2]!), n: /^all$/i.test(m[1]!) ? "all" : amt(m[1]!) }] : null;
  }
  // "Remove up to three counters from target permanent" (Glissa Sunslayer), "Remove X counters from target permanent,
  // where X is ..." (Thornmantle Striker), "Remove a counter from target nonland permanent" (Thrull Parasite).
  if ((m = new RegExp(`^Remove (up to )?(a|${NUMX.slice(1, -1)}) counters? from (~|it|target .+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what && !isGroup(what) ? [{ type: "removeAnyCounters", what, n: /^a$/i.test(m[2]!) ? 1 : amt(m[2]!), ...(m[1] ? { upTo: true as const } : {}) }] : null;
  }
  // The Ozolith: "Whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on
  // ~": as many of each kind as that creature had as it last existed, put on (rulings: not moved).
  // Resourceful Defense: "... put those counters on target permanent you control", the same way.
  // Reluctant Role Model: "... on up to one target creature": none chosen, none put.
  if ((m = /^Put those counters on (~|(?:up to one )?target .+)$/i.exec(s)) && ctx.subjectLeft) {
    const what = m[1] === "~" ? ({ ref: "self" } as const) : parseObject(m[1]!, ctx);
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
    const spec = one === words ? null : parseTargetPhrase(one);
    if (spec?.kind !== "object") return null;
    const first = ctx.targets.length;
    const divided = { first, n, total, counter: counterKind(m[2]!), ...(upTo ? { upTo: true as const } : {}) };
    for (let k = 0; k < n; k++)
      addTarget(ctx, { ...spec, text: `target ${one}`, divided, ...(k || upTo ? { optional: true } : {}), ...(k ? { distinctFrom: Array.from({ length: k }, (_, j) => first + j) } : {}) });
    ctx.lastTargets = { index: first, n };
    return [{ type: "counters", what: { ref: "target", index: first, n }, counter: counterKind(m[2]!), n: total, divided: true }];
  }
  // "Distribute up to X +1/+1 counters among any number of other target creatures, where X is ..." (Lathiel, rewritten in
  // triggers.ts): X worked out as the targets are chosen, then any number of them each getting at least 1, X in all at
  // most (rulings; CR 601.2d).
  if ((m = /^[Dd]istribute up to X ([+-]1\/[+-]1) counters among any number of ((?:other )?target creatures)$/.exec(s)) && ctx.whereX) {
    const spec = parseTargetPhrase(m[2]!.replace(/^(?:other )?target /, "").replace(/creatures$/, "creature"));
    if (spec?.kind !== "object" || ctx.targets.some((t) => t.many)) return null;
    const first = ctx.targets.length;
    const x: AmountExpr = { count: { kind: "x" } };
    addTarget(ctx, { ...spec, ...(/^other /.test(m[2]!) ? { notSource: true } : {}), text: m[2]!.replace(/creatures$/, "creature"), divided: { first, n: 1, total: 0, amount: x, counter: counterKind(m[1]!), atMost: true }, many: "any" });
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
  // Reluctant Role Model: "put a flying, lifelink, or +1/+1 counter on it": one of the three kinds, chosen as it resolves.
  if ((m = new RegExp(`^[Pp]ut an? ${COUNTER}, ${COUNTER}, or ${COUNTER} counter on (.+)$`).exec(s)) && new Set([m[1], m[2], m[3]]).size === 3) {
    const what = parseObject(m[4]!, ctx);
    return what && !isGroup(what) ? [{ type: "counters", what, counter: counterKind(m[1]!), orCounter: counterKind(m[2]!), orCounters: [counterKind(m[3]!)], n: 1 }] : null;
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
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on (.+)$`, "i").exec(s))) {
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
  if ((m = /^Gain control of ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+?)( until end of turn)?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: m[2] ? "endOfTurn" : "game" }] : null;
  }
  // Treasure Nabber: "gain control of that artifact until the end of your next turn", the trigger's subject; ends in the
  // cleanup step of your next turn (CR 514.2, 611.2a).
  if ((m = /^[Gg]ain control of it( until end of turn| until the end of your next turn)?$/.exec(s)) && ctx.subjectIt)
    return [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "control" }], duration: m[1] === " until end of turn" ? "endOfTurn" : m[1] ? "endOfYourNextTurn" : "game" }];
  // "Target player gains control of target permanent you control" (Donate), "An opponent gains control of ~" (Wishclaw
  // Talisman): an opponent you choose as it resolves (rulings). Layer 2, for the rest of the game.
  if ((m = /^(Target player|Target opponent) gains control of (target .+)$/.exec(s))) {
    const who = parsePlayer(m[1]!.toLowerCase(), ctx);
    const what = who && parseObject(m[2]!, ctx);
    return who && what?.ref === "target" && !what.n ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: "game", giveTo: who }] : null;
  }
  // "That player gains control of ~" (Coveted Jewel): the trigger's player, for the rest of the game (layer 2).
  // Jeweled Amulet: "Note the type of mana spent to pay this activation cost."
  if (s === "Note the type of mana spent to pay this activation cost" && ctx.activated) return [{ type: "noteManaSpent" }];
  // Slicer, Hired Muscle: "... until end of turn" (CR 611.2a), ending in the cleanup step (514.2).
  if (/^That player gains control of ~$/.test(s) && ctx.chosenOpponent && !ctx.eventPlayer) return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "chosenPlayer" } }];
  if ((m = /^[Tt]hat player gains control of ~( until end of turn)?$/.exec(s)) && ctx.eventPlayer) return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: m[1] ? "endOfTurn" : "game", giveTo: { ref: "eventPlayer" } }];
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
  if ((m = /^(Target player|Target opponent) gains control of ~$/.exec(s)) && !ctx.spell) {
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
  if ((m = /^Gain control of (that Equipment)( until end of turn)?$/.exec(s)) && ctx.spell) {
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
  // Switching power and toughness (layer 7d).
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
  // "Enchanted creature gets +1/-1 or -1/+1 until end of turn" (Pemmin's Aura): which one is chosen as it resolves
  // (CR 608.2d), like the above.
  if ((m = /^(enchanted creature|~) gets ([+-]\d+\/[+-]\d+) or ([+-]\d+\/[+-]\d+) until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!.toLowerCase() === "~" ? "~" : m[1]!.toLowerCase(), ctx);
    const a = parseChanges(`gets ${m[2]}`);
    const b = parseChanges(`gets ${m[3]}`);
    if (!what || !a || !b) return null;
    return [{ type: "either", options: [[{ type: "continuous", what, mods: a, duration: "endOfTurn" }], [{ type: "continuous", what, mods: b, duration: "endOfTurn" }]], labels: [`It gets ${m[2]} until end of turn`, `It gets ${m[3]} until end of turn`] }];
  }
  // "Until your next turn, up to one target noncreature artifact becomes an artifact creature ..." (Karn, the Great
  // Creator): the same as with the duration after it.
  if ((m = /^Until (end of turn|your next turn), ((?:up to one )?target .+?) ((?:gets?|gains?|loses?|has|becomes?) .+)$/.exec(s))) {
    const what = parseObject(m[2]!, ctx);
    const mods = what && parseChanges(m[3]!);
    return what && mods ? [{ type: "continuous", what, mods, duration: m[1] === "end of turn" ? "endOfTurn" : "yourNextTurn" }] : null;
  }
  if ((m = /^(.+?) ((?:gets?|gains?|loses?|has|have|becomes?|assigns?|can attack) .+) until (end of turn|your next turn)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && parseChanges(m[2]!);
    return what && mods ? [{ type: "continuous", what, mods, duration: m[3] === "end of turn" ? "endOfTurn" : "yourNextTurn" }] : null;
  }
  // "Gain control of target artifact. Untap it. It gains haste." (Momo's Heist), "Create a token that's a copy of target
  // artifact. That token gains haste." (Cogwork Assembler), "Populate. The token created this way gains haste." (Determined
  // Iteration), "Those tokens gain haste" (Mirror March): keywords with no duration last for as long as it stays on
  // the battlefield (CR 611.2a; a new object after a zone change, CR 400.7).
  if ((m = /^([Tt]arget .+?|It|That token|That creature|That artifact|That [A-Z][a-z]+|They|Those tokens|The token created this way) (gains? .+)$/.exec(s)) && !/ until | this turn$/.test(m[2]!)) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && (what.ref === "target" || what.ref === "created") ? parseChanges(m[2]!) : null;
    // A quoted ability too, on a token just created: "It gains haste and "When this token dies, draw a card."" (Jaxis).
    if (what && mods?.length && mods.every((x) => x.kind === "addKeywords" || (x.kind === "addAbility" && what.ref === "created"))) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // Riding the Dilu Horse: "Target creature gets +2/+2 and gains horsemanship.": no duration, so for as long as it stays
  // on the battlefield (CR 611.2a, rulings).
  if ((m = /^([Tt]arget creature) (gets [+-]\d+\/[+-]\d+(?: and gains [a-z]+)?)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" ? parseChanges(m[2]!) : null;
    if (what && mods?.length && mods.every((x) => x.kind === "addKeywords" || x.kind === "modifyPT")) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // Chance for Glory: "Creatures you control gain indestructible": the creatures there as it resolves (CR 611.2c), for as
  // long as each stays on the battlefield (CR 611.2a).
  if ((m = /^(Creatures you control) (gain [a-z ,]+)$/.exec(s)) && ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "each" ? parseChanges(m[2]!) : null;
    if (what && mods?.length && mods.every((x) => x.kind === "addKeywords")) return [{ type: "continuous", what, mods, duration: "game" }];
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
  if ((m = /^(target .+?|It|each [a-z ]+? you control) becomes? (an? \d+\/\d+ .+|a creature with [a-z, ]+ and "(?:This creature|~)'s power and toughness are each equal to [^"]+"|a creature in addition to its other types and has base power and base toughness each equal to its mana value)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = (what?.ref === "target" || (what?.ref === "each" && /^each /i.test(m[1]!))) && parseChanges(`becomes ${m[2]!}`);
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // Depthshaker Titan: "Any number of target noncreature artifacts you control become 3/3 artifact creatures": each of
  // them, as with one target (no duration: for as long as each stays on the battlefield, CR 611.2a).
  if ((m = /^((?:[Aa]ny number of|[Uu]p to (?:two|three|four|five)) target .+?) become (\d+\/\d+) ((?:[a-z]+ )*)creatures$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" && parseChanges(`becomes a ${m[2]} ${m[3]}creature`);
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // Oko, Thief of Crowns: "Exchange control of target artifact or creature you control and target creature an opponent
  // controls with power 3 or less" (CR 701.12b).
  // Volatile Stormdrake: "Exchange control of ~ and target creature an opponent controls": ~ as it is (rulings: it must
  // still be on the battlefield).
  // Gilded Drake: "Exchange control of ~ and up to one target creature an opponent controls" (with none chosen, no exchange).
  if ((m = /^[Ee]xchange control of (~|target .+? you control) and ((?:up to one )?target .+? an opponent controls(?: with .+)?)$/.exec(s))) {
    if (m[2]!.startsWith("up to") && m[1] !== "~") return null;
    const a: ObjRef | null = m[1] === "~" ? { ref: "self" } : parseObject(m[1]!, ctx);
    const b = a?.ref === "self" || (a?.ref === "target" && !a.n) ? parseObject(m[2]!, ctx) : null;
    return a && b?.ref === "target" && !b.n ? [{ type: "exchangeControl", a, b }] : null;
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
  // card and creature types are replaced; its supertypes stay (rulings).
  if ((m = /^(target .+?) (loses all abilities and becomes an? .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" ? parseChanges(m[2]!) : null;
    if (what && mods) return [{ type: "continuous", what, mods, duration: "game" }];
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
    if (what && (what.ref === "target" || what.ref === "each")) return [{ type: "continuous", what, mods, duration: "game" }];
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
  if ((m = /^~ ((?:becomes?|gains?) .+)$/.exec(s)) && !ctx.spell) {
    const what = parseObject("~", ctx);
    const mods = what?.ref === "self" ? parseChanges(m[1]!) : null;
    if (what && mods) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // "Until your next turn, creatures your opponents control attack each combat if able and attack a player other than you
  // if able" (Kardur, Doomscourge), "until your next turn, each creature attacks ..." (Maximum Carnage): goad's
  // requirements (CR 701.15b, 508.1d) without goading them, for every creature in the group at any time, those that
  // enter later too (rulings; CR 611.2c is only for effects that change characteristics).
  if ((m = /^[Uu]ntil your next turn, (creatures your opponents control|each creature) attacks? each combat if able and attacks? a player other than you if able$/.exec(s))) {
    const affects = parseAffected(m[1] === "each creature" ? "Each creature" : "Creatures your opponents control");
    return affects ? [{ type: "groupRules", affects, text: m[1]!, mods: [{ kind: "goad", notGoaded: true }], duration: "yourNextTurn" }] : null;
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
  if ((m = /^The (tokens are|token is) goaded for the rest of the game$/.exec(s)) && (ctx.lastCreatedAny || ctx.lastCreated)) return [{ type: "continuous", what: { ref: "created" }, mods: [{ kind: "goad" }], duration: "game" }];
  // Goad (CR 701.15a): "until your next turn, that creature attacks each combat if able and attacks a player other than you if able".
  // "Goad all creatures you don't control" (Disrupt Decorum), "goad all suspected creatures" (Nelly Borca): the creatures
  // there as it resolves (CR 611.2c; Disrupt Decorum's ruling: creatures entering later aren't goaded).
  // "Goad up to X target creatures your opponents control" (Death Kiss): each of them.
  // Coronation of Chaos: "Up to three target creatures can't block this turn. Goad them.": the same targets.
  if ((m = /^Goad (them|it)$/.exec(s))) {
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

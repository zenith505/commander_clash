// Sentences that act on permanents: destroy, tap, connive, regenerate, counters, gaining control, continuous changes until end of turn.

import type { Effect, ObjRef } from "../../abilities";
import { NUM, NUMX, COUNTER, counterKind, amt, isGroup, num, capital } from "../words";
import { pickFilter, parseGroup, parseObject, parsePlayer, parseTargetPhrase } from "../targets";
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
  // Illusion of Choice (CR 701.38): the votes of every vote this turn are this player's to make.
  if (/^You choose how each player votes this turn$/.test(s)) return [{ type: "chooseVotes" }];
  // "Until your next turn, creatures your opponents control enter tapped" (Cone of Cold): a replacement effect that lasts
  // (CR 614.1c, 611.2b).
  const untilTapped = /^Until your next turn, ([a-z][^,]*?) enter tapped$/.exec(s);
  if (untilTapped) {
    const g = parseGroup(untilTapped[1]!, true);
    return g && !g.other ? [{ type: "enterTappedUntil", filter: g.filter }] : null;
  }
  let m: RegExpExecArray | null;

  // "Double the power of each creature you control until end of turn" (Double Trouble), "double the power and toughness
  // of each creature you control", "double the toughness of each creature you control" (CR 701.10b-c): each gets +X/+0
  // (+X/+Y, +0/+Y), X its own power and Y its own toughness as this resolves.
  if ((m = /^[Dd]ouble the (power|toughness|power and toughness) of (each .+?|other creatures you control|creatures you control) until end of turn$/.exec(s))) {
    const what = parseObject(m[2]!.startsWith("each") ? m[2]! : `each ${m[2]!.replace(/^other creatures/, "other creature").replace(/^creatures/, "creature")}`, ctx);
    if (!what || !isGroup(what)) return null;
    return [{ type: "doublePT", what, power: m[1] !== "toughness", toughness: m[1] !== "power" }];
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
    return ctx.castSpell && m[1] !== "X" ? [{ type: "spellEntersWith", counter: counterKind(m[m.length - 1]!), n: m[1] === "an" ? 1 : amt(m[1]!) }] : null;
  // "It gains haste until end of turn" about the spell a cast trigger is about (Tyvar Kell's emblem): the permanent it
  // becomes has it until end of turn (CR 400.7a, rulings on Tyvar Kell).
  // "It gains rebound" (Narset Transcendent): as it resolves (CR 702.88a).
  if (ctx.castSpell && (m = /^(?:[Ii]t|[Tt]hat spell) gains (.+?)( until end of turn)?$/.exec(s)) && (ctx.spellIt || /^[Tt]hat spell/.test(s))) {
    if (m[1] === "rebound" && !m[2]) return [{ type: "spellGains", mods: [{ kind: "addKeywords", keywords: ["Rebound"] }] }];
    const mods = m[2] ? parseGrants(m[1]!) : null;
    return mods?.length && mods.every((x) => x.kind === "addKeywords") ? [{ type: "spellGains", mods }] : null;
  }
  // A class level bar's activated ability (CR 716.2a; see striations.ts): only in an activated ability of its own.
  if ((m = /^~'s level becomes (\d+)$/.exec(s))) return ctx.activated ? [{ type: "classLevel", n: Number(m[1]) }] : null;
  // A Case's "To solve" trigger (CR 719.3a; see compile.ts): "this Case becomes solved".
  if (s === "~ becomes solved") return [{ type: "solve" }];
  if (s === "Harness ~") return [{ type: "harness" }];
  if (s === "The next spell you cast this turn has improvise") return [{ type: "nextSpellImprovise" }];
  // "Transform ~" (CR 701.27a).
  if (/^[Tt]ransform ~$/.test(s)) return [{ type: "transform", what: { ref: "self" } }];
  // "Transform up to one target Incubator token you control" (Attentive Skywarden), "transform target Werewolf you
  // control": a permanent that isn't a transforming one doesn't (CR 701.27c).
  if ((m = /^[Tt]ransform ((?:up to one )?target .+)$/.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "transform", what }] : null;
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
  if ((m = new RegExp(`^(?:You )?[Uu]ntap up to ${NUM} lands?$`).exec(s))) return [{ type: "untapUpTo", n: num(m[1]!), filter: { kind: "object", types: ["Land"], notTypes: [], notColors: [], text: "land" } }];
  // "Tap or untap target permanent" (Twiddle, Pestermite): which is chosen as it resolves (CR 608.2d).
  if ((m = /^Tap or untap ((?:another )?target .+|that creature|it|~|enchanted \w+|equipped \w+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) && !(what.ref === "target" && what.n) ? [{ type: "tapOrUntap", what }] : null;
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
  // Removal and tapping. Not a blink ("Exile target creature you control, then return that card ...", sentences/tokens.ts).
  if (!/^Exile [^,]+, then return /i.test(s) && (m = /^(Destroy|Exile|Tap|Untap) ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+|all .+|each .+|~|it|that creature|that permanent|that land|them|those creatures|those permanents|enchanted \w+|equipped \w+)$/i.exec(s))) {
    const what = parseObject(m[2]!, ctx);
    if (!what) return null;
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
  if ((m = /^(.+?) assigns no combat damage this turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "noCombatDamage", what }] : null;
  }
  // "That creature doesn't untap during its controller's next untap step", "Those creatures don't untap during their controllers' next untap steps"
  if ((m = /^(.+?) (?:doesn't|don't|do not|does not) untap during (?:its controller's|their controllers?'s?|your) next untap steps?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    // "Tap all creatures your opponents control. Those creatures don't untap ..." (Cone of Cold): the group just tapped.
    const tapped = what && what === ctx.lastGroup && /^(?:those creatures|they)$/i.test(m[1]!);
    return what && (!isGroup(what) || tapped) ? [{ type: "skipUntap", what }] : null;
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
  // Adapt N (CR 701.46a), Monstrosity N (CR 701.37a): only the permanent's own activated abilities do it.
  if ((m = /^(Adapt|Monstrosity) (\d+|X)$/.exec(s))) return ctx.activated ? [{ type: m[1] === "Adapt" ? "adapt" : "monstrosity", n: amt(m[2]!) }] : null;
  // Regeneration (CR 701.19a)
  // "Regenerate each creature you control" (Golgari Charm): a shield for each, as it resolves (CR 701.19a, 611.2c).
  if ((m = /^Regenerate (~|target .+|enchanted creature|equipped creature|each creature you control|all creatures you control)$/i.exec(s))) {
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
  // "Put a +1/+1 counter and a lifelink counter on target creature" (Unexpected Fangs): the same on the target.
  if ((m = new RegExp(`^Put (${NUMX} ${COUNTER} counters?) and (${NUMX} ${COUNTER} counters?) on (target .+)$`, "i").exec(s))) {
    const before = ctx.targets.length;
    const first = parseSentence(`Put ${m[1]} on ${m[7]}`, ctx);
    const second = first && ctx.targets.length === before + 1 && ctx.lastObjectTarget === before ? parseSentence(`Put ${m[4]} on it`, ctx) : null;
    if (first && second) return [...first, ...second];
    ctx.targets.length = before;
  }
  // "Choose an artifact or creature you control. Create a token that's a copy of it" (Season of Weaving): picked as it
  // resolves, not targeted (rulings); "it" is the one picked.
  if ((m = /^Choose (an? .+?) you control$/i.exec(s))) {
    const filter = pickFilter(m[1]!.replace(/^an? /i, ""));
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "choose" }];
  }
  // "Put a +1/+1 counter on a creature you control": picked as it resolves, not targeted.
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on (an? .+?) you control$`, "i").exec(s))) {
    const filter = pickFilter(m[3]!.replace(/^an? /i, ""));
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "counters", counter: { kind: counterKind(m[2]!), n: amt(m[1]!) } }];
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
  if ((m = /^Move any number of counters from (target .+?) onto (?:another|a second) (target .+)$/i.exec(s))) {
    const from = parseObject(m[1]!, ctx);
    const to = from && !isGroup(from) ? parseObject(m[2]!, ctx) : null;
    return from && to && !isGroup(to) ? [{ type: "removeAnyCounters", what: from, n: 0, upTo: true, moveTo: to }] : null;
  }
  // "Move a +1/+1 counter from target creature you control onto another target creature", Nesting Grounds' "move a
  // counter from target permanent you control onto a second target permanent" (a kind it has, chosen as it resolves).
  if ((m = new RegExp(`^Move (?:a|one) (?:(?<kind>${COUNTER}) )?counter from (?<from>target .+?) onto (?<to>another target .+|a second target .+)$`, "i").exec(s))) {
    const g = m.groups!;
    const from = parseObject(g.from!, ctx);
    const to = from && !isGroup(from) ? parseObject(g.to!.replace(/^a second /i, ""), ctx) : null;
    return from && to && !isGroup(to) ? [{ type: "moveCounter", counter: g.kind ? counterKind(g.kind) : "any", from, to }] : null;
  }
  // Portent Tracker (see parseBody): an opponent's battle loses defense, anyone else's gains it.
  if ((m = /^Remove (a|\w+) defense counters? from (target battle) if an opponent protects it, otherwise put that many on it$/.exec(s))) {
    const n = m[1] === "a" ? 1 : num(m[1]!);
    const what = Number.isInteger(n) && n > 0 ? parseObject(m[2]!, ctx) : null;
    return what && !isGroup(what) ? [{ type: "battleDefense", what, n }] : null;
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
  if ((m = /^Put those counters on (~|target .+)$/i.exec(s)) && ctx.subjectLeft) {
    const what = m[1] === "~" ? ({ ref: "self" } as const) : parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "lastKnownCounters", what }] : null;
  }
  // "When ~ dies, put its counters on target creature you control": as many of each kind as it had as it last
  // existed, put on, not moved (rulings on Dockworker Drone); "its +1/+1 counters" only that kind.
  if ((m = new RegExp(`^Put its (?:${COUNTER} )?counters on (.+)$`, "i").exec(s)) && ctx.selfCard) {
    const what = parseObject(m[2]!, ctx);
    return what && !isGroup(what) ? [{ type: "lastKnownCounters", what, ...(m[1] ? { only: counterKind(m[1]) } : {}) }] : null;
  }
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
  // Forgotten Ancient: "you may move any number of +1/+1 counters from ~ onto other creatures". Chosen as it resolves, not
  // targeted (rulings); any creatures but ~, whoever controls them.
  if ((m = new RegExp(`^(?:[Yy]ou may )?[Mm]ove any number of ${COUNTER} counters from ~ onto other creatures$`).exec(s)))
    return [{ type: "distribute", counter: counterKind(m[1]!), n: { count: { kind: "counters", counter: counterKind(m[1]!), of: { ref: "self" } } }, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "other creatures" }, move: true }];
  // "Double the number of +1/+1 counters on each creature you control" (Kalonian Hydra), "... of each kind of counter on
  // any number of target permanents" (Deepglow Skate): as many more as each has as it resolves (CR 701.10e), put on it.
  if ((m = new RegExp(`^Double the number of (?:${COUNTER} counters|(each kind of) counter) on (.+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what ? [{ type: "counters", what, counter: m[2] ? "+1/+1" : counterKind(m[1]!), n: 1, double: true, ...(m[2] ? { everyKind: true as const } : {}) }] : null;
  }
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on (.+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what ? [{ type: "counters", what, counter: counterKind(m[2]!), n: amt(m[1]!) }] : null;
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
  if (/^[Tt]hat player gains control of ~$/.test(s) && ctx.eventPlayer) return [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "eventPlayer" } }];
  // Alexios: "that player gains control of ~, untaps it, and puts a +1/+1 counter on it": that player puts the counter.
  if ((m = /^[Tt]hat player gains control of ~, untaps it, and puts (a|two|three) \+1\/\+1 counters? on it$/.exec(s)) && ctx.eventPlayer)
    return [
      { type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "eventPlayer" } },
      { type: "untap", what: { ref: "self" } },
      { type: "counters", what: { ref: "self" }, counter: "+1/+1", n: m[1] === "a" ? 1 : m[1] === "two" ? 2 : 3, by: { ref: "eventPlayer" } },
    ];
  if (/^An opponent(?: of your choice)? gains control of ~$/.test(s))
    return [{ type: "choose", choice: "opponent" }, { type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "game", giveTo: { ref: "chosenPlayer" } }];
  // "Gain control of that Equipment until end of turn" (Stolen Uniform): a target an earlier sentence chose.
  if ((m = /^Gain control of (that Equipment)( until end of turn)?$/.exec(s)) && ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: m[2] ? "endOfTurn" : "game" }] : null;
  }
  // "Gain control of all creatures until end of turn", "... all creatures target opponent controls", "... all artifacts
  // your opponents control": the permanents that match as it resolves, locked in then (CR 611.2c).
  if ((m = /^Gain control of (all .+?)( until end of turn)?$/i.exec(s))) {
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
  if ((m = /^(.+?) ((?:gets?|gains?|loses?|has|have|becomes?|assigns?|can attack) .+) until (end of turn|your next turn)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && parseChanges(m[2]!);
    return what && mods ? [{ type: "continuous", what, mods, duration: m[3] === "end of turn" ? "endOfTurn" : "yourNextTurn" }] : null;
  }
  // "Gain control of target artifact. Untap it. It gains haste." (Momo's Heist), "Create a token that's a copy of target
  // artifact. That token gains haste." (Cogwork Assembler): keywords with no duration last for as long as it stays on
  // the battlefield (CR 611.2a; a new object after a zone change, CR 400.7).
  if ((m = /^([Tt]arget .+?|It|That token|That creature|That artifact|That [A-Z][a-z]+|They) (gains? .+)$/.exec(s)) && !/ until | this turn$/.test(m[2]!)) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && (what.ref === "target" || what.ref === "created") ? parseChanges(m[2]!) : null;
    if (what && mods?.length && mods.every((x) => x.kind === "addKeywords")) return [{ type: "continuous", what, mods, duration: "game" }];
  }
  // "Target land you control becomes a 3/3 Elemental creature with haste that's still a land" (Brave the Wilds): with no
  // duration, for as long as it stays on the battlefield (CR 611.2a; a new object after a zone change, CR 400.7).
  // "Put four +1/+1 counters on target noncreature artifact. It becomes a 0/0 Bird creature" (Case of the Filched Falcon): the target.
  // Druid Class: 'becomes a creature with haste and "This creature's power and toughness are each equal to the number of
  // lands you control."': no number of its own; the ability it gains sets them, in layer 7b (CR 604.3a, 613.4b).
  if ((m = /^(target .+?|It) becomes? (an? \d+\/\d+ .+|a creature with [a-z, ]+ and "(?:This creature|~)'s power and toughness are each equal to [^"]+")$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" && parseChanges(`becomes ${m[2]!}`);
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // "Target creature becomes a Treasure artifact with "..." and loses all other card types and abilities" (Vraska,
  // Betrayal's Sting): for as long as it stays on the battlefield (CR 611.2a). Its supertypes stay (rulings, CR 205.1a);
  // losing its abilities comes before the one it gains, in layer 6.
  if ((m = /^(target .+?) becomes (an? .+?) and loses all other card types and abilities$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" ? parseIsA(m[2]!, true) : null;
    return what && mods ? [{ type: "continuous", what, mods: [{ kind: "loseAllAbilities" }, ...mods], duration: "game" }] : null;
  }
  // "Target legendary creature becomes a God in addition to its other types" (Tyrite Sanctum), "That creature becomes a
  // Vampire in addition to its other types" (Olivia Voldaren), "each creature you control becomes a Phyrexian in addition
  // to its other types" (Breach the Multiverse): no duration, so for as long as each stays on the battlefield (CR 611.2a,
  // 400.7), and only the creatures there as it resolves (CR 611.2c). A creature type, which goes if the permanent stops
  // being a creature (CR 205.3d, rulings).
  if ((m = /^([Tt]arget .+?|That creature|It|[Ee]ach creature you control) becomes an? ([A-Z][a-z]+) in addition to its other types$/.exec(s)) && CREATURE_TYPES.has(m[2]!)) {
    const what = parseObject(m[1]!.replace(/^It$/, "it").replace(/^Each/, "each"), ctx);
    if (what && (what.ref === "target" || what.ref === "each")) return [{ type: "continuous", what, mods: [{ kind: "addTypes", types: [], subtypes: [m[2]!] }], duration: "game" }];
  }
  // "~ becomes a Kithkin Spirit with base power and toughness 2/2" (Figure of Destiny), '~ gains "Whenever ~ deals combat
  // damage to a player, draw a card."' (Ascendant Spirit): no duration, so for as long as it stays on the battlefield
  // (CR 611.2a; a new object after a zone change, CR 400.7). New creature types replace its others (rulings).
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
  // Goad (CR 701.15a): "until your next turn, that creature attacks each combat if able and attacks a player other than you if able".
  // "Goad all creatures you don't control" (Disrupt Decorum), "goad all suspected creatures" (Nelly Borca): the creatures
  // there as it resolves (CR 611.2c; Disrupt Decorum's ruling: creatures entering later aren't goaded).
  if ((m = /^Goad (target .+|(?:all|each) .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" || (what?.ref === "each" && /^(?:all|each) /i.test(m[1]!)) ? [{ type: "continuous", what, mods: [{ kind: "goad" }], duration: "yourNextTurn" }] : null;
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
  if ((m = /^Detain (target .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "continuous", what, mods: [{ kind: "cantAttack" }, { kind: "cantBlock" }, { kind: "cantActivate" }], duration: "yourNextTurn" }] : null;
  }
  return undefined;
}

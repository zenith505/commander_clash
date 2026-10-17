// Sentences that act on permanents: destroy, tap, connive, regenerate, counters, gaining control, continuous changes until end of turn.

import type { Effect, ObjRef } from "../../abilities";
import { NUMX, COUNTER, counterKind, amt, isGroup, num } from "../words";
import { pickFilter, parseGroup, parseObject, parseTargetPhrase } from "../targets";
import { addTarget } from "../body";
import { parseCount } from "../counts";
import { parseChanges, parseSentence } from "../sentence";
import { parseExtraBlocks, parseStaticMods } from "../statics";
import type { Ctx } from "../body";
import { canonicalKeyword } from "../../keywords";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parsePermanentsSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  if (/^You have no maximum hand size for the rest of the game$/.test(s)) return [{ type: "noMaxHandSize" }];
  // "Until your next turn, creatures your opponents control enter tapped" (Cone of Cold): a replacement effect that lasts
  // (CR 614.1c, 611.2b).
  const untilTapped = /^Until your next turn, ([a-z][^,]*?) enter tapped$/.exec(s);
  if (untilTapped) {
    const g = parseGroup(untilTapped[1]!, true);
    return g && !g.other ? [{ type: "enterTappedUntil", filter: g.filter }] : null;
  }
  let m: RegExpExecArray | null;

  // "That creature enters with an additional +1/+1 counter on it" about a creature spell a cast trigger is about (Boreal
  // Outrider): the spell, as it resolves (CR 614.1c).
  if ((m = new RegExp(`^[Tt]hat creature enters with (an|${NUMX}) additional ${COUNTER} counters? on it$`).exec(s)))
    return ctx.castSpell && m[1] !== "X" ? [{ type: "spellEntersWith", counter: counterKind(m[m.length - 1]!), n: m[1] === "an" ? 1 : amt(m[1]!) }] : null;
  // A class level bar's activated ability (CR 716.2a; see striations.ts): only in an activated ability of its own.
  if ((m = /^~'s level becomes (\d+)$/.exec(s))) return ctx.activated ? [{ type: "classLevel", n: Number(m[1]) }] : null;
  // A Case's "To solve" trigger (CR 719.3a; see compile.ts): "this Case becomes solved".
  if (s === "~ becomes solved") return [{ type: "solve" }];
  // "Tap that creature and it doesn't untap during its controller's next untap step" (Kashi-Tribe Warriors).
  if ((m = /^Tap (target .+?|that creature|it) and it doesn't untap during its controller's next untap step$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "tap", what }, { type: "skipUntap", what }] : null;
  }
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
  // "Destroy target nonblack creature and target land" (Plague Spores): two targets, each destroyed.
  if ((m = /^(Destroy|Exile) (target [^,]+?) and (target .+)$/i.exec(s)) && !/ and target /.test(m[3]!)) {
    const a = parseObject(m[2]!, ctx);
    const b = a && parseObject(m[3]!, ctx);
    const type = m[1]!.toLowerCase() as "destroy" | "exile";
    return a?.ref === "target" && b?.ref === "target" ? [{ type, what: a }, { type, what: b }] : null;
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
  // Removal and tapping
  if ((m = /^(Destroy|Exile|Tap|Untap) ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+|all .+|each .+|~|it|that creature|that permanent|them|those creatures|those permanents|enchanted \w+|equipped \w+)$/i.exec(s))) {
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
  if ((m = /^Regenerate (~|target .+|enchanted creature|equipped creature)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "regenerate", what }] : null;
  }
  if ((m = /^Return ((?:all|each) .+?) to (?:their|its) owners?'s? hands?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" ? [{ type: "bounce", what }] : null;
  }
  if ((m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three |any number of (?:other )?|(?:up to )?X (?:other )?)?target .+?|~|it|that card|that creature|enchanted creature|equipped creature) to (?:its owner's hand|their owners' hands|their owner's hand)$/i.exec(s))) {
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
  if ((m = /^Remove all counters from (~|it|that creature|target .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "removeAllCounters", what }] : null;
  }
  // "Move all counters from target creature onto another target creature" (CR 122.5).
  if ((m = /^Move all counters from (target .+?) onto (another target .+)$/i.exec(s))) {
    const from = parseObject(m[1]!, ctx);
    const to = from && !isGroup(from) ? parseObject(m[2]!, ctx) : null;
    return from && to && !isGroup(to) ? [{ type: "moveAllCounters", from, to }] : null;
  }
  if ((m = new RegExp(`^Remove (all|${NUMX.slice(1, -1)}) ${COUNTER} counters? from (~|it|target .+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what && !isGroup(what) ? [{ type: "removeCounters", what, counter: counterKind(m[2]!), n: /^all$/i.test(m[1]!) ? "all" : amt(m[1]!) }] : null;
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
  if ((m = new RegExp(`^Distribute (?:${NUMX}|a number of) ${COUNTER} counters (?:equal to (.+?) )?among any number of (.+?) you control$`, "i").exec(s))) {
    if (!m[1] === !m[3]) return null;
    const filter = pickFilter(m[4]!);
    const n = m[3] ? parseCount(m[3], ctx) : amt(m[1]!);
    return filter && n ? [{ type: "distribute", counter: counterKind(m[2]!), n, filter: { ...filter, text: `${m[4]!} you control` } }] : null;
  }
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
  // combat this turn (CR 508.1d), ending with the turn like the rest.
  if ((m = /^(.+?) ((?:gets?|gains?) .+) until end of turn and attacks? this turn if able$/i.exec(s))) {
    const what = parseObject(m[1]!.replace(/^It$/, "it"), ctx);
    const first = what && parseChanges(m[2]!);
    return what && first ? [{ type: "continuous", what, mods: [...first, { kind: "attacksIfAble" }], duration: "endOfTurn" }] : null;
  }
  // "You gain shroud until end of turn" (Gilded Light), "You and permanents you control gain hexproof until end of turn"
  // (Lazotep Plating), "You and target permanent you control each gain protection from the chosen player until end of
  // turn" (Guardian Archon), "you gain protection from the chosen color" (Seht's Tiger): the player gains it too (CR
  // 702.11d, 702.16b-e, 702.16k, 702.18d).
  if ((m = /^You(?: and (.+?))?(?: each)? gains? (hexproof|shroud|protection from [a-z ]+?) until end of turn$/i.exec(s))) {
    const k = canonicalKeyword(m[2]!);
    if (!k || !/^(?:Hexproof|Shroud|Protection from )/.test(k)) return null;
    const out: Effect[] = [{ type: "playerGains", keywords: [k] }];
    if (m[1]) {
      const what = parseObject(m[1], ctx);
      if (!what) return null;
      out.push({ type: "continuous", what, mods: [{ kind: "addKeywords", keywords: [k] }], duration: "endOfTurn" });
    }
    return out;
  }
  if ((m = /^(.+?) ((?:gets?|gains?|loses?|has|have|becomes?|assigns?|can attack) .+) until (end of turn|your next turn)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && parseChanges(m[2]!);
    return what && mods ? [{ type: "continuous", what, mods, duration: m[3] === "end of turn" ? "endOfTurn" : "yourNextTurn" }] : null;
  }
  // "Target land you control becomes a 3/3 Elemental creature with haste that's still a land" (Brave the Wilds): with no
  // duration, for as long as it stays on the battlefield (CR 611.2a; a new object after a zone change, CR 400.7).
  // "Put four +1/+1 counters on target noncreature artifact. It becomes a 0/0 Bird creature" (Case of the Filched Falcon): the target.
  if ((m = /^(target .+?|It) becomes? (an? \d+\/\d+ .+)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what?.ref === "target" && parseChanges(`becomes ${m[2]!}`);
    return what && mods ? [{ type: "continuous", what, mods, duration: "game" }] : null;
  }
  // "~ becomes a Kithkin Spirit with base power and toughness 2/2" (Figure of Destiny), '~ gains "Whenever ~ deals combat
  // damage to a player, draw a card."' (Ascendant Spirit): no duration, so for as long as it stays on the battlefield
  // (CR 611.2a; a new object after a zone change, CR 400.7). New creature types replace its others (rulings).
  if ((m = /^~ ((?:becomes?|gains?) .+)$/.exec(s)) && !ctx.spell) {
    const what = parseObject("~", ctx);
    const mods = what?.ref === "self" ? parseChanges(m[1]!) : null;
    if (what && mods) return [{ type: "continuous", what, mods, duration: "game" }];
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
  if ((m = /^[Cc]hoose ((?:up to one )?target creature)$/.exec(s))) {
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

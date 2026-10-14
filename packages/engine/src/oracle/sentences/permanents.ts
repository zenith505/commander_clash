// Sentences that act on permanents: destroy, tap, connive, regenerate, counters, gaining control, continuous changes until end of turn.

import type { Effect, ObjRef } from "../../abilities";
import { NUMX, COUNTER, counterKind, amt, isGroup } from "../words";
import { pickFilter, parseObject } from "../targets";
import { parseChanges } from "../sentence";
import { parseExtraBlocks } from "../statics";
import type { Ctx } from "../body";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parsePermanentsSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  // Removal and tapping
  if ((m = /^(Destroy|Exile|Tap|Untap) ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+|all .+|each .+|~|it|that creature|that permanent|enchanted \w+|equipped \w+)$/i.exec(s))) {
    const what = parseObject(m[2]!, ctx);
    if (!what) return null;
    const type = ({ destroy: "destroy", exile: "exile", tap: "tap", untap: "untap" } as const)[m[1]!.toLowerCase() as "destroy"];
    return [{ type, what }];
  }
  // Connive (CR 701.50): "~ connives", "it connives", "target creature you control connives", "connives X".
  if ((m = new RegExp(`^(.+?) connives?(?: ${NUMX})?$`, "i").exec(s))) {
    const what = parseObject(m[1]!.replace(/^(he|she)$/i, "it"), ctx);
    return what && !isGroup(what) ? [{ type: "connive", what, n: m[2] ? amt(m[2]) : 1 }] : null;
  }
  // "If that creature would die this turn, exile it instead" (CR 614.1a), for what an earlier sentence targeted
  // or damaged: "If a creature dealt damage this way would die this turn, exile it instead".
  if ((m = /^If (that creature|that permanent|that creature or planeswalker|that planeswalker|an? (?:creature|permanent) dealt damage this way) would die this turn, exile it instead$/i.exec(s))) {
    const what: ObjRef | null = / this way$/.test(m[1]!) ? { ref: "damagedThisWay" } : parseObject(m[1]!.startsWith("that creature") ? "that creature" : "that permanent", ctx);
    return what ? [{ type: "exileIfDies", what }] : null;
  }
  // "That creature doesn't untap during its controller's next untap step", "Those creatures don't untap during their controllers' next untap steps"
  if ((m = /^(.+?) (?:doesn't|don't|do not|does not) untap during (?:its controller's|their controllers?'s?|your) next untap steps?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "skipUntap", what }] : null;
  }
  // Regeneration (CR 701.19a)
  if ((m = /^Regenerate (~|target .+|enchanted creature|equipped creature)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "regenerate", what }] : null;
  }
  if ((m = /^Return ((?:all|each) .+?) to (?:their|its) owners?'s? hands?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" ? [{ type: "bounce", what }] : null;
  }
  if ((m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+?|~|it|that card|that creature|enchanted creature|equipped creature) to (?:its owner's hand|their owners' hands)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "bounce", what }] : null;
  }
  // Counters
  // "Put a +1/+1 counter on a creature you control": picked as it resolves, not targeted.
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on (an? .+?) you control$`, "i").exec(s))) {
    const filter = pickFilter(m[3]!.replace(/^an? /i, ""));
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "counters", counter: { kind: counterKind(m[2]!), n: amt(m[1]!) } }];
  }
  if ((m = new RegExp(`^Remove (all|${NUMX.slice(1, -1)}) ${COUNTER} counters? from (~|it|target .+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what && !isGroup(what) ? [{ type: "removeCounters", what, counter: counterKind(m[2]!), n: /^all$/i.test(m[1]!) ? "all" : amt(m[1]!) }] : null;
  }
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on (.+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what ? [{ type: "counters", what, counter: counterKind(m[2]!), n: amt(m[1]!) }] : null;
  }
  // Gaining control (layer 2). "Gain control of target creature until end of turn."
  if ((m = /^Gain control of ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+?)( until end of turn)?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: m[2] ? "endOfTurn" : "game" }] : null;
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
  if ((m = /^(.+?) ((?:gets?|gains?|loses?|has|have|becomes?) .+) until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && parseChanges(m[2]!);
    return what && mods ? [{ type: "continuous", what, mods, duration: "endOfTurn" }] : null;
  }
  return undefined;
}

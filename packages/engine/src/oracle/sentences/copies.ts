// Sentences that make permanents become copies of something (CR 707.4), and "Choose target ..." that names what a
// later sentence copies.

import type { Effect, ObjRef } from "../../abilities";
import { isGroup } from "../words";
import { parseObject, parsePlayer } from "../targets";
import { parseCopyExcept } from "../tokens";
import type { Ctx } from "../body";

const DURATIONS: Record<string, Extract<Effect, { type: "becomeCopy" }>["duration"]> = {
  "end of turn": "endOfTurn",
  "your next turn": "yourNextTurn",
};

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseCopiesSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;
  // "Choose target creature you control. Each other creature becomes a copy of that creature": the first sentence
  // only chooses the target the second refers to.
  // "Choose any number of target creatures. Each of those creatures gains persist until end of turn." too.
  if ((m = /^[Cc]hoose ((?:any number of |up to one |two )?target .+)$/.exec(s))) {
    // "Choose two target creatures controlled by different players. Return those creatures ..." (Run Away Together).
    // "Choose two target players. Each of them ..." (Scheming Symmetry).
    if (m[1] === "two target players") return parsePlayer(m[1], ctx) ? [] : null;
    if (/^two /.test(m[1]!)) {
      const both = /^two target .+ controlled by different players$/.test(m[1]!) ? parseObject(m[1]!, ctx) : null;
      return both?.ref === "target" && both.n === 2 ? [] : null;
    }
    // "Choose any number of target opponents" (Call the Coppercoats): players, likewise.
    if (/^any number of target (?:players|opponents)$/.test(m[1]!)) return parsePlayer(m[1]!, ctx) ? [] : null;
    // "Choose target player. Return half the creatures they control ..." (Split the Party): the player later sentences name.
    if (/^target (?:player|opponent)$/.test(m[1]!)) return parsePlayer(m[1]!, ctx)?.ref === "target" ? [] : null;
    // "Choose target creature you control and target Equipment" (Stolen Uniform): two targets, in that order.
    const two = /^(target .+?) and (target .+)$/.exec(m[1]!);
    if (two) {
      const first = parseObject(two[1]!, ctx);
      const second = first && !isGroup(first) && parseObject(two[2]!, ctx);
      return second && !isGroup(second) ? [] : null;
    }
    // "Choose target card in a graveyard other than a basic land card. Search its owner's ..." (Surgical Extraction).
    const what = parseObject(m[1]!, ctx, /^target (?:.+ )?card\b/.test(m[1]!));
    return what && !isGroup(what) ? [] : null;
  }
  // "~ becomes a copy of target creature until end of turn, except it has this ability", "Until your next turn,
  // target Shapeshifter becomes a copy of ...", "(you may) have ~ become a copy of ...", "Shapeshifters you control
  // become copies of that creature". ("Until end of turn, X ..." already reads "X ... until end of turn".)
  m = /^(?:Until (end of turn|your next turn), )?(?:[Hh]ave )?(.+?) (?:becomes?|each become) (?:a copy|copies) of (.+?)(?: until (end of turn|your next turn))?(?:, except (.+?))?(?: until (end of turn))?$/.exec(s);
  if (!m) return undefined;
  const [, before, whatText, ofText, after, exceptText, last] = m;
  const durations = [before, after, last].filter(Boolean);
  if (durations.length > 1) return null;
  const duration = durations.length ? DURATIONS[durations[0]!]! : "game";
  const except = exceptText ? parseCopyExcept(exceptText) : undefined;
  if (except === null) return null;
  // In reading order, so "another target" knows what it's other than ("Target artifact becomes a copy of another
  // target artifact", "it becomes a copy of up to one other target creature"), except that "each other creature" is
  // other than what it copies, read first ("Each other creature becomes a copy of target nonlegendary creature").
  const whatFirst = !/^(?:each|all)\b/i.test(whatText!);
  let what: ObjRef | null = null;
  let of: ObjRef | null = null;
  if (whatFirst) {
    what = parseWhat(whatText!, ctx);
    of = what && parseOf(ofText!, ctx);
  } else {
    of = parseOf(ofText!, ctx);
    what = of && parseWhat(whatText!, ctx);
  }
  if (!what || !of) return null;
  // "Choose a token you control. Each other token you control becomes a copy of that token" (Brudiclad): other than the
  // one chosen, not the source.
  if (what.ref === "each" && what.other && of.ref === "created") {
    const { other: _, ...rest } = what;
    what = { ...rest, notCreated: true };
  }
  return [{ type: "becomeCopy", what, of, ...(except ? { except } : {}), duration }];
}

/** What becomes a copy: "~", "it", "target creature", "each other creature", "Shapeshifters you control". */
function parseWhat(text: string, ctx: Ctx): ObjRef | null {
  const t = text.replace(/^(he|she)$/i, "it");
  // "Each creature you control other than the chosen creature": other than the target an earlier sentence chose.
  const otherThanChosen = /^(.+) other than the chosen (?:creature|artifact|permanent)$/i.exec(t);
  if (otherThanChosen) {
    const group = parseObject(otherThanChosen[1]!, ctx);
    return group?.ref === "each" && !group.other && ctx.lastObjectTarget !== undefined ? { ...group, otherThan: ctx.lastObjectTarget } : null;
  }
  return parseObject(t, ctx);
}

/** What it copies: one object, "target creature", "another target creature", "that creature", "the sacrificed creature". */
function parseOf(text: string, ctx: Ctx): ObjRef | null {
  if (/^the sacrificed (creature|artifact|permanent)$/.test(text)) return { ref: "sacrificed" };
  // "Choose target artifact you control. Each other artifact you control becomes a copy of that artifact."
  if (/^that (artifact|enchantment|land|token)$/.test(text) && ctx.lastObjectTarget !== undefined) return { ref: "target", index: ctx.lastObjectTarget };
  const of = parseObject(text, ctx, /\bcards?\b/.test(text) && /\btarget\b/.test(text));
  return of && !isGroup(of) && !("n" in of && (of.n ?? 1) > 1) ? of : null;
}

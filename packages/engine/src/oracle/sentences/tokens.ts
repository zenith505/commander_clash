// Sentences that create tokens (including token copies and predefined tokens), delayed draws, proliferate, amass, populate, blink, investigate, explore.

import type { Effect } from "../../abilities";
import { allEffects } from "../../abilities";
import { NUMX, amt, singularWord, isGroup } from "../words";
import { parsePlayer, parseObject } from "../targets";
import { INCUBATOR, PREDEFINED_TOKENS, parseToken, parseCopyExcept } from "../tokens";
import { parseSentence } from "../sentence";
import type { Ctx } from "../body";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseTokensSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  // Tokens, maybe "tapped and attacking" (CR 508.4): "Create a tapped and attacking 1/1 red Warrior creature
  // token", "Create two 1/1 white Soldier creature tokens with haste that are tapped and attacking".
  if ((m = new RegExp(`^Create ${NUMX} (tapped (?:and attacking )?)?(\\d+)/(\\d+) (.+?) creature tokens?(?: with (.+?))?(?: that(?:'s| are) (tapped(?: and attacking)?))?$`, "i").exec(s))) {
    const token = parseToken(Number(m[3]), Number(m[4]), m[5]!, m[6]);
    const how = `${m[2] ?? ""} ${m[7] ?? ""}`;
    const state = { ...(/tapped/.test(how) ? { tapped: true } : {}), ...(/attacking/.test(how) ? { attacking: true } : {}) };
    return token ? [{ type: "createToken", who: { ref: "you" }, n: amt(m[1]!), token, ...state }] : null;
  }
  // Token copies (CR 707.2, 111.4): "Create a token that's a copy of target creature you control, except it
  // isn't legendary", "create two tokens that are copies of ~", "its controller creates a token that's a copy of it".
  if ((m = new RegExp(`^(?:(.+?) creates|Create) ${NUMX} (tapped (?:and attacking )?)?tokens? that(?:'s| are) (?:a copy|copies) of (.+?)(?:, except (.+))?$`, "i").exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const what = parseObject(m[4]!, ctx, /\bcard\b/.test(m[4]!) && /^target /.test(m[4]!));
    const except = m[5] ? parseCopyExcept(m[5]) : undefined;
    if (!who || !what || except === null || isGroup(what)) return null;
    const state = { ...(m[3] ? { tapped: true } : {}), ...(m[3] && /attacking/.test(m[3]) ? { attacking: true } : {}) };
    return [{ type: "createTokenCopy", who, n: amt(m[2]!), what, ...(except ? { except } : {}), ...state }];
  }
  // "Sacrifice them at the beginning of the next end step" / "Exile it ...": about the tokens just created.
  if (ctx.lastCreatedAny && (m = /^(Sacrifice|Exile) (?:it|them|the tokens?|that token|those tokens) at (the beginning of the next end step|end of combat|the beginning of the next cleanup step)$/i.exec(s))) {
    const verb = m[1]!.toLowerCase();
    const when = m[2] === "end of combat" ? "endOfCombat" : /cleanup/.test(m[2]!) ? "nextCleanup" : "nextEndStep";
    return [{ type: "delayed", when, each: "created", effects: [verb === "exile" ? { type: "exile", what: { ref: "subject" } } : { type: "sacrifice", what: { ref: "subject" } }], text: `${verb} ~` }];
  }
  // Incubate N (CR 701.53a): an Incubator token that enters with N +1/+1 counters on it. "Its controller incubates X".
  if ((m = new RegExp(`^(?:(.+?) )?[Ii]ncubates? ${NUMX}$`).exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    if (!who) return null;
    return [{ type: "createToken", who, n: 1, token: INCUBATOR, counters: { counter: "+1/+1", n: amt(m[2]!) } }];
  }
  // Predefined tokens (CR 111.10): "Create a Treasure token", "Its controller creates two Treasure tokens"
  if ((m = new RegExp(`^(?:(.+?) creates?|Create) ${NUMX} (Treasure|Food|Clue) tokens?$`, "i").exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const token = PREDEFINED_TOKENS[m[3]!.charAt(0).toUpperCase() + m[3]!.slice(1).toLowerCase()];
    return who && token ? [{ type: "createToken", who, n: amt(m[2]!), token }] : null;
  }
  // "Draw a card at the beginning of the next turn's upkeep" (a delayed trigger, CR 603.7).
  if ((m = /^(.+) at the beginning of the next turn's upkeep$/.exec(s))) {
    // Only what needs no targets or objects: the delayed ability has none of its own.
    const before = ctx.targets.length;
    const inner = parseSentence(m[1]!.replace(/^./, (c) => c.toUpperCase()), ctx);
    if (!inner || ctx.targets.length !== before || allEffects(inner).some((y) => "what" in y || ("who" in y && (y.who as { ref: string }).ref !== "you"))) return null;
    return [{ type: "delayed", when: "nextTurnUpkeep", effects: inner, text: m[1]! }];
  }
  // Proliferate (CR 701.27), amass (CR 701.47).
  if (/^Proliferate$/i.test(s)) return [{ type: "proliferate" }];
  // Populate (CR 701.36): copy a creature token you control, not targeted; with none, nothing happens.
  if (/^Populate$/i.test(s)) return [{ type: "pick", who: { ref: "you" }, filter: { kind: "object", types: ["Creature"], token: true, text: "creature token" }, n: 1, action: "populate" }];
  if ((m = new RegExp(`^[Aa]mass ([A-Z][a-z]+) ${NUMX}$`).exec(s))) return [{ type: "amass", subtype: singularWord(m[1]!), n: amt(m[2]!) }];
  // Blink: "Exile target creature you control, then return it to the battlefield under its owner's control".
  if ((m = /^Exile (.+?),? then return (?:it|that card|them|those cards) to the battlefield under (its owner's|their owners'|your) control$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "flicker", what, under: m[2] === "your" ? "you" : "owner" }] : null;
  }
  // Investigate (CR 701.16): create a Clue token.
  if ((m = /^Investigate( twice)?$/i.exec(s))) return [{ type: "createToken", who: { ref: "you" }, n: m[1] ? 2 : 1, token: PREDEFINED_TOKENS.Clue! }];
  // Explore (CR 701.44)
  if (/^~ explores$/.test(s)) return [{ type: "explore" }];
  return undefined;
}

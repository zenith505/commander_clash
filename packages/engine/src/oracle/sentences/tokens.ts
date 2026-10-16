// Sentences that create tokens (including token copies and predefined tokens), delayed draws, proliferate, amass, populate, blink, investigate, explore.

import type { Effect } from "../../abilities";
import { allEffects } from "../../abilities";
import { NUMX, X, amt, singularWord, isGroup } from "../words";
import { parsePlayer, parseObject } from "../targets";
import { INCUBATOR, PREDEFINED_TOKENS, ROLE_TOKENS, parseToken, parseCopyExcept } from "../tokens";
import { parseSentence } from "../sentence";
import { parseCount } from "../counts";
import type { Ctx } from "../body";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseTokensSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  // Tokens, maybe "tapped and attacking" (CR 508.4): "Create a tapped and attacking 1/1 red Warrior creature
  // token", "Create two 1/1 white Soldier creature tokens with haste that are tapped and attacking".
  // Another player can create them: "Target opponent creates three 2/2 white Knight creature tokens", "each opponent
  // creates ..." (Hunted Dragon, Forbidden Orchard): that player creates and controls them (CR 111.2). "You create" after
  // another player's instruction (No Way Out) is the plain "create".
  if ((m = new RegExp(`^(?:(.+?) creates|(?:You )?[Cc]reate) ${NUMX} (tapped (?:and attacking )?)?(\\d+)/(\\d+) (.+?) creature tokens?(?: with (.+?))?(?: that(?:'s| are) (tapped(?: and attacking)?))?$`, "i").exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const token = parseToken(Number(m[4]), Number(m[5]), m[6]!, m[7]);
    const how = `${m[3] ?? ""} ${m[8] ?? ""}`;
    const state = { ...(/tapped/.test(how) ? { tapped: true } : {}), ...(/attacking/.test(how) ? { attacking: true } : {}) };
    return token && who ? [{ type: "createToken", who, n: amt(m[2]!), token, ...state }] : null;
  }
  // A named legendary token (CR 111.4, 205.4d): "Create Ragavan, a legendary 2/1 red Monkey creature token", "create The
  // Atropal, a legendary 4/4 black God Horror creature token with deathtouch". In its quoted abilities the token's name
  // means the token itself ("When Smaug dies, ...").
  if ((m = /^(?:(.+?) creates|(?:You )?[Cc]reate) ((?:The )?[A-Z][\w'-]*(?: (?:the |of the |of )?[A-Z][\w'-]*)*), a legendary (\d+)\/(\d+) (.+?) creature token(?: with (.+))?$/.exec(s))) {
    const name = m[2]!;
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const withText = m[6]?.replace(/"[^"]*"/g, (q) => q.replace(new RegExp(`(^"|\\. )?\\b${esc}\\b`, "g"), (_, start?: string) => (start ? `${start}This creature` : "this creature")));
    const token = parseToken(Number(m[3]), Number(m[4]), m[5]!, withText);
    return token && who ? [{ type: "createToken", who, n: 1, token: { ...token, name, named: true, legendary: true } }] : null;
  }
  // Token copies (CR 707.2, 111.4): "Create a token that's a copy of target creature you control, except it
  // isn't legendary", "create two tokens that are copies of ~", "its controller creates a token that's a copy of it".
  if ((m = new RegExp(`^(?:(.+?) creates|(?:You )?[Cc]reate) ${NUMX} (tapped (?:and attacking )?)?tokens? that(?:'s| are) (?:a copy|copies) of (.+?)(?:, except (.+))?$`, "i").exec(s))) {
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
  // Role tokens (CR 111.10j-r, 303.7): "Create a Monster Role token attached to target creature you control", "... attached
  // to it". "For each creature your opponents control, create a Cursed Role token attached to that creature": one each.
  const ROLES = Object.keys(ROLE_TOKENS).join("|");
  if ((m = new RegExp(`^(?:[Ff]or each (.+?), create|[Cc]reate) an? (${ROLES}) Role token attached to (.+)$`).exec(s))) {
    const token = ROLE_TOKENS[m[2]!]!;
    if (m[1]) {
      // The group the sentence goes through; "that creature", "it", "that Rat" are each one of it.
      if (!/^(?:that (?:creature|[A-Z][a-z]+)|it)$/.test(m[3]!)) return null;
      const those = /^of (?:those|these) /.test(m[1]);
      const what = parseObject(those ? m[1].slice(3) : `each ${m[1]}`, ctx);
      return what && (isGroup(what) || those) ? [{ type: "createToken", who: { ref: "you" }, n: 1, token, attachTo: what }] : null;
    }
    const what = parseObject(m[3]!, ctx);
    return what && !isGroup(what) ? [{ type: "createToken", who: { ref: "you" }, n: 1, token, attachTo: what }] : null;
  }
  // Predefined tokens (CR 111.10): "Create a Treasure token", "Its controller creates two Treasure tokens"
  if ((m = new RegExp(`^(?:(.+?) creates?|Create) ${NUMX} (tapped )?(${Object.keys(PREDEFINED_TOKENS).join("|")}) tokens?$`, "i").exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const token = PREDEFINED_TOKENS[m[4]!.charAt(0).toUpperCase() + m[4]!.slice(1).toLowerCase()];
    return who && token ? [{ type: "createToken", who, n: amt(m[2]!), token, ...(m[3] ? { tapped: true } : {}) }] : null;
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
  if ((m = /^Investigate( twice| X times)?$/i.exec(s))) return [{ type: "createToken", who: { ref: "you" }, n: m[1] === " X times" ? X : m[1] ? 2 : 1, token: PREDEFINED_TOKENS.Clue! }];
  // "That player investigates for each nontoken creature exiled this way" (Declaration in Stone).
  if ((m = /^(.+?) investigates for each (.+)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const n = parseCount(m[2]!, ctx, true);
    return who && n ? [{ type: "createToken", who, n, token: PREDEFINED_TOKENS.Clue! }] : null;
  }
  // Explore (CR 701.44)
  if (/^~ explores$/.test(s)) return [{ type: "explore" }];
  // "Target creature you control explores" (a Map token, CR 111.10s): its controller is you.
  if ((m = /^(target creature you control|it) explores$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) && what.ref !== "self" ? [{ type: "explore", what }] : what?.ref === "self" ? [{ type: "explore" }] : null;
  }
  return undefined;
}

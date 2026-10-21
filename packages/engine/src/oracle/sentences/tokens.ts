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

  // "Create twice X 1/1 black and green Pest creature tokens" (Pest Infestation): 2X of them (X counting 0 off the stack,
  // CR 107.3).
  if ((m = /^Create twice X (.+ tokens?(?: with .+)?)$/.exec(s))) {
    const fx = parseSentence(`Create X ${m[1]}`, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    if (tok?.type !== "createToken" || typeof tok.n !== "object" || !("count" in tok.n) || tok.n.count.kind !== "x" || tok.n.times !== undefined) return null;
    return [{ ...tok, n: { count: { kind: "x" }, times: 2 } }];
  }
  // "Create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm
  // artifact creature token with lifelink" (Wurmcoil Engine): each of them, entering at the same time (CR 608.2f).
  if ((m = /^[Cc]reate (.+)$/.exec(s))) {
    const parts = m[1]!.split(/ and (?=(?:an?|one|two|three|four|five) \d+\/\d+ )/);
    if (parts.length === 2 && parts.every((x) => / tokens?(?: with .+)?$/.test(x))) {
      const fx = parts.map((x) => parseSentence(`Create ${x}`, ctx));
      if (fx.some((x) => x?.length !== 1 || x[0]!.type !== "createToken" || x[0]!.attacking || x[0]!.attackingEach || x[0]!.attachTo)) return null;
      return [{ type: "together", effects: fx.map((x) => x![0]!) }];
    }
  }
  // "Create a Food token or a Treasure token" (Tireless Provisioner): one of the two predefined tokens, chosen as it
  // resolves (Effect "either").
  if ((m = /^[Cc]reate (an? [A-Z][a-z]+ token) or (an? [A-Z][a-z]+ token)$/.exec(s))) {
    const a = parseSentence(`Create ${m[1]}`, ctx);
    const b = parseSentence(`Create ${m[2]}`, ctx);
    if (!a || !b || a.length !== 1 || b.length !== 1 || a[0]!.type !== "createToken" || b[0]!.type !== "createToken") return null;
    return [{ type: "either", options: [a, b], labels: [`Create ${m[1]}`, `Create ${m[2]}`] }];
  }

  // Tokens, maybe "tapped and attacking" (CR 508.4): "Create a tapped and attacking 1/1 red Warrior creature
  // token", "Create two 1/1 white Soldier creature tokens with haste that are tapped and attacking".
  // Another player can create them: "Target opponent creates three 2/2 white Knight creature tokens", "each opponent
  // creates ..." (Hunted Dragon, Forbidden Orchard): that player creates and controls them (CR 111.2). "You create" after
  // another player's instruction (No Way Out) is the plain "create".
  // "... creature token with flying and haste named Hornet" (Hornet Cannon), "... tokens named Cadet": that name rather than
  // its subtypes (CR 111.4).
  // "An X/X green Ooze creature token": X is the spell's or ability's own, or defined by "where X is ..." (body.ts defineX).
  // "For each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that player" (Endless Foot
  // Assault, Veteran Soldier): one group for each opponent, each attacking that opponent (CR 508.4), all at once.
  // "... attacking that player or a planeswalker they control" (Adeline): which one is chosen as they enter (rulings).
  if ((m = /^[Ff]or each opponent, (?:you )?(create .+? that(?:'s| are) tapped and attacking) that (?:player|opponent)( or a planeswalker they control)?$/.exec(s))) {
    const fx = parseSentence(`C${m[1]!.slice(1)}`, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    if (tok?.type !== "createToken" || !tok.attacking || tok.who.ref !== "you") return null;
    return [{ ...tok, attacking: undefined, tapped: true, attackingEach: true, ...(m[2] ? { orPlaneswalker: true as const } : {}) }];
  }
  if ((m = new RegExp(`^(?:(.+?) creates|(?:You )?[Cc]reate) ${NUMX} (tapped (?:and attacking )?)?(\\d+|X)/(\\d+|X) (.+?) creature tokens?(?: with (.+?))?(?: named ([A-Z][\\w'-]*(?: (?:of |the )?[A-Z][\\w'-]*)*))?(?: that(?:'s| are) (tapped(?: and attacking)?))?$`, "i").exec(s))) {
    const xx = m[4] === "X" || m[5] === "X";
    if (xx && (m[4] !== "X" || m[5] !== "X")) return null;
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const token = parseToken(xx ? 0 : Number(m[4]), xx ? 0 : Number(m[5]), m[6]!, m[7]);
    const how = `${m[3] ?? ""} ${m[9] ?? ""}`;
    const state = { ...(/tapped/.test(how) ? { tapped: true } : {}), ...(/attacking/.test(how) ? { attacking: true } : {}), ...(xx ? { pt: X } : {}) };
    const named = m[8] ? { name: m[8], named: true as const } : {};
    return token && who ? [{ type: "createToken", who, n: amt(m[2]!), token: { ...token, ...named }, ...state }] : null;
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
  // "For each token you control, create a token that's a copy of that permanent" (Second Harvest), "For each creature
  // target player controls, create a token that's a copy of that creature" (Clone Legion): one copy of each of them.
  if ((m = /^[Ff]or each (.+?), create a token that's a copy of (?:that (?:creature|permanent|artifact|token)|it)(?:, except (.+))?$/.exec(s))) {
    const what = parseObject(`each ${m[1]!}`, ctx);
    const except = m[2] ? parseCopyExcept(m[2]) : undefined;
    if (!what || what.ref !== "each" || except === null) return null;
    return [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what, each: true, ...(except ? { except } : {}) }];
  }
  // Token copies (CR 707.2, 111.4): "Create a token that's a copy of target creature you control, except it
  // isn't legendary", "create two tokens that are copies of ~", "its controller creates a token that's a copy of it".
  if ((m = new RegExp(`^(?:(.+?) creates|(?:You )?[Cc]reate) ${NUMX} (tapped (?:and attacking )?)?tokens? that(?:'s| are) (?:a copy|copies) of (.+?)(?:, except (.+))?$`, "i").exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    // "A copy of it" after "exile target creature card from a graveyard": that card, now in exile (The Scarab God).
    const cardTargets = ctx.targets.flatMap((t, i) => (t.kind === "card" && !t.many ? [i] : []));
    const ofCard = /^(?:it|that card)$/.test(m[4]!) && ctx.lastObjectTarget === undefined && !ctx.lastCreated && cardTargets.length === 1 && cardTargets[0] === ctx.targets.length - 1;
    const what = ofCard ? { ref: "target" as const, index: cardTargets[0]!, card: true as const } : parseObject(m[4]!, ctx, /\bcard\b/.test(m[4]!) && /^target /.test(m[4]!));
    const except = m[5] ? parseCopyExcept(m[5], ctx.halfRound) : undefined;
    if (!who || !what || except === null || isGroup(what)) return null;
    const state = { ...(m[3] ? { tapped: true } : {}), ...(m[3] && /attacking/.test(m[3]) ? { attacking: true } : {}) };
    // "A copy of each of any number of target creatures" (Twinflame): one of each of them.
    const each = what.ref === "target" && what.n !== undefined && !what.card;
    if (each && amt(m[2]!) !== 1) return null;
    return [{ type: "createTokenCopy", who, n: amt(m[2]!), what, ...(each ? { each: true as const } : {}), ...(except ? { except } : {}), ...state }];
  }
  // "Whenever ~ attacks a player, for each other opponent, create a token that's a copy of ~ tapped and attacking that
  // player, except it isn't legendary" (Shredder): myriad's tokens (CR 702.116a), each opponent but the defending player,
  // with no "may".
  if (ctx.defending && (m = /^[Ff]or each other opponent, create a token that's a copy of ~ (?:that's )?tapped and attacking that player(?:, except (.+))?$/.exec(s))) {
    const except = m[1] ? parseCopyExcept(m[1]) : undefined;
    return except === null ? null : [{ type: "myriad", must: true, ...(except ? { except } : {}) }];
  }
  // "Sacrifice them at the beginning of the next end step" / "Exile it ...": about the tokens just created.
  if (ctx.lastCreatedAny && (m = /^(Sacrifice|Exile) (?:it|them|the tokens?|that token|those tokens) at (the beginning of (?:the|your) next end step|end of combat|the beginning of the next cleanup step)$/i.exec(s))) {
    const verb = m[1]!.toLowerCase();
    const when = m[2] === "end of combat" ? "endOfCombat" : /cleanup/.test(m[2]!) ? "nextCleanup" : /your next/.test(m[2]!) ? "yourNextEndStep" : "nextEndStep";
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
  // "Transform ~ at the beginning of the next upkeep" (Archangel Avacyn): it transforms then only if it hasn't transformed
  // since the delayed trigger was made (CR 701.27f).
  // "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana
  // value." (Mana Drain): the amount is that spell's mana value as this resolves (CR 608.2h), remembered by the delayed
  // trigger; it triggers at the next main phase of yours to begin (rulings).
  if ((m = /^At the beginning of your next main phase, (add .+)$/.exec(s))) {
    const before = ctx.targets.length;
    const inner = parseSentence(m[1]!.replace(/^./, (c) => c.toUpperCase()), ctx);
    const add = inner?.length === 1 ? inner[0] : undefined;
    if (add?.type !== "addMana" || ctx.targets.length !== before) return null;
    if (add.times === undefined || typeof add.times === "number") return [{ type: "delayed", when: "yourNextMain", effects: inner!, text: m[1]! }];
    return [{ type: "delayed", when: "yourNextMain", effects: [{ ...add, times: { count: { kind: "eventAmount" } } }], text: m[1]!, event: { amount: add.times } }];
  }
  // "Its controller may draw up to two cards at the beginning of the next turn's upkeep" (Arcane Denial): the countered
  // spell's controller as this resolves (CR 608.2h), remembered by the delayed trigger as its event player.
  if ((m = /^(Its controller|That spell's controller) (.+) at the beginning of the next (?:turn's )?upkeep$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const before = ctx.targets.length;
    const inner = who && parseSentence(`That player ${m[2]!}`, { ...ctx, eventPlayer: true, lastPlayerTarget: undefined, chosenOpponent: undefined, controllerNamed: undefined });
    if (!who || !inner || ctx.targets.length !== before || allEffects(inner).some((y) => "what" in y || ("who" in y && (y.who as { ref: string }).ref !== "eventPlayer"))) return null;
    return [{ type: "delayed", when: "nextTurnUpkeep", effects: inner, text: `${m[1]!} ${m[2]!}`, event: { player: who } }];
  }
  if ((m = /^(.+) at the beginning of the next (?:turn's )?upkeep$/.exec(s))) {
    // Only what needs no targets or objects: the delayed ability has none of its own.
    const before = ctx.targets.length;
    const inner = parseSentence(m[1]!.replace(/^./, (c) => c.toUpperCase()), ctx);
    const selfTransform = (y: Effect) => y.type === "transform" && y.what.ref === "self" && !ctx.spell;
    if (!inner || ctx.targets.length !== before || allEffects(inner).some((y) => ("what" in y && !selfTransform(y)) || ("who" in y && (y.who as { ref: string }).ref !== "you"))) return null;
    return [{ type: "delayed", when: "nextTurnUpkeep", effects: inner, text: m[1]! }];
  }
  // Proliferate (CR 701.27), amass (CR 701.47).
  if (/^Proliferate$/i.test(s)) return [{ type: "proliferate" }];
  // Populate (CR 701.36): copy a creature token you control, not targeted; with none, nothing happens.
  if (/^Populate$/i.test(s)) return [{ type: "pick", who: { ref: "you" }, filter: { kind: "object", types: ["Creature"], token: true, text: "creature token" }, n: 1, action: "populate" }];
  if ((m = new RegExp(`^[Aa]mass ([A-Z][a-z]+) ${NUMX}$`).exec(s))) return [{ type: "amass", subtype: singularWord(m[1]!), n: amt(m[2]!) }];
  // Blink: "Exile target creature you control, then return it to the battlefield under its owner's control".
  // "Exile ~, then return it to the battlefield transformed under your control" (a Saga's last chapter): with its back
  // face up if it's a double-faced card (CR 712.14a).
  if ((m = /^Exile (.+?),? then return (?:it|that card|them|those cards) to the battlefield( transformed)? under (its owner's|their owners'|your) control$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    if (m[2] && what?.ref !== "self") return null;
    return what && !isGroup(what) ? [{ type: "flicker", what, under: m[3] === "your" ? "you" : "owner", ...(m[2] ? { transformed: true as const } : {}) }] : null;
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

// Sentences that move cards between zones (graveyard, library, exile until it leaves), attach, "can't block this turn", and picking your own permanents.

import type { Effect, Modification, PlayerRef } from "../../abilities";
import { NUM, amt, num } from "../words";
import { pickFilter, parsePlayer, parseObject, PERMANENT_TYPES, parseCardTarget } from "../targets";
import type { Ctx } from "../body";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseZonesSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  // An instant or sorcery that exiles itself as it resolves, so it isn't put into the graveyard (CR 608.2n);
  // with suspend, it's suspended again (Arc Blade). If it doesn't resolve, it isn't exiled.
  if ((m = new RegExp(`^Exile ~ with ${NUM} time counters? on it$`, "i").exec(s))) return ctx.spell ? [{ type: "exileSelfWithTime", n: num(m[1]!) }] : null;

  // Graveyards. Cards in a graveyard (CR 109.2a): returning them, reanimating them, exiling them.
  // A graveyard ability's "{2}{B}: Return this card from your graveyard to your hand" (CR 113.6j): the card itself,
  // while it's still the object whose ability was activated (CR 400.7).
  if (ctx.selfCard && ctx.activated && (m = /^Return ~ from your graveyard to (your hand|the battlefield)( tapped)?$/.exec(s)))
    return m[1] === "your hand" ? (m[2] ? null : [{ type: "bounce", what: { ref: "selfCard" } }]) : [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, ...(m[2] ? { tapped: true } : {}) }];
  if ((m = /^Exile (target player's|target opponent's|each opponent's|all) graveyards?$/i.exec(s))) {
    const w = m[1]!.toLowerCase();
    const who: PlayerRef | null =
      w === "all" ? { ref: "eachPlayer" } : w === "each opponent's" ? { ref: "eachOpponent" } : parsePlayer(w.replace(/'s$/, ""), ctx);
    return who ? [{ type: "exileGraveyard", who }] : null;
  }
  if ((m = /^Exile ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+ graveyard)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx, true);
    return what ? [{ type: "exile", what }] : null;
  }
  if ((m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+ graveyard) to (your|its owner's) hand$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, m[2]!.toLowerCase() === "your" ? "you" : undefined);
    return what ? [{ type: "bounce", what }] : null;
  }
  if ((m = /^(Return|Put) ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+ graveyard) (?:to|onto) the battlefield( tapped)?( under your control)?$/i.exec(s))) {
    // Without "under your control", only your own cards: the card then enters under your control (CR 110.2a)
    // either way, but "return" text that reaches other graveyards always says whose control.
    const underYou = !!m[4];
    if (m[1]!.toLowerCase() === "put" && !underYou) return null;
    const i = ctx.targets.length;
    const what = parseCardTarget(m[2]!, ctx, underYou ? undefined : "you");
    const spec = ctx.targets[i];
    // An Aura entering this way needs a choice of what it enchants (CR 303.4f), which isn't modeled,
    // and only permanent cards can be put onto the battlefield (CR 110.4b).
    if (!what || !spec || !spec.types?.length || spec.types.some((ty) => ty === "Enchantment" || !PERMANENT_TYPES.includes(ty))) return null;
    return [{ type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}) }];
  }
  if ((m = /^Put ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+ graveyard) on (top|the bottom) of (your|its owner's) library$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, m[3]!.toLowerCase() === "your" ? "you" : undefined);
    return what ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() === "top" ? "top" : "bottom" }] : null;
  }
  // "Put target creature on top of its owner's library", "on the bottom of its owner's library" (Excommunicate).
  if ((m = /^Put (target .+?|~) on (top|the bottom) of its owner's library$/i.exec(s)) && !/graveyard$/i.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what && (what.ref === "target" || what.ref === "self") ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() === "top" ? "top" : "bottom" }] : null;
  }
  // "When ~ leaves the battlefield, return the exiled card to the battlefield under its owner's control" (Fiend
  // Hunter): the cards its own exile ability took (CR 607.2a); compile() links the two.
  if ((m = /^Return the exiled (?:card|cards|permanent|permanents|creature|creatures) to (the battlefield under (?:its|their) owners?'s? control|(?:its|their) owners?'s? hands?)$/i.exec(s)) && ctx.selfCard)
    return [{ type: "returnLinked", dest: /^the battlefield/i.test(m[1]!) ? "battlefield" : "hand" }];
  // "Exile target creature an opponent controls until ~ leaves the battlefield" (CR 610.3).
  if ((m = /^Exile (target .+|up to one target .+|another target .+) until ~ leaves the battlefield$/i.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "exile", what, until: "sourceLeaves" }] : null;
  }
  // "When ~ enters, attach it to target creature you control." (CR 701.3)
  if ((m = /^Attach (?:~|it) to (target .+)$/i.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "attach", what }] : null;
  }
  // "Target creature can't block this turn", "~ can't attack or block this turn", "~ can't be blocked this
  // turn": until the turn ends.
  // "Target creature can't attack until your next turn" ends as your next turn begins (CR 611.2b).
  if ((m = /^(.+?) can't (block|attack|attack or block|be blocked) (this turn|until your next turn)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods: Modification[] =
      m[2] === "block" ? [{ kind: "cantBlock" }] : m[2] === "attack" ? [{ kind: "cantAttack" }] : m[2] === "be blocked" ? [{ kind: "cantBeBlocked" }] : [{ kind: "cantAttack" }, { kind: "cantBlock" }];
    return what ? [{ type: "continuous", what, mods, duration: m[3] === "this turn" ? "endOfTurn" : "yourNextTurn" }] : null;
  }
  // Picking your own permanents, not targeted: "sacrifice a creature", "each opponent sacrifices a creature
  // of their choice", "return a land you control to its owner's hand" (CR 701.21).
  if ((m = new RegExp(`^Return ${NUM} (.+?) you control to (?:its|their) owners?'s? hands?$`, "i").exec(s))) {
    const filter = pickFilter(m[2]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: amt(m[1]!), action: "bounce" }];
  }
  if ((m = new RegExp(`^(?:(.+?) )?[Ss]acrifices? ${NUM} (.+?)(?: of (?:their|his or her) choice)?$`).exec(s)) && !/^(~|it|them|that creature)$/i.test(m[3]!)) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const filter = pickFilter(m[3]!);
    return who && filter && [{ type: "pick", who, filter, n: amt(m[2]!), action: "sacrifice" }];
  }
  return undefined;
}

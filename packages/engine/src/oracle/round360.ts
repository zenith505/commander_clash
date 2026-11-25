// Round 360's sentences, read before round 359's (round359Sentence in oracle/round359.ts reads these first), and its whole
// lines (compile.ts, after round 359's): up to two target creatures changed until your next turn, and a cost reduction for
// the spells a target player casts until your next turn (Will Kenrith); an attack trigger whose intervening if asks about
// the players you're attacking (Undercellar Sweep); a creature card returned from a graveyard, exiled when ~ becomes
// untapped or you lose control of it (Coffin Queen); and an instant or sorcery card cast from a target opponent's library
// (Knowledge Exploitation).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";
import { parseTrigger } from "./triggers";
import { round361Sentence } from "./round361";
import { colorTemplate, withColors } from "./color-template";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round360Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 361's sentences first (oracle/round361.ts).
  const r361 = round361Sentence(s, sentences, si, ctx, effects);
  if (r361) return r361;
  const line = plain(s);
  const next = plain(sentences[si + 1]);
  const prev = effects[effects.length - 1];
  // Will Kenrith: "+2: Until your next turn, up to two target creatures each have base power and toughness 0/3 and lose all
  // abilities.": read as "... until your next turn", lasting until its controller's next turn begins (CR 611.2b); it
  // sets base power and toughness in layer 7b and removes abilities in layer 6 (CR 613.1f, 613.4b), so abilities gained
  // later are kept and later setting effects win (rulings, CR 613.7).
  const each = /^Until your next turn, (up to (?:one|two|three) target [a-z]+ each (?:have|gain|lose|get) .+)$/.exec(line);
  if (each && !ctx.spell) {
    const fx = parseSentence(`${each[1]!.charAt(0).toUpperCase()}${each[1]!.slice(1)} until your next turn`, ctx);
    const one = fx?.length === 1 ? fx[0]! : undefined;
    if (one?.type !== "continuous" || one.duration !== "yourNextTurn" || one.what.ref !== "target") return "fail";
    return { effect: one, next: si + 1 };
  }
  // Will Kenrith: "−2: Target player draws two cards. Until your next turn, instant, sorcery, and planeswalker spells that
  // player casts cost {2} less to cast.": a cost reduction for the spells the target player casts (CR 601.2f, generic mana
  // only, CR 118.7a), from this resolved ability (CR 611.2a) until its controller's next turn begins (CR 611.2b).
  const theirs = /^Until your next turn, (.+? spells) that player casts cost (\{\d+\}) less to cast$/.exec(line);
  if (theirs) {
    const t = ctx.lastPlayerTarget;
    if (t === undefined || ctx.targets[t]?.kind !== "player" || ctx.targets[t]!.many || prev?.type !== "draw") return "fail";
    const fx = parseSentence(`Until your next turn, ${theirs[1]} you cast cost ${theirs[2]} less to cast`, ctx);
    const one = fx?.length === 1 ? fx[0]! : undefined;
    if (one?.type !== "costModThisTurn" || !one.untilYourNextTurn || one.who || one.next || one.times) return "fail";
    return { effect: { ...one, who: { ref: "target", index: t }, mod: { ...one.mod, text: `${line}.` } }, next: si + 1 };
  }
  // Coffin Queen: "Put target creature card from a graveyard onto the battlefield under your control. When ~ becomes untapped
  // or you lose control of ~, exile that creature.": a delayed trigger (CR 603.7) watching ~ as it is now, about the
  // permanent the card became; it triggers once, the first time ~ becomes untapped or you lose control of it (its leaving
  // the battlefield too, rulings on Seraph); if ~ left before this resolved, never (rulings), and once the creature has left
  // the battlefield there's nothing to exile (CR 400.7, rulings).
  if (ctx.activated && !ctx.spell && line === "When ~ becomes untapped or you lose control of ~, exile that creature" && sentences.length === si + 1) {
    if (prev?.type !== "putOntoBattlefield" || effects.length !== 1 || prev.what.ref !== "target" || prev.sacrificeOnLostControl || prev.atNextEndStep || prev.owner) return "fail";
    effects.pop();
    return { effect: { ...prev, exileOnUntapOrLostControl: true }, next: si + 1 };
  }
  // Knowledge Exploitation: "Search target opponent's library for an instant or sorcery card. You may cast that card without
  // paying its mana cost. Then that player shuffles.": the card found is cast from that library as this resolves (CR 608.2g;
  // rulings: X is 0, no alternative costs, additional costs may be paid), or not; finding none is allowed (CR 701.23b); the
  // card stays there if it isn't cast, and the library is shuffled after.
  if (ctx.spell && line === "Search target opponent's library for an instant or sorcery card" && next === "You may cast that card without paying its mana cost" && plain(sentences[si + 2]) === "Then that player shuffles" && !effects.length && !ctx.targets.length) {
    const fx = parseSentence("Search target opponent's library for an instant or sorcery card and exile it", ctx);
    const one = fx?.length === 1 ? fx[0]! : undefined;
    if (one?.type !== "search" || one.library?.ref !== "target" || one.n !== 1 || one.upTo || !one.filter) return "fail";
    effects.push({ ...one, dest: { zone: "cast" }, noShuffle: true }, { type: "castSearched" });
    return { effect: { type: "shuffle", who: one.library, ifSearched: true }, next: si + 3 };
  }
  return null;
}

/** Undercellar Sweep's whole line. */
const SWEEP = "Whenever you attack, if you or a player you're attacking has the initiative, you create two 1/1 white Soldier creature tokens that are tapped and attacking.";

export function round360Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Undercellar Sweep: "Whenever you attack, if you or a player you're attacking has the initiative, ...": an intervening if
  // (CR 603.4), checked as you attack and as it resolves: you have the initiative, or a player (not a planeswalker or
  // battle) your creatures attack in this combat does (CR 506.3, 726.1). The tokens attack a player or planeswalker you
  // choose (CR 508.4).
  // Its colors as a text change of color words leaves them (color-template.ts, round 462).
  const sweep = colorTemplate(SWEEP, line);
  if (sweep) {
    const t = isSpell ? null : parseTrigger(withColors("Whenever you attack, if you have the initiative, you create two 1/1 white Soldier creature tokens that are tapped and attacking.", sweep));
    if (!t || t === "fail" || t.event !== "creaturesYouControlAttack" || t.ifCond?.kind !== "initiative") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, ifCond: { kind: "initiative", orAttacked: true } });
    return true;
  }
  return false;
}

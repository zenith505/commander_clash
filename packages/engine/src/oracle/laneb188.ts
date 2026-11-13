// Lane B round B188's lines, read by compileCard before its triggers and activated abilities (after round B187's), and
// its sentences, read at the end of round B187's.
import type { CompiledCard, Effect } from "../abilities";
import { parseOne, type Ctx } from "./body";
import { parseSentence } from "./sentence";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

const PERMANENT_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB188Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  void line;
  void raw;
  void out;
  void isSpell;
  return false;
}

export function roundB188Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Ral and the Implicit Maze II: "You may discard a card. If you do, exile the top two cards of your library. You may play
  // them until the end of your next turn.": both instructions only if you discarded (CR 608.2c); the cards played with
  // their costs paid and their usual timing (rulings), the play permission ending with your next turn (CR 611.2b).
  if (s === "If you do, exile the top two cards of your library" && plain(sentences[si + 1]) === "You may play them until the end of your next turn") {
    const prev = effects[effects.length - 1];
    if (prev?.type !== "may" || prev.otherwise || prev.pay || prev.effects.length !== 1 || prev.effects[0]!.type !== "discard") return "fail";
    return { effect: { type: "if", cond: { kind: "youDid" }, effects: [{ type: "impulse", n: 2, until: "nextTurn" }] }, next: si + 2 };
  }
  // Kang Dynasty III: "Target creature you control gets +1/+1 until end of turn for each card in your hand and can't be
  // blocked this turn.": the number of cards counted once, as it resolves (CR 608.2h, 611.2c), and the same target both.
  if (s === "Target creature you control gets +1/+1 until end of turn for each card in your hand and can't be blocked this turn") {
    const pump = parseOne("Target creature you control gets +1/+1 until end of turn for each card in your hand", ctx);
    const e = pump?.length === 1 ? pump[0]! : undefined;
    if (e?.type !== "continuous" || e.what.ref !== "target" || e.duration !== "endOfTurn") return "fail";
    effects.push(e);
    return { effect: { type: "continuous", what: e.what, mods: [{ kind: "cantBeBlocked" }], duration: "endOfTurn" }, next: si + 1 };
  }
  // Eiganjo Uprising: "Each opponent creates X minus one 2/2 white Samurai creature tokens with vigilance.": none when X is
  // 0 or 1 (a negative number is 0, CR 107.1b).
  const minus = /^Each opponent creates X minus one (.+ tokens?.*)$/.exec(s);
  if (minus) {
    const fx = parseSentence(`Each opponent creates X ${minus[1]!}`, ctx);
    const e = fx?.length === 1 ? fx[0]! : undefined;
    if (e?.type !== "createToken" || e.who?.ref !== "eachOpponent" || typeof e.n !== "object" || e.n.count.kind !== "x" || e.n.plus || e.n.times) return "fail";
    return { effect: { ...e, n: { count: { kind: "x" }, plus: -1 } }, next: si + 1 };
  }
  // Old Fat Spider Can't See Me I: "Target creature you control gains hexproof for as long as this Saga remains on the
  // battlefield.": until the Saga leaves, whoever controls it (CR 611.2b), so once it's sacrificed after its last chapter.
  if (!ctx.spell && s === "Target creature you control gains hexproof for as long as ~ remains on the battlefield") {
    const fx = parseSentence("Target creature you control gains hexproof until end of turn", ctx);
    const e = fx?.length === 1 ? fx[0]! : undefined;
    if (e?.type !== "continuous" || e.duration !== "endOfTurn" || e.what.ref !== "target") return "fail";
    return { effect: { ...e, duration: "whileControlled", whileOnBattlefield: true }, next: si + 1 };
  }
  // Old Fat Spider Can't See Me II: "Prevent all damage that would be dealt by up to one target creature for as long as
  // this Saga remains on the battlefield.": the damage that creature (as the object it is now, CR 400.7) would deal, from
  // any turn on, until the Saga leaves the battlefield (CR 611.2b, 615.1a).
  if (!ctx.spell && s === "Prevent all damage that would be dealt by up to one target creature for as long as ~ remains on the battlefield") {
    const before = ctx.targets.length;
    const fx = parseSentence("Prevent all damage that would be dealt by target creature this turn", ctx);
    const e = fx?.length === 1 ? fx[0]! : undefined;
    if (e?.type !== "damageRule" || e.rule.by?.target?.ref !== "target" || e.rule.by.target.index !== before || ctx.targets.length !== before + 1 || e.rule.to || e.rule.n !== undefined || e.rule.combat) return "fail";
    ctx.targets[before] = { ...ctx.targets[before]!, optional: true };
    return { effect: { ...e, rule: { ...e.rule, whileSourceOnBattlefield: true } }, next: si + 1 };
  }
  // The Last Ronin III: "Whenever a creature you control attacks alone this turn, put three +1/+1 counters on it. It gains
  // trample, lifelink, and indestructible until end of turn.": a delayed triggered ability for the rest of the turn (CR
  // 603.7b), the creature that attacked alone (CR 506.5) its subject, the sentences after it its instructions.
  const alone = /^Whenever a creature you control attacks alone this turn, (.+)$/.exec(s);
  if (alone) {
    const rest = sentences.slice(si + 1).map(plain);
    const trigger = parseTrigger(`Whenever a creature you control attacks alone, ${[alone[1]!, ...rest].join(". ")}.`);
    if (!trigger || trigger === "fail" || trigger.event !== "creatureYouControlAttacksAlone" || Object.keys(trigger).some((k) => k !== "event" && k !== "body")) return "fail";
    return { effect: { type: "floatingTrigger", trigger, until: "endOfTurn" }, next: sentences.length };
  }
  // Cleansing Meditation: "... instead destroy all enchantments, then return all cards in your graveyard destroyed this way
  // to the battlefield.": your own cards the destroy put into your graveyard, still there (CR 400.7), all at once under your
  // control; an Aura's owner picks what it enchants among what's on the battlefield already, not targeted, and one with
  // nothing to enchant stays in the graveyard (rulings, CR 303.4f-g). A token isn't a card (CR 111.8).
  // Seven or more cards are counted as it resolves, before anything is
  // destroyed (CR 608.2c), and only one of the two instructions happens.
  if (s === "If there are seven or more cards in your graveyard, instead destroy all enchantments, then return all cards in your graveyard destroyed this way to the battlefield") {
    const prev = effects[effects.length - 1];
    if (effects.length !== 1 || prev?.type !== "destroy" || prev.what.ref !== "each" || (prev.what.filter.types ?? []).join() !== "Enchantment" || prev.noRegen) return "fail";
    effects.pop();
    const back: Effect = { type: "returnAllFromGraveyard", who: { ref: "you" }, filter: { kind: "card", types: [], notTypes: [], notColors: [], text: "card destroyed this way" }, destroyedThisWay: true };
    return { effect: { type: "if", cond: { kind: "state", cond: { kind: "graveyardAtLeast", n: 7 } }, effects: [prev, back], otherwise: [prev] }, next: si + 1 };
  }
  // Say Its Name: "Search your graveyard, hand, and/or library for a card named Altanak, the Thrice-Called and put it onto
  // the battlefield. If you search your library this way, shuffle.": Dark Supplicant's search (body.ts), for a name with a
  // comma in it; the graveyard and the hand, the library too if you choose, and only then a shuffle (CR 701.23).
  const named = /^Search your graveyard, hand, and\/or library for a card named ([A-Z][^,~]*, the [A-Z][^,~]*) and put it onto the battlefield$/.exec(s);
  if (named && plain(sentences[si + 1]) === "If you search your library this way, shuffle") {
    return { effect: { type: "search", filter: { kind: "card", named: named[1]!, text: `card named ${named[1]}` }, n: 1, upTo: false, reveal: false, dest: { zone: "battlefield" }, orGraveyard: true, andHand: true }, next: si + 2 };
  }
  // Revival Experiment: "For each permanent type, return up to one card of that type from your graveyard to the
  // battlefield. You lose 3 life for each card returned this way.": the six permanent types (CR 110.4), each card chosen
  // as it resolves (rulings) for one of them, a card of two types counting as either; all enter at once, an Aura's
  // controller choosing what it enchants (CR 303.4f), and the life lost for each one that came back.
  if (s === "For each permanent type, return up to one card of that type from your graveyard to the battlefield" && plain(sentences[si + 1]) === "You lose 3 life for each card returned this way") {
    const oneOfEach = PERMANENT_TYPES.map((t) => ({ kind: "card" as const, types: [t], notTypes: [], notColors: [], text: `${t.toLowerCase()} card` }));
    return { effect: { type: "chooseFromGraveyard", filter: { kind: "card", anyOf: oneOfEach, text: "card of each permanent type" }, n: oneOfEach.length, upTo: true, dest: "battlefield", oneOfEach, lifeEach: 3 }, next: si + 2 };
  }
  return null;
}

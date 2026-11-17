// Round 392's sentences (read first by round373Sentence) and whole lines (compile.ts): cards revealed until X permanent
// cards, any number of them put onto the battlefield (Aurora Awakener), a land played or a spell cast from the top of your
// library as a combat damage trigger resolves (Ziatora's Envoy), and Lukka, Coppercoat Outcast's loyalty abilities.
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { parseCount } from "./counts";
import { parseSearchFilter } from "./search";
import { parseObject } from "./targets";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 392's, read before round 391's. */
export function round392Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Aurora Awakener: "reveal cards from the top of your library until you reveal X permanent cards, where X is the number of
  // colors among permanents you control. Put any number of those permanent cards onto the battlefield, then put the rest of
  // the revealed cards on the bottom of your library in a random order." X counted once, as it resolves (rulings), the
  // whole library revealed if it has fewer (CR 701.20a); none revealed with X 0. The cards picked enter at once, an Aura
  // enchanting something already there (not one entering with it), chosen as it enters, or staying behind with nothing to
  // enchant (CR 303.4f-g, rulings); every revealed card not put onto the battlefield goes on the bottom, in a random order.
  const until = /^[Rr]eveal cards from the top of your library until you reveal X permanent cards, where X is (.+)$/.exec(plain(s));
  if (until && plain(sentences[si + 1]) === "Put any number of those permanent cards onto the battlefield" && /^(?:[Tt]hen )?[Pp]ut the rest of the revealed cards on the bottom of your library in a random order$/.test(plain(sentences[si + 2])) && sentences.length === si + 3) {
    const n = parseCount(until[1]!, ctx);
    const filter = parseSearchFilter("permanent card");
    if (!n || !filter || JSON.stringify(n).includes('"x"')) return "fail";
    return { effect: { type: "revealUntil", filter, found: "battlefield", rest: "bottom", n, anyNumber: true }, next: si + 3 };
  }
  // Lukka, Coppercoat Outcast's +1: "Exile the top three cards of your library. Creature cards exiled this way gain "You may
  // cast this card from exile as long as you control a Lukka planeswalker."": face up (CR 406.3); each creature card has
  // that ability while it stays exiled (a new object once it leaves, CR 400.7), cast by its owner (you) with its usual
  // timing and costs, alternative costs too, and as an Adventure (rulings), while they control any Lukka planeswalker, as
  // they begin to cast it (rulings, CR 601.2). The others just stay in exile.
  if (ctx.activated && !ctx.spell && plain(s) === "Exile the top three cards of your library" && plain(sentences[si + 1]) === 'Creature cards exiled this way gain "You may cast ~ from exile as long as you control a Lukka planeswalker."' && sentences.length === si + 2) {
    const creature = parseSearchFilter("creature card");
    if (!creature) return "fail";
    const lukka = { kind: "object" as const, types: ["Planeswalker"], notTypes: [], notColors: [], subtypes: ["Lukka"], controller: "you" as const, text: "Lukka planeswalker" };
    return { effect: { type: "impulse", n: 3, until: "exiled", castOnly: true, castFilter: creature, ifControl: lukka }, next: si + 2 };
  }
  // Lukka's −2: "Exile target creature you control, then reveal cards from the top of your library until you reveal a
  // creature card with greater mana value. Put that card onto the battlefield and the rest on the bottom of your library in
  // a random order.": greater than the exiled creature's mana value as it last existed on the battlefield, {X} as 0 (CR
  // 608.2h, 202.3e, rulings); with none, the whole library is revealed and put back in a random order (rulings, CR 701.20a).
  // The target illegal as it resolves, the ability doesn't resolve (CR 608.2b).
  if (ctx.activated && plain(s) === "Reveal cards from the top of your library until you reveal a creature card with greater mana value" && plain(sentences[si + 1]) === "Put that card onto the battlefield and the rest on the bottom of your library in a random order" && sentences.length === si + 2) {
    const prev = effects[effects.length - 1];
    const creature = parseSearchFilter("creature card");
    if (prev?.type !== "exile" || prev.what.ref !== "target" || prev.what.n || effects.length !== 1 || ctx.targets.length !== 1 || ctx.targets[0]!.types?.join() !== "Creature" || ctx.targets[0]!.controller !== "you" || !creature) return "fail";
    const greater: TargetSpec = { ...creature, bound: { key: "manaValue", at: "least", amount: { count: { kind: "manaValue", of: { ref: "target", index: prev.what.index } }, plus: 1 } }, text: "creature card with greater mana value" };
    return { effect: { type: "revealUntil", filter: greater, found: "battlefield", rest: "bottom" }, next: si + 2 };
  }
  // Lukka's −7: "Each creature you control deals damage equal to its power to each opponent." (Effect powerToPlayers).
  if (ctx.activated && plain(s) === "Each creature you control deals damage equal to its power to each opponent" && sentences.length === si + 1 && !effects.length) {
    const each = parseObject("each creature you control", ctx);
    if (each?.ref !== "each") return "fail";
    return { effect: { type: "powerToPlayers", a: each, to: { ref: "eachOpponent" } }, next: si + 1 };
  }
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** One whole line of round 392's (compile.ts); false when it isn't one of these. */
export function round392Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Ziatora's Envoy: the trigger's damage is "the damage dealt" (the event's amount, after prevention, CR 120.3); the
  // top card is played as a land, cast free, or put into your hand as it resolves (Effect playTopOrHand,
  // effects/run-round392.ts; CR 305.2, 608.2g, rulings).
  if (line === "Whenever ~ deals combat damage to a player, look at the top card of your library. You may play a land from the top of your library or cast a spell with mana value less than or equal to the damage dealt from the top of your library without paying its mana cost. If you don't, put that card into your hand.") {
    const t = isSpell ? null : parseTrigger("Whenever ~ deals combat damage to a player, draw that many cards.");
    if (!t || t === "fail" || t.event !== "selfDealsCombatDamageToPlayer") return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "playTopOrHand", mvMax: { count: { kind: "eventAmount" } } }], text: line.replace(/^Whenever ~ deals combat damage to a player, /, "") } });
    return true;
  }
  return false;
}

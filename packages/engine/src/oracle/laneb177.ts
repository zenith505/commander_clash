// Lane B round B177's lines, read by compileCard before its triggers and activated abilities (after round B176's), and
// its sentences, read at the end of round B176's.
import type { CompiledCard, Effect } from "../abilities";
import { parseBody, parseOne, type Ctx } from "./body";
import { roundB178Sentence } from "./laneb178";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB177Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Mossbridge Troll: "Tap any number of untapped creatures you control other than ~ with total power 10 or greater: ~ gets
  // +20/+20 until end of turn.": a cost paid like crew's (CR 702.122a) but not crewing (ActivatedAbility.tapPower); the
  // total is checked only as it's paid (rulings), and another Mossbridge Troll may help pay it.
  const tapPower = /^Tap any number of untapped creatures you control other than ~ with total power (\d+) or greater: (.+)$/.exec(line);
  if (tapPower) {
    const body = parseBody(tapPower[2]!, { activated: true });
    if (!body) out.unsupported.push(raw);
    else out.activated.push({ manaCost: "", tap: false, sacrificeSelf: false, sorcerySpeed: false, crew: Number(tapPower[1]), tapPower: true, body, text: line });
    return true;
  }
  return false;
}

export function roundB177Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Twinning Glass: "You may cast a spell from your hand without paying its mana cost if it has the same name as a spell
  // that was cast this turn": one card, cast as this resolves (rulings), the spell as it's cast named like one cast this
  // turn by anyone (rulings); no alternative costs, additional ones may be paid (rulings, CR 118.9).
  if (/^You may cast a spell from your hand without paying its mana cost if it has the same name as a spell that was cast this turn$/.test(s))
    return { effect: { type: "castFromHand", filter: { kind: "spell", types: [], notTypes: [], notColors: [], text: "spell with the same name as a spell cast this turn" }, sameNameCastThisTurn: true }, next: si + 1 };
  // Eternal Dominion: "Search target opponent's library for an artifact, creature, enchantment, or land card. Put that card
  // onto the battlefield under your control.": the same as Bribery's one sentence (CR 701.23a), a permanent card of one of
  // those types; "Then that player shuffles" follows.
  const dominion = /^(Search target opponent's library for an? [a-z, ]+ card)$/.exec(s);
  if (dominion && sentences[si + 1]?.replace(/\.$/, "") === "Put that card onto the battlefield under your control") {
    const fx = parseOne(`${dominion[1]} and put that card onto the battlefield under your control`, ctx);
    const one = fx?.length === 1 ? fx[0] : undefined;
    if (one?.type !== "search" || !one.filter) return "fail";
    return { effect: one, next: si + 2 };
  }
  // Creeping Dread, after "each player discards a card": "Each opponent who discarded a card that shares a card type with
  // the card you discarded loses 3 life". Scythe Specter, after "each opponent discards a card": "Each player who discarded
  // a card with the greatest mana value among cards discarded this way loses life equal to that mana value".
  const last = effects[effects.length - 1];
  const eachDiscard = last?.type === "discard" && (last.who.ref === "eachPlayer" || last.who.ref === "eachOpponent") && last.n === 1 && !last.upTo && !last.random && !last.filter && !last.hand;
  const shares = /^Each opponent who discarded a card that shares a card type with the card you discarded loses (\d+) life$/.exec(s);
  if (shares) return eachDiscard && last.who.ref === "eachPlayer" ? { effect: { type: "discardSharesTypeLoss", n: Number(shares[1]) }, next: si + 1 } : "fail";
  if (/^Each player who discarded a card with the greatest mana value among cards discarded this way loses life equal to that mana value$/.test(s)) return eachDiscard ? { effect: { type: "discardGreatestMvLoss" }, next: si + 1 } : "fail";
  return roundB178Sentence(s, sentences, si, ctx, effects);
}

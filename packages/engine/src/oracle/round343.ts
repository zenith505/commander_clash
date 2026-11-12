// Round 343's sentences, read before round 340's (round340Sentence in oracle/round340.ts, which reads these first): casting
// a card as an instruction resolves "by paying [a cost] rather than paying its mana cost" (CastPay).
import type { CastPay, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseObject } from "./targets";
import { capital } from "./words";
import { round344Sentence } from "./round344";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/**
 * "You may cast that card by discarding a card rather than paying its mana cost" (The Infamous Cruelclaw), "... by paying
 * life equal to the spell's mana value ..." (Bismuth Mindrender), "... by paying an amount of {E} equal to its mana value
 * ..." (Amped Raptor), "You may cast the copy by paying {3} ..." (Blue Mage's Cane): the alternative cost the card is cast
 * for as this resolves (CR 608.2g, 118.9), or null.
 */
export function parseCastPay(text: string): CastPay | null {
  const m = /^You may cast (?:that card|it|the copy) by (discarding a card|paying life equal to (?:its|the spell's) mana value|paying an amount of \{E\} equal to its mana value|paying ((?:\{\d+\})+)) rather than paying its mana cost\.?$/.exec(text);
  if (!m) return null;
  return m[2] ? { kind: "mana", mana: m[2] } : m[1] === "discarding a card" ? { kind: "discard", n: 1 } : m[1]!.startsWith("paying life") ? { kind: "lifeMv" } : { kind: "energyMv" };
}

export function round343Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 344's sentences first (oracle/round344.ts).
  const r344 = round344Sentence(s, sentences, si, ctx, effects);
  if (r344 !== null) return r344;
  const line = plain(s);
  if (ctx.spell) return null;
  // Amped Raptor: "Then if you cast it from your hand, exile cards from the top of your library until you exile a nonland
  // card. You may cast that card by paying an amount of {E} equal to its mana value rather than paying its mana cost.":
  // both instructions only if ~ was cast from your hand (as it last existed, CR 608.2h; a commander cast from the command
  // zone wasn't); the card is cast as this resolves, or it stays in exile (rulings).
  const raptorPay = /^(?:Then )?if you cast it from your hand, exile cards from the top of your library until you exile a nonland card$/i.test(line) ? parseCastPay(sentences[si + 1] ?? "") : null;
  if (raptorPay) return { effect: { type: "if", cond: { kind: "state", cond: { kind: "self", is: "castFromHand" } }, effects: [{ type: "exileUntilNonland", then: "castFree", pay: raptorPay }] }, next: si + 2 };
  // Anrakyr the Traveller: "you may cast an artifact spell from your hand or graveyard by paying life equal to its mana
  // value rather than paying its mana cost": one, as this resolves, ignoring timing (CR 608.2g), an artifact as the spell
  // it's cast as; for that life only, X being 0, additional costs still paid (rulings, CR 118.9, 107.3b).
  const anrakyr = /^[Yy]ou may cast an? (artifact) spell from your hand or graveyard (by .+ rather than paying its mana cost)$/.exec(line);
  const anrakyrPay = anrakyr ? parseCastPay(`You may cast it ${anrakyr[2]!}`) : null;
  if (anrakyr && anrakyrPay)
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, handAndYard: true, max: 1, pay: anrakyrPay, filter: { kind: "card", types: [capital(anrakyr[1]!)], notTypes: [], notColors: [], text: `${anrakyr[1]!} card` } }, next: si + 1 };
  // Blue Mage's Cane's granted "exile up to one target instant or sorcery card from defending player's graveyard. If you
  // do, copy it. You may cast the copy by paying {3} rather than paying its mana cost.": the copy made in exile, cast as
  // this resolves for that alternative cost or never (X is 0), one not cast ceasing to exist (rulings, CR 707.12, 118.9).
  const caneTarget = /^[Ee]xile (up to one target instant or sorcery card from (?:defending player's|your|an opponent's|a) graveyard)$/.exec(line);
  const canePay = caneTarget && plain(sentences[si + 1]) === "If you do, copy it" ? parseCastPay(sentences[si + 2] ?? "") : null;
  if (caneTarget && canePay) {
    const base = parseObject(caneTarget[1]!, ctx, true);
    if (base?.ref !== "target") return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromYard: { target: base.index }, pay: canePay }, next: si + 3 };
  }
  return null;
}

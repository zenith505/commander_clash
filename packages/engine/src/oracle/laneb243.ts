// Lane B round B243's lines, read by compileCard before its triggers and activated abilities (after round B242's), and its
// sentences, read at the end of round B240's chain (roundB240Sentence in oracle/laneb240.ts).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { roundB254Sentence } from "./laneb254";
import { parseSearch } from "./search";
import { X } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

const SERUM_POWDER = "Any time you could mulligan and ~ is in your hand, you may exile all the cards from your hand, then draw that many cards.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB243Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  // Serum Powder: an action at a time its owner would declare whether they take a mulligan, while it's in their hand (CR
  // 103.5b): every card in the hand exiled for the rest of the game, then as many drawn (rulings); then they declare. Only
  // in a game with the mulligan process (game.ts exileOpeningHand).
  if (!isSpell && line === SERUM_POWDER) {
    out.exileOpeningHand = true;
    return true;
  }
  return false;
}

export function roundB243Sentence(s: string, sentences: string[], si: number, ctx: Ctx): Found {
  // Monastery Raid: "Exile the top two cards of your library. If this spell's freerunning cost was paid, exile the top X
  // cards of your library instead. You may play the exiled cards until the end of your next turn.": one impulse, of X cards
  // when the spell was cast for its freerunning cost (CR 702.173a, 118.9) with the X announced for that cost (CR 107.3a),
  // else of two; the cards are played with the normal timing and costs (rulings).
  if (ctx.spell && plain(s) === "Exile the top two cards of your library" && plain(sentences[si + 1]) === "If ~'s freerunning cost was paid, exile the top X cards of your library instead" && plain(sentences[si + 2]) === "You may play the exiled cards until the end of your next turn")
    return {
      effect: { type: "if", cond: { kind: "altPaid", alt: "freerunning" }, effects: [{ type: "impulse", n: X, until: "nextTurn" }], otherwise: [{ type: "impulse", n: 2, until: "nextTurn" }] },
      next: si + 3,
    };
  // Ecological Appreciation: "Search your library and graveyard for up to four creature cards with different names that each
  // have mana value X or less and reveal them. An opponent chooses two of those cards. Shuffle the chosen cards into your
  // library and put the rest onto the battlefield.": both zones together (CR 701.23), up to four cards found and revealed;
  // the opponent (one its caster chooses as it resolves, as for Threats Undetected) picks two of them, all of them when two
  // or fewer were found, so none enters then (rulings); those are shuffled into the library, from either zone, and the rest
  // enter together. "Exile ~" is the next sentence (Effect exileSpell).
  if (
    ctx.spell &&
    plain(s) === "Search your library and graveyard for up to four creature cards with different names that each have mana value X or less and reveal them" &&
    plain(sentences[si + 1]) === "An opponent chooses two of those cards" &&
    plain(sentences[si + 2]) === "Shuffle the chosen cards into your library and put the rest onto the battlefield"
  ) {
    const fx = parseSearch("Search your library for up to four creature cards with different names that each have mana value X or less, reveal them, put them onto the battlefield, then shuffle");
    const search = fx?.length === 1 && fx[0]!.type === "search" ? fx[0]! : null;
    if (!search || search.type !== "search" || search.others || search.dest.zone !== "battlefield") return "fail";
    return { effect: { ...search, andGraveyard: true, split: { n: 2, to: { zone: "libraryTop", shuffleIn: true } } }, next: si + 3 };
  }
  // Round B254's sentences (oracle/laneb254.ts).
  return roundB254Sentence(s, sentences, si, ctx);
}

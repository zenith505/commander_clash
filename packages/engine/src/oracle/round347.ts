// Round 347's sentences, read before round 345's (round345Sentence in oracle/round345.ts, which reads these first), and
// its whole lines (compile.ts, after round 346's): cards exiled with a permanent, face down or face up, that its
// controller may play.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round347Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void effects;
  const line = plain(s);
  // Urianger Augurelt's Draw Arcanum: "Look at the top card of your library. You may exile it face down.": the card is
  // looked at, then exiled face down or left on top, its controller's choice; having looked at it, they may go on looking
  // at it in exile (CR 406.3). It's "exiled with ~" for the other ability (CR 607.2a; exileFaceDown links its cards).
  if (!ctx.spell && line === "Look at the top card of your library" && plain(sentences[si + 1]) === "You may exile it face down") {
    return { effect: { type: "exileFaceDown", from: "top", look: true, pickOne: true, optional: true }, next: si + 2 };
  }
  // Urianger Augurelt's Play Arcanum: "Until end of turn, you may play cards exiled with ~. Spells you cast this way cost
  // {2} less to cast.": every card exiled with it as this resolves, played with the usual costs and timing (rulings: a
  // land only with a land play left), each spell's total cost {2} less, generic mana only (CR 601.2f, rulings).
  const less = /^Spells you cast this way cost \{(\d+)\} less to cast$/.exec(plain(sentences[si + 1]));
  if (!ctx.spell && line === "Until end of turn, you may play cards exiled with ~" && less) {
    return { effect: { type: "mayPlayLinked", all: true, less: Number(less[1]) }, next: si + 2 };
  }
  // Lobelia, Defender of Bag End: "Until end of turn, you may play a card exiled with ~ without paying its mana cost.": one
  // of the cards exiled with it, any of them, played this turn for free (CR 118.9) with the usual timing (rulings); each
  // time this resolves allows one more (GameObject.mayPlay.oneOf / oneOfMax).
  if (!ctx.spell && line === "Until end of turn, you may play a card exiled with ~ without paying its mana cost") {
    return { effect: { type: "mayPlayLinked", all: true, free: true, oneOf: true }, next: si + 1 };
  }
  return null;
}

/** Round 347's whole lines: true when the line is one of them (supported, or pushed to `out.unsupported`). */
export function round347Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // The Temporal Anchor: "During your turn, you may play cards exiled with ~.": with the usual costs and timing (rulings),
  // during its controller's turn only; the cards are the ones its trigger exiled (CR 607.2a).
  if (line === "During your turn, you may play cards exiled with ~." && !isSpell) {
    if (out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
    else out.playLinkedWhile = { kind: "allOf", conds: [{ kind: "yourTurn" }] };
    return true;
  }
  // The Temporal Anchor: "Whenever you choose to put one or more cards on the bottom of your library while scrying, exile
  // that many cards from the bottom of your library.": once for each scry that put one or more there (CR 701.22a), "that
  // many" being how many it put there; the cards exiled are linked to ~ for its play permission (CR 607.2a).
  if (line === "Whenever you choose to put one or more cards on the bottom of your library while scrying, exile that many cards from the bottom of your library." && !isSpell) {
    out.triggers.push({ event: "youScryToBottom", body: { targets: [], effects: [{ type: "exileTop", who: { ref: "you" }, n: { count: { kind: "eventAmount" } }, bottom: true }], text: "exile that many cards from the bottom of your library." } });
    return true;
  }
  return false;
}

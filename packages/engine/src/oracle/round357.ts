// Round 357's sentences, read before round 356's (round356Sentence in oracle/round356.ts reads these first): cards exiled
// until a nonland card, that one cast for free up to the source's power (Ryan Sinclair), and a Saga exiled to be cast
// again this turn (Heaven Sent).
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseCount } from "./counts";
import { round358Sentence } from "./round358";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round357Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Round 358's sentences first (oracle/round358.ts).
  const r358 = round358Sentence(s, sentences, si, ctx, _effects);
  if (r358) return r358;
  const line = plain(s);
  // Ryan Sinclair: "exile cards from the top of your library until you exile a nonland card. You may cast the exiled card
  // without paying its mana cost if it's a spell with mana value less than or equal to ~'s power. Put the exiled cards not
  // cast this way on the bottom of your library in a random order.": cast as the ability resolves or not at all (rulings,
  // CR 608.2g), its mana value as the spell it's cast as (CR 601.2b), ~'s power as the ability resolves (its last known
  // power if it has left the battlefield, CR 608.2h); the found card, if not cast, goes to the bottom with the rest.
  if (
    !ctx.spell &&
    /^[Ee]xile cards from the top of your library until you exile a nonland card$/.test(line) &&
    plain(sentences[si + 1]) === "You may cast the exiled card without paying its mana cost if it's a spell with mana value less than or equal to ~'s power" &&
    plain(sentences[si + 2]) === "Put the exiled cards not cast this way on the bottom of your library in a random order"
  ) {
    const power = parseCount("~'s power", ctx);
    if (!power) return "fail";
    return { effect: { type: "exileUntilNonland", then: "castFree", mvLessThan: { ...power, plus: (power.plus ?? 0) + 1 }, restBottom: true }, next: si + 3 };
  }
  // Heaven Sent, chapter III: "Then if an opponent has 0 or less life, draw seven cards. Otherwise, exile this Saga and you
  // may cast it this turn.": checked as the chapter ability resolves (CR 608.2c); the Saga, if it's still on the
  // battlefield (CR 400.7), is exiled and its controller may cast that card this turn with its usual timing and costs
  // (CR 601.3). Exiled, it isn't sacrificed for its lore counters (CR 714.4).
  if (line === "Otherwise, exile ~ and you may cast it this turn") {
    const prev = _effects[_effects.length - 1];
    if (ctx.spell || prev?.type !== "if" || prev.otherwise || prev.cond.kind !== "state") return null;
    _effects.pop();
    return { effect: { ...prev, otherwise: [{ type: "exile", what: { ref: "self" }, youMay: { thisTurn: true } }] }, next: si + 1 };
  }
  return null;
}

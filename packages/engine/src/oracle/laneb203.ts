// Lane B round B203's sentences, read at the end of round B201's chain (roundB201Sentence in oracle/laneb201.ts).
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parsePlayer } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

export function roundB203Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Jhoira, Weatherlight Corsair: "target opponent reveals cards from the top of their library until they reveal a historic
  // permanent card. You put that card onto the battlefield under your control and lose life equal to that permanent's mana
  // value. That player puts the rest of the revealed cards on the bottom of their library in a random order.": its mana
  // value as it is on the battlefield; with no such card, nothing enters and no life is lost, every card revealed going to
  // the bottom (CR 701.20a).
  const jhoira = /^[Tt]arget opponent reveals cards from the top of their library until they reveal an? ([a-z]+ permanent card)$/.exec(plain(s));
  if (
    jhoira &&
    plain(sentences[si + 1]) === "You put that card onto the battlefield under your control and lose life equal to that permanent's mana value" &&
    plain(sentences[si + 2]) === "That player puts the rest of the revealed cards on the bottom of their library in a random order"
  ) {
    const filter = parseSearchFilter(jhoira[1]!);
    const who = parsePlayer("target opponent", ctx);
    if (!filter || filter.kind !== "card" || !who) return "fail";
    effects.push({ type: "revealUntil", filter, found: "battlefield", rest: "bottom", who, yours: true, remember: true });
    return { effect: { type: "loseLife", who: { ref: "you" }, n: { count: { kind: "manaValue", of: { ref: "created" } } } }, next: si + 3 };
  }
  return null;
}

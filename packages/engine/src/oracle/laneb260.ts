// Lane B round B260's sentences, read at the end of round B259's chain (roundB259Sentence in oracle/laneb259.ts): Minamo's
// Meddling's "discards each card with the same name as a card spliced onto that spell".
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { roundB263Sentence } from "./laneb263";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

export function roundB260Sentence(s: string, sentences: string[], si: number, ctx: Ctx): Found {
  // Minamo's Meddling: "Counter target spell. That spell's controller reveals their hand, then discards each card with the
  // same name as a card spliced onto that spell." The spell's controller as it was (CR 608.2h) and the names of the cards
  // spliced onto it as it was cast (CR 702.47a; effects/run-laneb260.ts).
  // The sentence comes split at ", then": "That spell's controller reveals their hand" and "Discards each card ...".
  if (plain(s) === "That spell's controller reveals their hand" && /^discards each card with the same name as a card spliced onto that spell$/i.test(plain(sentences[si + 1]))) {
    const i = ctx.lastObjectTarget;
    if (!ctx.spell || i === undefined || ctx.targets.length !== 1 || ctx.targets[i]?.kind !== "spell" || ctx.targets[i]!.many) return "fail";
    return { effect: { type: "discardSplicedNames", spell: i }, next: si + 2 };
  }
  return roundB263Sentence(s, sentences, si, ctx);
}

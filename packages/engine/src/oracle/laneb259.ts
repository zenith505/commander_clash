// Lane B round B259's sentences, read at the end of round B258's chain (roundB258Sentence in oracle/laneb258.ts): Divine
// Intervention's "the game is a draw".
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { roundB260Sentence } from "./laneb260";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

export function roundB259Sentence(s: string, sentences: string[], si: number, ctx: Ctx): Found {
  // Divine Intervention: "the game is a draw" (CR 104.4c): the whole game ends with no winner and no loser (rulings: only
  // the limited range of influence option, CR 801, which Commander doesn't use, would end it for some players only).
  if (/^The game is a draw$/i.test(plain(s))) return { effect: { type: "gameIsDraw" }, next: si + 1 };
  return roundB260Sentence(s, sentences, si, ctx);
}

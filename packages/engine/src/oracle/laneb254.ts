// Lane B round B254's sentences, read at the end of round B243's chain (roundB243Sentence in oracle/laneb243.ts): Peace
// Talks. Cultivator Drone's and Rhystic Cave's mana abilities are read in oracle/mana-abilities.ts.
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { roundB255Sentence } from "./laneb255";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

export function roundB254Sentence(s: string, _sentences: string[], si: number, ctx: Ctx): Found {
  // Peace Talks: "This turn and next turn, creatures can't attack, and players and permanents can't be the targets of spells
  // or activated abilities.": rules for exactly two turns, this one and the next one taken (rulings), whoever's; activated
  // abilities only, so a triggered ability can still target (rulings: activated abilities have a colon, CR 113.3b-c).
  if (ctx.spell && plain(s) === "This turn and next turn, creatures can't attack, and players and permanents can't be the targets of spells or activated abilities")
    return { effect: { type: "peaceTalks" }, next: si + 1 };
  // Round B255's sentences (oracle/laneb255.ts).
  return roundB255Sentence(s, _sentences, si, ctx);
}

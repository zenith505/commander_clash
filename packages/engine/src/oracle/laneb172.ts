// Lane B round B172's sentences, read at the end of round B171's.
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { roundB173Sentence } from "./laneb173";
import { parseSearchFilter } from "./search";

type Found = { effect: Effect; next: number } | "fail" | null;

export function roundB172Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Goblin Plate Mail: "amass Goblins 1, then attach ~ to the amassed Army": the Army chosen to get the counters (CR
  // 701.47c, rulings), if ~ is still on the battlefield and the Army still is that creature; otherwise ~ stays where it is
  // (CR 701.3b).
  if (/^[Aa]ttach ~ to the amassed Army$/.test(s) && ctx.amassed && effects.at(-1)?.type === "amass" && !ctx.spell) {
    return { effect: { type: "attach", what: { ref: "amassed" } }, next: si + 1 };
  }
  // Eureka: "Starting with you, each player may put a permanent card from their hand onto the battlefield. Repeat this
  // process until no one puts a card onto the battlefield." (rulings: over only once every player in turn has put none).
  if (s === "Starting with you, each player may put a permanent card from their hand onto the battlefield" && sentences[si + 1]?.replace(/\.$/, "") === "Repeat this process until no one puts a card onto the battlefield" && !effects.length && si + 2 === sentences.length) {
    return { effect: { type: "putFromHandRounds" }, next: si + 2 };
  }
  // Hypergenesis: the same with "an artifact, creature, enchantment, or land card" (no planeswalker or battle card).
  if (s === "Starting with you, each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield" && sentences[si + 1]?.replace(/\.$/, "") === "Repeat this process until no one puts a card onto the battlefield" && !effects.length && si + 2 === sentences.length) {
    const filter = parseSearchFilter("artifact, creature, enchantment, or land card");
    if (!filter || filter.kind !== "card" || filter.types?.length !== 4) return "fail";
    return { effect: { type: "putFromHandRounds", filter }, next: si + 2 };
  }
  return roundB173Sentence(s, sentences, si, ctx, effects);
}

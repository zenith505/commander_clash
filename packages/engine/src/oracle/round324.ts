// Round 324's sentences and triggers, read before round 323's (round323Sentence and round323Trigger in oracle/round323.ts).
import type { Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { round325Sentence, round325Trigger } from "./round325";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round324Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 325's sentences first (oracle/round325.ts).
  const r325 = round325Sentence(s, sentences, si, ctx, effects);
  if (r325 !== null) return r325;
  // Belbe's Portal: "{3}, {T}: You may put a creature card of the chosen type from your hand onto the battlefield.": the
  // creature type chosen as it entered (CR 614.12; compile.ts checks there is one), a card with it in your hand as the
  // ability resolves (CR 608.2d), none too (rulings).
  const portal = /^You may put an? ([a-z]+ card) of the chosen type from your hand onto the battlefield$/.exec(s);
  if (portal && ctx.activated && !ctx.spell) {
    const filter = parseSearchFilter(portal[1]!);
    if (!filter || filter.chosen) return "fail";
    return { effect: { type: "putFromHand", filter: { ...filter, chosen: "type", text: `${filter.text} of the chosen type` }, may: true }, next: si + 1 };
  }
  return null;
}

export function round324Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Round 325's triggers first (oracle/round325.ts).
  return round325Trigger(raw);
}

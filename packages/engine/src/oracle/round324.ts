// Round 324's sentences and triggers, read before round 323's (round323Sentence and round323Trigger in oracle/round323.ts).
import type { Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round324Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void sentences;
  void effects;
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
  void raw;
  return null;
}

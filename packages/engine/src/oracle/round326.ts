// Round 326's sentences, triggers and whole texts (after round 327's, oracle/round327.ts), read before round 325's (round325Sentence and round325Trigger in
// oracle/round325.ts; round325WholeText in oracle/round325.ts).
import type { AbilityBody, Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseCostChange } from "./statics";
import { parseTrigger } from "./triggers";
import { round327Sentence, round327Trigger, round327WholeText } from "./round327";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round326Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 327's sentences first (oracle/round327.ts).
  return round327Sentence(s, sentences, si, ctx, effects);
}

export function round326Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Round 327's triggers first (oracle/round327.ts).
  const r327 = round327Trigger(raw);
  if (r327 !== null) return r327;
  // Academy Loremaster: "At the beginning of each player's draw step, that player may draw an additional card. If they do,
  // spells they cast this turn cost {2} more to cast.": that player's choice, and only if they drew a card; then every
  // spell they cast this turn, alternative costs and spells cast without paying their mana costs too, costs {2} more
  // (rulings; increases before reductions, CR 601.2f).
  const lore = /^(At the beginning of each player's draw step, that player may draw an additional card\.) If they do, spells they cast this turn cost \{(\d+)\} more to cast\.$/.exec(raw);
  if (lore) {
    const t = parseTrigger(lore[1]!);
    const may = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || may?.type !== "eachMay" || may.who.ref !== "eventPlayer" || may.effects.length !== 1 || may.effects[0]!.type !== "draw") return "fail";
    const change = parseCostChange(`Spells you cast cost {${lore[2]}} more to cast`);
    if (!change || change === "fail" || !("costMod" in change) || change.costMod.who !== "you" || change.costMod.turn) return "fail";
    const more: Effect = { type: "costModThisTurn", mod: { ...change.costMod, text: `Spells you cast this turn cost {${lore[2]}} more to cast.` } };
    // Inside the choice, "you" is the player who chose to draw (eachAccepted); "if they do": a card was drawn (CR 121.4).
    const drew: Effect = { type: "if", cond: { kind: "amountNow", amount: { count: { kind: "players", drewThisWay: true } }, min: 1 }, effects: [more] };
    return { ...t, body: { ...t.body, effects: [{ ...may, effects: [...may.effects, drew] }], text: raw.replace(/^At the beginning of each player's draw step, /, "") } };
  }
  return null;
}

/** A whole ability's text read another way (a string), or null. */
export function round326WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  // Round 327's whole texts first (oracle/round327.ts).
  const r327 = round327WholeText(text, parse);
  if (r327 !== null) return r327;
  // Grim Return: "Choose target creature card in a graveyard that was put there from the battlefield this turn. Put that
  // card onto the battlefield under your control.": any graveyard's, put there from the battlefield this turn (not a
  // discarded card or a countered creature spell, rulings).
  const grim = /^Choose (target creature card in a graveyard that was put there from the battlefield this turn)\. Put that card onto the battlefield under your control\.$/.exec(text.trim());
  if (grim) return `Put ${grim[1]} onto the battlefield under your control.`;
  return null;
}

// Round 332's sentences, triggers and whole texts (after round 333's, oracle/round333.ts), read before round 331's
// (round331Sentence, round331Trigger and round331WholeText in oracle/round331.ts).
import type { AbilityBody, Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseTrigger } from "./triggers";
import { round333Sentence, round333Trigger, round333WholeText } from "./round333";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round332Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 333's sentences first (oracle/round333.ts).
  const r333 = round333Sentence(s, sentences, si, ctx, effects);
  if (r333 !== null) return r333;
  // Leori, Sparktouched Hunter: "choose a planeswalker type. Until end of turn, whenever you activate an ability of a
  // planeswalker of that type, copy that ability. You may choose new targets for the copies.": one of CR 205.3j's types
  // (rulings), chosen as the trigger resolves; then a delayed triggered ability for the rest of the turn (CR 603.7b) with
  // that type, for any ability of such a planeswalker you activate (loyalty abilities and others), its copy resolving
  // first, even if that ability is countered (rulings); a loyalty ability's copy costs no loyalty and keeps its X (CR
  // 707.10, rulings).
  if (/^[Cc]hoose a planeswalker type\.?$/.test(s)) {
    const until = /^Until end of turn, whenever you activate an ability of a planeswalker of that type, (copy that ability)\.?$/.exec(sentences[si + 1] ?? "");
    const again = /^You may choose new targets for the copies\.?$/.test(sentences[si + 2] ?? "");
    if (!until || !again || ctx.spell) return "fail";
    const t = parseTrigger("Whenever you activate an ability of a Jace planeswalker, copy that ability. You may choose new targets for the copy.");
    if (!t || t === "fail" || t.event !== "abilityActivated" || t.activates?.of?.kind !== "object" || t.activates.by !== "you") return "fail";
    const { subtypes: _, ...of } = t.activates.of;
    const trigger: TriggeredAbility = { ...t, activates: { ...t.activates, of: { ...of, chosen: "planeswalkerType", text: "planeswalker of the chosen type" } } };
    effects.push({ type: "choose", choice: "planeswalkerType" });
    return { effect: { type: "floatingTrigger", trigger, until: "endOfTurn" }, next: si + 3 };
  }
  return null;
}

export function round332Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Round 333's triggers first (oracle/round333.ts).
  const r333 = round333Trigger(raw);
  if (r333 !== null) return r333;
  // Eye of the Storm: "Whenever a player casts an instant or sorcery card, exile it. Then that player copies each instant
  // or sorcery card exiled with ~. For each copy, the player may cast the copy without paying its mana cost.": a card, not
  // a copy (rulings); the spell is exiled, not countered, linked to ~ (CR 607.2a); then the caster copies every card
  // exiled with it, whoever owns them, and casts any of the copies in the order they choose, as this resolves, with the
  // usual restrictions on when, X as 0 and no alternative costs (rulings, CR 707.12, 118.9).
  if (raw === "Whenever a player casts an instant or sorcery card, exile it. Then that player copies each instant or sorcery card exiled with ~. For each copy, the player may cast the copy without paying its mana cost.") {
    const t = parseTrigger("Whenever a player casts an instant or sorcery spell, draw a card.");
    if (!t || t === "fail" || t.event !== "castSpell" || t.cast?.by !== "any" || t.cast.orCopy) return "fail";
    const filter = { kind: "card" as const, types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" };
    return {
      ...t,
      cast: { ...t.cast, cardOnly: true },
      body: { targets: [], effects: [{ type: "castFromAmong", who: { ref: "eventPlayer" }, castBy: { ref: "eventPlayer" }, n: 0, copies: true, fromYard: { filter, causeLinked: true } }], text: raw.replace(/^Whenever [^,]+, /, "") },
    };
  }
  return null;
}

/** A whole ability's text read another way (a string), or null. */
export function round332WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  // Round 333's whole texts first (oracle/round333.ts).
  return round333WholeText(text, parse);
}

// Round 325's sentences, triggers and whole texts, read before round 324's (round324Sentence and round324Trigger in
// oracle/round324.ts; round320WholeText in oracle/round320.ts).
import type { AbilityBody, Effect, TargetSpec, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { CREATURE_TYPES } from "../keywords";

type Found = { effect: Effect; next: number } | "fail" | null;

const creature = (more: Partial<TargetSpec & { kind: "object" }> = {}): TargetSpec => ({ kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature", ...more }) as TargetSpec;

export function round325Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Burn from Within: "If a creature is dealt damage this way, it loses indestructible until end of turn. If that creature
  // would die this turn, exile it instead.": only a creature the damage was dealt to (none if it was prevented or X is 0,
  // rulings), losing indestructible in layer 6 (CR 613.1f) and exiled if it would die this turn for any reason (rulings).
  if (s === "If a creature is dealt damage this way, it loses indestructible until end of turn" && sentences[si + 1] === "If that creature would die this turn, exile it instead") {
    const prev = effects[effects.length - 1];
    if (prev?.type !== "damage") return "fail";
    const dealt = { ref: "damagedThisWay" as const, filter: creature() };
    effects.push({ type: "continuous", what: dealt, mods: [{ kind: "removeKeywords", keywords: ["Indestructible"] }], duration: "endOfTurn" });
    return { effect: { type: "exileIfDies", what: dealt }, next: si + 2 };
  }
  // Peer Pressure: "Choose a creature type. If you control more creatures of that type than each other player, you gain
  // control of all creatures of that type.": strictly more than every other player in the game as it resolves; the
  // creatures of that type then, for the rest of the game (CR 611.2c).
  if (s === "If you control more creatures of the chosen type than each other player, you gain control of all creatures of the chosen type") {
    const prev = effects[effects.length - 1];
    if (prev?.type !== "choose" || prev.choice !== "creatureType" || !ctx.spell) return "fail";
    const ofType = creature({ chosen: "type", text: "creatures of the chosen type" });
    return {
      effect: { type: "if", cond: { kind: "youControlMost", filter: ofType }, effects: [{ type: "continuous", what: { ref: "each", filter: { ...ofType, text: "all creatures of the chosen type" } as TargetSpec }, mods: [{ kind: "control" }], duration: "game" }] },
      next: si + 1,
    };
  }
  return null;
}

export function round325Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Ib Halfheart, Goblin Tactician: "Whenever another Goblin you control becomes blocked, sacrifice it. If you do, it deals 4
  // damage to each creature blocking it.": the Goblin deals it, as it last existed (CR 608.2h), to the creatures that were
  // declared blocking it this combat and are still blocking (CR 506.4); none if it wasn't sacrificed (rulings).
  const ib = /^Whenever another ([A-Z][a-z]+) you control becomes blocked, sacrifice it\. If you do, it deals (\d+) damage to each creature blocking it\.$/.exec(raw);
  if (ib) {
    const subtype = ib[1]!;
    if (!CREATURE_TYPES.has(subtype)) return "fail";
    return {
      event: "creatureBecomesBlocked",
      subjectFilter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [subtype], controller: "you", text: `${subtype} you control` },
      subjectNotSelf: true,
      body: {
        targets: [],
        effects: [
          { type: "sacrifice", what: { ref: "subject" } },
          { type: "if", cond: { kind: "sacrificedThisWay" }, effects: [{ type: "damage", amount: Number(ib[2]), to: { ref: "blockHistory", of: { ref: "subject" }, blockers: true, thisCombat: true, stillBlocking: true }, by: "subject" }] },
        ],
        text: raw.replace(/^Whenever [^,]+, /, ""),
      },
    };
  }
  return null;
}

/** A whole ability's text read another way (a string), or null. */
export function round325WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  void parse;
  // Grab the Reins: "Until end of turn, you gain control of target creature and it gains haste.": both until end of turn,
  // no untap (CR 611.2a).
  if (text.trim() === "Until end of turn, you gain control of target creature and it gains haste.") return "Gain control of target creature until end of turn. It gains haste until end of turn.";
  return null;
}

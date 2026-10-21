// Round 107, impending (CR 702.176): Overlord of the Hauntwoods, and its Everywhere land token (every basic land type,
// CR 305.6: a land with a basic land type has that type's mana ability).

import { describe, expect, it } from "vitest";
import { act, card, passAll, passUntil, setup } from "./helpers";
import { characteristics, isFullySupported, manaOptions, objIsType, planCast, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const overlord = card("Overlord of the Hauntwoods", "Enchantment Creature — Avatar Horror", "{3}{G}{G}", {
  power: "6",
  toughness: "5",
  keywords: ["Impending"],
  oracleText:
    "Impending 4—{1}{G}{G} (If you cast this spell for its impending cost, it enters with four time counters and isn't a creature until the last is removed. At the beginning of your end step, remove a time counter from it.)\nWhenever this permanent enters or attacks, create a tapped colorless land token named Everywhere that is every basic land type.",
});

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
const everywhere = (s: GameState) => s.battlefield.map((id) => s.objects[id]!).find((o) => s.cards[o.cardId]!.name === "Everywhere");

describe("impending (CR 702.176a)", () => {
  it("cast for its impending cost: four time counters, not a creature until the last is removed at your end step", () => {
    expect(isFullySupported(overlord)).toBe(true);
    const { s: s0, ap, ids } = setup([overlord]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "impending" }));
    const o = () => s.objects[ids[0]!]!;
    expect(o().zone).toBe("battlefield");
    expect(o().counters.time).toBe(4);
    expect(objIsType(s, o(), "Creature")).toBe(false);
    expect(objIsType(s, o(), "Enchantment")).toBe(true);
    // It still enters: the token is created (tapped).
    const tok = everywhere(s)!;
    expect(tok).toBeDefined();
    expect(tok.tapped).toBe(true);
    for (let n = 3; n >= 0; n--) {
      s = settle(passUntil(s, "end", ap));
      s = settle(s);
      expect(o().counters.time ?? 0).toBe(n);
      expect(objIsType(s, o(), "Creature")).toBe(n === 0);
      if (n) s = passUntil(s, "upkeep", ap);
    }
    // No counter left: the end step trigger's intervening if is false, so nothing more happens.
    s = passUntil(passUntil(s, "upkeep", ap), "end", ap);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    expect(objIsType(s, o(), "Creature")).toBe(true);
  });

  it("cast for its mana cost: a creature with no time counters", () => {
    const { s: s0, ap, ids } = setup([overlord]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const o = s.objects[ids[0]!]!;
    expect(o.counters.time ?? 0).toBe(0);
    expect(objIsType(s, o, "Creature")).toBe(true);
  });

  it("time counters put on a permanent not cast for impending don't stop it being a creature", () => {
    const { s: s0, ap, ids } = setup([overlord]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    s.objects[ids[0]!]!.counters.time = 2;
    expect(objIsType(s, s.objects[ids[0]!]!, "Creature")).toBe(true);
  });

  it("Everywhere is a colorless land with every basic land type, not basic, and taps for any of the five colors", () => {
    const { s: s0, ap, ids } = setup([overlord]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const tok = everywhere(s)!;
    const c = characteristics(s, tok);
    expect(c.types).toEqual(["Land"]);
    expect(c.colors).toEqual([]);
    expect([...c.subtypes].sort()).toEqual(["Forest", "Island", "Mountain", "Plains", "Swamp"]);
    expect(c.supertypes ?? []).not.toContain("Basic");
    tok.tapped = false;
    const made = new Set(manaOptions(s, tok).map((m) => m.mana));
    for (const m of ["W", "U", "B", "R", "G"]) expect(made.has(m as never), m).toBe(true);
  });
});

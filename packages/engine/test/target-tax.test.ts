// "Spells your opponents cast that target ~ cost {2} more to cast" (CR 601.2f): a cost increase, worked out once the
// targets are chosen (CR 601.2c), once per spell however many of its targets are that permanent (rulings).

import { describe, expect, it } from "vitest";
import { card, setup, target } from "./helpers";
import { isFullySupported, planCast, spellCost } from "../src";
import { putOnBattlefield } from "./helpers";

// Real oracle text (Scryfall).
const boreal = card("Boreal Elemental", "Creature — Elemental", "{4}{U}", { power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nSpells your opponents cast that target this creature cost {2} more to cast." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("spells your opponents cast that target ~ cost more", () => {
  it("is supported", () => expect(isFullySupported(boreal)).toBe(true));

  it("an opponent's spell targeting it costs {2} more; its controller's doesn't", () => {
    const { s, ap, opp, ids } = setup([shock]);
    const theirs = putOnBattlefield(s, opp, boreal);
    const mine = putOnBattlefield(s, ap, boreal);
    const o = s.objects[ids[0]!]!;
    expect(spellCost(s, ap, o, 0, [], { targets: [target(theirs)] }).extra).toBe(2);
    expect(spellCost(s, ap, o, 0, [], { targets: [target(mine)] }).extra).toBe(0);
    expect(spellCost(s, ap, o, 0, [], { targets: [{ kind: "player", id: opp }] }).extra).toBe(0);
    const plan = planCast(s, ap, ids[0]!, [target(theirs)])!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(3);
  });
});

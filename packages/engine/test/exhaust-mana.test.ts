// An exhaust mana ability (CR 702.177a, 605.1a): "Exhaust — {G}, {T}: Add three mana of any one color." is a mana
// ability that can be activated only once, for as long as it's the same object (CR 400.7).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported } from "../src";
import { addMana } from "../src/spend";
import { manaAbilityProblem } from "../src/manaabilities";

// Real oracle text (Scryfall).
const loot = card("Loot, the Pathfinder", "Legendary Creature — Beast Noble", "{2}{G}{U}{R}", { power: "2", toughness: "4", keywords: ["Double strike", "Vigilance", "Haste"], oracleText: "Double strike, vigilance, haste\nExhaust — {G}, {T}: Add three mana of any one color. (Activate each exhaust ability only once.)\nExhaust — {U}, {T}: Draw three cards.\nExhaust — {R}, {T}: Loot deals 3 damage to any target." });

describe("exhaust mana abilities", () => {
  it("parse: Loot's first ability is a mana ability, activated only once", () => {
    expect(isFullySupported(loot)).toBe(true);
    const c = compileCard(loot);
    expect(c.mana).toHaveLength(1);
    expect(c.mana[0]).toMatchObject({ onceEver: true, tap: true, manaCost: "{G}" });
    expect(c.activated.map((a) => a.onceEver)).toEqual([true, true]);
  });

  it("adds three mana of one color, then never again on this object", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, loot);
    addMana(s0, ap, ["G"], {});
    let s = act(s0, { type: "activateMana", player: ap, objectId: l, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(3);
    expect(s.players[ap]!.manaPool.G).toBe(0);
    expect(s.objects[l]!.tapped).toBe(true);
    // Its next turn: untapped, but the exhaust ability is used up.
    s = passUntil(passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]), "main1", ap);
    expect(s.objects[l]!.tapped).toBe(false);
    addMana(s, ap, ["G"], {});
    expect(manaAbilityProblem(s, ap, s.objects[l]!, 0)).toMatch(/only once/);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: l, mana: "R" })).toThrow();
  });

  it("a new object can activate it again (CR 400.7)", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, loot);
    addMana(s0, ap, ["G"], {});
    const s = act(s0, { type: "activateMana", player: ap, objectId: l, mana: "G" });
    expect(s.objects[l]!.activatedEver?.length).toBe(1);
    const again = putOnBattlefield(s, ap, loot);
    addMana(s, ap, ["G"], {});
    const s2 = act(s, { type: "activateMana", player: ap, objectId: again, mana: "B" });
    expect(s2.players[ap]!.manaPool.B).toBe(3);
  });
});

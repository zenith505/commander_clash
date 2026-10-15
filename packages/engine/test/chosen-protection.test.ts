// "Enchanted creature has protection from the chosen color. This effect doesn't remove ~." (Cho-Manno's Blessing,
// Flickering Ward, Ward of Lights): the protection doesn't make this Aura fall off (CR 702.16c, 303.4d), but it
// still makes other Auras of that color fall off, and the Aura falls off if the creature has that protection
// from somewhere else too: only this effect's protection spares it (CR 702.16c-d).

import { describe, expect, it } from "vitest";
import { bear, card, putOnBattlefield, setup } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, runStateBasedActions, type GameState } from "../src";

// Real oracle text (Scryfall).
const blessing = card("Cho-Manno's Blessing", "Enchantment — Aura", "{W}{W}", { keywords: ["Enchant", "Flash"], oracleText: "Flash\nEnchant creature\nAs this Aura enters, choose a color.\nEnchanted creature has protection from the chosen color. This effect doesn't remove this Aura." });
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
const knight = card("White Knight", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2", keywords: ["First strike", "Protection"], oracleText: "First strike\nProtection from black" });
const paladin = card("Paladin Test", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2", keywords: ["Protection"], oracleText: "Protection from white" });

const attach = (s: GameState, aura: string, to: string, color?: "W" | "B") => {
  s.objects[aura]!.attachedTo = to;
  if (color) s.objects[aura]!.chosen = { color };
  invalidateCharacteristics(s);
};

describe("protection from the chosen color that doesn't remove its Aura", () => {
  it("is supported", () => [blessing, pacifism].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("the creature has the protection and the Aura stays on", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, blessing);
    attach(s, a, b, "W");
    runStateBasedActions(s);
    expect(objHasKeyword(s, s.objects[b]!, "Protection from white")).toBe(true);
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[a]!.attachedTo).toBe(b);
  });

  it("another Aura of the chosen color falls off", () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, blessing);
    const p = putOnBattlefield(s, opp, pacifism);
    attach(s, a, b, "W");
    attach(s, p, b);
    runStateBasedActions(s);
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[p]!.zone).toBe("graveyard");
  });

  it("falls off a creature that has protection from that color from somewhere else", () => {
    const { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, paladin);
    const a = putOnBattlefield(s, ap, blessing);
    attach(s, a, k, "W");
    runStateBasedActions(s);
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("protection from another color, here twice over, doesn't affect the white Aura", () => {
    const { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, knight);
    const a = putOnBattlefield(s, ap, blessing);
    attach(s, a, k, "B");
    runStateBasedActions(s);
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[k]!).keywords).toContain("Protection from black");
  });
});

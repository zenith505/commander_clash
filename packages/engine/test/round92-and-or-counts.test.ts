// Round 92: "for each artifact and/or enchantment you control" (All That Glitters): each permanent that's one or the
// other, an artifact enchantment counted once.

import { describe, expect, it } from "vitest";
import { bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported } from "../src";

// Real oracle text (Scryfall).
const glitters = card("All That Glitters", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1 for each artifact and/or enchantment you control." });
const zealot = card("Kithkin Zealot", "Creature — Kithkin Cleric", "{1}{W}", { power: "1", toughness: "3", oracleText: "When this creature enters, you gain 1 life for each black and/or red permanent target opponent controls." });
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });
const both = card("Clock of Omens", "Artifact Enchantment", "{4}", {});

describe("and/or in counts", () => {
  it("parse", () => [glitters, zealot].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("All That Glitters: +1/+1 for each artifact, enchantment, or artifact enchantment, each once", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const aura = putOnBattlefield(s, ap, glitters);
    s.objects[aura]!.attachedTo = b;
    putOnBattlefield(s, ap, relic);
    putOnBattlefield(s, ap, both);
    expect(pt(s, b)).toBe("5/5"); // the Aura, Mind Stone, Clock of Omens
  });
});

// Halvar, God of Battle: "Creatures you control that are enchanted or equipped have double strike": a creature with an
// Aura or an Equipment attached (CR 301.5, 303.4).

import { describe, expect, it } from "vitest";
import { card, putOnBattlefield, scry, setup } from "./helpers";
import { characteristics, isFullySupported } from "../src";

const halvar = scry("modal_dfc", [
  {
    name: "Halvar, God of Battle",
    mana_cost: "{2}{W}{W}",
    type_line: "Legendary Creature — God",
    oracle_text: "Creatures you control that are enchanted or equipped have double strike.\nAt the beginning of each combat, you may attach target Aura or Equipment attached to a creature you control to target creature you control.",
    power: "4",
    toughness: "4",
  },
  { name: "Sword of the Realms", mana_cost: "{1}{W}", type_line: "Legendary Artifact — Equipment", oracle_text: "Equipped creature gets +2/+0 and has vigilance.\nWhenever equipped creature dies, return it to its owner's hand.\nEquip {1}{W}" },
]);
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", cmc: 2 });
const aura = card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature" });
const gear = card("Test Gear", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equip {1}" });

describe("\"creatures you control that are enchanted or equipped\"", () => {
  it("Halvar plays", () => {
    expect(isFullySupported(halvar)).toBe(true);
  });

  it("gives double strike to its controller's creatures with an Aura or an Equipment attached, not the others", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, halvar);
    const [a, b, c] = [putOnBattlefield(s, ap, bear), putOnBattlefield(s, ap, bear), putOnBattlefield(s, ap, bear)];
    const theirs = putOnBattlefield(s, opp, bear);
    s.objects[putOnBattlefield(s, ap, aura)]!.attachedTo = a;
    s.objects[putOnBattlefield(s, ap, gear)]!.attachedTo = b;
    s.objects[putOnBattlefield(s, opp, gear)]!.attachedTo = theirs;
    const ds = (id: string) => characteristics(s, s.objects[id]!).keywords.includes("Double strike");
    expect([ds(a), ds(b), ds(c), ds(theirs)]).toEqual([true, true, false, false]);
  });
});

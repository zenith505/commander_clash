// Anthems over a narrower group of your creatures: "Untapped creatures you control get +0/+2" (whichever are untapped
// right now), "Other legendary creatures you control get +2/+2", "Nonlegendary creatures you control get +1/+1"
// (the Legendary supertype, CR 205.4d), "Other tapped creatures you control have indestructible".

import { describe, expect, it } from "vitest";
import { bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, invalidateCharacteristics, isFullySupported, objHasKeyword, type CardDef } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const buildersBlessing = card("Builder's Blessing", "Enchantment", "{3}{W}", { oracleText: "Untapped creatures you control get +0/+2." });
const arvad = card("Arvad the Cursed", "Legendary Creature — Vampire Knight", "{3}{W}{B}", { power: "3", toughness: "3", keywords: ["Lifelink", "Deathtouch"], oracleText: "Deathtouch, lifelink\nOther legendary creatures you control get +2/+2." });
const dayOfDestiny = card("Day of Destiny", "Legendary Enchantment", "{3}{W}", { oracleText: "Legendary creatures you control get +2/+2." });
const watershaper = card("Adept Watershaper", "Creature — Merfolk Cleric", "{2}{W}", { power: "3", toughness: "4", oracleText: "Other tapped creatures you control have indestructible." });
const flowering = card("Flowering of the White Tree", "Legendary Enchantment", "{W}{W}", { oracleText: "Legendary creatures you control get +2/+1 and have ward {1}.\nNonlegendary creatures you control get +1/+1." });
const legend = card("Legendary Bear", "Legendary Creature — Bear", "{1}{G}", { power: "2", toughness: "2", oracleText: "" });

describe("anthems with a tapped or legendary filter", () => {
  it("are supported", () => supported(buildersBlessing, arvad, dayOfDestiny, watershaper, flowering));

  it("Builder's Blessing: only untapped creatures, following tapping and untapping", () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, ap, buildersBlessing);
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("2/4");
    expect(pt(s, theirs)).toBe("2/2");
    s.objects[b]!.tapped = true; // tapping changes no characteristics, so nothing invalidates them
    expect(pt(s, b)).toBe("2/2");
    s.objects[b]!.tapped = false;
    expect(pt(s, b)).toBe("2/4");
  });

  it("Arvad the Cursed and Day of Destiny: legendary creatures only; Arvad not himself", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, arvad);
    const l = putOnBattlefield(s, ap, legend);
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect([pt(s, a), pt(s, l), pt(s, b)]).toEqual(["3/3", "4/4", "2/2"]);
    putOnBattlefield(s, ap, dayOfDestiny);
    invalidateCharacteristics(s);
    expect([pt(s, a), pt(s, l), pt(s, b)]).toEqual(["5/5", "6/6", "2/2"]);
  });

  it("Flowering of the White Tree: one bonus for legendary creatures, another for the rest", () => {
    const { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, legend);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, flowering);
    invalidateCharacteristics(s);
    expect([pt(s, l), pt(s, b)]).toEqual(["4/3", "3/3"]);
    const warded = (id: string) => abilitiesOf(s, s.objects[id]!).triggers.some((t) => t.event === "becomesTargetOfOpponent");
    expect([warded(l), warded(b)]).toEqual([true, false]);
  });

  it("Adept Watershaper: other tapped creatures have indestructible", () => {
    const { s, ap } = setup([]);
    const w = putOnBattlefield(s, ap, watershaper);
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(false);
    s.objects[b]!.tapped = true;
    s.objects[w]!.tapped = true;
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[w]!, "Indestructible")).toBe(false);
  });
});

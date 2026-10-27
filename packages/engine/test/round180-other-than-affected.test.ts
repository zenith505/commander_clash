// Round 180: "other" in a static ability that affects other permanents ("Enchanted creature gets +1/+1 for each other
// creature you control") means other than the permanent it's applied to, when that one is of the kind counted; round
// 179 found the enchanted creature counting itself.

import { describe, expect, it } from "vitest";
import { activate, bear, card, cast, pt, putOnBattlefield, setup, target } from "./helpers";
import { invalidateCharacteristics, isFullySupported, objHasKeyword, type CardDef } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const legend = (name: string) => card(name, "Legendary Creature — Human", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const sliver = card("Test Sliver", "Creature — Sliver", "{W}", { cmc: 1, power: "1", toughness: "1" });
const testAura = card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature has vigilance." });

// Real oracle text (Scryfall).
const bravado = card("Bravado", "Enchantment — Aura", "{1}{R}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+1 for each other creature you control."});
const conclavesBlessing = card("Conclave's Blessing", "Enchantment — Aura", "{3}{W}", {cmc: 4,"keywords":["Enchant","Convoke"],"oracleText":"Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nEnchant creature\nEnchanted creature gets +0/+2 for each other creature you control."});
const vampirism = card("Vampirism", "Enchantment — Aura", "{1}{B}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant creature\nWhen this Aura enters, draw a card at the beginning of the next turn's upkeep.\nEnchanted creature gets +1/+1 for each other creature you control.\nOther creatures you control get -1/-1."});
const heroesPodium = card("Heroes' Podium", "Legendary Artifact", "{5}", {cmc: 5,"oracleText":"Each legendary creature you control gets +1/+1 for each other legendary creature you control.\n{X}, {T}: Look at the top X cards of your library. You may reveal a legendary creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order."});
const sliverLegion = card("Sliver Legion", "Legendary Creature — Sliver", "{W}{U}{B}{R}{G}", {cmc: 5,"power":"7","toughness":"7","oracleText":"All Sliver creatures get +1/+1 for each other Sliver on the battlefield.","colors":["B","G","R","U","W"]});
const gleamOfAuthority = card("Gleam of Authority", "Enchantment — Aura", "{1}{W}", {cmc: 2,"keywords":["Enchant","Bolster"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+1 for each +1/+1 counter on other creatures you control.\nEnchanted creature has vigilance and \"{W}, {T}: Bolster 1.\" (To bolster 1, choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)"});
const ancestralMask = card("Ancestral Mask", "Enchantment — Aura", "{2}{G}", {cmc: 3,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2 for each other enchantment on the battlefield."});

describe("round 180: other than the enchanted creature", () => {
  it("all compile", () => supported(bravado, conclavesBlessing, vampirism, heroesPodium, sliverLegion, ancestralMask, gleamOfAuthority));

  it("Bravado counts the other creatures you control, not the enchanted one", () => {
    const g = setup([bravado]);
    let s = g.s;
    const a = putOnBattlefield(s, g.ap, bear());
    putOnBattlefield(s, g.ap, bear());
    putOnBattlefield(s, g.ap, bear());
    putOnBattlefield(s, g.opp, bear());
    s = cast(s, g.ap, g.ids[0]!, [target(a)]);
    expect(s.objects[g.ids[0]!]!.attachedTo).toBe(a);
    // Two other creatures you control (the opponent's doesn't count): +2/+2.
    expect(pt(s, a)).toBe("4/4");
  });

  it("Bravado on a creature alone gives nothing", () => {
    const g = setup([bravado]);
    let s = g.s;
    const a = putOnBattlefield(s, g.ap, bear());
    s = cast(s, g.ap, g.ids[0]!, [target(a)]);
    expect(pt(s, a)).toBe("2/2");
  });

  it("Conclave's Blessing: +0/+2 for each other creature", () => {
    const g = setup([conclavesBlessing]);
    let s = g.s;
    const a = putOnBattlefield(s, g.ap, bear());
    putOnBattlefield(s, g.ap, bear());
    s = cast(s, g.ap, g.ids[0]!, [target(a)]);
    expect(s.objects[g.ids[0]!]!.attachedTo).toBe(a);
    expect(pt(s, a)).toBe("2/4");
  });

  it("Vampirism: the enchanted creature gets +1/+1 for each other creature, the others -1/-1", () => {
    const g = setup([vampirism]);
    let s = g.s;
    const a = putOnBattlefield(s, g.ap, bear());
    const b = putOnBattlefield(s, g.ap, bear());
    const c = putOnBattlefield(s, g.ap, bear());
    s = cast(s, g.ap, g.ids[0]!, [target(a)]);
    expect(s.objects[g.ids[0]!]!.attachedTo).toBe(a);
    expect(pt(s, a)).toBe("4/4");
    expect(pt(s, b)).toBe("1/1");
    expect(pt(s, c)).toBe("1/1");
  });

  it("Heroes' Podium: each legendary creature counts the other legendary creatures, not itself", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, heroesPodium);
    const a = putOnBattlefield(s, ap, legend("Legend A"));
    expect(pt(s, a)).toBe("2/2");
    const b = putOnBattlefield(s, ap, legend("Legend B"));
    const c = putOnBattlefield(s, ap, legend("Legend C"));
    putOnBattlefield(s, ap, bear());
    expect([pt(s, a), pt(s, b), pt(s, c)]).toEqual(["4/4", "4/4", "4/4"]);
  });

  it("Sliver Legion: each Sliver counts the other Slivers, Sliver Legion among them (rulings)", () => {
    const { s, ap, opp } = setup([]);
    const legion = putOnBattlefield(s, ap, sliverLegion);
    expect(pt(s, legion)).toBe("7/7");
    const x = putOnBattlefield(s, ap, sliver);
    const y = putOnBattlefield(s, opp, sliver);
    // "If Sliver Legion and two other Slivers are on the battlefield, for example, each of them gets +2/+2."
    expect([pt(s, legion), pt(s, x), pt(s, y)]).toEqual(["9/9", "3/3", "3/3"]);
  });

  it("Ancestral Mask still counts the other enchantments, not itself", () => {
    const g = setup([ancestralMask]);
    let s = g.s;
    const a = putOnBattlefield(s, g.ap, bear());
    s = cast(s, g.ap, g.ids[0]!, [target(a)]);
    expect(pt(s, a)).toBe("2/2");
    const b = putOnBattlefield(s, g.opp, bear());
    const other = putOnBattlefield(s, g.opp, testAura);
    s.objects[other]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(pt(s, a)).toBe("4/4");
  });

  it("Gleam of Authority counts the +1/+1 counters on the other creatures, not the enchanted one's", () => {
    const g = setup([gleamOfAuthority]);
    let s = g.s;
    const a = putOnBattlefield(s, g.ap, bear());
    const b = putOnBattlefield(s, g.ap, bear());
    const theirs = putOnBattlefield(s, g.opp, bear());
    s.objects[a]!.counters["+1/+1"] = 1;
    s.objects[b]!.counters["+1/+1"] = 2;
    s.objects[theirs]!.counters["+1/+1"] = 5;
    invalidateCharacteristics(s);
    s = cast(s, g.ap, g.ids[0]!, [target(a)]);
    expect(s.objects[g.ids[0]!]!.attachedTo).toBe(a);
    // 2/2 with its own counter, +2/+2 for the other creature's two.
    expect(pt(s, a)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[a]!, "Vigilance")).toBe(true);
    // Its bolster puts the counter on the creature with the least toughness (b, at 4), which gives a +1/+1 more.
    s = activate(s, g.ap, a, 0);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, a)).toBe("6/6");
  });
});

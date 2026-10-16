// Mana Reflection and Nyxbloom Ancient: "If you tap a permanent for mana, it produces twice (three times) as much of
// that mana instead." A replacement effect on the mana production event while a mana ability with {T} in its cost
// resolves (CR 106.12, 106.12b, 614.1a), not a triggered mana ability: what tapping it triggers isn't multiplied
// (rulings), several multiply together, and the mana keeps its riders.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, manaOptions, planCast, type Action, type GameState, type ManaType, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const reflection = card("Mana Reflection", "Enchantment", "{4}{G}{G}", { oracleText: "If you tap a permanent for mana, it produces twice as much of that mana instead." });
const nyxbloom = card("Nyxbloom Ancient", "Enchantment Creature — Elemental", "{4}{G}{G}{G}", { power: "5", toughness: "5", keywords: ["Trample"], oracleText: "Trample\nIf you tap a permanent for mana, it produces three times as much of that mana instead." });
const wildGrowth = card("Wild Growth", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." });
const solRing = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
const ziggurat = card("Ancient Ziggurat", "Land", "", { oracleText: "{T}: Add one mana of any color. Spend this mana only to cast a creature spell." });
const talisman = card("Pristine Talisman", "Artifact", "{3}", { oracleText: "{T}: Add {C}. You gain 1 life." });
const altar = card("Ashnod's Altar", "Artifact", "{3}", { oracleText: "Sacrifice a creature: Add {C}{C}." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

const pool = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).flatMap(([m, n]) => Array<string>(n).fill(m)).join("");
const tapFor = (pid: PlayerId, id: ObjectId, mana: ManaType): Action => ({ type: "activateMana", player: pid, objectId: id, mana });
const ability = (s: GameState, id: ObjectId, i: number, extra: Partial<Extract<Action, { type: "activateAbility" }>> = {}): Action => ({ type: "activateAbility", player: s.objects[id]!.controller, objectId: id, index: i, ...extra });
/** Tap every land `pid` controls, so only the permanents under test make mana. */
const tapLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && /Land/.test(s.cards[s.objects[id]!.cardId]!.typeLine)) s.objects[id]!.tapped = true;
};

describe("Mana Reflection, Nyxbloom Ancient", () => {
  it("are supported", () => [reflection, nyxbloom].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("a land tapped for mana produces twice as much; Sol Ring four", () => {
    const { s: s0, ap } = setup([]);
    tapLands(s0, ap);
    putOnBattlefield(s0, ap, reflection);
    const f = putOnBattlefield(s0, ap, forest);
    const ring = putOnBattlefield(s0, ap, solRing);
    expect(manaOptions(s0, s0.objects[f]!).map((x) => x.adds.join(""))).toEqual(["GG"]);
    let s = act(s0, tapFor(ap, f, "G"));
    s = act(s, tapFor(ap, ring, "C"));
    expect(pool(s, ap)).toBe("GGCCCC");
  });

  it("two of them multiply together: Mana Reflection and Nyxbloom Ancient make six times as much", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, reflection);
    putOnBattlefield(s0, ap, nyxbloom);
    const f = putOnBattlefield(s0, ap, forest);
    expect(pool(act(s0, tapFor(ap, f, "G")), ap)).toBe("GGGGGG");
  });

  it("only for its controller: an opponent's Mana Reflection doesn't double your mana", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, reflection);
    const f = putOnBattlefield(s0, ap, forest);
    expect(pool(act(s0, tapFor(ap, f, "G")), ap)).toBe("G");
  });

  it("the triggered mana ability tapping it triggers isn't multiplied (rulings): Wild Growth still adds one {G}", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, reflection);
    const f = putOnBattlefield(s0, ap, forest);
    const wg = putOnBattlefield(s0, ap, wildGrowth);
    s0.objects[wg]!.attachedTo = f;
    expect(pool(act(s0, tapFor(ap, f, "G")), ap)).toBe("GGG");
  });

  it("the mana keeps its riders: Ancient Ziggurat's doubled mana is all creature-only", () => {
    const { s: s0, ap } = setup([]);
    tapLands(s0, ap);
    putOnBattlefield(s0, ap, reflection);
    const z = putOnBattlefield(s0, ap, ziggurat);
    const s = act(s0, tapFor(ap, z, "R"));
    expect(pool(s, ap)).toBe("RR");
    expect(s.players[ap]!.manaLots?.every((l) => l.only)).toBe(true);
  });

  it("an activated mana ability with {T} in its cost (Pristine Talisman) is doubled; one without {T} (Ashnod's Altar) isn't", () => {
    const { s: s0, ap } = setup([]);
    tapLands(s0, ap);
    putOnBattlefield(s0, ap, reflection);
    const tal = putOnBattlefield(s0, ap, talisman);
    const alt = putOnBattlefield(s0, ap, altar);
    const b = putOnBattlefield(s0, ap, bear());
    const life = s0.players[ap]!.life;
    let s = act(s0, ability(s0, tal, 0));
    expect(pool(s, ap)).toBe("CC");
    expect(s.players[ap]!.life).toBe(life + 1);
    s = act(s, ability(s, alt, 0, { costs: { sacrifice: [b] } }));
    expect(pool(s, ap)).toBe("CCCC");
  });

  it("paying for a spell counts the doubled mana: two Mountains pay for Hill Giant", () => {
    const { s: s0, ap, ids } = setup([giant]);
    tapLands(s0, ap);
    putOnBattlefield(s0, ap, reflection);
    const m1 = putOnBattlefield(s0, ap, card("Mountain", "Basic Land — Mountain"));
    putOnBattlefield(s0, ap, card("Mountain", "Basic Land — Mountain"));
    const plan = planCast(s0, ap, ids[0]!);
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    expect(s.stack.map((x) => x.description)).toEqual([expect.stringContaining("Hill Giant")]);
    expect(s.objects[m1]!.tapped).toBe(true);
  });
});

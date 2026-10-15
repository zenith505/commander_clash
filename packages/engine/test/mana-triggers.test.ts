// Triggered mana abilities about a permanent being tapped for mana (CR 605.1b, 106.12a): they resolve right after the
// mana ability, without the stack (CR 605.4a), so the extra mana can pay for what's being cast.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, putOnBattlefield, setup, swamp } from "./helpers";
import { isFullySupported, manaOptions, planCast, type Action, type CardDef, type GameState, type ManaType } from "../src";

// Real oracle text (Scryfall).
const fertile = card("Fertile Ground", "Enchantment — Aura", "{1}{G}", { keywords: ["Enchant"], oracleText: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." });
const wildGrowth = card("Wild Growth", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." });
const dawns = card("Dawn's Reflection", "Enchantment — Aura", "{3}{G}", { keywords: ["Enchant"], oracleText: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional two mana in any combination of colors." });
const sprawl = card("Utopia Sprawl", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color." });
const flare = card("Mana Flare", "Enchantment", "{2}{R}", { oracleText: "Whenever a player taps a land for mana, that player adds one mana of any type that land produced." });
const ghast = card("Crypt Ghast", "Creature — Spirit", "{3}{B}", { power: "2", toughness: "2", keywords: ["Extort"], oracleText: "Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nWhenever you tap a Swamp for mana, add an additional {B}." });
const gauntlet = card("Gauntlet of Power", "Artifact", "{5}", { oracleText: "As this artifact enters, choose a color.\nCreatures of the chosen color get +1/+1.\nWhenever a basic land is tapped for mana of the chosen color, its controller adds an additional one mana of that color." });
const azorius = card("Azorius Chancery", "Land", "", { oracleText: "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {W}{U}." });
const cradle = card("Gaea's Cradle", "Legendary Land", "", { oracleText: "{T}: Add {G} for each creature you control." });
const grove = card("Yavimaya Coast", "Land", "", { oracleText: "{T}: Add {C}.\n{T}: Add {G} or {U}. This land deals 1 damage to you." });

const pool = (s: GameState, pid: number) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n > 0));
const tapFor = (s: GameState, pid: number, id: string, mana: ManaType, extra?: ManaType[]): Action => ({ type: "activateMana", player: pid, objectId: id, mana, ...(extra ? { extra } : {}) });
const enchant = (s: GameState, pid: number, aura: CardDef, land: string, color?: "W" | "U" | "B" | "R" | "G") => {
  const a = putOnBattlefield(s, pid, aura);
  s.objects[a]!.attachedTo = land;
  if (color) s.objects[a]!.chosen = { color };
  return a;
};
/** Only these lands of `pid` are untapped. */
const only = (s: GameState, pid: number, ids: string[]) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && !ids.includes(id)) s.objects[id]!.tapped = true;
};

describe("triggered mana abilities", () => {
  it("are supported", () => [fertile, wildGrowth, dawns, sprawl, flare, ghast, gauntlet].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Fertile Ground: the land's controller picks the extra mana's color", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, forest);
    enchant(s0, ap, fertile, f);
    expect(manaOptions(s0, s0.objects[f]!).map((x) => x.adds.join(""))).toEqual(["GW", "GU", "GB", "GR", "GG"]);
    expect(() => act(s0, tapFor(s0, ap, f, "G"))).toThrow(/choose the mana/);
    const s = act(s0, tapFor(s0, ap, f, "G", ["U"]));
    expect(pool(s, ap)).toEqual({ G: 1, U: 1 });
  });

  it("Wild Growth adds {G} with no choice; Dawn's Reflection two mana in any combination", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, forest);
    const i = putOnBattlefield(s0, ap, island);
    enchant(s0, ap, wildGrowth, f);
    enchant(s0, ap, dawns, i);
    expect(manaOptions(s0, s0.objects[i]!)).toHaveLength(15);
    let s = act(s0, tapFor(s0, ap, f, "G"));
    s = act(s, tapFor(s, ap, i, "U", ["W", "R"]));
    expect(pool(s, ap)).toEqual({ G: 2, U: 1, W: 1, R: 1 });
  });

  it("Utopia Sprawl adds the chosen color", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, forest);
    enchant(s0, ap, sprawl, f, "R");
    expect(pool(act(s0, tapFor(s0, ap, f, "G")), ap)).toEqual({ G: 1, R: 1 });
  });

  it("Mana Flare: any player's land, one mana of a type it made, picked if it made several", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, flare);
    const of = putOnBattlefield(s0, opp, forest);
    const ch = putOnBattlefield(s0, ap, azorius);
    let s = act(s0, tapFor(s0, ap, ch, "W", ["U"]));
    expect(pool(s, ap)).toEqual({ W: 1, U: 2 });
    // An opponent's land too ("a player").
    expect(manaOptions(s, s.objects[of]!).map((x) => x.adds)).toEqual([["G", "G"]]);
  });

  it("Mana Flare: the colorless or colored mana of the ability used, and nothing when it made no mana", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, flare);
    const y = putOnBattlefield(s0, ap, grove);
    const c = putOnBattlefield(s0, ap, cradle);
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Creature")) s0.objects[id]!.zone = "exile";
    s0.battlefield = s0.battlefield.filter((id) => s0.objects[id]!.zone === "battlefield");
    let s = act(s0, { type: "activateMana", player: ap, objectId: y, mana: "C", ability: 0 });
    expect(pool(s, ap)).toEqual({ C: 2 });
    expect(manaOptions(s, s.objects[c]!).map((x) => x.adds)).toEqual([[]]);
  });

  it("Crypt Ghast: only its controller's Swamps", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ghast);
    const mine = putOnBattlefield(s0, ap, swamp);
    const theirs = putOnBattlefield(s0, opp, swamp);
    expect(pool(act(s0, tapFor(s0, ap, mine, "B")), ap)).toEqual({ B: 2 });
    expect(manaOptions(s0, s0.objects[theirs]!).map((x) => x.adds)).toEqual([["B"]]);
  });

  it("Gauntlet of Power: basic lands tapped for the chosen color, any player's", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gauntlet);
    s0.objects[g]!.chosen = { color: "G" };
    const f = putOnBattlefield(s0, opp, forest);
    const i = putOnBattlefield(s0, ap, island);
    const y = putOnBattlefield(s0, ap, grove);
    expect(manaOptions(s0, s0.objects[f]!).map((x) => x.adds)).toEqual([["G", "G"]]);
    let s = act(s0, tapFor(s0, ap, i, "U"));
    s = act(s, { type: "activateMana", player: ap, objectId: y, mana: "G", ability: 1 });
    expect(pool(s, ap)).toEqual({ U: 1, G: 1 }); // Yavimaya Coast isn't basic
  });

  it("autopay counts the extra mana: one enchanted Forest pays for {G}{U}", () => {
    const spell = card("Simic Test", "Creature — Merfolk", "{G}{U}", { power: "2", toughness: "2" });
    const { s: s0, ap, ids } = setup([spell]);
    const f = putOnBattlefield(s0, ap, forest);
    enchant(s0, ap, fertile, f);
    only(s0, ap, [f]);
    const plan = planCast(s0, ap, ids[0]!);
    expect(plan).not.toBeNull();
    const s = plan!.reduce((x, a) => act(x, a), s0);
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
  });

  it("doesn't trigger for a land tapped to pay another ability's cost", () => {
    const bloom = card("Vernal Bloom", "Enchantment", "{3}{G}", { oracleText: "Whenever a Forest is tapped for mana, its controller adds an additional {G}." });
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bloom);
    const b = putOnBattlefield(s0, ap, bear());
    expect(manaOptions(s0, s0.objects[b]!)).toEqual([]);
  });
});

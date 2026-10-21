// Round 100: "~ has all activated abilities of ..." (CR 613.1f, rulings): Marvin, Murderous Mimic, Experiment Kraj,
// Robaran Mercenaries (permanents), Necrotic Ooze, Thranduil, Trazyn, Mirran Safehouse (graveyard cards).

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, planActivate, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const marvin = card("Marvin, Murderous Mimic", "Legendary Artifact Creature — Toy", "{2}", { power: "2", toughness: "2", oracleText: "Marvin has all activated abilities of creatures you control that don't have the same name as this creature." });
const ooze = card("Necrotic Ooze", "Creature — Ooze", "{2}{B}{B}", { power: "4", toughness: "3", oracleText: "As long as this creature is on the battlefield, it has all activated abilities of all creature cards in all graveyards." });
const kraj = card("Experiment Kraj", "Legendary Creature — Ooze Mutant", "{2}{G}{G}{U}{U}", { power: "4", toughness: "6", oracleText: "Experiment Kraj has all activated abilities of each other creature with a +1/+1 counter on it.\n{T}: Put a +1/+1 counter on target creature." });
const safehouse = card("Mirran Safehouse", "Artifact", "{3}", { oracleText: "As long as this artifact is on the battlefield, it has all activated abilities of all land cards in all graveyards." });
const robaran = card("Robaran Mercenaries", "Creature — Human Mercenary", "{3}{W}", { power: "3", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nThis creature has all activated abilities of all legendary creatures you control." });
const elves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const shade = card("Pump Shade", "Creature — Shade", "{B}", { power: "1", toughness: "1", oracleText: "{B}: This creature gets +1/+1 until end of turn." });
const forestCard = card("Forest", "Basic Land — Forest");

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toYard = (s: GameState, id: string) => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[s.objects[id]!.owner]!.graveyard.push(id);
};
const texts = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.map((a) => a.text);

describe("round 100: borrowed activated abilities", () => {
  it("parse", () => {
    for (const d of [marvin, ooze, kraj, safehouse, robaran]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Marvin has the activated and mana abilities of your other creatures, and uses them on itself", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, marvin);
    putOnBattlefield(s0, ap, shade);
    putOnBattlefield(s0, ap, elves);
    putOnBattlefield(s0, opp, bear({ name: "Theirs", oracleText: "{1}: This creature gets +2/+2 until end of turn." }));
    expect(texts(s0, m)).toEqual(["{B}: ~ gets +1/+1 until end of turn."]);
    expect(manaAbilitiesOn(s0, s0.objects[m]!).map((a) => a.text)).toEqual(["{T}: Add {G}."]);
    let s = s0;
    for (const a of planActivate(s, ap, m, 0)!) s = act(s, a);
    s = settle(s);
    expect(pt(s, m)).toBe("3/3");
  });

  it("not from a creature with its name, and only while that creature is still there", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, marvin);
    const other = putOnBattlefield(s0, ap, { ...marvin, oracleText: "{1}: This creature gets +1/+1 until end of turn." });
    expect(texts(s0, m)).toEqual([]);
    const sh = putOnBattlefield(s0, ap, shade);
    expect(texts(s0, m)).toHaveLength(1);
    toYard(s0, sh);
    expect(texts(s0, m)).toEqual([]);
    void other;
  });

  it("two borrowers don't borrow what the other borrows (no loop)", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, marvin);
    const r = putOnBattlefield(s0, ap, robaran);
    putOnBattlefield(s0, ap, elves);
    expect(texts(s0, r)).toEqual([]);
    expect(manaAbilitiesOn(s0, s0.objects[m]!).map((a) => a.text)).toEqual(["{T}: Add {G}."]);
    expect(manaAbilitiesOn(s0, s0.objects[r]!)).toEqual([]);
  });

  it("Experiment Kraj borrows from each other creature with a +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kraj);
    const sh = putOnBattlefield(s0, ap, shade);
    expect(texts(s0, k)).toHaveLength(1);
    s0.objects[sh]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    expect(texts(s0, k)).toHaveLength(2);
  });

  it("Necrotic Ooze has the activated abilities of creature cards in every graveyard; Mirran Safehouse a land card's mana abilities", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ooze);
    const sh = putOnBattlefield(s0, opp, shade);
    toYard(s0, sh);
    expect(texts(s0, o)).toEqual(["{B}: ~ gets +1/+1 until end of turn."]);
    const safe = putOnBattlefield(s0, ap, safehouse);
    const f = putOnBattlefield(s0, opp, forestCard);
    toYard(s0, f);
    expect(manaAbilitiesOn(s0, s0.objects[safe]!).map((a) => a.text)).toEqual(["{T}: Add {G}."]);
  });
});

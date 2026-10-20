// Token replacements that add other tokens (round 91, CR 614.1a): Academy Manufactor ("If you would create a Clue, Food,
// or Treasure token, instead create one of each"), Peregrin Took and Tippy-Toe ("those tokens plus an additional Food
// token"), Chatterfang ("plus that many 1/1 green Squirrel creature tokens"), Bilbo ("instead create a Food token and a
// Treasure token"), Stridehangar Automaton and Queen Allenal (only for artifact / creature tokens), Ojer Taq ("three
// times that many" creature tokens). The player creating the tokens orders the replacements (CR 616.1), each applying
// once to the event as it then is; the engine takes the order that makes the most. Whatever else the effect says about
// its tokens (tapped, with counters) applies to the added ones too (rulings).

import { describe, expect, it } from "vitest";
import { card, cast, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const manufactor = card("Academy Manufactor", "Artifact Creature — Assembly-Worker", "{3}", { power: "1", toughness: "3", oracleText: "If you would create a Clue, Food, or Treasure token, instead create one of each." });
const peregrin = card("Peregrin Took", "Legendary Creature — Halfling Citizen", "{2}{G}", { power: "2", toughness: "3", oracleText: "If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nSacrifice three Foods: Draw a card." });
const tippy = card("Tippy-Toe, Terrific Partner", "Legendary Creature — Squirrel Hero", "{3}{G}", { power: "2", toughness: "4", oracleText: "If you would create one or more tokens, instead create those tokens plus an additional Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nAt the beginning of your end step, if you gained life this turn, draw a card." });
const chatterfang = card("Chatterfang, Squirrel General", "Legendary Creature — Squirrel Warrior", "{2}{G}", { power: "3", toughness: "3", keywords: ["Forestwalk"], oracleText: "Forestwalk (This creature can't be blocked as long as defending player controls a Forest.)\nIf one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead." });
const bilbo = card("Bilbo, Fellow Conspirator", "Legendary Creature — Halfling Citizen", "{2}{G}", { power: "2", toughness: "3", oracleText: "If you would create a Food token, instead create a Food token and a Treasure token." });
const strider = card("Stridehangar Automaton", "Artifact Creature — Construct", "{3}", { power: "1", toughness: "4", oracleText: "Thopters you control get +1/+1.\nIf one or more artifact tokens would be created under your control, those tokens plus an additional 1/1 colorless Thopter artifact creature token with flying are created instead." });
const allenal = card("Queen Allenal of Ruadach", "Legendary Creature — Elf Noble", "{G}{W}{W}", { power: "*", toughness: "*", oracleText: "Queen Allenal of Ruadach's power and toughness are each equal to the number of creatures you control.\nIf one or more creature tokens would be created under your control, those tokens plus a 1/1 white Soldier creature token are created instead." });
const ojer = card("Ojer Taq, Deepest Foundation", "Legendary Creature — God", "{4}{W}{W}", { power: "6", toughness: "6", keywords: ["Vigilance"], oracleText: "Vigilance\nIf one or more creature tokens would be created under your control, three times that many of those tokens are created instead." });
const lives = card("Parallel Lives", "Enchantment", "{3}{G}", { oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." });

const treasure = card("Make Treasure", "Sorcery", "{R}", { oracleText: "Create a Treasure token." });
const tappedFood = card("Make Food", "Sorcery", "{G}", { oracleText: "Create a tapped Food token." });
const alarm = card("Raise the Alarm", "Instant", "{1}{W}", { oracleText: "Create two 1/1 white Soldier creature tokens." });

/** How many tokens of each name `pid` controls. */
function tokens(s: GameState, pid: PlayerId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (!o.isToken || o.controller !== pid) continue;
    const name = s.cards[o.cardId]!.name;
    out[name] = (out[name] ?? 0) + 1;
  }
  return out;
}
const run = (spell: typeof treasure, ...perms: (typeof treasure)[]) => {
  const { s, ap, ids, opp } = setup([spell]);
  for (const p of perms) putOnBattlefield(s, ap, p);
  return { s: cast(s, ap, ids[0]!), ap, opp };
};

describe("token replacements that add tokens", () => {
  it("parse", () => {
    for (const d of [manufactor, peregrin, tippy, chatterfang, bilbo, strider, allenal, ojer]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Academy Manufactor: one of each; two of them make three of each (rulings)", () => {
    const one = run(treasure, manufactor);
    expect(tokens(one.s, one.ap)).toEqual({ "Treasure Token": 1, "Clue Token": 1, "Food Token": 1 });
    const two = run(treasure, manufactor, manufactor);
    expect(tokens(two.s, two.ap)).toEqual({ "Treasure Token": 3, "Clue Token": 3, "Food Token": 3 });
    // Not other tokens.
    const soldiers = run(alarm, manufactor);
    expect(tokens(soldiers.s, soldiers.ap)).toEqual({ "Soldier Token": 2 });
  });

  it("Peregrin Took and Tippy-Toe: one more Food, tapped like the others", () => {
    const { s, ap } = run(alarm, peregrin);
    expect(tokens(s, ap)).toEqual({ "Soldier Token": 2, "Food Token": 1 });
    const both = run(tappedFood, peregrin, tippy);
    expect(tokens(both.s, both.ap)).toEqual({ "Food Token": 3 });
    expect(both.s.battlefield.filter((id) => both.s.objects[id]!.isToken).every((id) => both.s.objects[id]!.tapped)).toBe(true);
  });

  it("an opponent's Peregrin Took doesn't add to your tokens", () => {
    const { s: s0, ap, ids, opp } = setup([alarm]);
    putOnBattlefield(s0, opp, peregrin);
    const s = cast(s0, ap, ids[0]!);
    expect(tokens(s, ap)).toEqual({ "Soldier Token": 2 });
    expect(tokens(s, opp)).toEqual({});
  });

  it("Chatterfang: that many Squirrels", () => {
    const { s, ap } = run(alarm, chatterfang);
    expect(tokens(s, ap)).toEqual({ "Soldier Token": 2, "Squirrel Token": 2 });
  });

  it("Bilbo, then Manufactor: Food and Treasure, then one of each of both", () => {
    const one = run(tappedFood, bilbo);
    expect(tokens(one.s, one.ap)).toEqual({ "Food Token": 1, "Treasure Token": 1 });
    // "If you somehow control two" (rulings): a second one that isn't legendary.
    const two = run(tappedFood, bilbo, { ...bilbo, oracleId: "bilbo-2", name: "Bilbo's Double", typeLine: "Creature — Halfling Citizen", supertypes: [] });
    expect(tokens(two.s, two.ap)).toEqual({ "Food Token": 1, "Treasure Token": 2 });
    const both = run(tappedFood, bilbo, manufactor);
    expect(tokens(both.s, both.ap)).toEqual({ "Food Token": 2, "Treasure Token": 2, "Clue Token": 2 });
  });

  it("the most tokens: Peregrin's Food before Manufactor, the doubler last", () => {
    // 1 Treasure + Food = 2 tokens of those kinds -> 2 of each -> doubled: 4 of each.
    const { s, ap } = run(treasure, peregrin, manufactor, lives);
    expect(tokens(s, ap)).toEqual({ "Treasure Token": 4, "Clue Token": 4, "Food Token": 4 });
    // Chatterfang after Manufactor: a Squirrel for each of the three.
    const c = run(treasure, manufactor, chatterfang);
    expect(tokens(c.s, c.ap)).toEqual({ "Treasure Token": 1, "Clue Token": 1, "Food Token": 1, "Squirrel Token": 3 });
  });

  it("Stridehangar Automaton: artifact tokens only, and Peregrin's Food is one", () => {
    const art = run(treasure, strider);
    expect(tokens(art.s, art.ap)).toEqual({ "Treasure Token": 1, "Thopter Token": 1 });
    const creature = run(alarm, strider);
    expect(tokens(creature.s, creature.ap)).toEqual({ "Soldier Token": 2 });
    const both = run(alarm, strider, peregrin);
    expect(tokens(both.s, both.ap)).toEqual({ "Soldier Token": 2, "Food Token": 1, "Thopter Token": 1 });
    // With a doubler: the Thopter first, then doubled (rulings).
    const doubled = run(treasure, strider, lives);
    expect(tokens(doubled.s, doubled.ap)).toEqual({ "Treasure Token": 2, "Thopter Token": 2 });
  });

  it("Queen Allenal: creature tokens only", () => {
    const soldiers = run(alarm, allenal);
    expect(tokens(soldiers.s, soldiers.ap)).toEqual({ "Soldier Token": 3 });
    const t = run(treasure, allenal);
    expect(tokens(t.s, t.ap)).toEqual({ "Treasure Token": 1 });
  });

  it("Ojer Taq: three times the creature tokens, not the others", () => {
    const soldiers = run(alarm, ojer);
    expect(tokens(soldiers.s, soldiers.ap)).toEqual({ "Soldier Token": 6 });
    const t = run(treasure, ojer);
    expect(tokens(t.s, t.ap)).toEqual({ "Treasure Token": 1 });
  });
});

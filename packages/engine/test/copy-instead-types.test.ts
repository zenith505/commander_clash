// "Except it's a 1/1 green Frog", "except it's a 4/4 black Zombie" (CR 707.9b, 205.1a): the copy's creature types and
// colors are those instead of its other ones (rulings on God-Pharaoh's Gift), unlike "in addition to its other types".
// And "exile target creature card from a graveyard. Create a token that's a copy of it": the exiled card, copied as
// printed (rulings on The Scarab God). A preparation card's copy keeps its prepare spell as it is (CR 722.3c example).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, pt, scry, setup, swamp, target } from "./helpers";
import { abilitiesOf, characteristics, defOf, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState } from "../src";
import { moveObject } from "../src/game";
import { becomePrepared } from "../src/prepare";

// Real oracle text (Scryfall).
const counterpart = card("Croaking Counterpart", "Sorcery", "{1}{G}{U}", {
  oracleText: "Create a token that's a copy of target non-Frog creature, except it's a 1/1 green Frog.\nFlashback {3}{G}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
  keywords: ["Flashback"],
});
const quarry = card("Lazotep Quarry", "Land — Desert", "", {
  oracleText: "{T}: Add {C}.\n{T}, Sacrifice a creature: Add one mana of any color.\n{X}{2}, {T}, Sacrifice a Desert: Exile target creature card with mana value X from your graveyard. Create a token that's a copy of it, except it's a 4/4 black Zombie. Activate only as a sorcery.",
});
const aviator = scry(
  "prepare",
  [
    { name: "Encouraging Aviator", mana_cost: "{2}{U}", type_line: "Creature — Bird Wizard", oracle_text: "Flying\nWhenever this creature attacks, it becomes prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)", power: "2", toughness: "3" },
    { name: "Jump", mana_cost: "{U}", type_line: "Instant", oracle_text: "Target creature gains flying until end of turn." },
  ],
  { keywords: ["Flying", "Prepared"] },
);
const golem = card("Clay Golem", "Artifact Creature — Golem Warrior", "{4}", { power: "3", toughness: "3", oracleText: "Vigilance", keywords: ["Vigilance"] });
const frog = card("Frog", "Creature — Frog", "{G}", { power: "1", toughness: "1" });
const desert = card("Desert", "Land — Desert");

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const token = (s: GameState) => s.battlefield.find((id) => s.objects[id]!.isToken)!;

describe("copies that are a creature type instead of their others", () => {
  it("the cards compile", () => {
    expect(isFullySupported(counterpart)).toBe(true);
    expect(isFullySupported(quarry)).toBe(true);
  });

  it("Croaking Counterpart: a 1/1 green Frog artifact creature, no other creature types; Frogs can't be targeted", () => {
    const { s: s0, ap, ids } = setup([counterpart]);
    const g = putOnBattlefield(s0, ap, golem);
    const f = putOnBattlefield(s0, ap, frog);
    expect(planCast(s0, ap, ids[0]!, [target(f)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(g)])));
    const t = token(s);
    const c = characteristics(s, s.objects[t]!);
    expect(c.name).toBe("Clay Golem");
    expect(pt(s, t)).toBe("1/1");
    expect(c.colors).toEqual(["G"]);
    expect(c.types).toEqual(["Artifact", "Creature"]);
    expect(c.subtypes).toEqual(["Frog"]);
    expect(c.keywords).toContain("Vigilance");
  });

  it("a Frog copy of a preparation creature: its prepare spell is still a blue instant named Jump (CR 722.3c)", () => {
    const { s: s0, ap, ids } = setup([counterpart]);
    const a = putOnBattlefield(s0, ap, aviator);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(a)])));
    const t = token(s);
    expect(characteristics(s, s.objects[t]!).subtypes).toEqual(["Frog"]);
    expect(becomePrepared(s, s.objects[t]!)).toBe(true);
    const copy = s.objects[s.objects[t]!.prepared!.copy!]!;
    const d = defOf(s, copy);
    expect(d.name).toBe("Jump");
    expect(d.colors).toEqual(["U"]);
    expect(d.types).toEqual(["Instant"]);
    expect(d.subtypes).toEqual([]);
    expect(d.power).toBeUndefined();
  });

  it("Lazotep Quarry: exiles the card and creates a 4/4 black Zombie copy of it", () => {
    const { s: s0, ap } = setup([]);
    const q = putOnBattlefield(s0, ap, quarry);
    const d = putOnBattlefield(s0, ap, desert);
    for (const l of [swamp, swamp, swamp, swamp]) putOnBattlefield(s0, ap, l);
    const g = putOnBattlefield(s0, ap, golem);
    moveObject(s0, g, "graveyard");
    const i = abilitiesOf(s0, s0.objects[q]!).activated.findIndex((a) => /Exile target creature card/.test(a.body.text));
    let s = run(s0, planActivate(s0, ap, q, i, [target(g)], undefined, undefined, 4, { sacrifice: [d] }));
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("exile");
    const t = token(s);
    const c = characteristics(s, s.objects[t]!);
    expect(c.name).toBe("Clay Golem");
    expect(pt(s, t)).toBe("4/4");
    expect(c.colors).toEqual(["B"]);
    expect(c.subtypes).toEqual(["Zombie"]);
    expect(c.types).toEqual(["Artifact", "Creature"]);
  });
});

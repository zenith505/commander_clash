// Equip cost reductions (CR 602.2b, 601.2f), "becomes unattached" triggers (CR 603.10a), Torpor Orb, and Fist of Suns'
// alternative cost (CR 118.9).

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, activationCost, castProblem, isFullySupported, manaValue, moveObject, planCast, runStateBasedActions, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const wargear = card("Grafted Wargear", "Artifact — Equipment", "{3}", {
  keywords: ["Equip"],
  oracleText: "Equipped creature gets +3/+2.\nWhenever this Equipment becomes unattached from a permanent, sacrifice that permanent.\nEquip {0} ({0}: Attach to target creature you control. Equip only as a sorcery.)",
});
const headmaster = card("Bureau Headmaster", "Creature — Human Assassin", "{R}{W}", {
  power: "2",
  toughness: "2",
  oracleText: "Equipment spells you cast cost {1} less to cast.\nEquip abilities you activate cost {1} less to activate.",
});
const mauler = card("Dwarven Mauler", "Creature — Dwarf Berserker", "{2}{R}", {
  power: "3",
  toughness: "2",
  keywords: ["Trample"],
  oracleText: "Trample\nEquip abilities you activate that target this creature cost {2} less to activate.",
});
const bonesplitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const heavy = card("Loxodon Warhammer", "Artifact — Equipment", "{3}", {
  keywords: ["Equip"],
  oracleText: "Equipped creature gets +3/+0 and has trample and lifelink. (Damage dealt by the creature also causes its controller to gain that much life.)\nEquip {3}",
});
const torpor = card("Torpor Orb", "Artifact", "{2}", { oracleText: "Creatures entering don't cause abilities to trigger." });
const fist = card("Fist of Suns", "Artifact", "{3}", { oracleText: "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast." });
const visionary = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", { power: "1", toughness: "1", oracleText: "When this creature enters, draw a card." });
const dreadmaw = card("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample" });
const blaze = card("Blaze", "Sorcery", "{X}{R}", { oracleText: "Blaze deals X damage to any target." });
const bear = (name = "Bear") => card(name, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const equipIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.equip);

describe("Grafted Wargear: whenever it becomes unattached, sacrifice that permanent", () => {
  it("compiles", () => expect(isFullySupported(wargear)).toBe(true));

  it("moving it to another creature sacrifices the first one", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wargear);
    const a = putOnBattlefield(s0, ap, bear("First"));
    const b = putOnBattlefield(s0, ap, bear("Second"));
    let s = activate(s0, ap, w, equipIndex(s0, w), [target(a)]);
    s = settle(s);
    expect(s.objects[w]!.attachedTo).toBe(a);
    s = settle(activate(s, ap, w, equipIndex(s, w), [target(b)]));
    expect(s.objects[w]!.attachedTo).toBe(b);
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("leaving the battlefield sacrifices the creature it was attached to (it looks back in time)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wargear);
    const a = putOnBattlefield(s0, ap, bear());
    let s = settle(activate(s0, ap, w, equipIndex(s0, w), [target(a)]));
    moveObject(s, w, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("the creature dying doesn't make anything else go (it's already gone)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wargear);
    const a = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear("Other"));
    let s = settle(activate(s0, ap, w, equipIndex(s0, w), [target(a)]));
    moveObject(s, a, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[other]!.zone).toBe("battlefield");
    expect(s.objects[w]!.zone).toBe("battlefield");
  });
});

describe("equip cost reductions", () => {
  it("compile", () => {
    for (const c of [headmaster, mauler]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Bureau Headmaster takes {1} off each equip ability you activate, only generic mana", () => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, heavy);
    const bone = putOnBattlefield(s, ap, bonesplitter);
    const c = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, headmaster);
    const cost = (id: string) => manaValue(activationCost(s, ap, s.objects[id]!, abilitiesOf(s, s.objects[id]!).activated[equipIndex(s, id)]!, [target(c)]));
    expect(cost(h)).toBe(2);
    expect(cost(bone)).toBe(0);
  });

  it("an opponent's Headmaster doesn't help you", () => {
    const { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, heavy);
    const c = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, headmaster);
    expect(manaValue(activationCost(s, ap, s.objects[h]!, abilitiesOf(s, s.objects[h]!).activated[equipIndex(s, h)]!, [target(c)]))).toBe(3);
  });

  it("Dwarven Mauler: only equip abilities that target it", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, heavy);
    const m = putOnBattlefield(s0, ap, mauler);
    const c = putOnBattlefield(s0, ap, bear());
    const ab = abilitiesOf(s0, s0.objects[h]!).activated[equipIndex(s0, h)]!;
    expect(manaValue(activationCost(s0, ap, s0.objects[h]!, ab, [target(m)]))).toBe(1);
    expect(manaValue(activationCost(s0, ap, s0.objects[h]!, ab, [target(c)]))).toBe(3);
    // Paying it: one land tapped, not three.
    const untapped = (st: GameState) => st.battlefield.filter((id) => st.objects[id]!.controller === ap && !st.objects[id]!.tapped).length;
    const before = untapped(s0);
    const s = settle(activate(s0, ap, h, equipIndex(s0, h), [target(m)]));
    expect(s.objects[h]!.attachedTo).toBe(m);
    expect(before - untapped(s)).toBe(1);
  });
});

describe("Torpor Orb: creatures entering don't cause abilities to trigger", () => {
  it("compiles", () => expect(isFullySupported(torpor)).toBe(true));

  it("stops a creature's own enters trigger", () => {
    const { s: s0, ap, ids } = setup([visionary, visionary]);
    let s = settle(cast(s0, ap, ids[0]!));
    const hand = s.players[ap]!.hand.length;
    expect(s.log.some((l) => /draws/.test(l.text))).toBe(true);
    putOnBattlefield(s, ap, torpor);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("an opponent's Orb stops your triggers too", () => {
    const { s: s0, ap, opp, ids } = setup([visionary]);
    putOnBattlefield(s0, opp, torpor);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
});

describe("Fist of Suns: {W}{U}{B}{R}{G} rather than the mana cost", () => {
  it("compiles", () => expect(isFullySupported(fist)).toBe(true));

  it("casts a seven-mana creature for five, one of each color", () => {
    const { s: s0, ap, ids } = setup([dreadmaw]);
    putOnBattlefield(s0, ap, fist);
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "wubrg" });
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped)).toHaveLength(5);
  });

  it("isn't there without it, and X is 0 with it (rulings)", () => {
    const { s, ap, ids } = setup([dreadmaw, blaze]);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "wubrg" })).toMatch(/don't control/);
    putOnBattlefield(s, ap, fist);
    expect(castProblem(s, ap, ids[1]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, 3, { alt: "wubrg" })).toMatch(/X is 0/);
  });
});

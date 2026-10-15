// Mana that can only be spent some ways (CR 106.6): "Spend this mana only to cast a creature spell."

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, isFullySupported, planActivate, planCast, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Tap every land `pid` controls, so only what the test adds can pay. */
const tapLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};

// Real oracle text (Scryfall).
const ziggurat = card("Ancient Ziggurat", "Land", "", { oracleText: "{T}: Add one mana of any color. Spend this mana only to cast a creature spell." });
const workshop = card("Mishra's Workshop", "Land", "", { oracleText: "{T}: Add {C}{C}{C}. Spend this mana only to cast artifact spells." });
const soldevi = card("Soldevi Machinist", "Artifact Creature — Human Artificer", "{1}{U}", { power: "1", toughness: "1", oracleText: "{T}: Add {C}{C}. Spend this mana only to activate abilities of artifacts." });
const omenHawker = card("Omen Hawker", "Creature — Bird Advisor", "{2}{U}", { power: "2", toughness: "2", oracleText: "{T}: Add {C}{U}. Spend this mana only to activate abilities." });
const giantGrowth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const furnaceWhelp = card("Furnace Whelp", "Creature — Dragon", "{2}{R}{R}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\n{R}: Furnace Whelp gets +1/+0 until end of turn." });
const mindStone = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice Mind Stone: Draw a card." });
const kickedBear = card("Kavu Titan", "Creature — Kavu", "{1}{G}", {
  power: "2",
  toughness: "2",
  keywords: ["Kicker"],
  oracleText: "Kicker {2}{G} (You may pay an additional {2}{G} as you cast this spell.)\nIf this spell was kicked, it enters with three +1/+1 counters on it and with trample.",
});

describe("restricted mana (CR 106.6)", () => {
  it("creature-only mana pays for a creature spell but not an instant", () => {
    supported(ziggurat, giantGrowth);
    const { s: s0, ap, ids } = setup([bear(), giantGrowth]);
    tapLands(s0, ap);
    const z = putOnBattlefield(s0, ap, ziggurat);
    putOnBattlefield(s0, ap, forest);
    const b = putOnBattlefield(s0, ap, bear());
    // With only the Ziggurat's {G} in the pool, the instant can't be cast.
    let s = act(s0, { type: "activateMana", player: ap, objectId: z, mana: "G" });
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.players[ap]!.restrictedMana).toEqual([{ mana: "G", n: 1, only: expect.objectContaining({ text: "Spend this mana only to cast a creature spell." }) }]);
    expect(castProblem(s, ap, ids[1]!, [target(b)])).toMatch(/not enough mana/);
    // A planned payment taps the Forest for the instant, leaving the Ziggurat's mana in the pool.
    s = run(s, planCast(s, ap, ids[1]!, [target(b)]));
    expect(s.stack.at(-1)?.objectId).toBe(ids[1]);
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.players[ap]!.restrictedMana?.[0]?.n).toBe(1);
  });

  it("the creature spell spends the restricted mana first, keeping the free mana", () => {
    const { s: s0, ap, ids } = setup([bear({ manaCost: "{2}" }), giantGrowth]);
    tapLands(s0, ap);
    const z = putOnBattlefield(s0, ap, ziggurat);
    const f = putOnBattlefield(s0, ap, forest);
    const f2 = putOnBattlefield(s0, ap, forest);
    let s = act(s0, { type: "activateMana", player: ap, objectId: z, mana: "W" });
    s = act(s, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    s = act(s, { type: "activateMana", player: ap, objectId: f2, mana: "G" });
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 0, G: 1 });
    expect(s.players[ap]!.restrictedMana).toBeUndefined();
    // The {G} left is free mana: it pays for the instant.
    s = act(s, { type: "castSpell", player: ap, objectId: ids[1]!, targets: [target(putOnBattlefield(s, ap, bear()))] });
    expect(s.stack.at(-1)?.objectId).toBe(ids[1]);
  });

  it("can't pay for an activated ability, even a creature's", () => {
    const { s: s0, ap } = setup([]);
    tapLands(s0, ap);
    const z = putOnBattlefield(s0, ap, ziggurat);
    const whelp = putOnBattlefield(s0, ap, furnaceWhelp);
    expect(planActivate(s0, ap, whelp, 0)).toBeNull();
    const s = act(s0, { type: "activateMana", player: ap, objectId: z, mana: "R" });
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: whelp, index: 0 })).toThrow(/not enough mana/);
  });

  it("pays for kicker, part of a creature spell's total cost (Ancient Ziggurat ruling)", () => {
    const { s: s0, ap, ids } = setup([kickedBear]);
    tapLands(s0, ap);
    const z = putOnBattlefield(s0, ap, ziggurat);
    const z2 = putOnBattlefield(s0, ap, ziggurat);
    const w = putOnBattlefield(s0, ap, workshop);
    let s = act(s0, { type: "activateMana", player: ap, objectId: z, mana: "G" });
    s = act(s, { type: "activateMana", player: ap, objectId: z2, mana: "G" });
    // The Workshop's mana is only for artifact spells: no help here.
    s = act(s, { type: "activateMana", player: ap, objectId: w, mana: "C" });
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { kicks: [0] })).toMatch(/not enough mana/);
    const f = [0, 1, 2].map(() => putOnBattlefield(s, ap, forest));
    for (const id of f) s = act(s, { type: "activateMana", player: ap, objectId: id, mana: "G" });
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]!, kicks: [0] });
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
    // {1}{G} + {2}{G} = 5: two from the Ziggurats, three from the Forests; the Workshop's {C}{C}{C} is left.
    expect(s.players[ap]!.manaPool).toMatchObject({ G: 0, C: 3 });
    expect(s.players[ap]!.restrictedMana).toEqual([{ mana: "C", n: 3, only: expect.objectContaining({ text: "Spend this mana only to cast artifact spells." }) }]);
  });

  it("artifact-only mana casts an artifact; mana for abilities of artifacts activates them", () => {
    supported(workshop, soldevi, omenHawker, mindStone);
    const { s: s0, ap, ids } = setup([mindStone]);
    tapLands(s0, ap);
    putOnBattlefield(s0, ap, workshop);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
    // The Workshop made {C}{C}{C}; Mind Stone took two of it.
    expect(s.players[ap]!.manaPool.C).toBe(1);
    s = passUntil(s, "main1", ap, 20);
    while (s.stack.length) s = act(s, { type: "passPriority", player: s.priority! });
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // Soldevi's mana pays Mind Stone's {1} (an artifact's ability), but not a creature spell.
    const sm = putOnBattlefield(s, ap, soldevi);
    const plan = planActivate(s, ap, ids[0]!, 0);
    expect(plan?.some((a) => a.type === "activateMana" && a.objectId === sm)).toBe(true);
    const { s: t0, ap: ap2, ids: bears } = setup([bear()]);
    tapLands(t0, ap2);
    putOnBattlefield(t0, ap2, soldevi);
    putOnBattlefield(t0, ap2, omenHawker);
    expect(planCast(t0, ap2, bears[0]!)).toBeNull();
  });

  it("mana for any ability pays a creature's ability", () => {
    const { s: s0, ap } = setup([]);
    tapLands(s0, ap);
    const hawk = putOnBattlefield(s0, ap, omenHawker);
    const whelp = putOnBattlefield(s0, ap, furnaceWhelp);
    // Omen Hawker makes {C}{U}: neither is {R}, so Furnace Whelp's {R} still can't be paid.
    expect(planActivate(s0, ap, whelp, 0)).toBeNull();
    const mtn = putOnBattlefield(s0, ap, card("Mountain", "Basic Land — Mountain"));
    const plan = planActivate(s0, ap, whelp, 0);
    expect(plan?.some((a) => a.type === "activateMana" && a.objectId === mtn)).toBe(true);
    expect(plan?.some((a) => a.type === "activateMana" && a.objectId === hawk)).toBe(false);
  });

  it("restricted mana empties at the end of the step like any other (CR 106.4)", () => {
    const { s: s0, ap } = setup([]);
    const z = putOnBattlefield(s0, ap, ziggurat);
    let s = act(s0, { type: "activateMana", player: ap, objectId: z, mana: "G" });
    s = passUntil(s, "beginCombat", ap, 20);
    expect(s.players[ap]!.manaPool.G).toBe(0);
    expect(s.players[ap]!.restrictedMana).toBeUndefined();
  });

  it("a bestowed spell is an Aura spell, not a creature spell (CR 702.103b)", () => {
    const nimbus = card("Nimbus Naiad", "Enchantment Creature — Nymph", "{2}{U}", {
      power: "2",
      toughness: "2",
      keywords: ["Bestow", "Flying"],
      oracleText: "Bestow {4}{U} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes unattached and remains on the battlefield as a creature.)\nFlying\nEnchanted creature gets +2/+2 and has flying.",
    });
    supported(nimbus);
    const { s: s0, ap, ids } = setup([nimbus]);
    tapLands(s0, ap);
    const b = putOnBattlefield(s0, ap, bear());
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, ap, ziggurat);
    expect(planCast(s0, ap, ids[0]!)).not.toBeNull();
    expect(planCast(s0, ap, ids[0]!, [target(b)], undefined, undefined, undefined, { alt: "bestow" })).toBeNull();
  });
});

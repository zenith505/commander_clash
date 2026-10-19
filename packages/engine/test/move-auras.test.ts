// Moving an Aura (CR 701.3): "attach target Aura you control to target creature" (Aura Finesse), and "attach target Aura
// attached to a creature to another creature" (Crown of the Ages, Autumn-Tail), where the new creature is chosen as the
// ability resolves, not targeted (rulings). It goes only where it could enchant (CR 303.4d, 702.16c); otherwise it stays.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup, target } from "./helpers";
import { abilitiesOf, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const crown = card("Crown of the Ages", "Artifact", "{2}", { oracleText: "{4}, {T}: Attach target Aura attached to a creature to another creature." });
const finesse = card("Aura Finesse", "Instant", "{U}", { oracleText: "Attach target Aura you control to target creature.\nDraw a card." });
const kitsune = scry("flip", [
  { name: "Kitsune Mystic", mana_cost: "{3}{W}", type_line: "Creature — Fox Wizard", oracle_text: "At the beginning of the end step, if Kitsune Mystic is enchanted by two or more Auras, flip it.", power: "2", toughness: "3" },
  { name: "Autumn-Tail, Kitsune Sage", type_line: "Legendary Creature — Fox Wizard", oracle_text: "{1}: Attach target Aura attached to a creature to another creature.", power: "4", toughness: "5" },
]);
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
const bear = card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const ogre = card("Ogre", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4" });
const knight = card("White Knight", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2", oracleText: "First strike\nProtection from white", keywords: ["First strike", "Protection"] });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const enchant = (s: GameState, aura: string, host: string) => {
  s.objects[aura]!.attachedTo = host;
  invalidateCharacteristics(s);
};

describe("moving Auras (CR 701.3)", () => {
  it("the cards compile", () => {
    expect(isFullySupported(crown)).toBe(true);
    expect(isFullySupported(finesse)).toBe(true);
    expect(isFullySupported(kitsune)).toBe(true);
  });

  it("Crown of the Ages: its controller chooses the other creature as it resolves, not one with protection from it", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, crown);
    const mine = putOnBattlefield(s0, ap, bear);
    const o1 = putOnBattlefield(s0, opp, ogre);
    const o2 = putOnBattlefield(s0, opp, bear);
    putOnBattlefield(s0, opp, knight);
    const p = putOnBattlefield(s0, opp, pacifism);
    enchant(s0, p, mine);
    // Only the Aura is targeted.
    expect(abilitiesOf(s0, s0.objects[c]!).activated[0]!.body.targets).toHaveLength(1);
    let s = run(s0, planActivate(s0, ap, c, 0, [target(p)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    // Not the creature it's on, and not the White Knight (protection from white).
    expect([...s.pending.options].sort()).toEqual([o1, o2].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: o1 }));
    expect(s.objects[p]!.attachedTo).toBe(o1);
  });

  it("a bot moves an opponent's Pacifism off its creature onto an opponent's", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, crown);
    const mine = putOnBattlefield(s0, ap, bear);
    putOnBattlefield(s0, ap, ogre);
    putOnBattlefield(s0, opp, ogre);
    putOnBattlefield(s0, opp, bear);
    const p = putOnBattlefield(s0, opp, pacifism);
    enchant(s0, p, mine);
    let s = settle(run(s0, planActivate(s0, ap, c, 0, [target(p)])));
    s = settle(act(s, botActions(s, ap)[0]!));
    expect(s.objects[p]!.attachedTo).not.toBe(mine);
    expect(s.objects[s.objects[p]!.attachedTo!]!.controller).toBe(opp);
  });

  it("Aura Finesse moves an Aura you control to the target creature, but not onto one with protection from it", () => {
    const { s: s0, ap, opp, ids } = setup([finesse, finesse]);
    const mine = putOnBattlefield(s0, ap, bear);
    const o = putOnBattlefield(s0, opp, ogre);
    const k = putOnBattlefield(s0, opp, knight);
    const p = putOnBattlefield(s0, ap, pacifism);
    enchant(s0, p, mine);
    // Aura Finesse is blue, so it can target the White Knight; the white Aura still can't go onto it.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(p), target(k)])));
    expect(s.objects[p]!.attachedTo).toBe(mine);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(p), target(o)])));
    expect(s.objects[p]!.attachedTo).toBe(o);
  });
});

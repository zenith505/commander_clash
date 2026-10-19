// Milling as a cost (CR 701.17b): the top cards of your library into your graveyard, not payable with fewer there. An
// ability that adds mana with it isn't a mana ability, since its cost moves a card from a library (CR 605.1a; Millikin
// rulings): it uses the stack and can be responded to.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planActivate, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const assistant = card("Deranged Assistant", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "1", oracleText: "{T}, Mill a card: Add {C}. (Activate only as an instant. To mill a card, put the top card of your library into your graveyard.)" });
const millikin = card("Millikin", "Artifact Creature — Construct", "{2}", { power: "0", toughness: "1", oracleText: "{T}, Mill a card: Add {C}. (Activate only as an instant. To mill a card, put the top card of your library into your graveyard.)" });
const skeleton = card("Rot Farm Skeleton", "Creature — Plant Skeleton", "{2}{B}{G}", { power: "4", toughness: "1", oracleText: "This creature can't block.\n{2}{B}{G}, Mill four cards: Return this card from your graveyard to the battlefield. Activate only as a sorcery." });
const concoction = card("Sinister Concoction", "Enchantment", "{B}", { oracleText: "{B}, Pay 1 life, Mill a card, Discard a card, Sacrifice this enchantment: Destroy target creature." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("mill as a cost", () => {
  it("compiles", () => {
    for (const d of [assistant, millikin, skeleton, concoction]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Deranged Assistant: mills a card as it's activated, and its {C} comes when it resolves from the stack", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, assistant);
    const top = s0.players[ap]!.library[0]!;
    const before = s0.players[ap]!.library.length;
    let s = run(s0, planActivate(s0, ap, a, 0));
    // Paid: tapped, the top card milled; the ability waits on the stack (CR 605.1a).
    expect(s.objects[a]!.tapped).toBe(true);
    expect(s.objects[top]!.zone).toBe("graveyard");
    expect(s.players[ap]!.library).toHaveLength(before - 1);
    expect(s.stack).toHaveLength(1);
    expect(s.players[ap]!.manaPool.C).toBe(0);
    s = settle(s);
    expect(s.players[ap]!.manaPool.C).toBe(1);
  });

  it("can't be activated with an empty library (CR 701.17b)", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, millikin);
    s.players[ap]!.library = [];
    expect(planActivate(s, ap, m, 0)).toBeNull();
  });

  it("Rot Farm Skeleton returns from the graveyard for {2}{B}{G} and four milled cards, not with three in the library", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, skeleton);
    s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    s0.objects[id]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(id);
    const lib = s0.players[ap]!.library.length;
    const s = settle(run(s0, planActivate(s0, ap, id, 0)));
    expect(s.objects[id]!.zone).toBe("battlefield");
    expect(s.players[ap]!.library).toHaveLength(lib - 4);
    expect(s.players[ap]!.graveyard).toHaveLength(4);
    s0.players[ap]!.library = s0.players[ap]!.library.slice(0, 3);
    expect(planActivate(s0, ap, id, 0)).toBeNull();
  });

  it("Sinister Concoction: life, a milled card, a discard and the enchantment itself pay to destroy a creature", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    const c = putOnBattlefield(s0, ap, concoction);
    const victim = putOnBattlefield(s0, opp, bear());
    const top = s0.players[ap]!.library[0]!;
    const s = settle(run(s0, planActivate(s0, ap, c, 0, [target(victim)], undefined, undefined, undefined, { discard: [ids[0]!] })));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.objects[c]!.zone).toBe("graveyard");
    expect(s.objects[top]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(39);
  });
});

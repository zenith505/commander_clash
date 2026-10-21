// Round 100: Mount Doom ("Sacrifice ~ and a legendary artifact" as a cost, CR 602.2b; "Choose up to two creatures, then
// destroy the rest": chosen, not targeted, rulings) and Magda, Brazen Outlaw ("an artifact or Dragon card").

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, isFullySupported, planActivate, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const doom = card("Mount Doom", "Legendary Land", "", { oracleText: "{T}, Pay 1 life: Add {B} or {R}.\n{1}{B}{R}, {T}: Mount Doom deals 1 damage to each opponent.\n{5}{B}{R}, {T}, Sacrifice Mount Doom and a legendary artifact: Choose up to two creatures, then destroy the rest. Activate only as a sorcery." });
const ring = card("The One Ring", "Legendary Artifact", "{4}", { oracleText: "" });
const magda = card("Magda, Brazen Outlaw", "Legendary Creature — Dwarf Berserker", "{1}{R}", { power: "2", toughness: "1", oracleText: "Other Dwarves you control get +1/+0.\nWhenever a Dwarf you control becomes tapped, create a Treasure token.\nSacrifice five Treasures: Search your library for an artifact or Dragon card, put that card onto the battlefield, then shuffle." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 100: Mount Doom, Magda", () => {
  it("parse", () => {
    for (const d of [doom, magda]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Mount Doom: needs a legendary artifact to sacrifice; keeps up to two creatures, destroys the rest", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, doom);
    expect(abilityProblem(s0, ap, d, 1)).toMatch(/legendary artifact/);
    const r = putOnBattlefield(s0, ap, ring);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, opp, bear());
    const plan = planActivate(s0, ap, d, 1, [], undefined, undefined, undefined, { sacrifice: [r] });
    if (!plan) throw new Error("can't activate");
    let s = settle(plan.reduce((x, a) => act(x, a), s0));
    expect([s.objects[d]!.zone, s.objects[r]!.zone]).toEqual(["graveyard", "graveyard"]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "keep", destroy: true, count: 2, min: 0 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [mine, theirs] }));
    expect([s.objects[mine]!.zone, s.objects[theirs]!.zone, s.objects[other]!.zone]).toEqual(["battlefield", "battlefield", "graveyard"]);
  });
});

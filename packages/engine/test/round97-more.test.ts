// Round 97, more cards: Bloodghast (haste while an opponent has 10 or less life) and Omniscience (cast spells from your
// hand without paying their mana costs, CR 118.9: an alternative cost, so X is 0 and additional costs still apply).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const bloodghast = card("Bloodghast", "Creature — Vampire Spirit", "{B}{B}", { power: "2", toughness: "1", oracleText: "This creature can't block.\nThis creature has haste as long as an opponent has 10 or less life.\nLandfall — Whenever a land you control enters, you may return this card from your graveyard to the battlefield." });
const omniscience = card("Omniscience", "Enchantment", "{7}{U}{U}{U}", { oracleText: "You may cast spells from your hand without paying their mana costs." });
const giant = card("Big Giant", "Creature — Giant", "{6}{R}{R}", { power: "8", toughness: "8" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 97, more cards", () => {
  it("parse", () => {
    supported(bloodghast, omniscience);
    expect(compileCard(omniscience).castFromHandFree).toBe(true);
  });

  it("Bloodghast has haste only while an opponent has 10 or less life", () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, bloodghast, { sick: true });
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(false);
    const opp = s.turnOrder.find((p) => p !== ap)!;
    s.players[opp]!.life = 10;
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(true);
  });

  it("Omniscience: a spell from your hand costs nothing; without it the giant can't be cast", () => {
    const { s: s0, ap, ids } = setup([giant]);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "omniscience" })).toBeNull();
    putOnBattlefield(s0, ap, omniscience);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "omniscience" }));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // No land was tapped.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(0);
  });
});

// Round 103: Koma, Cosmos Serpent (a token named Koma's Coil: a token's name isn't the card's; "its activated abilities
// can't be activated this turn", mana abilities too: rulings, CR 605.1a).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, compileCard, isFullySupported, planActivate, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const koma = card("Koma, Cosmos Serpent", "Legendary Creature — Serpent", "{3}{G}{G}{U}{U}", { power: "7", toughness: "7", oracleText: "This spell can't be countered.\nAt the beginning of each upkeep, create a 3/3 blue Serpent creature token named Koma's Coil.\nSacrifice another Serpent: Choose one —\n• Tap target permanent. Its activated abilities can't be activated this turn.\n• Koma gains indestructible until end of turn." });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });

const run = (s: GameState, plan: ReturnType<typeof planActivate>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 103: Koma, Cosmos Serpent", () => {
  it("parse", () => {
    expect(isFullySupported(koma)).toBe(true);
    expect(JSON.stringify(compileCard(koma).triggers[0]!.body)).toContain(`"name":"Koma's Coil"`);
  });

  it("a Coil each upkeep; sacrificing one taps a permanent and stops its abilities, mana abilities too", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, koma);
    const e = putOnBattlefield(s0, opp, elf);
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    const coil = s.battlefield.find((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]?.name === "Koma's Coil");
    expect(coil).toBeDefined();
    expect(s.objects[coil!]!.controller).toBe(ap);
    s = act(s, { type: "passPriority", player: opp });
    expect(waitingOn(s)).toBe(ap);
    s = settle(run(s, planActivate(s, ap, k, 0, [target(e)], [0], undefined, undefined, { sacrifice: [coil!] })));
    expect(s.objects[coil!]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.objects[e]!.tapped).toBe(true);
    s.objects[e]!.tapped = false;
    expect(abilityProblem(s, opp, e, 0)).toBeTruthy();
  });
});

// "Creatures without flying can't block this turn" (Falter, Magmatic Chasm): it doesn't change characteristics, so it
// isn't locked to the creatures on the battlefield as it resolves (CR 611.2c): creatures without flying that arrive
// later can't block either, and a creature that gains flying can (Magmatic Chasm rulings).

import { describe, expect, it } from "vitest";
import { addEffect, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockProblem, isFullySupported } from "../src";

// Real oracle text (Scryfall).
const falter = card("Falter", "Instant", "{1}{R}", { oracleText: "Creatures without flying can't block this turn." });
const bird = card("Storm Crow", "Creature — Bird", "{1}{U}", { power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

describe("a can't-block rule for the turn", () => {
  it("covers creatures without flying, also ones that enter later, and ends with the turn", () => {
    expect(isFullySupported(falter)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([falter]);
    const attacker = putOnBattlefield(s0, ap, bear({ name: "Attacker" }));
    const ground = putOnBattlefield(s0, opp, bear());
    const flyer = putOnBattlefield(s0, opp, bird);
    let s = cast(s0, ap, ids[0]!);
    s.objects[attacker]!.attacking = opp;
    const a = s.objects[attacker]!;
    expect(blockProblem(s, s.objects[ground]!, a)).toMatch(/can't block/);
    expect(blockProblem(s, s.objects[flyer]!, a)).toBeNull();
    const late = putOnBattlefield(s, opp, bear({ name: "Late Bear" }));
    expect(blockProblem(s, s.objects[late]!, a)).toMatch(/can't block/);
    addEffect(s, opp, [late], [{ kind: "addKeywords", keywords: ["Flying"] }]);
    expect(blockProblem(s, s.objects[late]!, a)).toBeNull();
    s.objects[attacker]!.attacking = undefined;
    s = passUntil(s, "upkeep", opp);
    expect(s.cantBlockThisTurn).toBeUndefined();
  });
});

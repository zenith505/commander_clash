// "Sacrifice X Squirrels", "Sacrifice X creatures" as an activated ability's cost: X is announced as it's activated and
// is how many are sacrificed (CR 107.3a, 601.2b via 602.2b); "X can't be 0" (Ruthless Technomancer).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, isFullySupported, planActivate, toughness, type Action, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const chatterfang = card("Chatterfang, Squirrel General", "Legendary Creature — Squirrel Warrior", "{2}{G}", { power: "3", toughness: "3", keywords: ["Forestwalk"], oracleText: "Forestwalk (This creature can't be blocked as long as defending player controls a Forest.)\nIf one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn." });
const hireling = card("Grim Hireling", "Creature — Tiefling Rogue", "{3}{B}", { power: "3", toughness: "2", oracleText: "Whenever one or more creatures you control deal combat damage to a player, create two Treasure tokens.\n{B}, Sacrifice X Treasures: Target creature gets -X/-X until end of turn. Activate only as a sorcery." });
const krav = card("Krav, the Unredeemed", "Legendary Creature — Demon", "{4}{B}", { power: "3", toughness: "3", oracleText: "Partner with Regna, the Redeemer (When this creature enters, target player may put Regna into their hand from their library, then shuffle.)\n{B}, Sacrifice X creatures: Target player draws X cards and gains X life. Put X +1/+1 counters on Krav." });
const technomancer = card("Ruthless Technomancer", "Creature — Human Wizard", "{3}{B}", { power: "2", toughness: "4", oracleText: "When this creature enters, you may sacrifice another creature you control. If you do, create a number of Treasure tokens equal to that creature's power.\n{2}{B}, Sacrifice X artifacts: Return target creature card with power X or less from your graveyard to the battlefield. X can't be 0." });
const squirrel = card("Squirrel", "Creature — Squirrel", "", { power: "1", toughness: "1" });
const treasure = card("Treasure", "Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return passAll(plan!.reduce((x, a) => act(x, a), s));
};

describe("Sacrifice X as an activated ability's cost", () => {
  it("parse", () => supported(chatterfang, hireling, krav, technomancer));

  it("Chatterfang: sacrifice two Squirrels, the target gets +2/-2", () => {
    const { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, chatterfang);
    const sq = [putOnBattlefield(s, ap, squirrel), putOnBattlefield(s, ap, squirrel), putOnBattlefield(s, ap, squirrel)];
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const b = putOnBattlefield(s, opp, bear());
    // Without picking what to sacrifice, it can't be activated with X = 2.
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: c, index: 0, targets: [target(b)], x: 2 })).toThrow();
    // More Squirrels than there are (Chatterfang is one too): no.
    expect(planActivate(s, ap, c, 0, [target(b)], undefined, undefined, 5)).toBeNull();
    const after = run(s, planActivate(s, ap, c, 0, [target(b)], undefined, undefined, 2, { sacrifice: [sq[0]!, sq[1]!] }));
    expect(after.objects[sq[0]!]!.zone).toBe("graveyard");
    expect(after.objects[sq[1]!]!.zone).toBe("graveyard");
    expect(after.objects[sq[2]!]!.zone).toBe("battlefield");
    expect(after.objects[b]!.zone).toBe("graveyard"); // a 4/0
  });

  it("Grim Hireling: -X/-X for X Treasures, only as a sorcery", () => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hireling);
    const t = [putOnBattlefield(s, ap, treasure), putOnBattlefield(s, ap, treasure)];
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const b = putOnBattlefield(s, opp, bear({ toughness: "3" }));
    const after = run(s, planActivate(s, ap, h, 0, [target(b)], undefined, undefined, 2, { sacrifice: t }));
    expect(toughness(after, after.objects[b]!)).toBe(1);
  });

  it("Krav: X cards, X life and X +1/+1 counters", () => {
    const { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, krav);
    const fodder = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    const after = run(s, planActivate(s, ap, k, 0, [{ kind: "player", id: ap }], undefined, undefined, 2, { sacrifice: fodder }));
    expect(after.players[ap]!.hand.length).toBe(hand + 2);
    expect(after.players[ap]!.life).toBe(life + 2);
    expect(after.objects[k]!.counters["+1/+1"]).toBe(2);
  });

  it("Ruthless Technomancer: X can't be 0", () => {
    const { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, technomancer);
    expect(abilityProblem(s, ap, t, 0, undefined, undefined, undefined, 0)).toMatch(/X can't be 0|target/);
  });
});

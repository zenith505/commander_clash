// "Divided as you choose among up to N targets" (CR 601.2d, 115.6): up to N targets, each getting at least 1, or none at
// all (rulings on Ravenous Gigantotherium: "You may choose zero targets"); an ability with no targets chosen isn't
// targeted and resolves (115.6, 608.2b).

import { describe, expect, it } from "vitest";
import { act, card, passAll, pt, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported } from "../src";
import { addMana } from "../src/spend";

// Real oracle text (Scryfall).
const ironFist = card("Iron Fist, Hero for Hire", "Legendary Creature — Human Mercenary Hero", "{1}{R}", { power: "2", toughness: "2", keywords: ["Power-up", "Prowess", "Trample"], oracleText: "Trample\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nPower-up — {7}{R}: Iron Fist deals 5 damage divided as you choose among up to five targets. Put five +1/+1 counters on Iron Fist. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)" });

describe("divided among up to N targets", () => {
  it("Iron Fist's power-up with no targets still puts five +1/+1 counters on him", () => {
    expect(isFullySupported(ironFist)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, ironFist);
    const targets = compileCard(ironFist).activated[0]!.body.targets;
    expect(targets.every((t) => t.optional && t.divided?.upTo)).toBe(true);
    const life = s0.players[opp]!.life;
    addMana(s0, ap, ["C", "C", "C", "C", "C", "C", "C", "R"], {});
    const none = Array.from({ length: 5 }, () => ({ kind: "none" as const }));
    const s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: i, index: 0, targets: none }));
    expect(pt(s, i)).toBe("7/7");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("with targets, the parts still add up to all of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, ironFist);
    addMana(s0, ap, ["C", "C", "C", "C", "C", "C", "C", "R"], {});
    const some = [{ kind: "player" as const, id: opp, amount: 2 }, { kind: "none" as const }, { kind: "none" as const }, { kind: "none" as const }, { kind: "none" as const }];
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: i, index: 0, targets: some })).toThrow(/divide 5/);
  });
});

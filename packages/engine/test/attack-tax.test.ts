// Ghostly Prison and Propaganda: "Creatures can't attack you unless their controller pays {2} for each creature they
// control that's attacking you." Costs to attack are totalled and paid as attackers are declared (CR 508.1g-i), and
// nothing obliges a player to pay one to obey a requirement (CR 508.1d).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { attackTax, botActions, isFullySupported, parseManaCost, planMana, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const prison = card("Ghostly Prison", "Enchantment", "{2}{W}", {
  oracleText: "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.",
});
const windborn = card("Windborn Muse", "Creature — Spirit", "{3}{W}", {
  power: "2",
  toughness: "3",
  keywords: ["Flying"],
  oracleText: "Flying\nCreatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.",
});
const berserker = card("Berserker", "Creature — Human Berserker", "{R}", { power: "2", toughness: "2", oracleText: "This creature attacks each combat if able." });

const declare = (s: GameState, actions: Action[]) => actions.reduce((x, a) => act(x, a), s);

describe("attack taxes", () => {
  it("compile", () => {
    for (const d of [prison, windborn]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("{2} for each creature attacking its controller; others are free; two of them add up", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, opp, prison);
    putOnBattlefield(s0, opp, windborn);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const b3 = putOnBattlefield(s0, ap, bear({ name: "Third Bear" }));
    const s = passUntil(s0, "declareAttackers", ap);
    const attacks = [
      { attacker: b1, defender: opp },
      { attacker: b2, defender: opp },
      { attacker: b3, defender: third },
    ];
    expect(attackTax(s, attacks)).toBe(8);
    // Without the mana, the declaration is illegal.
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks })).toThrow(/costs \{8\}/);
    // Mana abilities first, then the declaration pays it.
    const after = declare(s, [...planMana(s, ap, parseManaCost("{8}"))!, { type: "declareAttackers", player: ap, attacks }]);
    expect(after.objects[b1]!.attacking).toBe(opp);
    expect(after.objects[b3]!.attacking).toBe(third);
    expect(Object.values(after.players[ap]!.manaPool).reduce((n, x) => n + x, 0)).toBe(0);
    expect(after.battlefield.filter((id) => after.objects[id]!.controller === ap && after.objects[id]!.tapped).length).toBe(3 + 8);
  });

  it("a creature that attacks each combat if able needn't pay to attack", () => {
    const { s: s0, ap } = setup([]);
    for (const p of s0.turnOrder.filter((x) => x !== ap)) putOnBattlefield(s0, p, prison);
    putOnBattlefield(s0, ap, berserker);
    const s = passUntil(s0, "declareAttackers", ap);
    expect(act(s, { type: "declareAttackers", player: ap, attacks: [] }).step).not.toBe("declareAttackers");
  });

  it("the bot pays what it can and keeps the rest out of the taxed player's way", () => {
    const { s: s0, ap } = setup([]);
    const opps = s0.turnOrder.filter((x) => x !== ap);
    for (const p of opps) putOnBattlefield(s0, p, prison);
    const ids = Array.from({ length: 10 }, (_, i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    for (const p of opps) for (let i = 0; i < 2; i++) putOnBattlefield(s0, p, card("Wall", "Creature — Wall", "{1}", { power: "0", toughness: "1" }));
    const s = passUntil(s0, "declareAttackers", ap);
    const plan = botActions(s, ap);
    const decl = plan[plan.length - 1] as Extract<Action, { type: "declareAttackers" }>;
    expect(decl.type).toBe("declareAttackers");
    // 14 lands: at most seven creatures can attack.
    expect(decl.attacks.length).toBeLessThanOrEqual(7);
    expect(decl.attacks.length).toBeGreaterThan(0);
    const after = declare(s, plan);
    expect(ids.filter((id) => after.objects[id]!.attacking !== undefined).length).toBe(decl.attacks.length);
  });
});

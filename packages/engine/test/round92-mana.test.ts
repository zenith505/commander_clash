// Round 92 mana sources: Incubation Druid ("add three mana of that type instead" while it has a +1/+1 counter, CR 605.3),
// Lion's Eye Diamond ("Discard your hand" as a cost, CR 701.9a; "Activate only as an instant", rulings), and Castle
// Garenbrig ("Add six {G}" with a spending restriction, CR 106.6).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, moveObject, planActivate, planCast, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const druid = card("Incubation Druid", "Creature — Elf Druid", "{1}{G}", { power: "0", toughness: "2", oracleText: "{T}: Add one mana of any type that a land you control could produce. If this creature has a +1/+1 counter on it, add three mana of that type instead.\n{3}{G}{G}: Adapt 3. (If this creature has no +1/+1 counters on it, put three +1/+1 counters on it.)" });
const led = card("Lion's Eye Diamond", "Artifact", "{0}", { oracleText: "Discard your hand, Sacrifice this artifact: Add three mana of any one color. Activate only as an instant." });
const castle = card("Castle Garenbrig", "Land", "", { oracleText: "This land enters tapped unless you control a Forest.\n{T}: Add {G}.\n{2}{G}{G}, {T}: Add six {G}. Spend this mana only to cast creature spells or activate abilities of creatures." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const growth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};

describe("round 92 mana sources", () => {
  it("parse", () => {
    for (const d of [druid, led, castle]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Incubation Druid: one mana a land could produce, three once it has a +1/+1 counter", () => {
    const { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, druid);
    const s1 = act(s, { type: "activateMana", player: ap, objectId: d, mana: "U" });
    expect(s1.players[ap]!.manaPool.U).toBe(1);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: d, mana: "C" })).toThrow(); // no land makes {C}
    s.objects[d]!.counters["+1/+1"] = 3;
    const s2 = act(s, { type: "activateMana", player: ap, objectId: d, mana: "B" });
    expect(s2.players[ap]!.manaPool.B).toBe(3);
  });

  it("Lion's Eye Diamond: discard your hand and sacrifice it for three mana of one color", () => {
    const { s, ap, ids } = setup([bear(), shock]);
    const l = putOnBattlefield(s, ap, led);
    const s1 = act(s, { type: "activateMana", player: ap, objectId: l, mana: "R" });
    expect(s1.players[ap]!.manaPool.R).toBe(3);
    expect(s1.players[ap]!.hand).toHaveLength(0);
    for (const id of ids) expect(s1.objects[id]!.zone).toBe("graveyard");
    expect(s1.objects[l]!.zone).toBe("graveyard");
  });

  it("Lion's Eye Diamond: automatic payment never uses it", () => {
    const { s, ap, ids } = setup([shock]);
    const l = putOnBattlefield(s, ap, led);
    const after = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(after.objects[l]!.zone).toBe("battlefield");
  });

  it("Lion's Eye Diamond: not while a choice is pending (only when you could cast an instant)", () => {
    const { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, led);
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s.priority = opp;
    expect(() => act(s, { type: "activateMana", player: ap, objectId: l, mana: "R" })).toThrow();
  });

  it("Castle Garenbrig: six {G} that can cast a creature spell but not an instant", () => {
    const { s, ap, ids } = setup([bear(), growth]);
    const c = putOnBattlefield(s, ap, castle);
    const b = putOnBattlefield(s, ap, bear());
    const s1 = run(s, planActivate(s, ap, c, 0));
    expect(s1.players[ap]!.manaPool.G).toBe(6);
    expect(s1.stack).toHaveLength(0); // a mana ability: no stack (CR 605.3a)
    // Nothing else to pay with: the lands go away.
    for (const id of [...s1.battlefield]) if (s1.objects[id]!.controller === ap && id !== c && id !== b) moveObject(s1, id, "graveyard");
    expect(planCast(s1, ap, ids[1]!, [{ kind: "object", id: b }])).toBeNull();
    s1.players[ap]!.manaPool.G = 7; // with one plain {G} it can be cast
    expect(planCast(s1, ap, ids[1]!, [{ kind: "object", id: b }])).not.toBeNull();
    s1.players[ap]!.manaPool.G = 6;
    const s2 = run(s1, planCast(s1, ap, ids[0]!));
    expect(s2.stack).toHaveLength(1);
    expect(s2.players[ap]!.manaPool.G).toBe(4);
  });
});

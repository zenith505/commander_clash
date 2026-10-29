// Flavor words (CR 207.2d): an italic word before an ability that isn't an ability word (207.2c) or a keyword (702) has
// no rules meaning. "Blow Up — {T}, Sacrifice this creature: ..." is the activated ability "{T}, Sacrifice this
// creature: ..."; "Boast — ..." is a keyword (CR 702.142), not stripped: it keeps its restrictions.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported } from "../src";

// Real oracle text (Scryfall).
const bomb = card("Blazing Bomb", "Creature — Elemental", "{R}", { power: "1", toughness: "1", oracleText: "Whenever you cast a noncreature spell, if at least four mana was spent to cast it, put a +1/+1 counter on this creature.\nBlow Up — {T}, Sacrifice this creature: It deals damage equal to its power to target creature. Activate only as a sorcery." });
const rope = card("Fifty Feet of Rope", "Artifact", "{2}", { oracleText: "Climb Over — {T}: Target Wall can't block this turn.\nTie Up — {3}, {T}: Target creature doesn't untap during its controller's next untap step.\nRappel Down — {4}, {T}: Venture into the dungeon. Activate only as a sorcery. (Enter the first room or advance to the next room.)" });
const braggart = card("Axgard Braggart", "Creature — Dwarf Warrior", "{3}{W}", { power: "3", toughness: "3", keywords: ["Boast"], oracleText: "Boast — {1}{W}: Untap this creature. Put a +1/+1 counter on it. (Activate only if this creature attacked this turn and only once each turn.)" });

describe("flavor words", () => {
  it("parse as the ability after them", () => {
    [bomb, rope].forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
    expect(compileCard(rope).activated.map((a) => a.manaCost)).toEqual(["", "{3}", "{4}"]);
    // A keyword before an ability isn't a flavor word: boast's restrictions aren't dropped (CR 702.142a).
    expect(compileCard(braggart).activated[0]).toMatchObject({ keyword: "Boast", oncePerTurn: true, activateIf: { kind: "self", is: "attackedThisTurn" } });
  });

  it("Blazing Bomb blows up: damage equal to its power, as a sorcery", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bomb);
    s0.objects[b]!.counters = { "+1/+1": 2 };
    const victim = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    putOnBattlefield(s0, opp, bear());
    const s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: b, index: 0, targets: [target(victim)] }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });
});

// "If a creature dealt damage by ~ this turn would die, exile it instead" (Kumano): a replacement effect (CR 614.1a)
// that works while Kumano is on the battlefield, or leaving it at the same time (rulings).

import { describe, expect, it } from "vitest";
import { activate, addEffect, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, moveObject } from "../src";

// Real oracle text (Scryfall).
const kumano = card("Kumano, Master Yamabushi", "Legendary Creature — Human Shaman", "{3}{R}{R}", {
  power: "4",
  toughness: "4",
  oracleText: "{1}{R}: Kumano deals 1 damage to any target.\nIf a creature dealt damage by Kumano this turn would die, exile it instead.",
});
const blessing = card("Kumano's Blessing", "Enchantment — Aura", "{2}{R}", { keywords: ["Enchant", "Flash"], oracleText: "Flash\nEnchant creature\nIf a creature dealt damage by enchanted creature this turn would die, exile it instead." });
const pinger = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });

describe("exiling a creature it dealt damage to (Kumano)", () => {
  it("compiles", () => {
    for (const d of [kumano, blessing]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("a creature Kumano dealt damage to this turn is exiled instead of dying", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kumano);
    const b = putOnBattlefield(s0, opp, bear({ toughness: "1" }));
    const s = activate(s0, ap, k, 0, [target(b)]);
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("not once Kumano has left the battlefield before it dies", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kumano);
    const b = putOnBattlefield(s0, opp, bear());
    let s = activate(s0, ap, k, 0, [target(b)]);
    expect(s.objects[b]!.zone).toBe("battlefield");
    moveObject(s, k, "graveyard");
    addEffect(s, ap, [b], [{ kind: "modifyPT", power: 0, toughness: -1 }]);
    s = activate(s, ap, putOnBattlefield(s, ap, pinger), 0, [target(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Kumano's Blessing: what the enchanted creature dealt damage to", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, pinger);
    const a = putOnBattlefield(s0, ap, blessing);
    s0.objects[a]!.attachedTo = p;
    const b = putOnBattlefield(s0, opp, bear({ toughness: "1" }));
    const s = activate(s0, ap, p, 0, [target(b)]);
    expect(s.objects[b]!.zone).toBe("exile");
  });
});

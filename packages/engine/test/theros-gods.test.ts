// Theros gods: "As long as your devotion to black is less than five, Erebos isn't a creature" (CR 700.5): a type-changing
// effect (layer 4) on itself. Not a creature, it loses the creature type God and stays a legendary enchantment; it works
// even after the God loses all abilities (layer 4 comes before layer 6); an attacking God that stops being a creature is
// removed from combat (CR 506.4). All from the rulings.

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, objIsType, waitingOn, type GameState } from "../src";

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const erebos = card("Erebos, God of the Dead", "Legendary Enchantment Creature — God", "{3}{B}", { power: "5", toughness: "7", keywords: ["Indestructible"], oracleText: "Indestructible\nAs long as your devotion to black is less than five, Erebos isn't a creature. (Each {B} in the mana costs of permanents you control counts toward your devotion to black.)\nYour opponents can't gain life.\n{1}{B}, Pay 2 life: Draw a card." });
const xenagos = card("Xenagos, God of Revels", "Legendary Enchantment Creature — God", "{3}{R}{G}", { power: "6", toughness: "5", keywords: ["Indestructible"], oracleText: "Indestructible\nAs long as your devotion to red and green is less than seven, Xenagos isn't a creature.\nAt the beginning of combat on your turn, another target creature you control gains haste and gets +X/+X until end of turn, where X is that creature's power." });
const knight = (name: string, cost = "{B}{B}") => card(name, "Creature — Human Knight", cost, { power: "2", toughness: "2" });

describe("Theros gods", () => {
  it("compile", () => [erebos, xenagos].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("a creature only with enough devotion, counting the God itself; otherwise a legendary enchantment that isn't a God", () => {
    const { s, ap, opp } = setup([]);
    const e = putOnBattlefield(s, ap, erebos);
    const c = characteristics(s, s.objects[e]!);
    expect(c.types).toEqual(["Enchantment"]);
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).not.toContain("God");
    // Devotion 1 + 2 + 2 = 5.
    putOnBattlefield(s, ap, knight("Knight A"));
    expect(objIsType(s, s.objects[e]!, "Creature")).toBe(false);
    const b = putOnBattlefield(s, ap, knight("Knight B"));
    expect(objIsType(s, s.objects[e]!, "Creature")).toBe(true);
    expect(characteristics(s, s.objects[e]!).subtypes).toContain("God");
    // An opponent's black permanents don't count: one that changes control stops counting (layer 2 first).
    addEffect(s, opp, [b], [{ kind: "control" }], "game");
    expect(objIsType(s, s.objects[e]!, "Creature")).toBe(false);
  });

  it("two colors: hybrid and each symbol of either color count (Xenagos)", () => {
    const { s, ap } = setup([]);
    const x = putOnBattlefield(s, ap, xenagos);
    putOnBattlefield(s, ap, knight("Red Knight", "{R}{R}"));
    expect(objIsType(s, s.objects[x]!, "Creature")).toBe(false);
    putOnBattlefield(s, ap, knight("Hybrid Knight", "{R/G}{R/G}"));
    expect(objIsType(s, s.objects[x]!, "Creature")).toBe(false); // 2 + 2 + 2 = 6
    putOnBattlefield(s, ap, knight("Green Knight", "{G}"));
    expect(objIsType(s, s.objects[x]!, "Creature")).toBe(true);
  });

  it("still not a creature after it loses all abilities (layer 4 before layer 6)", () => {
    const { s, ap } = setup([]);
    const e = putOnBattlefield(s, ap, erebos);
    addEffect(s, ap, [e], [{ kind: "loseAllAbilities" }], "game");
    expect(objIsType(s, s.objects[e]!, "Creature")).toBe(false);
  });

  it("an attacking God that stops being a creature is removed from combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, erebos);
    const a = putOnBattlefield(s0, ap, knight("Knight A"));
    putOnBattlefield(s0, ap, knight("Knight B"));
    expect(objIsType(s0, s0.objects[e]!, "Creature")).toBe(true);
    let s = settle(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: e, defender: opp }] }));
    expect(s.objects[e]!.attacking).toBe(opp);
    // A Knight leaves: devotion 3.
    s.battlefield.splice(s.battlefield.indexOf(a), 1);
    s.objects[a]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(a);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[e]!.attacking).toBeUndefined();
  });
});

// "Transform ~ at the beginning of the next upkeep" (Archangel Avacyn): a delayed trigger (CR 603.7). It transforms the
// permanent only if it hasn't transformed since that delayed trigger was made (CR 701.27f), so two non-Angels dying at
// once transform Avacyn once, and Avacyn, the Purifier deals its damage once (rulings).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { characteristics, isFullySupported, waitingOn, type GameState } from "../src";
import { moveObject } from "../src/game";

// Real oracle text (Scryfall).
const avacyn = scry(
  "transform",
  [
    { name: "Archangel Avacyn", mana_cost: "{3}{W}{W}", type_line: "Legendary Creature — Angel", oracle_text: "Flash\nFlying, vigilance\nWhen Archangel Avacyn enters, creatures you control gain indestructible until end of turn.\nWhen a non-Angel creature you control dies, transform Archangel Avacyn at the beginning of the next upkeep.", power: "4", toughness: "4" },
    { name: "Avacyn, the Purifier", type_line: "Legendary Creature — Angel", oracle_text: "Flying\nWhen this creature transforms into Avacyn, the Purifier, it deals 3 damage to each other creature and each opponent.", power: "6", toughness: "5" },
  ],
  { keywords: ["Flying", "Vigilance", "Transform", "Flash"] },
);
const bear = card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const giant = card("Giant", "Creature — Giant", "{4}{G}", { power: "5", toughness: "5" });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

describe("delayed transform (CR 603.7, 701.27f)", () => {
  it("compiles", () => expect(isFullySupported(avacyn)).toBe(true));

  it("two non-Angels die at once: Avacyn transforms once at the next upkeep, and her damage happens once", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, avacyn);
    const b1 = putOnBattlefield(s0, ap, bear);
    const b2 = putOnBattlefield(s0, ap, bear);
    const g = putOnBattlefield(s0, opp, giant);
    moveObject(s0, b1, "graveyard");
    moveObject(s0, b2, "graveyard");
    let s = settle(s0);
    expect(s.delayed?.length).toBe(2);
    expect(name(s, a)).toBe("Archangel Avacyn");
    const life = s.players[opp]!.life;
    s = settle(passUntil(s, "upkeep", opp));
    expect(name(s, a)).toBe("Avacyn, the Purifier");
    expect(s.objects[a]!.transforms).toBe(1);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[g]!.damage).toBe(3);
    expect(s.delayed ?? []).toHaveLength(0);
  });

  it("it's a delayed trigger: Avacyn leaving and coming back is a new object, which doesn't transform", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, avacyn);
    const b = putOnBattlefield(s0, ap, bear);
    moveObject(s0, b, "graveyard");
    let s = settle(s0);
    moveObject(s, a, "hand");
    moveObject(s, a, "battlefield");
    s = settle(s);
    s = settle(passUntil(s, "upkeep", opp));
    expect(name(s, a)).toBe("Archangel Avacyn");
  });
});

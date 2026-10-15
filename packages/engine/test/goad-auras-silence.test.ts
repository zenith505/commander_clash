// Aura statics that combine a P/T change with goad (CR 701.15) or losing all abilities (CR 613.1f); "can't block and
// can't be blocked"; and Null Rod's "Activated abilities of artifacts can't be activated" (mana abilities too, CR 605.1a).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, blockProblem, characteristics, isFullySupported, manaAbilityProblem, objHasKeyword, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const impetus = card("Coercive Impetus", "Enchantment — Aura", "{2}{B}", {
  oracleText: "Enchant creature\nEnchanted creature gets +1/+1 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you draw a card and lose 1 life.",
});
const subdual = card("Mystic Subdual", "Enchantment — Aura", "{1}{U}", {
  keywords: ["Flash"],
  oracleText: "Flash\nEnchant creature\nEnchanted creature gets -2/-0 and loses all abilities. (Mutating onto the creature won't give it new abilities. It can gain abilities in other ways.)",
});
const outcast = card("Changeling Outcast", "Creature — Shapeshifter", "{B}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked." });
const nullRod = card("Null Rod", "Artifact", "{2}", { oracleText: "Activated abilities of artifacts can't be activated." });
const matrix = card("Damping Matrix", "Artifact", "{3}", { oracleText: "Activated abilities of artifacts and creatures can't be activated unless they're mana abilities." });
const linvala = card("Linvala, Keeper of Silence", "Legendary Creature — Angel", "{2}{W}{W}", { power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nActivated abilities of creatures your opponents control can't be activated." });
const sign = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const prodigal = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("goad and lose-all-abilities Auras, can't block and can't be blocked", () => {
  it("compile", () => {
    for (const d of [impetus, subdual, outcast, nullRod, matrix, linvala]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Coercive Impetus: +1/+1, and goaded by the Aura's controller", () => {
    const { s: s0, ap, ids, opp } = setup([impetus]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!, [target(theirs)]));
    expect(pt(s, theirs)).toBe("3/3");
    expect(characteristics(s, s.objects[theirs]!).goadedBy).toEqual([ap]);
    const t = passUntil(s, "declareAttackers", opp);
    expect(() => act(t, { type: "declareAttackers", player: opp, attacks: [] })).toThrow(/attacks each combat if able/);
    expect(() => act(t, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] })).toThrow(/goaded/);
  });

  it("Mystic Subdual: -2/-0 and no abilities", () => {
    const { s: s0, ap, ids, opp } = setup([subdual]);
    const flyer = putOnBattlefield(s0, opp, bear({ name: "Flyer", keywords: ["Flying"], oracleText: "Flying", power: "3", toughness: "3" }));
    const s = settle(cast(s0, ap, ids[0]!, [target(flyer)]));
    expect(pt(s, flyer)).toBe("1/3");
    expect(objHasKeyword(s, s.objects[flyer]!, "Flying")).toBe(false);
  });

  it("Changeling Outcast can't block and can't be blocked", () => {
    const { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, opp, outcast);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, opp, bear());
    s.objects[a]!.attacking = opp;
    expect(blockProblem(s, s.objects[o]!, s.objects[a]!)).toMatch(/can't block/);
    s.objects[o]!.attacking = ap;
    expect(blockProblem(s, s.objects[b]!, s.objects[o]!)).toMatch(/can't be blocked/);
  });
});

describe("activated abilities can't be activated (Null Rod)", () => {
  it("Null Rod: no abilities of artifacts, mana abilities included; creatures are fine", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, nullRod);
    const stone = putOnBattlefield(s, ap, sign);
    const e = putOnBattlefield(s, ap, elf);
    expect(manaAbilityProblem(s, ap, s.objects[stone]!, 0)).toMatch(/can't be activated/);
    expect(abilityProblem(s, ap, stone, 0)).toMatch(/can't be activated/);
    expect(manaAbilityProblem(s, ap, s.objects[e]!, 0)).toBeNull();
  });

  it("Damping Matrix: mana abilities still work, other abilities of artifacts and creatures don't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, matrix);
    const stone = putOnBattlefield(s, ap, sign);
    const p = putOnBattlefield(s, ap, prodigal);
    expect(manaAbilityProblem(s, ap, s.objects[stone]!, 0)).toBeNull();
    expect(abilityProblem(s, ap, stone, 0)).toMatch(/can't be activated/);
    expect(abilityProblem(s, ap, p, 0, [{ kind: "player", id: opp }])).toMatch(/can't be activated/);
  });

  it("Linvala: only creatures her controller's opponents control", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, linvala);
    const mine = putOnBattlefield(s, ap, prodigal);
    const theirs = putOnBattlefield(s, opp, prodigal);
    expect(abilityProblem(s, ap, mine, 0, [{ kind: "player", id: opp }])).toBeNull();
    expect(characteristics(s, s.objects[theirs]!).cantActivate).toBe("all");
  });
});

// Round 429: Metamorphic Alteration: "As this Aura enters, choose a creature. Enchanted creature is a copy of the chosen
// creature." (CR 614.12, a static copy effect, 707.2, 611.3a; values locked in as chosen, rulings).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const alteration = (): CardDef => ({"oracleId":"2518a4f2-607f-41bb-9389-2009138d6b09","name":"Metamorphic Alteration","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAs this Aura enters, choose a creature.\nEnchanted creature is a copy of the chosen creature.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/f/eff03d37-d90a-4dcc-bacd-64fd71301354.jpg?1783934585","artUrl":"https://cards.scryfall.io/art_crop/front/e/f/eff03d37-d90a-4dcc-bacd-64fd71301354.jpg?1783934585","commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const options = (s: GameState) => (s.pending?.kind === "chooseOption" ? s.pending.options : []);

/** Metamorphic Alteration cast on `host`, choosing `chosen`. */
const enchant = (s: GameState, ap: number, aura: string, host: string, chosen: string) => {
  s = settle(run(s, planCast(s, ap, aura, [{ kind: "object", id: host }])));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "chosenObject", player: ap });
  expect(options(s)).toContain(chosen);
  return settle(act(s, { type: "chooseOption", player: ap, choice: chosen }));
};

describe("round 429: Metamorphic Alteration compiles", () => {
  it("is fully supported", () => expect(isFullySupported(alteration())).toBe(true));
});

describe("Metamorphic Alteration", () => {
  it("the enchanted creature is a copy of the chosen creature, any player's, with its own counters; back to itself once the Aura leaves", () => {
    const { s: s0, ap, ids, opp } = setup([alteration()]);
    const b = putOnBattlefield(s0, ap, bear());
    const g = putOnBattlefield(s0, opp, giant());
    s0.objects[b]!.counters["+1/+1"] = 1;
    let s = enchant(s0, ap, ids[0]!, b, g);
    expect(nameOf(s, b)).toBe("Hill Giant");
    expect(pt(s, b)).toBe("4/4");
    expect(characteristics(s, s.objects[b]!).colors).toEqual(["R"]);
    // Still ours, and the Aura is still on it (a creature).
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    moveObject(s, ids[0]!, "graveyard");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(nameOf(s, b)).toBe("Grizzly Bears");
    expect(pt(s, b)).toBe("3/3");
  });

  it("the values are locked in as it's chosen: the chosen creature's later changes and leaving don't matter, and non-copy effects on it aren't copied", () => {
    const { s: s0, ap, ids, opp } = setup([alteration()]);
    const b = putOnBattlefield(s0, ap, bear());
    const g = putOnBattlefield(s0, opp, giant());
    addEffect(s0, opp, [g], [{ kind: "modifyPT", power: 2, toughness: 2 }], "game");
    s0.objects[g]!.counters["+1/+1"] = 3;
    let s = enchant(s0, ap, ids[0]!, b, g);
    expect(pt(s, b)).toBe("3/3");
    moveObject(s, g, "graveyard");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(nameOf(s, b)).toBe("Hill Giant");
    expect(pt(s, b)).toBe("3/3");
  });

  it("a token chosen: the enchanted creature copies it but isn't a token", () => {
    const { s: s0, ap, ids } = setup([alteration()]);
    const b = putOnBattlefield(s0, ap, bear());
    const t = putOnBattlefield(s0, ap, card("Test Spirit", "Creature — Spirit", "", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }));
    s0.objects[t]!.isToken = true;
    const s = enchant(s0, ap, ids[0]!, b, t);
    expect(nameOf(s, b)).toBe("Test Spirit");
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Flying");
    expect(s.objects[b]!.isToken).toBeFalsy();
  });

  it("a creature that isn't normally one (an animated land): the enchanted creature becomes a land, the Aura goes to the graveyard, and it's itself again", () => {
    const { s: s0, ap, ids, opp } = setup([alteration()]);
    const b = putOnBattlefield(s0, ap, bear());
    const land = putOnBattlefield(s0, opp, card("Test Village", "Land", "", { oracleText: "{T}: Add {G}." }));
    addEffect(s0, opp, [land], [{ kind: "addTypes", types: ["Creature"], subtypes: [] }, { kind: "setPT", power: 3, toughness: 3 }], "game");
    const s = enchant(s0, ap, ids[0]!, b, land);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(nameOf(s, b)).toBe("Grizzly Bears");
    expect(pt(s, b)).toBe("2/2");
  });

  it("not one entering with it; the enchanted creature itself may be chosen", () => {
    const { s: s0, ap, ids } = setup([alteration()]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = enchant(s0, ap, ids[0]!, b, b);
    expect(nameOf(s, b)).toBe("Grizzly Bears");
    expect(pt(s, b)).toBe("2/2");
  });

  it("a later copy effect on the enchanted creature wins (timestamps), and moving the Aura moves the copy effect", () => {
    const { s: s0, ap, ids, opp } = setup([alteration()]);
    const b = putOnBattlefield(s0, ap, bear());
    const e = putOnBattlefield(s0, ap, elves());
    const g = putOnBattlefield(s0, opp, giant());
    let s = enchant(s0, ap, ids[0]!, b, g);
    expect(nameOf(s, b)).toBe("Hill Giant");
    // The Aura moves to the Elves (a new timestamp, CR 613.7e): the Elves become the Giant, the Bears themselves again.
    s.objects[ids[0]!]!.attachedTo = e;
    s.objects[ids[0]!]!.timestamp = s.nextTimestamp++;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(nameOf(s, b)).toBe("Grizzly Bears");
    expect(nameOf(s, e)).toBe("Hill Giant");
  });

  it("a bot puts it on an opponent's creature and has it copy the least creature", () => {
    const { s: s0, ap, ids, opp } = setup([alteration()]);
    const g = putOnBattlefield(s0, opp, giant());
    const e = putOnBattlefield(s0, ap, elves());
    let s = s0;
    for (let i = 0; i < 300 && !(s.objects[ids[0]!]!.zone === "battlefield" && !s.pending && !s.stack.length); i++) {
      const p = waitingOn(s)!;
      const acts = botActions(s, p);
      if (!acts.length) break;
      for (const a of acts) s = act(s, a);
    }
    expect(s.objects[ids[0]!]!.attachedTo).toBe(g);
    expect(nameOf(s, g)).toBe("Llanowar Elves");
    expect(pt(s, g)).toBe("1/1");
  });
});

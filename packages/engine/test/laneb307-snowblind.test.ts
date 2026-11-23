// Lane B round B307: Snowblind ("Enchanted creature gets -X/-Y. If that creature is attacking, X is the number of snow
// lands defending player controls. Otherwise, X is the number of snow lands its controller controls. Y is equal to X or to
// enchanted creature's toughness minus 1, whichever is smaller.").

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const snowblind = (): CardDef => ({"oracleId":"3f8bfa3d-7490-4259-a403-d13585ed2f66","name":"Snowblind","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets -X/-Y. If that creature is attacking, X is the number of snow lands defending player controls. Otherwise, X is the number of snow lands its controller controls. Y is equal to X or to enchanted creature's toughness minus 1, whichever is smaller.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5f62c376-487a-42bc-bd85-ab8b0480f7dc.jpg?1783947471","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5f62c376-487a-42bc-bd85-ab8b0480f7dc.jpg?1783947471","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const snowForest = (): CardDef => ({"oracleId":"5f0d3be8-e63e-4ade-ae58-6b0c14f2ce6d","name":"Snow-Covered Forest","manaCost":"","cmc":0,"typeLine":"Basic Snow Land — Forest","supertypes":["Basic","Snow"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/ca17acea-f079-4e53-8176-a2f5c5c408a1.jpg?1783928164","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/ca17acea-f079-4e53-8176-a2f5c5c408a1.jpg?1783928164","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const snowIsland = (): CardDef => ({"oracleId":"5b2460a5-6ae5-4cad-ba94-1a9e98e6e4c0","name":"Snow-Covered Island","manaCost":"","cmc":0,"typeLine":"Basic Snow Land — Island","supertypes":["Basic","Snow"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0dcf8c0a-cf91-42a0-a54e-da5e7c697ee3.jpg?1783928166","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0dcf8c0a-cf91-42a0-a54e-da5e7c697ee3.jpg?1783928166","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes until the stack is empty. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const lands = (s: GameState, pid: PlayerId, n: number, def = snowForest()) => Array.from({ length: n }, () => putOnBattlefield(s, pid, def));
/** Snowblind on the battlefield, attached to `to`, controlled by `pid`. */
const enchant = (s: GameState, pid: PlayerId, to: string) => {
  const id = putOnBattlefield(s, pid, snowblind());
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
const others = (s: GameState, pid: PlayerId) => s.turnOrder.filter((p) => p !== pid);

describe("Lane B round B307: Snowblind", () => {
  it("is fully supported: one layer 7c effect on the enchanted creature", () => {
    expect(isFullySupported(snowblind())).toBe(true);
    const st = compileCard(snowblind()).statics;
    expect(st).toHaveLength(1);
    expect(st[0]!.affects).toEqual({ kind: "attached" });
    expect(st[0]!.mods[0]).toMatchObject({ kind: "modifyPT", leaveToughness: 1 });
  });

  it("not attacking: X is the snow lands its controller controls, and Y stops at toughness minus 1", () => {
    const { s, ap, opp } = setup([]);
    const giant = putOnBattlefield(s, opp, hillGiant()); // 3/3
    enchant(s, ap, giant);
    // The setup's lands (yours) aren't snow lands, and the giant's controller has none yet: -0/-0.
    expect(pt(s, giant)).toBe("3/3");
    // Snow lands you control don't count: it's the giant's controller's.
    lands(s, ap, 4);
    invalidateCharacteristics(s);
    expect(pt(s, giant)).toBe("3/3");
    lands(s, opp, 1);
    invalidateCharacteristics(s);
    expect(pt(s, giant)).toBe("2/2"); // X 1, Y 1
    lands(s, opp, 1, snowIsland());
    invalidateCharacteristics(s);
    expect(pt(s, giant)).toBe("1/1"); // X 2, Y 2
    lands(s, opp, 3);
    invalidateCharacteristics(s);
    // X 5, Y = min(5, 3 - 1) = 2: it gets -5/-2 and survives as a -2/1.
    expect(pt(s, giant)).toBe("-2/1");
    // A land that isn't snow doesn't count.
    putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    invalidateCharacteristics(s);
    expect(pt(s, giant)).toBe("-2/1");
  });

  it("a toughness of 1 gives a Y below 0, and 0 is used instead (CR 107.1b): -X/-0", () => {
    const { s, ap, opp } = setup([]);
    const one = putOnBattlefield(s, opp, card("Lone Soldier", "Creature — Soldier", "{W}", { power: "3", toughness: "1" }));
    enchant(s, ap, one);
    lands(s, opp, 2);
    invalidateCharacteristics(s);
    expect(pt(s, one)).toBe("1/1");
  });

  it("attacking: X is the snow lands of the player it's attacking, not its controller's", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = others(s0, ap) as [PlayerId, PlayerId];
    const bear = putOnBattlefield(s0, ap, bears()); // 2/2, not summoning sick
    enchant(s0, b, bear);
    lands(s0, ap, 1); // its controller's: X 1 while it isn't attacking
    lands(s0, b, 3);
    invalidateCharacteristics(s0);
    expect(pt(s0, bear)).toBe("1/1");
    let s = passUntil(s0, "declareAttackers", ap);
    expect(pt(s, bear)).toBe("1/1");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: c }] });
    // C has no snow lands.
    expect(pt(s, bear)).toBe("2/2");
    // Another game: attacking B, who has three.
    let t = passUntil(s0, "declareAttackers", ap);
    t = act(t, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: b }] });
    expect(pt(t, bear)).toBe("-1/1"); // X 3, Y 1
  });

  it("attacking a planeswalker: X is the snow lands of that planeswalker's controller (CR 506.2)", () => {
    const { s: s0, ap } = setup([]);
    const [b] = others(s0, ap) as [PlayerId];
    const bear = putOnBattlefield(s0, ap, bears());
    enchant(s0, ap, bear);
    const walker = putOnBattlefield(s0, b, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5" }));
    s0.objects[walker]!.counters.loyalty = 5;
    lands(s0, b, 2);
    invalidateCharacteristics(s0);
    expect(pt(s0, bear)).toBe("2/2");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: b, planeswalker: walker }] });
    expect(pt(s, bear)).toBe("0/1"); // X 2, Y 1
  });

  it("Y reads the toughness after every other P/T change in layer 7c, whatever their timestamps (CR 613.8a-b)", () => {
    const { s: s0, ap, opp, ids } = setup([giantGrowth()]);
    const bear = putOnBattlefield(s0, opp, bears());
    enchant(s0, ap, bear);
    lands(s0, opp, 5);
    invalidateCharacteristics(s0);
    expect(pt(s0, bear)).toBe("-3/1"); // X 5, Y = min(5, 1)
    // Giant Growth, with a later timestamp: 5/5 before Snowblind, so Y = min(5, 4) = 4: 0/1. (In timestamp order it would be 4/4.)
    const gg = ids[0]!;
    const s = settle(run(s0, planCast(s0, ap, gg, [target(bear)])));
    expect(s.objects[gg]!.zone).toBe("graveyard");
    expect(pt(s, bear)).toBe("0/1");
  });

  it("counters too: a creature with +1/+1 counters keeps 1 toughness", () => {
    const { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, opp, bears());
    s.objects[bear]!.counters["+1/+1"] = 2; // 4/4
    enchant(s, ap, bear);
    lands(s, opp, 5);
    invalidateCharacteristics(s);
    expect(pt(s, bear)).toBe("-1/1"); // -5/-3
    // A -1/-1 counter comes off its toughness before Y is worked out: 3/3, Y = min(5, 2).
    s.objects[bear]!.counters["-1/-1"] = 1;
    invalidateCharacteristics(s);
    expect(pt(s, bear)).toBe("-2/1");
  });

  it("an effect that sets its power and toughness (layer 7b) comes first", () => {
    const { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, opp, bears());
    enchant(s, ap, bear);
    lands(s, opp, 2);
    addEffect(s, ap, [bear], [{ kind: "setPT", power: 6, toughness: 6 }]);
    invalidateCharacteristics(s);
    expect(pt(s, bear)).toBe("4/4");
  });

  it("two Snowblinds: a dependency loop, applied in timestamp order (CR 613.8b)", () => {
    const { s, ap, opp } = setup([]);
    const giant = putOnBattlefield(s, opp, hillGiant()); // 3/3
    enchant(s, ap, giant);
    enchant(s, ap, giant);
    lands(s, opp, 1);
    invalidateCharacteristics(s);
    // First: X 1, Y 1 (2/2); second: X 1, Y 1 (1/1).
    expect(pt(s, giant)).toBe("1/1");
    lands(s, opp, 2);
    invalidateCharacteristics(s);
    // First: X 3, Y = min(3, 2) = 2 (0/1); second: X 3, Y = min(3, 0) = 0 (-3/1).
    expect(pt(s, giant)).toBe("-3/1");
  });

  it("is cast on a creature and works from the battlefield; its creature dies only if something else lowers its toughness", () => {
    const { s: s0, ap, opp, ids } = setup([snowblind()]);
    const bear = putOnBattlefield(s0, opp, bears());
    lands(s0, opp, 4);
    invalidateCharacteristics(s0);
    const aura = ids[0]!;
    const s = settle(run(s0, planCast(s0, ap, aura, [target(bear)])));
    expect(s.objects[aura]!.zone).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(bear);
    expect(s.objects[bear]!.zone).toBe("battlefield");
    expect(pt(s, bear)).toBe("-2/1");
  });

  it("bots put it on an opponent's creature, not their own", () => {
    const { s: s0, ap, opp, ids } = setup([snowblind()]);
    const theirs = putOnBattlefield(s0, opp, hillGiant());
    putOnBattlefield(s0, ap, bears());
    lands(s0, opp, 3);
    invalidateCharacteristics(s0);
    let s = s0;
    for (let i = 0; i < 12 && s.objects[ids[0]!]!.zone === "hand"; i++) {
      const acts = botActions(s, ap);
      if (!acts.length) break;
      for (const a of acts) s = act(s, a);
    }
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    expect(s.stack.at(-1)!.targets).toEqual([expect.objectContaining({ kind: "object", id: theirs })]);
  });
});

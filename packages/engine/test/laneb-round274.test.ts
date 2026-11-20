// Lane B round B274: Dimensional Breach ("Exile all permanents. For as long as any of those cards remain exiled, at the
// beginning of each player's upkeep, that player returns one of the exiled cards they own to the battlefield."; CR 603.7,
// 610.3, 400.7, 303.4f-g; rulings) and Next of Kin ("When enchanted creature dies, you may put a creature card you own with
// lesser mana value from your hand or from the command zone onto the battlefield. If you do, return ~ to the battlefield
// attached to that creature at the beginning of the next end step."; CR 603.10a, 608.2h, 603.7, 400.7; rulings on Gift of
// Immortality).

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions } from "../src/bot";
import { applyAction, invalidateCharacteristics, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const nextofKin = (): CardDef => ({"oracleId":"5b079914-1302-40b5-8060-7c3e5b6e9eae","name":"Next of Kin","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhen enchanted creature dies, you may put a creature card you own with lesser mana value from your hand or from the command zone onto the battlefield. If you do, return this card to the battlefield attached to that creature at the beginning of the next end step.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51a4414b-3cab-463f-a2b5-e49104f251da.jpg?1783923356","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51a4414b-3cab-463f-a2b5-e49104f251da.jpg?1783923356","layout":"normal"}) as CardDef;
const dimensionalBreach = (): CardDef => ({"oracleId":"70d4f764-fca1-477a-9b0f-bbfcc1f7dfb1","name":"Dimensional Breach","manaCost":"{5}{W}{W}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile all permanents. For as long as any of those cards remain exiled, at the beginning of each player's upkeep, that player returns one of the exiled cards they own to the battlefield.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f18f2832-07c5-47be-8966-b250fb997f78.jpg?1783944893","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f18f2832-07c5-47be-8966-b250fb997f78.jpg?1783944893","layout":"normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","layout":"normal"}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","layout":"normal"}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","layout":"normal"}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","layout":"normal"}) as CardDef;
const wormsoftheEarth = (): CardDef => ({"oracleId":"9638ec0c-c8bf-4aa5-a7ca-8677e4b9f241","name":"Worms of the Earth","manaCost":"{2}{B}{B}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Players can't play lands.\nLands can't enter the battlefield.\nAt the beginning of each upkeep, any player may sacrifice two lands of their choice or have this enchantment deal 5 damage to that player. If a player does either, destroy this enchantment.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65a97821-ca5b-46fb-af08-86de81d0daac.jpg?1783947937","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65a97821-ca5b-46fb-af08-86de81d0daac.jpg?1783947937","layout":"normal"}) as CardDef;
const curseofOpulence = (): CardDef => ({"oracleId":"ba0d3df2-3acf-46d7-8d64-8d67d1579adc","name":"Curse of Opulence","manaCost":"{R}","cmc":1,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e23db9d3-d11f-4b2c-8349-687bc0e9d4c2.jpg?1783935943","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e23db9d3-d11f-4b2c-8349-687bc0e9d4c2.jpg?1783935943","layout":"normal"}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
/** A fresh copy of `def` in one of `pid`'s zones. */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only the cards the test put in `pid`'s hand stay there; the drawn ones go back on top of the library. */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  for (const id of s.players[pid]!.hand.filter((h) => !keep.includes(h))) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.unshift(id);
  }
};
const nth = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!;
/**
 * Moves on to `pid`'s upkeep and lets its triggers resolve; stops at the first question there. Other players' Breach
 * questions on the way get their first option; nobody attacks or blocks.
 */
const toUpkeep = (s: GameState, pid: PlayerId) => {
  const from = s.turn;
  for (let i = 0; i < 3000; i++) {
    const pend = s.pending;
    const who = waitingOn(s)!;
    if (pend?.kind === "chooseOption" && pend.what === "breachReturn") s = act(s, { type: "chooseOption", player: who, choice: pend.options[0]! });
    else if (pend?.kind === "chooseOption" && pend.what === "enchant") s = act(s, { type: "chooseOption", player: who, choice: pend.options[0]! });
    else if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, pend.count) });
    else if (pend) throw new Error(`unexpected ${pend.kind}`);
    else s = act(s, { type: "passPriority", player: who });
    // Just arrived at that upkeep (its triggers aren't resolved yet).
    if (s.step === "upkeep" && s.activePlayer === pid && s.turn > from && !s.pending) return settle(s);
  }
  throw new Error("never reached that upkeep");
};

describe("Next of Kin", () => {
  it("is supported", () => supported(nextofKin(), dimensionalBreach()));

  /** Next of Kin on your Hill Giant (mana value 4); Llanowar Elves, Craw Wurm and another Hill Giant in your hand, Murder too. */
  const board = () => {
    const { s, ap, opp, ids } = setup([nextofKin(), murder(), llanowarElves(), crawWurm(), hillGiant()]);
    onlyHand(s, ap, ids);
    const giant = putOnBattlefield(s, ap, hillGiant());
    s.cards[nextofKin().oracleId] = nextofKin();
    const kin = ids[0]!;
    const s2 = settle(run(s, planCast(s, ap, kin, [target(giant)])));
    expect(s2.objects[kin]!.attachedTo).toBe(giant);
    return { s: s2, ap, opp, kin, giant, murder: ids[1]!, elves: ids[2]!, wurm: ids[3]!, giant2: ids[4]!, cmdr: s2.players[ap]!.command[0]! };
  };

  it("offers creature cards with lesser mana value from your hand and the command zone", () => {
    let { s, ap, kin, giant, murder, elves, cmdr } = board();
    s = settle(run(s, planCast(s, ap, murder, [target(giant)])));
    expect(zone(s, kin)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1, fromHand: true, orCommand: true });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no pick");
    // Mana value 1 and 2 (the commander); not Craw Wurm (6) nor the other Hill Giant (4, not less).
    expect([...s.pending.cards].sort()).toEqual([elves, cmdr].sort());
  });

  it("puts your commander onto the battlefield and returns ~ attached to it at the next end step", () => {
    let { s, ap, kin, giant, murder, cmdr } = board();
    s = settle(run(s, planCast(s, ap, murder, [target(giant)])));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [cmdr] }));
    expect(zone(s, cmdr)).toBe("battlefield");
    expect(s.objects[cmdr]!.controller).toBe(ap);
    expect(logged(s, /from the command zone onto the battlefield/)).toBe(true);
    expect(zone(s, kin)).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, kin)).toBe("battlefield");
    expect(s.objects[kin]!.attachedTo).toBe(cmdr);
    expect(s.objects[kin]!.controller).toBe(ap);
  });

  it("declining puts nothing and ~ stays in the graveyard", () => {
    let { s, ap, kin, giant, murder } = board();
    s = settle(run(s, planCast(s, ap, murder, [target(giant)])));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    s = settle(passUntil(s, "end", ap));
    s = settle(passUntil(s, "upkeep", nth(s, ap, 1)));
    expect(zone(s, kin)).toBe("graveyard");
  });

  it("if the creature put has left by the end step, ~ stays in the graveyard (rulings on Gift of Immortality)", () => {
    let { s, ap, kin, giant, murder, elves } = board();
    s = settle(run(s, planCast(s, ap, murder, [target(giant)])));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [elves] }));
    expect(zone(s, elves)).toBe("battlefield");
    moveObject(s, elves, "graveyard");
    // A new object with the same card (CR 400.7) isn't "that creature".
    moveObject(s, elves, "battlefield");
    invalidateCharacteristics(s);
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, kin)).toBe("graveyard");
  });

  it("with ~ gone from the graveyard by then, nothing returns", () => {
    let { s, ap, kin, giant, murder, elves } = board();
    s = settle(run(s, planCast(s, ap, murder, [target(giant)])));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [elves] }));
    moveObject(s, kin, "exile");
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, kin)).toBe("exile");
    expect(s.objects[elves]!.attachedTo).toBeUndefined();
  });

  it("compares with the creature as it last existed: a token copy of nothing has mana value 0, so nothing is offered", () => {
    const { s: s0, ap, ids } = setup([nextofKin(), murder(), llanowarElves()]);
    onlyHand(s0, ap, ids);
    const tok = putOnBattlefield(s0, ap, { ...hillGiant(), oracleId: "b274-token", name: "Soldier", manaCost: "", cmc: 0 } as CardDef);
    s0.objects[tok]!.isToken = true;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(tok)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(tok)])));
    expect(s.pending).toBeFalsy();
    expect(zone(s, ids[2]!)).toBe("hand");
  });

  it("a bot puts the best creature card it can", () => {
    let { s, ap, giant, murder, elves, cmdr } = board();
    s = settle(run(s, planCast(s, ap, murder, [target(giant)])));
    for (const a of botActions(s, ap)) s = applyAction(s, a);
    s = settle(s);
    expect([zone(s, elves), zone(s, cmdr)]).toContain("battlefield");
  });
});

describe("Dimensional Breach", () => {
  /**
   * Your lands and Dimensional Breach; the next player's Llanowar Elves and Sol Ring; the player after that has Pacifism on
   * the Elves; the last player has a creature token.
   */
  const board = (withForest = false) => {
    const { s, ap, ids } = setup([dimensionalBreach()]);
    const [b, c, d] = [nth(s, ap, 1), nth(s, ap, 2), nth(s, ap, 3)];
    const elves = putOnBattlefield(s, b, llanowarElves());
    const ring = putOnBattlefield(s, b, solRing());
    const forestB = withForest ? putOnBattlefield(s, b, forest) : undefined;
    const pac = putOnBattlefield(s, c, pacifism());
    s.objects[pac]!.attachedTo = elves;
    const tok = putOnBattlefield(s, d, { ...hillGiant(), oracleId: "b274-token-giant", name: "Giant" } as CardDef);
    s.objects[tok]!.isToken = true;
    invalidateCharacteristics(s);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap);
    const s2 = settle(run(s, planCast(s, ap, ids[0]!)));
    return { s: s2, ap, b, c, d, breach: ids[0]!, elves, ring, pac, tok, lands, forestB };
  };

  it("exiles every permanent; tokens cease to exist", () => {
    const { s, ap, breach, elves, ring, pac, tok, lands } = board();
    expect(s.battlefield).toEqual([]);
    for (const id of [elves, ring, pac, ...lands]) expect(zone(s, id)).toBe("exile");
    expect(s.objects[tok]).toBeUndefined();
    expect(zone(s, breach)).toBe("graveyard");
    expect(s.delayed?.filter((d) => d.when === "eachUpkeepWhileExiled").length).toBe(1);
    void ap;
  });

  it("at each player's upkeep, that player returns one of their exiled cards they choose", () => {
    let { s, b, elves, ring } = board();
    s = toUpkeep(s, b);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: b, what: "breachReturn" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect([...s.pending.options].sort()).toEqual([elves, ring].sort());
    s = settle(act(s, { type: "chooseOption", player: b, choice: elves }));
    expect(zone(s, elves)).toBe("battlefield");
    expect(s.objects[elves]!.controller).toBe(b);
    expect(zone(s, ring)).toBe("exile");
  });

  it("an Aura with nothing to enchant can't be returned; with a creature there, its player chooses what it enchants", () => {
    let { s, b, c, elves, ring, pac } = board();
    s = toUpkeep(s, b);
    s = settle(act(s, { type: "chooseOption", player: b, choice: ring }));
    s = toUpkeep(s, c);
    expect(s.pending).toBeFalsy();
    expect(zone(s, pac)).toBe("exile");
    expect(logged(s, /has none of the cards exiled with Dimensional Breach to return/)).toBe(true);
    // Next time round, the Elves are back first: Pacifism can return, enchanting them.
    s = toUpkeep(s, b);
    expect(s.pending).toBeFalsy();
    expect(zone(s, elves)).toBe("battlefield");
    s = toUpkeep(s, c);
    expect(zone(s, pac)).toBe("battlefield");
    expect(s.objects[pac]!.attachedTo).toBe(elves);
    expect(s.objects[pac]!.controller).toBe(c);
  });

  it("a land can't be returned while lands can't enter the battlefield (rulings)", () => {
    let { s, b, elves, ring, forestB } = board(true);
    // Worms of the Earth's first ability alone (its upkeep trigger would ask a question of its own).
    const worms = putOnBattlefield(s, nth(s, b, 1), { ...wormsoftheEarth(), oracleId: "b274-worms", oracleText: "Lands can't enter the battlefield." } as CardDef);
    expect(isFullySupported(s.cards["b274-worms"]!)).toBe(true);
    invalidateCharacteristics(s);
    s = toUpkeep(s, b);
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect([...s.pending.options].sort()).toEqual([elves, ring].sort());
    s = settle(act(s, { type: "chooseOption", player: b, choice: ring }));
    expect(zone(s, forestB!)).toBe("exile");
    // Once Worms is gone, the Forest can be returned.
    moveObject(s, worms, "graveyard");
    invalidateCharacteristics(s);
    s = toUpkeep(s, b);
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect([...s.pending.options].sort()).toEqual([elves, forestB!].sort());
  });

  it("ends once none of those cards remains exiled", () => {
    let { s, b, elves, ring, pac, lands } = board();
    for (const id of [elves, ring, pac, ...lands]) moveObject(s, id, "graveyard");
    invalidateCharacteristics(s);
    s = toUpkeep(s, b);
    expect(s.pending).toBeFalsy();
    expect(s.delayed?.some((d) => d.when === "eachUpkeepWhileExiled")).toBe(false);
  });

  it("a card that left exile and came back is a new object: not one of those cards", () => {
    let { s, b, elves, ring } = board();
    moveObject(s, ring, "hand");
    moveObject(s, ring, "exile");
    s = toUpkeep(s, b);
    // Only the Elves are still one of those cards: returned without a question.
    expect(s.pending).toBeFalsy();
    expect(zone(s, elves)).toBe("battlefield");
    expect(zone(s, ring)).toBe("exile");
  });

  it("a bot returns its most valuable card", () => {
    let { s, b, elves, ring } = board();
    s = toUpkeep(s, b);
    for (const a of botActions(s, b)) s = applyAction(s, a);
    s = settle(s);
    expect([zone(s, elves), zone(s, ring)].filter((z) => z === "battlefield").length).toBe(1);
  });
});

describe("Dimensional Breach for bots", () => {
  it("a bot casts it only when the opponents have more on the battlefield than it does", async () => {
    const { groupValue } = await import("../src/value");
    const { compileCard } = await import("../src");
    const { s, ap } = setup([dimensionalBreach()]);
    const body = compileCard(dimensionalBreach()).spell!;
    // Only the caster has permanents (its lands): bad for it.
    expect(groupValue(s, ap, body)!).toBeLessThan(0);
    for (const p of s.turnOrder) if (p !== ap) for (let i = 0; i < 6; i++) putOnBattlefield(s, p, crawWurm());
    invalidateCharacteristics(s);
    expect(groupValue(s, ap, body)!).toBeGreaterThan(0);
  });
});

// Lane B round B206: Kaya, Ghost Assassin (exile Kaya or the target creature, chosen as it resolves, back at your next
// upkeep); Fumble (the bounced creature's Auras and Equipment, taken and attached together to another creature);
// Drach'Nyen (the exiled card's power for the equipped creature); The Three Seasons (three cards chosen in each
// graveyard, shuffled into their owners' libraries); Varchild's War-Riders (cumulative upkeep paid with tokens for
// opponents, an opponent chosen for each age counter).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const kaya = (): CardDef => ({"oracleId":"5e4c81b9-a31e-45e6-983f-30f11b8a05c0","name":"Kaya, Ghost Assassin","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Legendary Planeswalker — Kaya","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Kaya"],"oracleText":"0: Exile Kaya or up to one target creature. Return that card to the battlefield under its owner's control at the beginning of your next upkeep. You lose 2 life.\n−1: Each opponent loses 2 life and you gain 2 life.\n−2: Each opponent discards a card and you draw a card.","loyalty":"5","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/be3007b3-0c5a-4cc3-992f-d2ae2fadfbc6.jpg?1783937279","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/be3007b3-0c5a-4cc3-992f-d2ae2fadfbc6.jpg?1783937279","commanderLegal":"legal","set":"cn2","releasedAt":"2016-08-26","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const fumble = (): CardDef => ({"oracleId":"cbf68ddd-596f-4b2d-b93c-3b7976ba4d37","name":"Fumble","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand. Gain control of all Auras and Equipment that were attached to it, then attach them to another creature.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64019dd4-b00b-4521-a869-e302f23167da.jpg?1783934867","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64019dd4-b00b-4521-a869-e302f23167da.jpg?1783934867","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const drach = (): CardDef => ({"oracleId":"aaf4a72b-9606-4d8c-a286-fbce4aa08f97","name":"Drach'Nyen","manaCost":"{4}{B}{R}","cmc":6,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Echo of the First Murder — When Drach'Nyen enters, exile up to one target creature.\nDaemon Sword — Equipped creature has menace and gets +X/+0, where X is the exiled card's power.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Echo of the First Murder","Equip","Daemon Sword"],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/41de390d-5c16-4e83-9c09-4e55fcb8c8e8.jpg?1783920855","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/41de390d-5c16-4e83-9c09-4e55fcb8c8e8.jpg?1783920855","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const seasons = (): CardDef => ({"oracleId":"a38ebf4a-064c-4517-a553-15f0a252c159","name":"The Three Seasons","manaCost":"{G}{U}","cmc":2,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Mill three cards.\nII — Return up to two target snow permanent cards from your graveyard to your hand.\nIII — Choose three cards in each graveyard. Their owners shuffle those cards into their libraries.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48ce03b3-ec7c-46df-b89a-55405f3b5245.jpg?1783928189","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48ce03b3-ec7c-46df-b89a-55405f3b5245.jpg?1783928189","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
const varchild = (): CardDef => ({"oracleId":"258921f2-df26-4d8a-ad34-8f44d0158ae7","name":"Varchild's War-Riders","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Cumulative upkeep—Have an opponent create a 1/1 red Survivor creature token. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nTrample; rampage 1 (Whenever this creature becomes blocked, it gets +1/+1 until end of turn for each creature blocking it beyond the first.)","power":"3","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Trample","Rampage","Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1d41da-aa72-434b-811f-95d4bae4ba5c.jpg?1783947174","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1d41da-aa72-434b-811f-95d4bae4ba5c.jpg?1783947174","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const gladecover = (): CardDef => ({"oracleId":"385c1208-bfea-44e2-b236-4f38bc90db9f","name":"Gladecover Scout","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Scout","supertypes":[],"types":["Creature"],"subtypes":["Elf","Scout"],"oracleText":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/26710d5c-01d1-498b-9f54-521dfd195843.jpg?1783941059","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/26710d5c-01d1-498b-9f54-521dfd195843.jpg?1783941059","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const goyf = (): CardDef => ({"oracleId":"45900b2f-f6a9-4c42-9642-008f3c1cf6dd","name":"Tarmogoyf","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Lhurgoyf","supertypes":[],"types":["Creature"],"subtypes":["Lhurgoyf"],"oracleText":"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.","power":"*","toughness":"1+*","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8be5ee47-8f8a-4e3c-b1a1-9ca0e1fdec7f.jpg?1789127270","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8be5ee47-8f8a-4e3c-b1a1-9ca0e1fdec7f.jpg?1789127270","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const warmind = (): CardDef => ({"oracleId":"86e88219-0f8e-405d-8439-c3b4acf11330","name":"Emblem of the Warmind","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature you control\nCreatures you control have haste.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/0/3/03ab2a41-315b-439c-b02c-f12335fc903a.jpg?1783943104","artUrl":"https://cards.scryfall.io/art_crop/front/0/3/03ab2a41-315b-439c-b02c-f12335fc903a.jpg?1783943104","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => nameOf(s, id) === name);
/** A new card for `def` in `pid`'s hand, library (on top), graveyard or exile. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const ogre = card("Hill Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "3" });
const rock = card("Test Rock", "Artifact", "{3}", { cmc: 3 });

describe("round B206 cards are supported", () => {
  it("compiles every line", () => supported(kaya(), fumble(), drach(), seasons(), varchild()));
});

describe("Kaya, Ghost Assassin", () => {
  /** Kaya with 5 loyalty on your battlefield, an opponent's Hill Ogre, and Kaya's 0 activated with `target`. */
  const zero = (withTarget: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kaya());
    s0.objects[k]!.counters.loyalty = 5;
    const o = putOnBattlefield(s0, opp, ogre);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planActivate(s0, ap, k, 0, [withTarget ? tgt(o) : { kind: "none" }])));
    return { s, ap, opp, k, o, life };
  };

  it("with no target, exiles Kaya; she returns at your next upkeep as a new object with her printed loyalty, and you lose 2 life", () => {
    const { s: s1, ap, k, o, life } = zero(false);
    expect(zoneOf(s1, k)).toBe("exile");
    expect(zoneOf(s1, o)).toBe("battlefield");
    expect(s1.players[ap]!.life).toBe(life - 2);
    const opp1 = s1.turnOrder[(s1.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = passUntil(s1, "upkeep", opp1);
    expect(zoneOf(s, k)).toBe("exile");
    s = settle(passUntil(s, "upkeep", ap));
    const [back] = named(s, "Kaya, Ghost Assassin");
    expect(back).toBeTruthy();
    expect(controllerOf(s, s.objects[back!]!)).toBe(ap);
    expect(s.objects[back!]!.counters.loyalty).toBe(5);
  });

  it("with a target, asks which as it resolves: the creature is exiled and returns under its owner's control, Kaya stays", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kaya());
    s0.objects[k]!.counters.loyalty = 5;
    const o = putOnBattlefield(s0, opp, ogre);
    s0.objects[o]!.controller = ap;
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planActivate(s0, ap, k, 0, [tgt(o)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(s.pending.labels).toEqual(["Exile Kaya, Ghost Assassin", "Exile the target creature"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(zoneOf(s, o)).toBe("exile");
    expect(zoneOf(s, k)).toBe("battlefield");
    expect(s.objects[k]!.counters.loyalty).toBe(5);
    expect(s.players[ap]!.life).toBe(life - 2);
    s = settle(passUntil(passUntil(s, "upkeep", opp), "upkeep", ap));
    const [ogre2] = named(s, "Hill Ogre");
    expect(ogre2).toBeTruthy();
    expect(controllerOf(s, s.objects[ogre2!]!)).toBe(opp);
  });

  it("with a target, Kaya may be the one exiled instead", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kaya());
    s0.objects[k]!.counters.loyalty = 5;
    const o = putOnBattlefield(s0, opp, ogre);
    let s = settle(run(s0, planActivate(s0, ap, k, 0, [tgt(o)])));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(zoneOf(s, k)).toBe("exile");
    expect(zoneOf(s, o)).toBe("battlefield");
  });

  it("with its target gone, it doesn't resolve: nothing is exiled and no life is lost (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kaya());
    s0.objects[k]!.counters.loyalty = 5;
    const o = putOnBattlefield(s0, opp, ogre);
    const life = s0.players[ap]!.life;
    let s = run(s0, planActivate(s0, ap, k, 0, [tgt(o)]));
    // The creature leaves before it resolves.
    s.battlefield.splice(s.battlefield.indexOf(o), 1);
    s.objects[o]!.zone = "graveyard";
    s.objects[o]!.zoneChanges = (s.objects[o]!.zoneChanges ?? 0) + 1;
    s.players[opp]!.graveyard.push(o);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(zoneOf(s, k)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life);
  });
});

describe("Fumble", () => {
  /** An opponent's Hill Ogre with their Pacifism and Bonesplitter on it; your Grizzly Bears; Fumble in your hand. */
  const board = (extra?: (s: GameState, ap: PlayerId, opp: PlayerId) => void) => {
    const { s, ap, opp, ids } = setup([fumble()]);
    const o = putOnBattlefield(s, opp, ogre);
    const pac = putOnBattlefield(s, opp, pacifism());
    const bone = putOnBattlefield(s, opp, bonesplitter());
    s.objects[pac]!.attachedTo = o;
    s.objects[bone]!.attachedTo = o;
    const mine = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    extra?.(s, ap, opp);
    invalidateCharacteristics(s);
    return { s, ap, opp, f: ids[0]!, o, pac, bone, mine };
  };

  it("returns the creature, takes its Aura and Equipment for good and attaches both to the creature you choose", () => {
    const { s: s0, ap, opp, f, o, pac, bone, mine } = board();
    let s = settle(run(s0, planCast(s0, ap, f, [tgt(o)])));
    expect(zoneOf(s, o)).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    // Any creature they can all be attached to: yours, or another player's (not targeted).
    expect(s.pending.options).toContain(mine);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: mine }));
    expect(s.objects[pac]!.attachedTo).toBe(mine);
    expect(s.objects[bone]!.attachedTo).toBe(mine);
    expect(controllerOf(s, s.objects[pac]!)).toBe(ap);
    expect(controllerOf(s, s.objects[bone]!)).toBe(ap);
    expect(power(s, s.objects[mine]!)).toBe(4);
    void opp;
  });

  it("may attach them to an opponent's hexproof creature, which it doesn't target", () => {
    let scout = "";
    const { s: s0, ap, f, o, pac, bone } = board((s, _ap, opp) => {
      scout = putOnBattlefield(s, opp, gladecover());
    });
    let s = settle(run(s0, planCast(s0, ap, f, [tgt(o)])));
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(s.pending.options).toContain(scout);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: scout }));
    expect(s.objects[pac]!.attachedTo).toBe(scout);
    expect(s.objects[bone]!.attachedTo).toBe(scout);
    expect(controllerOf(s, s.objects[bone]!)).toBe(ap);
  });

  it("with only one creature they can all go on, attaches them there without asking", () => {
    const { s: s0, ap, f, o, pac, bone, mine } = board();
    // Only your bear is left besides the Ogre.
    for (const id of [...s0.battlefield]) if (id !== mine && id !== o && characteristics(s0, s0.objects[id]!).types.includes("Creature")) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, f, [tgt(o)])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[pac]!.attachedTo).toBe(mine);
    expect(s.objects[bone]!.attachedTo).toBe(mine);
  });

  it("with no creature they can all go on, they stay unattached: the Aura goes to its owner's graveyard, the Equipment stays yours", () => {
    const { s: s0, ap, opp, f, o, pac, bone, mine } = board();
    for (const id of [...s0.battlefield]) if (id !== o && characteristics(s0, s0.objects[id]!).types.includes("Creature")) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    invalidateCharacteristics(s0);
    void mine;
    const s = settle(run(s0, planCast(s0, ap, f, [tgt(o)])));
    expect(s.pending).toBeFalsy();
    expect(zoneOf(s, pac)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(pac);
    expect(zoneOf(s, bone)).toBe("battlefield");
    expect(s.objects[bone]!.attachedTo).toBeUndefined();
    expect(controllerOf(s, s.objects[bone]!)).toBe(ap);
  });

  it("an Aura with \"enchant creature you control\" limits the choice to your creatures once you control it", () => {
    let emblem = "", theirs = "";
    const { s: s0, ap, f, o, mine } = board((s, _ap, opp) => {
      emblem = putOnBattlefield(s, opp, warmind());
      s.objects[emblem]!.attachedTo = s.battlefield.find((id) => nameOf(s, id) === "Hill Ogre");
      theirs = s.battlefield.find((id) => nameOf(s, id) === "Their Bear")!;
    });
    let s = settle(run(s0, planCast(s0, ap, f, [tgt(o)])));
    if (s.pending?.kind === "chooseOption") {
      expect(s.pending.options).not.toContain(theirs);
      s = settle(act(s, { type: "chooseOption", player: ap, choice: mine }));
    }
    expect(s.objects[emblem]!.attachedTo).toBe(mine);
    expect(controllerOf(s, s.objects[emblem]!)).toBe(ap);
  });
});

describe("Drach'Nyen", () => {
  /** Drach'Nyen enters under your control, its trigger exiling `victim`, then it's attached to your Grizzly Bears. */
  const exiling = (victim: (s: GameState, opp: PlayerId) => ObjectId) => {
    const { s: s0, ap, opp, ids } = setup([drach()]);
    const v = victim(s0, opp);
    const mine = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(v)] }));
    expect(zoneOf(s, v)).toBe("exile");
    s.objects[ids[0]!]!.attachedTo = mine;
    invalidateCharacteristics(s);
    return { s, ap, opp, d: ids[0]!, mine, v };
  };

  it("the equipped creature gets +X/+0 and menace, X the exiled card's power", () => {
    const { s, mine } = exiling((s, opp) => putOnBattlefield(s, opp, ogre));
    expect(power(s, s.objects[mine]!)).toBe(6);
    expect(toughness(s, s.objects[mine]!)).toBe(2);
    expect(objHasKeyword(s, s.objects[mine]!, "Menace")).toBe(true);
  });

  it("a characteristic-defining power applies in exile (Tarmogoyf)", () => {
    const { s, mine, ap } = exiling((s, opp) => putOnBattlefield(s, opp, goyf()));
    // Tarmogoyf counts the card types in all graveyards, as it is in exile.
    const before = power(s, s.objects[mine]!);
    toZone(s, ap, rock, "graveyard");
    expect(power(s, s.objects[mine]!)).toBe(before + 1);
  });

  it("a card with no printed power gives +0 (rulings), even if it was a creature on the battlefield", () => {
    const { s, mine } = exiling((s, opp) => {
      const r = putOnBattlefield(s, opp, rock);
      addEffect(s, opp, [r], [{ kind: "addTypes", types: ["Creature"], subtypes: [] }, { kind: "setPT", power: 5, toughness: 5 }], "game");
      return r;
    });
    expect(power(s, s.objects[mine]!)).toBe(2);
    expect(objHasKeyword(s, s.objects[mine]!, "Menace")).toBe(true);
  });
});

describe("The Three Seasons", () => {
  it("III: you choose three cards in each graveyard (all of one with three or fewer); their owners shuffle them in, a player with none doesn't", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    // No discards to hand size on the way (they'd fill the graveyards).
    for (const p of s0.turnOrder) {
      for (const id of s0.players[p]!.hand) s0.objects[id]!.zone = "library";
      s0.players[p]!.library.push(...s0.players[p]!.hand);
      s0.players[p]!.hand = [];
      s0.players[p]!.graveyard = [];
    }
    const saga = putOnBattlefield(s0, ap, seasons());
    s0.objects[saga]!.counters.lore = 2;
    const mine = Array.from({ length: 5 }, (_, i) => toZone(s0, ap, bear({ name: `My Card ${i}` }), "graveyard"));
    const two = Array.from({ length: 2 }, (_, i) => toZone(s0, o1!, bear({ name: `Their Card ${i}` }), "graveyard"));
    const four = Array.from({ length: 4 }, (_, i) => toZone(s0, o3!, bear({ name: `Other Card ${i}` }), "graveyard"));
    s0.players[o2!]!.graveyard = [];
    let s = passUntil(passUntil(s0, "upkeep", o1!), "main1", ap);
    const shuffles = Object.fromEntries(s.turnOrder.map((p) => [p, s.players[p]!.shuffles ?? 0]));
    const asked: string[] = [];
    for (let i = 0; i < 40; i++) {
      const p = s.pending;
      if (p?.kind === "searchLibrary") {
        expect(p.player).toBe(ap);
        expect(p.fromGraveyard).toBe("shuffleIn");
        expect(p.min).toBe(3);
        asked.push(p.what);
        s = act(s, { type: "searchLibrary", player: ap, found: p.cards.slice(0, 3) });
      } else if (p) break;
      else if (s.stack.length || s.triggerQueue.length || !asked.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else break;
    }
    // Asked only for the graveyards with more than three cards.
    expect(asked.length).toBe(2);
    expect(mine.filter((id) => zoneOf(s, id) === "library").length).toBe(3);
    expect(mine.filter((id) => zoneOf(s, id) === "graveyard").length).toBe(2);
    expect(two.every((id) => zoneOf(s, id) === "library")).toBe(true);
    expect(four.filter((id) => zoneOf(s, id) === "library").length).toBe(3);
    expect(s.players[ap]!.shuffles).toBe(shuffles[ap]! + 1);
    expect(s.players[o1!]!.shuffles).toBe(shuffles[o1!]! + 1);
    expect(s.players[o2!]!.shuffles ?? 0).toBe(shuffles[o2!]!);
    expect(s.players[o3!]!.shuffles).toBe(shuffles[o3!]! + 1);
  });
});

describe("Varchild's War-Riders", () => {
  /** War-Riders with `age` age counters already, on to your upkeep with its trigger resolving. */
  const upkeep = (age: number) => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, varchild());
    if (age) s0.objects[w]!.counters.age = age;
    let s = passUntil(passUntil(s0, "upkeep", opp), "upkeep", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, w };
  };
  const survivors = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Survivor") && controllerOf(s, s.objects[id]!) === pid);

  it("pays with a 1/1 red Survivor token for each age counter, an opponent chosen for each, under that opponent's control", () => {
    const { s: s1, ap, w } = upkeep(1);
    const [a, b] = [1, 2].map((k) => s1.turnOrder[(s1.turnOrder.indexOf(ap) + k) % 4]!);
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    let s = act(s1, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "giveLife" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(a) });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(b) }));
    expect(zoneOf(s, w)).toBe("battlefield");
    expect(s.objects[w]!.counters.age).toBe(2);
    expect(survivors(s, a!).length).toBe(1);
    expect(survivors(s, b!).length).toBe(1);
    const t = s.objects[survivors(s, a!)[0]!]!;
    expect(t.isToken).toBe(true);
    expect(t.owner).toBe(a);
    expect(characteristics(s, t).colors).toEqual(["R"]);
    expect(`${power(s, t)}/${toughness(s, t)}`).toBe("1/1");
  });

  it("the same opponent may get them all", () => {
    const { s: s1, ap } = upkeep(2);
    const a = s1.turnOrder[(s1.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = act(s1, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 3; i++) s = act(s, { type: "chooseOption", player: ap, choice: String(a) });
    s = settle(s);
    expect(survivors(s, a).length).toBe(3);
  });

  it("not paying sacrifices it", () => {
    const { s: s1, ap, w } = upkeep(0);
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }));
    expect(zoneOf(s, w)).toBe("graveyard");
    expect(s.battlefield.some((id) => characteristics(s, s.objects[id]!).subtypes.includes("Survivor"))).toBe(false);
  });
});

// Lane B round B164: creature types counted per creature (Diligent Zookeeper; CR 205.3m, 702.73a), domain landwalk
// (Magnigoth Treefolk; CR 702.14c), a choice of payment (Isu the Abominable; CR 608.2d), a base power set from the greatest
// other power (Arni Brokenbrow; CR 613.4b, rulings), hexproof and evasion from a chosen color (Sungold Sentinel), control
// passed to the attacking player (Contested Game Ball; CR 506.2), "can't be blocked unless it's attacking its owner" (Become
// the Pilot; CR 509.1b), and an X its text sets as it's cast from an opponent's graveyard (Spoils of War; CR 107.3c).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup, addEffect } from "./helpers";
import { blockProblem, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const zookeeper = (): CardDef => ({"oracleId":"6a84a8a4-c8b0-45ce-af6f-605fcffc395b","name":"Diligent Zookeeper","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Human Citizen Ally","supertypes":[],"types":["Creature"],"subtypes":["Human","Citizen","Ally"],"oracleText":"Each non-Human creature you control gets +1/+1 for each of its creature types, to a maximum of 10.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const magnigoth = (): CardDef => ({"oracleId":"b153e4c4-6557-43a6-8404-e4450f879945","name":"Magnigoth Treefolk","manaCost":"{4}{G}","cmc":5,"typeLine":"Creature — Treefolk","supertypes":[],"types":["Creature"],"subtypes":["Treefolk"],"oracleText":"Domain — For each basic land type among lands you control, this creature has landwalk of that type. (It can't be blocked as long as defending player controls a land of that type.)","power":"2","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Domain"],"layout":"normal"}) as CardDef;
const isu = (): CardDef => ({"oracleId":"b34823a3-7bee-4e71-a3df-9b533c8ddf15","name":"Isu the Abominable","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Legendary Snow Creature — Yeti","supertypes":["Legendary","Snow"],"types":["Creature"],"subtypes":["Yeti"],"oracleText":"You may look at the top card of your library any time.\nYou may play snow lands and cast snow spells from the top of your library.\nWhenever another snow permanent you control enters, you may pay {G}, {W}, or {U}. If you do, put a +1/+1 counter on Isu.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["G","U","W"],"keywords":[],"layout":"normal"}) as CardDef;
const arni = (): CardDef => ({"oracleId":"3dce6c6c-599f-4e35-ae15-728c5e78dee1","name":"Arni Brokenbrow","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Human Berserker","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Berserker"],"oracleText":"Haste\nBoast — {1}: You may have Arni's base power become 1 plus the greatest power among other creatures you control until end of turn. (Activate only if this creature attacked this turn and only once each turn.)","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Boast","Haste"],"layout":"normal"}) as CardDef;
const sungold = (): CardDef => ({"oracleId":"410f5067-3380-4afb-9881-4b3bf0268493","name":"Sungold Sentinel","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Whenever this creature enters or attacks, exile up to one target card from a graveyard.\nCoven — {1}{W}: Choose a color. This creature gains hexproof from that color until end of turn and can't be blocked by creatures of that color this turn. Activate only if you control three or more creatures with different powers.","power":"3","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Coven"],"layout":"normal"}) as CardDef;
const gameBall = (): CardDef => ({"oracleId":"876c9620-216c-45dd-b8a6-b9e0cba63e3d","name":"Contested Game Ball","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever you're dealt combat damage, the attacking player gains control of this artifact and untaps it.\n{2}, {T}: Draw a card and put a point counter on this artifact. Then if it has five or more point counters on it, sacrifice it and create a Treasure token.","colors":[],"colorIdentity":[],"keywords":["Treasure"],"layout":"normal"}) as CardDef;
const pilot = (): CardDef => ({"oracleId":"7e079dd3-3397-491f-a6c5-7be5ade687d3","name":"Become the Pilot","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant noncommander creature\nYou control enchanted creature.\nEnchanted creature gets +2/+2 and can't be blocked unless it's attacking its owner or a permanent its owner controls.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const spoils = (): CardDef => ({"oracleId":"f3240a86-28b6-4338-9a59-1fb6f795d713","name":"Spoils of War","manaCost":"{X}{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"X is the number of artifact and/or creature cards in an opponent's graveyard as you cast this spell.\nDistribute X +1/+1 counters among any number of target creatures.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const outcast = (): CardDef => ({"oracleId":"a61ef0cc-1da9-49f9-b0dc-01cf9f6205be","name":"Changeling Outcast","manaCost":"{B}","cmc":1,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"layout":"normal"}) as CardDef;
const dryadArbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const snowForest = (): CardDef => ({"oracleId":"5f0d3be8-e63e-4ade-ae58-6b0c14f2ce6d","name":"Snow-Covered Forest","manaCost":"","cmc":0,"typeLine":"Basic Snow Land — Forest","supertypes":["Basic","Snow"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[]}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** Leaves only these lands of `pid`'s on the battlefield. */
const keepLands = (s: GameState, pid: PlayerId, names: string[]) => {
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller === pid && s.cards[o.cardId]!.types.includes("Land") && !names.includes(s.cards[o.cardId]!.name)) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      o.zone = "graveyard";
      s.players[pid]!.graveyard.push(id);
    }
  }
  invalidateCharacteristics(s);
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks });
};

describe("Diligent Zookeeper: +1/+1 for each of its creature types, to a maximum of 10", () => {
  it("compiles", () => supported(zookeeper()));

  it("a non-Human creature you control gets +1/+1 for each creature type; Humans and opponents' creatures don't", () => {
    const { s, ap, opp } = setup([]);
    const keeper = putOnBattlefield(s, ap, zookeeper());
    const elf = putOnBattlefield(s, ap, elves());
    const dragon = putOnBattlefield(s, ap, shivan());
    const theirs = putOnBattlefield(s, opp, elves());
    invalidateCharacteristics(s);
    expect(pt(s, elf)).toBe("3/3"); // Elf Druid: two types
    expect(pt(s, dragon)).toBe("6/6"); // Dragon: one
    expect(pt(s, keeper)).toBe("4/4"); // a Human: unchanged
    expect(pt(s, theirs)).toBe("1/1");
  });

  it("a changeling has every creature type, Human too, so it isn't affected (CR 702.73a)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, zookeeper());
    const shifter = putOnBattlefield(s, ap, outcast());
    invalidateCharacteristics(s);
    expect(pt(s, shifter)).toBe("1/1");
  });

  it("never more than +10/+10", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, zookeeper());
    const b = putOnBattlefield(s, ap, bear());
    addEffect(s, ap, [b], [{ kind: "addTypes", types: [], subtypes: ["Elf", "Goblin", "Wizard", "Cleric", "Rogue", "Warrior", "Knight", "Soldier", "Zombie", "Vampire", "Faerie"] }]);
    expect(pt(s, b)).toBe("12/12");
  });

  it("its land types aren't creature types: Dryad Arbor (Forest Dryad) gets +1/+1 (CR 205.3m)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, zookeeper());
    const arbor = putOnBattlefield(s, ap, dryadArbor());
    invalidateCharacteristics(s);
    expect(pt(s, arbor)).toBe("2/2");
  });

  it("counts the types layer 4 gives it: a Human that loses that type to a type-setting effect is affected", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, zookeeper());
    const elf = putOnBattlefield(s, ap, elves());
    addEffect(s, ap, [elf], [{ kind: "setSubtypes", subtypes: ["Frog"] }]);
    expect(pt(s, elf)).toBe("2/2");
  });
});

describe("Magnigoth Treefolk: landwalk of each basic land type among lands you control", () => {
  it("compiles", () => supported(magnigoth()));

  it("only the basic land types among your lands, as layer 4 has them (Dryad Arbor is a Forest)", () => {
    const { s, ap } = setup([]);
    const tree = putOnBattlefield(s, ap, magnigoth());
    keepLands(s, ap, ["Island", "Swamp"]);
    expect(kw(s, tree)).toEqual(expect.arrayContaining(["Islandwalk", "Swampwalk"]));
    expect(kw(s, tree)).not.toContain("Forestwalk");
    expect(kw(s, tree)).not.toContain("Plainswalk");
    putOnBattlefield(s, ap, dryadArbor());
    invalidateCharacteristics(s);
    expect(kw(s, tree)).toContain("Forestwalk");
  });

  it("can't be blocked while the defending player controls a land of one of those types (CR 702.14c)", () => {
    const { s: s0, ap, opp } = setup([]);
    const tree = putOnBattlefield(s0, ap, magnigoth());
    keepLands(s0, ap, ["Island", "Forest"]);
    const blocker = putOnBattlefield(s0, opp, bear());
    let s = attack(s0, ap, [{ attacker: tree, defender: opp }]);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[tree]!)).toBeNull();
    putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[tree]!)).toMatch(/islandwalk/);
  });
});

describe("Isu the Abominable: you may pay {G}, {W}, or {U} for a +1/+1 counter", () => {
  it("compiles", () => supported(isu()));

  it("asks which to pay, only those you could pay; the counter once it's paid", () => {
    const { s: s0, ap, ids } = setup([snowForest()]);
    const yeti = putOnBattlefield(s0, ap, isu());
    keepLands(s0, ap, ["Island", "Plains"]);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = settle(s);
    const pend = s.pending;
    expect(pend?.kind === "chooseOption" && pend.what).toBe("payWhich");
    if (pend?.kind !== "chooseOption") throw new Error("no choice");
    // The snow Forest just played can pay {G} too.
    expect(pend.labels).toEqual(["Pay {G}", "Pay {W}", "Pay {U}", "Don't pay"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    const may = s.pending;
    expect(may?.kind === "chooseMay" && may.pay?.mana).toBe("{W}");
    s.players[ap]!.manaPool.W = 1;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[yeti]!.counters["+1/+1"]).toBe(1);
    expect(s.players[ap]!.manaPool.W ?? 0).toBe(0);
  });

  it("only the costs you could pay are offered; not paying puts no counter", () => {
    const { s: s0, ap, ids } = setup([snowForest()]);
    const yeti = putOnBattlefield(s0, ap, isu());
    keepLands(s0, ap, ["Island"]);
    for (const id of s0.battlefield) if (s0.cards[s0.objects[id]!.cardId]!.name === "Island") s0.objects[id]!.tapped = true;
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    const pend = s.pending;
    if (pend?.kind !== "chooseOption") throw new Error("no choice");
    expect(pend.options).toEqual(["0", "none"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.pending).toBeNull();
    expect(s.objects[yeti]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("nothing to pay with: no question", () => {
    const { s: s0, ap, ids } = setup([snowForest()]);
    const yeti = putOnBattlefield(s0, ap, isu());
    keepLands(s0, ap, []);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s.objects[ids[0]!]!.tapped = true;
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[yeti]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("a bot pays for the counter", () => {
    const { s: s0, ap, ids } = setup([snowForest()]);
    const yeti = putOnBattlefield(s0, ap, isu());
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const pid = waitingOn(s)!;
      s = s.pending && pid === ap ? run(s, botActions(s, ap)) : act(s, { type: "passPriority", player: pid });
    }
    expect(s.objects[yeti]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Arni Brokenbrow: boast, base power 1 plus the greatest power among other creatures you control", () => {
  it("compiles", () => supported(arni()));

  const boasted = (others: CardDef[]) => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, arni());
    const rest = others.map((d) => putOnBattlefield(s0, ap, d));
    let s = attack(s0, ap, [{ attacker: a, defender: opp }]);
    s = run(s, planActivate(s, ap, a, 0));
    s = settle(s);
    return { s, ap, a, rest };
  };

  it("yes: the greatest other power plus 1, counted as it resolves and locked in; counters still apply on top", () => {
    const { s: s1, ap, a, rest } = boasted([shivan(), bear()]);
    expect(s1.pending?.kind).toBe("chooseMay");
    s1.objects[a]!.counters["+1/+1"] = 1;
    let s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }));
    expect(power(s, s.objects[a]!)).toBe(7); // base 6, plus the counter
    addEffect(s, ap, [rest[0]!], [{ kind: "modifyPT", power: 3, toughness: 0 }]);
    expect(power(s, s.objects[a]!)).toBe(7);
  });

  it("no other creatures: base power 1 (rulings)", () => {
    const { s: s1, ap, a } = boasted([]);
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }));
    expect(power(s, s.objects[a]!)).toBe(1);
  });

  it("a negative greatest power is kept: -3 makes it -2 (rulings)", () => {
    const { s: s1, ap, a, rest } = boasted([bear()]);
    addEffect(s1, ap, [rest[0]!], [{ kind: "modifyPT", power: -5, toughness: 0 }]);
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }));
    expect(power(s, s.objects[a]!)).toBe(-2);
  });

  it("no: its power stays; a bot says yes only for more power", () => {
    const small = boasted([bear()]);
    expect(botActions(small.s, small.ap)).toEqual([{ type: "chooseMay", player: small.ap, yes: false }]);
    const s = settle(act(small.s, { type: "chooseMay", player: small.ap, yes: false }));
    expect(power(s, s.objects[small.a]!)).toBe(3);
    const big = boasted([shivan()]);
    expect(botActions(big.s, big.ap)).toEqual([{ type: "chooseMay", player: big.ap, yes: true }]);
  });

  it("boast only after it attacked this turn", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, arni());
    expect(planActivate(s, ap, a, 0)).toBeNull();
  });
});

describe("Sungold Sentinel: coven, hexproof from the chosen color and can't be blocked by creatures of that color", () => {
  it("compiles", () => supported(sungold()));

  it("only with three creatures of different powers; the color chosen as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const sentinel = putOnBattlefield(s0, ap, sungold());
    putOnBattlefield(s0, ap, bear());
    expect(planActivate(s0, ap, sentinel, 0)).toBeNull();
    putOnBattlefield(s0, ap, shivan());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, sentinel, 0)));
    const pend = s.pending;
    expect(pend?.kind === "chooseOption" && pend.what).toBe("color");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Green" }));
    expect(kw(s, sentinel)).toContain("Hexproof from green");
    const green = putOnBattlefield(s, opp, bear());
    const red = putOnBattlefield(s, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    s = attack(s, ap, [{ attacker: sentinel, defender: opp }]);
    expect(blockProblem(s, s.objects[green]!, s.objects[sentinel]!)).toMatch(/can't be blocked by/);
    expect(blockProblem(s, s.objects[red]!, s.objects[sentinel]!)).toBeNull();
  });
});

describe("Contested Game Ball: the attacking player gains control of it and untaps it", () => {
  it("compiles", () => supported(gameBall()));

  it("dealt combat damage: the attacking player takes it, untapped, once for the step (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const ball = putOnBattlefield(s0, opp, gameBall());
    s0.objects[ball]!.tapped = true;
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Runeclaw Bear" }));
    let s = attack(s0, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    for (let i = 0; i < 200 && !(s.step === "combatDamage" && !s.stack.length && !s.triggerQueue.length && s.log.some((l) => /gains control/.test(l.text))); i++) {
      const pend = s.pending;
      if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pend.player, blocks: [] });
      else if (pend) throw new Error(`unexpected ${pend.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(controllerOf(s, s.objects[ball]!)).toBe(ap);
    expect(s.objects[ball]!.tapped).toBeFalsy();
    expect(s.log.filter((l) => /Contested Game Ball/.test(l.text) && /triggers|ability/.test(l.text)).length).toBeLessThanOrEqual(1);
  });

  it("{2}, {T}: draw and a point counter; at five, sacrificed for a Treasure", () => {
    const { s: s0, ap } = setup([]);
    const ball = putOnBattlefield(s0, ap, gameBall());
    s0.objects[ball]!.counters.point = 3;
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, ball, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[ball]!.counters.point).toBe(4);
    expect(s.objects[ball]!.zone).toBe("battlefield");
    s.objects[ball]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, ball, 0)));
    expect(s.objects[ball]!.zone).toBe("graveyard");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.subtypes.includes("Treasure"))).toBe(true);
  });
});

describe("Become the Pilot: can't be blocked unless it's attacking its owner or a permanent its owner controls", () => {
  it("compiles", () => supported(pilot()));

  const stolen = () => {
    const { s: s0, ap, opp, ids } = setup([pilot()]);
    const theirs = putOnBattlefield(s0, opp, bear(), { sick: false });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    s.objects[theirs]!.controlledSinceTurn = -1;
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    return { s, ap, opp, third, theirs };
  };

  it("attacking its owner: it can be blocked, and it's 4/4", () => {
    const { s: s1, ap, opp, theirs } = stolen();
    const blocker = putOnBattlefield(s1, opp, bear({ name: "Runeclaw Bear" }));
    const s = attack(s1, ap, [{ attacker: theirs, defender: opp }]);
    expect(pt(s, theirs)).toBe("4/4");
    expect(blockProblem(s, s.objects[blocker]!, s.objects[theirs]!)).toBeNull();
  });

  it("attacking another player: it can't be blocked", () => {
    const { s: s1, ap, third, theirs } = stolen();
    const blocker = putOnBattlefield(s1, third, bear({ name: "Runeclaw Bear" }));
    const s = attack(s1, ap, [{ attacker: theirs, defender: third }]);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[theirs]!)).toMatch(/can't be blocked unless/);
  });
});

describe("Spoils of War: X is the number of artifact and/or creature cards in an opponent's graveyard as you cast it", () => {
  it("compiles", () => supported(spoils()));

  const yard = () => {
    const { s, ap, opp, ids } = setup([spoils()]);
    toZone(s, opp, bear(), "graveyard");
    toZone(s, opp, bear(), "graveyard");
    toZone(s, opp, card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2" }), "graveyard");
    toZone(s, opp, card("Mind Stone", "Artifact", "{2}"), "graveyard");
    toZone(s, opp, card("Island", "Basic Land — Island"), "graveyard");
    const mine = putOnBattlefield(s, ap, bear());
    const other = putOnBattlefield(s, ap, bear({ name: "Runeclaw Bear" }));
    return { s, ap, opp, spell: ids[0]!, mine, other };
  };

  it("the opponent is chosen as it's cast; X is set by that graveyard and paid; the counters divided among the targets", () => {
    const { s: s0, ap, opp, spell, mine, other } = yard();
    expect(castProblem(s0, ap, spell, [tgt(mine)], undefined, undefined, undefined, 4)).toMatch(/choose an opponent/);
    expect(castProblem(s0, ap, spell, [tgt(mine)], undefined, undefined, undefined, 3, { xOpponent: opp })).toMatch(/X is 4/);
    const split = [{ kind: "object", id: mine, amount: 3 }, { kind: "object", id: other, amount: 1 }] as TargetChoice[];
    expect(planCast(s0, ap, spell, [{ kind: "object", id: mine, amount: 2 }, { kind: "object", id: other, amount: 1 }] as TargetChoice[], undefined, "auto", undefined, { xOpponent: opp })).toBeNull();
    const plan = planCast(s0, ap, spell, split, undefined, "auto", undefined, { xOpponent: opp });
    const castAct = plan?.find((a) => a.type === "castSpell");
    expect(castAct?.type === "castSpell" && castAct.x).toBe(4);
    let s = run(s0, plan);
    // {4}{B} paid: five of the fourteen lands tapped.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(5);
    s = settle(s);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[other]!.counters["+1/+1"]).toBe(1);
  });

  it("another opponent with an empty graveyard: X is 0", () => {
    const { s, ap, spell } = yard();
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    expect(planCast(s, ap, spell, [], undefined, "auto", undefined, { xOpponent: third })?.find((a) => a.type === "castSpell")).toMatchObject({ xOpponent: third });
    expect(castProblem(s, ap, spell, [], undefined, undefined, undefined, 1, { xOpponent: third })).toMatch(/X is 0/);
    expect(planCast(s, ap, spell, [], undefined, "auto", 1, { xOpponent: third })).toBeNull();
  });

  it("a bot chooses the opponent with the most such cards", () => {
    const { s: s0, ap, opp, spell } = yard();
    // Only the spell to cast (no commander either); the land drop (if any) first, then the spell.
    s0.players[ap]!.command = [];
    const hand = s0.players[ap]!.hand;
    for (const h of hand.filter((h) => h !== spell)) {
      hand.splice(hand.indexOf(h), 1);
      s0.objects[h]!.zone = "library";
      s0.players[ap]!.library.push(h);
    }
    let s = s0;
    let plan = botActions(s, ap);
    for (let i = 0; i < 3 && !plan.some((a) => a.type === "castSpell"); i++) {
      s = settle(run(s, plan));
      plan = botActions(s, ap);
    }
    const castAct = plan.find((a) => a.type === "castSpell" && a.objectId === spell);
    expect(castAct?.type === "castSpell" && castAct.xOpponent).toBe(opp);
    expect(castAct?.type === "castSpell" && castAct.x).toBe(4);
  });
});

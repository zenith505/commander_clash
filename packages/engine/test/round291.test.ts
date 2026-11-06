// Round 291: from the top of the popularity list, names no earlier round looked at.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";
import { putCounters } from "../src/counters";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
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
/** Passes priority (no blocks) until `done`. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 400) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const none = { kind: "none" } as TargetChoice;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);
/** A fresh card object on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
/** Only these cards in `pid`'s hand: the rest go back to the bottom of their library. */
const handOnly = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
  invalidateCharacteristics(s);
};
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Attacks `defender` with `attacker` (no blocks) and passes until `done`. */
const attackUntil = (s0: GameState, ap: PlayerId, attacker: string, defender: PlayerId, done: (s: GameState) => boolean) => {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] } as Action);
  return until(s, done);
};
const instant = (name: string, cost = "{U}") => card(name, "Instant", cost, { oracleText: "Draw a card." });
const sorcery = (name: string, cost = "{U}") => card(name, "Sorcery", cost, { oracleText: "Draw a card." });

// Real oracle text (Scryfall).
const haunt = (): CardDef => ({"oracleId":"7e074b14-0ec8-439b-9b83-5f7c1a904384","name":"Haunt the Network","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose target opponent. Create two 1/1 colorless Thopter artifact creature tokens with flying. Then the chosen player loses X life and you gain X life, where X is the number of artifacts you control.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const kayla = (): CardDef => ({"oracleId":"10c2428f-6e4a-4b92-9087-720242a5c25c","name":"Queen Kayla bin-Kroog","manaCost":"{1}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Human Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble"],"oracleText":"{4}, {T}: Discard all the cards in your hand, then draw that many cards. You may choose an artifact or creature card with mana value 1 you discarded this way, then do the same for artifact or creature cards with mana values 2 and 3. Return those cards to the battlefield. Activate only as a sorcery.","power":"2","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const witch = (): CardDef => ({"oracleId":"8c72d54e-97a6-408e-ae77-18d3c96b3bd8","name":"Scarlet Witch, Chaotic Avenger","manaCost":"{2}{U}{R}","cmc":4,"typeLine":"Legendary Creature — Mutant Warlock Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Warlock","Hero"],"oracleText":"Flying\nWhenever Scarlet Witch deals combat damage to a player, look at the top two cards of your library, then exile them face down. Then you may cast a Hero or noncreature spell from among cards exiled with Scarlet Witch without paying its mana cost.","power":"3","toughness":"3","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Flying"],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const rioter = (): CardDef => ({"oracleId":"5193172c-9024-409e-bd9e-0387971d65fe","name":"Boiling Rock Rioter","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Human Rogue Ally","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue","Ally"],"oracleText":"Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)\nTap an untapped Ally you control: Exile target card from a graveyard.\nWhenever this creature attacks, you may cast an Ally spell from among cards you own exiled with this creature.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Firebending"],"producedMana":["R"],"commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const vault = (): CardDef => ({"oracleId":"480967df-a967-4093-a999-b71f6ee70688","name":"Vault 112: Sadistic Simulation","manaCost":"{2}{U}{R}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Tap up to one target creature and put a stun counter on it. You get {E}{E} (two energy counters).\nIII — Pay any amount of {E}. If you paid one or more {E} this way, shuffle your library, then exile that many cards from the top. You may play one of those cards without paying its mana cost.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const tamiyo = (): CardDef => ({"oracleId":"98a13f7b-ebe7-4a90-a0b9-95dccfff7fa6","name":"The Tale of Tamiyo","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Enchantment — Saga","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI, II, III — Mill two cards. If two cards that share a card type were milled this way, draw a card and repeat this process.\nIV — Exile any number of target instant, sorcery, and/or Tamiyo planeswalker cards from your graveyard. Copy them. You may cast any number of the copies.","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const lazav = (): CardDef => ({"oracleId":"ca60623a-1a98-4153-a0ee-2f34981de5cb","name":"Lazav, Familiar Stranger","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Legendary Creature — Shapeshifter","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Whenever you commit a crime, put a +1/+1 counter on Lazav. Then you may exile a card from a graveyard. If a creature card was exiled this way, you may have Lazav become a copy of that card until end of turn. This ability triggers only once each turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)","power":"1","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const portal = (): CardDef => ({"oracleId":"0dd3127e-de13-4785-b5f2-0af996e9f15f","name":"Portal Manipulator","manaCost":"{2}{W/U}{W/U}","cmc":4,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Flash\nWhen this creature enters during the declare attackers step, choose target player and any number of target attacking creatures their opponents control. Those creatures are now attacking that player.","power":"3","toughness":"2","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Flash"],"commanderLegal":"legal","set":"clu","releasedAt":"2024-02-23","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const uldaros = (): CardDef => ({"oracleId":"020d561b-2e5d-439e-9e6a-318d23e73542","name":"Uldaros Theorix","manaCost":"{3}{U}{B}{B}","cmc":6,"typeLine":"Legendary Creature — Elder Sphinx","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elder","Sphinx"],"oracleText":"Flying\nWhen Uldaros Theorix enters, if you cast him, exile up to one target nonland card of each card type from your graveyard. Copy those cards. You may cast any number of spells with total mana value 6 or less from among the copies without paying their mana costs. (Permanent spells cast this way become tokens.)","power":"5","toughness":"5","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flying"],"commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const riku = (): CardDef => ({"oracleId":"1cfe6e3a-f8c9-4105-ad03-0faf1fcc4626","name":"Riku of Many Paths","manaCost":"{G}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Whenever you cast a modal spell, choose up to X, where X is the number of times you chose a mode for that spell —\n• Exile the top card of your library. Until the end of your next turn, you may play it.\n• Put a +1/+1 counter on Riku. It gains trample until end of turn.\n• Create a 1/1 blue Bird creature token with flying.","power":"3","toughness":"3","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":[],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

describe("round 291", () => {
  it("every card of the round compiles fully", () => {
    supported(haunt(), kayla(), witch(), rioter(), vault(), tamiyo(), lazav(), portal(), uldaros(), riku());
  });
});

describe("Haunt the Network", () => {
  it("two Thopters, then the target opponent loses X life and you gain X, X counting the Thopters", () => {
    const { s: s0, ap, ids, opp } = setup([haunt()]);
    putOnBattlefield(s0, ap, card("Test Relic", "Artifact", "{1}"));
    const [lifeMe, lifeOpp] = [s0.players[ap]!.life, s0.players[opp]!.life];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    const thopters = s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id).startsWith("Thopter"));
    expect(thopters).toHaveLength(2);
    expect(s.players[opp]!.life).toBe(lifeOpp - 3);
    expect(s.players[ap]!.life).toBe(lifeMe + 3);
    // Only the opponent targeted loses life.
    for (const p of s.turnOrder) if (p !== opp && p !== ap) expect(s.players[p]!.life).toBe(s0.players[p]!.life);
  });

  it("targets an opponent, not you", () => {
    const { s: s0, ap, ids } = setup([haunt()]);
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }])).toBeNull();
  });
});

describe("Queen Kayla bin-Kroog", () => {
  const trinket = () => card("Test Trinket", "Artifact", "{1}");
  const ogre = () => card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });
  const giant = () => card("Test Giant", "Creature — Giant", "{3}{R}", { power: "4", toughness: "4" });

  it("discards the hand, draws that many, then returns up to one artifact or creature card of each mana value 1, 2 and 3 discarded", () => {
    const { s: s0, ap, ids } = setup([trinket(), bear({ name: "Test Bear A" }), bear({ name: "Test Bear B" }), ogre(), giant(), instant("Test Quick")]);
    handOnly(s0, ap, ids);
    const me = putOnBattlefield(s0, ap, kayla());
    const libBefore = s0.players[ap]!.library.length;
    let s = settle(run(s0, planActivate(s0, ap, me, 0)));
    // All six discarded, six drawn.
    expect(s.players[ap]!.hand).toHaveLength(6);
    expect(s.players[ap]!.library.length).toBe(libBefore - 6);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, distinctManaValues: true, min: 0, max: 3 });
    const offeredCards = s.pending!.kind === "searchLibrary" ? s.pending.cards : [];
    // Not the mana value 4 creature, not the instant.
    expect([...offeredCards].sort()).toEqual([ids[0], ids[1], ids[2], ids[3]].sort());
    // Two with the same mana value can't both be chosen.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [ids[1]!, ids[2]!] } as Action)).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!, ids[1]!, ids[3]!] } as Action));
    expect([zone(s, ids[0]!), zone(s, ids[1]!), zone(s, ids[3]!)]).toEqual(["battlefield", "battlefield", "battlefield"]);
    expect([zone(s, ids[2]!), zone(s, ids[4]!), zone(s, ids[5]!)]).toEqual(["graveyard", "graveyard", "graveyard"]);
  });

  it("finds the cards a replacement exiled instead of putting them into the graveyard (rulings)", () => {
    const { s: s0, ap, ids } = setup([trinket(), ogre()]);
    handOnly(s0, ap, ids);
    const rip = card("Test Rest in Peace", "Enchantment", "{1}{W}", { oracleText: "If a card or token would be put into a graveyard from anywhere, exile it instead." });
    expect(isFullySupported(rip)).toBe(true);
    putOnBattlefield(s0, ap, rip);
    const me = putOnBattlefield(s0, ap, kayla());
    let s = settle(run(s0, planActivate(s0, ap, me, 0)));
    expect([zone(s, ids[0]!), zone(s, ids[1]!)]).toEqual(["exile", "exile"]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!, ids[1]!] } as Action));
    expect([zone(s, ids[0]!), zone(s, ids[1]!)]).toEqual(["battlefield", "battlefield"]);
  });

  it("with an empty hand it draws nothing and returns nothing", () => {
    const { s: s0, ap } = setup([]);
    handOnly(s0, ap, []);
    const me = putOnBattlefield(s0, ap, kayla());
    const lib = s0.players[ap]!.library.length;
    const s = settle(run(s0, planActivate(s0, ap, me, 0)));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand).toHaveLength(0);
    expect(s.players[ap]!.library.length).toBe(lib);
  });

  it("only as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, kayla());
    const s = passUntil(s0, "beginCombat", ap);
    expect(planActivate(s, ap, me, 0)).toBeNull();
  });
});

describe("Scarlet Witch, Chaotic Avenger", () => {
  const hero = () => card("Test Hero", "Creature — Human Hero", "{1}{R}", { power: "2", toughness: "2" });

  it("combat damage to a player: the top two exiled face down, then a Hero or noncreature spell among them cast free", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, witch());
    const plainBear = onTop(s0, ap, bear({ name: "Test Plain Bear" }));
    const quick = onTop(s0, ap, instant("Test Quick"));
    let s = attackUntil(s0, ap, me, opp, (x) => offered(x).length > 0);
    expect([zone(s, quick), zone(s, plainBear)]).toEqual(["exile", "exile"]);
    // Face down, but you looked at them (CR 406.3).
    expect(s.objects[quick]!.hiddenExile?.seen).toEqual([ap]);
    // The creature that isn't a Hero can't be cast.
    expect(offered(s)).toEqual([quick, "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: quick });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: quick });
    s = run(s, planCast(s, ap, quick));
    expect(s.stack.some((x) => x.objectId === quick)).toBe(true);
  });

  it("cards exiled with it by an earlier trigger can be cast later, a Hero creature too", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, witch());
    const h = onTop(s0, ap, hero());
    onTop(s0, ap, bear({ name: "Test Plain Bear" }));
    let s = attackUntil(s0, ap, me, opp, (x) => offered(x).length > 0);
    expect(offered(s)).toEqual([h, "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(zone(s, h)).toBe("exile");
    // Its next combat damage: the Hero exiled before is still offered, with the two new cards.
    const quick = onTop(s, ap, instant("Test Quick"));
    onTop(s, ap, bear({ name: "Test Other Bear" }));
    s = passUntil(s, "end", ap);
    s = until(s, (x) => x.activePlayer === ap && x.step === "main1" && !x.stack.length && !x.pending);
    s = attackUntil(s, ap, me, opp, (x) => offered(x).length > 0);
    expect([...offered(s)].sort()).toEqual([h, quick, "none"].sort());
  });
});

describe("Boiling Rock Rioter", () => {
  const ally = (name: string) => card(name, "Creature — Human Ally", "{1}{W}", { power: "1", toughness: "1" });

  it("taps an Ally to exile a card from a graveyard; attacking, it may cast an Ally spell you own from among them, paying for it", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, rioter());
    const a1 = putOnBattlefield(s0, ap, ally("Test Ally One"));
    const a2 = putOnBattlefield(s0, ap, ally("Test Ally Two"));
    const mine = inYard(s0, ap, ally("Test Dead Ally"));
    const theirs = inYard(s0, opp, ally("Test Their Ally"));
    let s = settle(run(s0, planActivate(s0, ap, me, 0, [tgt(mine)], undefined, undefined, undefined, { tap: [a1] })));
    s = settle(run(s, planActivate(s, ap, me, 0, [tgt(theirs)], undefined, undefined, undefined, { tap: [a2] })));
    expect([zone(s, mine), zone(s, theirs)]).toEqual(["exile", "exile"]);
    expect(s.objects[a1]!.tapped && s.objects[a2]!.tapped).toBe(true);
    s = attackUntil(s, ap, me, opp, (x) => offered(x).length > 0 || x.step === "combatDamage");
    // Only the Ally card you own.
    expect(offered(s)).toEqual([mine, "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: mine });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: mine, how: "paid" });
    const lands = s.players[ap]!.manaPool;
    void lands;
    s = run(s, planCast(s, ap, mine));
    expect(s.stack.some((x) => x.objectId === mine)).toBe(true);
    expect(zone(s, theirs)).toBe("exile");
  });

  it("the Rioter can tap itself to pay the cost (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, rioter(), { sick: true });
    const dead = inYard(s0, ap, bear({ name: "Test Dead Bear" }));
    const s = settle(run(s0, planActivate(s0, ap, me, 0, [tgt(dead)], undefined, undefined, undefined, { tap: [me] })));
    expect(zone(s, dead)).toBe("exile");
    expect(s.objects[me]!.tapped).toBe(true);
  });
});

describe("Vault 112: Sadistic Simulation", () => {
  it("III: pay any amount of energy; that many cards exiled after a shuffle, one played free (a land as your land play)", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, vault());
    s0.objects[saga]!.counters = { lore: 2 };
    s0.players[ap]!.energy = 3;
    putCounters(s0, s0.objects[saga]!, "lore", 1);
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payEnergy", numberRange: { min: 0, max: 3 } });
    const libBefore = s.players[ap]!.library.length;
    s = act(s, { type: "chooseOption", player: ap, choice: "2" } as Action);
    expect(s.players[ap]!.energy).toBe(1);
    expect(s.players[ap]!.library.length).toBe(libBefore - 2);
    const exiled = s.players[ap]!.exile.filter((id) => s.objects[id]!.zone === "exile");
    expect(exiled).toHaveLength(2);
    const land = exiled.find((id) => characteristics(s, s.objects[id]!).types.includes("Land"));
    const options = offered(s);
    expect(options.length).toBeGreaterThan(1);
    const pick = land && options.includes(land) ? land : options.find((x) => x !== "none")!;
    s = act(s, { type: "chooseOption", player: ap, choice: pick });
    if (s.pending?.kind === "castFree") s = run(s, planCast(s, ap, pick));
    s = settle(s);
    // Only one of them: nothing more is offered, the other stays exiled.
    expect(offered(s)).toEqual([]);
    expect(exiled.filter((id) => s.objects[id]!.zone === "exile")).toHaveLength(1);
  });

  it("III: paying no energy does nothing", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, vault());
    s0.objects[saga]!.counters = { lore: 2 };
    s0.players[ap]!.energy = 3;
    const lib = [...s0.players[ap]!.library];
    putCounters(s0, s0.objects[saga]!, "lore", 1);
    let s = settle(s0);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" } as Action));
    expect(s.players[ap]!.energy).toBe(3);
    expect(s.players[ap]!.library).toEqual(lib);
    expect(s.pending).toBeNull();
  });

  it("I: taps up to one target creature with a stun counter and gives two energy", () => {
    const { s: s0, ap, ids, opp } = setup([vault()]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[theirs]!.counters?.stun).toBe(1);
    expect(s.players[ap]!.energy).toBe(2);
  });
});

describe("The Tale of Tamiyo", () => {
  it("I: mills two; while the two share a card type, draws a card and mills two again", () => {
    const { s: s0, ap, ids } = setup([tamiyo()]);
    // From the top: two creatures (shared), the draw, a creature and an instant (none shared).
    const top = [bear({ name: "Test Bear A" }), bear({ name: "Test Bear B" }), card("Test Drawn", "Sorcery", "{U}", { oracleText: "Draw a card." }), bear({ name: "Test Bear C" }), instant("Test Quick")];
    const lib = [...top].reverse().map((d) => onTop(s0, ap, d)).reverse();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.graveyard).toEqual(expect.arrayContaining([lib[0], lib[1], lib[3], lib[4]]));
    expect(s.players[ap]!.hand).toContain(lib[2]);
    expect(s.objects[ids[0]!]!.counters?.lore).toBe(1);
  });

  it("I: a creature and a land share no card type: one mill only", () => {
    const { s: s0, ap, ids } = setup([tamiyo()]);
    const lib = [bear({ name: "Test Bear A" }), card("Test Land", "Land"), bear({ name: "Test Bear C" })].reverse().map((d) => onTop(s0, ap, d)).reverse();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.graveyard).toEqual(expect.arrayContaining([lib[0], lib[1]]));
    expect(zone(s, lib[2]!)).toBe("library");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("IV: any number of target instant, sorcery and Tamiyo planeswalker cards exiled and copied; the copies cast, paying for them", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, tamiyo());
    s0.objects[saga]!.counters = { lore: 3 };
    const quick = inYard(s0, ap, instant("Test Quick"));
    const slow = inYard(s0, ap, sorcery("Test Slow"));
    const walker = inYard(s0, ap, card("Test Tamiyo", "Legendary Planeswalker — Tamiyo", "{2}{U}", { loyalty: "3" }));
    const beast = inYard(s0, ap, bear());
    putCounters(s0, s0.objects[saga]!, "lore", 1);
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const spec = compileCard(tamiyo()).triggers.find((t) => t.event === "chapter" && t.chapter === 4)!.body.targets[0]!;
    expect(spec.many).toBe("any");
    // The creature card can't be a target.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(beast), none, none] })).toThrow();
    const slots = s.pending!.kind === "chooseTargets" ? (s.pending as { slots?: number }).slots : undefined;
    void slots;
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(quick), tgt(slow), tgt(walker)] });
    s = until(s, (x) => offered(x).length > 0);
    expect([zone(s, quick), zone(s, slow), zone(s, walker)]).toEqual(["exile", "exile", "exile"]);
    expect(offered(s).length).toBe(4);
    const copy = offered(s).find((id) => id !== "none" && nameOf(s, id) === "Test Quick")!;
    s = act(s, { type: "chooseOption", player: ap, choice: copy });
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid" });
    const made = s.pending!.kind === "castFree" ? s.pending.objectId : "";
    expect(nameOf(s, made)).toBe("Test Quick");
    s = run(s, planCast(s, ap, made));
    expect(s.stack.some((x) => x.objectId === made)).toBe(true);
    // The card itself stays exiled.
    expect(zone(s, quick)).toBe("exile");
  });
});

describe("Lazav, Familiar Stranger", () => {
  it("committing a crime: a +1/+1 counter, then a card exiled from a graveyard; a creature card it may copy until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([card("Test Zap", "Instant", "{R}", { oracleText: "Test Zap deals 1 damage to target player." })]);
    const me = putOnBattlefield(s0, ap, lazav());
    const ogre = inYard(s0, opp, card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.objects[me]!.counters?.["+1/+1"]).toBe(1);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [ogre] } as Action);
    expect(zone(s, ogre)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true } as Action));
    const c = characteristics(s, s.objects[me]!);
    expect(c.name).toBe("Test Ogre");
    // 3/3 and its +1/+1 counter.
    expect([c.power, c.toughness]).toEqual([4, 4]);
    // Until end of turn.
    s = passUntil(s, "end", ap);
    s = until(s, (x) => x.activePlayer !== ap);
    expect(nameOf(s, me)).toBe("Lazav, Familiar Stranger");
  });

  it("a noncreature card exiled: no copy; only once each turn", () => {
    const zap = () => card("Test Zap", "Instant", "{R}", { oracleText: "Test Zap deals 1 damage to target player." });
    const { s: s0, ap, ids, opp } = setup([zap(), zap()]);
    const me = putOnBattlefield(s0, ap, lazav());
    const relic = inYard(s0, opp, card("Test Relic", "Artifact", "{1}"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [relic] } as Action));
    expect(s.pending).toBeNull();
    expect(nameOf(s, me)).toBe("Lazav, Familiar Stranger");
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.objects[me]!.counters?.["+1/+1"]).toBe(1);
    expect(s.pending).toBeNull();
  });
});

describe("Portal Manipulator", () => {
  it("entering during the declare attackers step: target attacking creatures now attack the target player", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const a1 = putOnBattlefield(s0, ap, bear({ name: "Test Attacker One" }));
    const a2 = putOnBattlefield(s0, ap, bear({ name: "Test Attacker Two" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] } as Action);
    // The defending player flashes it in.
    const pm = inHand(s, opp, portal());
    for (const l of ["Plains", "Island", "Plains", "Island"]) putOnBattlefield(s, opp, card(l, `Basic Land — ${l}`));
    s = until(s, (x) => waitingOn(x) === opp && !x.pending);
    s = run(s, planCast(s, opp, pm));
    s = until(s, (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: opp });
    // The creatures' controller can't be the player they now attack.
    expect(() => act(s, { type: "chooseTargets", player: opp, targets: [{ kind: "player", id: ap }, tgt(a1), none] })).toThrow();
    // A bot sends both at the other player with the most life.
    const bot = botActions(s, opp)[0]!;
    expect(bot.type === "chooseTargets" && bot.targets.slice(1).map((t) => (t.kind === "object" ? t.id : "")).sort()).toEqual([a1, a2].sort());
    expect(bot.type === "chooseTargets" && bot.targets[0]!.kind === "player" && bot.targets[0]!.id).not.toBe(ap);
    s = act(s, { type: "chooseTargets", player: opp, targets: [{ kind: "player", id: third }, tgt(a1), none] });
    s = until(s, (x) => !x.stack.length);
    expect(s.objects[a1]!.attacking).toBe(third);
    expect(s.objects[a2]!.attacking).toBe(opp);
  });

  it("outside the declare attackers step it doesn't trigger (rulings)", () => {
    const { s: s0, ap, ids } = setup([portal()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });
});

describe("Uldaros Theorix", () => {
  it("cast: up to one nonland card of each card type exiled from your graveyard and copied; copies with total mana value 6 or less cast free", () => {
    const { s: s0, ap, ids } = setup([uldaros()]);
    const quick = inYard(s0, ap, instant("Test Quick", "{1}{U}"));
    const slow = inYard(s0, ap, sorcery("Test Slow", "{2}{U}{U}"));
    const ogre = inYard(s0, ap, card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
    const relic = inYard(s0, ap, card("Test Relic", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }));
    const land = inYard(s0, ap, card("Test Land", "Land"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Slots in card type order: artifact, battle, creature, enchantment, instant, kindred, planeswalker, sorcery. The
    // artifact creature card can't be chosen twice, nor a land.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(relic), none, tgt(relic), none, tgt(quick), none, none, tgt(slow)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(land), none, tgt(ogre), none, tgt(quick), none, none, tgt(slow)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(relic), none, tgt(ogre), none, tgt(quick), none, none, tgt(slow)] });
    s = until(s, (x) => offered(x).length > 0);
    expect([zone(s, relic), zone(s, ogre), zone(s, quick), zone(s, slow)]).toEqual(["exile", "exile", "exile", "exile"]);
    const copyOf = (name: string) => offered(s).find((id) => id !== "none" && nameOf(s, id) === name)!;
    // The 4-mana sorcery first: 2 left.
    s = act(s, { type: "chooseOption", player: ap, choice: copyOf("Test Slow") });
    expect(s.pending).toMatchObject({ kind: "castFree" });
    s = run(s, planCast(s, ap, (s.pending as { objectId: string }).objectId));
    // Only the 2-mana instant fits now.
    expect(offered(s).map((id) => (id === "none" ? id : nameOf(s, id)))).toEqual(["Test Quick", "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: copyOf("Test Quick") });
    s = run(s, planCast(s, ap, (s.pending as { objectId: string }).objectId));
    expect(offered(s)).toEqual([]);
    expect(s.stack.filter((x) => x.kind === "spell").map((x) => x.description)).toEqual(expect.arrayContaining(["Test Slow", "Test Quick"]));
  });

  it("put onto the battlefield without being cast, it does nothing", () => {
    const { s: s0, ap } = setup([]);
    inYard(s0, ap, instant("Test Quick"));
    const me = putOnBattlefield(s0, ap, uldaros());
    void me;
    expect(s0.triggerQueue).toHaveLength(0);
  });
});

describe("Riku of Many Paths", () => {
  const charm = () => card("Test Charm", "Sorcery", "{1}", { oracleText: "Choose one or more —\n• You gain 1 life.\n• You gain 2 life.\n• You gain 3 life." });

  it("casting a modal spell: choose up to as many of its modes as you chose for that spell", () => {
    const { s: s0, ap, ids } = setup([charm()]);
    const me = putOnBattlefield(s0, ap, riku());
    let s = run(s0, planCast(s0, ap, ids[0]!, [], [0, 2]));
    s = until(s, (x) => x.pending?.kind === "chooseModes");
    if (s.pending?.kind !== "chooseModes") throw new Error("no modes");
    expect(s.pending.max).toBe(2);
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [0, 1, 2] })).toThrow();
    s = act(s, { type: "chooseModes", player: ap, modes: [1, 2] });
    s = settle(s);
    expect(s.objects[me]!.counters["+1/+1"]).toBe(1);
    expect(characteristics(s, s.objects[me]!).keywords.map((k) => k.toLowerCase())).toContain("trample");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id).startsWith("Bird"))).toHaveLength(1);
  });

  it("a spree spell is modal: X is the modes paid for", () => {
    const spree = card("Test Spree", "Sorcery", "{1}", { oracleText: "Spree (Choose one or more additional costs.)\n+ {1} — You gain 1 life.\n+ {1} — You gain 2 life." });
    expect(isFullySupported(spree)).toBe(true);
    const { s: s0, ap, ids } = setup([spree]);
    putOnBattlefield(s0, ap, riku());
    let s = run(s0, planCast(s0, ap, ids[0]!, [], [0, 1]));
    s = until(s, (x) => x.pending?.kind === "chooseModes");
    if (s.pending?.kind !== "chooseModes") throw new Error("no modes");
    expect(s.pending.max).toBe(2);
  });

  it("a spell that isn't modal doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([sorcery("Test Plain", "{1}")]);
    putOnBattlefield(s0, ap, riku());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });

  it("a bot chooses no more than X", () => {
    const { s: s0, ap, ids } = setup([charm()]);
    putOnBattlefield(s0, ap, riku());
    let s = run(s0, planCast(s0, ap, ids[0]!, [], [1]));
    s = until(s, (x) => x.pending?.kind === "chooseModes");
    const a = botActions(s, ap)[0]!;
    expect(a.type === "chooseModes" && a.modes.length).toBe(1);
  });
});

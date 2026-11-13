// Lane B round B197: Phyrexian Devourer ("When this creature's power is 7 or greater, sacrifice it." "Exile the top card
// of your library: Put X +1/+1 counters on this creature, where X is the exiled card's mana value."), Lighthouse
// Chronologist (level up; "LEVEL 7+ ... At the beginning of each end step, if it's not your turn, take an extra turn after
// this one."), Chandra's Phoenix ("Whenever an opponent is dealt damage by a red instant or sorcery spell you control or by
// a red planeswalker you control, return this card from your graveyard to your hand."), Abby, Merciless Soldier ("When you
// cast this spell, create a number of 1/1 black Fungus Zombie creature tokens named Cordyceps Infected equal to the amount
// of mana spent to cast it." "Abby enters under the control of an opponent of your choice."), Jocasta, Automaton Avenger
// ("Whenever you attack with your commander, if this card is in your graveyard, you may return it to the battlefield
// tapped and attacking."), Fight for the Throne ("... Then it fights target creature an opponent controls. When the
// creature an opponent controls dies this turn, if you control your commander, you become the monarch.") and Outmaneuver
// ("X target blocked creatures assign their combat damage this turn as though they weren't blocked.").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const devourer = (): CardDef => ({"oracleId":"28b1ed69-784c-4642-86c7-104792d5afc2","name":"Phyrexian Devourer","manaCost":"{6}","cmc":6,"typeLine":"Artifact Creature — Phyrexian Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Construct"],"oracleText":"When this creature's power is 7 or greater, sacrifice it.\nExile the top card of your library: Put X +1/+1 counters on this creature, where X is the exiled card's mana value.","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/1/319430fa-11e4-426e-8297-67df8474c3cc.jpg?1783947161","artUrl":"https://cards.scryfall.io/art_crop/front/3/1/319430fa-11e4-426e-8297-67df8474c3cc.jpg?1783947161","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chrono = (): CardDef => ({"oracleId":"b19ff0dd-2041-461f-aa62-6dc273e4bbe5","name":"Lighthouse Chronologist","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Level up {U} ({U}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 4-6\n2/4\nLEVEL 7+\n3/5\nAt the beginning of each end step, if it's not your turn, take an extra turn after this one.","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Level Up"],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/3087f7e7-9163-45b5-907d-7667c1075a74.jpg?1783941994","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/3087f7e7-9163-45b5-907d-7667c1075a74.jpg?1783941994","commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"mythic","layout":"leveler","gameChanger":false}) as CardDef;
const phoenix = (): CardDef => ({"oracleId":"65ddd04c-7207-4f6c-ae1b-c5e02a520a51","name":"Chandra's Phoenix","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Phoenix","supertypes":[],"types":["Creature"],"subtypes":["Phoenix"],"oracleText":"Flying\nHaste (This creature can attack and {T} as soon as it comes under your control.)\nWhenever an opponent is dealt damage by a red instant or sorcery spell you control or by a red planeswalker you control, return this card from your graveyard to your hand.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e8371c83-d7c5-4432-8511-cb3c1dc7d59f.jpg?1783941073","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e8371c83-d7c5-4432-8511-cb3c1dc7d59f.jpg?1783941073","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const abby = (): CardDef => ({"oracleId":"e05efd01-0202-4bd6-bac6-c6210819d463","name":"Abby, Merciless Soldier","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Legendary Creature — Human Survivor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Survivor"],"oracleText":"When you cast this spell, create a number of 1/1 black Fungus Zombie creature tokens named Cordyceps Infected equal to the amount of mana spent to cast it.\nAbby enters under the control of an opponent of your choice.\nPartner—Survivors (You can have two commanders if both have this ability.)","power":"4","toughness":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/2/8/28e11b59-c677-4235-a377-18921c5131f0.jpg?1783905138","artUrl":"https://cards.scryfall.io/art_crop/front/2/8/28e11b59-c677-4235-a377-18921c5131f0.jpg?1783905138","commanderLegal":"legal","set":"sld","releasedAt":"2025-10-27","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const jocasta = (): CardDef => ({"oracleId":"787e6a7b-64f9-48ba-bccd-68dda3489b0f","name":"Jocasta, Automaton Avenger","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact Creature — Robot Hero","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot","Hero"],"oracleText":"Flying\nWhenever your commander deals combat damage to a player, put a +1/+1 counter on Jocasta.\nWhenever you attack with your commander, if this card is in your graveyard, you may return it to the battlefield tapped and attacking.","power":"2","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/f/6/f666e211-0d80-4f01-b206-dac19bcbcfa7.jpg?1783903267","artUrl":"https://cards.scryfall.io/art_crop/front/f/6/f666e211-0d80-4f01-b206-dac19bcbcfa7.jpg?1783903267","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const throne = (): CardDef => ({"oracleId":"53129de9-4809-4c8c-9d11-37369899e70a","name":"Fight for the Throne","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put a +1/+1 counter on target creature you control. Then it fights target creature an opponent controls. When the creature an opponent controls dies this turn, if you control your commander, you become the monarch.","colors":["G"],"colorIdentity":["G"],"keywords":["Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6da747ef-4d8f-49a2-8682-52ab87e6ad6e.jpg?1783903281","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6da747ef-4d8f-49a2-8682-52ab87e6ad6e.jpg?1783903281","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const outmaneuver = (): CardDef => ({"oracleId":"42b44108-4a03-4333-bf5a-e42493f4d5e4","name":"Outmaneuver","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"X target blocked creatures assign their combat damage this turn as though they weren't blocked.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a5a69fa-71ff-4e4f-9406-7cfebccb3384.jpg?1783946326","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a5a69fa-71ff-4e4f-9406-7cfebccb3384.jpg?1783946326","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const ptOf = (s: GameState, id: ObjectId) => `${characteristics(s, s.objects[id]!).power}/${characteristics(s, s.objects[id]!).toughness}`;
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;

const vanilla = (name: string, typeLine: string, manaCost: string, mv: number, p: number, t: number, oracleText = "") => card(name, typeLine, manaCost, { cmc: mv, power: String(p), toughness: String(t), oracleText });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const zap = card("Test Zap", "Instant", "{U}", { cmc: 1, oracleText: "Test Zap deals 1 damage to any target." });
const sixDrop = card("Test Six Drop", "Sorcery", "{4}{R}{R}", { cmc: 6, oracleText: "Draw a card." });
const walker = (name: string, cost: string) => card(name, "Legendary Planeswalker — Chandra", cost, { cmc: 2, loyalty: "5", oracleText: `−1: ${name} deals 2 damage to target player.` });

describe("Phyrexian Devourer", () => {
  it("puts counters equal to the exiled card's mana value; at power 7 or greater it's sacrificed (CR 603.8)", () => {
    supported(devourer());
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, devourer());
    const six = into(s0, ap, sixDrop, "library");
    let s = run(s0, planActivate(s0, ap, d, 0));
    expect(zoneOf(s, six)).toBe("exile");
    // Still on the stack: the cost is paid, no counters yet.
    expect(ptOf(s, d)).toBe("1/1");
    s = settle(s);
    expect(zoneOf(s, d)).toBe("graveyard");
    expect(s.log.some((e) => /Phyrexian Devourer/.test(e.text) && /sacrifice/i.test(e.text))).toBe(true);
  });

  it("a land is mana value 0; below 7 it stays; the trigger happens once while on the stack, and it's sacrificed anyway", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, devourer());
    const land = into(s0, ap, card("Test Waste", "Land"), "library");
    let s = settle(run(s0, planActivate(s0, ap, d, 0)));
    expect(zoneOf(s, land)).toBe("exile");
    expect(ptOf(s, d)).toBe("1/1");
    into(s, ap, card("Test Three Drop", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Draw a card." }), "library");
    s = settle(run(s, planActivate(s, ap, d, 0)));
    expect([zoneOf(s, d), ptOf(s, d)]).toEqual(["battlefield", "4/4"]);
    // Three more: 7/7, the state trigger goes on the stack; activating again in response doesn't trigger it a second time.
    into(s, ap, card("Test Other Three", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Draw a card." }), "library");
    s = run(s, planActivate(s, ap, d, 0));
    for (let i = 0; i < 4 && !s.stack.some((x) => x.kind === "ability" && /sacrifice/i.test(x.description)); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(ptOf(s, d)).toBe("7/7");
    expect(s.stack.filter((x) => /sacrifice/i.test(x.description))).toHaveLength(1);
    into(s, ap, card("Test Two Drop", "Sorcery", "{1}{R}", { cmc: 2, oracleText: "Draw a card." }), "library");
    s = run(s, planActivate(s, ap, d, 0));
    for (let i = 0; i < 8 && s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(ptOf(s, d)).toBe("9/9");
    expect(s.stack.filter((x) => /sacrifice/i.test(x.description))).toHaveLength(1);
    s = settle(s);
    expect(zoneOf(s, d)).toBe("graveyard");
  });

  it("can't be activated with an empty library (CR 118.3)", () => {
    const { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, devourer());
    for (const id of [...s.players[ap]!.library]) {
      s.objects[id]!.zone = "exile";
      s.players[ap]!.exile.push(id);
    }
    s.players[ap]!.library = [];
    expect(planActivate(s, ap, d, 0)).toBeNull();
  });
});

describe("Lighthouse Chronologist", () => {
  const throughTurn = (s: GameState) => {
    const turn = s.turn;
    for (let i = 0; i < 3000 && s.turn === turn; i++) {
      const pid = waitingOn(s)!;
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: pid });
    }
    return s;
  };

  it("at level 7, at the end step of each other player's turn, you take an extra turn after it", () => {
    supported(chrono());
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chrono());
    s0.objects[c]!.counters = { level: 7 };
    invalidateCharacteristics(s0);
    expect(ptOf(s0, c)).toBe("3/5");
    const b = next(s0, ap);
    // Your own turn: nothing (it's your turn).
    let s = throughTurn(s0);
    expect(s.activePlayer).toBe(b);
    s = throughTurn(s);
    // B's end step gave you a turn: then C's turn as usual (an extra turn doesn't change the order, CR 500.7).
    expect(s.activePlayer).toBe(ap);
    s = throughTurn(s);
    expect(s.activePlayer).toBe(next(s0, b));
  });

  it("below level 7 it does nothing; level up is sorcery speed {U}", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chrono());
    s0.objects[c]!.counters = { level: 6 };
    invalidateCharacteristics(s0);
    expect(ptOf(s0, c)).toBe("2/4");
    const b = next(s0, ap);
    let s = throughTurn(throughTurn(s0));
    expect(s.activePlayer).toBe(next(s0, b));
    const { s: t0, ap: ap2 } = setup([]);
    const c2 = putOnBattlefield(t0, ap2, chrono());
    const t = settle(run(t0, planActivate(t0, ap2, c2, 0)));
    expect(t.objects[c2]!.counters.level).toBe(1);
  });
});

describe("Chandra's Phoenix", () => {
  it("returns from your graveyard to your hand when your red instant deals damage to an opponent", () => {
    supported(phoenix());
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const ph = into(s0, ap, phoenix(), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(37);
    expect(zoneOf(s, ph)).toBe("hand");
  });

  it("not for a blue spell, damage to you or to a creature, or another player's red spell", () => {
    const { s: s0, ap, ids, opp } = setup([zap, bolt]);
    const ph = into(s0, ap, phoenix(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(zoneOf(s, ph)).toBe("graveyard");
    const bear = putOnBattlefield(s, opp, vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 2, 4));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bear)])));
    expect(zoneOf(s, ph)).toBe("graveyard");
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([bolt]);
    const ph2 = into(t0, ap2, phoenix(), "graveyard");
    let t = settle(run(t0, planCast(t0, ap2, ids2[0]!, [{ kind: "player", id: ap2 }])));
    expect(zoneOf(t, ph2)).toBe("graveyard");
    // An opponent's Phoenix: the spell isn't theirs.
    const theirs = into(t, opp2, phoenix(), "graveyard");
    const b2 = into(t, ap2, bolt, "hand");
    t = settle(run(t, planCast(t, ap2, b2, [{ kind: "player", id: next(t, opp2) }])));
    expect(zoneOf(t, theirs)).toBe("graveyard");
  });

  it("returns when your red planeswalker deals damage to an opponent, not a blue one or a red creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const ph = into(s0, ap, phoenix(), "graveyard");
    const blue = putOnBattlefield(s0, ap, walker("Test Blue Walker", "{U}{U}"));
    s0.objects[blue]!.counters = { loyalty: 5 };
    let s = settle(run(s0, planActivate(s0, ap, blue, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(38);
    expect(zoneOf(s, ph)).toBe("graveyard");
    const red = putOnBattlefield(s, ap, walker("Test Red Walker", "{R}{R}"));
    s.objects[red]!.counters = { loyalty: 5 };
    invalidateCharacteristics(s);
    s = settle(run(s, planActivate(s, ap, red, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(36);
    expect(zoneOf(s, ph)).toBe("hand");
  });

  it("not for a red creature's combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const ph = into(s0, ap, phoenix(), "graveyard");
    const goblin = putOnBattlefield(s0, ap, vanilla("Test Goblin", "Creature — Goblin", "{R}", 1, 2, 2));
    let s = passUntil(s0, "declareAttackers", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: goblin, defender: opp }] });
    s = passUntil(s, "end", ap);
    expect(s.players[opp]!.life).toBe(38);
    expect(zoneOf(s, ph)).toBe("graveyard");
  });
});

describe("Abby, Merciless Soldier", () => {
  it("its cast trigger makes a Cordyceps Infected for each mana spent, under your control; Abby enters under an opponent's", () => {
    supported(abby());
    const { s: s0, ap, ids, opp } = setup([abby()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // The cast trigger resolves first (CR 603.3), Abby still on the stack.
    for (let i = 0; i < 10 && !s.pending && s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const zombies = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(zombies).toHaveLength(3);
    for (const z of zombies) {
      const c = characteristics(s, s.objects[z]!);
      expect([s.cards[s.objects[z]!.cardId]?.name ?? "", controllerOf(s, s.objects[z]!), `${c.power}/${c.toughness}`, c.colors, c.subtypes]).toEqual(["Cordyceps Infected", ap, "1/1", ["B"], ["Fungus", "Zombie"]]);
    }
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "controlOpponent", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    expect([zoneOf(s, ids[0]!), s.objects[ids[0]!]!.controller, s.objects[ids[0]!]!.owner]).toEqual(["battlefield", opp, ap]);
  });
});

describe("Jocasta, Automaton Avenger", () => {
  it("returns from your graveyard tapped and attacking when you attack with your commander", () => {
    supported(jocasta());
    const { s: s0, ap, opp } = setup([]);
    const j = into(s0, ap, jocasta(), "graveyard");
    const cmdr = putOnBattlefield(s0, ap, vanilla("Test Commander Bear", "Legendary Creature — Bear", "{1}{G}", 2, 2, 2), { commander: true });
    let s = passUntil(s0, "declareAttackers", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmdr, defender: opp }] });
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Which player it attacks, if asked (CR 508.4).
    for (let i = 0; i < 5 && s.pending?.kind === "chooseOption"; i++) s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    s = settle(s);
    const o = s.objects[j]!;
    expect([o.zone, o.tapped, o.attacking]).toEqual(["battlefield", true, opp]);
    s = passUntil(s, "end", ap);
    expect(s.players[opp]!.life).toBe(36);
    // Its first ability: the commander dealt combat damage to a player.
    expect(s.objects[j]!.counters["+1/+1"]).toBe(1);
  });

  it("not when you attack without your commander", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = into(s0, ap, jocasta(), "graveyard");
    const bear = putOnBattlefield(s0, ap, vanilla("Test Plain Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    let s = passUntil(s0, "declareAttackers", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    s = settle(s);
    expect(s.pending?.kind).not.toBe("chooseMay");
    expect(zoneOf(s, j)).toBe("graveyard");
  });
});

describe("Fight for the Throne", () => {
  it("you become the monarch when the creature it fought dies this turn, if you control your commander", () => {
    supported(throne());
    const { s: s0, ap, ids, opp } = setup([throne()]);
    putOnBattlefield(s0, ap, vanilla("Test Commander Bear", "Legendary Creature — Bear", "{1}{G}", 2, 2, 2), { commander: true });
    const mine = putOnBattlefield(s0, ap, vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const theirs = putOnBattlefield(s0, opp, vanilla("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3, 3));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)])));
    // The counter made it a 3/3 before the fight: both die (3 damage each).
    expect([zoneOf(s, theirs), zoneOf(s, mine)]).toEqual(["graveyard", "graveyard"]);
    expect(s.monarch).toBe(ap);
  });

  it("later that turn too; not without your commander (CR 603.4)", () => {
    const { s: s0, ap, ids, opp } = setup([throne(), bolt]);
    putOnBattlefield(s0, ap, vanilla("Test Commander Bear", "Legendary Creature — Bear", "{1}{G}", 2, 2, 2), { commander: true });
    const mine = putOnBattlefield(s0, ap, vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const theirs = putOnBattlefield(s0, opp, vanilla("Test Wall", "Creature — Wall", "{2}{W}", 3, 0, 6));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)])));
    expect(zoneOf(s, theirs)).toBe("battlefield");
    expect(s.monarch).toBeUndefined();
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(theirs)])));
    expect(zoneOf(s, theirs)).toBe("graveyard");
    expect(s.monarch).toBe(ap);

    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([throne()]);
    const mine2 = putOnBattlefield(t0, ap2, vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const theirs2 = putOnBattlefield(t0, opp2, vanilla("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3, 3));
    const t = settle(run(t0, planCast(t0, ap2, ids2[0]!, [tgt(mine2), tgt(theirs2)])));
    expect(zoneOf(t, theirs2)).toBe("graveyard");
    expect(t.monarch).toBeUndefined();
  });
});

describe("Outmaneuver", () => {
  const combat = (hand: CardDef[]) => {
    const { s: s0, ap, ids, opp } = setup(hand);
    const big = putOnBattlefield(s0, ap, vanilla("Test Brute", "Creature — Ogre", "{3}{R}", 4, 4, 4));
    const small = putOnBattlefield(s0, ap, vanilla("Test Runt", "Creature — Goblin", "{R}", 1, 2, 2));
    const wall = putOnBattlefield(s0, opp, vanilla("Test Wall", "Creature — Wall", "{2}{W}", 3, 1, 6));
    const wall2 = putOnBattlefield(s0, opp, vanilla("Test Other Wall", "Creature — Wall", "{2}{W}", 3, 0, 6));
    let s = passUntil(s0, "declareAttackers", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: opp }, { attacker: small, defender: opp }] });
    for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [{ blocker: wall, attacker: big }, { blocker: wall2, attacker: small }] });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, ids, opp, big, small, wall, wall2 };
  };

  it("the X targets assign all their combat damage to the player they attack; the others don't (CR 510.1c)", () => {
    supported(outmaneuver());
    const { s: s0, ap, ids, opp, big, small, wall, wall2 } = combat([outmaneuver()]);
    expect(s0.step).toBe("declareBlockers");
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)], undefined, undefined, 1)));
    s = passUntil(s, "end", ap);
    expect(s.players[opp]!.life).toBe(life - 4);
    expect([s.objects[wall]!.damage, s.objects[wall2]!.damage]).toEqual([0, 2]);
    // The blocker still deals its damage to the attacker.
    expect(s.objects[big]!.damage).toBe(1);
    expect(zoneOf(s, small)).toBe("battlefield");
  });

  it("even if the blocker is gone by then (rulings); X 2 takes both; an unblocked creature isn't a legal target", () => {
    const { s: s0, ap, ids, opp, big, small, wall } = combat([outmaneuver(), bolt]);
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big), tgt(small)], undefined, undefined, 2)));
    // Remove the 1/6 blocker: give it lethal damage with two bolts' worth.
    s.objects[wall]!.damage = 3;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(wall)])));
    expect(zoneOf(s, wall)).toBe("graveyard");
    s = passUntil(s, "end", ap);
    expect(s.players[opp]!.life).toBe(life - 6);

    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([outmaneuver()]);
    const lone = putOnBattlefield(t0, ap2, vanilla("Test Lone", "Creature — Goblin", "{R}", 1, 2, 2));
    let t = passUntil(t0, "declareAttackers", ap2);
    for (let i = 0; i < 20 && t.pending?.kind !== "declareAttackers"; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    t = act(t, { type: "declareAttackers", player: ap2, attacks: [{ attacker: lone, defender: opp2 }] });
    for (let i = 0; i < 40 && (t.step !== "declareBlockers" || t.pending?.kind === "declareBlockers"); i++) {
      const p = t.pending;
      t = p?.kind === "declareBlockers" ? act(t, { type: "declareBlockers", player: p.player, blocks: [] }) : act(t, { type: "passPriority", player: waitingOn(t)! });
    }
    for (let i = 0; i < 10 && waitingOn(t) !== ap2; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(planCast(t, ap2, ids2[0]!, [tgt(lone)], undefined, undefined, 1)).toBeNull();
  });
});

// Round 401 (Lane A): Mairsil, the Pretender (the activated abilities of cards you own in exile with cage counters, each
// instance once each turn, CR 602.5b and rulings), Kylox's Voltstrider (spells cast from the cards its collect evidence
// cost exiled, CR 607.2a, put on the bottom of their owner's library instead of a graveyard, CR 614.1a), and Ogre
// Battlecaster's cast from your graveyard as its attack trigger resolves, paying {R}{R} in
// addition to the spell's other costs (CR 118.8, 601.2f), and its reflexive "when you cast that spell" (CR 603.12).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf } from "../src/cards";
import { manaAbilitiesOn } from "../src/manaabilities";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, manaValue, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const ogre = (): CardDef => ({"oracleId":"00ba0c24-a671-493e-ba46-13e45d1818f1","name":"Ogre Battlecaster","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre Shaman","supertypes":[],"types":["Creature"],"subtypes":["Ogre","Shaman"],"oracleText":"First strike\nWhenever this creature attacks, you may cast target instant or sorcery card from your graveyard by paying {R}{R} in addition to its other costs. If that spell would be put into a graveyard, exile it instead. When you cast that spell, this creature gets +X/+0 until end of turn, where X is that spell's mana value.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/298f1ab2-4c66-4d91-8f6a-1bad230632df.jpg?1783919183","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/298f1ab2-4c66-4d91-8f6a-1bad230632df.jpg?1783919183","commanderLegal":"legal","set":"j22","releasedAt":"2022-12-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const mairsil = (): CardDef => ({"oracleId":"ed5fbae0-2dca-44a5-84dc-62674b3a92a6","name":"Mairsil, the Pretender","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When Mairsil enters, you may exile an artifact or creature card from your hand or graveyard and put a cage counter on it.\nMairsil has all activated abilities of all cards you own in exile with cage counters on them. You may activate each of those abilities only once each turn.","power":"4","toughness":"4","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/87b71b08-668c-4b32-8243-8def1a9acf26.jpg?1783935936","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/87b71b08-668c-4b32-8243-8def1a9acf26.jpg?1783935936","commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const monolith = (): CardDef => ({"oracleId":"6b8cf2a0-b045-4d91-9d91-c602d40c6237","name":"Basalt Monolith","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/7770e48e-72e1-4475-a4b5-c1c561a1beaa.jpg?1783939641","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/7770e48e-72e1-4475-a4b5-c1c561a1beaa.jpg?1783939641","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const kylox = (): CardDef => ({"oracleId":"e7b746c8-1b32-42ed-8328-4e16274209d8","name":"Kylox's Voltstrider","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Collect evidence 6: This Vehicle becomes an artifact creature until end of turn.\nWhenever this Vehicle attacks, you may cast an instant or sorcery spell from among cards exiled with it. If that spell would be put into a graveyard, put it on the bottom of its owner's library instead.\nCrew 2","power":"4","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Collect evidence","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/86a8a1af-b1cf-47fc-ab42-7efa07a1c95b.jpg?1783912844","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86a8a1af-b1cf-47fc-ab42-7efa07a1c95b.jpg?1783912844","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: ObjectId) => `${ch(s, id).power}/${ch(s, id).toughness}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** Passes to `ap`'s attackers, attacks `opp` with `attacker` and stops at the trigger's target choice. */
const attackWith = (s: GameState, ap: PlayerId, opp: PlayerId, attacker: ObjectId) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
};
const until = (s: GameState, me: PlayerId, kind: string) => {
  for (let i = 0; i < 300; i++) {
    if (s.pending?.player === me && s.pending.kind === kind) return s;
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) throw new Error(`stopped on ${p.kind} ${JSON.stringify(p).slice(0, 300)}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`no ${kind}`);
};

describe("round 401: parse", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [ogre(), mairsil(), kylox()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 401: Ogre Battlecaster", () => {
  it("attacking, casts Lightning Bolt from your graveyard for {R} plus {R}{R}; it gets +1/+0 and the Bolt is exiled after", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ogre());
    const b = toYard(s0, ap, bolt());
    let s = attackWith(s0, ap, opp, o);
    s = until(s, ap, "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] });
    s = until(s, ap, "castFree");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b, how: "paid", addedMana: "{R}{R}" });
    // The total cost is the Bolt's {R} and {R}{R} more (CR 601.2f).
    const c = spellCost(s, ap, s.objects[b]!);
    expect(manaValue(c.cost) + c.extra).toBe(3);
    expect(c.cost.symbols.filter((y) => y.kind === "colored" && y.color === "R").length).toBe(3);
    s.players[ap]!.manaPool.R = 3;
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, b, [{ kind: "player", id: opp }]));
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
    // The reflexive trigger goes on the stack above the Bolt (CR 603.12, 603.3) and resolves first.
    expect(s.stack.at(-1)?.kind).not.toBe("spell");
    s = settle(s, ap);
    expect(pt(s, o)).toBe("4/3");
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, b)).toBe("exile");
  });

  it("a sorcery is cast during combat, its timing ignored (rulings), and its mana value is the X: +5/+0 for Lava Axe", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ogre());
    const axe = toYard(s0, ap, lavaAxe());
    let s = attackWith(s0, ap, opp, o);
    s = until(s, ap, "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: axe }] });
    s = until(s, ap, "castFree");
    Object.assign(s.players[ap]!.manaPool, { R: 3, C: 4 });
    s = run(s, planCast(s, ap, axe, [{ kind: "player", id: opp }]));
    s = settle(s, ap);
    expect(pt(s, o)).toBe("8/3");
    expect(zone(s, axe)).toBe("exile");
  });

  it("declined: nothing is cast, the card stays in the graveyard and the Ogre isn't pumped", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ogre());
    const b = toYard(s0, ap, bolt());
    let s = attackWith(s0, ap, opp, o);
    s = until(s, ap, "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] });
    s = until(s, ap, "castFree");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(zone(s, b)).toBe("graveyard");
    expect(pt(s, o)).toBe("3/3");
  });

  it("the added {R}{R} applies only to the card it targeted, not to another spell cast meanwhile", () => {
    const { s: s0, ap } = setup([]);
    const b = toYard(s0, ap, bolt());
    const other = toYard(s0, ap, bolt());
    s0.pending = { kind: "castFree", player: ap, objectId: b, source: "Ogre Battlecaster", how: "paid", addedMana: "{R}{R}" };
    const c = spellCost(s0, ap, s0.objects[other]!);
    expect(manaValue(c.cost) + c.extra).toBe(1);
  });
});

/** A card in `pid`'s exile with a cage counter on it, as Mairsil's enters ability leaves it. */
const caged = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  s.objects[id]!.counters.cage = 1;
  s.players[pid]!.exile.push(id);
  invalidateCharacteristics(s);
  return id;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = toYard(s, pid, def);
  s.players[pid]!.graveyard.splice(s.players[pid]!.graveyard.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const abilityIndexes = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.flatMap((a, i) => (re.test(a.text) ? [i] : []));

describe("round 401: Mairsil, the Pretender", () => {
  it("entering, exiles an artifact or creature card from your graveyard with a cage counter, and has its activated abilities", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = toHand(s0, ap, mairsil());
    const pyro = toYard(s0, ap, pyromancer());
    toYard(s0, ap, bolt());
    Object.assign(s0.players[ap]!.manaPool, { U: 1, B: 1, R: 1, C: 1 });
    let s = run(s0, planCast(s0, ap, m));
    s = until(s, ap, "searchLibrary");
    // Only the artifact and creature cards, from the hand and the graveyard: not the Bolt.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1 });
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(offered).toContain(pyro);
    expect(offered.filter((id) => s.objects[id]!.zone === "graveyard")).toEqual([pyro]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pyro] }), ap);
    expect(zone(s, pyro)).toBe("exile");
    expect(s.objects[pyro]!.counters.cage).toBe(1);
    const [i] = abilityIndexes(s, m, /deals 1 damage/);
    expect(i).toBeDefined();
    // "{T}: This creature deals 1 damage": Mairsil is the one tapped (rulings); it can't while it's summoning sick.
    s.objects[m]!.controlledSinceTurn = -1;
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, m, i!, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[m]!.tapped).toBe(true);
  });

  it("can exile a card from your hand, or none", () => {
    const { s: s0, ap } = setup([]);
    const m = toHand(s0, ap, mairsil());
    const dragon = toHand(s0, ap, shivan());
    Object.assign(s0.players[ap]!.manaPool, { U: 1, B: 1, R: 1, C: 1 });
    let s = run(s0, planCast(s0, ap, m));
    s = until(s, ap, "searchLibrary");
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toContain(dragon);
    const none = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(zone(none, dragon)).toBe("hand");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [dragon] }), ap);
    expect(zone(s, dragon)).toBe("exile");
    expect(abilityIndexes(s, m, /gets \+1\/\+0/).length).toBe(1);
  });

  it("activates each borrowed ability only once each turn, and again the next turn", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mairsil());
    caged(s0, ap, shivan());
    const [i] = abilityIndexes(s0, m, /gets \+1\/\+0/);
    s0.players[ap]!.manaPool.R = 2;
    let s = settle(run(s0, planActivate(s0, ap, m, i!)), ap);
    expect(pt(s, m)).toBe("5/4");
    expect(planActivate(s, ap, m, i!)).toBeNull();
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: m, index: i! } as Action)).toThrow(/only once each turn/);
    s = passUntil(s, "upkeep", ap);
    s.players[ap]!.manaPool.R = 1;
    s = settle(run(s, planActivate(s, ap, m, i!)), ap);
    expect(pt(s, m)).toBe("5/4");
  });

  it("two caged cards with the same ability give two instances, each once each turn (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mairsil());
    caged(s0, ap, shivan());
    caged(s0, ap, shivan());
    const both = abilityIndexes(s0, m, /gets \+1\/\+0/);
    expect(both.length).toBe(2);
    s0.players[ap]!.manaPool.R = 3;
    let s = settle(run(s0, planActivate(s0, ap, m, both[0]!)), ap);
    s = settle(run(s, planActivate(s, ap, m, both[1]!)), ap);
    expect(pt(s, m)).toBe("6/4");
    expect(planActivate(s, ap, m, both[0]!)).toBeNull();
    expect(planActivate(s, ap, m, both[1]!)).toBeNull();
  });

  it("only cards you own: an opponent's card in exile with a cage counter lends nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mairsil());
    caged(s0, opp, shivan());
    expect(abilityIndexes(s0, m, /gets \+1\/\+0/).length).toBe(0);
    // Under the opponent's control it has the abilities of the cards they own (rulings).
    s0.objects[m]!.controller = opp;
    invalidateCharacteristics(s0);
    expect(abilityIndexes(s0, m, /gets \+1\/\+0/).length).toBe(1);
  });

  it("Basalt Monolith caged: taps for {C}{C}{C} and untaps itself, each once this turn, so no loop", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mairsil());
    caged(s0, ap, monolith());
    expect(manaAbilitiesOn(s0, s0.objects[m]!).map((a) => a.text)).toEqual(["{T}: Add {C}{C}{C}."]);
    let s = act(s0, { type: "activateMana", player: ap, objectId: m, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(3);
    const [u] = abilityIndexes(s, m, /^\{3\}: Untap/);
    s = settle(run(s, planActivate(s, ap, m, u!)), ap);
    expect(s.objects[m]!.tapped).toBe(false);
    // Untapped, but its mana ability was used this turn.
    expect(() => act(s, { type: "activateMana", player: ap, objectId: m, mana: "C" })).toThrow(/can't produce|only once each turn/);
    // Another Mairsil-less untap would let it tap again: the limit is the borrowed ability's, not the permanent's.
    s.objects[m]!.borrowedUsed = undefined;
    expect(act(s, { type: "activateMana", player: ap, objectId: m, mana: "C" }).players[ap]!.manaPool.C).toBe(3);
  });

  it("two caged Llanowar Elves: two mana abilities, not merged into one", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mairsil());
    caged(s0, ap, elves());
    caged(s0, ap, elves());
    expect(manaAbilitiesOn(s0, s0.objects[m]!).length).toBe(2);
  });

  it("a bot cages the card with the most activated abilities", () => {
    const { s: s0, ap } = setup([]);
    const m = toHand(s0, ap, mairsil());
    toYard(s0, ap, ogre());
    const pyro = toYard(s0, ap, pyromancer());
    Object.assign(s0.players[ap]!.manaPool, { U: 1, B: 1, R: 1, C: 1 });
    let s = run(s0, planCast(s0, ap, m));
    s = until(s, ap, "searchLibrary");
    expect(botActions(s, ap)).toEqual([{ type: "searchLibrary", player: ap, found: [pyro] }]);
  });
});

describe("round 401: Kylox's Voltstrider", () => {
  /** Kylox on the battlefield, its collect evidence 6 paid with Lava Axe and Lightning Bolt from your graveyard. */
  const evidence = () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kylox());
    const axe = toYard(s0, ap, lavaAxe());
    const b = toYard(s0, ap, bolt());
    const g = toYard(s0, ap, hillGiant());
    const s = settle(run(s0, planActivate(s0, ap, k, 0, undefined, undefined, undefined, undefined, { collect: [axe, b] })), ap);
    return { s, ap, opp, k, axe, b, g };
  };

  it("collects evidence 6 to become an artifact creature; the cards it exiled are exiled with it (CR 607.2a)", () => {
    const { s, k, axe, b } = evidence();
    expect(zone(s, axe)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    expect(ch(s, k).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(s.linkedExile?.[`${k}@${s.objects[k]!.zoneChanges ?? 0}`]?.map((l) => l.id).sort()).toEqual([axe, b].sort());
  });

  it("attacking, casts the Bolt from among them, paying {R}; the Bolt goes to the bottom of its owner's library after", () => {
    const { s: s1, ap, opp, k, axe, b } = evidence();
    let s = attackWith(s1, ap, opp, k);
    s = until(s, ap, "chooseOption");
    // Lava Axe and the Bolt are both offered, not the Hill Giant left in the graveyard; the Bolt is chosen.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: expect.arrayContaining([axe, b, "none"]) });
    expect(s.pending?.kind === "chooseOption" && s.pending.options.length).toBe(3);
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b, how: "paid" });
    s.players[ap]!.manaPool.R = 1;
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, b, [{ kind: "player", id: opp }]));
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, b)).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(b);
  });

  it("only cards exiled with it: a card exiled some other way isn't offered", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kylox());
    const other = toYard(s0, ap, bolt());
    s0.objects[other]!.zone = "exile";
    s0.players[ap]!.graveyard.splice(s0.players[ap]!.graveyard.indexOf(other), 1);
    s0.players[ap]!.exile.push(other);
    // A creature some other way (as if crewed) so it can attack.
    s0.objects[k]!.controlledSinceTurn = -1;
    const s1 = settle(run(s0, planActivate(s0, ap, k, 0, undefined, undefined, undefined, undefined, { collect: [toYard(s0, ap, lavaAxe()), toYard(s0, ap, hillGiant())] })), ap);
    let s = attackWith(s1, ap, opp, k);
    for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length || (s.pending && s.pending.kind !== "declareBlockers")); i++) {
      expect(s.pending?.kind === "castFree" && s.pending.objectId === other).toBe(false);
      const p = s.pending;
      if (p?.kind === "castFree") s = act(s, { type: "chooseMay", player: ap, yes: false });
      else if (p && p.player !== ap) for (const a of botActions(s, p.player)) s = act(s, a);
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, other)).toBe("exile");
  });
});

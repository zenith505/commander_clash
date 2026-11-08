// Lane B round B149: counters that mark permanents for later (Mine Layer's mine counters, destroyed as such a land becomes
// tapped; Sporogenesis' fungus counters, a Saproling for each as such a creature dies; Bomb Squad's fuse counters, a state
// trigger of each creature with four or more, CR 603.8; and "when ~ leaves the battlefield, remove all ... counters from
// all lands/creatures"), damage replaced or prevented in new ways (Crumbling Sanctuary: "that player exiles that many cards
// from the top of their library instead", CR 614.1a; Magma Pummeler: prevented, that many +1/+1 counters removed, then a
// reflexive trigger, CR 603.12, dealing as much damage as counters were removed; Sekki, Seasons' Guide: prevented, counters
// removed and a Spirit token for each 1 damage, also when it can't be prevented; Well-Laid Plans: a creature's damage to
// another creature that shares a color with it is prevented, CR 615.1a, 105.4) and Living Conundrum (draws from an empty
// library skipped, CR 614.1b, and a 10/10 flier with vigilance while the library is empty).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, dealDamage, destroyPermanent, draw, objectSource, invalidateCharacteristics, isFullySupported, planActivate, runStateBasedActions, tapPermanent, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const mineLayer = (): CardDef => ({"oracleId":"7cf29c48-ba07-4af3-b846-7f81046f4059","name":"Mine Layer","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Dwarf","supertypes":[],"types":["Creature"],"subtypes":["Dwarf"],"oracleText":"{1}{R}, {T}: Put a mine counter on target land.\nWhenever a land with a mine counter on it becomes tapped, destroy it.\nWhen this creature leaves the battlefield, remove all mine counters from all lands.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/497efda1-5013-45d2-b717-b0296218c42b.jpg?1783945228","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/497efda1-5013-45d2-b717-b0296218c42b.jpg?1783945228","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sporogenesis = (): CardDef => ({"oracleId":"33005c63-fe9f-4051-b781-eacf1ca5eec6","name":"Sporogenesis","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, you may put a fungus counter on target nontoken creature.\nWhenever a creature with a fungus counter on it dies, create a 1/1 green Saproling creature token for each fungus counter on that creature.\nWhen this enchantment leaves the battlefield, remove all fungus counters from all creatures.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/3/839d969b-b1f7-4978-b00c-db0766161f63.jpg?1783946311","artUrl":"https://cards.scryfall.io/art_crop/front/8/3/839d969b-b1f7-4978-b00c-db0766161f63.jpg?1783946311","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bombSquad = (): CardDef => ({"oracleId":"f2ecb354-8f79-4c39-989e-7aa37ec75154","name":"Bomb Squad","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Dwarf","supertypes":[],"types":["Creature"],"subtypes":["Dwarf"],"oracleText":"{T}: Put a fuse counter on target creature.\nAt the beginning of your upkeep, put a fuse counter on each creature with a fuse counter on it.\nWhenever a creature has four or more fuse counters on it, remove all fuse counters from it and destroy it. That creature deals 4 damage to its controller.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8e9535a5-29ea-4085-a36b-4905d85e97ac.jpg?1783945233","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8e9535a5-29ea-4085-a36b-4905d85e97ac.jpg?1783945233","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sanctuary = (): CardDef => ({"oracleId":"f9269fda-e1e6-4e10-9a64-26e8c0f38b0c","name":"Crumbling Sanctuary","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If damage would be dealt to a player, that player exiles that many cards from the top of their library instead.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/8/d8fa6d6c-c1cd-46f3-8430-94f67be55bf7.jpg?1783945913","artUrl":"https://cards.scryfall.io/art_crop/front/d/8/d8fa6d6c-c1cd-46f3-8430-94f67be55bf7.jpg?1783945913","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pummeler = (): CardDef => ({"oracleId":"1a7c5807-afdc-4855-afd5-39839d96fc77","name":"Magma Pummeler","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"This creature enters with X +1/+1 counters on it.\nIf damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage and remove that many +1/+1 counters from it. When one or more counters are removed from this creature this way, it deals that much damage to any target.","power":"0","toughness":"0","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dc402e45-3a1a-495d-9077-c5752da6e05e.jpg?1783924200","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dc402e45-3a1a-495d-9077-c5752da6e05e.jpg?1783924200","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sekki = (): CardDef => ({"oracleId":"1b92501c-80fe-4ae7-834e-72f57ba41a6a","name":"Sekki, Seasons' Guide","manaCost":"{5}{G}{G}{G}","cmc":8,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Sekki enters with eight +1/+1 counters on it.\nIf damage would be dealt to Sekki, prevent that damage, remove that many +1/+1 counters from Sekki, and create that many 1/1 colorless Spirit creature tokens.\nSacrifice eight Spirits: Return this card from your graveyard to the battlefield.","power":"0","toughness":"0","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/9883e973-54c3-4bec-91d8-22f2829cdfa2.jpg?1783944133","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/9883e973-54c3-4bec-91d8-22f2829cdfa2.jpg?1783944133","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const conundrum = (): CardDef => ({"oracleId":"378ae023-04d3-44cc-9248-3d787796ed6c","name":"Living Conundrum","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Hexproof\nIf you would draw a card while your library has no cards in it, skip that draw instead.\nAs long as there are no cards in your library, this creature has base power and toughness 10/10 and has flying and vigilance.","power":"2","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97fb11c7-7b7f-4bdb-a022-53e28ebadecc.jpg?1783912908","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97fb11c7-7b7f-4bdb-a022-53e28ebadecc.jpg?1783912908","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const plans = (): CardDef => ({"oracleId":"50343947-d127-4479-9c1b-8f5040a97afb","name":"Well-Laid Plans","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Prevent all damage that would be dealt to a creature by another creature if they share a color.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1c55eb8f-925a-42c1-9e48-d7f99cab3b01.jpg?1783945700","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1c55eb8f-925a-42c1-9e48-d7f99cab3b01.jpg?1783945700","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
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
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const red = (n: number) => bear({ name: `Red Bear ${n}`, manaCost: "{1}{R}", colors: ["R"], power: String(n), toughness: "4" });
const green = (n: number) => bear({ name: `Green Bear ${n}`, colors: ["G"], power: String(n), toughness: "4" });
const ping = (s: GameState, from: string, to: { object: string } | { player: PlayerId }, n: number) => {
  dealDamage(s, objectSource(s, s.objects[from]!), "object" in to ? { object: s.objects[to.object]! } : to, n);
  runStateBasedActions(s);
  return s;
};

describe("Lane B round B149", () => {
  it("compiles the cards", () => supported(mineLayer(), sporogenesis(), bombSquad(), sanctuary(), pummeler(), sekki(), conundrum(), plans()));

  it("Mine Layer: a land with a mine counter is destroyed as it becomes tapped; its leaving removes every mine counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const layer = putOnBattlefield(s0, ap, mineLayer());
    // Mana abilities need priority: the lands are its controller's here (whoever controls the land, it's destroyed).
    const theirs = putOnBattlefield(s0, ap, card("Test Mountain", "Basic Land — Mountain"));
    const other = putOnBattlefield(s0, opp, card("Test Island", "Basic Land — Island"));
    s0.objects[other]!.counters.mine = 2;
    let s = settle(run(s0, planActivate(s0, ap, layer, 0, [tgt(theirs)])));
    expect(s.objects[theirs]!.counters.mine).toBe(1);
    expect(s.objects[layer]!.tapped).toBe(true);
    // (The cost may have been paid with it; it's untapped again for the test.)
    s.objects[theirs]!.tapped = false;
    // Tapped for mana by its controller: the trigger destroys it.
    s = act(s, { type: "activateMana", player: ap, objectId: theirs, mana: "R" });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    s = settle(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    // A land without one doesn't care.
    const plain = putOnBattlefield(s, ap, card("Test Swamp", "Basic Land — Swamp"));
    s = settle(act(s, { type: "activateMana", player: ap, objectId: plain, mana: "B" }));
    expect(s.objects[plain]!.zone).toBe("battlefield");
    // Mine Layer leaves: all mine counters on all lands are removed (not other kinds).
    s.objects[other]!.counters.charge = 1;
    s = ping(s, other, { object: layer }, 5);
    expect(s.objects[layer]!.zone).toBe("graveyard");
    s = settle(s);
    expect(s.objects[other]!.counters.mine ?? 0).toBe(0);
    expect(s.objects[other]!.counters.charge).toBe(1);
    // Another player's land with a mine counter, tapped by an effect, is destroyed too (Mine Layer back).
    const back = putOnBattlefield(s, ap, mineLayer());
    const target = putOnBattlefield(s, opp, card("Test Plains", "Basic Land — Plains"));
    s.objects[target]!.counters.mine = 1;
    tapPermanent(s, s.objects[target]!);
    s = settle(s);
    expect(s.objects[target]!.zone).toBe("graveyard");
    expect(s.objects[back]!.zone).toBe("battlefield");
  });

  it("Sporogenesis: a Saproling for each fungus counter on a creature that dies; the counters go when it leaves", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sporogenesis());
    const g = putOnBattlefield(s0, opp, green(1));
    s0.objects[g]!.counters.fungus = 3;
    const killer = putOnBattlefield(s0, ap, red(5));
    let s = settle(ping(s0, killer, { object: g }, 4));
    expect(s.objects[g]!.zone).toBe("graveyard");
    // Sporogenesis' controller creates them (rulings: one for each counter).
    const saps = s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id) === "Saproling Token");
    expect(saps).toHaveLength(3);
    expect(saps.every((id) => s.objects[id]!.controller === ap)).toBe(true);
    // Leaving removes every fungus counter from every creature, also while another Sporogenesis stays (rulings).
    const h = putOnBattlefield(s, opp, green(2));
    s.objects[h]!.counters.fungus = 2;
    const two = putOnBattlefield(s, ap, sporogenesis());
    destroyPermanent(s, s.objects[two]!, "test");
    s = settle(s);
    expect(s.objects[two]!.zone).toBe("graveyard");
    expect(s.objects[h]!.counters.fungus ?? 0).toBe(0);
    // Now it dies with none: no Saproling.
    const before = s.battlefield.filter((id) => nameOf(s, id) === "Saproling Token").length;
    s = settle(ping(s, killer, { object: h }, 4));
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Saproling Token")).toHaveLength(before);
  });

  it("Bomb Squad: a fourth fuse counter destroys the creature and it deals 4 damage to its controller; two Squads, twice", () => {
    const { s: s0, ap, opp } = setup([]);
    const squad = putOnBattlefield(s0, ap, bombSquad());
    const g = putOnBattlefield(s0, opp, green(2));
    s0.objects[g]!.counters.fuse = 3;
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planActivate(s0, ap, squad, 0, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 4);
    // Three counters don't trigger it; two Bomb Squads each trigger for a creature with four (rulings): 8 damage.
    const h = putOnBattlefield(s, opp, green(3));
    s.objects[h]!.counters.fuse = 3;
    putOnBattlefield(s, ap, bombSquad());
    s = settle(s);
    expect(s.objects[h]!.zone).toBe("battlefield");
    const l2 = s.players[opp]!.life;
    s.objects[h]!.counters.fuse = 4;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    s = settle(s);
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(l2 - 8);
  });

  it("Bomb Squad: regenerated, the creature still loses its fuse counters and deals the damage (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const squad = putOnBattlefield(s0, ap, bombSquad());
    const g = putOnBattlefield(s0, opp, green(2));
    s0.objects[g]!.counters.fuse = 3;
    s0.objects[g]!.regenShields = 1;
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planActivate(s0, ap, squad, 0, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.counters.fuse ?? 0).toBe(0);
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("Bomb Squad: at its controller's upkeep, each creature with a fuse counter gets another", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bombSquad());
    const g = putOnBattlefield(s0, opp, green(2));
    const h = putOnBattlefield(s0, opp, green(3));
    s0.objects[g]!.counters.fuse = 1;
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[g]!.counters.fuse).toBe(2);
    expect(s.objects[h]!.counters.fuse ?? 0).toBe(0);
  });

  it("Crumbling Sanctuary: damage to a player exiles that many cards from the top of their library instead", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sanctuary());
    const src = putOnBattlefield(s0, ap, red(3));
    s0.objects[src]!.counters = {};
    const life = s0.players[opp]!.life;
    const top = s0.players[opp]!.library.slice(0, 3);
    const yard = s0.players[opp]!.graveyard.length;
    let s = ping(s0, src, { player: opp }, 3);
    expect(s.players[opp]!.life).toBe(life);
    expect(top.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    expect(s.players[opp]!.graveyard).toHaveLength(yard);
    // Its controller too, and damage to a creature is dealt as usual.
    const mine = ap;
    const myLife = s.players[mine]!.life;
    s = ping(s, src, { player: mine }, 2);
    expect(s.players[mine]!.life).toBe(myLife);
    const b = putOnBattlefield(s, opp, green(1));
    s = ping(s, src, { object: b }, 4);
    expect(s.objects[b]!.zone).toBe("graveyard");
    // With an empty library the damage does nothing (rulings).
    s.players[opp]!.library = [];
    s = ping(s, src, { player: opp }, 5);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.players[opp]!.lost).toBeFalsy();
  });

  it("Magma Pummeler: damage removes that many counters, then it deals as much damage as counters were removed", () => {
    const { s: s0, ap, opp } = setup([]);
    const pm = putOnBattlefield(s0, ap, pummeler());
    s0.objects[pm]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s0);
    const src = putOnBattlefield(s0, opp, red(2));
    let s = ping(s0, src, { object: pm }, 2);
    expect(s.objects[pm]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[pm]!.damage ?? 0).toBe(0);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as Action));
    expect(s.players[opp]!.life).toBe(life - 2);
    // More damage than counters: all of it prevented, the last counter removed (it dies as a 0/0), and 1 damage dealt.
    s = ping(s, src, { object: pm }, 5);
    expect(s.objects[pm]!.zone).toBe("graveyard");
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const l2 = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as Action));
    expect(s.players[opp]!.life).toBe(l2 - 1);
  });

  it("Magma Pummeler: with no +1/+1 counter on it, damage is dealt and nothing triggers", () => {
    const { s: s0, ap, opp } = setup([]);
    const pm = putOnBattlefield(s0, ap, pummeler());
    addEffect(s0, ap, [pm], [{ kind: "modifyPT", power: 0, toughness: 3 }]);
    const src = putOnBattlefield(s0, opp, red(2));
    const s = ping(s0, src, { object: pm }, 1);
    expect(s.objects[pm]!.damage).toBe(1);
    expect(s.triggerQueue).toHaveLength(0);
  });

  it("Sekki: prevents the damage, removes that many counters and makes a Spirit for each 1 damage, even past its counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const sk = putOnBattlefield(s0, ap, sekki());
    s0.objects[sk]!.counters["+1/+1"] = 8;
    invalidateCharacteristics(s0);
    expect(pt(s0, sk)).toBe("8/8");
    const src = putOnBattlefield(s0, opp, red(3));
    let s = ping(s0, src, { object: sk }, 3);
    expect(pt(s, sk)).toBe("5/5");
    expect(s.objects[sk]!.damage ?? 0).toBe(0);
    const spirits = () => s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id) === "Spirit Token" && s.objects[id]!.controller === ap);
    expect(spirits()).toHaveLength(3);
    expect(characteristics(s, s.objects[spirits()[0]!]!).colors).toEqual([]);
    expect(pt(s, spirits()[0]!)).toBe("1/1");
    // 9 damage with 5 counters: all 5 removed (it's 0/0 and dies) and 9 Spirits (rulings).
    s = ping(s, src, { object: sk }, 9);
    expect(spirits()).toHaveLength(12);
    expect(s.objects[sk]!.zone).toBe("graveyard");
  });

  it("Living Conundrum: draws from an empty library are skipped, and it's a 10/10 flier with vigilance then", () => {
    const { s: s0, ap } = setup([]);
    const lc = putOnBattlefield(s0, ap, conundrum());
    expect(pt(s0, lc)).toBe("2/5");
    const lib = s0.players[ap]!.library;
    s0.players[ap]!.library = lib.slice(0, 1);
    for (const id of lib.slice(1)) s0.objects[id]!.zone = "exile";
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    draw(s0, ap, 3);
    expect(s0.players[ap]!.hand).toHaveLength(hand + 1);
    expect(s0.players[ap]!.library).toHaveLength(0);
    runStateBasedActions(s0);
    expect(s0.players[ap]!.lost).toBeFalsy();
    invalidateCharacteristics(s0);
    expect(pt(s0, lc)).toBe("10/10");
    expect(characteristics(s0, s0.objects[lc]!).keywords).toEqual(expect.arrayContaining(["Hexproof", "Flying", "Vigilance"]));
    // Another player's draw from an empty library isn't skipped.
    const other = s0.turnOrder.find((p) => p !== ap)!;
    s0.players[other]!.library = [];
    draw(s0, other, 1);
    runStateBasedActions(s0);
    expect(s0.players[other]!.lost).toBe(true);
  });

  it("Well-Laid Plans: a creature's damage to another creature that shares a color with it is prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, plans());
    const r1 = putOnBattlefield(s0, ap, red(3));
    const r2 = putOnBattlefield(s0, opp, red(1));
    const g = putOnBattlefield(s0, opp, green(1));
    const gold = putOnBattlefield(s0, opp, bear({ name: "Gold Bear", manaCost: "{R}{G}", colors: ["R", "G"], power: "1", toughness: "4" }));
    const gray = putOnBattlefield(s0, opp, card("Gray Golem", "Artifact Creature — Golem", "{3}", { power: "1", toughness: "4", colors: [] }));
    let s = ping(s0, r1, { object: r2 }, 3);
    expect(s.objects[r2]!.damage ?? 0).toBe(0);
    s = ping(s, r1, { object: gold }, 3);
    expect(s.objects[gold]!.damage ?? 0).toBe(0);
    s = ping(s, r1, { object: g }, 3);
    expect(s.objects[g]!.damage).toBe(3);
    s = ping(s, r1, { object: gray }, 3);
    expect(s.objects[gray]!.damage).toBe(3);
    // Players aren't creatures; a colorless source shares no color.
    const life = s.players[opp]!.life;
    s = ping(s, r1, { player: opp }, 2);
    expect(s.players[opp]!.life).toBe(life - 2);
    s = ping(s, gray, { object: g }, 1);
    expect(s.objects[g]!.zone).toBe("graveyard");
  });
});

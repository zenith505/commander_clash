// Lane B round B232: Balduvian Fallen (+1/+0 for each {B} or {R} spent on its cumulative upkeep), Heroism (each attacking
// red creature's combat damage prevented unless its controller pays {2}{R}), Butcher Orgg (its combat damage divided among
// the defending player and their creatures) and Ogre Enforcer (destroyed by lethal damage only from a single source).

import { describe, expect, it } from "vitest";
import { act, addEffect, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, parseManaCost, planActivate, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const balduvianFallen = (): CardDef => ({"oracleId":"3f60a7ce-c714-4e87-a2d9-3710f2d610fa","name":"Balduvian Fallen","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever this creature's cumulative upkeep is paid, it gets +1/+0 until end of turn for each {B} or {R} spent this way.","power":"3","toughness":"5","colors":["B"],"colorIdentity":["B","R"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6a52b952-6e3b-403b-b355-2af47a282ab6.jpg?1783943352","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6a52b952-6e3b-403b-b355-2af47a282ab6.jpg?1783943352","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const heroism = (): CardDef => ({"oracleId":"74716642-fc8c-4f62-a556-154ed0b4af0e","name":"Heroism","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Sacrifice a white creature: For each attacking red creature, prevent all combat damage that would be dealt by that creature this turn unless its controller pays {2}{R}.","colors":["W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08ee87a0-a7eb-4472-9045-85d11e8a1501.jpg?1783947919","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08ee87a0-a7eb-4472-9045-85d11e8a1501.jpg?1783947919","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const butcherOrgg = (): CardDef => ({"oracleId":"6656d47a-9490-46ee-a6ed-7cbcab7539c8","name":"Butcher Orgg","manaCost":"{4}{R}{R}{R}","cmc":7,"typeLine":"Creature — Orgg","supertypes":[],"types":["Creature"],"subtypes":["Orgg"],"oracleText":"You may assign this creature's combat damage divided as you choose among defending player and/or any number of creatures they control.","power":"6","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f2a29cf-4b2e-44c0-af73-512d6fed0dae.jpg?1783945058","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f2a29cf-4b2e-44c0-af73-512d6fed0dae.jpg?1783945058","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ogreEnforcer = (): CardDef => ({"oracleId":"86cc83d8-4a70-4b97-aa4d-160afd4cd6cb","name":"Ogre Enforcer","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"This creature can't be destroyed by lethal damage unless lethal damage dealt by a single source is marked on it.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0f072d6-7489-4eb0-8c53-1fa42ad806a4.jpg?1783946987","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0f072d6-7489-4eb0-8c53-1fa42ad806a4.jpg?1783946987","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const savannahLions = (): CardDef => ({"oracleId":"60ba93eb-39e6-4af2-9c66-cd38f72daff2","name":"Savannah Lions","manaCost":"{W}","cmc":1,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","commanderLegal":"legal","set":"a25","releasedAt":"2018-03-16","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock_ = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ragingGoblin = (): CardDef => ({"oracleId":"30997b43-fc13-41d3-8064-1ccc2cb6fd2b","name":"Raging Goblin","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Berserker","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Berserker"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or `me` has a question. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `attacker` attacks; each defending player blocks as `blocks` says, then everyone passes until `me` has a question or damage is dealt. */
const combat = (s0: GameState, pid: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = [], priorityTo?: PlayerId) => {
  let s = passUntil(s0, "declareAttackers", pid);
  s = act(s, { type: "declareAttackers", player: pid, attacks });
  for (let i = 0; i < 40 && s.step !== "combatDamage" && s.step !== "firstStrikeDamage"; i++) {
    // After blockers are declared, with priority for `priorityTo`.
    if (priorityTo !== undefined && s.step === "declareBlockers" && !s.pending && waitingOn(s) === priorityTo) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Lane B round B232", () => {
  it("are fully supported", () => {
    supported(balduvianFallen(), heroism(), butcherOrgg(), ogreEnforcer());
  });

  it("Balduvian Fallen: +1/+0 until end of turn for each {B} or {R} spent on its cumulative upkeep, none for other mana", () => {
    const { s: s0, ap } = setup([]);
    const fallen = putOnBattlefield(s0, ap, balduvianFallen());
    let s = settle(passUntil(s0, "upkeep", ap), ap);
    const p = s.pending;
    if (p?.kind !== "chooseMay" || p.pay?.mana !== "{1}") throw new Error(JSON.stringify(p));
    expect(s.objects[fallen]!.counters.age).toBe(1);
    // Paid with a Swamp's {B}: 4/5 until end of turn.
    const swamp = named(s, ap, "Swamp")[0]!;
    const black = settle(act(act(s, { type: "activateMana", player: ap, objectId: swamp, mana: "B" }), { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(black, fallen)).toBe("battlefield");
    expect(`${power(black, black.objects[fallen]!)}/${toughness(black, black.objects[fallen]!)}`).toBe("4/5");
    expect(power(passUntil(black, "upkeep", ap === 0 ? 1 : 0), black.objects[fallen]!)).toBe(3);
    // Paid with a Forest's {G}: it triggers, for +0/+0.
    const forest = named(s, ap, "Forest")[0]!;
    const green = settle(act(act(s, { type: "activateMana", player: ap, objectId: forest, mana: "G" }), { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(green, fallen)).toBe("battlefield");
    expect(power(green, green.objects[fallen]!)).toBe(3);
    // Not paid: sacrificed.
    const no = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(zone(no, fallen)).toBe("graveyard");
  });

  it("Balduvian Fallen: with two age counters, a {B} and an {R} give +2/+0, a {G} and an {R} +1/+0", () => {
    const { s: s0, ap } = setup([]);
    const fallen = putOnBattlefield(s0, ap, balduvianFallen());
    s0.objects[fallen]!.counters.age = 1;
    const s = settle(passUntil(s0, "upkeep", ap), ap);
    const p = s.pending;
    if (p?.kind !== "chooseMay" || p.pay?.mana !== "{2}") throw new Error(JSON.stringify(p));
    const tap = (x: GameState, name: string, mana: "B" | "R" | "G") => act(x, { type: "activateMana", player: ap, objectId: named(x, ap, name).find((id) => !x.objects[id]!.tapped)!, mana });
    const both = settle(act(tap(tap(s, "Swamp", "B"), "Mountain", "R"), { type: "chooseMay", player: ap, yes: true }), ap);
    expect(power(both, both.objects[fallen]!)).toBe(5);
    const one = settle(act(tap(tap(s, "Forest", "G"), "Mountain", "R"), { type: "chooseMay", player: ap, yes: true }), ap);
    expect(power(one, one.objects[fallen]!)).toBe(4);
  });

  it("Heroism: each attacking red creature's controller pays {2}{R} or its combat damage this turn is prevented; a green attacker isn't asked about", () => {
    const { s: s0, ap, opp } = setup([]);
    const hero = putOnBattlefield(s0, ap, heroism());
    const lions = putOnBattlefield(s0, ap, savannahLions());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const goblin = putOnBattlefield(s0, opp, ragingGoblin());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, { ...s0.cards[s0.objects[named(s0, ap, "Mountain")[0]!]!.cardId]! });
    let s = combat(s0, opp, [giant, goblin, bears].map((attacker) => ({ attacker, defender: ap })), [], ap);
    expect(s.step).toBe("declareBlockers");
    // A bot activates it here (4 damage from red attackers), sacrificing a white token (bots give up only tokens worth little).
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === hero)).toBe(false);
    s.objects[lions]!.isToken = true;
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === hero)).toBe(true);
    s = run(s, planActivate(s, ap, hero, 0, undefined, undefined, undefined, undefined, { sacrifice: [lions] }));
    expect(s.battlefield).not.toContain(lions);
    s = settle(s, opp);
    const p = s.pending;
    if (p?.kind !== "payUnless" || p.player !== opp || p.cost !== "{2}{R}") throw new Error(JSON.stringify(p));
    const first = p.what === "Hill Giant" ? giant : goblin;
    const second = first === giant ? goblin : giant;
    // The first is paid for with all three Mountains; the second can't be paid for, so it's prevented.
    s = settle(run(s, [...planMana(s, opp, parseManaCost("{2}{R}"))!, { type: "payUnless", player: opp, pay: true }]), opp);
    expect(s.pending).toBeNull();
    const before = life(s, ap);
    s = passUntil(s, "endCombat", opp);
    const dealt = (first === giant ? 3 : 1) + 2;
    expect(before - life(s, ap)).toBe(dealt);
    expect(s.log.some((l) => JSON.stringify(l).includes(`${s.cards[s.objects[second]!.cardId]!.name} would deal this turn is prevented`))).toBe(true);
  });

  it("Heroism: declined, all of that creature's combat damage this turn is prevented, to blockers too", () => {
    const { s: s0, ap, opp } = setup([]);
    const hero = putOnBattlefield(s0, ap, heroism());
    const lions = putOnBattlefield(s0, ap, savannahLions());
    const wall = putOnBattlefield(s0, ap, grizzlyBears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, { ...s0.cards[s0.objects[named(s0, ap, "Mountain")[0]!]!.cardId]! });
    let s = combat(s0, opp, [{ attacker: giant, defender: ap }], [{ blocker: wall, attacker: giant }], ap);
    s = settle(run(s, planActivate(s, ap, hero, 0, undefined, undefined, undefined, undefined, { sacrifice: [lions] })), opp);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{2}{R}", what: "Hill Giant" });
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }), opp);
    s = passUntil(s, "endCombat", opp);
    expect(zone(s, wall)).toBe("battlefield");
    expect(s.objects[wall]!.damage).toBe(0);
    expect(s.objects[giant]!.damage).toBe(2);
  });

  it("Butcher Orgg: unblocked, its 6 combat damage divided among the defending player and creatures they control, or assigned the usual way", () => {
    const { s: s0, ap, opp } = setup([]);
    const orgg = putOnBattlefield(s0, ap, butcherOrgg());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const s = combat(s0, ap, [{ attacker: orgg, defender: opp }]);
    const p = s.pending;
    if (p?.kind !== "divideDamage" || !p.combat) throw new Error(JSON.stringify(p));
    expect(p).toMatchObject({ player: ap, by: orgg, total: 6, toPlayer: opp });
    expect([...p.options].sort()).toEqual([bears, giant].sort());
    // Not all of it given out: refused.
    expect(() => act(s, { type: "divideDamage", player: ap, parts: { [bears]: 2 } })).toThrow();
    // A player who isn't the defending player: refused.
    expect(() => act(s, { type: "divideDamage", player: ap, parts: { [`p${ap}`]: 6 } })).toThrow();
    const start = life(s, opp);
    const split = passUntil(act(s, { type: "divideDamage", player: ap, parts: { [bears]: 2, [giant]: 3, [`p${opp}`]: 1 } }), "endCombat", ap);
    expect(zone(split, bears)).toBe("graveyard");
    expect(zone(split, giant)).toBe("graveyard");
    expect(start - life(split, opp)).toBe(1);
    const usual = passUntil(act(s, { type: "divideDamage", player: ap, parts: {} }), "endCombat", ap);
    expect(start - life(usual, opp)).toBe(6);
    expect(zone(usual, bears)).toBe("battlefield");
    // A bot kills both and gives the player the rest.
    expect(botActions(s, ap)).toEqual([{ type: "divideDamage", player: ap, parts: { [giant]: 3, [bears]: 2, [`p${opp}`]: 1 } }]);
  });

  it("Butcher Orgg: blocked, it may still divide its damage among the player and any of their creatures; blocked by no creature any more, it isn't asked", () => {
    const { s: s0, ap, opp } = setup([]);
    const orgg = putOnBattlefield(s0, ap, butcherOrgg());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const s = combat(s0, ap, [{ attacker: orgg, defender: opp }], [{ blocker: bears, attacker: orgg }]);
    expect(s.pending).toMatchObject({ kind: "divideDamage", combat: true, by: orgg });
    const start = life(s, opp);
    const split = passUntil(act(s, { type: "divideDamage", player: ap, parts: { [giant]: 3, [`p${opp}`]: 3 } }), "endCombat", ap);
    expect(zone(split, giant)).toBe("graveyard");
    expect(zone(split, bears)).toBe("battlefield");
    expect(start - life(split, opp)).toBe(3);
    // The usual way: all 6 to the Bears.
    const usual = passUntil(act(s, { type: "divideDamage", player: ap, parts: {} }), "endCombat", ap);
    expect(zone(usual, bears)).toBe("graveyard");
    expect(life(usual, opp)).toBe(start);
    // The blocker gone before damage: no question, no damage.
    let gone = passUntil(s0, "declareAttackers", ap);
    gone = act(gone, { type: "declareAttackers", player: ap, attacks: [{ attacker: orgg, defender: opp }] });
    for (let i = 0; i < 40 && gone.step !== "combatDamage"; i++) {
      const q = gone.pending;
      if (q?.kind === "declareBlockers") gone = act(gone, { type: "declareBlockers", player: q.player, blocks: q.player === opp ? [{ blocker: bears, attacker: orgg }] : [] });
      else if (q) for (const a of botActions(gone, q.player)) gone = act(gone, a);
      else if (gone.step === "declareBlockers" && waitingOn(gone) === ap && gone.objects[bears]!.zone === "battlefield") {
        const bolt = toHand(gone, ap, lightningBolt());
        gone = settle(run(gone, planCast(gone, ap, bolt, [tgt(bears)])), ap);
      } else gone = act(gone, { type: "passPriority", player: waitingOn(gone)! });
    }
    expect(zone(gone, bears)).toBe("graveyard");
    expect(gone.pending?.kind).not.toBe("divideDamage");
    expect(life(passUntil(gone, "endCombat", ap), opp)).toBe(start);
  });

  it("Ogre Enforcer: 5 damage from two sources doesn't destroy it, one source's lethal damage does", () => {
    const { s: s0, ap } = setup([]);
    const ogre = putOnBattlefield(s0, ap, ogreEnforcer());
    const bolt = toHand(s0, ap, lightningBolt());
    const shock = toHand(s0, ap, shock_());
    let s = settle(run(s0, planCast(s0, ap, bolt, [tgt(ogre)])), ap);
    s = settle(run(s, planCast(s, ap, shock, [tgt(ogre)])), ap);
    expect(zone(s, ogre)).toBe("battlefield");
    expect(s.objects[ogre]!.damage).toBe(5);
    // Its toughness down to 3: the Bolt's 3 is lethal by itself.
    addEffect(s, ap, [ogre], [{ kind: "modifyPT", power: 0, toughness: -1 }]);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(zone(s, ogre)).toBe("graveyard");
  });

  it("Ogre Enforcer: double-blocked by a 3/3 and a 2/2 it survives; the damage wears off at cleanup", () => {
    const { s: s0, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s0, ap, ogreEnforcer());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = combat(s0, ap, [{ attacker: ogre, defender: opp }], [{ blocker: giant, attacker: ogre }, { blocker: bears, attacker: ogre }]);
    s = passUntil(s, "endCombat", ap);
    expect(zone(s, ogre)).toBe("battlefield");
    expect(s.objects[ogre]!.damage).toBe(5);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[ogre]!.damage).toBe(0);
    expect(s.objects[ogre]!.damageFrom).toBeUndefined();
  });
});

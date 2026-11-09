// Lane B round B159: Pollen Remedy (a kicked prevention divides 6 instead of 3), Sphere of Annihilation (exiles itself and
// everything with mana value up to its void counters, permanents and graveyard cards), Quarantine Field (one "up to one"
// target for each isolation counter, exiled until it leaves), Drafna's Restoration (target artifact cards from target
// player's graveyard on top of their library), Bounty of the Hunt (counters removed at the next cleanup step), Grinning Totem
// (an opponent's card to play until your next upkeep, then into their graveyard) and Grim Reminder (a revealed card's name
// against the spells each opponent cast this turn) and Infernal Kirin
// (discards every card with the cast spell's mana value).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const remedy = (): CardDef => ({"oracleId":"ff52f955-98de-4f12-9ec7-f1d73e3edae9","name":"Pollen Remedy","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker—Sacrifice a land. (You may sacrifice a land in addition to any other costs as you cast this spell.)\nPrevent the next 3 damage that would be dealt this turn to any number of targets, divided as you choose. If this spell was kicked, prevent the next 6 damage this way instead.","colors":["W"],"colorIdentity":["W"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/9797c813-0cda-44ad-ae41-330e9bde9cb9.jpg?1783945628","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/9797c813-0cda-44ad-ae41-330e9bde9cb9.jpg?1783945628","commanderLegal":"legal","set":"pls","releasedAt":"2001-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const sphere = (): CardDef => ({"oracleId":"b96399f9-c0ba-4507-be13-65cf716b7757","name":"Sphere of Annihilation","manaCost":"{X}{B}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters with X void counters on it.\nAt the beginning of your upkeep, exile this artifact, all creatures and planeswalkers with mana value less than or equal to the number of void counters on it, and all creature and planeswalker cards in graveyards with mana value less than or equal to the number of void counters on it.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b2af7ba0-3d14-4d29-9434-395a1f9f3148.jpg?1783926390","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b2af7ba0-3d14-4d29-9434-395a1f9f3148.jpg?1783926390","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const field = (): CardDef => ({"oracleId":"f8b07b1a-f9fb-427d-a5c8-b65a01f7b079","name":"Quarantine Field","manaCost":"{X}{X}{W}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"This enchantment enters with X isolation counters on it.\nWhen this enchantment enters, for each isolation counter on it, exile up to one target nonland permanent an opponent controls until this enchantment leaves the battlefield.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/30c525ab-08d5-4d29-aef1-01b0c75ee8d9.jpg?1783938216","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/30c525ab-08d5-4d29-aef1-01b0c75ee8d9.jpg?1783938216","commanderLegal":"legal","set":"bfz","releasedAt":"2015-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const drafna = (): CardDef => ({"oracleId":"24a78116-d5e0-4e30-b192-d8bffe347a0c","name":"Drafna's Restoration","manaCost":"{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Put any number of target artifact cards from target player's graveyard on top of their library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/b/4be2aa3b-207b-4d21-abfb-6788520c7676.jpg?1783948373","artUrl":"https://cards.scryfall.io/art_crop/front/4/b/4be2aa3b-207b-4d21-abfb-6788520c7676.jpg?1783948373","commanderLegal":"legal","set":"atq","releasedAt":"1994-03-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bounty = (): CardDef => ({"oracleId":"77a43c24-398f-42c6-a0d3-b28b33a0ce12","name":"Bounty of the Hunt","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You may exile a green card from your hand rather than pay this spell's mana cost.\nDistribute three +1/+1 counters among one, two, or three target creatures. For each +1/+1 counter you put on a creature this way, remove a +1/+1 counter from that creature at the beginning of the next cleanup step.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/21ed522a-cf5a-41e1-9677-1226f689ec9c.jpg?1783947174","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/21ed522a-cf5a-41e1-9677-1226f689ec9c.jpg?1783947174","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const totem = (): CardDef => ({"oracleId":"fa798a3d-7797-4795-b251-a45f0429d169","name":"Grinning Totem","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}, Sacrifice this artifact: Search target opponent's library for a card and exile it. Then that player shuffles. Until the beginning of your next upkeep, you may play that card. At the beginning of your next upkeep, if you haven't played it, put it into its owner's graveyard.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f3558ddf-2bc6-4870-bd24-2467d870ffe5.jpg?1783947042","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f3558ddf-2bc6-4870-bd24-2467d870ffe5.jpg?1783947042","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grim = (): CardDef => ({"oracleId":"12684e95-2652-4c3c-b2c7-021b62344d77","name":"Grim Reminder","manaCost":"{2}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Search your library for a nonland card and reveal it. Each opponent who cast a spell this turn with the same name as that card loses 6 life. Then shuffle.\n{B}{B}: Return this card from your graveyard to your hand. Activate only during your upkeep.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/35baa726-8c2f-4a0b-93d1-d7ecfae69fe4.jpg?1783944547","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/35baa726-8c2f-4a0b-93d1-d7ecfae69fe4.jpg?1783944547","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const kirin = (): CardDef => ({"oracleId":"4f07a2e6-692b-4d8c-9ecf-4d94b03706a0","name":"Infernal Kirin","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Legendary Creature — Kirin Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Kirin","Spirit"],"oracleText":"Flying\nWhenever you cast a Spirit or Arcane spell, target player reveals their hand and discards all cards with that spell's mana value.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c79e7a4c-e0e7-42ac-b125-1db2f3d9325c.jpg?1783944155","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c79e7a4c-e0e7-42ac-b125-1db2f3d9325c.jpg?1783944155","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kami = (): CardDef => ({"oracleId":"e937e0f5-ca35-4dce-9f05-8f2075731628","name":"Kami of Ancient Law","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Sacrifice this creature: Destroy target enchantment.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b7cb7fdc-fa47-4485-b268-7c2ddff28568.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b7cb7fdc-fa47-4485-b268-7c2ddff28568.jpg?1783944338","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const conjurant = (): CardDef => ({"oracleId":"787055e6-5d65-458e-a56e-66ef0574d2ca","name":"Ugin's Conjurant","manaCost":"{X}","cmc":0,"typeLine":"Creature — Spirit Monk","supertypes":[],"types":["Creature"],"subtypes":["Spirit","Monk"],"oracleText":"This creature enters with X +1/+1 counters on it.\nIf damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage and remove that many +1/+1 counters from this creature.","power":"0","toughness":"0","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/9/9957ecca-5ea0-446f-bfd3-46c2aaa42f08.jpg?1783933486","artUrl":"https://cards.scryfall.io/art_crop/front/9/9/9957ecca-5ea0-446f-bfd3-46c2aaa42f08.jpg?1783933486","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string, amount?: number): TargetChoice => ({ kind: "object", id, ...(amount !== undefined ? { amount } : {}) }) as TargetChoice;
const ply = (id: PlayerId, amount?: number): TargetChoice => ({ kind: "player", id, ...(amount !== undefined ? { amount } : {}) }) as TargetChoice;
const NONE: TargetChoice = { kind: "none" };
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
/** Everyone passes, answering the end-of-turn questions, until `active`'s `step`; stops at any other question. */
const goUntil = (s: GameState, step: GameState["step"], active: PlayerId, max = 3000) => {
  for (let i = 0; i < max; i++) {
    if (s.step === step && s.activePlayer === active) return s;
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
    else if (pend) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error(`never reached ${step}`);
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone === "hand" ? "hand" : "graveyard"].push(id);
  invalidateCharacteristics(s);
  return id;
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Players pass in turn order until `pid` has priority (the stack unchanged). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const pool = (s: GameState, pid: PlayerId, m: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...m };
};
const ogre = (mv: number, name = `Ogre ${mv}`) => card(name, "Creature — Ogre", `{${mv - 1}}{R}`, { cmc: mv, colors: ["R"], power: "3", toughness: "3" });
const relic = (name: string, mv = 2) => card(name, "Artifact", `{${mv}}`, { cmc: mv });
const shock = (name = "Test Shock") => card(name, "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: `${name} deals 2 damage to any target.` });

describe("Lane B round B159", () => {
  it("compiles the cards", () => supported(remedy(), sphere(), field(), drafna(), bounty(), totem(), grim(), kirin()));

  it("Pollen Remedy divides 3 unkicked; kicked by sacrificing a land it divides 6 among targets chosen for that", () => {
    const { s: s0, ap, ids } = setup([remedy()]);
    const b = putOnBattlefield(s0, ap, bear());
    pool(s0, ap, { W: 1 });
    // Unkicked: 3 in all, the kicked targets left empty.
    const six = Array.from({ length: 6 }, () => NONE);
    expect(planCast(s0, ap, ids[0]!, [tgt(b, 3), ply(ap, 1), NONE, ...six])).toBeNull();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b, 2), ply(ap, 1), NONE, ...six])));
    expect(s.objects[b]!.preventNext).toBe(2);
    expect(s.players[ap]!.preventNext).toBe(1);
    // Kicked: a land sacrificed, 6 divided.
    const { s: s1, ap: ap1, ids: ids1 } = setup([remedy()]);
    const b1 = putOnBattlefield(s1, ap1, bear());
    const land = s1.battlefield.find((id) => s1.objects[id]!.controller === ap1 && s1.cards[s1.objects[id]!.cardId]?.types.includes("Land"))!;
    pool(s1, ap1, { W: 1 });
    const three = [NONE, NONE, NONE];
    expect(planCast(s1, ap1, ids1[0]!, [...three, tgt(b1, 4), ply(ap1, 3), NONE, NONE, NONE, NONE], undefined, "auto", undefined, { kicks: [0], sacrifice: [land] })).toBeNull();
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!, [...three, tgt(b1, 4), ply(ap1, 2), NONE, NONE, NONE, NONE], undefined, "auto", undefined, { kicks: [0], sacrifice: [land] })));
    expect(zone(s, land)).toBe("graveyard");
    expect(s.objects[b1]!.preventNext).toBe(4);
    expect(s.players[ap1]!.preventNext).toBe(2);
  });

  it("Sphere of Annihilation: at your upkeep it exiles itself, creatures and planeswalkers with mana value up to its void counters, and such cards in graveyards", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = others(s0, ap);
    s0.players[ap]!.hand = [];
    const sp = putOnBattlefield(s0, ap, sphere());
    s0.objects[sp]!.counters.void = 2;
    const small = putOnBattlefield(s0, o1!, ogre(2, "Small Ogre"));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const big = putOnBattlefield(s0, o1!, ogre(3, "Big Ogre"));
    const walker = putOnBattlefield(s0, o2!, card("Test Walker", "Legendary Planeswalker — Test", "{1}{W}", { cmc: 2, colors: ["W"], loyalty: "3", oracleText: "+1: You gain 1 life." }));
    s0.objects[walker]!.counters.loyalty = 3;
    const art = putOnBattlefield(s0, o2!, relic("Cheap Relic", 1));
    const deadSmall = toZone(s0, o2!, ogre(2, "Dead Small Ogre"), "graveyard");
    const deadBig = toZone(s0, o2!, ogre(4, "Dead Big Ogre"), "graveyard");
    const deadRelic = toZone(s0, o1!, relic("Dead Relic", 1), "graveyard");
    let s = goUntil(s0, "upkeep", o1!);
    s = goUntil(s, "upkeep", ap);
    s = settle(s);
    for (const id of [sp, small, mine, walker, deadSmall]) expect(zone(s, id), s.objects[id]!.cardId).toBe("exile");
    for (const id of [big, art]) expect(zone(s, id)).toBe("battlefield");
    expect(zone(s, deadBig)).toBe("graveyard");
    expect(zone(s, deadRelic)).toBe("graveyard");
  });

  it("Sphere of Annihilation with no void counters: only mana value 0 goes, a token creature among them", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    s0.players[ap]!.hand = [];
    const sp = putOnBattlefield(s0, ap, sphere());
    const zero = putOnBattlefield(s0, o1!, card("Zero Golem", "Artifact Creature — Golem", "{0}", { cmc: 0, power: "1", toughness: "1" }));
    const one = putOnBattlefield(s0, o1!, card("One Golem", "Artifact Creature — Golem", "{1}", { cmc: 1, power: "1", toughness: "1" }));
    let s = goUntil(s0, "upkeep", o1!);
    s = settle(goUntil(s, "upkeep", ap));
    expect(zone(s, sp)).toBe("exile");
    expect(zone(s, zero)).toBe("exile");
    expect(zone(s, one)).toBe("battlefield");
  });

  it("Quarantine Field: as many targets as isolation counters, all exiled until it leaves, then back together", () => {
    const { s: s0, ap, ids } = setup([field()]);
    const [o1, o2] = others(s0, ap);
    const a = putOnBattlefield(s0, o1!, ogre(3, "First Ogre"));
    const b = putOnBattlefield(s0, o2!, relic("Their Relic"));
    const c = putOnBattlefield(s0, o2!, ogre(2, "Third Ogre"));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    pool(s0, ap, { W: 2, C: 4 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)));
    expect(s.objects[ids[0]!]!.counters.isolation).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Not three (two counters), not your own permanent.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b), tgt(c)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(mine)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b)] }));
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, c)).toBe("battlefield");
    // It leaves: both come back.
    const naturalize = toZone(s, ap, card("Test Naturalize", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Destroy target artifact or enchantment." }), "hand");
    pool(s, ap, { G: 1 });
    s = settle(run(s, planCast(s, ap, naturalize, [tgt(ids[0]!)])));
    const back = s.battlefield.map((id) => s.cards[s.objects[id]!.cardId]!.name);
    expect(back).toEqual(expect.arrayContaining(["First Ogre", "Their Relic"]));
  });

  it("Drafna's Restoration: any number of artifact cards from the target player's graveyard, on top in the order you choose", () => {
    const { s: s0, ap, ids } = setup([drafna()]);
    const [o1, o2] = others(s0, ap);
    const r1 = toZone(s0, o1!, relic("Relic One"), "graveyard");
    const r2 = toZone(s0, o1!, relic("Relic Two"), "graveyard");
    const notArt = toZone(s0, o1!, ogre(2), "graveyard");
    const elsewhere = toZone(s0, o2!, relic("Other Relic"), "graveyard");
    pool(s0, ap, { U: 1 });
    // Only artifact cards, only from that player's graveyard.
    expect(castProblem(s0, ap, ids[0]!, [ply(o1!), tgt(notArt)])).toMatch(/target/);
    expect(castProblem(s0, ap, ids[0]!, [ply(o1!), tgt(r1), tgt(elsewhere)])).toMatch(/target/);
    let s = run(s0, planCast(s0, ap, ids[0]!, [ply(o1!), tgt(r1), tgt(r2)]));
    s = settle(s);
    // Two cards: you order them, Relic Two on top.
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap, owner: o1 });
    s = settle(act(s, { type: "orderLibrary", player: ap, order: [r2, r1] }));
    const lib = s.players[o1!]!.library;
    expect(lib.slice(0, 2)).toEqual([r2, r1]);
    expect(zone(s, notArt)).toBe("graveyard");
    expect(zone(s, elsewhere)).toBe("graveyard");
  });

  it("Drafna's Restoration with no card targets: still cast, nothing moves", () => {
    const { s: s0, ap, ids } = setup([drafna()]);
    const [o1] = others(s0, ap);
    const r1 = toZone(s0, o1!, relic("Relic One"), "graveyard");
    pool(s0, ap, { U: 1 });
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(o1!), NONE])));
    expect(zone(s, r1)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Bounty of the Hunt, cast by exiling a green card: three +1/+1 counters, the same number removed at the next cleanup step", () => {
    const { s: s0, ap, ids } = setup([bounty()]);
    const a = putOnBattlefield(s0, ap, bear({ name: "First Bear" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Second Bear" }));
    const green = toZone(s0, ap, bear({ name: "Pitched Bear" }), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a, 2), tgt(b, 1), NONE], undefined, "auto", undefined, { alt: "alternative", exileFromHand: [green] })));
    expect(zone(s, green)).toBe("exile");
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    // Still there in the end step; gone after the cleanup step.
    s = goUntil(s, "end", ap);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
    // Another counter on the first bear: only two are removed (not necessarily the same counters, as Shambling Swarm's rulings).
    s.objects[a]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    const [o1] = others(s, ap);
    s = goUntil(s, "upkeep", o1!);
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Grinning Totem: you exile a card from the opponent's library and may play it, paying for it, until your next upkeep", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const t = putOnBattlefield(s0, ap, totem());
    const prize = toZone(s0, o1!, ogre(2, "Prize Ogre"), "library");
    pool(s0, ap, { C: 2 });
    let s = run(s0, planActivate(s0, ap, t, 0, [ply(o1!)]));
    expect(zone(s, t)).toBe("graveyard");
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [prize] }));
    expect(zone(s, prize)).toBe("exile");
    // Cast it, paying its cost (your lands).
    s = settle(run(s, planCast(s, ap, prize)));
    expect(zone(s, prize)).toBe("battlefield");
    expect(s.objects[prize]!.controller).toBe(ap);
    expect(s.objects[prize]!.owner).toBe(o1);
    // At your next upkeep nothing happens to it.
    s = goUntil(s, "upkeep", o1!);
    s = settle(goUntil(s, "upkeep", ap));
    expect(zone(s, prize)).toBe("battlefield");
  });

  it("Grinning Totem: a card not played is put into its owner's graveyard at your next upkeep, and can't be played once that upkeep began", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const t = putOnBattlefield(s0, ap, totem());
    const prize = toZone(s0, o1!, shock("Prize Shock"), "library");
    pool(s0, ap, { C: 2 });
    let s = settle(run(s0, planActivate(s0, ap, t, 0, [ply(o1!)])));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [prize] }));
    expect(s.objects[prize]!.mayPlay).toMatchObject({ player: ap, until: "yourNextUpkeep" });
    // Still playable during the opponent's turn (an instant).
    s = goUntil(s, "upkeep", o1!);
    expect(s.objects[prize]!.mayPlay).toBeDefined();
    s = goUntil(s, "upkeep", ap);
    expect(s.objects[prize]!.mayPlay).toBeUndefined();
    s = settle(s);
    expect(zone(s, prize)).toBe("graveyard");
    expect(s.players[o1!]!.graveyard).toContain(prize);
  });

  it("Grinning Totem: you must find a card (no quality is stated)", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const t = putOnBattlefield(s0, ap, totem());
    pool(s0, ap, { C: 2 });
    const s = settle(run(s0, planActivate(s0, ap, t, 0, [ply(o1!)])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
  });

  it("Grim Reminder: the revealed card stays in your library; each opponent who cast a spell with its name this turn loses 6 life", () => {
    const { s: s0, ap, ids } = setup([grim()]);
    const [o1, o2, o3] = others(s0, ap);
    s0.players[ap]!.hand = [ids[0]!];
    const named = toZone(s0, ap, shock("Twin Shock"), "library");
    let s = goUntil(s0, "main1", o1!);
    // o1 casts Twin Shock; o2 casts a differently named spell; o3 casts nothing.
    const theirs = toZone(s, o1!, shock("Twin Shock"), "hand");
    pool(s, o1!, { R: 1 });
    s = settle(run(s, planCast(s, o1!, theirs, [ply(o2!)])));
    const other = toZone(s, o2!, shock("Other Shock"), "hand");
    pool(s, o2!, { R: 1 });
    s = priorityTo(s, o2!);
    s = run(s, planCast(s, o2!, other, [ply(o3!)]));
    s = settle(s);
    const life = (pid: PlayerId) => s.players[pid]!.life;
    const before = [o1, o2, o3].map((p) => life(p!));
    pool(s, ap, { B: 1, C: 2 });
    s = priorityTo(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    // The bot picks the card named like an opponent's spell.
    expect(botActions(s, ap)[0]).toMatchObject({ type: "searchLibrary", found: [named] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [named] }));
    expect(zone(s, named)).toBe("library");
    expect([o1, o2, o3].map((p) => life(p!))).toEqual([before[0]! - 6, before[1]!, before[2]!]);
    expect(s.log.some((l) => /Twin Shock/.test(l.text))).toBe(true);
  });

  it("Grim Reminder: a face-down spell has no name, and spells cast on an earlier turn don't count", () => {
    const { s: s0, ap, ids } = setup([grim()]);
    const [o1] = others(s0, ap);
    const named = toZone(s0, ap, shock("Twin Shock"), "library");
    // Cast last turn: gone from this turn's list.
    s0.castThisTurn = [{ player: o1!, card: "x", name: "Twin Shock" }];
    let s = goUntil(s0, "main1", o1!);
    expect(s.castThisTurn ?? []).toEqual([]);
    s.castThisTurn = [{ player: o1!, card: "y" }];
    const before = s.players[o1!]!.life;
    pool(s, ap, { B: 1, C: 2 });
    s = priorityTo(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [named] }));
    expect(s.players[o1!]!.life).toBe(before);
  });

  /** Ken casts a Spirit with Infernal Kirin out; Ana holds cards of mana values 1 to 3. */
  const kirinGame = (spell: CardDef) => {
    const { s: s0, ap, ids } = setup([spell]);
    const [o1] = others(s0, ap);
    putOnBattlefield(s0, ap, kirin());
    s0.players[ap]!.hand = [ids[0]!];
    const hand = [ogre(2, "Ogre A"), ogre(2, "Ogre B"), relic("Relic One", 1), ogre(3)].map((d) => toZone(s0, o1!, d, "hand"));
    const s = goUntil(s0, "main1", ap);
    s.players[o1!]!.hand = [...hand];
    return { s, ap, o1: o1!, spell: ids[0]!, hand };
  };

  it("Infernal Kirin: target player discards every card with the Spirit spell's mana value, no choice", () => {
    let { s, ap, o1, spell, hand } = kirinGame(kami());
    pool(s, ap, { W: 1, C: 1 });
    s = run(s, planCast(s, ap, spell));
    // The trigger targets a player as it's put on the stack.
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(o1)] }));
    expect(hand.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "hand", "hand"]);
    expect(zone(s, spell)).toBe("battlefield");
  });

  it("Infernal Kirin: a Spirit with {X} counts X as cast (rulings)", () => {
    let { s, ap, o1, spell, hand } = kirinGame(conjurant());
    pool(s, ap, { C: 3 });
    s = run(s, planCast(s, ap, spell, [], undefined, undefined, 3));
    s = settle(s);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(o1)] }));
    expect(hand.map((id) => zone(s, id))).toEqual(["hand", "hand", "hand", "graveyard"]);
    expect(s.objects[spell]!.counters?.["+1/+1"]).toBe(3);
  });
});

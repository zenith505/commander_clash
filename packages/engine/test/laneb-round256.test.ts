// Lane B round B256: False Orders and Balduvian Warlord (a creature removed from combat, the attackers only it had blocked
// unblocked, then it blocks an attacking creature of the player's choice: CR 506.4, 509.1h, 509.3a-d, 802.4a, rulings),
// Raiding Party (each player taps white creatures to spare Plains, CR 101.4, rulings) and Search the City (playing a card
// with the name of a card it exiled, CR 607.2a, rulings).

import { describe, expect, it } from "vitest";
import { act, mountain, passUntil, plainsCard, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const falseOrders = (): CardDef => ({"oracleId":"38c5c952-8153-4d98-89b5-a75260383345","name":"False Orders","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during the declare blockers step.\nRemove target creature defending player controls from combat. Creatures it was blocking that had become blocked by only that creature this combat become unblocked. You may have it block an attacking creature of your choice.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/e/7eb71ac4-796d-4011-9002-1129bc09c284.jpg?1783948687","artUrl":"https://cards.scryfall.io/art_crop/front/7/e/7eb71ac4-796d-4011-9002-1129bc09c284.jpg?1783948687","layout":"normal"});
const warlord = (): CardDef => ({"oracleId":"f73d1525-ab0b-4772-9dfa-66e1c84c3ea4","name":"Balduvian Warlord","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Human Barbarian","supertypes":[],"types":["Creature"],"subtypes":["Human","Barbarian"],"oracleText":"{T}: Remove target blocking creature from combat. Creatures it was blocking that hadn't become blocked by another creature this combat become unblocked, then it blocks an attacking creature of your choice. Activate only during the declare blockers step.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a3286dbd-c8b8-45cb-98e4-d572289f2c14.jpg?1783943344","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a3286dbd-c8b8-45cb-98e4-d572289f2c14.jpg?1783943344","layout":"normal"});
const raidingParty = (): CardDef => ({"oracleId":"1d9b8859-14e3-4bbe-ad92-916b25a37b31","name":"Raiding Party","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"This enchantment can't be the target of white spells or abilities from white sources.\nSacrifice an Orc: Each player may tap any number of untapped white creatures they control. For each creature tapped this way, that player chooses up to two Plains. Then destroy all Plains that weren't chosen this way by any player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/907a3396-706b-4ca2-9973-bca758986032.jpg?1783947890","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/907a3396-706b-4ca2-9973-bca758986032.jpg?1783947890","layout":"normal"});
const searchTheCity = (): CardDef => ({"oracleId":"fe1b0b19-0994-4bc7-ab6c-d1419d274f40","name":"Search the City","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile the top five cards of your library.\nWhenever you play a card with the same name as one of the exiled cards, you may put one of those cards with that name into its owner's hand. Then if there are no cards exiled with this enchantment, sacrifice it. If you do, take an extra turn after this one.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9cd77575-fedc-45b1-a53b-dfed0f34c875.jpg?1783940366","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9cd77575-fedc-45b1-a53b-dfed0f34c875.jpg?1783940366","layout":"normal"});
const giantBadger = (): CardDef => ({"oracleId":"a4109138-5d69-4510-a228-7c1f88c0c8c0","name":"Giant Badger","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Badger","supertypes":[],"types":["Creature"],"subtypes":["Badger"],"oracleText":"Whenever this creature blocks, it gets +2/+2 until end of turn.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/0/10e9dd66-8580-4c96-9ab9-cc392dc6ee74.jpg?1783944676","artUrl":"https://cards.scryfall.io/art_crop/front/1/0/10e9dd66-8580-4c96-9ab9-cc392dc6ee74.jpg?1783944676","layout":"normal"});
const trainedCheetah = (): CardDef => ({"oracleId":"dad3b459-725e-4bf5-bf7a-bd89866ea8c4","name":"Trained Cheetah","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"Whenever this creature becomes blocked, it gets +1/+1 until end of turn.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab242eab-5cab-41a0-bcf8-93a6919e4558.jpg?1783946097","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab242eab-5cab-41a0-bcf8-93a6919e4558.jpg?1783946097","layout":"normal"});
const savannahLions = (): CardDef => ({"oracleId":"60ba93eb-39e6-4af2-9c66-cd38f72daff2","name":"Savannah Lions","manaCost":"{W}","cmc":1,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","layout":"normal"});
const marduOutrider = (): CardDef => ({"oracleId":"9bc5ed59-ae13-40df-94b9-c56c32673857","name":"Mardu Outrider","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Orc Warrior","supertypes":[],"types":["Creature"],"subtypes":["Orc","Warrior"],"oracleText":"As an additional cost to cast this spell, discard a card.","power":"5","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/e/fe0afbaf-2a0b-4f2f-9649-662923713d8b.jpg?1783929817","artUrl":"https://cards.scryfall.io/art_crop/front/f/e/fe0afbaf-2a0b-4f2f-9649-662923713d8b.jpg?1783929817","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority (no attacks or blocks) until `done`. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 400) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never done");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
/** A fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** A fresh copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Lane B round B256", () => {
  it("are fully supported", () => {
    supported(falseOrders(), warlord(), raidingParty(), searchTheCity());
    expect(compileCard(falseOrders()).spell?.effects).toEqual([expect.objectContaining({ type: "reblock", may: true })]);
    expect(compileCard(warlord()).activated[0]?.body.effects).toEqual([{ type: "reblock", what: { ref: "target", index: 0 } }]);
    expect(compileCard(raidingParty()).activated[0]?.body.effects).toEqual([{ type: "raidingParty" }]);
    const city = compileCard(searchTheCity());
    expect(city.triggers[0]!.body.effects).toEqual([expect.objectContaining({ type: "exileTop", n: 5, linked: true })]);
    expect(city.triggers[1]!.cast).toEqual(expect.objectContaining({ by: "you", cardOnly: true, nameExiledWithSelf: true }));
  });
});

/** `ap` attacks `opp` with Grizzly Bears and Hill Giant; `opp` blocks the Bears with Giant Badger. */
const combat = (hand: CardDef[], board: CardDef[] = []) => {
  const { s: s0, ap, ids } = setup(hand);
  const opp = leftOf(s0, ap);
  const bears = putOnBattlefield(s0, ap, grizzlyBears());
  const giant = putOnBattlefield(s0, ap, hillGiant());
  const badger = putOnBattlefield(s0, opp, giantBadger());
  const extra = board.map((d) => putOnBattlefield(s0, ap, d));
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bears, defender: opp }, { attacker: giant, defender: opp }] } as Action);
  s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === opp);
  s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: badger, attacker: bears }] } as Action);
  // The other defending players declare none; the Badger's "blocks" trigger resolves.
  s = until(s, (x) => !x.pending && !x.stack.length && !x.triggerQueue.length && x.step === "declareBlockers" && waitingOn(x) === ap);
  return { s, ap, opp, ids, bears, giant, badger, extra };
};

describe("Lane B round B256: False Orders", () => {
  it("removes the blocker, unblocks what only it blocked, and lets the caster have it block another attacker (it blocks again)", () => {
    const c = combat([falseOrders()]);
    expect(power(c.s, c.s.objects[c.badger]!)).toBe(4); // Giant Badger's "blocks" trigger: +2/+2.
    let s = run(c.s, planCast(c.s, c.ap, c.ids[0]!, [tgt(c.badger)]));
    s = settle(s, [c.ap]);
    expect(s.pending).toEqual(expect.objectContaining({ kind: "chooseOption", what: "reblockAttacker", player: c.ap, about: c.badger }));
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(expect.arrayContaining([c.bears, c.giant, "none"]));
    // The Bears are unblocked already (only the Badger had blocked them).
    expect(s.objects[c.bears]!.blockedBy).toBeUndefined();
    expect(s.objects[c.badger]!.blocking).toBeUndefined();
    s = act(s, { type: "chooseOption", player: c.ap, choice: c.giant });
    expect(s.objects[c.badger]!.blocking).toEqual([c.giant]);
    expect(s.objects[c.giant]!.blockedBy).toEqual([c.badger]);
    expect(zone(s, c.ids[0]!)).toBe("graveyard");
    // It wasn't blocking when the effect made it block, so "Whenever ~ blocks" triggers again (CR 509.3a).
    s = settle(s, [c.ap]);
    expect(power(s, s.objects[c.badger]!)).toBe(6);
    const life = s.players[c.opp]!.life;
    s = until(s, (x) => x.step === "end");
    // The Bears were unblocked, the Hill Giant blocked: only the Bears' 2 damage reaches the player (CR 509.1h, 510.1).
    expect(s.players[c.opp]!.life).toBe(life - 2);
    expect(zone(s, c.giant)).toBe("graveyard");
  });

  it("may leave it out of combat, and the creature can re-block what it blocked (it's then blocked again)", () => {
    const c = combat([falseOrders(), falseOrders()]);
    let s = settle(run(c.s, planCast(c.s, c.ap, c.ids[0]!, [tgt(c.badger)])), [c.ap]);
    s = act(s, { type: "chooseOption", player: c.ap, choice: "none" });
    expect(s.objects[c.badger]!.blocking).toBeUndefined();
    expect(s.objects[c.bears]!.blockedBy).toBeUndefined();
    s = settle(s, [c.ap]);
    // A second one: it may block the Bears again (rulings on Balduvian Warlord).
    s = settle(run(s, planCast(s, c.ap, c.ids[1]!, [tgt(c.badger)])), [c.ap]);
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(expect.arrayContaining([c.bears, c.giant]));
    s = act(s, { type: "chooseOption", player: c.ap, choice: c.bears });
    expect(s.objects[c.bears]!.blockedBy).toEqual([c.badger]);
    expect(logged(s, /Giant Badger blocks Grizzly Bears \(False Orders\)/)).toBe(true);
  });

  it("a creature that isn't blocking can be made to block, only an attacker attacking its controller (CR 802.4a)", () => {
    const { s: s0, ap, ids } = setup([falseOrders()]);
    const opp = leftOf(s0, ap);
    const opp2 = leftOf(s0, ap, 2);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const lions = putOnBattlefield(s0, opp, savannahLions());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }, { attacker: bears, defender: opp2 }] } as Action);
    s = until(s, (x) => x.step === "declareBlockers" && !x.pending && waitingOn(x) === ap);
    expect(s.objects[giant]!.blockedBy).toBeUndefined();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(lions)])), [ap]);
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual([giant, "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: giant });
    expect(s.objects[lions]!.blocking).toEqual([giant]);
    expect(s.objects[giant]!.blockedBy).toEqual([lions]);
  });

  it("can only be cast during the declare blockers step, and its target is a creature a defending player controls", () => {
    const { s: s0, ap, ids } = setup([falseOrders()]);
    const opp = leftOf(s0, ap);
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    expect(planCast(s0, ap, ids[0]!, [tgt(theirs)])).toBeNull();
  });
});

describe("Lane B round B256: Balduvian Warlord", () => {
  it("its activated ability removes a blocking creature and that creature must block an attacker of the controller's choice", () => {
    const c = combat([], [warlord()]);
    const w = c.extra[0]!;
    let s = run(c.s, planActivate(c.s, c.ap, w, 0, [tgt(c.badger)]));
    s = settle(s, [c.ap]);
    expect(s.pending).toEqual(expect.objectContaining({ kind: "chooseOption", what: "reblockAttacker", about: c.badger }));
    // Not optional: no "none".
    expect(s.pending?.kind === "chooseOption" && s.pending.options.includes("none")).toBe(false);
    expect(s.objects[w]!.tapped).toBe(true);
    s = act(s, { type: "chooseOption", player: c.ap, choice: c.giant });
    expect(s.objects[c.giant]!.blockedBy).toEqual([c.badger]);
    expect(s.objects[c.bears]!.blockedBy).toBeUndefined();
  });

  it("an attacker another creature had also blocked this combat stays blocked, even once that creature is gone (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const w = putOnBattlefield(s0, ap, warlord());
    const badger = putOnBattlefield(s0, opp, giantBadger());
    const lions = putOnBattlefield(s0, opp, savannahLions());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === opp);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: badger, attacker: giant }, { blocker: lions, attacker: giant }] } as Action);
    s = until(s, (x) => !x.pending && !x.stack.length && !x.triggerQueue.length && x.step === "declareBlockers" && waitingOn(x) === ap);
    // The Lions leave; the Badger is removed: the Giant stays blocked (CR 509.1h).
    s.battlefield.splice(s.battlefield.indexOf(lions), 1);
    s.objects[lions]!.zone = "graveyard";
    s.objects[giant]!.blockedBy = [badger];
    invalidateCharacteristics(s);
    s = settle(run(s, planActivate(s, ap, w, 0, [tgt(badger)])), [ap]);
    // The only attacker is the Giant: it blocks it again.
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: giant });
    expect(s.objects[giant]!.blockedBy).toEqual([badger]);
  });

  it("the attacker becomes blocked again for its 'becomes blocked' trigger only if it was unblocked then (CR 509.3c)", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const cheetah = putOnBattlefield(s0, ap, trainedCheetah());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const w = putOnBattlefield(s0, ap, warlord());
    const badger = putOnBattlefield(s0, opp, giantBadger());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cheetah, defender: opp }, { attacker: giant, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === opp);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: badger, attacker: giant }] } as Action);
    s = until(s, (x) => !x.pending && !x.stack.length && !x.triggerQueue.length && x.step === "declareBlockers" && waitingOn(x) === ap);
    expect(power(s, s.objects[cheetah]!)).toBe(2);
    s = settle(run(s, planActivate(s, ap, w, 0, [tgt(badger)])), [ap]);
    s = act(s, { type: "chooseOption", player: ap, choice: cheetah });
    s = settle(s, [ap]);
    // The Cheetah was unblocked: its "becomes blocked" trigger gives it +1/+1.
    expect(power(s, s.objects[cheetah]!)).toBe(3);
    expect(s.objects[giant]!.blockedBy).toBeUndefined();
  });

  it("bots choose an attacker for their creature to block that it kills and survives", () => {
    const c = combat([], [warlord()]);
    const w = c.extra[0]!;
    // Hand the Warlord to the defending player: their own Badger (4/4 now) blocks an attacker it kills and survives.
    c.s.objects[w]!.controller = c.opp;
    invalidateCharacteristics(c.s);
    let s = c.s;
    s.priority = c.opp;
    s = run(s, planActivate(s, c.opp, w, 0, [tgt(c.badger)]));
    for (let i = 0; i < 20 && !(s.pending?.kind === "chooseOption"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toEqual(expect.objectContaining({ what: "reblockAttacker", player: c.opp }));
    s = run(s, botActions(s, c.opp));
    // The Badger is 4/4: it kills the 3/3 Hill Giant and survives, or the 2/2 Bears; the bigger one first.
    expect(s.objects[c.badger]!.blocking).toEqual([c.giant]);
  });
});

describe("Lane B round B256: Raiding Party", () => {
  it("each player taps white creatures to spare two Plains each; every other Plains is destroyed", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const party = putOnBattlefield(s0, ap, raidingParty());
    const orc = putOnBattlefield(s0, ap, marduOutrider());
    const lions = putOnBattlefield(s0, opp, savannahLions());
    const theirPlains = [putOnBattlefield(s0, opp, plainsCard), putOnBattlefield(s0, opp, plainsCard), putOnBattlefield(s0, opp, plainsCard)];
    const myPlains = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Plains");
    expect(myPlains.length).toBe(3);
    let s = run(s0, planActivate(s0, ap, party, 0, undefined, undefined, undefined, undefined, { sacrifice: [orc] }));
    expect(zone(s, orc)).toBe("graveyard");
    s = settle(s, [ap, opp]);
    // The active player has no white creatures: not asked. The opponent is.
    expect(s.pending).toEqual(expect.objectContaining({ kind: "pickPermanents", player: opp, action: "tap", raid: "tap", options: [lions] }));
    s = act(s, { type: "pickPermanents", player: opp, ids: [lions] });
    // Tapped once every player has chosen (CR 101.4).
    expect(s.objects[lions]!.tapped).toBe(false);
    expect(s.pending).toEqual(expect.objectContaining({ kind: "pickPermanents", player: opp, raid: "plains", count: 2, min: 0 }));
    // Anyone's Plains can be chosen.
    expect(s.pending?.kind === "pickPermanents" && s.pending.options).toEqual(expect.arrayContaining([...theirPlains, ...myPlains]));
    s = act(s, { type: "pickPermanents", player: opp, ids: [theirPlains[0]!, myPlains[0]!] });
    s = settle(s, [ap, opp]);
    expect(s.pending).toBeNull();
    expect(s.objects[lions]!.tapped).toBe(true);
    expect(zone(s, theirPlains[0]!)).toBe("battlefield");
    expect(zone(s, myPlains[0]!)).toBe("battlefield");
    for (const id of [theirPlains[1]!, theirPlains[2]!, myPlains[1]!, myPlains[2]!]) expect(zone(s, id)).toBe("graveyard");
  });

  it("bots tap just enough white creatures for their own Plains, then spare their own", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const party = putOnBattlefield(s0, ap, raidingParty());
    const orc = putOnBattlefield(s0, ap, marduOutrider());
    const lions = [putOnBattlefield(s0, opp, savannahLions()), putOnBattlefield(s0, opp, savannahLions()), putOnBattlefield(s0, opp, savannahLions())];
    const theirPlains = [putOnBattlefield(s0, opp, plainsCard), putOnBattlefield(s0, opp, plainsCard), putOnBattlefield(s0, opp, plainsCard)];
    let s = settle(run(s0, planActivate(s0, ap, party, 0, undefined, undefined, undefined, undefined, { sacrifice: [orc] })), [ap]);
    expect(s.pending).toBeNull();
    // Three Plains: two Lions tapped, the third untapped.
    expect(lions.filter((id) => s.objects[id]!.tapped).length).toBe(2);
    for (const id of theirPlains) expect(zone(s, id)).toBe("battlefield");
    expect(logged(s, /Raiding Party destroys/)).toBe(true);
  });
});

describe("Lane B round B256: Search the City", () => {
  /** Search the City on the battlefield with `exiled` linked to it (as its enters ability exiles them). */
  const city = (exiled: CardDef[], hand: CardDef[]) => {
    const { s: s0, ap, ids } = setup([searchTheCity(), ...hand]);
    // Only these cards and Forests below them: none named like the cards cast.
    const p = s0.players[ap]!;
    p.library = p.library.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest").slice(0, 10);
    if (exiled.length < 5) p.library = [];
    const tops = [...exiled].reverse().map((d) => onTop(s0, ap, d)).reverse();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])), [ap]);
    return { s, ap, ids, tops };
  };

  it("exiles the top five as it enters; playing a card with one's name may return it; with cards still exiled it stays", () => {
    const r = city([lightningBolt(), mountain, savannahLions(), savannahLions(), serraAngel()], [lightningBolt(), mountain]);
    let s = r.s;
    const sc = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Search the City")!;
    for (const id of r.tops) expect(zone(s, id)).toBe("exile");
    // Cast Lightning Bolt: the trigger asks.
    const opp = leftOf(s, r.ap);
    s = run(s, planCast(s, r.ap, r.ids[1]!, [{ kind: "player", id: opp }]));
    s = settle(s, [r.ap]);
    expect(s.pending).toEqual(expect.objectContaining({ kind: "chooseOption", what: "cityCard", options: [r.tops[0], "none"] }));
    s = act(s, { type: "chooseOption", player: r.ap, choice: r.tops[0]! });
    expect(zone(s, r.tops[0]!)).toBe("hand");
    s = settle(s, [r.ap]);
    // Play the Mountain: its name matches the exiled Mountain.
    s = act(s, { type: "playLand", player: r.ap, objectId: r.ids[2]! } as Action);
    s = settle(s, [r.ap]);
    expect(s.pending).toEqual(expect.objectContaining({ what: "cityCard", options: [r.tops[1], "none"] }));
    s = act(s, { type: "chooseOption", player: r.ap, choice: "none" });
    expect(zone(s, r.tops[1]!)).toBe("exile");
    expect(zone(s, sc)).toBe("battlefield");
    expect(s.extraTurns ?? []).toEqual([]);
  });

  it("a card with no matching name doesn't trigger; with none left exiled, it's sacrificed and its controller takes an extra turn", () => {
    const r = city([lightningBolt()], [lightningBolt(), savannahLions()]);
    let s = r.s;
    const sc = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Search the City")!;
    // Only one card was in the library's top: one exiled.
    expect(zone(s, r.tops[0]!)).toBe("exile");
    s = settle(run(s, planCast(s, r.ap, r.ids[2]!, [])), [r.ap]);
    expect(s.pending).toBeNull();
    expect(logged(s, /cityCard/)).toBe(false);
    const opp = leftOf(s, r.ap);
    s = settle(run(s, planCast(s, r.ap, r.ids[1]!, [{ kind: "player", id: opp }])), [r.ap]);
    s = act(s, { type: "chooseOption", player: r.ap, choice: r.tops[0]! });
    expect(zone(s, sc)).toBe("graveyard");
    expect(s.extraTurns).toEqual([expect.objectContaining({ player: r.ap })]);
  });

  it("bots take the card", () => {
    const r = city([lightningBolt()], [lightningBolt()]);
    let s = r.s;
    const opp = leftOf(s, r.ap);
    s = settle(run(s, planCast(s, r.ap, r.ids[1]!, [{ kind: "player", id: opp }])), [r.ap]);
    s = run(s, botActions(s, r.ap));
    expect(zone(s, r.tops[0]!)).toBe("hand");
  });
});

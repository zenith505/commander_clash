// Lane B round B156: Price of Betrayal and Etched Slith (counters removed from a permanent or an opponent, rulings),
// Wicked Slumber ("either of them", twice), Highcliff Felidar (for each opponent, a creature with the greatest power),
// Two-Headed Giant (two uncalled coins, CR 705.2), Chandra, the Firebrand ("each of up to six targets"), Soul-Shackled
// Zombie ("if at least one creature card was exiled this way"), Death or Glory (graveyard piles, CR 700.3) and Mercurial
// Transformation (a Frog or an Octopus, chosen as it resolves).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const betrayal = (): CardDef => ({"oracleId":"43a2bfe4-9705-4d0f-901a-21f9803b50f1","name":"Price of Betrayal","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Remove up to five counters from target artifact, creature, planeswalker, or opponent.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd68e918-5089-46c9-8836-b05a3da3c7a3.jpg?1783933440","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd68e918-5089-46c9-8836-b05a3da3c7a3.jpg?1783933440","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const slith = (): CardDef => ({"oracleId":"f1bd0d32-7513-4d1d-94aa-d06101a940c0","name":"Etched Slith","manaCost":"{1}{B}","cmc":2,"typeLine":"Artifact Creature — Phyrexian Slith","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Slith"],"oracleText":"Menace\nWhenever this creature deals combat damage to a player, put a +1/+1 counter on it. When you do, you may remove a counter from another target permanent or opponent.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/428e255d-bdda-4265-91cf-d02962e818e4.jpg?1783911281","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/428e255d-bdda-4265-91cf-d02962e818e4.jpg?1783911281","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const slumber = (): CardDef => ({"oracleId":"5b27b794-580c-472d-b63e-99b271eb115d","name":"Wicked Slumber","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nTap up to two target creatures. Put a stun counter on either of them. Then put a stun counter on either of them. (If a permanent with a stun counter would become untapped, remove one from it instead.)","colors":["U"],"colorIdentity":["U"],"keywords":["Convoke"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/140cd8bd-b74d-4cb1-b78f-8de3cbd878ff.jpg?1783917023","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/140cd8bd-b74d-4cb1-b78f-8de3cbd878ff.jpg?1783917023","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const felidar = (): CardDef => ({"oracleId":"43296f8b-58d9-446e-a538-1c4921552c41","name":"Highcliff Felidar","manaCost":"{5}{W}{W}","cmc":7,"typeLine":"Creature — Cat Beast","supertypes":[],"types":["Creature"],"subtypes":["Cat","Beast"],"oracleText":"Vigilance\nWhen this creature enters, for each opponent, choose a creature with the greatest power among creatures that player controls. Destroy those creatures.","power":"5","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/e/c/ecbeac44-9392-4522-8ff5-87079386bd0a.jpg?1783931668","artUrl":"https://cards.scryfall.io/art_crop/front/e/c/ecbeac44-9392-4522-8ff5-87079386bd0a.jpg?1783931668","commanderLegal":"legal","set":"gn2","releasedAt":"2019-11-15","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const twoHeaded = (): CardDef => ({"oracleId":"e0efb48b-e7e5-4ed0-a7de-c8f72d357319","name":"Two-Headed Giant","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Giant Warrior","supertypes":[],"types":["Creature"],"subtypes":["Giant","Warrior"],"oracleText":"Whenever this creature attacks, flip two coins. If both coins come up heads, this creature gains double strike until end of turn. If both coins come up tails, this creature gains menace until end of turn.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f86c365-3ce5-45e5-b610-6f2587f99b42.jpg?1783934986","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f86c365-3ce5-45e5-b610-6f2587f99b42.jpg?1783934986","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chandra = (): CardDef => ({"oracleId":"536c1112-694f-42f8-a7b1-604389e54a95","name":"Chandra, the Firebrand","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Chandra deals 1 damage to any target.\n−2: When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.\n−6: Chandra deals 6 damage to each of up to six targets.","loyalty":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/f/efb37556-186f-4660-8b75-c52ef16a6d8f.jpg?1783941073","artUrl":"https://cards.scryfall.io/art_crop/front/e/f/efb37556-186f-4660-8b75-c52ef16a6d8f.jpg?1783941073","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const zombie = (): CardDef => ({"oracleId":"f81ca3a5-356d-4b5d-afc2-a33aa774816b","name":"Soul-Shackled Zombie","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"When this creature enters, exile up to two target cards from a single graveyard. If at least one creature card was exiled this way, each opponent loses 2 life and you gain 2 life.","power":"4","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/deea5690-6eb2-4353-b917-cbbf840e4e71.jpg?1783909108","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/deea5690-6eb2-4353-b917-cbbf840e4e71.jpg?1783909108","commanderLegal":"legal","set":"fdn","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const deathOrGlory = (): CardDef => ({"oracleId":"b2ae0968-28ed-4ebb-a4e8-69ff6e6a6f1d","name":"Death or Glory","manaCost":"{4}{W}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Separate all creature cards in your graveyard into two piles. Exile the pile of an opponent's choice and return the other to the battlefield.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81f967c9-b38d-489d-96cc-44a6b1804e10.jpg?1783945718","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81f967c9-b38d-489d-96cc-44a6b1804e10.jpg?1783945718","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mercurial = (): CardDef => ({"oracleId":"c7efe6c6-3da1-47a6-a8ad-30c36502a7ab","name":"Mercurial Transformation","manaCost":"{1}{U}","cmc":2,"typeLine":"Sorcery — Lesson","supertypes":[],"types":["Sorcery"],"subtypes":["Lesson"],"oracleText":"Until end of turn, target nonland permanent loses all abilities and becomes your choice of a blue Frog creature with base power and toughness 1/1 or a blue Octopus creature with base power and toughness 4/4.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/adcbe115-5482-4e5a-95bb-8ccbb01d3547.jpg?1783927377","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/adcbe115-5482-4e5a-95bb-8ccbb01d3547.jpg?1783927377","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const doubling = (): CardDef => ({"oracleId":"01546b7d-a233-4176-8843-d732074dc5b6","name":"Doubling Season","manaCost":"{4}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/29ba5a2d-d787-4214-8cd7-7f2bcea938f8.jpg?1783934805","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/29ba5a2d-d787-4214-8cd7-7f2bcea938f8.jpg?1783934805","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const judgment = (): CardDef => ({"oracleId":"932177b8-70f8-4908-a48f-fe03204daddc","name":"Light of Judgment","manaCost":"{4}{R}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Light of Judgment deals 6 damage to target creature. Destroy up to one Equipment attached to that creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98bb716d-ca66-445f-9cb3-0fc656c8ebff.jpg?1783906602","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98bb716d-ca66-445f-9cb3-0fc656c8ebff.jpg?1783906602","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string) => ({ kind: "object" as const, id });
const ply = (id: PlayerId) => ({ kind: "player" as const, id });
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
/** Passes (no blockers) until a question for `pid` or the second main phase. */
const throughCombat = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 400; i++) {
    if (s.pending?.kind === "declareBlockers") {
      s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      continue;
    }
    if ((s.pending && "player" in s.pending && s.pending.player === pid) || s.step === "main2") return s;
    if (s.pending) throw new Error(`unexpected ${s.pending.kind}`);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
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
const lines = (s: GameState) => s.log.map((l) => l.text);
const beast = (name: string, p: number, extra: Partial<CardDef> = {}) => card(name, "Creature — Beast", "{2}{G}", { power: String(p), toughness: String(p), colors: ["G"], ...extra });
const relic = (name = "Test Relic") => card(name, "Artifact", "{2}", { oracleText: "" });
const removeCounter = (s: GameState, pid: PlayerId, kind: string) => act(s, { type: "chooseOption", player: pid, choice: kind });

describe("Lane B round B156", () => {
  it("compiles the cards", () => supported(betrayal(), slith(), slumber(), felidar(), twoHeaded(), chandra(), zombie(), deathOrGlory(), mercurial()));

  it("Price of Betrayal: up to five counters of any kinds off target opponent, chosen one at a time (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([betrayal()]);
    const p = s0.players[opp]!;
    p.energy = 3;
    p.experience = 2;
    p.poison = 4;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "removeCounter", of: opp });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["poison", "energy", "experience", "done"]);
    for (const k of ["poison", "poison", "energy", "experience", "experience"]) s = removeCounter(s, ap, k);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect([s.players[opp]!.poison, s.players[opp]!.energy, s.players[opp]!.experience]).toEqual([2, 2, 0]);
  });

  it("Price of Betrayal: stopping early; a creature's counters; never yourself or an enchantment", () => {
    const { s: s0, ap, ids, opp } = setup([betrayal()]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.counters = { "+1/+1": 3, stun: 1 };
    const aura = putOnBattlefield(s0, opp, card("Test Shrine", "Enchantment", "{1}", { oracleText: "" }));
    s0.objects[aura]!.counters = { charge: 2 };
    s0.players[ap]!.energy = 2;
    expect(planCast(s0, ap, ids[0]!, [ply(ap)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(aura)])).toBeNull();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter", about: b });
    s = removeCounter(s, ap, "+1/+1");
    s = removeCounter(s, ap, "+1/+1");
    s = settle(removeCounter(s, ap, "done"));
    expect(s.objects[b]!.counters).toMatchObject({ "+1/+1": 1, stun: 1 });
  });

  it("Price of Betrayal: a bot takes an opponent's energy and experience, not their poison", () => {
    const { s: s0, ap, ids, opp } = setup([betrayal()]);
    s0.players[opp]!.energy = 1;
    s0.players[opp]!.poison = 6;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)])));
    for (let i = 0; i < 6 && s.pending; i++) s = settle(run(s, botActions(s, ap)));
    expect([s.players[opp]!.energy, s.players[opp]!.poison]).toEqual([0, 6]);
  });

  const slithHits = (seed: number, withDoubling: boolean) => {
    const { s: s0, ap } = setup([], seed);
    const [o1, o2] = others(s0, ap);
    s0.players[ap]!.hand = [];
    const sl = putOnBattlefield(s0, ap, slith());
    if (withDoubling) putOnBattlefield(s0, ap, doubling());
    s0.players[o1!]!.energy = 3;
    const pw = putOnBattlefield(s0, o2!, beast("Test Beast", 2));
    s0.objects[pw]!.counters = { "+1/+1": 2 };
    let s = goUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sl, defender: o1! }] });
    return { s: throughCombat(s, ap), ap, o1: o1!, o2: o2!, sl, pw };
  };

  it("Etched Slith: combat damage to a player puts a +1/+1 counter on it; when it does, you may remove a counter from another target permanent or opponent", () => {
    const { s: s0, ap, o1, sl } = slithHits(3, false);
    let s = s0;
    expect(s.objects[sl]!.counters["+1/+1"]).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Not itself ("another"), and an opponent, not you.
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(sl)] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [ply(ap)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(o1)] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[o1]!.energy).toBe(2);
  });

  it("Etched Slith with Doubling Season: two counters, so the reflexive ability triggers twice (rulings, CR 603.12a)", () => {
    const { s: s0, ap, o2, sl, pw } = slithHits(3, true);
    let s = s0;
    expect(s.objects[sl]!.counters["+1/+1"]).toBe(2);
    let targetsAsked = 0;
    for (let k = 0; k < 6 && s.pending; k++) {
      if (s.pending.kind === "chooseTargets") {
        targetsAsked++;
        s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(pw)] }));
      } else if (s.pending.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
      else throw new Error(s.pending.kind);
    }
    expect(targetsAsked).toBe(2);
    expect(s.objects[pw]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(controllerOf(s, s.objects[pw]!)).toBe(o2);
  });

  it("Wicked Slumber: taps both targets, each stun counter on either of them (both may go on one)", () => {
    const { s: s0, ap, ids, opp } = setup([slumber()]);
    const a = putOnBattlefield(s0, opp, beast("Test Beast", 3));
    const b = putOnBattlefield(s0, opp, beast("Other Beast", 4));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)])));
    expect(s.objects[a]!.tapped && s.objects[b]!.tapped).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "splitTargets", options: ["0", "1"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "splitTargets", options: ["0", "1"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(s.objects[a]!.counters.stun ?? 0).toBe(0);
    expect(s.objects[b]!.counters.stun).toBe(2);
  });

  it("Wicked Slumber with one target left: both stun counters go on it (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([slumber()]);
    const a = putOnBattlefield(s0, opp, beast("Test Beast", 3));
    const b = putOnBattlefield(s0, opp, beast("Other Beast", 4));
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)]));
    // The second target leaves before it resolves.
    s.battlefield.splice(s.battlefield.indexOf(b), 1);
    s.objects[b]!.zone = "graveyard";
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 1;
    s.players[opp]!.graveyard.push(b);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[a]!.counters.stun).toBe(2);
    // A single target: the same.
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([slumber()]);
    const c = putOnBattlefield(t0, opp2, beast("Test Beast", 3));
    const t = settle(run(t0, planCast(t0, ap2, ids2[0]!, [tgt(c), { kind: "none" }])));
    expect(t.pending).toBeNull();
    expect(t.objects[c]!.counters.stun).toBe(2);
  });

  it("Wicked Slumber: a bot puts the counters on an opponent's creature", () => {
    const { s: s0, ap, ids, opp } = setup([slumber()]);
    const mine = putOnBattlefield(s0, ap, beast("Test Beast", 3));
    const theirs = putOnBattlefield(s0, opp, beast("Other Beast", 4));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)])));
    for (let i = 0; i < 3 && s.pending; i++) s = settle(run(s, botActions(s, ap)));
    expect(s.objects[theirs]!.counters.stun).toBe(2);
  });

  it("Highcliff Felidar: for each opponent you choose one of their creatures with the greatest power; all destroyed", () => {
    const { s: s0, ap, ids } = setup([felidar()]);
    const [o1, o2, o3] = others(s0, ap);
    const big = putOnBattlefield(s0, o1!, beast("Big Beast", 5));
    const small = putOnBattlefield(s0, o1!, beast("Small Beast", 2));
    const t1 = putOnBattlefield(s0, o2!, beast("Test Beast", 3));
    const t2 = putOnBattlefield(s0, o2!, beast("Other Beast", 3));
    const mine = putOnBattlefield(s0, ap, beast("Huge Beast", 9));
    void o3;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, of: o2 });
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([t1, t2].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [t2] }));
    expect([zone(s, big), zone(s, small), zone(s, t1), zone(s, t2), zone(s, mine)]).toEqual(["graveyard", "battlefield", "battlefield", "graveyard", "battlefield"]);
  });

  it("Two-Headed Giant: two heads give it double strike, two tails menace, one of each nothing (CR 705.2)", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40 && seen.size < 3; seed++) {
      const { s: s0, ap } = setup([], seed);
      const [o1] = others(s0, ap);
      const g = putOnBattlefield(s0, ap, twoHeaded());
      let s = goUntil(s0, "declareAttackers", ap);
      s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: o1! }] }));
      const m = lines(s).join("\n").match(/(\d) came up heads/);
      expect(m).not.toBeNull();
      const heads = Number(m![1]);
      seen.add(heads);
      expect(lines(s).some((l) => /wins|loses/.test(l) && /flip/.test(l))).toBe(false);
      expect(objHasKeyword(s, s.objects[g]!, "Double strike")).toBe(heads === 2);
      expect(objHasKeyword(s, s.objects[g]!, "Menace")).toBe(heads === 0);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it("Chandra, the Firebrand: −6 deals 6 damage to each of up to six targets", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = others(s0, ap);
    const ch = putOnBattlefield(s0, ap, chandra());
    s0.objects[ch]!.counters = { loyalty: 7 };
    const cs = [o1, o2, o3].map((o, i) => putOnBattlefield(s0, o!, beast(`Beast ${i}`, 7)));
    const targets = [ply(o1!), ply(o2!), ply(o3!), ...cs.map(tgt)];
    const life = [o1, o2, o3].map((o) => s0.players[o!]!.life);
    const s = settle(run(s0, planActivate(s0, ap, ch, 2, targets)));
    expect([o1, o2, o3].map((o) => s.players[o!]!.life)).toEqual(life.map((l) => l - 6));
    expect(cs.map((id) => s.objects[id]!.damage)).toEqual([6, 6, 6]);
    expect(s.objects[ch]!.counters.loyalty).toBe(1);
    // Fewer is fine ("up to"), but not seven.
    const { s: t0, ap: ap2 } = setup([]);
    const ch2 = putOnBattlefield(t0, ap2, chandra());
    t0.objects[ch2]!.counters = { loyalty: 7 };
    expect(planActivate(t0, ap2, ch2, 2, [ply(others(t0, ap2)[0]!), ...Array.from({ length: 5 }, () => ({ kind: "none" as const }))])).not.toBeNull();
  });

  it("Soul-Shackled Zombie: two cards from a single graveyard; a creature card among them drains each opponent for 2", () => {
    for (const creature of [true, false]) {
      const { s: s0, ap, ids } = setup([zombie()]);
      const [o1, o2] = others(s0, ap);
      const a = toZone(s0, o1!, creature ? bear() : relic(), "graveyard");
      const b = toZone(s0, o1!, relic("Other Relic"), "graveyard");
      const c = toZone(s0, o2!, bear(), "graveyard");
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
      expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(c)] })).toThrow();
      const life = s.players.map((p) => p.life);
      s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b)] }));
      expect([zone(s, a), zone(s, b), zone(s, c)]).toEqual(["exile", "exile", "graveyard"]);
      const d = creature ? 2 : 0;
      expect(s.players.map((p) => p.life)).toEqual(life.map((l, i) => (i === ap ? l + d : l - d)));
    }
  });

  it("Death or Glory: you separate your graveyard's creature cards; the opponent's pile is exiled, the other returns", () => {
    const { s: s0, ap, ids } = setup([deathOrGlory()]);
    const [o1] = others(s0, ap);
    const a = toZone(s0, ap, beast("Big Beast", 5), "graveyard");
    const b = toZone(s0, ap, beast("Small Beast", 2), "graveyard");
    const c = toZone(s0, ap, beast("Test Beast", 3), "graveyard");
    const land = toZone(s0, ap, card("Test Dune", "Land", ""), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(o1) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, piles: true, yardPiles: true });
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([a, b, c].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [a] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o1, what: "pile", pileMode: "exile", piles: [[a], [b, c]] });
    // The bot exiles the pile worth more to you.
    const bot = botActions(s, o1!);
    expect(bot).toEqual([{ type: "chooseOption", player: o1, choice: "1" }]);
    s = settle(act(s, { type: "chooseOption", player: o1!, choice: "0" }));
    expect([zone(s, a), zone(s, b), zone(s, c), zone(s, land)]).toEqual(["exile", "battlefield", "battlefield", "graveyard"]);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
  });

  it("Death or Glory with no creature cards in your graveyard does nothing", () => {
    const { s: s0, ap, ids } = setup([deathOrGlory()]);
    toZone(s0, ap, relic(), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Mercurial Transformation: loses all abilities and becomes your choice of a 1/1 Frog or a 4/4 Octopus, blue, until end of turn", () => {
    for (const choice of ["0", "1"]) {
      const { s: s0, ap, ids, opp } = setup([mercurial()]);
      const x = putOnBattlefield(s0, opp, card("Test Golem", "Artifact Creature — Golem", "{4}", { power: "5", toughness: "5", oracleText: "Flying", keywords: ["Flying"] }));
      let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(x)])));
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either", options: ["0", "1"] });
      s = settle(act(s, { type: "chooseOption", player: ap, choice }));
      const c = characteristics(s, s.objects[x]!);
      expect(c.types).toEqual(["Creature"]);
      expect(c.subtypes).toEqual([choice === "0" ? "Frog" : "Octopus"]);
      expect(c.colors).toEqual(["U"]);
      expect([c.power, c.toughness]).toEqual(choice === "0" ? [1, 1] : [4, 4]);
      expect(objHasKeyword(s, s.objects[x]!, "Flying")).toBe(false);
      // A bot makes an opponent's permanent the Frog.
      if (choice === "0") {
        const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([mercurial()]);
        const y = putOnBattlefield(t0, opp2, beast("Test Beast", 5));
        const t = settle(run(t0, planCast(t0, ap2, ids2[0]!, [tgt(y)])));
        expect(botActions(t, ap2)).toEqual([{ type: "chooseOption", player: ap2, choice: "0" }]);
      }
    }
  });

  it("Light of Judgment: 6 damage to target creature, then destroy up to one Equipment attached to it, chosen as it resolves (rulings)", () => {
    expect(isFullySupported(judgment())).toBe(true);
    const gear = (name: string) => card(name, "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });
    const { s: s0, ap, ids, opp } = setup([judgment()]);
    const big = putOnBattlefield(s0, opp, beast("Big Beast", 8));
    const eq = putOnBattlefield(s0, opp, gear("Test Blade"));
    const eq2 = putOnBattlefield(s0, opp, gear("Second Blade"));
    const loose = putOnBattlefield(s0, opp, gear("Loose Blade"));
    const elsewhere = putOnBattlefield(s0, opp, beast("Other Beast", 2));
    const away = putOnBattlefield(s0, opp, gear("Away Blade"));
    s0.objects[eq]!.attachedTo = big;
    s0.objects[eq2]!.attachedTo = big;
    s0.objects[away]!.attachedTo = elsewhere;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)])));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, min: 0, count: 1 });
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([eq, eq2].sort());
    // A bot destroys an opponent's Equipment.
    expect(botActions(s, ap)).toMatchObject([{ type: "pickPermanents", player: ap }]);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [eq2] }));
    expect([zone(s, eq), zone(s, eq2), zone(s, loose), zone(s, away)]).toEqual(["battlefield", "graveyard", "battlefield", "battlefield"]);
    // An 8/8 with two +1/+1 Equipment survives 6 damage; with one destroyed it is 9/9.
    expect(zone(s, big)).toBe("battlefield");
    expect(s.objects[big]!.damage).toBe(6);
    // Choosing none destroys nothing; a creature with no Equipment is a fine target.
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([judgment()]);
    const bare = putOnBattlefield(t0, opp2, beast("Bare Beast", 4));
    const t = settle(run(t0, planCast(t0, ap2, ids2[0]!, [tgt(bare)])));
    expect(t.pending?.kind).not.toBe("pickPermanents");
    expect(zone(t, bare)).toBe("graveyard");
  });

  it("Light of Judgment: with the creature an illegal target as it resolves, no Equipment is destroyed (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([judgment()]);
    const big = putOnBattlefield(s0, opp, beast("Big Beast", 8));
    const eq = putOnBattlefield(s0, opp, card("Test Blade", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" }));
    s0.objects[eq]!.attachedTo = big;
    invalidateCharacteristics(s0);
    const s1 = run(s0, planCast(s0, ap, ids[0]!, [tgt(big)]));
    // The creature gains hexproof in response: it's an illegal target, so the spell doesn't resolve.
    s1.effects.push({ id: `x${s1.nextId++}`, timestamp: s1.nextTimestamp++, controller: opp, sourceName: "test", duration: "endOfTurn", affected: [big], mods: [{ kind: "addKeywords", keywords: ["Hexproof"] }] });
    invalidateCharacteristics(s1);
    const s = settle(s1);
    expect(zone(s, big)).toBe("battlefield");
    expect(s.pending?.kind).not.toBe("pickPermanents");
    expect(zone(s, eq)).toBe("battlefield");
  });
});

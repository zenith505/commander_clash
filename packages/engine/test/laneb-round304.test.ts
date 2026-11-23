// Lane B round B304: least played first, cards off the skip lists whose only gap was a card from outside the game.
// "Parts of abilities which bring other traditional card(s) you own from outside the game into the game (such as Living
// Wish; Spawnsire of Ulamog; Karn, the Great Creator; Wish) do not function in Commander" (Commander format rule 10), and
// players here have no sideboard (CR 100.4, 400.11a): Mastermind's Acquisition's second mode, North Wind Avatar's and
// Legion Angel's enter triggers, Vivien, Arkbow Ranger's −5, The Raven's Warning's chapter III, Granted, Research and
// Spawnsire of Ulamog's {20} ability do nothing (and say so in the log). The Raven's Warning's chapter II ("one or more
// creatures you control with flying") and Development's "unless any opponent has you draw a card", three times, are new.
// The Wishes that would only exile themselves stay out by choice.

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, defOf, controllerOf, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const burningWish = (): CardDef => ({"oracleId":"13a884b5-8970-4d71-9082-a8b6c8db9a01","name":"Burning Wish","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may reveal a sorcery card you own from outside the game and put it into your hand. Exile Burning Wish.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const deathWish = (): CardDef => ({"oracleId":"ff0ca1a4-da67-407c-a5c0-998a35eb7d8d","name":"Death Wish","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may put a card you own from outside the game into your hand. You lose half your life, rounded up. Exile Death Wish.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const faeOfWishes = (): CardDef => ({"oracleId":"c0abbed2-d213-47ef-8d6c-4a21efb9a55f","name":"Fae of Wishes // Granted","manaCost":"{1}{U} // {3}{U}","cmc":2,"typeLine":"Creature — Faerie Wizard // Sorcery — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Faerie","Wizard"],"oracleText":"Flying\n{1}{U}, Discard two cards: Return this creature to its owner's hand.","power":"1","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Fae of Wishes","manaCost":"{1}{U}","typeLine":"Creature — Faerie Wizard","supertypes":[],"types":["Creature"],"subtypes":["Faerie","Wizard"],"oracleText":"Flying\n{1}{U}, Discard two cards: Return this creature to its owner's hand.","power":"1","toughness":"4","colors":["U"]},{"name":"Granted","manaCost":"{3}{U}","typeLine":"Sorcery — Adventure","supertypes":[],"types":["Sorcery"],"subtypes":["Adventure"],"oracleText":"You may reveal a noncreature card you own from outside the game and put it into your hand.","colors":["U"]}]}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const legionAngel = (): CardDef => ({"oracleId":"843c9962-dee1-449d-8106-6383df32bcf6","name":"Legion Angel","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Creature — Angel Warrior","supertypes":[],"types":["Creature"],"subtypes":["Angel","Warrior"],"oracleText":"Flying\nWhen this creature enters, you may reveal a card you own named Legion Angel from outside the game and put it into your hand.","power":"4","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const acquisition = (): CardDef => ({"oracleId":"6aec5b1f-cea6-4ec3-9759-e4544da8c52b","name":"Mastermind's Acquisition","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose one —\n• Search your library for a card, put it into your hand, then shuffle.\n• Put a card you own from outside the game into your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const northWind = (): CardDef => ({"oracleId":"b408c345-b308-4920-8494-4f204d856aa3","name":"North Wind Avatar","manaCost":"{2}{U}{U}{R}","cmc":5,"typeLine":"Creature — Dragon Spirit Avatar","supertypes":[],"types":["Creature"],"subtypes":["Dragon","Spirit","Avatar"],"oracleText":"Flying\nWhen this creature enters, if you cast it, you may put a card you own from outside the game into your hand.","power":"5","toughness":"5","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Flying"],"commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const research = (): CardDef => ({"oracleId":"fa38394b-6ac4-460c-ae3a-54d50037715b","name":"Research // Development","manaCost":"{G}{U} // {3}{U}{R}","cmc":7,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shuffle up to four cards you own from outside the game into your library.","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":[],"commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"split","gameChanger":false,"faces":[{"name":"Research","manaCost":"{G}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shuffle up to four cards you own from outside the game into your library.","colors":["U","G"]},{"name":"Development","manaCost":"{3}{U}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Create a 3/1 red Elemental creature token unless any opponent has you draw a card. Repeat this process two more times.","colors":["U","R"]}]}) as CardDef;
const spawnsire = (): CardDef => ({"oracleId":"b90d2f4d-b4ea-40af-aea0-1ab4234ab80f","name":"Spawnsire of Ulamog","manaCost":"{10}","cmc":10,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Annihilator 1 (Whenever this creature attacks, defending player sacrifices a permanent of their choice.)\n{4}: Create two 0/1 colorless Eldrazi Spawn creature tokens. They have \"Sacrifice this token: Add {C}.\"\n{20}: Cast any number of Eldrazi spells from among cards you own outside the game without paying their mana costs.","power":"7","toughness":"11","colors":[],"colorIdentity":[],"keywords":["Annihilator"],"producedMana":["C"],"commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const stormCrow = (): CardDef => ({"oracleId":"000d5588-5a4c-434e-988d-396632ade42c","name":"Storm Crow","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Bird","supertypes":[],"types":["Creature"],"subtypes":["Bird"],"oracleText":"Flying (This creature can't be blocked except by creatures with flying or reach.)","power":"1","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"commanderLegal":"legal","set":"sld","releasedAt":"2020-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ravensWarning = (): CardDef => ({"oracleId":"74206de7-470b-4256-9207-9fb46d3c4356","name":"The Raven's Warning","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create a 1/1 blue Bird creature token with flying. You gain 2 life.\nII — Whenever one or more creatures you control with flying deal combat damage to a player this turn, look at that player's hand and draw a card.\nIII — You may put a card you own from outside the game on top of your library.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const vivien = (): CardDef => ({"oracleId":"3e83dec6-e1a0-4137-aaab-308dfd3122e1","name":"Vivien, Arkbow Ranger","manaCost":"{1}{G}{G}{G}","cmc":4,"typeLine":"Legendary Planeswalker — Vivien","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Vivien"],"oracleText":"+1: Distribute two +1/+1 counters among up to two target creatures. They gain trample until end of turn.\n−3: Target creature you control deals damage equal to its power to target creature or planeswalker.\n−5: You may reveal a creature card you own from outside the game and put it into your hand.","loyalty":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"m20","releasedAt":"2019-07-12","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const wish = (): CardDef => ({"oracleId":"2ccbf0ee-c856-4f67-8579-811fe8571a2e","name":"Wish","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may play a card you own from outside the game this turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

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
/** Everyone passes (questions answered the way a bot would, no attacks or blocks) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 4000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never stopped");
};
const outsideLogged = (s: GameState, name: string) => s.log.some((l) => l.text.startsWith(`${name}: `) && /has no cards outside the game in Commander/.test(l.text));
const toLibraryTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const opponentsOf = (s: GameState, pid: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!);

describe("Lane B round B304: cards from outside the game do nothing in Commander", () => {
  it("the eight cards are fully supported; the Wishes that would only exile themselves stay out", () => {
    for (const d of [acquisition(), northWind(), legionAngel(), vivien(), spawnsire(), faeOfWishes(), research(), ravensWarning()]) expect(isFullySupported(d), d.name).toBe(true);
    for (const d of [deathWish(), burningWish(), wish()]) expect(isFullySupported(d), d.name).toBe(false);
  });

  it("Mastermind's Acquisition: the search mode puts the card into your hand; the other mode does nothing", () => {
    const { s: s0, ap, ids } = setup([acquisition()]);
    const bear = toLibraryTop(s0, ap, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, [0], "auto")));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bear] }));
    expect(s.objects[bear]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");

    const { s: t0, ap: bp, ids: tids } = setup([acquisition()]);
    const hand = t0.players[bp]!.hand.length;
    const lib = t0.players[bp]!.library.length;
    const t = settle(run(t0, planCast(t0, bp, tids[0]!, undefined, [1], "auto")));
    expect(t.pending).toBeNull();
    expect(t.objects[tids[0]!]!.zone).toBe("graveyard");
    expect(t.players[bp]!.hand.length).toBe(hand - 1);
    expect(t.players[bp]!.library.length).toBe(lib);
    expect(outsideLogged(t, "Mastermind's Acquisition")).toBe(true);
  });

  it("North Wind Avatar and Legion Angel: their enter triggers resolve without asking anything", () => {
    for (const def of [northWind(), legionAngel()]) {
      const { s: s0, ap, ids } = setup([def]);
      const hand = s0.players[ap]!.hand.length;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
      expect(s.pending, def.name).toBeNull();
      expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
      expect(s.players[ap]!.hand.length).toBe(hand - 1);
      expect(outsideLogged(s, def.name), def.name).toBe(true);
    }
  });

  it("Vivien, Arkbow Ranger's −5 takes 5 loyalty and does nothing else; a bot doesn't use it", () => {
    const { s: s0, ap } = setup([]);
    const viv = putOnBattlefield(s0, ap, vivien());
    s0.objects[viv]!.counters.loyalty = 6;
    const hand = s0.players[ap]!.hand.length;
    expect(botActions(s0, ap).some((a) => a.type === "activateAbility" && a.objectId === viv && a.index === 2)).toBe(false);
    const s = settle(run(s0, planActivate(s0, ap, viv, 2)));
    expect(s.pending).toBeNull();
    expect(s.objects[viv]!.counters.loyalty).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(outsideLogged(s, "Vivien, Arkbow Ranger")).toBe(true);
  });

  it("Spawnsire of Ulamog: {20} is paid and does nothing; {4} still makes two Eldrazi Spawn", () => {
    const { s: s0, ap } = setup([]);
    const sire = putOnBattlefield(s0, ap, spawnsire());
    s0.players[ap]!.manaPool.C = 6;
    const before = s0.battlefield.length;
    let s = settle(run(s0, planActivate(s0, ap, sire, 1)));
    expect(s.pending).toBeNull();
    expect(outsideLogged(s, "Spawnsire of Ulamog")).toBe(true);
    expect(s.battlefield.length).toBe(before);
    s.players[ap]!.manaPool.C = 4;
    s = settle(run(s, planActivate(s, ap, sire, 0)));
    expect(s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === "Eldrazi Spawn Token").length).toBe(2);
  });

  it("Fae of Wishes // Granted: Granted does nothing but send the card on an adventure; the Fae can then be cast from exile", () => {
    const { s: s0, ap, ids } = setup([faeOfWishes()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    expect(s.pending).toBeNull();
    expect(outsideLogged(s, "Granted")).toBe(true);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Research does nothing; a bot doesn't cast it", () => {
    const { s: s0, ap, ids } = setup([research()]);
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    const lib = s0.players[ap]!.library.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 0 })));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library.length).toBe(lib);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(outsideLogged(s, "Research")).toBe(true);
  });
});

describe("Lane B round B304: Development", () => {
  /** Casts Development and answers each opponent's question: `allow(round, opponent)` says whether they have you draw. */
  const develop = (allow: (round: number, opp: PlayerId) => boolean) => {
    const { s: s0, ap, ids } = setup([research()]);
    const hand = s0.players[ap]!.hand.length - 1;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 }));
    s = settle(s);
    const asked: PlayerId[][] = [[], [], []];
    let round = 0;
    for (let i = 0; i < 20 && s.pending; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher" });
      const p = s.pending.player;
      // A time ends once all three opponents said no, or (below) as soon as one says yes.
      if (asked[round]!.length === 3) round++;
      asked[round]!.push(p);
      const yes = allow(round, p);
      s = settle(act(s, { type: "chooseOption", player: p, choice: yes ? "0" : "none" }));
      if (yes) round++;
    }
    const tokens = s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === "Elemental Token" && controllerOf(s, s.objects[id]!) === ap);
    return { s, ap, tokens: tokens.length, drawn: s.players[ap]!.hand.length - hand, asked, card: ids[0]! };
  };

  it("is fully supported (both halves)", () => {
    expect(isFullySupported(research())).toBe(true);
  });

  it("no one lets you draw: three 3/1 red Elemental tokens, each opponent asked each time in turn order", () => {
    const r = develop(() => false);
    expect(r.tokens).toBe(3);
    expect(r.drawn).toBe(0);
    for (const a of r.asked) expect(a).toEqual(opponentsOf(r.s, r.ap));
    expect(r.s.objects[r.card]!.zone).toBe("graveyard");
  });

  it("an opponent who has you draw settles that time: the others aren't asked, and the process goes on", () => {
    const [o1, o2] = (() => {
      const { s, ap } = setup([]);
      return opponentsOf(s, ap);
    })();
    // First time: the second opponent says yes (the third isn't asked); second time: no one; third time: the first says yes.
    const r = develop((round, p) => (round === 0 && p === o2) || (round === 2 && p === o1));
    expect(r.drawn).toBe(2);
    expect(r.tokens).toBe(1);
    expect(r.asked[0]).toEqual([o1, o2]);
    expect(r.asked[2]).toEqual([o1]);
  });
});

describe("Lane B round B304: The Raven's Warning", () => {
  it("I: a 1/1 Bird and 2 life; II: one or more fliers dealing combat damage to a player let you look at that hand and draw; III does nothing, then it's sacrificed", () => {
    const { s: s0, ap, ids } = setup([ravensWarning()]);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    const saga = ids[0]!;
    expect(s.objects[saga]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.battlefield.some((id) => defOf(s, s.objects[id]!).name === "Bird Token" && controllerOf(s, s.objects[id]!) === ap)).toBe(true);
    const crow = putOnBattlefield(s, ap, stormCrow());
    const crow2 = putOnBattlefield(s, ap, stormCrow());
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    // Ap's next turn: chapter II after the draw step.
    s = goUntil(s, (x) => x.activePlayer !== ap);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    const o1 = opponentsOf(s, ap)[0]!;
    const o2 = opponentsOf(s, ap)[1]!;
    const hand = s.players[ap]!.hand.length;
    s = goUntil(s, (x) => x.pending?.kind === "declareAttackers");
    // Two fliers at one opponent (one trigger for that player), only a nonflier at another (none).
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: crow, defender: o1 }, { attacker: crow2, defender: o1 }, { attacker: bears, defender: o2 }] });
    s = goUntil(s, (x) => x.step === "main2" || x.step === "end");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.log.some((l) => l.text.includes(`looks at ${s.players[o1]!.name}'s hand`))).toBe(true);
    expect(s.log.some((l) => l.text.includes(`looks at ${s.players[o2]!.name}'s hand`))).toBe(false);
    // Next turn, chapter III does nothing, then the Saga is sacrificed (CR 714.4).
    s = goUntil(s, (x) => x.activePlayer !== ap);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(outsideLogged(s, "The Raven's Warning")).toBe(true);
    expect(s.objects[saga]!.zone).toBe("graveyard");
  });
});

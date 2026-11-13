// Round 351 (Lane A): copying the next loyalty ability (Jaya's Phoenix, Repeated Reverberation), keywords of the cards an
// Equipment exiled (Eater of Virtue), a planeswalker type and its last loyalty counter kept (Deification), time counters for
// permanents phasing out and cards put into exile (The War Doctor), and Spirits that phase out when a spell targets them
// (King of the Oathbreakers).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, closeZoneBatch, isFullySupported, moveObject, objHasKeyword, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { phaseIn, phaseOut } from "../src/phasing";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty; questions as the bots would answer them, but copies keep their targets. Stops
 * at any other question of `me`'s.
 */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player, targets: p.current });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
/** `me` attacks `opp` with `attacker`; on to the second main phase, others answering as bots. */
const attackTo = (s: GameState, me: PlayerId, attacker: string, opp: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: me, attacks: [{ attacker, defender: opp }] });
  for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const phoenix = (): CardDef => ({"oracleId":"c6a67820-5066-462f-a621-1ecab8bf4f97","name":"Jaya's Phoenix","manaCost":"{4}{R}","cmc":5,"typeLine":"Creature — Phoenix","supertypes":[],"types":["Creature"],"subtypes":["Phoenix"],"oracleText":"Flying, haste\nWhenever this creature deals combat damage to a player or planeswalker, copy the next loyalty ability you activate this turn when you activate it. You may choose new targets for the copy.\nWhenever you cast a planeswalker spell, you may return this card from your graveyard to the battlefield.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Haste"],"commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reverberation = (): CardDef => ({"oracleId":"9a664735-6e38-407f-9d2f-a6d279cd6309","name":"Repeated Reverberation","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"When you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability twice. You may choose new targets for the copies.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"m20","releasedAt":"2019-07-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const eater = (): CardDef => ({"oracleId":"b6f8cc3b-b8f1-4b1a-8768-eddcb0631d80","name":"Eater of Virtue","manaCost":"{1}","cmc":1,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Whenever equipped creature dies, exile it.\nEquipped creature gets +2/+0.\nAs long as a card exiled with Eater of Virtue has flying, equipped creature has flying. The same is true for first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, protection, reach, trample, and vigilance.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const deification = (): CardDef => ({"oracleId":"8c8f93d7-d89a-401b-8764-76be71ad16e3","name":"Deification","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose a planeswalker type.\nPlaneswalkers you control of the chosen type have hexproof.\nAs long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all loyalty counters on it being removed, instead all but one of those counters are removed.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const warDoctor = (): CardDef => ({"oracleId":"d97553bf-6763-4a7b-8d82-1b438a22aa62","name":"The War Doctor","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Time Lord Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Doctor"],"oracleText":"Whenever one or more other permanents phase out and whenever one or more other cards are put into exile from anywhere, put a time counter on The War Doctor.\nWhenever The War Doctor attacks, it deals damage equal to the number of time counters on it to any target. If a creature dealt damage this way would die this turn, exile it instead.","power":"3","toughness":"5","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const king = (): CardDef => ({"oracleId":"3ee451e7-2b2f-4ce7-af96-540bba555c60","name":"King of the Oathbreakers","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Legendary Creature — Spirit Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","Noble"],"oracleText":"Flying\nWhenever King of the Oathbreakers or another Spirit you control becomes the target of a spell, it phases out. (Treat it and anything attached to it as though they don't exist until your next turn.)\nWhenever King of the Oathbreakers or another Spirit you control phases in, create a tapped 1/1 white Spirit creature token with flying.","power":"3","toughness":"3","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Flying"],"commanderLegal":"legal","set":"ltr","releasedAt":"2023-11-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const knight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sailor = (): CardDef => ({"oracleId":"a8fdbcdf-479d-4582-9ad5-9fbd4c740c29","name":"Spectral Sailor","manaCost":"{U}","cmc":1,"typeLine":"Creature — Spirit Pirate","supertypes":[],"types":["Creature"],"subtypes":["Spirit","Pirate"],"oracleText":"Flash (You may cast this spell any time you could cast an instant.)\nFlying\n{3}{U}: Draw a card.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Flash"],"commanderLegal":"legal","set":"j22","releasedAt":"2022-12-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const swords = (): CardDef => ({"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2026-09-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const chandra = (): CardDef => ({"oracleId":"12cc800c-c7be-4811-8207-fd01a99cc892","name":"Chandra, Torch of Defiance","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\"","loyalty":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

describe("round 351: compiles", () => {
  it("every card of the round", () => supported(phoenix(), reverberation(), eater(), deification(), warDoctor(), king()));
});

describe("Jaya's Phoenix", () => {
  it("after its combat damage, the next loyalty ability you activate this turn is copied, only that one", () => {
    const { s: s0, ap, opp } = setup([]);
    const ph = putOnBattlefield(s0, ap, phoenix());
    const j = putOnBattlefield(s0, ap, jace());
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[j]!.counters.loyalty = 3;
    s0.objects[c]!.counters.loyalty = 4;
    const b = toHand(s0, ap, bolt());
    let s = attackTo(s0, ap, ph, opp);
    expect(s.nextCast?.some((d) => d.loyalty === "only")).toBe(true);
    // A spell doesn't use it up.
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])), ap);
    expect(s.nextCast?.some((d) => d.loyalty === "only")).toBe(true);
    // Jace's −1 at an opponent: copied, so they draw two; the copy costs no loyalty (rulings).
    const hand = s.players[opp]!.hand.length;
    s = settle(run(s, planActivate(s, ap, j, 1, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    expect(s.objects[j]!.counters.loyalty).toBe(2);
    expect(s.nextCast?.some((d) => d.loyalty) ?? false).toBe(false);
    // Chandra's +1 afterwards: not copied.
    const logs = s.log.length;
    s = settle(run(s, planActivate(s, ap, c, 1)));
    expect(s.log.slice(logs).some((e) => /cop(?:y|ies)/i.test(e.text))).toBe(false);
  });

  it("with no combat damage, nothing is copied", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, phoenix());
    const j = putOnBattlefield(s0, ap, jace());
    s0.objects[j]!.counters.loyalty = 3;
    const hand = s0.players[opp]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, j, 1, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
  });
});

describe("Repeated Reverberation", () => {
  it("the next instant is copied twice", () => {
    const { s: s0, ap, opp, ids } = setup([reverberation(), bolt()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.nextCast?.some((d) => d.loyalty === "also")).toBe(true);
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 9);
    expect(s.nextCast?.some((d) => d.loyalty) ?? false).toBe(false);
  });

  it("or the next loyalty ability, twice, with no loyalty cost for the copies; a creature spell doesn't use it", () => {
    const { s: s0, ap, opp, ids } = setup([reverberation(), bears()]);
    const j = putOnBattlefield(s0, ap, jace());
    s0.objects[j]!.counters.loyalty = 3;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.nextCast?.some((d) => d.loyalty === "also")).toBe(true);
    const hand = s.players[opp]!.hand.length;
    s = settle(run(s, planActivate(s, ap, j, 1, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.hand.length).toBe(hand + 3);
    expect(s.objects[j]!.counters.loyalty).toBe(2);
  });

  it("a sorcery cast later in the turn after the instant isn't copied", () => {
    const { s: s0, ap, opp, ids } = setup([reverberation(), bolt(), divination()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    // Divination left the hand and drew two: one copy-free resolution.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });
});

describe("Eater of Virtue", () => {
  it("the equipped creature that dies is exiled with it, and the next creature it equips has that card's keywords", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, eater());
    const a = putOnBattlefield(s0, ap, angel());
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[e]!.attachedTo = a;
    let s = settle(s0);
    expect(power(s, s.objects[a]!)).toBe(6);
    moveObject(s, a, "graveyard");
    s = settle(s);
    expect(s.objects[a]!.zone).toBe("exile");
    // Equip the Bears: flying and vigilance, from the exiled Serra Angel, and +2/+0.
    s = settle(run(s, planActivate(s, ap, e, 0, [target(b)])));
    expect(s.objects[e]!.attachedTo).toBe(b);
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(false);
    expect(power(s, s.objects[b]!)).toBe(4);
  });

  it("protection abilities are given whole, and cards exiled some other way don't count", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, eater());
    const k = putOnBattlefield(s0, ap, knight());
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[e]!.attachedTo = k;
    // An Angel exiled from a graveyard by something else: not exiled with Eater of Virtue.
    const other = toYard(s0, ap, angel());
    moveObject(s0, other, "exile");
    moveObject(s0, k, "graveyard");
    let s = settle(s0);
    s = settle(run(s, planActivate(s, ap, e, 0, [target(b)])));
    const kws = characteristics(s, s.objects[b]!).keywords;
    expect(kws).toContain("First strike");
    expect(kws.some((x) => /^protection from black$/i.test(x))).toBe(true);
    expect(kws).not.toContain("Flying");
  });

  it("once it leaves and returns, it's a new object with no exiled cards (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, eater());
    const a = putOnBattlefield(s0, ap, angel());
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[e]!.attachedTo = a;
    moveObject(s0, a, "graveyard");
    let s = settle(s0);
    expect(s.objects[a]!.zone).toBe("exile");
    moveObject(s, e, "hand");
    moveObject(s, e, "battlefield");
    s = settle(run(s, planActivate(s, ap, e, 0, [target(b)])));
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(false);
  });
});

describe("Deification", () => {
  const withJace = (creature: boolean) => {
    const { s: s0, ap, opp, ids } = setup([deification()]);
    const j = putOnBattlefield(s0, ap, jace());
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[j]!.counters.loyalty = 3;
    s0.objects[c]!.counters.loyalty = 2;
    if (creature) putOnBattlefield(s0, ap, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "planeswalkerType", player: ap });
    expect((s.pending as { options: string[] }).options).toContain("Jace");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Jace" }), ap);
    expect(s.objects[ids[0]!]!.chosen?.planeswalkerType).toBe("Jace");
    return { s, ap, opp, j, c };
  };
  it("planeswalkers of the chosen type have hexproof; others don't", () => {
    const { s, j, c } = withJace(true);
    expect(objHasKeyword(s, s.objects[j]!, "Hexproof")).toBe(true);
    expect(objHasKeyword(s, s.objects[c]!, "Hexproof")).toBe(false);
  });

  it("while you control a creature, damage that would remove the last loyalty counter leaves one", () => {
    const { s: s0, ap, j } = withJace(true);
    // Hexproof keeps opponents' spells off it: the controller's own Bolt then, 3 damage to a Jace with 3 loyalty.
    const b = toHand(s0, ap, bolt());
    const s = settle(run(s0, planCast(s0, ap, b, [target(j)])));
    expect(s.objects[j]!.zone).toBe("battlefield");
    expect(s.objects[j]!.counters.loyalty).toBe(1);
  });

  it("without a creature, or for a planeswalker of another type, the damage removes them all", () => {
    const { s: s0, ap, j } = withJace(false);
    const b = toHand(s0, ap, bolt());
    let s = settle(run(s0, planCast(s0, ap, b, [target(j)])));
    expect(s.objects[j]!.zone).toBe("graveyard");
    const { s: s1, ap: ap1, c } = withJace(true);
    const b1 = toHand(s1, ap1, bolt());
    s = settle(run(s1, planCast(s1, ap1, b1, [target(c)])));
    expect(s.objects[c]!.zone).toBe("graveyard");
  });

  it("a bot chooses a type of one of its planeswalkers", () => {
    const { s: s0, ap, ids } = setup([deification()]);
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 4;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.chosen?.planeswalkerType).toBe("Chandra");
  });
});

describe("The War Doctor", () => {
  it("a time counter for each event where other permanents phase out, and none if it phases out with them (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, warDoctor());
    const b1 = putOnBattlefield(s0, ap, bears());
    const b2 = putOnBattlefield(s0, ap, bears());
    phaseOut(s0, [b1, b2]);
    let s = settle(s0);
    expect(s.objects[w]!.counters.time).toBe(1);
    phaseIn(s, [b1, b2]);
    phaseOut(s, [w, b1]);
    s = settle(s);
    phaseIn(s, [w, b1]);
    expect(s.objects[w]!.counters.time).toBe(1);
  });

  it("a time counter for each event that puts other cards into exile, not for tokens", () => {
    const { s: s0, ap, opp, ids } = setup([swords()]);
    const w = putOnBattlefield(s0, ap, warDoctor());
    const b = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(b)])));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[w]!.counters.time).toBe(1);
    // A card from a graveyard.
    const y = toYard(s, opp, bears());
    moveObject(s, y, "exile");
    closeZoneBatch(s);
    s = settle(s);
    expect(s.objects[w]!.counters.time).toBe(2);
    // Two at once: one event, one counter (CR 603.2c).
    const [y1, y2] = [toYard(s, opp, bears()), toYard(s, ap, bears())];
    moveObject(s, y1, "exile");
    moveObject(s, y2, "exile");
    closeZoneBatch(s);
    s = settle(s);
    expect(s.objects[w]!.counters.time).toBe(3);
    // A token isn't a card (CR 108.2, 111.1).
    const t = putOnBattlefield(s, opp, bears());
    s.objects[t]!.isToken = true;
    moveObject(s, t, "exile");
    closeZoneBatch(s);
    s = settle(s);
    expect(s.objects[w]!.counters.time).toBe(3);
  });

  it("attacking, it deals damage equal to its time counters to any target", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, warDoctor());
    s0.objects[w]!.counters.time = 3;
    const life = s0.players[opp]!.life;
    const s = attackTo(s0, ap, w, opp);
    // 3 from the trigger (a bot's target: an opponent or their creature) plus combat damage to the attacked player.
    const lost = s.turnOrder.filter((p) => p !== ap).reduce((n, p) => n + (40 - s.players[p]!.life), 0);
    expect(lost).toBeGreaterThanOrEqual(3);
    expect(life - s.players[opp]!.life).toBeGreaterThanOrEqual(3);
  });
});

describe("King of the Oathbreakers", () => {
  const spirits = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Spirit"));

  it("a Spirit you control targeted by a spell phases out, and the spell then does nothing; a non-Spirit doesn't", () => {
    const { s: s0, ap, ids } = setup([growth(), growth()]);
    putOnBattlefield(s0, ap, king());
    const sp = putOnBattlefield(s0, ap, sailor());
    const b = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(sp)])));
    expect(s.objects[sp]!.zone).toBe("phasedOut");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(b)])));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(power(s, s.objects[b]!)).toBe(5);
  });

  it("the King itself, targeted, phases out too; as they phase in at their controller's untap step, a tapped Spirit for each", () => {
    const { s: s0, ap, ids } = setup([growth(), growth()]);
    const k = putOnBattlefield(s0, ap, king());
    const sp = putOnBattlefield(s0, ap, sailor());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(sp)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(k)])));
    expect(s.objects[k]!.zone).toBe("phasedOut");
    expect(s.objects[sp]!.zone).toBe("phasedOut");
    expect(spirits(s, ap)).toHaveLength(0);
    // Around the table to this player's next turn.
    s = passUntil(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]), "upkeep", ap);
    s = settle(s);
    expect(s.objects[k]!.zone).toBe("battlefield");
    expect(s.objects[sp]!.zone).toBe("battlefield");
    const made = spirits(s, ap);
    expect(made).toHaveLength(2);
    expect(made.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(made.every((id) => objHasKeyword(s, s.objects[id]!, "Flying"))).toBe(true);
  });

  it("another player's Spirit phasing in makes nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, king());
    const theirs = putOnBattlefield(s0, opp, sailor());
    phaseOut(s0, [theirs]);
    phaseIn(s0, [theirs]);
    const s = settle(s0);
    expect(spirits(s, ap)).toHaveLength(0);
  });
});

// Round 222: fresh cards from EDHREC rank 16,000 on. Migloz, Maze Crusher ("It gains ..." in an activated ability),
// Márton Stromgald ("for each attacking creature other than ~"), Crater's Claws ("X plus 2 damage instead"), Thought
// Shucker ("Activate only if ... and only once"), Peregrination (Cultivate, then scry 1), Way of the Paradox, Way of
// the Mind Sculptor, Keral Keep Disciples and Chandra's Regulator ("whenever you activate a loyalty ability"), Getaway
// Car and Golden Argosy ("creature that crewed it this turn"), Tomb Blade ("loses life equal to the number of creatures
// they control unless they sacrifice a creature"), Brood of Cockroaches, Mukotai Soulripper, Amulet of Safekeeping
// ("whenever you become the target"), The Chief Warg ("whenever you attack while ..."), Loreseeker's Stone ("costs {1}
// more to activate for each"), Screaming Swarm, Goblin Razerunners, Gallia of the Endless Dance ("you may discard a card
// at random. If you do"), Whispering Snitch ("surveil for the first time each turn"), Celestial Gatekeeper ("Bird and/or
// Cleric permanent cards"), Crimson Honor Guard ("unless they control a commander"), Reckless Pyrosurfer (gains battle
// cry).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
/** Attack with `attacks`, nobody blocks; stops at `me`'s first question or once combat is over. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[], stopAtMine = true) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 80 && s.step !== "endCombat" && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me && stopAtMine) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const abilityIndex = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const chandra = card("Chandra, Test Pyromancer", "Legendary Planeswalker — Chandra", "{2}{R}", { oracleText: "+1: You gain 1 life.\n−2: Draw a card.", loyalty: "4" });
const jace = card("Jace, Test Sculptor", "Legendary Planeswalker — Jace", "{2}{U}", { oracleText: "+1: You gain 1 life.\n−1: You gain 2 life.\n−2: Draw a card.", loyalty: "6" });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4" });

// Real oracle text (Scryfall).
const miglozMazeCrus = card("Migloz, Maze Crusher", "Legendary Creature — Phyrexian Beast", "{1}{R}{G}", {"cmc":3,"oracleText":"Migloz enters with five oil counters on it.\n{1}, Remove an oil counter from Migloz: It gains vigilance and menace until end of turn.\n{2}, Remove two oil counters from Migloz: It gets +2/+2 until end of turn.\n{3}, Remove three oil counters from Migloz: Destroy target artifact or enchantment.","power":"4","toughness":"4","keywords":[],"layout":"normal"});
const martonStromgal = card("Márton Stromgald", "Legendary Creature — Human Knight", "{2}{R}{R}", {"cmc":4,"oracleText":"Whenever Márton Stromgald attacks, other attacking creatures get +1/+1 until end of turn for each attacking creature other than Márton Stromgald.\nWhenever Márton Stromgald blocks, other blocking creatures get +1/+1 until end of turn for each blocking creature other than Márton Stromgald.","power":"1","toughness":"1","keywords":[],"layout":"normal"});
const cratersClaws = card("Crater's Claws", "Sorcery", "{X}{R}", {"cmc":1,"oracleText":"Crater's Claws deals X damage to any target.\nFerocious — Crater's Claws deals X plus 2 damage instead if you control a creature with power 4 or greater.","keywords":["Ferocious"],"layout":"normal"});
const thoughtShucker = card("Thought Shucker", "Creature — Rat Rogue", "{1}{U}", {"cmc":2,"oracleText":"Threshold — {1}{U}: Put a +1/+1 counter on this creature and draw a card. Activate only if there are seven or more cards in your graveyard and only once.","power":"1","toughness":"3","keywords":["Threshold"],"layout":"normal"});
const peregrination = card("Peregrination", "Sorcery", "{3}{G}", {"cmc":4,"oracleText":"Search your library for up to two basic land cards, reveal those cards, and put one onto the battlefield tapped and the other into your hand. Shuffle, then scry 1. (Look at the top card of your library. You may put that card on the bottom.)","keywords":["Scry"],"layout":"normal"});
const wayOfTheParado = card("Way of the Paradox", "Legendary Enchantment", "{2}{G}", {"cmc":3,"oracleText":"When Way of the Paradox enters, empower Jace 5. (Put five loyalty counters on a Jace token you control. If you don't control one, first create a blue Jace planeswalker token with \"[−1]: Surveil 1\" and \"[−3]: Draw a card.\")\nWhenever you activate a loyalty ability, you gain 1 life. You may play an additional land this turn.","keywords":["Surveil","Empower Jace"],"layout":"normal"});
const wayOfTheMindSc = card("Way of the Mind Sculptor", "Legendary Enchantment", "{4}{U}", {"cmc":5,"oracleText":"When Way of the Mind Sculptor enters, empower Jace 5. (Put five loyalty counters on a Jace token you control. If you don't control one, first create a blue Jace planeswalker token with \"[−1]: Surveil 1\" and \"[−3]: Draw a card.\")\nWhenever you activate a loyalty ability, if you removed two or more loyalty counters to activate it, draw a card.","keywords":["Surveil","Empower Jace"],"layout":"normal"});
const keralKeepDisci = card("Keral Keep Disciples", "Creature — Human Monk", "{2}{R}{R}", {"cmc":4,"oracleText":"Whenever you activate a loyalty ability of a Chandra planeswalker, this creature deals 1 damage to each opponent.","power":"4","toughness":"3","keywords":[],"layout":"normal"});
const chandrasRegula = card("Chandra's Regulator", "Legendary Artifact", "{1}{R}", {"cmc":2,"oracleText":"Whenever you activate a loyalty ability of a Chandra planeswalker, you may pay {1}. If you do, copy that ability. You may choose new targets for the copy.\n{1}, {T}, Discard a Mountain card or a red card: Draw a card.","keywords":[],"layout":"normal"});
const getawayCar = card("Getaway Car", "Artifact — Vehicle", "{3}", {"cmc":3,"oracleText":"Haste\nWhenever this Vehicle attacks or blocks, return up to one target creature that crewed it this turn to its owner's hand.\nCrew 1","power":"4","toughness":"3","keywords":["Haste","Crew"],"layout":"normal"});
const goldenArgosy = card("Golden Argosy", "Legendary Artifact — Vehicle", "{4}", {"cmc":4,"oracleText":"Whenever Golden Argosy attacks, exile each creature that crewed it this turn. Return them to the battlefield tapped under their owner's control at the beginning of the next end step.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"3","toughness":"6","keywords":["Crew"],"layout":"normal"});
const tombBlade = card("Tomb Blade", "Artifact Creature — Necron", "{4}{B}{B}", {"cmc":6,"oracleText":"Flying\nWhenever this creature deals combat damage to a player, that player loses life equal to the number of creatures they control unless they sacrifice a creature of their choice.\nUnearth {6}{B}{B}","power":"5","toughness":"4","keywords":["Flying","Unearth"],"layout":"normal"});
const broodOfCockroa = card("Brood of Cockroaches", "Creature — Insect", "{1}{B}", {"cmc":2,"oracleText":"When this creature is put into your graveyard from the battlefield, at the beginning of the next end step, you lose 1 life and return this card to your hand.","power":"1","toughness":"1","keywords":[],"layout":"normal"});
const mukotaiSoulrip = card("Mukotai Soulripper", "Artifact — Vehicle", "{1}{B}", {"cmc":2,"oracleText":"Whenever this Vehicle attacks, you may sacrifice another artifact or creature. If you do, put a +1/+1 counter on this Vehicle and it gains menace until end of turn.\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"4","toughness":"3","keywords":["Crew"],"layout":"normal"});
const amuletOfSafeke = card("Amulet of Safekeeping", "Artifact", "{2}", {"cmc":2,"oracleText":"Whenever you become the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {1}.\nCreature tokens get -1/-0.","keywords":[],"layout":"normal"});
const theChiefWarg = card("The Chief Warg", "Legendary Creature — Wolf", "{2}{B}{G}", {"cmc":4,"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nFerocious — Whenever you attack while you control a creature with power 4 or greater, you draw a card and lose 1 life.","power":"3","toughness":"3","keywords":["Ferocious","Menace"],"layout":"normal"});
const loreseekersSto = card("Loreseeker's Stone", "Artifact", "{6}", {"cmc":6,"oracleText":"{3}, {T}: Draw three cards. This ability costs {1} more to activate for each card in your hand.","keywords":[],"layout":"normal"});
const screamingSwarm = card("Screaming Swarm", "Creature — Bird Horror", "{5}{U}", {"cmc":6,"oracleText":"Flying\nWhenever you attack with one or more creatures, target player mills that many cards. (To mill a card, a player puts the top card of their library into their graveyard.)\n{2}{U}: Put this card from your graveyard into your library second from the top.","power":"4","toughness":"4","keywords":["Flying","Mill"],"layout":"normal"});
const goblinRazerunn = card("Goblin Razerunners", "Creature — Goblin Warrior", "{2}{R}{R}", {"cmc":4,"oracleText":"{1}{R}, Sacrifice a land: Put a +1/+1 counter on this creature.\nAt the beginning of your end step, you may have this creature deal damage equal to the number of +1/+1 counters on it to target player or planeswalker.","power":"3","toughness":"4","keywords":[],"layout":"normal"});
const galliaOfTheEnd = card("Gallia of the Endless Dance", "Legendary Creature — Satyr", "{R}{G}", {"cmc":2,"oracleText":"Haste\nOther Satyrs you control get +1/+1 and have haste.\nWhenever you attack with three or more creatures, you may discard a card at random. If you do, draw two cards.","power":"2","toughness":"2","keywords":["Haste"],"layout":"normal"});
const whisperingSnit = card("Whispering Snitch", "Creature — Vampire Rogue", "{1}{B}", {"cmc":2,"oracleText":"Whenever you surveil for the first time each turn, this creature deals 1 damage to each opponent and you gain 1 life.","power":"1","toughness":"3","keywords":[],"layout":"normal"});
const celestialGatek = card("Celestial Gatekeeper", "Creature — Bird Cleric", "{3}{W}{W}", {"cmc":5,"oracleText":"Flying\nWhen this creature dies, exile it, then return up to two target Bird and/or Cleric permanent cards from your graveyard to the battlefield.","power":"2","toughness":"2","keywords":["Flying"],"layout":"normal"});
const crimsonHonorGu = card("Crimson Honor Guard", "Creature — Vampire Knight", "{3}{R}{R}", {"cmc":5,"oracleText":"Trample\nAt the beginning of each player's end step, this creature deals 4 damage to that player unless they control a commander.","power":"4","toughness":"5","keywords":["Trample"],"layout":"normal"});
const recklessPyrosu = card("Reckless Pyrosurfer", "Creature — Human Scout", "{1}{R}", {"cmc":2,"oracleText":"Haste\nLandfall — Whenever a land you control enters, this creature gains battle cry until end of turn. (Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn. Each instance of battle cry triggers separately.)","power":"2","toughness":"2","keywords":["Haste","Landfall"],"layout":"normal"});

describe("round 222 cards are supported", () => {
  it("compiles every card of the round", () => {
    supported(miglozMazeCrus, martonStromgal, cratersClaws, thoughtShucker, peregrination, wayOfTheParado, wayOfTheMindSc, keralKeepDisci, chandrasRegula, getawayCar, goldenArgosy, tombBlade, broodOfCockroa, mukotaiSoulrip, amuletOfSafeke, theChiefWarg, loreseekersSto, screamingSwarm, goblinRazerunn, galliaOfTheEnd, whisperingSnit, celestialGatek, crimsonHonorGu, recklessPyrosu);
  });
});

describe("Migloz, Maze Crusher", () => {
  it("'It gains vigilance and menace' and 'It gets +2/+2' are about Migloz, paid with its oil counters", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, miglozMazeCrus);
    s0.objects[m]!.counters.oil = 5;
    let s = settle(run(s0, planActivate(s0, ap, m, abilityIndex(s0, m, /vigilance and menace/))), { me: ap });
    expect(objHasKeyword(s, s.objects[m]!, "Vigilance")).toBe(true);
    expect(objHasKeyword(s, s.objects[m]!, "Menace")).toBe(true);
    expect(s.objects[m]!.counters.oil).toBe(4);
    s = settle(run(s, planActivate(s, ap, m, abilityIndex(s, m, /\+2\/\+2/))), { me: ap });
    expect(pt(s, m)).toBe("6/6");
    expect(s.objects[m]!.counters.oil).toBe(2);
  });
});

describe("Márton Stromgald", () => {
  it("other attacking creatures get +1/+1 for each attacking creature other than Márton", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, martonStromgal);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    const home = putOnBattlefield(s0, ap, bear({ name: "Home Bear" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [m, a, b].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(s, { me: ap });
    expect(pt(s, a)).toBe("4/4");
    expect(pt(s, b)).toBe("4/4");
    expect(pt(s, m)).toBe("1/1");
    expect(pt(s, home)).toBe("2/2");
  });
});

describe("Crater's Claws", () => {
  it("deals X damage, or X plus 2 if you control a creature with power 4 or greater", () => {
    const { s: s0, ap, ids, opp } = setup([cratersClaws, cratersClaws]);
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 3)), { me: ap });
    expect(s.players[opp]!.life).toBe(life - 3);
    putOnBattlefield(s, ap, ogre);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, "auto", 2)), { me: ap });
    expect(s.players[opp]!.life).toBe(life - 3 - 4);
  });
});

describe("Thought Shucker", () => {
  it("can be activated only with seven or more cards in your graveyard, and only once", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, thoughtShucker);
    expect(planActivate(s0, ap, t, 0)).toBeNull();
    for (let i = 0; i < 7; i++) into(s0, ap, bear(), "graveyard");
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, t, 0)), { me: ap });
    expect(s.objects[t]!.counters["+1/+1"]).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(planActivate(s, ap, t, 0)).toBeNull();
  });
});

describe("Peregrination", () => {
  it("puts one basic land onto the battlefield tapped and the other into your hand, then scries 1", () => {
    const { s: s0, ap, ids } = setup([peregrination]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      s = p ? act(s, botActions(s, p.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
      if (s.log.some((l) => /scries/.test(l.text))) break;
    }
    const lands = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && objIsType(s, s.objects[id]!, "Land"));
    expect(lands.length).toBe(s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) === ap && objIsType(s0, s0.objects[id]!, "Land")).length + 1);
    expect(lands.filter((id) => s.objects[id]!.tapped).length).toBeGreaterThan(0);
    expect(s.log.some((l) => /scries 1/.test(l.text))).toBe(true);
  });
});

describe("Loyalty-ability triggers", () => {
  it("Way of the Paradox: activating a loyalty ability gains 1 life and gives an extra land play", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, wayOfTheParado);
    const c = putOnBattlefield(s0, ap, chandra);
    s0.objects[c]!.counters.loyalty = 4;
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planActivate(s0, ap, c, 0)), { me: ap });
    expect(s.players[ap]!.life).toBe(life + 1 + 1);
    expect(s.players[ap]!.extraLands).toEqual({ turn: s.turn, n: 1 });
  });

  it("Way of the Mind Sculptor draws only when two or more loyalty counters were removed", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, wayOfTheMindSc);
    const j = putOnBattlefield(s0, ap, jace);
    s0.objects[j]!.counters.loyalty = 6;
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, j, 1)), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand);
    // Another Jace: each planeswalker activates one loyalty ability a turn (CR 606.3).
    const j2 = putOnBattlefield(s, ap, { ...jace, oracleId: "test-jace-2", name: "Jace, Second Test Sculptor" });
    s.objects[j2]!.counters.loyalty = 6;
    const before = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, j2, 2)), { me: ap });
    // The −2 draws one, the trigger another.
    expect(s.players[ap]!.hand.length).toBe(before + 2);
  });

  it("Keral Keep Disciples: only a Chandra's loyalty ability deals 1 damage to each opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, keralKeepDisci);
    const j = putOnBattlefield(s0, ap, jace);
    s0.objects[j]!.counters.loyalty = 6;
    const c = putOnBattlefield(s0, ap, chandra);
    s0.objects[c]!.counters.loyalty = 4;
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planActivate(s0, ap, j, 0)), { me: ap });
    expect(s.players[opp]!.life).toBe(life);
    s = settle(run(s, planActivate(s, ap, c, 0)), { me: ap });
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Chandra's Regulator: pay {1} to copy a Chandra's loyalty ability", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, chandrasRegula);
    const c = putOnBattlefield(s0, ap, chandra);
    s0.objects[c]!.counters.loyalty = 4;
    const life = s0.players[ap]!.life;
    const s1 = run(s0, planActivate(s0, ap, c, 0));
    s1.players[ap]!.manaPool.C = 1;
    const s = settle(s1, { me: ap, may: true });
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.objects[c]!.counters.loyalty).toBe(5);
  });
});

describe("Getaway Car and Golden Argosy", () => {
  it("Getaway Car returns a creature that crewed it this turn, and only such a creature can be the target", () => {
    const { s: s0, ap, opp } = setup([]);
    const car = putOnBattlefield(s0, ap, getawayCar);
    const crew = putOnBattlefield(s0, ap, bear({ name: "Crew Bear" }));
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    let s = settle(act(s0, { type: "activateAbility", player: ap, objectId: car, index: abilityIndex(s0, car, /^Crew/), tapCreatures: [crew] }), { me: ap });
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: car, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(crew)] }), { me: ap });
    expect(zone(s, crew)).toBe("hand");
    expect(zone(s, other)).toBe("battlefield");
  });

  it("Golden Argosy exiles each creature that crewed it this turn and returns them tapped at the next end step", () => {
    const { s: s0, ap, opp } = setup([]);
    const boat = putOnBattlefield(s0, ap, goldenArgosy);
    const crew = putOnBattlefield(s0, ap, bear({ name: "Crew Bear" }));
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    let s = settle(act(s0, { type: "activateAbility", player: ap, objectId: boat, index: abilityIndex(s0, boat, /^Crew/), tapCreatures: [crew] }), { me: ap });
    s = passUntil(s, "declareAttackers", ap);
    s = attack(s, ap, [{ attacker: boat, defender: opp }]);
    s = settle(s, { me: ap });
    expect(zone(s, crew)).toBe("exile");
    expect(zone(s, other)).toBe("battlefield");
    s = settle(passUntil(s, "end", ap), { me: ap });
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Crew Bear");
    expect(back).toBeDefined();
    expect(s.objects[back!]!.tapped).toBe(true);
  });
});

describe("Tomb Blade", () => {
  it("the damaged player loses life equal to the number of creatures they control unless they sacrifice one", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tombBlade);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, bear({ name: `Their Bear ${i}` }));
    const life = s0.players[opp]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    s = attack(s, ap, [{ attacker: t, defender: opp }], false);
    s = settle(s, { me: ap });
    const theirs = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === opp && objIsType(s, s.objects[id]!, "Creature")).length;
    // Either they sacrificed a creature (and lost only the combat damage), or lost one life for each creature.
    expect(theirs === 2 ? s.players[opp]!.life === life - 5 : theirs === 3 && s.players[opp]!.life === life - 5 - 3).toBe(true);
  });
});

describe("Brood of Cockroaches", () => {
  it("dying: at the beginning of the next end step you lose 1 life and return it to your hand", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const b = putOnBattlefield(s0, ap, broodOfCockroa);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])), { me: ap });
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life);
    s = settle(passUntil(s, "end", ap), { me: ap });
    expect(zone(s, b)).toBe("hand");
    expect(s.players[ap]!.life).toBe(life - 1);
  });
});

describe("Mukotai Soulripper", () => {
  it("sacrificing another artifact or creature as it attacks gives it a +1/+1 counter and menace", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, mukotaiSoulrip);
    const crew = putOnBattlefield(s0, ap, bear({ name: "Crew Bear" }));
    const fodder = putOnBattlefield(s0, ap, card("Test Trinket", "Artifact", "{1}"));
    let s = settle(act(s0, { type: "activateAbility", player: ap, objectId: v, index: abilityIndex(s0, v, /^Crew/), tapCreatures: [crew] }), { me: ap });
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] });
    s = settle(s, { me: ap, may: true });
    if (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    expect(zone(s, fodder) === "graveyard" || zone(s, crew) === "graveyard").toBe(true);
    expect(s.objects[v]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[v]!, "Menace")).toBe(true);
  });
});

describe("Amulet of Safekeeping", () => {
  it("counters an opponent's spell that targets you unless its controller pays {1}; creature tokens get -1/-0", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, amuletOfSafeke);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    let s = passUntil(s0, "main1", opp);
    const zap = into(s, opp, shock, "hand");
    s.players[opp]!.manaPool.R = 1;
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, opp, zap, [{ kind: "player", id: ap }])), { me: ap });
    // The opponent has no mana left to pay {1}: countered.
    expect(s.players[ap]!.life).toBe(life);
    // A permanent of yours being targeted doesn't trigger it.
    const zap2 = into(s, opp, shock, "hand");
    s.players[opp]!.manaPool.R = 1;
    s = settle(run(s, planCast(s, opp, zap2, [tgt(mine)])), { me: ap });
    expect(zone(s, mine)).toBe("graveyard");
  });
});

describe("The Chief Warg", () => {
  it("attacking while you control a creature with power 4 or greater: draw a card and lose 1 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, theChiefWarg);
    emptyHand(s0, ap);
    let s = passUntil(s0, "declareAttackers", ap);
    s = attack(s, ap, [{ attacker: w, defender: opp }]);
    s = settle(s, { me: ap });
    expect(s.players[ap]!.hand.length).toBe(0);
  });

  it("triggers with a 4-power creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, theChiefWarg);
    putOnBattlefield(s0, ap, ogre);
    emptyHand(s0, ap);
    const life = s0.players[ap]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp }] });
    s = settle(s, { me: ap });
    expect(s.players[ap]!.hand.length).toBe(1);
    expect(s.players[ap]!.life).toBe(life - 1);
  });
});

describe("Loreseeker's Stone", () => {
  it("costs {1} more to activate for each card in your hand", () => {
    const { s: s0, ap } = setup([]);
    const st = putOnBattlefield(s0, ap, loreseekersSto);
    emptyHand(s0, ap);
    for (let i = 0; i < 3; i++) into(s0, ap, bear(), "hand");
    // 14 lands: {3} plus 3 for the hand.
    const plan = planActivate(s0, ap, st, 0);
    expect(plan).not.toBeNull();
    const s = settle(run(s0, plan), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(6);
    const tapped = s.battlefield.filter((id) => s.objects[id]!.tapped && objIsType(s, s.objects[id]!, "Land")).length;
    expect(tapped).toBe(6);
  });
});

describe("Screaming Swarm", () => {
  it("puts itself from your graveyard into your library second from the top", () => {
    const { s: s0, ap } = setup([]);
    const sw = into(s0, ap, screamingSwarm, "graveyard");
    const top = s0.players[ap]!.library[0];
    const s = settle(run(s0, planActivate(s0, ap, sw, 0)), { me: ap });
    expect(s.players[ap]!.library[0]).toBe(top);
    const second = s.players[ap]!.library[1]!;
    expect(s.cards[s.objects[second]!.cardId]!.name).toBe("Screaming Swarm");
  });
});

describe("Goblin Razerunners", () => {
  it("may deal damage equal to its +1/+1 counters to target player at your end step", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, goblinRazerunn);
    s0.objects[g]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    let s = passUntil(s0, "end", ap);
    s = settle(s, { me: ap, may: true, targets: [{ kind: "player", id: opp }] });
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

describe("Gallia of the Endless Dance", () => {
  it("attacking with three creatures: you may discard a card at random to draw two", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, galliaOfTheEnd);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    emptyHand(s0, ap);
    into(s0, ap, bear({ name: "Lonely Card" }), "hand");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [g, a, b].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(s, { me: ap, may: true });
    expect(s.players[ap]!.hand.length).toBe(2);
    expect(s.players[ap]!.graveyard.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Lonely Card")).toBe(true);
  });

  it("with no card in hand, nothing is discarded and nothing is drawn", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, galliaOfTheEnd);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    emptyHand(s0, ap);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [g, a, b].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(s, { me: ap, may: true });
    expect(s.players[ap]!.hand.length).toBe(0);
  });
});

describe("Whispering Snitch", () => {
  const surveil = card("Test Surveil", "Instant", "{U}", { oracleText: "Surveil 1." });
  it("triggers on your first surveil each turn only", () => {
    const { s: s0, ap, ids, opp } = setup([surveil, surveil]);
    putOnBattlefield(s0, ap, whisperingSnit);
    const life = s0.players[opp]!.life;
    const answer = (s: GameState) => {
      for (let i = 0; i < 100 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        s = p ? act(s, botActions(s, p.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      return s;
    };
    let s = answer(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[opp]!.life).toBe(life - 1);
    s = answer(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[opp]!.life).toBe(life - 1);
  });
});

describe("Celestial Gatekeeper", () => {
  it("dies: exile it, then return up to two Bird and/or Cleric permanent cards from your graveyard", () => {
    const { s: s0, ap, ids } = setup([shock, shock]);
    const g = putOnBattlefield(s0, ap, celestialGatek);
    const bird = into(s0, ap, card("Test Bird", "Creature — Bird", "{W}", { power: "1", toughness: "1" }), "graveyard");
    const cleric = into(s0, ap, card("Test Cleric", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1" }), "graveyard");
    const wizard = into(s0, ap, card("Test Wizard", "Creature — Human Wizard", "{U}", { power: "1", toughness: "1" }), "graveyard");
    const ritual = into(s0, ap, card("Bird Ritual", "Kindred Instant — Bird", "{W}", { oracleText: "You gain 1 life." }), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(g)]));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(wizard), { kind: "none" }] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(ritual), { kind: "none" }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bird), tgt(cleric)] }), { me: ap });
    expect(zone(s, g)).toBe("exile");
    expect(s.battlefield.filter((id) => ["Test Bird", "Test Cleric"].includes(s.cards[s.objects[id]!.cardId]!.name)).length).toBe(2);
    expect(zone(s, wizard)).toBe("graveyard");
  });
});

describe("Crimson Honor Guard", () => {
  it("deals 4 damage to the player whose end step it is unless they control a commander", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, crimsonHonorGu);
    const life = s0.players[ap]!.life;
    let s = settle(passUntil(s0, "end", ap), { me: ap });
    expect(s.players[ap]!.life).toBe(life - 4);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", next);
    putOnBattlefield(s, next, card("Their Commander", "Legendary Creature — Human", "{1}", { power: "1", toughness: "1" }), { commander: true });
    const theirs = s.players[next]!.life;
    s = settle(passUntil(s, "end", next), { me: ap });
    expect(s.players[next]!.life).toBe(theirs);
  });
});

describe("Reckless Pyrosurfer", () => {
  it("landfall gives it battle cry until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, recklessPyrosu);
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const land = into(s0, ap, card("Test Mountain", "Basic Land — Mountain"), "hand");
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    s = settle(s, { me: ap });
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [r, other].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(s, { me: ap });
    expect(pt(s, other)).toBe("3/2");
    expect(pt(s, r)).toBe("2/2");
  });
});

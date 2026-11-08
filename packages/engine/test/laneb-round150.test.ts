// Lane B round B150: Sharp-Eyed Rookie ("if its power is greater than ~'s power or its toughness is greater than ~'s
// toughness": an intervening if, CR 603.4, checked as the creature enters and again as the ability resolves), Voracious
// Dragon ("twice the number of Goblins it devoured", each as it last existed, CR 702.82b), Adipose Offspring ("If ~'s
// emerge cost was paid, instead create X of those tokens, where X is the sacrificed creature's toughness", CR 702.119a),
// Wanderwine Farewell ("for each permanent returned to its owner's hand this way"), Alpha Brawl (the target's damage to
// each other creature its controller controls, then theirs back to it), Nahiri's Wrath ("the total mana value of the
// discarded cards" of its "discard X cards" cost), Nemesis Phoenix (from the graveyard tapped and attacking, "only if
// you're attacking two or more opponents", CR 508.4), Asgardian Inspiration (a trigger from the graveyard on a source's
// noncombat damage to an opponent, CR 113.6m) and Dodgy Jalopy (scavenge with a "*" power, CR 702.97a, 604.3).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, dealDamage, invalidateCharacteristics, isFullySupported, objectSource, parseManaCost, planActivate, planCast, planMana, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const rookie = (): CardDef => ({"oracleId":"0642fb0d-73cb-4989-852c-3233fe36c3b4","name":"Sharp-Eyed Rookie","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Human Detective","supertypes":[],"types":["Creature"],"subtypes":["Human","Detective"],"oracleText":"Vigilance\nWhenever a creature you control enters, if its power is greater than this creature's power or its toughness is greater than this creature's toughness, put a +1/+1 counter on this creature and investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Investigate","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3d5d4788-a970-4e09-89a1-740eca9331d9.jpg?1783912862","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3d5d4788-a970-4e09-89a1-740eca9331d9.jpg?1783912862","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dragon = (): CardDef => ({"oracleId":"7f39bbae-6c84-4cb3-9a58-d746a723ad35","name":"Voracious Dragon","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nDevour 1 (As this creature enters, you may sacrifice any number of creatures. It enters with that many +1/+1 counters on it.)\nWhen this creature enters, it deals damage to any target equal to twice the number of Goblins it devoured.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Devour"],"imageUrl":"https://cards.scryfall.io/normal/front/7/a/7a2ab319-bad8-4695-b56c-3654ba3389c5.jpg?1783942476","artUrl":"https://cards.scryfall.io/art_crop/front/7/a/7a2ab319-bad8-4695-b56c-3654ba3389c5.jpg?1783942476","commanderLegal":"legal","set":"con","releasedAt":"2009-02-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const offspring = (): CardDef => ({"oracleId":"1e21e57e-3bc9-41a8-9746-57b583a5ad63","name":"Adipose Offspring","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Alien","supertypes":[],"types":["Creature"],"subtypes":["Alien"],"oracleText":"Emerge {5}{W} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen this creature enters, create a 2/2 white Alien creature token. If this creature's emerge cost was paid, instead create X of those tokens, where X is the sacrificed creature's toughness.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Emerge"],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/68f91092-b679-46c1-9f0c-3b286ee1d02f.jpg?1783914683","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/68f91092-b679-46c1-9f0c-3b286ee1d02f.jpg?1783914683","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const farewell = (): CardDef => ({"oracleId":"7e1da4a1-5922-4a2e-8bbc-25fbcbf20935","name":"Wanderwine Farewell","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Kindred Sorcery — Merfolk","supertypes":[],"types":["Kindred","Sorcery"],"subtypes":["Merfolk"],"oracleText":"Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nReturn one or two target nonland permanents to their owners' hands. Then if you control a Merfolk, create a 1/1 white and blue Merfolk creature token for each permanent returned to its owner's hand this way.","colors":["U"],"colorIdentity":["U"],"keywords":["Convoke"],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/473123a0-1366-406b-9b9e-154c0e9c224f.jpg?1783904472","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/473123a0-1366-406b-9b9e-154c0e9c224f.jpg?1783904472","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const brawl = (): CardDef => ({"oracleId":"cfc023e0-9e9d-48ac-bfb5-74bfd5977dee","name":"Alpha Brawl","manaCost":"{6}{R}{R}","cmc":8,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature an opponent controls deals damage equal to its power to each other creature that player controls, then each of those creatures deals damage equal to its power to that creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e2ec168a-3e4f-4527-901a-bc28cc28d125.jpg?1783940822","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e2ec168a-3e4f-4527-901a-bc28cc28d125.jpg?1783940822","commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wrath = (): CardDef => ({"oracleId":"420091b5-b966-4233-877d-e9143481e97e","name":"Nahiri's Wrath","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, discard X cards.\nNahiri's Wrath deals damage equal to the total mana value of the discarded cards to each of up to X target creatures and/or planeswalkers.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1e6cb8b0-e3a5-4a94-845d-3b286aa392ac.jpg?1783937457","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1e6cb8b0-e3a5-4a94-845d-3b286aa392ac.jpg?1783937457","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const phoenix = (): CardDef => ({"oracleId":"bd0dcb8c-d550-4034-8597-0aba6f6e3b3f","name":"Nemesis Phoenix","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Phoenix","supertypes":[],"types":["Creature"],"subtypes":["Phoenix"],"oracleText":"Flying\n{2}{R}: Return this card from your graveyard to the battlefield tapped and attacking. Activate only during the declare attackers step and only if you're attacking two or more opponents.","power":"4","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/1743840f-fe99-4cb4-a558-1763b605b35f.jpg?1783922733","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/1743840f-fe99-4cb4-a558-1763b605b35f.jpg?1783922733","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const inspiration = (): CardDef => ({"oracleId":"1be4bb28-6ad7-4df9-98b7-fa32061e7a95","name":"Asgardian Inspiration","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile the top card of your library. You may play it this turn.\nWhenever a source you control deals noncombat damage to an opponent, you may pay {2}. If you do, return this card from your graveyard to your hand.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d1fe7eef-2636-484f-b476-4dc9c9dbfddd.jpg?1783903053","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d1fe7eef-2636-484f-b476-4dc9c9dbfddd.jpg?1783903053","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const jalopy = (): CardDef => ({"oracleId":"469d820d-b7a6-414a-af18-71c1b1e42da5","name":"Dodgy Jalopy","manaCost":"{2}{G}","cmc":3,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Trample\nDodgy Jalopy's power is equal to the greatest mana value among creatures you control.\nCrew 3\nScavenge {2}{G} ({2}{G}, Exile this card from your graveyard: Put a number of +1/+1 counters equal to this card's power on target creature. Scavenge only as a sorcery.)","power":"*","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":["Scavenge","Crew","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/330cae18-9b9a-4ec9-a4c6-83bbf42f1f70.jpg?1783923310","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/330cae18-9b9a-4ec9-a4c6-83bbf42f1f70.jpg?1783923310","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
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
/** Passes until the top of the stack is no longer a spell (it resolved and its triggers are on the stack). */
const resolveSpell = (s: GameState) => {
  for (let i = 0; i < 20 && s.stack.at(-1)?.kind === "spell" && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const clues = (s: GameState, pid: PlayerId) => named(s, "Clue Token").filter((id) => s.objects[id]!.controller === pid).length;

describe("Lane B round B150", () => {
  it("compiles the cards", () => supported(rookie(), dragon(), offspring(), farewell(), brawl(), wrath(), phoenix(), inspiration(), jalopy()));

  it("Sharp-Eyed Rookie: a creature you control entering with greater power or toughness, checked again as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, rookie());
    const strong = toHand(s0, ap, bear({ name: "Strong Bear", manaCost: "{1}", power: "3", toughness: "1" }));
    const tough = toHand(s0, ap, bear({ name: "Tough Bear", manaCost: "{1}", power: "1", toughness: "4" }));
    const same = toHand(s0, ap, bear({ name: "Same Bear", manaCost: "{1}", power: "2", toughness: "2" }));
    const big = toHand(s0, ap, bear({ name: "Big Bear", manaCost: "{1}", power: "6", toughness: "6" }));
    // 3/1 against a 2/2: its power is greater.
    let s = settle(run(s0, planCast(s0, ap, strong)));
    expect(s.objects[me]!.counters["+1/+1"]).toBe(1);
    expect(clues(s, ap)).toBe(1);
    // 2/2 against a 3/3: neither is greater, so it doesn't trigger at all.
    s = resolveSpell(run(s, planCast(s, ap, same)));
    expect(s.stack.length).toBe(0);
    expect(pt(s, me)).toBe("3/3");
    // 1/4 against a 3/3: its toughness is greater.
    s = settle(run(s, planCast(s, ap, tough)));
    expect(pt(s, me)).toBe("4/4");
    expect(clues(s, ap)).toBe(2);
    // 6/6 triggers, but ~ is 7/7 by the time it resolves: it does nothing (rulings).
    s = resolveSpell(run(s, planCast(s, ap, big)));
    expect(s.stack.length).toBe(1);
    addEffect(s, ap, [me], [{ kind: "modifyPT", power: 3, toughness: 3 }]);
    s = settle(s);
    expect(s.objects[me]!.counters["+1/+1"]).toBe(2);
    expect(clues(s, ap)).toBe(2);
    // An opponent's creature entering isn't one you control.
    const theirs = toHand(s, opp, bear({ name: "Their Bear", manaCost: "{0}", power: "9", toughness: "9" }));
    expect(s.objects[theirs]!.zone).toBe("hand");
  });

  it("Voracious Dragon: twice the number of Goblins it devoured, a changeling counting as one", () => {
    const { s: s0, ap, opp, ids } = setup([dragon()]);
    const goblin = putOnBattlefield(s0, ap, bear({ name: "Test Goblin", typeLine: "Creature — Goblin", subtypes: ["Goblin"] }));
    const shifter = putOnBattlefield(s0, ap, bear({ name: "Test Shapeshifter", typeLine: "Creature — Shapeshifter", subtypes: ["Shapeshifter"], keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" }));
    const other = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("pickPermanents");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [goblin, shifter, other] }));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(s.pending?.kind).toBe("chooseTargets");
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("Voracious Dragon: no Goblins devoured deals no damage", () => {
    const { s: s0, ap, opp, ids } = setup([dragon()]);
    const other = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [other] }));
    const life = s.players[opp]!.life;
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Adipose Offspring: cast for its emerge cost, as many Aliens as the sacrificed creature's toughness as it last existed", () => {
    const { s: s0, ap, ids } = setup([offspring(), offspring()]);
    const wall = putOnBattlefield(s0, ap, bear({ name: "Test Wall", manaCost: "{2}", power: "0", toughness: "4" }));
    // +0/+2 until end of turn: it was a 0/6 as it was sacrificed.
    addEffect(s0, ap, [wall], [{ kind: "modifyPT", power: 0, toughness: 2 }]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "emerge", sacrifice: [wall] })));
    expect(s.objects[wall]!.zone).toBe("graveyard");
    expect(named(s, "Alien Token").length).toBe(6);
    // Cast for its mana cost: one.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(named(s, "Alien Token").length).toBe(7);
  });

  it("Wanderwine Farewell: a Merfolk for each permanent returned, a token too; none without a Merfolk", () => {
    const { s: s0, ap, opp, ids } = setup([farewell(), farewell()]);
    const merfolk = putOnBattlefield(s0, ap, bear({ name: "Test Merfolk", typeLine: "Creature — Merfolk", subtypes: ["Merfolk"] }));
    const a = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const t = putOnBattlefield(s0, opp, bear({ name: "Their Token" }));
    s0.objects[t]!.isToken = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(t)], undefined, [])));
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.battlefield.includes(t)).toBe(false);
    expect(named(s, "Merfolk Token").length).toBe(2);
    // No Merfolk now: the permanent is returned, no tokens.
    for (const id of [merfolk, ...named(s, "Merfolk Token")]) s.objects[id]!.counters = {};
    s.battlefield = s.battlefield.filter((id) => id !== merfolk && !named(s, "Merfolk Token").includes(id));
    s.objects[merfolk]!.zone = "graveyard";
    invalidateCharacteristics(s);
    const b = putOnBattlefield(s, opp, bear({ name: "Second Bear" }));
    for (const l of [card("Test Island A", "Basic Land — Island"), card("Test Island B", "Basic Land — Island"), card("Test Island C", "Basic Land — Island"), card("Test Island D", "Basic Land — Island"), card("Test Island E", "Basic Land — Island"), card("Test Island F", "Basic Land — Island"), card("Test Island G", "Basic Land — Island")]) putOnBattlefield(s, ap, l);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b), { kind: "none" }], undefined, [])));
    expect(s.objects[b]!.zone).toBe("hand");
    expect(named(s, "Merfolk Token").length).toBe(0);
  });

  it("Alpha Brawl: the target deals its power to each other creature its controller controls, then each deals its own back", () => {
    const { s: s0, ap, opp, ids } = setup([brawl()]);
    s0.players[ap]!.manaPool.R = 8;
    const champ = putOnBattlefield(s0, opp, bear({ name: "Champion", power: "4", toughness: "3" }));
    const small = putOnBattlefield(s0, opp, bear({ name: "Small Bear", power: "2", toughness: "2" }));
    const wall = putOnBattlefield(s0, opp, bear({ name: "Thick Bear", power: "1", toughness: "5" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const elsewhere = putOnBattlefield(s0, s0.turnOrder.find((p) => p !== ap && p !== opp)!, bear({ name: "Bystander" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(champ)])));
    // 4 to each of the two; then 2 + 1 back (the 2/2 dealt its damage though it had been dealt lethal damage): 3, lethal.
    expect(s.objects[small]!.zone).toBe("graveyard");
    expect(s.objects[wall]!.zone).toBe("battlefield");
    expect(s.objects[wall]!.damage).toBe(4);
    expect(s.objects[champ]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.damage ?? 0).toBe(0);
    expect(s.objects[elsewhere]!.damage ?? 0).toBe(0);
  });

  it("Alpha Brawl: only a creature an opponent controls can be the target", () => {
    const { s: s0, ap, ids } = setup([brawl()]);
    s0.players[ap]!.manaPool.R = 8;
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    expect(planCast(s0, ap, ids[0]!, [tgt(mine)])).toBeNull();
  });

  it("Nahiri's Wrath: the total mana value of the discarded cards to each of up to X targets", () => {
    const { s: s0, ap, opp, ids } = setup([wrath(), bear({ name: "Three Drop", manaCost: "{2}{G}" }), bear({ name: "Five Drop", manaCost: "{4}{G}" })]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Big One", power: "8", toughness: "8" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Bigger One", power: "9", toughness: "9" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)], undefined, "auto", 2, { discard: [ids[1]!, ids[2]!] })));
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.damage).toBe(8);
  });

  it("Nemesis Phoenix: returned tapped and attacking only while you're attacking two or more opponents", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap);
    const bird = toYard(s0, ap, phoenix());
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    s0.players[ap]!.manaPool.R = 3;
    // Not during the declare attackers step.
    expect(abilityProblem(s0, ap, bird, 0)).toBeTruthy();
    let s = passUntil(s0, "declareAttackers", ap);
    s.players[ap]!.manaPool.R = 3;
    // Both attacking the same opponent: one opponent.
    const one = act(structuredClone(s), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1! }, { attacker: b, defender: o1! }] });
    expect(one.step).toBe("declareAttackers");
    expect(abilityProblem(one, ap, bird, 0)).toBeTruthy();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1! }, { attacker: b, defender: o2! }] });
    expect(s.step).toBe("declareAttackers");
    expect(waitingOn(s)).toBe(ap);
    expect(abilityProblem(s, ap, bird, 0)).toBeNull();
    s = run(s, planActivate(s, ap, bird, 0));
    expect(s.objects[bird]!.zone).toBe("graveyard");
    s = settle(s);
    // Which defending player it attacks is its controller's choice (CR 508.4).
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("attackWhom");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(o2) }));
    expect(s.objects[bird]!.zone).toBe("battlefield");
    expect(s.objects[bird]!.tapped).toBe(true);
    expect(s.objects[bird]!.attacking).toBe(o2);
  });

  it("Asgardian Inspiration: from your graveyard, pay {2} as a source you control deals noncombat damage to an opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    const card0 = toYard(s0, ap, inspiration());
    const pinger = putOnBattlefield(s0, ap, bear({ name: "Pinger" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Pinger" }));
    // Damage to yourself, or by an opponent's source: no trigger.
    dealDamage(s0, objectSource(s0, s0.objects[pinger]!), { player: ap }, 1);
    dealDamage(s0, objectSource(s0, s0.objects[theirs]!), { player: opp }, 1);
    runStateBasedActions(s0);
    let s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.pending).toBeNull();
    expect(s.objects[card0]!.zone).toBe("graveyard");
    // Noncombat damage to an opponent from a source you control: may pay {2}.
    dealDamage(s, objectSource(s, s.objects[pinger]!), { player: opp }, 2);
    runStateBasedActions(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.pending?.kind).toBe("chooseMay");
    const p = s.pending!;
    if (p.kind !== "chooseMay") return;
    s = settle(run(s, [...planMana(s, ap, parseManaCost(p.pay!.mana!))!, { type: "chooseMay", player: ap, yes: true }]));
    expect(s.objects[card0]!.zone).toBe("hand");
  });

  it("Dodgy Jalopy: scavenge for its power in the graveyard, fixed as the cost exiles it", () => {
    const { s: s0, ap } = setup([]);
    const car = toYard(s0, ap, jalopy());
    const big = putOnBattlefield(s0, ap, bear({ name: "Five Drop", manaCost: "{4}{G}" }));
    const small = putOnBattlefield(s0, ap, bear({ name: "Small Bear" }));
    // Index 0 is its crew ability; the scavenge works from the graveyard.
    let s = run(s0, planActivate(s0, ap, car, 1, [tgt(small)]));
    expect(s.objects[car]!.zone).toBe("exile");
    // The five-drop leaves before it resolves: still 5 (rulings).
    s.battlefield.splice(s.battlefield.indexOf(big), 1);
    s.objects[big]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(big);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[small]!.counters["+1/+1"]).toBe(5);
  });
});

// Round 248: cards from earlier rounds' skip lists and the top of the popularity list. "Whenever you tap an untapped
// creature an opponent controls" (Hylda of the Icy Crown, Sharae of Numbing Depths, Solitary Sanctuary, Icewrought
// Sentry: only a tap a spell or ability had you do, rulings), Glen Elendra's Answer ("Counter all spells your opponents
// control and all abilities your opponents control"), Planar Chaos ("that player flips a coin. If they lose the flip"),
// Essence Sliver ("Whenever a Sliver deals damage, its controller gains that much life"), forage as an instruction (Bushy
// Bodyguard, Treetop Sentries, Curious Forager, Corpseberry Cultivator with "Whenever you forage", CR 701.61a),
// Flitterwing Nuisance ("deals combat damage to a player or planeswalker this turn"), Rampaging Aetherhood ("Then you may
// pay one or more {E}") and Werewolf Pack Leader ("isn't a Human").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, characteristics, dealDamage, defOf, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
 * Everyone passes until the stack is empty, answering trigger targets with `targets` (or, with `queue`, each in turn);
 * stops at any other question.
 */
const settle = (s: GameState, opts: { targets?: TargetChoice[]; queue?: TargetChoice[][] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    const answer = p?.kind === "chooseTargets" ? (opts.queue?.length ? opts.queue.shift() : opts.targets) : undefined;
    if (p?.kind === "chooseTargets" && answer) s = act(s, { type: "chooseTargets", player: p.player, targets: answer });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority until `pid` has it (the stack unchanged). */
const passTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
const named = (s: GameState, name: string, pid?: PlayerId) => s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === name && (pid === undefined || s.objects[id]!.controller === pid));

// Real oracle text (Scryfall).
const hylda = (): CardDef => ({"oracleId":"1733c71b-fd28-48dd-8a3d-41afd4b22f0e","name":"Hylda of the Icy Crown","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Whenever you tap an untapped creature an opponent controls, you may pay {1}. When you do, choose one —\n• Create a 4/4 white and blue Elemental creature token.\n• Put a +1/+1 counter on each creature you control.\n• Scry 2, then draw a card.","power":"3","toughness":"4","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae9231fd-053d-4b84-a7a8-86063465bc49.jpg?1783915071","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae9231fd-053d-4b84-a7a8-86063465bc49.jpg?1783915071","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const sharae = (): CardDef => ({"oracleId":"c736935a-e006-4a67-b942-e8ccf1cd9abb","name":"Sharae of Numbing Depths","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Merfolk Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Merfolk","Wizard"],"oracleText":"When Sharae enters, tap target creature an opponent controls and put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)\nWhenever you tap one or more untapped creatures your opponents control, draw a card. This ability triggers only once each turn.","power":"2","toughness":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/600bc36a-3ef0-459c-9a93-94ec45b8c3d9.jpg?1783915068","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/600bc36a-3ef0-459c-9a93-94ec45b8c3d9.jpg?1783915068","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sanctuary = (): CardDef => ({"oracleId":"4c0a8eed-f2e2-4821-8011-6e6ad2081936","name":"Solitary Sanctuary","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, tap target creature an opponent controls and put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)\nWhenever you tap an untapped creature an opponent controls, put a +1/+1 counter on target creature you control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d155693c-def0-4290-b662-ab9932e07fe5.jpg?1783915126","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d155693c-def0-4290-b662-ab9932e07fe5.jpg?1783915126","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sentry = (): CardDef => ({"oracleId":"0828d891-f7c3-4e51-b42e-6ce88d48ac8b","name":"Icewrought Sentry","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Elemental Soldier","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Soldier"],"oracleText":"Vigilance\nWhenever this creature attacks, you may pay {1}{U}. When you do, tap target creature an opponent controls.\nWhenever you tap an untapped creature an opponent controls, this creature gets +2/+1 until end of turn.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/859419d3-cd15-4362-98b3-a7ff98e29692.jpg?1783915119","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/859419d3-cd15-4362-98b3-a7ff98e29692.jpg?1783915119","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const glen = (): CardDef => ({"oracleId":"11ed8209-2184-4416-a8f0-72de00599574","name":"Glen Elendra's Answer","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell can't be countered.\nCounter all spells your opponents control and all abilities your opponents control. Create a 1/1 blue and black Faerie creature token with flying for each spell and ability countered this way.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/a/fa5bfbf9-dca2-42b7-a431-f9afedb54528.jpg?1783904490","artUrl":"https://cards.scryfall.io/art_crop/front/f/a/fa5bfbf9-dca2-42b7-a431-f9afedb54528.jpg?1783904490","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const chaos = (): CardDef => ({"oracleId":"f0864dbb-4d91-4282-a774-7b225e649ca8","name":"Planar Chaos","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, flip a coin. If you lose the flip, sacrifice this enchantment.\nWhenever a player casts a spell, that player flips a coin. If they lose the flip, counter that spell.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5dae5e16-d2fc-488c-9c53-d35c377d6a00.jpg?1783945116","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5dae5e16-d2fc-488c-9c53-d35c377d6a00.jpg?1783945116","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const essence = (): CardDef => ({"oracleId":"1f35f5e3-ddd1-4293-96f8-1181bbda77eb","name":"Essence Sliver","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"Whenever a Sliver deals damage, its controller gains that much life.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/3/1346fa14-1d9f-4c6a-887d-d3a93de00743.jpg?1783944929","artUrl":"https://cards.scryfall.io/art_crop/front/1/3/1346fa14-1d9f-4c6a-887d-d3a93de00743.jpg?1783944929","commanderLegal":"legal","set":"lgn","releasedAt":"2003-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bushy = (): CardDef => ({"oracleId":"5436bb0d-b5c7-43a9-8b3f-67cdc0dd0381","name":"Bushy Bodyguard","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Squirrel Warrior","supertypes":[],"types":["Creature"],"subtypes":["Squirrel","Warrior"],"oracleText":"Offspring {2} (You may pay an additional {2} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)\nWhen this creature enters, you may forage. If you do, put two +1/+1 counters on it. (To forage, exile three cards from your graveyard or sacrifice a Food.)","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Forage","Offspring"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0de60cf7-fa82-4b6f-9f88-6590fba5c863.jpg?1783910811","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0de60cf7-fa82-4b6f-9f88-6590fba5c863.jpg?1783910811","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const treetop = (): CardDef => ({"oracleId":"5bf5739a-6322-4e6e-b41e-e7bdbb11b1ce","name":"Treetop Sentries","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Squirrel Archer","supertypes":[],"types":["Creature"],"subtypes":["Squirrel","Archer"],"oracleText":"Reach\nWhen this creature enters, you may forage. If you do, draw a card. (To forage, exile three cards from your graveyard or sacrifice a Food.)","power":"2","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Forage","Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e16d4d6e-1fe5-4ff6-9877-8c849a24f5e0.jpg?1783910800","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e16d4d6e-1fe5-4ff6-9877-8c849a24f5e0.jpg?1783910800","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forager = (): CardDef => ({"oracleId":"30af656a-99ab-4e0a-81fe-3cdb0ea6a0cc","name":"Curious Forager","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Squirrel Druid","supertypes":[],"types":["Creature"],"subtypes":["Squirrel","Druid"],"oracleText":"When this creature enters, you may forage. When you do, return target permanent card from your graveyard to your hand. (To forage, exile three cards from your graveyard or sacrifice a Food.)","power":"3","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Forage"],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64653b4a-e139-45f9-a915-ab49afb6b795.jpg?1783910811","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64653b4a-e139-45f9-a915-ab49afb6b795.jpg?1783910811","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const corpseberry = (): CardDef => ({"oracleId":"5ded56df-c7d5-4043-85df-410f47219faa","name":"Corpseberry Cultivator","manaCost":"{1}{B/G}{B/G}","cmc":3,"typeLine":"Creature — Squirrel Warlock","supertypes":[],"types":["Creature"],"subtypes":["Squirrel","Warlock"],"oracleText":"At the beginning of combat on your turn, you may forage. (Exile three cards from your graveyard or sacrifice a Food.)\nWhenever you forage, put a +1/+1 counter on this creature.","power":"2","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Forage"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c911a759-ed7b-452b-88a3-663478357610.jpg?1783910798","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c911a759-ed7b-452b-88a3-663478357610.jpg?1783910798","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const flitter = (): CardDef => ({"oracleId":"9148f2cb-5594-463c-a21b-a67706ec46d1","name":"Flitterwing Nuisance","manaCost":"{U}","cmc":1,"typeLine":"Creature — Faerie Rogue","supertypes":[],"types":["Creature"],"subtypes":["Faerie","Rogue"],"oracleText":"Flying\nThis creature enters with a -1/-1 counter on it.\n{2}{U}, Remove a counter from this creature: Whenever a creature you control deals combat damage to a player or planeswalker this turn, draw a card.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad0f6536-5295-4835-8883-35d711dfe6de.jpg?1783904491","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad0f6536-5295-4835-8883-35d711dfe6de.jpg?1783904491","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const aether = (): CardDef => ({"oracleId":"9b1f0780-072a-4fe6-91d8-e546a8aaea20","name":"Rampaging Aetherhood","manaCost":"{4}{G}","cmc":5,"typeLine":"Creature — Snake Hydra","supertypes":[],"types":["Creature"],"subtypes":["Snake","Hydra"],"oracleText":"Trample, ward {2}\nAt the beginning of your upkeep, you get an amount of {E} (energy counters) equal to this creature's power. Then you may pay one or more {E}. If you do, put that many +1/+1 counters on this creature.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Trample","Ward"],"imageUrl":"https://cards.scryfall.io/normal/front/b/d/bd923b84-067b-4041-a0f8-e2083e0debe9.jpg?1783907749","artUrl":"https://cards.scryfall.io/art_crop/front/b/d/bd923b84-067b-4041-a0f8-e2083e0debe9.jpg?1783907749","commanderLegal":"legal","set":"drc","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const packleader = (): CardDef => ({"oracleId":"086a911f-9ed4-4260-ae46-58c9333b95f5","name":"Werewolf Pack Leader","manaCost":"{G}{G}","cmc":2,"typeLine":"Creature — Human Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"Pack tactics — Whenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, draw a card.\n{3}{G}: Until end of turn, this creature has base power and toughness 5/3, gains trample, and isn't a Human.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Pack tactics"],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e88e6b39-bb4d-4d69-8007-d42f31bcbc29.jpg?1783926452","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e88e6b39-bb4d-4d69-8007-d42f31bcbc29.jpg?1783926452","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const feed = (): CardDef => ({"oracleId":"c338eedb-9b70-4b77-b5d6-8ea74b7bea3e","name":"Feed the Cycle","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, forage or pay {B}. (To forage, exile three cards from your graveyard or sacrifice a Food.)\nDestroy target creature or planeswalker.","colors":["B"],"colorIdentity":["B"],"keywords":["Forage"],"imageUrl":"https://cards.scryfall.io/normal/front/7/e/7e017ff8-2936-4a1b-bece-00004cfbad06.jpg?1783910835","artUrl":"https://cards.scryfall.io/art_crop/front/7/e/7e017ff8-2936-4a1b-bece-00004cfbad06.jpg?1783910835","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const thornvault = (): CardDef => ({"oracleId":"7b18cfad-a1cf-46c2-bcdd-7762c13d50e5","name":"Thornvault Forager","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Squirrel Ranger","supertypes":[],"types":["Creature"],"subtypes":["Squirrel","Ranger"],"oracleText":"{T}: Add {G}.\n{T}, Forage: Add two mana in any combination of colors. (To forage, exile three cards from your graveyard or sacrifice a Food.)\n{3}{G}, {T}: Search your library for a Squirrel card, reveal it, put it into your hand, then shuffle.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Forage"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8c2d6b02-a453-40f9-992a-5c5542987cfb.jpg?1783910802","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8c2d6b02-a453-40f9-992a-5c5542987cfb.jpg?1783910802","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const tapper = card("Test Tapper", "Instant", "{U}", { oracleText: "Tap target creature." });
const draw = card("Test Draw", "Sorcery", "{U}", { oracleText: "Draw a card." });
const food = card("Test Food", "Artifact — Food", "{1}", { oracleText: "{2}, {T}, Sacrifice this artifact: You gain 3 life." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const pinger = card("Test Pinger", "Creature — Human", "{1}{R}", { power: "1", toughness: "1", oracleText: "{T}: Test Pinger deals 1 damage to any target." });
const sure = card("Test Sure Thing", "Instant", "{1}{R}", { oracleText: "This spell can't be countered.\nTest Sure Thing deals 1 damage to any target." });
const sliver = card("Test Sliver", "Creature — Sliver", "{1}{R}", { power: "3", toughness: "3", oracleText: "{T}: Test Sliver deals 2 damage to any target." });
const walker = card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { oracleText: "+1: Draw a card.", loyalty: "5" });

describe("round 248", () => {
  it("every card of the round compiles fully", () => {
    supported(hylda(), sharae(), sanctuary(), sentry(), glen(), chaos(), essence(), bushy(), treetop(), forager(), corpseberry(), flitter(), aether(), packleader());
  });

  it("Solitary Sanctuary: a creature of an opponent's you tap gets you a +1/+1 counter; not one they tap themselves, nor your own", () => {
    const { s: s0, ap, opp, ids } = setup([sanctuary(), tapper, tapper, draw]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    // Its enters ability taps one: that's a tap you did, so it triggers too.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { queue: [[tgt(theirs)], [tgt(mine)]] });
    expect(s.objects[theirs]).toMatchObject({ tapped: true });
    expect(s.objects[theirs]!.counters.stun).toBe(1);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    // Tapping another of theirs with a spell of yours: one more.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(other)])), { targets: [tgt(mine)] });
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
    // Tapping your own creature: nothing.
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(mine)])), { targets: [tgt(mine)] });
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
    // An opponent's spell tapping a creature isn't you tapping it (rulings: only an effect that instructs you to).
    const third = putOnBattlefield(s, opp, bear());
    const theirTapper = into(s, opp, tapper, "hand");
    s.players[opp]!.manaPool.U = 1;
    s = run(s, planCast(s, ap, ids[3]!));
    s = passTo(s, opp);
    s = settle(run(s, planCast(s, opp, theirTapper, [tgt(third)])), { targets: [tgt(mine)] });
    expect(s.objects[third]!.tapped).toBe(true);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
  });

  it("Icewrought Sentry: gets +2/+1 when you tap an opponent's creature, its attack trigger's tap included", () => {
    const { s: s0, ap, opp, ids } = setup([tapper]);
    const sentryId = putOnBattlefield(s0, ap, sentry());
    const theirs = putOnBattlefield(s0, opp, bear());
    expect(pt(s0, sentryId)).toBe("2/3");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    expect(pt(s, sentryId)).toBe("4/4");
    // Someone else's creature becoming tapped another way (attacking) doesn't count.
    const s1 = passUntil(s, "main1", opp);
    expect(pt(s1, sentryId)).toBe("2/3");
  });

  it("Sharae of Numbing Depths: draws once a turn when you tap one or more of your opponents' creatures", () => {
    const { s: s0, ap, opp, ids } = setup([sharae(), tapper]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(a)] });
    expect(s.objects[a]!.tapped).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1); // only once each turn
  });

  it("Hylda of the Icy Crown: pay {1} when you tap an opponent's creature, then choose a mode", () => {
    const { s: s0, ap, opp, ids } = setup([tapper]);
    putOnBattlefield(s0, ap, hylda());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    expect(s.pending?.kind).toBe("chooseMay");
    s.players[ap]!.manaPool.C = (s.players[ap]!.manaPool.C ?? 0) + 1;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseModes");
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [0] }));
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(tokens.length).toBe(1);
    expect(pt(s, tokens[0]!)).toBe("4/4");
    expect(characteristics(s, s.objects[tokens[0]!]!).subtypes).toContain("Elemental");
  });

  it("Glen Elendra's Answer: counters every spell and ability opponents control (not yours), a Faerie for each one countered", () => {
    const { s: s0, ap, opp, ids } = setup([glen(), draw]);
    const ping = putOnBattlefield(s0, opp, pinger);
    const theirShock = into(s0, opp, shock, "hand");
    const theirSure = into(s0, opp, sure, "hand");
    s0.players[opp]!.manaPool.R = 3;
    s0.players[opp]!.manaPool.C = 1;
    let s = run(s0, planCast(s0, ap, ids[1]!));
    s = passTo(s, opp);
    s = run(s, planCast(s, opp, theirShock, [{ kind: "player", id: ap }]));
    s = run(s, planCast(s, opp, theirSure, [{ kind: "player", id: ap }]));
    s = run(s, planActivate(s, opp, ping, 0, [{ kind: "player", id: ap }]));
    expect(s.stack.length).toBe(4);
    s = passTo(s, ap);
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Glen resolves first: the shock and the ping are countered, Test Sure Thing can't be.
    s = passTo(s, ap);
    expect(s.objects[theirShock]!.zone).toBe("graveyard");
    expect(s.stack.length).toBe(2);
    const faeries = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(faeries.length).toBe(2);
    expect(faeries.every((id) => pt(s, id) === "1/1" && characteristics(s, s.objects[id]!).keywords.includes("Flying"))).toBe(true);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 1); // only Test Sure Thing's damage
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard"); // your own spell resolved
  });

  it("Planar Chaos: the caster flips; a lost flip counters the spell, a won one doesn't", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed < 40 && outcomes.size < 2; seed++) {
      const { s: s0, ap, ids } = setup([bear()]);
      putOnBattlefield(s0, ap, chaos());
      s0.rngState = seed * 7919;
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      const flip = s.log.map((l) => (typeof l === "string" ? l : (l as { text?: string }).text ?? "")).reverse().find((l) => /flips a coin/.test(l)) ?? "";
      expect(flip.startsWith(`${s.players[ap]!.name} flips a coin`)).toBe(true);
      const lost = /loses the flip/.test(flip);
      expect(s.objects[ids[0]!]!.zone).toBe(lost ? "graveyard" : "battlefield");
      outcomes.add(lost ? "lost" : "won");
    }
    expect(outcomes.size).toBe(2);
  });

  it("Essence Sliver: any Sliver's controller gains the damage it deals, combat or not; other creatures don't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, essence());
    const mine = putOnBattlefield(s0, ap, sliver);
    const theirs = putOnBattlefield(s0, opp, sliver);
    const ping = putOnBattlefield(s0, ap, pinger);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planActivate(s0, ap, mine, 0, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.life).toBe(life + 2);
    s = settle(run(s, planActivate(s, ap, ping, 0, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.life).toBe(life + 2);
    // Their Sliver's combat damage: its controller gains it.
    s = passUntil(s, "declareAttackers", opp);
    const theirLife = s.players[opp]!.life;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] });
    for (let i = 0; i < 60 && s.step !== "endCombat" && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[ap]!.life).toBe(life + 2 - 3);
    expect(s.players[opp]!.life).toBe(theirLife + 3);
  });
  it("Treetop Sentries: forage as it enters (three graveyard cards or a Food, as you choose), then draw; with neither, no forage", () => {
    const { s: s0, ap, ids } = setup([treetop(), treetop()]);
    const cards = [0, 1, 2, 3].map(() => into(s0, ap, bear(), "graveyard"));
    const f = putOnBattlefield(s0, ap, food);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    // Both ways can be done: the choice of way.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either" });
    expect((s.pending as { labels: string[] }).labels).toEqual(["Exile three cards from your graveyard", "Sacrifice a Food"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    expect(s.pending?.kind).toBe("searchLibrary");
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: cards.slice(0, 3) }));
    expect(cards.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "graveyard"]);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[f]!.zone).toBe("battlefield");
    // The second: one graveyard card left, so only the Food can pay; it's sacrificed with no choice of way.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [f] }));
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Treetop Sentries: with fewer than three cards in your graveyard and no Food, you can't forage (rulings)", () => {
    const { s: s0, ap, ids } = setup([treetop()]);
    into(s0, ap, bear(), "graveyard");
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("Bushy Bodyguard: foraging puts two +1/+1 counters on it", () => {
    const { s: s0, ap, ids } = setup([bushy()]);
    const f = putOnBattlefield(s0, ap, food);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [f] }));
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(pt(s, ids[0]!)).toBe("4/3");
  });

  it("Curious Forager: when you forage, a reflexive trigger returns target permanent card from your graveyard", () => {
    const { s: s0, ap, ids } = setup([forager()]);
    const f = putOnBattlefield(s0, ap, food);
    const back = into(s0, ap, food, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { targets: [tgt(back)] });
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [f] }), { targets: [tgt(back)] });
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(s.objects[back]!.zone).toBe("hand");
  });

  it("Corpseberry Cultivator: may forage at the beginning of your combat; a counter whenever you forage, as a cost too", () => {
    const { s: s0, ap, ids } = setup([feed()]);
    const c = putOnBattlefield(s0, ap, corpseberry());
    const cards = [0, 1, 2].map(() => into(s0, ap, bear(), "graveyard"));
    const f = putOnBattlefield(s0, ap, food);
    const victim = putOnBattlefield(s0, s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!, bear());
    // Feed the Cycle's additional cost, paid by foraging (sacrificing the Food).
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)], undefined, "auto", undefined, { costOr: 0, sacrifice: [f] })));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.objects[c]!.counters["+1/+1"]).toBe(1);
    s = passUntil(s, "beginCombat");
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: cards }));
    expect(cards.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(2);
  });

  it("Flitterwing Nuisance: for the turn, each creature of yours dealing combat damage to a player or planeswalker draws you a card", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, flitter());
    s0.objects[n]!.counters["-1/-1"] = 1;
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const w = putOnBattlefield(s0, opp, walker);
    s0.objects[w]!.counters.loyalty = 5;
    let s = settle(run(s0, planActivate(s0, ap, n, 0, undefined, undefined, undefined, undefined, { counters: [{ id: n, kind: "-1/-1" }] })));
    expect(s.objects[n]!.counters["-1/-1"] ?? 0).toBe(0);
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp, planeswalker: w }] });
    for (let i = 0; i < 80 && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[w]!.counters.loyalty).toBe(3);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Rampaging Aetherhood: energy equal to its power at your upkeep, then pay one or more for that many +1/+1 counters", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, aether());
    let s = passUntil(s0, "upkeep", ap, 4000);
    s = settle(s);
    expect(s.players[ap]!.energy).toBe(4);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payEnergy", numberRange: { max: 4 } });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }));
    expect(s.players[ap]!.energy).toBe(1);
    expect(s.objects[r]!.counters["+1/+1"]).toBe(3);
  });

  it("Werewolf Pack Leader: {3}{G} makes it a 5/3 with trample that isn't a Human until end of turn, still a Werewolf", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, packleader());
    const idx = abilitiesOf(s0, s0.objects[w]!).activated.findIndex((a) => /5\/3/.test(a.text));
    const s = settle(run(s0, planActivate(s0, ap, w, idx)));
    expect(pt(s, w)).toBe("5/3");
    const c = characteristics(s, s.objects[w]!);
    expect(c.subtypes).not.toContain("Human");
    expect(c.subtypes).toContain("Werewolf");
    expect(c.keywords).toContain("Trample");
    const later = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(characteristics(later, later.objects[w]!).subtypes).toContain("Human");
    expect(pt(later, w)).toBe("3/3");
  });
});

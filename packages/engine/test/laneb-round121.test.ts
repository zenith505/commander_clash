// Lane B round B121: Flagbearers (Coalition Honor Guard, Standard Bearer, Coalition Flag: an opponent choosing targets
// for a spell or ability they cast or activate must choose a Flagbearer if able), Reflect Damage (the next damage from a
// source of your choice is dealt to that source's controller), Lava Burst (damage to a creature can't be prevented or
// redirected), Ascent of the Worthy (damage to creatures you control is dealt to the chosen one until your next turn),
// Firestorm Phoenix (returns to hand instead of dying; can't be played until its owner's next turn), Vine Gecko (the
// first kicked spell each turn costs {1} less), Thaumaton Torpedo (costs {3} less after a Spacecraft attacked), Clear the
// Land (each player's top five: lands onto the battlefield tapped, the rest exiled), Chainer's Torment (III: an X/X token
// that deals X damage to you) and Keen-Eared Sentry (each opponent ventures at most once each turn).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { putCounters } from "../src/counters";
import { botActions, characteristics, chooseTargets, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const life = (s: GameState, p: PlayerId) => s.players[p]!.life;
const dmg = (s: GameState, id: string) => s.objects[id]!.damage ?? 0;
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana };
};
/** Moves a new card for `def` into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** The active player passes; the next player gets priority with this mana (the stack is empty). */
const giveOpp = (s: GameState, ap: PlayerId, opp: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s = act(s, { type: "passPriority", player: ap });
  expect(waitingOn(s)).toBe(opp);
  pool(s, opp, mana);
  return s;
};

// Real oracle text (Scryfall).
const reflect = (): CardDef => ({"oracleId":"21565b0d-f814-49ca-8613-f40040c4ba6c","name":"Reflect Damage","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"The next time a source of your choice would deal damage this turn, that damage is dealt to that source's controller instead.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const lava = (): CardDef => ({"oracleId":"f7be3da5-55b2-46f2-a5aa-277dee242b94","name":"Lava Burst","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Burst deals X damage to any target. If Lava Burst would deal damage to a creature, that damage can't be prevented or dealt instead to another permanent or player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const ascent = (): CardDef => ({"oracleId":"d748bad4-dd4c-4553-9fcc-e462260f6ff3","name":"Ascent of the Worthy","manaCost":"{1}{W}{B}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Choose a creature you control. Until your next turn, all damage that would be dealt to creatures you control is dealt to that creature instead.\nIII — Return target creature card from your graveyard to the battlefield with a flying counter on it. That creature is an Angel Warrior in addition to its other types.","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"commanderLegal":"legal","layout":"saga"}) as CardDef;
const honorGuard = (): CardDef => ({"oracleId":"c95cebf7-c28c-4453-b5e4-e895d621f290","name":"Coalition Honor Guard","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Human Flagbearer","supertypes":[],"types":["Creature"],"subtypes":["Human","Flagbearer"],"oracleText":"While an opponent is choosing targets as part of casting a spell they control or activating an ability they control, that player must choose at least one Flagbearer on the battlefield if able.","power":"2","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const bearer = (): CardDef => ({"oracleId":"1d6e9716-8c3c-443d-afd8-68d0d6c469a5","name":"Standard Bearer","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Flagbearer","supertypes":[],"types":["Creature"],"subtypes":["Human","Flagbearer"],"oracleText":"While an opponent is choosing targets as part of casting a spell they control or activating an ability they control, that player must choose at least one Flagbearer on the battlefield if able.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const flag = (): CardDef => ({"oracleId":"b45a0a2f-39fd-47b9-bc9d-3d4321b377d3","name":"Coalition Flag","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature you control\nEnchanted creature is a Flagbearer.\nWhile an opponent is choosing targets as part of casting a spell they control or activating an ability they control, that player must choose at least one Flagbearer on the battlefield if able.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const phoenix = (): CardDef => ({"oracleId":"5653b40f-c566-4a14-b188-a9268ea36218","name":"Firestorm Phoenix","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Phoenix","supertypes":[],"types":["Creature"],"subtypes":["Phoenix"],"oracleText":"Flying\nIf this creature would die, return it to its owner's hand instead. Until that player's next turn, that player plays with that card revealed in their hand and can't play it.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const gecko = (): CardDef => ({"oracleId":"a9596b05-e0bb-4e70-82fe-5db60f87bf3d","name":"Vine Gecko","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elemental Lizard","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Lizard"],"oracleText":"The first kicked spell you cast each turn costs {1} less to cast.\nWhenever you cast a kicked spell, put a +1/+1 counter on this creature.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const torpedo = (): CardDef => ({"oracleId":"9f9ae015-dc59-4ecb-a2bb-668496b48a48","name":"Thaumaton Torpedo","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{6}, {T}, Sacrifice this artifact: Destroy target nonland permanent. This ability costs {3} less to activate if you attacked with a Spacecraft this turn.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const clearLand = (): CardDef => ({"oracleId":"4604c729-8d2d-4b2b-a95c-5245563637e6","name":"Clear the Land","manaCost":"{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player reveals the top five cards of their library, puts all land cards revealed this way onto the battlefield tapped, and exiles the rest.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const torment = (): CardDef => ({"oracleId":"3c18113f-8d1e-4c63-a759-8cfc94e90876","name":"Chainer's Torment","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — This Saga deals 2 damage to each opponent and you gain 2 life.\nIII — Create an X/X black Nightmare Horror creature token, where X is half your life total, rounded up. It deals X damage to you.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"saga"}) as CardDef;
const sentry = (): CardDef => ({"oracleId":"a5575201-0d73-43c4-9290-940bbaefc61b","name":"Keen-Eared Sentry","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"You have hexproof. (You can't be the target of spells or abilities your opponents control.)\nEach opponent can't venture into the dungeon more than once each turn.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Venture into the dungeon"],"commanderLegal":"legal","layout":"normal"}) as CardDef;

// Test cards.
const shock = card("Test Shock", "Instant", "{0}", { colors: ["R"], oracleText: "Test Shock deals 3 damage to any target." });
const pinger = card("Test Pinger", "Creature — Human", "{1}{R}", { cmc: 2, power: "1", toughness: "1", colors: ["R"], oracleText: "{T}: Test Pinger deals 1 damage to any target." });
const growth = card("Test Growth", "Instant", "{0}", { colors: ["G"], oracleText: "Target creature gets +1/+1 until end of turn." });
const fog = card("Test Fog", "Instant", "{0}", { colors: ["W"], oracleText: "Prevent all damage that would be dealt to target creature this turn." });
const kicker = card("Test Kicker", "Instant", "{1}", { cmc: 1, colors: [], keywords: ["Kicker"], oracleText: "Kicker {1}\nDraw a card." });
const plain = card("Test Plain", "Instant", "{1}", { cmc: 1, oracleText: "Draw a card." });
const ship = card("Test Ship", "Artifact Creature — Spacecraft", "{2}", { cmc: 2, power: "2", toughness: "2" });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const ventureSpell = card("Test Delve", "Instant", "{0}", { oracleText: "Venture into the dungeon." });
const youFog = card("Test You Fog", "Instant", "{0}", { colors: ["W"], oracleText: "Prevent all damage that would be dealt to you this turn." });
const takeIt = card("Test Take It", "Instant", "{0}", { colors: ["W"], oracleText: "The next time a source of your choice would deal damage to target creature this turn, that damage is dealt to you instead." });
const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });

describe("Lane B round B121", () => {
  it("all the cards are supported", () =>
    supported(reflect(), lava(), ascent(), honorGuard(), bearer(), flag(), phoenix(), gecko(), torpedo(), clearLand(), torment(), sentry()));

  it("Standard Bearer: an opponent's spell must target a Flagbearer if able; its controller's spells needn't", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const sb = putOnBattlefield(s, opp, bearer());
    const b = putOnBattlefield(s, opp, bear());
    const sh = inHand(s, ap, shock);
    const sh2 = inHand(s, opp, shock);
    // Ken can't shock the Bear, nor a player, while the Bearer can be targeted.
    expect(planCast(s, ap, sh, [tgt(b)])).toBeNull();
    expect(planCast(s, ap, sh, [player(opp)])).toBeNull();
    s = settle(run(s, planCast(s, ap, sh, [tgt(sb)])));
    expect(zone(s, sb)).toBe("graveyard");
    // With no Flagbearer left, anything goes.
    const sb2 = putOnBattlefield(s, opp, bearer());
    s = giveOpp(s, ap, opp, {});
    // The Bearer's controller isn't bound by it.
    s = settle(run(s, planCast(s, opp, sh2, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, sb2)).toBe("battlefield");
  });

  it("Coalition Honor Guard: activated abilities are bound too; a Flagbearer that can't be targeted doesn't bind", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const hg = putOnBattlefield(s, opp, honorGuard());
    const p = putOnBattlefield(s, ap, pinger);
    const g = inHand(s, ap, growth);
    expect(planActivate(s, ap, p, 0, [player(opp)])).toBeNull();
    // Ken's own creature is a legal target, but the Honor Guard must be chosen: a pump spell has to go on it too.
    expect(planCast(s, ap, g, [tgt(p)])).toBeNull();
    s = settle(run(s, planCast(s, ap, g, [tgt(hg)])));
    expect(characteristics(s, s.objects[hg]!).power).toBe(3);
    // A Flagbearer with hexproof can't be chosen, so it doesn't bind (CR rulings: "if able").
    s.objects[hg]!.tapped = false;
    const ward = card("Test Hexproof", "Enchantment — Aura", "{0}", { oracleText: "Enchant creature\nEnchanted creature has hexproof." });
    const a = putOnBattlefield(s, opp, ward);
    s.objects[a]!.attachedTo = hg;
    invalidateCharacteristics(s);
    s = settle(run(s, planActivate(s, ap, p, 0, [player(opp)])));
    expect(life(s, opp)).toBe(39);
  });

  it("Flagbearers don't bind triggered abilities", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, opp, bearer());
    const b = putOnBattlefield(s, opp, bear());
    const trig = card("Test Trigger", "Creature — Elf", "{0}", { power: "1", toughness: "1", oracleText: "When this creature enters, it deals 2 damage to target creature." });
    const t = inHand(s, ap, trig);
    s = settle(run(s, planCast(s, ap, t)), { me: [ap] });
    // The trigger can target the Bear: the Flagbearer rule is only about casting and activating.
    const p = s.pending!;
    expect(p.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] } as Action);
    s = settle(s);
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Coalition Flag: the enchanted creature is a Flagbearer, and the Flag binds its controller's opponents", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const b = putOnBattlefield(s, opp, bear());
    const o = putOnBattlefield(s, opp, ogre);
    const f = putOnBattlefield(s, opp, flag());
    s.objects[f]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[b]!).subtypes).toContain("Flagbearer");
    const sh = inHand(s, ap, shock);
    expect(planCast(s, ap, sh, [tgt(o)])).toBeNull();
    s = settle(run(s, planCast(s, ap, sh, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
  });

  it("a bot aims its removal at an opponent's Flagbearer, and its pump spell at its own", () => {
    const { s, ap } = setup([]);
    const opp = next(s, ap);
    const sb = putOnBattlefield(s, ap, bearer());
    putOnBattlefield(s, ap, ogre);
    putOnBattlefield(s, opp, bear());
    // Ken's Bearer binds the bot: its Shock goes at the Bearer, and a pump spell at the Bearer too (the only Flagbearer).
    expect(chooseTargets(s, opp, compileCard(shock).spell!)).toEqual([tgt(sb)]);
    expect(chooseTargets(s, opp, compileCard(growth).spell!)).toEqual([tgt(sb)]);
    // The bot's own Flagbearer is the pick for its pump spell.
    const own = putOnBattlefield(s, opp, bearer());
    invalidateCharacteristics(s);
    expect(chooseTargets(s, opp, compileCard(growth).spell!)).toEqual([tgt(own)]);
    expect(chooseTargets(s, opp, compileCard(shock).spell!)).toEqual([tgt(sb)]);
  });

  it("Reflect Damage: the next damage the chosen source would deal this turn is dealt to its controller", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const p = putOnBattlefield(s, ap, pinger);
    const b = putOnBattlefield(s, opp, bear());
    const rd = inHand(s, opp, reflect());
    s = giveOpp(s, ap, opp, { R: 1, W: 1, C: 3 });
    s = settle(run(s, planCast(s, opp, rd)), { me: [opp] });
    const q = s.pending!;
    expect(q.kind === "chooseOption" && q.what).toBe("damageSource");
    const key = (q as { options: string[] }).options.find((k) => k.startsWith(`${p}@`))!;
    s = settle(act(s, { type: "chooseOption", player: opp, choice: key }));
    const before = life(s, ap);
    s = settle(run(s, planActivate(s, ap, p, 0, [tgt(b)])));
    expect(dmg(s, b)).toBe(0);
    expect(life(s, ap)).toBe(before - 1);
    // Only the next time.
    s.objects[p]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, p, 0, [tgt(b)])));
    expect(dmg(s, b)).toBe(1);
  });

  it("Lava Burst: damage to a creature ignores prevention and redirection; damage to a player can be prevented", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const o = putOnBattlefield(s, opp, ogre);
    const lb = inHand(s, ap, lava());
    const fg = inHand(s, opp, fog);
    s = giveOpp(s, ap, opp, {});
    s = settle(run(s, planCast(s, opp, fg, [tgt(o)])));
    s = settle(run(s, planCast(s, ap, lb, [tgt(o)], undefined, "auto", 3)));
    expect(zone(s, o)).toBe("graveyard");
    // Prevention of damage to a player still works.
    const lb2 = inHand(s, ap, lava());
    const shield = inHand(s, opp, youFog);
    s = giveOpp(s, ap, opp, {});
    s = settle(run(s, planCast(s, opp, shield)));
    const before = life(s, opp);
    s = settle(run(s, planCast(s, ap, lb2, [player(opp)], undefined, "auto", 3)));
    expect(life(s, opp)).toBe(before);
  });

  it("Lava Burst: damage to a creature can't be dealt instead to a player", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const o = putOnBattlefield(s, opp, ogre);
    const lb = inHand(s, ap, lava());
    const take = inHand(s, opp, takeIt);
    const before = life(s, opp);
    // In response to Lava Burst, the opponent tries to take its damage themselves.
    s = run(s, planCast(s, ap, lb, [tgt(o)], undefined, "auto", 3));
    s = giveOpp(s, ap, opp, {});
    s = run(s, planCast(s, opp, take, [tgt(o)]));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("damageSource");
    const key = (s.pending as { options: string[] }).options.find((k) => k.startsWith(`${lb}@`))!;
    expect(key).toBeTruthy();
    s = settle(act(s, { type: "chooseOption", player: opp, choice: key }));
    expect(zone(s, o)).toBe("graveyard");
    expect(life(s, opp)).toBe(before);
  });

  it("Ascent of the Worthy: damage to creatures you control goes to the chosen one until your next turn, but not Lava Burst's", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const keeper = putOnBattlefield(s, ap, ogre);
    const b = putOnBattlefield(s, ap, bear());
    const saga = putOnBattlefield(s, ap, ascent());
    s.objects[saga]!.counters.lore = 0;
    putCounters(s, s.objects[saga]!, "lore", 1);
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, source: "Ascent of the Worthy" });
    s = act(s, { type: "pickPermanents", player: ap, ids: [keeper] });
    s = settle(s);
    const p = putOnBattlefield(s, opp, pinger);
    // On the opponent's turn the Bear's damage is dealt to the Ogre.
    s = passUntil(s, "main1", opp);
    s = settle(run(s, planActivate(s, opp, p, 0, [tgt(b)])));
    expect(dmg(s, b)).toBe(0);
    expect(dmg(s, keeper)).toBe(1);
    // Lava Burst's damage can't be dealt instead to another permanent.
    const lb = inHand(s, opp, lava());
    pool(s, opp, { R: 1, C: 2 });
    s = settle(run(s, planCast(s, opp, lb, [tgt(b)], undefined, "auto", 2)));
    expect(zone(s, b)).toBe("graveyard");
    expect(dmg(s, keeper)).toBe(1);
    // It ends as Ken's next turn begins.
    s = passUntil(s, "main1", ap);
    const b2 = putOnBattlefield(s, ap, bear());
    const sh = inHand(s, ap, shock);
    s = settle(run(s, planCast(s, ap, sh, [tgt(b2)])));
    expect(zone(s, b2)).toBe("graveyard");
  });

  it("Firestorm Phoenix: returns to its owner's hand instead of dying, and can't be cast until that player's next turn", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const ph = putOnBattlefield(s, opp, phoenix());
    const sh = inHand(s, ap, shock);
    s = settle(run(s, planCast(s, ap, sh, [tgt(ph)])));
    expect(zone(s, ph)).toBe("hand");
    s = giveOpp(s, ap, opp, { R: 2, C: 4 });
    expect(planCast(s, opp, ph)).toBeNull();
    s = settle(s);
    s = passUntil(s, "main1", opp);
    pool(s, opp, { R: 2, C: 4 });
    s = settle(run(s, planCast(s, opp, ph)));
    expect(zone(s, ph)).toBe("battlefield");
  });

  it("Vine Gecko: the first kicked spell you cast each turn costs {1} less; unkicked spells don't use it up", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gecko());
    const p1 = inHand(s, ap, plain);
    const k1 = inHand(s, ap, kicker);
    const k2 = inHand(s, ap, kicker);
    // An unkicked spell costs its full {1}.
    poolOnly(s, ap, { C: 0 });
    expect(planCast(s, ap, p1)).toBeNull();
    poolOnly(s, ap, { C: 1 });
    s = settle(run(s, planCast(s, ap, p1)));
    // The first kicked spell costs {1}{1} - {1}.
    poolOnly(s, ap, { C: 1 });
    s = settle(run(s, planCast(s, ap, k1, undefined, undefined, "auto", undefined, { kicks: [0] })));
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
    // The second one costs {2}.
    poolOnly(s, ap, { C: 1 });
    expect(planCast(s, ap, k2, undefined, undefined, "auto", undefined, { kicks: [0] })).toBeNull();
    poolOnly(s, ap, { C: 2 });
    s = settle(run(s, planCast(s, ap, k2, undefined, undefined, "auto", undefined, { kicks: [0] })));
    expect(s.objects[g]!.counters["+1/+1"]).toBe(2);
  });

  it("Thaumaton Torpedo: costs {3} less to activate after you attacked with a Spacecraft this turn", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const t = putOnBattlefield(s, ap, torpedo());
    const sp = putOnBattlefield(s, ap, ship);
    const r = putOnBattlefield(s, opp, rock);
    poolOnly(s, ap, { C: 3 });
    s.objects[t]!.tapped = false;
    expect(planActivate(s, ap, t, 0, [tgt(r)])).toBeNull();
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sp, defender: opp }] });
    s = passUntil(s, "main2", ap);
    poolOnly(s, ap, { C: 3 });
    s.objects[t]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, t, 0, [tgt(r)])));
    expect(zone(s, r)).toBe("graveyard");
    expect(zone(s, t)).toBe("graveyard");
  });

  it("Thaumaton Torpedo: attacking with a creature that isn't a Spacecraft doesn't count", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const t = putOnBattlefield(s, ap, torpedo());
    const b = putOnBattlefield(s, ap, bear());
    const r = putOnBattlefield(s, opp, rock);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = passUntil(s, "main2", ap);
    poolOnly(s, ap, { C: 3 });
    s.objects[t]!.tapped = false;
    expect(planActivate(s, ap, t, 0, [tgt(r)])).toBeNull();
  });

  it("Clear the Land: each player puts the lands among their top five onto the battlefield tapped and exiles the rest", () => {
    let { s, ap } = setup([]);
    const cl = inHand(s, ap, clearLand());
    const tops: Record<PlayerId, ObjectId[]> = {};
    for (const pid of s.turnOrder) {
      const p = s.players[pid]!;
      // Top five: Forest, Bear, Forest, Bear, Bear.
      tops[pid] = [bear(), bear(), card("Test Wastes", "Land"), bear(), card("Test Wastes", "Land")].map((d) => onTop(s, pid, d)).reverse();
      expect(p.library[0]).toBe(tops[pid]![0]);
    }
    const sixth = Object.fromEntries(s.turnOrder.map((pid) => [pid, s.players[pid]!.library[5]!]));
    s = settle(run(s, planCast(s, ap, cl)), { me: [] });
    for (const pid of s.turnOrder) {
      const [l1, c1, l2, c2, c3] = tops[pid]!;
      for (const l of [l1!, l2!]) {
        expect(zone(s, l)).toBe("battlefield");
        expect(s.objects[l]!.tapped).toBe(true);
        expect(s.objects[l]!.controller).toBe(pid);
      }
      for (const c of [c1!, c2!, c3!]) expect(zone(s, c)).toBe("exile");
      expect(s.players[pid]!.library[0]).toBe(sixth[pid]);
    }
  });

  it("Chainer's Torment: I and II drain each opponent for 2; III makes an X/X that deals X damage to you", () => {
    let { s, ap } = setup([]);
    const opps = s.turnOrder.filter((p) => p !== ap);
    const saga = putOnBattlefield(s, ap, torment());
    s.objects[saga]!.counters.lore = 0;
    putCounters(s, s.objects[saga]!, "lore", 1);
    s = settle(s);
    for (const o of opps) expect(life(s, o)).toBe(38);
    expect(life(s, ap)).toBe(42);
    s.players[ap]!.life = 13;
    s.objects[saga]!.counters.lore = 2;
    putCounters(s, s.objects[saga]!, "lore", 1);
    s = settle(s);
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)!;
    expect(characteristics(s, s.objects[tok]!).name).toMatch(/Nightmare Horror/);
    // Half of 13, rounded up: a 7/7 that deals 7 damage to you.
    expect(characteristics(s, s.objects[tok]!).power).toBe(7);
    expect(characteristics(s, s.objects[tok]!).toughness).toBe(7);
    expect(life(s, ap)).toBe(6);
    expect(zone(s, saga)).toBe("graveyard");
  });

  it("Keen-Eared Sentry: each opponent can't venture more than once each turn; its controller can", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, opp, sentry());
    const v1 = inHand(s, ap, ventureSpell);
    const v2 = inHand(s, ap, ventureSpell);
    s = settle(run(s, planCast(s, ap, v1)));
    const first = s.players[ap]!.dungeon;
    expect(first).toBeTruthy();
    s = settle(run(s, planCast(s, ap, v2)));
    expect(s.players[ap]!.dungeon).toEqual(first);
    // The Sentry's controller ventures as often as they like.
    const w1 = inHand(s, opp, ventureSpell);
    const w2 = inHand(s, opp, ventureSpell);
    s = giveOpp(s, ap, opp, {});
    s = settle(run(s, planCast(s, opp, w1)));
    const r1 = s.players[opp]!.dungeon!.room;
    s = giveOpp(s, ap, opp, {});
    s = settle(run(s, planCast(s, opp, w2)));
    expect(s.players[opp]!.dungeon!.room).not.toBe(r1);
    // Next turn Ken may venture again, once.
    s = settle(s);
    s = passUntil(s, "main1", opp);
    const v3 = inHand(s, ap, ventureSpell);
    const v4 = inHand(s, ap, ventureSpell);
    s = act(s, { type: "passPriority", player: opp });
    s = act(s, { type: "passPriority", player: next(s, opp) });
    s = act(s, { type: "passPriority", player: next(s, opp, 2) });
    expect(waitingOn(s)).toBe(ap);
    s = settle(run(s, planCast(s, ap, v3)));
    const second = s.players[ap]!.dungeon!;
    expect(second.room).not.toBe(first!.room);
    s = act(s, { type: "passPriority", player: opp });
    s = act(s, { type: "passPriority", player: next(s, opp) });
    s = act(s, { type: "passPriority", player: next(s, opp, 2) });
    s = settle(run(s, planCast(s, ap, v4)));
    expect(s.players[ap]!.dungeon).toEqual(second);
  });
});


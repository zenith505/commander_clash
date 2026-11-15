// Lane B round B218: Bishop of Binding (a Vampire gets +X/+X, X the power of the card its enters ability exiled), Fugitive
// Codebreaker (its disguise cost reduced by {1} for each instant and sorcery card in your graveyard), Conundrum Sphinx (each
// player names a card, then reveals their top card: into their hand if it has that name, otherwise to the bottom) and
// Mirror of Fate (up to seven face-up exiled cards you own on top of your library, the rest of the library exiled).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, faceUpCost, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const bishopOfBinding = (): CardDef => ({"oracleId":"c2dd6c78-e482-4a3c-ad9c-7dd71b3e34d2","name":"Bishop of Binding","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Vampire Cleric","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Cleric"],"oracleText":"When this creature enters, exile target creature an opponent controls until this creature leaves the battlefield.\nWhenever this creature attacks, target Vampire gets +X/+X until end of turn, where X is the power of the exiled card.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/a/aaadceb3-8a57-45de-b3f1-aca94f20de18.jpg?1783935342","artUrl":"https://cards.scryfall.io/art_crop/front/a/a/aaadceb3-8a57-45de-b3f1-aca94f20de18.jpg?1783935342","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fugitiveCodebreaker = (): CardDef => ({"oracleId":"af2b36ee-2945-41d3-a186-8fd28f3cde16","name":"Fugitive Codebreaker","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Rogue","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Rogue"],"oracleText":"Prowess, haste\nDisguise {5}{R}. This cost is reduced by {1} for each instant and sorcery card in your graveyard. (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)\nWhen this creature is turned face up, discard your hand, then draw three cards.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Prowess","Haste","Disguise"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3cbb3378-291c-4de6-be98-dd09daa3b828.jpg?1783912792","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3cbb3378-291c-4de6-be98-dd09daa3b828.jpg?1783912792","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const conundrumSphinx = (): CardDef => ({"oracleId":"fb1bd39c-c870-4f63-9e4f-32c94ac46555","name":"Conundrum Sphinx","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying\nWhenever this creature attacks, each player chooses a card name. Then each player reveals the top card of their library. If the card a player revealed has the name they chose, that player puts it into their hand. If it doesn't, that player puts it on the bottom of their library.","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1aa1afb9-a2e5-44a1-b2f1-9de75efbbe93.jpg?1783941826","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1aa1afb9-a2e5-44a1-b2f1-9de75efbbe93.jpg?1783941826","commanderLegal":"legal","set":"m11","releasedAt":"2010-07-16","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mirrorOfFate = (): CardDef => ({"oracleId":"38ffe614-e8f7-4625-b921-9409e7e7ee5b","name":"Mirror of Fate","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Sacrifice this artifact: Choose up to seven face-up exiled cards you own. Exile all the cards from your library, then put the chosen cards on top of your library.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08b480c8-d899-4e63-b0e2-f4bec3a3ca4f.jpg?1783942356","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08b480c8-d899-4e63-b0e2-f4bec3a3ca4f.jpg?1783942356","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vampireNighthawk = (): CardDef => ({"oracleId":"feb244f8-bcb1-44cf-9940-2719221a7309","name":"Vampire Nighthawk","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const smugglersCopter = (): CardDef => ({"oracleId":"49136bdc-bc50-49a2-999a-1ef9c16ea130","name":"Smuggler's Copter","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Flying","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const swordsToPlowshares = (): CardDef => ({"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","commanderLegal":"legal","set":"sld","releasedAt":"2026-09-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const card = (id: string): TargetChoice => ({ kind: "object", id });
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile", top = false) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  const p = s.players[pid]!;
  if (where === "library") {
    if (top) p.library.unshift(id);
    else p.library.push(id);
  } else p[where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Declares `attackers` for `pid` against `defender` and goes to the point the attack triggers wait on. */
const attack = (s0: GameState, pid: PlayerId, attackers: string[], defender: PlayerId) => {
  let s = passUntil(s0, "declareAttackers", pid);
  s = act(s, { type: "declareAttackers", player: pid, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  return s;
};

describe("Lane B round B218", () => {
  it("are fully supported", () => {
    supported(bishopOfBinding(), fugitiveCodebreaker(), conundrumSphinx(), mirrorOfFate());
  });

  it("Bishop of Binding: exiles an opponent's creature until it leaves; attacking, a Vampire gets +X/+X for that card's power, kept", () => {
    const { s: s0, ap, opp, ids } = setup([bishopOfBinding()]);
    const giant = putOnBattlefield(s0, opp, crawWurm());
    const hawk = putOnBattlefield(s0, ap, vampireNighthawk());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, [ap]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [card(giant)] }), [ap]);
    expect(zone(s, giant)).toBe("exile");
    // Next turn of ours: the Bishop attacks and the Nighthawk gets +6/+6.
    for (let i = 0; i < 4; i++) s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(s.activePlayer) + 1) % 4]!);
    expect(s.activePlayer).toBe(ap);
    s = attack(s, ap, [ids[0]!], opp);
    s = settle(s, [ap]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [card(hawk)] }), [ap]);
    expect(power(s, s.objects[hawk]!)).toBe(8);
    expect(toughness(s, s.objects[hawk]!)).toBe(9);
  });

  it("Bishop of Binding: X is counted as the attack trigger resolves, 0 once the Bishop has left and the card is back", () => {
    const { s: s0, ap, opp } = setup([lightningBolt()]);
    const bishop = putOnBattlefield(s0, ap, bishopOfBinding());
    const giant = toZone(s0, opp, hillGiant(), "exile");
    s0.linkedExile = { ...s0.linkedExile, [`${bishop}@${s0.objects[bishop]!.zoneChanges ?? 0}`]: [{ id: giant, zc: s0.objects[giant]!.zoneChanges ?? 0 }] };
    const hawk = putOnBattlefield(s0, ap, vampireNighthawk());
    let s = settle(attack(s0, ap, [bishop], opp), [ap]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [card(hawk)] });
    // In response, the Bishop is bolted: X is 0 as the trigger resolves (rulings).
    const bolt = s.players[ap]!.hand[s.players[ap]!.hand.length - 1]!;
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, ap, bolt, [card(bishop)]));
    s = settle(s, [ap]);
    expect(zone(s, bishop)).toBe("graveyard");
    expect(power(s, s.objects[hawk]!)).toBe(2);
  });

  it("Bishop of Binding: a Vehicle card exiled with it counts its printed power (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const bishop = putOnBattlefield(s0, ap, bishopOfBinding());
    const copter = toZone(s0, opp, smugglersCopter(), "exile");
    s0.linkedExile = { ...s0.linkedExile, [`${bishop}@${s0.objects[bishop]!.zoneChanges ?? 0}`]: [{ id: copter, zc: s0.objects[copter]!.zoneChanges ?? 0 }] };
    let s = settle(attack(s0, ap, [bishop], opp), [ap]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [card(bishop)] }), [ap]);
    expect(power(s, s.objects[bishop]!)).toBe(4);
  });

  it("Fugitive Codebreaker: its disguise cost is {1} less for each instant and sorcery card in your graveyard, never less than {R}", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fugitiveCodebreaker());
    s0.objects[f]!.faceDown = "disguise";
    invalidateCharacteristics(s0);
    expect(faceUpCost(s0, s0.objects[f]!)?.cost).toBe("{5}{R}");
    toZone(s0, ap, lightningBolt(), "graveyard");
    toZone(s0, ap, divination(), "graveyard");
    toZone(s0, ap, hillGiant(), "graveyard");
    expect(faceUpCost(s0, s0.objects[f]!)?.cost).toBe("{3}{R}");
    for (let i = 0; i < 4; i++) toZone(s0, ap, divination(), "graveyard");
    expect(faceUpCost(s0, s0.objects[f]!)?.cost).toBe("{R}");
  });

  it("Fugitive Codebreaker: turned face up for the reduced cost, you discard your hand and draw three cards", () => {
    const { s: s0, ap } = setup([hillGiant(), grizzlyBears()]);
    const f = putOnBattlefield(s0, ap, fugitiveCodebreaker());
    s0.objects[f]!.faceDown = "disguise";
    for (let i = 0; i < 5; i++) toZone(s0, ap, lightningBolt(), "graveyard");
    invalidateCharacteristics(s0);
    const hand = [...s0.players[ap]!.hand];
    let s = run(s0, planTurnFaceUp(s0, ap, f));
    s = settle(s, [ap]);
    expect(s.objects[f]!.faceDown).toBeFalsy();
    for (const id of hand) expect(zone(s, id)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(3);
    // Five Bolts in the graveyard: only {R} was paid, one land tapped.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped).length).toBe(1);
  });

  it("Conundrum Sphinx: every player names a card first, then each reveals: the named card into its owner's hand, any other to the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    const sphinx = putOnBattlefield(s0, ap, conundrumSphinx());
    const mine = toZone(s0, ap, hillGiant(), "library", true);
    const theirs = toZone(s0, opp, crawWurm(), "library", true);
    let s = settle(attack(s0, ap, [sphinx], opp), [ap]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName", purpose: "guess" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Hill Giant" });
    // The others are asked next, in turn order, before anything is revealed.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "cardName" });
    expect(s.players[ap]!.library[0]).toBe(mine);
    s = settle(s, [ap]);
    expect(zone(s, mine)).toBe("hand");
    // The bot named its most common card (Forest): its Craw Wurm goes to the bottom.
    expect(s.players[opp]!.library.at(-1)).toBe(theirs);
    expect(s.players[opp]!.library[0]).not.toBe(theirs);
  });

  it("Conundrum Sphinx: a wrong name sends your own top card to the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    const sphinx = putOnBattlefield(s0, ap, conundrumSphinx());
    const mine = toZone(s0, ap, hillGiant(), "library", true);
    let s = settle(attack(s0, ap, [sphinx], opp), [ap]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" }), [ap]);
    expect(s.players[ap]!.library.at(-1)).toBe(mine);
    expect(zone(s, mine)).toBe("library");
  });

  it("Mirror of Fate: up to seven face-up exiled cards you own go on top in your order; the rest of your library is exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const mirror = putOnBattlefield(s0, ap, mirrorOfFate());
    const giant = toZone(s0, ap, hillGiant(), "exile");
    const wurm = toZone(s0, ap, crawWurm(), "exile");
    const hidden = toZone(s0, ap, divination(), "exile");
    s0.objects[hidden]!.hiddenExile = { by: mirror, seen: [ap], label: "Face down" };
    const theirs = toZone(s0, opp, grizzlyBears(), "exile");
    const library = [...s0.players[ap]!.library];
    let s = run(s0, planActivate(s0, ap, mirror, 0));
    s = settle(s, [ap]);
    expect(zone(s, mirror)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([giant, wurm].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [giant, wurm] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "order" });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [wurm, giant], away: [] }), [ap]);
    expect(s.players[ap]!.library).toEqual([wurm, giant]);
    for (const id of library) expect(zone(s, id)).toBe("exile");
    expect(zone(s, hidden)).toBe("exile");
    expect(zone(s, theirs)).toBe("exile");
  });

  it("Mirror of Fate: choosing none leaves an empty library; bots don't activate it", () => {
    const { s: s0, ap } = setup([]);
    const mirror = putOnBattlefield(s0, ap, mirrorOfFate());
    toZone(s0, ap, hillGiant(), "exile");
    expect(botActions(s0, ap).some((a) => a.type === "activateAbility" && a.objectId === mirror)).toBe(false);
    let s = settle(run(s0, planActivate(s0, ap, mirror, 0)), [ap]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), [ap]);
    expect(s.players[ap]!.library).toEqual([]);
  });
});

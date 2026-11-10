// Lane B round B170: milled creature cards put onto the battlefield with haste and returned at the next end step (Random
// Encounter; CR 400.7, 603.7c), a token copy of the creature card just exiled from your graveyard (Mordor on the March;
// CR 707.2, rulings), a bargained "instead ... and you scry 1" and exile for a permanent the spell damaged (Torch the Tower;
// CR 702.166b, 614.1a, rulings), a delayed trigger at the next main phase this turn counting the players dealt combat
// damage (Vivien's Stampede; CR 603.7), a creature sacrificed during resolution returned with counters (Heart-Shaped Herb;
// CR 400.7, 614.1c), each player revealing creature cards for Bears (Kamahl's Summons; CR 101.4), and a look that takes
// two cards if you gained life this turn (Follow the Lumarets), and the colors among your permanents and the spells you've
// cast this turn (First Family).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const encounter = (): CardDef => ({"oracleId":"324493fc-a205-4177-aa94-cf4672844c81","name":"Random Encounter","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Shuffle your library, then mill four cards. Put each creature card milled this way onto the battlefield. They gain haste. At the beginning of the next end step, return those creatures to their owner's hand.\nFlashback {6}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Flashback","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/3/6/3618e283-2df9-4eb9-97b0-96b55ee31cc0.jpg?1783906600","artUrl":"https://cards.scryfall.io/art_crop/front/3/6/3618e283-2df9-4eb9-97b0-96b55ee31cc0.jpg?1783906600","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mordor = (): CardDef => ({"oracleId":"60fa9f5f-2360-4d5e-b291-1318803e3c9f","name":"Mordor on the March","manaCost":"{3}{B}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile a creature card from your graveyard. Create a token that's a copy of it. It gains haste until end of turn. Exile it at the beginning of the next end step.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Storm"],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d553b1e-701b-4f09-80ce-2a16ab53e316.jpg?1783914194","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d553b1e-701b-4f09-80ce-2a16ab53e316.jpg?1783914194","commanderLegal":"legal","set":"ltc","releasedAt":"2023-11-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const torch = (): CardDef => ({"oracleId":"10d33e95-3e5d-447e-ba4a-acd3c33b4045","name":"Torch the Tower","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nTorch the Tower deals 2 damage to target creature or planeswalker. If this spell was bargained, instead it deals 3 damage to that permanent and you scry 1.\nIf a permanent dealt damage by Torch the Tower would die this turn, exile it instead.","colors":["R"],"colorIdentity":["R"],"keywords":["Bargain","Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/b/3/b3d6027c-813f-46df-95b4-e2e305a67620.jpg?1783915088","artUrl":"https://cards.scryfall.io/art_crop/front/b/3/b3d6027c-813f-46df-95b4-e2e305a67620.jpg?1783915088","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const stampede = (): CardDef => ({"oracleId":"b0700c79-f948-4235-ad87-f8c6079a368a","name":"Vivien's Stampede","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each creature you control gains vigilance, trample, and melee until end of turn. (Whenever a creature with melee attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.)\nAt the beginning of the next main phase this turn, draw a card for each player who was dealt combat damage this turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/886531e0-425e-4bf9-813c-3db399a7223b.jpg?1783923307","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/886531e0-425e-4bf9-813c-3db399a7223b.jpg?1783923307","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const summons = (): CardDef => ({"oracleId":"8b6ef0a2-cd90-44c8-8f11-e1983f2b1dfd","name":"Kamahl's Summons","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player may reveal any number of creature cards from their hand. Then each player creates a 2/2 green Bear creature token for each card they revealed this way.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0edc37c6-b6a8-424f-95dd-928d03c28542.jpg?1783945041","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0edc37c6-b6a8-424f-95dd-928d03c28542.jpg?1783945041","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const herb = (): CardDef => ({"oracleId":"20418984-bc6d-42e5-ada6-30b5281925c0","name":"Heart-Shaped Herb","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If a source an opponent controls would deal damage to you, prevent 1 of that damage.\n{2}, {T}, Sacrifice this artifact: You may sacrifice a creature. If you do, return that card to the battlefield under its owner's control with three +1/+1 counters on it and you become the monarch.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/1725b91a-bac4-4f91-b2b5-bb66086b54a3.jpg?1783903259","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/1725b91a-bac4-4f91-b2b5-bb66086b54a3.jpg?1783903259","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lumarets = (): CardDef => ({"oracleId":"5bb38d08-582e-43aa-9507-7c20759978ec","name":"Follow the Lumarets","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Infusion — Look at the top four cards of your library. You may reveal a creature or land card from among them and put it into your hand. If you gained life this turn, you may instead reveal two creature and/or land cards from among them and put them into your hand. Put the rest on the bottom of your library in a random order.","colors":["G"],"colorIdentity":["G"],"keywords":["Infusion"],"imageUrl":"https://cards.scryfall.io/normal/front/f/9/f9488480-2b6c-40bc-a93e-29fb1292a2e4.jpg?1783903659","artUrl":"https://cards.scryfall.io/art_crop/front/f/9/f9488480-2b6c-40bc-a93e-29fb1292a2e4.jpg?1783903659","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const visionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const revitalize = (): CardDef => ({"oracleId":"b1385b03-cb4b-4812-857f-7421f1df39af","name":"Revitalize","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You gain 3 life.\nDraw a card.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a9fb75e-c8e5-417b-83d4-5105af9c66c1.jpg?1783928280","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a9fb75e-c8e5-417b-83d4-5105af9c66c1.jpg?1783928280","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const regenerate = (): CardDef => ({"oracleId":"4ce6c946-7a93-4a8d-a2c9-086cbd036e3c","name":"Regenerate","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Regenerate target creature. (The next time that creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)","colors":["G"],"colorIdentity":["G"],"keywords":["Heal","Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a1026f4-b11a-48aa-9191-e0bb51c515a6.jpg?1783942358","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a1026f4-b11a-48aa-9191-e0bb51c515a6.jpg?1783942358","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const family = (): CardDef => ({"oracleId":"e119c709-bf9d-451e-827b-9787d455029a","name":"First Family","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You draw X cards and gain X life, where X is the number of colors among permanents you control and spells you've cast this turn.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/6/96679821-f850-4de1-b5f9-21e0681647ee.jpg?1783903271","artUrl":"https://cards.scryfall.io/art_crop/front/9/6/96679821-f850-4de1-b5f9-21e0681647ee.jpg?1783903271","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
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
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` in `zone` of `pid` (on top of the library). */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these cards in `pid`'s library (the rest set aside in exile). */
const onlyLibrary = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of s.players[pid]!.library) {
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.library = [];
  // In this order from the top.
  return [...defs].reverse().map((d) => into(s, pid, d, "library")).reverse();
};
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const named = (s: GameState, name: string) => s.battlefield.filter((id) => nameOf(s, id) === name);

describe("Random Encounter: the creature cards milled come onto the battlefield with haste and go back to hand at the next end step", () => {
  it("compiles", () => supported(encounter()));

  it("after the shuffle, the four milled cards: the creatures enter with haste, the rest stay; at the end step they return to your hand", () => {
    const { s: s0, ap, ids } = setup([encounter()]);
    const [b, g, f, l] = onlyLibrary(s0, ap, [bears(), giant(), forest(), bolt()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[b!]!.zone).toBe("battlefield");
    expect(s.objects[g!]!.zone).toBe("battlefield");
    expect(s.objects[f!]!.zone).toBe("graveyard");
    expect(s.objects[l!]!.zone).toBe("graveyard");
    expect(s.objects[b!]!.controller).toBe(ap);
    // Haste, so they can attack this turn.
    s = passUntil(s, "declareAttackers");
    expect(s.pending).toMatchObject({ kind: "declareAttackers" });
    const opp = others(s, ap)[0]!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b!, defender: opp }, { attacker: g!, defender: opp }] });
    s = passUntil(s, "end");
    s = settle(s);
    expect(s.objects[b!]!.zone).toBe("hand");
    expect(s.objects[g!]!.zone).toBe("hand");
    expect(s.players[opp]!.life).toBe(35);
  });

  it("a creature that left the battlefield before the end step is a new object and stays where it went (CR 400.7)", () => {
    const { s: s0, ap, ids } = setup([encounter(), bolt()]);
    const [b, g] = onlyLibrary(s0, ap, [bears(), giant(), forest(), forest()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(g!)])));
    expect(s.objects[g!]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end"));
    expect(s.objects[b!]!.zone).toBe("hand");
    expect(s.objects[g!]!.zone).toBe("graveyard");
  });
});

describe("Mordor on the March: a token copy of the creature card just exiled from your graveyard, with haste, exiled at the end step", () => {
  it("compiles", () => supported(mordor()));

  it("the token copies the card (its enters ability triggers), gains haste and is exiled at the next end step", () => {
    const { s: s0, ap, ids } = setup([mordor()]);
    const v = into(s0, ap, visionary(), "graveyard");
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [v] }));
    expect(s.pending).toBeFalsy();
    expect(s.objects[v]!.zone).toBe("exile");
    const [tok] = named(s, "Elvish Visionary");
    expect(tok).toBeDefined();
    expect(s.objects[tok!]!.isToken).toBe(true);
    expect(pt(s, tok!)).toBe("1/1");
    // Elvish Visionary's enters ability: a card drawn (rulings).
    expect(s.players[ap]!.hand).toHaveLength(hand - 1 + 1);
    s = passUntil(s, "declareAttackers");
    expect(s.pending).toMatchObject({ kind: "declareAttackers" });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: tok!, defender: others(s, ap)[0]! }] });
    s = settle(passUntil(s, "end"));
    expect(s.objects[tok!]?.zone ?? "gone").not.toBe("battlefield");
    expect(named(s, "Elvish Visionary")).toHaveLength(0);
  });

  it("with storm, each copy exiles a card of its own; a copy with none left makes no token", () => {
    const { s: s0, ap, ids } = setup([opt(), mordor()]);
    const v = into(s0, ap, visionary(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending) s = settle(act(s, botActions(s, waitingOn(s)!)[0]!));
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const w = waitingOn(s)!;
      s = act(s, s.pending ? botActions(s, w)[0]! : { type: "passPriority", player: w });
    }
    expect(s.objects[v]!.zone).toBe("exile");
    expect(named(s, "Elvish Visionary")).toHaveLength(1);
  });

  it("with no creature card in your graveyard, nothing happens", () => {
    const { s: s0, ap, ids } = setup([mordor()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });
});

describe("Torch the Tower: 2 damage, or 3 and scry 1 if bargained; a permanent it damaged that would die this turn is exiled", () => {
  it("compiles", () => supported(torch()));

  it("unbargained: 2 damage; the creature dying later this turn is exiled instead (rulings)", () => {
    const { s: s0, ap, ids } = setup([torch(), bolt()]);
    const opp = others(s0, ap)[0]!;
    const g = putOnBattlefield(s0, opp, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.damage).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("exile");
  });

  it("bargained: 3 damage to that permanent and you scry 1; the dying creature is exiled", () => {
    const { s: s0, ap, ids } = setup([torch()]);
    const opp = others(s0, ap)[0]!;
    const g = putOnBattlefield(s0, opp, giant());
    const o = putOnBattlefield(s0, ap, ornithopter());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(g)], undefined, "auto", undefined, { bargain: o }));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
    s = settle(act(s, botActions(s, ap)[0]!));
    expect(s.objects[o]!.zone).toBe("graveyard");
    expect(s.objects[g]!.zone).toBe("exile");
  });

  it("a creature dealt no damage by it (all prevented) dies normally", () => {
    const { s: s0, ap, ids } = setup([torch(), bolt()]);
    const opp = others(s0, ap)[0]!;
    const g = putOnBattlefield(s0, opp, giant());
    let s = s0;
    s.objects[g]!.counters = { ...(s.objects[g]!.counters ?? {}), shield: 1 };
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(s.objects[g]!.damage ?? 0).toBe(0);
    s.objects[g]!.counters = {};
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("graveyard");
  });
});

describe("Vivien's Stampede: at the next main phase this turn, a card for each player dealt combat damage this turn", () => {
  it("compiles", () => supported(stampede()));

  it("cast before combat: two opponents dealt combat damage, two cards at the postcombat main phase", () => {
    const { s: s0, ap, ids } = setup([stampede()]);
    const [o1, o2] = others(s0, ap);
    const a = putOnBattlefield(s0, ap, bears());
    const b = putOnBattlefield(s0, ap, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1! }, { attacker: b, defender: o2! }] });
    s = passUntil(s, "main2");
    expect(s.players[o1!]!.life).toBeLessThan(40);
    expect(s.players[o2!]!.life).toBeLessThan(40);
    s = settle(s);
    expect(s.players[ap]!.hand).toHaveLength(hand + 2);
    // Vigilance: the attackers didn't tap.
    expect(s.objects[a]!.tapped).toBeFalsy();
  });

  it("with no main phase left this turn, it never triggers (not next turn either)", () => {
    const { s: s0, ap, ids } = setup([stampede()]);
    let s = passUntil(s0, "main2");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.delayed?.some((d) => d.when === "nextMainThisTurn")).toBe(true);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main2", next);
    expect(s.delayed?.some((d) => d.when === "nextMainThisTurn") ?? false).toBe(false);
    expect(s.log.filter((l) => /Vivien's Stampede/.test(l.text) && /draws/.test(l.text))).toHaveLength(0);
  });

  it("nobody dealt combat damage: no cards", () => {
    const { s: s0, ap, ids } = setup([stampede()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const hand = s.players[ap]!.hand.length;
    s = settle(passUntil(s, "main2"));
    expect(s.players[ap]!.hand).toHaveLength(hand);
  });
});

describe("Heart-Shaped Herb: you may sacrifice a creature; if you do, its card returns with three +1/+1 counters and you become the monarch", () => {
  it("compiles", () => supported(herb()));

  it("the sacrificed creature's card comes back as a 5/5 under its owner's control, and you're the monarch", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, herb());
    const b = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planActivate(s0, ap, h, 0)));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.pending).toBeFalsy();
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(pt(s, b)).toBe("5/5");
    expect(s.monarch).toBe(ap);
  });

  it("an opponent's creature you control returns under its owner's control", () => {
    const { s: s0, ap } = setup([]);
    const opp = others(s0, ap)[0]!;
    const h = putOnBattlefield(s0, ap, herb());
    const b = putOnBattlefield(s0, opp, bears());
    s0.objects[b]!.controller = ap;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, h, 0)));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(opp);
    expect(s.monarch).toBe(ap);
  });

  it("declining: nothing returns and you don't become the monarch", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, herb());
    const b = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planActivate(s0, ap, h, 0)));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(pt(s, b)).toBe("2/2");
    expect(s.monarch).toBeUndefined();
  });
});

describe("Kamahl's Summons: each player may reveal creature cards from their hand, then creates a 2/2 Bear for each", () => {
  it("compiles", () => supported(summons()));

  it("each player chooses in turn order; the Bears go to each player for the cards they revealed", () => {
    const { s: s0, ap, ids } = setup([summons()]);
    const at = s0.turnOrder.indexOf(ap);
    const [o1, o2, o3] = [1, 2, 3].map((i) => s0.turnOrder[(at + i) % 4]!);
    s0.players[ap]!.hand = [ids[0]!];
    const mine = [into(s0, ap, bears(), "hand"), into(s0, ap, giant(), "hand")];
    for (const p of [o1!, o2!, o3!]) s0.players[p]!.hand = [];
    const theirs = [into(s0, o1!, bears(), "hand"), into(s0, o1!, giant(), "hand")];
    into(s0, o2!, bolt(), "hand");
    into(s0, o3!, bears(), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, reveal: true, min: 0, max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: [mine[1]!] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: o1, max: 2 });
    s = act(s, { type: "searchLibrary", player: o1!, found: theirs });
    // o2 has no creature card: not asked; o3 reveals none.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: o3, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: o3!, found: [] }));
    const bearsOf = (p: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === p && /Bear/.test(nameOf(s, id)));
    expect(bearsOf(ap)).toHaveLength(1);
    expect(bearsOf(o1!)).toHaveLength(2);
    expect(bearsOf(o2!)).toHaveLength(0);
    expect(bearsOf(o3!)).toHaveLength(0);
    // Revealing doesn't move the cards.
    for (const id of [...mine, ...theirs]) expect(s.objects[id]!.zone).toBe("hand");
  });

  it("bots reveal every creature card they have", () => {
    const { s: s0, ap, ids } = setup([summons()]);
    s0.players[ap]!.hand = [ids[0]!];
    into(s0, ap, bears(), "hand");
    into(s0, ap, bears(), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 20 && s.pending; i++) s = settle(act(s, botActions(s, waitingOn(s)!)[0]!));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toHaveLength(2);
  });
});

describe("Follow the Lumarets: one creature or land card from the top four, or two if you gained life this turn", () => {
  it("compiles", () => supported(lumarets()));

  it("without life gained this turn, at most one", () => {
    const { s: s0, ap, ids } = setup([lumarets()]);
    onlyLibrary(s0, ap, [bears(), forest(), giant(), bolt(), opt()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
  });

  it("after gaining life this turn, up to two, the rest on the bottom", () => {
    const { s: s0, ap, ids } = setup([revitalize(), lumarets()]);
    onlyLibrary(s0, ap, [opt(), bears(), forest(), giant(), bolt(), opt()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(43);
    const lib = s.players[ap]!.library.slice(0, 4);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    const pick = (s.pending as { cards: string[] }).cards.slice(0, 2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: pick }));
    for (const id of pick) expect(s.objects[id]!.zone).toBe("hand");
    const rest = lib.filter((id) => !pick.includes(id));
    expect(s.players[ap]!.library.slice(-rest.length).sort()).toEqual([...rest].sort());
  });
});

describe("First Family: X is the number of colors among permanents you control and spells you've cast this turn", () => {
  it("compiles", () => supported(family()));

  it("only its own colors (it's a spell you've cast this turn): draw two, gain two", () => {
    const { s: s0, ap, ids } = setup([family()]);
    const opp = others(s0, ap)[0]!;
    putOnBattlefield(s0, opp, giant());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand).toHaveLength(hand - 1 + 2);
    expect(s.players[ap]!.life).toBe(42);
  });

  it("a red permanent you control and a white spell cast earlier: four colors, each counted once", () => {
    const { s: s0, ap, ids } = setup([revitalize(), family()]);
    putOnBattlefield(s0, ap, giant());
    putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.hand).toHaveLength(hand - 1 + 4);
    expect(s.players[ap]!.life).toBe(life + 4);
  });
});

// Round 336 (Lane A): Rebbec, Architect of Ascension (protection from each mana value among artifacts you control),
// Weeping Angel ("isn't a creature until end of turn", and its combat damage to a creature prevented with that creature
// shuffled into its owner's library), Spell Queller (exiling a spell with mana value 4 or less, which its owner may cast
// for free once the Queller leaves) and Curie, Emergent Intelligence ("its base power", and becoming a copy of the
// creature exiled to pay for it, with a gained ability) and Oskar, Rubbish Reclaimer (a cost cut for each different mana
// value among cards in your graveyard, and casting a discarded card from the graveyard).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passAll, plainsCard, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, spellCost, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
/** Moves a new card for `def` from the battlefield into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const toAttackers = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const rebbec = (): CardDef => ({"oracleId":"ccad9b56-3c31-445f-8b78-b5bbdb3d077a","name":"Rebbec, Architect of Ascension","manaCost":"{3}{W}","cmc":4,"typeLine":"Legendary Creature — Human Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"Artifacts you control have protection from each mana value among artifacts you control.\nPartner (You can have two commanders if both have partner.)","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/46975250-950f-4f5d-a7c5-f61aec8e40ad.jpg?1783928875","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/46975250-950f-4f5d-a7c5-f61aec8e40ad.jpg?1783928875","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"1a89c623-c9c3-443c-bbd3-834767b6bdb8","name":"Weeping Angel","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Artifact Creature — Alien Angel","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Alien","Angel"],"oracleText":"Flash\nFirst strike, vigilance\nWhenever an opponent casts a creature spell, this creature isn't a creature until end of turn.\nIf this creature would deal combat damage to a creature, prevent that damage and that creature's owner shuffles it into their library.","power":"2","toughness":"2","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Vigilance","First strike","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0fd7b66-28f1-407b-bd60-6bcc577288cb.jpg?1783914619","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0fd7b66-28f1-407b-bd60-6bcc577288cb.jpg?1783914619","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const queller = (): CardDef => ({"oracleId":"135135f2-1643-40db-91f2-bb7b956d212c","name":"Spell Queller","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Flash\nFlying\nWhen this creature enters, exile target spell with mana value 4 or less.\nWhen this creature leaves the battlefield, the exiled card's owner may cast that card without paying its mana cost.","power":"2","toughness":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Flying","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b76bcd4-580a-4435-afe9-290940b1837f.jpg?1783937428","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b76bcd4-580a-4435-afe9-290940b1837f.jpg?1783937428","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const curie = (): CardDef => ({"oracleId":"48cf6b88-6bca-49d4-9951-36d98befa588","name":"Curie, Emergent Intelligence","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Artifact Creature — Robot","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"Whenever Curie deals combat damage to a player, draw cards equal to its base power.\n{1}{U}, Exile another nontoken artifact creature you control: Curie becomes a copy of the exiled creature, except it has \"Whenever this creature deals combat damage to a player, draw cards equal to its base power.\"","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/54870f19-96f3-4cde-ae44-a9c5bbb0dbc1.jpg?1783912413","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/54870f19-96f3-4cde-ae44-a9c5bbb0dbc1.jpg?1783912413","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solemn = (): CardDef => ({"oracleId":"00c0543c-2a1f-4425-8283-4062d74a1637","name":"Solemn Simulacrum","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.","power":"2","toughness":"2","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/daafd816-f7c1-4630-9e5c-a1e5db570a35.jpg?1783903212","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/daafd816-f7c1-4630-9e5c-a1e5db570a35.jpg?1783903212","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const prized = (): CardDef => ({"oracleId":"766787ef-654a-4544-b5d7-d2f96949edf1","name":"Prized Unicorn","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Unicorn","supertypes":[],"types":["Creature"],"subtypes":["Unicorn"],"oracleText":"All creatures able to block this creature do so.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/baac1604-379f-4f03-97ae-9ec10921167c.jpg?1783932900","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/baac1604-379f-4f03-97ae-9ec10921167c.jpg?1783932900","commanderLegal":"legal","set":"m20","releasedAt":"2019-07-12","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fog = (): CardDef => ({"oracleId":"27e9db49-7af7-4bef-ad4c-bf5dfb92030d","name":"Fog","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all combat damage that would be dealt this turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/92bfd2c6-2226-4f92-bb77-e614ad096996.jpg?1783903400","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/92bfd2c6-2226-4f92-bb77-e614ad096996.jpg?1783903400","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const searing = (): CardDef => ({"oracleId":"aafd44c1-74a9-4aa7-a4a2-67eb39a07478","name":"Searing Spear","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Searing Spear deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/11a94b7c-0216-473c-87a6-71e5a64d7799.jpg?1783940479","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/11a94b7c-0216-473c-87a6-71e5a64d7799.jpg?1783940479","commanderLegal":"legal","set":"m13","releasedAt":"2012-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const viper = (): CardDef => ({"oracleId":"8957f7c2-040c-4048-9f21-efa7c97682b7","name":"Ambush Viper","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Snake","supertypes":[],"types":["Creature"],"subtypes":["Snake"],"oracleText":"Flash\nDeathtouch","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Flash","Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c082aa8-bf7f-47f2-baf8-43ad253fd7d7.jpg?1783940925","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c082aa8-bf7f-47f2-baf8-43ad253fd7d7.jpg?1783940925","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const oskar = (): CardDef => ({"oracleId":"14c2c818-0ce2-4809-a5ff-ee4a6253defa","name":"Oskar, Rubbish Reclaimer","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"This spell costs {1} less to cast for each different mana value among cards in your graveyard.\nWhenever you discard a nonland card, you may cast it from your graveyard.","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/7943423b-52aa-46f1-a44d-e284375f23c0.jpg?1783923302","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/7943423b-52aa-46f1-a44d-e284375f23c0.jpg?1783923302","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 336: compiles", () => {
  it("every card of the round", () => supported(rebbec(), angel(), queller(), curie(), oskar()));
});

describe("round 336: Rebbec, Architect of Ascension", () => {
  it("artifacts you control have protection from each mana value among them; others don't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, rebbec());
    const ring = putOnBattlefield(s, ap, solRing());
    const sol = putOnBattlefield(s, ap, solemn());
    const thopter = putOnBattlefield(s, ap, ornithopter());
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, solemn());
    expect(kw(s, sol)).toEqual(expect.arrayContaining(["Protection from mana value 0", "Protection from mana value 1", "Protection from mana value 4"]));
    expect(kw(s, ring)).toContain("Protection from mana value 4");
    expect(kw(s, thopter)).toContain("Protection from mana value 1");
    expect(kw(s, sol)).not.toContain("Protection from mana value 2");
    // Not a creature that isn't an artifact, nor an opponent's artifacts.
    expect(kw(s, b).some((k) => /^Protection from/.test(k))).toBe(false);
    expect(kw(s, theirs).some((k) => /^Protection from/.test(k))).toBe(false);
  });

  it("a mana value 1 spell can't target them (CR 702.16b); a mana value 2 one can", () => {
    const { s, ap, ids } = setup([bolt(), searing()]);
    putOnBattlefield(s, ap, rebbec());
    putOnBattlefield(s, ap, solRing());
    const sol = putOnBattlefield(s, ap, solemn());
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: sol }])).toBeNull();
    const s2 = passAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: sol }])));
    expect(s2.objects[sol]!.zone).toBe("graveyard");
  });

  it("damage from a source with one of those mana values is prevented", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    let s = s0;
    putOnBattlefield(s, opp, rebbec());
    putOnBattlefield(s, opp, solRing());
    // A 3/3 artifact creature with mana value 1 attacking: blocked by the opponent's Solemn Simulacrum (2/2), whose
    // protection from mana value 1 prevents the damage.
    const sol = putOnBattlefield(s, opp, solemn());
    const att = putOnBattlefield(s, ap, { ...ornithopter(), oracleId: "test-construct", name: "Test Construct", manaCost: "{1}", cmc: 1, power: "3", toughness: "3", oracleText: "", keywords: [] } as CardDef);
    void ids;
    s = toAttackers(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    s = settle(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: sol, attacker: att }] }), ap);
    for (let i = 0; i < 50 && s.step !== "endCombat" && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[sol]!.zone).toBe("battlefield");
    expect(s.objects[sol]!.damage).toBe(0);
  });

  it("an Equipment with one of those mana values falls off an artifact creature (CR 702.16c, 704.5n)", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, rebbec());
    const sol = putOnBattlefield(s, ap, solemn());
    const eq = putOnBattlefield(s, ap, bonesplitter());
    // Bonesplitter's own mana value 1 is among the artifacts Rebbec's controller controls.
    s.objects[eq]!.attachedTo = sol;
    invalidateCharacteristics(s);
    expect(kw(s, sol)).toContain("Protection from mana value 1");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
    expect(s.objects[eq]!.zone).toBe("battlefield");
  });
});

describe("round 336: Weeping Angel", () => {
  it("when an opponent casts a creature spell, it isn't a creature until end of turn: still an artifact, no creature types", () => {
    const { s: s0, ap, opp, ids } = setup([bear()]);
    let s = s0;
    const a = putOnBattlefield(s, opp, angel());
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, ap);
    const c = characteristics(s, s.objects[a]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual([]);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // Until end of turn only.
    for (let i = 0; i < 400 && s.activePlayer === ap; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(characteristics(s, s.objects[a]!).types).toEqual(["Artifact", "Creature"]);
    expect(characteristics(s, s.objects[a]!).subtypes).toEqual(["Alien", "Angel"]);
  });

  it("an attacking one stops being a creature when an opponent casts a flash creature, and leaves combat (CR 506.4)", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, angel());
    putOnBattlefield(s, opp, forest);
    putOnBattlefield(s, opp, forest);
    const v = inHand(s, opp, viper());
    s = toAttackers(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 10 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, opp, v)), ap);
    expect(s.objects[v]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[a]!).types).toEqual(["Artifact"]);
    expect(s.objects[a]!.attacking).toBeUndefined();
    const life = s.players[opp]!.life;
    for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(life);
  });

  it("its controller's own creature spells don't trigger it", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    let s = s0;
    const a = putOnBattlefield(s, ap, angel());
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(characteristics(s, s.objects[a]!).types).toContain("Creature");
  });

  it("its combat damage to a blocking creature is prevented, and that creature's owner shuffles it into their library", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, angel());
    const g = putOnBattlefield(s, opp, hillGiant());
    const shuffles = s.players[opp]!.shuffles ?? 0;
    s = toAttackers(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: g, attacker: a }] }), ap);
    for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[g]!.zone).toBe("library");
    expect(s.players[opp]!.library).toContain(g);
    expect(s.players[opp]!.shuffles).toBe(shuffles + 1);
    // First strike: the Giant was gone before it could deal its damage.
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[a]!.damage).toBe(0);
    expect(JSON.stringify(s.log)).toMatch(/Weeping Angel: Hill Giant is shuffled into its owner's library/);
  });

  it("a creature with a shield counter: its controller may use the counter instead (CR 616.1), as a bot does", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, angel());
    const g = putOnBattlefield(s, opp, hillGiant());
    s.objects[g]!.counters.shield = 1;
    s = toAttackers(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: g, attacker: a }] }), ap);
    for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.counters.shield ?? 0).toBe(0);
    // The Giant's 3 damage to the 2/2 Angel.
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("a player who controls the damaged creature is asked which applies, and may take the shuffle", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, opp, angel());
    const g = putOnBattlefield(s, ap, hillGiant());
    s.objects[g]!.counters.shield = 1;
    s = toAttackers(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: a, attacker: g }] });
    for (let i = 0; i < 80 && !(s.pending?.kind === "chooseOption" && s.pending.player === ap); i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = pend(s, "chooseOption");
    expect(p.prompt).toMatch(/Damage from Weeping Angel to Hill Giant: which applies\?/);
    expect(p.labels).toEqual(["Prevent the damage another way", "Weeping Angel: prevent it and shuffle Hill Giant into its owner's library"]);
    s = act(s, { type: "chooseOption", player: ap, choice: p.options[1]! });
    for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[g]!.zone).toBe("library");
  });

  it("a token is shuffled in too and ceases to exist (CR 111.7)", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, angel());
    const t = putOnBattlefield(s, opp, bear({ name: "Bear Token" }));
    s.objects[t]!.isToken = true;
    s = toAttackers(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: t, attacker: a }] }), ap);
    for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.battlefield).not.toContain(t);
    expect(s.players[opp]!.library).not.toContain(t);
  });
});

describe("round 336: Spell Queller", () => {
  const opponentWithQueller = (hand: CardDef[]) => {
    const r = setup(hand);
    for (const l of [island, island, plainsCard]) putOnBattlefield(r.s, r.opp, l);
    const q = inHand(r.s, r.opp, queller());
    return { ...r, q };
  };

  it("cast with flash, it exiles a spell with mana value 4 or less; when it leaves, that spell's owner may cast it free", () => {
    const { s: s0, ap, opp, ids, q } = opponentWithQueller([divination(), bolt()]);
    let s = s0;
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).not.toBe(ap);
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, q));
    s = settle(s, ap);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[q]!.zone).toBe("battlefield");
    const hand = s.players[ap]!.hand.length;
    // Bolt the Queller: its leaves trigger lets Divination's owner cast it without paying its mana cost.
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: q }]));
    s = settle(s, ap);
    expect(s.objects[q]!.zone).toBe("graveyard");
    const p = pend(s, "castFree");
    expect(p).toMatchObject({ player: ap, objectId: ids[0]! });
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    s = settle(s, ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // Bolt went to the graveyard (-1); Divination drew two.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("a bot casts it in response to an opponent's spell it can exile", () => {
    const { s: s0, ap, opp, ids, q } = opponentWithQueller([divination()]);
    let s = s0;
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    for (let i = 0; i < 6 && s.objects[q]!.zone === "hand" && s.stack.length; i++) {
      const w = waitingOn(s)!;
      s = w === opp ? (() => { let t = s; for (const a of botActions(t, opp)) t = act(t, a); return t; })() : act(s, { type: "passPriority", player: w });
    }
    expect(s.objects[q]!.zone).not.toBe("hand");
    s = settle(s, ap);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("can't target a spell with mana value 5 or more", () => {
    const { s: s0, ap, ids, q } = opponentWithQueller([{ ...divination(), oracleId: "test-big-draw", name: "Test Big Draw", manaCost: "{4}{U}", cmc: 5 } as CardDef]);
    let s = s0;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, ap);
    void q;
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("round 336: Curie, Emergent Intelligence", () => {
  it("combat damage to a player draws cards equal to its base power, not counting counters", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, curie());
    s.objects[c]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    expect(pt(s, c)).toBe("3/5");
    const hand = s.players[ap]!.hand.length;
    s = toAttackers(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("exiling another nontoken artifact creature, it becomes a copy of it with the draw trigger; draws that copy's base power", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, curie());
    const big = putOnBattlefield(s, ap, { ...solemn(), oracleId: "test-colossus", name: "Test Colossus", power: "4", toughness: "4", oracleText: "Trample", keywords: ["Trample"] } as CardDef);
    const tok = putOnBattlefield(s, ap, { ...solemn(), oracleId: "test-thopter", name: "Test Thopter" } as CardDef);
    s.objects[tok]!.isToken = true;
    // A token can't pay the cost.
    expect(planActivate(s, ap, c, 0, [], undefined, undefined, undefined, { sacrifice: [tok] })).toBeNull();
    s = passAll(run(s, planActivate(s, ap, c, 0, [], undefined, undefined, undefined, { sacrifice: [big] })));
    expect(s.objects[big]!.zone).toBe("exile");
    expect(name(s, c)).toBe("Test Colossus");
    expect(pt(s, c)).toBe("4/4");
    expect(kw(s, c)).toContain("Trample");
    expect(characteristics(s, s.objects[c]!).supertypes).not.toContain("Legendary");
    const hand = s.players[ap]!.hand.length;
    s = toAttackers(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.hand.length).toBe(hand + 4);
  });
});

describe("round 336: Oskar, Rubbish Reclaimer", () => {
  const costOf = (s: GameState, pid: number, id: string) => {
    const c = spellCost(s, pid, s.objects[id]!);
    return `${c.cost.symbols.map((x) => ("color" in x ? x.color : x.kind)).join("")}+${c.extra}`;
  };
  const loot = card("Test Loot", "Sorcery", "{U}", { oracleText: "Draw a card, then discard a card." });

  it("costs {1} less for each different mana value among cards in your graveyard, a land's 0 too", () => {
    const { s, ap, ids } = setup([oskar()]);
    const before = costOf(s, ap, ids[0]!);
    const yard = (d: CardDef) => {
      const id = putOnBattlefield(s, ap, d);
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(id);
    };
    yard(forest);
    yard(bolt());
    yard(bear());
    yard(bear({ name: "Other Bears" }));
    invalidateCharacteristics(s);
    const after = costOf(s, ap, ids[0]!);
    // {3}{U}{B} less {3} (mana values 0, 1 and 2): the colored part stays.
    expect(before).toBe("UB+3");
    expect(after).toBe("UB+0");
  });

  it("whenever you discard a nonland card, you may cast it from your graveyard, paying its costs", () => {
    const { s: s0, ap, opp, ids } = setup([loot, bolt()]);
    let s = s0;
    putOnBattlefield(s, ap, oskar());
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, ap);
    const d = pend(s, "discard");
    void d;
    s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] });
    s = settle(s, ap);
    const p = pend(s, "castFree");
    expect(p).toMatchObject({ player: ap, objectId: ids[1]!, how: "paid" });
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp } as never]));
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });
});

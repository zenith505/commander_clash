// Round 392 (Lane A): cards revealed until X permanent cards, any number of them put onto the battlefield (Aurora
// Awakener), a land played or a spell cast from the top of your library as a combat damage trigger resolves, else that
// card into your hand (Ziatora's Envoy), and Lukka, Coppercoat Outcast's loyalty abilities: creature cards exiled from the
// top that may be cast while you control a Lukka, a creature exiled for one with greater mana value from the library, and
// each creature you control dealing damage equal to its power to each opponent.

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const aurora = (): CardDef => ({"oracleId":"cf9d13e2-bdcc-4c66-95ad-654ef795dbd3","name":"Aurora Awakener","manaCost":"{6}{G}","cmc":7,"typeLine":"Creature — Giant Druid","supertypes":[],"types":["Creature"],"subtypes":["Giant","Druid"],"oracleText":"Trample\nVivid — When this creature enters, reveal cards from the top of your library until you reveal X permanent cards, where X is the number of colors among permanents you control. Put any number of those permanent cards onto the battlefield, then put the rest of the revealed cards on the bottom of your library in a random order.","power":"7","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":["Trample","Vivid"],"imageUrl":"https://cards.scryfall.io/normal/front/9/1/913977c2-73f9-466b-bd01-827c1736e070.jpg?1783904435","artUrl":"https://cards.scryfall.io/art_crop/front/9/1/913977c2-73f9-466b-bd01-827c1736e070.jpg?1783904435","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const envoy = (): CardDef => ({"oracleId":"93fe1d5b-3ab3-431a-9d78-175550ba9d43","name":"Ziatora's Envoy","manaCost":"{1}{B}{R}{G}","cmc":4,"typeLine":"Creature — Lizard Warrior","supertypes":[],"types":["Creature"],"subtypes":["Lizard","Warrior"],"oracleText":"Trample\nWhenever this creature deals combat damage to a player, look at the top card of your library. You may play a land from the top of your library or cast a spell with mana value less than or equal to the damage dealt from the top of your library without paying its mana cost. If you don't, put that card into your hand.\nBlitz {2}{B}{R}{G}","power":"5","toughness":"4","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Blitz","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/ba39154c-aace-4d55-a3ad-7c9eb717ed2b.jpg?1783923065","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/ba39154c-aace-4d55-a3ad-7c9eb717ed2b.jpg?1783923065","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lukka = (): CardDef => ({"oracleId":"1ca97394-4e8c-4698-bea1-554f9b10927b","name":"Lukka, Coppercoat Outcast","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Legendary Planeswalker — Lukka","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Lukka"],"oracleText":"+1: Exile the top three cards of your library. Creature cards exiled this way gain \"You may cast this card from exile as long as you control a Lukka planeswalker.\"\n−2: Exile target creature you control, then reveal cards from the top of your library until you reveal a creature card with greater mana value. Put that card onto the battlefield and the rest on the bottom of your library in a random order.\n−7: Each creature you control deals damage equal to its power to each opponent.","loyalty":"5","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/5798fdf0-d178-43d9-b821-8f3f654654b4.jpg?1783931048","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/5798fdf0-d178-43d9-b821-8f3f654654b4.jpg?1783931048","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const stomping = (): CardDef => ({"oracleId":"16052b52-ade1-406f-a06b-ce7ea607fb63","name":"Stomping Ground","manaCost":"","cmc":0,"typeLine":"Land — Mountain Forest","supertypes":[],"types":["Land"],"subtypes":["Mountain","Forest"],"oracleText":"({T}: Add {R} or {G}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.","colors":[],"colorIdentity":["G","R"],"keywords":[],"producedMana":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1ee8255a-44f6-4faa-9843-15432bf751ea.jpg?1784065855","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1ee8255a-44f6-4faa-9843-15432bf751ea.jpg?1784065855","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lions = (): CardDef => ({"oracleId":"60ba93eb-39e6-4af2-9c66-cd38f72daff2","name":"Savannah Lions","manaCost":"{W}","cmc":1,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","commanderLegal":"legal","set":"a25","releasedAt":"2018-03-16","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const nighthawk = (): CardDef => ({"oracleId":"feb244f8-bcb1-44cf-9940-2719221a7309","name":"Vampire Nighthawk","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bonecrusher = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]}) as CardDef;
const memnite = (): CardDef => ({"oracleId":"7663ac7c-1de3-4250-b96a-fae9dbd66a27","name":"Memnite","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const shatterskull = (): CardDef => ({"oracleId":"78301998-fd9b-4cd5-afad-dbcb43cac2a7","name":"Shatterskull Smashing // Shatterskull, the Hammer Pass","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Sorcery // Land","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Shatterskull Smashing deals X damage divided as you choose among up to two target creatures and/or planeswalkers. If X is 6 or more, Shatterskull Smashing deals twice X damage divided as you choose among them instead.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc7239ea-f8aa-4a6f-87bd-c35359635673.jpg?1783929355","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc7239ea-f8aa-4a6f-87bd-c35359635673.jpg?1783929355","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"mythic","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Shatterskull Smashing","manaCost":"{X}{R}{R}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Shatterskull Smashing deals X damage divided as you choose among up to two target creatures and/or planeswalkers. If X is 6 or more, Shatterskull Smashing deals twice X damage divided as you choose among them instead.","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc7239ea-f8aa-4a6f-87bd-c35359635673.jpg?1783929355","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc7239ea-f8aa-4a6f-87bd-c35359635673.jpg?1783929355"},{"name":"Shatterskull, the Hammer Pass","manaCost":"","typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"As this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {R}.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/b/c/bc7239ea-f8aa-4a6f-87bd-c35359635673.jpg?1783929355","artUrl":"https://cards.scryfall.io/art_crop/back/b/c/bc7239ea-f8aa-4a6f-87bd-c35359635673.jpg?1783929355"}]}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const moveTo = (zone: "graveyard" | "hand" | "library" | "exile") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Puts these cards on top of `pid`'s library, the first on top. */
const stackTop = (s: GameState, pid: PlayerId, defs: CardDef[]): ObjectId[] => {
  const ids = defs.map((d) => moveTo("library")(s, pid, d));
  const lib = s.players[pid]!.library;
  lib.splice(0, ids.length);
  lib.unshift(...ids);
  return ids;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
const name = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
/** `ap` attacks `defender` with `attacker`, no blocks, then passes until a question of `ap`'s (or the stack is empty after combat damage). */
const attack = (s: GameState, ap: PlayerId, attacker: ObjectId, defender: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  if (s.pending?.kind !== "declareAttackers") throw new Error("no attack");
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
  for (let i = 0; i < 300 && !(s.pending && s.pending.player === ap) && s.step !== "endCombat" && s.step !== "main2"; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("round 392: compiles", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [aurora(), envoy(), lukka()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Aurora Awakener", () => {
  /** Aurora Awakener cast and its enters trigger resolving, up to the first question of `ap`'s. */
  const castAurora = (s0: GameState, ap: PlayerId, id: ObjectId) => settle(run(s0, planCast(s0, ap, id)), ap);

  it("reveals until X permanent cards, X the colors among your permanents as it resolves; you put any number onto the battlefield, the rest of the revealed cards go on the bottom", () => {
    const { s: s0, ap, ids } = setup([aurora()]);
    // White and black permanents, and Aurora Awakener itself green as the trigger resolves: X is 3.
    putOnBattlefield(s0, ap, lions());
    putOnBattlefield(s0, ap, nighthawk());
    const [z1, b, w, z2, g, after] = stackTop(s0, ap, [bolt(), bears(), wurm(), bolt(), giant(), solRing()]);
    const libBefore = s0.players[ap]!.library.length;
    let s = castAurora(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 3 });
    if (s.pending?.kind !== "searchLibrary") return;
    expect([...s.pending.cards].sort()).toEqual([b, w, g].sort());
    expect(s.pending.dig?.looked).toEqual([z1, b, w, z2, g]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b!, g!] }), ap);
    expect(s.pending).toBeNull();
    expect(zone(s, b!)).toBe("battlefield");
    expect(zone(s, g!)).toBe("battlefield");
    expect(s.objects[b!]!.controller).toBe(ap);
    // The Craw Wurm (not chosen) and both Bolts go on the bottom, the Sol Ring is on top now.
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(after);
    expect([...lib.slice(-3)].sort()).toEqual([z1, w, z2].sort());
    expect(lib.length).toBe(libBefore - 2);
  });

  it("lands are permanent cards, and colorless permanents add nothing to X: with only itself, one card is found", () => {
    const { s: s0, ap, ids } = setup([aurora()]);
    putOnBattlefield(s0, ap, solRing());
    const [f, b] = stackTop(s0, ap, [forestCard(), bears()]);
    let s = castAurora(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [f], max: 1 });
    // None chosen: the Forest goes on the bottom.
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(zone(s, f!)).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(f);
    expect(s.players[ap]!.library[0]).toBe(b);
  });

  it("an Aura enchants something already on the battlefield, not a card entering with it; one that can't goes on the bottom", () => {
    const { s: s0, ap, ids, opp } = setup([aurora()]);
    putOnBattlefield(s0, ap, lions());
    const theirs = putOnBattlefield(s0, opp, giant());
    const [p, b, after] = stackTop(s0, ap, [pacifism(), bears(), solRing()]);
    let s = castAurora(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: [p!, b!] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: ap });
    if (s.pending?.kind !== "chooseOption") return;
    // The Grizzly Bears entering with it isn't on the battlefield yet (rulings).
    expect(s.pending.options.some((o) => o.includes(b!))).toBe(false);
    const onTheirs = s.pending.options.find((o) => o.includes(theirs))!;
    expect(onTheirs).toBeDefined();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: onTheirs }), ap);
    expect(zone(s, p!)).toBe("battlefield");
    expect(s.objects[p!]!.attachedTo).toBe(theirs);
    expect(zone(s, b!)).toBe("battlefield");
    expect(s.players[ap]!.library[0]).toBe(after);
  });

  it("with X 0 nothing is revealed, and a bot puts every permanent card it finds onto the battlefield", () => {
    // X 0: Aurora Awakener has left the battlefield and you control no colored permanent.
    const { s: s0, ap, ids } = setup([aurora()]);
    stackTop(s0, ap, [bears()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // Resolve the creature spell, then remove it before its trigger resolves.
    for (let i = 0; i < 20 && !s.triggerQueue.length && !s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const aw = ids[0]!;
    if (zone(s, aw) === "battlefield") {
      const o = s.objects[aw]!;
      s.battlefield.splice(s.battlefield.indexOf(aw), 1);
      o.zone = "graveyard";
      o.zoneChanges = (o.zoneChanges ?? 0) + 1;
      s.players[ap]!.graveyard.push(aw);
      invalidateCharacteristics(s);
    }
    const libBefore = [...s.players[ap]!.library];
    s = settle(s, ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library).toEqual(libBefore);
    expect(s.log.some((l) => /reveals 0 cards/.test(l.text))).toBe(true);

    const t = setup([aurora()]);
    putOnBattlefield(t.s, t.ap, lions());
    const [z, b, w] = stackTop(t.s, t.ap, [bolt(), bears(), wurm()]);
    let u = run(t.s, planCast(t.s, t.ap, t.ids[0]!));
    u = settle(u);
    expect(zone(u, b!)).toBe("battlefield");
    expect(zone(u, w!)).toBe("battlefield");
    expect(u.players[t.ap]!.library.at(-1)).toBe(z);
  });
});

describe("Ziatora's Envoy", () => {
  /** Ziatora's Envoy on the battlefield of the active player, ready to attack, and the card(s) on top of the library. */
  const begin = (top: CardDef[], extra: (s: GameState, ap: PlayerId) => void = () => {}) => {
    const { s, ap, opp } = setup([]);
    const e = putOnBattlefield(s, ap, envoy());
    const ids = stackTop(s, ap, top);
    extra(s, ap);
    return { s, ap, opp, e, ids };
  };

  it("a land on top: you may play it, as your land play for the turn", () => {
    const { s: s0, ap, opp, e, ids } = begin([forestCard()]);
    const f = ids[0]!;
    let s = attack(s0, ap, e, opp);
    expect(s.players[opp]!.life).toBe(35);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, card: f });
    expect(s.pending?.kind === "chooseMay" && s.pending.prompt).toMatch(/^play Forest from the top of your library/);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, f)).toBe("battlefield");
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("not played (or no land play left), the land goes into your hand", () => {
    const { s: s0, ap, opp, e, ids } = begin([forestCard()]);
    let s = attack(s0, ap, e, opp);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(zone(s, ids[0]!)).toBe("hand");

    const t = begin([forestCard()], (s, ap) => (s.players[ap]!.landsPlayedThisTurn = 1));
    let u = attack(t.s, t.ap, t.e, t.opp);
    expect(u.pending).toBeNull();
    u = settle(u, t.ap);
    expect(zone(u, t.ids[0]!)).toBe("hand");
  });

  it("a spell with mana value up to the damage dealt may be cast without paying its mana cost; declined, it goes into your hand", () => {
    const { s: s0, ap, opp, e, ids } = begin([bears()]);
    const b = ids[0]!;
    let s = attack(s0, ap, e, opp);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: b, mv: { max: 5 } });
    const pool = JSON.stringify(s.players[ap]!.manaPool);
    s = settle(run(s, planCast(s, ap, b)), ap);
    expect(zone(s, b)).toBe("battlefield");
    expect(JSON.stringify(s.players[ap]!.manaPool)).toBe(pool);

    const t = begin([bears()]);
    let u = attack(t.s, t.ap, t.e, t.opp);
    u = settle(act(u, { type: "chooseMay", player: t.ap, yes: false }), t.ap);
    expect(zone(u, t.ids[0]!)).toBe("hand");
  });

  it("a spell with greater mana value than the damage dealt can't be cast: it goes into your hand", () => {
    // Shivan Dragon has mana value 6; Ziatora's Envoy deals 5.
    const { s: s0, ap, opp, e, ids } = begin([shivan()]);
    let s = attack(s0, ap, e, opp);
    expect(s.pending).toBeNull();
    s = settle(s, ap);
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(s.log.some((l) => l.text === "You put Shivan Dragon into your hand." && l.to === ap)).toBe(true);
  });

  it("the damage dealt counts: with 6 power, a mana value 6 spell may be cast", () => {
    const { s: s0, ap, opp, e, ids } = begin([shivan()], (s, ap) => {
      void ap;
      s.objects[s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Ziatora's Envoy")!]!.counters["+1/+1"] = 1;
      invalidateCharacteristics(s);
    });
    void e;
    let s = attack(s0, ap, e, opp);
    expect(s.players[opp]!.life).toBe(34);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: ids[0], mv: { max: 6 } });
  });

  it("a modal double-faced card: played as its land face (choosing to pay life so it enters untapped), or cast as its spell", () => {
    const { s: s0, ap, opp, e, ids } = begin([shatterskull()]);
    const v = ids[0]!;
    let s = attack(s0, ap, e, opp);
    expect(s.pending?.kind === "chooseMay" && s.pending.prompt).toMatch(/^play Shatterskull, the Hammer Pass from the top of your library/);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending?.kind === "chooseMay" && s.pending.prompt).toBe("pay 3 life so Shatterskull, the Hammer Pass enters untapped");
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, v)).toBe("battlefield");
    expect(characteristics(s, s.objects[v]!).name).toBe("Shatterskull, the Hammer Pass");
    expect(s.objects[v]!.tapped).toBe(false);
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(1);

    // Not paying: it enters tapped.
    const t = begin([shatterskull()]);
    let u = attack(t.s, t.ap, t.e, t.opp);
    u = act(u, { type: "chooseMay", player: t.ap, yes: true });
    u = settle(act(u, { type: "chooseMay", player: t.ap, yes: false }), t.ap);
    expect(zone(u, t.ids[0]!)).toBe("battlefield");
    expect(u.objects[t.ids[0]!]!.tapped).toBe(true);

    // Declining the land face: Shatterskull Smashing (mana value 2, X as 0) may be cast for free instead.
    const w = begin([shatterskull()]);
    let x = attack(w.s, w.ap, w.e, w.opp);
    x = act(x, { type: "chooseMay", player: w.ap, yes: false });
    expect(x.pending).toMatchObject({ kind: "castFree", objectId: w.ids[0], mv: { max: 5 } });
    x = settle(act(x, { type: "chooseMay", player: w.ap, yes: false }), w.ap);
    expect(zone(x, w.ids[0]!)).toBe("hand");
  });

  it("with an empty library nothing happens; a bot plays a land from the top and casts a cheap spell", () => {
    const { s: s0, ap, opp, e } = begin([], (s, ap) => {
      for (const id of s.players[ap]!.library) delete s.objects[id];
      s.players[ap]!.library = [];
    });
    let s = attack(s0, ap, e, opp);
    expect(s.pending).toBeNull();

    const t = begin([forestCard()]);
    let u = passUntil(t.s, "declareAttackers", t.ap);
    u = act(u, { type: "declareAttackers", player: t.ap, attacks: [{ attacker: t.e, defender: t.opp }] });
    for (let i = 0; i < 300 && u.step !== "main2"; i++) {
      if (u.pending?.kind === "declareBlockers") u = act(u, { type: "declareBlockers", player: u.pending.player, blocks: [] });
      else if (u.pending) for (const a of botActions(u, u.pending.player)) u = act(u, a);
      else u = act(u, { type: "passPriority", player: waitingOn(u)! });
    }
    expect(zone(u, t.ids[0]!)).toBe("battlefield");

    const v = begin([bears()]);
    let w = passUntil(v.s, "declareAttackers", v.ap);
    w = act(w, { type: "declareAttackers", player: v.ap, attacks: [{ attacker: v.e, defender: v.opp }] });
    for (let i = 0; i < 300 && w.step !== "main2"; i++) {
      if (w.pending?.kind === "declareBlockers") w = act(w, { type: "declareBlockers", player: w.pending.player, blocks: [] });
      else if (w.pending) for (const a of botActions(w, w.pending.player)) w = act(w, a);
      else w = act(w, { type: "passPriority", player: waitingOn(w)! });
    }
    expect(zone(w, v.ids[0]!)).toBe("battlefield");
  });
});

describe("Lukka, Coppercoat Outcast", () => {
  /** Lukka on the battlefield of the active player with this much loyalty. */
  const begin = (loyalty = 5) => {
    const t = setup([]);
    const l = putOnBattlefield(t.s, t.ap, lukka());
    t.s.objects[l]!.counters.loyalty = loyalty;
    invalidateCharacteristics(t.s);
    return { ...t, l };
  };

  it("+1: creature cards exiled from the top may be cast from exile, paying their costs, while you control a Lukka planeswalker; other cards just stay exiled", () => {
    const { s: s0, ap, l } = begin();
    const [b, z, w, after] = stackTop(s0, ap, [bears(), bolt(), wurm(), giant()]);
    let s = settle(run(s0, planActivate(s0, ap, l, 0)), ap);
    for (const id of [b, z, w]) expect(zone(s, id!)).toBe("exile");
    expect(s.players[ap]!.library[0]).toBe(after);
    expect(s.objects[l]!.counters.loyalty).toBe(6);
    // The creature cards: cast for their mana cost (Grizzly Bears takes two lands).
    expect(planCast(s, ap, b!)).not.toBeNull();
    expect(planCast(s, ap, w!)).not.toBeNull();
    expect(planCast(s, ap, z!)).toBeNull();
    const untapped = s.battlefield.filter((id) => !s.objects[id]!.tapped).length;
    s = settle(run(s, planCast(s, ap, b!)), ap);
    expect(zone(s, b!)).toBe("battlefield");
    expect(untapped - s.battlefield.filter((id) => !s.objects[id]!.tapped && id !== b).length).toBe(2);
    // Without a Lukka planeswalker, the Craw Wurm can't be cast; it stays exiled.
    const o = s.objects[l]!;
    s.battlefield.splice(s.battlefield.indexOf(l), 1);
    o.zone = "graveyard";
    o.zoneChanges = (o.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(l);
    invalidateCharacteristics(s);
    expect(planCast(s, ap, w!)).toBeNull();
    // Another Lukka planeswalker of yours lets it be cast again (rulings).
    const other = putOnBattlefield(s, ap, lukka());
    s.objects[other]!.counters.loyalty = 5;
    invalidateCharacteristics(s);
    expect(planCast(s, ap, w!)).not.toBeNull();
  });

  it("+1: an adventurer creature card may be cast as its Adventure (rulings)", () => {
    const { s: s0, ap, l, opp } = begin();
    const [g] = stackTop(s0, ap, [bonecrusher(), bolt(), bolt()]);
    let s = settle(run(s0, planActivate(s0, ap, l, 0)), ap);
    expect(zone(s, g!)).toBe("exile");
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, g!, [{ kind: "player", id: opp }], undefined, undefined, undefined, { face: 1 })), ap);
    expect(s.players[opp]!.life).toBe(life - 2);
    // On an adventure in exile now (CR 715.4): it may be cast as the creature later, whatever Lukka does.
    expect(zone(s, g!)).toBe("exile");
    expect(planCast(s, ap, g!)).not.toBeNull();
  });

  it("−2: exiles your creature, then reveals until a creature card with greater mana value and puts it onto the battlefield; the rest go on the bottom", () => {
    const { s: s0, ap, l } = begin();
    const hill = putOnBattlefield(s0, ap, giant());
    const [b, z, w, after] = stackTop(s0, ap, [bears(), bolt(), wurm(), solRing()]);
    let s = run(s0, planActivate(s0, ap, l, 1, [{ kind: "object", id: hill }]));
    s = settle(s, ap);
    expect(zone(s, hill)).toBe("exile");
    // Hill Giant has mana value 4: Grizzly Bears (2) is passed over, Craw Wurm (6) enters.
    expect(zone(s, w!)).toBe("battlefield");
    expect(s.objects[w!]!.controller).toBe(ap);
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(after);
    expect([...lib.slice(-2)].sort()).toEqual([b, z].sort());
    expect(s.objects[l]!.counters.loyalty).toBe(3);
  });

  it("−2: equal mana value isn't greater; with none greater, the whole library is revealed and put back in a random order", () => {
    const { s: s0, ap, l } = begin();
    const hill = putOnBattlefield(s0, ap, giant());
    for (const id of s0.players[ap]!.library) delete s0.objects[id];
    s0.players[ap]!.library = [];
    const ids = stackTop(s0, ap, [giant(), bears(), bolt()]);
    let s = run(s0, planActivate(s0, ap, l, 1, [{ kind: "object", id: hill }]));
    s = settle(s, ap);
    expect(zone(s, hill)).toBe("exile");
    for (const id of ids) expect(zone(s, id)).toBe("library");
    expect([...s.players[ap]!.library].sort()).toEqual([...ids].sort());
    expect(s.log.some((l) => /reveals 3 cards/.test(l.text) && /finding no creature card with greater mana value/.test(l.text))).toBe(true);
  });

  it("−2: only a creature you control can be targeted", () => {
    const { s, ap, l, opp } = begin();
    const theirs = putOnBattlefield(s, opp, giant());
    expect(planActivate(s, ap, l, 1, [{ kind: "object", id: theirs }])).toBeNull();
  });

  it("−7: each creature you control deals damage equal to its power to each opponent, its lifelink applying", () => {
    const { s: s0, ap, l } = begin(7);
    putOnBattlefield(s0, ap, lions());
    putOnBattlefield(s0, ap, nighthawk());
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planActivate(s0, ap, l, 2)), ap);
    for (const q of opps) expect(s.players[q]!.life).toBe(36);
    // Vampire Nighthawk's 2 damage to each of three opponents: 6 life (CR 702.15b).
    expect(s.players[ap]!.life).toBe(life + 6);
    expect(zone(s, l)).toBe("graveyard");
  });

  it("a bot with enough creatures uses −7", () => {
    const { s, ap, l } = begin(7);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, wurm());
    // Nothing else to do first: no cards in hand, the land already played.
    for (const id of s.players[ap]!.hand) delete s.objects[id];
    s.players[ap]!.hand = [];
    s.players[ap]!.landsPlayedThisTurn = 1;
    // The bot's main phase (its commander may come first): its Lukka ability is the −7.
    let t = s;
    let used: Extract<Action, { type: "activateAbility" }> | undefined;
    for (let i = 0; i < 60 && !used && t.step === "main1"; i++) {
      const who = waitingOn(t)!;
      for (const a of botActions(t, who)) {
        if (a.type === "activateAbility" && a.objectId === l) used = a;
        t = act(t, a);
      }
    }
    expect(used?.index).toBe(2);
  });
});

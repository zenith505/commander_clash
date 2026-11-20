// Lane B round B271: Ian Malcolm, Chaotician (a player's second draw each turn exiles their top card; on each player's own
// turn, one spell a turn from among the cards they don't own exiled with Ian, mana of any type, CR 607.2a, 609.4b), Araumi
// of the Dead Tide (exile a card from your graveyard for each opponent: a creature card gains encore with its mana cost,
// CR 602.2b, 702.141a) and Haldan, Avid Arcanist (play lands and cast noncreature spells from among cards you exiled with
// fetch counters, mana as though of any color, CR 609.4b).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { abilityCosts } from "../src/bot";
import { abilitiesOf, applyAction, castProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const ianMalcolm = (): CardDef => ({"oracleId":"57ff1665-0a7b-4d98-bd8f-cc07cf04f701","name":"Ian Malcolm, Chaotician","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Human Scientist","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist"],"oracleText":"Whenever a player draws their second card each turn, that player exiles the top card of their library.\nDuring each player's turn, that player may cast a spell from among the cards they don't own exiled with Ian Malcolm, and mana of any type can be spent to cast it.","power":"2","toughness":"2","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/4/b4a0402e-e39b-4008-b654-189b4a5e03a3.jpg?1783913634","artUrl":"https://cards.scryfall.io/art_crop/front/b/4/b4a0402e-e39b-4008-b654-189b4a5e03a3.jpg?1783913634","layout":"normal"});
const araumi = (): CardDef => ({"oracleId":"1a62ba93-153c-4bed-9f6a-ff914df360c1","name":"Araumi of the Dead Tide","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Legendary Creature — Merfolk Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Merfolk","Wizard"],"oracleText":"{T}, Exile cards from your graveyard equal to the number of opponents you have: Target creature card in your graveyard gains encore until end of turn. The encore cost is equal to its mana cost. (Exile the creature card and pay its mana cost: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)","power":"1","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48b597dd-f6eb-45da-977d-453e8c1433cc.jpg?1783928779","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48b597dd-f6eb-45da-977d-453e8c1433cc.jpg?1783928779","layout":"normal"});
const haldan = (): CardDef => ({"oracleId":"6a0b78fb-3838-47d9-8d1a-b6b0c0e8927d","name":"Haldan, Avid Arcanist","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Partner with Pako, Arcane Retriever (When this creature enters, target player may put Pako into their hand from their library, then shuffle.)\nYou may play lands and cast noncreature spells from among cards you exiled that have fetch counters on them, and you may spend mana as though it were mana of any color to cast those spells.","power":"1","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Partner with","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16a86a35-f7e5-434d-bf44-61ae7cb0f98b.jpg?1783931237","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16a86a35-f7e5-434d-bf44-61ae7cb0f98b.jpg?1783931237","layout":"normal"});
const pako = (): CardDef => ({"oracleId":"680a3e17-5144-4e97-bc59-9f5fc3ad6514","name":"Pako, Arcane Retriever","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Elemental Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Dog"],"oracleText":"Partner with Haldan, Avid Arcanist\nHaste\nWhenever Pako attacks, exile the top card of each player's library and put a fetch counter on each of them. Put a +1/+1 counter on Pako for each noncreature card exiled this way.","power":"3","toughness":"3","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Partner with","Haste","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/066c8f63-52e6-475e-8d27-6ee37e92fc05.jpg?1783931230","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/066c8f63-52e6-475e-8d27-6ee37e92fc05.jpg?1783931230","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","layout":"normal"});
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","layout":"normal"});
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","layout":"normal"});
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","layout":"normal"});
const swamp = (): CardDef => ({"oracleId":"56719f6a-1a6c-4c0a-8d21-18f7d7350b68","name":"Swamp","manaCost":"","cmc":0,"typeLine":"Basic Land — Swamp","supertypes":["Basic"],"types":["Land"],"subtypes":["Swamp"],"oracleText":"({T}: Add {B}.)","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","layout":"normal"});
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","layout":"normal"});
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","layout":"normal"});
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","layout":"normal"});
const bonecrusher = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","layout":"adventure","faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]});
const kazandu = (): CardDef => ({"oracleId":"2ac1c95c-2a9d-40bc-9cad-9cadfa3f19f7","name":"Kazandu Mammoth // Kazandu Valley","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Elephant // Land","supertypes":[],"types":["Creature"],"subtypes":["Elephant"],"oracleText":"Landfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Landfall"],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09c8c150-a0d8-4254-9169-7697e9c540da.jpg?1783929291","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09c8c150-a0d8-4254-9169-7697e9c540da.jpg?1783929291","layout":"modal_dfc","faces":[{"name":"Kazandu Mammoth","manaCost":"{1}{G}{G}","typeLine":"Creature — Elephant","supertypes":[],"types":["Creature"],"subtypes":["Elephant"],"oracleText":"Landfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn.","power":"3","toughness":"3","colors":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09c8c150-a0d8-4254-9169-7697e9c540da.jpg?1783929291","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09c8c150-a0d8-4254-9169-7697e9c540da.jpg?1783929291"},{"name":"Kazandu Valley","manaCost":"","typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\n{T}: Add {G}.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/0/9/09c8c150-a0d8-4254-9169-7697e9c540da.jpg?1783929291","artUrl":"https://cards.scryfall.io/art_crop/back/0/9/09c8c150-a0d8-4254-9169-7697e9c540da.jpg?1783929291"}]});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A fresh copy of `def` in one of `pid`'s zones (the library's top with "library"). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "exile" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes away all of `pid`'s lands, then gives them these. */
const lands = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")));
  const ids = defs.map((d) => putOnBattlefield(s, pid, d));
  invalidateCharacteristics(s);
  return ids;
};
/** Links an exiled card to the permanent it was exiled with (CR 607.2a), as its exile ability would. */
const link = (s: GameState, source: string, card: string) => {
  ((s.linkedExile ??= {})[`${source}@${s.objects[source]!.zoneChanges ?? 0}`] ??= []).push({ id: card, zc: s.objects[card]!.zoneChanges ?? 0 });
};
/** Moves a permanent to its owner's graveyard. */
const toYard = (s: GameState, id: string) => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[s.objects[id]!.owner]!.graveyard.push(id);
  invalidateCharacteristics(s);
};

describe("Ian Malcolm, Chaotician", () => {
  it("is supported", () => supported(ianMalcolm(), araumi(), haldan(), pako()));

  it("a player's second card drawn this turn has them exile their top card, linked to Ian; only once a turn", () => {
    const { s: s0, ap, ids } = setup([divination(), divination()]);
    const ian = putOnBattlefield(s0, s0.turnOrder[2]!, ianMalcolm());
    const top = putIn(s0, ap, lightningBolt(), "library");
    const drawn = s0.players[ap]!.library.slice(0, 3);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Divination's two draws: the second triggers Ian (rulings: whether or not Ian saw the first), for the drawing player.
    for (const id of drawn.slice(0, 2)) expect(zone(s, id)).toBe("hand");
    expect(zone(s, drawn[2]!)).toBe("exile");
    expect(s.players[ap]!.exile).toContain(drawn[2]!);
    expect(top).toBe(drawn[0]);
    expect(s.linkedExile?.[`${ian}@${s.objects[ian]!.zoneChanges ?? 0}`]?.map((l) => l.id)).toEqual([drawn[2]!]);
    // Two more draws the same turn: no second trigger this turn (rulings).
    const exiled = s.players[ap]!.exile.length;
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.exile.length).toBe(exiled);
  });

  it("on your turn you may cast one spell a turn from among the cards you don't own exiled with Ian, mana of any type", () => {
    const { s: s0, ap, opp } = setup([]);
    // An opponent's Ian: the permission is every player's (rulings).
    const ian = putOnBattlefield(s0, opp, ianMalcolm());
    const bolt = putIn(s0, opp, lightningBolt(), "exile");
    const bears = putIn(s0, s0.turnOrder[2]!, grizzlyBears(), "exile");
    link(s0, ian, bolt);
    link(s0, ian, bears);
    // Only Forests: green mana pays {R} (CR 609.4b).
    lands(s0, ap, [forest(), forest()]);
    expect(planCast(s0, ap, bolt, [ptgt(opp)])).not.toBeNull();
    expect(planCast(s0, ap, bears)).not.toBeNull();
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, bolt, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(life - 3);
    // It goes to its owner's graveyard.
    expect(s.players[opp]!.graveyard).toContain(bolt);
    // One spell this turn with that Ian.
    expect(planCast(s, ap, bears)).toBeNull();
    expect(castProblem(s, ap, bears)).toMatch(/only cast spells from your hand/);
  });

  it("not a card you own, not a card not exiled with Ian, not a land, not another player's turn, not once Ian has left", () => {
    const { s: s0, ap, opp } = setup([]);
    const ian = putOnBattlefield(s0, ap, ianMalcolm());
    const own = putIn(s0, ap, lightningBolt(), "exile");
    const unlinked = putIn(s0, opp, lightningBolt(), "exile");
    const land = putIn(s0, opp, forest(), "exile");
    const theirs = putIn(s0, ap === s0.turnOrder[0] ? s0.turnOrder[1]! : s0.turnOrder[0]!, lightningBolt(), "exile");
    link(s0, ian, own);
    link(s0, ian, land);
    link(s0, ian, theirs);
    expect(planCast(s0, ap, own, [ptgt(opp)])).toBeNull();
    expect(planCast(s0, ap, unlinked, [ptgt(opp)])).toBeNull();
    // "Cast a spell": a land card can't be played this way.
    expect(() => act(s0, { type: "playLand", player: ap, objectId: land })).toThrow();
    expect(planCast(s0, ap, theirs, [ptgt(opp)])).not.toBeNull();
    // Another player, during your turn: not their turn, so not for them (an instant they don't own, linked to Ian).
    expect(castProblem(s0, opp, own, [ptgt(ap)])).not.toBeNull();
    // Ian gone: no permission, even for the cards it exiled (CR 607.2a, 400.7).
    const s = structuredClone(s0);
    toYard(s, ian);
    expect(planCast(s, ap, theirs, [ptgt(opp)])).toBeNull();
  });

  it("a sorcery card keeps its timing (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    const ian = putOnBattlefield(s0, ap, ianMalcolm());
    const axe = putIn(s0, opp, lavaAxe(), "exile");
    link(s0, ian, axe);
    expect(planCast(s0, ap, axe, [ptgt(opp)])).not.toBeNull();
    // With a spell on the stack: not at sorcery speed (CR 307.1).
    const s = run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)]));
    expect(s.stack.length).toBe(1);
    expect(castProblem(s, ap, axe, [ptgt(opp)])).not.toBeNull();
  });
});

/** Encore (CR 702.141a): an ability of the card in the graveyard whose effect is the encore. */
const isEncore = (a: { zone?: string; body: { effects: { type: string }[] } }) => a.zone === "graveyard" && a.body.effects[0]?.type === "encore";

describe("Araumi of the Dead Tide", () => {
  it("exiles a card from your graveyard for each opponent; the creature card gains encore with its mana cost", () => {
    const { s: s0, ap } = setup([]);
    const araumiId = putOnBattlefield(s0, ap, araumi());
    const giant = putIn(s0, ap, hillGiant(), "graveyard");
    const fodder = [putIn(s0, ap, lightningBolt(), "graveyard"), putIn(s0, ap, shock(), "graveyard"), putIn(s0, ap, divination(), "graveyard")];
    // Two cards: three opponents need three (CR 602.2b, 601.2h).
    expect(planActivate(s0, ap, araumiId, 0, [target(giant)], undefined, undefined, undefined, { exileCards: fodder.slice(0, 2) })).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, araumiId, 0, [target(giant)], undefined, undefined, undefined, { exileCards: fodder })));
    for (const id of fodder) expect(zone(s, id)).toBe("exile");
    expect(s.objects[araumiId]!.tapped).toBe(true);
    const i = abilitiesOf(s, s.objects[giant]!).activated.findIndex(isEncore);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(abilitiesOf(s, s.objects[giant]!).activated[i]!.manaCost).toBe("{3}{R}");
    s = settle(run(s, planActivate(s, ap, giant, i)));
    expect(zone(s, giant)).toBe("exile");
    // A token copy for each opponent (CR 702.141a).
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "Hill Giant");
    expect(tokens.length).toBe(3);
  });

  it("counts only the opponents still in the game (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const araumiId = putOnBattlefield(s0, ap, araumi());
    const giant = putIn(s0, ap, hillGiant(), "graveyard");
    const fodder = [putIn(s0, ap, lightningBolt(), "graveyard"), putIn(s0, ap, shock(), "graveyard")];
    const gone = s0.turnOrder.find((p) => p !== ap)!;
    s0.players[gone]!.lost = true;
    const s = settle(run(s0, planActivate(s0, ap, araumiId, 0, [target(giant)], undefined, undefined, undefined, { exileCards: fodder })));
    for (const id of fodder) expect(zone(s, id)).toBe("exile");
    expect(abilitiesOf(s, s.objects[giant]!).activated.some(isEncore)).toBe(true);
  });

  it("a bot pays the cost with other cards than its target", () => {
    const { s: s0, ap } = setup([]);
    const araumiId = putOnBattlefield(s0, ap, araumi());
    const giant = putIn(s0, ap, hillGiant(), "graveyard");
    for (const d of [lightningBolt(), shock(), divination()]) putIn(s0, ap, d, "graveyard");
    const ab = abilitiesOf(s0, s0.objects[araumiId]!).activated[0]!;
    const costs = abilityCosts(s0, ap, s0.objects[araumiId]!, ab, [target(giant)]);
    expect(costs?.exileCards?.length).toBe(3);
    expect(costs?.exileCards).not.toContain(giant);
    const plan = planActivate(s0, ap, araumiId, 0, [target(giant)], undefined, undefined, undefined, costs!);
    expect(plan).not.toBeNull();
    const s = settle(run(s0, plan));
    expect(zone(s, giant)).toBe("graveyard");
    expect(s.players[ap]!.exile.length).toBe(3);
  });
});

describe("Haldan, Avid Arcanist", () => {
  const fetched = (s: GameState, owner: PlayerId, by: PlayerId, def: CardDef) => {
    const id = putIn(s, owner, def, "exile");
    s.objects[id]!.counters = { fetch: 1 };
    s.objects[id]!.exiledByPlayer = by;
    return id;
  };

  it("casts a noncreature spell you exiled with a fetch counter, mana as though of any color; not a creature spell", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, haldan());
    const bolt = fetched(s0, opp, ap, lightningBolt());
    const bears = fetched(s0, opp, ap, grizzlyBears());
    lands(s0, ap, [island(), island()]);
    expect(planCast(s0, ap, bears)).toBeNull();
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, bolt, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[opp]!.graveyard).toContain(bolt);
  });

  it("plays a land card as your land play; a creature's Adventure, a creature card's land face", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, haldan());
    const land = fetched(s0, opp, ap, forest());
    const giant = fetched(s0, opp, ap, bonecrusher());
    const mammoth = fetched(s0, opp, ap, kazandu());
    lands(s0, ap, [island(), island()]);
    // Bonecrusher Giant: only its Adventure, Stomp, an instant (rulings).
    expect(planCast(s0, ap, giant)).toBeNull();
    expect(planCast(s0, ap, giant, [ptgt(opp)], undefined, undefined, undefined, { face: 1 })).not.toBeNull();
    // Kazandu Mammoth: its land face, not the creature.
    expect(planCast(s0, ap, mammoth)).toBeNull();
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
    expect(s.objects[land]!.controller).toBe(ap);
    // One land a turn (rulings).
    expect(() => act(s, { type: "playLand", player: ap, objectId: mammoth, face: 1 })).toThrow();
    s = act(s0, { type: "playLand", player: ap, objectId: mammoth, face: 1 });
    expect(zone(s, mammoth)).toBe("battlefield");
  });

  it("only cards you exiled, with a fetch counter, while Haldan is on the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, haldan());
    const theirs = fetched(s0, opp, opp, lightningBolt());
    const noCounter = fetched(s0, opp, ap, lightningBolt());
    s0.objects[noCounter]!.counters = {};
    const ok = fetched(s0, opp, ap, lightningBolt());
    expect(planCast(s0, ap, theirs, [ptgt(opp)])).toBeNull();
    expect(planCast(s0, ap, noCounter, [ptgt(opp)])).toBeNull();
    expect(planCast(s0, ap, ok, [ptgt(opp)])).not.toBeNull();
    toYard(s0, h);
    expect(planCast(s0, ap, ok, [ptgt(opp)])).toBeNull();
  });

  it("Pako's attack exiles each player's top card with a fetch counter as cards you exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, haldan());
    const p = putOnBattlefield(s0, ap, pako());
    const tops = s0.turnOrder.map((pid) => putIn(s0, pid, lightningBolt(), "library"));
    let s = s0;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }] }));
    for (const id of tops) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.counters.fetch).toBe(1);
      expect(s.objects[id]!.exiledByPlayer).toBe(ap);
    }
    // Four noncreature cards: four +1/+1 counters.
    expect(s.objects[p]!.counters["+1/+1"]).toBe(4);
    // Instants, castable now in combat with any mana (rulings: the usual timing).
    expect(planCast(s, ap, tops[1]!, [ptgt(opp)])).not.toBeNull();
    // Leaving exile, a card is a new object with no counters: no longer one you exiled (CR 400.7).
    s = settle(run(s, planCast(s, ap, tops[1]!, [ptgt(opp)])));
    expect(s.objects[tops[1]!]!.exiledByPlayer).toBeUndefined();
  });
});

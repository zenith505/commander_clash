// Lane B round B182: Murktide Regent ("enters with a +1/+1 counter on it for each instant and sorcery card exiled with
// it", its delve's cards), Soulflayer (keywords of the creature cards its delve exiled), Lochmere Serpent (a graveyard
// ability with five targets in one opponent's graveyard), Skyclave Shade (a landfall trigger in the graveyard that lets it
// be cast this turn), Nightshade Assassin ("you may reveal X black cards in your hand"), Shadow Urchin ("exile that many
// cards", the counters on the creature that died), Barbed Wire ("Prevent the next 1 damage that would be dealt by ~") and
// Curse of Chaos ("that attacking player may discard a card. If the player does, they draw a card").

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const murktide = (): CardDef => ({"oracleId":"7f993ac7-c2cd-413c-a106-2c051a77ebf6","name":"Murktide Regent","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nFlying\nThis creature enters with a +1/+1 counter on it for each instant and sorcery card exiled with it.\nWhenever an instant or sorcery card leaves your graveyard, put a +1/+1 counter on this creature.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Delve"],"imageUrl":"https://cards.scryfall.io/normal/front/2/0/20c4aae1-7665-4df7-bd51-a1d95bf8a17d.jpg?1783926875","artUrl":"https://cards.scryfall.io/art_crop/front/2/0/20c4aae1-7665-4df7-bd51-a1d95bf8a17d.jpg?1783926875","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const soulflayer = (): CardDef => ({"oracleId":"d45cf9b1-d916-48bf-8b99-60cd09230a4b","name":"Soulflayer","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nIf a creature card with flying was exiled with this creature's delve ability, this creature has flying. The same is true for first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, reach, trample, and vigilance.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Delve"],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/5084c8ff-1296-4d8e-bd06-93b1a3401661.jpg?1783938694","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/5084c8ff-1296-4d8e-bd06-93b1a3401661.jpg?1783938694","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lochmere = (): CardDef => ({"oracleId":"99422efb-3b44-4025-ad1b-388fc48a669a","name":"Lochmere Serpent","manaCost":"{4}{U}{B}","cmc":6,"typeLine":"Creature — Serpent","supertypes":[],"types":["Creature"],"subtypes":["Serpent"],"oracleText":"Flash\n{U}, Sacrifice an Island: This creature can't be blocked this turn.\n{B}, Sacrifice a Swamp: You gain 1 life and draw a card.\n{U}{B}: Exile five target cards from an opponent's graveyard. Return this card from your graveyard to your hand. Activate only as a sorcery.","power":"7","toughness":"7","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/3/2/3287beea-747c-4cb6-aea5-051e85c5de8d.jpg?1783932595","artUrl":"https://cards.scryfall.io/art_crop/front/3/2/3287beea-747c-4cb6-aea5-051e85c5de8d.jpg?1783932595","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shade = (): CardDef => ({"oracleId":"2345b243-ed0d-4556-8017-d533db1fbc74","name":"Skyclave Shade","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Shade","supertypes":[],"types":["Creature"],"subtypes":["Shade"],"oracleText":"Kicker {2}{B}\nThis creature can't block.\nIf this creature was kicked, it enters with two +1/+1 counters on it.\nLandfall — Whenever a land you control enters, if this card is in your graveyard and it's your turn, you may cast it from your graveyard this turn.","power":"3","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Kicker","Landfall"],"imageUrl":"https://cards.scryfall.io/normal/front/0/5/05347539-de61-4a37-929f-c909e65033f5.jpg?1783929288","artUrl":"https://cards.scryfall.io/art_crop/front/0/5/05347539-de61-4a37-929f-c909e65033f5.jpg?1783929288","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const assassin = (): CardDef => ({"oracleId":"370c5e5f-709b-415b-9b65-3f224d6ef1c7","name":"Nightshade Assassin","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Creature — Human Assassin","supertypes":[],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"First strike\nWhen this creature enters, you may reveal X black cards in your hand. If you do, target creature gets -X/-X until end of turn.\nMadness {1}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Madness","First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/5364610a-7644-48ac-9a5b-1c1cfa67553c.jpg?1783932765","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/5364610a-7644-48ac-9a5b-1c1cfa67553c.jpg?1783932765","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const urchin = (): CardDef => ({"oracleId":"86bd332f-ba61-49a4-ad31-de4d7e3638c6","name":"Shadow Urchin","manaCost":"{2}{B/R}","cmc":3,"typeLine":"Creature — Ouphe","supertypes":[],"types":["Creature"],"subtypes":["Ouphe"],"oracleText":"Whenever this creature attacks, blight 1. (Put a -1/-1 counter on a creature you control.)\nWhenever a creature you control with one or more counters on it dies, exile that many cards from the top of your library. Until your next end step, you may play those cards.","power":"3","toughness":"4","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Blight"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4e54c39b-6149-467b-a9a8-7ad09ca0cbd4.jpg?1783904402","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4e54c39b-6149-467b-a9a8-7ad09ca0cbd4.jpg?1783904402","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wire = (): CardDef => ({"oracleId":"cdc6e187-73d2-4f79-a0ff-daa6d2de5bdb","name":"Barbed Wire","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, this artifact deals 1 damage to that player.\n{2}: Prevent the next 1 damage that would be dealt by this artifact this turn.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/be9e2e59-1527-4c61-9cc9-dcaf1181bd43.jpg?1783945915","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/be9e2e59-1527-4c61-9cc9-dcaf1181bd43.jpg?1783945915","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const nighthawk = (): CardDef => ({"oracleId":"feb244f8-bcb1-44cf-9940-2719221a7309","name":"Vampire Nighthawk","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const knight = (): CardDef => ({"oracleId":"7b51a979-47e0-4b98-8ec5-8064c83422e1","name":"Knight of Grace","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nHexproof from black (This creature can't be the target of black spells or abilities your opponents control.)\nThis creature gets +1/+0 as long as any player controls a black permanent.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Hexproof from","Hexproof","First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const duress = (): CardDef => ({"oracleId":"33d405ea-7a9a-4970-b70f-9c05d90dd6f0","name":"Duress","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/3557e601-9b71-4ce9-9047-1a8baa72e574.jpg?1783918048","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/3557e601-9b71-4ce9-9047-1a8baa72e574.jpg?1783918048","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const swampCard = (): CardDef => ({"oracleId":"56719f6a-1a6c-4c0a-8d21-18f7d7350b68","name":"Swamp","manaCost":"","cmc":0,"typeLine":"Basic Land — Swamp","supertypes":["Basic"],"types":["Land"],"subtypes":["Swamp"],"oracleText":"({T}: Add {B}.)","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const chaos = (): CardDef => ({"oracleId":"a242af4b-5de6-4961-b684-f4bd809977c6","name":"Curse of Chaos","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nWhenever a player attacks enchanted player with one or more creatures, that attacking player may discard a card. If the player does, they draw a card.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd95b9aa-1abb-4a10-a622-51a2bb578d17.jpg?1783939670","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd95b9aa-1abb-4a10-a622-51a2bb578d17.jpg?1783939670","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes (no attacks, no blocks; a bot answers anything else) until `done` holds. */
const passTill = (s: GameState, done: (s: GameState) => boolean) => {
  for (let i = 0; i < 4000 && !done(s); i++) {
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else if (s.pending) s = run(s, botActions(s, pid));
    else s = act(s, { type: "passPriority", player: pid });
  }
  if (!done(s)) throw new Error("never got there");
  return s;
};
const settled = (x: GameState) => !x.stack.length && !x.triggerQueue.length && !x.pending;
/** Passes until the stack and triggers are done, or something asks a question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** A card of `def` owned by `pid`, put into `where` (on top of the library). */
const place = (s: GameState, pid: PlayerId, def: CardDef, where: "graveyard" | "library" | "hand" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const pt = (s: GameState, id: ObjectId) => { const c = characteristics(s, s.objects[id]!); return `${c.power}/${c.toughness}`; };
const named = (s: GameState, name: string) => s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === name)!;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;

describe("Lane B round B182: cards", () => {
  it("compile", () => supported(murktide(), soulflayer(), lochmere(), shade(), assassin(), urchin(), wire(), chaos()));
});

describe("Murktide Regent: a +1/+1 counter for each instant and sorcery card exiled with it", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const yard = [place(s, ap, opt(), "graveyard"), place(s, ap, shock(), "graveyard"), place(s, ap, divination(), "graveyard"), place(s, ap, bears(), "graveyard")];
    // An instant exiled some other way isn't one of its cards.
    place(s, ap, opt(), "exile");
    const m = place(s, ap, murktide(), "hand");
    return { s, ap, opp, yard, m };
  };

  it("counts the instant and sorcery cards its delve exiled as it was cast, not the creature card", () => {
    const { s: s0, ap, yard, m } = scene();
    poolOnly(s0, ap, { U: 2, C: 1 });
    let s = castNow(s0, ap, m, [], { delve: yard });
    expect(yard.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
    s = settle(s);
    expect(zone(s, m)).toBe("battlefield");
    expect(s.objects[m]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, m)).toBe("6/6");
  });

  it("none without delve, and none when it's put onto the battlefield without being cast", () => {
    const { s: s0, ap, m } = scene();
    poolOnly(s0, ap, { U: 2, C: 5 });
    let s = settle(castNow(s0, ap, m, []));
    expect(zone(s, m)).toBe("battlefield");
    expect(s.objects[m]!.counters["+1/+1"] ?? 0).toBe(0);
    const { s: s1, ap: ap1 } = scene();
    const put = putOnBattlefield(s1, ap1, murktide());
    expect(s1.objects[put]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(pt(s1, put)).toBe("3/3");
  });

  it("an instant or sorcery card leaving your graveyard later puts a +1/+1 counter on it; delve's own exile doesn't (it wasn't on the battlefield)", () => {
    const { s: s0, ap, yard, m } = scene();
    const later = place(s0, ap, opt(), "graveyard");
    poolOnly(s0, ap, { U: 2, C: 1 });
    let s = settle(castNow(s0, ap, m, [], { delve: yard }));
    expect(s.objects[m]!.counters["+1/+1"]).toBe(3);
    expect(zone(s, later)).toBe("graveyard");
    // A second Murktide exiling that Opt with its delve: the first one's trigger sees it leave.
    const m2 = place(s, ap, murktide(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 2, C: 4 };
    s = settle(castNow(s, ap, m2, [], { delve: [later] }));
    expect(s.objects[m]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[m2]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Soulflayer: the keywords of the creature cards its delve exiled", () => {
  it("has each listed keyword a creature card its delve exiled has, a hexproof variant as that variant, and loses it when the card leaves exile", () => {
    const { s: s0, ap } = setup([]);
    const hawk = place(s0, ap, nighthawk(), "graveyard");
    const kn = place(s0, ap, knight(), "graveyard");
    const o = place(s0, ap, opt(), "graveyard");
    // A creature card with flying exiled some other way doesn't count.
    place(s0, ap, nighthawk(), "exile");
    const f = place(s0, ap, soulflayer(), "hand");
    poolOnly(s0, ap, { B: 2, C: 1 });
    let s = settle(castNow(s0, ap, f, [], { delve: [hawk, kn, o] }));
    expect(zone(s, f)).toBe("battlefield");
    const kws = characteristics(s, s.objects[f]!).keywords;
    for (const k of ["Flying", "Deathtouch", "Lifelink", "First strike", "Hexproof from black"]) expect(kws, k).toContain(k);
    for (const k of ["Hexproof", "Vigilance", "Trample", "Haste"]) expect(kws, k).not.toContain(k);
    // The Nighthawk card leaves exile: a new object, no longer exiled with it (CR 400.7).
    s.players[ap]!.exile.splice(s.players[ap]!.exile.indexOf(hawk), 1);
    s.objects[hawk]!.zone = "graveyard";
    s.objects[hawk]!.zoneChanges = (s.objects[hawk]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(hawk);
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[f]!, "Flying")).toBe(false);
    expect(objHasKeyword(s, s.objects[f]!, "First strike")).toBe(true);
  });

  it("put onto the battlefield without being cast, it has none of them", () => {
    const { s, ap } = setup([]);
    place(s, ap, nighthawk(), "exile");
    const f = putOnBattlefield(s, ap, soulflayer());
    expect(objHasKeyword(s, s.objects[f]!, "Flying")).toBe(false);
  });
});

describe("Lochmere Serpent: exile five target cards from an opponent's graveyard, return it from your graveyard", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const serpent = place(s, ap, lochmere(), "graveyard");
    const theirs = [opt(), shock(), divination(), bears(), duress(), opt()].map((d) => place(s, opp, d, "graveyard"));
    const elsewhere = place(s, other, opt(), "graveyard");
    const card = (id: ObjectId): TargetChoice => ({ kind: "object", id });
    return { s, ap, opp, other, serpent, theirs, elsewhere, card };
  };
  const ability = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]! && 2;

  it("works from the graveyard: the five cards are exiled and it returns to your hand", () => {
    const { s: s0, ap, serpent, theirs, card } = scene();
    let s = run(s0, planActivate(s0, ap, serpent, ability(s0, serpent), theirs.slice(0, 5).map(card)));
    s = settle(s);
    expect(theirs.slice(0, 5).map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile", "exile"]);
    expect(zone(s, theirs[5]!)).toBe("graveyard");
    expect(zone(s, serpent)).toBe("hand");
  });

  it("needs five targets, all in one opponent's graveyard, and only as a sorcery (rulings)", () => {
    const { s: s0, ap, serpent, theirs, elsewhere, card } = scene();
    expect(planActivate(s0, ap, serpent, 2, theirs.slice(0, 4).map(card))).toBeNull();
    expect(planActivate(s0, ap, serpent, 2, [...theirs.slice(0, 4), elsewhere].map(card))).toBeNull();
    // Not on the battlefield.
    const onField = putOnBattlefield(s0, ap, lochmere());
    expect(planActivate(s0, ap, onField, 2, theirs.slice(0, 5).map(card))).toBeNull();
    // Not with something on the stack.
    const sh = place(s0, ap, shock(), "hand");
    const s1 = run(s0, planCast(s0, ap, sh, [{ kind: "player", id: s0.turnOrder.find((p) => p !== ap)! }], undefined, "auto"));
    expect(planActivate(s1, ap, serpent, 2, theirs.slice(0, 5).map(card))).toBeNull();
  });

  it("with some targets gone the rest are exiled and it still returns; with all gone it doesn't resolve (rulings)", () => {
    const { s: s0, ap, opp, serpent, theirs, card } = scene();
    const gone = (s: GameState, id: ObjectId) => {
      s.players[opp]!.graveyard.splice(s.players[opp]!.graveyard.indexOf(id), 1);
      s.objects[id]!.zone = "hand";
      s.objects[id]!.zoneChanges = (s.objects[id]!.zoneChanges ?? 0) + 1;
      s.players[opp]!.hand.push(id);
    };
    let s = run(s0, planActivate(s0, ap, serpent, 2, theirs.slice(0, 5).map(card)));
    for (const id of theirs.slice(0, 4)) gone(s, id);
    s = settle(s);
    expect(zone(s, theirs[4]!)).toBe("exile");
    expect(zone(s, serpent)).toBe("hand");
    const { s: t0, ap: tap, serpent: ts, theirs: tt, card: tc } = scene();
    let t = run(t0, planActivate(t0, tap, ts, 2, tt.slice(0, 5).map(tc)));
    const oppT = t.objects[tt[0]!]!.owner;
    for (const id of tt.slice(0, 5)) {
      t.players[oppT]!.graveyard.splice(t.players[oppT]!.graveyard.indexOf(id), 1);
      t.objects[id]!.zone = "hand";
      t.objects[id]!.zoneChanges = (t.objects[id]!.zoneChanges ?? 0) + 1;
      t.players[oppT]!.hand.push(id);
    }
    t = settle(t);
    expect(zone(t, ts)).toBe("graveyard");
  });
});

describe("Skyclave Shade: a landfall trigger in the graveyard lets you cast it from there this turn", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const sh = place(s, ap, shade(), "graveyard");
    const land = place(s, ap, swampCard(), "hand");
    return { s, ap, opp, sh, land };
  };

  it("after a land enters on your turn you may cast it from your graveyard, kicked too, but only that object (rulings)", () => {
    const { s: s0, ap, sh, land } = scene();
    expect(planCast(s0, ap, sh, [], undefined, "auto", undefined, { via: "permission" })).toBeNull();
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    s = settle(s);
    expect(zone(s, sh)).toBe("graveyard");
    let s1 = settle(run(s, planCast(s, ap, sh, [], undefined, "auto", undefined, { via: "permission", kicks: [0] })));
    expect(zone(s1, sh)).toBe("battlefield");
    expect(s1.objects[sh]!.counters["+1/+1"]).toBe(2);
    expect(pt(s1, sh)).toBe("5/3");
    // Back in the graveyard it's a new object: no permission until another land enters.
    s1.battlefield.splice(s1.battlefield.indexOf(sh), 1);
    s1.objects[sh]!.zone = "graveyard";
    s1.objects[sh]!.zoneChanges = (s1.objects[sh]!.zoneChanges ?? 0) + 1;
    s1.objects[sh]!.counters = {};
    s1.players[ap]!.graveyard.push(sh);
    invalidateCharacteristics(s1);
    expect(planCast(s1, ap, sh, [], undefined, "auto", undefined, { via: "permission" })).toBeNull();
  });

  it("the permission lasts only this turn", () => {
    const { s: s0, ap, opp, sh, land } = scene();
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: land }));
    expect(planCast(s, ap, sh, [], undefined, "auto", undefined, { via: "permission" })).not.toBeNull();
    s = passTill(s, (x) => x.activePlayer !== ap && x.step === "main1");
    s = passTill(s, (x) => x.activePlayer === ap && x.step === "main1" && settled(x));
    expect(opp).not.toBe(ap);
    expect(planCast(s, ap, sh, [], undefined, "auto", undefined, { via: "permission" })).toBeNull();
  });

  it("an ability of the card in the graveyard, with \"it's your turn\" as an intervening if (CR 603.4)", () => {
    const t = compileCard(shade()).triggers.find((x) => x.event === "permanentEnters")!;
    expect(t.zone).toBe("graveyard");
    expect(t.ifCond).toEqual({ kind: "yourTurn" });
  });
});

describe("Nightshade Assassin: you may reveal X black cards in your hand; target creature gets -X/-X", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const a = place(s, ap, assassin(), "hand");
    const black = [place(s, ap, duress(), "hand"), place(s, ap, duress(), "hand")];
    const blue = place(s, ap, opt(), "hand");
    const hawk = putOnBattlefield(s, opp, nighthawk());
    return { s, ap, opp, a, black, blue, hawk };
  };
  /** Casts it and puts its trigger on the stack aimed at `target`, up to the reveal. */
  const toReveal = (s0: GameState, ap: PlayerId, a: ObjectId, target: ObjectId) => {
    let s = run(s0, planCast(s0, ap, a, [], undefined, "auto"));
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: target }] });
    return settle(s);
  };

  it("which black cards and how many are chosen as it resolves; X fixed then, -X/-X until end of turn", () => {
    const { s: s0, ap, a, black, blue, hawk } = scene();
    let s = toReveal(s0, ap, a, hawk);
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p?.kind).toBe("searchLibrary");
    expect([...(p.cards ?? [])].sort()).toEqual([...black].sort());
    expect(p.cards).not.toContain(blue);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [black[0]!] }));
    expect(pt(s, hawk)).toBe("1/2");
    // X stays what it was: a black card leaving the hand later doesn't change it.
    s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(black[1]!), 1);
    s.objects[black[1]!]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(black[1]!);
    invalidateCharacteristics(s);
    expect(pt(s, hawk)).toBe("1/2");
    expect(black.map((id) => zone(s, id))).toEqual(["hand", "graveyard"]);
    s = passTill(s, (x) => x.activePlayer !== ap);
    expect(pt(s, hawk)).toBe("2/3");
  });

  it("revealing both kills a 2/2; revealing none does nothing", () => {
    const { s: s0, ap, opp, a, black } = scene();
    const b = putOnBattlefield(s0, opp, bears());
    let s = toReveal(s0, ap, a, b);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: black }));
    expect(zone(s, b)).toBe("graveyard");
    const { s: t0, ap: tap, a: ta, hawk: th } = scene();
    let t = toReveal(t0, tap, ta, th);
    t = settle(act(t, { type: "searchLibrary", player: tap, found: [] }));
    expect(pt(t, th)).toBe("2/3");
  });

  it("with its target gone, nothing is revealed (rulings)", () => {
    const { s: s0, ap, opp, a, hawk } = scene();
    let s = run(s0, planCast(s0, ap, a, [], undefined, "auto"));
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: hawk }] });
    s.battlefield.splice(s.battlefield.indexOf(hawk), 1);
    s.objects[hawk]!.zone = "graveyard";
    s.objects[hawk]!.zoneChanges = (s.objects[hawk]!.zoneChanges ?? 0) + 1;
    s.players[opp]!.graveyard.push(hawk);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.stack.length).toBe(0);
  });
});

describe("Shadow Urchin: exile that many cards, the counters on the creature that died", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const u = putOnBattlefield(s, ap, urchin());
    const top = [opt(), shock(), divination(), duress(), opt()].map((d) => place(s, ap, d, "library")).reverse();
    const b = putOnBattlefield(s, ap, bears());
    return { s, ap, opp, u, top, b };
  };
  const kill = (s: GameState, id: ObjectId, counters: Record<string, number>) => {
    s.objects[id]!.counters = counters;
    invalidateCharacteristics(s);
    return settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
  };

  it("every counter on it as it died, +1/+1 and -1/-1 both (rulings); those cards may be played until your next end step", () => {
    const { s: s0, ap, top, b } = scene();
    // A 2/2 with a +1/+1 counter and three -1/-1 counters is 0/0: it dies with all four on it.
    let s = kill(s0, b, { "+1/+1": 1, "-1/-1": 3 });
    expect(zone(s, b)).toBe("graveyard");
    expect(top.slice(0, 4).map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
    expect(zone(s, top[4]!)).toBe("library");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
    expect(planCast(s, ap, top[0]!, [], undefined, "auto")).not.toBeNull();
  });

  it("only for a creature you control with counters on it", () => {
    const { s: s0, opp, top, b } = scene();
    let s = kill(s0, b, { "-1/-1": 2 });
    expect(top.slice(0, 2).map((id) => zone(s, id))).toEqual(["exile", "exile"]);
    const theirs = putOnBattlefield(s, opp, bears());
    s = kill(s, theirs, { "-1/-1": 2 });
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, top[2]!)).toBe("library");
  });
});

describe("Barbed Wire: prevent the next 1 damage that would be dealt by ~ this turn", () => {
  it("the shield stops its upkeep damage that turn; one made earlier is gone by the next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wire());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    // Made in your turn: it doesn't last to the next player's upkeep.
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    const oppLife = life(s, opp);
    s = passTill(s, (x) => x.activePlayer === opp && x.step === "upkeep" && x.stack.length > 0 && waitingOn(x) === ap);
    s = settle(s);
    expect(life(s, opp)).toBe(oppLife - 1);
    // Made in response at the next upkeep: that 1 damage is prevented.
    const thirdLife = life(s, third);
    s = passTill(s, (x) => x.activePlayer === third && x.step === "upkeep" && x.stack.length > 0 && waitingOn(x) === ap);
    s = run(s, planActivate(s, ap, w, 0));
    s = settle(s);
    expect(life(s, third)).toBe(thirdLife);
  });
});

describe("Curse of Chaos: that attacking player may discard a card, and if they do, draw a card", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const curse = putOnBattlefield(s, opp, chaos());
    s.objects[curse]!.attachedToPlayer = opp;
    const hitters = [putOnBattlefield(s, ap, bears()), putOnBattlefield(s, ap, bears())];
    const card = place(s, ap, duress(), "hand");
    return { s, ap, opp, curse, hitters, card };
  };
  const attackWith = (s0: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
    let s = passTill(s0, (x) => x.pending?.kind === "declareAttackers" && x.activePlayer === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks });
    return settle(s);
  };

  it("once for the attack however many creatures; the attacking player chooses the card, then draws", () => {
    const { s: s0, ap, opp, hitters, card } = scene();
    const kept = place(s0, ap, opt(), "hand");
    s0.players[ap]!.hand = [card, kept];
    let s = attackWith(s0, ap, hitters.map((h) => ({ attacker: h, defender: opp })));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [card] }));
    expect(zone(s, card)).toBe("graveyard");
    expect(zone(s, kept)).toBe("hand");
    expect(s.players[ap]!.hand).toHaveLength(2);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.stack.length).toBe(0);
  });

  it("declining does nothing, and with no cards in hand the player isn't asked", () => {
    const { s: s0, ap, opp, hitters, card } = scene();
    s0.players[ap]!.hand = [card];
    let s = attackWith(s0, ap, [{ attacker: hitters[0]!, defender: opp }]);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.hand).toEqual([card]);
    const { s: t0, ap: tap, opp: topp, hitters: th } = scene();
    t0.players[tap]!.hand = [];
    const t = attackWith(t0, tap, [{ attacker: th[0]!, defender: topp }]);
    expect(t.pending ?? undefined).toBeUndefined();
    expect(t.players[tap]!.hand).toHaveLength(0);
  });
});

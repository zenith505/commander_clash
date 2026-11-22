// Lane B round B297: Yixlid Jailer's "Cards in graveyards lose all abilities." (CR 613.1f, 613.6, 613.7, 613.8a and its
// rulings): every card in every graveyard loses its own abilities and those effects gave it earlier; an ability an effect
// gives it later stays; a spell another permission casts from a graveyard has its abilities on the stack (CR 601.2a).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, castProblem, dredgeAmount, characteristics, defOf, graveyardWays, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const jailer = (): CardDef => ({"oracleId":"1f55303e-1369-4e42-9ed4-36609887c7c1","name":"Yixlid Jailer","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Zombie Wizard","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Wizard"],"oracleText":"Cards in graveyards lose all abilities.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/f/ff6ba6a5-942d-44ff-87a9-3febf0b7e39b.jpg?1783943108","artUrl":"https://cards.scryfall.io/art_crop/front/f/f/ff6ba6a5-942d-44ff-87a9-3febf0b7e39b.jpg?1783943108","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const anger = (): CardDef => ({"oracleId":"eaabd151-2160-4bff-82c0-3fa88659be98","name":"Anger","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Incarnation","supertypes":[],"types":["Creature"],"subtypes":["Incarnation"],"oracleText":"Haste\nAs long as this card is in your graveyard and you control a Mountain, creatures you control have haste.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/484ade24-6c2c-4f7e-b561-da802a80e0bb.jpg?1783906264","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/484ade24-6c2c-4f7e-b561-da802a80e0bb.jpg?1783906264","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const thinkTwice = (): CardDef => ({"oracleId":"fa85c5a2-8e83-4624-a35a-a0bbf17ecbb4","name":"Think Twice","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const goyf = (): CardDef => ({"oracleId":"45900b2f-f6a9-4c42-9642-008f3c1cf6dd","name":"Tarmogoyf","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Lhurgoyf","supertypes":[],"types":["Creature"],"subtypes":["Lhurgoyf"],"oracleText":"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.","power":"*","toughness":"1+*","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8be5ee47-8f8a-4e3c-b1a1-9ca0e1fdec7f.jpg?1789127270","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8be5ee47-8f8a-4e3c-b1a1-9ca0e1fdec7f.jpg?1789127270","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const outcast = (): CardDef => ({"oracleId":"a61ef0cc-1da9-49f9-b0dc-01cf9f6205be","name":"Changeling Outcast","manaCost":"{B}","cmc":1,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const snapcaster = (): CardDef => ({"oracleId":"2bb2eda7-3b38-4c56-870f-c3218a1056f5","name":"Snapcaster Mage","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Flash\nWhen this creature enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. (You may cast that card from your graveyard for its flashback cost. Then exile it.)","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/4/c/4cbdacc1-7a1b-4633-85f5-eb50c2bf406d.jpg?1783936664","artUrl":"https://cards.scryfall.io/art_crop/front/4/c/4cbdacc1-7a1b-4633-85f5-eb50c2bf406d.jpg?1783936664","commanderLegal":"legal","set":"mm3","releasedAt":"2017-03-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bloodghast = (): CardDef => ({"oracleId":"e97f9c2b-b41e-4f36-9245-77c0ac125647","name":"Bloodghast","manaCost":"{B}{B}","cmc":2,"typeLine":"Creature — Vampire Spirit","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Spirit"],"oracleText":"This creature can't block.\nThis creature has haste as long as an opponent has 10 or less life.\nLandfall — Whenever a land you control enters, you may return this card from your graveyard to the battlefield.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Landfall"],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fdceefe6-f083-4955-b53a-8e6f8aeb2083.jpg?1783907898","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fdceefe6-f083-4955-b53a-8e6f8aeb2083.jpg?1783907898","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kozilek = (): CardDef => ({"oracleId":"7b8528b0-71eb-4c9e-bed9-aa2d2e84038f","name":"Kozilek, Butcher of Truth","manaCost":"{10}","cmc":10,"typeLine":"Legendary Creature — Eldrazi","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"When you cast this spell, draw four cards.\nAnnihilator 4 (Whenever this creature attacks, defending player sacrifices four permanents of their choice.)\nWhen Kozilek is put into a graveyard from anywhere, its owner shuffles their graveyard into their library.","power":"12","toughness":"12","colors":[],"colorIdentity":[],"keywords":["Annihilator"],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64b4b6cd-6d0f-4060-b51f-61f481000d51.jpg?1783921777","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64b4b6cd-6d0f-4060-b51f-61f481000d51.jpg?1783921777","commanderLegal":"legal","set":"2x2","releasedAt":"2022-07-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const yawgWill = (): CardDef => ({"oracleId":"322f0459-f394-44f0-977b-55fd0cbe0712","name":"Yawgmoth's Will","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, you may play lands and cast spells from your graveyard.\nIf a card would be put into your graveyard from anywhere this turn, exile that card instead.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d3e3c3a-d351-4d91-8884-312d4b6f540d.jpg?1783946334","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d3e3c3a-d351-4d91-8884-312d4b6f540d.jpg?1783946334","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thug = (): CardDef => ({"oracleId":"a426a258-fd8b-489c-8642-9868ee47de85","name":"Golgari Thug","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"When this creature dies, put target creature card from your graveyard on top of your library.\nDredge 4 (If you would draw a card, you may mill four cards instead. If you do, return this card from your graveyard to your hand.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Dredge","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fddee704-5315-4b35-9f77-0c12def26ce1.jpg?1783931626","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fddee704-5315-4b35-9f77-0c12def26ce1.jpg?1783931626","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const frog = (): CardDef => ({"oracleId":"74c4c1e2-c50d-4c8f-889a-0d5674dc6d67","name":"Turn to Frog","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/4/b43d9a1e-0767-4a9b-81b4-4ff2f3dde1d5.jpg?1783941086","artUrl":"https://cards.scryfall.io/art_crop/front/b/4/b43d9a1e-0767-4a9b-81b4-4ff2f3dde1d5.jpg?1783941086","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const breach = (): CardDef => ({"oracleId":"27e0948b-9916-473b-8d8c-a51bdfbc7457","name":"Underworld Breach","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\nAt the beginning of the end step, sacrifice this enchantment.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0e51d796-7279-4c06-87f0-37adbdaa41df.jpg?1783931543","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0e51d796-7279-4c06-87f0-37adbdaa41df.jpg?1783931543","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"rare","layout":"normal","gameChanger":true}) as CardDef;
const dregscape = (): CardDef => ({"oracleId":"be9d1346-4416-4ade-ae84-7a4121e0bd12","name":"Dregscape Zombie","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Unearth {B} ({B}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Unearth"],"imageUrl":"https://cards.scryfall.io/normal/front/4/b/4b65b7ad-4ab0-4622-81f4-434254625a1e.jpg?1783942567","artUrl":"https://cards.scryfall.io/art_crop/front/4/b/4b65b7ad-4ab0-4622-81f4-434254625a1e.jpg?1783942567","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mountainCard = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cairn = (): CardDef => ({"oracleId":"a549d54f-2640-455c-8a93-bef4df2f9e8b","name":"Cairn Wanderer","manaCost":"{4}{B}","cmc":5,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nAs long as a creature card with flying is in a graveyard, this creature has flying. The same is true for fear, first strike, double strike, deathtouch, haste, landwalk, lifelink, protection, reach, trample, shroud, and vigilance.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/b/8/b870a7aa-0836-4e3e-8be9-3299bdaded81.jpg?1783942893","artUrl":"https://cards.scryfall.io/art_crop/front/b/8/b870a7aa-0836-4e3e-8be9-3299bdaded81.jpg?1783942893","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const burst = (): CardDef => ({"oracleId":"ac2086fe-98ee-4280-9c7c-c5c2d6548a8b","name":"Burst Lightning","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.","colors":["R"],"colorIdentity":["R"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/f/9/f98b402a-ecdb-432f-a050-65945c8c415d.jpg?1783903920","artUrl":"https://cards.scryfall.io/art_crop/front/f/9/f98b402a-ecdb-432f-a050-65945c8c415d.jpg?1783903920","commanderLegal":"legal","set":"soa","releasedAt":"2026-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A copy of `def` in `pid`'s hand or graveyard (put there now, with a timestamp of its own). */
const put = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" = "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const o = (s: GameState, id: ObjectId) => s.objects[id]!;
const ways = (s: GameState, id: ObjectId, pid: PlayerId) => graveyardWays(s, o(s, id), pid).map((w) => w.kind);

describe("Lane B round B297: compiles", () => {
  it("Yixlid Jailer and the cards the tests use", () => supported(jailer(), anger(), thinkTwice(), goyf(), outcast(), snapcaster(), bloodghast(), kozilek(), yawgWill(), thug(), frog(), breach(), dregscape(), murder(), bolt(), bears(), cairn(), burst(), angel()));
  it("its line is a static ability of the permanent's", () => {
    const { s, ap } = setup([]);
    const j = putOnBattlefield(s, ap, jailer());
    expect(abilitiesOf(s, o(s, j)).statics.map((st) => st.mods[0]!.kind)).toEqual(["yardLoseAll"]);
  });
});

describe("Yixlid Jailer: cards in graveyards lose their own abilities", () => {
  it("Think Twice can't be cast with flashback while it's there (any player's Jailer), and can once it's gone", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const tt = put(s, ap, thinkTwice());
    expect(ways(s, tt, ap)).toContain("flashback");
    const j = putOnBattlefield(s, opp, jailer());
    expect(ways(s, tt, ap)).toEqual([]);
    expect(castProblem(s, ap, tt, undefined, undefined, undefined, undefined, undefined, { via: "flashback" })).not.toBeNull();
    expect(planCast(s, ap, tt, undefined, undefined, undefined, undefined, { via: "flashback" })).toBeNull();
    // Murder the Jailer: the card has flashback again.
    const m = put(s, ap, murder(), "hand");
    s = settle(run(s, planCast(s, ap, m, [target(j)])));
    expect(o(s, j).zone).toBe("graveyard");
    expect(ways(s, tt, ap)).toContain("flashback");
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, tt, undefined, undefined, undefined, undefined, { via: "flashback" })));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(o(s, tt).zone).toBe("exile");
  });

  it("Anger's graveyard static ability gives no haste, whatever the timestamps (it depends on the Jailer's effect, CR 613.8a)", () => {
    for (const angerFirst of [true, false]) {
      const { s, ap, opp } = setup([]);
      if (angerFirst) put(s, ap, anger());
      const b = putOnBattlefield(s, ap, bears(), { sick: true });
      const j = putOnBattlefield(s, opp, jailer());
      if (!angerFirst) put(s, ap, anger());
      invalidateCharacteristics(s);
      expect(objHasKeyword(s, o(s, b), "Haste"), `anger first: ${angerFirst}`).toBe(false);
      // Without the Jailer, Anger works (Mountains are in setup's lands).
      s.battlefield.splice(s.battlefield.indexOf(j), 1);
      o(s, j).zone = "exile";
      invalidateCharacteristics(s);
      expect(objHasKeyword(s, o(s, b), "Haste")).toBe(true);
    }
  });

  it("a Jailer that lost its abilities (Turn to Frog) doesn't apply: Anger works again", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const b = putOnBattlefield(s, ap, bears(), { sick: true });
    put(s, ap, anger());
    const j = putOnBattlefield(s, opp, jailer());
    expect(objHasKeyword(s, o(s, b), "Haste")).toBe(false);
    const f = put(s, ap, frog(), "hand");
    s = settle(run(s, planCast(s, ap, f, [target(j)])));
    expect(characteristics(s, o(s, j)).hasPrintedAbilities).toBe(false);
    expect(objHasKeyword(s, o(s, b), "Haste")).toBe(true);
  });

  it("Tarmogoyf in a graveyard is a 0/1; a changeling there is still every creature type, with no keywords", () => {
    const { s, ap, opp } = setup([]);
    const g = put(s, ap, goyf());
    const c = put(s, ap, outcast());
    put(s, ap, thinkTwice());
    expect(defOf(s, o(s, g)).power).not.toBe("0");
    putOnBattlefield(s, opp, jailer());
    invalidateCharacteristics(s);
    const gc = characteristics(s, o(s, g));
    expect([gc.power, gc.toughness]).toEqual([0, 1]);
    const cc = characteristics(s, o(s, c));
    expect(cc.allCreatureTypes).toBe(true);
    expect(cc.keywords).toEqual([]);
  });

  it("Cairn Wanderer doesn't get flying from a Serra Angel card in a graveyard (it reads the cards' keywords after the Jailer applies)", () => {
    for (const cairnFirst of [true, false]) {
      const { s, ap, opp } = setup([]);
      const w = cairnFirst ? putOnBattlefield(s, ap, cairn()) : undefined;
      put(s, opp, angel());
      const j = putOnBattlefield(s, opp, jailer());
      const w2 = w ?? putOnBattlefield(s, ap, cairn());
      invalidateCharacteristics(s);
      expect(objHasKeyword(s, o(s, w2), "Flying"), `cairn first: ${cairnFirst}`).toBe(false);
      s.battlefield.splice(s.battlefield.indexOf(j), 1);
      o(s, j).zone = "exile";
      invalidateCharacteristics(s);
      expect(objHasKeyword(s, o(s, w2), "Flying")).toBe(true);
    }
  });

  it("Dregscape Zombie has no unearth ability there; Golgari Thug's dredge isn't offered", () => {
    const { s, ap, opp } = setup([]);
    const z = put(s, ap, dregscape());
    const t = put(s, ap, thug());
    const unearth = () => abilitiesOf(s, o(s, z)).activated.filter((a) => a.zone === "graveyard").length;
    expect(unearth()).toBe(1);
    expect(dredgeAmount(s, ap, t)).toBe(4);
    putOnBattlefield(s, opp, jailer());
    invalidateCharacteristics(s);
    expect(unearth()).toBe(0);
    expect(planActivate(s, ap, z, 0)).toBeNull();
    expect(dredgeAmount(s, ap, t)).toBeUndefined();
  });

  it("Bloodghast's landfall ability doesn't trigger from the graveyard (it does without the Jailer)", () => {
    for (const withJailer of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      let s = s0;
      const g = put(s, ap, bloodghast());
      if (withJailer) putOnBattlefield(s, opp, jailer());
      const land = put(s, ap, mountainCard(), "hand");
      s = act(s, { type: "playLand", player: ap, objectId: land });
      expect(s.stack.length + s.triggerQueue.length + (s.pending ? 1 : 0), `jailer: ${withJailer}`).toBe(withJailer ? 0 : 1);
      expect(o(s, g).zone).toBe("graveyard");
    }
  });

  it("Kozilek's 'put into a graveyard from anywhere' ability doesn't trigger, even from the battlefield (rulings)", () => {
    for (const withJailer of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      let s = s0;
      const k = putOnBattlefield(s, opp, kozilek());
      if (withJailer) putOnBattlefield(s, ap, jailer());
      put(s, opp, bears());
      const m = put(s, ap, murder(), "hand");
      s = settle(run(s, planCast(s, ap, m, [target(k)])));
      // With the Jailer its graveyard isn't shuffled into its library; without it, it is.
      expect(s.players[opp]!.graveyard.includes(k), `jailer: ${withJailer}`).toBe(withJailer);
    }
  });
});

describe("Yixlid Jailer: abilities effects give cards in graveyards, by timestamp (CR 613.7)", () => {
  it("flashback Snapcaster Mage gave before the Jailer arrived is gone; given after it, it stays", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const tt = put(s, ap, bolt());
    const sc = put(s, ap, snapcaster(), "hand");
    s = settle(run(s, planCast(s, ap, sc)));
    if (s.pending) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(tt)] } as Action));
    expect(ways(s, tt, ap)).toContain("grantedFlashback");
    const j = putOnBattlefield(s, opp, jailer());
    expect(ways(s, tt, ap)).toEqual([]);
    // A second Bolt, given flashback after the Jailer arrived.
    const late = put(s, ap, bolt());
    const sc2 = put(s, ap, snapcaster(), "hand");
    s = settle(run(s, planCast(s, ap, sc2)));
    if (s.pending) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(late)] } as Action));
    expect(ways(s, late, ap)).toContain("grantedFlashback");
    expect(ways(s, tt, ap)).toEqual([]);
    void j;
  });

  it("escape from Underworld Breach: gone if the Breach is the older, kept if it's the newer", () => {
    for (const breachFirst of [true, false]) {
      const { s, ap, opp } = setup([]);
      const b = put(s, ap, bolt());
      if (breachFirst) putOnBattlefield(s, ap, breach());
      putOnBattlefield(s, opp, jailer());
      if (!breachFirst) putOnBattlefield(s, ap, breach());
      for (let i = 0; i < 3; i++) put(s, ap, bears());
      invalidateCharacteristics(s);
      expect(ways(s, b, ap).includes("grantedEscape"), `breach first: ${breachFirst}`).toBe(!breachFirst);
    }
  });
});

describe("Yixlid Jailer: a spell another permission casts from a graveyard has its abilities on the stack (rulings)", () => {
  it("Yawgmoth's Will: Lightning Bolt cast from the graveyard deals 3 damage; Burst Lightning can be kicked", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    putOnBattlefield(s, opp, jailer());
    const lb = put(s, ap, bolt());
    const bl = put(s, ap, burst());
    const w = put(s, ap, yawgWill(), "hand");
    s = settle(run(s, planCast(s, ap, w)));
    expect(ways(s, lb, ap)).toContain("permission");
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, lb, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "permission" })));
    expect(s.players[opp]!.life).toBe(life - 3);
    s = settle(run(s, planCast(s, ap, bl, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "permission", kicks: [0] })));
    expect(s.players[opp]!.life).toBe(life - 7);
  });
});

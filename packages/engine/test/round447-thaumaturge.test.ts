// Round 447: Battlefield Thaumaturge's "Each instant and sorcery spell you cast costs {1} less to cast for each creature it
// targets." (a cost reduction worked out after the targets are chosen, CR 601.2c, 601.2f; generic mana only; each target
// that's a creature counts, one targeted twice twice, rulings; creatures on the battlefield, CR 109.2).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, objHasKeyword, planCast, spellCost, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const thaumaturge = (): CardDef => ({"oracleId":"70d2f5f7-f727-48e1-9532-8d365b1c1ae5","name":"Battlefield Thaumaturge","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Each instant and sorcery spell you cast costs {1} less to cast for each creature it targets.\nHeroic — Whenever you cast a spell that targets this creature, this creature gains hexproof until end of turn.","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Heroic"],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/467ffc93-b107-457c-af04-a1b682a4b886.jpg?1783939450","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/467ffc93-b107-457c-af04-a1b682a4b886.jpg?1783939450","commanderLegal":"legal","set":"jou","releasedAt":"2014-05-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const conduct = (): CardDef => ({"oracleId":"0369627e-3b83-4e5b-a8af-a99f944443b3","name":"Conduct Electricity","manaCost":"{4}{R}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Conduct Electricity deals 6 damage to target creature and 2 damage to up to one target creature token.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/f/2f373dd6-2412-453c-85ba-10230dfe473a.jpg?1783910823","artUrl":"https://cards.scryfall.io/art_crop/front/2/f/2f373dd6-2412-453c-85ba-10230dfe473a.jpg?1783910823","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const arc = (): CardDef => ({"oracleId":"5acc8b39-3c3e-4012-8cfd-ac3c2c4ca982","name":"Arc Lightning","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Arc Lightning deals 3 damage divided as you choose among one, two, or three targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/35c7c392-6782-40c8-bb24-6aad24f14660.jpg?1783939076","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/35c7c392-6782-40c8-bb24-6aad24f14660.jpg?1783939076","commanderLegal":"legal","set":"ktk","releasedAt":"2014-09-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const roil = (): CardDef => ({"oracleId":"c2898bbd-82a4-4d26-b6ee-169b0ebe71b4","name":"Into the Roil","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/899540b0-c17a-4a73-912c-9b8925203de1.jpg?1783929397","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/899540b0-c17a-4a73-912c-9b8925203de1.jpg?1783929397","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const extra = (s: GameState, pid: PlayerId, id: ObjectId, targets: TargetChoice[]) => spellCost(s, pid, s.objects[id]!, 0, [], { targets }).extra;

describe("Round 447: Battlefield Thaumaturge", () => {
  it("compiles", () => {
    for (const d of [thaumaturge(), conduct(), arc(), roil(), pacifism()]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("{1} less for each target that's a creature, a creature targeted twice counting twice", () => {
    const { s, ap, ids, opp } = setup([conduct(), arc()]);
    putOnBattlefield(s, ap, thaumaturge());
    const a = putOnBattlefield(s, opp, bears());
    const b = putOnBattlefield(s, opp, bears());
    s.objects[b]!.isToken = true;
    // Conduct Electricity {4}{R}: one creature, then a creature token as well, then that token as both targets (rulings).
    expect(extra(s, ap, ids[0]!, [tgt(a)])).toBe(3);
    expect(extra(s, ap, ids[0]!, [tgt(a), tgt(b)])).toBe(2);
    expect(extra(s, ap, ids[0]!, [tgt(b), tgt(b)])).toBe(2);
    // Arc Lightning {2}{R}: a player isn't a creature; two creatures take off both generic mana, never the {R}.
    expect(extra(s, ap, ids[1]!, [{ kind: "player", id: opp }])).toBe(2);
    expect(extra(s, ap, ids[1]!, [tgt(a), { kind: "player", id: opp }])).toBe(1);
    const c = spellCost(s, ap, s.objects[ids[1]!]!, 0, [], { targets: [tgt(a), tgt(b), { kind: "player", id: opp }] });
    expect(c.extra).toBe(0);
    expect(c.cost.symbols).toEqual([{ kind: "colored", color: "R" }]);
  });

  it("only instants and sorceries, only its controller's, only creatures", () => {
    const { s, ap, ids, opp } = setup([roil(), pacifism()]);
    putOnBattlefield(s, ap, thaumaturge());
    const a = putOnBattlefield(s, opp, bears());
    const land = s.battlefield.find((id) => s.objects[id]!.owner === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"))!;
    // Into the Roil {1}{U}: a creature, {U}; a land, {1}{U}.
    expect(extra(s, ap, ids[0]!, [tgt(a)])).toBe(0);
    expect(extra(s, ap, ids[0]!, [tgt(land)])).toBe(1);
    // An Aura spell targets the creature it will enchant, but isn't an instant or sorcery.
    expect(extra(s, ap, ids[1]!, [tgt(a)])).toBe(1);
    // An opponent's instant isn't reduced.
    const theirs = putOnBattlefield(s, opp, roil());
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "hand";
    s.players[opp]!.hand.push(theirs);
    expect(extra(s, opp, theirs, [tgt(a)])).toBe(1);
  });

  it("casting pays the reduced cost, and heroic gives it hexproof", () => {
    const { s: s0, ap, ids, opp } = setup([conduct()]);
    const th = putOnBattlefield(s0, ap, thaumaturge());
    const b = putOnBattlefield(s0, opp, bears());
    s0.objects[b]!.isToken = true;
    const untapped = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && !s.objects[id]!.tapped).length;
    const before = untapped(s0);
    // Conduct Electricity at Battlefield Thaumaturge and the token: {4}{R} less {2}.
    const plan = planCast(s0, ap, ids[0]!, [tgt(th), tgt(b)]);
    expect(plan).not.toBeNull();
    let s = s0;
    for (const x of plan!) s = act(s, x);
    expect(before - untapped(s)).toBe(3);
    // Heroic resolves first: hexproof, so Conduct Electricity's 6 damage has an illegal target there (CR 608.2b).
    for (let i = 0; i < 40 && s.triggerQueue.length + s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(objHasKeyword(s, s.objects[th]!, "Hexproof")).toBe(true);
  });
});

// Lane B round B298: Snowfall's "Whenever an Island is tapped for mana, its controller may add an additional {U}. If that
// Island is snow, its controller may add an additional {U}{U} instead. Spend this mana only to pay cumulative upkeep costs."
// (CR 605.1b, 605.4a, 106.6, 106.12, 702.24a and its ruling): an optional triggered mana ability whose mana can pay only
// cumulative upkeep costs, any permanent's, and autopay leaves it out of every other payment.

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, manaOptions, planCast, planMana, parseManaCost, mayPayUse, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const snowfall = (): CardDef => ({"oracleId":"5ffed544-1656-4753-ac8f-ad8fb4442c7f","name":"Snowfall","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {U} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever an Island is tapped for mana, its controller may add an additional {U}. If that Island is snow, its controller may add an additional {U}{U} instead. Spend this mana only to pay cumulative upkeep costs.","colors":["U"],"colorIdentity":["U"],"keywords":["Cumulative upkeep"],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/788ed793-3993-4a63-b9f9-9ac3947c3108.jpg?1783947509","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/788ed793-3993-4a63-b9f9-9ac3947c3108.jpg?1783947509","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const snowIsland = (): CardDef => ({"oracleId":"5b2460a5-6ae5-4cad-ba94-1a9e98e6e4c0","name":"Snow-Covered Island","manaCost":"","cmc":0,"typeLine":"Basic Snow Land — Island","supertypes":["Basic","Snow"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0dcf8c0a-cf91-42a0-a54e-da5e7c697ee3.jpg?1783928166","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0dcf8c0a-cf91-42a0-a54e-da5e7c697ee3.jpg?1783928166","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const islandCard = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const remora = (): CardDef => ({"oracleId":"8a52f3c0-2552-4425-b2e3-5496eb2232a7","name":"Mystic Remora","manaCost":"{U}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.","colors":["U"],"colorIdentity":["U"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/40140991-cffa-4b52-9a25-37e9a8aa9ddd.jpg?1783918491","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/40140991-cffa-4b52-9a25-37e9a8aa9ddd.jpg?1783918491","commanderLegal":"legal","set":"dmr","releasedAt":"2023-01-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const manaFlare = (): CardDef => ({"oracleId":"97159138-c34b-416e-b079-5c952383a243","name":"Mana Flare","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player taps a land for mana, that player adds one mana of any type that land produced.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/3/f/3f0b8b24-7272-4d1a-af4a-c3a1b89a7e04.jpg?1783914921","artUrl":"https://cards.scryfall.io/art_crop/front/3/f/3f0b8b24-7272-4d1a-af4a-c3a1b89a7e04.jpg?1783914921","commanderLegal":"legal","set":"wot","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const yurlok = (): CardDef => ({"oracleId":"7baaf462-b0e6-4e21-86a7-73a883c4c9f7","name":"Yurlok of Scorch Thrash","manaCost":"{1}{B}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Lizard Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Lizard","Shaman"],"oracleText":"Vigilance\nA player losing unspent mana causes that player to lose that much life.\n{1}, {T}: Each player adds {B}{R}{G}.","power":"4","toughness":"4","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Vigilance"],"producedMana":["B","G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ead8a1f5-6260-47fa-a649-43711ec5bbeb.jpg?1783928767","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ead8a1f5-6260-47fa-a649-43711ec5bbeb.jpg?1783928767","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const o = (s: GameState, id: ObjectId) => s.objects[id]!;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Removes `pid`'s lands: what's left to pay with is what a test puts there. */
const noLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield.filter((x) => o(s, x).controller === pid && characteristics(s, o(s, x)).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    o(s, id).zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
/** A copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o(s, id).zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const tapIsland = (s: GameState, pid: PlayerId, id: ObjectId, extra?: string[]) => act(s, { type: "activateMana", player: pid, objectId: id, mana: "U", ability: 0, ...(extra ? { extra } : {}) } as Action);
/** The mana in `pid`'s pool that's restricted to cumulative upkeep costs. */
const upkeepOnly = (s: GameState, pid: PlayerId) => (s.players[pid]!.manaLots ?? []).filter((l) => l.only?.cumulativeUpkeep).reduce((n, l) => n + l.n, 0);
/** `pid`'s upkeep with only `lands` and Snowfall (`age` counters) on their side, at Snowfall's cumulative upkeep question. */
const atUpkeep = (lands: CardDef[], age: number, also: CardDef[] = []) => {
  let { s, opp } = setup([]);
  noLands(s, opp);
  s.players[opp]!.hand = [];
  const snow = putOnBattlefield(s, opp, snowfall());
  o(s, snow).counters.age = age;
  const ids = lands.map((d) => putOnBattlefield(s, opp, d));
  const extra = also.map((d) => putOnBattlefield(s, opp, d));
  s = passUntil(s, "upkeep", opp);
  for (let i = 0; i < 30 && !(s.pending?.kind === "chooseMay" && (s.pending as { upkeepOf?: string }).upkeepOf === snow); i++) {
    if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  expect(s.pending).toMatchObject({ kind: "chooseMay", upkeepOf: snow });
  return { s, opp, snow, ids, extra };
};

describe("Lane B round B298: Snowfall compiles", () => {
  it("Snowfall and the cards the tests use", () => supported(snowfall(), snowIsland(), islandCard(), remora(), divination(), manaFlare(), yurlok()));
  it("its line is an optional triggered mana ability with more for a snow Island and mana only for cumulative upkeep", () => {
    const { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, snowfall());
    const [t] = abilitiesOf(s, o(s, id)).manaTriggers ?? [];
    expect(t).toMatchObject({ may: true, adds: { kind: "fixed", mana: ["U"] }, snowAdds: ["U", "U"], spend: { cumulativeUpkeep: true }, filter: { subtypes: ["Island"] } });
    // Its cumulative upkeep {U} is still a trigger of its own.
    expect(abilitiesOf(s, o(s, id)).triggers.some((x) => x.body.effects[0]?.type === "cumulativeUpkeep")).toBe(true);
  });
});

describe("Lane B round B298: Snowfall's mana", () => {
  it("an Island gives a choice: no more mana, or {U} more; a snow Island {U}{U} more; other lands nothing", () => {
    const { s, ap } = setup([]);
    noLands(s, ap);
    putOnBattlefield(s, ap, snowfall());
    const [isl, snowy] = [putOnBattlefield(s, ap, islandCard()), putOnBattlefield(s, ap, snowIsland())];
    expect(manaOptions(s, o(s, isl)).map((x) => [x.adds.join(""), x.extra?.join("") ?? "", x.limited?.length ?? 0])).toEqual([["U", "", 0], ["UU", "U", 1]]);
    expect(manaOptions(s, o(s, snowy)).map((x) => [x.adds.join(""), x.extra?.join("") ?? "", x.limited?.length ?? 0])).toEqual([["U", "", 0], ["UUU", "UU", 2]]);
    const { s: s2, ap: ap2 } = setup([]);
    putOnBattlefield(s2, ap2, snowfall());
    const forest = s2.battlefield.find((id) => characteristics(s2, o(s2, id)).name === "Forest")!;
    expect(manaOptions(s2, o(s2, forest)).map((x) => x.adds.join(""))).toEqual(["G"]);
  });

  it("declining adds only the Island's {U}; taking it adds {U} more that can't be spent on a spell (CR 106.6)", () => {
    let { s, ap } = setup([]);
    noLands(s, ap);
    putOnBattlefield(s, ap, snowfall());
    const [a, b, c] = [putOnBattlefield(s, ap, islandCard()), putOnBattlefield(s, ap, islandCard()), putOnBattlefield(s, ap, snowIsland())];
    const div = inHand(s, ap, divination());
    s = tapIsland(s, ap, a);
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(upkeepOnly(s, ap)).toBe(0);
    s = tapIsland(s, ap, b, ["U"]);
    expect(s.players[ap]!.manaPool.U).toBe(3);
    expect(upkeepOnly(s, ap)).toBe(1);
    s = tapIsland(s, ap, c, ["U", "U"]);
    expect(s.players[ap]!.manaPool.U).toBe(6);
    expect(upkeepOnly(s, ap)).toBe(3);
    // Six {U} in the pool, but only three of them can pay for Divination's {2}{U}: enough here, and those three are spent.
    s = run(s, planCast(s, ap, div));
    expect(o(s, div).zone).toBe("stack");
    expect(s.players[ap]!.manaPool.U).toBe(3);
    expect(upkeepOnly(s, ap)).toBe(3);
  });

  it("autopay never takes it for a spell: Divination with three Islands taps each one without it", () => {
    let { s, ap } = setup([]);
    noLands(s, ap);
    putOnBattlefield(s, ap, snowfall());
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, islandCard());
    const div = inHand(s, ap, divination());
    const plan = planCast(s, ap, div)!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(3);
    expect(plan.some((a) => a.type === "activateMana" && (a as { extra?: string[] }).extra?.length)).toBe(false);
    s = run(s, plan);
    expect(o(s, div).zone).toBe("stack");
    expect(s.players[ap]!.manaPool.U).toBe(0);
    // And with two Islands, Snowfall's mana doesn't make it castable.
    let { s: s2, ap: ap2 } = setup([]);
    noLands(s2, ap2);
    putOnBattlefield(s2, ap2, snowfall());
    putOnBattlefield(s2, ap2, islandCard());
    putOnBattlefield(s2, ap2, snowIsland());
    expect(planCast(s2, ap2, inHand(s2, ap2, divination()))).toBeNull();
  });

  it("pays its own cumulative upkeep: two age counters' {U}{U} from one snow Island, and the bot keeps Snowfall", () => {
    let { s, opp, snow, ids } = atUpkeep([snowIsland()], 1);
    expect(s.pending).toMatchObject({ pay: { mana: "{U}{U}" } });
    // The bot's plan taps the snow Island taking Snowfall's {U}{U} (one of it is enough with the Island's own {U}).
    const plan = planMana(s, opp, parseManaCost("{U}{U}"), 0, undefined, [], mayPayUse(s, s.pending as { upkeepOf?: string }))!;
    expect(plan).toHaveLength(1);
    expect((plan[0] as { extra?: string[] }).extra).toEqual(["U", "U"]);
    for (const a of botActions(s, opp)) s = act(s, a);
    expect(o(s, snow).zone).toBe("battlefield");
    expect(o(s, snow).counters.age).toBe(2);
    expect(o(s, ids[0]!).tapped).toBe(true);
    // One {U} left over.
    expect(s.players[opp]!.manaPool.U).toBe(1);
  });

  it("without the Island's snow, {U}{U} needs both of its {U}; three age counters can't be paid with one Island", () => {
    let { s, opp, snow, ids } = atUpkeep([islandCard()], 1);
    s = tapIsland(s, opp, ids[0]!, ["U"]);
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(o(s, snow).zone).toBe("battlefield");
    expect(s.players[opp]!.manaPool.U).toBe(0);
    // Three age counters: {U}{U}{U}, more than one Island and Snowfall's {U} make, so it isn't asked (it can't be paid).
    let { s: s3, opp: p3 } = setup([]);
    noLands(s3, p3);
    s3.players[p3]!.hand = [];
    const snow3 = putOnBattlefield(s3, p3, snowfall());
    o(s3, snow3).counters.age = 2;
    putOnBattlefield(s3, p3, islandCard());
    s3 = passUntil(s3, "upkeep", p3);
    for (let i = 0; i < 30 && o(s3, snow3).zone === "battlefield"; i++) {
      expect((s3.pending as { upkeepOf?: string } | null)?.upkeepOf).not.toBe(snow3);
      if (s3.pending) for (const a of botActions(s3, s3.pending.player)) s3 = act(s3, a);
      else s3 = act(s3, { type: "passPriority", player: waitingOn(s3)! });
    }
    expect(o(s3, snow3).zone).toBe("graveyard");
  });

  it("any cumulative upkeep cost, generic too: one snow Island pays Snowfall's {U} and Mystic Remora's {1}", () => {
    let { s, opp } = setup([]);
    noLands(s, opp);
    s.players[opp]!.hand = [];
    const [snow, rem, isl] = [putOnBattlefield(s, opp, snowfall()), putOnBattlefield(s, opp, remora()), putOnBattlefield(s, opp, snowIsland())];
    s = passUntil(s, "upkeep", opp);
    const asked: ObjectId[] = [];
    for (let i = 0; i < 40 && asked.length < 2; i++) {
      const p = s.pending as { kind: string; upkeepOf?: string } | null;
      if (p?.kind === "chooseMay" && p.upkeepOf) {
        asked.push(p.upkeepOf);
        // The first question taps the Island, taking Snowfall's {U}{U}: three {U}, enough for both.
        if (asked.length === 1) s = tapIsland(s, opp, isl, ["U", "U"]);
        s = act(s, { type: "chooseMay", player: opp, yes: true });
      } else if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked.sort()).toEqual([snow, rem].sort());
    expect(o(s, snow).zone).toBe("battlefield");
    expect(o(s, rem).zone).toBe("battlefield");
    expect(s.players[opp]!.manaPool.U).toBe(1);
  });

  it("with Mana Flare too, the picks stay apart: Flare's {U} always, Snowfall's only when chosen", () => {
    let { s, ap } = setup([]);
    noLands(s, ap);
    putOnBattlefield(s, ap, snowfall());
    putOnBattlefield(s, ap, manaFlare());
    const isl = putOnBattlefield(s, ap, islandCard());
    const opts = manaOptions(s, o(s, isl));
    expect(opts.map((x) => x.adds.length).sort()).toEqual([2, 3]);
    const take = opts.find((x) => x.adds.length === 3)!;
    s = tapIsland(s, ap, isl, take.extra);
    expect(s.players[ap]!.manaPool.U).toBe(3);
    expect(upkeepOnly(s, ap)).toBe(1);
  });

  it("with Yurlok's mana burn, declining keeps the life: the bot's spell payments never add it", () => {
    let { s, ap } = setup([]);
    noLands(s, ap);
    putOnBattlefield(s, ap, snowfall());
    putOnBattlefield(s, ap, yurlok());
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, islandCard());
    const div = inHand(s, ap, divination());
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, div));
    for (let i = 0; i < 20 && s.step === "main1"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.life).toBe(life);
  });
});

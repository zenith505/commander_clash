// Lane B round B185: Haunting Imitation ("Each player reveals the top card of their library. For each creature card
// revealed this way, create a token that's a copy of that card, except ..."), Bloodbond March ("each player returns all
// cards with the same name as that spell from their graveyard to the battlefield"), Prince of Thralls ("put that card onto
// the battlefield under your control unless that opponent pays 3 life"), Urza's Sylex ("Each player chooses six lands they
// control. Destroy all other permanents." and "When ~ is put into exile from the battlefield"), Volcano Hellion (echo {X}
// where X is your life total, and "an amount of damage of your choice"), Manifold Insights (each opponent chooses a
// different nonland card from among the top ten), Mirror Match (a token copy of each creature attacking you, blocking it).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const imitation = (): CardDef => ({"oracleId":"c96ed5b2-6286-4f54-becb-c07f54335e63","name":"Haunting Imitation","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player reveals the top card of their library. For each creature card revealed this way, create a token that's a copy of that card, except it's 1/1, it's a Spirit in addition to its other types, and it has flying. If no creature cards were revealed this way, return Haunting Imitation to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/8418fd80-2c92-40d4-87de-0c149f6815bc.jpg?1783925003","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/8418fd80-2c92-40d4-87de-0c149f6815bc.jpg?1783925003","commanderLegal":"legal","set":"voc","releasedAt":"2021-11-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const march = (): CardDef => ({"oracleId":"fc17d8dd-887f-405e-a195-777aa3da36f5","name":"Bloodbond March","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player casts a creature spell, each player returns all cards with the same name as that spell from their graveyard to the battlefield.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fb977f5b-2202-43c1-a8c0-7fba8c093fa2.jpg?1783943627","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fb977f5b-2202-43c1-a8c0-7fba8c093fa2.jpg?1783943627","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const prince = (): CardDef => ({"oracleId":"e7f3b4bb-ebf5-4e59-8f0b-aa26f78e9edc","name":"Prince of Thralls","manaCost":"{4}{U}{B}{B}{R}","cmc":8,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Whenever a permanent an opponent controls is put into a graveyard, put that card onto the battlefield under your control unless that opponent pays 3 life.","power":"7","toughness":"7","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/6/56c7da42-cd73-443e-9f0e-d6aefe08523a.jpg?1783913074","artUrl":"https://cards.scryfall.io/art_crop/front/5/6/56c7da42-cd73-443e-9f0e-d6aefe08523a.jpg?1783913074","commanderLegal":"legal","set":"sld","releasedAt":"2024-02-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const sylex = (): CardDef => ({"oracleId":"fb4d99c2-daec-430a-9ca2-5a178a96618b","name":"Urza's Sylex","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{2}{W}{W}, {T}, Exile Urza's Sylex: Each player chooses six lands they control. Destroy all other permanents. Activate only as a sorcery.\nWhen Urza's Sylex is put into exile from the battlefield, you may pay {2}. If you do, search your library for a planeswalker card, reveal it, put it into your hand, then shuffle.","colors":[],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/3000d1c6-dbb3-4e65-b428-dbf167bb8797.jpg?1783920116","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/3000d1c6-dbb3-4e65-b428-dbf167bb8797.jpg?1783920116","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hellion = (): CardDef => ({"oracleId":"12a88c08-11e3-4f51-a17c-ca06452bac6f","name":"Volcano Hellion","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Hellion","supertypes":[],"types":["Creature"],"subtypes":["Hellion"],"oracleText":"This creature has echo {X}, where X is your life total. (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)\nWhen this creature enters, it deals an amount of damage of your choice to you and target creature. The damage can't be prevented.","power":"6","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/026b1a54-ab62-431d-a23e-5890d3932c7e.jpg?1783943145","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/026b1a54-ab62-431d-a23e-5890d3932c7e.jpg?1783943145","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const insights = (): CardDef => ({"oracleId":"9c793037-6ba8-400a-b24d-6032141e8dae","name":"Manifold Insights","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the top ten cards of your library. Starting with the next opponent in turn order, each opponent chooses a different nonland card from among them. Put the chosen cards into your hand and the rest on the bottom of your library in a random order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae9b2617-4910-4bde-b07f-dff2ac1f19d6.jpg?1783937089","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae9b2617-4910-4bde-b07f-dff2ac1f19d6.jpg?1783937089","commanderLegal":"legal","set":"c16","releasedAt":"2016-11-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const plains = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const goblin = (): CardDef => ({"oracleId":"e7436973-9ac8-45b2-9d79-769bfacef4b9","name":"Thick-Skinned Goblin","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Shaman","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Shaman"],"oracleText":"You may pay {0} rather than pay the echo cost for permanents you control.\n{R}: This creature gains protection from red until end of turn.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5b1a82da-ae5c-4f3d-8aa0-4bd3de7bf0b6.jpg?1783943215","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5b1a82da-ae5c-4f3d-8aa0-4bd3de7bf0b6.jpg?1783943215","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solemn = (): CardDef => ({"oracleId":"00c0543c-2a1f-4425-8283-4062d74a1637","name":"Solemn Simulacrum","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.","power":"2","toughness":"2","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/daafd816-f7c1-4630-9e5c-a1e5db570a35.jpg?1783903212","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/daafd816-f7c1-4630-9e5c-a1e5db570a35.jpg?1783903212","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const boar = (): CardDef => ({"oracleId":"90266ce6-4360-4de4-9b06-adff7d6c378b","name":"Ironhoof Boar","manaCost":"{5}{R}","cmc":6,"typeLine":"Artifact Creature — Boar","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Boar"],"oracleText":"Trample, haste\nChannel — {1}{R}, Discard this card: Target creature gets +3/+1 and gains trample until end of turn.","power":"5","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Haste","Trample","Channel"],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73abe574-6fb8-4809-9c18-0cf989f986f5.jpg?1783923866","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73abe574-6fb8-4809-9c18-0cf989f986f5.jpg?1783923866","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shatter = (): CardDef => ({"oracleId":"84d32e68-72b9-432d-a023-7bc6a26b8ad0","name":"Shatter","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const revoke = (): CardDef => ({"oracleId":"289e1a7c-b301-4395-baf8-e9a1c6d38aab","name":"Revoke Existence","manaCost":"{1}{W}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/597916e4-0294-4911-98e0-6ac5993533ae.jpg?1783939575","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/597916e4-0294-4911-98e0-6ac5993533ae.jpg?1783939575","commanderLegal":"legal","set":"bng","releasedAt":"2014-02-07","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mirror = (): CardDef => ({"oracleId":"1f0883f8-89c9-4620-9837-72a2909e0599","name":"Mirror Match","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during the declare blockers step.\nFor each creature attacking you or a planeswalker you control, create a token that's a copy of that creature and that's blocking that creature. Exile those tokens at end of combat.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0e0b8b4c-75ce-4b1d-8943-c54555e9f015.jpg?1783938115","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0e0b8b4c-75ce-4b1d-8943-c54555e9f015.jpg?1783938115","commanderLegal":"legal","set":"c15","releasedAt":"2015-11-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const doubling = (): CardDef => ({"oracleId":"01546b7d-a233-4176-8843-d732074dc5b6","name":"Doubling Season","manaCost":"{4}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/29ba5a2d-d787-4214-8cd7-7f2bcea938f8.jpg?1783934805","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/29ba5a2d-d787-4214-8cd7-7f2bcea938f8.jpg?1783934805","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes until the stack and triggers are done, or something asks a question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
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
const castPlan = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => planCast(s, pid, id, targets, undefined, "auto", undefined, choices);
const obj = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);

describe("Round B185 cards are supported", () => {
  it("compiles all seven", () => supported(imitation(), march(), prince(), sylex(), hellion(), insights(), mirror()));
});

describe("Haunting Imitation: a 1/1 flying Spirit copy of each creature card revealed, or back to its owner's hand if none", () => {
  it("copies each creature card revealed, the cards staying on top of their libraries", () => {
    const { s: s0, ap } = setup([]);
    const [b, c, d] = others(s0, ap);
    const angelTop = place(s0, b!, angel(), "library");
    const bearTop = place(s0, c!, bears(), "library");
    const shockTop = place(s0, d!, shock(), "library");
    const plainsTop = place(s0, ap, plains(), "library");
    const spell = place(s0, ap, imitation(), "hand");
    const before = s0.battlefield.length;
    const s = settle(run(s0, castPlan(s0, ap, spell)));
    expect(s.pending).toBeNull();
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens.length).toBe(2);
    expect(s.battlefield.length).toBe(before + 2);
    for (const id of tokens) {
      const ch = characteristics(s, s.objects[id]!);
      expect(s.objects[id]!.controller).toBe(ap);
      expect([ch.power, ch.toughness]).toEqual([1, 1]);
      expect(ch.subtypes).toContain("Spirit");
      expect(ch.keywords).toContain("Flying");
    }
    const names = tokens.map((id) => characteristics(s, s.objects[id]!).name).sort();
    expect(names).toEqual(["Grizzly Bears", "Serra Angel"]);
    // Serra Angel keeps vigilance and its Angel type; Grizzly Bears is still a Bear.
    const angelTok = tokens.find((id) => characteristics(s, s.objects[id]!).name === "Serra Angel")!;
    expect(characteristics(s, s.objects[angelTok]!).keywords).toContain("Vigilance");
    expect(characteristics(s, s.objects[angelTok]!).subtypes).toEqual(expect.arrayContaining(["Angel", "Spirit"]));
    // The revealed cards stay on top (rulings).
    expect(s.players[b!]!.library[0]).toBe(angelTop);
    expect(s.players[c!]!.library[0]).toBe(bearTop);
    expect(s.players[d!]!.library[0]).toBe(shockTop);
    expect(s.players[ap]!.library[0]).toBe(plainsTop);
    expect(zone(s, spell)).toBe("graveyard");
  });

  it("with no creature card revealed it returns to its owner's hand", () => {
    const { s: s0, ap } = setup([]);
    for (const p of s0.turnOrder) place(s0, p, p === ap ? shock() : plains(), "library");
    const spell = place(s0, ap, imitation(), "hand");
    const s = settle(run(s0, castPlan(s0, ap, spell)));
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
    expect(zone(s, spell)).toBe("hand");
  });

  it("your own creature card counts too, and a copy of a card is made as printed", () => {
    const { s: s0, ap } = setup([]);
    for (const p of others(s0, ap)) place(s0, p, plains(), "library");
    place(s0, ap, solemn(), "library");
    const spell = place(s0, ap, imitation(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    // Solemn Simulacrum's copy enters, and its enters ability triggers (a may search).
    for (let i = 0; i < 6 && s.pending; i++) s = settle(run(s, botActions(s, waitingOn(s)!)));
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[tok]!).name).toBe("Solemn Simulacrum");
    expect(characteristics(s, s.objects[tok]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(zone(s, spell)).toBe("graveyard");
  });
});

describe("Bloodbond March: each player returns all cards with the same name as the creature spell from their graveyard", () => {
  it("every player's cards of that name come back under their owners' control, other cards stay", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = others(s0, ap);
    putOnBattlefield(s0, ap, march());
    const mineYard = place(s0, ap, bears(), "graveyard");
    const theirs1 = place(s0, b!, bears(), "graveyard");
    const theirs2 = place(s0, b!, bears(), "graveyard");
    const angelYard = place(s0, c!, angel(), "graveyard");
    const spell = place(s0, ap, bears(), "hand");
    let s = run(s0, castPlan(s0, ap, spell));
    // The trigger resolves before the spell.
    expect(s.stack.length).toBe(2);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(zone(s, mineYard)).toBe("battlefield");
    expect(zone(s, theirs1)).toBe("battlefield");
    expect(zone(s, theirs2)).toBe("battlefield");
    expect(s.objects[theirs1]!.controller).toBe(b);
    expect(s.objects[mineYard]!.controller).toBe(ap);
    expect(zone(s, angelYard)).toBe("graveyard");
    expect(zone(s, spell)).toBe("battlefield");
  });

  it("noncreature spells don't trigger it; a creature spell brings back only cards of its own name", () => {
    const { s: s0, ap } = setup([]);
    const [b] = others(s0, ap);
    putOnBattlefield(s0, b!, march());
    const angelYard = place(s0, ap, angel(), "graveyard");
    const bearsYard = place(s0, ap, bears(), "graveyard");
    const bolt = place(s0, ap, shock(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, bolt, [{ kind: "player", id: b! }])));
    expect(zone(s, bearsYard)).toBe("graveyard");
    const spell = place(s, ap, angel(), "hand");
    s = run(s, castPlan(s, ap, spell));
    expect(s.stack.length).toBe(2);
    s = settle(s);
    expect(zone(s, angelYard)).toBe("battlefield");
    expect(zone(s, bearsYard)).toBe("graveyard");
  });
});

describe("Prince of Thralls: an opponent's permanent put into a graveyard comes to you unless that opponent pays 3 life", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, prince());
    const victim = putOnBattlefield(s, opp, bears());
    const bolt = place(s, ap, shock(), "hand");
    return { s, ap, opp, victim, bolt };
  };

  it("not paid: the card is put onto the battlefield under your control", () => {
    const { s: s0, ap, opp, victim, bolt } = scene();
    let s = settle(run(s0, castPlan(s0, ap, bolt, [obj(victim)])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, life: 3 });
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }));
    expect(zone(s, victim)).toBe("battlefield");
    expect(s.objects[victim]!.controller).toBe(ap);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("paid: that opponent loses 3 life and the card stays in the graveyard", () => {
    const { s: s0, ap, opp, victim, bolt } = scene();
    let s = settle(run(s0, castPlan(s0, ap, bolt, [obj(victim)])));
    s = settle(act(s, { type: "payUnless", player: opp, pay: true }));
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(37);
  });

  it("with less than 3 life the opponent can't pay; its own permanents and a token give nothing", () => {
    const { s: s0, ap, opp, victim, bolt } = scene();
    s0.players[opp]!.life = 2;
    const mine = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, castPlan(s0, ap, bolt, [obj(victim)])));
    expect(s.pending).toBeNull();
    expect(s.objects[victim]!.controller).toBe(ap);
    expect(zone(s, victim)).toBe("battlefield");
    // Our own creature dying doesn't trigger it.
    const bolt2 = place(s, ap, shock(), "hand");
    s = settle(run(s, castPlan(s, ap, bolt2, [obj(mine)])));
    expect(zone(s, mine)).toBe("graveyard");
    expect(s.pending).toBeNull();
  });

  it("a bot opponent with plenty of life pays rather than give the card away", () => {
    const { s: s0, ap, opp, victim, bolt } = scene();
    let s = settle(run(s0, castPlan(s0, ap, bolt, [obj(victim)])));
    s = settle(run(s, botActions(s, opp)));
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(37);
  });
});

describe("Urza's Sylex: each player keeps six lands, every other permanent is destroyed; exiled, it may find a planeswalker", () => {
  it("the exile trigger resolves first (pay {2}, find Jace), then each player chooses six lands and the rest is destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    const sx = putOnBattlefield(s0, ap, sylex());
    const pw = place(s0, ap, jace(), "library");
    const myBears = putOnBattlefield(s0, ap, bears());
    const theirAngel = putOnBattlefield(s0, opp, angel());
    const theirLands = [0, 1, 2, 3, 4, 5, 6].map(() => putOnBattlefield(s0, opp, forest()));
    const myLands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"));
    expect(myLands.length).toBe(14);
    let s = run(s0, planActivate(s0, ap, sx, 0));
    expect(zone(s, sx)).toBe("exile");
    // The trigger goes on the stack above the ability (rulings).
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{2}" } });
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [pw] });
    s = settle(s);
    expect(zone(s, pw)).toBe("hand");
    // Then the ability: we choose six of our lands (APNAP), the opponent six of their seven.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    const keep = myLands.filter((id) => s.objects[id]!.zone === "battlefield").slice(0, 6);
    s = act(s, { type: "pickPermanents", player: ap, ids: keep });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp });
    s = act(s, { type: "pickPermanents", player: opp, ids: theirLands.slice(1) });
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(zone(s, myBears)).toBe("graveyard");
    expect(zone(s, theirAngel)).toBe("graveyard");
    expect(zone(s, theirLands[0]!)).toBe("graveyard");
    for (const id of [...keep, ...theirLands.slice(1)]) expect(zone(s, id)).toBe("battlefield");
    expect(myLands.filter((id) => zone(s, id) === "graveyard").length).toBe(8);
    // The other players' commanders aren't on the battlefield here; every remaining permanent is a land.
    expect(s.battlefield.every((id) => characteristics(s, s.objects[id]!).types.includes("Land"))).toBe(true);
  });

  it("can only be activated as a sorcery, and declining the {2} finds nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const sx = putOnBattlefield(s0, ap, sylex());
    // On another player's turn it can't be activated.
    s0.activePlayer = opp;
    expect(planActivate(s0, ap, sx, 0)).toBeNull();
    s0.activePlayer = ap;
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, sx, 0)));
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("exiled by a spell it triggers too; destroyed, it doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const sx = putOnBattlefield(s0, opp, sylex());
    // Legendary: a second one for another player.
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const sx2 = putOnBattlefield(s0, third, sylex());
    // Lands to pay the {2} with, so each is asked.
    for (const p of [opp, opp, third, third]) putOnBattlefield(s0, p, forest());
    place(s0, opp, jace(), "library");
    const ex = place(s0, ap, revoke(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, ex, [obj(sx)])));
    expect(zone(s, sx)).toBe("exile");
    // Its controller (the opponent) is asked whether to pay {2}.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }));
    const smash = place(s, ap, shatter(), "hand");
    s = settle(run(s, castPlan(s, ap, smash, [obj(sx2)])));
    expect(zone(s, sx2)).toBe("graveyard");
    expect(s.pending).toBeNull();
  });
});

describe("Volcano Hellion: damage of your choice to you and target creature; echo {X} where X is your life total", () => {
  it("the chosen amount is dealt to you and to the target creature at once", () => {
    const { s: s0, ap, opp } = setup([]);
    const victim = putOnBattlefield(s0, opp, angel());
    const h = place(s0, ap, hellion(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, h)));
    // The enters trigger's target is chosen as it goes on the stack.
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(victim)] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "number" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "4" }));
    expect(s.players[ap]!.life).toBe(36);
    expect(zone(s, victim)).toBe("graveyard");
  });

  it("0 may be chosen", () => {
    const { s: s0, ap, opp } = setup([]);
    const victim = putOnBattlefield(s0, opp, angel());
    const h = place(s0, ap, hellion(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, h)));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(victim)] }));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.players[ap]!.life).toBe(40);
    expect(zone(s, victim)).toBe("battlefield");
    expect(s.objects[victim]!.damage).toBe(0);
  });

  it("a bot deals just enough to destroy an opponent's creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const victim = putOnBattlefield(s0, opp, angel());
    const h = place(s0, ap, hellion(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, h)));
    for (let i = 0; i < 4 && s.pending; i++) s = settle(run(s, botActions(s, waitingOn(s)!)));
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(36);
  });

  const withHellion = (life: number) => {
    const { s: s0, ap } = setup([]);
    const h = place(s0, ap, hellion(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, h)));
    for (let i = 0; i < 4 && s.pending; i++) s = settle(s.pending.kind === "chooseOption" && s.pending.what === "number" ? act(s, { type: "chooseOption", player: ap, choice: "0" }) : run(s, botActions(s, waitingOn(s)!)));
    expect(zone(s, h)).toBe("battlefield");
    s.players[ap]!.hand = [];
    s.players[ap]!.command = [];
    s = passUntil(s, "upkeep", ap);
    s.players[ap]!.life = life;
    return { s, ap, h };
  };

  it("echo costs {X}, X its controller's life total as the echo trigger resolves", () => {
    const { s: s0, ap, h } = withHellion(5);
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect((s.pending as { pay?: { mana?: string } }).pay?.mana).toMatch(/^(\{5\}|(\{1\}){5})$/);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 5 };
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, h)).toBe("battlefield");
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
  });

  it("with more life than it can pay for, it's sacrificed", () => {
    const { s: s0, h } = withHellion(40);
    const s = settle(s0);
    expect(zone(s, h)).toBe("graveyard");
  });

  it("Thick-Skinned Goblin pays {0} instead", () => {
    const { s: s0, ap, h } = withHellion(40);
    putOnBattlefield(s0, ap, goblin());
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{0}" } });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, h)).toBe("battlefield");
  });
});

describe("Manifold Insights: starting with the next opponent, each opponent chooses a different nonland card for your hand", () => {
  const top = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => place(s, pid, d, "library")).reverse();

  it("each opponent in turn order chooses one, the rest go to the bottom", () => {
    const { s: s0, ap } = setup([]);
    // Starting with the next opponent in turn order.
    const i = s0.turnOrder.indexOf(ap);
    const [b, c, d] = [1, 2, 3].map((k) => s0.turnOrder[(i + k) % 4]!);
    const cards = top(s0, ap, [angel(), bears(), shock(), jace(), plains(), forest(), solemn(), pacifism(), plains(), boar()]);
    const spell = place(s0, ap, insights(), "hand");
    const libBefore = s0.players[ap]!.library.length;
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: b, min: 1, max: 1, forPlayer: ap, helps: true });
    const nonland = [0, 1, 2, 3, 6, 7, 9].map((i) => cards[i]!);
    expect([...(s.pending as { cards: ObjectId[] }).cards].sort()).toEqual([...nonland].sort());
    s = act(s, { type: "searchLibrary", player: b!, found: [cards[1]!] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: c });
    // A different card: the one chosen already isn't offered.
    expect((s.pending as { cards: ObjectId[] }).cards).not.toContain(cards[1]);
    s = act(s, { type: "searchLibrary", player: c!, found: [cards[2]!] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: d });
    s = settle(act(s, { type: "searchLibrary", player: d!, found: [cards[7]!] }));
    expect(s.pending).toBeNull();
    for (const i of [1, 2, 7]) expect(zone(s, cards[i]!)).toBe("hand");
    const lib = s.players[ap]!.library;
    expect(lib.length).toBe(libBefore - 3);
    // The other seven are on the bottom.
    const rest = cards.filter((_, i) => ![1, 2, 7].includes(i));
    expect([...lib.slice(-7)].sort()).toEqual([...rest].sort());
  });

  it("bots choose the cards that help you least; with fewer nonland cards than opponents you get them all", () => {
    const { s: s0, ap } = setup([]);
    const cards = top(s0, ap, [plains(), shock(), forest(), plains(), forest(), plains(), forest(), plains(), forest(), angel()]);
    const spell = place(s0, ap, insights(), "hand");
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    // Two nonland cards, three opponents: the first chooses, the second gets the last one, no question.
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    s = settle(run(s, botActions(s, waitingOn(s)!)));
    expect(s.pending).toBeNull();
    expect(zone(s, cards[1]!)).toBe("hand");
    expect(zone(s, cards[9]!)).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("three bot opponents each choose a different one; the fourth nonland card goes to the bottom", () => {
    const { s: s0, ap } = setup([]);
    const cards = top(s0, ap, [angel(), shock(), plains(), bears(), plains(), jace(), plains(), plains(), plains(), plains()]);
    const nonland = [0, 1, 3, 5].map((i) => cards[i]!);
    const spell = place(s0, ap, insights(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    const asked: PlayerId[] = [];
    for (let i = 0; i < 5 && s.pending?.kind === "searchLibrary"; i++) {
      asked.push(s.pending.player);
      s = settle(run(s, botActions(s, s.pending.player)));
    }
    expect(s.pending).toBeNull();
    expect(new Set(asked).size).toBe(3);
    expect(asked).not.toContain(ap);
    expect(nonland.filter((id) => zone(s, id) === "hand").length).toBe(3);
    const left = nonland.find((id) => zone(s, id) === "library")!;
    expect(s.players[ap]!.library.slice(-7)).toContain(left);
  });
});

describe("Mirror Match: a token copy of each creature attacking you or your planeswalker, blocking it, exiled at end of combat", () => {
  /** The active player attacks: `toOpp` at the opponent, `toOther` at another player; the opponent holds Mirror Match. */
  const scene = (extra?: (s: GameState, opp: PlayerId) => void) => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const bear = putOnBattlefield(s0, ap, bears());
    const big = putOnBattlefield(s0, ap, angel());
    s0.objects[big]!.counters["-1/-1"] = 1;
    const other = putOnBattlefield(s0, ap, bears());
    const spell = place(s0, opp, mirror(), "hand");
    s0.players[ap]!.command = [];
    extra?.(s0, opp);
    let s = passTill(s0, (x) => x.pending?.kind === "declareAttackers" && x.activePlayer === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }, { attacker: big, defender: opp }, { attacker: other, defender: third }] });
    s = passTill(s, (x) => x.step === "declareBlockers" && !x.pending && waitingOn(x) === opp && x.stack.length === 0);
    return { s, ap, opp, third, bear, big, other, spell };
  };

  it("copies only the creatures attacking its caster; they block them, deal and take damage, then are exiled", () => {
    const { s: s0, ap, opp, bear, big, other, spell } = scene();
    // It can't be cast before the declare blockers step.
    s0.players[opp]!.manaPool = { ...s0.players[opp]!.manaPool, U: 6 };
    let s = run(s0, castPlan(s0, opp, spell));
    s = settle(s);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens.length).toBe(2);
    for (const id of tokens) expect(s.objects[id]!.controller).toBe(opp);
    const tokOf = (orig: ObjectId) => tokens.find((id) => s.objects[id]!.blocking?.includes(orig));
    expect(characteristics(s, s.objects[tokOf(bear)!]!).name).toBe("Grizzly Bears");
    expect(characteristics(s, s.objects[tokOf(big)!]!).name).toBe("Serra Angel");
    expect(s.objects[bear]!.blockedBy).toEqual([tokOf(bear)]);
    expect(s.objects[other]!.blockedBy ?? []).toEqual([]);
    // The copy doesn't copy the -1/-1 counter (rulings): a 4/4 against the 3/3 attacker.
    const angelTok = tokOf(big)!;
    expect(characteristics(s, s.objects[angelTok]!).power).toBe(4);
    // Combat damage: the Bears trade, the Angel token survives the 3/3; at end of combat it's exiled.
    s = passTill(s, (x) => x.step === "endCombat");
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, big)).toBe("graveyard");
    expect(s.objects[angelTok]?.zone).toBe("battlefield");
    s = settle(s);
    expect(s.objects[angelTok]?.zone === "battlefield").toBe(false);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players.find((p) => p.id !== ap && p.id !== opp && s.objects[other]!.attacking === p.id)!.life).toBe(38);
  });

  it("is cast only during the declare blockers step", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, bears());
    const spell = place(s0, opp, mirror(), "hand");
    s0.players[ap]!.command = [];
    let s = passTill(s0, (x) => x.pending?.kind === "declareAttackers" && x.activePlayer === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    s = passTill(s, (x) => x.step === "declareAttackers" && !x.pending && waitingOn(x) === opp && x.stack.length === 0);
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, U: 6 };
    expect(castPlan(s, opp, spell)).toBeNull();
  });

  it("with Doubling Season both copies block, and both are exiled", () => {
    const { s: s0, opp, bear } = scene((s, o) => void putOnBattlefield(s, o, doubling()));
    const spell = s0.players[opp]!.hand.find((id) => characteristics(s0, s0.objects[id]!).name === "Mirror Match")!;
    s0.players[opp]!.manaPool = { ...s0.players[opp]!.manaPool, U: 6 };
    let s = settle(run(s0, castPlan(s0, opp, spell)));
    expect(s.objects[bear]!.blockedBy?.length).toBe(2);
    s = passTill(s, (x) => x.step === "endCombat" && x.stack.length === 0 && !x.triggerQueue.length);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });
});

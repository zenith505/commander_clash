// Round 256: the top of the popularity list. Dáin Ironfoot (a legendary card whose short name has an accented letter),
// Fishing Gear (exile the top card of that player's library; a permanent card onto the battlefield, or a Fish), Emergent
// Sequence (the land found becomes a 0/0 Fractal creature, counters for each land you had enter), Chandra, Flame's
// Catalyst (−8: spells from your hand for nothing until end of turn), Garruk, Savage Herald (−7: assign combat damage as
// though unblocked), Chandra Ablaze (−7: any number of red instants and sorceries from your graveyard), Kaya the
// Inexorable (+1: a granted "dies or is put into exile" trigger; −7: an emblem casting a legendary spell), Slimefoot's
// Survey (land cards that each have a basic land type), Eon Frolicker (an extra turn for an opponent and protection from
// that player), Skullbriar, the Walking Grave and Me, the Immortal (counters remain as it moves to other zones).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** Permanents with this name; a token's name is its subtypes and "Token" ("Fish Token"). */
const named = (s: GameState, name: string) => s.battlefield.filter((id) => [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);
const nextOpp = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const dain = (): CardDef => ({"oracleId":"9924c189-3c82-431a-b570-7805b2a406f0","name":"Dáin Ironfoot","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Dwarf Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dwarf","Warrior"],"oracleText":"When Dáin enters, create a colorless Equipment artifact token named Axe with \"Equipped creature gets +1/+0\" and equip {2}. When you do, attach it to target creature you control.\nWhenever Dáin attacks, each equipped attacking creature gains double strike until end of turn.","power":"1","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/7112e460-9160-4535-ad94-93f1f4ac04cf.jpg?1785236701","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/7112e460-9160-4535-ad94-93f1f4ac04cf.jpg?1785236701","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gear = (): CardDef => ({"oracleId":"7d309b18-8dc5-41ee-888c-e275761029e7","name":"Fishing Gear","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Whenever equipped creature deals combat damage to a player, exile the top card of that player's library. If it's a permanent card, you may put it onto the battlefield under your control. If you don't, create a 1/1 blue Fish creature token.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b2a1b5b3-8d7a-4614-b7f9-d13db5654d03.jpg?1783904650","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b2a1b5b3-8d7a-4614-b7f9-d13db5654d03.jpg?1783904650","commanderLegal":"legal","set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sequence = (): CardDef => ({"oracleId":"dc859ce2-a267-481f-80d5-2cc38935baa0","name":"Emergent Sequence","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. That land becomes a 0/0 green and blue Fractal creature that's still a land. Put a +1/+1 counter on it for each land you had enter the battlefield under your control this turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/04a81975-5f0e-4593-a2da-b9689f9a985f.jpg?1783927343","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/04a81975-5f0e-4593-a2da-b9689f9a985f.jpg?1783927343","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const catalyst = (): CardDef => ({"oracleId":"7721e800-fba6-4ae7-855e-631b2ecc8d6b","name":"Chandra, Flame's Catalyst","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Chandra deals 3 damage to each opponent.\n−2: You may cast target red instant or sorcery card from your graveyard. If that spell would be put into your graveyard, exile it instead.\n−8: Discard your hand, then draw seven cards. Until end of turn, you may cast spells from your hand without paying their mana costs.","loyalty":"5","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1e49ce44-5286-4310-88c2-f8a1402b113b.jpg?1783930619","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1e49ce44-5286-4310-88c2-f8a1402b113b.jpg?1783930619","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const garruk = (): CardDef => ({"oracleId":"fc762e40-84c1-4762-82f7-a0fc4f6fd522","name":"Garruk, Savage Herald","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Legendary Planeswalker — Garruk","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Garruk"],"oracleText":"+1: Reveal the top card of your library. If it's a creature card, put it into your hand. Otherwise, put it on the bottom of your library.\n−2: Target creature you control deals damage equal to its power to another target creature.\n−7: Until end of turn, creatures you control gain \"You may have this creature assign its combat damage as though it weren't blocked.\"","loyalty":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48133629-4a5b-4c91-b496-2ee94f6cbc4c.jpg?1783930617","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48133629-4a5b-4c91-b496-2ee94f6cbc4c.jpg?1783930617","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const ablaze = (): CardDef => ({"oracleId":"3fae28e6-2ffc-460e-9dd3-e321e8a53ba9","name":"Chandra Ablaze","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Discard a card. If a red card is discarded this way, Chandra deals 4 damage to any target.\n−2: Each player discards their hand, then draws three cards.\n−7: Cast any number of red instant and/or sorcery cards from your graveyard without paying their mana costs.","loyalty":"5","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/43da8995-77da-4ec4-94a5-5e7932a3c969.jpg?1783942147","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/43da8995-77da-4ec4-94a5-5e7932a3c969.jpg?1783942147","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const kaya = (): CardDef => ({"oracleId":"13a4f88b-6832-43a1-b4fa-c1ee60560bad","name":"Kaya the Inexorable","manaCost":"{3}{W}{B}","cmc":5,"typeLine":"Legendary Planeswalker — Kaya","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Kaya"],"oracleText":"+1: Put a ghostform counter on up to one target nontoken creature. It gains \"When this creature dies or is put into exile, return it to its owner's hand and create a 1/1 white Spirit creature token with flying.\"\n−3: Exile target nonland permanent.\n−7: You get an emblem with \"At the beginning of your upkeep, you may cast a legendary spell from your hand, from your graveyard, or from among cards you own in exile without paying its mana cost.\"","loyalty":"5","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/166c0bd1-b59d-4644-832f-888a4ca3a0aa.jpg?1783928194","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/166c0bd1-b59d-4644-832f-888a4ca3a0aa.jpg?1783928194","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const survey = (): CardDef => ({"oracleId":"8ace9425-fcdd-45b0-abf0-1a7d601de25e","name":"Slimefoot's Survey","manaCost":"{4}{G}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Domain — Search your library for up to two land cards that each have a basic land type, put them onto the battlefield tapped, then shuffle. Look at the top X cards of your library, where X is the number of basic land types among lands you control. Put up to one of them on top of your library and the rest on the bottom of your library in a random order.","colors":["G"],"colorIdentity":["G"],"keywords":["Domain"],"imageUrl":"https://cards.scryfall.io/normal/front/6/2/622f96fc-179a-4ff6-95a5-de721492f7eb.jpg?1783921296","artUrl":"https://cards.scryfall.io/art_crop/front/6/2/622f96fc-179a-4ff6-95a5-de721492f7eb.jpg?1783921296","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const frolicker = (): CardDef => ({"oracleId":"c0a18a53-d520-4795-9b3b-0f93bcf35848","name":"Eon Frolicker","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Elemental Otter","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Otter"],"oracleText":"Flying\nWhen this creature enters, if you cast it, target opponent takes an extra turn after this one. Until your next turn, you and planeswalkers you control gain protection from that player. (You and planeswalkers you control can't be targeted, dealt damage, or enchanted by anything controlled by that player.)","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/acaec4bf-69c8-43c1-960f-cb5b5bff660a.jpg?1783931221","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/acaec4bf-69c8-43c1-960f-cb5b5bff660a.jpg?1783931221","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const skullbriar = (): CardDef => ({"oracleId":"088ac883-6f44-4046-bf19-81c7fd952e55","name":"Skullbriar, the Walking Grave","manaCost":"{B}{G}","cmc":2,"typeLine":"Legendary Creature — Zombie Elemental","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie","Elemental"],"oracleText":"Haste\nWhenever Skullbriar deals combat damage to a player, put a +1/+1 counter on it.\nCounters remain on Skullbriar as it moves to any zone other than a player's hand or library.","power":"1","toughness":"1","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/6/7/6724ff50-717c-4334-8014-0ee897d7735a.jpg?1783941167","artUrl":"https://cards.scryfall.io/art_crop/front/6/7/6724ff50-717c-4334-8014-0ee897d7735a.jpg?1783941167","commanderLegal":"legal","set":"cmd","releasedAt":"2011-06-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const me = (): CardDef => ({"oracleId":"26ad696e-9f17-4110-9c59-b9211e662900","name":"Me, the Immortal","manaCost":"{2}{G}{U}{R}","cmc":5,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"At the beginning of combat on your turn, put your choice of a +1/+1, first strike, vigilance, or menace counter on Me.\nCounters remain on Me as it moves to any zone other than a player's hand or library.\nYou may cast this card from your graveyard by discarding two cards in addition to paying its other costs.","power":"3","toughness":"3","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/a/5aee3c03-9d03-4088-8557-6bf5dcb7acc4.jpg?1783914387","artUrl":"https://cards.scryfall.io/art_crop/front/5/a/5aee3c03-9d03-4088-8557-6bf5dcb7acc4.jpg?1783914387","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const redBolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const redBlast = card("Test Blast", "Sorcery", "{1}{R}", { cmc: 2, colors: ["R"], oracleText: "Test Blast deals 2 damage to any target." });
const blueStudy = card("Test Study", "Sorcery", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Draw two cards." });
const exileSpell = card("Test Banish", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "Exile target creature." });
const raise = card("Test Raise", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Return target creature card from your graveyard to the battlefield." });
const bounce = card("Test Bounce", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Return target creature to its owner's hand." });
const legend = card("Test Legend", "Legendary Creature — Human", "{2}{W}", { cmc: 3, supertypes: ["Legendary"], power: "3", toughness: "3" });
const legend2 = card("Test Heroine", "Legendary Creature — Elf", "{1}{G}", { cmc: 2, supertypes: ["Legendary"], power: "2", toughness: "2" });
const walker = card("Test Walker", "Legendary Planeswalker — Testwalker", "{2}{W}", { cmc: 3, supertypes: ["Legendary"], loyalty: "3", oracleText: "+1: You gain 1 life." });
const tundra = card("Test Tundra", "Land — Plains Island", "", { subtypes: ["Plains", "Island"], oracleText: "({T}: Add {W} or {U}.)" });
const desert = card("Test Desert", "Land — Desert", "", { subtypes: ["Desert"], oracleText: "{T}: Add {C}." });
const forestCard = card("Forest", "Basic Land — Forest", "", { supertypes: ["Basic"], subtypes: ["Forest"] });
const aura = card("Test Shield", "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], subtypes: ["Aura"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });

/** Attack `defender` with `attackers` and play combat out, stopping at a question for `ap` (a "you may"). */
const fight = (s: GameState, ap: PlayerId, attackers: ObjectId[], defender: PlayerId, blocks: { blocker: ObjectId; attacker: ObjectId }[] = []) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 300 && !(s.step === "endCombat" && !s.stack.length && !s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: p.player === defender ? blocks : [] });
    else if (p?.player === ap) return s;
    else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("round 256", () => {
  it("every card of the round compiles fully", () => {
    supported(dain(), gear(), sequence(), catalyst(), garruk(), ablaze(), kaya(), survey(), frolicker(), skullbriar(), me());
  });
});

describe("Dáin Ironfoot", () => {
  it("\"Dáin\" is the card (CR 201.5c): the Axe token is attached to target creature you control; equipped attackers gain double strike", () => {
    const { s: s0, ap, opp, ids } = setup([dain()]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(b)] });
    const [axe] = named(s, "Axe");
    expect(axe).toBeDefined();
    expect([s.objects[axe!]!.isToken, s.objects[axe!]!.attachedTo, pt(s, b)]).toEqual([true, b, "3/2"]);
    expect(characteristics(s, s.objects[axe!]!).subtypes).toEqual(["Equipment"]);
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = fight(s, ap, [b, ids[0]!], opp);
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Double strike")).toBe(false);
    // 3 twice from the equipped Bears, 1 from Dáin.
    expect(s.players[opp]!.life).toBe(33);
  });
});

describe("Fishing Gear", () => {
  const geared = (top: CardDef) => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, gear());
    const b = putOnBattlefield(s, ap, bear());
    s.objects[g]!.attachedTo = b;
    const t = into(s, opp, top, "library");
    invalidateCharacteristics(s);
    return { s, ap, opp, b, t };
  };

  it("a permanent card exiled from that player's library may be put onto the battlefield under your control", () => {
    const { s: s0, ap, opp, b, t } = geared(legend);
    let s = fight(s0, ap, [b], opp);
    expect(zone(s, t)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, t)).toBe("battlefield");
    expect(characteristics(s, s.objects[t]!).controller).toBe(ap);
    expect(named(s, "Fish")).toHaveLength(0);
  });

  it("if you don't, or it isn't a permanent card, a 1/1 blue Fish token instead and the card stays exiled", () => {
    const { s: s0, ap, opp, b, t } = geared(legend);
    let s = fight(s0, ap, [b], opp);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, t)).toBe("exile");
    const [fish] = named(s, "Fish");
    expect(fish).toBeDefined();
    expect([pt(s, fish!), characteristics(s, s.objects[fish!]!).colors, characteristics(s, s.objects[fish!]!).controller]).toEqual(["1/1", ["U"], ap]);
    const { s: t0, ap: bp, opp: bo, b: bb, t: bolt } = geared(redBolt);
    const u = fight(t0, bp, [bb], bo);
    expect(u.pending).toBeFalsy();
    expect(zone(u, bolt)).toBe("exile");
    expect(named(u, "Fish")).toHaveLength(1);
  });
});

describe("Emergent Sequence", () => {
  it("the basic land found becomes a 0/0 green and blue Fractal creature land with a counter for each land you had enter this turn, itself included", () => {
    const { s: s0, ap, ids } = setup([sequence(), forestCard]);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[1]! });
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const pick = (s.pending as { cards: ObjectId[] }).cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    const c = characteristics(s, s.objects[pick]!);
    expect([zone(s, pick), s.objects[pick]!.tapped, c.types.includes("Land"), c.types.includes("Creature"), c.subtypes.includes("Fractal"), c.subtypes.includes("Forest"), [...c.colors].sort()]).toEqual(["battlefield", true, true, true, true, true, ["G", "U"]]);
    // The Forest played before and the land found: two +1/+1 counters.
    expect([s.objects[pick]!.counters["+1/+1"], pt(s, pick)]).toEqual([2, "2/2"]);
    // For good: still a creature on a later turn.
    s = passUntil(s, "upkeep", nextOpp(s, ap, 1));
    expect(characteristics(s, s.objects[pick]!).types.includes("Creature")).toBe(true);
  });
});

describe("Chandra, Flame's Catalyst: −8", () => {
  it("discard your hand, draw seven; until end of turn spells from your hand cost nothing; not next turn", () => {
    const { s: s0, ap, ids } = setup([redBolt, blueStudy]);
    const c = putOnBattlefield(s0, ap, catalyst());
    s0.objects[c]!.counters.loyalty = 8;
    let s = settle(run(s0, planActivate(s0, ap, c, 2)));
    expect([zone(s, ids[0]!), zone(s, ids[1]!)]).toEqual(["graveyard", "graveyard"]);
    expect(s.players[ap]!.hand).toHaveLength(7);
    const creature = s.players[ap]!.hand.find((id) => characteristics(s, s.objects[id]!).types.includes("Creature"))!;
    expect(altCostsFor(s, ap, s.objects[creature]!).some((x) => x.kind === "omniscience")).toBe(true);
    s = settle(run(s, planCast(s, ap, creature, undefined, undefined, undefined, undefined, { alt: "omniscience" })));
    expect(zone(s, creature)).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped)).toHaveLength(0);
    s = passUntil(s, "main1", nextOpp(s, ap, 1));
    const later = s.players[ap]!.hand[0]!;
    expect(altCostsFor(s, ap, s.objects[later]!).some((x) => x.kind === "omniscience")).toBe(false);
  });
});

describe("Garruk, Savage Herald: −7", () => {
  it("creatures you control as it resolves may assign combat damage as though unblocked this turn; a creature that arrives later doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, garruk());
    s0.objects[g]!.counters.loyalty = 7;
    const b = putOnBattlefield(s0, ap, bear());
    const wall = putOnBattlefield(s0, opp, card("Test Wall", "Creature — Wall", "{1}", { power: "0", toughness: "5" }));
    let s = settle(run(s0, planActivate(s0, ap, g, 2)));
    const late = putOnBattlefield(s, ap, bear({ name: "Late Bears" }));
    expect([characteristics(s, s.objects[b]!).unblockedDamage, !!characteristics(s, s.objects[late]!).unblockedDamage]).toEqual([true, false]);
    s = fight(s, ap, [b], opp, [{ blocker: wall, attacker: b }]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "unblocked" });
    s = act(s, { type: "pickPermanents", player: ap, ids: [b] });
    s = fight(s, ap, [], opp);
    expect([s.players[opp]!.life, s.objects[wall]!.damage]).toEqual([38, 0]);
    s = passUntil(s, "upkeep", nextOpp(s, ap, 1));
    expect(!!characteristics(s, s.objects[b]!).unblockedDamage).toBe(false);
  });
});

describe("Chandra Ablaze: −7", () => {
  it("cast any number of red instants and sorceries from your graveyard for nothing, one at a time, the sorcery at instant speed too", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, ablaze());
    s0.objects[c]!.counters.loyalty = 7;
    const bolt = into(s0, ap, redBolt, "graveyard");
    const blast = into(s0, ap, redBlast, "graveyard");
    const study = into(s0, ap, blueStudy, "graveyard");
    let s = run(s0, planActivate(s0, ap, c, 2));
    for (let i = 0; i < 20 && !offered(s).length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(new Set(offered(s))).toEqual(new Set([bolt, blast, "none"]));
    s = act(s, { type: "chooseOption", player: ap, choice: bolt });
    s = run(s, planCast(s, ap, bolt, [{ kind: "player", id: opp }]));
    expect(new Set(offered(s))).toEqual(new Set([blast, "none"]));
    s = act(s, { type: "chooseOption", player: ap, choice: blast });
    s = run(s, planCast(s, ap, blast, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect([s.players[opp]!.life, zone(s, study)]).toEqual([35, "graveyard"]);
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped)).toHaveLength(0);
  });

  it("none at all is fine", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, ablaze());
    s0.objects[c]!.counters.loyalty = 7;
    const bolt = into(s0, ap, redBolt, "graveyard");
    let s = run(s0, planActivate(s0, ap, c, 2));
    for (let i = 0; i < 20 && !offered(s).length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect([zone(s, bolt), s.stack.length]).toEqual(["graveyard", 0]);
  });
});

describe("Kaya the Inexorable", () => {
  it("+1: the creature gains \"when this creature dies or is put into exile, return it to its owner's hand and create a 1/1 Spirit\"", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kaya());
    s0.objects[k]!.counters.loyalty = 5;
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, k, 0, [tgt(b)])));
    expect(s.objects[b]!.counters.ghostform).toBe(1);
    s.objects[b]!.damage = 5;
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    s = settle(s);
    expect(zone(s, b)).toBe("hand");
    const [spirit] = named(s, "Spirit");
    expect(spirit).toBeDefined();
    expect([pt(s, spirit!), objHasKeyword(s, s.objects[spirit!]!, "Flying"), characteristics(s, s.objects[spirit!]!).controller]).toEqual(["1/1", true, ap]);
  });

  it("+1 then exiled: the same; the ability stays without the counter (rulings); an opponent's creature returns to its owner", () => {
    const { s: s0, ap, opp, ids } = setup([exileSpell]);
    const k = putOnBattlefield(s0, ap, kaya());
    s0.objects[k]!.counters.loyalty = 5;
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, k, 0, [tgt(theirs)])));
    s.objects[theirs]!.counters = {};
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(theirs);
    // The Spirit is made by the ability's controller: the creature's controller as it left.
    expect(named(s, "Spirit").map((id) => characteristics(s, s.objects[id]!).controller)).toEqual([opp]);
  });

  it("−7: at the beginning of your upkeep, you may cast a legendary spell from your hand, graveyard or exile for nothing", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kaya());
    s0.objects[k]!.counters.loyalty = 7;
    const fromYard = into(s0, ap, legend, "graveyard");
    const fromExile = into(s0, ap, legend2, "exile");
    const plain = into(s0, ap, bear({ name: "Test Plain Bears" }), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, k, 2)));
    expect(s.emblems?.length).toBe(1);
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && !offered(s).length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(offered(s)).toContain(fromYard);
    expect(offered(s)).toContain(fromExile);
    expect(offered(s)).not.toContain(plain);
    expect(offered(s).every((id) => id === "none" || characteristics(s, s.objects[id]!).supertypes.includes("Legendary"))).toBe(true);
    s = act(s, { type: "chooseOption", player: ap, choice: fromExile });
    s = settle(run(s, planCast(s, ap, fromExile)));
    // One spell only: the creature cast at upkeep, nothing more offered.
    expect([zone(s, fromExile), zone(s, fromYard), offered(s).length]).toEqual(["battlefield", "graveyard", 0]);
  });
});

describe("Slimefoot's Survey", () => {
  it("up to two land cards that each have a basic land type, nonbasic ones too; then the top X cards, X counted after", () => {
    const { s: s0, ap, ids } = setup([survey()]);
    const dual = into(s0, ap, tundra, "library");
    const waste = into(s0, ap, desert, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const cards = (s.pending as { cards: ObjectId[] }).cards;
    expect(cards).toContain(dual);
    expect(cards).not.toContain(waste);
    const basic = cards.find((id) => id !== dual)!;
    s = act(s, { type: "searchLibrary", player: ap, found: [dual, basic] });
    expect([zone(s, dual), zone(s, basic), s.objects[dual]!.tapped, s.objects[basic]!.tapped]).toEqual(["battlefield", "battlefield", true, true]);
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) s = s.pending ? botActions(s, s.pending.player).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Eon Frolicker", () => {
  it("cast: target opponent takes the next turn; until your next turn you and your planeswalkers have protection from that player", () => {
    const { s: s0, ap, ids } = setup([frolicker()]);
    const far = nextOpp(s0, ap, 2);
    const other = nextOpp(s0, ap, 3);
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters.loyalty = 3;
    const theirs = putOnBattlefield(s0, far, bear({ name: "Far Bears" }));
    const others = putOnBattlefield(s0, other, bear({ name: "Other Bears" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [{ kind: "player", id: far }] });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(characteristics(s, s.objects[w]!).keywords).toContain(`Protection from player #${far}`);
    s = passUntil(s, "upkeep");
    expect(s.activePlayer).toBe(far);
    // Their creature's damage to you is prevented.
    s = fight(s, far, [theirs], ap);
    expect(s.players[ap]!.life).toBe(40);
    // Another opponent's isn't.
    s = fight(s, other, [others], ap);
    expect(s.players[ap]!.life).toBe(38);
    s = passUntil(s, "upkeep", ap);
    expect(characteristics(s, s.objects[w]!).keywords).not.toContain(`Protection from player #${far}`);
    expect(s.players[ap]!.gainedUntilNextTurn ?? []).not.toContain(`Protection from player #${far}`);
  });

  it("not cast: no extra turn", () => {
    const { s: s0, ap } = setup([]);
    let s = act(s0, { type: "passPriority", player: ap });
    putOnBattlefield(s, ap, frolicker());
    s = passUntil(s, "upkeep");
    expect(s.activePlayer).toBe(nextOpp(s0, ap, 1));
  });
});

describe("Skullbriar, the Walking Grave and Me, the Immortal", () => {
  it("counters stay as it dies and is returned to the battlefield; not as it goes to a hand", () => {
    const { s: s0, ap, ids } = setup([raise, bounce]);
    const sk = putOnBattlefield(s0, ap, skullbriar());
    s0.objects[sk]!.counters["+1/+1"] = 2;
    s0.objects[sk]!.damage = 9;
    invalidateCharacteristics(s0);
    runStateBasedActions(s0);
    let s = settle(s0);
    expect([zone(s, sk), s.objects[sk]!.counters["+1/+1"], pt(s, sk)]).toEqual(["graveyard", 2, "3/3"]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(sk)])));
    expect([zone(s, sk), s.objects[sk]!.counters["+1/+1"], pt(s, sk)]).toEqual(["battlefield", 2, "3/3"]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(sk)])));
    expect([zone(s, sk), s.objects[sk]!.counters["+1/+1"] ?? 0]).toEqual(["hand", 0]);
  });

  it("without its abilities on the battlefield the counters are lost (rulings); another creature's always are", () => {
    const { s: s0, ap } = setup([]);
    const sk = putOnBattlefield(s0, ap, skullbriar());
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[sk]!.counters["+1/+1"] = 2;
    s0.objects[b]!.counters["+1/+1"] = 2;
    s0.effects.push({ id: "x1", timestamp: s0.nextTimestamp++, controller: ap, sourceName: "test", duration: "game", affected: [sk], mods: [{ kind: "loseAllAbilities" }] });
    s0.objects[sk]!.damage = 9;
    s0.objects[b]!.damage = 9;
    invalidateCharacteristics(s0);
    runStateBasedActions(s0);
    const s = settle(s0);
    expect([zone(s, sk), zone(s, b), s.objects[sk]!.counters["+1/+1"] ?? 0, s.objects[b]!.counters["+1/+1"] ?? 0]).toEqual(["graveyard", "graveyard", 0, 0]);
  });

  it("Me, the Immortal keeps its counters in exile, keyword counters included", () => {
    const { s: s0, ap, ids } = setup([exileSpell]);
    const m = putOnBattlefield(s0, ap, me());
    s0.objects[m]!.counters["+1/+1"] = 1;
    s0.objects[m]!.counters.menace = 1;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(m)])));
    expect([zone(s, m), s.objects[m]!.counters["+1/+1"], s.objects[m]!.counters.menace, pt(s, m)]).toEqual(["exile", 1, 1, "4/4"]);
    expect(objHasKeyword(s, s.objects[m]!, "Menace")).toBe(true);
  });
});

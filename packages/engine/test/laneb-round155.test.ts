// Lane B round B155: the Forms (Cloudform, Lightform, Rageform: "it becomes an Aura with enchant creature. Manifest the top
// card of your library and attach ~ to it", CR 611.2c, 701.40a, rulings), Write into Being (manifest one of the top two,
// the other on the top or bottom), Illusionary Terrain (two basic land types chosen as it enters, CR 305.7), Vision Charm
// (a land type and a basic land type chosen as it resolves, CR 611.2c), Treacherous Urge (a creature card from an
// opponent's revealed hand onto the battlefield under your control), Covenant of Minds (the opponent decides, rulings),
// Wakanda Forever! (two picks from the six revealed) and Kayla's Reconstruction (up to X cards onto the battlefield).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { landCouldProduce } from "../src/manaabilities";

// Real card data (Scryfall).
const cloudform = (): CardDef => ({"oracleId":"2b9384a0-db2d-49e2-b121-6b81a0d77722","name":"Cloudform","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, it becomes an Aura with enchant creature. Manifest the top card of your library and attach this enchantment to it. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nEnchanted creature has flying and hexproof.","colors":["U"],"colorIdentity":["U"],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/a/7/a7bb0f87-a0b3-4389-9580-63db449a2241.jpg?1783938707","artUrl":"https://cards.scryfall.io/art_crop/front/a/7/a7bb0f87-a0b3-4389-9580-63db449a2241.jpg?1783938707","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lightform = (): CardDef => ({"oracleId":"f2df375c-3741-409f-91d1-21bf632b2e1d","name":"Lightform","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, it becomes an Aura with enchant creature. Manifest the top card of your library and attach this enchantment to it. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nEnchanted creature has flying and lifelink.","colors":["W"],"colorIdentity":["W"],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9aa25045-ae03-4ac0-a4ed-472f7ca4ab3b.jpg?1783938711","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9aa25045-ae03-4ac0-a4ed-472f7ca4ab3b.jpg?1783938711","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rageform = (): CardDef => ({"oracleId":"2a108899-76b4-4f85-8a59-91838fc26f4a","name":"Rageform","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, it becomes an Aura with enchant creature. Manifest the top card of your library and attach this enchantment to it. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nEnchanted creature has double strike. (It deals both first-strike and regular combat damage.)","colors":["R"],"colorIdentity":["R"],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/0/3/038ed726-bde8-46b0-bdf5-f88e2f074434.jpg?1783938685","artUrl":"https://cards.scryfall.io/art_crop/front/0/3/038ed726-bde8-46b0-bdf5-f88e2f074434.jpg?1783938685","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const writeInto = (): CardDef => ({"oracleId":"4fc69345-4c1f-4113-8e1c-15b8e2e597fc","name":"Write into Being","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top two cards of your library. Manifest one of those cards, then put the other on the top or bottom of your library. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)","colors":["U"],"colorIdentity":["U"],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a85e6fbe-cda0-4fbf-853c-c03c567a7de9.jpg?1783938701","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a85e6fbe-cda0-4fbf-853c-c03c567a7de9.jpg?1783938701","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const terrain = (): CardDef => ({"oracleId":"17ae63fa-fd63-45e6-81c1-bf30851bf77c","name":"Illusionary Terrain","manaCost":"{U}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {2} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nAs this enchantment enters, choose two basic land types.\nBasic lands of the first chosen type are the second chosen type.","colors":["U"],"colorIdentity":["U"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/691f4a1b-4706-41aa-82da-ae920739f036.jpg?1783947514","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/691f4a1b-4706-41aa-82da-ae920739f036.jpg?1783947514","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const visionCharm = (): CardDef => ({"oracleId":"c56d2c5b-c3e3-4236-bc38-286e250aa4f7","name":"Vision Charm","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Target player mills four cards.\n• Choose a land type and a basic land type. Each land of the first chosen type becomes the second chosen type until end of turn.\n• Target artifact phases out. (While it's phased out, it's treated as though it doesn't exist. It phases in before its controller untaps during their next untap step.)","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b3fbc53-75d3-4d60-80de-cdb13e7c957f.jpg?1783904671","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b3fbc53-75d3-4d60-80de-cdb13e7c957f.jpg?1783904671","commanderLegal":"legal","set":"sld","releasedAt":"2025-12-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const urge = (): CardDef => ({"oracleId":"f44f2d2d-7899-4cf4-baf0-64d5bef60006","name":"Treacherous Urge","manaCost":"{4}{B}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You may put a creature card from it onto the battlefield under your control. That creature gains haste. Sacrifice it at the beginning of the next end step.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/22563bcd-1f29-4544-ba43-173ead61e62a.jpg?1783943152","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/22563bcd-1f29-4544-ba43-173ead61e62a.jpg?1783943152","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const covenant = (): CardDef => ({"oracleId":"3edac7df-2a88-4718-865e-703dff9c972e","name":"Covenant of Minds","manaCost":"{4}{U}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the top three cards of your library. Target opponent may choose to put those cards into your hand. If they don't, put those cards into your graveyard and draw five cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/e/6ef9a534-8938-4f73-aa62-dd4d81a18cc1.jpg?1783942574","artUrl":"https://cards.scryfall.io/art_crop/front/6/e/6ef9a534-8938-4f73-aa62-dd4d81a18cc1.jpg?1783942574","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wakanda = (): CardDef => ({"oracleId":"b8add484-8ed1-4a1c-aff9-dec65d60e4b1","name":"Wakanda Forever!","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the top six cards of your library. You may put a permanent card from among them onto the battlefield with an indestructible counter on it. You may put a permanent card from among them into your hand. Put the rest into your graveyard.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b893d46-25f0-4c6a-b9a3-ff25277be918.jpg?1783903274","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b893d46-25f0-4c6a-b9a3-ff25277be918.jpg?1783903274","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kayla = (): CardDef => ({"oracleId":"43bae4b3-57e8-4d9a-9d1b-9805b0e0fff5","name":"Kayla's Reconstruction","manaCost":"{X}{W}{W}{W}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top seven cards of your library. Put up to X artifact and/or creature cards with mana value 3 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/b/2bb84e72-0231-461a-a230-d8afa6e54289.jpg?1783920129","artUrl":"https://cards.scryfall.io/art_crop/front/2/b/2bb84e72-0231-461a-a230-d8afa6e54289.jpg?1783920129","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string) => ({ kind: "object" as const, id });
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
/** Everyone passes, answering the end-of-turn questions, until `active`'s `step`; stops at any other question. */
const goUntil = (s: GameState, step: GameState["step"], active: PlayerId, max = 3000) => {
  for (let i = 0; i < max; i++) {
    if (s.step === step && s.activePlayer === active) return s;
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
    else if (pend) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error(`never reached ${step}`);
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone === "hand" ? "hand" : "graveyard"].push(id);
  invalidateCharacteristics(s);
  return id;
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
const giant = (name = "Test Giant") => card(name, "Creature — Giant", "{3}{R}", { power: "3", toughness: "3", colors: ["R"] });
const relic = (name = "Test Relic") => card(name, "Artifact", "{2}", { oracleText: "" });
const landOf = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).name === name);

describe("Lane B round B155", () => {
  it("compiles the cards", () => supported(cloudform(), lightform(), rageform(), writeInto(), terrain(), visionCharm(), urge(), covenant(), wakanda(), kayla()));

  for (const [make, keywords, missing] of [
    [cloudform, ["Flying", "Hexproof"], "Double strike"],
    [lightform, ["Flying", "Lifelink"], "Hexproof"],
    [rageform, ["Double strike"], "Flying"],
  ] as const) {
    it(`${make().name}: becomes an Aura with enchant creature, attached to the card it manifests, which gets ${keywords.join(" and ")}`, () => {
      const { s: s0, ap, ids } = setup([make()]);
      const top = toZone(s0, ap, giant(), "library");
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      const form = ids[0]!;
      expect(zone(s, form)).toBe("battlefield");
      expect(zone(s, top)).toBe("battlefield");
      expect(s.objects[top]!.faceDown).toBe("manifest");
      expect(s.objects[form]!.attachedTo).toBe(top);
      expect(subtypes(s, form)).toContain("Aura");
      expect(characteristics(s, s.objects[form]!).types).toEqual(["Enchantment"]);
      for (const k of keywords) expect(objHasKeyword(s, s.objects[top]!, k), k).toBe(true);
      expect(objHasKeyword(s, s.objects[top]!, missing)).toBe(false);
      expect(characteristics(s, s.objects[top]!).power).toBe(2);
      // The face-down creature dies: the Form is an Aura attached to nothing, put into the graveyard (CR 704.5m).
      s.objects[top]!.damage = 2;
      s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
      expect(zone(s, top)).toBe("graveyard");
      expect(zone(s, form)).toBe("graveyard");
    });
  }

  it("Cloudform with an empty library: nothing is manifested and the Aura goes to the graveyard (rulings)", () => {
    const { s: s0, ap, ids } = setup([cloudform()]);
    s0.players[ap]!.library = [];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("Lightform bounced with its trigger on the stack: the card is still manifested, and the Form in hand stays an enchantment card (CR 400.7)", () => {
    const { s: s0, ap, ids } = setup([lightform()]);
    const top = toZone(s0, ap, giant(), "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.stack.some((x) => x.kind !== "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // Return it to its owner's hand before the trigger resolves.
    const o = s.objects[ids[0]!]!;
    s.battlefield.splice(s.battlefield.indexOf(o.id), 1);
    o.zone = "hand";
    o.zoneChanges = (o.zoneChanges ?? 0) + 1;
    s.players[ap]!.hand.push(o.id);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[top]!.faceDown).toBe("manifest");
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(subtypes(s, ids[0]!)).not.toContain("Aura");
    expect(objHasKeyword(s, s.objects[top]!, "Flying")).toBe(false);
  });

  it("Write into Being: one of the top two is manifested, the other kept on top", () => {
    const { s: s0, ap, ids } = setup([writeInto()]);
    const second = toZone(s0, ap, relic(), "library");
    const first = toZone(s0, ap, giant(), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([first, second]);
    s = act(s, { type: "searchLibrary", player: ap, found: [second] });
    expect(s.objects[second]!.faceDown).toBe("manifest");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1, cards: [first] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [first] }));
    expect(s.players[ap]!.library[0]).toBe(first);
  });

  it("Write into Being: or the other goes to the bottom", () => {
    const { s: s0, ap, ids } = setup([writeInto()]);
    const second = toZone(s0, ap, relic(), "library");
    const first = toZone(s0, ap, giant(), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "searchLibrary", player: ap, found: [first] });
    expect(s.objects[first]!.faceDown).toBe("manifest");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(second);
    expect(lib[0]).not.toBe(second);
  });

  it("Illusionary Terrain: two different basic land types; basic lands of the first become the second (CR 305.7), others untouched", () => {
    const { s: s0, ap, ids } = setup([terrain()]);
    const [o1] = others(s0, ap);
    const theirIsland = putOnBattlefield(s0, o1!, card("Island", "Basic Land — Island", "", { supertypes: ["Basic"] }));
    const tropical = putOnBattlefield(s0, o1!, card("Test Tropical", "Land — Forest Island"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "basicLandType", player: ap, options: ["Plains", "Island", "Swamp", "Mountain", "Forest"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "Island" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "basicLandType", player: ap, options: ["Plains", "Swamp", "Mountain", "Forest"] });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "Island" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Swamp" }));
    expect(s.objects[ids[0]!]!.chosen?.landTypes).toEqual(["Island", "Swamp"]);
    expect(subtypes(s, theirIsland)).toEqual(["Swamp"]);
    expect(landCouldProduce(s, s.objects[theirIsland]!)).toEqual(["B"]);
    for (const id of landOf(s, ap, "Island")) expect(subtypes(s, id)).toEqual(["Swamp"]);
    // A nonbasic Island isn't a basic land: unchanged.
    expect(subtypes(s, tropical)).toEqual(["Forest", "Island"]);
    for (const id of landOf(s, ap, "Forest")) expect(subtypes(s, id)).toEqual(["Forest"]);
  });

  it("Illusionary Terrain: the bot changes the type its opponents rely on into a color they don't use", () => {
    const { s: s0, ap, ids } = setup([terrain()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const [o1, o2] = others(s, ap);
    for (const p of [o1!, o2!]) for (let k = 0; k < 3; k++) putOnBattlefield(s, p, card("Island", "Basic Land — Island", "", { supertypes: ["Basic"] }));
    invalidateCharacteristics(s);
    const first = botActions(s, ap)[0];
    expect(first).toEqual({ type: "chooseOption", player: ap, choice: "Island" });
    s = act(s, first!);
    const second = botActions(s, ap)[0];
    expect(second?.type).toBe("chooseOption");
    expect(second?.type === "chooseOption" && second.choice).not.toBe("Island");
  });

  it("Vision Charm: each land of the chosen type becomes the basic land type until end of turn, the lands fixed as it resolves", () => {
    const { s: s0, ap, ids } = setup([visionCharm()]);
    const [o1] = others(s0, ap);
    const gate = putOnBattlefield(s0, o1!, card("Test Gate", "Land — Gate", "", { oracleText: "{T}: Add {C}." }));
    const theirMountain = putOnBattlefield(s0, o1!, card("Mountain", "Basic Land — Mountain", "", { supertypes: ["Basic"] }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], [1])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "landType", player: ap });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toContain("Gate");
    s = act(s, { type: "chooseOption", player: ap, choice: "Gate" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "basicLandType", player: ap, options: ["Plains", "Island", "Swamp", "Mountain", "Forest"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Mountain" }));
    expect(subtypes(s, gate)).toEqual(["Mountain"]);
    expect(landCouldProduce(s, s.objects[gate]!)).toEqual(["R"]);
    expect(subtypes(s, theirMountain)).toEqual(["Mountain"]);
    // A Gate that enters later isn't one of them (CR 611.2c).
    const late = putOnBattlefield(s, o1!, card("Late Gate", "Land — Gate", "", { oracleText: "{T}: Add {C}." }));
    invalidateCharacteristics(s);
    expect(subtypes(s, late)).toEqual(["Gate"]);
    s = goUntil(s, "upkeep", o1!);
    expect(subtypes(s, gate)).toEqual(["Gate"]);
  });

  it("Vision Charm's other modes still work: target player mills four", () => {
    const { s: s0, ap, ids } = setup([visionCharm()]);
    const [o1] = others(s0, ap);
    const before = s0.players[o1!]!.graveyard.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: o1! }], [0])));
    expect(s.players[o1!]!.graveyard.length).toBe(before + 4);
  });

  it("Treacherous Urge: a creature card from the opponent's hand under your control with haste, sacrificed at the next end step", () => {
    const { s: s0, ap, ids } = setup([urge()]);
    const [o1] = others(s0, ap);
    s0.players[o1!]!.hand = [];
    const theirs = toZone(s0, o1!, giant("Their Giant"), "hand");
    const spell = toZone(s0, o1!, card("Their Bolt", "Instant", "{R}", { oracleText: "Draw a card." }), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: o1! }])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [theirs], min: 0, max: 1, hand: o1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }));
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
    expect(objHasKeyword(s, s.objects[theirs]!, "Haste")).toBe(true);
    expect(zone(s, spell)).toBe("hand");
    s = goUntil(s, "cleanup", ap);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.players[o1!]!.graveyard).toContain(theirs);
  });

  it("Treacherous Urge: you may put none", () => {
    const { s: s0, ap, ids } = setup([urge()]);
    const [o1] = others(s0, ap);
    s0.players[o1!]!.hand = [];
    const theirs = toZone(s0, o1!, giant("Their Giant"), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: o1! }])));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(zone(s, theirs)).toBe("hand");
  });

  it("Covenant of Minds: the opponent lets you have the three revealed cards", () => {
    const { s: s0, ap, ids } = setup([covenant()]);
    const [o1] = others(s0, ap);
    const top3 = [relic("C"), relic("B"), relic("A")].map((d) => toZone(s0, ap, d, "library")).reverse();
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: o1! }])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: o1 });
    // The bot opponent gives the three known cards rather than five draws.
    expect(botActions(s, o1!)).toEqual([{ type: "chooseMay", player: o1, yes: true }]);
    s = settle(act(s, { type: "chooseMay", player: o1!, yes: true }));
    for (const id of top3) expect(zone(s, id)).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Covenant of Minds: if they don't, the three go to your graveyard and you draw five", () => {
    const { s: s0, ap, ids } = setup([covenant()]);
    const [o1] = others(s0, ap);
    const top3 = [relic("C"), relic("B"), relic("A")].map((d) => toZone(s0, ap, d, "library"));
    const next5 = s0.players[ap]!.library.slice(3, 8);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: o1! }])));
    s = settle(act(s, { type: "chooseMay", player: o1!, yes: false }));
    for (const id of top3) expect(zone(s, id)).toBe("graveyard");
    for (const id of next5) expect(zone(s, id)).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 5);
  });

  it("Covenant of Minds: the bot opponent says no when five more draws would empty your library", () => {
    const { s: s0, ap, ids } = setup([covenant()]);
    const [o1] = others(s0, ap);
    s0.players[ap]!.library = s0.players[ap]!.library.slice(0, 6);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: o1! }])));
    expect(botActions(s, o1!)).toEqual([{ type: "chooseMay", player: o1, yes: false }]);
  });

  it("Wakanda Forever!: one permanent onto the battlefield with an indestructible counter, one into your hand, the rest into your graveyard", () => {
    const { s: s0, ap, ids } = setup([wakanda()]);
    const spellCard = card("Test Spell", "Sorcery", "{1}", { oracleText: "Draw a card." });
    const six = [giant("G1"), relic("R1"), spellCard, giant("G2"), relic("R2"), card("Test Spell 2", "Instant", "{1}", { oracleText: "Draw a card." })].reverse().map((d) => toZone(s0, ap, d, "library")).reverse();
    const below = s0.players[ap]!.library[6]!;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    // Only permanent cards may be put.
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([six[0], six[1], six[3], six[4]]);
    s = act(s, { type: "searchLibrary", player: ap, found: [six[0]!] });
    expect(zone(s, six[0]!)).toBe("battlefield");
    expect(s.objects[six[0]!]!.counters.indestructible).toBe(1);
    expect(objHasKeyword(s, s.objects[six[0]!]!, "Indestructible")).toBe(true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([six[1], six[3], six[4]]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [six[4]!] }));
    expect(zone(s, six[4]!)).toBe("hand");
    for (const i of [1, 2, 3, 5]) expect(zone(s, six[i]!), String(i)).toBe("graveyard");
    expect(zone(s, below)).toBe("library");
  });

  it("Wakanda Forever!: none put onto the battlefield, the hand pick is among all six", () => {
    const { s: s0, ap, ids } = setup([wakanda()]);
    const six = [giant("G1"), relic("R1"), giant("G2"), relic("R2"), giant("G3"), relic("R3")].reverse().map((d) => toZone(s0, ap, d, "library")).reverse();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "searchLibrary", player: ap, found: [] });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual(six);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [six[5]!] }));
    expect(zone(s, six[5]!)).toBe("hand");
    for (const i of [0, 1, 2, 3, 4]) expect(zone(s, six[i]!)).toBe("graveyard");
  });

  it("Kayla's Reconstruction: up to X artifact and/or creature cards with mana value 3 or less onto the battlefield, each card's own mana value (rulings)", () => {
    const { s: s0, ap, ids } = setup([kayla()]);
    const seven = [relic("R1"), bear({ name: "Cheap Bear" }), giant("Big Giant"), card("Pricey Relic", "Artifact", "{4}"), relic("R2"), card("Test Sorcery", "Sorcery", "{1}", { oracleText: "Draw a card." }), relic("R3")].reverse().map((d) => toZone(s0, ap, d, "library")).reverse();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([seven[0], seven[1], seven[4], seven[6]]);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [seven[0]!, seven[1]!, seven[4]!] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [seven[0]!, seven[1]!] }));
    expect(zone(s, seven[0]!)).toBe("battlefield");
    expect(zone(s, seven[1]!)).toBe("battlefield");
    for (const i of [2, 3, 4, 5, 6]) expect(zone(s, seven[i]!)).toBe("library");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-5).sort()).toEqual([seven[2], seven[3], seven[4], seven[5], seven[6]].sort());
  });
});

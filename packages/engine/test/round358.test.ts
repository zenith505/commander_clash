// Round 358 (Lane A): a Vehicle exiled at end of combat and returned as a land (Conqueror's Galleon), mana only for a
// creature spell of the chosen type or a legendary creature spell (Kolvori, God of Kinship // The Ringhart Crest),
// keywords while a creature card in any graveyard has them (Cairn Wanderer), a looted artifact card made into a 0/2
// Thopter token copy (Leonardo da Vinci), lands that are 8/8 Elementals while they keep an awakening counter (Liege of the
// Tangle), and a Mount saddled or a Vehicle animated at the beginning of combat (Alacrian Armory).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
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
const moveTo = (zone: "graveyard" | "hand" | "library") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toYard = moveTo("graveyard");
const toHand = moveTo("hand");
const onTop = moveTo("library");
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const kws = (s: GameState, id: ObjectId) => [...(ch(s, id).keywords ?? [])].sort();

// Real oracle text (Scryfall).
const mascot = (): CardDef => ({"oracleId":"5fa7cf3a-2a4d-4dd7-890b-49c497570b16","name":"District Mascot","manaCost":"{G}","cmc":1,"typeLine":"Creature — Dog Mount","supertypes":[],"types":["Creature"],"subtypes":["Dog","Mount"],"oracleText":"This creature enters with a +1/+1 counter on it.\n{1}{G}, Remove two +1/+1 counters from this creature: Destroy target artifact.\nWhenever this creature attacks while saddled, put a +1/+1 counter on it.\nSaddle 1","power":"0","toughness":"0","colors":["G"],"colorIdentity":["G"],"keywords":["Saddle"],"commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dreadnought = (): CardDef => ({"oracleId":"bc822c9a-633f-4830-9cb3-9af6a80622e4","name":"Consulate Dreadnought","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Crew 6 (Tap any number of creatures you control with total power 6 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"7","toughness":"11","colors":[],"colorIdentity":[],"keywords":["Crew"],"commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wraith = (): CardDef => ({"oracleId":"508248d1-09a4-4e41-a4c9-286618e5061e","name":"Bog Wraith","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Wraith","supertypes":[],"types":["Creature"],"subtypes":["Wraith"],"oracleText":"Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Landwalk","Swampwalk"],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const knight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wastes = (): CardDef => ({"oracleId":"05d24b0c-904a-46b6-b42a-96a4d91a0dd4","name":"Wastes","manaCost":"","cmc":0,"typeLine":"Basic Land","supertypes":["Basic"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fynn = (): CardDef => ({"oracleId":"c0b1fba1-4338-4671-934b-098689ad2085","name":"Fynn, the Fangbearer","manaCost":"{1}{G}","cmc":2,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nWhenever a creature you control with deathtouch deals combat damage to a player, that player gets two poison counters. (A player with ten or more poison counters loses the game.)","power":"1","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Deathtouch"],"commanderLegal":"legal","set":"mul","releasedAt":"2023-04-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const galleon = (): CardDef => ({"oracleId":"88b18901-50cd-461c-b1bc-be900210be8e","name":"Conqueror's Galleon // Conqueror's Foothold","manaCost":"{4}","cmc":4,"typeLine":"Artifact — Vehicle // Land","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"When this Vehicle attacks, exile it at end of combat, then return it to the battlefield transformed under your control.\nCrew 4 (Tap any number of creatures you control with total power 4 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"2","toughness":"10","colors":[],"colorIdentity":[],"keywords":["Transform","Crew"],"producedMana":["C"],"commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Conqueror's Galleon","manaCost":"{4}","typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"When this Vehicle attacks, exile it at end of combat, then return it to the battlefield transformed under your control.\nCrew 4 (Tap any number of creatures you control with total power 4 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"2","toughness":"10","colors":[]},{"name":"Conqueror's Foothold","manaCost":"","typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"(Transforms from Conqueror's Galleon.)\n{T}: Add {C}.\n{2}, {T}: Draw a card, then discard a card.\n{4}, {T}: Draw a card.\n{6}, {T}: Return target card from your graveyard to your hand.","colors":[]}]}) as CardDef;
const kolvori = (): CardDef => ({"oracleId":"490ac985-79b5-438d-a2e7-f47683b29683","name":"Kolvori, God of Kinship // The Ringhart Crest","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Legendary Creature — God // Legendary Artifact","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"As long as you control three or more legendary creatures, Kolvori gets +4/+2 and has vigilance.\n{1}{G}, {T}: Look at the top six cards of your library. You may reveal a legendary creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.","power":"2","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Kolvori, God of Kinship","manaCost":"{2}{G}{G}","typeLine":"Legendary Creature — God","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"As long as you control three or more legendary creatures, Kolvori gets +4/+2 and has vigilance.\n{1}{G}, {T}: Look at the top six cards of your library. You may reveal a legendary creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.","power":"2","toughness":"4","colors":["G"]},{"name":"The Ringhart Crest","manaCost":"{1}{G}","typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"As The Ringhart Crest enters, choose a creature type.\n{T}: Add {G}. Spend this mana only to cast a creature spell of the chosen type or a legendary creature spell.","colors":["G"]}]}) as CardDef;
const cairn = (): CardDef => ({"oracleId":"a549d54f-2640-455c-8a93-bef4df2f9e8b","name":"Cairn Wanderer","manaCost":"{4}{B}","cmc":5,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nAs long as a creature card with flying is in a graveyard, this creature has flying. The same is true for fear, first strike, double strike, deathtouch, haste, landwalk, lifelink, protection, reach, trample, shroud, and vigilance.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const leonardo = (): CardDef => ({"oracleId":"92a287a0-b3cc-4040-a530-fb71510cfc67","name":"Leonardo da Vinci","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Human Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"{3}{U}{U}: Until end of turn, Thopters you control have base power and toughness X/X, where X is the number of cards in your hand.\n{2}{U}, {T}: Draw a card, then discard a card. If the discarded card was an artifact card, exile it from your graveyard. If you do, create a token that's a copy of it, except it's a 0/2 Thopter artifact creature with flying in addition to its other types.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const liege = (): CardDef => ({"oracleId":"a85b845c-a196-43db-b740-6ce191345097","name":"Liege of the Tangle","manaCost":"{6}{G}{G}","cmc":8,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Trample\nWhenever this creature deals combat damage to a player, you may choose any number of target lands you control and put an awakening counter on each of them. Each of those lands is an 8/8 green Elemental creature for as long as it has an awakening counter on it. They're still lands.","power":"8","toughness":"8","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const armory = (): CardDef => ({"oracleId":"3fa2d51c-d549-4287-ac3b-76bc72bcd8bc","name":"Alacrian Armory","manaCost":"{3}{W}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Creatures you control get +0/+1 and have vigilance.\nAt the beginning of combat on your turn, choose up to one target Mount or Vehicle you control. Until end of turn, that permanent becomes saddled if it's a Mount and becomes an artifact creature if it's a Vehicle.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("round 358: compiles", () => {
  it("every card of the round", () => supported(galleon(), kolvori(), cairn(), leonardo(), liege(), armory()));
});

/** `attacker` attacks `opp` from the active player's side; stops at the first question of the active player's. */
const attack = (s0: GameState, ap: PlayerId, opp: PlayerId, attacker: ObjectId) => {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
  for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Conqueror's Galleon", () => {
  /** A crewed Galleon attacks; its trigger has resolved. */
  const attacking = () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, galleon());
    s0.effects.push({ id: `x${s0.nextId++}`, timestamp: s0.nextTimestamp++, controller: ap, sourceName: "crew", duration: "endOfTurn", affected: [g], mods: [{ kind: "addTypes", types: ["Artifact", "Creature"], subtypes: [] }] });
    invalidateCharacteristics(s0);
    const s = attack(s0, ap, opp, g);
    expect(s.delayed?.length ?? 0).toBeGreaterThan(0);
    return { s, ap, opp, g };
  };

  it("at end of combat it's exiled and returns transformed, untapped, under your control: Conqueror's Foothold", () => {
    const { s: s0, ap, g } = attacking();
    expect(s0.objects[g]!.tapped).toBe(true);
    let s = passUntil(s0, "endCombat", ap);
    s = settle(s, ap);
    const foothold = s.battlefield.find((id) => ch(s, id).name === "Conqueror's Foothold");
    expect(foothold).toBeDefined();
    const o = s.objects[foothold!]!;
    expect(o.controller).toBe(ap);
    expect(o.tapped).toBe(false);
    expect(ch(s, foothold!).types).toEqual(["Land"]);
    // A new object: the crew effect on the Galleon doesn't follow it (CR 400.7).
    expect(ch(s, foothold!).types.includes("Creature")).toBe(false);
  });

  it("if it has left the battlefield before end of combat, nothing returns", () => {
    const { s: s0, ap, g } = attacking();
    s0.battlefield.splice(s0.battlefield.indexOf(g), 1);
    s0.objects[g]!.zone = "graveyard";
    s0.objects[g]!.zoneChanges = (s0.objects[g]!.zoneChanges ?? 0) + 1;
    s0.players[ap]!.graveyard.push(g);
    invalidateCharacteristics(s0);
    const s = settle(passUntil(s0, "endCombat", ap), ap);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.battlefield.some((id) => ch(s, id).name === "Conqueror's Foothold")).toBe(false);
  });
});

describe("The Ringhart Crest", () => {
  /** Your only mana: The Ringhart Crest (with `type` chosen, if any) and a Wastes. */
  const crest = (type: string | undefined, hand: CardDef[]) => {
    const { s, ap, ids } = setup(hand);
    s.battlefield = s.battlefield.filter((id) => s.objects[id]!.controller !== ap);
    const c = putOnBattlefield(s, ap, kolvori());
    s.objects[c]!.face = 1;
    if (type) s.objects[c]!.chosen = { type };
    putOnBattlefield(s, ap, wastes());
    invalidateCharacteristics(s);
    expect(ch(s, c).name).toBe("The Ringhart Crest");
    return { s, ap, ids };
  };

  it("its {G} pays for a creature spell of the chosen type or a legendary creature spell, not another creature spell", () => {
    const { s, ap, ids } = crest("Bear", [bears(), fynn(), elves()]);
    expect(planCast(s, ap, ids[0]!)).not.toBeNull(); // Grizzly Bears, a Bear
    expect(planCast(s, ap, ids[1]!)).not.toBeNull(); // Fynn, legendary
    expect(planCast(s, ap, ids[2]!)).toBeNull(); // Llanowar Elves, an Elf
    const after = run(s, planCast(s, ap, ids[0]!));
    expect(after.stack.some((x) => x.objectId === ids[0])).toBe(true);
  });

  it("with no creature type chosen, its mana can still be spent on a legendary creature spell (rulings)", () => {
    const { s, ap, ids } = crest(undefined, [bears(), fynn()]);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
  });
});

describe("Cairn Wanderer", () => {
  it("has each listed keyword while a creature card in any graveyard has it, landwalk and protection by kind", () => {
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, cairn());
    expect(kws(s, w)).toEqual(["Changeling"]);
    const a = toYard(s, opp, angel());
    expect(kws(s, w)).toEqual(["Changeling", "Flying", "Vigilance"]);
    toYard(s, ap, wraith());
    toYard(s, opp, knight());
    expect(kws(s, w)).toEqual(["Changeling", "First strike", "Flying", "Protection from black", "Swampwalk", "Vigilance"]);
    // The Angel leaves the graveyard: no more flying or vigilance.
    s.players[opp]!.graveyard.splice(s.players[opp]!.graveyard.indexOf(a), 1);
    s.objects[a]!.zone = "exile";
    s.players[opp]!.exile.push(a);
    invalidateCharacteristics(s);
    expect(kws(s, w)).toEqual(["Changeling", "First strike", "Protection from black", "Swampwalk"]);
  });

  it("only creature cards count, and only in graveyards", () => {
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, cairn());
    toHand(s, ap, angel());
    putOnBattlefield(s, opp, angel());
    toYard(s, opp, mindStone());
    expect(kws(s, w)).toEqual(["Changeling"]);
  });
});

describe("Leonardo da Vinci", () => {
  /** Leonardo's loot with `discard` in hand and a Forest on top; you choose to discard `discard`. */
  const loot = (discard: CardDef) => {
    const { s: s0, ap, ids } = setup([discard]);
    const l = putOnBattlefield(s0, ap, leonardo());
    onTop(s0, ap, forest());
    let s = run(s0, planActivate(s0, ap, l, 1));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    return { s, ap, id: ids[0]! };
  };

  it("discarding an artifact card: exiled from the graveyard and copied as a 0/2 flying Thopter artifact creature", () => {
    const { s: s0, ap, id } = loot(mindStone());
    const s = settle(act(s0, { type: "discard", player: ap, objectIds: [id] }), ap);
    expect(s.objects[id]!.zone).toBe("exile");
    const token = s.battlefield.find((x) => s.objects[x]!.isToken && ch(s, x).name === "Mind Stone")!;
    expect(token).toBeDefined();
    const c = ch(s, token);
    expect(c.types.sort()).toEqual(["Artifact", "Creature"]);
    expect(c.subtypes).toContain("Thopter");
    expect([c.power, c.toughness]).toEqual([0, 2]);
    expect(c.keywords).toContain("Flying");
    expect(s.objects[token]!.controller).toBe(ap);
  });

  it("discarding a nonartifact card: it stays in the graveyard, no token", () => {
    const { s: s0, ap, id } = loot(bears());
    const s = settle(act(s0, { type: "discard", player: ap, objectIds: [id] }), ap);
    expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.battlefield.some((x) => s.objects[x]!.isToken)).toBe(false);
  });
});

describe("Liege of the Tangle", () => {
  /** Liege deals combat damage to `opp`; stops at its trigger's targets. */
  const hit = () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, liege());
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && ch(s0, id).types.includes("Land"));
    let s = attack(s0, ap, opp, l);
    for (let i = 0; i < 60 && s.pending?.player !== ap; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    return { s, ap, opp, l, lands };
  };

  it("each chosen land gets an awakening counter and is an 8/8 green Elemental creature that's still a land", () => {
    const { s: s0, ap, l, lands } = hit();
    const [a, b, c] = lands as [ObjectId, ObjectId, ObjectId];
    let s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [a, b].map((id) => ({ kind: "object" as const, id })) }), ap);
    for (const id of [a, b]) {
      expect(s.objects[id]!.counters.awakening).toBe(1);
      const x = ch(s, id);
      expect(x.types.sort()).toEqual(["Creature", "Land"]);
      expect(x.subtypes).toEqual(expect.arrayContaining(["Elemental"]));
      expect(x.colors).toEqual(["G"]);
      expect([x.power, x.toughness]).toEqual([8, 8]);
    }
    expect(ch(s, c).types).toEqual(["Land"]);
    // Liege leaving the battlefield changes nothing (rulings).
    s.battlefield.splice(s.battlefield.indexOf(l), 1);
    s.objects[l]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(l);
    invalidateCharacteristics(s);
    expect(ch(s, a).types.includes("Creature")).toBe(true);
    // Once a land has no awakening counter, it's only a land again, even if one is put back later (CR 611.2b).
    s.objects[a]!.counters.awakening = 0;
    s = settle(passUntil(s, "endCombat", ap), ap);
    expect(ch(s, a).types).toEqual(["Land"]);
    s.objects[a]!.counters.awakening = 1;
    invalidateCharacteristics(s);
    expect(ch(s, a).types).toEqual(["Land"]);
    expect(ch(s, b).types.includes("Creature")).toBe(true);
  });

  it("no targets chosen: nothing happens", () => {
    const { s: s0, ap, lands } = hit();
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [] }), ap);
    for (const id of lands) expect(ch(s, id).types).toEqual(["Land"]);
  });
});

describe("Alacrian Armory", () => {
  /** Armory and `def` on your battlefield; on to your beginning of combat, stopping at the trigger's target. */
  const combat = (def: CardDef) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, armory());
    const m = putOnBattlefield(s0, ap, def);
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    return { s, ap, opp, m };
  };

  it("a Mount becomes saddled until end of turn: its 'attacks while saddled' trigger works", () => {
    const { s: s0, ap, opp, m } = combat(mascot());
    let s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: m }] }), ap);
    expect(s.objects[m]!.saddled).toBeTruthy();
    const before = s.objects[m]!.counters["+1/+1"] ?? 0;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = attack(s, ap, opp, m);
    s = settle(s, ap);
    expect(s.objects[m]!.counters["+1/+1"]).toBe(before + 1);
  });

  it("a Vehicle becomes an artifact creature until end of turn", () => {
    const { s: s0, ap, m } = combat(dreadnought());
    expect(ch(s0, m).types).toEqual(["Artifact"]);
    let s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: m }] }), ap);
    expect(ch(s, m).types.sort()).toEqual(["Artifact", "Creature"]);
    expect([ch(s, m).power, ch(s, m).toughness]).toEqual([7, 12]); // +0/+1 from the Armory
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(ch(s, m).types).toEqual(["Artifact"]);
  });
});

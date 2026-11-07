// Round 299: harder cards from the "Out after round N" lists, most played first.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { attackProblem, attackTaxOf, castProblem, spellCost } from "../src/game";
import { applyAction, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority only while something is on the stack or waiting to go there (no step is left). */
const drain = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A fresh copy of `def` in `pid`'s `where` (the top of the library). */
const put = (s: GameState, pid: PlayerId, def: CardDef, where: "library" | "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const cast = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => drain(run(s, planCast(s, pid, id, targets)));
const generic = (s: GameState, pid: PlayerId, id: string) => {
  const c = spellCost(s, pid, s.objects[id]!);
  return c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
};
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const kill = card("Test Kill", "Instant", "{0}", { oracleText: "Destroy target creature." });
const blackBear = () => card("Test Black Bear", "Creature — Bear", "{1}{B}", { power: "2", toughness: "2", colors: ["B"] });
/** Declares these attacks at `defender` and passes until the stack is empty or someone is asked something. */
const attack = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) } as Action);
  return drain(s);
};

// Real oracle text (Scryfall).
const elephantGrass = (): CardDef => ({"oracleId":"53cc4b93-538d-4193-8bbb-5b73d3ce9d79","name":"Elephant Grass","manaCost":"{G}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nBlack creatures can't attack you.\nNonblack creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.","colors":["G"],"colorIdentity":["G"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f4c1f5a7-0d28-43ab-9b66-937e963f42cd.jpg?1783946983","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f4c1f5a7-0d28-43ab-9b66-937e963f42cd.jpg?1783946983","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const slitherwisp = (): CardDef => ({"oracleId":"ccc4f21f-cf8c-40bb-a6d6-1f624320c5b2","name":"Slitherwisp","manaCost":"{U}{B}{B}","cmc":3,"typeLine":"Creature — Elemental Nightmare","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Nightmare"],"oracleText":"Flash\nWhenever you cast another spell that has flash, you draw a card and each opponent loses 1 life.","power":"3","toughness":"2","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/8/0/8067f195-8b6e-4329-a34e-43e52f67c571.jpg?1783931018","artUrl":"https://cards.scryfall.io/art_crop/front/8/0/8067f195-8b6e-4329-a34e-43e52f67c571.jpg?1783931018","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const lumberingMegasloth = (): CardDef => ({"oracleId":"6492c381-0fa1-4d43-bf72-d8956d8a34b6","name":"Lumbering Megasloth","manaCost":"{10}{G}{G}","cmc":12,"typeLine":"Creature — Sloth Mutant","supertypes":[],"types":["Creature"],"subtypes":["Sloth","Mutant"],"oracleText":"This spell costs {1} less to cast for each counter among players and permanents.\nTrample\nThis creature enters tapped.","power":"8","toughness":"8","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53b92e8a-fadf-4568-8b30-2df68e6ff7cf.jpg?1783912397","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53b92e8a-fadf-4568-8b30-2df68e6ff7cf.jpg?1783912397","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const sealOfTheGuildpact = (): CardDef => ({"oracleId":"9a2d60bc-3024-4a1b-ad74-81645fd227c4","name":"Seal of the Guildpact","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose two colors.\nEach spell you cast costs {1} less to cast for each of the chosen colors it is.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b6188abb-2402-4ac8-96e9-d4ee8d52ef1b.jpg?1783938104","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b6188abb-2402-4ac8-96e9-d4ee8d52ef1b.jpg?1783938104","commanderLegal":"legal","set":"c15","releasedAt":"2015-11-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const planarVoid = (): CardDef => ({"oracleId":"994e27e1-0bff-47c9-a1e6-b9e3ae4ffb1e","name":"Planar Void","manaCost":"{B}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever another card is put into a graveyard from anywhere, exile that card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b035c718-ac11-4c97-a9bb-0cd88dc71904.jpg?1783946340","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b035c718-ac11-4c97-a9bb-0cd88dc71904.jpg?1783946340","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const fearlessSwashbuckler = (): CardDef => ({"oracleId":"6a6cdb3e-c850-4b3c-bf4b-c53dd4eaf56e","name":"Fearless Swashbuckler","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Creature — Fish Pirate","supertypes":[],"types":["Creature"],"subtypes":["Fish","Pirate"],"oracleText":"Haste\nVehicles you control have haste.\nWhenever you attack, if a Pirate and a Vehicle attacked this combat, draw three cards, then discard two cards.","power":"3","toughness":"3","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d86d66b-481f-44ec-86d8-6fc91b52ef38.jpg?1783907859","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d86d66b-481f-44ec-86d8-6fc91b52ef38.jpg?1783907859","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const wonderscapeSage = (): CardDef => ({"oracleId":"99994c36-21ec-4a28-b850-d3f2ba8b7f19","name":"Wonderscape Sage","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Moonfolk Wizard","supertypes":[],"types":["Creature"],"subtypes":["Moonfolk","Wizard"],"oracleText":"Flying\n{T}, Return a land you control to its owner's hand: Draw a card. Then discard a card unless that land had a nonbasic land type.","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64dd6309-110d-44a0-a227-34a20e33ebdc.jpg?1783911411","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64dd6309-110d-44a0-a227-34a20e33ebdc.jpg?1783911411","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const boundingFelidar = (): CardDef => ({"oracleId":"b00f316d-7c82-40e6-80e5-9f36434590a3","name":"Bounding Felidar","manaCost":"{5}{W}","cmc":6,"typeLine":"Creature — Cat Beast Mount","supertypes":[],"types":["Creature"],"subtypes":["Cat","Beast","Mount"],"oracleText":"Whenever this creature attacks while saddled, put a +1/+1 counter on each other creature you control. You gain 1 life for each of those creatures.\nSaddle 2 (Tap any number of other creatures you control with total power 2 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)","power":"4","toughness":"7","colors":["W"],"colorIdentity":["W"],"keywords":["Saddle"],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/8925279f-c16a-43b4-b791-ce450157275b.jpg?1783911859","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/8925279f-c16a-43b4-b791-ce450157275b.jpg?1783911859","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const lootDispute = (): CardDef => ({"oracleId":"7c885698-69f2-44b5-abfe-9a2833822794","name":"Loot Dispute","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, you take the initiative and create a Treasure token.\nWhenever you attack the player who has the initiative, create a Treasure token.\nLoud Ruckus — Whenever you complete a dungeon, create a 5/5 red Dragon creature token with flying.","colors":["R"],"colorIdentity":["R"],"keywords":["Loud Ruckus","Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/0669a2bb-11c7-45d8-9299-09246ff4e72c.jpg?1783922503","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/0669a2bb-11c7-45d8-9299-09246ff4e72c.jpg?1783922503","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const silverquillTheDisputant = (): CardDef => ({"oracleId":"66deb3f3-0314-427e-9cb8-6befa365ae94","name":"Silverquill, the Disputant","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Legendary Creature — Elder Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elder","Dragon"],"oracleText":"Flying, vigilance\nEach instant and sorcery spell you cast has casualty 1. (As you cast that spell, you may sacrifice a creature with power 1 or greater. When you do, copy the spell and you may choose new targets for the copy.)","power":"4","toughness":"4","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/1742c9cd-5ba0-4335-9999-acc7f9d4f73c.jpg?1783903631","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/1742c9cd-5ba0-4335-9999-acc7f9d4f73c.jpg?1783903631","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const anheloThePainter = (): CardDef => ({"oracleId":"d3c3f293-6790-4dce-900a-8af0464c2572","name":"Anhelo, the Painter","manaCost":"{U}{B}{R}","cmc":3,"typeLine":"Legendary Creature — Vampire Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Assassin"],"oracleText":"Deathtouch\nThe first instant or sorcery spell you cast each turn has casualty 2. (As you cast that spell, you may sacrifice a creature with power 2 or greater. When you do, copy the spell and you may choose new targets for the copy.)","power":"1","toughness":"3","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/462e887d-6b91-4b31-9487-2780ffe8943f.jpg?1783923381","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/462e887d-6b91-4b31-9487-2780ffe8943f.jpg?1783923381","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const ashadTheLoneCyberman = (): CardDef => ({"oracleId":"f3902dfd-6d09-425f-8446-a68cae2eea50","name":"Ashad, the Lone Cyberman","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Artifact Creature — Cyberman","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Cyberman"],"oracleText":"The first nonlegendary artifact spell you cast each turn has casualty 2. (As you cast it, you may sacrifice a creature with power 2 or greater. When you do, copy it. A copy of an artifact spell becomes a token.)\nWhenever you sacrifice another creature, put a +1/+1 counter on Ashad.","power":"3","toughness":"3","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/d/2dc19e32-4f78-492f-8586-54ad4ae6fcec.jpg?1783914640","artUrl":"https://cards.scryfall.io/art_crop/front/2/d/2dc19e32-4f78-492f-8586-54ad4ae6fcec.jpg?1783914640","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

describe("Elephant Grass: black creatures can't attack you; nonblack ones cost {2} each", () => {
  it("only the nonblack attacker pays, and only to attack the Grass's controller", () => {
    supported(elephantGrass());
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, elephantGrass());
    const black = putOnBattlefield(s, ap, blackBear());
    const green = putOnBattlefield(s, ap, card("Test Green Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", colors: ["G"] }));
    const third = opponentsOf(s, ap)[1]!;
    expect(attackProblem(s, s.objects[black]!, opp)).not.toBeNull();
    expect(attackTaxOf(s, { attacker: green, defender: opp })).toBe(2);
    expect(attackTaxOf(s, { attacker: green, defender: third })).toBe(0);
    // A black attacker never pays it (it can't attack that player at all).
    expect(attackTaxOf(s, { attacker: black, defender: opp })).toBe(0);
  });
});

describe("Slitherwisp: whenever you cast another spell that has flash", () => {
  it("a spell with flash draws you a card and each opponent loses 1 life; an instant without flash doesn't", () => {
    supported(slitherwisp());
    const flashBear = card("Test Flash Bear", "Creature — Bear", "{1}", { power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash" });
    const instant = card("Test Instant", "Instant", "{0}", { oracleText: "You gain 1 life." });
    const { s: s0, ap, ids } = setup([flashBear, instant]);
    putOnBattlefield(s0, ap, slitherwisp());
    const opps = opponentsOf(s0, ap);
    const hand = s0.players[ap]!.hand.length;
    let s = cast(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    for (const p of opps) expect(s.players[p]!.life).toBe(39);
    s = cast(s, ap, ids[1]!);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    for (const p of opps) expect(s.players[p]!.life).toBe(39);
  });
});

describe("Lumbering Megasloth: {1} less for each counter among players and permanents", () => {
  it("counts counters on every permanent and every player, of every kind", () => {
    supported(lumberingMegasloth());
    const { s, ap, ids, opp } = setup([lumberingMegasloth()]);
    expect(generic(s, ap, ids[0]!)).toBe(10);
    const bear = putOnBattlefield(s, opp, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s.objects[bear]!.counters = { "+1/+1": 2, stun: 1 };
    s.players[opp]!.poison = 3;
    s.players[ap]!.energy = 2;
    invalidateCharacteristics(s);
    expect(generic(s, ap, ids[0]!)).toBe(2);
    // Never below its colored mana.
    s.players[ap]!.experience = 5;
    expect(generic(s, ap, ids[0]!)).toBe(0);
  });
});

describe("Seal of the Guildpact: {1} less for each of the two chosen colors the spell is", () => {
  it("a red-green spell costs {2} less, a red one {1} less, a colorless one the same", () => {
    supported(sealOfTheGuildpact());
    const rg = card("Test RG", "Sorcery", "{4}{R}{G}", { colors: ["R", "G"], oracleText: "You gain 1 life." });
    const r = card("Test R", "Sorcery", "{4}{R}", { colors: ["R"], oracleText: "You gain 1 life." });
    const c = card("Test C", "Artifact", "{4}");
    const { s, ap, ids, opp } = setup([rg, r, c]);
    const seal = putOnBattlefield(s, ap, sealOfTheGuildpact());
    s.objects[seal]!.chosen = { colors: ["R", "G"] };
    // An opponent's Seal is no help.
    s.objects[putOnBattlefield(s, opp, sealOfTheGuildpact())]!.chosen = { colors: ["W", "U"] };
    invalidateCharacteristics(s);
    expect(generic(s, ap, ids[0]!)).toBe(2);
    expect(generic(s, ap, ids[1]!)).toBe(3);
    expect(generic(s, ap, ids[2]!)).toBe(4);
  });
  it("asks for two different colors as it enters", () => {
    const { s: s0, ap, ids } = setup([sealOfTheGuildpact()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = drain(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Red" } as Action);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color" });
    expect((s.pending as { options: string[] }).options).not.toContain("Red");
    s = act(s, { type: "chooseOption", player: ap, choice: "Green" } as Action);
    expect(s.objects[ids[0]!]!.chosen?.colors).toEqual(["R", "G"]);
  });
});

describe("Planar Void: whenever another card is put into a graveyard from anywhere, exile that card", () => {
  it("exiles a dying creature card and the spell that killed it, but not a token", () => {
    supported(planarVoid());
    const { s: s0, ap, ids, opp } = setup([kill]);
    putOnBattlefield(s0, opp, planarVoid());
    const bear = putOnBattlefield(s0, opp, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const s = cast(s0, ap, ids[0]!, [tgt(bear)]);
    expect(zone(s, bear)).toBe("exile");
    expect(zone(s, ids[0]!)).toBe("exile");
  });
  it("doesn't exile itself or the cards put into graveyards with it (rulings)", () => {
    const wrath = card("Test Wrath", "Sorcery", "{0}", { oracleText: "Destroy all creatures and enchantments." });
    const { s: s0, ap, ids, opp } = setup([wrath]);
    const v = putOnBattlefield(s0, opp, planarVoid());
    const bear = putOnBattlefield(s0, opp, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const s = cast(s0, ap, ids[0]!);
    expect(zone(s, v)).toBe("graveyard");
    expect(zone(s, bear)).toBe("graveyard");
    // The wrath goes to the graveyard after Planar Void has left.
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Fearless Swashbuckler: whenever you attack, if a Pirate and a Vehicle attacked this combat", () => {
  const car = () => card("Test Car", "Artifact Creature — Vehicle", "{2}", { power: "3", toughness: "3" });
  it("draws three and discards two with both; nothing with only the Pirate", () => {
    supported(fearlessSwashbuckler());
    const { s: s0, ap, opp } = setup([]);
    const fish = putOnBattlefield(s0, ap, fearlessSwashbuckler());
    const v = putOnBattlefield(s0, ap, car());
    const hand = s0.players[ap]!.hand.length;
    let s = attack(s0, ap, [fish, v], opp);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const fish1 = putOnBattlefield(s1, ap1, fearlessSwashbuckler());
    putOnBattlefield(s1, ap1, car());
    const hand1 = s1.players[ap1]!.hand.length;
    s = attack(s1, ap1, [fish1], opp1);
    expect(s.pending?.kind).not.toBe("discard");
    expect(s.players[ap1]!.hand.length).toBe(hand1);
  });
  it("one attacker that's both a Pirate and a Vehicle is enough (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fearlessSwashbuckler(), { sick: true });
    const both = putOnBattlefield(s0, ap, card("Test Pirate Car", "Artifact Creature — Pirate Vehicle", "{2}", { power: "3", toughness: "3" }));
    const hand = s0.players[ap]!.hand.length;
    const s = attack(s0, ap, [both], opp);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
});

describe("Wonderscape Sage: then discard a card unless that land had a nonbasic land type", () => {
  it("returning a basic land makes you discard; returning a Gate doesn't", () => {
    supported(wonderscapeSage());
    const { s: s0, ap } = setup([]);
    const sage = putOnBattlefield(s0, ap, wonderscapeSage());
    const forestId = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest" && s0.objects[id]!.controller === ap)!;
    const hand = s0.players[ap]!.hand.length;
    let s = drain(run(s0, planActivate(s0, ap, sage, 0, [], undefined, undefined, undefined, { returnToHand: [forestId] } as never)));
    expect(zone(s, forestId)).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    const { s: s1, ap: ap1 } = setup([]);
    const sage1 = putOnBattlefield(s1, ap1, wonderscapeSage());
    const gate = putOnBattlefield(s1, ap1, card("Test Gate", "Land — Gate", ""));
    const hand1 = s1.players[ap1]!.hand.length;
    s = drain(run(s1, planActivate(s1, ap1, sage1, 0, [], undefined, undefined, undefined, { returnToHand: [gate] } as never)));
    expect(zone(s, gate)).toBe("hand");
    expect(s.pending).toBeFalsy();
    // The Gate and the card drawn.
    expect(s.players[ap1]!.hand.length).toBe(hand1 + 2);
    expect(s0.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Bounding Felidar: attacking while saddled, a +1/+1 counter on each other creature and 1 life for each", () => {
  it("counts each other creature you control", () => {
    supported(boundingFelidar());
    const { s: s0, ap, opp } = setup([]);
    const cat = putOnBattlefield(s0, ap, boundingFelidar());
    const a = putOnBattlefield(s0, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const b = putOnBattlefield(s0, ap, card("Test Bear 2", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s0.objects[cat]!.saddled = true;
    invalidateCharacteristics(s0);
    const s = attack(s0, ap, [cat], opp);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[cat]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.players[ap]!.life).toBe(42);
  });
});

describe("Loot Dispute: whenever you attack the player who has the initiative, create a Treasure", () => {
  it("a Treasure for attacking the player with the initiative, none for attacking another", () => {
    supported(lootDispute());
    const treasures = (s: GameState, p: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === p && !!s.cards[s.objects[id]!.cardId]?.name.startsWith("Treasure")).length;
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lootDispute());
    const bear = putOnBattlefield(s0, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s0.initiative = opp;
    let s = attack(s0, ap, [bear], opp);
    expect(treasures(s, ap)).toBe(1);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    putOnBattlefield(s1, ap1, lootDispute());
    const bear1 = putOnBattlefield(s1, ap1, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s1.initiative = opponentsOf(s1, ap1)[2]!;
    s = attack(s1, ap1, [bear1], opp1);
    expect(treasures(s, ap1)).toBe(0);
  });
});

describe("granted casualty: Silverquill, the Disputant; Anhelo, the Painter; Ashad, the Lone Cyberman", () => {
  const gain = (name = "Test Gain") => card(name, "Instant", "{0}", { oracleText: "You gain 3 life." });
  const ownCasualty = card("Test Casualty Gain", "Instant", "{0}", { oracleText: "Casualty 1\nYou gain 3 life." });
  const castWith = (s: GameState, pid: PlayerId, id: string, choices: Parameters<typeof planCast>[7]) => drain(run(s, planCast(s, pid, id, undefined, undefined, "auto", undefined, choices)));
  const elf = (n = "Test Elf") => card(n, "Creature — Elf", "{G}", { power: "1", toughness: "1" });
  it("Silverquill: an instant you cast has casualty 1; sacrificing a creature copies it", () => {
    supported(silverquillTheDisputant(), anheloThePainter(), ashadTheLoneCyberman());
    const { s: s0, ap, ids } = setup([gain()]);
    putOnBattlefield(s0, ap, silverquillTheDisputant());
    const e = putOnBattlefield(s0, ap, elf());
    const s = castWith(s0, ap, ids[0]!, { casualty: e });
    expect(zone(s, e)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(46);
  });
  it("a spell with its own casualty has two instances with Silverquill, each paid by its own creature (CR 702.153b)", () => {
    const { s: s0, ap, ids } = setup([ownCasualty]);
    putOnBattlefield(s0, ap, silverquillTheDisputant());
    const [a, b, c] = [elf("Test Elf A"), elf("Test Elf B"), elf("Test Elf C")].map((d) => putOnBattlefield(s0, ap, d));
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { casualty: a!, casualtyMore: [b!, c!] })).toMatch(/only 2 times/);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { casualty: a!, casualtyMore: [a!] })).toMatch(/different creature/);
    const s = castWith(s0, ap, ids[0]!, { casualty: a!, casualtyMore: [b!] });
    expect([zone(s, a!), zone(s, b!), zone(s, c!)]).toEqual(["graveyard", "graveyard", "battlefield"]);
    // The spell and two copies.
    expect(s.players[ap]!.life).toBe(49);
  });
  it("sacrificing Silverquill itself pays the cost but takes its casualty away, so there's no copy", () => {
    const { s: s0, ap, ids } = setup([gain()]);
    const sq = putOnBattlefield(s0, ap, silverquillTheDisputant());
    const s = castWith(s0, ap, ids[0]!, { casualty: sq });
    expect(zone(s, sq)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(43);
  });
  it("Anhelo: only the first instant or sorcery spell each turn has casualty 2", () => {
    const { s: s0, ap, ids } = setup([gain("Test Gain A"), gain("Test Gain B")]);
    putOnBattlefield(s0, ap, anheloThePainter());
    const small = putOnBattlefield(s0, ap, elf());
    const big = putOnBattlefield(s0, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { casualty: small })).toMatch(/power 2 or greater/);
    let s = castWith(s0, ap, ids[0]!, { casualty: big });
    expect(s.players[ap]!.life).toBe(46);
    const bear2 = putOnBattlefield(s, ap, card("Test Bear 2", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { casualty: bear2 })).toMatch(/doesn't have casualty/);
  });
  it("Ashad: the first nonlegendary artifact spell each turn has casualty 2; the copy becomes a token", () => {
    const rock = card("Test Rock", "Artifact", "{0}");
    const { s: s0, ap, ids } = setup([rock]);
    putOnBattlefield(s0, ap, ashadTheLoneCyberman());
    const big = putOnBattlefield(s0, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const s = castWith(s0, ap, ids[0]!, { casualty: big });
    const rocks = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name.startsWith("Test Rock"));
    expect(rocks).toHaveLength(2);
    expect(rocks.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
  });
});

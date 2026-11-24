// Round 461: Spy Kit's "Equipped creature gets +1/+1 and has all names of nonlegendary creature cards in addition to its
// name." (CR 612.7, 612.8, 613.1c; 201.2a-b; 704.5j; 708.2; rulings: back faces count, token names don't).

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { act, addEffect, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, isNonlegendaryCreatureCardName, planActivate, spyKitTextNames, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { differentlyNamedCount, mostWithSameName, nameLabel, splitName, viewHasName, viewsShareName, type NameView } from "../src/all-names";
import { nameView } from "../src/names";
import { SPY_KIT_TEXT_NAMES } from "../src/spy-kit-names";

// Real card data (Scryfall).
const spyKit = (): CardDef => ({"oracleId":"4d94f5bd-42c6-4d15-a693-8be189ec3746","name":"Spy Kit","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+1 and has all names of nonlegendary creature cards in addition to its name.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/0/c0fd4069-5860-42f5-9f7f-e07f1d4ff0b3.jpg?1783937338","artUrl":"https://cards.scryfall.io/art_crop/front/c/0/c0fd4069-5860-42f5-9f7f-e07f1d4ff0b3.jpg?1783937338","commanderLegal":"legal","set":"cn2","releasedAt":"2016-08-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const echoing = (): CardDef => ({"oracleId":"ef100544-3e6d-4661-a1d1-8b02e58c059c","name":"Echoing Truth","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target nonland permanent and all other permanents with the same name as that permanent to their owners' hands.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4aefedd7-1bf5-4148-9084-d7d8f1138140.jpg?1783944450","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4aefedd7-1bf5-4148-9084-d7d8f1138140.jpg?1783944450","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const rats = (): CardDef => ({"oracleId":"104ea189-14cd-420f-afdc-57b0f827ab8e","name":"Relentless Rats","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Rat","supertypes":[],"types":["Creature"],"subtypes":["Rat"],"oracleText":"This creature gets +1/+1 for each other creature on the battlefield named Relentless Rats.\nA deck can have any number of cards named Relentless Rats.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/5/75f47b6e-9557-4853-b8d6-7602a91c59a7.jpg?1783935158","artUrl":"https://cards.scryfall.io/art_crop/front/7/5/75f47b6e-9557-4853-b8d6-7602a91c59a7.jpg?1783935158","commanderLegal":"legal","set":"a25","releasedAt":"2018-03-16","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const needle = (): CardDef => ({"oracleId":"a188fe7e-68de-4c7c-806c-bfe8fc7b44bf","name":"Pithing Needle","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose a card name.\nActivated abilities of sources with the chosen name can't be activated unless they're mana abilities.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98044438-7534-41a9-944b-ea2e2d80fe9d.jpg?1783924323","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98044438-7534-41a9-944b-ea2e2d80fe9d.jpg?1783924323","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const isamaru = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const barktooth = (): CardDef => ({"oracleId":"4a221518-c850-4e8a-a697-765c0a0e76e7","name":"Barktooth Warbeard","manaCost":"{4}{B}{R}{R}","cmc":7,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"","power":"6","toughness":"5","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48042b58-4d01-410c-bc62-dbf345d26bb5.jpg?1783907464","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48042b58-4d01-410c-bc62-dbf345d26bb5.jpg?1783907464","commanderLegal":"legal","set":"sld","releasedAt":"2025-03-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
/** A Spy Kit on `pid`'s battlefield attached to `to`. */
function kit(s: GameState, pid: PlayerId, to: string) {
  const id = putOnBattlefield(s, pid, spyKit());
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
}
/** Pass, and let bots answer every other choice, until the stack and trigger queue are empty; `answer` gives the test's own answer. */
function settle(s: GameState, answer?: (s: GameState) => Action | undefined) {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}

describe("Spy Kit (round 461)", () => {
  it("compiles: +1/+1 and the names, a layer 3 effect on the equipped creature", () => {
    expect(isFullySupported(spyKit())).toBe(true);
    const k = compileCard(spyKit());
    expect(k.statics.map((x) => x.mods)).toEqual([[{ kind: "modifyPT", power: 1, toughness: 1 }], [{ kind: "allCardNames" }]]);
    for (const d of [echoing(), rats(), needle(), sorcerer()]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("equipping it through its equip ability gives the creature +1/+1 and all names of nonlegendary creature cards, keeping its own", () => {
    let { s, ap } = setup([]);
    const giant = putOnBattlefield(s, ap, hillGiantFresh());
    const k = putOnBattlefield(s, ap, spyKit());
    for (const a of planActivate(s, ap, k, 0, [target(giant)])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[k]!.attachedTo).toBe(giant);
    expect(pt(s, giant)).toBe("4/4");
    expect(ch(s, giant).name).toBe("Hill Giant");
    expect(ch(s, giant).allNames).toBe(true);
    const v = nameView(s, s.objects[giant]!);
    expect(viewHasName(s, v, "Hill Giant")).toBe(true);
    expect(viewHasName(s, v, "Grizzly Bears")).toBe(true);
    // A legendary creature card's name isn't among them, nor a token's (rulings), nor a noncreature card's.
    expect(viewHasName(s, v, "Isamaru, Hound of Konda")).toBe(false);
    expect(viewHasName(s, v, "Zombie Token")).toBe(false);
    expect(viewHasName(s, v, "Echoing Truth")).toBe(false);
    // Unequipped, it's only a Hill Giant again.
    s.objects[k]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    expect(ch(s, giant).allNames).toBeUndefined();
    expect(pt(s, giant)).toBe("3/3");
  });

  it("Echoing Truth on a Grizzly Bears returns the Spy Kit creature too, and on the Spy Kit creature returns the Bears; a face-down one has no name", () => {
    let { s, ap, opp, ids } = setup([echoing(), echoing()]);
    const bear = putOnBattlefield(s, opp, bears());
    const giant = putOnBattlefield(s, ap, giantDef);
    const legend = putOnBattlefield(s, ap, isamaru());
    kit(s, ap, giant);
    s = cast(s, ap, ids[0]!, [target(bear)]);
    s = settle(s);
    expect(s.objects[bear]!.zone).toBe("hand");
    expect(s.objects[giant]!.zone).toBe("hand");
    expect(s.objects[legend]!.zone).toBe("battlefield");

    // Targeting the Spy Kit creature: every permanent named like a nonlegendary creature card goes, a legend doesn't.
    const bear2 = putOnBattlefield(s, opp, bears());
    const elves2 = putOnBattlefield(s, opp, elves());
    const giant2 = putOnBattlefield(s, ap, giantDef);
    const down = putOnBattlefield(s, opp, bears());
    s.objects[down]!.faceDown = "morph";
    kit(s, ap, giant2);
    invalidateCharacteristics(s);
    s = cast(s, ap, ids[1]!, [target(giant2)]);
    s = settle(s);
    expect(s.objects[giant2]!.zone).toBe("hand");
    expect(s.objects[bear2]!.zone).toBe("hand");
    expect(s.objects[elves2]!.zone).toBe("hand");
    expect(s.objects[legend]!.zone).toBe("battlefield");
    // A face-down creature has no name (CR 708.2a), so it shares none (CR 201.2c).
    expect(s.objects[down]!.zone).toBe("battlefield");
  });

  it("Relentless Rats counts the Spy Kit creature as another creature named Relentless Rats", () => {
    const { s, ap } = setup([]);
    const rat = putOnBattlefield(s, ap, rats());
    expect(pt(s, rat)).toBe("2/2");
    const giant = putOnBattlefield(s, ap, giantDef);
    kit(s, ap, giant);
    expect(pt(s, rat)).toBe("3/3");
  });

  it("Pithing Needle naming Prodigal Sorcerer stops a Spy Kit creature's activated abilities (CR 612.7, rulings)", () => {
    let { s, ap, ids } = setup([needle()]);
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s, opp, sorcerer());
    const pyro = putOnBattlefield(s, ap, pyromancer());
    s = cast(s, ap, ids[0]!);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Prodigal Sorcerer" });
    s = settle(s);
    expect(planActivate(s, ap, pyro, 0, [{ kind: "player", id: opp }])).not.toBeNull();
    const k = kit(s, ap, pyro);
    expect(planActivate(s, ap, pyro, 0, [{ kind: "player", id: opp }])).toBeNull();
    s.objects[k]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    expect(planActivate(s, ap, pyro, 0, [{ kind: "player", id: opp }])).not.toBeNull();
  });

  it("an effect that sets its name later takes the names away (CR 612.8); one set earlier keeps them along with the new name", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, giantDef);
    kit(s, ap, a);
    addEffect(s, ap, [a], [{ kind: "setName", name: "Wandering Wolf" }], "game");
    expect(ch(s, a).name).toBe("Wandering Wolf");
    expect(ch(s, a).allNames).toBeUndefined();

    const b = putOnBattlefield(s, ap, giantDef);
    addEffect(s, ap, [b], [{ kind: "setName", name: "Wandering Wolf" }], "game");
    kit(s, ap, b);
    expect(ch(s, b).name).toBe("Wandering Wolf");
    expect(ch(s, b).allNames).toBe(true);
  });

  it("legend rule: two legends with different names, each with a Spy Kit, have the same name (CR 704.5j)", () => {
    let { s, ap } = setup([]);
    const isa = putOnBattlefield(s, ap, isamaru());
    const bark = putOnBattlefield(s, ap, barktooth());
    kit(s, ap, isa);
    s = passAll(s);
    // One Spy Kit: a legendary card's name isn't a nonlegendary creature card's, so they don't share one.
    expect(s.objects[bark]!.zone).toBe("battlefield");
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "legend").toBe(false);
    kit(s, ap, bark);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "legend", options: [isa, bark] });
    s = act(s, { type: "chooseOption", player: ap, choice: bark });
    expect(s.objects[isa]!.zone).toBe("graveyard");
    expect(s.objects[bark]!.zone).toBe("battlefield");
  });

  it("legend rule with overlapping groups: each name's group is chosen for on its own, and a legend stays only if kept in each", () => {
    let { s, ap } = setup([]);
    const isa = putOnBattlefield(s, ap, isamaru());
    const bark = putOnBattlefield(s, ap, barktooth());
    const bear = putOnBattlefield(s, ap, bears());
    // The Bears made legendary: its name is a nonlegendary creature card's, so it shares it with both Spy Kit legends.
    addEffect(s, ap, [bear], [{ kind: "addTypes", types: [], subtypes: [], supertypes: ["Legendary"] }], "game");
    kit(s, ap, isa);
    kit(s, ap, bark);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The names only the two Spy Kit legends have, then the group named Grizzly Bears (all three).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "legend", options: [isa, bark] });
    s = act(s, { type: "chooseOption", player: ap, choice: isa });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "legend", options: [isa, bark, bear] });
    s = act(s, { type: "chooseOption", player: ap, choice: isa });
    expect(s.objects[isa]!.zone).toBe("battlefield");
    expect(s.objects[bark]!.zone).toBe("graveyard");
    expect(s.objects[bear]!.zone).toBe("graveyard");
  });

  it("counts by name: the most with different names (CR 201.2b) and the most with one name in common (CR 201.2a)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, bears());
    putOnBattlefield(s, ap, isamaru());
    const spy: NameView = { name: "Hill Giant", all: true };
    const bear: NameView = { name: "Grizzly Bears" };
    const legend: NameView = { name: "Isamaru, Hound of Konda" };
    // The spy shares a name with the Bears, not with the legend: two of them at most have different names.
    expect(differentlyNamedCount(s, [spy, bear, legend])).toBe(2);
    expect(differentlyNamedCount(s, [{ name: "Hill Giant" }, bear, legend])).toBe(3);
    // Two spies share each name: only one of them counts.
    expect(differentlyNamedCount(s, [spy, spy, legend])).toBe(2);
    // A face-down one has no name (CR 708.2a): it isn't counted.
    expect(differentlyNamedCount(s, [{ name: undefined }, legend])).toBe(1);
    expect(mostWithSameName(s, [spy, spy, bear, legend])).toBe(3);
    expect(mostWithSameName(s, [spy, legend])).toBe(1);
    expect(viewsShareName(s, spy, spy)).toBe(true);
    expect(viewsShareName(s, { name: undefined }, spy)).toBe(false);
  });

  it("a name in a list of names keeps Spy Kit's names, and reads them out in the log", () => {
    const joined = `Hill Giant // ${"\u0007"}all names of nonlegendary creature cards`;
    expect(splitName(joined)).toEqual({ name: "Hill Giant", all: true });
    expect(splitName("Fire // Ice")).toEqual({ name: "Fire // Ice" });
    expect(nameLabel(joined)).toBe("Hill Giant (or any nonlegendary creature card's name)");
  });

  it("names that reach a game only through rules text count (a token named Llanowar Elves is named like a card)", () => {
    const { s } = setup([]);
    expect(SPY_KIT_TEXT_NAMES).toContain("Llanowar Elves");
    expect(isNonlegendaryCreatureCardName(s, "Llanowar Elves")).toBe(true);
    expect(isNonlegendaryCreatureCardName(s, "Zombie Token")).toBe(false);
    expect(spyKitTextNames([elves(), { ...sorcerer(), oracleText: "Create a token that's a copy of Llanowar Elves." } as CardDef])).toEqual(["Llanowar Elves"]);
  });

  const data = "../../data/generated/cards.json";
  it.skipIf(!existsSync(data))("spy-kit-names.ts is up to date with the card data (tools/spy-kit-names.ts)", () => {
    const raw = JSON.parse(readFileSync(data, "utf8")) as CardDef[] | Record<string, CardDef>;
    const cards = Array.isArray(raw) ? raw : Object.values(raw);
    expect(spyKitTextNames(cards)).toEqual([...SPY_KIT_TEXT_NAMES]);
  });
});

const giantDef = giant();
const hillGiantFresh = () => giant();

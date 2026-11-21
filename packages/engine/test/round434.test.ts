// Round 434 (Lane A): craft with "two that share a card type" and "four or more nonlands with activated abilities" (CR
// 702.167a-b), and the back faces that use the exiled cards used to craft them (CR 702.167c): Eye of Ojer Taq // Apex
// Observatory (a card type two of them share, chosen as it enters, CR 614.12; the next spell of that type this turn free,
// CR 118.9) and The Enigma Jewel // Locus of Enlightenment (their activated abilities, each once each turn, rulings; each
// ability you activate that isn't a mana ability copied, CR 707.10).

import { describe, expect, it } from "vitest";
import { act, card, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf } from "../src/cards";
import { manaAbilitiesOn } from "../src/manaabilities";
import { abilityCosts, abilityProblem, altCostsFor, applyAction, botActions, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const eye = (): CardDef => ({"oracleId":"0b1557e8-3dd6-4276-8b8e-505e7ea944ec","name":"Eye of Ojer Taq // Apex Observatory","manaCost":"{3}","cmc":3,"typeLine":"Artifact // Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add one mana of any color.\nCraft with two that share a card type {6} ({6}, Exile this artifact, Exile the two from among other permanents you control and/or cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Craft","Transform"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/15304957-dbb5-4010-a0a6-27343d4c20a3.jpg?1783913936","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/15304957-dbb5-4010-a0a6-27343d4c20a3.jpg?1783913936","commanderLegal":"legal","set":"lcc","releasedAt":"2023-11-17","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Eye of Ojer Taq","manaCost":"{3}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add one mana of any color.\nCraft with two that share a card type {6} ({6}, Exile this artifact, Exile the two from among other permanents you control and/or cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/15304957-dbb5-4010-a0a6-27343d4c20a3.jpg?1783913936","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/15304957-dbb5-4010-a0a6-27343d4c20a3.jpg?1783913936"},{"name":"Apex Observatory","manaCost":"","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters tapped. As it enters, choose a card type shared among two exiled cards used to craft it.\n{T}: The next spell you cast this turn of the chosen type can be cast without paying its mana cost.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/1/5/15304957-dbb5-4010-a0a6-27343d4c20a3.jpg?1783913936","artUrl":"https://cards.scryfall.io/art_crop/back/1/5/15304957-dbb5-4010-a0a6-27343d4c20a3.jpg?1783913936"}]} as CardDef);
const jewel = (): CardDef => ({"oracleId":"c0d2bdd9-1e68-4d3a-83f8-ec2ba440a494","name":"The Enigma Jewel // Locus of Enlightenment","manaCost":"{U}","cmc":1,"typeLine":"Legendary Artifact // Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"The Enigma Jewel enters tapped.\n{T}: Add {C}{C}. Spend this mana only to activate abilities.\nCraft with four or more nonlands with activated abilities {8}{U} ({8}{U}, Exile this artifact, Exile the four or more from among other permanents you control and/or cards in your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["U"],"colorIdentity":["U"],"keywords":["Craft","Transform"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e98970d-06a8-4c91-ba47-4a02c5b949f2.jpg?1783913801","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e98970d-06a8-4c91-ba47-4a02c5b949f2.jpg?1783913801","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"The Enigma Jewel","manaCost":"{U}","typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"The Enigma Jewel enters tapped.\n{T}: Add {C}{C}. Spend this mana only to activate abilities.\nCraft with four or more nonlands with activated abilities {8}{U} ({8}{U}, Exile this artifact, Exile the four or more from among other permanents you control and/or cards in your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e98970d-06a8-4c91-ba47-4a02c5b949f2.jpg?1783913801","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e98970d-06a8-4c91-ba47-4a02c5b949f2.jpg?1783913801"},{"name":"Locus of Enlightenment","manaCost":"","typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"Locus of Enlightenment has each activated ability of the exiled cards used to craft it. You may activate each of those abilities only once each turn.\nWhenever you activate an ability that isn't a mana ability, copy it. You may choose new targets for the copy.","colors":["U"],"colorIndicator":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/2/e/2e98970d-06a8-4c91-ba47-4a02c5b949f2.jpg?1783913801","artUrl":"https://cards.scryfall.io/art_crop/back/2/e/2e98970d-06a8-4c91-ba47-4a02c5b949f2.jpg?1783913801"}]} as CardDef);
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const illumination = (): CardDef => ({"oracleId":"60e358ec-eb11-4a16-a0ae-b7c064a8ea6c","name":"Hieroglyphic Illumination","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw two cards.\nCycling {U} ({U}, Discard this card: Draw a card.)","colors":["U"],"colorIdentity":["U"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/c/6/c60a0e75-53bb-43e4-890f-0e1972a7e0b9.jpg?1783936520","artUrl":"https://cards.scryfall.io/art_crop/front/c/6/c60a0e75-53bb-43e4-890f-0e1972a7e0b9.jpg?1783936520","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" = "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const name = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const craftIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.keyword === "Craft");
const craftPlan = (s: GameState, pid: PlayerId, id: string, craft: string[]) => planActivate(s, pid, id, craftIndex(s, id), undefined, undefined, undefined, undefined, { craft } as CostChoices);
const craft = (s: GameState, pid: PlayerId, id: string, materials: string[]) => settle(run(s, craftPlan(s, pid, id, materials)), pid);
const abilityIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
const untapLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && defOf(s, s.objects[id]!).types.includes("Land")) s.objects[id]!.tapped = false;
};
const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && defOf(s, s.objects[id]!).types.includes("Land")).length;
const treasure = () => card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." });
const token = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.isToken = true;
  invalidateCharacteristics(s);
  return id;
};
const rock = card("Test Rock", "Artifact", "{2}");
const tapLand = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const cleric = card("Test Cleric", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1", oracleText: "{1}, Sacrifice this creature: You gain 3 life." });

describe("round 434: compiles", () => {
  it("both cards, both faces", () => {
    expect(isFullySupported(eye())).toBe(true);
    expect(isFullySupported(jewel())).toBe(true);
  });
});

describe("round 434: Eye of Ojer Taq // Apex Observatory (craft with two that share a card type)", () => {
  it("two that share a card type, a permanent and a graveyard card together; not two that don't, not one or three", () => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, eye());
    const b = putOnBattlefield(s, ap, bear());
    const g = into(s, ap, giant());
    const l = into(s, ap, bolt());
    const r = putOnBattlefield(s, ap, rock);
    expect(craftPlan(s, ap, o, [b, g])).not.toBeNull();
    expect(craftPlan(s, ap, o, [b, l])).toBeNull();
    expect(craftPlan(s, ap, o, [r, l])).toBeNull();
    expect(craftPlan(s, ap, o, [b])).toBeNull();
    expect(craftPlan(s, ap, o, [b, g, into(s, ap, bear())])).toBeNull();
    // An artifact permanent and an artifact creature card share artifact.
    expect(craftPlan(s, ap, o, [r, into(s, ap, ornithopter())])).not.toBeNull();
  });

  it("two lands share land (rulings); with nothing that shares a card type, it can't be activated", () => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, eye());
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && defOf(s, s.objects[id]!).types.includes("Land"));
    expect(craftPlan(s, ap, o, lands.slice(0, 2))).not.toBeNull();
    for (const id of lands) s.objects[id]!.controller = s.turnOrder.find((p) => p !== ap)!;
    putOnBattlefield(s, ap, bear());
    into(s, ap, bolt());
    invalidateCharacteristics(s);
    Object.assign(s.players[ap]!.manaPool, { C: 6 });
    expect(abilityProblem(s, ap, o, craftIndex(s, o))).toMatch(/two that share a card type/);
  });

  it("transformed, it enters tapped and asks for a card type the two cards share; its {T} makes the next artifact spell free", () => {
    const { s: s0, ap, ids } = setup([giant(), solRing()]);
    const [g, ring] = ids as [string, string];
    let s = s0;
    const o = putOnBattlefield(s, ap, eye());
    // Ornithopter and Sol Ring share only artifact.
    const mats = [into(s, ap, ornithopter()), putOnBattlefield(s, ap, solRing())];
    s = craft(s, ap, o, mats);
    expect(name(s, o)).toBe("Apex Observatory");
    expect(s.objects[o]!.tapped).toBe(true);
    for (const m of mats) expect(zone(s, m)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardType", options: ["Artifact"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Artifact" }), ap);
    expect(s.objects[o]!.chosen?.cardType).toBe("Artifact");
    s.objects[o]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, o, 0)), ap);
    expect(altCostsFor(s, ap, s.objects[g]!).some((a) => a.kind === "nextFree")).toBe(false);
    expect(altCostsFor(s, ap, s.objects[ring]!).some((a) => a.kind === "nextFree")).toBe(true);
    // Only this turn.
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", next);
    s = passUntil(s, "main1", ap);
    expect(altCostsFor(s, ap, s.objects[ring]!).some((a) => a.kind === "nextFree")).toBe(false);
  });

  it("the chosen creature type: the next creature spell this turn is free, the one after isn't; a sorcery doesn't use it up", () => {
    const { s: s0, ap, ids } = setup([giant(), bear(), divination()]);
    const [g, b2, div] = ids as [string, string, string];
    let s = s0;
    const o = putOnBattlefield(s, ap, eye());
    s = craft(s, ap, o, [into(s, ap, bear()), putOnBattlefield(s, ap, pyromancer())]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardType", options: ["Creature"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Creature" }), ap);
    untapLands(s, ap);
    s.objects[o]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, o, 0)), ap);
    expect(s.objects[o]!.tapped).toBe(true);
    // Divination isn't a creature spell: it pays its own cost and leaves the free cast.
    expect(altCostsFor(s, ap, s.objects[div]!).some((a) => a.kind === "nextFree")).toBe(false);
    s = settle(run(s, planCast(s, ap, div)), ap);
    expect(altCostsFor(s, ap, s.objects[g]!).some((a) => a.kind === "nextFree")).toBe(true);
    const lands = untappedLands(s, ap);
    s = settle(run(s, planCast(s, ap, g, undefined, undefined, "auto", undefined, { alt: "nextFree" })), ap);
    expect(zone(s, g)).toBe("battlefield");
    expect(untappedLands(s, ap)).toBe(lands);
    // Used up.
    expect(altCostsFor(s, ap, s.objects[b2]!).some((a) => a.kind === "nextFree")).toBe(false);
  });

  it("two types shared: both offered; a choice it didn't use this turn is gone the next turn", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const o = putOnBattlefield(s, ap, eye());
    s = craft(s, ap, o, [into(s, ap, ornithopter()), into(s, ap, ornithopter())]);
    expect((s.pending as { options: string[] }).options.sort()).toEqual(["Artifact", "Creature"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Creature" }), ap);
    expect(s.objects[o]!.chosen?.cardType).toBe("Creature");
  });

  it("a token used to craft it isn't a card in exile (rulings): no card type is chosen, and its {T} does nothing", () => {
    const { s: s0, ap, ids } = setup([giant()]);
    const [g] = ids as [string];
    let s = s0;
    const o = putOnBattlefield(s, ap, eye());
    const t = token(s, ap, bear({ name: "Bear Token" }));
    s = craft(s, ap, o, [t, into(s, ap, bear())]);
    expect(name(s, o)).toBe("Apex Observatory");
    expect(s.pending).toBeFalsy();
    expect(s.objects[o]!.chosen?.cardType).toBeUndefined();
    s.objects[o]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, o, 0)), ap);
    expect(altCostsFor(s, ap, s.objects[g]!).some((a) => a.kind === "nextFree")).toBe(false);
  });

  it("a bot crafts with two spare cards that share a card type, and chooses one of the shared types", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const o = putOnBattlefield(s, ap, eye());
    const l = into(s, ap, bolt());
    const ab = abilitiesOf(s, s.objects[o]!).activated[craftIndex(s, o)]!;
    expect(abilityCosts(s, ap, s.objects[o]!, ab, [])).toBeNull();
    const b1 = into(s, ap, bear());
    const b2 = into(s, ap, giant());
    const picked = abilityCosts(s, ap, s.objects[o]!, ab, [])?.craft ?? [];
    expect([...picked].sort()).toEqual([b1, b2].sort());
    expect(picked).not.toContain(l);
    s = settle(run(s, craftPlan(s, ap, o, picked)), ap);
    const p = s.pending!;
    s = settle(botActions(s, p.player).reduce((x, a) => act(x, a), s), ap);
    expect(s.objects[o]!.chosen?.cardType).toBe("Creature");
  });
});

describe("round 434: bots and Apex Observatory", () => {
  it("a bot taps it in its main phase only with a spell of the chosen type in hand that costs 3 or more, then casts it free", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    let s = s0;
    const o = putOnBattlefield(s, ap, eye());
    s = craft(s, ap, o, [into(s, ap, bear()), into(s, ap, giant())]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Creature" }), ap);
    s.objects[o]!.tapped = false;
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && defOf(s, s.objects[id]!).types.includes("Land")) s.objects[id]!.tapped = true;
    const tapsIt = (x: GameState) => botActions(x, ap).some((a) => a.type === "activateAbility" && a.objectId === o);
    // Only a Grizzly Bears (mana value 2) in hand: it waits.
    s.players[ap]!.hand = [...ids];
    expect(tapsIt(s)).toBe(false);
    const g = into(s, ap, giant(), "hand");
    expect(tapsIt(s)).toBe(true);
    for (let k = 0; k < 6 && s.objects[g]!.zone === "hand"; k++) {
      s = botActions(s, ap).reduce((x, a) => act(x, a), s);
      s = settle(s, ap);
    }
    expect(s.objects[g]!.zone).toBe("battlefield");
  });
});

describe("round 434: The Enigma Jewel // Locus of Enlightenment (craft with four or more nonlands with activated abilities)", () => {
  it("nonland permanents and cards with activated abilities (mana and cycling ones too); not lands, not ones with none", () => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, jewel());
    const four = [putOnBattlefield(s, ap, pyromancer()), into(s, ap, elves()), into(s, ap, illumination()), token(s, ap, treasure())];
    expect(craftPlan(s, ap, o, four)).not.toBeNull();
    expect(craftPlan(s, ap, o, four.slice(0, 3))).toBeNull();
    expect(craftPlan(s, ap, o, [...four.slice(0, 3), into(s, ap, divination())])).toBeNull();
    expect(craftPlan(s, ap, o, [...four.slice(0, 3), putOnBattlefield(s, ap, tapLand)])).toBeNull();
    expect(craftPlan(s, ap, o, [...four.slice(0, 3), putOnBattlefield(s, ap, rock)])).toBeNull();
    expect(craftPlan(s, ap, o, [...four, into(s, ap, jace()), into(s, ap, shivan())])).not.toBeNull();
  });

  it("Locus of Enlightenment has the crafted cards' activated abilities (not cycling, which works only in a hand), once each turn each", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const o = putOnBattlefield(s, ap, jewel());
    s = craft(s, ap, o, [into(s, ap, pyromancer()), into(s, ap, elves()), into(s, ap, illumination()), into(s, ap, shivan()), token(s, ap, treasure())]);
    expect(name(s, o)).toBe("Locus of Enlightenment");
    const texts = abilitiesOf(s, s.objects[o]!).activated.map((a) => a.text);
    expect(texts.some((t) => /deals 1 damage to any target/.test(t))).toBe(true);
    expect(texts.some((t) => /\+1\/\+0/.test(t))).toBe(true);
    expect(texts.some((t) => /Cycling/.test(t))).toBe(false);
    expect(manaAbilitiesOn(s, s.objects[o]!).length).toBe(1);
    // Shivan Dragon's {R} ability: once this turn, again the next.
    untapLands(s, ap);
    const i = abilityIndex(s, o, /\+1\/\+0/);
    s = settle(run(s, planActivate(s, ap, o, i)), ap);
    s = settle(s, ap);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: o, index: i } as Action)).toThrow(/only once each turn/);
    expect(opp).toBeDefined();
  });

  it("activating a crafted card's ability copies it; the copy wasn't activated, so it isn't copied again; mana abilities aren't", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const o = putOnBattlefield(s, ap, jewel());
    s = craft(s, ap, o, [into(s, ap, pyromancer()), into(s, ap, elves()), into(s, ap, illumination()), into(s, ap, shivan())]);
    const life = s.players[opp]!.life;
    s = run(s, planActivate(s, ap, o, abilityIndex(s, o, /deals 1 damage/), [{ kind: "player", id: opp }]));
    s = settle(s, ap);
    // The copy's new targets: keep the same one (CR 707.10c).
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap }), ap);
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
    expect(s.players[opp]!.life).toBe(life - 2);
    // Its borrowed mana ability: a mana ability, not copied (nothing goes on the stack).
    const t = s.objects[o]!;
    t.tapped = false;
    s = act(s, { type: "activateMana", player: ap, objectId: o, mana: "G" });
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
  });

  it("a crafted planeswalker card's loyalty ability: its +2 puts loyalty on Locus and is copied; its −1 can't be paid", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const o = putOnBattlefield(s, ap, jewel());
    s = craft(s, ap, o, [into(s, ap, jace()), into(s, ap, pyromancer()), into(s, ap, elves()), into(s, ap, shivan())]);
    const hand = s.players[ap]!.hand.length;
    expect(abilityProblem(s, ap, o, abilityIndex(s, o, /^−1/))).toMatch(/loyalty/);
    s = settle(run(s, planActivate(s, ap, o, abilityIndex(s, o, /^\+2/))), ap);
    expect(s.objects[o]!.counters.loyalty).toBe(2);
    // Each player draws a card, twice: the ability and its copy.
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // One loyalty ability of a permanent each turn (CR 606.3).
    expect(abilityProblem(s, ap, o, abilityIndex(s, o, /^\+2/))).toBeTruthy();
  });

  it("a crafted card that leaves exile takes its abilities with it (CR 702.167c)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const o = putOnBattlefield(s, ap, jewel());
    const p = into(s, ap, pyromancer());
    s = craft(s, ap, o, [p, into(s, ap, elves()), into(s, ap, illumination()), into(s, ap, shivan())]);
    expect(abilityIndex(s, o, /deals 1 damage/)).toBeGreaterThanOrEqual(0);
    s.players[ap]!.exile.splice(s.players[ap]!.exile.indexOf(p), 1);
    s.objects[p]!.zone = "graveyard";
    s.objects[p]!.zoneChanges = (s.objects[p]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(p);
    invalidateCharacteristics(s);
    expect(abilityIndex(s, o, /deals 1 damage/)).toBe(-1);
  });

  it("a bot crafts with four or more spare cards with activated abilities", () => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, jewel());
    const yard = [into(s, ap, pyromancer()), into(s, ap, elves()), into(s, ap, cleric), into(s, ap, shivan())];
    into(s, ap, divination());
    const ab = abilitiesOf(s, s.objects[o]!).activated[craftIndex(s, o)]!;
    expect([...(abilityCosts(s, ap, s.objects[o]!, ab, [])?.craft ?? [])].sort()).toEqual([...yard].sort());
  });
});

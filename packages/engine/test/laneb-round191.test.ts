// Lane B round B191: Wild Shape ("Choose one. Until end of turn, target creature you control has that base power and
// toughness, becomes that creature type, and gains that ability." and its three forms), Storm Cauldron ("Each player may play
// an additional land during each of their turns. Whenever a land is tapped for mana, return it to its owner's hand."),
// Pulsemage Advocate ("Return three target cards from an opponent's graveyard to their hand"), Energy Field ("Prevent all
// damage that would be dealt to you by sources you don't control. When a card is put into your graveyard from anywhere,
// sacrifice ~."), Ward of Bones ("Each opponent who controls more creatures than you can't cast creature spells. The same is
// true for artifacts and enchantments. Each opponent who controls more lands than you can't play lands.") and Multiple
// Choice ("If X is 1, ... If X is 4 or more, do all of the above.").

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, addEffect } from "./helpers";
import { botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, planManaAbility, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { objHasKeyword } from "../src/cards";
import { abilityProblem, landsAllowed } from "../src/game";
import { dealDamage, objectSource } from "../src/damage";

// Real card data (Scryfall).
const wildShape = (): CardDef => ({"oracleId":"99f4a22a-ba33-43f0-bc58-9df8388706cd","name":"Wild Shape","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one. Until end of turn, target creature you control has that base power and toughness, becomes that creature type, and gains that ability.\n• 1/3 Turtle with hexproof.\n• 1/5 Spider with reach.\n• 3/3 Elephant with trample.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/c/ec9738f1-b2e7-45a5-b235-290256aabed0.jpg?1783926453","artUrl":"https://cards.scryfall.io/art_crop/front/e/c/ec9738f1-b2e7-45a5-b235-290256aabed0.jpg?1783926453","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const cauldron = (): CardDef => ({"oracleId":"5a51b168-02d1-4eb4-8ccc-614ab6f6cffa","name":"Storm Cauldron","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Each player may play an additional land during each of their turns.\nWhenever a land is tapped for mana, return it to its owner's hand.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f68b531-a3f2-4830-b170-fb8a1195c149.jpg?1783947159","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f68b531-a3f2-4830-b170-fb8a1195c149.jpg?1783947159","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const advocate = (): CardDef => ({"oracleId":"06e4355b-02d4-4238-a6e6-b03a5773346c","name":"Pulsemage Advocate","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"{T}: Return three target cards from an opponent's graveyard to their hand. Return target creature card from your graveyard to the battlefield.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0dce0e8f-9ad6-42b6-af61-c883613efc97.jpg?1783945133","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0dce0e8f-9ad6-42b6-af61-c883613efc97.jpg?1783945133","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const field = (): CardDef => ({"oracleId":"fbf7a7f4-9915-4a53-84b3-e55e9f487323","name":"Energy Field","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Prevent all damage that would be dealt to you by sources you don't control.\nWhen a card is put into your graveyard from anywhere, sacrifice this enchantment.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81ff5770-b207-41e1-97b7-b9347c72b407.jpg?1783946361","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81ff5770-b207-41e1-97b7-b9347c72b407.jpg?1783946361","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ward = (): CardDef => ({"oracleId":"c3ea1497-63ac-46bb-95e9-d98b93a880b3","name":"Ward of Bones","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Each opponent who controls more creatures than you can't cast creature spells. The same is true for artifacts and enchantments.\nEach opponent who controls more lands than you can't play lands.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a808f180-7e04-4ee4-a670-cae8c7e568ce.jpg?1787832133","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a808f180-7e04-4ee4-a670-cae8c7e568ce.jpg?1787832133","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const choice = (): CardDef => ({"oracleId":"b4d23acf-ff1f-4a6a-9ede-2667a99e9665","name":"Multiple Choice","manaCost":"{X}{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"If X is 1, scry 1, then draw a card.\nIf X is 2, you may choose a player. They return a creature they control to its owner's hand.\nIf X is 3, create a 4/4 blue and red Elemental creature token.\nIf X is 4 or more, do all of the above.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08c9890f-7081-42f6-89eb-35c83911b443.jpg?1783927376","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08c9890f-7081-42f6-89eb-35c83911b443.jpg?1783927376","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const glorious = (): CardDef => ({"oracleId":"e3886fe8-9b76-4613-8891-4ec74657c087","name":"Glorious Anthem","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vein = (): CardDef => ({"oracleId":"616d6013-24f4-4999-9bf3-5b0764e52fa6","name":"Crystal Vein","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{T}, Sacrifice this land: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1afb6e29-058e-44c5-a3fa-56c462f070a0.jpg?1783947037","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1afb6e29-058e-44c5-a3fa-56c462f070a0.jpg?1783947037","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes until the stack and triggers are done, or something asks `me` a question; other players' questions go to the bot. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player !== me) s = run(s, botActions(s, p.player));
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const obj = (id: ObjectId): TargetChoice => ({ kind: "object", id });
/** A card of `def` owned by `pid`, put into `where` (on top of the library). */
const place = (s: GameState, pid: PlayerId, def: CardDef, where: "graveyard" | "library" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
/** A player other than these two. */
const third = (s: GameState, a: PlayerId, b: PlayerId) => s.turnOrder.find((p) => p !== a && p !== b)!;

describe("Round B191 cards are supported", () => {
  it("compiles all six", () => supported(wildShape(), cauldron(), advocate(), field(), ward(), choice()));
});

describe("Wild Shape: a 1/3 Turtle with hexproof, a 1/5 Spider with reach or a 3/3 Elephant with trample until end of turn", () => {
  const shape = (mode: number) => {
    const { s, ap, opp, ids } = setup([wildShape()]);
    const b = putOnBattlefield(s, ap, bears());
    return { s, ap, opp, spell: ids[0]!, b };
  };

  it("each mode sets the base power and toughness, replaces the creature types and grants the keyword", () => {
    const forms: [number, string, string, string][] = [
      [0, "1/3", "Turtle", "Hexproof"],
      [1, "1/5", "Spider", "Reach"],
      [2, "3/3", "Elephant", "Trample"],
    ];
    for (const [mode, size, type, kw] of forms) {
      const { s: s0, ap, spell, b } = shape(mode);
      const s = settle(run(s0, planCast(s0, ap, spell, [obj(b)], [mode])), ap);
      const c = characteristics(s, s.objects[b]!);
      expect(pt(s, b), type).toBe(size);
      expect(c.subtypes).toEqual([type]);
      expect(c.types).toEqual(["Creature"]);
      expect(objHasKeyword(s, s.objects[b]!, kw)).toBe(true);
    }
  });

  it("other changes to its power and toughness still apply, and an earlier setting is overwritten (rulings)", () => {
    const { s: s0, ap, spell, b } = shape(2);
    putOnBattlefield(s0, ap, glorious());
    s0.objects[b]!.counters["+1/+1"] = 1;
    addEffect(s0, ap, [b], [{ kind: "setPT", power: 7, toughness: 7 }]);
    expect(pt(s0, b)).toBe("9/9");
    const s = settle(run(s0, planCast(s0, ap, spell, [obj(b)], [2])), ap);
    expect(pt(s, b)).toBe("5/5");
  });

  it("only a creature you control can be the target", () => {
    const { s, ap, opp, spell } = shape(0);
    const theirs = putOnBattlefield(s, opp, bears());
    expect(planCast(s, ap, spell, [obj(theirs)], [0])).toBeNull();
  });

  it("it ends at the end of the turn", () => {
    const { s: s0, ap, spell, b } = shape(0);
    let s = settle(run(s0, planCast(s0, ap, spell, [obj(b)], [0])), ap);
    expect(pt(s, b)).toBe("1/3");
    for (let i = 0; i < 400 && s.activePlayer === ap; i++) {
      const p = s.pending;
      s = p ? run(s, botActions(s, p.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(pt(s, b)).toBe("2/2");
    expect(characteristics(s, s.objects[b]!).subtypes).toEqual(["Bear"]);
    expect(objHasKeyword(s, s.objects[b]!, "Hexproof")).toBe(false);
  });
});

describe("Storm Cauldron: an additional land each turn, and every land tapped for mana returns to its owner's hand", () => {
  it("the active player may play one more land, for each Cauldron, whoever controls it (rulings)", () => {
    const { s, ap } = setup([]);
    expect(landsAllowed(s, ap)).toBe(1);
    // Whoever controls it: the active player gets the extra land on their turn (CR 305.2a).
    putOnBattlefield(s, third(s, ap, ap), cauldron());
    expect(landsAllowed(s, ap)).toBe(2);
    putOnBattlefield(s, ap, cauldron());
    expect(landsAllowed(s, ap)).toBe(3);
  });

  it("a land tapped to pay for a spell goes back to its owner's hand as a triggered ability", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    putOnBattlefield(s0, opp, cauldron());
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    const tapped = lands.filter((id) => s.objects[id]!.tapped);
    expect(tapped.length).toBe(1);
    // The return uses the stack, after the mana is added (rulings): Shock is still on the stack under it.
    expect(s.objects[tapped[0]!]!.zone).toBe("battlefield");
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThanOrEqual(2);
    s = settle(s, ap);
    expect(s.objects[tapped[0]!]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(tapped[0]!);
    expect(s.players[opp]!.life).toBe(38);
  });

  it("a mana ability of a creature or artifact doesn't trigger it", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, cauldron());
    const elf = putOnBattlefield(s0, ap, elves());
    const s = run(s0, planManaAbility(s0, ap, elf, 0, "G"));
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("a land tapped and sacrificed for mana is in the graveyard first (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, cauldron());
    const v = putOnBattlefield(s0, ap, vein());
    const ability = planManaAbility(s0, ap, v, 1, "C") ? 1 : 0;
    let s = run(s0, planManaAbility(s0, ap, v, ability, "C"));
    s = settle(s, ap);
    expect(s.objects[v]!.zone).toBe("graveyard");
  });
});

describe("Pulsemage Advocate: three cards from one opponent's graveyard to their hand, and a creature card of yours back", () => {
  const board = () => {
    const { s, ap, opp } = setup([]);
    const adv = putOnBattlefield(s, ap, advocate());
    const theirs = [place(s, opp, bears(), "graveyard"), place(s, opp, shock(), "graveyard"), place(s, opp, opt(), "graveyard")];
    const mine = place(s, ap, giant(), "graveyard");
    return { s, ap, opp, adv, theirs, mine };
  };

  it("the three go to their owner's hand, and your creature card onto the battlefield", () => {
    const { s: s0, ap, opp, adv, theirs, mine } = board();
    const s = settle(run(s0, planActivate(s0, ap, adv, 0, [...theirs.map(obj), obj(mine)])), ap);
    for (const id of theirs) expect(s.objects[id]!.zone).toBe("hand");
    expect(s.players[opp]!.hand).toEqual(expect.arrayContaining(theirs));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.controller).toBe(ap);
  });

  it("all three from the same opponent's graveyard: two opponents' cards can't be mixed (rulings)", () => {
    const { s, ap, opp, adv, theirs, mine } = board();
    const other = place(s, third(s, ap, opp), forest(), "graveyard");
    expect(planActivate(s, ap, adv, 0, [obj(theirs[0]!), obj(theirs[1]!), obj(other), obj(mine)])).toBeNull();
  });

  it("it can't be activated without three cards in one opponent's graveyard, or without a creature card in yours", () => {
    const { s: s0, ap, opp, adv, theirs, mine } = board();
    expect(planActivate(s0, ap, adv, 0, [...theirs.map(obj), obj(mine)])).not.toBeNull();
    expect(abilityProblem(s0, ap, adv, 0)).toBeNull();
    const s = s0;
    s.players[opp]!.graveyard.splice(s.players[opp]!.graveyard.indexOf(theirs[2]!), 1);
    s.objects[theirs[2]!]!.zone = "exile";
    s.players[opp]!.exile.push(theirs[2]!);
    // Two in this one's graveyard and one in another's.
    place(s, third(s, ap, opp), forest(), "graveyard");
    invalidateCharacteristics(s);
    expect(abilityProblem(s, ap, adv, 0)).not.toBeNull();
    expect(planActivate(s, ap, adv, 0, [obj(theirs[0]!), obj(theirs[1]!), obj(s.players[third(s, ap, opp)]!.graveyard[0]!), obj(mine)])).toBeNull();
    // Three again, but no creature card in your graveyard.
    const t = board();
    t.s.players[t.ap]!.graveyard = [];
    t.s.objects[t.mine]!.zone = "exile";
    expect(abilityProblem(t.s, t.ap, t.adv, 0)).not.toBeNull();
  });
});

describe("Energy Field: no damage to you from sources you don't control; sacrificed when a card is put into your graveyard", () => {
  it("an opponent's source deals none to you, your own does", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, field());
    const theirs = putOnBattlefield(s, opp, sorcerer());
    const mine = putOnBattlefield(s, ap, sorcerer());
    dealDamage(s, objectSource(s, s.objects[theirs]!), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(40);
    dealDamage(s, objectSource(s, s.objects[mine]!), { player: ap }, 1);
    expect(s.players[ap]!.life).toBe(39);
  });

  it("a token dying doesn't sacrifice it; a spell of yours put into your graveyard does", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    const f = putOnBattlefield(s0, ap, field());
    const token = putOnBattlefield(s0, ap, bears());
    s0.objects[token]!.isToken = true;
    const pinger = putOnBattlefield(s0, ap, sorcerer());
    s0.objects[token]!.damage = 1;
    let s = settle(run(s0, planActivate(s0, ap, pinger, 0, [obj(token)])), ap);
    expect(s.objects[token]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.objects[f]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[f]!.zone).toBe("graveyard");
  });

  it("a discard sacrifices it (rulings)", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    const f = putOnBattlefield(s0, ap, field());
    // Too many cards at cleanup: the discard to hand size puts a card into your graveyard.
    for (let i = 0; i < 8; i++) place(s0, ap, bears(), "hand");
    let s = s0;
    for (let i = 0; i < 400 && s.activePlayer === ap && s.objects[f]!.zone === "battlefield"; i++) {
      const p = s.pending;
      s = p ? run(s, botActions(s, p.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[f]!.zone).toBe("graveyard");
    void ids;
  });
});

describe("Ward of Bones: opponents with more creatures, artifacts, enchantments or lands than you can't cast or play them", () => {
  const board = (hand: CardDef[]) => {
    const { s, ap, opp, ids } = setup(hand);
    const w = putOnBattlefield(s, opp, ward());
    return { s, ap, opp, ids, w };
  };

  it("more creatures: no creature spells, an artifact creature included; with as many, they can be cast", () => {
    const { s, ap, opp, ids } = board([bears(), ornithopter()]);
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    const mine = putOnBattlefield(s, ap, giant());
    expect(castProblem(s, ap, ids[0]!)).toMatch(/Ward of Bones/);
    expect(castProblem(s, ap, ids[1]!)).toMatch(/Ward of Bones/);
    putOnBattlefield(s, opp, giant());
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    void mine;
  });

  it("more artifacts: no artifact spells; more enchantments: no enchantment spells", () => {
    const { s, ap, opp, ids } = board([solRing(), pacifism()]);
    putOnBattlefield(s, opp, bears());
    // Ward of Bones is itself an artifact its controller controls.
    putOnBattlefield(s, ap, solRing());
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    putOnBattlefield(s, ap, solRing());
    expect(castProblem(s, ap, ids[0]!)).toMatch(/Ward of Bones/);
    expect(planCast(s, ap, ids[1]!, [obj(s.battlefield.find((id) => s.objects[id]!.controller === opp && characteristics(s, s.objects[id]!).types.includes("Creature"))!)])).not.toBeNull();
    putOnBattlefield(s, ap, glorious());
    expect(castProblem(s, ap, ids[1]!)).toMatch(/Ward of Bones/);
  });

  it("more lands: no land plays; its controller isn't affected, nor is anyone with it on their side", () => {
    const { s, ap, opp, w } = board([forest()]);
    expect(landsAllowed(s, ap)).toBe(0);
    expect(landsAllowed(s, opp)).toBe(1);
    s.objects[w]!.controller = ap;
    invalidateCharacteristics(s);
    expect(landsAllowed(s, ap)).toBe(1);
    const { s: t, ap: ap2, ids } = board([bears()]);
    putOnBattlefield(t, ap2, giant());
    putOnBattlefield(t, ap2, giant());
    const theirs = t.turnOrder.find((p) => p !== ap2)!;
    void theirs;
    expect(castProblem(t, ap2, ids[0]!)).toMatch(/Ward of Bones/);
  });
});

describe("Multiple Choice: what X is decides what it does", () => {
  const cast = (x: number) => {
    const { s: s0, ap, opp, ids } = setup([choice()]);
    for (let i = 0; i < 5; i++) place(s0, ap, forest(), "library");
    const theirs = putOnBattlefield(s0, opp, giant());
    const s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", x));
    return { s: settle(s, ap), ap, opp, spell: ids[0]!, theirs, hand: s0.players[ap]!.hand.length - 1 };
  };
  const elementals = (s: GameState, ap: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).subtypes.includes("Elemental"));

  it("X = 0 does nothing", () => {
    const { s, ap, hand, theirs } = cast(0);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(elementals(s, ap).length).toBe(0);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("X = 1: scry 1, then draw a card", () => {
    const { s: s1, ap, hand } = cast(1);
    expect(s1.pending).toMatchObject({ kind: "arrangeTop", player: ap });
    const s = settle(run(s1, botActions(s1, ap)), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(elementals(s, ap).length).toBe(0);
  });

  it("X = 2: you may choose a player, who returns a creature they control to its owner's hand", () => {
    const { s: s1, ap, opp, theirs } = cast(2);
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    let s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "nthPlayer" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }), ap);
    expect(s.objects[theirs]!.zone).toBe("hand");
    expect(s.players[opp]!.hand).toContain(theirs);
  });

  it("X = 2, declined: nothing is returned", () => {
    const { s: s1, ap, theirs } = cast(2);
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("X = 3: a 4/4 blue and red Elemental", () => {
    const { s, ap } = cast(3);
    const made = elementals(s, ap);
    expect(made.length).toBe(1);
    expect(pt(s, made[0]!)).toBe("4/4");
    expect(characteristics(s, s.objects[made[0]!]!).colors.sort()).toEqual(["R", "U"]);
  });

  it("X = 4 or more: all of the above, in that order", () => {
    const { s: s1, ap, opp, theirs, hand } = cast(5);
    expect(s1.pending).toMatchObject({ kind: "arrangeTop", player: ap });
    let s = settle(run(s1, botActions(s1, ap)), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }), ap);
    expect(s.objects[theirs]!.zone).toBe("hand");
    expect(elementals(s, ap).length).toBe(1);
  });

  it("a bot choosing the player picks an opponent with a creature, not itself", () => {
    const { s: s1, ap, opp } = cast(2);
    putOnBattlefield(s1, ap, bears());
    let s = act(s1, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "nthPlayer" });
    const pick = botActions(s, ap)[0]!;
    expect(pick).toMatchObject({ type: "chooseOption", choice: String(opp) });
    s = settle(act(s, pick), ap);
  });
});

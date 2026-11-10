// Lane B round B172: Goblin Plate Mail ("then attach ~ to the amassed Army", CR 701.47c), Lich's Tomb ("sacrifice a
// permanent for each 1 life you lost"), Recross the Paths (the revealed cards on the bottom "in any order", then a clash),
// War Tax (a cost to attack for the rest of the turn, CR 508.1g-h), Awe Strike (the next damage a target creature would
// deal, prevented, and life for it), Eureka (each player in turn may put a permanent card from their hand onto the
// battlefield, around until no one does), Blood Sun ("All lands lose all abilities except mana abilities", CR 605.1a).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, attackTaxOf, botActions, characteristics, controllerOf, dealDamage, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, objectSource, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const plateMail = (): CardDef => ({"oracleId":"eda99a16-6a7c-4f39-8a6b-a284e6afd3fc","name":"Goblin Plate Mail","manaCost":"{1}{B/R}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"When this Equipment enters, amass Goblins 1, then attach this Equipment to the amassed Army. (To amass Goblins 1, put a +1/+1 counter on an Army you control. It's also a Goblin. If you don't control an Army, create a 0/0 black Goblin Army creature token first.)\nEquipped creature gets +1/+0 and has menace.\nEquip {4}","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Amass","Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cb982607-da37-4894-91a5-cf6307d4d703.jpg?1785323293","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cb982607-da37-4894-91a5-cf6307d4d703.jpg?1785323293","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lichsTomb = (): CardDef => ({"oracleId":"600b9ab8-36dc-4f02-b48c-091348d132ac","name":"Lich's Tomb","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"You don't lose the game for having 0 or less life.\nWhenever you lose life, sacrifice a permanent for each 1 life you lost. (Damage causes loss of life.)","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/ca24a105-e32a-4b2c-99bf-cfd85bae6229.jpg?1783944422","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/ca24a105-e32a-4b2c-99bf-cfd85bae6229.jpg?1783944422","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const recross = (): CardDef => ({"oracleId":"2c132e6f-2e9e-4b39-81a8-f88c32173cd5","name":"Recross the Paths","manaCost":"{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield and the rest on the bottom of your library in any order. Clash with an opponent. If you win, return Recross the Paths to its owner's hand. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)","colors":["G"],"colorIdentity":["G"],"keywords":["Clash"],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0bfe1d8e-ae3c-4144-a44b-e13ab33da95c.jpg?1783942777","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0bfe1d8e-ae3c-4144-a44b-e13ab33da95c.jpg?1783942777","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const warTax = (): CardDef => ({"oracleId":"fd5ff6ad-f3f1-470f-adef-fb4ce6536365","name":"War Tax","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{X}{U}: This turn, creatures can't attack unless their controller pays {X} for each attacking creature they control.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/7/e7c15159-8466-43e5-9dc5-a8cc94619931.jpg?1783945957","artUrl":"https://cards.scryfall.io/art_crop/front/e/7/e7c15159-8466-43e5-9dc5-a8cc94619931.jpg?1783945957","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const aweStrike = (): CardDef => ({"oracleId":"994bcde3-4a76-403d-a6e1-88609a13a99c","name":"Awe Strike","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"The next time target creature would deal damage this turn, prevent that damage. You gain life equal to the damage prevented this way.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/5/a5cd231b-7891-42b5-b5de-5112d1230c37.jpg?1783944563","artUrl":"https://cards.scryfall.io/art_crop/front/a/5/a5cd231b-7891-42b5-b5de-5112d1230c37.jpg?1783944563","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const eureka = (): CardDef => ({"oracleId":"917f2b4b-79ec-4ded-b4c8-cbcf363cb23b","name":"Eureka","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Starting with you, each player may put a permanent card from their hand onto the battlefield. Repeat this process until no one puts a card onto the battlefield.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/2/520db5fb-d961-45a3-af74-6f054b8be3ab.jpg?1783948048","artUrl":"https://cards.scryfall.io/art_crop/front/5/2/520db5fb-d961-45a3-af74-6f054b8be3ab.jpg?1783948048","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bloodSun = (): CardDef => ({"oracleId":"1534d90f-fc88-42dc-bf01-8b0986485e78","name":"Blood Sun","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, draw a card.\nAll lands lose all abilities except mana abilities.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/875832f4-e541-4c87-8479-731e0eab2cc6.jpg?1783935303","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/875832f4-e541-4c87-8479-731e0eab2cc6.jpg?1783935303","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const thornwoodFalls = (): CardDef => ({"oracleId":"ec96cde2-f1e6-495c-94e2-3e8ae79e556c","name":"Thornwood Falls","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\nWhen this land enters, you gain 1 life.\n{T}: Add {G} or {U}.","colors":[],"colorIdentity":["G","U"],"keywords":[],"producedMana":["G","U"],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/4723a303-7f20-4399-8bc6-6a27a61a3532.jpg?1783907838","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/4723a303-7f20-4399-8bc6-6a27a61a3532.jpg?1783907838","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const adarkarWastes = (): CardDef => ({"oracleId":"d5ad26cc-2bdb-46b7-b8bf-dd099d5fa09b","name":"Adarkar Wastes","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{T}: Add {W} or {U}. This land deals 1 damage to you.","colors":[],"colorIdentity":["U","W"],"keywords":[],"producedMana":["C","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08ae1037-6f70-41a9-b75e-98fa9a2152c8.jpg?1783921265","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08ae1037-6f70-41a9-b75e-98fa9a2152c8.jpg?1783921265","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const evolvingWilds = (): CardDef => ({"oracleId":"a75445d3-1303-4bb5-89ad-26ea93fecd48","name":"Evolving Wilds","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/0/c0318a48-30e4-4ef7-be3d-5e561c5ce428.jpg?1783903203","artUrl":"https://cards.scryfall.io/art_crop/front/c/0/c0318a48-30e4-4ef7-be3d-5e561c5ce428.jpg?1783903203","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mishrasFactory = (): CardDef => ({"oracleId":"5963e0ef-e0bc-4611-ad4f-813a4c0eacfb","name":"Mishra's Factory","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}: This land becomes a 2/2 Assembly-Worker artifact creature until end of turn. It's still a land.\n{T}: Target Assembly-Worker creature gets +1/+1 until end of turn.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c9eb1309-5e60-4b8f-b63c-ebe62030db5c.jpg?1783920232","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c9eb1309-5e60-4b8f-b63c-ebe62030db5c.jpg?1783920232","commanderLegal":"legal","set":"slc","releasedAt":"2022-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const urborg = (): CardDef => ({"oracleId":"db6174d7-211d-4817-b8e4-8384594c83f9","name":"Urborg, Tomb of Yawgmoth","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"Each land is a Swamp in addition to its other land types.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/0/3/031c71f7-37a7-4b64-ac18-01f587525df1.jpg?1787661687","artUrl":"https://cards.scryfall.io/art_crop/front/0/3/031c71f7-37a7-4b64-ac18-01f587525df1.jpg?1787661687","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const visionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const gildedLotus = (): CardDef => ({"oracleId":"9a02a9a7-39d9-4763-85d3-747a0540b60b","name":"Gilded Lotus","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add three mana of any one color.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/8/28e619e6-ecc1-49c3-8fa9-ce42becdb9ba.jpg?1783903220","artUrl":"https://cards.scryfall.io/art_crop/front/2/8/28e619e6-ecc1-49c3-8fa9-ce42becdb9ba.jpg?1783903220","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
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
/** Settles, the bots answering their own questions; stops at a question for `me`. */
const settleBots = (s: GameState, me: PlayerId) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) {
      if (s.pending.player === me) return s;
      for (const a of botActions(s, s.pending.player)) s = act(s, a);
      continue;
    }
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library", top = false) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library" && top) s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);

describe("Lane B round B172: cards", () => {
  it("compile", () => supported(plateMail(), lichsTomb(), recross(), warTax(), aweStrike(), eureka(), bloodSun()));
});

describe("Goblin Plate Mail", () => {
  it("amasses Goblins 1, then attaches to the amassed Army: a new 0/0 Goblin Army token, now 2/1 with menace", () => {
    const { s: s0, ap, ids } = setup([plateMail()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const army = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Army"));
    expect(army.length).toBe(1);
    expect(characteristics(s, s.objects[army[0]!]!).subtypes).toContain("Goblin");
    expect(s.objects[ids[0]!]!.attachedTo).toBe(army[0]);
    expect(pt(s, army[0]!)).toBe("2/1");
    expect(characteristics(s, s.objects[army[0]!]!).keywords.map((k) => k.toLowerCase())).toContain("menace");
  });
  it("with an Army already there, that Army gets the counter and the Equipment", () => {
    const { s: s0, ap, ids } = setup([plateMail(), plateMail()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const army = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Army"));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    const armies = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Army"));
    expect(armies).toEqual(army);
    expect(s.objects[ids[1]!]!.attachedTo).toBe(army[0]);
    expect(pt(s, army[0]!)).toBe("4/2");
  });
});

describe("Lich's Tomb", () => {
  it("you don't lose at 0 or less life; losing 3 life sacrifices three permanents of your choice", () => {
    const { s: s0, ap, opp } = setup([]);
    const tomb = putOnBattlefield(s0, ap, lichsTomb());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    s0.players[ap]!.life = 1;
    dealDamage(s0, objectSource(s0, s0.objects[giant]!), { player: ap }, 3);
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    s = settle(s);
    expect(s.players[ap]!.life).toBe(-2);
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.pending?.kind).toBe("pickPermanents");
    const before = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap).length;
    const lands = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && id !== tomb).slice(0, 3);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: lands }));
    expect(s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap).length).toBe(before - 3);
    expect(s.battlefield).toContain(tomb);
    expect(s.players[ap]!.lost).toBeFalsy();
  });
  it("sacrificing Lich's Tomb itself at 0 or less life loses the game", () => {
    const { s: s0, ap, opp } = setup([]);
    const tomb = putOnBattlefield(s0, ap, lichsTomb());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    s0.players[ap]!.life = 1;
    dealDamage(s0, objectSource(s0, s0.objects[giant]!), { player: ap }, 1);
    let s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.players[ap]!.life).toBe(0);
    expect(s.pending?.kind).toBe("pickPermanents");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [tomb] }));
    expect(s.players[ap]!.lost).toBe(true);
  });
});

describe("War Tax", () => {
  it("{X}{U}: this turn, attacking costs {X} for each attacking creature, at a player or a planeswalker; next turn it's free", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, warTax());
    const bear = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(run(s0, planActivate(s0, ap, w, 0, [], undefined, undefined, 2)));
    expect(attackTaxOf(s, { attacker: bear, defender: opp })).toBe(2);
    s = (() => {
      let t = s;
      for (let i = 0; i < 400 && !(t.activePlayer !== ap && t.step === "main1"); i++) t = t.pending ? (() => { let u = t; for (const a of botActions(u, u.pending!.player)) u = act(u, a); return u; })() : act(t, { type: "passPriority", player: waitingOn(t)! });
      return t;
    })();
    expect(attackTaxOf(s, { attacker: bear, defender: opp })).toBe(0);
  });
});

describe("Awe Strike", () => {
  it("the next time target creature would deal damage this turn, it's prevented and you gain that much life; the time after isn't", () => {
    const { s: s0, ap, ids, opp } = setup([aweStrike()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(giant)])));
    const life = s.players[ap]!.life;
    dealDamage(s, objectSource(s, s.objects[giant]!), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(life + 3);
    dealDamage(s, objectSource(s, s.objects[giant]!), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(life);
  });
});

describe("Recross the Paths", () => {
  it("reveals until a land, puts it onto the battlefield and the rest on the bottom in the order you choose, then clashes: a win returns it to your hand", () => {
    const { s: s0, ap, ids, opp } = setup([recross()]);
    // Your library from the top: Divination, Grizzly Bears, Forest, then Hill Giant for the clash (mana value 4).
    const clashCard = into(s0, ap, hillGiant(), "library", true);
    const land = into(s0, ap, thornwoodFalls(), "library", true);
    const bears = into(s0, ap, grizzlyBears(), "library", true);
    const div = into(s0, ap, divination(), "library", true);
    // Every opponent's top card is a land (mana value 0), so whoever is clashed with, you win.
    for (const p of s0.turnOrder) if (p !== ap) into(s0, p, thornwoodFalls(), "library", true);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "bottom", player: ap });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([bears, div].sort());
    s = act(s, { type: "arrangeTop", player: ap, top: [div, bears], away: [] });
    // Then the clash: the opponent, then whether each puts their card on the bottom.
    for (let i = 0; i < 10 && s.pending; i++) {
      s = settleBots(s, ap);
      const p = s.pending;
      if (!p) break;
      if (p.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: p.options.includes(String(opp)) ? String(opp) : p.options[0]! });
      else if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: false });
      else break;
    }
    s = settleBots(s, ap);
    expect(s.battlefield).toContain(land);
    expect(s.players[ap]!.library.slice(-2)).toEqual([div, bears]);
    expect(s.players[ap]!.library[0]).toBe(clashCard);
    expect(s.players[ap]!.hand).toContain(ids[0]);
  });
  it("loses the clash: it goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([recross()]);
    into(s0, ap, thornwoodFalls(), "library", true); // your clash card: mana value 0
    into(s0, ap, thornwoodFalls(), "library", true); // the land revealed
    for (const p of s0.turnOrder) if (p !== ap) into(s0, p, hillGiant(), "library", true);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)), ap);
    for (let i = 0; i < 10 && s.pending; i++) {
      const p = s.pending!;
      if (p.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: p.options[0]! });
      else if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: false });
      else break;
      s = settleBots(s, ap);
    }
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
  });
});

describe("Eureka", () => {
  /** Each opponent's hand emptied into their library; `hands` gives some of them cards. */
  const eurekaSetup = (mine: CardDef[], hands: Partial<Record<number, CardDef[]>> = {}) => {
    const r = setup([eureka(), ...mine]);
    const opps = r.s.turnOrder.slice(r.s.turnOrder.indexOf(r.ap) + 1).concat(r.s.turnOrder.slice(0, r.s.turnOrder.indexOf(r.ap)));
    for (const p of opps) {
      const pl = r.s.players[p]!;
      for (const id of pl.hand) r.s.objects[id]!.zone = "library";
      pl.library.push(...pl.hand);
      pl.hand = [];
    }
    const given = opps.map((p, i) => (hands[i] ?? []).map((d) => into(r.s, p, d, "hand")));
    return { ...r, opps, given };
  };
  const putFromHand = (s: GameState, pid: PlayerId, ids: string[]) => {
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: pid, fromHand: true, max: 1 });
    return act(s, { type: "searchLibrary", player: pid, found: ids });
  };

  it("starting with you, around and around: each card enters as it's chosen, and it's over once every player in a row puts none", () => {
    const { s: s0, ap, ids, opps, given } = eurekaSetup([clone(), grizzlyBears(), pacifism(), visionary(), lightningBolt()], { 0: [hillGiant()] });
    const theirBears = putOnBattlefield(s0, opps[1]!, grizzlyBears());
    const [, cloneId, bearsId, pacifismId, visionaryId, boltId] = ids;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Round one: you put Clone, the next player Hill Giant; the other two have no permanent card.
    s = putFromHand(s, ap, [cloneId!]);
    s = putFromHand(s, opps[0]!, [given[0]![0]!]);
    expect(s.battlefield).toContain(cloneId);
    expect(s.battlefield).toContain(given[0]![0]);
    // Round two: you put Grizzly Bears; nobody else has one.
    s = putFromHand(s, ap, [bearsId!]);
    // Round three: Pacifism, enchanting the Hill Giant.
    s = putFromHand(s, ap, [pacifismId!]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: ap });
    const pend = s.pending as { options: string[] };
    s = act(s, { type: "chooseOption", player: ap, choice: pend.options.find((o) => o.includes(given[0]![0]!))! });
    expect(s.objects[pacifismId!]!.attachedTo).toBe(given[0]![0]);
    // Round four: you put none (Elvish Visionary stays in hand): every player in a row has put none.
    s = putFromHand(s, ap, []);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([visionaryId, boltId]));
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
    // Clone's "as it enters" copy: only what was on the battlefield as it entered, not the Giant or Bears put after it.
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy", player: ap });
    expect((s.pending as { options: string[] }).options).toEqual([theirBears, "none"]);
  });

  it("one who put none may put one the next time around", () => {
    const { s: s0, ap, ids, opps, given } = eurekaSetup([grizzlyBears(), hillGiant()], { 0: [grizzlyBears()] });
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = putFromHand(s, ap, [ids[1]!]);
    s = putFromHand(s, opps[0]!, []); // the next player declines this time around
    s = putFromHand(s, ap, [ids[2]!]);
    s = putFromHand(s, opps[0]!, [given[0]![0]!]); // and puts it the next time
    s = putFromHand(s, ap, []);
    expect(s.battlefield).toEqual(expect.arrayContaining([ids[1], ids[2], given[0]![0]]));
    expect(s.pending).toBeFalsy();
  });

  it("bots answer it, and it ends", () => {
    const { s: s0, ap, ids } = setup([eureka(), grizzlyBears(), hillGiant(), pacifism()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settleBots(s, 99 as PlayerId);
    expect(s.stack.length).toBe(0);
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
  });
});

describe("Blood Sun", () => {
  it("draws a card; lands keep only their mana abilities; a land's enters-tapped and enters trigger are gone as it enters (rulings)", () => {
    const { s: s0, ap, ids } = setup([bloodSun(), thornwoodFalls()]);
    const wastes = putOnBattlefield(s0, ap, adarkarWastes());
    const wilds = putOnBattlefield(s0, ap, evolvingWilds());
    const factory = putOnBattlefield(s0, ap, mishrasFactory());
    const hand = s0.players[ap]!.hand.length;
    expect(abilitiesOf(s0, s0.objects[wilds]!).activated.length).toBe(1);
    expect(abilitiesOf(s0, s0.objects[factory]!).activated.length).toBe(2);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    // Evolving Wilds' sacrifice ability isn't a mana ability; Mishra's Factory keeps only "{T}: Add {C}".
    expect(abilitiesOf(s, s.objects[wilds]!).activated.length).toBe(0);
    expect(abilitiesOf(s, s.objects[factory]!).activated.length).toBe(0);
    expect(manaAbilitiesOn(s, s.objects[factory]!).length).toBe(1);
    // Adarkar Wastes: both its mana abilities, the damage too (part of the mana ability).
    expect(manaAbilitiesOn(s, s.objects[wastes]!).length).toBe(manaAbilitiesOn(s0, s0.objects[wastes]!).length);
    // Thornwood Falls enters untapped and its "When this land enters, you gain 1 life" never triggers.
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "playLand", player: ap, objectId: ids[1]! }));
    expect(s.objects[ids[1]!]!.tapped).toBe(false);
    expect(s.players[ap]!.life).toBe(life);
    expect(manaAbilitiesOn(s, s.objects[ids[1]!]!).length).toBeGreaterThan(0);
  });
  it("Urborg's land types still apply (layer 4 before layer 6, rulings); with Blood Sun gone the abilities come back", () => {
    const { s: s0, ap, ids } = setup([bloodSun()]);
    const tomb = putOnBattlefield(s0, ap, urborg());
    const wilds = putOnBattlefield(s0, ap, evolvingWilds());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(characteristics(s, s.objects[wilds]!).subtypes).toContain("Swamp");
    expect(characteristics(s, s.objects[tomb]!).subtypes).toContain("Swamp");
    expect(abilitiesOf(s, s.objects[wilds]!).activated.length).toBe(0);
    s.battlefield.splice(s.battlefield.indexOf(ids[0]!), 1);
    s.objects[ids[0]!]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(ids[0]!);
    invalidateCharacteristics(s);
    expect(abilitiesOf(s, s.objects[wilds]!).activated.length).toBe(1);
  });
});

describe("Lane B round B172: bots", () => {
  it("a bot doesn't tax its own attacks with War Tax", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, warTax());
    putOnBattlefield(s0, ap, grizzlyBears());
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === w)).toBe(false);
  });
});

// Round 247: cards from earlier rounds' skip lists. Enchanted Evening (every permanent is an enchantment, CR 205.1b),
// Pili-Pala and Puresight Merrow ({Q}, the untap symbol, CR 107.6), Edgewall Inn ("card that has an Adventure"), Thwart
// the Grave (two targets from your graveyard at once), Mists of Lórien ("each other nonland permanent with the same mana
// value"), Coalition Victory, Phytotitan ("at the beginning of their next upkeep"), Reality Acid ("enchanted permanent's
// controller sacrifices it"), Ravener ("target creature attacks target opponent this turn if able"), Barrin, Tolarian
// Archmage ("a permanent was put into your hand from the battlefield this turn"), Wickersmith's Tools ("one or more -1/-1
// counters are put on a creature"), Shadow of the Grave ("cycled or discarded this turn"), Ride Down ("blocked by that
// creature this combat"), Honest Work ("named Humble Merchant"), Summary Dismissal ("Exile all other spells and counter all
// abilities"), Bronze Bombshell ("When a player other than this creature's owner controls it", CR 603.8) and, from
// Reality Acid's sentence, Parasitic Implant.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, closeZoneBatch, discardCards, characteristics, controllerOf, defOf, destroyPermanent, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, runStateBasedActions, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

// Real oracle text (Scryfall).
const evening = (): CardDef => ({"oracleId":"c56ea5ce-c8de-46c2-a8dd-bdd41467a28c","name":"Enchanted Evening","manaCost":"{3}{W/U}{W/U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"All permanents are enchantments in addition to their other types.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/88ca3c93-ac49-4976-aa77-ee308b1c59bd.jpg?1783928575","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/88ca3c93-ac49-4976-aa77-ee308b1c59bd.jpg?1783928575","commanderLegal":"legal","set":"sld","releasedAt":"2020-11-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pili = (): CardDef => ({"oracleId":"ad97333e-733c-402f-8ca3-e836c96b843c","name":"Pili-Pala","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Scarecrow","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Scarecrow"],"oracleText":"Flying\n{2}, {Q}: Add one mana of any color. ({Q} is the untap symbol.)","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":["Flying"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/4892c152-1f4a-4616-8e7f-0ca4911e621a.jpg?1783942710","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/4892c152-1f4a-4616-8e7f-0ca4911e621a.jpg?1783942710","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const merrow = (): CardDef => ({"oracleId":"012c665c-24b1-49d6-b575-2b4ee1c3a833","name":"Puresight Merrow","manaCost":"{W/U}{W/U}","cmc":2,"typeLine":"Creature — Merfolk Wizard","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Wizard"],"oracleText":"{W/U}, {Q}: Look at the top card of your library. You may exile that card. ({Q} is the untap symbol.)","power":"2","toughness":"2","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/77f25680-d1b3-4bf6-83e2-2eea0b5419ad.jpg?1783942736","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/77f25680-d1b3-4bf6-83e2-2eea0b5419ad.jpg?1783942736","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const inn = (): CardDef => ({"oracleId":"4dfd33e8-7e30-493b-8564-f7df5f0257aa","name":"Edgewall Inn","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\nAs this land enters, choose a color.\n{T}: Add one mana of the chosen color.\n{3}, {T}, Sacrifice this land: Return target card that has an Adventure from your graveyard to your hand.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/e/c/ec435e54-628a-43bd-8804-cbc37e375bce.jpg?1783915055","artUrl":"https://cards.scryfall.io/art_crop/front/e/c/ec435e54-628a-43bd-8804-cbc37e375bce.jpg?1783915055","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const thwart = (): CardDef => ({"oracleId":"b545e26f-2034-409c-80cc-51b72e75e6e4","name":"Thwart the Grave","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} less to cast for each creature in your party. (Your party consists of up to one each of Cleric, Rogue, Warrior, and Wizard.)\nReturn target creature card and up to one target Cleric, Rogue, Warrior, or Wizard creature card from your graveyard to the battlefield.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/d/bd037e51-9088-4145-8289-00a86fb72ca1.jpg?1783929367","artUrl":"https://cards.scryfall.io/art_crop/front/b/d/bd037e51-9088-4145-8289-00a86fb72ca1.jpg?1783929367","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mists = (): CardDef => ({"oracleId":"65259ba4-956d-46a3-abd9-791d02015b41","name":"Mists of Lórien","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Replicate {U} (When you cast this spell, copy it for each time you paid its replicate cost. You may choose new targets for the copies.)\nReturn target nonland permanent and each other nonland permanent with the same mana value as that permanent to their owners' hands.","colors":["U"],"colorIdentity":["U"],"keywords":["Replicate"],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/eb23c5fc-3172-44c3-9d3a-ec619c6c4824.jpg?1783914199","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/eb23c5fc-3172-44c3-9d3a-ec619c6c4824.jpg?1783914199","commanderLegal":"legal","set":"ltc","releasedAt":"2023-11-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const coalition = (): CardDef => ({"oracleId":"e9e25800-9ee7-40c9-b22d-611c7281c125","name":"Coalition Victory","manaCost":"{3}{W}{U}{B}{R}{G}","cmc":8,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You win the game if you control a land of each basic land type and a creature of each color.","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/dd8ad3aa-3225-45ae-8343-5991f5b52269.jpg?1783945664","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/dd8ad3aa-3225-45ae-8343-5991f5b52269.jpg?1783945664","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":true}) as CardDef;
const phyto = (): CardDef => ({"oracleId":"2541e0cd-2cc1-4e47-94e3-030c1cb1a6bd","name":"Phytotitan","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Plant Elemental","supertypes":[],"types":["Creature"],"subtypes":["Plant","Elemental"],"oracleText":"When this creature dies, return it to the battlefield tapped under its owner's control at the beginning of their next upkeep.","power":"7","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0e6eedf-8f5a-407e-b15b-48e19df20bed.jpg?1783939163","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0e6eedf-8f5a-407e-b15b-48e19df20bed.jpg?1783939163","commanderLegal":"legal","set":"m15","releasedAt":"2014-07-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const acid = (): CardDef => ({"oracleId":"232c297d-71b6-429f-99df-39a11dbcea40","name":"Reality Acid","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant permanent\nVanishing 3 (This Aura enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this Aura leaves the battlefield, enchanted permanent's controller sacrifices it.","colors":["U"],"colorIdentity":["U"],"keywords":["Vanishing","Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8c6ad9c3-b5dd-46a9-8494-8b395e21aedf.jpg?1783943161","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8c6ad9c3-b5dd-46a9-8494-8b395e21aedf.jpg?1783943161","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ravener = (): CardDef => ({"oracleId":"6c4ac289-edca-4dce-8572-817efbdd08b2","name":"Ravener","manaCost":"{X}{G}{U}","cmc":2,"typeLine":"Creature — Tyranid","supertypes":[],"types":["Creature"],"subtypes":["Tyranid"],"oracleText":"Flash\nRavenous (This creature enters with X +1/+1 counters on it. If X is 5 or more, draw a card when it enters.)\nWhen this creature enters, target creature attacks target opponent this turn if able.","power":"0","toughness":"0","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Ravenous","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b6a9ed40-78d7-4de2-816f-1791e12fbb0c.jpg?1783920837","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b6a9ed40-78d7-4de2-816f-1791e12fbb0c.jpg?1783920837","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const barrin = (): CardDef => ({"oracleId":"f98f7cb7-90ca-41e7-9f1d-8054931ecf0e","name":"Barrin, Tolarian Archmage","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When Barrin enters, return up to one other target creature or planeswalker to its owner's hand.\nAt the beginning of your end step, if a permanent was put into your hand from the battlefield this turn, draw a card.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cb078fbb-beb9-4c0b-be93-ed1e73e6f8d8.jpg?1783930730","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cb078fbb-beb9-4c0b-be93-ed1e73e6f8d8.jpg?1783930730","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tools = (): CardDef => ({"oracleId":"c89cd328-b4cc-4760-8b6c-59e82eed8dac","name":"Wickersmith's Tools","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever one or more -1/-1 counters are put on a creature, put a charge counter on this artifact.\n{T}: Add one mana of any color.\n{5}, {T}, Sacrifice this artifact: Create X tapped 2/2 colorless Scarecrow artifact creature tokens, where X is the number of charge counters on this artifact.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/3/7/3758af07-68ed-42da-8a13-ec321e7cd06e.jpg?1783904601","artUrl":"https://cards.scryfall.io/art_crop/front/3/7/3758af07-68ed-42da-8a13-ec321e7cd06e.jpg?1783904601","commanderLegal":"legal","set":"ecc","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shadow = (): CardDef => ({"oracleId":"f33d1132-064d-42f1-8814-95d27fde8bf8","name":"Shadow of the Grave","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return to your hand all cards in your graveyard that you cycled or discarded this turn.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b0205cb-c163-4332-9624-394e1024bf6a.jpg?1783936499","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b0205cb-c163-4332-9624-394e1024bf6a.jpg?1783936499","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ride = (): CardDef => ({"oracleId":"9d136448-7331-4a61-b2ad-cfeb23dfa464","name":"Ride Down","manaCost":"{R}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target blocking creature. Creatures that were blocked by that creature this combat gain trample until end of turn.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/0/c021868f-9ab8-4a52-b12e-3cc35c9d67f0.jpg?1783937428","artUrl":"https://cards.scryfall.io/art_crop/front/c/0/c021868f-9ab8-4a52-b12e-3cc35c9d67f0.jpg?1783937428","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const honest = (): CardDef => ({"oracleId":"12956c07-e679-471b-8dcb-2a2d15b0be55","name":"Honest Work","manaCost":"{U}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature an opponent controls\nWhen this Aura enters, tap enchanted creature and remove all counters from it.\nEnchanted creature loses all abilities and is a Citizen with base power and toughness 1/1 and \"{T}: Add {C}\" named Humble Merchant. (It loses all other creature types and names.)","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/57e0ccb0-22f0-4e4d-9a47-c4fec2c7f251.jpg?1783904988","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/57e0ccb0-22f0-4e4d-9a47-c4fec2c7f251.jpg?1783904988","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const dismissal = (): CardDef => ({"oracleId":"f69d65e0-4d8a-4e27-b4dd-dd8c50acb8eb","name":"Summary Dismissal","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile all other spells and counter all abilities.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b75794d-3334-4b4d-9446-0a251dd3bd15.jpg?1783937493","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b75794d-3334-4b4d-9446-0a251dd3bd15.jpg?1783937493","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bombshell = (): CardDef => ({"oracleId":"45754ecb-1da7-4d03-b98f-7c13dc2d4119","name":"Bronze Bombshell","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"When a player other than this creature's owner controls it, that player sacrifices it. If the player does, this creature deals 7 damage to the player.","power":"4","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f2ec20d-b862-4f13-989c-aa88efa51cdf.jpg?1783943383","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f2ec20d-b862-4f13-989c-aa88efa51cdf.jpg?1783943383","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]}) as CardDef;
const implant = (): CardDef => ({"oracleId":"4fc0f58c-5f7f-4a32-8f14-cae696672beb","name":"Parasitic Implant","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAt the beginning of your upkeep, enchanted creature's controller sacrifices it and you create a 1/1 colorless Phyrexian Myr artifact creature token.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/3/e34f1bf3-9f3a-47f0-9761-8b2356328a39.jpg?1783941311","artUrl":"https://cards.scryfall.io/art_crop/front/e/3/e34f1bf3-9f3a-47f0-9761-8b2356328a39.jpg?1783941311","commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const relic = (mv: number, name = `Test Relic ${mv}`) => card(name, "Artifact", `{${mv}}`, { cmc: mv });
const wizard = card("Test Wizard", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "1", colors: ["U"] });
const cleric = card("Test Cleric", "Creature — Human Cleric", "{1}{W}", { power: "1", toughness: "1", colors: ["W"] });
const rainbow = card("Test Rainbow", "Creature — Sliver", "{W}{U}{B}{R}{G}", { power: "1", toughness: "1", colors: ["W", "U", "B", "R", "G"] });
const wither = card("Test Wither", "Sorcery", "{B}", { oracleText: "Put two -1/-1 counters on target creature." });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4" });
const flier = card("Test Flier", "Creature — Bird", "{1}{U}", { power: "2", toughness: "2", oracleText: "Flying", keywords: ["Flying"] });
const pinger = card("Test Pinger", "Creature — Human", "{1}{R}", { power: "1", toughness: "1", oracleText: "{T}: Test Pinger deals 1 damage to any target." });
const sure = card("Test Sure Thing", "Creature — Beast", "{1}{G}", { power: "2", toughness: "2", oracleText: "This spell can't be countered." });
const generic = (s: GameState, pid: PlayerId, id: ObjectId, targets?: TargetChoice[]) =>
  {
  const c = spellCost(s, pid, s.objects[id]!, 0, [], targets ? { targets } : {});
  return c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
};

describe("round 247", () => {
  it("every card of the round compiles fully", () => {
    supported(evening(), pili(), merrow(), inn(), thwart(), mists(), coalition(), phyto(), acid(), ravener(), barrin(), tools(), shadow(), ride(), honest(), dismissal(), bombshell(), implant());
  });

  it("Enchanted Evening: every permanent is an enchantment as well, keeping its other types (CR 205.1b, 613.1d)", () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, opp, bear());
    const land = s.battlefield.find((id) => defOf(s, s.objects[id]!).name === "Island")!;
    expect(objIsType(s, s.objects[b]!, "Enchantment")).toBe(false);
    const e = putOnBattlefield(s, ap, evening());
    for (const id of [b, land, e]) expect(objIsType(s, s.objects[id]!, "Enchantment")).toBe(true);
    expect(objIsType(s, s.objects[b]!, "Creature")).toBe(true);
    expect(objIsType(s, s.objects[land]!, "Land")).toBe(true);
    destroyPermanent(s, s.objects[e]!, "destroyed");
    invalidateCharacteristics(s);
    expect(objIsType(s, s.objects[b]!, "Enchantment")).toBe(false);
  });

  it("Pili-Pala: {2}, {Q} untaps it for one mana of any color; not while untapped or summoning sick (CR 107.6, 302.6)", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pili());
    expect(objHasKeyword(s0, s0.objects[p]!, "Flying")).toBe(true);
    s0.players[ap]!.manaPool.C = 2;
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: p, mana: "G" })).toThrow();
    s0.objects[p]!.tapped = true;
    const s = act(s0, { type: "activateMana", player: ap, objectId: p, mana: "G" });
    expect(s.objects[p]!.tapped).toBe(false);
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.players[ap]!.manaPool.C).toBe(0);
    // Summoning sick: it can't pay {Q}.
    const { s: t, ap: bp } = setup([]);
    const q = putOnBattlefield(t, bp, pili(), { sick: true });
    t.objects[q]!.tapped = true;
    t.players[bp]!.manaPool.C = 2;
    expect(() => act(t, { type: "activateMana", player: bp, objectId: q, mana: "G" })).toThrow();
    t.objects[q]!.controlledSinceTurn = -1;
    expect(act(t, { type: "activateMana", player: bp, objectId: q, mana: "G" }).players[bp]!.manaPool.G).toBe(1);
  });

  it("Puresight Merrow: {W/U}, {Q}: look at the top card of your library and maybe exile it", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, merrow());
    const top = into(s0, ap, ogre, "library");
    expect(planActivate(s0, ap, m, 0)).toBeNull();
    s0.objects[m]!.tapped = true;
    let s = settle(run(s0, planActivate(s0, ap, m, 0)));
    expect(s.objects[m]!.tapped).toBe(false);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [top], min: 0 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }));
    expect(s.objects[top]!.zone).toBe("exile");
    // Or leave it there.
    s.objects[m]!.tapped = true;
    const next = s.players[ap]!.library[0]!;
    s = settle(run(s, planActivate(s, ap, m, 0)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.players[ap]!.library[0]).toBe(next);
  });

  it("Edgewall Inn: returns a card that has an Adventure from your graveyard, nothing else", () => {
    const { s: s0, ap } = setup([]);
    const inn0 = putOnBattlefield(s0, ap, inn());
    const g = into(s0, ap, giant(), "graveyard");
    const b = into(s0, ap, bear(), "graveyard");
    const idx = abilitiesOf(s0, s0.objects[inn0]!).activated.findIndex((a) => /Adventure/.test(a.text));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(planActivate(s0, ap, inn0, idx, [tgt(b)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, inn0, idx, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("hand");
    expect(s.objects[inn0]!.zone).toBe("graveyard");
  });

  it("Thwart the Grave: {1} less for each creature in your party; returns a creature card and a party creature card together", () => {
    const { s: s0, ap, ids } = setup([thwart()]);
    expect(generic(s0, ap, ids[0]!)).toBe(4);
    putOnBattlefield(s0, ap, cleric);
    expect(generic(s0, ap, ids[0]!)).toBe(3);
    putOnBattlefield(s0, ap, wizard);
    expect(generic(s0, ap, ids[0]!)).toBe(2);
    const b = into(s0, ap, ogre, "graveyard");
    const w = into(s0, ap, wizard, "graveyard");
    // The second target must be a Cleric, Rogue, Warrior or Wizard.
    const o2 = into(s0, ap, bear(), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [tgt(b), tgt(o2)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b), tgt(w)])));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[w]!.zone).toBe("battlefield");
    expect(s.objects[o2]!.zone).toBe("graveyard");
  });

  it("Mists of Lórien: the target and every other nonland permanent with its mana value go back to their owners' hands", () => {
    const { s: s0, ap, opp, ids } = setup([mists()]);
    const a = putOnBattlefield(s0, opp, relic(3));
    const b = putOnBattlefield(s0, ap, relic(3, "Test Idol"));
    const c = putOnBattlefield(s0, opp, relic(2));
    const z = putOnBattlefield(s0, opp, relic(0));
    const land = s0.battlefield.find((id) => defOf(s0, s0.objects[id]!).name === "Island")!;
    expect(planCast(s0, ap, ids[0]!, [tgt(land)])).toBeNull();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(b);
    expect(s.objects[c]!.zone).toBe("battlefield");
    // Mana value 0: lands (also mana value 0) stay.
    const { s: t0, ap: bp, ids: tids } = setup([mists()]);
    const z2 = putOnBattlefield(t0, bp, relic(0));
    s = settle(run(t0, planCast(t0, bp, tids[0]!, [tgt(z2)])));
    expect(s.objects[z2]!.zone).toBe("hand");
    expect(s.battlefield.filter((id) => objIsType(s, s.objects[id]!, "Land")).length).toBe(14);
    void z;
  });

  it("Coalition Victory: you win if you control a land of each basic land type and a creature of each color", () => {
    const { s: s0, ap, ids } = setup([coalition()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.winner ?? undefined).toBeUndefined();
    const { s: t0, ap: bp, ids: tids } = setup([coalition()]);
    putOnBattlefield(t0, bp, rainbow);
    s = settle(run(t0, planCast(t0, bp, tids[0]!)));
    expect(s.winner).toBe(bp);
  });

  it("Phytotitan: when it dies, it returns tapped under its owner's control at the beginning of the owner's next upkeep", () => {
    const { s: s0, ap } = setup([]);
    const owner = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const p = putOnBattlefield(s0, owner, phyto());
    addEffect(s0, ap, [p], [{ kind: "control" }], "game");
    expect(controllerOf(s0, s0.objects[p]!)).toBe(ap);
    destroyPermanent(s0, s0.objects[p]!, "destroyed");
    let s = settle(s0);
    expect(s.objects[p]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "draw", next));
    expect(s.objects[p]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "draw", owner));
    expect(s.objects[p]).toMatchObject({ zone: "battlefield", tapped: true });
    expect(controllerOf(s, s.objects[p]!)).toBe(owner);
  });

  it("Reality Acid: when it leaves the battlefield, the enchanted permanent's controller sacrifices that permanent", () => {
    const { s: s0, ap, opp, ids } = setup([acid()]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[ids[0]!]).toMatchObject({ zone: "battlefield", attachedTo: b });
    expect(s.objects[ids[0]!]!.counters.time).toBe(3);
    destroyPermanent(s, s.objects[ids[0]!]!, "destroyed");
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Parasitic Implant: at your upkeep the enchanted creature's controller sacrifices it, and you get a Myr", () => {
    const { s: s0, ap, opp, ids } = setup([implant()]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    s = settle(passUntil(s, "upkeep", opp));
    expect(s.objects[b]!.zone).toBe("battlefield");
    s = settle(passUntil(s, "draw", ap));
    expect(s.objects[b]!.zone).toBe("graveyard");
    const myr = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Myr"));
    expect(myr.length).toBe(1);
    expect(controllerOf(s, s.objects[myr[0]!]!)).toBe(ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Ravener: enters with X +1/+1 counters; the creature it targets attacks the opponent it targets this turn if able", () => {
    const { s: s0, ap, opp, ids } = setup([ravener()]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2));
    s = settle(s, { targets: [tgt(b), { kind: "player", id: opp }] });
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, ids[0]!)).toBe("2/2");
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow();
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: other }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    expect(s.objects[b]!.attacking).toBe(opp);
  });

  it("Barrin, Tolarian Archmage: draws at your end step only if a permanent was put into your hand from the battlefield", () => {
    for (const mine of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([barrin()]);
      const b = putOnBattlefield(s0, mine ? ap : opp, bear());
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(b)] });
      expect(s.objects[b]!.zone).toBe("hand");
      const lib = s.players[ap]!.library.length;
      s = settle(passUntil(s, "end", ap));
      expect(s.players[ap]!.library.length, mine ? "own bear" : "opponent's bear").toBe(mine ? lib - 1 : lib);
    }
  });

  it("Wickersmith's Tools: a charge counter when -1/-1 counters are put on a creature; Scarecrows for each charge counter", () => {
    const { s: s0, ap, opp, ids } = setup([wither, wither]);
    const w = putOnBattlefield(s0, ap, tools());
    const b = putOnBattlefield(s0, opp, ogre);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[w]!.counters.charge).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(s.objects[w]!.counters.charge).toBe(2);
    const idx = abilitiesOf(s, s.objects[w]!).activated.findIndex((a) => /Scarecrow/.test(a.text));
    s = settle(run(s, planActivate(s, ap, w, idx)));
    const crows = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Scarecrow"));
    expect(crows.length).toBe(2);
    expect(crows.every((id) => s.objects[id]!.tapped && pt(s, id) === "2/2" && objIsType(s, s.objects[id]!, "Artifact"))).toBe(true);
    expect(s.objects[w]!.zone).toBe("graveyard");
  });

  it("Shadow of the Grave: returns the cards you discarded this turn, not others in your graveyard", () => {
    const { s: s0, ap, ids } = setup([shadow(), bear({ name: "Test Discarded" })]);
    const old = into(s0, ap, ogre, "graveyard");
    discardCards(s0, ap, [ids[1]!]);
    closeZoneBatch(s0);
    expect(s0.objects[ids[1]!]!.zone).toBe("graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.objects[old]!.zone).toBe("graveyard");
  });

  it("Ride Down: destroys the blocker; the creatures it blocked this combat gain trample", () => {
    const { s: s0, ap, opp, ids } = setup([ride()]);
    const a = putOnBattlefield(s0, ap, ogre);
    const b = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: a }] });
    for (let i = 0; i < 20 && (s.step !== "declareBlockers" || waitingOn(s) !== ap); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planCast(s, ap, ids[0]!, [tgt(a)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(objHasKeyword(s, s.objects[a]!, "Trample")).toBe(true);
    const life = s.players[opp]!.life;
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("Honest Work: taps the creature, removes its counters, and makes it a 1/1 Citizen named Humble Merchant with only {T}: Add {C}", () => {
    const { s: s0, ap, opp, ids } = setup([honest()]);
    const f = putOnBattlefield(s0, opp, flier);
    s0.objects[f]!.counters["+1/+1"] = 2;
    const mine = putOnBattlefield(s0, ap, bear());
    expect(planCast(s0, ap, ids[0]!, [tgt(mine)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(f)])));
    const o = s.objects[f]!;
    expect(o.tapped).toBe(true);
    expect(o.counters["+1/+1"] ?? 0).toBe(0);
    const ch = characteristics(s, o);
    expect(ch.name).toBe("Humble Merchant");
    expect(ch.subtypes).toEqual(["Citizen"]);
    expect(pt(s, f)).toBe("1/1");
    expect(objHasKeyword(s, o, "Flying")).toBe(false);
    expect(abilitiesOf(s, o).mana.length).toBe(1);
  });

  it("Summary Dismissal: exiles every other spell (even one that can't be countered) and counters every ability", () => {
    const { s: s0, ap, opp, ids } = setup([dismissal(), sure]);
    const p = putOnBattlefield(s0, ap, pinger);
    let s = run(s0, planCast(s0, ap, ids[1]!));
    s = run(s, planActivate(s, ap, p, 0, [{ kind: "player", id: opp }]));
    expect(s.stack.length).toBe(2);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Bronze Bombshell: a player who controls it but doesn't own it sacrifices it and is dealt 7 damage (CR 603.8)", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, bombshell());
    runStateBasedActions(s0);
    expect(s0.triggerQueue.length + s0.stack.length).toBe(0);
    addEffect(s0, ap, [b], [{ kind: "control" }], "game");
    const life = s0.players[ap]!.life;
    runStateBasedActions(s0);
    const s = settle(s0);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(b);
    expect(s.players[ap]!.life).toBe(life - 7);
    // Back under its owner's control before the trigger resolves: not sacrificed, no damage (rulings).
    const { s: t0, ap: bp, opp: tq } = setup([]);
    const c = putOnBattlefield(t0, tq, bombshell());
    const fx = addEffect(t0, bp, [c], [{ kind: "control" }], "game");
    runStateBasedActions(t0);
    let t = t0;
    for (let i = 0; i < 10 && !t.stack.length; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(t.stack.length).toBe(1);
    t.effects = t.effects.filter((e) => e !== fx && e.id !== fx.id);
    invalidateCharacteristics(t);
    const l2 = t.players[bp]!.life;
    t = settle(t);
    expect(t.objects[c]!.zone).toBe("battlefield");
    expect(t.players[bp]!.life).toBe(l2);
    expect(t.players[tq]!.life).toBe(40);
  });
});

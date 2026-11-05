// Round 275, from the top of the popularity list's skipped cards: Tarmogoyf Nest and Disa the Restless (a Tarmogoyf token,
// a copy of the card Tarmogoyf, rulings), Overwhelming Splendor ("Enchanted player can't activate abilities that aren't
// mana abilities or loyalty abilities"), Strata Scythe (lands named like the card its imprint exiled, CR 607.2a), Black
// Panther, Wakandan King ("move all +1/+1 counters ... that much"), Loki, God of Mischief ("becomes the target of an
// ability you control"), Admiral Brass, Unsinkable (base power and toughness 4/4 for the returned Pirate), Quest for Ula's
// Temple (a may-reveal of the looked-at card), Once Upon a Time (free if it's the first spell you've cast this game),
// Hunting Wilds (kicked: the Forests found become 3/3 creatures), Convert to Slime (the total mana value of the permanents
// destroyed) and Wall of Shards (cumulative upkeep "an opponent gains 1 life", CR 702.24a).

import { describe, expect, it } from "vitest";
import { act, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, castProblem, characteristics, closeZoneBatch, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const C = {
  nest: {"oracleId":"29fede1b-e379-46d4-93e9-a589c896add6","name":"Tarmogoyf Nest","manaCost":"{2}{G}","cmc":3,"typeLine":"Kindred Enchantment — Lhurgoyf Aura","supertypes":[],"types":["Kindred","Enchantment"],"subtypes":["Lhurgoyf","Aura"],"oracleText":"Enchant land\nEnchanted land has \"{1}{G}, {T}: Create a Tarmogoyf token.\" (It's a {1}{G} Lhurgoyf creature with \"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.\")","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1a906132-19ab-4b7c-95de-08f8a5fa3aea.jpg?1783911405","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1a906132-19ab-4b7c-95de-08f8a5fa3aea.jpg?1783911405","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  goyf: {"oracleId":"45900b2f-f6a9-4c42-9642-008f3c1cf6dd","name":"Tarmogoyf","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Lhurgoyf","supertypes":[],"types":["Creature"],"subtypes":["Lhurgoyf"],"oracleText":"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.","power":"*","toughness":"1+*","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8be5ee47-8f8a-4e3c-b1a1-9ca0e1fdec7f.jpg?1789127270","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8be5ee47-8f8a-4e3c-b1a1-9ca0e1fdec7f.jpg?1789127270","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  disa: {"oracleId":"283bfc53-afd3-4d21-b7d5-5baba4232422","name":"Disa the Restless","manaCost":"{2}{B}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Human Scout","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scout"],"oracleText":"Whenever a Lhurgoyf permanent card is put into your graveyard from anywhere other than the battlefield, put it onto the battlefield.\nWhenever one or more creatures you control deal combat damage to a player, create a Tarmogoyf token.","power":"5","toughness":"6","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/9/19439420-9e0a-4fd1-bae9-f1c698edee1c.jpg?1783911433","artUrl":"https://cards.scryfall.io/art_crop/front/1/9/19439420-9e0a-4fd1-bae9-f1c698edee1c.jpg?1783911433","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  splendor: {"oracleId":"1099588c-cc26-4523-8bd2-90e1e1433f53","name":"Overwhelming Splendor","manaCost":"{6}{W}{W}","cmc":8,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nCreatures enchanted player controls lose all abilities and have base power and toughness 1/1.\nEnchanted player can't activate abilities that aren't mana abilities or loyalty abilities.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/867b32d2-e396-411d-ac02-1af4106dd3d2.jpg?1783936059","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/867b32d2-e396-411d-ac02-1af4106dd3d2.jpg?1783936059","commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  scythe: {"oracleId":"a500b724-bf28-47a3-b434-6efdebbcc04c","name":"Strata Scythe","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Imprint — When this Equipment enters, search your library for a land card, exile it, then shuffle.\nEquipped creature gets +1/+1 for each land on the battlefield with the same name as the exiled card.\nEquip {3}","colors":[],"colorIdentity":[],"keywords":["Equip","Imprint"],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8f2cb906-3748-4675-89b3-bde2f9a8444a.jpg?1783941696","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8f2cb906-3748-4675-89b3-bde2f9a8444a.jpg?1783941696","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  panther: {"oracleId":"48deff27-b421-430b-a484-55b4a593010a","name":"Black Panther, Wakandan King","manaCost":"{G}{W}","cmc":2,"typeLine":"Legendary Creature — Human Noble Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble","Hero"],"oracleText":"First strike\nSurvey the Realm — Whenever Black Panther or another creature you control enters, put a +1/+1 counter on target land you control.\nMine Vibranium — {3}: Move all +1/+1 counters from target land you control onto target creature. If one or more +1/+1 counters are moved this way, you gain that much life and draw a card.","power":"2","toughness":"2","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Mine Vibranium","First strike","Survey the Realm"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a93a12d-6913-4d9e-8e9c-8067147e37f2.jpg?1783909135","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a93a12d-6913-4d9e-8e9c-8067147e37f2.jpg?1783909135","commanderLegal":"legal","set":"sld","releasedAt":"2024-11-04","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  loki: {"oracleId":"c112852f-61d5-4b94-b864-c7d0b5333b29","name":"Loki, God of Mischief","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — God Sorcerer Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God","Sorcerer","Villain"],"oracleText":"Whenever a player or permanent becomes the target of an ability you control, draw a card. This ability triggers only once each turn.","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/236c437f-ee9d-4145-a4db-b665908089cf.jpg?1783902955","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/236c437f-ee9d-4145-a4db-b665908089cf.jpg?1783902955","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  brass: {"oracleId":"4df179b4-7c6b-4e63-9d7d-62f4df377989","name":"Admiral Brass, Unsinkable","manaCost":"{2}{U}{B}{R}","cmc":5,"typeLine":"Legendary Creature — Human Pirate","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Pirate"],"oracleText":"When Admiral Brass enters, mill four cards.\nAt the beginning of combat on your turn, you may return target Pirate creature card from your graveyard to the battlefield with a finality counter on it. It has base power and toughness 4/4. It gains haste until end of turn. (If a creature with a finality counter on it would die, exile it instead.)","power":"3","toughness":"3","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/4/d/4d6c2d5c-b3ce-4c38-9af2-7c61f322923b.jpg?1783913931","artUrl":"https://cards.scryfall.io/art_crop/front/4/d/4d6c2d5c-b3ce-4c38-9af2-7c61f322923b.jpg?1783913931","commanderLegal":"legal","set":"lcc","releasedAt":"2023-11-17","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  quest: {"oracleId":"434807c5-5948-4181-a46c-2c834d0a2f0b","name":"Quest for Ula's Temple","manaCost":"{U}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, you may look at the top card of your library. If it's a creature card, you may reveal it and put a quest counter on this enchantment.\nAt the beginning of each end step, if there are three or more quest counters on this enchantment, you may put a Kraken, Leviathan, Octopus, or Serpent creature card from your hand onto the battlefield.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/77983bbf-6761-4126-82b4-bdcdd6b8e1dc.jpg?1783942061","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/77983bbf-6761-4126-82b4-bdcdd6b8e1dc.jpg?1783942061","commanderLegal":"legal","set":"wwk","releasedAt":"2010-02-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  ouat: {"oracleId":"d00ade82-caab-43c6-9756-6e9e6edfc519","name":"Once Upon a Time","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"If this spell is the first spell you've cast this game, you may cast it without paying its mana cost.\nLook at the top five cards of your library. You may reveal a creature or land card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4034e5ba-9974-43e3-bde7-8d9b4586c3a4.jpg?1783932607","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4034e5ba-9974-43e3-bde7-8d9b4586c3a4.jpg?1783932607","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  wilds: {"oracleId":"e9bc324e-c200-45ef-8b9b-52a61d0f7374","name":"Hunting Wilds","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Kicker {3}{G} (You may pay an additional {3}{G} as you cast this spell.)\nSearch your library for up to two Forest cards, put them onto the battlefield tapped, then shuffle.\nIf this spell was kicked, untap all Forests put onto the battlefield this way. They become 3/3 green creatures with haste that are still lands.","colors":["G"],"colorIdentity":["G"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/4112e0d7-5451-4e3b-8c73-2d2024f45cd8.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/4112e0d7-5451-4e3b-8c73-2d2024f45cd8.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  slime: {"oracleId":"b4429e71-434e-480c-a8d1-2ad11de8b2d9","name":"Convert to Slime","manaCost":"{3}{B}{G}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy up to one target artifact, up to one target creature, and up to one target enchantment.\nDelirium — Then if there are four or more card types among cards in your graveyard, create an X/X green Ooze creature token, where X is the total mana value of permanents destroyed this way.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Delirium"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a4dfb147-10f6-49f1-b777-12125e87189b.jpg?1783909653","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a4dfb147-10f6-49f1-b777-12125e87189b.jpg?1783909653","commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  shards: {"oracleId":"8fab68ad-169d-46d3-93c4-5bdee4eea2ce","name":"Wall of Shards","manaCost":"{1}{W}","cmc":2,"typeLine":"Snow Creature — Wall","supertypes":["Snow"],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender, flying\nCumulative upkeep—An opponent gains 1 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)","power":"1","toughness":"8","colors":["W"],"colorIdentity":["W"],"keywords":["Cumulative upkeep","Flying","Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/884ee8d8-4c0d-4e44-8321-bccd18195693.jpg?1783943364","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/884ee8d8-4c0d-4e44-8321-bccd18195693.jpg?1783943364","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  swab: {"oracleId":"343ecf2f-0bbc-4840-8fb3-f5f61b26e76f","name":"Swab Goblin","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Pirate","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Pirate"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/0403b8e5-29c5-4a4a-b9e7-1e79a7452f14.jpg?1783935256","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/0403b8e5-29c5-4a4a-b9e7-1e79a7452f14.jpg?1783935256","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  pyro: {"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  visionary: {"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  elves: {"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  kraken: {"oracleId":"08e6c786-d553-4c23-9137-cfad84146739","name":"Kraken Hatchling","manaCost":"{U}","cmc":1,"typeLine":"Creature — Kraken","supertypes":[],"types":["Creature"],"subtypes":["Kraken"],"oracleText":"","power":"0","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/45d100a3-93f2-428c-8f54-8807e71f2638.jpg?1783942164","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/45d100a3-93f2-428c-8f54-8807e71f2638.jpg?1783942164","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  solring: {"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  bolt: {"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  liliana: {"oracleId":"0ba134d8-ee7d-48ec-8dc6-57942b8e9261","name":"Liliana of the Veil","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Legendary Planeswalker — Liliana","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Liliana"],"oracleText":"+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.","loyalty":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d12c8c97-6491-452c-811d-943441a7ef9f.jpg?1783921329","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d12c8c97-6491-452c-811d-943441a7ef9f.jpg?1783921329","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  bears: {"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  pacifism: {"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  forest: {"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  mountain: {"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
};

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, stopping at any question. */
const pass = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Everyone passes until the stack is empty; the bots answer every question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).name === name);
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land")).length;

describe("round 275 cards", () => {
  it("all compile fully", () => supported(C.nest, C.disa, C.splendor, C.scythe, C.panther, C.loki, C.brass, C.quest, C.ouat, C.wilds, C.slime, C.shards));
});

describe("Tarmogoyf Nest and Disa the Restless: a Tarmogoyf token is a copy of the card Tarmogoyf (rulings)", () => {
  it("the enchanted land makes a {1}{G} green Lhurgoyf named Tarmogoyf whose power counts card types in all graveyards", () => {
    const { s: s0, ap, opp } = setup([]);
    const land = named(s0, ap, "Forest")[0]!;
    const nest = putOnBattlefield(s0, ap, C.nest);
    s0.objects[nest]!.attachedTo = land;
    into(s0, ap, C.bolt, "graveyard");
    into(s0, opp, C.bears, "graveyard");
    invalidateCharacteristics(s0);
    const index = abilitiesOf(s0, s0.objects[land]!).activated.findIndex((a) => /Tarmogoyf token/.test(a.body.text));
    expect(index).toBeGreaterThanOrEqual(0);
    const s = settle(run(s0, planActivate(s0, ap, land, index)));
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(1);
    const ch = characteristics(s, s.objects[tokens[0]!]!);
    expect(ch.name).toBe("Tarmogoyf");
    expect(ch.colors).toEqual(["G"]);
    expect(ch.types).toEqual(["Creature"]);
    expect(ch.subtypes).toEqual(["Lhurgoyf"]);
    expect(ch.manaValue).toBe(2);
    // An instant and a creature card: two card types, so 2/3 (CR 604.3).
    expect(pt(s, tokens[0]!)).toBe("2/3");
    expect(s.objects[land]!.tapped).toBe(true);
  });

  it("Disa puts a Lhurgoyf permanent card put into your graveyard from your hand onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([C.goyf, C.bears]);
    putOnBattlefield(s0, ap, C.disa);
    moveObject(s0, ids[0]!, "graveyard");
    moveObject(s0, ids[1]!, "graveyard");
    closeZoneBatch(s0);
    const s = settle(s0);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.controller).toBe(ap);
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });

  it("not one put there from the battlefield; its combat damage trigger makes a Tarmogoyf token", () => {
    const { s: s0, ap } = setup([]);
    const disa = putOnBattlefield(s0, ap, C.disa);
    const goyf = putOnBattlefield(s0, ap, C.goyf);
    moveObject(s0, goyf, "graveyard");
    closeZoneBatch(s0);
    const s = settle(s0);
    expect(zone(s, goyf)).toBe("graveyard");
    const damage = abilitiesOf(s, s.objects[disa]!).triggers.find((t) => t.event === "creaturesYouControlDealCombatDamageToPlayer")!;
    expect(damage.body.effects).toMatchObject([{ type: "createToken", token: { name: "Tarmogoyf", named: true, manaCost: "{1}{G}" } }]);
  });
});

describe("Overwhelming Splendor: enchanted player can't activate abilities that aren't mana or loyalty abilities", () => {
  it("their creatures are 1/1s with no abilities; their Equipment can't be equipped; their planeswalker's loyalty abilities can", () => {
    const { s: s0, ap, opp } = setup([]);
    const splendor = putOnBattlefield(s0, ap, C.splendor);
    s0.objects[splendor]!.attachedToPlayer = opp;
    const pyro = putOnBattlefield(s0, opp, C.pyro);
    const scythe = putOnBattlefield(s0, opp, C.scythe);
    const lili = putOnBattlefield(s0, opp, C.liliana);
    s0.objects[lili]!.counters.loyalty = 3;
    const mine = putOnBattlefield(s0, ap, C.pyro);
    invalidateCharacteristics(s0);
    expect(pt(s0, pyro)).toBe("1/1");
    expect(abilitiesOf(s0, s0.objects[pyro]!).activated).toHaveLength(0);
    // Its controller isn't enchanted: their own abilities are fine.
    expect(abilityProblem(s0, ap, mine, 0)).toBeNull();
    let s = passUntil(s0, "main1", opp);
    expect(waitingOn(s)).toBe(opp);
    s.players[opp]!.manaPool.C = 3;
    expect(abilityProblem(s, opp, scythe, 0, [target(pyro)])).toMatch(/Overwhelming Splendor/);
    expect(abilityProblem(s, opp, lili, 0)).toBeNull();
    // With the Aura gone, the Equipment works again.
    moveObject(s, splendor, "graveyard");
    invalidateCharacteristics(s);
    expect(abilityProblem(s, opp, scythe, 0, [target(pyro)])).toBeNull();
    s = act(s, { type: "passPriority", player: opp });
  });

  it("a creature entering under the enchanted player's control has no enters ability to trigger (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const splendor = putOnBattlefield(s0, ap, C.splendor);
    s0.objects[splendor]!.attachedToPlayer = opp;
    const v = into(s0, opp, C.visionary, "hand");
    moveObject(s0, v, "battlefield");
    expect(s0.triggerQueue).toHaveLength(0);
    const w = into(s0, ap, C.visionary, "hand");
    moveObject(s0, w, "battlefield");
    expect(s0.triggerQueue).toHaveLength(1);
  });
});

describe("Strata Scythe: +1/+1 for each land on the battlefield with the same name as the exiled card", () => {
  it("imprints a Forest from the library; counts every Forest, anyone's, not other lands", () => {
    const { s: s0, ap, opp, ids } = setup([C.scythe]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    const exiled = s.players[ap]!.exile.filter((id) => characteristics(s, s.objects[id]!).name === "Forest");
    expect(exiled).toHaveLength(1);
    const bears = putOnBattlefield(s, ap, C.bears);
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0, [target(bears)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(bears);
    // Three Forests of ours.
    expect(pt(s, bears)).toBe("5/5");
    putOnBattlefield(s, opp, C.forest);
    putOnBattlefield(s, opp, C.mountain);
    invalidateCharacteristics(s);
    expect(pt(s, bears)).toBe("6/6");
    // The exiled card leaves exile: nothing to match any more.
    moveObject(s, exiled[0]!, "graveyard");
    invalidateCharacteristics(s);
    expect(pt(s, bears)).toBe("2/2");
  });
});

describe("Black Panther, Wakandan King: move all +1/+1 counters from a land; that much life and a card", () => {
  it("three counters move onto the creature: 3 life and a card; another kind of counter stays", () => {
    const { s: s0, ap } = setup([]);
    const panther = putOnBattlefield(s0, ap, C.panther);
    const land = named(s0, ap, "Swamp")[0]!;
    s0.objects[land]!.counters["+1/+1"] = 3;
    s0.objects[land]!.counters.charge = 2;
    const bears = putOnBattlefield(s0, ap, C.bears);
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life, hand = s0.players[ap]!.hand.length;
    const index = abilitiesOf(s0, s0.objects[panther]!).activated.findIndex((a) => /Move all/.test(a.body.text));
    const s = settle(run(s0, planActivate(s0, ap, panther, index, [target(land), target(bears)])));
    expect(s.objects[bears]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[land]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[land]!.counters.charge).toBe(2);
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("with none moved, no life and no card; bots only aim it at a land with +1/+1 counters", () => {
    const { s: s0, ap } = setup([]);
    const panther = putOnBattlefield(s0, ap, C.panther);
    const land = named(s0, ap, "Swamp")[0]!;
    const bears = putOnBattlefield(s0, ap, C.bears);
    const life = s0.players[ap]!.life, hand = s0.players[ap]!.hand.length;
    const index = abilitiesOf(s0, s0.objects[panther]!).activated.findIndex((a) => /Move all/.test(a.body.text));
    const s = settle(run(s0, planActivate(s0, ap, panther, index, [target(land), target(bears)])));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[ap]!.hand.length).toBe(hand);
    const acts = botActions(s0, ap).filter((a) => a.type === "activateAbility" && a.objectId === panther);
    expect(acts).toHaveLength(0);
  });
});

describe("Loki, God of Mischief: draw when a player or permanent becomes the target of an ability you control", () => {
  it("an activated ability of ours targeting an opponent draws a card, only once each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, C.loki);
    const a = putOnBattlefield(s0, ap, C.pyro);
    const b = putOnBattlefield(s0, ap, C.pyro);
    const bears = putOnBattlefield(s0, opp, C.bears);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, a, 0, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s = settle(run(s, planActivate(s, ap, b, 0, [target(bears)])));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("not for a spell of ours, nor an opponent's ability", () => {
    const { s: s0, ap, opp, ids } = setup([C.bolt]);
    putOnBattlefield(s0, ap, C.loki);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    const theirs = putOnBattlefield(s, opp, C.pyro);
    const e = passUntil(s, "main1", opp);
    const before = e.players[ap]!.hand.length;
    const after = settle(run(e, planActivate(e, opp, theirs, 0, [{ kind: "player", id: ap }])));
    expect(after.players[ap]!.hand.length).toBe(before);
  });
});

describe("Admiral Brass, Unsinkable: the returned Pirate has base power and toughness 4/4", () => {
  it("at the beginning of combat a Pirate card returns with a finality counter, 4/4, with haste", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, C.brass);
    const swab = into(s0, ap, C.swab, "graveyard");
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s);
    expect(zone(s, swab)).toBe("battlefield");
    expect(s.objects[swab]!.counters.finality).toBe(1);
    expect(pt(s, swab)).toBe("4/4");
    expect(characteristics(s, s.objects[swab]!).keywords).toContain("Haste");
    // Counters still apply on top of the base (rulings).
    s.objects[swab]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(pt(s, swab)).toBe("5/5");
  });
});

describe("Quest for Ula's Temple: you may reveal a creature card on top and put a quest counter on it", () => {
  it("a creature card on top: revealing puts a quest counter; the card stays on top", () => {
    const { s: s0, ap } = setup([]);
    const quest = putOnBattlefield(s0, ap, C.quest);
    let s = passUntil(s0, "end", ap);
    const kraken = into(s, ap, C.kraken, "library");
    s = passUntil(s, "upkeep", ap);
    s = pass(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = pass(s);
    expect(s.objects[quest]!.counters.quest).toBe(1);
    expect(s.players[ap]!.library[0]).toBe(kraken);
  });

  it("a land on top: nothing to reveal, no question", () => {
    const { s: s0, ap } = setup([]);
    const quest = putOnBattlefield(s0, ap, C.quest);
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    s = pass(s);
    expect(s.pending).toBeNull();
    expect(s.objects[quest]!.counters.quest ?? 0).toBe(0);
  });
});

describe("Once Upon a Time: free if it's the first spell you've cast this game", () => {
  it("cast free as the first spell; not once another spell was cast", () => {
    const { s: s0, ap, ids } = setup([C.ouat, C.bolt, C.ouat]);
    const lands = untapped(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "alternative" })));
    expect(untapped(s, ap)).toBe(lands);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(castProblem(s, ap, ids[2]!, undefined, undefined, undefined, undefined, undefined, { alt: "alternative" })).toBeTruthy();
    const { s: s1, ap: ap1, opp, ids: ids1 } = setup([C.bolt, C.ouat]);
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!, [{ kind: "player", id: opp }])));
    expect(planCast(s, ap1, ids1[1]!, undefined, undefined, undefined, undefined, { alt: "alternative" })).toBeNull();
    expect(planCast(s, ap1, ids1[1]!)).not.toBeNull();
  });
});

describe("Hunting Wilds: kicked, the Forests found become 3/3 green creatures with haste that are still lands", () => {
  it("kicked: two Forests found enter tapped, then untap and become 3/3 haste creature lands for good", () => {
    const { s: s0, ap, ids } = setup([C.wilds]);
    const before = named(s0, ap, "Forest");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0] })));
    const found = named(s, ap, "Forest").filter((id) => !before.includes(id));
    expect(found).toHaveLength(2);
    for (const id of found) {
      const ch = characteristics(s, s.objects[id]!);
      expect(s.objects[id]!.tapped).toBe(false);
      expect(ch.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(ch.subtypes).toContain("Forest");
      expect(ch.colors).toEqual(["G"]);
      expect(ch.keywords).toContain("Haste");
      expect(pt(s, id)).toBe("3/3");
    }
    // The old Forests are untouched.
    for (const id of before) expect(characteristics(s, s.objects[id]!).types).not.toContain("Creature");
  });

  it("not kicked: they stay tapped lands", () => {
    const { s: s0, ap, ids } = setup([C.wilds]);
    const before = named(s0, ap, "Forest");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const found = named(s, ap, "Forest").filter((id) => !before.includes(id));
    expect(found).toHaveLength(2);
    for (const id of found) {
      expect(s.objects[id]!.tapped).toBe(true);
      expect(characteristics(s, s.objects[id]!).types).not.toContain("Creature");
    }
  });
});

describe("Convert to Slime: an X/X Ooze, X the total mana value of the permanents destroyed (delirium)", () => {
  it("with four card types in your graveyard: an artifact (1), a creature (2) and an enchantment (1) make a 4/4", () => {
    const { s: s0, ap, opp, ids } = setup([C.slime]);
    const ring = putOnBattlefield(s0, opp, C.solring);
    const bears = putOnBattlefield(s0, opp, C.bears);
    const quest = putOnBattlefield(s0, opp, C.quest);
    for (const d of [C.bolt, C.bears, C.forest, C.wilds]) into(s0, ap, d, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(ring), target(bears), target(quest)])));
    for (const id of [ring, bears, quest]) expect(zone(s, id)).toBe("graveyard");
    const oozes = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Ooze"));
    expect(oozes).toHaveLength(1);
    expect(pt(s, oozes[0]!)).toBe("4/4");
  });

  it("without delirium, no Ooze", () => {
    const { s: s0, ap, opp, ids } = setup([C.slime]);
    const bears = putOnBattlefield(s0, opp, C.bears);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "none" }, target(bears), { kind: "none" }])));
    expect(zone(s, bears)).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(0);
  });
});

describe("Wall of Shards: cumulative upkeep—an opponent gains 1 life, one chosen for each age counter (rulings)", () => {
  const toUpkeep = (s0: GameState, ap: PlayerId) => {
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    return pass(s);
  };

  it("paid: an opponent chosen for each age counter gains 1 life; the same one can be chosen twice", () => {
    const { s: s0, ap } = setup([]);
    const wall = putOnBattlefield(s0, ap, C.shards);
    s0.objects[wall]!.counters.age = 2;
    let s = toUpkeep(s0, ap);
    expect(s.objects[wall]!.counters.age).toBe(3);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, keep: true });
    const opps = s.turnOrder.filter((p) => p !== ap);
    const life = Object.fromEntries(opps.map((p) => [p, s.players[p]!.life]));
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (const pick of [opps[0]!, opps[0]!, opps[2]!]) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "giveLife" });
      s = act(s, { type: "chooseOption", player: ap, choice: String(pick) });
    }
    s = pass(s);
    expect(zone(s, wall)).toBe("battlefield");
    expect(s.players[opps[0]!]!.life).toBe(life[opps[0]!]! + 2);
    expect(s.players[opps[1]!]!.life).toBe(life[opps[1]!]);
    expect(s.players[opps[2]!]!.life).toBe(life[opps[2]!]! + 1);
  });

  it("not paid: it's sacrificed; bots keep it while the total is small", () => {
    const { s: s0, ap } = setup([]);
    const wall = putOnBattlefield(s0, ap, C.shards);
    let s = toUpkeep(s0, ap);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = pass(s);
    expect(zone(s, wall)).toBe("graveyard");
    const { s: s1, ap: ap1 } = setup([]);
    const wall1 = putOnBattlefield(s1, ap1, C.shards);
    const t = settle(toUpkeep(s1, ap1));
    expect(zone(t, wall1)).toBe("battlefield");
    const opps = t.turnOrder.filter((p) => p !== ap1);
    expect(opps.reduce((n, p) => n + t.players[p]!.life, 0)).toBe(opps.reduce((n, p) => n + s1.players[p]!.life, 0) + 1);
  });
});

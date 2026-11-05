// Round 274, from the top of the popularity list: Oft-Nabbed Goat ("Only your opponents may activate this ability and
// only as a sorcery", "Gain control of ~", "its owner draws that many cards and each other player loses that much
// life"), Sliver Gravemother (encore {X} for Sliver creature cards, CR 702.141a), Aminatou, Veil Piercer (miracle for
// enchantment cards, "its mana cost reduced by {4}", CR 702.94a, 601.2f), Fractured Powerstone (the planar die outside
// Planechase, rulings), Herigast, Erupting Nullkite (granted emerge, CR 702.119a; "you may exile your hand. If you do,
// draw three cards") and Sanctum of All ("triggers while you control six or more Shrines", CR 603.2d).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, activationCost, abilitiesOf, altCostsFor, botActions, castProblem, characteristics, controllerOf, draw, invalidateCharacteristics, isFullySupported, madnessCastOf, manaValue, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const C = {
  goat: {"oracleId":"63193ad4-bbd2-4cc3-98e2-9f6b985e8ae7","name":"Oft-Nabbed Goat","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Goat","supertypes":[],"types":["Creature"],"subtypes":["Goat"],"oracleText":"{1}: Draw a card. Gain control of this creature and put a -1/-1 counter on it. Only your opponents may activate this ability and only as a sorcery.\nWhen this creature dies, if it had one or more -1/-1 counters on it, its owner draws that many cards and each other player loses that much life.","power":"0","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4030bfab-867c-4724-904e-3e8b631f075e.jpg?1783904605","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4030bfab-867c-4724-904e-3e8b631f075e.jpg?1783904605","commanderLegal":"legal","set":"ecc","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  gravemother: {"oracleId":"0d59f010-9669-4ad2-9ae9-cd88b85f282c","name":"Sliver Gravemother","manaCost":"{W}{U}{B}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Sliver","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"The \"legend rule\" doesn't apply to Slivers you control.\nEach Sliver creature card in your graveyard has encore {X}, where X is its mana value.\nEncore {5} ({5}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)","power":"6","toughness":"6","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Encore"],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e899ba84-d940-468a-8f18-5282b51b797e.jpg?1783915465","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e899ba84-d940-468a-8f18-5282b51b797e.jpg?1783915465","commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  muscle: {"oracleId":"06e0459f-d691-4470-884a-27c09b6612d2","name":"Muscle Sliver","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"All Sliver creatures get +1/+1.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/602a1e1f-4195-48c0-8290-562e7e0db6d8.jpg?1783946616","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/602a1e1f-4195-48c0-8290-562e7e0db6d8.jpg?1783946616","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  aminatou: {"oracleId":"bf45f5ee-4d5f-4920-b612-b5492c2f035d","name":"Aminatou, Veil Piercer","manaCost":"{1}{W}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of your upkeep, surveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\nEach enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {4}. (You may cast a card for its miracle cost when you draw it if it's the first card you drew this turn.)","power":"2","toughness":"4","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Surveil"],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f868023-6035-403d-ba91-7a4840c6c392.jpg?1783909663","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f868023-6035-403d-ba91-7a4840c6c392.jpg?1783909663","commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  tithe: {"oracleId":"153376c9-dffd-458c-8ce3-a4c8269bc4e9","name":"Smothering Tithe","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")","colors":["W"],"colorIdentity":["W"],"keywords":["Treasure"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/7/a/7af082fa-86a3-4f7b-966d-2be1f1d0c0bc.jpg?1783933717","artUrl":"https://cards.scryfall.io/art_crop/front/7/a/7af082fa-86a3-4f7b-966d-2be1f1d0c0bc.jpg?1783933717","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"rare","layout":"normal","gameChanger":true} as CardDef,
  pacifism: {"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  powerstone: {"oracleId":"af4f192a-9565-4377-b359-835fe4396e85","name":"Fractured Powerstone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{T}: Roll the planar die. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b18bdf58-99b7-4307-b6a5-186ff1594fbb.jpg?1783940590","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b18bdf58-99b7-4307-b6a5-186ff1594fbb.jpg?1783940590","commanderLegal":"legal","set":"pc2","releasedAt":"2012-06-01","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  herigast: {"oracleId":"76243b38-cab1-465f-aa7d-5bc617541753","name":"Herigast, Erupting Nullkite","manaCost":"{9}","cmc":9,"typeLine":"Legendary Creature — Eldrazi Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Eldrazi","Dragon"],"oracleText":"Emerge {6}{R}{R} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, you may exile your hand. If you do, draw three cards.\nFlying\nEach creature spell you cast has emerge. The emerge cost is equal to its mana cost.","power":"6","toughness":"6","colors":[],"colorIdentity":["R"],"keywords":["Flying","Emerge"],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7baf9549-1869-4bd3-a52a-2f0b30ba0b16.jpg?1783911309","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7baf9549-1869-4bd3-a52a-2f0b30ba0b16.jpg?1783911309","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  giant: {"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  bears: {"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  fiend: {"oracleId":"4eafe717-4ba4-4901-8c67-11757230eb54","name":"Elder Deep-Fiend","manaCost":"{8}","cmc":8,"typeLine":"Creature — Eldrazi Octopus","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi","Octopus"],"oracleText":"Flash\nEmerge {5}{U}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, tap up to four target permanents.","power":"5","toughness":"6","colors":[],"colorIdentity":["U"],"keywords":["Emerge","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3c2789fb-a263-4207-8a56-4eeb015a024c.jpg?1783937526","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3c2789fb-a263-4207-8a56-4eeb015a024c.jpg?1783937526","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  sanctum: {"oracleId":"63f60dfc-2bc4-411f-ae53-504156fe0102","name":"Sanctum of All","manaCost":"{W}{U}{B}{R}{G}","cmc":5,"typeLine":"Legendary Enchantment — Shrine","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":["Shrine"],"oracleText":"At the beginning of your upkeep, you may search your library and/or graveyard for a Shrine card and put it onto the battlefield. If you search your library this way, shuffle.\nIf a triggered ability of another Shrine you control triggers while you control six or more Shrines, that ability triggers an additional time.","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/ba91338c-1f6c-4b83-851f-98c3e9dea17b.jpg?1783930660","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/ba91338c-1f6c-4b83-851f-98c3e9dea17b.jpg?1783930660","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  cleansing: {"oracleId":"15ee7e1d-b13e-4fd0-bc41-345b6ed34f53","name":"Honden of Cleansing Fire","manaCost":"{3}{W}","cmc":4,"typeLine":"Legendary Enchantment — Shrine","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":["Shrine"],"oracleText":"At the beginning of your upkeep, you gain 2 life for each Shrine you control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/463f598a-7de0-4691-a61a-fe24c29f9e1b.jpg?1783944339","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/463f598a-7de0-4691-a61a-fe24c29f9e1b.jpg?1783944339","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  tranquil: {"oracleId":"1818b0b1-0104-4673-9be8-acfc773ef87d","name":"Sanctum of Tranquil Light","manaCost":"{W}","cmc":1,"typeLine":"Legendary Enchantment — Shrine","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":["Shrine"],"oracleText":"{5}{W}: Tap target creature. This ability costs {1} less to activate for each Shrine you control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/34a5478a-1a2c-4117-b543-da083ed2b562.jpg?1783930735","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/34a5478a-1a2c-4117-b543-da083ed2b562.jpg?1783930735","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  shattered: {"oracleId":"5e39d311-efb5-4f51-82cd-e8079e32907a","name":"Sanctum of Shattered Heights","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Enchantment — Shrine","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":["Shrine"],"oracleText":"{1}, Discard a land card or Shrine card: Sanctum of Shattered Heights deals X damage to target creature or planeswalker, where X is the number of Shrines you control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/482ae7f4-3950-4766-8392-eea753e29426.jpg?1783930686","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/482ae7f4-3950-4766-8392-eea753e29426.jpg?1783930686","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  fangs: {"oracleId":"a1d8fcb9-26b2-4d09-9db7-e644294749f8","name":"Sanctum of Stone Fangs","manaCost":"{1}{B}","cmc":2,"typeLine":"Legendary Enchantment — Shrine","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":["Shrine"],"oracleText":"At the beginning of your first main phase, each opponent loses X life and you gain X life, where X is the number of Shrines you control.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d1439412-618c-483d-89b9-5ea37f0f1edc.jpg?1783930700","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d1439412-618c-483d-89b9-5ea37f0f1edc.jpg?1783930700","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  wisdom: {"oracleId":"f6a2092a-093e-4cd6-9eb0-d8ed32da896c","name":"Go-Shintai of Lost Wisdom","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Enchantment Creature — Shrine","supertypes":["Legendary"],"types":["Enchantment","Creature"],"subtypes":["Shrine"],"oracleText":"Flying\nAt the beginning of your end step, you may pay {1}. When you do, target player mills X cards, where X is the number of Shrines you control. (To mill a card, a player puts the top card of their library into their graveyard.)","power":"0","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/7/e/7ec1192c-25b8-4975-ae6c-86be28ac1840.jpg?1783923903","artUrl":"https://cards.scryfall.io/art_crop/front/7/e/7ec1192c-25b8-4975-ae6c-86be28ac1840.jpg?1783923903","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  molecule: {"oracleId":"ba944437-0b55-47cb-92dc-2477ce6726c3","name":"Molecule Man","manaCost":"{6}","cmc":6,"typeLine":"Legendary Creature — Human Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Villain"],"oracleText":"Nonland cards in your hand have miracle {0}. (You may cast a card for its miracle cost when you draw it if it's the first card you drew this turn.)","power":"5","toughness":"5","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee64d0dd-e3d8-4abc-b9d6-b19c505fbfa1.jpg?1783903300","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee64d0dd-e3d8-4abc-b9d6-b19c505fbfa1.jpg?1783903300","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  aspirant: {"oracleId":"644c785d-3061-44bc-9f78-bc939c565bf4","name":"Bladegraft Aspirant","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Phyrexian Warrior","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Warrior"],"oracleText":"Menace\nEquipment spells you cast cost {1} less to cast.\nActivated abilities of Equipment you control that target this creature cost {1} less to activate.","power":"2","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/2/d/2d6cf933-73fe-4e79-8d0b-29dc0f18b25d.jpg?1783918035","artUrl":"https://cards.scryfall.io/art_crop/front/2/d/2d6cf933-73fe-4e79-8d0b-29dc0f18b25d.jpg?1783918035","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  morningstar: {"oracleId":"12a8adc4-927f-4314-b2ef-9c647ace68d5","name":"Vulshok Morningstar","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+2.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/acf00de0-af24-4ef9-8ac2-135e6b53a8fd.jpg?1783944415","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/acf00de0-af24-4ef9-8ac2-135e6b53a8fd.jpg?1783944415","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  divination: {"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  forest: {"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  vortex: {"oracleId":"5383a1c1-662f-46fe-a0e5-0f38efe1a37a","name":"Detention Vortex","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant nonland permanent\nEnchanted permanent can't attack or block, and its activated abilities can't be activated.\n{3}: Destroy this Aura. Only your opponents may activate this ability and only as a sorcery.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/54ebe581-be17-415a-a160-28d8f4e95636.jpg?1783927393","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/54ebe581-be17-415a-a160-28d8f4e95636.jpg?1783927393","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  dregscape: {"oracleId":"d1678eed-a335-454c-9fa1-749317500a36","name":"Dregscape Sliver","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"Each Sliver creature card in your graveyard has unearth {2}.\nUnearth {2} ({2}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Unearth"],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a835b7e-cd63-486d-8b58-2f443f686e32.jpg?1783933129","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a835b7e-cd63-486d-8b58-2f443f686e32.jpg?1783933129","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
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
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]?.types.includes("Land")).length;
const total = (c: { cost: Parameters<typeof manaValue>[0]; extra: number }) => manaValue(c.cost) + c.extra;

describe("round 274 cards", () => {
  it("all compile fully", () => supported(C.goat, C.gravemother, C.aminatou, C.powerstone, C.herigast, C.sanctum, C.molecule, C.aspirant, C.vortex, C.dregscape));
});

describe("Oft-Nabbed Goat: only your opponents may activate it, and only as a sorcery", () => {
  it("an opponent pays {1}: they draw a card, gain control of it and put a -1/-1 counter on it", () => {
    const { s: s0, ap, opp } = setup([]);
    const goat = putOnBattlefield(s0, opp, C.goat);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, goat, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(controllerOf(s, s.objects[goat]!)).toBe(ap);
    expect(s.objects[goat]!.counters["-1/-1"]).toBe(1);
    // Now its controller can't activate it, but the owner (an opponent now) could on their own turn.
    expect(planActivate(s, ap, goat, 0)).toBeNull();
    expect(abilityProblem(s, ap, goat, 0)).toMatch(/opponents/);
  });

  it("its controller can't activate it; an opponent can't outside their own main phase (sorcery timing, CR 602.5d)", () => {
    const { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, C.goat);
    expect(planActivate(s, ap, mine, 0)).toBeNull();
    // The active player (an opponent of the Goat's controller) in their end step: not as a sorcery.
    const theirs = putOnBattlefield(s, opp, C.goat);
    const e = passUntil(s, "end", ap);
    expect(waitingOn(e)).toBe(ap);
    e.players[ap]!.manaPool.C = 1;
    expect(abilityProblem(e, ap, theirs, 0)).toMatch(/sorcery/);
  });

  it("when it dies with -1/-1 counters, its owner draws that many and each other player loses that much life", () => {
    const { s: s0, ap, opp } = setup([]);
    const goat = putOnBattlefield(s0, opp, C.goat);
    s0.objects[goat]!.counters["-1/-1"] = 4;
    invalidateCharacteristics(s0);
    const others = s0.turnOrder.filter((p) => p !== opp);
    const life = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.life]));
    const oppHand = s0.players[opp]!.hand.length, apHand = s0.players[ap]!.hand.length;
    // Its fifth counter makes it 0/0 under ap's control: it dies (CR 704.5f), and its owner (opp) draws five.
    const s = settle(run(s0, planActivate(s0, ap, goat, 0)));
    expect(zone(s, goat)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(oppHand + 5);
    expect(s.players[ap]!.hand.length).toBe(apHand + 1);
    expect(s.players[opp]!.life).toBe(life[opp]);
    for (const p of others) expect(s.players[p]!.life).toBe(life[p]! - 5);
  });

  it("with no -1/-1 counters, its dying does nothing", () => {
    const { s: s0, opp } = setup([]);
    const goat = putOnBattlefield(s0, opp, C.goat);
    s0.objects[goat]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const life = s0.players[s0.activePlayer]!.life, hand = s0.players[opp]!.hand.length;
    s0.triggerQueue.length = 0;
    // Destroyed by a state-based check after its toughness is set to 0 with damage.
    s0.objects[goat]!.damage = 10;
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    s = settle(s);
    expect(zone(s, goat)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(hand);
    expect(s.players[s.activePlayer]!.life).toBe(life);
  });
});

describe("Sliver Gravemother: each Sliver creature card in your graveyard has encore {X}, X its mana value", () => {
  it("a Sliver creature card encores for {2}; a non-Sliver doesn't; not without Gravemother", () => {
    const { s: s0, ap } = setup([]);
    const mother = putOnBattlefield(s0, ap, C.gravemother);
    const sliver = into(s0, ap, C.muscle, "graveyard");
    const bears = into(s0, ap, C.bears, "graveyard");
    expect(planActivate(s0, ap, bears, 0)).toBeNull();
    const before = untapped(s0, ap);
    const s = settle(run(s0, planActivate(s0, ap, sliver, 0)));
    expect(zone(s, sliver)).toBe("exile");
    expect(untapped(s, ap)).toBe(before - 2);
    // One token copy for each opponent (three), attacking that opponent this turn if able.
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(3);
    for (const id of tokens) expect(characteristics(s, s.objects[id]!).name).toBe("Muscle Sliver");
    const { s: s1, ap: ap1 } = setup([]);
    const lone = into(s1, ap1, C.muscle, "graveyard");
    expect(planActivate(s1, ap1, lone, 0)).toBeNull();
    expect(mother).toBeTruthy();
  });
});

describe("Aminatou, Veil Piercer: each enchantment card in your hand has miracle, its mana cost reduced by {4}", () => {
  const drawFirst = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = into(s, pid, def, "library");
    s.players[pid]!.draws = undefined;
    draw(s, pid, 1);
    return id;
  };

  it("Smothering Tithe ({3}{W}) drawn first this turn may be cast for {W}", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, C.aminatou);
    const t = drawFirst(s0, ap, C.tithe);
    expect(s0.triggerQueue).toHaveLength(1);
    let s = pass(s0);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: t, how: "miracle", miracleCost: "{W}" });
    expect(madnessCastOf(s, ap, t)).toBe("{W}");
    const before = untapped(s, ap);
    s = settle(run(s, planCast(s, ap, t)));
    expect(zone(s, t)).toBe("battlefield");
    expect(untapped(s, ap)).toBe(before - 1);
  });

  it("only generic mana comes off: Pacifism ({1}{W}) for {W}; not for a creature card or a second draw", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, C.aminatou);
    const p = drawFirst(s0, ap, C.pacifism);
    const s = pass(s0);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: p, how: "miracle", miracleCost: "{W}" });
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, C.aminatou);
    drawFirst(s1, ap1, C.bears);
    expect(s1.triggerQueue).toHaveLength(0);
    into(s1, ap1, C.tithe, "library");
    draw(s1, ap1, 1);
    expect(s1.triggerQueue).toHaveLength(0);
  });
});

describe("Fractured Powerstone: rolling the planar die does nothing outside Planechase (rulings)", () => {
  it("it taps for {C}; its planar die ability can be activated as a sorcery and has no effect; bots leave it", () => {
    const { s: s0, ap } = setup([]);
    const stone = putOnBattlefield(s0, ap, C.powerstone);
    const life = s0.turnOrder.map((p) => s0.players[p]!.life);
    const s = settle(run(s0, planActivate(s0, ap, stone, 0)));
    expect(s.objects[stone]!.tapped).toBe(true);
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(life);
    expect(s.log.some((l) => /planar die does nothing/.test(l.text ?? String(l)))).toBe(true);
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, C.powerstone);
    expect(botActions(s1, ap1).some((a) => a.type === "activateAbility")).toBe(false);
  });
});

describe("Herigast, Erupting Nullkite", () => {
  it("each creature spell you cast has emerge for its mana cost: Hill Giant sacrificing Grizzly Bears costs {1}{R}", () => {
    const { s: s0, ap, ids } = setup([C.giant]);
    putOnBattlefield(s0, ap, C.herigast);
    const bears = putOnBattlefield(s0, ap, C.bears);
    const giant = ids[0]!;
    expect(altCostsFor(s0, ap, s0.objects[giant]!).some((a) => a.kind === "grantedEmerge")).toBe(true);
    const how = { alt: "grantedEmerge" as const, sacrifice: [bears] };
    expect(total(spellCost(s0, ap, s0.objects[giant]!, 0, [], how))).toBe(2);
    const before = untapped(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, giant, undefined, undefined, "auto", undefined, how)));
    expect(zone(s, giant)).toBe("battlefield");
    expect(zone(s, bears)).toBe("graveyard");
    // Two lands for {1}{R}.
    expect(untapped(s, ap)).toBe(before - 2);
  });

  it("no emerge without Herigast, or for a noncreature spell, or under an opponent's Herigast", () => {
    const { s, ap, opp, ids } = setup([C.giant, C.tithe]);
    putOnBattlefield(s, ap, C.bears);
    expect(altCostsFor(s, ap, s.objects[ids[0]!]!).some((a) => a.kind === "grantedEmerge")).toBe(false);
    putOnBattlefield(s, opp, C.herigast);
    expect(altCostsFor(s, ap, s.objects[ids[0]!]!).some((a) => a.kind === "grantedEmerge")).toBe(false);
    putOnBattlefield(s, ap, C.herigast);
    expect(altCostsFor(s, ap, s.objects[ids[1]!]!).some((a) => a.kind === "grantedEmerge")).toBe(false);
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { alt: "grantedEmerge" })).toBeTruthy();
  });

  it("a spell with its own emerge has both, and either may be paid (rulings)", () => {
    const { s, ap, ids } = setup([C.fiend]);
    putOnBattlefield(s, ap, C.herigast);
    const bears = putOnBattlefield(s, ap, C.bears);
    const kinds = altCostsFor(s, ap, s.objects[ids[0]!]!).map((a) => a.kind);
    expect(kinds).toContain("emerge");
    expect(kinds).toContain("grantedEmerge");
    // Its own {5}{U}{U} less 2, or its mana cost {8} less 2.
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!, 0, [], { alt: "emerge", sacrifice: [bears] }))).toBe(5);
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!, 0, [], { alt: "grantedEmerge", sacrifice: [bears] }))).toBe(6);
  });

  it("when you cast Herigast, you may exile your hand; if you do, draw three cards, even with an empty hand (rulings)", () => {
    const { s: s0, ap, ids } = setup([C.herigast, C.bears, C.giant]);
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((id) => ids.includes(id));
    s0.players[ap]!.manaPool.C = 9;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(zone(s, ids[1]!)).toBe("exile");
    expect(zone(s, ids[2]!)).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(zone(s, ids[0]!)).toBe("battlefield");

    const { s: e0, ap: eap, ids: eids } = setup([C.herigast]);
    e0.players[eap]!.hand = [...eids];
    e0.players[eap]!.manaPool.C = 9;
    let e = run(e0, planCast(e0, eap, eids[0]!));
    for (let i = 0; i < 50 && e.pending?.kind !== "chooseMay"; i++) e = act(e, { type: "passPriority", player: waitingOn(e)! });
    expect(e.players[eap]!.hand.length).toBe(0);
    e = settle(act(e, { type: "chooseMay", player: eap, yes: true }));
    expect(e.players[eap]!.hand.length).toBe(3);
  });
});

describe("Sanctum of All: another Shrine's triggered abilities trigger an additional time with six or more Shrines", () => {
  /** The Shrines under the next player's control, at the beginning of that player's upkeep. */
  const upkeep = (shrines: CardDef[]) => {
    const { s: s0, opp } = setup([]);
    putOnBattlefield(s0, opp, C.sanctum);
    for (const d of shrines) putOnBattlefield(s0, opp, d);
    const s = passUntil(s0, "upkeep", opp);
    return { s, ap: opp, life: s.players[opp]!.life };
  };
  const hondens = (s: GameState) =>
    s.triggerQueue.filter((t) => s.cards[s.objects[t.sourceId]!.cardId]?.name === "Honden of Cleansing Fire").length +
    s.stack.filter((x) => x.sourceId !== undefined && s.cards[s.objects[x.sourceId]!.cardId]?.name === "Honden of Cleansing Fire").length;

  it("six Shrines: Honden of Cleansing Fire triggers twice (twelve life each time); five: once", () => {
    const six = upkeep([C.cleansing, C.tranquil, C.shattered, C.fangs, C.wisdom]);
    expect(hondens(six.s)).toBe(2);
    const t = settle(six.s);
    expect(t.players[six.ap]!.life).toBe(six.life + 24);

    const five = upkeep([C.cleansing, C.tranquil, C.shattered, C.fangs]);
    expect(hondens(five.s)).toBe(1);
    const u = settle(five.s);
    expect(u.players[five.ap]!.life).toBe(five.life + 10);
  });
});

describe("Molecule Man: nonland cards in your hand have miracle {0}", () => {
  const drawFirst = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = into(s, pid, def, "library");
    s.players[pid]!.draws = undefined;
    draw(s, pid, 1);
    return id;
  };

  it("Divination drawn first this turn may be cast for {0}; a land isn't revealed", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, C.molecule);
    const d = drawFirst(s0, ap, C.divination);
    let s = pass(s0);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: d, how: "miracle", miracleCost: "{0}" });
    const before = untapped(s, ap), hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, d)));
    expect(zone(s, d)).toBe("graveyard");
    expect(untapped(s, ap)).toBe(before);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, C.molecule);
    drawFirst(s1, ap1, C.forest);
    expect(s1.triggerQueue).toHaveLength(0);
  });
});

describe("Bladegraft Aspirant: activated abilities of Equipment you control that target it cost {1} less", () => {
  it("equip {2} targeting the Aspirant costs {1}; targeting another creature, {2}; an opponent's Aspirant doesn't help", () => {
    const { s, ap, opp } = setup([]);
    const aspirant = putOnBattlefield(s, ap, C.aspirant);
    const bears = putOnBattlefield(s, ap, C.bears);
    const star = putOnBattlefield(s, ap, C.morningstar);
    const equip = abilitiesOf(s, s.objects[star]!).activated.findIndex((a) => a.equip);
    const ab = abilitiesOf(s, s.objects[star]!).activated[equip]!;
    expect(manaValue(activationCost(s, ap, s.objects[star]!, ab, [{ kind: "object", id: aspirant }]))).toBe(1);
    expect(manaValue(activationCost(s, ap, s.objects[star]!, ab, [{ kind: "object", id: bears }]))).toBe(2);
    const t = settle(run(s, planActivate(s, ap, star, equip, [{ kind: "object", id: aspirant }])));
    expect(t.objects[star]!.attachedTo).toBe(aspirant);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    putOnBattlefield(s1, opp1, C.aspirant);
    const b1 = putOnBattlefield(s1, ap1, C.bears);
    const st1 = putOnBattlefield(s1, ap1, C.morningstar);
    expect(manaValue(activationCost(s1, ap1, s1.objects[st1]!, abilitiesOf(s1, s1.objects[st1]!).activated[equip]!, [{ kind: "object", id: b1 }]))).toBe(2);
    expect(opp).toBeDefined();
  });
});

describe("cards the same lines brought along", () => {
  it("Detention Vortex: only an opponent may destroy it for {3}, as a sorcery", () => {
    const { s, ap, opp } = setup([]);
    const bears = putOnBattlefield(s, opp, C.bears);
    const vortex = putOnBattlefield(s, opp, C.vortex);
    s.objects[vortex]!.attachedTo = bears;
    invalidateCharacteristics(s);
    expect(planActivate(s, opp, vortex, 0)).toBeNull();
    const t = settle(run(s, planActivate(s, ap, vortex, 0)));
    expect(zone(t, vortex)).toBe("graveyard");
  });

  it("Dregscape Sliver: another Sliver creature card in your graveyard unearths for {2}", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, C.dregscape);
    const sliver = into(s0, ap, C.muscle, "graveyard");
    const bears = into(s0, ap, C.bears, "graveyard");
    expect(planActivate(s0, ap, bears, 0)).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, sliver, 0)));
    expect(zone(s, sliver)).toBe("battlefield");
  });
});

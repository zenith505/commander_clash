// Round 277, from the top of the popularity list's skipped cards: Rampaging War Mammoth and Webstrike Elite ("When you cycle this card, destroy
// up to X target artifacts", the X of its cycling cost, rulings), Tithe (a second Plains if target opponent controls more
// lands, counted as it resolves, rulings), March of Progress (a token copy of target artifact creature you control, or of
// each one overloaded, CR 702.96), Display of Power (copy any number of target instant and/or sorcery spells, one copy of
// each, rulings; "This spell can't be copied"), Omnath, Locus of All (look at the top card; reveal it if it has three or
// more colored mana symbols for three mana of its colors; it goes to your hand either way), Detention Sphere (exile target
// nonland permanent not named Detention Sphere and all other permanents with its name, returned when it leaves), Benevolent
// Blessing (protection that doesn't remove your Auras and Equipment already attached, CR 702.16p), Quakebringer (its
// upkeep ability triggers from the graveyard only while you control a Giant, CR 603.2), Druidic Satchel (three checks of
// the revealed card, rulings: Dryad Arbor does two) and Manabond (put all land cards from your hand onto the battlefield,
// then discard your hand, rulings).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const C = {
  mammoth: {"oracleId":"05e910aa-cf84-468c-8a48-256588cbbf08","name":"Rampaging War Mammoth","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Creature — Elephant","supertypes":[],"types":["Creature"],"subtypes":["Elephant"],"oracleText":"Trample\nCycling {X}{2}{R} ({X}{2}{R}, Discard this card: Draw a card.)\nWhen you cycle this card, destroy up to X target artifacts.","power":"9","toughness":"7","colors":["R"],"colorIdentity":["R"],"keywords":["Trample","Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/02ce7345-6a4b-4927-8d34-1c6fba6d5759.jpg?1783915992","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/02ce7345-6a4b-4927-8d34-1c6fba6d5759.jpg?1783915992","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  webstrike: {"oracleId":"48a1d55e-0b71-4724-ab2a-6d2c87e86b5b","name":"Webstrike Elite","manaCost":"{G}{G}","cmc":2,"typeLine":"Creature — Insect Archer","supertypes":[],"types":["Creature"],"subtypes":["Insect","Archer"],"oracleText":"Reach\nCycling {X}{G}{G} ({X}{G}{G}, Discard this card: Draw a card.)\nWhen you cycle this card, destroy up to one target artifact or enchantment with mana value X.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Reach","Cycling"],"commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  tithe: {"oracleId":"318304f5-0929-4cd3-97e6-08ac1ac48aa6","name":"Tithe","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Search your library for a Plains card. If target opponent controls more lands than you, you may search your library for an additional Plains card. Reveal those cards, put them into your hand, then shuffle.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/a/aae08938-e563-4322-b2eb-db81913ea730.jpg?1783947003","artUrl":"https://cards.scryfall.io/art_crop/front/a/a/aae08938-e563-4322-b2eb-db81913ea730.jpg?1783947003","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  march: {"oracleId":"dd45c284-c34c-4085-8066-dbeee223fb6e","name":"March of Progress","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose target artifact creature you control. For each creature chosen this way, create a token that's a copy of it.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change its text by replacing all instances of \"target\" with \"each.\")","colors":["U"],"colorIdentity":["U"],"keywords":["Overload"],"imageUrl":"https://cards.scryfall.io/normal/front/3/e/3e26cae1-64d9-43a2-9a86-55f9b69905ca.jpg?1783919703","artUrl":"https://cards.scryfall.io/art_crop/front/3/e/3e26cae1-64d9-43a2-9a86-55f9b69905ca.jpg?1783919703","commanderLegal":"legal","set":"brc","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  display: {"oracleId":"99140891-face-4015-aacd-1309e87d8f9f","name":"Display of Power","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell can't be copied.\nCopy any number of target instant and/or sorcery spells. You may choose new targets for the copies.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/295b8595-5b4e-4fc8-8249-486d36e15f67.jpg?1783916288","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/295b8595-5b4e-4fc8-8249-486d36e15f67.jpg?1783916288","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  omnath: {"oracleId":"26445dc7-8363-4205-aee8-1cafeb4ba4c0","name":"Omnath, Locus of All","manaCost":"{W}{U}{B/P}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Phyrexian Elemental","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Phyrexian","Elemental"],"oracleText":"If you would lose unspent mana, that mana becomes black instead.\nAt the beginning of your first main phase, look at the top card of your library. You may reveal that card if it has three or more colored mana symbols in its mana cost. If you do, add three mana in any combination of its colors and put it into your hand. If you don't reveal it, put it into your hand.","power":"4","toughness":"4","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/33d94ecf-758b-4f68-a7be-6bf3ff1047f4.jpg?1783916940","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/33d94ecf-758b-4f68-a7be-6bf3ff1047f4.jpg?1783916940","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  sphere: {"oracleId":"0a0b376d-7824-4ba5-8bc9-bc0be12800c5","name":"Detention Sphere","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, you may exile target nonland permanent not named Detention Sphere and all other permanents with the same name as that permanent.\nWhen this enchantment leaves the battlefield, return the exiled cards to the battlefield under their owner's control.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bb049418-44db-4f98-9d53-385c5cd0f5cc.jpg?1783911714","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bb049418-44db-4f98-9d53-385c5cd0f5cc.jpg?1783911714","commanderLegal":"legal","set":"otp","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  blessing: {"oracleId":"9472c96a-2827-4af6-a6a1-b6749a5e9069","name":"Benevolent Blessing","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Flash\nEnchant creature\nAs this Aura enters, choose a color.\nEnchanted creature has protection from the chosen color. This effect doesn't remove Auras and Equipment you control that are already attached to it.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d5c2401-da2c-46f9-b850-f37edcbb85cd.jpg?1783928890","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d5c2401-da2c-46f9-b850-f37edcbb85cd.jpg?1783928890","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  quake: {"oracleId":"bbe41a21-f8ad-4e5c-88d8-2a41dfd32d13","name":"Quakebringer","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Giant Berserker","supertypes":[],"types":["Creature"],"subtypes":["Giant","Berserker"],"oracleText":"Your opponents can't gain life.\nAt the beginning of your upkeep, Quakebringer deals 2 damage to each opponent. This ability triggers only if Quakebringer is on the battlefield or if Quakebringer is in your graveyard and you control a Giant.\nForetell {2}{R}{R}","power":"5","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c5bbffb9-1f1c-40e5-97f4-29bf1fc68625.jpg?1783928225","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c5bbffb9-1f1c-40e5-97f4-29bf1fc68625.jpg?1783928225","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  satchel: {"oracleId":"75a4ddf5-1b3c-4dde-a6e4-4346e46cebf1","name":"Druidic Satchel","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}: Reveal the top card of your library. If it's a creature card, create a 1/1 green Saproling creature token. If it's a land card, put that card onto the battlefield under your control. If it's a noncreature, nonland card, you gain 2 life.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fddb054f-0617-4afb-8ed1-a067f234f8e7.jpg?1783941050","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fddb054f-0617-4afb-8ed1-a067f234f8e7.jpg?1783941050","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  manabond: {"oracleId":"482006a0-bb2a-4533-891b-2195da5e0f01","name":"Manabond","manaCost":"{G}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your end step, you may reveal your hand and put all land cards from it onto the battlefield. If you do, discard your hand.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e9e9a569-4a6a-4440-a99c-aa608ee3dacc.jpg?1783910557","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e9e9a569-4a6a-4440-a99c-aa608ee3dacc.jpg?1783910557","commanderLegal":"legal","set":"mb2","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  plains: {"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  mountain: {"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  forest: {"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  island: {"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  bolt: {"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  bears: {"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  giant: {"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  myr: {"oracleId":"2d8e1054-654f-42e8-8c29-12c3cf13a3eb","name":"Myr Enforcer","manaCost":"{7}","cmc":7,"typeLine":"Artifact Creature — Myr","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Myr"],"oracleText":"Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Affinity"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/eeeef899-a8b5-4416-a208-3bd5a0c7177b.jpg?1783944512","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/eeeef899-a8b5-4416-a208-3bd5a0c7177b.jpg?1783944512","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  ornithopter: {"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  solring: {"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  shock: {"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  divination: {"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  pacifism: {"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  bonesplitter: {"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  rancor: {"oracleId":"9d2d6479-531c-4ce1-b52b-00e36fa63b64","name":"Rancor","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  naturalize: {"oracleId":"bdb3ca68-ec1f-4e16-81cc-d23f8f52c728","name":"Naturalize","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  manamorph: {"oracleId":"89c83a6d-f6c8-4984-a888-0db62dfb93b1","name":"Manamorphose","manaCost":"{1}{R/G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Add two mana in any combination of colors.\nDraw a card.","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fbbc184e-e74f-4f9d-87d2-b19973d84fbb.jpg?1783904334","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fbbc184e-e74f-4f9d-87d2-b19973d84fbb.jpg?1783904334","commanderLegal":"legal","set":"spg","releasedAt":"2026-01-23","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  knight: {"oracleId":"393e5331-4456-4ba3-b410-bb630bb053db","name":"Knight of the Reliquary","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"This creature gets +1/+1 for each land card in your graveyard.\n{T}, Sacrifice a Forest or Plains: Search your library for a land card, put it onto the battlefield, then shuffle.","power":"2","toughness":"2","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/648da53a-5cce-4133-9779-62d18783dd67.jpg?1783941351","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/648da53a-5cce-4133-9779-62d18783dd67.jpg?1783941351","commanderLegal":"legal","set":"ddg","releasedAt":"2011-04-01","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  lightningGreaves: {"oracleId":"ca204b66-8d0c-431a-8d34-282f7c2d17da","name":"Lightning Greaves","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has haste and shroud. (It can't be the target of spells or abilities.)\nEquip {0}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b61634ae-05be-4b56-8ebb-9d4ade902e42.jpg?1783903217","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b61634ae-05be-4b56-8ebb-9d4ade902e42.jpg?1783903217","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  murder: {"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  dryad: {"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","commanderLegal":"legal","set":"sld","releasedAt":"2026-02-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  kozilek: {"oracleId":"7b8528b0-71eb-4c9e-bed9-aa2d2e84038f","name":"Kozilek, Butcher of Truth","manaCost":"{10}","cmc":10,"typeLine":"Legendary Creature — Eldrazi","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"When you cast this spell, draw four cards.\nAnnihilator 4 (Whenever this creature attacks, defending player sacrifices four permanents of their choice.)\nWhen Kozilek is put into a graveyard from anywhere, its owner shuffles their graveyard into their library.","power":"12","toughness":"12","colors":[],"colorIdentity":[],"keywords":["Annihilator"],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64b4b6cd-6d0f-4060-b51f-61f481000d51.jpg?1783921777","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64b4b6cd-6d0f-4060-b51f-61f481000d51.jpg?1783921777","commanderLegal":"legal","set":"2x2","releasedAt":"2022-07-08","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  cryptic: {"oracleId":"a3e51a35-09df-4189-b131-08a21e6a557d","name":"Cryptic Command","manaCost":"{1}{U}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose two —\n• Counter target spell.\n• Return target permanent to its owner's hand.\n• Tap all creatures your opponents control.\n• Draw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/30f6fca9-003b-4f6b-9d6e-1e88adda4155.jpg?1783935549","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/30f6fca9-003b-4f6b-9d6e-1e88adda4155.jpg?1783935549","commanderLegal":"legal","set":"ima","releasedAt":"2017-11-17","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  vindicate: {"oracleId":"63c1ac21-e3d8-40c2-8c09-3f31c52992ef","name":"Vindicate","manaCost":"{1}{W}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy target permanent.","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/b/1b2c1bf2-d03a-4cd5-ab51-26c928949497.jpg?1783906250","artUrl":"https://cards.scryfall.io/art_crop/front/1/b/1b2c1bf2-d03a-4cd5-ab51-26c928949497.jpg?1783906250","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  sphinx: {"oracleId":"1c96772b-463c-4655-836b-cf6e9dc6319f","name":"Sphinx of the Steel Wind","manaCost":"{5}{W}{U}{B}","cmc":8,"typeLine":"Artifact Creature — Sphinx","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Sphinx"],"oracleText":"Flying, first strike, vigilance, lifelink, protection from red and from green","power":"6","toughness":"6","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Flying","Lifelink","Vigilance","First strike","Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/c/8/c860cf0f-ef68-455f-9c71-a6dd25b51d71.jpg?1783942416","artUrl":"https://cards.scryfall.io/art_crop/front/c/8/c860cf0f-ef68-455f-9c71-a6dd25b51d71.jpg?1783942416","commanderLegal":"legal","set":"arb","releasedAt":"2009-04-30","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  bloodbraid: {"oracleId":"3f0c9466-5ab9-4205-a84f-b4b27b5a678e","name":"Bloodbraid Elf","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Creature — Elf Berserker","supertypes":[],"types":["Creature"],"subtypes":["Elf","Berserker"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)\nCascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)","power":"3","toughness":"2","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Haste","Cascade"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/29b15ab8-c117-42b9-8177-df96153d6a38.jpg?1783937555","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/29b15ab8-c117-42b9-8177-df96153d6a38.jpg?1783937555","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  flusterstorm: {"oracleId":"86bf58f2-7f25-4e10-b797-25e0e8e67769","name":"Flusterstorm","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target instant or sorcery spell unless its controller pays {1}.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)","colors":["U"],"colorIdentity":["U"],"keywords":["Storm"],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/ba8fa9db-f24f-46d4-add1-71b7f77636e2.jpg?1783903931","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/ba8fa9db-f24f-46d4-add1-71b7f77636e2.jpg?1783903931","commanderLegal":"legal","set":"soa","releasedAt":"2026-04-24","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  goblin: {"oracleId":"50608184-90d3-43d2-a221-deb186c78323","name":"Goblin Piker","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Warrior","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Warrior"],"oracleText":"","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
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
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name && characteristics(s, s.objects[id]!).controller === pid);
const cycling = (s: GameState, id: ObjectId) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.cycling);

describe("round 277 cards", () => {
  it("all compile fully", () => supported(C.mammoth, C.webstrike, C.tithe, C.march, C.display, C.omnath, C.sphere, C.blessing, C.quake, C.satchel, C.manabond));
});

describe("Rampaging War Mammoth: \"When you cycle this card, destroy up to X target artifacts\"", () => {
  it("cycled with X 2, it destroys up to two artifacts, chosen as the trigger is put on the stack", () => {
    const { s: s0, ap, ids, opp } = setup([C.mammoth]);
    const ring = putOnBattlefield(s0, opp, C.solring);
    const thopter = putOnBattlefield(s0, opp, C.ornithopter);
    const split = putOnBattlefield(s0, opp, C.bonesplitter);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, ids[0]!, cycling(s0, ids[0]!), undefined, undefined, undefined, 2));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = pass(act(s, { type: "chooseTargets", player: ap, targets: [target(ring), target(thopter)] }));
    expect(zone(s, ring)).toBe("graveyard");
    expect(zone(s, thopter)).toBe("graveyard");
    expect(zone(s, split)).toBe("battlefield");
    expect(zone(s, ids[0]!)).toBe("graveyard");
    // Discarded, then drew one.
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("with X 0 it has no targets and destroys nothing (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([C.mammoth]);
    const ring = putOnBattlefield(s0, opp, C.solring);
    let s = run(s0, planActivate(s0, ap, ids[0]!, cycling(s0, ids[0]!), undefined, undefined, undefined, 0));
    s = settle(s);
    expect(zone(s, ring)).toBe("battlefield");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Webstrike Elite: \"destroy up to one target artifact or enchantment with mana value X\", the X of its cycling cost", () => {
  it("cycled with X 1: Sol Ring can be the target, Lightning Greaves (mana value 2) can't", () => {
    const { s: s0, ap, ids, opp } = setup([C.webstrike]);
    const ring = putOnBattlefield(s0, opp, C.solring);
    const greaves = putOnBattlefield(s0, opp, C.lightningGreaves);
    let s = run(s0, planActivate(s0, ap, ids[0]!, cycling(s0, ids[0]!), undefined, undefined, undefined, 1));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(greaves)] })).toThrow();
    s = pass(act(s, { type: "chooseTargets", player: ap, targets: [target(ring)] }));
    expect(zone(s, ring)).toBe("graveyard");
    expect(zone(s, greaves)).toBe("battlefield");
  });
});

describe("Tithe: a second Plains only if target opponent controls more lands, counted as it resolves", () => {
  const plainsIn = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Plains");
  it("with the opponent ahead on lands, two searches, both Plains to your hand", () => {
    const { s: s0, ap, ids, opp } = setup([C.tithe]);
    const p1 = into(s0, ap, C.plains, "library");
    const p2 = into(s0, ap, C.plains, "library");
    for (let i = 0; i < 15; i++) putOnBattlefield(s0, opp, C.forest);
    let s = pass(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = pass(act(s, { type: "searchLibrary", player: ap, found: [p1] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = pass(act(s, { type: "searchLibrary", player: ap, found: [p2] }));
    expect(s.pending ?? undefined).toBeUndefined();
    expect(plainsIn(s, ap).sort()).toEqual([p1, p2].sort());
  });

  it("with the opponent not ahead, one Plains", () => {
    const { s: s0, ap, ids, opp } = setup([C.tithe]);
    const p1 = into(s0, ap, C.plains, "library");
    into(s0, ap, C.plains, "library");
    let s = pass(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = pass(act(s, { type: "searchLibrary", player: ap, found: [p1] }));
    expect(s.pending ?? undefined).toBeUndefined();
    expect(plainsIn(s, ap)).toEqual([p1]);
  });
});

describe("March of Progress: a token copy of target artifact creature you control; overloaded, of each", () => {
  it("cast normally, one copy of the target", () => {
    const { s: s0, ap, ids } = setup([C.march]);
    const myr = putOnBattlefield(s0, ap, C.myr);
    putOnBattlefield(s0, ap, C.ornithopter);
    const s = pass(run(s0, planCast(s0, ap, ids[0]!, [target(myr)])));
    expect(named(s, ap, "Myr Enforcer").length).toBe(2);
    expect(named(s, ap, "Ornithopter").length).toBe(1);
  });

  it("a creature that isn't an artifact, or one you don't control, can't be the target", () => {
    const { s: s0, ap, ids, opp } = setup([C.march]);
    const bears = putOnBattlefield(s0, ap, C.bears);
    const theirs = putOnBattlefield(s0, opp, C.myr);
    expect(planCast(s0, ap, ids[0]!, [target(bears)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [target(theirs)])).toBeNull();
  });

  it("overloaded, a copy of each artifact creature you control", () => {
    const { s: s0, ap, ids, opp } = setup([C.march]);
    putOnBattlefield(s0, ap, C.myr);
    putOnBattlefield(s0, ap, C.ornithopter);
    putOnBattlefield(s0, ap, C.bears);
    putOnBattlefield(s0, opp, C.myr);
    s0.players[ap]!.manaPool.U = 7;
    const s = pass(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "overload" })));
    expect(named(s, ap, "Myr Enforcer").length).toBe(2);
    expect(named(s, ap, "Ornithopter").length).toBe(2);
    expect(named(s, ap, "Grizzly Bears").length).toBe(1);
    expect(named(s, opp, "Myr Enforcer").length).toBe(1);
  });
});

describe("Display of Power: copy any number of target instant and/or sorcery spells", () => {
  it("one copy of each target spell; the Shock copy may get a new target", () => {
    const { s: s0, ap, ids, opp } = setup([C.divination, C.shock, C.display]);
    const [div, shock, display] = ids as [ObjectId, ObjectId, ObjectId];
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, div));
    s = run(s, planCast(s, ap, shock, [{ kind: "player", id: opp }]));
    const divItem = s.stack.find((x) => x.objectId === div)!.id;
    const shockItem = s.stack.find((x) => x.objectId === shock)!.id;
    s = run(s, planCast(s, ap, display, [{ kind: "stack", id: divItem }, { kind: "stack", id: shockItem }]));
    expect(s.stack.length).toBe(3);
    // Display of Power resolves: a copy of each, Divination's first (no targets), then Shock's (new targets offered).
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap });
    expect(s.stack.filter((x) => x.copy).length).toBe(2);
    s = settle(s);
    // Three spells left the hand; two Divinations drew four.
    expect(s.players[ap]!.hand.length).toBe(hand - 3 + 4);
    expect(life(s, opp)).toBe(36);
  });

  it("this spell can't be copied", () => {
    expect(compileCard(C.display).spell?.uncopyable).toBe(true);
  });

  it("with no target announced, it copies nothing", () => {
    const { s: s0, ap, ids } = setup([C.display]);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.stack.length).toBe(0);
  });
});

describe("Omnath, Locus of All: the top card to your hand, three mana of its colors if it may be and is revealed", () => {
  /** Omnath on the battlefield, `top` second from the top of the library (the draw step takes the first), at the next turn's first main phase. */
  const atFirstMain = (top: CardDef) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, C.omnath);
    const card = into(s0, ap, top, "library");
    into(s0, ap, C.forest, "library");
    const s = passUntil(passUntil(s0, "upkeep", opp), "main1", ap);
    return { s: pass(s), ap, card };
  };

  it("a card with three colored mana symbols: revealed, three mana in any combination of its colors, then into the hand", () => {
    const { s: s1, ap, card } = atFirstMain(C.sphinx);
    let s = s1;
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, card });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "manaMix", player: ap, n: 3 });
    expect([...((s.pending as { colors?: string[] }).colors ?? [])].sort()).toEqual(["B", "U", "W"]);
    s = pass(act(s, { type: "manaMix", player: ap, counts: { W: 1, B: 2 } }));
    expect(zone(s, card)).toBe("hand");
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 1, B: 2 });
    expect(s.log.some((l) => /reveals Sphinx of the Steel Wind/.test(l.text))).toBe(true);
  });

  it("declining keeps it hidden and adds nothing; it still goes to the hand", () => {
    const { s: s1, ap, card } = atFirstMain(C.cryptic);
    let s = act(s1, { type: "chooseMay", player: ap, yes: false });
    s = pass(s);
    expect(zone(s, card)).toBe("hand");
    expect(s.players[ap]!.manaPool.U ?? 0).toBe(0);
  });

  it("a card with fewer than three colored symbols (hybrid counts as one) can't be revealed: no question, to the hand", () => {
    const { s, ap, card } = atFirstMain(C.manamorph);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(zone(s, card)).toBe("hand");
    expect(Object.values(s.players[ap]!.manaPool).reduce((a, b) => a + (b ?? 0), 0)).toBe(0);
  });

  it("the bot reveals for the mana", () => {
    const { s: s1, ap, card } = atFirstMain(C.cryptic);
    const s = settle(s1);
    expect(zone(s, card)).toBe("hand");
    expect(s.players[ap]!.manaPool.U).toBe(3);
  });
});

describe("Detention Sphere: exile target nonland permanent not named Detention Sphere and all others with its name", () => {
  it("every permanent with that name goes, yours too, and returns under its owner's control when the Sphere leaves", () => {
    const { s: s0, ap, ids, opp } = setup([C.sphere, C.naturalize]);
    const g1 = putOnBattlefield(s0, opp, C.giant);
    const g2 = putOnBattlefield(s0, opp, C.giant);
    const mine = putOnBattlefield(s0, ap, C.giant);
    const bears = putOnBattlefield(s0, opp, C.bears);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const sphere = ids[0]!;
    // Not another Detention Sphere, nor a land.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(sphere)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(g1)] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = pass(act(s, { type: "chooseMay", player: ap, yes: true }));
    for (const g of [g1, g2, mine]) expect(zone(s, g)).toBe("exile");
    expect(zone(s, bears)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(sphere)])));
    expect(zone(s, sphere)).toBe("graveyard");
    for (const g of [g1, g2, mine]) expect(zone(s, g)).toBe("battlefield");
    expect(characteristics(s, s.objects[g1]!).controller).toBe(opp);
    expect(characteristics(s, s.objects[mine]!).controller).toBe(ap);
  });
});

describe("Benevolent Blessing: protection that doesn't remove your Auras and Equipment already attached (CR 702.16p)", () => {
  const blade = card("Test Moss Blade", "Artifact — Equipment", "{G}", { colors: ["G"], oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
  const attach = (s: GameState, what: ObjectId, to: ObjectId) => {
    s.objects[what]!.attachedTo = to;
    invalidateCharacteristics(s);
  };

  it("your green Aura and Equipment already on it stay; an opponent's green Aura falls off", () => {
    const { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, ap, C.bears);
    const rancor = putOnBattlefield(s, ap, C.rancor);
    const eq = putOnBattlefield(s, ap, blade);
    const theirs = putOnBattlefield(s, opp, C.rancor);
    for (const x of [rancor, eq, theirs]) attach(s, x, bear);
    runStateBasedActions(s);
    // Before the Blessing: all on.
    expect([rancor, eq, theirs].map((x) => s.objects[x]!.attachedTo)).toEqual([bear, bear, bear]);
    const bless = putOnBattlefield(s, ap, C.blessing);
    s.objects[bless]!.chosen = { color: "G" };
    attach(s, bless, bear);
    runStateBasedActions(s);
    expect(objHasKeyword(s, s.objects[bear]!, "Protection from green")).toBe(true);
    expect(s.objects[bless]!.attachedTo).toBe(bear);
    expect(s.objects[rancor]!.attachedTo).toBe(bear);
    expect(s.objects[eq]!.attachedTo).toBe(bear);
    expect(zone(s, theirs)).not.toBe("battlefield");
  });

  it("a green Aura or Equipment of yours attached afterwards isn't spared", () => {
    const { s, ap } = setup([]);
    const bear = putOnBattlefield(s, ap, C.bears);
    const bless = putOnBattlefield(s, ap, C.blessing);
    s.objects[bless]!.chosen = { color: "G" };
    attach(s, bless, bear);
    runStateBasedActions(s);
    const rancor = putOnBattlefield(s, ap, C.rancor);
    const eq = putOnBattlefield(s, ap, blade);
    attach(s, rancor, bear);
    attach(s, eq, bear);
    runStateBasedActions(s);
    expect(zone(s, rancor)).not.toBe("battlefield");
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
    expect(s.objects[bless]!.attachedTo).toBe(bear);
  });

  it("protection from that color from elsewhere still removes them (CR 702.16p)", () => {
    const { s, ap } = setup([]);
    const bear = putOnBattlefield(s, ap, C.bears);
    const rancor = putOnBattlefield(s, ap, C.rancor);
    const bless = putOnBattlefield(s, ap, C.blessing);
    attach(s, rancor, bear);
    s.objects[bless]!.chosen = { color: "G" };
    attach(s, bless, bear);
    runStateBasedActions(s);
    expect(s.objects[rancor]!.attachedTo).toBe(bear);
    s.effects.push({ id: "x1", timestamp: s.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [bear], mods: [{ kind: "addKeywords", keywords: ["Protection from green"] }] });
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    expect(zone(s, rancor)).not.toBe("battlefield");
  });

  it("cast with flash onto a creature wearing your green Aura: the color is chosen, the Aura stays", () => {
    const { s: s0, ap, ids } = setup([C.blessing]);
    const bear = putOnBattlefield(s0, ap, C.bears);
    const rancor = putOnBattlefield(s0, ap, C.rancor);
    attach(s0, rancor, bear);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(bear)]));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ player: ap });
    const p = s.pending as { kind: string; options?: string[] };
    s = act(s, p.kind === "chooseOption" ? { type: "chooseOption", player: ap, choice: p.options!.find((o) => /G|green/i.test(o))! } : ({ type: "chooseColor", player: ap, color: "G" } as unknown as Action));
    s = pass(s);
    expect(objHasKeyword(s, s.objects[bear]!, "Protection from green")).toBe(true);
    expect(s.objects[rancor]!.attachedTo).toBe(bear);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(bear);
  });
});

describe("Quakebringer: its upkeep ability triggers on the battlefield, or from your graveyard while you control a Giant", () => {
  const toUpkeep = (s: GameState, ap: PlayerId, opp: PlayerId) => passUntil(passUntil(s, "upkeep", opp), "upkeep", ap);
  it("on the battlefield: 2 damage to each opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, C.quake);
    const s = settle(toUpkeep(s0, ap, opp));
    for (const p of s.turnOrder) expect(life(s, p)).toBe(p === ap ? 40 : 38);
  });

  it("in the graveyard with a Giant: it triggers, and still deals the damage if the Giant is gone by then (not an intervening if)", () => {
    const { s: s0, ap, opp } = setup([]);
    const q = into(s0, ap, C.quake, "graveyard");
    const giant = putOnBattlefield(s0, ap, C.giant);
    let s = toUpkeep(s0, ap, opp);
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(0);
    // The Giant leaves before it resolves.
    s.battlefield.splice(s.battlefield.indexOf(giant), 1);
    s.objects[giant]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(giant);
    invalidateCharacteristics(s);
    s = settle(s);
    for (const p of s.turnOrder) expect(life(s, p)).toBe(p === ap ? 40 : 38);
    expect(zone(s, q)).toBe("graveyard");
  });

  it("in the graveyard with no Giant: nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    into(s0, ap, C.quake, "graveyard");
    putOnBattlefield(s0, ap, C.bears);
    const s = settle(toUpkeep(s0, ap, opp));
    for (const p of s.turnOrder) expect(life(s, p)).toBe(40);
  });
});

describe("Druidic Satchel: three checks of the revealed top card", () => {
  const satchel = (top: CardDef) => {
    const { s: s0, ap } = setup([]);
    const sat = putOnBattlefield(s0, ap, C.satchel);
    const card = into(s0, ap, top, "library");
    const s = settle(run(s0, planActivate(s0, ap, sat, 0)));
    return { s, ap, card };
  };
  it("a creature card: a Saproling, the card stays on top", () => {
    const { s, ap, card } = satchel(C.bears);
    expect(named(s, ap, "Saproling Token").length + named(s, ap, "Saproling").length).toBe(1);
    expect(s.players[ap]!.library[0]).toBe(card);
    expect(life(s, ap)).toBe(40);
  });
  it("a land card: onto the battlefield", () => {
    const { s, ap, card } = satchel(C.forest);
    expect(zone(s, card)).toBe("battlefield");
    expect(characteristics(s, s.objects[card]!).controller).toBe(ap);
  });
  it("a noncreature, nonland card: 2 life, the card stays on top", () => {
    const { s, ap, card } = satchel(C.bolt);
    expect(life(s, ap)).toBe(42);
    expect(s.players[ap]!.library[0]).toBe(card);
  });
  it("Dryad Arbor, a creature land: a Saproling and the land (rulings)", () => {
    const { s, ap, card } = satchel(C.dryad);
    expect(zone(s, card)).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(1);
    expect(life(s, ap)).toBe(40);
  });
});

describe("Manabond: at your end step, you may put all land cards from your hand onto the battlefield, then discard your hand", () => {
  it("yes: the lands go onto the battlefield, the rest of the hand is discarded", () => {
    const { s: s0, ap, ids } = setup([C.forest, C.mountain, C.bolt]);
    putOnBattlefield(s0, ap, C.manabond);
    s0.players[ap]!.hand = [...ids];
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = pass(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(zone(s, ids[2]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(0);
  });

  it("no: nothing happens", () => {
    const { s: s0, ap, ids } = setup([C.forest, C.bolt]);
    putOnBattlefield(s0, ap, C.manabond);
    s0.players[ap]!.hand = [...ids];
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = pass(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.hand).toEqual(ids);
  });

  it("the bot says yes only with at most one nonland card to lose", () => {
    const one = setup([C.forest, C.forest, C.bolt]);
    putOnBattlefield(one.s, one.ap, C.manabond);
    one.s.players[one.ap]!.hand = [...one.ids];
    let s = settle(passUntil(one.s, "end", one.ap));
    expect(s.players[one.ap]!.hand.length).toBe(0);
    const two = setup([C.forest, C.bolt, C.shock]);
    putOnBattlefield(two.s, two.ap, C.manabond);
    two.s.players[two.ap]!.hand = [...two.ids];
    s = settle(passUntil(two.s, "end", two.ap));
    expect(s.players[two.ap]!.hand.length).toBe(3);
  });
});

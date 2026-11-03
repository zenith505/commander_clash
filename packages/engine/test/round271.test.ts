// Round 271, earlier skips from the top of the popularity list: Hushbringer ("Creatures entering or dying don't cause
// abilities to trigger", rulings: look-back for dying, "from anywhere" abilities, sacrifice triggers untouched), and mana
// that can only be spent some ways (CR 106.6): Mm'menon, the Right Hand ("a spell from anywhere other than your hand"),
// Lord of the Forsaken ("a spell from your graveyard"), Overgrown Zealot ("to turn permanents face up") and Creeping Peeper
// ("an enchantment spell, unlock a door, or turn a permanent face up"); and turning permanents face down (CR 708.2): Cyber
// Conversion ("Turn target creature face down. It's a 2/2 Cyberman artifact creature") Wall of Deceit ("Turn ~ face down")
// and Skittish Valesk ("If you lose the flip, turn ~ face down").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, compileCard, harmfulTargets, invalidateCharacteristics, isFullySupported, manaOptions, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { spendAllows } from "../src/spend";

const C = {
  hush: {"oracleId":"3d21f710-6bbc-41ae-a8e5-02debe3e02bd","name":"Hushbringer","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Faerie","supertypes":[],"types":["Creature"],"subtypes":["Faerie"],"oracleText":"Flying, lifelink\nCreatures entering or dying don't cause abilities to trigger.","power":"1","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/663b3e6f-1099-4de8-a0a7-6f1919c38010.jpg?1783932672","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/663b3e6f-1099-4de8-a0a7-6f1919c38010.jpg?1783932672","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  mmenon: {"oracleId":"de58fa4b-eeeb-4dc8-aab9-6521b15678cc","name":"Mm'menon, the Right Hand","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Legendary Creature — Jellyfish Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Jellyfish","Advisor"],"oracleText":"Flying\nYou may look at the top card of your library any time.\nYou may cast artifact spells from the top of your library.\nArtifacts you control have \"{T}: Add {U}. Spend this mana only to cast a spell from anywhere other than your hand.\"","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82add0a0-e402-4b31-b101-81c0bf332015.jpg?1783905978","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82add0a0-e402-4b31-b101-81c0bf332015.jpg?1783905978","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  lord: {"oracleId":"3a25d1e2-63d8-4a93-b0ce-f9307736b3f9","name":"Lord of the Forsaken","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Flying, trample\n{B}, Sacrifice another creature: Target player mills three cards.\nPay 1 life: Add {C}. Spend this mana only to cast a spell from your graveyard.","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Trample","Mill"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5bca294d-6df6-4580-874b-e9b7adf25cb8.jpg?1783924412","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5bca294d-6df6-4580-874b-e9b7adf25cb8.jpg?1783924412","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  zealot: {"oracleId":"5146b291-1170-481f-a4b9-709dd5c4b09c","name":"Overgrown Zealot","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add one mana of any color.\n{T}: Add two mana of any one color. Spend this mana only to turn permanents face up.","power":"0","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/9/6/96d68d29-499a-4864-be18-bd98fda0d173.jpg?1783909451","artUrl":"https://cards.scryfall.io/art_crop/front/9/6/96d68d29-499a-4864-be18-bd98fda0d173.jpg?1783909451","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  peeper: {"oracleId":"acf22340-7ff9-443f-a846-c44bb5a3f4e7","name":"Creeping Peeper","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Eye","supertypes":[],"types":["Creature"],"subtypes":["Eye"],"oracleText":"{T}: Add {U}. Spend this mana only to cast an enchantment spell, unlock a door, or turn a permanent face up.","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/7/a/7ad59368-1335-4d8e-a254-ccd889933e57.jpg?1783909498","artUrl":"https://cards.scryfall.io/art_crop/front/7/a/7ad59368-1335-4d8e-a254-ccd889933e57.jpg?1783909498","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  bloodArtist: {"oracleId":"310f141c-7f37-4729-aed6-dd9c09db448d","name":"Blood Artist","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Vampire","supertypes":[],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","power":"0","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/b/1bcda0fd-0def-41ef-932a-85e83acce99d.jpg?1783908035","artUrl":"https://cards.scryfall.io/art_crop/front/1/b/1bcda0fd-0def-41ef-932a-85e83acce99d.jpg?1783908035","commanderLegal":"legal","set":"inr","releasedAt":"2025-01-24","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  memento: {"oracleId":"c81d1890-e741-49ec-a6ce-86c27fd4d502","name":"Profane Memento","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever a creature card is put into an opponent's graveyard from anywhere, you gain 1 life.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/2/f2c97632-3cf1-4b79-9d18-d8991654dcca.jpg?1783939156","artUrl":"https://cards.scryfall.io/art_crop/front/f/2/f2c97632-3cf1-4b79-9d18-d8991654dcca.jpg?1783939156","commanderLegal":"legal","set":"m15","releasedAt":"2014-07-18","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  visionary: {"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  mayhem: {"oracleId":"4709f11c-aef8-45ac-b2bf-e640c568dfac","name":"Mayhem Devil","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Creature — Devil","supertypes":[],"types":["Creature"],"subtypes":["Devil"],"oracleText":"Whenever a player sacrifices a permanent, this creature deals 1 damage to any target.","power":"3","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/17416926-168b-49b3-9231-acbb8f8a1d13.jpg?1783933394","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/17416926-168b-49b3-9231-acbb8f8a1d13.jpg?1783933394","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  fiend: {"oracleId":"cb9d557a-fc06-428c-8be6-7d28add33028","name":"Fiend Hunter","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"When this creature enters, you may exile another target creature.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1e4c7d8-11a5-40fe-962b-7e938bf08616.jpg?1783940994","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1e4c7d8-11a5-40fe-962b-7e938bf08616.jpg?1783940994","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  wrath: {"oracleId":"34515b16-c9a4-4f98-8c77-416a7a523407","name":"Wrath of God","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures. They can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","commanderLegal":"legal","set":"v14","releasedAt":"2014-08-22","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  seer: {"oracleId":"f82a4e85-526d-4456-b700-7760043a31be","name":"Viscera Seer","manaCost":"{B}","cmc":1,"typeLine":"Creature — Vampire Wizard","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Wizard"],"oracleText":"Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/d/b/dba1cf83-e13d-401e-b76f-b12a51b307f9.jpg?1783926567","artUrl":"https://cards.scryfall.io/art_crop/front/d/b/dba1cf83-e13d-401e-b76f-b12a51b307f9.jpg?1783926567","commanderLegal":"legal","set":"sld","releasedAt":"2021-06-21","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  brownscale: {"oracleId":"34242c44-a987-412c-9652-5242b9b5200c","name":"Golgari Brownscale","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Lizard","supertypes":[],"types":["Creature"],"subtypes":["Lizard"],"oracleText":"When this card is put into your hand from your graveyard, you gain 2 life.\nDredge 2 (If you would draw a card, you may mill two cards instead. If you do, return this card from your graveyard to your hand.)","power":"2","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Dredge","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/690cfc79-da41-4ac0-b0cc-719aa650b207.jpg?1783943638","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/690cfc79-da41-4ac0-b0cc-719aa650b207.jpg?1783943638","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  angel: {"oracleId":"2f6e9ab8-6951-4c5f-bcde-0e96e0fe87f2","name":"Exalted Angel","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nWhenever this creature deals damage, you gain that much life.\nMorph {2}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"4","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d2d48db-b206-47cc-9634-6c0f2d6b020c.jpg?1783938267","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d2d48db-b206-47cc-9634-6c0f2d6b020c.jpg?1783938267","commanderLegal":"legal","set":"v15","releasedAt":"2015-08-21","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  gravedigger: {"oracleId":"1a2030cc-d7ee-4059-b2d7-fb95ea8e267b","name":"Gravedigger","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"When this creature enters, you may return target creature card from your graveyard to your hand.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/6/9606f1ce-afeb-4fc5-bd4c-2484cd232924.jpg?1783936505","artUrl":"https://cards.scryfall.io/art_crop/front/9/6/9606f1ce-afeb-4fc5-bd4c-2484cd232924.jpg?1783936505","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  mortuary: {"oracleId":"8bd2af55-5a48-4300-a893-ae6cd548db24","name":"Mortuary","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature is put into your graveyard from the battlefield, put that card on top of your library.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/8/1807fe16-48f2-4f6f-b1b0-434878ddf807.jpg?1787673677","artUrl":"https://cards.scryfall.io/art_crop/front/1/8/1807fe16-48f2-4f6f-b1b0-434878ddf807.jpg?1787673677","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  riftwatcher: {"oracleId":"a4d22abe-87c5-4f6b-ad14-4a7935883169","name":"Aven Riftwatcher","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Bird Rebel Soldier","supertypes":[],"types":["Creature"],"subtypes":["Bird","Rebel","Soldier"],"oracleText":"Flying\nVanishing 3 (This creature enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this creature enters or leaves the battlefield, you gain 2 life.","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vanishing"],"imageUrl":"https://cards.scryfall.io/normal/front/f/6/f6a4394a-9ce2-4876-8a04-38e3775123af.jpg?1783943171","artUrl":"https://cards.scryfall.io/art_crop/front/f/6/f6a4394a-9ce2-4876-8a04-38e3775123af.jpg?1783943171","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  swords: {"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","commanderLegal":"legal","set":"sld","releasedAt":"2026-09-28","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  murder: {"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  mindRot: {"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  thinkTwice: {"oracleId":"fa85c5a2-8e83-4624-a35a-a0bbf17ecbb4","name":"Think Twice","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  cyber: {"oracleId":"33761c1a-9848-45bf-b934-123cebab566b","name":"Cyber Conversion","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Turn target creature face down. It's a 2/2 Cyberman artifact creature.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a779222-d591-4f08-9383-b29895e8d2b6.jpg?1783914557","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a779222-d591-4f08-9383-b29895e8d2b6.jpg?1783914557","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  wall: {"oracleId":"73714a40-5e8d-4aea-87fe-5aa0db53d6ff","name":"Wall of Deceit","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)\n{3}: Turn this creature face down.\nMorph {U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"0","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Morph","Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/1496d941-88fd-433e-8fae-1218316ef3a9.jpg?1783944918","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/1496d941-88fd-433e-8fae-1218316ef3a9.jpg?1783944918","commanderLegal":"legal","set":"lgn","releasedAt":"2003-02-03","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  valesk: {"oracleId":"d094f78b-acec-4181-9fee-ca523fb8ccc5","name":"Skittish Valesk","manaCost":"{6}{R}","cmc":7,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"At the beginning of your upkeep, flip a coin. If you lose the flip, turn this creature face down.\nMorph {5}{R} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/4/c/4cc8a6e6-ed62-4784-ba9a-b1f703fc6119.jpg?1783945049","artUrl":"https://cards.scryfall.io/art_crop/front/4/c/4cc8a6e6-ed62-4784-ba9a-b1f703fc6119.jpg?1783945049","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  delver: {"oracleId":"edd531b9-f615-4399-8c8c-1c5e18c4acbf","name":"Delver of Secrets // Insectile Aberration","manaCost":"{U}","cmc":1,"typeLine":"Creature — Human Wizard // Creature — Human Insect","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a992bbe3-c389-4a4a-927b-dfc01a4cd9be.jpg?1783924458","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a992bbe3-c389-4a4a-927b-dfc01a4cd9be.jpg?1783924458","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Delver of Secrets","manaCost":"{U}","typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.","power":"1","toughness":"1","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a992bbe3-c389-4a4a-927b-dfc01a4cd9be.jpg?1783924458","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a992bbe3-c389-4a4a-927b-dfc01a4cd9be.jpg?1783924458"},{"name":"Insectile Aberration","manaCost":"","typeLine":"Creature — Human Insect","supertypes":[],"types":["Creature"],"subtypes":["Human","Insect"],"oracleText":"Flying","power":"3","toughness":"2","colors":["U"],"colorIndicator":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/a/9/a992bbe3-c389-4a4a-927b-dfc01a4cd9be.jpg?1783924458","artUrl":"https://cards.scryfall.io/art_crop/back/a/9/a992bbe3-c389-4a4a-927b-dfc01a4cd9be.jpg?1783924458"}]} as CardDef,
};

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
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
/** The spend restriction on `def`'s restricted mana ability (CR 106.6). */
const manaSpendOf = (def: CardDef) => compileCard(def).mana.find((m) => m.spendOnly)!.spendOnly!;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Removes `pid`'s lands: what's left to pay with is what a test puts there. */
const noLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

describe("round 271 cards", () => {
  it("all compile fully", () => {
    for (const def of [C.hush, C.mmenon, C.lord, C.zealot, C.peeper, C.cyber, C.wall, C.valesk]) expect(isFullySupported(def), def.name).toBe(true);
  });
});

describe("Hushbringer: creatures entering or dying don't cause abilities to trigger", () => {
  it("a creature entering doesn't trigger its own enters ability (as Torpor Orb)", () => {
    const { s: s0, ap, ids } = setup([C.visionary]);
    putOnBattlefield(s0, ap, C.hush);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("a creature dying doesn't trigger dies abilities, but the sacrifice that caused it does (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, C.hush);
    putOnBattlefield(s0, ap, C.bloodArtist);
    const seer = putOnBattlefield(s0, ap, C.seer);
    const devil = putOnBattlefield(s0, ap, C.mayhem);
    const victim = putOnBattlefield(s0, ap, bear());
    const ab = planActivate(s0, ap, seer, 0, [], undefined, undefined, undefined, { sacrifice: [victim] });
    let s = run(s0, ab);
    expect(zone(s, victim)).toBe("graveyard");
    // Only Mayhem Devil's "whenever a player sacrifices a permanent" waits: no Blood Artist trigger.
    const queued = [...s.triggerQueue.map((t) => t.sourceId), ...s.stack.filter((x) => x.kind !== "ability" || x.sourceId !== seer).map((x) => x.sourceId)];
    expect(queued).toContain(devil);
    expect(queued.filter((id) => id !== devil)).toEqual([]);
    const lives = s.turnOrder.map((p) => life(s, p));
    s = settle(s);
    // Mayhem Devil's damage only (its target picked by the bot): no player lost 1 life to Blood Artist and gained 1.
    expect(life(s, ap) >= lives[s.turnOrder.indexOf(ap)]! - 1).toBe(true);
    expect(s.turnOrder.reduce((n, p, i) => n + (lives[i]! - life(s, p)), 0)).toBeLessThanOrEqual(1);
    void opp;
  });

  it("dying with Hushbringer at the same time still triggers nothing (look-back), but 'from anywhere' abilities see it gone", () => {
    const { s: s0, ap, ids, opp } = setup([C.wrath]);
    putOnBattlefield(s0, ap, C.hush);
    putOnBattlefield(s0, ap, C.bloodArtist);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, C.memento);
    const before = { ap: life(s0, ap), opp: life(s0, opp) };
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).types.includes("Creature"))).toEqual([]);
    // No Blood Artist drain; Profane Memento (an opponent's) gains 1 for each of the three creature cards.
    expect(life(s, ap)).toBe(before.ap);
    expect(life(s, opp)).toBe(before.opp + 3);
  });

  it("with Hushbringer staying, a dying creature card doesn't trigger 'from anywhere' abilities; a discarded one does", () => {
    const { s: s0, ap, ids, opp } = setup([C.murder, C.mindRot]);
    putOnBattlefield(s0, ap, C.hush);
    const victim = putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, ap, C.memento);
    const before = life(s0, ap);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]));
    expect(zone(s, victim)).toBe("graveyard");
    expect(life(s, ap)).toBe(before);
    for (const id of [...s.players[opp]!.hand]) {
      s.players[opp]!.hand.splice(s.players[opp]!.hand.indexOf(id), 1);
      s.objects[id]!.zone = "exile";
      s.players[opp]!.exile.push(id);
    }
    into(s, opp, bear({ name: "Test Bear A" }), "hand");
    into(s, opp, bear({ name: "Test Bear B" }), "hand");
    s.players[ap]!.manaPool.B = 1; // setup() has two Swamps, both used for Murder
    s = settle(castNow(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.hand.length).toBe(0);
    expect(life(s, ap)).toBe(before + 2);
  });

  it("a creature leaving by dying doesn't trigger its leaves ability; exiled, it does (rulings)", () => {
    const { s: s0, ap, ids } = setup([C.murder, C.swords]);
    putOnBattlefield(s0, ap, C.hush);
    const a = putOnBattlefield(s0, ap, C.riftwatcher);
    const b = putOnBattlefield(s0, ap, C.riftwatcher);
    const before = life(s0, ap);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(a)]));
    expect(zone(s, a)).toBe("graveyard");
    expect(life(s, ap)).toBe(before);
    // Swords to Plowshares: exiled (you gain life equal to its power, 2), and it leaves the battlefield: 2 more.
    s = settle(castNow(s, ap, ids[1]!, [tgt(b)]));
    expect(zone(s, b)).toBe("exile");
    expect(life(s, ap)).toBe(before + 4);
  });

  it("a creature put into a graveyard from the battlefield doesn't trigger 'put into your graveyard from the battlefield' abilities", () => {
    const { s: s0, ap, ids } = setup([C.murder]);
    putOnBattlefield(s0, ap, C.hush);
    putOnBattlefield(s0, ap, C.mortuary);
    const victim = putOnBattlefield(s0, ap, bear());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]));
    expect(zone(s, victim)).toBe("graveyard");
  });

  it("without Hushbringer the same abilities trigger", () => {
    const { s: s0, ap, ids } = setup([C.murder]);
    putOnBattlefield(s0, ap, C.mortuary);
    const victim = putOnBattlefield(s0, ap, bear());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]));
    expect(zone(s, victim)).toBe("library");
  });
});

const cube = card("Test Cube", "Artifact", "{2}", { cmc: 2, oracleText: "" });
const pump = card("Test Engine", "Artifact", "{0}", { oracleText: "{1}: You gain 1 life." });
const morphProp = card("Test Morpher", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", oracleText: "Morph {2}", keywords: ["Morph"] });
const megaProp = card("Test Megamorpher", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", oracleText: "Megamorph {1}", keywords: ["Megamorph"] });
const faceDownOn = (s: GameState, pid: PlayerId, def: CardDef, how: "morph" | "megamorph" | "disguise" | "manifest" | "cloak") => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.faceDown = how;
  invalidateCharacteristics(s);
  return id;
};
const usesManaOf = (s: GameState, plan: Action[] | null, source: ObjectId) => !!plan?.some((a) => a.type === "activateMana" && a.objectId === source);

describe("Mm'menon, the Right Hand: artifacts tap for {U} spendable only on a spell cast from anywhere other than your hand", () => {
  it("pays for an artifact spell cast from the top of the library, not one from the hand, nor an ability", () => {
    const { s, ap, ids } = setup([cube]);
    noLands(s, ap);
    putOnBattlefield(s, ap, C.mmenon);
    const a = putOnBattlefield(s, ap, card("Test Rock A", "Artifact", "{1}"));
    putOnBattlefield(s, ap, card("Test Rock B", "Artifact", "{1}"));
    expect(manaOptions(s, s.objects[a]!).length).toBeGreaterThan(0);
    const top = into(s, ap, card("Test Top Cube", "Artifact", "{2}", { cmc: 2 }), "library");
    const plan = planCast(s, ap, top, undefined, undefined, "auto");
    expect(plan).not.toBeNull();
    const s2 = settle(run(s, plan));
    expect(zone(s2, top)).toBe("battlefield");
    // From the hand: no other mana.
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
    // Nor an activated ability's cost.
    const engine = putOnBattlefield(s, ap, pump);
    expect(planActivate(s, ap, engine, 0, [])).toBeNull();
  });
});

describe("Lord of the Forsaken: Pay 1 life: Add {C}, only for a spell cast from your graveyard", () => {
  /** Two activations of its "Pay 1 life: Add {C}" (not a tap ability, so the planner doesn't repeat it). */
  const twoColorless = (s: GameState, pid: PlayerId, lord: ObjectId) => {
    const opt = manaOptions(s, s.objects[lord]!)[0]!;
    for (let i = 0; i < 2; i++) s = act(s, { type: "activateMana", player: pid, objectId: lord, mana: opt.mana, ability: opt.ability });
    return s;
  };

  it("pays a flashback cost from your graveyard, not a spell from your hand", () => {
    const { s: s0, ap, ids } = setup([card("Test Trinket", "Artifact", "{2}", { cmc: 2 })]);
    noLands(s0, ap);
    const lord = putOnBattlefield(s0, ap, C.lord);
    putOnBattlefield(s0, ap, card("Test Isle", "Land", "", { oracleText: "{T}: Add {U}." }));
    const think = into(s0, ap, C.thinkTwice, "graveyard");
    const lifeBefore = life(s0, ap);
    const s = twoColorless(s0, ap, lord);
    expect(life(s, ap)).toBe(lifeBefore - 2);
    // A {2} spell from the hand: the land's {U} and nothing else.
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
    // Think Twice's flashback {2}{U}: {C}{C} from the pool, {U} from the land.
    const s2 = settle(run(s, planCast(s, ap, think, undefined, undefined, "auto", undefined, { via: "flashback" })));
    expect(zone(s2, think)).toBe("exile");
    expect(s2.players[ap]!.manaPool.C ?? 0).toBe(0);
  });

  it("only on a spell cast from your own graveyard (CR 404.1): not another player's, not a hand's, not an ability", () => {
    const { s, ap, opp } = setup([]);
    const only = manaSpendOf(C.lord);
    expect(spendAllows(s, ap, only, { spell: C.thinkTwice, fromGraveyard: true, owner: ap })).toBe(true);
    expect(spendAllows(s, ap, only, { spell: C.thinkTwice, fromGraveyard: true, owner: opp })).toBe(false);
    expect(spendAllows(s, ap, only, { spell: C.thinkTwice, fromHand: true, owner: ap })).toBe(false);
    expect(spendAllows(s, ap, only, { spell: C.thinkTwice, fromExile: true, owner: ap })).toBe(false);
    expect(spendAllows(s, ap, only, "other")).toBe(false);
  });
});

describe("Overgrown Zealot and Creeping Peeper: mana for turning permanents face up", () => {
  it("Overgrown Zealot's two mana turn a morph face up, not cast a spell", () => {
    const { s, ap, ids } = setup([card("Test Cub", "Creature — Bear", "{2}", { power: "1", toughness: "1" })]);
    noLands(s, ap);
    const z = putOnBattlefield(s, ap, C.zealot);
    const fd = faceDownOn(s, ap, morphProp, "morph");
    const plan = planTurnFaceUp(s, ap, fd);
    expect(usesManaOf(s, plan, z)).toBe(true);
    const s2 = run(s, plan);
    expect(s2.objects[fd]!.faceDown).toBeUndefined();
    // {2} for a creature spell: its other ability makes only one.
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
  });

  it("Creeping Peeper's {U} casts an enchantment spell or turns a permanent face up, nothing else", () => {
    const { s, ap, ids } = setup([card("Test Ward", "Enchantment", "{U}", { colors: ["U"] }), card("Test Sprite", "Creature — Faerie", "{U}", { power: "1", toughness: "1", colors: ["U"] })]);
    noLands(s, ap);
    putOnBattlefield(s, ap, C.peeper);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto")).not.toBeNull();
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto")).toBeNull();
    expect(planTurnFaceUp(s, ap, faceDownOn(s, ap, megaProp, "megamorph"))).not.toBeNull();
    expect(planActivate(s, ap, putOnBattlefield(s, ap, pump), 0, [])).toBeNull();
  });
});

describe("Cyber Conversion: turn target creature face down as a 2/2 Cyberman artifact creature", () => {
  it("is the same permanent: a nameless, colorless 2/2 Cyberman artifact creature with its counters and effects (CR 708.2)", () => {
    const { s: s0, ap, ids, opp } = setup([C.cyber]);
    const angel = putOnBattlefield(s0, opp, C.angel);
    s0.objects[angel]!.counters["+1/+1"] = 1;
    const stamp = s0.objects[angel]!.timestamp;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(angel)]));
    const o = s.objects[angel]!;
    const c = characteristics(s, o);
    expect(o.zone).toBe("battlefield");
    expect(o.faceDown).toBe("cyberman");
    expect([c.name, c.colors, c.types.sort(), c.subtypes, c.power, c.toughness]).toEqual(["Face-down Cyberman", [], ["Artifact", "Creature"], ["Cyberman"], 3, 3]);
    expect(c.keywords).not.toContain("Flying");
    // A new timestamp (CR 613.7f).
    expect(o.timestamp).toBeGreaterThan(stamp);
  });

  it("a creature with morph can be turned face up for its morph cost (rulings), then it's itself again", () => {
    const { s: s0, ap, ids } = setup([C.cyber]);
    const angel = putOnBattlefield(s0, ap, C.angel);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(angel)]));
    expect(s.objects[angel]!.faceDown).toBe("cyberman");
    s = run(s, planTurnFaceUp(s, ap, angel));
    expect(s.objects[angel]!.faceDown).toBeUndefined();
    expect(characteristics(s, s.objects[angel]!).name).toBe("Exalted Angel");
  });

  it("one without a morph ability stays face down; a face-down one or a double-faced one doesn't change (CR 708.2b, 712.16)", () => {
    const { s: s0, ap, ids, opp } = setup([C.cyber, C.cyber, C.cyber]);
    const bearId = putOnBattlefield(s0, opp, bear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bearId)]));
    expect(s.objects[bearId]!.faceDown).toBe("cyberman");
    expect(planTurnFaceUp(s, opp, bearId)).toBeNull();
    // Already face down (here a morph): it stays what it was.
    const fd = faceDownOn(s, opp, morphProp, "morph");
    s.players[ap]!.manaPool.U = 4;
    s = settle(castNow(s, ap, ids[1]!, [tgt(fd)]));
    expect(s.objects[fd]!.faceDown).toBe("morph");
    expect(characteristics(s, s.objects[fd]!).types).toEqual(["Creature"]);
    // Delver of Secrets: nothing happens.
    const delver = putOnBattlefield(s, opp, C.delver);
    s = settle(castNow(s, ap, ids[2]!, [tgt(delver)]));
    expect(s.objects[delver]!.faceDown).toBeUndefined();
    expect(characteristics(s, s.objects[delver]!).name).toBe("Delver of Secrets");
  });

  it("marks its target as harmful, for the bots and the UI", () => {
    expect(harmfulTargets(compileCard(C.cyber).spell!)).toEqual([true]);
  });
});

describe("Wall of Deceit: {3}: Turn ~ face down", () => {
  it("becomes a face-down 2/2 without defender, and its morph {U} turns it face up again", () => {
    const { s: s0, ap } = setup([]);
    const wall = putOnBattlefield(s0, ap, C.wall);
    let s = settle(run(s0, planActivate(s0, ap, wall, 0, [])));
    const c = characteristics(s, s.objects[wall]!);
    expect([s.objects[wall]!.faceDown, c.name, c.power, c.toughness, c.keywords.includes("Defender")]).toEqual(["morph", "Face-down creature", 2, 2, false]);
    s = run(s, planTurnFaceUp(s, ap, wall));
    expect(characteristics(s, s.objects[wall]!).name).toBe("Wall of Deceit");
  });
});

describe("Skittish Valesk: at the beginning of your upkeep, flip a coin; if you lose the flip, turn ~ face down", () => {
  it("turns face down exactly when its controller loses the flip", () => {
    const seen = new Set<boolean>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s: s0, ap } = setup([], seed);
      const v = putOnBattlefield(s0, ap, C.valesk);
      let s = passUntil(s0, "upkeep", ap);
      s = settle(s);
      const line = s.log.filter((l) => l.turn === s.turn).map((l) => l.text).find((l) => /flips a coin for Skittish Valesk/.test(l));
      expect(line, `seed ${seed}`).toBeDefined();
      const lost = /loses the flip/.test(line!);
      seen.add(lost);
      expect(s.objects[v]!.faceDown, `seed ${seed}`).toBe(lost ? "morph" : undefined);
    }
    expect([...seen].sort()).toEqual([false, true]);
  });
});

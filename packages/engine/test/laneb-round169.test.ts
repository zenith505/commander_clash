// Lane B round B169: every "for each ... card exiled this way" after one exile of the top X cards (Culmination of Studies;
// rulings, CR 120.2), a search put into the hand before a random discard and one shuffle (Wild Research; CR 701.23b,
// 701.24a), a payment of 2 life for each card looked at that's kept (Moonlight Bargain; CR 119.4), destroying the other
// creatures that share a color with the creature that entered (Spreading Plague; CR 105.2, 608.2h, 701.19c), the life
// lost as it entered given back as it leaves (Soulgorger Orgg; CR 607.1, 607.2e), and each attacking creature's own
// defending player's permanents counted (Mercadia's Downfall, Jurin, Leading the Charge; CR 802.2a, 608.2h, rulings).

import { describe, expect, it } from "vitest";
import { act, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const culmination = (): CardDef => ({"oracleId":"d4e124af-d335-4c42-b60a-fe578f69f7ed","name":"Culmination of Studies","manaCost":"{X}{U}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile the top X cards of your library. For each land card exiled this way, create a Treasure token. For each blue card exiled this way, draw a card. For each red card exiled this way, Culmination of Studies deals 1 damage to each opponent.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/2483060e-9d3f-48ae-80ea-0119bf6b4d67.jpg?1783927319","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/2483060e-9d3f-48ae-80ea-0119bf6b4d67.jpg?1783927319","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const research = (): CardDef => ({"oracleId":"d4721c7e-1a55-42cf-99c9-9118e386f48b","name":"Wild Research","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}{W}: Search your library for an enchantment card and reveal that card. Put it into your hand, then discard a card at random. Then shuffle.\n{1}{U}: Search your library for an instant card and reveal that card. Put it into your hand, then discard a card at random. Then shuffle.","colors":["R"],"colorIdentity":["R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8f00e6f1-e854-40b0-855d-7e0d7d233850.jpg?1783945342","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8f00e6f1-e854-40b0-855d-7e0d7d233850.jpg?1783945342","commanderLegal":"legal","set":"apc","releasedAt":"2001-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bargain = (): CardDef => ({"oracleId":"444dea65-9be7-4b64-afd1-eebe44b285be","name":"Moonlight Bargain","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Look at the top five cards of your library. For each card, put that card into your graveyard unless you pay 2 life. Then put the rest into your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/7957c37f-96da-4b7e-9581-afdf73a85edd.jpg?1783943667","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/7957c37f-96da-4b7e-9581-afdf73a85edd.jpg?1783943667","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const plague = (): CardDef => ({"oracleId":"6c134ef7-5c2f-4e4c-ae40-ef338fbf41e6","name":"Spreading Plague","manaCost":"{4}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature enters, destroy all other creatures that share a color with it. They can't be regenerated.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/ac86055d-ce08-4b05-a92c-45e007ca0ba4.jpg?1783945691","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/ac86055d-ce08-4b05-a92c-45e007ca0ba4.jpg?1783945691","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const orgg = (): CardDef => ({"oracleId":"cbbcd3a3-6ddd-4511-a352-3055d0102e7c","name":"Soulgorger Orgg","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Nightmare Orgg","supertypes":[],"types":["Creature"],"subtypes":["Nightmare","Orgg"],"oracleText":"Trample\nWhen this creature enters, you lose all but 1 life.\nWhen this creature leaves the battlefield, you gain life equal to the life you lost when it entered.","power":"6","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/8/a/8aef55b8-5813-4aff-a35d-4b3cbd4a9ffb.jpg?1783945115","artUrl":"https://cards.scryfall.io/art_crop/front/8/a/8aef55b8-5813-4aff-a35d-4b3cbd4a9ffb.jpg?1783945115","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const downfall = (): CardDef => ({"oracleId":"2c1201b2-5036-4e68-b36d-cdaf54b4993d","name":"Mercadia's Downfall","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Each attacking creature gets +1/+0 until end of turn for each nonbasic land defending player controls.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14507fe6-80a9-4ed4-bf3e-4656f3d377c0.jpg?1783945935","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14507fe6-80a9-4ed4-bf3e-4656f3d377c0.jpg?1783945935","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const jurin = (): CardDef => ({"oracleId":"de384867-8bb4-4edf-b542-970538718fdd","name":"Jurin, Leading the Charge","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Legendary Creature — Human Barbarian","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Barbarian"],"oracleText":"Haste\nJurin must be blocked if able.\nWhenever Jurin attacks, each creature you control attacking a player gets +1/+0 until end of turn for each creature that player controls.","power":"4","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/f/a/fab07547-a6b8-487a-9688-8f93aaa71f5b.jpg?1783917466","artUrl":"https://cards.scryfall.io/art_crop/front/f/a/fab07547-a6b8-487a-9688-8f93aaa71f5b.jpg?1783917466","commanderLegal":"legal","set":"sld","releasedAt":"2023-03-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const steamVents = (): CardDef => ({"oracleId":"17039058-822d-409f-938c-b727a366ba63","name":"Steam Vents","manaCost":"","cmc":0,"typeLine":"Land — Island Mountain","supertypes":[],"types":["Land"],"subtypes":["Island","Mountain"],"oracleText":"({T}: Add {U} or {R}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.","colors":[],"colorIdentity":["R","U"],"keywords":[],"producedMana":["R","U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a83903c7-fd51-4526-aed2-359e946fea36.jpg?1784036844","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a83903c7-fd51-4526-aed2-359e946fea36.jpg?1784036844","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const boomerang = (): CardDef => ({"oracleId":"dc4a4996-108a-4aac-850f-2d9f76403446","name":"Boomerang","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target permanent to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f5c98413-740d-47fd-bed6-2d3d05a72b31.jpg?1783947112","artUrl":"https://cards.scryfall.io/art_crop/front/f/5/f5c98413-740d-47fd-bed6-2d3d05a72b31.jpg?1783947112","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const emperion = (): CardDef => ({"oracleId":"bcd2f70c-36c2-44b2-9d4b-1000e9bb62b6","name":"Platinum Emperion","manaCost":"{8}","cmc":8,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"Your life total can't change. (You can't gain or lose life. You can't pay any amount of life except 0.)","power":"8","toughness":"8","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/71b03143-9e85-4061-88e6-ad621f75ec3b.jpg?1783933762","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71b03143-9e85-4061-88e6-ad621f75ec3b.jpg?1783933762","commanderLegal":"legal","set":"uma","releasedAt":"2018-12-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const izzetSignet = (): CardDef => ({"oracleId":"2fda4fe7-8b0c-489c-a000-6d358e614e34","name":"Izzet Signet","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Add {U}{R}.","colors":[],"colorIdentity":["R","U"],"keywords":[],"producedMana":["R","U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab29ff99-b246-49e8-bb77-c7906b502232.jpg?1783926553","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab29ff99-b246-49e8-bb77-c7906b502232.jpg?1783926553","commanderLegal":"legal","set":"sld","releasedAt":"2021-06-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const commandTower = (): CardDef => ({"oracleId":"0895c9b7-ae7d-4bb3-af17-3b75deb50a25","name":"Command Tower","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add one mana of any color in your commander's color identity.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1ac6cb62-45da-4e9a-84c6-09e6eacf0664.jpg?1789644465","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1ac6cb62-45da-4e9a-84c6-09e6eacf0664.jpg?1789644465","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const regenerate = (): CardDef => ({"oracleId":"4ce6c946-7a93-4a8d-a2c9-086cbd036e3c","name":"Regenerate","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Regenerate target creature. (The next time that creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)","colors":["G"],"colorIdentity":["G"],"keywords":["Heal","Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a1026f4-b11a-48aa-9191-e0bb51c515a6.jpg?1783942358","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a1026f4-b11a-48aa-9191-e0bb51c515a6.jpg?1783942358","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const jaceB = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const boros = (): CardDef => ({"oracleId":"266c2f49-82eb-48e9-a7ea-e0da787fa40e","name":"Boros Guildmage","manaCost":"{R/W}{R/W}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{1}{R}: Target creature gains haste until end of turn.\n{1}{W}: Target creature gains first strike until end of turn.","power":"2","toughness":"2","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/4355130c-bfaa-4799-9d70-dbfd32e39f7e.jpg?1783913295","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/4355130c-bfaa-4799-9d70-dbfd32e39f7e.jpg?1783913295","commanderLegal":"legal","set":"rvr","releasedAt":"2024-01-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const electrolyze = (): CardDef => ({"oracleId":"07b222d7-24f2-4994-9004-ff6672ebe161","name":"Electrolyze","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Electrolyze deals 2 damage divided as you choose among one or two targets.\nDraw a card.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08a4d142-b98b-4027-94cb-314f67fb1d4a.jpg?1783927424","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08a4d142-b98b-4027-94cb-314f67fb1d4a.jpg?1783927424","commanderLegal":"legal","set":"sta","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const exquisite = (): CardDef => ({"oracleId":"8f933fae-6c0c-42d7-a817-14760d8285cd","name":"Exquisite Blood","manaCost":"{4}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent loses life, you gain that much life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a83dad59-27a4-4dbb-bec8-f0683d6e2a67.jpg?1783924590","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a83dad59-27a4-4dbb-bec8-f0683d6e2a67.jpg?1783924590","commanderLegal":"legal","set":"sld","releasedAt":"2021-11-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

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
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` put on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** A fresh copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);

describe("Culmination of Studies: each 'for each ... card exiled this way' counts the one exile of the top X cards", () => {
  it("compiles", () => supported(culmination()));

  it("a Treasure for the land, a draw for each blue card, 1 damage to each opponent for each red card (a blue and red card counts twice)", () => {
    const { s: s0, ap, ids } = setup([culmination()]);
    const top = [steamVents(), opt(), bolt(), electrolyze()].reverse().map((d) => onTop(s0, ap, d)).reverse();
    const hand = s0.players[ap]!.hand.length;
    const under = s0.players[ap]!.library.slice(4, 6);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 4)));
    expect(s.pending).toBeFalsy();
    for (const id of top) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Treasure Token" || nameOf(s, id) === "Treasure")).toHaveLength(1);
    // Two draws: the two cards that were under the exiled ones.
    expect(s.players[ap]!.hand).toHaveLength(hand - 1 + 2);
    for (const id of under) expect(s.players[ap]!.hand).toContain(id);
    for (const p of others(s, ap)) expect(s.players[p]!.life).toBe(38);
    // One damage event of 2 to each opponent (rulings), not two of 1.
    expect(s.log.filter((l) => /Culmination of Studies deals 1 damage/.test(l.text))).toHaveLength(0);
    expect(s.players[ap]!.life).toBe(40);
  });

  it("with X = 0 nothing is exiled and nothing happens", () => {
    const { s: s0, ap, ids } = setup([culmination()]);
    onTop(s0, ap, bolt());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 0)));
    expect(s.players[ap]!.hand).toHaveLength(hand - 1);
    for (const p of others(s, ap)) expect(s.players[p]!.life).toBe(40);
  });
});

describe("Wild Research: the card found goes into your hand, then a card is discarded at random, then you shuffle", () => {
  it("compiles", () => supported(research()));

  it("with no other card in hand, the enchantment found is the one discarded (CR 701.9b)", () => {
    const { s: s0, ap } = setup([]);
    const wr = putOnBattlefield(s0, ap, research());
    s0.players[ap]!.hand = [];
    const aura = onTop(s0, ap, pacifism());
    let s = settle(run(s0, planActivate(s0, ap, wr, 0)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect((s.pending as { cards: string[] }).cards).toEqual([aura]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [aura] }));
    expect(s.objects[aura]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).toHaveLength(0);
    expect(s.log.some((l) => /finds a card \(Pacifism\)/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /shuffles/.test(l.text))).toBe(true);
  });

  it("finding nothing is allowed; a card is still discarded at random, and the library is still shuffled", () => {
    const { s: s0, ap } = setup([bolt()]);
    const wr = putOnBattlefield(s0, ap, research());
    const bolts = s0.players[ap]!.hand.filter((id) => nameOf(s0, id) === "Lightning Bolt");
    s0.players[ap]!.hand = bolts;
    onTop(s0, ap, opt());
    let s = settle(run(s0, planActivate(s0, ap, wr, 1)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.objects[bolts[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).toHaveLength(0);
    expect(s.log.some((l) => /shuffles/.test(l.text))).toBe(true);
  });
});

describe("Moonlight Bargain: each card kept costs a payment of 2 life; the others go to the graveyard", () => {
  it("compiles", () => supported(bargain()));

  it("keeping three of five: 6 life in three payments, the three into your hand and two into your graveyard", () => {
    const { s: s0, ap, ids } = setup([bargain()]);
    const opp = others(s0, ap)[0]!;
    putOnBattlefield(s0, opp, exquisite());
    const top = s0.players[ap]!.library.slice(0, 5);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 5 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([...top].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: top.slice(0, 3) });
    for (const id of top.slice(0, 3)) expect(s.objects[id]!.zone).toBe("hand");
    for (const id of top.slice(3)) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).toHaveLength(hand - 1 + 3);
    expect(s.players[ap]!.life).toBe(34);
    // Three payments, so three life losses: Exquisite Blood triggers three times.
    const waiting = [...s.stack, ...s.triggerQueue].filter((x) => JSON.stringify(x).includes("Exquisite Blood"));
    expect(waiting).toHaveLength(3);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(46);
  });

  it("no more cards than the life can pay for (CR 119.4): with 5 life, at most two", () => {
    const { s: s0, ap, ids } = setup([bargain()]);
    s0.players[ap]!.life = 5;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
  });

  it("a player who can't lose life can't pay (CR 119.8): all five go to the graveyard", () => {
    const { s: s0, ap, ids } = setup([bargain()]);
    putOnBattlefield(s0, ap, emperion());
    const top = s0.players[ap]!.library.slice(0, 5);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    for (const id of top) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40);
  });

  it("a bot keeps cards while it stays at 10 life or more", () => {
    const { s: s0, ap, ids } = setup([bargain()]);
    s0.players[ap]!.life = 15;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const acts = botActions(s, ap);
    const found = (acts[0] as { found: string[] }).found;
    expect(found.length).toBeLessThanOrEqual(2);
    s = settle(act(s, acts[0]!));
    expect(s.players[ap]!.life).toBeGreaterThanOrEqual(10);
  });
});

describe("Spreading Plague: the other creatures sharing a color with the creature that entered are destroyed", () => {
  it("compiles", () => supported(plague()));

  it("a red creature entering destroys every other red creature, anyone's, but not itself, a green one or a colorless one", () => {
    const { s: s0, ap, ids } = setup([giant()]);
    putOnBattlefield(s0, ap, plague());
    const opp = others(s0, ap)[0]!;
    const theirGiant = putOnBattlefield(s0, opp, giant());
    const myGiant = putOnBattlefield(s0, ap, giant());
    const theirBears = putOnBattlefield(s0, opp, bears());
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[theirGiant]!.zone).toBe("graveyard");
    expect(s.objects[myGiant]!.zone).toBe("graveyard");
    expect(s.objects[theirBears]!.zone).toBe("battlefield");
    expect(s.objects[thopter]!.zone).toBe("battlefield");
  });

  it("a colorless creature entering shares a color with nothing", () => {
    const { s: s0, ap, ids } = setup([ornithopter()]);
    putOnBattlefield(s0, ap, plague());
    const opp = others(s0, ap)[0]!;
    const theirs = [putOnBattlefield(s0, opp, giant()), putOnBattlefield(s0, opp, bears()), putOnBattlefield(s0, opp, ornithopter())];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (const id of theirs) expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("they can't be regenerated (CR 701.19c)", () => {
    const { s: s0, ap, ids } = setup([regenerate(), giant()]);
    putOnBattlefield(s0, ap, plague());
    const opp = others(s0, ap)[0]!;
    const theirGiant = putOnBattlefield(s0, opp, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirGiant)])));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[theirGiant]!.zone).toBe("graveyard");
  });

  it("if the creature is gone by then, its colors as it last existed are used (CR 608.2h)", () => {
    const { s: s0, ap, ids } = setup([giant(), murder()]);
    putOnBattlefield(s0, ap, plague());
    const opp = others(s0, ap)[0]!;
    const theirGiant = putOnBattlefield(s0, opp, giant());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.stack.some((x) => x.kind !== "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[theirGiant]!.zone).toBe("graveyard");
  });
});

describe("Soulgorger Orgg: you lose all but 1 life; as it leaves, you gain the life it took", () => {
  it("compiles", () => supported(orgg()));

  it("from 40 down to 1, and back up by 39 when it leaves", () => {
    const { s: s0, ap, ids } = setup([orgg(), boomerang()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(1);
    s.players[ap]!.life = 3;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(42);
  });

  it("only the life its own enters ability took (CR 607.1): if it leaves before that resolves, you gain none", () => {
    const { s: s0, ap, ids } = setup([orgg(), boomerang()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.stack.some((x) => x.kind !== "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(1);
  });

  it("a player who can't lose life loses none, and gains none back", () => {
    const { s: s0, ap, ids } = setup([orgg(), boomerang()]);
    const emp = putOnBattlefield(s0, ap, emperion());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(40);
    s.battlefield.splice(s.battlefield.indexOf(emp), 1);
    s.objects[emp]!.zone = "exile";
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.players[ap]!.life).toBe(40);
  });
});

/** To the declare attackers step with these attacks declared, the triggers they caused resolved. */
const attackWith = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return settle(act(s, { type: "declareAttackers", player: ap, attacks }));
};

describe("Mercadia's Downfall: each attacking creature counts its own defending player's nonbasic lands (CR 802.2a)", () => {
  it("compiles", () => supported(downfall()));

  it("an attacker of each of two opponents gets its own bonus; an attacker of a planeswalker counts that planeswalker's controller", () => {
    const { s: s0, ap, ids } = setup([downfall()]);
    const [o1, o2] = others(s0, ap);
    for (const d of [commandTower(), steamVents()]) putOnBattlefield(s0, o1!, d);
    putOnBattlefield(s0, o2!, commandTower());
    putOnBattlefield(s0, o2!, island);
    const jace = putOnBattlefield(s0, o1!, jaceB());
    s0.objects[jace]!.counters = { loyalty: 3 };
    const b = putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, ap, giant());
    const g2 = putOnBattlefield(s0, ap, giant());
    const idle = putOnBattlefield(s0, ap, bears());
    let s = attackWith(s0, ap, [{ attacker: b, defender: o1! }, { attacker: g, defender: o2! }, { attacker: g2, defender: o1!, planeswalker: jace }]);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(s, b)).toBe("4/2");
    expect(pt(s, g)).toBe("4/3");
    expect(pt(s, g2)).toBe("5/3");
    expect(pt(s, idle)).toBe("2/2");
    // Counted once, as it resolved (CR 608.2h).
    putOnBattlefield(s, o2!, commandTower());
    expect(pt(s, g)).toBe("4/3");
  });
});

describe("Jurin, Leading the Charge: each attacker of a player gets +1/+0 for each creature that player controls", () => {
  it("compiles", () => supported(jurin()));

  it("Jurin and a creature attacking another opponent each count their own player's creatures; one attacking a planeswalker gets nothing", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = others(s0, ap);
    const j = putOnBattlefield(s0, ap, jurin());
    const b = putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, ap, giant());
    putOnBattlefield(s0, o1!, bears());
    putOnBattlefield(s0, o1!, ornithopter());
    putOnBattlefield(s0, o2!, bears());
    const jace = putOnBattlefield(s0, o2!, jaceB());
    s0.objects[jace]!.counters = { loyalty: 3 };
    const s = attackWith(s0, ap, [{ attacker: j, defender: o1! }, { attacker: b, defender: o2! }, { attacker: g, defender: o2!, planeswalker: jace }]);
    expect(pt(s, j)).toBe("6/6");
    expect(pt(s, b)).toBe("3/2");
    expect(pt(s, g)).toBe("3/3");
    expect(characteristics(s, s.objects[j]!).name).toBe("Jurin, Leading the Charge");
  });
});

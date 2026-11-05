// Round 276, from the top of the popularity list's skipped cards: Skyfire Phoenix ("When you cast your commander", from
// the graveyard, CR 903.3), Wisecrack and Cut Propulsion ("deals damage equal to its power to itself", then a check of the
// creature as it resolves, CR 608.2c), Fateful Handoff (draw by a target's mana value, then an opponent you choose gains
// control of it), Step Between Worlds and Turtles in Time ("each player may shuffle their hand and graveyard into their
// library", then those who did draw seven, rulings), Luminate Primordial (each opponent gains life equal to the power of
// their creature exiled, as it last existed, rulings), Breaking of the Fellowship (a creature an opponent controls deals
// damage to another creature that player controls), Council's Deliberation ("whenever you scry, if you control an Island"
// from your graveyard), Braids's Frightful Return (chapter III's "may sacrifice ... If they don't, they lose 2 life and you
// draw a card") and Goblin Assassin ("each player flips a coin": flips no one wins or loses, rulings).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, castProblem, planActivate, characteristics, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const C = {
  phoenix: {"oracleId": "8fdb3350-a6ff-4d02-a649-10663436c40f", "name": "Skyfire Phoenix", "manaCost": "{2}{R}{R}", "cmc": 4, "typeLine": "Creature — Phoenix", "supertypes": [], "types": ["Creature"], "subtypes": ["Phoenix"], "oracleText": "Flying, haste\nWhen you cast your commander, return this card from your graveyard to the battlefield.", "power": "3", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Flying", "Haste"], "imageUrl": "https://cards.scryfall.io/normal/front/6/0/605b0d7d-4ece-4ad8-bf59-86ac121ccafe.jpg?1783932804", "artUrl": "https://cards.scryfall.io/art_crop/front/6/0/605b0d7d-4ece-4ad8-bf59-86ac121ccafe.jpg?1783932804", "commanderLegal": "legal", "set": "c19", "releasedAt": "2019-08-23", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
  wisecrack: {"oracleId": "e9c9a445-4386-4616-ad00-f08064d73dcd", "name": "Wisecrack", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Target creature deals damage equal to its power to itself. If that creature is attacking, Wisecrack deals 2 damage to that creature's controller.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/8/f/8f452dac-bf22-4010-8a10-3c1cfa7d4df6.jpg?1783905329", "artUrl": "https://cards.scryfall.io/art_crop/front/8/f/8f452dac-bf22-4010-8a10-3c1cfa7d4df6.jpg?1783905329", "commanderLegal": "legal", "set": "spm", "releasedAt": "2025-09-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  cut: {"oracleId": "cf3234f2-09d7-4d8b-b871-3bf0fcb75b6d", "name": "Cut Propulsion", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Target creature deals damage to itself equal to its power. If that creature has flying, it deals twice that much damage to itself instead.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/d/9/d96f1c41-3d11-48a8-b962-db46a2d054de.jpg?1783905956", "artUrl": "https://cards.scryfall.io/art_crop/front/d/9/d96f1c41-3d11-48a8-b962-db46a2d054de.jpg?1783905956", "commanderLegal": "legal", "set": "eoe", "releasedAt": "2025-08-01", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  handoff: {"oracleId": "1ecde43f-e418-437b-8b8f-efe120f96cb3", "name": "Fateful Handoff", "manaCost": "{3}{B}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw cards equal to the mana value of target artifact or creature you control. An opponent gains control of that permanent.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/0/b/0bbed8f9-3615-428b-8d0d-18291c5a99be.jpg?1783920092", "artUrl": "https://cards.scryfall.io/art_crop/front/0/b/0bbed8f9-3615-428b-8d0d-18291c5a99be.jpg?1783920092", "commanderLegal": "legal", "set": "bro", "releasedAt": "2022-11-18", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
  step: {"oracleId": "48b43d53-9a8a-47a2-8610-a54d276d7be7", "name": "Step Between Worlds", "manaCost": "{3}{U}{U}", "cmc": 5, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Each player may shuffle their hand and graveyard into their library. Each player who does draws seven cards. Exile Step Between Worlds.\nPlot {4}{U}{U} (You may pay {4}{U}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Plot"], "imageUrl": "https://cards.scryfall.io/normal/front/7/0/70ea2054-3d22-42ce-ab50-501ef09c2128.jpg?1783911839", "artUrl": "https://cards.scryfall.io/art_crop/front/7/0/70ea2054-3d22-42ce-ab50-501ef09c2128.jpg?1783911839", "commanderLegal": "legal", "set": "otj", "releasedAt": "2024-04-19", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
  turtles: {"oracleId": "803971e6-67f3-4fda-aeb6-69ef8ea4b54e", "name": "Turtles in Time", "manaCost": "{5}{U}{U}", "cmc": 7, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Return all creatures to their owners' hands. Each player may shuffle their hand and graveyard into their library, then each player who does draws seven cards.\nExile Turtles in Time.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/b/d/bdb3efe7-7b12-4503-83e9-7977eb099db5.jpg?1783904110", "artUrl": "https://cards.scryfall.io/art_crop/front/b/d/bdb3efe7-7b12-4503-83e9-7977eb099db5.jpg?1783904110", "commanderLegal": "legal", "set": "tmt", "releasedAt": "2026-03-06", "rarity": "mythic", "layout": "normal", "gameChanger": false} as CardDef,
  luminate: {"oracleId": "c1bc819a-f291-4b55-94f7-269f160ce76b", "name": "Luminate Primordial", "manaCost": "{5}{W}{W}", "cmc": 7, "typeLine": "Creature — Avatar", "supertypes": [], "types": ["Creature"], "subtypes": ["Avatar"], "oracleText": "Vigilance\nWhen this creature enters, for each opponent, exile up to one target creature that player controls and that player gains life equal to its power.", "power": "4", "toughness": "7", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Vigilance"], "imageUrl": "https://cards.scryfall.io/normal/front/b/0/b0747b12-c75a-4fdf-a881-f2383a23ccdd.jpg?1783940142", "artUrl": "https://cards.scryfall.io/art_crop/front/b/0/b0747b12-c75a-4fdf-a881-f2383a23ccdd.jpg?1783940142", "commanderLegal": "legal", "set": "gtc", "releasedAt": "2013-02-01", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
  breaking: {"oracleId": "96e081d2-ec72-41fc-ad81-2e31ab823ae0", "name": "Breaking of the Fellowship", "manaCost": "{1}{R}", "cmc": 2, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Target creature an opponent controls deals damage equal to its power to another target creature that player controls. The Ring tempts you.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/1/3/130f60d0-4fac-4e4e-a938-58f3b96e5335.jpg?1783916288", "artUrl": "https://cards.scryfall.io/art_crop/front/1/3/130f60d0-4fac-4e4e-a938-58f3b96e5335.jpg?1783916288", "commanderLegal": "legal", "set": "ltr", "releasedAt": "2023-06-23", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef,
  council: {"oracleId": "3280488d-e94b-4d53-b279-c32ed711d4bc", "name": "Council's Deliberation", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Draw a card.\nWhenever you scry, if you control an Island, you may exile this card from your graveyard. If you do, draw a card.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/6/5/651503a2-5d1e-408a-9cdc-0cee05ab3ef0.jpg?1783916320", "artUrl": "https://cards.scryfall.io/art_crop/front/6/5/651503a2-5d1e-408a-9cdc-0cee05ab3ef0.jpg?1783916320", "commanderLegal": "legal", "set": "ltr", "releasedAt": "2023-06-23", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  braids: {"oracleId": "4567a42a-aa1c-4ca2-b5e2-b09acac3f276", "name": "Braids's Frightful Return", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Enchantment — Saga", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Saga"], "oracleText": "Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don't trigger. Sacrifice after III.)\nI — You may sacrifice a creature. If you do, each opponent discards a card.\nII — Return target creature card from your graveyard to your hand.\nIII — Target opponent may sacrifice a nonland, nontoken permanent of their choice. If they don't, they lose 2 life and you draw a card.", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Read Ahead"], "imageUrl": "https://cards.scryfall.io/normal/front/4/9/49aa8d4c-04e9-4f38-9786-2c9ad735dd72.jpg?1783921335", "artUrl": "https://cards.scryfall.io/art_crop/front/4/9/49aa8d4c-04e9-4f38-9786-2c9ad735dd72.jpg?1783921335", "commanderLegal": "legal", "set": "dmu", "releasedAt": "2022-09-09", "rarity": "uncommon", "layout": "saga", "gameChanger": false} as CardDef,
  assassin: {"oracleId": "faf9bb36-e537-42a8-b9ee-bf2c50b0e5bd", "name": "Goblin Assassin", "manaCost": "{3}{R}{R}", "cmc": 5, "typeLine": "Creature — Goblin Assassin", "supertypes": [], "types": ["Creature"], "subtypes": ["Goblin", "Assassin"], "oracleText": "Whenever this creature or another Goblin enters, each player flips a coin. Each player whose coin comes up tails sacrifices a creature of their choice.", "power": "2", "toughness": "2", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/5/7/57ec836f-6dcf-45f9-8e95-487762742a1e.jpg?1783944908", "artUrl": "https://cards.scryfall.io/art_crop/front/5/7/57ec836f-6dcf-45f9-8e95-487762742a1e.jpg?1783944908", "commanderLegal": "legal", "set": "lgn", "releasedAt": "2003-02-03", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  bears: {"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef,
  bolt: {"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  forest: {"oracleId": "b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6", "name": "Forest", "manaCost": "", "cmc": 0, "typeLine": "Basic Land — Forest", "supertypes": ["Basic"], "types": ["Land"], "subtypes": ["Forest"], "oracleText": "({T}: Add {G}.)", "colors": [], "colorIdentity": ["G"], "keywords": [], "producedMana": ["G"], "imageUrl": "https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689", "artUrl": "https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689", "commanderLegal": "legal", "set": "trk", "releasedAt": "2026-11-13", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef,
  island: {"oracleId": "b2c6aa39-2d2a-459c-a555-fb48ba993373", "name": "Island", "manaCost": "", "cmc": 0, "typeLine": "Basic Land — Island", "supertypes": ["Basic"], "types": ["Land"], "subtypes": ["Island"], "oracleText": "({T}: Add {U}.)", "colors": [], "colorIdentity": ["U"], "keywords": [], "producedMana": ["U"], "imageUrl": "https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646", "artUrl": "https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646", "commanderLegal": "legal", "set": "trk", "releasedAt": "2026-11-13", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef,
  opt: {"oracleId": "713332c1-5bd8-400f-bfff-c1ca0697a043", "name": "Opt", "manaCost": "{U}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Scry"], "imageUrl": "https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078", "artUrl": "https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078", "commanderLegal": "legal", "set": "sld", "releasedAt": "2025-07-25", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
  solring: {"oracleId": "6ad8011d-3471-4369-9d68-b264cc027487", "name": "Sol Ring", "manaCost": "{1}", "cmc": 1, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Add {C}{C}.", "colors": [], "colorIdentity": [], "keywords": [], "producedMana": ["C"], "imageUrl": "https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446", "artUrl": "https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446", "commanderLegal": "legal", "set": "frc", "releasedAt": "2026-10-02", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  giant: {"oracleId": "342199e0-15b6-4824-83da-25caef2592b3", "name": "Hill Giant", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Giant", "supertypes": [], "types": ["Creature"], "subtypes": ["Giant"], "oracleText": "", "power": "3", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018", "artUrl": "https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018", "commanderLegal": "legal", "set": "10e", "releasedAt": "2007-07-13", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef,
  drake: {"oracleId": "d6ffdaf0-ac08-4de9-bbce-2eab2f86bcca", "name": "Wind Drake", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Creature — Drake", "supertypes": [], "types": ["Creature"], "subtypes": ["Drake"], "oracleText": "Flying", "power": "2", "toughness": "2", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211", "artUrl": "https://cards.scryfall.io/art_crop/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211", "commanderLegal": "legal", "set": "kld", "releasedAt": "2016-09-30", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef,
  vampire: {"oracleId": "feb244f8-bcb1-44cf-9940-2719221a7309", "name": "Vampire Nighthawk", "manaCost": "{1}{B}{B}", "cmc": 3, "typeLine": "Creature — Vampire Shaman", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire", "Shaman"], "oracleText": "Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)", "power": "2", "toughness": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Deathtouch", "Flying", "Lifelink"], "imageUrl": "https://cards.scryfall.io/normal/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148", "artUrl": "https://cards.scryfall.io/art_crop/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148", "commanderLegal": "legal", "set": "zen", "releasedAt": "2009-10-02", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  raging: {"oracleId": "30997b43-fc13-41d3-8064-1ccc2cb6fd2b", "name": "Raging Goblin", "manaCost": "{R}", "cmc": 1, "typeLine": "Creature — Goblin Berserker", "supertypes": [], "types": ["Creature"], "subtypes": ["Goblin", "Berserker"], "oracleText": "Haste (This creature can attack and {T} as soon as it comes under your control.)", "power": "1", "toughness": "1", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Haste"], "imageUrl": "https://cards.scryfall.io/normal/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461", "artUrl": "https://cards.scryfall.io/art_crop/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461", "commanderLegal": "legal", "set": "p02", "releasedAt": "1998-06-24", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef,
  edgar: {"oracleId": "264efed9-65ab-40ad-877f-c6c25ca0281e", "name": "Edgar, King of Figaro", "manaCost": "{4}{U}{U}", "cmc": 6, "typeLine": "Legendary Creature — Human Artificer Noble", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Artificer", "Noble"], "oracleText": "When Edgar enters, draw a card for each artifact you control.\nTwo-Headed Coin — The first time you flip one or more coins each turn, those coins come up heads and you win those flips.", "power": "4", "toughness": "5", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Two-Headed Coin"], "imageUrl": "https://cards.scryfall.io/normal/front/9/5/950ee302-5512-43c5-ac7c-b2b06f4177bf.jpg?1783906638", "artUrl": "https://cards.scryfall.io/art_crop/front/9/5/950ee302-5512-43c5-ac7c-b2b06f4177bf.jpg?1783906638", "commanderLegal": "legal", "set": "fin", "releasedAt": "2025-06-13", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
  rhys: {"oracleId": "9f013b5d-fff0-4c50-8621-158b6dc34834", "name": "Rhys, the Evermore", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Legendary Creature — Elf Warrior", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Elf", "Warrior"], "oracleText": "Flash\nWhen Rhys enters, another target creature you control gains persist until end of turn. (When it dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)\n{W}, {T}: Remove any number of counters from target creature you control. Activate only as a sorcery.", "power": "2", "toughness": "2", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Flash"], "imageUrl": "https://cards.scryfall.io/normal/front/a/7/a7072412-4aa2-40ef-a267-bd717551a42b.jpg?1783904499", "artUrl": "https://cards.scryfall.io/art_crop/front/a/7/a7072412-4aa2-40ef-a267-bd717551a42b.jpg?1783904499", "commanderLegal": "legal", "set": "ecl", "releasedAt": "2026-01-23", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
  mutiny: {"oracleId": "647b4cb4-569d-4938-b56c-31a70e68ee41", "name": "Mutiny", "manaCost": "{R}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Target creature an opponent controls deals damage equal to its power to another target creature that player controls.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/0/1/010711a0-5e95-4a8c-816f-e314f2a909ef.jpg?1783935297", "artUrl": "https://cards.scryfall.io/art_crop/front/0/1/010711a0-5e95-4a8c-816f-e314f2a909ef.jpg?1783935297", "commanderLegal": "legal", "set": "rix", "releasedAt": "2018-01-19", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef,
};
const twoThree = card("Test Two-Three", "Creature — Bear", "{2}{G}", { power: "2", toughness: "3" });

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
/** The other players in turn order after `pid`. */
const others = (s: GameState, pid: PlayerId) => { const i = s.turnOrder.indexOf(pid); return [...s.turnOrder.slice(i + 1), ...s.turnOrder.slice(0, i)]; };
const logged = (s: GameState, re: RegExp) => s.log.map((l) => l.text).filter((t) => re.test(t));

describe("round 276 cards", () => {
  it("all compile fully", () => supported(C.phoenix, C.wisecrack, C.cut, C.handoff, C.step, C.turtles, C.luminate, C.breaking, C.council, C.braids, C.assassin, C.rhys, C.mutiny));
});

describe("Skyfire Phoenix: \"When you cast your commander, return this card from your graveyard to the battlefield\"", () => {
  it("casting your commander from the command zone returns it, before the commander resolves (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const phoenix = into(s0, ap, C.phoenix, "graveyard");
    const cmdr = s0.players[ap]!.command[0]!;
    let s = run(s0, planCast(s0, ap, cmdr));
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThanOrEqual(1);
    // Its trigger is above the commander spell: it resolves first.
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && zone(s, phoenix) === "graveyard"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, phoenix)).toBe("battlefield");
    expect(zone(s, cmdr)).toBe("stack");
    s = pass(s);
    expect(zone(s, cmdr)).toBe("battlefield");
  });

  it("not for another spell, or for an opponent's commander", () => {
    const { s: s0, ap, ids, opp } = setup([C.bears]);
    const phoenix = into(s0, ap, C.phoenix, "graveyard");
    let s = pass(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, phoenix)).toBe("graveyard");
    // An opponent's commander, cast with the opponent's mana at instant speed isn't possible; check the trigger instead.
    const cmdr = s.players[opp]!.command[0]!;
    expect(s.objects[cmdr]!.isCommander).toBe(true);
    s = passUntil(s, "main1", opp);
    for (const l of [C.forest, C.forest]) putOnBattlefield(s, opp, l);
    s = pass(run(s, planCast(s, opp, cmdr)));
    expect(zone(s, cmdr)).toBe("battlefield");
    expect(zone(s, phoenix)).toBe("graveyard");
  });
});

describe("Wisecrack and Cut Propulsion: a creature deals damage equal to its power to itself", () => {
  it("Wisecrack: a creature that isn't attacking only hurts itself", () => {
    const { s: s0, ap, ids, opp } = setup([C.wisecrack]);
    const giant = putOnBattlefield(s0, opp, C.giant);
    const s = pass(run(s0, planCast(s0, ap, ids[0]!, [target(giant)])));
    expect(zone(s, giant)).toBe("graveyard");
    expect(life(s, opp)).toBe(40);
  });

  it("Wisecrack: an attacking creature's controller is dealt 2 damage too", () => {
    const { s: s0, ap, ids, opp } = setup([C.wisecrack]);
    const giant = putOnBattlefield(s0, ap, C.giant);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }] });
    expect(s.objects[giant]!.attacking).toBe(opp);
    s = pass(run(s, planCast(s, ap, ids[0]!, [target(giant)])));
    expect(zone(s, giant)).toBe("graveyard");
    expect(life(s, ap)).toBe(38);
    expect(life(s, opp)).toBe(40);
  });

  it("Cut Propulsion: twice its power with flying, from the creature (its lifelink applies); once without", () => {
    const { s: s0, ap, ids, opp } = setup([C.cut, C.cut]);
    const hawk = putOnBattlefield(s0, opp, C.vampire);
    const plain = putOnBattlefield(s0, opp, twoThree);
    let s = pass(run(s0, planCast(s0, ap, ids[0]!, [target(hawk)])));
    // 2 power, flying: 4 damage to a 2/3, and its controller gains 4 from lifelink.
    expect(zone(s, hawk)).toBe("graveyard");
    expect(life(s, opp)).toBe(44);
    s = pass(run(s, planCast(s, ap, ids[1]!, [target(plain)])));
    expect(zone(s, plain)).toBe("battlefield");
    expect(s.objects[plain]!.damage).toBe(2);
  });
});

describe("Fateful Handoff: draw cards equal to the target's mana value, then an opponent gains control of it", () => {
  it("draws four for Hill Giant, then the opponent you choose controls it for good", () => {
    const { s: s0, ap, ids } = setup([C.handoff]);
    const giant = putOnBattlefield(s0, ap, C.giant);
    const hand = s0.players[ap]!.hand.length;
    let s = pass(run(s0, planCast(s0, ap, ids[0]!, [target(giant)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    const to = others(s, ap)[2]!;
    s = pass(act(s, { type: "chooseOption", player: ap, choice: String(to) }));
    // Handoff left the hand (−1), four drawn.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 4);
    expect(characteristics(s, s.objects[giant]!).controller).toBe(to);
    expect(s.objects[giant]!.owner).toBe(ap);
  });

  it("bots don't give their own creatures away for cards", () => {
    const { s: s0, ap, ids } = setup([C.handoff]);
    putOnBattlefield(s0, ap, C.giant);
    // The bot would cast its commander first.
    s0.players[ap]!.command = [];
    // Nothing else to cast.
    s0.players[ap]!.hand = [ids[0]!];
    let s = s0;
    const acts: Action[] = [];
    for (let i = 0; i < 20 && s.step === "main1" && !s.stack.length && waitingOn(s) === ap; i++) {
      const next = botActions(s, ap);
      acts.push(...next);
      if (next.some((a) => a.type === "passPriority")) break;
      for (const a of next) s = act(s, a);
    }
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
  });

  it("only an artifact or creature you control can be the target", () => {
    const { s: s0, ap, ids, opp } = setup([C.handoff]);
    const theirs = putOnBattlefield(s0, opp, C.giant);
    const ring = putOnBattlefield(s0, ap, C.solring);
    expect(castProblem(s0, ap, ids[0]!, [target(theirs)])).toBeTruthy();
    expect(planCast(s0, ap, ids[0]!, [target(ring)])).not.toBeNull();
  });
});

describe("Step Between Worlds and Turtles in Time: each player may shuffle their hand and graveyard into their library", () => {
  it("each decides in turn order; those who did shuffle and draw seven, the others keep their cards; it's exiled", () => {
    const { s: s0, ap, ids } = setup([C.step, C.bears, C.bolt]);
    const yard = into(s0, ap, C.giant, "graveyard");
    const [b, c, d] = others(s0, ap);
    const bHand = s0.players[b!]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = pass(s);
    const answers: [PlayerId, boolean][] = [[ap, true], [b!, false], [c!, true], [d!, false]];
    for (const [pid, yes] of answers) {
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: pid, wheel: 7 });
      s = act(s, { type: "chooseMay", player: pid, yes });
    }
    s = pass(s);
    expect(s.players[ap]!.hand).toHaveLength(7);
    expect(s.players[ap]!.graveyard).toHaveLength(0);
    expect(zone(s, yard)).not.toBe("graveyard");
    expect(s.players[b!]!.hand).toHaveLength(bHand);
    expect(s.players[c!]!.hand).toHaveLength(7);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Turtles in Time: all creatures return to their owners' hands first, then the same choice", () => {
    const { s: s0, ap, ids, opp } = setup([C.turtles]);
    const mine = putOnBattlefield(s0, ap, C.bears);
    const theirs = putOnBattlefield(s0, opp, C.giant);
    let s = pass(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, mine)).toBe("hand");
    expect(zone(s, theirs)).toBe("hand");
    for (let i = 0; i < 4; i++) {
      const p = s.pending as Extract<GameState["pending"], { kind: "chooseMay" }>;
      expect(p.kind).toBe("chooseMay");
      s = act(s, { type: "chooseMay", player: p.player, yes: p.player === opp });
    }
    s = pass(s);
    expect(zone(s, theirs)).toBe("library");
    expect(s.players[opp]!.hand).toHaveLength(7);
    expect(zone(s, mine)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("exile");
  });
});

describe("Luminate Primordial: for each opponent, exile up to one target creature that player controls and that player gains life equal to its power", () => {
  it("each opponent gains life equal to their own exiled creature's power, as it last existed (rulings)", () => {
    const { s: s0, ap, ids } = setup([C.luminate]);
    const [b, c, d] = others(s0, ap);
    const giant = putOnBattlefield(s0, b!, C.giant);
    const bears = putOnBattlefield(s0, c!, C.bears);
    const dBears = putOnBattlefield(s0, d!, C.bears);
    let s = pass(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // D's creature isn't chosen: up to one each.
    s = pass(act(s, { type: "chooseTargets", player: ap, targets: [target(giant), target(bears), { kind: "none" }] }));
    expect(zone(s, giant)).toBe("exile");
    expect(zone(s, bears)).toBe("exile");
    expect(zone(s, dBears)).toBe("battlefield");
    expect(life(s, b!)).toBe(43);
    expect(life(s, c!)).toBe(42);
    expect(life(s, d!)).toBe(40);
    expect(life(s, ap)).toBe(40);
  });

  it("a creature of one opponent can't be chosen for another", () => {
    const { s: s0, ap, ids } = setup([C.luminate]);
    const [b] = others(s0, ap);
    const giant = putOnBattlefield(s0, b!, C.giant);
    const giant2 = putOnBattlefield(s0, b!, C.giant);
    let s = pass(run(s0, planCast(s0, ap, ids[0]!)));
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(giant), target(giant2), { kind: "none" }] })).toThrow();
    s = pass(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }, { kind: "none" }, { kind: "none" }] }));
    expect(zone(s, giant)).toBe("battlefield");
    expect(life(s, b!)).toBe(40);
  });
});

describe("Breaking of the Fellowship: a creature an opponent controls deals damage equal to its power to another creature that player controls", () => {
  it("Hill Giant kills its controller's Grizzly Bears, then the Ring tempts you", () => {
    const { s: s0, ap, ids, opp } = setup([C.breaking]);
    const giant = putOnBattlefield(s0, opp, C.giant);
    const bears = putOnBattlefield(s0, opp, C.bears);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(giant), target(bears)]));
    s = settle(s);
    expect(zone(s, bears)).toBe("graveyard");
    expect(zone(s, giant)).toBe("battlefield");
    expect(s.objects[giant]!.damage).toBe(0);
    expect(logged(s, /^The Ring tempts/)).toHaveLength(1);
  });

  it("Mutiny, the same: with either target illegal as it resolves, no damage is dealt (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([C.mutiny, C.mutiny]);
    const giant = putOnBattlefield(s0, opp, C.giant);
    const bears = putOnBattlefield(s0, opp, C.bears);
    const bears2 = putOnBattlefield(s0, opp, C.bears);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(giant), target(bears)]));
    // The first target leaves before it resolves.
    s.objects[giant]!.zone = "hand";
    s.battlefield.splice(s.battlefield.indexOf(giant), 1);
    s.players[opp]!.hand.push(giant);
    invalidateCharacteristics(s);
    s = pass(s);
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.damage).toBe(0);
    // A second one, Grizzly Bears to Grizzly Bears: 2 damage.
    s = pass(run(s, planCast(s, ap, ids[1]!, [target(bears2), target(bears)])));
    expect(zone(s, bears)).toBe("graveyard");
    expect(zone(s, bears2)).toBe("battlefield");
  });

  it("the second creature must have the same controller as the first, and not be it", () => {
    const { s: s0, ap, ids, opp } = setup([C.breaking]);
    const giant = putOnBattlefield(s0, opp, C.giant);
    const other = putOnBattlefield(s0, others(s0, ap)[1]!, C.bears);
    const mine = putOnBattlefield(s0, ap, C.bears);
    expect(castProblem(s0, ap, ids[0]!, [target(giant), target(other)])).toBeTruthy();
    expect(castProblem(s0, ap, ids[0]!, [target(giant), target(giant)])).toBeTruthy();
    expect(castProblem(s0, ap, ids[0]!, [target(mine), target(giant)])).toBeTruthy();
  });
});

describe("Council's Deliberation: \"Whenever you scry, if you control an Island, you may exile this card from your graveyard. If you do, draw a card.\"", () => {
  it("scrying with an Island: exile it from the graveyard and draw", () => {
    const { s: s0, ap, ids } = setup([C.opt]);
    const council = into(s0, ap, C.council, "graveyard");
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseMay"; i++) {
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, council)).toBe("exile");
    // Opt left the hand; Opt drew one, Council's Deliberation one.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("no Island, no trigger (an intervening if, CR 603.4)", () => {
    const { s: s0, ap, ids } = setup([C.opt]);
    for (const id of [...s0.battlefield]) if (characteristics(s0, s0.objects[id]!).subtypes.includes("Island") && s0.objects[id]!.controller === ap) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      delete s0.objects[id];
    }
    s0.players[ap]!.manaPool.U = 1;
    invalidateCharacteristics(s0);
    const council = into(s0, ap, C.council, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, council)).toBe("graveyard");
  });
});

describe("Braids's Frightful Return, chapter III: the opponent may sacrifice a nonland, nontoken permanent; if they don't, they lose 2 life and you draw", () => {
  const toChapterThree = () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, C.braids);
    s0.objects[saga]!.counters.lore = 2;
    const giant = putOnBattlefield(s0, opp, C.giant);
    let s = passUntil(passUntil(s0, "upkeep", opp), "main1", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = pass(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: opp });
    return { s, ap, opp, giant };
  };

  it("declining: they lose 2 life and you draw a card", () => {
    const { s: s1, ap, opp, giant } = toChapterThree();
    const hand = s1.players[ap]!.hand.length;
    const s = settle(act(s1, { type: "chooseOption", player: opp, choice: "none" }));
    expect(life(s, opp)).toBe(38);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(zone(s, giant)).toBe("battlefield");
  });

  it("sacrificing: nothing else happens", () => {
    const { s: s1, ap, opp, giant } = toChapterThree();
    const hand = s1.players[ap]!.hand.length;
    const p = s1.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.options).toEqual(["0", "none"]);
    // Its only nonland, nontoken permanent.
    const s = settle(act(s1, { type: "chooseOption", player: opp, choice: "0" }));
    expect(zone(s, giant)).toBe("graveyard");
    expect(life(s, opp)).toBe(40);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Goblin Assassin: \"Whenever this creature or another Goblin enters, each player flips a coin. Each player whose coin comes up tails sacrifices a creature of their choice.\"", () => {
  it("each player flips one coin; those with tails sacrifice a creature, the others don't", () => {
    let anyTails = false;
    for (const seed of [5, 6, 7, 8]) {
      const { s: s0, ap, ids } = setup([C.assassin], seed);
      for (const pid of others(s0, ap)) putOnBattlefield(s0, pid, C.bears);
      const before = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.battlefield.filter((id) => s0.objects[id]!.controller === p && characteristics(s0, s0.objects[id]!).types.includes("Creature")).length]));
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      const flips = logged(s, /^Each player flips a coin for Goblin Assassin/);
      expect(flips).toHaveLength(1);
      const tails = s.turnOrder.filter((p) => new RegExp(`tails for [^.]*\\b${s.players[p]!.name}\\b`).test(flips[0]!));
      if (tails.length) anyTails = true;
      for (const p of s.turnOrder) {
        const now = s.battlefield.filter((id) => s.objects[id]!.controller === p && characteristics(s, s.objects[id]!).types.includes("Creature")).length;
        // The active player also has Goblin Assassin now.
        const had = before[p]! + (p === ap ? 1 : 0);
        expect(now, `seed ${seed} player ${p}`).toBe(tails.includes(p) ? had - 1 : had);
      }
    }
    expect(anyTails).toBe(true);
  });

  it("another Goblin entering triggers it; Edgar's first coins of the turn come up heads", () => {
    const { s: s0, ap, ids, opp } = setup([C.raging]);
    putOnBattlefield(s0, ap, C.assassin);
    putOnBattlefield(s0, opp, C.edgar);
    const theirBears = putOnBattlefield(s0, opp, C.bears);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const flips = logged(s, /^Each player flips a coin for Goblin Assassin/);
    expect(flips).toHaveLength(1);
    expect(flips[0]).not.toMatch(new RegExp(`\\b${s.players[opp]!.name}\\b`));
    expect(zone(s, theirBears)).toBe("battlefield");
  });
});

describe("Rhys, the Evermore: \"{W}, {T}: Remove any number of counters from target creature you control\"", () => {
  const withCounters = () => {
    const { s: s0, ap } = setup([]);
    const rhys = putOnBattlefield(s0, ap, C.rhys);
    const bears = putOnBattlefield(s0, ap, C.bears);
    s0.objects[bears]!.counters = { "+1/+1": 2, stun: 1 };
    invalidateCharacteristics(s0);
    const index = abilitiesOf(s0, s0.objects[rhys]!).activated.findIndex((a) => a.tap && a.sorcerySpeed);
    expect(index).toBeGreaterThanOrEqual(0);
    return { s0, ap, rhys, bears, index };
  };

  it("the counters are chosen one at a time, any kinds; stopping keeps the rest", () => {
    const { s0, ap, rhys, bears, index } = withCounters();
    let s = pass(run(s0, planActivate(s0, ap, rhys, index, [target(bears)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter", player: ap, about: bears });
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect([...p.options].sort()).toEqual(["+1/+1", "done", "stun"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "stun" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter" });
    s = pass(act(s, { type: "chooseOption", player: ap, choice: "done" }));
    expect(s.objects[bears]!.counters.stun ?? 0).toBe(0);
    expect(s.objects[bears]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, bears)).toBe("4/4");
    expect(s.objects[rhys]!.tapped).toBe(true);
  });

  it("as many as there are: all of them, then it stops asking", () => {
    const { s0, ap, rhys, bears, index } = withCounters();
    let s = pass(run(s0, planActivate(s0, ap, rhys, index, [target(bears)])));
    for (const k of ["+1/+1", "stun", "+1/+1"]) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter" });
      s = act(s, { type: "chooseOption", player: ap, choice: k });
    }
    s = pass(s);
    expect(s.pending).toBeNull();
    expect(Object.values(s.objects[bears]!.counters).every((n) => !n)).toBe(true);
    expect(pt(s, bears)).toBe("2/2");
  });

  it("bots take only the harmful counters off their own creature", () => {
    const { s0, ap, rhys, bears, index } = withCounters();
    let s = pass(run(s0, planActivate(s0, ap, rhys, index, [target(bears)])));
    s = settle(s);
    expect(s.objects[bears]!.counters.stun ?? 0).toBe(0);
    expect(s.objects[bears]!.counters["+1/+1"]).toBe(2);
  });
});

// Lane B round B189: Worldpurge ("Each player chooses up to seven cards in their hand, then shuffles the rest into their
// library. Each player loses all unspent mana."), Thought Prison ("Whenever a player casts a spell that shares a color or mana
// value with the exiled card"), Soulcipher Board ("Whenever a creature card is put into your graveyard from anywhere, remove
// an omen counter ... Then if it has no omen counters on it, transform it."), Grimoire Thief ("You may look at cards exiled
// with ~", "Turn all cards exiled with ~ face up. Counter all spells with those names.") and Kianne, Dean of Substance //
// Imbraham, Dean of Theory (study counters on cards in exile).

import { describe, expect, it } from "vitest";
import { act, addEffect, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, hiddenInExile, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, runStateBasedActions, tapPermanent, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const worldpurge = (): CardDef => ({"oracleId":"285ecbd5-ff7c-4919-ab0b-7fc05e5a0a0a","name":"Worldpurge","manaCost":"{4}{W/U}{W/U}{W/U}{W/U}","cmc":8,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return all permanents to their owners' hands. Each player chooses up to seven cards in their hand, then shuffles the rest into their library. Each player loses all unspent mana.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6f70fdb-264f-4545-97fa-3702168a66d4.jpg?1783942734","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6f70fdb-264f-4545-97fa-3702168a66d4.jpg?1783942734","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const prison = (): CardDef => ({"oracleId":"da1ea03f-747f-46c9-8ff5-7e85996df804","name":"Thought Prison","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Imprint — When this artifact enters, you may have target player reveal their hand. If you do, choose a nonland card from it and exile that card.\nWhenever a player casts a spell that shares a color or mana value with the exiled card, this artifact deals 2 damage to that player.","colors":[],"colorIdentity":[],"keywords":["Imprint"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/409087ef-8232-489c-8b98-b601bb0a47a4.jpg?1783944499","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/409087ef-8232-489c-8b98-b601bb0a47a4.jpg?1783944499","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const board = (): CardDef => ({"oracleId":"6469c7fd-6c0f-4233-8c38-4742ddcf3c3f","name":"Soulcipher Board // Cipherbound Spirit","manaCost":"{1}{U}","cmc":2,"typeLine":"Artifact // Creature — Spirit","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters with three omen counters on it.\n{1}{U}, {T}: Look at the top two cards of your library. Put one of them into your graveyard.\nWhenever a creature card is put into your graveyard from anywhere, remove an omen counter from this artifact. Then if it has no omen counters on it, transform it.","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a6cb130-6d2f-44ba-a390-79dd4e919864.jpg?1783924271","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a6cb130-6d2f-44ba-a390-79dd4e919864.jpg?1783924271","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Soulcipher Board","manaCost":"{1}{U}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters with three omen counters on it.\n{1}{U}, {T}: Look at the top two cards of your library. Put one of them into your graveyard.\nWhenever a creature card is put into your graveyard from anywhere, remove an omen counter from this artifact. Then if it has no omen counters on it, transform it.","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a6cb130-6d2f-44ba-a390-79dd4e919864.jpg?1783924271","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a6cb130-6d2f-44ba-a390-79dd4e919864.jpg?1783924271"},{"name":"Cipherbound Spirit","manaCost":"","typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Flying\nThis creature can block only creatures with flying.\n{3}{U}: Draw two cards, then discard a card.","power":"3","toughness":"2","colors":["U"],"colorIndicator":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/9/a/9a6cb130-6d2f-44ba-a390-79dd4e919864.jpg?1783924271","artUrl":"https://cards.scryfall.io/art_crop/back/9/a/9a6cb130-6d2f-44ba-a390-79dd4e919864.jpg?1783924271"}]}) as CardDef;
const thief = (): CardDef => ({"oracleId":"a067233b-cff0-45ae-89d9-377e94fcf3b3","name":"Grimoire Thief","manaCost":"{U}{U}","cmc":2,"typeLine":"Creature — Merfolk Rogue","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Rogue"],"oracleText":"Whenever this creature becomes tapped, exile the top three cards of target opponent's library face down.\nYou may look at cards exiled with this creature.\n{U}, Sacrifice this creature: Turn all cards exiled with this creature face up. Counter all spells with those names.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/59c4dceb-6889-4a79-87c2-98952f3478bb.jpg?1783942799","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/59c4dceb-6889-4a79-87c2-98952f3478bb.jpg?1783942799","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kianne = (): CardDef => ({"oracleId":"9eab65ee-e8be-4fa6-9634-fb03582bd745","name":"Kianne, Dean of Substance // Imbraham, Dean of Theory","manaCost":"{2}{G}","cmc":3,"typeLine":"Legendary Creature — Elf Druid // Legendary Creature — Bird Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Exile the top card of your library. If it's a land card, put it into your hand. Otherwise, put a study counter on it.\n{4}{G}: Create a 0/0 green and blue Fractal creature token. Put a +1/+1 counter on it for each different mana value among nonland cards you own in exile with study counters on them.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b45dc40-6827-46a7-a9b7-802be698d053.jpg?1783927335","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b45dc40-6827-46a7-a9b7-802be698d053.jpg?1783927335","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Kianne, Dean of Substance","manaCost":"{2}{G}","typeLine":"Legendary Creature — Elf Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Exile the top card of your library. If it's a land card, put it into your hand. Otherwise, put a study counter on it.\n{4}{G}: Create a 0/0 green and blue Fractal creature token. Put a +1/+1 counter on it for each different mana value among nonland cards you own in exile with study counters on them.","power":"2","toughness":"2","colors":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b45dc40-6827-46a7-a9b7-802be698d053.jpg?1783927335","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b45dc40-6827-46a7-a9b7-802be698d053.jpg?1783927335"},{"name":"Imbraham, Dean of Theory","manaCost":"{2}{U}{U}","typeLine":"Legendary Creature — Bird Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Bird","Wizard"],"oracleText":"Flying\n{X}{U}{U}, {T}: Exile the top X cards of your library and put a study counter on each of them. Then you may put a card you own in exile with a study counter on it into your hand.","power":"3","toughness":"3","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/8/b/8b45dc40-6827-46a7-a9b7-802be698d053.jpg?1783927335","artUrl":"https://cards.scryfall.io/art_crop/back/8/b/8b45dc40-6827-46a7-a9b7-802be698d053.jpg?1783927335"}]}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","commanderLegal":"legal","set":"ddj","releasedAt":"2012-09-07","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]}) as CardDef;
const lightning = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const treason = (): CardDef => ({"oracleId":"9d08af23-9f4a-4097-9abc-3b17475ab744","name":"Act of Treason","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f2328c4-7344-48bf-b515-977499bcfd1c.jpg?1783933686","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f2328c4-7344-48bf-b515-977499bcfd1c.jpg?1783933686","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const sol = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const islandOf = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes until the stack and triggers are done, or something asks a question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Like settle, but a bot answers every question but those `mine` says are for the test. */
const settleBots = (s: GameState, mine: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending) && !(s.pending && mine(s)); i++) s = s.pending ? run(s, botActions(s, waitingOn(s)!)) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** A card of `def` owned by `pid`, put into `where` (on top of the library). */
const place = (s: GameState, pid: PlayerId, def: CardDef, where: "graveyard" | "library" | "hand" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const castPlan = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => planCast(s, pid, id, targets, undefined, "auto", undefined, choices);
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
/** Untaps all of `pid`'s permanents (fresh mana for the next spell). */
const untapAll = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === pid) s.objects[id]!.tapped = false;
  return s;
};
const name = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;

describe("Round B189 cards are supported", () => {
  it("compiles all five", () => supported(worldpurge(), prison(), board(), thief(), kianne()));
});

describe("Worldpurge: everything back to hand, each player keeps up to seven, the rest shuffled away, mana lost", () => {
  it("each player keeps the cards they choose, in turn order, and shuffles the rest into their library", () => {
    const { s: s0, ap, ids } = setup([worldpurge()]);
    const bear = putOnBattlefield(s0, ap, bears());
    const i = s0.turnOrder.indexOf(ap);
    const others = [...s0.turnOrder.slice(i + 1), ...s0.turnOrder.slice(0, i)];
    const theirs = putOnBattlefield(s0, others[0]!, serra());
    // An opponent's floating mana goes too (CR 106.4).
    s0.players[others[1]!]!.manaPool.R = 2;
    const libs = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.library.length]));
    let s = run(s0, castPlan(s0, ap, ids[0]!));
    s = settle(s);
    // Every permanent is back in its owner's hand: your lands and Bears, their Angel.
    expect(s.battlefield.filter((id) => !s.objects[id]!.isToken)).toEqual([]);
    expect(zone(s, bear)).toBe("hand");
    expect(zone(s, theirs)).toBe("hand");
    // You choose first (APNAP, CR 101.4): up to seven of your cards.
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 7, upTo: true, keep: true });
    const hand = s.players[ap]!.hand;
    // The 14 lands and the Bears came back.
    expect(hand.length).toBe(s0.players[ap]!.hand.length - 1 + 15);
    const handCount = hand.length;
    const kept = [bear, ...hand.filter((id) => id !== bear).slice(0, 4)];
    // Eight is too many.
    expect(() => act(s, { type: "discard", player: ap, objectIds: hand.slice(0, 8) })).toThrow();
    s = act(s, { type: "discard", player: ap, objectIds: kept });
    // Then each other player, in turn order.
    expect(s.pending).toMatchObject({ kind: "discard", player: others[0], keep: true });
    s = settleBots(s);
    expect([...s.players[ap]!.hand].sort()).toEqual([...kept].sort());
    expect(s.players[ap]!.library.length).toBe(libs[ap]! + handCount - 5);
    expect(s.players[ap]!.library).not.toContain(ids[0]); // Worldpurge itself is in the graveyard
    expect(s.players[others[0]!]!.hand.length).toBeLessThanOrEqual(7);
    expect(s.players[others[0]!]!.hand.length + s.players[others[0]!]!.library.length).toBe(libs[others[0]!]! + s0.players[others[0]!]!.hand.length + 1);
    for (const p of s.turnOrder) expect(Object.values(s.players[p]!.manaPool).every((n) => n === 0), String(p)).toBe(true);
  });

  it("keeping none shuffles the whole hand in; a player with no cards in hand isn't asked", () => {
    const { s: s0, ap, ids } = setup([worldpurge()]);
    const others = s0.turnOrder.filter((p) => p !== ap);
    for (const p of others) for (const id of [...s0.players[p]!.hand]) moveObject(s0, id, "library");
    let s = settle(run(s0, castPlan(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, keep: true });
    s = act(s, { type: "discard", player: ap, objectIds: [] });
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand).toEqual([]);
    expect(s.stack).toEqual([]);
  });

  it("bots keep their best seven", () => {
    const { s: s0, ap, ids } = setup([worldpurge()]);
    let s = settle(run(s0, castPlan(s0, ap, ids[0]!)));
    s = settleBots(s);
    for (const p of s.turnOrder) expect(s.players[p]!.hand.length, String(p)).toBe(7);
  });
});

describe("Thought Prison: a spell sharing a color or mana value with the imprinted card deals 2 damage to its caster", () => {
  /** Thought Prison cast by you, imprinting Shock from `opp`'s hand. */
  const imprinted = () => {
    const { s: s0, ap, ids, opp } = setup([prison(), lightning(), opt(), divination(), ornithopter()]);
    for (const id of [...s0.players[opp]!.hand]) moveObject(s0, id, "library");
    const shockId = place(s0, opp, shock(), "hand");
    place(s0, opp, forest(), "hand");
    let s = run(s0, castPlan(s0, ap, ids[0]!));
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Only the nonland card can be chosen.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [shockId] });
    s = settle(s);
    expect(zone(s, shockId)).toBe("exile");
    return { s, ap, ids, opp, shockId };
  };

  it("a red spell, or a spell with mana value 1, deals 2 to whoever casts it; both at once still 2", async () => {
    const { s: s1, ap, ids } = imprinted();
    const life = s1.players[ap]!.life;
    untapAll(s1, ap);
    // Lightning Bolt: red and mana value 1 (rulings: 2 damage, not 4).
    let s = settle(run(s1, castPlan(s1, ap, ids[1]!, [{ kind: "player", id: s1.turnOrder.find((p) => p !== ap)! }])));
    expect(s.players[ap]!.life).toBe(life - 2);
    // Opt: blue, mana value 1.
    s = settleBots(run(s, castPlan(s, ap, ids[2]!)));
    expect(s.players[ap]!.life).toBe(life - 4);
    // Divination (blue, 3) and Ornithopter (colorless, 0) share nothing.
    s = settle(run(s, castPlan(s, ap, ids[3]!)));
    s = settle(run(s, castPlan(s, ap, ids[4]!)));
    expect(s.players[ap]!.life).toBe(life - 4);
  });

  it("another player casting one is dealt the damage", () => {
    const { s: s1, ap, ids, opp } = imprinted();
    const s0 = untapAll(s1, ap);
    const bolt = place(s0, opp, lightning(), "hand");
    putOnBattlefield(s0, opp, mountain());
    const life = s0.players[opp]!.life;
    // You cast Divination (nothing shared); they respond with Lightning Bolt.
    let s = act(run(s0, castPlan(s0, ap, ids[3]!)), { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, castPlan(s, opp, bolt, [{ kind: "player", id: ap }]));
    s = settleBots(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life - 3);
  });

  it("with nothing imprinted (you chose not to, or only lands), nothing triggers", () => {
    const { s: s0, ap, ids, opp } = setup([prison(), lightning()]);
    let s = run(s0, castPlan(s0, ap, ids[0]!));
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    const life = s.players[ap]!.life;
    s = settle(run(s, castPlan(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.life).toBe(life);
  });
});

describe("Soulcipher Board: an omen counter off for each creature card put into your graveyard, then it transforms", () => {
  it("three creature cards from anywhere turn it into Cipherbound Spirit; tokens and other graveyards don't count", () => {
    const { s: s0, ap, opp } = setup([]);
    const sb = putOnBattlefield(s0, ap, board());
    s0.objects[sb]!.counters.omen = 3;
    invalidateCharacteristics(s0);
    let s = s0;
    // A creature card from your hand.
    const b1 = place(s, ap, bears(), "hand");
    moveObject(s, b1, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[sb]!.counters.omen).toBe(2);
    // An opponent's creature card into their graveyard: no.
    const theirs = place(s, opp, bears(), "hand");
    moveObject(s, theirs, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[sb]!.counters.omen).toBe(2);
    // A creature token dying: no (rulings).
    const tok = putOnBattlefield(s, ap, bears());
    s.objects[tok]!.isToken = true;
    moveObject(s, tok, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[sb]!.counters.omen).toBe(2);
    // A noncreature card: no. A creature from the library and one dying: yes.
    const shockId = place(s, ap, shock(), "hand");
    moveObject(s, shockId, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[sb]!.counters.omen).toBe(2);
    const b2 = place(s, ap, bears(), "library");
    moveObject(s, b2, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[sb]!.counters.omen).toBe(1);
    const b3 = putOnBattlefield(s, ap, bears());
    moveObject(s, b3, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[sb]!.counters.omen ?? 0).toBe(0);
    const ch = characteristics(s, s.objects[sb]!);
    expect(ch.name).toBe("Cipherbound Spirit");
    expect(ch.types).toContain("Creature");
  });
});

describe("Grimoire Thief: face-down cards you may look at, then spells with their names countered", () => {
  const withThief = () => {
    const { s: s0, ap, ids, opp } = setup([lightning(), fireIce(), shock()]);
    const gt = putOnBattlefield(s0, ap, thief());
    // The top three of the opponent's library: Lightning Bolt, Fire // Ice, Grizzly Bears.
    const lib = s0.players[opp]!.library;
    for (const [i, d] of [lightning(), fireIce(), bears()].entries()) {
      s0.cards[d.oracleId] = d;
      s0.objects[lib[i]!]!.cardId = d.oracleId;
    }
    const top3 = lib.slice(0, 3);
    tapPermanent(s0, s0.objects[gt]!);
    let s = settle(s0);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    return { s, ap, ids, opp, gt, top3 };
  };

  it("exiles the top three of the target opponent's library face down, seen by you only", () => {
    const { s, ap, opp, top3 } = withThief();
    for (const id of top3) {
      expect(zone(s, id)).toBe("exile");
      expect(hiddenInExile(s.objects[id]!, ap)).toBe(false);
      expect(hiddenInExile(s.objects[id]!, opp)).toBe(true);
    }
  });

  it("a player who gains control of it may look at them too, and still after it leaves (rulings)", () => {
    const { s: s1, ap, opp, gt, top3 } = withThief();
    const s = s1;
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    addEffect(s, third, [gt], [{ kind: "control" }], "game");
    expect(controllerOf(s, s.objects[gt]!)).toBe(third);
    runStateBasedActions(s);
    for (const id of top3) expect(hiddenInExile(s.objects[id]!, third)).toBe(false);
    moveObject(s, gt, "graveyard");
    runStateBasedActions(s);
    for (const id of top3) {
      expect(hiddenInExile(s.objects[id]!, third)).toBe(false);
      expect(hiddenInExile(s.objects[id]!, ap)).toBe(false);
      expect(hiddenInExile(s.objects[id]!, opp)).toBe(true);
    }
  });

  it("sacrificed, turns them face up and counters every spell with one of their names, either half of a split card", () => {
    const { s: s1, ap, ids, gt, top3 } = withThief();
    let s = s1;
    const victim = s.turnOrder.find((p) => p !== ap)!;
    // Lightning Bolt and Ice (from Fire // Ice) countered, Shock not.
    s = run(s, castPlan(s, ap, ids[0]!, [{ kind: "player", id: victim }]));
    const land = s.battlefield.find((id) => s.objects[id]!.controller === victim) ?? s.battlefield.find((id) => s.objects[id]!.controller === ap && name(s, id) === "Forest")!;
    s = run(s, castPlan(s, ap, ids[1]!, [tgt(land)], { face: 1 }));
    s = run(s, castPlan(s, ap, ids[2]!, [{ kind: "player", id: victim }]));
    expect(s.stack.filter((x) => x.kind === "spell").length).toBe(3);
    const life = s.players[victim]!.life;
    s = run(s, planActivate(s, ap, gt, 0));
    expect(zone(s, gt)).toBe("graveyard");
    s = settle(s);
    for (const id of top3) for (const p of s.turnOrder) expect(hiddenInExile(s.objects[id]!, p)).toBe(false);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(s.objects[land]!.tapped).toBe(false); // Ice didn't resolve
    // Only Shock resolved.
    expect(s.players[victim]!.life).toBe(life - 2);
    expect(s.log.some((l) => /Lightning Bolt.*countered|counter.*Lightning Bolt/i.test(l.text))).toBe(true);
    expect(name(s, top3[1]!)).toBe("Fire // Ice");
  });
});

describe("Grimoire Thief for bots", () => {
  it("a bot sacrifices it to counter an opponent's spell named like a card exiled with it", () => {
    const { s: s0, ap, ids, opp } = setup([divination()]);
    const gt = putOnBattlefield(s0, opp, thief());
    putOnBattlefield(s0, opp, islandOf());
    // Your top card is a Divination too.
    const d = divination();
    s0.objects[s0.players[ap]!.library[0]!]!.cardId = d.oracleId;
    tapPermanent(s0, s0.objects[gt]!);
    let s = settle(s0);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: opp, targets: [{ kind: "player", id: ap }] });
    s = settle(s);
    expect(s.players[ap]!.exile.length).toBe(3);
    s = act(run(s, castPlan(s, ap, ids[0]!)), { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, botActions(s, opp));
    expect(zone(s, gt)).toBe("graveyard");
    s = settleBots(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.log.some((l) => /Divination/.test(l.text) && /counter/i.test(l.text))).toBe(true);
  });
});

describe("Kianne, Dean of Substance // Imbraham, Dean of Theory: study counters on cards in exile", () => {
  it("Kianne: a land on top goes to your hand, anything else is exiled with a study counter", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kianne(), { sick: false });
    const land = place(s0, ap, forest(), "library");
    let s = settle(run(s0, planActivate(s0, ap, k, 0)));
    expect(zone(s, land)).toBe("hand");
    s.objects[k]!.tapped = false;
    const spell = place(s, ap, divination(), "library");
    s = settle(run(s, planActivate(s, ap, k, 0)));
    expect(zone(s, spell)).toBe("exile");
    expect(s.objects[spell]!.counters.study).toBe(1);
  });

  it("Kianne's Fractal gets a counter for each different mana value among your nonland cards in exile with study counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kianne(), { sick: false });
    const study = (def: CardDef, pid: PlayerId = ap, n = 1) => {
      const id = place(s0, pid, def, "exile");
      if (n) s0.objects[id]!.counters.study = n;
      return id;
    };
    study(divination()); // 3
    study(opt()); // 1
    study(lightning()); // 1 again
    study(forest()); // a land: no
    study(serra(), ap, 0); // no study counter
    study(sol(), opp); // not yours
    const before = new Set(s0.battlefield);
    const s = settle(run(s0, planActivate(s0, ap, k, 1)));
    const made = s.battlefield.filter((id) => !before.has(id));
    expect(made.length).toBe(1);
    expect(s.objects[made[0]!]!.counters["+1/+1"]).toBe(2);
    expect(characteristics(s, s.objects[made[0]!]!).power).toBe(2);
  });

  it("Imbraham exiles the top X with study counters, then you may put one of them (or an earlier one) into your hand", () => {
    const { s: s0, ap } = setup([]);
    const im = putOnBattlefield(s0, ap, kianne(), { sick: false });
    s0.objects[im]!.face = 1;
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[im]!).name).toBe("Imbraham, Dean of Theory");
    const earlier = place(s0, ap, serra(), "exile");
    s0.objects[earlier]!.counters.study = 1;
    const top2 = s0.players[ap]!.library.slice(0, 2);
    const plan = planActivate(s0, ap, im, 0, [], undefined, undefined, 2);
    let s = run(s0, plan);
    s = settle(s);
    for (const id of top2) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.counters.study).toBe(1);
    }
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    expect((s.pending as { cards: ObjectId[] }).cards).toEqual(expect.arrayContaining([...top2, earlier]));
    s = act(s, { type: "searchLibrary", player: ap, found: [earlier] });
    s = settle(s);
    expect(zone(s, earlier)).toBe("hand");
  });
});

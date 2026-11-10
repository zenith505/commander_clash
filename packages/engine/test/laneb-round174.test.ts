// Lane B round B174: Cryptid Inspector (a face-down permanent entering, or a permanent turned face up, two events of one
// ability), Tunnel Tipster ("if a face-down creature entered the battlefield under your control this turn"), Veiled
// Ascension ("Face-down creatures you control enter with a flying counter on them"), Sanctifier en-Vec (black or red
// permanents, spells and cards are exiled instead of going to a graveyard, by their colors where they are), Predatory Focus
// (your creatures assign their combat damage this turn as though they weren't blocked), Reckless Velocitaur and Canyon
// Vaulter ("saddles a Mount or crews a Vehicle during your main phase"), Rangers of Ithilien ("target creature with lesser
// power"), Liliana, the Necromancer ("Put up to two creature cards from graveyards onto the battlefield").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const inspector = (): CardDef => ({"oracleId":"c36f787e-d8d4-4bd5-9790-64766878fe46","name":"Cryptid Inspector","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Elf Warrior","supertypes":[],"types":["Creature"],"subtypes":["Elf","Warrior"],"oracleText":"Vigilance\nWhenever a face-down permanent you control enters and whenever this creature or another permanent you control is turned face up, put a +1/+1 counter on this creature.","power":"2","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/820c2932-2e23-4f67-92d0-a630aec6f1b4.jpg?1783909456","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/820c2932-2e23-4f67-92d0-a630aec6f1b4.jpg?1783909456","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const tipster = (): CardDef => ({"oracleId":"8d0bf685-e521-4d72-acc6-86794f685ce2","name":"Tunnel Tipster","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Mole Scout","supertypes":[],"types":["Creature"],"subtypes":["Mole","Scout"],"oracleText":"At the beginning of your end step, if a face-down creature entered the battlefield under your control this turn, put a +1/+1 counter on this creature.\n{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/3/e/3e29b890-35b9-4e2a-9b4c-9417ca7db31d.jpg?1783912858","artUrl":"https://cards.scryfall.io/art_crop/front/3/e/3e29b890-35b9-4e2a-9b4c-9417ca7db31d.jpg?1783912858","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ascension = (): CardDef => ({"oracleId":"cbf0190a-198b-49cc-8c79-4028da07fa77","name":"Veiled Ascension","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, put a flying counter on each face-down creature you control.\nFace-down creatures you control enter with a flying counter on them.\nAt the beginning of your upkeep, you may cloak the top card of your library.","colors":["W"],"colorIdentity":["W"],"keywords":["Cloak"],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/5196eb5b-9330-46f7-b6f7-9c1164ea27d7.jpg?1783913050","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/5196eb5b-9330-46f7-b6f7-9c1164ea27d7.jpg?1783913050","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sanctifier = (): CardDef => ({"oracleId":"810d3afe-c644-444f-a4d9-88b323f0b581","name":"Sanctifier en-Vec","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Protection from black and from red\nWhen this creature enters, exile all cards that are black or red from all graveyards.\nIf a black or red permanent, spell, or card not on the battlefield would be put into a graveyard, exile it instead.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/f/8/f8c3cca4-23c0-4c14-ab56-51ba011f5974.jpg?1783926886","artUrl":"https://cards.scryfall.io/art_crop/front/f/8/f8c3cca4-23c0-4c14-ab56-51ba011f5974.jpg?1783926886","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const focus = (): CardDef => ({"oracleId":"c5866507-ef3b-446a-99ea-d31d974bdb01","name":"Predatory Focus","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may have creatures you control assign their combat damage this turn as though they weren't blocked.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98fc1314-4bf2-44f2-a016-58765eb04607.jpg?1783943489","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98fc1314-4bf2-44f2-a016-58765eb04607.jpg?1783943489","commanderLegal":"legal","set":"gpt","releasedAt":"2006-02-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const velocitaur = (): CardDef => ({"oracleId":"367420cb-e77b-4d0c-9a83-0deee28f6d36","name":"Reckless Velocitaur","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Minotaur Pilot","supertypes":[],"types":["Creature"],"subtypes":["Minotaur","Pilot"],"oracleText":"Whenever this creature saddles a Mount or crews a Vehicle during your main phase, that Mount or Vehicle gets +2/+0 and gains trample until end of turn.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8edd18be-3861-4510-ba6d-38ccba60bb5b.jpg?1783907877","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8edd18be-3861-4510-ba6d-38ccba60bb5b.jpg?1783907877","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const vaulter = (): CardDef => ({"oracleId":"829e121f-d2fa-40ef-afc7-9b2072a949d7","name":"Canyon Vaulter","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Kor Pilot","supertypes":[],"types":["Creature"],"subtypes":["Kor","Pilot"],"oracleText":"Whenever this creature saddles a Mount or crews a Vehicle during your main phase, that Mount or Vehicle gains flying until end of turn.","power":"3","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/c/cc0b15da-a45c-42f5-aafc-20ad9e38bf24.jpg?1783907921","artUrl":"https://cards.scryfall.io/art_crop/front/c/c/cc0b15da-a45c-42f5-aafc-20ad9e38bf24.jpg?1783907921","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rangers = (): CardDef => ({"oracleId":"4d5fd9f0-ecb3-4b91-ae55-f02336d7cf37","name":"Rangers of Ithilien","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Human Ranger","supertypes":[],"types":["Creature"],"subtypes":["Human","Ranger"],"oracleText":"Vigilance\nWhen this creature enters, gain control of up to one target creature with lesser power for as long as you control this creature. Then the Ring tempts you.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/819b4208-7a29-41fa-947f-614bf669b300.jpg?1783916313","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/819b4208-7a29-41fa-947f-614bf669b300.jpg?1783916313","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const liliana = (): CardDef => ({"oracleId":"f3ad60a6-05d0-48a1-a804-7900d306d613","name":"Liliana, the Necromancer","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Planeswalker — Liliana","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Liliana"],"oracleText":"+1: Target player loses 2 life.\n−1: Return target creature card from your graveyard to your hand.\n−7: Destroy up to two target creatures. Put up to two creature cards from graveyards onto the battlefield under your control.","loyalty":"4","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/d/4d2cbc2c-dbe3-4ecb-8fbe-785cb80b9e76.jpg?1783934485","artUrl":"https://cards.scryfall.io/art_crop/front/4/d/4d2cbc2c-dbe3-4ecb-8fbe-785cb80b9e76.jpg?1783934485","commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const morph = (): CardDef => ({"oracleId":"4c92b862-34c7-4195-bee3-bcc0cafad140","name":"Pine Walker","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Morph {4}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhenever this creature or another creature you control is turned face up, untap that creature.","power":"5","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":["Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/9/3/93a49d9c-8fe7-494b-9a26-cf4bde71e420.jpg?1783939066","artUrl":"https://cards.scryfall.io/art_crop/front/9/3/93a49d9c-8fe7-494b-9a26-cf4bde71e420.jpg?1783939066","commanderLegal":"legal","set":"ktk","releasedAt":"2014-09-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bighorn = (): CardDef => ({"oracleId":"6a1ad848-6fda-46dd-aad8-2f6a5c71a696","name":"Bridled Bighorn","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Sheep Mount","supertypes":[],"types":["Creature"],"subtypes":["Sheep","Mount"],"oracleText":"Vigilance\nWhenever this creature attacks while saddled, create a 1/1 white Sheep creature token.\nSaddle 2 (Tap any number of other creatures you control with total power 2 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Saddle","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/f/a/fa7bf089-fa9b-4ffc-bf84-45cd51c76463.jpg?1783911859","artUrl":"https://cards.scryfall.io/art_crop/front/f/a/fa7bf089-fa9b-4ffc-bf84-45cd51c76463.jpg?1783911859","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const smuggler = (): CardDef => ({"oracleId":"49136bdc-bc50-49a2-999a-1ef9c16ea130","name":"Smuggler's Copter","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Flying","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const drudge = (): CardDef => ({"oracleId":"c180ed02-07f4-4538-9bea-8c249234a8e2","name":"Drudge Skeletons","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Skeleton","supertypes":[],"types":["Creature"],"subtypes":["Skeleton"],"oracleText":"{B}: Regenerate this creature. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Heal","Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/425836be-f5cd-4584-a2ff-a8cf166eccc0.jpg?1783942382","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/425836be-f5cd-4584-a2ff-a8cf166eccc0.jpg?1783942382","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const doom = (): CardDef => ({"oracleId":"59e7f2ae-4535-4191-98be-3e65b6b2befa","name":"Doom Blade","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonblack creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5dcd0c4e-4047-47a2-8969-c62616d457c2.jpg?1783903090","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5dcd0c4e-4047-47a2-8969-c62616d457c2.jpg?1783903090","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const raven = (): CardDef => ({"oracleId":"60824fae-20ed-4122-82c9-e99a1b679c54","name":"Bog Raiders","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Landwalk","Swampwalk"],"imageUrl":"https://cards.scryfall.io/normal/front/3/7/3739188b-f2b3-4ab0-8e5c-b3a1d2a1ad09.jpg?1783946349","artUrl":"https://cards.scryfall.io/art_crop/front/3/7/3739188b-f2b3-4ab0-8e5c-b3a1d2a1ad09.jpg?1783946349","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const goblin = (): CardDef => ({"oracleId":"30997b43-fc13-41d3-8064-1ccc2cb6fd2b","name":"Raging Goblin","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Berserker","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Berserker"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const terror = (): CardDef => ({"oracleId":"b81f041d-98db-4408-9472-c483e4a502bc","name":"Terror","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonartifact, nonblack creature. It can't be regenerated.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3d1ccc3b-a6bd-4dc8-b7ba-99172d612106.jpg?1783943027","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3d1ccc3b-a6bd-4dc8-b7ba-99172d612106.jpg?1783943027","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wrath = (): CardDef => ({"oracleId":"34515b16-c9a4-4f98-8c77-416a7a523407","name":"Wrath of God","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures. They can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","commanderLegal":"legal","set":"v14","releasedAt":"2014-08-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

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
/** Settles, the bots answering every question. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) {
      for (const a of botActions(s, s.pending.player)) s = act(s, a);
      continue;
    }
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const plusOnes = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;
/** Casts `id` face down (morph, CR 702.37c) and resolves it. */
const castFaceDown = (s: GameState, pid: PlayerId, id: string) => settleBots(run(s, planCast(s, pid, id, undefined, undefined, "auto", undefined, { faceDown: true })));
/** Turns `id` face up (a special action, CR 702.37e) and lets what it triggered resolve. */
const turnUp = (s: GameState, pid: PlayerId, id: string) => settleBots(run(s, planTurnFaceUp(s, pid, id)));
/** Declares `attacks`, then each defending player's `blocks`, then goes to the end of combat. */
const fight = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 400 && s.step !== "endCombat"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Lane B round B174: cards", () => {
  it("compile", () => supported(inspector(), tipster(), ascension(), sanctifier(), focus(), velocitaur(), vaulter(), rangers(), liliana()));
});

describe("Cryptid Inspector", () => {
  it("a +1/+1 counter when a face-down permanent you control enters, and another when it's turned face up", () => {
    const { s: s0, ap, ids } = setup([morph(), bears()]);
    const ci = putOnBattlefield(s0, ap, inspector());
    let s = castFaceDown(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    expect(plusOnes(s, ci)).toBe(1);
    // Turning it face up isn't entering (CR 708.8): one more counter, from the second event only.
    s = turnUp(s, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.faceDown).toBeFalsy();
    expect(plusOnes(s, ci)).toBe(2);
    // A creature entering face up isn't either.
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(plusOnes(s, ci)).toBe(2);
  });
  it("an opponent's face-down permanent entering doesn't count", () => {
    const { s: s0, ap, ids, opp } = setup([morph()]);
    const ci = putOnBattlefield(s0, opp, inspector());
    const s = castFaceDown(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    expect(plusOnes(s, ci)).toBe(0);
  });
});

describe("Tunnel Tipster", () => {
  it("no counter at your end step when no face-down creature entered under your control this turn", () => {
    const { s: s0, ap, ids } = setup([bears()]);
    const tt = putOnBattlefield(s0, ap, tipster());
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    s = settleBots(passUntil(s, "end", ap));
    expect(plusOnes(s, tt)).toBe(0);
  });
  it("a counter when one entered face down this turn, even after it was turned face up (rulings)", () => {
    const { s: s0, ap, ids } = setup([morph()]);
    const tt = putOnBattlefield(s0, ap, tipster());
    let s = castFaceDown(s0, ap, ids[0]!);
    s = turnUp(s, ap, ids[0]!);
    s = settleBots(passUntil(s, "end", ap));
    expect(plusOnes(s, tt)).toBe(1);
  });
  it("one that entered face up and was turned face down later doesn't count (rulings)", () => {
    const { s: s0, ap, ids } = setup([bears()]);
    const tt = putOnBattlefield(s0, ap, tipster());
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    s.objects[ids[0]!]!.faceDown = "morph";
    invalidateCharacteristics(s);
    s = settleBots(passUntil(s, "end", ap));
    expect(plusOnes(s, tt)).toBe(0);
  });
});

describe("Veiled Ascension", () => {
  it("face-down creatures you control enter with a flying counter; face-up ones and other players' don't", () => {
    const { s: s0, ap, ids, opp } = setup([morph(), bears()]);
    putOnBattlefield(s0, ap, ascension());
    let s = castFaceDown(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.counters.flying).toBe(1);
    expect(kw(s, ids[0]!)).toContain("Flying");
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.counters.flying ?? 0).toBe(0);
    // An opponent's Veiled Ascension doesn't touch yours.
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([morph()]);
    putOnBattlefield(t0, opp2, ascension());
    const t = castFaceDown(t0, ap2, ids2[0]!);
    expect(t.objects[ids2[0]!]!.counters.flying ?? 0).toBe(0);
    void opp;
  });
  it("the counter stays when it's turned face up", () => {
    const { s: s0, ap, ids } = setup([morph()]);
    putOnBattlefield(s0, ap, ascension());
    let s = castFaceDown(s0, ap, ids[0]!);
    s = turnUp(s, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.faceDown).toBeFalsy();
    expect(kw(s, ids[0]!)).toContain("Flying");
  });
});

describe("Sanctifier en-Vec", () => {
  it("as it enters, exiles every black or red card in every graveyard and leaves the rest", () => {
    const { s: s0, ap, ids, opp } = setup([sanctifier()]);
    const myBolt = into(s0, ap, bolt(), "graveyard");
    const theirDoom = into(s0, opp, doom(), "graveyard");
    const theirBears = into(s0, opp, bears(), "graveyard");
    const myWrath = into(s0, ap, wrath(), "graveyard");
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[myBolt]!.zone).toBe("exile");
    expect(s.objects[theirDoom]!.zone).toBe("exile");
    expect(s.objects[theirBears]!.zone).toBe("graveyard");
    expect(s.objects[myWrath]!.zone).toBe("graveyard");
  });
  it("a red spell that resolves is exiled; a black creature that dies is exiled; a green one goes to the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([bolt(), bolt()]);
    putOnBattlefield(s0, ap, sanctifier());
    const zombie = putOnBattlefield(s0, opp, raven());
    const bear = putOnBattlefield(s0, opp, bears());
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [tgt(zombie)])));
    expect(s.objects[zombie]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s = settleBots(run(s, planCast(s, ap, ids[1]!, [tgt(bear)])));
    expect(s.objects[bear]!.zone).toBe("graveyard");
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
  });
  it("a card discarded from a hand is exiled by its color there; a green one goes to the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sanctifier());
    const d = into(s0, opp, doom(), "hand");
    const b = into(s0, opp, bears(), "hand");
    // At the cleanup step of the opponent's turn, they discard down to seven: the first cards in hand here.
    const hand = s0.players[opp]!.hand;
    s0.players[opp]!.hand = [d, b, ...hand.filter((x) => x !== d && x !== b)];
    const s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!);
    expect(s.objects[d]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
  it("a Clone copying a red creature is red on the battlefield, so it's exiled when it dies (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([clone(), terror()]);
    putOnBattlefield(s0, ap, sanctifier());
    putOnBattlefield(s0, opp, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 20 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p.kind === "chooseOption") s = act(s, { type: "chooseOption", player: p.player, choice: p.options.find((o) => s.objects[o] && s.cards[s.objects[o]!.cardId]?.name === "Hill Giant") ?? p.options[0]! });
      else for (const a of botActions(s, p.player)) s = act(s, a);
      s = settle(s);
    }
    expect(characteristics(s, s.objects[ids[0]!]!).colors).toEqual(["R"]);
    s = settleBots(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    // Terror is black: exiled too.
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
  });
  it("a red creature destroyed at the same time as ~ is exiled; the white Wrath goes to the graveyard (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([wrath()]);
    const sv = putOnBattlefield(s0, ap, sanctifier());
    const g = putOnBattlefield(s0, opp, giant());
    const b = putOnBattlefield(s0, opp, bears());
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[sv]!.zone).toBe("graveyard");
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("Predatory Focus", () => {
  it("if you choose to, your blocked creatures deal their combat damage to the player they attack, ones that came later too (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([focus(), goblin()]);
    const b = putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, opp, giant());
    const g2 = putOnBattlefield(s0, opp, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    // Cast after it resolved: a haste creature that comes later is covered too.
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    const life = s.players[opp]!.life;
    s = fight(s, ap, [{ attacker: b, defender: opp }, { attacker: ids[1]!, defender: opp }], [{ blocker: g, attacker: b }, { blocker: g2, attacker: ids[1]! }]);
    expect(s.players[opp]!.life).toBe(life - 3);
    // The blockers are dealt nothing; they still deal theirs.
    expect(s.objects[g]!.damage).toBe(0);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
  it("if you don't, nothing happens: the blocker is dealt the damage", () => {
    const { s: s0, ap, ids, opp } = setup([focus()]);
    const b = putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, opp, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    const life = s.players[opp]!.life;
    s = fight(s, ap, [{ attacker: b, defender: opp }], [{ blocker: g, attacker: b }]);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[g]!.damage).toBe(2);
  });
  it("only the caster's creatures, and only this turn", () => {
    const { s: s0, ap, ids, opp } = setup([focus()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.turnLog?.unblockedDamage).toEqual([ap]);
    s = passUntil(s, "upkeep", opp);
    expect(s.turnLog?.unblockedDamage).toBeUndefined();
  });
});

describe("Reckless Velocitaur and Canyon Vaulter", () => {
  it("Velocitaur crewing a Vehicle in your main phase: +2/+0 and trample until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, velocitaur());
    const c = putOnBattlefield(s0, ap, smuggler());
    const s = settleBots(run(s0, planActivate(s0, ap, c, 0, undefined, undefined, [v])));
    expect(characteristics(s, s.objects[c]!).types).toContain("Creature");
    expect(pt(s, c)).toBe("5/3");
    expect(kw(s, c)).toContain("Trample");
  });
  it("crewing outside your main phase doesn't trigger it", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, velocitaur());
    const c = putOnBattlefield(s0, ap, smuggler());
    const s1 = passUntil(s0, "beginCombat", ap);
    const s = settleBots(run(s1, planActivate(s1, ap, c, 0, undefined, undefined, [v])));
    expect(pt(s, c)).toBe("3/3");
    expect(kw(s, c)).not.toContain("Trample");
  });
  it("Canyon Vaulter saddling a Mount gives it flying; other creatures crewing don't trigger it", () => {
    const { s: s0, ap } = setup([]);
    const cv = putOnBattlefield(s0, ap, vaulter());
    const m = putOnBattlefield(s0, ap, bighorn());
    const s = settleBots(run(s0, planActivate(s0, ap, m, 0, undefined, undefined, [cv])));
    expect(s.objects[m]!.saddled).toBe(true);
    expect(kw(s, m)).toContain("Flying");
    const { s: t0, ap: ap2 } = setup([]);
    putOnBattlefield(t0, ap2, vaulter());
    const b = putOnBattlefield(t0, ap2, bears());
    const c = putOnBattlefield(t0, ap2, smuggler());
    const t = settleBots(run(t0, planActivate(t0, ap2, c, 0, undefined, undefined, [b])));
    expect(characteristics(t, t.objects[c]!).types).toContain("Creature");
    expect(compileCard(vaulter()).triggers[0]!.orSaddles).toBe(true);
    void t;
  });
});

describe("Rangers of Ithilien", () => {
  it("gains control of a creature with lesser power for as long as you control it, then the Ring tempts you", () => {
    const { s: s0, ap, ids, opp } = setup([rangers()]);
    const b = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 10 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: p.player, targets: [tgt(b)] } as Action));
      else {
        for (const a of botActions(s, p.player)) s = act(s, a);
        s = settle(s);
      }
    }
    s = settleBots(s);
    expect(s.objects[b]!.controller === ap || characteristics(s, s.objects[b]!).controller === ap).toBe(true);
    expect(s.players[ap]!.ring?.tempted).toBe(1);
  });
});

describe("Liliana, the Necromancer", () => {
  it("−7: destroys up to two target creatures, then puts up to two creature cards from graveyards onto the battlefield under your control, the destroyed ones among them (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, liliana());
    s0.objects[l]!.counters.loyalty = 7;
    const g = putOnBattlefield(s0, opp, giant());
    const b = putOnBattlefield(s0, opp, bears());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const yardBear = into(s0, third, bears(), "graveyard");
    const plan = planActivate(s0, ap, l, 2, [tgt(g), tgt(b)]);
    let s = settle(run(s0, plan));
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.max).toBe(2);
    expect(p.min).toBe(0);
    expect(p.cards).toEqual(expect.arrayContaining([g, b, yardBear]));
    s = settleBots(act(s, { type: "searchLibrary", player: ap, found: [g, yardBear] }));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.controller).toBe(ap);
    expect(s.objects[yardBear]!.zone).toBe("battlefield");
    expect(s.objects[yardBear]!.controller).toBe(ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
    // A noncreature card isn't offered; nor are three accepted.
    expect(s.objects[l]!.counters.loyalty ?? 0).toBe(0);
  });
  it("with no targets it still returns cards; choosing none is allowed", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, liliana());
    s0.objects[l]!.counters.loyalty = 8;
    const yardBear = into(s0, opp, bears(), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, l, 2, [{ kind: "none" } as TargetChoice, { kind: "none" } as TargetChoice])));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settleBots(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.objects[yardBear]!.zone).toBe("graveyard");
  });
  it("a bot takes the best two", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, liliana());
    s0.objects[l]!.counters.loyalty = 7;
    const a = into(s0, opp, giant(), "graveyard");
    const c = into(s0, opp, bears(), "graveyard");
    const s = settleBots(run(s0, planActivate(s0, ap, l, 2, [{ kind: "none" } as TargetChoice, { kind: "none" } as TargetChoice])));
    expect([a, c].filter((id) => s.objects[id]!.zone === "battlefield").length).toBe(2);
  });
});

describe("Rangers of Ithilien: lesser power", () => {
  it("a creature with power equal to its own can't be the target; one with less can", () => {
    const { s: s0, ap, ids, opp } = setup([rangers()]);
    const g = putOnBattlefield(s0, opp, giant());
    const b = putOnBattlefield(s0, opp, bears());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] })).toThrow();
    const t = settleBots(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(characteristics(t, t.objects[b]!).controller).toBe(ap);
    expect(characteristics(t, t.objects[g]!).controller).toBe(opp);
  });
  it("its power at resolution counts: a target that's no longer lesser makes it do nothing, the Ring doesn't tempt you (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([rangers()]);
    const b = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] });
    s.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s = settleBots(s);
    expect(characteristics(s, s.objects[b]!).controller).toBe(opp);
    expect(s.players[ap]!.ring?.tempted ?? 0).toBe(0);
  });
  it("when you lose control of it, the creature goes back", () => {
    const { s: s0, ap, ids, opp } = setup([rangers(), terror()]);
    const b = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settleBots(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(characteristics(s, s.objects[b]!).controller).toBe(ap);
    s = settleBots(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(characteristics(s, s.objects[b]!).controller).toBe(opp);
  });
});

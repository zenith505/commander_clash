// Lane B round B131: Realm Razer (the exiled lands return tapped), Lavabrink Venturer (protection from each mana value of
// the chosen quality), Ignorant Bliss (your hand exiled face down until the next end step), Grip of Phyresis (an Equipment
// taken and attached to a new Germ), Infectious Rage (returned attached to a creature chosen at random), Traveling Plague
// (returned by the creature's controller), Kaervek's Spite (sacrifice all permanents you control and discard your hand as
// an additional cost), Dwarven Sea Clan and Seasinger ("whose controller controls an Island"; damage at end of combat,
// "before the end of combat step"), Ashen Ghoul ("three or more creature cards are above ~"), Thijarian Witness ("if it
// was attacking or blocking alone").

import { describe, expect, it } from "vitest";
import { act, addEffect, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority (answering other questions as bots, no attacks or blocks) until `step` of `active`'s turn, stopping at a question of `me`. */
const goTo = (s: GameState, step: Step, active: PlayerId, me?: PlayerId) => {
  for (let i = 0; i < 3000 && !(s.step === step && s.activePlayer === active); i++) {
    const p = s.pending;
    if (p && p.player === me) return s;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "discardToHandSize") s = run(s, botActions(s, p.player));
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const plr = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
/** A card of `def` put into `pid`'s hand or graveyard (on top). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes priority until `pid` has it. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 10 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const named = (s: GameState, name: string, zone = "battlefield") => Object.values(s.objects).filter((o) => o.zone === zone && s.cards[o.cardId]?.name === name).map((o) => o.id);

// Real oracle text (Scryfall).
const realmRazer = (): CardDef => ({"oracleId":"90646d77-9b35-4f87-94ee-255c9f150456","name":"Realm Razer","manaCost":"{3}{R}{G}{W}","cmc":6,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"When this creature enters, exile all lands.\nWhen this creature leaves the battlefield, return the exiled cards to the battlefield tapped under their owners' control.","power":"4","toughness":"2","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/da3ecfc6-1f9e-443e-a445-51df518025a5.jpg?1783942541","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/da3ecfc6-1f9e-443e-a445-51df518025a5.jpg?1783942541","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lavabrink = (): CardDef => ({"oracleId":"ea66ffa3-d084-434f-91a6-fdff49806285","name":"Lavabrink Venturer","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"As this creature enters, choose odd or even. (Zero is even.)\nThis creature has protection from each mana value of the chosen quality.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/8/38c0d9d6-c9c7-4169-8106-400445643a1a.jpg?1783931089","artUrl":"https://cards.scryfall.io/art_crop/front/3/8/38c0d9d6-c9c7-4169-8106-400445643a1a.jpg?1783931089","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ignorantBliss = (): CardDef => ({"oracleId":"9cf12838-64fe-49c9-9181-e0f6118c0bf6","name":"Ignorant Bliss","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile all cards from your hand face down. At the beginning of the next end step, return those cards to your hand, then draw a card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1a2db886-d394-4a8b-8fe0-dc2613500adc.jpg?1783943420","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1a2db886-d394-4a8b-8fe0-dc2613500adc.jpg?1783943420","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gripOfPhyresis = (): CardDef => ({"oracleId":"4c95b2fe-d107-44f9-b877-8bd4799f5a65","name":"Grip of Phyresis","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Gain control of target Equipment, then create a 0/0 black Phyrexian Germ creature token and attach that Equipment to it.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d523ec16-46d0-4f80-8df4-30c6c32f3386.jpg?1783937089","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d523ec16-46d0-4f80-8df4-30c6c32f3386.jpg?1783937089","commanderLegal":"legal","set":"c16","releasedAt":"2016-11-11","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const infectiousRage = (): CardDef => ({"oracleId":"ed0402d7-02cb-4763-a661-82280d6c9af8","name":"Infectious Rage","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/-1.\nWhen enchanted creature dies, choose a creature at random this Aura can enchant. Return this card to the battlefield attached to that creature.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/8569cdf7-e0e9-4733-98b5-56fac216fad3.jpg?1783945117","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/8569cdf7-e0e9-4733-98b5-56fac216fad3.jpg?1783945117","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const travelingPlague = (): CardDef => ({"oracleId":"371e8e29-f569-4b23-bae4-cf89e5b09fd3","name":"Traveling Plague","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAt the beginning of each upkeep, put a plague counter on this Aura.\nEnchanted creature gets -1/-1 for each plague counter on this Aura.\nWhen enchanted creature leaves the battlefield, that creature's controller returns this Aura from its owner's graveyard to the battlefield.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/d/4/d4b6413d-68d3-4097-9bb3-873df4900e4c.jpg?1783945239","artUrl":"https://cards.scryfall.io/art_crop/front/d/4/d4b6413d-68d3-4097-9bb3-873df4900e4c.jpg?1783945239","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kaerveksSpite = (): CardDef => ({"oracleId":"7d69be1e-701a-4bcb-a83e-38b4174f7828","name":"Kaervek's Spite","manaCost":"{B}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice all permanents you control and discard your hand.\nTarget player loses 5 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/3/d385b9e5-e13d-4098-ba74-ea55bde164d9.jpg?1783946993","artUrl":"https://cards.scryfall.io/art_crop/front/d/3/d385b9e5-e13d-4098-ba74-ea55bde164d9.jpg?1783946993","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dwarvenSeaClan = (): CardDef => ({"oracleId":"55ae9711-65ac-4166-8a51-1deeb10a8904","name":"Dwarven Sea Clan","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Dwarf","supertypes":[],"types":["Creature"],"subtypes":["Dwarf"],"oracleText":"{T}: Choose target attacking or blocking creature whose controller controls an Island. This creature deals 2 damage to that creature at end of combat. Activate only before the end of combat step.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/c/4cb722d9-1998-4912-a6f2-4ffa8d21311a.jpg?1783947284","artUrl":"https://cards.scryfall.io/art_crop/front/4/c/4cb722d9-1998-4912-a6f2-4ffa8d21311a.jpg?1783947284","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const seasinger = (): CardDef => ({"oracleId":"13745b92-1e30-4075-9733-5d00da11408c","name":"Seasinger","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Merfolk","supertypes":[],"types":["Creature"],"subtypes":["Merfolk"],"oracleText":"When you control no Islands, sacrifice this creature.\nYou may choose not to untap this creature during your untap step.\n{T}: Gain control of target creature whose controller controls an Island for as long as you control this creature and this creature remains tapped.","power":"0","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c5266aa1-e2ea-46b9-91ab-b94a7bb7e9f9.jpg?1783947910","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c5266aa1-e2ea-46b9-91ab-b94a7bb7e9f9.jpg?1783947910","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ashenGhoul = (): CardDef => ({"oracleId":"46fbcbdf-73d0-4fa2-8db7-3b19bfc7ac22","name":"Ashen Ghoul","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Haste\n{B}: Return this card from your graveyard to the battlefield. Activate only during your upkeep and only if three or more creature cards are above this card.","power":"3","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6bb83301-5662-4628-b536-6a3ee0296f2e.jpg?1783947506","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6bb83301-5662-4628-b536-6a3ee0296f2e.jpg?1783947506","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const thijarianWitness = (): CardDef => ({"oracleId":"d273033b-3b8b-4ce9-afe8-208d82dd20f1","name":"Thijarian Witness","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Alien Cleric","supertypes":[],"types":["Creature"],"subtypes":["Alien","Cleric"],"oracleText":"Flash\nBear Witness — Whenever another creature dies, if it was attacking or blocking alone, exile it and investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")","power":"0","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Investigate","Bear Witness","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/da05e23b-419f-4023-9ad4-1227bb1b53be.jpg?1783914641","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/da05e23b-419f-4023-9ad4-1227bb1b53be.jpg?1783914641","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const swamp = (): CardDef => ({"oracleId":"56719f6a-1a6c-4c0a-8d21-18f7d7350b68","name":"Swamp","manaCost":"","cmc":0,"typeLine":"Basic Land — Swamp","supertypes":["Basic"],"types":["Land"],"subtypes":["Swamp"],"oracleText":"({T}: Add {B}.)","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const plains = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const craterhoof = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const loxodon = (): CardDef => ({"oracleId":"18ac2282-83af-4acc-b20b-6a95771da688","name":"Loxodon Smiter","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Creature — Elephant Soldier","supertypes":[],"types":["Creature"],"subtypes":["Elephant","Soldier"],"oracleText":"This spell can't be countered.\nIf a spell or ability an opponent controls causes you to discard this card, put it onto the battlefield instead of putting it into your graveyard.","power":"4","toughness":"4","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69247168-2bfb-4cce-a2a6-61459a0fbce4.jpg?1783940336","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69247168-2bfb-4cce-a2a6-61459a0fbce4.jpg?1783940336","commanderLegal":"legal","set":"rtr","releasedAt":"2012-10-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const darkRitual = (): CardDef => ({"oracleId":"53f7c868-b03e-4fc2-8dcf-a75bbfa3272b","name":"Dark Ritual","manaCost":"{B}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Add {B}{B}{B}.","colors":["B"],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/11e12a84-e7be-4afc-a230-c2e644743fa8.jpg?1783903013","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/11e12a84-e7be-4afc-a230-c2e644743fa8.jpg?1783903013","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const naturalize = (): CardDef => ({"oracleId":"bdb3ca68-ec1f-4e16-81cc-d23f8f52c728","name":"Naturalize","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const whiteKnight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shortSword = (): CardDef => ({"oracleId":"e842a4e5-ea0b-43ae-9ed8-93e30f4e7b8a","name":"Short Sword","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+1.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cb79a623-21c3-4310-bc76-310935511d45.jpg?1783934954","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cb79a623-21c3-4310-bc76-310935511d45.jpg?1783934954","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;


/** `attacks` declared by `ap`; blockers as given, then on to combat damage. */
const attackWith = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = goTo(s, "declareAttackers", ap, ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers" && s.step !== "combatDamage"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) {
    const who = s.pending.player;
    s = act(s, { type: "declareBlockers", player: who, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === who) });
  }
  return s;
};

describe("Lane B round B131", () => {
  it("compiles every card of the round", () => {
    supported(realmRazer(), lavabrink(), ignorantBliss(), gripOfPhyresis(), infectiousRage(), travelingPlague(), kaerveksSpite(), dwarvenSeaClan(), seasinger(), ashenGhoul(), thijarianWitness());
  });
});

describe("Realm Razer", () => {
  it("exiles all lands, and they come back tapped under their owners' control when it leaves", () => {
    const { s: s0, ap, opp, ids } = setup([realmRazer(), lightningBolt()]);
    const oppLand = putOnBattlefield(s0, opp, island());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const razer = named(s, "Realm Razer")[0]!;
    expect(s.battlefield.filter((id) => s.objects[id]!.zone === "battlefield" && s.cards[s.objects[id]!.cardId]!.types.includes("Land"))).toEqual([]);
    expect(s.objects[oppLand]!.zone).toBe("exile");
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(razer)])));
    expect(s.objects[razer]?.zone ?? "graveyard").not.toBe("battlefield");
    const back = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    expect(back.length).toBe(15);
    expect(back.every((id) => s.objects[id]!.tapped)).toBe(true);
    const oppIsland = back.find((id) => s.objects[id]!.owner === opp)!;
    expect(controllerOf(s, s.objects[oppIsland]!)).toBe(opp);
  });

  it("if it leaves before its enters ability resolves, the lands stay exiled (rulings)", () => {
    const { s: s0, ap, ids } = setup([realmRazer(), lightningBolt()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // Razer resolves; its enters trigger waits on the stack.
    for (let i = 0; i < 20 && !named(s, "Realm Razer").length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const razer = named(s, "Realm Razer")[0]!;
    for (let i = 0; i < 10 && !s.stack.length; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : s;
    s = priorityTo(s, ap);
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(razer)])));
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land"))).toEqual([]);
  });
});

describe("Lavabrink Venturer", () => {
  it("has protection from each mana value of the chosen quality", () => {
    const { s: s0, ap, ids } = setup([lavabrink(), lightningBolt(), divination()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "odd" }), { me: [ap] });
    const lava = named(s, "Lavabrink Venturer")[0]!;
    expect(characteristics(s, s.objects[lava]!).keywords).toContain("Protection from odd mana values");
    // Lightning Bolt (mana value 1) can't target it (CR 702.16b).
    expect(planCast(s, ap, ids[1]!, [tgt(lava)])).toBeNull();
  });

  it("with even, an odd spell can target it", () => {
    const { s: s0, ap, ids } = setup([lavabrink(), lightningBolt()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "even" }), { me: [ap] });
    const lava = named(s, "Lavabrink Venturer")[0]!;
    expect(characteristics(s, s.objects[lava]!).keywords).toContain("Protection from even mana values");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(lava)])));
    expect(s.objects[lava]!.zone).toBe("graveyard");
  });
});

describe("Ignorant Bliss", () => {
  it("exiles your hand face down; at the next end step it comes back and you draw a card", () => {
    const { s: s0, ap, ids } = setup([ignorantBliss(), grizzlyBears(), divination()]);
    const held = s0.players[ap]!.hand.length - 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand).toEqual([]);
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.objects[ids[1]!]!.hiddenExile?.label).toBe("Face down");
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([ids[1], ids[2]]));
    expect(s.players[ap]!.hand.length).toBe(held + 1);
  });
});

describe("Grip of Phyresis", () => {
  it("takes the Equipment and attaches it to a new 0/0 Germ", () => {
    const { s: s0, ap, opp, ids } = setup([gripOfPhyresis()]);
    const sword = putOnBattlefield(s0, opp, shortSword());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(sword)])));
    expect(controllerOf(s, s.objects[sword]!)).toBe(ap);
    const germ = s.objects[sword]!.attachedTo!;
    expect(s.objects[germ]?.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[germ]!).subtypes).toEqual(expect.arrayContaining(["Phyrexian", "Germ"]));
    expect(controllerOf(s, s.objects[germ]!)).toBe(ap);
  });

  it("with an Equipment that gives no toughness, the Germ dies and you keep the Equipment (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([gripOfPhyresis()]);
    const splitter = putOnBattlefield(s0, opp, bonesplitter());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(splitter)])));
    expect(controllerOf(s, s.objects[splitter]!)).toBe(ap);
    expect(s.objects[splitter]!.attachedTo).toBeUndefined();
    expect(named(s, "Phyrexian Germ").length + named(s, "Germ").length).toBe(0);
  });
});

describe("Infectious Rage", () => {
  it("comes back attached to a creature chosen at random, under its controller's control", () => {
    const { s: s0, ap, opp, ids } = setup([infectiousRage(), lightningBolt()]);
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const giant = putOnBattlefield(s0, next(s0, opp), hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bears)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(bears);
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bears)])));
    const rage = named(s, "Infectious Rage")[0]!;
    expect(s.objects[rage]!.attachedTo).toBe(giant);
    expect(controllerOf(s, s.objects[rage]!)).toBe(ap);
  });

  it("can't be attached to a creature with protection from red, and stays in the graveyard with no creature it can enchant", () => {
    const { s: s0, ap, opp, ids } = setup([infectiousRage(), lightningBolt()]);
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const giant = putOnBattlefield(s0, next(s0, opp), hillGiant());
    addEffect(s0, ap, [giant], [{ kind: "addKeywords", keywords: ["Protection from red"] }], "game");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bears)])));
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bears)])));
    expect(named(s, "Infectious Rage")).toEqual([]);
    expect(named(s, "Infectious Rage", "graveyard").length).toBe(1);
  });
});

describe("Traveling Plague", () => {
  it("is returned by the dead creature's controller, under their control, with no plague counters", () => {
    const { s: s0, ap, opp, ids } = setup([travelingPlague(), lightningBolt()]);
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bears)])));
    s.objects[ids[0]!]!.counters = { plague: 1 };
    invalidateCharacteristics(s);
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bears)])));
    const plague = named(s, "Traveling Plague")[0]!;
    expect(s.objects[plague]!.attachedTo).toBe(giant);
    expect(controllerOf(s, s.objects[plague]!)).toBe(opp);
    expect(s.objects[plague]!.owner).toBe(ap);
    expect(s.objects[plague]!.counters.plague ?? 0).toBe(0);
  });
});

describe("Kaervek's Spite", () => {
  it("costs all your permanents and your hand; the target loses 5 life", () => {
    const { s: s0, ap, opp, ids } = setup([kaerveksSpite(), grizzlyBears(), divination()]);
    const mine = putOnBattlefield(s0, ap, hillGiant());
    putOnBattlefield(s0, ap, swamp());
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])));
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap)).toEqual([]);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).toEqual([]);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("can't be cast while a permanent you control can't be sacrificed (CR 118.3)", () => {
    const { s: s0, ap, opp, ids } = setup([kaerveksSpite()]);
    const mine = putOnBattlefield(s0, ap, hillGiant());
    addEffect(s0, ap, [mine], [{ kind: "cantBeSacrificed" }], "game");
    expect(planCast(s0, ap, ids[0]!, [plr(opp)])).toBeNull();
  });
});

describe("Dwarven Sea Clan", () => {
  it("deals 2 damage at end of combat to an attacking creature whose controller controls an Island", () => {
    const { s: s0, ap, opp } = setup([]);
    const clan = putOnBattlefield(s0, ap, dwarvenSeaClan());
    putOnBattlefield(s0, opp, island());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = goTo(s0, "declareAttackers", opp, opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bears, defender: ap }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    s = priorityTo(s, ap);
    expect(s.step).toBe("declareBlockers");
    s = run(s, planActivate(s, ap, clan, 0, [tgt(bears)]));
    s = settle(s);
    expect(s.objects[bears]!.zone).toBe("battlefield");
    s = goTo(s, "main2", opp);
    expect(s.objects[bears]!.zone).toBe("graveyard");
  });

  it("can't target a creature whose controller controls no Island, or be activated at end of combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const clan = putOnBattlefield(s0, ap, dwarvenSeaClan());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = goTo(s0, "declareAttackers", opp, opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bears, defender: ap }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    s = priorityTo(s, ap);
    expect(planActivate(s, ap, clan, 0, [tgt(bears)])).toBeNull();
    putOnBattlefield(s, opp, island());
    invalidateCharacteristics(s);
    expect(planActivate(s, ap, clan, 0, [tgt(bears)])).not.toBeNull();
    s = goTo(s, "endCombat", opp);
    s = priorityTo(s, ap);
    expect(s.step).toBe("endCombat");
    expect(planActivate(s, ap, clan, 0, [tgt(bears)])).toBeNull();
  });
});

describe("Seasinger", () => {
  it("takes a creature whose controller controls an Island for as long as it stays tapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const singer = putOnBattlefield(s0, ap, seasinger());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const bears2 = putOnBattlefield(s0, next(s0, opp), grizzlyBears());
    putOnBattlefield(s0, opp, island());
    expect(planActivate(s0, ap, singer, 0, [tgt(bears2)])).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, singer, 0, [tgt(bears)])));
    expect(controllerOf(s, s.objects[bears]!)).toBe(ap);
    // Still tapped as the turn goes on: still yours.
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(controllerOf(s, s.objects[bears]!)).toBe(ap);
    // Untapped: the effect ends (its duration is checked as the game goes on).
    s.objects[singer]!.tapped = false;
    s.objects[singer]!.untaps = (s.objects[singer]!.untaps ?? 0) + 1;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(controllerOf(s, s.objects[bears]!)).toBe(opp);
  });
});

describe("Ashen Ghoul", () => {
  it("returns from the graveyard during your upkeep only with three or more creature cards above it", () => {
    const { s: s0, ap } = setup([]);
    // The graveyard is built in the upkeep, after the cleanup step's discard.
    let s = priorityTo(goTo(s0, "upkeep", ap), ap);
    const ghoul = putIn(s, ap, ashenGhoul(), "graveyard");
    putIn(s, ap, grizzlyBears(), "graveyard");
    putIn(s, ap, divination(), "graveyard");
    putIn(s, ap, hillGiant(), "graveyard");
    pool(s, ap, { B: 1 });
    // Two creature cards above it.
    expect(planActivate(s, ap, ghoul, 0)).toBeNull();
    putIn(s, ap, ornithopter(), "graveyard");
    s = run(s, planActivate(s, ap, ghoul, 0));
    s = settle(s);
    expect(s.objects[ghoul]!.zone).toBe("battlefield");
  });

  it("can't be activated outside your upkeep", () => {
    const { s: s0, ap } = setup([]);
    const ghoul = putIn(s0, ap, ashenGhoul(), "graveyard");
    for (const d of [grizzlyBears(), hillGiant(), ornithopter()]) putIn(s0, ap, d, "graveyard");
    pool(s0, ap, { B: 1 });
    expect(planActivate(s0, ap, ghoul, 0)).toBeNull();
  });

  it("creature cards below it don't count", () => {
    const { s: s0, ap } = setup([]);
    const s = priorityTo(goTo(s0, "upkeep", ap), ap);
    for (const d of [grizzlyBears(), hillGiant(), ornithopter()]) putIn(s, ap, d, "graveyard");
    const ghoul = putIn(s, ap, ashenGhoul(), "graveyard");
    pool(s, ap, { B: 1 });
    expect(s.objects[ghoul]!.zone).toBe("graveyard");
    expect(planActivate(s, ap, ghoul, 0)).toBeNull();
  });
});

describe("Thijarian Witness", () => {
  it("exiles a creature that died attacking alone and investigates", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, thijarianWitness());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = attackWith(s0, ap, [{ attacker: bears, defender: opp }], [{ blocker: giant, attacker: bears }]);
    s = goTo(s, "main2", ap);
    s = settle(s);
    expect(s.objects[bears]!.zone).toBe("exile");
    expect(named(s, "Clue Token").length).toBe(1);
  });

  it("does nothing for a creature that died attacking with another", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, thijarianWitness());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = attackWith(s0, ap, [{ attacker: bears, defender: opp }, { attacker: thopter, defender: opp }], [{ blocker: giant, attacker: bears }]);
    s = goTo(s, "main2", ap);
    s = settle(s);
    expect(s.objects[bears]!.zone).toBe("graveyard");
    expect(named(s, "Clue Token").length).toBe(0);
  });

  it("sees a creature that died blocking alone", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, thijarianWitness());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = goTo(s0, "declareAttackers", opp, opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: giant, defender: ap }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === ap ? [{ blocker: bears, attacker: giant }] : [] });
    s = goTo(s, "main2", opp);
    s = settle(s);
    expect(s.objects[bears]!.zone).toBe("exile");
    expect(named(s, "Clue Token").length).toBe(1);
  });
});

describe("Lane B round B131 bots", () => {
  it("a bot casting Lavabrink Venturer picks the quality most opponents' creatures have", () => {
    const { s: s0, ap, opp, ids } = setup([lavabrink()]);
    putOnBattlefield(s0, opp, hillGiant());
    putOnBattlefield(s0, opp, grizzlyBears());
    putOnBattlefield(s0, next(s0, opp), ornithopter());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const lava = named(s, "Lavabrink Venturer")[0]!;
    expect(s.objects[lava]!.chosen?.parity).toBe("even");
  });

  it("a bot doesn't cast Kaervek's Spite unless it finishes an opponent", () => {
    const { s: s0, ap, opp } = setup([kaerveksSpite()]);
    putOnBattlefield(s0, ap, swamp());
    // The bot's main phase until it passes: does it cast the Spite?
    const plays = (st: GameState) => {
      for (let i = 0; i < 30; i++) {
        const acts = botActions(st, ap);
        if (acts.some((a) => a.type === "castSpell" && st.cards[st.objects[a.objectId]!.cardId]!.name === "Kaervek's Spite")) return true;
        if (!acts.length || acts.some((a) => a.type === "passPriority")) return false;
        st = run(st, acts);
      }
      return false;
    };
    expect(plays(s0)).toBe(false);
    s0.players[opp]!.life = 5;
    expect(plays(s0)).toBe(true);
  });
});

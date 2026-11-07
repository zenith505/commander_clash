// Lane B round B132: Matopi Golem, Skeleton Scavengers and Soldevi Sentry ("When it regenerates this way, ...": a delayed
// trigger linked to one regeneration shield), Spiny Starfish ("for each time it regenerated this turn"), ...

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

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
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const named = (s: GameState, name: string, zone = "battlefield") => Object.values(s.objects).filter((o) => o.zone === zone && s.cards[o.cardId]?.name === name).map((o) => o.id);
/** Clears the opening hand. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) s.objects[id]!.zone = "library";
  s.players[pid]!.library.push(...s.players[pid]!.hand);
  s.players[pid]!.hand = [];
};

// Real oracle text (Scryfall).
const matopiGolem = (): CardDef => ({"oracleId":"0308b9f2-11da-41d0-8d18-18e8c0c600ab","name":"Matopi Golem","manaCost":"{5}","cmc":5,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"{1}: Regenerate this creature. When it regenerates this way, put a -1/-1 counter on it.","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/92378d6f-89ee-49dc-8964-0e9c55daeffc.jpg?1783946973","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/92378d6f-89ee-49dc-8964-0e9c55daeffc.jpg?1783946973","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const skeletonScavengers = (): CardDef => ({"oracleId":"88782913-bfba-4300-b26c-405e6a45537c","name":"Skeleton Scavengers","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Skeleton","supertypes":[],"types":["Creature"],"subtypes":["Skeleton"],"oracleText":"This creature enters with a +1/+1 counter on it.\nPay {1} for each +1/+1 counter on this creature: Regenerate this creature. When it regenerates this way, put a +1/+1 counter on it.","power":"0","toughness":"0","colors":["B"],"colorIdentity":["B"],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/57af1b3f-661a-4b02-be08-0ec721d7cab8.jpg?1783946559","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/57af1b3f-661a-4b02-be08-0ec721d7cab8.jpg?1783946559","commanderLegal":"legal","set":"sth","releasedAt":"1998-03-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const soldeviSentry = (): CardDef => ({"oracleId":"d2a61132-d881-4c80-92f1-a151d835832a","name":"Soldevi Sentry","manaCost":"{1}","cmc":1,"typeLine":"Artifact Creature — Soldier","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Soldier"],"oracleText":"{1}: Choose target opponent. Regenerate this creature. When it regenerates this way, that player may draw a card.","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85976b5c-4eed-4cf9-b2b0-a8421a97ab2a.jpg?1783947159","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85976b5c-4eed-4cf9-b2b0-a8421a97ab2a.jpg?1783947159","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const spinyStarfish = (): CardDef => ({"oracleId":"663d6c61-e269-4f2f-9d8f-49c4c23f05d8","name":"Spiny Starfish","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Starfish","supertypes":[],"types":["Creature"],"subtypes":["Starfish"],"oracleText":"{U}: Regenerate this creature.\nAt the beginning of each end step, if this creature regenerated this turn, create a 0/1 blue Starfish creature token for each time it regenerated this turn.","power":"0","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/c/4/c4242dda-6078-481d-a068-e7b10c873b89.jpg?1783947193","artUrl":"https://cards.scryfall.io/art_crop/front/c/4/c4242dda-6078-481d-a068-e7b10c873b89.jpg?1783947193","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const carrionRats = (): CardDef => ({"oracleId":"1aa6b31b-cd30-4741-abc6-2ef72e445630","name":"Carrion Rats","manaCost":"{B}","cmc":1,"typeLine":"Creature — Rat","supertypes":[],"types":["Creature"],"subtypes":["Rat"],"oracleText":"Whenever this creature attacks or blocks, any player may exile a card from their graveyard. If a player does, this creature assigns no combat damage this turn.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2efa2579-c048-4506-babc-ec1c29bb99a8.jpg?1783945158","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2efa2579-c048-4506-babc-ec1c29bb99a8.jpg?1783945158","commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const carrionWurm = (): CardDef => ({"oracleId":"ed0cf504-c365-4486-92bc-c329b83b99d0","name":"Carrion Wurm","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Zombie Wurm","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Wurm"],"oracleText":"Whenever this creature attacks or blocks, any player may exile three cards from their graveyard. If a player does, this creature assigns no combat damage this turn.","power":"6","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/7/37c2b228-94c0-4e84-ad6d-80b170bb6c0c.jpg?1783945158","artUrl":"https://cards.scryfall.io/art_crop/front/3/7/37c2b228-94c0-4e84-ad6d-80b170bb6c0c.jpg?1783945158","commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sirocco = (): CardDef => ({"oracleId":"a9bdf857-0c6b-4afa-afbb-aff7e4b61b09","name":"Sirocco","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target player reveals their hand. For each blue instant card revealed this way, that player discards that card unless they pay 4 life.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/e/ce37492e-4f07-4171-97d4-84f28fb4e2be.jpg?1783947074","artUrl":"https://cards.scryfall.io/art_crop/front/c/e/ce37492e-4f07-4171-97d4-84f28fb4e2be.jpg?1783947074","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wandOfIth = (): CardDef => ({"oracleId":"3ec1ccd7-4970-4032-be7a-9e76ca6a139e","name":"Wand of Ith","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Target player reveals a card at random from their hand. If it's a land card, that player discards it unless they pay 1 life. If it isn't a land card, the player discards it unless they pay life equal to its mana value. Activate only during your turn.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/0/80c9070a-8c70-480e-a476-e00f8e2c71b9.jpg?1783947923","artUrl":"https://cards.scryfall.io/art_crop/front/8/0/80c9070a-8c70-480e-a476-e00f8e2c71b9.jpg?1783947923","commanderLegal":"legal","set":"drk","releasedAt":"1994-08-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const taintedSpecter = (): CardDef => ({"oracleId":"fc638800-6aec-4a48-ad2c-c9a5ce93c236","name":"Tainted Specter","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Specter","supertypes":[],"types":["Creature"],"subtypes":["Specter"],"oracleText":"Flying\n{1}{B}{B}, {T}: Target player discards a card unless they put a card from their hand on top of their library. If that player discards a card this way, this creature deals 1 damage to each creature and each player. Activate only as a sorcery.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/74feb223-784a-4540-8a8e-6007d10a9505.jpg?1783947085","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/74feb223-784a-4540-8a8e-6007d10a9505.jpg?1783947085","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bullseye = (): CardDef => ({"oracleId":"10db57b4-f895-4514-b610-2252ba676353","name":"Bullseye, Death Dealer","manaCost":"{2}{B/R}","cmc":3,"typeLine":"Legendary Creature — Human Assassin Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin","Villain"],"oracleText":"When Bullseye enters, you may sacrifice an artifact or discard a nonland card. When you do, Bullseye deals 2 damage to any target.\n{3}, {T}, Sacrifice an artifact or discard a nonland card: Bullseye deals 2 damage to any target.","power":"2","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f0b5f-5e0e-4da1-ab54-a62db5af3591.jpg?1783902903","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f0b5f-5e0e-4da1-ab54-a62db5af3591.jpg?1783902903","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ionStorm = (): CardDef => ({"oracleId":"448e0cf2-c97c-4dc0-96ef-91f1eb75d97c","name":"Ion Storm","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}{R}, Remove a +1/+1 counter or a charge counter from a permanent you control: This enchantment deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/2296acb6-a304-42ab-b26b-5cbe796e72b7.jpg?1783944394","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/2296acb6-a304-42ab-b26b-5cbe796e72b7.jpg?1783944394","commanderLegal":"legal","set":"5dn","releasedAt":"2004-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const debtOfLoyalty = (): CardDef => ({"oracleId":"7a5cfc97-89cf-43bc-8e48-f8bf7a0c5fcd","name":"Debt of Loyalty","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Regenerate target creature. You gain control of that creature if it regenerates this way.","colors":["W"],"colorIdentity":["W"],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d19ed33b-42d4-4a5d-a763-cfb43348769c.jpg?1783946749","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d19ed33b-42d4-4a5d-a763-cfb43348769c.jpg?1783946749","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const swamp = (): CardDef => ({"oracleId":"56719f6a-1a6c-4c0a-8d21-18f7d7350b68","name":"Swamp","manaCost":"","cmc":0,"typeLine":"Basic Land — Swamp","supertypes":["Basic"],"types":["Land"],"subtypes":["Swamp"],"oracleText":"({T}: Add {B}.)","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const doomBlade = (): CardDef => ({"oracleId":"59e7f2ae-4535-4191-98be-3e65b6b2befa","name":"Doom Blade","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonblack creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5dcd0c4e-4047-47a2-8969-c62616d457c2.jpg?1783903090","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5dcd0c4e-4047-47a2-8969-c62616d457c2.jpg?1783903090","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const brainstorm = (): CardDef => ({"oracleId":"36cd2364-d113-47d1-b2c4-b088d9eb88dd","name":"Brainstorm","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw three cards, then put two cards from your hand on top of your library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b5545882-6963-4729-b2c6-fb4bdc75ffcc.jpg?1783904806","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b5545882-6963-4729-b2c6-fb4bdc75ffcc.jpg?1783904806","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("Lane B round B132", () => {
  it("compiles every card of the round", () => {
    supported(matopiGolem(), skeletonScavengers(), soldeviSentry(), spinyStarfish(), carrionRats(), carrionWurm(), sirocco(), wandOfIth(), taintedSpecter(), ionStorm(), debtOfLoyalty());
  });
});

describe("Regeneration riders", () => {
  it("Matopi Golem: the shield's rider puts a -1/-1 counter on it once it regenerates", () => {
    const { s: s0, ap, ids } = setup([lightningBolt()]);
    const golem = putOnBattlefield(s0, ap, matopiGolem());
    pool(s0, ap, { C: 1 });
    let s = settle(run(s0, planActivate(s0, ap, golem, 0)));
    expect(s.objects[golem]!.regenShields).toBe(1);
    expect(s.objects[golem]!.counters["-1/-1"] ?? 0).toBe(0);
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(golem)])));
    expect(s.objects[golem]!.zone).toBe("battlefield");
    expect(s.objects[golem]!.tapped).toBe(true);
    expect(s.objects[golem]!.counters["-1/-1"]).toBe(1);
    expect(pt(s, golem)).toBe("2/2");
  });

  it("a shield without a rider is used before the Golem's own (CR 616.1), and the rider waits for its shield", () => {
    const { s: s0, ap, ids } = setup([lightningBolt(), lightningBolt()]);
    const golem = putOnBattlefield(s0, ap, matopiGolem());
    pool(s0, ap, { C: 1 });
    let s = settle(run(s0, planActivate(s0, ap, golem, 0)));
    s.objects[golem]!.regenShields = 2; // another source's plain shield too
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(golem)])));
    expect(s.objects[golem]!.zone).toBe("battlefield");
    expect(s.objects[golem]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(s.objects[golem]!.regenRiders?.length).toBe(1);
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(golem)])));
    expect(s.objects[golem]!.zone).toBe("battlefield");
    expect(s.objects[golem]!.counters["-1/-1"]).toBe(1);
    expect(s.objects[golem]!.regenShields ?? 0).toBe(0);
  });

  it("an unused rider does nothing and ends with its shield at end of turn", () => {
    const { s: s0, ap } = setup([]);
    const golem = putOnBattlefield(s0, ap, matopiGolem());
    pool(s0, ap, { C: 1 });
    let s = settle(run(s0, planActivate(s0, ap, golem, 0)));
    s = goTo(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.objects[golem]!.regenShields ?? 0).toBe(0);
    expect(s.objects[golem]!.regenRiders).toBeUndefined();
    expect(s.objects[golem]!.counters["-1/-1"] ?? 0).toBe(0);
  });

  it("Skeleton Scavengers: costs {1} for each +1/+1 counter on it, and regenerating puts another on it", () => {
    const { s: s0, ap, ids } = setup([skeletonScavengers(), lightningBolt()]);
    pool(s0, ap, { B: 1, C: 2 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const sk = named(s, "Skeleton Scavengers")[0]!;
    expect(s.objects[sk]!.counters["+1/+1"]).toBe(1);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    for (const id of s.battlefield) if (s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    expect(planActivate(s, ap, sk, 0)).toBeNull();
    pool(s, ap, { C: 1 });
    s = settle(run(s, planActivate(s, ap, sk, 0)));
    expect(s.players[ap]!.manaPool.C).toBe(0);
    expect(s.objects[sk]!.regenShields).toBe(1);
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(sk)])));
    expect(s.objects[sk]!.zone).toBe("battlefield");
    expect(s.objects[sk]!.counters["+1/+1"]).toBe(2);
    // Now two counters: {2}.
    pool(s, ap, { C: 1 });
    expect(planActivate(s, ap, sk, 0)).toBeNull();
    pool(s, ap, { C: 2 });
    expect(planActivate(s, ap, sk, 0)).not.toBeNull();
  });

  it("Soldevi Sentry: when it regenerates this way, the targeted opponent may draw a card", () => {
    const { s: s0, ap, ids, opp } = setup([lightningBolt()]);
    const sentry = putOnBattlefield(s0, ap, soldeviSentry());
    pool(s0, ap, { C: 1 });
    let s = settle(run(s0, planActivate(s0, ap, sentry, 0, [plr(opp)])));
    const before = s.players[opp]!.hand.length;
    pool(s, ap, { R: 1 });
    s = run(s, planCast(s, ap, ids[0]!, [tgt(sentry)]));
    s = settle(s, { me: [opp] });
    expect(s.objects[sentry]!.zone).toBe("battlefield");
    expect(s.pending?.player).toBe(opp);
    s = settle(run(s, botActions(s, opp)));
    expect(s.players[opp]!.hand.length).toBe(before + 1);
  });

  it("Spiny Starfish: a 0/1 Starfish at the end step for each time it regenerated this turn", () => {
    const { s: s0, ap, ids } = setup([lightningBolt(), lightningBolt()]);
    const star = putOnBattlefield(s0, ap, spinyStarfish());
    pool(s0, ap, { U: 2 });
    let s = settle(run(s0, planActivate(s0, ap, star, 0)));
    s = settle(run(s, planActivate(s, ap, star, 0)));
    for (const b of ids) {
      pool(s, ap, { R: 1 });
      s = settle(run(s, planCast(s, ap, b, [tgt(star)])));
      expect(s.objects[star]!.zone).toBe("battlefield");
    }
    expect(s.objects[star]!.regenerated?.n).toBe(2);
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(named(s, "Starfish Token").length).toBe(2);
  });

  it("Spiny Starfish: none when it didn't regenerate, even with an unused shield", () => {
    const { s: s0, ap } = setup([]);
    const star = putOnBattlefield(s0, ap, spinyStarfish());
    pool(s0, ap, { U: 1 });
    let s = settle(run(s0, planActivate(s0, ap, star, 0)));
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(named(s, "Starfish Token").length).toBe(0);
  });
});

/** `attacks` declared by `ap`; blockers as given, then on until combat damage is dealt, `me` stopping at its questions. */
const attackWith = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = [], me: PlayerId[] = []) => {
  s = goTo(s, "declareAttackers", ap, ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 200 && !(s.step === "combatDamage" || s.step === "endCombat"); i++) {
    const p = s.pending;
    if (p && me.includes(p.player)) return s;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Carrion Rats and Carrion Wurm", () => {
  it("the player it attacks exiles a card from their graveyard, and it deals no combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const rats = putOnBattlefield(s0, ap, carrionRats());
    const card = putIn(s0, opp, grizzlyBears(), "graveyard");
    const life = s0.players[opp]!.life;
    const s = attackWith(s0, ap, [{ attacker: rats, defender: opp }]);
    expect(s.objects[card]!.zone).toBe("exile");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("with no one able to (empty graveyards, or fewer than three cards for the Wurm), it deals its damage", () => {
    const { s: s0, ap, opp } = setup([]);
    for (const pid of s0.turnOrder) for (const id of [...s0.players[pid]!.graveyard]) { s0.objects[id]!.zone = "exile"; s0.players[pid]!.exile.push(id); }
    for (const pid of s0.turnOrder) s0.players[pid]!.graveyard = [];
    const wurm = putOnBattlefield(s0, ap, carrionWurm());
    putIn(s0, opp, grizzlyBears(), "graveyard");
    putIn(s0, opp, grizzlyBears(), "graveyard");
    const life = s0.players[opp]!.life;
    let s = attackWith(s0, ap, [{ attacker: wurm, defender: opp }]);
    s = goTo(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life - 6);
    expect(s.players[opp]!.graveyard.length).toBe(2);
  });

  it("asks a player which cards to exile when they have more, and once one did, its controller's choice doesn't matter", () => {
    const { s: s0, ap, opp } = setup([]);
    const wurm = putOnBattlefield(s0, ap, carrionWurm());
    const mine = [0, 1, 2, 3].map(() => putIn(s0, ap, grizzlyBears(), "graveyard"));
    const life = s0.players[opp]!.life;
    let s = attackWith(s0, ap, [{ attacker: wurm, defender: opp }], [], [ap]);
    expect(s.pending?.kind).toBe("chooseOption");
    expect((s.pending as { labels?: string[] }).labels).toContain("Exile 3 cards from your graveyard");
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: mine.slice(1) });
    s = goTo(s, "endCombat", ap);
    expect(mine.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "exile", "exile", "exile"]);
    expect(s.players[opp]!.life).toBe(life);
  });
});

describe("Sirocco", () => {
  it("each blue instant in the revealed hand is discarded unless its owner pays 4 life for it", () => {
    const { s: s0, ap, opp, ids } = setup([sirocco()]);
    emptyHand(s0, opp);
    const [o1, o2] = [putIn(s0, opp, opt(), "hand"), putIn(s0, opp, opt(), "hand")];
    const bolt = putIn(s0, opp, lightningBolt(), "hand");
    const life = s0.players[opp]!.life;
    pool(s0, ap, { R: 1, C: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])), { me: [opp] });
    expect(s.pending?.kind).toBe("payUnless");
    s = settle(act(s, { type: "payUnless", player: opp, pay: true }), { me: [opp] });
    expect(s.pending?.kind).toBe("payUnless");
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }), { me: [opp] });
    expect(s.players[opp]!.life).toBe(life - 4);
    expect([o1, o2].map((id) => s.objects[id]!.zone).sort()).toEqual(["graveyard", "hand"]);
    expect(s.objects[bolt]!.zone).toBe("hand");
  });

  it("a player with less than 4 life can't pay, so the cards are discarded (CR 119.4)", () => {
    const { s: s0, ap, opp, ids } = setup([sirocco()]);
    emptyHand(s0, opp);
    const o1 = putIn(s0, opp, opt(), "hand");
    s0.players[opp]!.life = 3;
    pool(s0, ap, { R: 1, C: 1 });
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])), { me: [opp] });
    expect(s.pending).toBeNull();
    expect(s.objects[o1]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(3);
  });
});

describe("Wand of Ith", () => {
  it("a land revealed at random is discarded unless they pay 1 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const wand = putOnBattlefield(s0, ap, wandOfIth());
    emptyHand(s0, opp);
    const land = putIn(s0, opp, forest(), "hand");
    const life = s0.players[opp]!.life;
    pool(s0, ap, { C: 3 });
    let s = settle(run(s0, planActivate(s0, ap, wand, 0, [plr(opp)])), { me: [opp] });
    expect(s.pending?.kind).toBe("payUnless");
    expect((s.pending as { life?: number }).life).toBe(1);
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }), { me: [opp] });
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("a nonland card costs life equal to its mana value to keep", () => {
    const { s: s0, ap, opp } = setup([]);
    const wand = putOnBattlefield(s0, ap, wandOfIth());
    emptyHand(s0, opp);
    const card = putIn(s0, opp, divination(), "hand");
    const life = s0.players[opp]!.life;
    pool(s0, ap, { C: 3 });
    let s = settle(run(s0, planActivate(s0, ap, wand, 0, [plr(opp)])), { me: [opp] });
    expect((s.pending as { life?: number }).life).toBe(3);
    s = settle(act(s, { type: "payUnless", player: opp, pay: true }), { me: [opp] });
    expect(s.objects[card]!.zone).toBe("hand");
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("an empty hand reveals nothing, and it can only be activated during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const wand = putOnBattlefield(s0, ap, wandOfIth());
    emptyHand(s0, opp);
    pool(s0, ap, { C: 3 });
    const s = settle(run(s0, planActivate(s0, ap, wand, 0, [plr(opp)])), { me: [opp] });
    expect(s.pending).toBeNull();
    let t = goTo(s, "upkeep", opp);
    t = priorityTo(t, ap);
    pool(t, ap, { C: 3 });
    t.objects[wand]!.tapped = false;
    expect(planActivate(t, ap, wand, 0, [plr(opp)])).toBeNull();
  });
});

describe("Tainted Specter", () => {
  it("the player may put a card from their hand on top of their library instead, and nothing is dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    const specter = putOnBattlefield(s0, ap, taintedSpecter());
    const bear = putOnBattlefield(s0, opp, grizzlyBears());
    emptyHand(s0, opp);
    const [a, b] = [putIn(s0, opp, forest(), "hand"), putIn(s0, opp, divination(), "hand")];
    const life = s0.players[opp]!.life;
    pool(s0, ap, { B: 2, C: 1 });
    let s = settle(run(s0, planActivate(s0, ap, specter, 0, [plr(opp)])), { me: [opp] });
    expect(s.pending?.kind).toBe("chooseOption");
    expect((s.pending as { labels?: string[] }).labels).toEqual(["Put a card from your hand on top of your library", "Discard a card"]);
    s = act(s, { type: "chooseOption", player: opp, choice: "0" });
    expect(s.pending?.kind).toBe("handToTop");
    s = settle(act(s, { type: "handToTop", player: opp, objectIds: [b] }), { me: [opp] });
    expect(s.players[opp]!.library[0]).toBe(b);
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[bear]!.damage ?? 0).toBe(0);
  });

  it("if they discard a card, it deals 1 damage to each creature and each player", () => {
    const { s: s0, ap, opp } = setup([]);
    const specter = putOnBattlefield(s0, ap, taintedSpecter());
    const bear = putOnBattlefield(s0, opp, grizzlyBears());
    emptyHand(s0, opp);
    const a = putIn(s0, opp, forest(), "hand");
    const lives = s0.turnOrder.map((pid) => s0.players[pid]!.life);
    pool(s0, ap, { B: 2, C: 1 });
    let s = settle(run(s0, planActivate(s0, ap, specter, 0, [plr(opp)])), { me: [opp] });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "none" }), { me: [opp] });
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.turnOrder.map((pid) => s.players[pid]!.life)).toEqual(lives.map((l) => l - 1));
    expect(s.objects[bear]!.damage).toBe(1);
    expect(s.objects[specter]!.damage).toBe(1);
  });

  it("with an empty hand there's nothing to discard, so no damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const specter = putOnBattlefield(s0, ap, taintedSpecter());
    emptyHand(s0, opp);
    const life = s0.players[opp]!.life;
    pool(s0, ap, { B: 2, C: 1 });
    const s = settle(run(s0, planActivate(s0, ap, specter, 0, [plr(opp)])), { me: [opp] });
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[specter]!.damage ?? 0).toBe(0);
  });
});

describe("Ion Storm", () => {
  it("removes a +1/+1 counter or a charge counter from a permanent you control to deal 2 damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const storm = putOnBattlefield(s0, ap, ionStorm());
    const bear = putOnBattlefield(s0, ap, grizzlyBears());
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    s0.objects[bear]!.counters["+1/+1"] = 1;
    s0.objects[thopter]!.counters.charge = 1;
    s0.objects[thopter]!.counters.time = 3;
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    pool(s0, ap, { R: 2, C: 2 });
    // A time counter isn't one of the two kinds.
    expect(planActivate(s0, ap, storm, 0, [plr(opp)], undefined, undefined, undefined, { counters: [{ id: thopter, kind: "time" }] })).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, storm, 0, [plr(opp)], undefined, undefined, undefined, { counters: [{ id: thopter, kind: "charge" }] })));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[thopter]!.counters.charge ?? 0).toBe(0);
    s = settle(run(s, planActivate(s, ap, storm, 0, [plr(opp)], undefined, undefined, undefined, { counters: [{ id: bear, kind: "+1/+1" }] })));
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(pt(s, bear)).toBe("2/2");
    // None of either kind left: it can't be activated.
    expect(planActivate(s, ap, storm, 0, [plr(opp)])).toBeNull();
  });
});

describe("Debt of Loyalty", () => {
  it("you gain control of the creature for good if it regenerates with that shield (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([debtOfLoyalty(), lightningBolt()]);
    const bear = putOnBattlefield(s0, opp, grizzlyBears());
    pool(s0, ap, { W: 2, C: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)])));
    expect(s.objects[bear]!.regenShields).toBe(1);
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bear)])));
    expect(s.objects[bear]!.zone).toBe("battlefield");
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(controllerOf(s, s.objects[bear]!)).toBe(ap);
    s = goTo(s, "upkeep", opp);
    expect(controllerOf(s, s.objects[bear]!)).toBe(ap);
  });

  it("with another shield on it too, its controller uses that one first, and keeps the creature", () => {
    const { s: s0, ap, opp, ids } = setup([debtOfLoyalty(), lightningBolt()]);
    const bear = putOnBattlefield(s0, opp, grizzlyBears());
    pool(s0, ap, { W: 2, C: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)])));
    s.objects[bear]!.regenShields = 2;
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bear)])));
    expect(s.objects[bear]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[bear]!)).toBe(opp);
    expect(s.objects[bear]!.regenRiders?.length).toBe(1);
  });
});

// Lane B round B127: Psychic Theft and Planeswalker's Mischief (an exiled instant or sorcery castable while exiled, returned
// at the next end step if not cast), Song of Blood (a delayed attack trigger counting the creature cards milled), Last Rites
// (as many nonland cards chosen as were discarded), Suppress (a hand exiled face down until that player's next end step),
// Thought Dissector (reveal until an artifact or X cards), Gaea's Liege (P/T set by Forests while not attacking or
// attacking), Anthropede (discard a card or pay {2}, then a reflexive trigger), Dementia Sliver (a named card revealed at
// random), Hedge Whisperer and The Blackstaff of Waterdeep (a creature for as long as ~ remains tapped), Welcome to . . .
// (a Wall for as long as you control the Saga).

import { describe, expect, it } from "vitest";
import { act, forest, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

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
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A card of `def` put into `pid`'s graveyard, hand or library (on top). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
/** Empties `pid`'s hand into their library's bottom (so whole-turn tests have no cards to discard). */
const clearHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};

// Real oracle text (Scryfall).
const psychicTheft = (): CardDef => ({"oracleId":"66953dfd-d908-41d3-abb4-309c6a165dc3","name":"Psychic Theft","manaCost":"{1}{U}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player reveals their hand. You choose an instant or sorcery card from it and exile that card. You may cast that card for as long as it remains exiled. At the beginning of the next end step, if you haven't cast the card, return it to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/6/f6f86c92-c19e-4f2c-96d3-d3b05623cb00.jpg?1783945791","artUrl":"https://cards.scryfall.io/art_crop/front/f/6/f6f86c92-c19e-4f2c-96d3-d3b05623cb00.jpg?1783945791","commanderLegal":"legal","set":"pcy","releasedAt":"2000-06-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mischief = (): CardDef => ({"oracleId":"78e87805-19e3-415b-ad0b-3275183d7297","name":"Planeswalker's Mischief","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{3}{U}: Target opponent reveals a card at random from their hand. If it's an instant or sorcery card, exile it. You may cast it without paying its mana cost for as long as it remains exiled. At the beginning of the next end step, if you haven't cast it, return it to its owner's hand. Activate only as a sorcery.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79aa232c-3f16-4c68-99dc-09a7aeef477b.jpg?1783945625","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79aa232c-3f16-4c68-99dc-09a7aeef477b.jpg?1783945625","commanderLegal":"legal","set":"pls","releasedAt":"2001-02-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const songOfBlood = (): CardDef => ({"oracleId":"ab4b6524-3667-4db3-b5cb-1b02ee944906","name":"Song of Blood","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Mill four cards. Whenever a creature attacks this turn, it gets +1/+0 until end of turn for each creature card put into your graveyard this way.","colors":["R"],"colorIdentity":["R"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/4497a1d7-6604-4f2d-9484-1f1d77a6228f.jpg?1783946985","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/4497a1d7-6604-4f2d-9484-1f1d77a6228f.jpg?1783946985","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lastRites = (): CardDef => ({"oracleId":"3196e1f4-7f94-4eb6-ae2b-ed11ba392552","name":"Last Rites","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Discard any number of cards. Target player reveals their hand, then you choose a nonland card from it for each card discarded this way. That player discards those cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b140a36-6686-4781-a432-cb2ef58afa81.jpg?1783945243","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b140a36-6686-4781-a432-cb2ef58afa81.jpg?1783945243","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const suppress = (): CardDef => ({"oracleId":"b39651ad-1c05-45f8-b036-536c4d7324c0","name":"Suppress","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player exiles all cards from their hand face down. At the beginning of the end step of that player's next turn, that player returns those cards to their hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/642eefde-8727-44ff-9e04-373abfcd0679.jpg?1783945346","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/642eefde-8727-44ff-9e04-373abfcd0679.jpg?1783945346","commanderLegal":"legal","set":"apc","releasedAt":"2001-06-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const thoughtDissector = (): CardDef => ({"oracleId":"6702fcdb-0b06-4b17-966a-3c5e033c3341","name":"Thought Dissector","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{X}, {T}: Target opponent reveals cards from the top of their library until an artifact card or X cards are revealed, whichever comes first. If an artifact card is revealed this way, put it onto the battlefield under your control and sacrifice this artifact. Put the rest of the revealed cards into that player's graveyard.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/eba0e921-b81a-4803-8e1b-f7ae556c1e6f.jpg?1783944416","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/eba0e921-b81a-4803-8e1b-f7ae556c1e6f.jpg?1783944416","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gaeasLiege = (): CardDef => ({"oracleId":"8d134a60-e1e5-4163-8bdc-36af91567185","name":"Gaea's Liege","manaCost":"{3}{G}{G}{G}","cmc":6,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"As long as Gaea's Liege isn't attacking, its power and toughness are each equal to the number of Forests you control. As long as Gaea's Liege is attacking, its power and toughness are each equal to the number of Forests defending player controls.\n{T}: Target land becomes a Forest until this creature leaves the battlefield.","power":"*","toughness":"*","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e2b15221-c8b0-4861-9f8b-8a65834ad499.jpg?1783948677","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e2b15221-c8b0-4861-9f8b-8a65834ad499.jpg?1783948677","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const anthropede = (): CardDef => ({"oracleId":"452d98ae-0fa2-4cff-9e18-eecd76ddb20b","name":"Anthropede","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Insect","supertypes":[],"types":["Creature"],"subtypes":["Insect"],"oracleText":"Reach\nWhen this creature enters, you may discard a card or pay {2}. When you do, destroy target Room.","power":"3","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51216ab0-9806-4faa-afbd-143e95dc255b.jpg?1783909459","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51216ab0-9806-4faa-afbd-143e95dc255b.jpg?1783909459","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const dementiaSliver = (): CardDef => ({"oracleId":"d09b57c5-255b-41a5-959b-90d0fdc9752c","name":"Dementia Sliver","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"All Slivers have \"{T}: Choose a card name. Target opponent reveals a card at random from their hand. If that card has the chosen name, that player discards it. Activate only during your turn.\"","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/955028d2-33df-4295-8ee3-572e5979b04c.jpg?1783943203","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/955028d2-33df-4295-8ee3-572e5979b04c.jpg?1783943203","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hedgeWhisperer = (): CardDef => ({"oracleId":"923b2a1b-d7b6-439d-9681-c7ba88165c31","name":"Hedge Whisperer","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid Detective","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid","Detective"],"oracleText":"You may choose not to untap this creature during your untap step.\n{3}{G}, {T}, Collect evidence 4: Target land you control becomes a 5/5 green Plant Boar creature with haste for as long as this creature remains tapped. It's still a land. Activate only as a sorcery. (To collect evidence 4, exile cards with total mana value 4 or greater from your graveyard.)","power":"0","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Collect evidence"],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/4627adcd-ace7-4777-a7e6-fc80ac6b9dfe.jpg?1783912865","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/4627adcd-ace7-4777-a7e6-fc80ac6b9dfe.jpg?1783912865","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const blackstaff = (): CardDef => ({"oracleId":"a4faed58-4b1b-4cab-8a12-4fcd20b320ab","name":"The Blackstaff of Waterdeep","manaCost":"{U}","cmc":1,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"You may choose not to untap The Blackstaff of Waterdeep during your untap step.\nAnimate Walking Statue — {1}{U}, {T}: Another target nontoken artifact you control becomes a 4/4 artifact creature for as long as The Blackstaff of Waterdeep remains tapped. Activate only as a sorcery.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317cbf3-13a1-4471-a23c-de429941e8a4.jpg?1783926518","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317cbf3-13a1-4471-a23c-de429941e8a4.jpg?1783926518","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bottomlessPool = (): CardDef => ({"oracleId":"b9ac4856-5cdb-479f-b0f5-7fa0b232a5ff","name":"Bottomless Pool // Locker Room","manaCost":"{U} // {4}{U}","cmc":6,"typeLine":"Enchantment — Room // Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"When you unlock this door, return up to one target creature to its owner's hand.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/606fe87c-d17b-4fa7-8e82-e7002d8229ef.jpg?1783909499","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/606fe87c-d17b-4fa7-8e82-e7002d8229ef.jpg?1783909499","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Bottomless Pool","manaCost":"{U}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"When you unlock this door, return up to one target creature to its owner's hand.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"]},{"name":"Locker Room","manaCost":"{4}{U}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"Whenever one or more creatures you control deal combat damage to a player, draw a card.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"]}]}) as CardDef;
const welcomeTo = (): CardDef => ({"oracleId":"a4b37d16-95b3-4143-a0b2-ad9f2aba91f8","name":"Welcome to . . . // Jurassic Park","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Enchantment — Saga // Legendary Land","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — For each opponent, up to one target noncreature artifact they control becomes a 0/4 Wall artifact creature with defender for as long as you control this Saga.\nII — Create a 3/3 green Dinosaur creature token with trample. It gains haste until end of turn.\nIII — Destroy all Walls. Exile this Saga, then return it to the battlefield transformed under your control.","colors":["G"],"colorIdentity":["G"],"keywords":["Transform"],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d84e2d4-38bf-4d46-99a6-37c2dda66b16.jpg?1783913644","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d84e2d4-38bf-4d46-99a6-37c2dda66b16.jpg?1783913644","commanderLegal":"legal","set":"rex","releasedAt":"2023-11-17","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Welcome to . . .","manaCost":"{1}{G}{G}","typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — For each opponent, up to one target noncreature artifact they control becomes a 0/4 Wall artifact creature with defender for as long as you control this Saga.\nII — Create a 3/3 green Dinosaur creature token with trample. It gains haste until end of turn.\nIII — Destroy all Walls. Exile this Saga, then return it to the battlefield transformed under your control.","colors":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d84e2d4-38bf-4d46-99a6-37c2dda66b16.jpg?1783913644","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d84e2d4-38bf-4d46-99a6-37c2dda66b16.jpg?1783913644"},{"name":"Jurassic Park","manaCost":"","typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"(Transforms from Welcome to ....)\nEach Dinosaur card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\n{T}: Add {G} for each Dinosaur you control.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/6/d/6d84e2d4-38bf-4d46-99a6-37c2dda66b16.jpg?1783913644","artUrl":"https://cards.scryfall.io/art_crop/back/6/d/6d84e2d4-38bf-4d46-99a6-37c2dda66b16.jpg?1783913644"}]}) as CardDef;

describe("Psychic Theft and Planeswalker's Mischief: an exiled instant or sorcery to cast", () => {
  it("compile", () => supported(psychicTheft(), mischief()));

  it("Psychic Theft: you choose an instant or sorcery card from the revealed hand; you may cast it, and once cast it isn't returned", () => {
    const { s: s0, ap, ids, opp } = setup([psychicTheft()]);
    const bolt = putIn(s0, opp, lightningBolt(), "hand");
    putIn(s0, opp, grizzlyBears(), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])), { me: [ap] });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    // Only the instant: the Bears aren't an instant or sorcery card.
    expect(s.pending.cards).toEqual([bolt]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bolt] }));
    expect(s.objects[bolt]!.zone).toBe("exile");
    // Cast it from exile, paying its cost (an "R" from the pool).
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, bolt, [plr(opp)])));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.objects[bolt]!.zone).toBe("graveyard");
    expect(s.objects[bolt]!.owner).toBe(opp);
    // Nothing comes back at the end step.
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.objects[bolt]!.zone).toBe("graveyard");
  });

  it("Psychic Theft: not cast, the card goes back to its owner's hand at the beginning of the next end step", () => {
    const { s: s0, ap, ids, opp } = setup([psychicTheft()]);
    const bolt = putIn(s0, opp, lightningBolt(), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])), { me: [ap] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bolt] }));
    expect(s.objects[bolt]!.zone).toBe("exile");
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.objects[bolt]!.zone).toBe("hand");
    expect(s.players[opp]!.hand).toContain(bolt);
  });

  it("Planeswalker's Mischief: a revealed instant is exiled and may be cast without paying its mana cost; uncast, it returns", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mischief());
    s0.players[opp]!.hand = [];
    const bolt = putIn(s0, opp, lightningBolt(), "hand");
    pool(s0, ap, { U: 4 });
    let s = settle(run(s0, planActivate(s0, ap, m, 0, [plr(opp)])));
    expect(s.objects[bolt]!.zone).toBe("exile");
    // Free: no mana in the pool, nothing tapped for it.
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const untapped = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    s = settle(run(s, planCast(s, ap, bolt, [plr(opp)])));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(untapped);
    expect(s.objects[bolt]!.zone).toBe("graveyard");
  });

  it("Planeswalker's Mischief: a revealed creature card stays in the hand; an exiled instant not cast returns at the end step", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mischief());
    s0.players[opp]!.hand = [];
    const bears = putIn(s0, opp, grizzlyBears(), "hand");
    pool(s0, ap, { U: 4 });
    let s = settle(run(s0, planActivate(s0, ap, m, 0, [plr(opp)])));
    expect(s.objects[bears]!.zone).toBe("hand");
    // A second Mischief on a lone Bolt, left uncast.
    s.players[opp]!.hand = [];
    s.objects[bears]!.zone = "library";
    s.players[opp]!.library.push(bears);
    const bolt = putIn(s, opp, lightningBolt(), "hand");
    const m2 = putOnBattlefield(s, ap, mischief());
    pool(s, ap, { U: 4 });
    s = settle(run(s, planActivate(s, ap, m2, 0, [plr(opp)])));
    expect(s.objects[bolt]!.zone).toBe("exile");
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.players[opp]!.hand).toContain(bolt);
  });
});

describe("Song of Blood: attackers get +1/+0 for each creature card milled", () => {
  it("compile", () => supported(songOfBlood()));

  it("two creature cards milled: each creature that attacks this turn gets +2/+0", () => {
    const { s: s0, ap, ids, opp } = setup([songOfBlood()]);
    // The top four: two creature cards and two lands.
    for (const d of [forest, grizzlyBears(), forest, llanowarElves()]) putIn(s0, ap, d, "library");
    const a = putOnBattlefield(s0, ap, grizzlyBears());
    const b = putOnBattlefield(s0, ap, llanowarElves());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.graveyard.length).toBeGreaterThanOrEqual(5);
    s = goTo(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] });
    s = settle(s);
    expect(ptOf(s, a)).toBe("4/2");
    expect(ptOf(s, b)).toBe("3/1");
  });
});

describe("Last Rites: a nonland card for each card discarded", () => {
  it("compile", () => supported(lastRites()));

  it("discard two cards: you choose two nonland cards from the target player's revealed hand", () => {
    const { s: s0, ap, ids, opp } = setup([lastRites(), grizzlyBears(), llanowarElves()]);
    s0.players[ap]!.hand = [...ids];
    s0.players[opp]!.hand = [];
    const bolt = putIn(s0, opp, lightningBolt(), "hand");
    const bears = putIn(s0, opp, grizzlyBears(), "hand");
    const elves = putIn(s0, opp, llanowarElves(), "hand");
    const land = putIn(s0, opp, forest, "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])), { me: [ap] });
    // Discard any number: both other cards.
    expect(s.pending?.kind).toBe("discard");
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[1]!, ids[2]!] }), { me: [ap] });
    expect(s.players[ap]!.hand).toEqual([]);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.max).toBe(2);
    expect(s.pending.cards).not.toContain(land);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bolt, elves] }));
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining([bolt, elves]));
    expect(s.players[opp]!.hand.sort()).toEqual([bears, land].sort());
  });

  it("discarding nothing takes nothing", () => {
    const { s: s0, ap, ids, opp } = setup([lastRites(), grizzlyBears()]);
    s0.players[ap]!.hand = [...ids];
    s0.players[opp]!.hand = [];
    const bolt = putIn(s0, opp, lightningBolt(), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])), { me: [ap] });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [] }), { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.hand).toEqual([bolt]);
    expect(s.players[ap]!.hand).toEqual([ids[1]!]);
  });
});

describe("Suppress: a hand exiled face down until that player's next end step", () => {
  it("compile", () => supported(suppress()));

  it("the target opponent's hand is exiled face down and comes back at the beginning of the end step of their next turn", () => {
    const { s: s0, ap, ids, opp } = setup([suppress()]);
    const hand = [...s0.players[opp]!.hand];
    expect(hand.length).toBeGreaterThan(0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])));
    expect(s.players[opp]!.hand).toEqual([]);
    for (const id of hand) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen ?? []).toEqual([]);
    }
    // Not at this turn's end step.
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.players[opp]!.hand).toEqual([]);
    // At the opponent's own end step, the next turn.
    s = goTo(s, "end", opp);
    s = settle(s);
    expect(s.players[opp]!.hand).toEqual(expect.arrayContaining(hand));
  });

  it("targeting yourself: back at the end step of your next turn, not this one", () => {
    const { s: s0, ap, ids } = setup([suppress(), grizzlyBears()]);
    s0.players[ap]!.hand = [...ids];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(ap)])));
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    s = goTo(s, "upkeep", ap);
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.players[ap]!.hand).toContain(ids[1]!);
  });
});

describe("Thought Dissector: until an artifact card or X cards", () => {
  it("compile", () => supported(thoughtDissector()));

  it("an artifact among the first X cards enters under your control and ~ is sacrificed; the cards before it go to that player's graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const td = putOnBattlefield(s0, ap, thoughtDissector());
    const ring = putIn(s0, opp, solRing(), "library");
    const f1 = putIn(s0, opp, forest, "library");
    const f2 = putIn(s0, opp, forest, "library");
    pool(s0, ap, { C: 5 });
    let s = settle(run(s0, planActivate(s0, ap, td, 0, [plr(opp)], undefined, undefined, 5)));
    expect(s.objects[ring]!.zone).toBe("battlefield");
    expect(s.objects[ring]!.controller).toBe(ap);
    expect(s.objects[td]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining([f1, f2]));
  });

  it("X cards revealed first: all of them go to that player's graveyard and ~ stays", () => {
    const { s: s0, ap, opp } = setup([]);
    const td = putOnBattlefield(s0, ap, thoughtDissector());
    const ring = putIn(s0, opp, solRing(), "library");
    const f1 = putIn(s0, opp, forest, "library");
    const f2 = putIn(s0, opp, forest, "library");
    pool(s0, ap, { C: 2 });
    let s = settle(run(s0, planActivate(s0, ap, td, 0, [plr(opp)], undefined, undefined, 2)));
    expect(s.players[opp]!.graveyard).toEqual([f2, f1].filter((id) => s.players[opp]!.graveyard.includes(id)));
    expect(s.players[opp]!.graveyard).toHaveLength(2);
    expect(s.objects[ring]!.zone).toBe("library");
    expect(s.players[opp]!.library[0]).toBe(ring);
    expect(s.objects[td]!.zone).toBe("battlefield");
  });
});

describe("Gaea's Liege: Forests you control, or the defending player's while attacking", () => {
  it("compile", () => supported(gaeasLiege()));

  it("not attacking it counts your Forests; attacking, the defending player's", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gaeasLiege());
    putOnBattlefield(s0, opp, forest);
    expect(ptOf(s0, g)).toBe("3/3");
    putOnBattlefield(s0, ap, forest);
    expect(ptOf(s0, g)).toBe("4/4");
    let s = goTo(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    expect(ptOf(s, g)).toBe("1/1");
    // In the graveyard it's 0/0 (CR 208.2): the ability isn't a characteristic-defining one (CR 604.3a).
    const y = putIn(s, ap, gaeasLiege(), "graveyard");
    expect(power(s, s.objects[y]!)).toBe(0);
  });
});

describe("Anthropede: discard a card or pay {2}, then destroy target Room", () => {
  it("compile", () => supported(anthropede()));

  it("the choice offers a discard, {2} or neither; a bot pays to destroy an opponent's Room", () => {
    const { s: s0, ap, ids, opp } = setup([anthropede()]);
    const room = putOnBattlefield(s0, opp, bottomlessPool());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    expect(s.pending?.player).toBe(ap);
    const p = s.pending!;
    // Discard a card, pay {2}, or neither.
    expect(JSON.stringify(p)).toMatch(/Discard a card/);
    expect(JSON.stringify(p)).toMatch(/Pay \{2\}/);
    s = settle(s);
    // The bot pays for an opponent's Room.
    expect(s.objects[room]!.zone).toBe("graveyard");
  });

  it("discarding a card is the other way to pay; choosing neither destroys nothing", () => {
    const { s: s0, ap, ids, opp } = setup([anthropede(), grizzlyBears()]);
    s0.players[ap]!.hand = [...ids];
    const room = putOnBattlefield(s0, opp, bottomlessPool());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.objects[room]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand).toEqual([ids[1]!]);
    // A second Anthropede, paid for with the Bears.
    const a2 = putIn(s, ap, anthropede(), "hand");
    pool(s, ap, { G: 4 });
    s = settle(run(s, planCast(s, ap, a2)), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }), { me: [ap] });
    for (let i = 0; i < 5 && s.pending?.player === ap; i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(room)] }), { me: [ap] });
      else s = settle(run(s, botActions(s, ap)), { me: [ap] });
    }
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.objects[room]!.zone).toBe("graveyard");
  });
});

describe("Dementia Sliver: a named card revealed at random is discarded", () => {
  it("compile", () => supported(dementiaSliver()));

  it("the right name: the opponent discards the revealed card; activate only during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dementiaSliver());
    s0.players[opp]!.hand = [];
    const bolt = putIn(s0, opp, lightningBolt(), "hand");
    let s = settle(run(s0, planActivate(s0, ap, d, 0, [plr(opp)])), { me: [ap] });
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Lightning Bolt" }));
    expect(s.objects[bolt]!.zone).toBe("graveyard");
    // Another name: the card stays.
    const bolt2 = putIn(s, opp, lightningBolt(), "hand");
    s.objects[d]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, d, 0, [plr(opp)])), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" }));
    expect(s.objects[bolt2]!.zone).toBe("hand");
  });
});

describe("Hedge Whisperer, The Blackstaff of Waterdeep and Welcome to . . .: a creature for as long as ~ stays tapped or controlled", () => {
  it("compile", () => supported(hedgeWhisperer(), blackstaff(), welcomeTo()));

  it("Hedge Whisperer: the land is a 5/5 Plant Boar with haste while ~ is tapped, still a land; it ends when ~ untaps", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hedgeWhisperer());
    const land = putOnBattlefield(s0, ap, forest);
    for (const d of [grizzlyBears(), grizzlyBears(), llanowarElves()]) putIn(s0, ap, d, "graveyard");
    pool(s0, ap, { G: 4 });
    let s = settle(run(s0, planActivate(s0, ap, h, 0, [tgt(land)])), { me: [ap] });
    // Collect evidence 4: pick the cards to exile if asked.
    for (let i = 0; i < 5 && s.pending?.player === ap; i++) s = settle(run(s, botActions(s, ap)), { me: [ap] });
    const c = characteristics(s, s.objects[land]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Plant", "Boar"]));
    expect(ptOf(s, land)).toBe("5/5");
    expect(c.keywords).toContain("Haste");
    s.objects[h]!.tapped = false;
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(characteristics(s, s.objects[land]!).types).not.toContain("Creature");
  });

  it("The Blackstaff of Waterdeep: another artifact becomes a 4/4 artifact creature while it stays tapped", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, blackstaff());
    const ring = putOnBattlefield(s0, ap, solRing());
    pool(s0, ap, { U: 2 });
    const s = settle(run(s0, planActivate(s0, ap, b, 0, [tgt(ring)])));
    expect(characteristics(s, s.objects[ring]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(ptOf(s, ring)).toBe("4/4");
  });

  it("Welcome to . . .: chapter I makes an opponent's noncreature artifact a 0/4 Wall with defender", () => {
    const { s: s0, ap, ids, opp } = setup([welcomeTo()]);
    const ring = putOnBattlefield(s0, opp, solRing());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(ring), { kind: "none" }, { kind: "none" }] }));
    const c = characteristics(s, s.objects[ring]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Wall");
    expect(c.keywords).toContain("Defender");
    expect(ptOf(s, ring)).toBe("0/4");
  });
});

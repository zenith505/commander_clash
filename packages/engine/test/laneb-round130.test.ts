// Lane B round B130: Spiritualize, Paladin of Prahv and Niko Aris (a delayed trigger "whenever that creature deals
// damage this turn", any damage), Glyph of Life (whenever that Wall is dealt damage by an attacking creature this turn),
// Nimble Hobbit (sacrifice a Food or pay {2}{W}, then a reflexive tap), Obscura Ascendancy (an intervening "if its mana
// value is equal to 1 plus the number of soul counters"), Backfire (whenever enchanted creature deals damage to you),
// Inspired Idea (a maximum hand size reduced for the rest of the game, with cleave), Lymph Sliver (absorb 1 for Slivers),
// Encircling Fissure (combat damage by creatures target opponent controls prevented, with awaken).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, maxHandSize, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

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
/** A card of `def` put into `pid`'s hand or graveyard. */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `attacker` attacks `defender`; blockers as given, then on to the end of combat damage. */
const attack = (s: GameState, ap: PlayerId, attacker: string, defender: PlayerId, blocks: { blocker: string; attacker: string }[] = [], me?: PlayerId) => {
  s = goTo(s, "declareAttackers", ap, ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers" && s.step !== "combatDamage"; i++) s = s.pending ? (me && s.pending.player === me ? s : run(s, botActions(s, s.pending.player))) : act(s, { type: "passPriority", player: waitingOn(s)! });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) {
    const who = s.pending.player;
    s = act(s, { type: "declareBlockers", player: who, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === who) });
  }
  return s;
};

/** `pid` activates a {T} ability of theirs once they have priority (planActivate plans only for the player with it). */
const tapAbility = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[]) => {
  for (let i = 0; i < 10 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "activateAbility", player: pid, objectId: id, index: 0, targets });
};

// Real oracle text (Scryfall).
const spiritualize = (): CardDef => ({"oracleId":"15c4a13e-33ae-4d08-bb1a-535d8b82ca07","name":"Spiritualize","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, whenever target creature deals damage, you gain that much life.\nDraw a card.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/6/f6780ded-86df-419d-b63b-6b67d2960b28.jpg?1783945269","artUrl":"https://cards.scryfall.io/art_crop/front/f/6/f6780ded-86df-419d-b63b-6b67d2960b28.jpg?1783945269","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const paladinOfPrahv = (): CardDef => ({"oracleId":"cd30de8a-87ad-4870-a89f-5745d57ada0a","name":"Paladin of Prahv","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Whenever this creature deals damage, you gain that much life.\nForecast — {1}{W}, Reveal this card from your hand: Whenever target creature deals damage this turn, you gain that much life. (Activate only during your upkeep and only once each turn.)","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Forecast"],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/9797c1dc-e676-4c24-93b0-db2aae663ea2.jpg?1783943448","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/9797c1dc-e676-4c24-93b0-db2aae663ea2.jpg?1783943448","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const nikoAris = (): CardDef => ({"oracleId":"781162c4-9c0f-436c-b9a5-214e60e009e4","name":"Niko Aris","manaCost":"{X}{W}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Niko","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Niko"],"oracleText":"When Niko Aris enters, create X Shard tokens. (They're enchantments with \"{2}, Sacrifice this token: Scry 1, then draw a card.\")\n+1: Up to one target creature you control can't be blocked this turn. Whenever that creature deals damage this turn, return it to its owner's hand.\n−1: Niko Aris deals 2 damage to target tapped creature for each card you've drawn this turn.\n−1: Create a Shard token.","loyalty":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6c4e9cfe-e72e-46a1-a8d8-9fda5f2bae73.jpg?1783928191","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6c4e9cfe-e72e-46a1-a8d8-9fda5f2bae73.jpg?1783928191","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const glyphOfLife = (): CardDef => ({"oracleId":"ec450179-35e0-4d72-b42f-b507cbce03ad","name":"Glyph of Life","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target Wall creature. Whenever that creature is dealt damage by an attacking creature this turn, you gain that much life.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/ba1384e5-d140-4074-9548-250af09cb413.jpg?1783948085","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/ba1384e5-d140-4074-9548-250af09cb413.jpg?1783948085","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const nimbleHobbit = (): CardDef => ({"oracleId":"547da0ef-f1e1-4b04-ba83-4845552b0dc4","name":"Nimble Hobbit","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Halfling Peasant","supertypes":[],"types":["Creature"],"subtypes":["Halfling","Peasant"],"oracleText":"Whenever this creature attacks, you may sacrifice a Food or pay {2}{W}. When you do, tap target creature an opponent controls.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/4/c4cd0756-7bf3-4cb6-9687-1f9346b0bb92.jpg?1783916327","artUrl":"https://cards.scryfall.io/art_crop/front/c/4/c4cd0756-7bf3-4cb6-9687-1f9346b0bb92.jpg?1783916327","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const obscuraAscendancy = (): CardDef => ({"oracleId":"34ec084d-2c16-452f-8dcc-06641c80f7d1","name":"Obscura Ascendancy","manaCost":"{W}{U}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you cast a spell, if its mana value is equal to 1 plus the number of soul counters on this enchantment, put a soul counter on this enchantment, then create a 2/2 white Spirit creature token with flying.\nAs long as there are five or more soul counters on this enchantment, Spirits you control get +3/+3.","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98a11e5e-d2a9-4490-90f3-a643fc7ed7c3.jpg?1783923077","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98a11e5e-d2a9-4490-90f3-a643fc7ed7c3.jpg?1783923077","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const backfire = (): CardDef => ({"oracleId":"e04fa58e-be7a-4c9c-98d0-48241742a41b","name":"Backfire","manaCost":"{U}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhenever enchanted creature deals damage to you, this Aura deals that much damage to that creature's controller.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/04bc57aa-d4d9-4bd9-ba09-984370c7e23b.jpg?1783948078","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/04bc57aa-d4d9-4bd9-ba09-984370c7e23b.jpg?1783948078","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const inspiredIdea = (): CardDef => ({"oracleId":"5f1386d5-b802-46b2-9803-275621ebda80","name":"Inspired Idea","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Cleave {3}{U}{U} (You may cast this spell for its cleave cost. If you do, remove the words in square brackets.)\nDraw three cards. [Your maximum hand size is reduced by three for the rest of the game.]","colors":["U"],"colorIdentity":["U"],"keywords":["Cleave"],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/0267e1fe-23aa-4181-acf9-be1ebc8d2a8c.jpg?1783924269","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/0267e1fe-23aa-4181-acf9-be1ebc8d2a8c.jpg?1783924269","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lymphSliver = (): CardDef => ({"oracleId":"c3469de8-4bdb-42d4-9fc0-75fe31c3f6e5","name":"Lymph Sliver","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"All Sliver creatures have absorb 1. (If a source would deal damage to a Sliver, prevent 1 of that damage.)","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d9cdb51f-c785-47d1-b23c-de74eeb22a31.jpg?1783943124","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d9cdb51f-c785-47d1-b23c-de74eeb22a31.jpg?1783943124","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wallOfStone = (): CardDef => ({"oracleId":"cd4cadb4-3156-49bd-b36e-12ba5c85938b","name":"Wall of Stone","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)","power":"0","toughness":"8","colors":["R"],"colorIdentity":["R"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const prodigalPyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const nullProfusion = (): CardDef => ({"oracleId":"7077ee9a-59c6-4b8e-bf33-9b094412ad38","name":"Null Profusion","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Skip your draw step.\nWhenever you play a card, draw a card.\nYour maximum hand size is two.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c996792c-0846-4b78-bce5-1c6ad29640f6.jpg?1783943150","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c996792c-0846-4b78-bce5-1c6ad29640f6.jpg?1783943150","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const encirclingFissure = (): CardDef => ({"oracleId":"39d7569e-62b0-4f37-813a-0985632c66c9","name":"Encircling Fissure","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all combat damage that would be dealt this turn by creatures target opponent controls.\nAwaken 2—{4}{W} (If you cast this spell for {4}{W}, also put two +1/+1 counters on target land you control and it becomes a 0/0 Elemental creature with haste. It's still a land.)","colors":["W"],"colorIdentity":["W"],"keywords":["Awaken"],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/575da7cb-6715-43df-a7b4-a4ca00216a1d.jpg?1783938221","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/575da7cb-6715-43df-a7b4-a4ca00216a1d.jpg?1783938221","commanderLegal":"legal","set":"bfz","releasedAt":"2015-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const plains = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("Spiritualize: until end of turn, whenever target creature deals damage, you gain that much life", () => {
  it("compile", () => supported(spiritualize()));

  it("any damage that creature deals, its controller's or not, gains its caster life; then a card is drawn", () => {
    const { s: s0, ap, ids, opp } = setup([spiritualize()]);
    const pyro = putOnBattlefield(s0, opp, prodigalPyromancer());
    const hand = s0.players[ap]!.hand.length;
    pool(s0, ap, { W: 1, C: 2 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(pyro)])));
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
    expect(s.floatingTriggers?.length).toBe(1);
    // The opponent's Pyromancer pings that opponent's other opponent: Spiritualize's caster gains 1.
    const life = s.players[ap]!.life;
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = settle(tapAbility(s, opp, pyro, [plr(third)]));
    expect(s.players[third]!.life).toBe(40 - 1);
    expect(s.players[ap]!.life).toBe(life + 1);
    // Gone at the end of the turn.
    s = goTo(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.floatingTriggers).toBeUndefined();
  });

  it("with its only target gone, the spell does nothing at all: no card is drawn (CR 608.2b)", () => {
    const { s: s0, ap, ids } = setup([spiritualize()]);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const hand = s0.players[ap]!.hand.length;
    pool(s0, ap, { W: 1, C: 2 });
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(bears)]));
    moveObject(s, bears, "graveyard");
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.floatingTriggers).toBeUndefined();
  });
});

describe("Paladin of Prahv: forecast, whenever target creature deals damage this turn, you gain that much life", () => {
  it("compile", () => supported(paladinOfPrahv()));

  it("revealed from the hand during your upkeep; the creature's damage this turn gains you life", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = []; // nothing to discard at the cleanup on the way
    const paladin = putIn(s0, ap, paladinOfPrahv(), "hand");
    const pyro = putOnBattlefield(s0, ap, prodigalPyromancer());
    let s = goTo(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = goTo(s, "upkeep", ap);
    pool(s, ap, { W: 1, C: 1 });
    s = settle(run(s, planActivate(s, ap, paladin, 0, [tgt(pyro)])));
    expect(s.objects[paladin]!.zone).toBe("hand");
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, pyro, 0, [plr(opp)])));
    expect(s.players[ap]!.life).toBe(life + 1);
  });
});

describe("Niko Aris: +1, up to one target creature can't be blocked; whenever it deals damage this turn, it returns to its owner's hand", () => {
  it("compile", () => supported(nikoAris()));

  it("the creature deals combat damage, then goes back to its owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const niko = putOnBattlefield(s0, ap, nikoAris());
    s0.objects[niko]!.counters.loyalty = 3;
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(run(s0, planActivate(s0, ap, niko, 0, [tgt(bears)])));
    expect(s.objects[niko]!.counters.loyalty).toBe(4);
    s = attack(s, ap, bears, opp);
    s = settle(goTo(s, "endCombat", ap));
    expect(s.players[opp]!.life).toBe(40 - 2);
    expect(s.objects[bears]!.zone).toBe("hand");
  });

  it("with no target chosen, no delayed trigger is made", () => {
    const { s: s0, ap } = setup([]);
    const niko = putOnBattlefield(s0, ap, nikoAris());
    s0.objects[niko]!.counters.loyalty = 3;
    putOnBattlefield(s0, ap, grizzlyBears());
    const s = settle(run(s0, planActivate(s0, ap, niko, 0, [{ kind: "none" }])));
    expect(s.objects[niko]!.counters.loyalty).toBe(4);
    expect(s.floatingTriggers).toBeUndefined();
  });
});

describe("Glyph of Life: whenever that Wall is dealt damage by an attacking creature this turn, you gain that much life", () => {
  it("compile", () => supported(glyphOfLife()));

  it("only a Wall can be targeted; damage from an attacking creature gains life, other damage doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([glyphOfLife()]);
    const wall = putOnBattlefield(s0, ap, wallOfStone());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    expect(planCast(s0, ap, ids[0]!, [tgt(bears)])).toBeNull();
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const pyro = putOnBattlefield(s0, opp, prodigalPyromancer());
    // On the opponent's turn: the Giant attacks and the Wall blocks it.
    let s = goTo(s0, "declareAttackers", opp, opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: giant, defender: ap }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === ap ? [{ blocker: wall, attacker: giant }] : [] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("declareBlockers");
    pool(s, ap, { W: 1 });
    s = run(s, planCast(s, ap, ids[0]!, [tgt(wall)]));
    for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.floatingTriggers?.length).toBe(1);
    // The Pyromancer isn't attacking: its damage to the Wall gains nothing.
    const life = s.players[ap]!.life;
    for (let i = 0; i < 20 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = tapAbility(s, opp, pyro, [tgt(wall)]);
    for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[wall]!.damage).toBe(1);
    expect(s.players[ap]!.life).toBe(life);
    // The attacking Giant's 3 combat damage does; the Wall still takes it (rulings).
    s = settle(goTo(s, "endCombat", opp));
    expect(s.objects[wall]!.damage).toBe(4);
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});

describe("Nimble Hobbit: sacrifice a Food or pay {2}{W}; when you do, tap target creature an opponent controls", () => {
  it("compile", () => supported(nimbleHobbit()));

  const food = () => card("Test Food", "Artifact — Food", "{1}", { oracleText: "" });

  it("sacrificing a Food is one way to pay; then a creature is tapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const hobbit = putOnBattlefield(s0, ap, nimbleHobbit());
    const f = putOnBattlefield(s0, ap, food());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = attack(s0, ap, hobbit, opp, [], ap);
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ player: ap });
    expect(JSON.stringify(s.pending)).toMatch(/Food/);
    expect(JSON.stringify(s.pending)).toMatch(/\{2\}\{W\}/);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }), { me: [ap] });
    for (let i = 0; i < 5 && s.pending?.player === ap; i++) {
      if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bears)] }), { me: [ap] });
      else s = settle(run(s, botActions(s, ap)), { me: [ap] });
    }
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(s.objects[bears]!.tapped).toBe(true);
  });

  it("neither: nothing is tapped; a bot pays {2}{W} to tap an untapped blocker", () => {
    const { s: s0, ap, opp } = setup([]);
    const hobbit = putOnBattlefield(s0, ap, nimbleHobbit());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = attack(s0, ap, hobbit, opp, [], ap);
    s = settle(s, { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), { me: [ap] });
    expect(s.objects[bears]!.tapped).toBe(false);
    // A bot with the mana pays.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const h2 = putOnBattlefield(t0, ap2, nimbleHobbit());
    const b2 = putOnBattlefield(t0, opp2, grizzlyBears());
    let t = attack(t0, ap2, h2, opp2, [], ap2);
    pool(t, ap2, { W: 1, C: 2 });
    t = settle(t);
    expect(t.objects[b2]!.tapped).toBe(true);
  });
});

describe("Obscura Ascendancy: if its mana value is equal to 1 plus the number of soul counters, a counter and a Spirit", () => {
  it("compile", () => supported(obscuraAscendancy()));

  it("mana value 1 with no counters, then 2 with one; a second mana value 1 spell does nothing once the first resolved (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const asc = putOnBattlefield(s0, ap, obscuraAscendancy());
    const spirits = (s: GameState) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Spirit")).length;
    const bolt1 = putIn(s0, ap, lightningBolt(), "hand");
    const bolt2 = putIn(s0, ap, lightningBolt(), "hand");
    pool(s0, ap, { R: 2 });
    // Two Bolts cast in a row: both trigger (no counters yet), only the first one's resolution does anything.
    let s = run(s0, planCast(s0, ap, bolt1, [plr(opp)]));
    for (let i = 0; i < 10 && s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length === 0; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, ap, bolt2, [plr(opp)]));
    expect(s.stack.filter((x) => x.kind === "ability").length).toBe(2);
    s = settle(s);
    expect(s.objects[asc]!.counters.soul).toBe(1);
    expect(spirits(s)).toBe(1);
    // Mana value 2 now.
    const shk = putIn(s, ap, divination(), "hand");
    pool(s, ap, { U: 1, C: 2 });
    s = settle(run(s, planCast(s, ap, shk)));
    expect(s.objects[asc]!.counters.soul ?? 0).toBe(1); // Divination's mana value is 3
    const b3 = putIn(s, ap, card("Test Two", "Sorcery", "{1}{R}", { cmc: 2, oracleText: "Draw a card." }), "hand");
    pool(s, ap, { R: 1, C: 1 });
    s = settle(run(s, planCast(s, ap, b3)));
    expect(s.objects[asc]!.counters.soul).toBe(2);
    expect(spirits(s)).toBe(2);
  });
});

describe("Backfire: whenever enchanted creature deals damage to you, ~ deals that much damage to that creature's controller", () => {
  it("compile", () => supported(backfire()));

  it("damage to the Aura's controller only", () => {
    const { s: s0, ap, ids, opp } = setup([backfire()]);
    const pyro = putOnBattlefield(s0, opp, prodigalPyromancer());
    pool(s0, ap, { U: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(pyro)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(pyro);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = settle(tapAbility(s, opp, pyro, [plr(third)]));
    expect(s.players[opp]!.life).toBe(40);
    // Untapped again, it pings the Aura's controller: 1 back at its controller.
    s.objects[pyro]!.tapped = false;
    s = settle(tapAbility(s, opp, pyro, [plr(ap)]));
    expect(s.players[ap]!.life).toBe(40 - 1);
    expect(s.players[opp]!.life).toBe(40 - 1);
  });
});

describe("Inspired Idea: draw three; cast for its cleave cost, the hand size isn't reduced", () => {
  it("compile", () => supported(inspiredIdea()));

  it("cast normally, your maximum hand size is reduced by three for the rest of the game", () => {
    const { s: s0, ap, ids } = setup([inspiredIdea()]);
    expect(maxHandSize(s0, ap)).toBe(7);
    pool(s0, ap, { U: 1, C: 2 });
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    expect(maxHandSize(s, ap)).toBe(4);
    expect(maxHandSize(s, s.turnOrder.find((p) => p !== ap)!)).toBe(7);
  });

  it("for its cleave cost: no reduction; with Null Profusion after it, two (timestamps, rulings)", () => {
    const { s: s0, ap, ids } = setup([inspiredIdea()]);
    pool(s0, ap, { U: 2, C: 3 });
    const cleave = compileCard(inspiredIdea()).altCosts?.findIndex((c) => /cleave/i.test(JSON.stringify(c)));
    expect(cleave).toBeGreaterThanOrEqual(0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { alt: "cleave" })));
    expect(maxHandSize(s, ap)).toBe(7);
    // Cast normally, then Null Profusion: two.
    const again = putIn(s, ap, inspiredIdea(), "hand");
    pool(s, ap, { U: 1, C: 2 });
    s = settle(run(s, planCast(s, ap, again)));
    expect(maxHandSize(s, ap)).toBe(4);
    putOnBattlefield(s, ap, nullProfusion());
    expect(maxHandSize(s, ap)).toBe(2);
  });
});

describe("Lymph Sliver: all Sliver creatures have absorb 1", () => {
  it("compile", () => supported(lymphSliver()));

  it("prevents 1 of the damage from each source to each Sliver", () => {
    const { s: s0, ap, ids, opp } = setup([lightningBolt()]);
    const lymph = putOnBattlefield(s0, ap, lymphSliver());
    const other = putOnBattlefield(s0, opp, card("Test Sliver", "Creature — Sliver", "{1}", { power: "2", toughness: "2" }));
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    pool(s0, ap, { R: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(lymph)])));
    expect(s.objects[lymph]!.damage).toBe(2);
    const sh = putIn(s, ap, shock(), "hand");
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, sh, [tgt(other)])));
    expect(s.objects[other]!.damage).toBe(1);
    const sh2 = putIn(s, ap, shock(), "hand");
    pool(s, ap, { R: 1 });
    s = settle(run(s, planCast(s, ap, sh2, [tgt(bears)])));
    expect(s.objects[bears]!.zone).toBe("graveyard");
  });
});

describe("Encircling Fissure: prevent all combat damage that would be dealt this turn by creatures target opponent controls", () => {
  it("compile", () => supported(encirclingFissure()));

  it("that opponent's attackers deal no combat damage; their noncombat damage still happens", () => {
    const { s: s0, ap, ids, opp } = setup([encirclingFissure()]);
    s0.players[ap]!.hand = [ids[0]!]; // nothing to discard at the cleanup on the way
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const pyro = putOnBattlefield(s0, opp, prodigalPyromancer());
    let s = goTo(s0, "declareAttackers", opp, opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: giant, defender: ap }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    pool(s, ap, { W: 1, C: 2 });
    s = run(s, planCast(s, ap, ids[0]!, [plr(opp), { kind: "none" }]));
    for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = tapAbility(s, opp, pyro, [plr(ap)]);
    for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.life).toBe(40 - 1);
    s = settle(goTo(s, "endCombat", opp));
    expect(s.players[ap]!.life).toBe(40 - 1);
  });

  it("cast for awaken, a land you control also becomes a 0/0 Elemental with two +1/+1 counters", () => {
    const { s: s0, ap, ids, opp } = setup([encirclingFissure()]);
    const land = putOnBattlefield(s0, ap, plains());
    pool(s0, ap, { W: 1, C: 4 });
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp), tgt(land)], undefined, "auto", undefined, { alt: "awaken" })));
    expect(s.objects[land]!.counters["+1/+1"]).toBe(2);
    expect((s.damageRules ?? []).some((r) => r.srcController === opp)).toBe(true);
  });

  it("a bot attacked by a big creature casts it at the attacker's controller", () => {
    const { s: s0, ap, opp } = setup([]);
    const wurm = putOnBattlefield(s0, ap, crawWurm());
    const fissure = putIn(s0, opp, encirclingFissure(), "hand");
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, plains());
    let s = attack(s0, ap, wurm, opp, [], ap);
    // The bots take their priority (the defending one casts it once blockers are declared).
    for (let i = 0; i < 100 && s.step !== "endCombat"; i++) {
      const w = waitingOn(s)!;
      s = s.pending ? run(s, botActions(s, s.pending.player)) : w === opp ? run(s, botActions(s, opp)) : act(s, { type: "passPriority", player: w });
    }
    expect(s.objects[fissure]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(40);
  });
});

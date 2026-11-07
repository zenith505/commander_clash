// Lane B round B133: Flying Drone ("if another creature with flying entered the battlefield under your control this turn"),
// Thirsting Axe ("if equipped creature didn't deal combat damage to a creature this turn"), Paragon of Modernity ("if exactly
// three colors of mana were spent to activate this ability"), Weight of Conscience and Illuminated Folio (costs that share
// a creature type or a color), Genju of the Fields ("its controller gains that much life"), Naya Soulbeast (a cast trigger
// setting its counters), Haphazard Bombardment (aim counters, one destroyed at random), Pick Up the Pace and Bane Alley
// Broker (cards exiled with them).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, costChoiceShares, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, shareablePick, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

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
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
/** No mana but what's put in the pool: every land tapped, the pool emptied. */
const noMana = (s: GameState, pid: PlayerId) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
};
/** A card of `def` put into `pid`'s hand or on top of their library. */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, z: "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const named = (s: GameState, name: string, zone = "battlefield") => Object.values(s.objects).filter((o) => o.zone === zone && s.cards[o.cardId]?.name === name).map((o) => o.id);
/** Clears the opening hand. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) s.objects[id]!.zone = "library";
  s.players[pid]!.library.push(...s.players[pid]!.hand);
  s.players[pid]!.hand = [];
};
const nextOf = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;

// Real oracle text (Scryfall).
const flyingDrone = (): CardDef => ({"oracleId":"541f7525-a9a4-493d-b724-354ae6d37de5","name":"Flying Drone","manaCost":"{1}{U}","cmc":2,"typeLine":"Artifact Creature — Robot Scout","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Robot","Scout"],"oracleText":"Flying, vigilance\n{1}{U}, {T}: Draw a card, then discard a card. This ability costs {1}{U} less to activate if another creature with flying entered the battlefield under your control this turn.","power":"1","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/3/f/3fea3eb2-9360-41fc-890e-8377e69fb9e3.jpg?1783903074","artUrl":"https://cards.scryfall.io/art_crop/front/3/f/3fea3eb2-9360-41fc-890e-8377e69fb9e3.jpg?1783903074","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const thirstingAxe = (): CardDef => ({"oracleId":"e024870c-af13-4ef3-be27-cdd84dab7d7d","name":"Thirsting Axe","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +4/+0.\nAt the beginning of your end step, if equipped creature didn't deal combat damage to a creature this turn, sacrifice it.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f47e5303-c07a-4be0-a314-bf5739a856e5.jpg?1783937424","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f47e5303-c07a-4be0-a314-bf5739a856e5.jpg?1783937424","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const paragon = (): CardDef => ({"oracleId":"c1c62704-1f20-48cf-8588-47e7fca85f7b","name":"Paragon of Modernity","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Angel Warrior","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Angel","Warrior"],"oracleText":"Flying\n{3}: This creature gets +1/+1 until end of turn. If exactly three colors of mana were spent to activate this ability, put a +1/+1 counter on it instead.","power":"2","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/9/3/939450d7-1107-4645-ad23-68749b1ec4c2.jpg?1783923061","artUrl":"https://cards.scryfall.io/art_crop/front/9/3/939450d7-1107-4645-ad23-68749b1ec4c2.jpg?1783923061","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const weight = (): CardDef => ({"oracleId":"42989c6d-75d9-4ddd-bb9f-f18c0eb005fe","name":"Weight of Conscience","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack.\nTap two untapped creatures you control that share a creature type: Exile enchanted creature.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/396c8c41-70b4-4189-9160-8b7367a817a2.jpg?1783942802","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/396c8c41-70b4-4189-9160-8b7367a817a2.jpg?1783942802","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const folio = (): CardDef => ({"oracleId":"0440f85f-8128-4399-9a3d-51f39e196c96","name":"Illuminated Folio","manaCost":"{5}","cmc":5,"typeLine":"Artifact — Book","supertypes":[],"types":["Artifact"],"subtypes":["Book"],"oracleText":"{1}, {T}, Reveal two cards from your hand that share a color: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73d473d9-f52e-4357-b25a-e8bdcc833f09.jpg?1783942711","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73d473d9-f52e-4357-b25a-e8bdcc833f09.jpg?1783942711","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const genju = (): CardDef => ({"oracleId":"5cd35d18-115b-4d7c-8d05-3d4c8303f46e","name":"Genju of the Fields","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant Plains\n{2}: Until end of turn, enchanted Plains becomes a 2/5 white Spirit creature with \"Whenever this creature deals damage, its controller gains that much life.\" It's still a land.\nWhen enchanted Plains is put into a graveyard, you may return this card from your graveyard to your hand.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0cf9142-be8e-48d8-a1b4-9a7fb71718d0.jpg?1783944215","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0cf9142-be8e-48d8-a1b4-9a7fb71718d0.jpg?1783944215","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const soulbeast = (): CardDef => ({"oracleId":"5ea0c608-2c56-4889-a5d3-d435df515950","name":"Naya Soulbeast","manaCost":"{6}{G}{G}","cmc":8,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"When you cast this spell, each player reveals the top card of their library. This creature enters with X +1/+1 counters on it, where X is the total mana value of all cards revealed this way.\nTrample","power":"0","toughness":"0","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f0e4b468-096b-4f80-9e78-022fe24a7e45.jpg?1783939659","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f0e4b468-096b-4f80-9e78-022fe24a7e45.jpg?1783939659","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bombardment = (): CardDef => ({"oracleId":"fc1eb1c9-b22b-41a1-8b13-94a0e758db0f","name":"Haphazard Bombardment","manaCost":"{5}{R}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, choose four nonenchantment permanents you don't control and put an aim counter on each of them.\nAt the beginning of your end step, if two or more permanents you don't control have an aim counter on them, destroy one of those permanents at random.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e558a5bd-e8f9-477f-a514-1bf0708f4e9e.jpg?1783934993","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e558a5bd-e8f9-477f-a514-1bf0708f4e9e.jpg?1783934993","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pace = (): CardDef => ({"oracleId":"873e739c-edf4-46a7-9024-5caaf87f507e","name":"Pick Up the Pace","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature you control that entered this turn attacks, exile the top card of your library.\nYou may play cards exiled with this enchantment as long as you attacked this turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/55332b21-32ab-43dd-8046-9568e2dba6ac.jpg?1783903046","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/55332b21-32ab-43dd-8046-9568e2dba6ac.jpg?1783903046","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const broker = (): CardDef => ({"oracleId":"4993e373-4b76-4582-a789-6a3123e7ca89","name":"Bane Alley Broker","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"{T}: Draw a card, then exile a card from your hand face down.\nYou may look at cards exiled with this creature.\n{U}{B}, {T}: Return a card exiled with this creature to its owner's hand.","power":"0","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/7996df7f-70f5-412c-9573-9512e4e131ac.jpg?1783940112","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/7996df7f-70f5-412c-9573-9512e4e131ac.jpg?1783940112","commanderLegal":"legal","set":"gtc","releasedAt":"2013-02-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const birds = (): CardDef => ({"oracleId":"d3a0b660-358c-41bd-9cd2-41fbf3491b1a","name":"Birds of Paradise","manaCost":"{G}","cmc":1,"typeLine":"Creature — Bird","supertypes":[],"types":["Creature"],"subtypes":["Bird"],"oracleText":"Flying\n{T}: Add one mana of any color.","power":"0","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Flying"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/492c2f9a-51e7-4e0f-9899-23bf43ea988b.jpg?1783903230","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/492c2f9a-51e7-4e0f-9899-23bf43ea988b.jpg?1783903230","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elvish = (): CardDef => ({"oracleId":"3f3b2c10-21f8-4e13-be83-4ef3fa36e123","name":"Elvish Mystic","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/acbe8763-1373-49f8-b4a6-dd5984b1d25f.jpg?1783911494","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/acbe8763-1373-49f8-b4a6-dd5984b1d25f.jpg?1783911494","commanderLegal":"legal","set":"sld","releasedAt":"2024-05-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const goblin = (): CardDef => ({"oracleId":"50608184-90d3-43d2-a221-deb186c78323","name":"Goblin Piker","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Warrior","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Warrior"],"oracleText":"","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const plains = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const darksteel = (): CardDef => ({"oracleId":"f90fe86c-5cca-483b-93c2-6e856fa01c88","name":"Darksteel Myr","manaCost":"{3}","cmc":3,"typeLine":"Artifact Creature — Myr","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Myr"],"oracleText":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)","power":"0","toughness":"1","colors":[],"colorIdentity":[],"keywords":["Indestructible"],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f5712cf-c6a9-4a2e-90db-8ca17c621724.jpg?1783941710","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f5712cf-c6a9-4a2e-90db-8ca17c621724.jpg?1783941710","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wind = (): CardDef => ({"oracleId":"d6ffdaf0-ac08-4de9-bbce-2eab2f86bcca","name":"Wind Drake","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Drake","supertypes":[],"types":["Creature"],"subtypes":["Drake"],"oracleText":"Flying","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","commanderLegal":"legal","set":"ddj","releasedAt":"2012-09-07","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]}) as CardDef;
const changeling = (): CardDef => ({"oracleId":"a61ef0cc-1da9-49f9-b0dc-01cf9f6205be","name":"Changeling Outcast","manaCost":"{B}","cmc":1,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const memnite = (): CardDef => ({"oracleId":"7663ac7c-1de3-4250-b96a-fae9dbd66a27","name":"Memnite","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("Lane B round B133", () => {
  it("compiles every card of the round", () => {
    supported(flyingDrone(), thirstingAxe(), paragon(), weight(), folio(), genju(), soulbeast(), bombardment(), pace(), broker());
  });
});

describe("Flying Drone", () => {
  it("costs {1}{U} less once another creature with flying entered under your control this turn", () => {
    const { s: s0, ap, ids } = setup([wind(), bears()]);
    const drone = putOnBattlefield(s0, ap, flyingDrone());
    noMana(s0, ap);
    expect(planActivate(s0, ap, drone, 0)).toBeNull();
    // A creature without flying doesn't count.
    pool(s0, ap, { G: 1, C: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[1]!)));
    noMana(s, ap);
    expect(planActivate(s, ap, drone, 0)).toBeNull();
    pool(s, ap, { U: 1, C: 2 });
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    noMana(s, ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, drone, 0)));
    expect(s.objects[drone]!.tapped).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand); // drew one, discarded one
  });

  it("not for the Drone itself entering, nor for a flier that entered under an opponent's control", () => {
    const { s: s0, ap, ids, opp } = setup([flyingDrone()]);
    pool(s0, ap, { U: 1, C: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const drone = named(s, "Flying Drone")[0]!;
    s.objects[drone]!.controlledSinceTurn = -1; // as if it had been there since the turn began
    const theirs = putOnBattlefield(s, opp, wind());
    ((s.turnLog ??= {}).entered ??= []).push({ controller: opp, types: ["Creature"], subtypes: ["Drake"], colors: ["U"], id: theirs, zc: 0, flying: true });
    noMana(s, ap);
    expect(planActivate(s, ap, drone, 0)).toBeNull();
    pool(s, ap, { U: 1, C: 1 });
    expect(planActivate(s, ap, drone, 0)).not.toBeNull();
  });
});

describe("Thirsting Axe", () => {
  const equipped = () => {
    const { s, ap, opp } = setup([]);
    emptyHand(s, ap);
    const bear = putOnBattlefield(s, ap, bears());
    const axe = putOnBattlefield(s, ap, thirstingAxe());
    s.objects[axe]!.attachedTo = bear;
    invalidateCharacteristics(s);
    return { s, ap, opp, bear, axe };
  };

  it("the equipped creature that dealt combat damage to a blocking creature is kept", () => {
    const { s: s0, ap, opp, bear } = equipped();
    expect(pt(s0, bear)).toBe("6/2");
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    let s = attackWith(s0, ap, [{ attacker: bear, defender: opp }], [{ blocker: thopter, attacker: bear }]);
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.objects[thopter]!.zone).toBe("graveyard");
    expect(s.objects[bear]!.zone).toBe("battlefield");
  });

  it("combat damage only to a player, or none at all, and the creature is sacrificed (rulings)", () => {
    const { s: s0, ap, opp, bear } = equipped();
    let s = attackWith(s0, ap, [{ attacker: bear, defender: opp }]);
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(34);
    expect(s.objects[bear]!.zone).toBe("graveyard");
    const { s: s1, ap: ap1, bear: bear1 } = equipped();
    let t = goTo(s1, "end", ap1);
    t = settle(t);
    expect(t.objects[bear1]!.zone).toBe("graveyard");
  });

  it("noncombat damage to a creature doesn't count; an Axe attached to nothing does nothing", () => {
    const { s: s0, ap, opp, bear, axe } = equipped();
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    s0.turnLog = { ...(s0.turnLog ?? {}), damagedCreature: [`${bear}@0`] };
    let s = goTo(s0, "end", ap);
    s = settle(s);
    expect(s.objects[bear]!.zone).toBe("graveyard");
    expect(s.objects[thopter]!.zone).toBe("battlefield");
    expect(s.objects[axe]!.zone).toBe("battlefield");
    const { s: s1, ap: ap1, bear: bear1, axe: axe1 } = equipped();
    s1.objects[axe1]!.attachedTo = undefined;
    invalidateCharacteristics(s1);
    let t = goTo(s1, "end", ap1);
    t = settle(t);
    expect(t.objects[bear1]!.zone).toBe("battlefield");
    expect(t.objects[axe1]!.zone).toBe("battlefield");
  });
});

describe("Paragon of Modernity", () => {
  it("exactly three colors spent: a +1/+1 counter instead of +1/+1 until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const angel = putOnBattlefield(s0, ap, paragon());
    noMana(s0, ap);
    pool(s0, ap, { W: 1, U: 1, B: 1 });
    let s = settle(run(s0, planActivate(s0, ap, angel, 0)));
    expect(s.objects[angel]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, angel)).toBe("3/3");
  });

  it("two colors and colorless, or colorless only: +1/+1 until end of turn, no counter (colorless isn't a color)", () => {
    for (const mana of [{ W: 1, U: 1, C: 1 }, { C: 3 }, { W: 2, U: 1 }] as const) {
      const { s: s0, ap } = setup([]);
      const angel = putOnBattlefield(s0, ap, paragon());
      noMana(s0, ap);
      pool(s0, ap, mana);
      const s = settle(run(s0, planActivate(s0, ap, angel, 0)));
      expect(s.objects[angel]!.counters["+1/+1"] ?? 0, JSON.stringify(mana)).toBe(0);
      expect(pt(s, angel)).toBe("3/3");
    }
  });
});

describe("Weight of Conscience", () => {
  const enchanted = () => {
    const { s, ap, opp } = setup([]);
    const victim = putOnBattlefield(s, opp, giant());
    const aura = putOnBattlefield(s, ap, weight());
    s.objects[aura]!.attachedTo = victim;
    invalidateCharacteristics(s);
    return { s, ap, opp, victim, aura };
  };

  it("tap two untapped creatures you control that share a creature type: exile enchanted creature", () => {
    const { s: s0, ap, victim, aura } = enchanted();
    const a = putOnBattlefield(s0, ap, bears(), { sick: true });
    const b = putOnBattlefield(s0, ap, bears(), { sick: true });
    // Summoning-sick creatures can pay it: no {T} in the cost (rulings).
    let s = settle(run(s0, planActivate(s0, ap, aura, 0, [], undefined, undefined, undefined, { tap: [a, b] })));
    expect(s.objects[a]!.tapped && s.objects[b]!.tapped).toBe(true);
    expect(s.objects[victim]!.zone).toBe("exile");
    expect(s.objects[aura]!.zone).toBe("graveyard"); // put there by the state-based actions (rulings)
  });

  it("two creatures with no type in common can't pay it; a changeling shares every type (CR 702.73a)", () => {
    const { s: s0, ap, victim, aura } = enchanted();
    const bear = putOnBattlefield(s0, ap, bears());
    const hill = putOnBattlefield(s0, ap, giant());
    expect(planActivate(s0, ap, aura, 0)).toBeNull();
    expect(planActivate(s0, ap, aura, 0, [], undefined, undefined, undefined, { tap: [bear, hill] })).toBeNull();
    const shape = putOnBattlefield(s0, ap, changeling());
    expect(shareablePick(s0, { kind: "tap", filter: { kind: "object", types: ["Creature"], text: "creature" }, n: 2, shareCreatureType: true }, [bear, hill])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, aura, 0, [], undefined, undefined, undefined, { tap: [hill, shape] })));
    expect(s.objects[victim]!.zone).toBe("exile");
  });

  it("a bot pays it with two creatures that share a type", () => {
    const { s: s0, ap, victim, aura } = enchanted();
    const bear = putOnBattlefield(s0, ap, bears());
    const hill = putOnBattlefield(s0, ap, giant());
    const elf = putOnBattlefield(s0, ap, bears());
    const c = { kind: "tap" as const, filter: { kind: "object" as const, types: ["Creature"], text: "creature" }, n: 2, shareCreatureType: true as const };
    const pick = shareablePick(s0, c, [hill, bear, elf]);
    expect(pick?.sort()).toEqual([bear, elf].sort());
    expect(costChoiceShares(s0, c, [bear, hill])).toBe(false);
    void victim;
    void aura;
  });
});

describe("Illuminated Folio", () => {
  it("reveal two cards from your hand that share a color: draw a card, the revealed cards stay in hand", () => {
    const { s: s0, ap, ids } = setup([bolt(), shock()]);
    const book = putOnBattlefield(s0, ap, folio());
    pool(s0, ap, { C: 1 });
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, book, 0, [], undefined, undefined, undefined, { reveal: [ids[0]!, ids[1]!] })));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining(ids));
  });

  it("not two cards of different colors, nor two colorless cards; a split card has both halves' colors (CR 709.4a)", () => {
    const { s: s0, ap, ids } = setup([bolt(), opt(), ornithopter(), memnite(), fireIce()]);
    emptyHand(s0, ap);
    const book = putOnBattlefield(s0, ap, folio());
    pool(s0, ap, { C: 1 });
    const only = (keep: string[]) => {
      s0.players[ap]!.hand = keep;
      for (const id of ids) s0.objects[id]!.zone = keep.includes(id) ? "hand" : "library";
    };
    only([ids[0]!, ids[1]!]);
    expect(planActivate(s0, ap, book, 0)).toBeNull();
    only([ids[2]!, ids[3]!]);
    expect(planActivate(s0, ap, book, 0)).toBeNull();
    only([ids[1]!, ids[4]!]);
    expect(planActivate(s0, ap, book, 0)).not.toBeNull();
    only([ids[0]!, ids[1]!, ids[4]!]);
    expect(planActivate(s0, ap, book, 0, [], undefined, undefined, undefined, { reveal: [ids[0]!, ids[1]!] })).toBeNull();
    expect(planActivate(s0, ap, book, 0, [], undefined, undefined, undefined, { reveal: [ids[0]!, ids[4]!] })).not.toBeNull();
  });
});

describe("Genju of the Fields", () => {
  it("the animated Plains gains its controller that much life, once for each time the ability was activated (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const plains0 = named(s0, "Plains").find((id) => s0.objects[id]!.controller === ap)!;
    const aura = putOnBattlefield(s0, ap, genju());
    s0.objects[aura]!.attachedTo = plains0;
    invalidateCharacteristics(s0);
    pool(s0, ap, { C: 4 });
    let s = settle(run(s0, planActivate(s0, ap, aura, 0)));
    s = settle(run(s, planActivate(s, ap, aura, 0)));
    expect(pt(s, plains0)).toBe("2/5");
    const life = s.players[ap]!.life;
    s = attackWith(s, ap, [{ attacker: plains0, defender: opp }]);
    s = goTo(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.life).toBe(life + 4);
  });
});

describe("Naya Soulbeast", () => {
  it("each player reveals their top card as it's cast; it enters with that many +1/+1 counters as their total mana value", () => {
    const { s: s0, ap, ids } = setup([soulbeast()]);
    const order = s0.turnOrder;
    // Library tops: a Lightning Bolt (1), Fire // Ice (4 as a card, CR 709.4), a Memnite (0) and a Wind Drake (3).
    putIn(s0, order[0]!, bolt(), "library");
    putIn(s0, order[1]!, fireIce(), "library");
    putIn(s0, order[2]!, memnite(), "library");
    putIn(s0, order[3]!, wind(), "library");
    pool(s0, ap, { G: 2, C: 6 });
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // The trigger resolves first: the number is known before the spell resolves (rulings).
    expect(s.stack.length).toBe(2);
    s = settle(s);
    const beast = named(s, "Naya Soulbeast")[0]!;
    expect(s.objects[beast]!.counters["+1/+1"]).toBe(8);
    expect(pt(s, beast)).toBe("8/8");
  });

  it("all lands revealed: it enters with none and dies as a 0/0", () => {
    const { s: s0, ap, ids } = setup([soulbeast()]);
    for (const pid of s0.turnOrder) putIn(s0, pid, plains(), "library");
    pool(s0, ap, { G: 2, C: 6 });
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(named(s, "Naya Soulbeast", "graveyard").length).toBe(1);
  });
});

describe("Haphazard Bombardment", () => {
  it("four nonenchantment permanents you don't control get aim counters; you choose, not target (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([bombardment()]);
    const theirs = [0, 1, 2, 3, 4].map((i) => putOnBattlefield(s0, nextOf(s0, ap, 1 + (i % 3)), bears()));
    const ench = putOnBattlefield(s0, opp, pace());
    const mine = putOnBattlefield(s0, ap, bears());
    pool(s0, ap, { R: 1, C: 5 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    expect(s.pending?.kind).toBe("pickPermanents");
    if (s.pending?.kind !== "pickPermanents") return;
    expect(s.pending.count).toBe(4);
    expect([...s.pending.options].sort()).toEqual([...theirs].sort());
    expect(s.pending.options).not.toContain(ench);
    expect(s.pending.options).not.toContain(mine);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: theirs.slice(0, 4) }));
    expect(theirs.map((id) => s.objects[id]!.counters.aim ?? 0)).toEqual([1, 1, 1, 1, 0]);
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(theirs.slice(0, 4).filter((id) => s.objects[id]!.zone === "graveyard").length).toBe(1);
    expect(s.objects[theirs[4]!]!.zone).toBe("battlefield");
  });

  it("with four or fewer, all of them; one with indestructible isn't chosen to be destroyed (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([bombardment()]);
    const myr = putOnBattlefield(s0, opp, darksteel());
    const bear = putOnBattlefield(s0, opp, bears());
    pool(s0, ap, { R: 1, C: 5 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(s.objects[myr]!.counters.aim).toBe(1);
    expect(s.objects[bear]!.counters.aim).toBe(1);
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.objects[bear]!.zone).toBe("graveyard");
    expect(s.objects[myr]!.zone).toBe("battlefield");
  });

  it("with only one permanent you don't control with an aim counter, the end step trigger does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bombardment());
    const bear = putOnBattlefield(s0, opp, bears());
    s0.objects[bear]!.counters.aim = 1;
    const mine = putOnBattlefield(s0, ap, bears());
    s0.objects[mine]!.counters.aim = 1; // yours don't count
    let s = goTo(s0, "end", ap);
    expect(s.stack.length).toBe(0);
    s = settle(s);
    expect(s.objects[bear]!.zone).toBe("battlefield");
  });
});

describe("Pick Up the Pace", () => {
  it("a creature that entered this turn attacking exiles the top card, playable as long as you attacked this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    putOnBattlefield(s0, ap, pace());
    const fresh = putOnBattlefield(s0, ap, bears());
    s0.objects[fresh]!.enteredTurn = s0.turn; // with haste, say
    const old = putOnBattlefield(s0, ap, bears());
    const top = putIn(s0, ap, bolt(), "library");
    noMana(s0, ap);
    pool(s0, ap, { R: 1 });
    let s = attackWith(s0, ap, [{ attacker: fresh, defender: opp }, { attacker: old, defender: opp }]);
    s = settle(s);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.players[ap]!.exile.filter((id) => s.objects[id]!.zone === "exile").length).toBe(1);
    s = goTo(s, "main2", ap);
    pool(s, ap, { R: 1 });
    expect(planCast(s, ap, top, [{ kind: "player", id: opp }])).not.toBeNull();
    // On your next turn, not before you've attacked again.
    s = goTo(s, "upkeep", nextOf(s, ap));
    s = goTo(s, "main1", ap);
    expect(s.objects[top]!.zone).toBe("exile");
    pool(s, ap, { R: 1 });
    expect(planCast(s, ap, top, [{ kind: "player", id: opp }])).toBeNull();
  });

  it("a creature that didn't enter this turn attacking alone exiles nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, pace());
    const old = putOnBattlefield(s0, ap, bears());
    const top = putIn(s0, ap, bolt(), "library");
    let s = attackWith(s0, ap, [{ attacker: old, defender: opp }]);
    s = settle(s);
    expect(s.objects[top]!.zone).toBe("library");
  });
});

describe("Bane Alley Broker", () => {
  it("exiles a card from your hand face down, which you may look at; {U}{B}, {T} returns one of them to your hand", () => {
    const { s: s0, ap, ids } = setup([bolt(), opt()]);
    emptyHand(s0, ap);
    s0.players[ap]!.hand = [...ids];
    for (const id of ids) s0.objects[id]!.zone = "hand";
    const broker0 = putOnBattlefield(s0, ap, broker());
    let s = settle(run(s0, planActivate(s0, ap, broker0, 0)), { me: [ap] });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }), { me: [ap] });
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.hiddenExile?.seen).toEqual([ap]);
    s.objects[broker0]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, broker0, 0)), { me: [ap] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }), { me: [ap] });
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    s.objects[broker0]!.tapped = false;
    pool(s, ap, { U: 1, B: 1 });
    s = settle(run(s, planActivate(s, ap, broker0, 1)), { me: [ap] });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }), { me: [ap] });
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("a new controller may look at them as its last ability resolves (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), opt()]);
    emptyHand(s0, ap);
    s0.players[ap]!.hand = [...ids];
    for (const id of ids) s0.objects[id]!.zone = "hand";
    const broker0 = putOnBattlefield(s0, ap, broker());
    let s = settle(run(s0, planActivate(s0, ap, broker0, 0)), { me: [ap] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }), { me: [ap] });
    s.objects[broker0]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, broker0, 0)), { me: [ap] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }), { me: [ap] });
    // Now the opponent controls it and activates the return.
    s.objects[broker0]!.controller = opp;
    s.objects[broker0]!.tapped = false;
    invalidateCharacteristics(s);
    s = goTo(s, "upkeep", opp);
    s = goTo(s, "main1", opp, opp);
    pool(s, opp, { U: 1, B: 1 });
    s = settle(run(s, planActivate(s, opp, broker0, 1)), { me: [opp] });
    expect(s.pending?.kind).toBe("searchLibrary");
    expect(s.objects[ids[0]!]!.hiddenExile?.seen).toContain(opp);
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [ids[0]!] }), { me: [opp] });
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(ids[0]!); // its owner's hand
  });
});

// Lane B round B177: Blossombind ("can't have counters put on it"), Twinning Glass (a free cast by a name cast this turn),
// Eternal Dominion (search an opponent's library for a permanent card, onto the battlefield under your control), Head Games
// (Jester's Mask's text, "The player puts ..."), Creeping Dread (each opponent who discarded a card sharing a card type with
// yours), Scythe Specter (the greatest mana value discarded), Quag Feast ("Choose target creature, planeswalker, or
// Vehicle", destroyed after the mill if its mana value fits) and Mossbridge Troll (tapping creatures with total power 10 as
// a cost, not crewing).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const blossom = (): CardDef => ({"oracleId":"0ecb35b3-5bd1-4467-a4a3-ce468023ced2","name":"Blossombind","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature can't become untapped and can't have counters put on it.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/3/8/382b83c0-bbbc-4db8-bc04-cfea79aed1b3.jpg?1783904493","artUrl":"https://cards.scryfall.io/art_crop/front/3/8/382b83c0-bbbc-4db8-bc04-cfea79aed1b3.jpg?1783904493","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const glass = (): CardDef => ({"oracleId":"907baed5-499b-4f20-bbb9-8f5bead37c30","name":"Twinning Glass","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: You may cast a spell from your hand without paying its mana cost if it has the same name as a spell that was cast this turn.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0138c42-77ea-45f0-b2ca-cda03f3f50d1.jpg?1783942850","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0138c42-77ea-45f0-b2ca-cda03f3f50d1.jpg?1783942850","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dominion = (): CardDef => ({"oracleId":"ede2a435-bf9a-4f87-b579-259cfdebc13f","name":"Eternal Dominion","manaCost":"{7}{U}{U}{U}","cmc":10,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search target opponent's library for an artifact, creature, enchantment, or land card. Put that card onto the battlefield under your control. Then that player shuffles.\nEpic (For the rest of the game, you can't cast spells. At the beginning of each of your upkeeps, copy this spell except for its epic ability. You may choose a new target for the copy.)","colors":["U"],"colorIdentity":["U"],"keywords":["Epic"],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/3067a9bd-991a-462d-862a-2518ae31c382.jpg?1783944164","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/3067a9bd-991a-462d-862a-2518ae31c382.jpg?1783944164","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const headGames = (): CardDef => ({"oracleId":"671a8509-3b6e-499c-a744-ff8b3c2b6e6a","name":"Head Games","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent puts the cards from their hand on top of their library. Search that player's library for that many cards. The player puts those cards into their hand, then shuffles.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/86ecc098-aa2b-4bae-80d5-4d02128ef837.jpg?1783945066","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86ecc098-aa2b-4bae-80d5-4d02128ef837.jpg?1783945066","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dread = (): CardDef => ({"oracleId":"3bb16720-18dc-44b7-adb0-c9b7adda9ebe","name":"Creeping Dread","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, each player discards a card. Each opponent who discarded a card that shares a card type with the card you discarded loses 3 life. (Players reveal the discarded cards simultaneously.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b3376c4-369a-4d63-bd48-966bcfb0c9b9.jpg?1783937777","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b3376c4-369a-4d63-bd48-966bcfb0c9b9.jpg?1783937777","commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const scythe = (): CardDef => ({"oracleId":"529ace49-c50e-4d3e-ac29-91e08af57fdc","name":"Scythe Specter","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Specter","supertypes":[],"types":["Creature"],"subtypes":["Specter"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, each opponent discards a card. Each player who discarded a card with the greatest mana value among cards discarded this way loses life equal to that mana value.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bf9643cb-de43-4382-a4d7-26561d4dff00.jpg?1783941219","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bf9643cb-de43-4382-a4d7-26561d4dff00.jpg?1783941219","commanderLegal":"legal","set":"cmd","releasedAt":"2011-06-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const quag = (): CardDef => ({"oracleId":"78957246-4092-4f4a-80e3-142e24226962","name":"Quag Feast","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose target creature, planeswalker, or Vehicle. Mill two cards, then destroy the chosen permanent if its mana value is less than or equal to the number of cards in your graveyard.","colors":["B"],"colorIdentity":["B"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5d6498f0-5ebd-441a-a851-461b0460e7d5.jpg?1783907802","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5d6498f0-5ebd-441a-a851-461b0460e7d5.jpg?1783907802","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const troll = (): CardDef => ({"oracleId":"87aa466e-7985-40ff-bef6-dcae35fe0106","name":"Mossbridge Troll","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Creature — Troll","supertypes":[],"types":["Creature"],"subtypes":["Troll"],"oracleText":"If this creature would be destroyed, regenerate it.\nTap any number of untapped creatures you control other than this creature with total power 10 or greater: This creature gets +20/+20 until end of turn.","power":"5","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/537c39cc-44d3-4869-9e76-dd9c2c68ee90.jpg?1783942741","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/537c39cc-44d3-4869-9e76-dd9c2c68ee90.jpg?1783942741","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","commanderLegal":"legal","set":"ddj","releasedAt":"2012-09-07","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]}) as CardDef;
const bonecrusher = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const battlegrowth = (): CardDef => ({"oracleId":"650bf82e-7f83-470c-bf4a-34281bfe9341","name":"Battlegrowth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put a +1/+1 counter on target creature.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/b/2b34e76b-86b3-464e-93e7-c3f2074028fb.jpg?1783944536","artUrl":"https://cards.scryfall.io/art_crop/front/2/b/2b34e76b-86b3-464e-93e7-c3f2074028fb.jpg?1783944536","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const puncture = (): CardDef => ({"oracleId":"e296581d-01ac-43bf-898c-2edb4c81bcbe","name":"Puncture Blast","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Wither (This deals damage to creatures in the form of -1/-1 counters.)\nPuncture Blast deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":["Wither"],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3bf90b4d-98cf-4953-b6ae-c41d21ab559b.jpg?1783942682","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3bf90b4d-98cf-4953-b6ae-c41d21ab559b.jpg?1783942682","commanderLegal":"legal","set":"eve","releasedAt":"2008-07-25","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const copter = (): CardDef => ({"oracleId":"49136bdc-bc50-49a2-999a-1ef9c16ea130","name":"Smuggler's Copter","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Flying","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Everyone passes until the stack is empty; the bots answer any question. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
  }
};

describe("Lane B round B177: cards", () => {
  it("compile", () => supported(blossom(), glass(), dominion(), headGames(), dread(), scythe(), quag(), troll()));
});

describe("Blossombind", () => {
  it("taps the creature; it can't untap or have counters put on it, wither damage does nothing, the counters already there stay", () => {
    let { s, ap, opp, ids } = setup([blossom(), battlegrowth(), puncture()]);
    const b = putOnBattlefield(s, opp, giant());
    s.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s = settleBots(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[b]!).cantHaveCounters).toBe(true);
    // Battlegrowth: no +1/+1 counter; the one it had stays (rulings).
    s = settleBots(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, b)).toBe("4/4");
    // Puncture Blast (wither): no -1/-1 counters and no damage marked (rulings).
    s = settleBots(run(s, planCast(s, ap, ids[2]!, [tgt(b)])));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(s.objects[b]!.damage ?? 0).toBe(0);
    // It doesn't untap during its controller's untap step.
    s = passUntil(s, "main1", opp);
    expect(s.objects[b]!.tapped).toBe(true);
  });

  it("another creature still gets counters", () => {
    let { s, ap, opp, ids } = setup([blossom(), battlegrowth()]);
    const b = putOnBattlefield(s, opp, giant());
    const other = putOnBattlefield(s, ap, bears());
    s = settleBots(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    s = settleBots(run(s, planCast(s, ap, ids[1]!, [tgt(other)])));
    expect(s.objects[other]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Twinning Glass", () => {
  it("with no spell cast this turn, nothing can be cast", () => {
    let { s, ap } = setup([opt()]);
    const g = putOnBattlefield(s, ap, glass());
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(s.pending).toBeNull();
    expect(s.log.some((l) => /has no spell with the same name as a spell cast this turn in hand/.test(l.text))).toBe(true);
  });

  it("offers only cards named like a spell cast this turn, by anyone, and casts the one picked for free", () => {
    let { s, ap, ids } = setup([opt(), opt(), bolt()]);
    const g = putOnBattlefield(s, ap, glass());
    s = settleBots(run(s, planCast(s, ap, ids[0]!)));
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toEqual([ids[1], "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: ids[1]! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: ids[1], names: ["Opt"] });
    const tapped = s.battlefield.filter((id) => s.objects[id]!.tapped).length;
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(tapped);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("an opponent's spell counts; a split card is cast as the half with that name only", () => {
    let { s, ap, opp, ids } = setup([fireIce()]);
    const g = putOnBattlefield(s, ap, glass());
    const theirs = into(s, opp, fireIce(), "hand");
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"))!;
    // The opponent casts Ice (an instant) once they get priority.
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[opp]!.manaPool = { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 };
    s = run(s, planCast(s, opp, theirs, [tgt(land)], undefined, undefined, undefined, { face: 1 }));
    s = settleBots(s);
    expect(s.castThisTurn?.some((c) => c.name === "Ice" && c.player === opp)).toBe(true);
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand" });
    s = act(s, { type: "chooseOption", player: ap, choice: ids[0]! });
    expect(castProblem(s, ap, ids[0]!, [tgt(land)], undefined, undefined, undefined, undefined, { face: 0 })).toMatch(/same name as a spell cast this turn/);
    expect(castProblem(s, ap, ids[0]!, [tgt(land)], undefined, undefined, undefined, undefined, { face: 1 })).toBeNull();
  });

  it("an Adventure: only its Adventure when that's the name cast", () => {
    let { s, ap, opp, ids } = setup([bonecrusher(), bonecrusher()]);
    const g = putOnBattlefield(s, ap, glass());
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, { face: 1 })));
    expect(s.castThisTurn?.some((c) => c.name === "Stomp")).toBe(true);
    s = settle(run(s, planActivate(s, ap, g, 0)));
    s = act(s, { type: "chooseOption", player: ap, choice: ids[1]! });
    expect(castProblem(s, ap, ids[1]!)).toMatch(/same name as a spell cast this turn/);
    expect(castProblem(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, undefined, { face: 1 })).toBeNull();
  });
});

describe("Eternal Dominion", () => {
  it("puts an artifact, creature, enchantment or land card from the opponent's library onto the battlefield under your control", () => {
    let { s, ap, opp, ids } = setup([dominion()]);
    const want = into(s, opp, giant(), "library");
    const instant = into(s, opp, bolt(), "library");
    s.players[ap]!.manaPool = { W: 0, U: 10, B: 0, R: 0, G: 0, C: 0 };
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(cards).toContain(want);
    expect(cards).not.toContain(instant);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [want] }));
    expect(s.objects[want]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[want]!).controller).toBe(ap);
    expect(s.objects[want]!.owner).toBe(opp);
    // Epic: no more spells for the rest of the game.
    expect(Object.values(s.epics ?? {}).some((e) => e.controller === ap)).toBe(true);
  });
});

describe("Head Games", () => {
  it("the opponent's hand goes on top, you search for that many cards and they go to their hand", () => {
    let { s, ap, opp, ids } = setup([headGames()]);
    emptyHand(s, opp);
    for (const d of [bolt(), opt(), divination()]) into(s, opp, d, "hand");
    const lands = s.players[opp]!.library.slice(-3);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "searchLibrary" && p.player === ap) {
        expect(p.min).toBe(3);
        s = act(s, { type: "searchLibrary", player: ap, found: lands });
      } else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect([...s.players[opp]!.hand].sort()).toEqual([...lands].sort());
  });
});

describe("Creeping Dread", () => {
  const atUpkeep = (hands: Record<number, CardDef[]>) => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, dread());
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "upkeep", ap);
    const order = [0, 1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
    const held: Record<string, string[]> = {};
    order.forEach((pid, i) => {
      emptyHand(s, pid);
      held[pid] = (hands[i] ?? []).map((d) => into(s, pid, d, "hand"));
    });
    return { s, ap, order, held };
  };

  it("each opponent who discarded a card sharing a card type with yours loses 3 life", () => {
    let { s, ap, order } = atUpkeep({ 0: [bears()], 1: [giant()], 2: [opt()], 3: [] });
    const life = order.map((p) => s.players[p]!.life);
    s = settleBots(s);
    expect(order.map((p) => s.players[p]!.life)).toEqual([life[0], life[1]! - 3, life[2], life[3]]);
    expect(s.players[order[1]!]!.graveyard.length).toBeGreaterThan(0);
    expect(s.players[ap]!.hand).toHaveLength(0);
  });

  it("if you didn't discard a card, no one loses life", () => {
    let { s, order } = atUpkeep({ 0: [], 1: [giant()], 2: [bears()], 3: [opt()] });
    const life = order.map((p) => s.players[p]!.life);
    s = settleBots(s);
    expect(order.map((p) => s.players[p]!.life)).toEqual(life);
  });
});

describe("Scythe Specter", () => {
  it("each player who discarded a card with the greatest mana value loses that much life, ties included", () => {
    let { s, ap, opp } = setup([]);
    const sp = putOnBattlefield(s, ap, scythe());
    const order = [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
    order.forEach((pid, i) => {
      emptyHand(s, pid);
      into(s, pid, [giant(), opt(), giant()][i]!, "hand");
    });
    const life = order.map((p) => s.players[p]!.life);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sp, defender: opp }] });
    for (let i = 0; i < 200 && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(order.map((p) => s.players[p]!.life)).toEqual([life[0]! - 4 - 4, life[1], life[2]! - 4]);
    expect(order.every((p) => s.players[p]!.hand.length === 0)).toBe(true);
  });
});

describe("Quag Feast", () => {
  it("destroys the chosen creature if its mana value is at most the cards in your graveyard after the mill", () => {
    let { s, ap, opp, ids } = setup([quag()]);
    const g = putOnBattlefield(s, opp, giant());
    into(s, ap, bolt(), "graveyard");
    into(s, ap, opt(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("graveyard");
  });

  it("not with too few cards; a noncreature Vehicle and a planeswalker can be chosen", () => {
    let { s, ap, opp, ids } = setup([quag(), quag()]);
    s.players[ap]!.graveyard.length = 0;
    const g = putOnBattlefield(s, opp, giant());
    const v = putOnBattlefield(s, opp, copter());
    const j = putOnBattlefield(s, opp, jace());
    s.objects[j]!.counters.loyalty = 3;
    invalidateCharacteristics(s);
    expect(planCast(s, ap, ids[0]!, [tgt(j)])).not.toBeNull();
    // Graveyard: Quag Feast isn't there yet as it resolves, so two milled cards: 2 < 4 (Hill Giant survives).
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("battlefield");
    // Now 3 cards (two milled, the first Quag Feast), then two more: the Copter (mana value 2) is destroyed.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(v)])));
    expect(s.objects[v]!.zone).toBe("graveyard");
  });
});

describe("Mossbridge Troll", () => {
  it("taps other creatures with total power 10 or more for +20/+20; it isn't crewing", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, troll());
    const gs = [giant(), giant(), giant()].map((d) => putOnBattlefield(s0, ap, d));
    const b = putOnBattlefield(s0, ap, bears());
    expect(abilitiesOf(s0, s0.objects[t]!).activated[0]).toMatchObject({ crew: 10, tapPower: true });
    expect(planActivate(s0, ap, t, 0, undefined, undefined, gs)).toBeNull(); // 9
    expect(planActivate(s0, ap, t, 0, undefined, undefined, [t, ...gs])).toBeNull(); // not itself
    let s = run(s0, planActivate(s0, ap, t, 0, undefined, undefined, [...gs, b]));
    expect([...gs, b].every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(s.objects[t]!.tapped).toBe(false);
    expect(s.log.some((l) => / crews /.test(l))).toBe(false);
    expect(s.turnLog?.crewedBy).toBeUndefined();
    s = settle(s);
    expect(pt(s, t)).toBe("25/25");
  });

  it("a tapped creature can't help pay", () => {
    const { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, troll());
    const gs = [giant(), giant(), giant(), giant()].map((d) => putOnBattlefield(s, ap, d));
    const b = putOnBattlefield(s, ap, bears());
    s.objects[gs[0]!]!.tapped = true;
    expect(planActivate(s, ap, t, 0, undefined, undefined, gs)).toBeNull();
    expect(planActivate(s, ap, t, 0, undefined, undefined, gs.slice(1))).toBeNull(); // 9
    expect(planActivate(s, ap, t, 0, undefined, undefined, [...gs.slice(1), b])).not.toBeNull(); // 11
  });
});

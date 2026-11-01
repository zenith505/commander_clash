// Lane B, round 75: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): searches for
// a card by name or an Aura in your library, graveyard and/or hand (CR 701.23), granted outlast, one-line statics and
// triggers.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
import { controllerOf } from "../src/layers";
import { draw } from "../src/game";
import { objHasKeyword } from "../src/cards";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering "you may" with `may`; other questions are answered as the bots would, except `me`'s (it stops there). */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player === opts.me) return s;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const shuffles = (s: GameState, pid: PlayerId) => s.players[pid]!.shuffles ?? 0;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], costs?: CostChoices) => run(s, planActivate(s, pid, id, index, targets, undefined, undefined, undefined, costs));
/** Moves a new card for `def` into `pid`'s hand, library (on top), graveyard or exile. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const abIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));

// Real oracle text (Scryfall).
const sunblessedMount = (): CardDef => ({"oracleId":"139b0fd5-8aa7-4b36-ab5d-cbf398381c6d","name":"Sun-Blessed Mount","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"When this creature enters, you may search your library and/or graveyard for a card named Huatli, Dinosaur Knight, reveal it, then put it into your hand. If you search your library this way, shuffle.","power":"4","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f06ac1f-0bae-4aaa-9ff4-28c806828c40.jpg?1783935682","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f06ac1f-0bae-4aaa-9ff4-28c806828c40.jpg?1783935682","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dovinsDismissal = (): CardDef => ({"oracleId":"6db5f1a7-4cd8-42e2-a5d8-1603206ad0cc","name":"Dovin's Dismissal","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put up to one target tapped creature on top of its owner's library. You may search your library and/or graveyard for a card named Dovin, Architect of Law, reveal it, and put it into your hand. If you search your library this way, shuffle.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/3/6328e6b5-9dfb-4fd4-99ee-a1ffc2c707da.jpg?1783933609","artUrl":"https://cards.scryfall.io/art_crop/front/6/3/6328e6b5-9dfb-4fd4-99ee-a1ffc2c707da.jpg?1783933609","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const verdantCrescendo = (): CardDef => ({"oracleId":"b184d12d-41d8-4a74-99b1-8c7fced212f8","name":"Verdant Crescendo","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a basic land card and put it onto the battlefield tapped. Search your library and graveyard for a card named Nissa, Nature's Artisan, reveal it, put it into your hand, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ea890019-f48f-4164-b057-773499ef273f.jpg?1783937135","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ea890019-f48f-4164-b057-773499ef273f.jpg?1783937135","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const boonweaverGiant = (): CardDef => ({"oracleId":"79eed0c6-1853-4032-9d12-aebf5e15e78c","name":"Boonweaver Giant","manaCost":"{6}{W}","cmc":7,"typeLine":"Creature — Giant Monk","supertypes":[],"types":["Creature"],"subtypes":["Giant","Monk"],"oracleText":"When this creature enters, you may search your graveyard, hand, and/or library for an Aura card and put it onto the battlefield attached to this creature. If you search your library this way, shuffle.","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85003365-7c5f-4283-995d-e466deef444b.jpg?1783939204","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85003365-7c5f-4283-995d-e466deef444b.jpg?1783939204","commanderLegal":"legal","set":"m15","releasedAt":"2014-07-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const runedCrown = (): CardDef => ({"oracleId":"b8739fc4-6308-4e49-be2e-d9d92d890ee1","name":"Runed Crown","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"When this Equipment enters, you may search your library, hand, and/or graveyard for a Rune card and put it onto the battlefield attached to this Equipment. If you search your library this way, shuffle.\nEquipped creature gets +1/+1.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1ef89770-2dbb-4a57-99f7-191591bb8e38.jpg?1783928183","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1ef89770-2dbb-4a57-99f7-191591bb8e38.jpg?1783928183","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const enduringSliver = (): CardDef => ({"oracleId":"f9726123-f87b-41bb-9b6f-6d2fbcf0eae2","name":"Enduring Sliver","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"Outlast {2} ({2}, {T}: Put a +1/+1 counter on this creature. Outlast only as a sorcery.)\nOther Sliver creatures you control have outlast {2}.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Outlast"],"imageUrl":"https://cards.scryfall.io/normal/front/6/e/6ed0f6a5-ed40-44fc-a5e1-3f8bb968d1d9.jpg?1783933164","artUrl":"https://cards.scryfall.io/art_crop/front/6/e/6ed0f6a5-ed40-44fc-a5e1-3f8bb968d1d9.jpg?1783933164","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mysteriousPathlighter = (): CardDef => ({"oracleId":"fe87e290-8e9d-4269-ad1f-bb31e6eeb7da","name":"Mysterious Pathlighter","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Faerie","supertypes":[],"types":["Creature"],"subtypes":["Faerie"],"oracleText":"Flying\nEach creature you control that has an Adventure enters with an additional +1/+1 counter on it. (It doesn't need to have gone on the adventure first.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/1/0/1028aa10-aded-4aeb-b70f-d7a9003ae846.jpg?1783932669","artUrl":"https://cards.scryfall.io/art_crop/front/1/0/1028aa10-aded-4aeb-b70f-d7a9003ae846.jpg?1783932669","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rootwaterShaman = (): CardDef => ({"oracleId":"8a449915-8bd7-4a9c-abb1-a95852f33695","name":"Rootwater Shaman","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Merfolk Shaman","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Shaman"],"oracleText":"You may cast Aura spells with enchant creature as though they had flash.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/caa1b84b-efda-4324-9106-0d1d00385cdc.jpg?1783946651","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/caa1b84b-efda-4324-9106-0d1d00385cdc.jpg?1783946651","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nyxbornShieldmate = (): CardDef => ({"oracleId":"a1012f33-7ebd-47c6-b670-1b0dc046fbce","name":"Nyxborn Shieldmate","manaCost":"{W}","cmc":1,"typeLine":"Enchantment Creature — Human Soldier","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Human","Soldier"],"oracleText":"Bestow {2}{W} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +1/+2.","power":"1","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Bestow"],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64204816-6e1d-4bf8-acd0-8f83ca7eb8c7.jpg?1783939578","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64204816-6e1d-4bf8-acd0-8f83ca7eb8c7.jpg?1783939578","commanderLegal":"legal","set":"bng","releasedAt":"2014-02-07","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const moonGirlAndDevilDinosaur = (): CardDef => ({"oracleId":"bfe0818b-ae13-4174-85c8-24b895d28df0","name":"Moon Girl and Devil Dinosaur","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Legendary Creature — Human Dinosaur Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Dinosaur","Hero"],"oracleText":"Whenever you draw your second card each turn, until end of turn, Moon Girl and Devil Dinosaur's base power and toughness become 6/6 and they gain trample.\nWhenever an artifact you control enters, draw a card. This ability triggers only once each turn.","power":"2","toughness":"2","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8c6a6d11-45cb-4def-a04b-51b91e1747db.jpg?1783902900","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8c6a6d11-45cb-4def-a04b-51b91e1747db.jpg?1783902900","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const eyeOfJace = (): CardDef => ({"oracleId":"c8f802ad-4621-4f71-b52d-fbc55853dc88","name":"Eye of Jace","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of your upkeep, surveil 1. Then if there are seven or more cards in your graveyard, sacrifice this artifact, it deals 2 damage to each opponent, and you gain 2 life. (To surveil 1, look at the top card of your library. You may put it into your graveyard.)","colors":[],"colorIdentity":[],"keywords":["Surveil"],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0edba64a-39cf-4a8d-ba20-4f7da10b6c3d.jpg?1789614864","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0edba64a-39cf-4a8d-ba20-4f7da10b6c3d.jpg?1789614864","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const knightOfWundagore = (): CardDef => ({"oracleId":"39145960-a212-46b4-addb-4b187f6bf6fd","name":"Knight of Wundagore","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Cat Knight Villain","supertypes":[],"types":["Creature"],"subtypes":["Cat","Knight","Villain"],"oracleText":"Trample\nWhenever you put a +1/+1 counter on another creature, put a +1/+1 counter on this creature. This ability triggers only once each turn.","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f3003766-9383-44e0-8b51-35ccbed137ed.jpg?1783902917","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f3003766-9383-44e0-8b51-35ccbed137ed.jpg?1783902917","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const socialSnub = (): CardDef => ({"oracleId":"b284913e-3530-4a7e-8c75-efb18788dad0","name":"Social Snub","manaCost":"{1}{W}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"When you cast this spell while you control a creature, you may copy this spell.\nEach player sacrifices a creature of their choice. Each opponent loses 1 life and you gain 1 life.","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/0/a04b6900-0436-4920-a0d4-c0186d605ae3.jpg?1783903629","artUrl":"https://cards.scryfall.io/art_crop/front/a/0/a04b6900-0436-4920-a0d4-c0186d605ae3.jpg?1783903629","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const eldraziObligator = (): CardDef => ({"oracleId":"d09402cb-cf64-493e-a82d-244b31700710","name":"Eldrazi Obligator","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nWhen you cast this spell, you may pay {1}{C}. If you do, gain control of target creature until end of turn, untap that creature, and it gains haste until end of turn. ({C} represents colorless mana.)\nHaste","power":"3","toughness":"1","colors":[],"colorIdentity":["R"],"keywords":["Devoid","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/d/f/dfaa8b16-7c12-44e2-8ddb-17608d491c41.jpg?1783937909","artUrl":"https://cards.scryfall.io/art_crop/front/d/f/dfaa8b16-7c12-44e2-8ddb-17608d491c41.jpg?1783937909","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const yasovaDragonclaw = (): CardDef => ({"oracleId":"75dc0995-f89e-4a2c-b30b-9b5a07c21183","name":"Yasova Dragonclaw","manaCost":"{2}{G}","cmc":3,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Trample\nAt the beginning of combat on your turn, you may pay {1}{U/R}{U/R}. If you do, gain control of target creature an opponent controls with power less than Yasova Dragonclaw's power until end of turn, untap that creature, and it gains haste until end of turn.","power":"4","toughness":"2","colors":["G"],"colorIdentity":["G","R","U"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/490994c6-9fef-482b-835d-a64350bfaa8d.jpg?1783938674","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/490994c6-9fef-482b-835d-a64350bfaa8d.jpg?1783938674","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lithoformBlight = (): CardDef => ({"oracleId":"b256c311-e37d-4b3c-889c-85443e3d5e7e","name":"Lithoform Blight","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhen this Aura enters, draw a card.\nEnchanted land loses all land types and abilities and has \"{T}: Add {C}\" and \"{T}, Pay 1 life: Add one mana of any color.\"","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"producedMana":["B","C","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5b36d12e-9a68-4d3d-92e8-9840cd5320bc.jpg?1783929375","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5b36d12e-9a68-4d3d-92e8-9840cd5320bc.jpg?1783929375","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const enormousEnergyBlade = (): CardDef => ({"oracleId":"7818e900-2f4e-4710-87a4-5a9ac170a677","name":"Enormous Energy Blade","manaCost":"{2}{B}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +4/+0.\nWhenever this Equipment becomes attached to a creature, tap that creature.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":["B"],"colorIdentity":["B"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/9/9/991370bd-a96a-4ed0-bdf9-f03b98191abf.jpg?1783923888","artUrl":"https://cards.scryfall.io/art_crop/front/9/9/991370bd-a96a-4ed0-bdf9-f03b98191abf.jpg?1783923888","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shieldOfTheRighteous = (): CardDef => ({"oracleId":"6d9aaa70-b2cc-424c-8095-a0b2fa272db3","name":"Shield of the Righteous","manaCost":"{W}{U}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +0/+2 and has vigilance.\nWhenever equipped creature blocks a creature, that creature doesn't untap during its controller's next untap step.\nEquip {2}","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/9/e/9e6474b6-1e1a-4c29-8f01-1cabf729b34f.jpg?1783942441","artUrl":"https://cards.scryfall.io/art_crop/front/9/e/9e6474b6-1e1a-4c29-8f01-1cabf729b34f.jpg?1783942441","commanderLegal":"legal","set":"arb","releasedAt":"2009-04-30","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const astralConfrontation = (): CardDef => ({"oracleId":"80788ac7-19d6-42d2-9f6e-676d7b5c912e","name":"Astral Confrontation","manaCost":"{4}{W}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell costs {1} less to cast for each opponent you're attacking.\nExile target creature.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/eefe66d8-1b35-49f1-9bc0-74c5861e5abf.jpg?1783922821","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/eefe66d8-1b35-49f1-9bc0-74c5861e5abf.jpg?1783922821","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const adamaroFirstToDesire = (): CardDef => ({"oracleId":"18f34bfd-7675-49df-91ea-695c510cd3c3","name":"Adamaro, First to Desire","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Adamaro's power and toughness are each equal to the number of cards in the hand of the opponent with the most cards in hand.","power":"*","toughness":"*","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d2fa85ea-f5d5-4be3-a874-ce246c3e4245.jpg?1783944150","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d2fa85ea-f5d5-4be3-a874-ce246c3e4245.jpg?1783944150","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rampagingSoulrager = (): CardDef => ({"oracleId":"f6d8e6cb-0878-4f2c-9a89-ce84cb4f5bbc","name":"Rampaging Soulrager","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"This creature gets +3/+0 as long as there are two or more unlocked doors among Rooms you control.","power":"1","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/6/569c914b-95af-428f-a142-6f20e418bc59.jpg?1783909465","artUrl":"https://cards.scryfall.io/art_crop/front/5/6/569c914b-95af-428f-a142-6f20e418bc59.jpg?1783909465","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cleavingReaper = (): CardDef => ({"oracleId":"70c268af-3fb4-42b8-a87a-d06d33c1c641","name":"Cleaving Reaper","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Angel Berserker","supertypes":[],"types":["Creature"],"subtypes":["Angel","Berserker"],"oracleText":"Flying, trample\nPay 3 life: Return this card from your graveyard to your hand. Activate only if you had an Angel or Berserker enter the battlefield under your control this turn.","power":"5","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b59dadef-74e5-47c7-a3e0-51075ddb82b1.jpg?1783928123","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b59dadef-74e5-47c7-a3e0-51075ddb82b1.jpg?1783928123","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const huatliDinosaurKnight = (): CardDef => ({"oracleId":"04aa210a-235f-4e07-87d1-0d28cdf6888b","name":"Huatli, Dinosaur Knight","manaCost":"{4}{R}{W}","cmc":6,"typeLine":"Legendary Planeswalker — Huatli","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Huatli"],"oracleText":"+2: Put two +1/+1 counters on up to one target Dinosaur you control.\n−3: Target Dinosaur you control deals damage equal to its power to target creature you don't control.\n−7: Dinosaurs you control get +4/+4 until end of turn.","loyalty":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6a5a6f7b-149d-46d3-9814-d38a302db17c.jpg?1783935684","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6a5a6f7b-149d-46d3-9814-d38a302db17c.jpg?1783935684","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const dovinArchitectOfLaw = (): CardDef => ({"oracleId":"a3386efe-d6c5-4853-a4db-61460da3364a","name":"Dovin, Architect of Law","manaCost":"{4}{W}{U}","cmc":6,"typeLine":"Legendary Planeswalker — Dovin","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Dovin"],"oracleText":"+1: You gain 2 life and draw a card.\n−1: Tap target creature. It doesn't untap during its controller's next untap step.\n−9: Tap all permanents target opponent controls. That player skips their next untap step.","loyalty":"5","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0c7cffe-8751-4da7-8c1c-59f472ef3735.jpg?1783933609","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0c7cffe-8751-4da7-8c1c-59f472ef3735.jpg?1783933609","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const nissaNaturesArtisan = (): CardDef => ({"oracleId":"5e2aff26-c9f0-4e4b-bc5e-b2cb46e04293","name":"Nissa, Nature's Artisan","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Legendary Planeswalker — Nissa","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Nissa"],"oracleText":"+3: You gain 3 life.\n−4: Reveal the top two cards of your library. Put all land cards from among them onto the battlefield and the rest into your hand.\n−12: Creatures you control get +5/+5 and gain trample until end of turn.","loyalty":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/777533c3-0a87-4625-8987-d850fc236ddb.jpg?1783937134","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/777533c3-0a87-4625-8987-d850fc236ddb.jpg?1783937134","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const runeOfFlight = (): CardDef => ({"oracleId":"829a4110-9209-45e9-b1a5-25e005711118","name":"Rune of Flight","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Aura Rune","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Rune"],"oracleText":"Enchant permanent\nWhen this Aura enters, draw a card.\nAs long as enchanted permanent is a creature, it has flying.\nAs long as enchanted permanent is an Equipment, it has \"Equipped creature has flying.\"","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d5c1a271-2107-462a-9d4a-9c7fbcfa8d77.jpg?1783928257","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d5c1a271-2107-462a-9d4a-9c7fbcfa8d77.jpg?1783928257","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mantleOfTheAncients = (): CardDef => ({"oracleId":"7424560f-557f-4bc9-a3e7-eb890c73aaa3","name":"Mantle of the Ancients","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature you control\nWhen this Aura enters, return any number of target Aura and/or Equipment cards from your graveyard to the battlefield attached to enchanted creature.\nEnchanted creature gets +1/+1 for each Aura and Equipment attached to it.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/5/6/56ec4350-05fa-4452-ade3-3cf2c319eb0b.jpg?1783912368","artUrl":"https://cards.scryfall.io/art_crop/front/5/6/56ec4350-05fa-4452-ade3-3cf2c319eb0b.jpg?1783912368","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wildGrowth = (): CardDef => ({"oracleId":"706ae742-1807-44b7-a4fa-f2e26f61519a","name":"Wild Growth","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bonecrusherGiant = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bottomlessPool = (): CardDef => ({"oracleId":"b9ac4856-5cdb-479f-b0f5-7fa0b232a5ff","name":"Bottomless Pool // Locker Room","manaCost":"{U} // {4}{U}","cmc":6,"typeLine":"Enchantment — Room // Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"When you unlock this door, return up to one target creature to its owner's hand.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/606fe87c-d17b-4fa7-8e82-e7002d8229ef.jpg?1783909499","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/606fe87c-d17b-4fa7-8e82-e7002d8229ef.jpg?1783909499","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Bottomless Pool","manaCost":"{U}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"When you unlock this door, return up to one target creature to its owner's hand.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"]},{"name":"Locker Room","manaCost":"{4}{U}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"Whenever one or more creatures you control deal combat damage to a player, draw a card.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"]}]}) as CardDef;

describe("Lane B round 75", () => {
  it("all of them are supported", () => {
    supported(sunblessedMount(), dovinsDismissal(), verdantCrescendo(), boonweaverGiant(), runedCrown(), enduringSliver(), mysteriousPathlighter(), rootwaterShaman(), moonGirlAndDevilDinosaur(), eyeOfJace(), knightOfWundagore(), socialSnub(), eldraziObligator(), yasovaDragonclaw(), lithoformBlight(), enormousEnergyBlade(), shieldOfTheRighteous(), astralConfrontation(), adamaroFirstToDesire(), rampagingSoulrager(), cleavingReaper());
  });

  it("Sun-Blessed Mount: you may search your library and/or graveyard for Huatli, Dinosaur Knight; from the graveyard, no shuffle (CR 701.23)", () => {
    const { s: s0, ap, ids } = setup([sunblessedMount()]);
    const huatli = toZone(s0, ap, huatliDinosaurKnight(), "graveyard");
    const before = shuffles(s0, ap);
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "searchZones" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "graveyard" }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [huatli] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [huatli] }));
    expect(zone(s, huatli)).toBe("hand");
    expect(shuffles(s, ap)).toBe(before);
  });
  it("Dovin's Dismissal: up to one target tapped creature on top of its owner's library, then the search; none chosen, still the search", () => {
    const { s: s0, ap, opp, ids } = setup([dovinsDismissal(), dovinsDismissal()]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.tapped = true;
    const dovin = toZone(s0, ap, dovinArchitectOfLaw(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(b)]), { me: ap });
    expect(s.players[opp]!.library[0]).toBe(b);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    if (s.pending?.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: "graveyard" }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [dovin] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [dovin] }));
    expect(zone(s, dovin)).toBe("hand");
    // With no target chosen, it still resolves and searches.
    const dovin2 = toZone(s, ap, dovinArchitectOfLaw(), "graveyard");
    s = settle(castNow(s, ap, ids[1]!, [{ kind: "none" }]), { me: ap });
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    if (s.pending?.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: "graveyard" }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [dovin2] });
  });

  it("Dovin's Dismissal: a target that's no longer tapped means it doesn't resolve, and there's no search (rulings, CR 608.2b)", () => {
    const { s: s0, ap, opp, ids } = setup([dovinsDismissal()]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.tapped = true;
    toZone(s0, ap, dovinArchitectOfLaw(), "graveyard");
    let s = castNow(s0, ap, ids[0]!, [tgt(b)]);
    s.objects[b]!.tapped = false;
    s = settle(s, { me: ap });
    expect(s.pending).toBeFalsy();
    expect(zone(s, b)).toBe("battlefield");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Verdant Crescendo: a basic land onto the battlefield tapped, then Nissa, Nature's Artisan from the library or graveyard, one shuffle", () => {
    const { s: s0, ap, ids } = setup([verdantCrescendo()]);
    const nissa = toZone(s0, ap, nissaNaturesArtisan(), "graveyard");
    const land = s0.players[ap]!.library.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    const before = shuffles(s0, ap);
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }), { me: ap });
    expect(zone(s, land)).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
    expect(shuffles(s, ap)).toBe(before);
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    expect((s.pending as { cards?: string[] }).cards ?? []).not.toContain(land);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [nissa] }));
    expect(zone(s, nissa)).toBe("hand");
    expect(shuffles(s, ap)).toBe(before + 1);
  });

  it("Boonweaver Giant: an Aura from your graveyard, hand and/or library attached to it; one that can't enchant it stays where it is (rulings)", () => {
    const { s: s0, ap, ids } = setup([boonweaverGiant(), pacifism()]);
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "searchZones" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "graveyard" }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [ids[1]] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(s.objects[ids[1]!]!.attachedTo).toBe(ids[0]);
    // Wild Growth (enchant land) can't enchant the Giant.
    const t0 = setup([boonweaverGiant()]);
    const growth = toZone(t0.s, t0.ap, wildGrowth(), "graveyard");
    let t = settle(castNow(t0.s, t0.ap, t0.ids[0]!), { me: t0.ap });
    if (t.pending?.kind === "chooseMay") t = settle(act(t, { type: "chooseMay", player: t0.ap, yes: true }), { me: t0.ap });
    if (t.pending?.kind === "chooseOption") t = settle(act(t, { type: "chooseOption", player: t0.ap, choice: "graveyard" }), { me: t0.ap });
    if (t.pending?.kind === "searchLibrary") t = settle(act(t, { type: "searchLibrary", player: t0.ap, found: [growth] }));
    expect(zone(t, growth)).toBe("graveyard");
  });

  it("Runed Crown: a Rune card attached to the Equipment (CR 303.4f)", () => {
    const { s: s0, ap, ids } = setup([runedCrown()]);
    const rune = toZone(s0, ap, runeOfFlight(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    if (s.pending?.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: "graveyard" }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [rune] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [rune] }));
    expect(zone(s, rune)).toBe("battlefield");
    expect(s.objects[rune]!.attachedTo).toBe(ids[0]);
  });
  it("Enduring Sliver: other Slivers you control have outlast {2}, an activated ability of their own (CR 702.107a)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, enduringSliver());
    const sliver = putOnBattlefield(s0, ap, card("Test Sliver", "Creature — Sliver", "{1}", { power: "1", toughness: "1" }));
    const theirs = putOnBattlefield(s0, opp, card("Their Sliver", "Creature — Sliver", "{1}", { power: "1", toughness: "1" }));
    const i = abIndex(s0, sliver, /^Outlast \{2\}/);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(abIndex(s0, theirs, /^Outlast/)).toBe(-1);
    let s = settle(activateNow(s0, ap, sliver, i));
    expect(s.objects[sliver]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[sliver]!.tapped).toBe(true);
    // Only as a sorcery.
    s = passUntil(s, "beginCombat");
    const again = putOnBattlefield(s, ap, card("Other Sliver", "Creature — Sliver", "{1}", { power: "1", toughness: "1" }));
    expect(abilityProblem(s, ap, again, abIndex(s, again, /^Outlast/))).toMatch(/sorcery/);
  });

  it("Knight of Wundagore: whenever you put a +1/+1 counter on another creature, a +1/+1 counter on it, only once each turn", () => {
    const { s: s0, ap } = setup([]);
    const knight = putOnBattlefield(s0, ap, knightOfWundagore());
    putOnBattlefield(s0, ap, enduringSliver());
    const a = putOnBattlefield(s0, ap, card("Test Sliver", "Creature — Sliver", "{1}", { power: "1", toughness: "1" }));
    const b = putOnBattlefield(s0, ap, card("Other Sliver", "Creature — Sliver", "{1}", { power: "1", toughness: "1" }));
    let s = settle(activateNow(s0, ap, a, abIndex(s0, a, /^Outlast/)));
    expect(s.objects[knight]!.counters["+1/+1"]).toBe(1);
    s = settle(activateNow(s, ap, b, abIndex(s, b, /^Outlast/)));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[knight]!.counters["+1/+1"]).toBe(1);
  });

  it("Mysterious Pathlighter: each creature you control that has an Adventure enters with an additional +1/+1 counter (rulings)", () => {
    const { s: s0, ap, ids } = setup([bonecrusherGiant(), bear()]);
    putOnBattlefield(s0, ap, mysteriousPathlighter());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    s = settle(castNow(s, ap, ids[1]!));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Rootwater Shaman: Aura spells with enchant creature as though they had flash, not other enchant abilities", () => {
    const { s: s0, ap, opp, ids } = setup([pacifism(), mantleOfTheAncients(), wildGrowth()]);
    const b = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    const forestId = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    let s = passUntil(s0, "beginCombat");
    expect(planCast(s, ap, ids[0]!, [tgt(b)])).toBeNull();
    putOnBattlefield(s, ap, rootwaterShaman());
    expect(planCast(s, ap, ids[0]!, [tgt(b)])).not.toBeNull();
    expect(planCast(s, ap, ids[1]!, [tgt(mine)])).toBeNull();
    expect(planCast(s, ap, ids[2]!, [tgt(forestId)])).toBeNull();
    s = settle(castNow(s, ap, ids[0]!, [tgt(b)]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
  });

  it("Rootwater Shaman: a creature cast bestowed is an Aura spell with enchant creature, so it has flash; cast as a creature it doesn't (CR 702.103b, d)", () => {
    const { s: s0, ap, opp, ids } = setup([nyxbornShieldmate()]);
    const b = putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, ap, rootwaterShaman());
    const s = passUntil(s0, "beginCombat");
    poolOnly(s, ap, { W: 1, C: 2 });
    expect(planCast(s, ap, ids[0]!, [], undefined, "auto")).toBeNull();
    expect(planCast(s, ap, ids[0]!, [tgt(b)], undefined, "auto", undefined, { alt: "bestow" })).not.toBeNull();
    const t = settle(castNow(s, ap, ids[0]!, [tgt(b)], { alt: "bestow" }));
    expect(t.objects[ids[0]!]!.attachedTo).toBe(b);
  });

  it("Moon Girl and Devil Dinosaur: on your second card drawn each turn, base 6/6 and trample until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, moonGirlAndDevilDinosaur());
    const drawn = s0.players[ap]!.draws?.turn === s0.turn ? s0.players[ap]!.draws!.n : 0;
    let s = s0;
    for (let i = drawn; i < 1; i++) {
      draw(s, ap, 1);
      s = settle(s);
    }
    const printed = pt(s, m);
    draw(s, ap, 1);
    s = settle(s);
    expect(pt(s, m)).toBe("6/6");
    expect(objHasKeyword(s, s.objects[m]!, "Trample")).toBe(true);
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(pt(s, m)).toBe(printed);
    expect(objHasKeyword(s, s.objects[m]!, "Trample")).toBe(false);
  });

  it("Eye of Jace: upkeep surveil 1, then with seven or more cards in your graveyard it's sacrificed, 2 damage to each opponent, 2 life", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const eye = putOnBattlefield(s0, ap, eyeOfJace());
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s);
    expect(zone(s, eye)).toBe("battlefield");
    const lives = others(s, ap).map((p) => life(s, p));
    s = passUntil(s, "draw");
    for (let i = 0; i < 7; i++) toZone(s, ap, bear(), "graveyard");
    s = passUntil(s, "upkeep", ap);
    const mine = life(s, ap);
    s = settle(s);
    expect(zone(s, eye)).toBe("graveyard");
    expect(others(s, ap).map((p) => life(s, p))).toEqual(lives.map((l) => l - 2));
    expect(life(s, ap)).toBe(mine + 2);
  });
  it("Social Snub: cast while you control a creature, you may copy it; without one, no copy", () => {
    const { s: s0, ap, ids } = setup([socialSnub()]);
    putOnBattlefield(s0, ap, bear());
    const lives = others(s0, ap).map((p) => life(s0, p));
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(others(s, ap).map((p) => life(s, p))).toEqual(lives.map((l) => l - 2));
    const t0 = setup([socialSnub()]);
    const lives2 = others(t0.s, t0.ap).map((p) => life(t0.s, p));
    const t = settle(castNow(t0.s, t0.ap, t0.ids[0]!));
    expect(others(t, t0.ap).map((p) => life(t, p))).toEqual(lives2.map((l) => l - 1));
  });

  it("Eldrazi Obligator: as it's cast, you may pay {1}{C}: gain control of target creature until end of turn, untap it, haste", () => {
    const { s: s0, ap, opp, ids } = setup([eldraziObligator()]);
    const b = putOnBattlefield(s0, opp, bear(), { sick: true });
    s0.objects[b]!.tapped = true;
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // {C} needs colorless mana: the lands here make only colored.
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
  });

  it("Yasova Dragonclaw: pay {1}{U/R}{U/R} at your beginning of combat to take a creature with less power than hers until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const y = putOnBattlefield(s0, ap, yasovaDragonclaw());
    const small = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, card("Big Test", "Creature — Giant", "{4}", { power: String(power(s0, s0.objects[y]!)), toughness: "4" }));
    let s = passUntil(s0, "beginCombat");
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] })).toThrow();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 2, C: 1 };
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(small)] }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    expect(controllerOf(s, s.objects[small]!)).toBe(ap);
    expect(objHasKeyword(s, s.objects[small]!, "Haste")).toBe(true);
  });

  it("Lithoform Blight: the enchanted land loses its land types and abilities, keeping basic, and has the two mana abilities (CR 305.7)", () => {
    const { s: s0, ap } = setup([]);
    const f = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    const blight = putOnBattlefield(s0, ap, lithoformBlight());
    s0.objects[blight]!.attachedTo = f;
    invalidateCharacteristics(s0);
    const c = characteristics(s0, s0.objects[f]!);
    expect(c.types).toEqual(["Land"]);
    expect(c.subtypes).not.toContain("Forest");
    expect(c.supertypes).toContain("Basic");
    const texts = abilitiesOf(s0, s0.objects[f]!).mana.map((m) => m.text);
    expect(texts).toHaveLength(2);
    expect(texts.join("|")).toMatch(/Add \{C\}/);
    expect(texts.join("|")).toMatch(/Pay 1 life/);
  });

  it("Enormous Energy Blade: whenever it becomes attached to a creature, tap that creature", () => {
    const { s: s0, ap } = setup([]);
    const blade = putOnBattlefield(s0, ap, enormousEnergyBlade());
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(activateNow(s0, ap, blade, abIndex(s0, blade, /^Equip/), [tgt(b)]));
    expect(s.objects[blade]!.attachedTo).toBe(b);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(pt(s, b)).toBe("6/2");
  });
  it("Shield of the Righteous: the creature equipped creature blocks doesn't untap during its controller's next untap step (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const attacker = putOnBattlefield(s0, ap, card("Tough Test", "Creature — Beast", "{2}", { power: "1", toughness: "5" }));
    const other = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear());
    const shield = putOnBattlefield(s0, opp, shieldOfTheRighteous());
    s0.objects[shield]!.attachedTo = blocker;
    invalidateCharacteristics(s0);
    let s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }, { attacker: other, defender: others(s, ap)[1]! }] });
    for (let i = 0; i < 400 && s.step !== "end"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: p.player === opp ? [{ blocker, attacker }] : [] });
      else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[attacker]!.tapped).toBe(true);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    expect(s.objects[attacker]!.tapped).toBe(true);
    expect(s.objects[other]!.tapped).toBe(false);
  });

  it("Astral Confrontation: {1} less for each opponent you're attacking, the players themselves", () => {
    const { s: s0, ap, ids } = setup([astralConfrontation()]);
    const [o1, o2] = others(s0, ap);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const target = putOnBattlefield(s0, o1!, bear());
    let s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers");
    const both = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1! }, { attacker: b, defender: o2! }] });
    const one = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1! }, { attacker: b, defender: o1! }] });
    const after = (x: GameState) => goUntil(x, (y) => y.step === "declareAttackers" && !y.pending && waitingOn(y) === ap);
    s = after(both);
    poolOnly(s, ap, { W: 1, C: 2 });
    expect(planCast(s, ap, ids[0]!, [tgt(target)])).not.toBeNull();
    const t = after(one);
    poolOnly(t, ap, { W: 1, C: 2 });
    expect(planCast(t, ap, ids[0]!, [tgt(target)])).toBeNull();
    t.players[ap]!.manaPool.C = 3;
    expect(planCast(t, ap, ids[0]!, [tgt(target)])).not.toBeNull();
  });

  it("Adamaro, First to Desire: power and toughness equal to the biggest opponent's hand", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, adamaroFirstToDesire());
    const [o1, o2, o3] = others(s, ap);
    for (const p of [o1!, o2!, o3!]) emptyHand(s, p);
    for (let i = 0; i < 4; i++) toZone(s, o2!, bear(), "hand");
    toZone(s, o3!, bear(), "hand");
    for (let i = 0; i < 6; i++) toZone(s, ap, bear(), "hand");
    expect(pt(s, m)).toBe("4/4");
    emptyHand(s, o2!);
    expect(pt(s, m)).toBe("1/1");
  });

  it("Rampaging Soulrager: +3/+0 with two or more unlocked doors among Rooms you control", () => {
    const { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, rampagingSoulrager());
    const base = power(s, s.objects[r]!);
    const room = putOnBattlefield(s, ap, bottomlessPool());
    const theirs = putOnBattlefield(s, opp, bottomlessPool());
    s.objects[theirs]!.unlocked = [0, 1];
    s.objects[room]!.unlocked = [0];
    invalidateCharacteristics(s);
    expect(power(s, s.objects[r]!)).toBe(base);
    s.objects[room]!.unlocked = [0, 1];
    invalidateCharacteristics(s);
    expect(power(s, s.objects[r]!)).toBe(base + 3);
  });

  it("Cleaving Reaper: back to your hand from your graveyard for 3 life, only if an Angel or Berserker entered under your control this turn (rulings)", () => {
    const { s: s0, ap, ids } = setup([serraAngel()]);
    const reaper = toZone(s0, ap, cleavingReaper(), "graveyard");
    expect(abilityProblem(s0, ap, reaper, 0)).not.toBeNull();
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(abilityProblem(s, ap, reaper, 0)).toBeNull();
    const before = life(s, ap);
    s = settle(activateNow(s, ap, reaper, 0));
    expect(zone(s, reaper)).toBe("hand");
    expect(life(s, ap)).toBe(before - 3);
  });
});

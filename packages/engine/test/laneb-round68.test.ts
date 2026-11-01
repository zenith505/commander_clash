// Lane B, round 68: the Words' draw shields chosen by the drawing player (CR 616.1), then unsupported cards from EDHREC
// rank about 19,700 up and the B10 and B11 lists (`npm run popular -- --least`): Tomorrow, Azami's Familiar, Dulcet
// Sirens, Uphill Battle, Skeletal Swarming, Possibility Technician, Soul Exchange, Raiding Schemes, Wort, the Raidmother,
// Rassilon, the War President, Behold the Unspeakable, Tesak, Judith's Hellhound and Niv-Mizzet, Supreme.

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { putCounters } from "../src/counters";
import { botActions, characteristics, conspireCandidates, controllerOf, draw, drawShields, graveyardWays, hasConspire, invalidateCharacteristics, isFullySupported, mayPlayFromExile, mustAttackPlayers, objHasKeyword, planActivate, planCast, power, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
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
    if (p?.kind === "declareAttackers") {
      // Attackers that must attack (Skeletal Swarming) attack as the bot would have them.
      try {
        s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      } catch {
        for (const a of botActions(s, pid)) s = act(s, a);
      }
    }
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = []) => run(s, planActivate(s, pid, id, index, targets));
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
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
/** A shield from a Words activation, as Words of Wilding and Words of Worship make them (Player.nextDrawInstead). */
const bearShield = (s: GameState) => ({ turn: s.turn, source: "Words of Wilding", token: { name: "Bear", power: 2, toughness: 2, colors: ["G" as const], types: ["Creature"], subtypes: ["Bear"], keywords: [] } });
const lifeShield = (s: GameState) => ({ turn: s.turn, source: "Words of Worship", gain: 5 });

// Real oracle text (Scryfall).
const wilding = (): CardDef => ({"oracleId":"888582df-4fe2-4d05-9b62-10c90aaa76f2","name":"Words of Wilding","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, create a 2/2 green Bear creature token instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fdb9565f-5b09-4127-b169-3146079dab84.jpg?1783945032","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fdb9565f-5b09-4127-b169-3146079dab84.jpg?1783945032","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const worship = (): CardDef => ({"oracleId":"f1fad5ab-d087-4912-b1b9-42733fa34707","name":"Words of Worship","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, you gain 5 life instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0ea5c6e0-8361-4214-997b-32a66b19fae9.jpg?1783945089","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0ea5c6e0-8361-4214-997b-32a66b19fae9.jpg?1783945089","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tomorrow = (): CardDef => ({"oracleId":"51d517c9-2812-44ce-ab4d-e5422b5ecf6c","name":"Tomorrow, Azami's Familiar","manaCost":"{5}{U}","cmc":6,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"If you would draw a card, look at the top three cards of your library instead. Put one of those cards into your hand and the rest on the bottom of your library in any order.","power":"1","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/095813f9-d559-40bd-a50f-7c1f6e494e60.jpg?1783944201","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/095813f9-d559-40bd-a50f-7c1f6e494e60.jpg?1783944201","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sirens = (): CardDef => ({"oracleId":"37c3cd4d-8e9a-46d4-a9c2-55f70a321eb6","name":"Dulcet Sirens","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Siren","supertypes":[],"types":["Creature"],"subtypes":["Siren"],"oracleText":"{U}, {T}: Target creature attacks target opponent this turn if able.\nMorph {U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/045e15fd-6e2b-40a9-89ba-2f4c9e445416.jpg?1783938871","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/045e15fd-6e2b-40a9-89ba-2f4c9e445416.jpg?1783938871","commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const uphill = (): CardDef => ({"oracleId":"349a18bf-5c61-4fe6-a5e5-5e7cad6b4ba6","name":"Uphill Battle","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures played by your opponents enter tapped.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73fa3455-3ba0-41ad-aefd-40f183aed2a6.jpg?1783945931","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73fa3455-3ba0-41ad-aefd-40f183aed2a6.jpg?1783945931","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const swarming = (): CardDef => ({"oracleId":"93ab7462-ceef-4bc7-a9fe-8af8ceb78e1c","name":"Skeletal Swarming","manaCost":"{3}{B}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each Skeleton you control has trample, attacks each combat if able, and gets +X/+0, where X is the number of other Skeletons you control.\nAt the beginning of your end step, create a tapped 1/1 black Skeleton creature token. If a creature died this turn, create two of those tokens instead.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/7/3768ac68-0d87-4f99-aa77-2d009df0a567.jpg?1783926443","artUrl":"https://cards.scryfall.io/art_crop/front/3/7/3768ac68-0d87-4f99-aa77-2d009df0a567.jpg?1783926443","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const technician = (): CardDef => ({"oracleId":"ebbf84f7-d142-4de5-bfc1-ea86f082d733","name":"Possibility Technician","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Kavu Artificer","supertypes":[],"types":["Creature"],"subtypes":["Kavu","Artificer"],"oracleText":"Whenever this creature or another Kavu you control enters, exile the top card of your library. For as long as that card remains exiled, you may play it if you control a Kavu.\nWarp {1}{R} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Warp"],"imageUrl":"https://cards.scryfall.io/normal/front/4/b/4b146c78-403f-48c8-941d-41114498bb89.jpg?1783905949","artUrl":"https://cards.scryfall.io/art_crop/front/4/b/4b146c78-403f-48c8-941d-41114498bb89.jpg?1783905949","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const soulExchange = (): CardDef => ({"oracleId":"366ea3b4-5e7e-4693-9f4b-1e549972609e","name":"Soul Exchange","manaCost":"{B}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, exile a creature you control.\nReturn target creature card from your graveyard to the battlefield. Put a +2/+2 counter on that creature if the exiled creature was a Thrull.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f73597d-f453-4d37-b2ef-c54ef683a884.jpg?1783947899","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f73597d-f453-4d37-b2ef-c54ef683a884.jpg?1783947899","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const schemes = (): CardDef => ({"oracleId":"854cac11-9a22-4dea-8c1b-c49a4858a754","name":"Raiding Schemes","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each noncreature spell you cast has conspire. (As you cast a noncreature spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose new targets for the copy. A copy of a permanent spell becomes a token.)","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0bab5da5-72a7-4340-9b53-492ab14a9f71.jpg?1783904405","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0bab5da5-72a7-4340-9b53-492ab14a9f71.jpg?1783904405","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wort = (): CardDef => ({"oracleId":"d6b67c7e-3b24-4f60-8e3a-c6ca45229d7f","name":"Wort, the Raidmother","manaCost":"{4}{R/G}{R/G}","cmc":6,"typeLine":"Legendary Creature — Goblin Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Shaman"],"oracleText":"When Wort enters, create two 1/1 red and green Goblin Warrior creature tokens.\nEach red or green instant or sorcery spell you cast has conspire. (As you cast the spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose new targets for the copy.)","power":"3","toughness":"3","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/535189ec-572f-44ed-9741-09b9f575fc40.jpg?1783942718","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/535189ec-572f-44ed-9741-09b9f575fc40.jpg?1783942718","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rassilon = (): CardDef => ({"oracleId":"ebec9957-b777-42ae-a394-85c7ed84d00a","name":"Rassilon, the War President","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Time Lord Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Noble"],"oracleText":"At the beginning of your upkeep, you lose 2 life and exile the top card of your library. You may play that card for as long as it remains exiled.\nEach noncreature spell you cast from exile has conspire. (As you cast that spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose new targets for the copy.)","power":"3","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/6/564120cb-dbe5-4a28-947c-d79ad3123152.jpg?1783914627","artUrl":"https://cards.scryfall.io/art_crop/front/5/6/564120cb-dbe5-4a28-947c-d79ad3123152.jpg?1783914627","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const behold = (): CardDef => ({"oracleId":"464372ef-0b16-4b8d-ba6f-fbf5c905c479","name":"Behold the Unspeakable // Vision of the Unspeakable","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Enchantment — Saga // Enchantment Creature — Spirit","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — Creatures you don't control get -2/-0 until your next turn.\nII — If you have one or fewer cards in hand, draw four cards. Otherwise, scry 2, then draw two cards.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry","Flying","Transform","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/e/4/e4d52701-e0dc-474e-b08f-88147200d210.jpg?1783923912","artUrl":"https://cards.scryfall.io/art_crop/front/e/4/e4d52701-e0dc-474e-b08f-88147200d210.jpg?1783923912","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Behold the Unspeakable","manaCost":"{3}{U}{U}","typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — Creatures you don't control get -2/-0 until your next turn.\nII — If you have one or fewer cards in hand, draw four cards. Otherwise, scry 2, then draw two cards.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/e/4/e4d52701-e0dc-474e-b08f-88147200d210.jpg?1783923912","artUrl":"https://cards.scryfall.io/art_crop/front/e/4/e4d52701-e0dc-474e-b08f-88147200d210.jpg?1783923912"},{"name":"Vision of the Unspeakable","manaCost":"","typeLine":"Enchantment Creature — Spirit","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Spirit"],"oracleText":"Flying, trample\nThis creature gets +1/+1 for each card in your hand.","power":"0","toughness":"0","colors":["U"],"colorIndicator":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/e/4/e4d52701-e0dc-474e-b08f-88147200d210.jpg?1783923912","artUrl":"https://cards.scryfall.io/art_crop/back/e/4/e4d52701-e0dc-474e-b08f-88147200d210.jpg?1783923912"}]}) as CardDef;
const tesak = (): CardDef => ({"oracleId":"4117e428-0c78-4dea-9019-dd1836fbb03e","name":"Tesak, Judith's Hellhound","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Creature — Elemental Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Dog"],"oracleText":"Unleash (You may have this creature enter with a +1/+1 counter on it. It can't block as long as it has a +1/+1 counter on it.)\nOther Dogs you control have unleash.\nCreatures you control with counters on them have haste.\nWhenever Tesak attacks, add {R} for each attacking creature.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Unleash"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0e563c13-7204-4cda-9b62-d46931fabcef.jpg?1783913042","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0e563c13-7204-4cda-9b62-d46931fabcef.jpg?1783913042","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nivSupreme = (): CardDef => ({"oracleId":"4c3a865a-88b1-43e0-b326-17c45670da54","name":"Niv-Mizzet, Supreme","manaCost":"{W}{U}{B}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Dragon Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon","Avatar"],"oracleText":"Flying, hexproof from monocolored\nEach instant and sorcery card in your graveyard that's exactly two colors has jump-start. (You may cast that card from your graveyard by discarding a card in addition to paying its other costs. Then exile it.)","power":"5","toughness":"5","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Flying","Hexproof from","Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/07f469c3-d50c-4066-8f46-75ce3c3f1616.jpg?1783916460","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/07f469c3-d50c-4066-8f46-75ce3c3f1616.jpg?1783916460","commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const urabrask = (): CardDef => ({"oracleId":"3fe61a65-b1c0-4d15-b379-e4ce22c96941","name":"Urabrask, Heretic Praetor","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Legendary Creature — Phyrexian Praetor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Phyrexian","Praetor"],"oracleText":"Haste\nAt the beginning of your upkeep, exile the top card of your library. You may play it this turn.\nAt the beginning of each opponent's upkeep, the next time they would draw a card this turn, instead they exile the top card of their library. They may play it this turn.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/1/2/1269764e-cc05-4487-a75b-be8012287a80.jpg?1783922972","artUrl":"https://cards.scryfall.io/art_crop/front/1/2/1269764e-cc05-4487-a75b-be8012287a80.jpg?1783922972","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const helix = (): CardDef => ({"oracleId":"800c258a-cfc4-4a54-a667-065ea8dea69e","name":"Lightning Helix","manaCost":"{R}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Helix deals 3 damage to any target and you gain 3 life.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/4101e3fe-b0e7-4f0f-b9ac-9b61a4d628b3.jpg?1783912843","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/4101e3fe-b0e7-4f0f-b9ac-9b61a4d628b3.jpg?1783912843","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const basalThrull = (): CardDef => ({"oracleId":"9da50130-3f83-4968-983c-7dcba257cf1b","name":"Basal Thrull","manaCost":"{B}{B}","cmc":2,"typeLine":"Creature — Thrull","supertypes":[],"types":["Creature"],"subtypes":["Thrull"],"oracleText":"{T}, Sacrifice this creature: Add {B}{B}.","power":"1","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c1d5d13-0160-48cb-8fac-dd86102569b4.jpg?1783947904","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c1d5d13-0160-48cb-8fac-dd86102569b4.jpg?1783947904","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const kavuClimber = (): CardDef => ({"oracleId":"91320afd-1d42-4cb5-ae40-4eed2fa91dfe","name":"Kavu Climber","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Kavu","supertypes":[],"types":["Creature"],"subtypes":["Kavu"],"oracleText":"When this creature enters, draw a card.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/da95f41d-ad5a-4861-94e2-a564dbf4f3c9.jpg?1783935129","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/da95f41d-ad5a-4861-94e2-a564dbf4f3c9.jpg?1783935129","commanderLegal":"legal","set":"a25","releasedAt":"2018-03-16","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const drudge = (): CardDef => ({"oracleId":"c180ed02-07f4-4538-9bea-8c249234a8e2","name":"Drudge Skeletons","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Skeleton","supertypes":[],"types":["Creature"],"subtypes":["Skeleton"],"oracleText":"{B}: Regenerate this creature. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Heal","Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/425836be-f5cd-4584-a2ff-a8cf166eccc0.jpg?1783942382","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/425836be-f5cd-4584-a2ff-a8cf166eccc0.jpg?1783942382","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const raiseAlarm = (): CardDef => ({"oracleId":"5b2364d7-a811-4595-a1b4-224c70555ffa","name":"Raise the Alarm","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Create two 1/1 white Soldier creature tokens.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const loyalWarhound = (): CardDef => ({"oracleId":"cc6a83c7-e645-4a53-9550-be79b42cd851","name":"Loyal Warhound","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Dog","supertypes":[],"types":["Creature"],"subtypes":["Dog"],"oracleText":"Vigilance\nWhen this creature enters, if an opponent controls more lands than you, search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.","power":"3","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/1/d/1d01ce54-3f64-465e-835a-27c55753926b.jpg?1783910703","artUrl":"https://cards.scryfall.io/art_crop/front/1/d/1d01ce54-3f64-465e-835a-27c55753926b.jpg?1783910703","commanderLegal":"legal","set":"blc","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ponder = (): CardDef => ({"oracleId":"02090581-61aa-4348-ad57-451be8ee91c2","name":"Ponder","manaCost":"{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8cbab1d1-25cb-456f-8d1c-3d64eb7265ea.jpg?1783909642","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8cbab1d1-25cb-456f-8d1c-3d64eb7265ea.jpg?1783909642","commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const purebloods = (): CardDef => ({"oracleId":"cf8aef54-3f43-413c-9f3f-d4a1b2090904","name":"Thraben Purebloods","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Dog","supertypes":[],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"3","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16db28f4-3d96-42f5-a264-592fdc2d4196.jpg?1783940983","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16db28f4-3d96-42f5-a264-592fdc2d4196.jpg?1783940983","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ragingKavu = (): CardDef => ({"oracleId":"d126bb08-be60-4046-91f1-65672ef42c63","name":"Raging Kavu","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Creature — Kavu","supertypes":[],"types":["Creature"],"subtypes":["Kavu"],"oracleText":"Flash\nHaste","power":"3","toughness":"1","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Haste","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/27573679-e9e5-4bfc-b5d5-85d4648b01b6.jpg?1783945659","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/27573679-e9e5-4bfc-b5d5-85d4648b01b6.jpg?1783945659","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("Lane B round 68", () => {
  it("are fully supported", () => {
    supported(tomorrow(), sirens(), uphill(), swarming(), technician(), soulExchange(), schemes(), wort(), rassilon(), behold(), tesak(), nivSupreme());
  });

  it("The Words: with two different shields waiting, the drawing player chooses which replaces the draw (CR 616.1); the other waits", () => {
    const { s: s0, ap } = setup([]);
    const ww = putOnBattlefield(s0, ap, wilding());
    const wo = putOnBattlefield(s0, ap, worship());
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, C: 2 };
    let s = settle(activateNow(s0, ap, ww, 0));
    s = settle(activateNow(s, ap, wo, 0));
    expect(s.players[ap]!.nextDrawInstead).toHaveLength(2);
    const hand = s.players[ap]!.hand.length;
    const before = life(s, ap);
    expect(draw(s, ap, 1)).toBe(false);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap, left: 0 });
    const pend = s.pending as Extract<GameState["pending"], { kind: "drawInstead" }>;
    expect(pend.labels).toEqual(["Create a 2/2 Bear token (Words of Wilding)", "Gain 5 life (Words of Worship)"]);
    expect(() => act(s, { type: "drawInstead", player: ap, choice: "exile" })).toThrow();
    // The life now; the Bear waits for the next draw.
    s = act(s, { type: "drawInstead", player: ap, choice: pend.options[1]! });
    expect(life(s, ap)).toBe(before + 5);
    expect(tokensNamed(s, ap, "Bear")).toHaveLength(0);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.nextDrawInstead).toHaveLength(1);
    // One kind left: no question.
    expect(draw(s, ap, 1)).toBe(true);
    expect(s.pending).toBeFalsy();
    expect(tokensNamed(s, ap, "Bear")).toHaveLength(1);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("The Words: two shields of the same kind ask nothing; in a draw of several, the choice comes first and the rest go on", () => {
    const { s, ap } = setup([]);
    s.players[ap]!.nextDrawInstead = [bearShield(s), bearShield(s)];
    expect(drawShields(s, ap)).toHaveLength(1);
    expect(draw(s, ap, 1)).toBe(true);
    expect(tokensNamed(s, ap, "Bear")).toHaveLength(1);
    // Two kinds and three draws: the first asks, the second takes the other shield, the third is a draw.
    s.players[ap]!.nextDrawInstead = [lifeShield(s), bearShield(s)];
    const hand = s.players[ap]!.hand.length;
    const before = life(s, ap);
    expect(draw(s, ap, 3)).toBe(false);
    expect(s.pending).toMatchObject({ kind: "drawInstead", left: 2 });
    const s2 = act(s, { type: "drawInstead", player: ap, choice: "words:1" });
    expect(tokensNamed(s2, ap, "Bear")).toHaveLength(2);
    expect(life(s2, ap)).toBe(before + 5);
    expect(s2.players[ap]!.hand.length).toBe(hand + 1);
    expect(s2.players[ap]!.nextDrawInstead).toBeUndefined();
  });

  it("Urabrask, Heretic Praetor's shield and a Words' shield: the drawing player chooses; then the other applies", () => {
    const { s, ap, opp } = setup([]);
    s.players[ap]!.nextDrawExiles = [{ turn: s.turn, source: "Urabrask, Heretic Praetor" }];
    s.players[ap]!.nextDrawInstead = [lifeShield(s)];
    const top = s.players[ap]!.library[0]!;
    expect(draw(s, ap, 1)).toBe(false);
    expect(s.pending).toMatchObject({ kind: "drawInstead", options: ["exile", "words:0"] });
    let s2 = act(s, { type: "drawInstead", player: ap, choice: "words:0" });
    expect(zone(s2, top)).toBe("library");
    expect(draw(s2, ap, 1)).toBe(true);
    expect(zone(s2, top)).toBe("exile");
    expect(mayPlayFromExile(s2, s2.objects[top]!, ap)).toBe(true);
    // A bot takes its own Words over Urabrask's exile, the token at a healthy life total and the life when it's low.
    s.players[opp]!.nextDrawExiles = [{ turn: s.turn, source: "Urabrask, Heretic Praetor" }];
    s.players[opp]!.nextDrawInstead = [lifeShield(s), bearShield(s)];
    s2 = structuredClone(s);
    s2.pending = null;
    expect(draw(s2, opp, 1)).toBe(false);
    expect(botActions(s2, opp)).toEqual([{ type: "drawInstead", player: opp, choice: "words:1" }]);
    s2.players[opp]!.life = 6;
    expect(botActions(s2, opp)).toEqual([{ type: "drawInstead", player: opp, choice: "words:0" }]);
  });

  it("The Words: the draw step's draw asks too, and the turn goes on once it's answered", () => {
    const { s: s0, ap } = setup([]);
    for (const p of s0.players) emptyHand(s0, p.id);
    let s = goUntil(s0, (x) => x.activePlayer !== ap && x.step === "upkeep");
    const nextP = s.activePlayer;
    s = goUntil(s, (x) => x.activePlayer === nextP && x.step === "upkeep" && !x.stack.length && !x.pending);
    s.players[nextP]!.nextDrawInstead = [lifeShield(s), bearShield(s)];
    for (let i = 0; i < 50 && s.pending?.kind !== "drawInstead"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: nextP, after: "drawStep" });
    s = act(s, { type: "drawInstead", player: nextP, choice: "words:1" });
    expect(s.step).toBe("draw");
    expect(tokensNamed(s, nextP, "Bear")).toHaveLength(1);
    expect(s.players[nextP]!.hand.length).toBe(0);
  });

  it("Tomorrow, Azami's Familiar: each draw is a look at three, one kept, the rest on the bottom in any order", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, tomorrow());
    const [a, b, c, d] = s0.players[ap]!.library.slice(0, 4) as [ObjectId, ObjectId, ObjectId, ObjectId];
    const hand = s0.players[ap]!.hand.length;
    let s = s0;
    expect(draw(s, ap, 2)).toBe(false);
    expect(s.pending).toMatchObject({ kind: "drawLook", keep: true, bottom: true, cards: [a, b, c], left: 1 });
    s = act(s, { type: "drawLook", player: ap, objectId: b });
    expect(zone(s, b)).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "orderLibrary", bottom: true });
    s = act(s, { type: "orderLibrary", player: ap, order: [c, a] });
    // The second draw: the new top three.
    expect(s.pending).toMatchObject({ kind: "drawLook", keep: true, cards: [d, s.players[ap]!.library[1], s.players[ap]!.library[2]] });
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([a, c].sort());
    s = act(s, { type: "drawLook", player: ap, objectId: d });
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[ap]!.graveyard).toHaveLength(0);
    // An empty library: nothing happens, no loss for drawing from it (rulings).
    const s2 = structuredClone(s);
    for (const id of s2.players[ap]!.library.splice(0)) s2.objects[id]!.zone = "exile";
    draw(s2, ap, 1);
    expect(s2.pending).toBeFalsy();
    expect(s2.players[ap]!.drewFromEmptyLibrary).toBe(false);
  });

  it("Dulcet Sirens: the target creature attacks the target opponent this turn if able, not you", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const ds = putOnBattlefield(s0, ap, sirens());
    const theirs = putOnBattlefield(s0, opp, purebloods());
    poolOnly(s0, ap, { U: 1 });
    expect(planActivate(s0, ap, ds, 0, [tgt(theirs), ply(ap)])).toBeNull();
    const s = settle(activateNow(s0, ap, ds, 0, [tgt(theirs), ply(third)]));
    expect(mustAttackPlayers(s, s.objects[theirs]!)).toEqual([third]);
    expect(s.objects[ds]!.tapped).toBe(true);
  });

  it("Uphill Battle: creature spells your opponents cast enter tapped; their tokens and your creatures don't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, uphill());
    for (const p of s0.players) emptyHand(s0, p.id);
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "main1" && !x.stack.length && !x.pending);
    const pb = toZone(s, opp, purebloods(), "hand");
    const alarm = toZone(s, opp, raiseAlarm(), "hand");
    poolOnly(s, opp, { W: 7 });
    s = settle(castNow(s, opp, pb));
    expect(zone(s, pb)).toBe("battlefield");
    expect(s.objects[pb]!.tapped).toBe(true);
    s = settle(castNow(s, opp, alarm));
    const soldiers = tokensNamed(s, opp, "Soldier");
    expect(soldiers).toHaveLength(2);
    expect(soldiers.every((id) => !s.objects[id]!.tapped)).toBe(true);
    // Yours: untapped.
    const { s: s1, ap: me } = setup([]);
    putOnBattlefield(s1, me, uphill());
    const mine = toZone(s1, me, purebloods(), "hand");
    poolOnly(s1, me, { W: 5 });
    const s2 = settle(castNow(s1, me, mine));
    expect(s2.objects[mine]!.tapped).toBe(false);
  });

  it("Skeletal Swarming: each Skeleton you control has trample, attacks each combat if able and gets +1/+0 for each other Skeleton; the end step makes one or two", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, ap, swarming());
    const d1 = putOnBattlefield(s0, ap, drudge());
    const d2 = putOnBattlefield(s0, ap, drudge());
    const theirs = putOnBattlefield(s0, opp, drudge());
    invalidateCharacteristics(s0);
    expect(power(s0, s0.objects[d1]!)).toBe(2);
    expect(objHasKeyword(s0, s0.objects[d1]!, "Trample")).toBe(true);
    expect(characteristics(s0, s0.objects[d2]!).attacksIfAble).toBeTruthy();
    expect(power(s0, s0.objects[theirs]!)).toBe(1);
    expect(objHasKeyword(s0, s0.objects[theirs]!, "Trample")).toBe(false);
    expect(zone(s0, sw)).toBe("battlefield");
    // Your end step, nothing died: one tapped Skeleton.
    for (const p of s0.players) emptyHand(s0, p.id);
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "end" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    const made = tokensNamed(s, ap, "Skeleton");
    expect(made).toHaveLength(1);
    expect(s.objects[made[0]!]!.tapped).toBe(true);
    expect(power(s, s.objects[d1]!)).toBe(3);
    // A creature died this turn: two.
    const { s: s1, ap: me } = setup([]);
    putOnBattlefield(s1, me, swarming());
    for (const p of s1.players) emptyHand(s1, p.id);
    s1.turnLog = { ...(s1.turnLog ?? {}), creatureDied: true } as GameState["turnLog"];
    const died = putOnBattlefield(s1, me, purebloods());
    s = run(s1, [{ type: "passPriority", player: waitingOn(s1)! }]);
    s.objects[died]!.damage = 9;
    invalidateCharacteristics(s);
    s = goUntil(s, (x) => x.activePlayer === me && x.step === "end" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, died)).toBe("graveyard");
    expect(tokensNamed(s, me, "Skeleton")).toHaveLength(2);
  });

  it("Possibility Technician: the exiled card may be played while you control a Kavu, even after the Technician is gone", () => {
    const { s: s0, ap } = setup([]);
    const t = toZone(s0, ap, technician(), "hand");
    const top = toZone(s0, ap, shock(), "library");
    poolOnly(s0, ap, { R: 5 });
    let s = settle(castNow(s0, ap, t));
    expect(zone(s, top)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    // No Kavu: not now.
    s.battlefield.splice(s.battlefield.indexOf(t), 1);
    s.objects[t]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(t);
    invalidateCharacteristics(s);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
    // Another Kavu: again (rulings).
    putOnBattlefield(s, ap, ragingKavu());
    invalidateCharacteristics(s);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
  });

  it("Soul Exchange: the creature returns, with a +2/+2 counter only if the creature exiled to cast it was a Thrull", () => {
    for (const thrull of [true, false]) {
      const { s: s0, ap } = setup([]);
      const se = toZone(s0, ap, soulExchange(), "hand");
      const back = toZone(s0, ap, purebloods(), "graveyard");
      const fodder = putOnBattlefield(s0, ap, thrull ? basalThrull() : drudge());
      poolOnly(s0, ap, { B: 2 });
      const s1 = castNow(s0, ap, se, [tgt(back)], { sacrifice: [fodder] });
      const s = settle(s1);
      expect(zone(s, fodder)).toBe("exile");
      expect(zone(s, back)).toBe("battlefield");
      expect(s.objects[back]!.counters?.["+2/+2"] ?? 0).toBe(thrull ? 1 : 0);
    }
  });

  it("Raiding Schemes: your noncreature spells have conspire; creature spells and other players' spells don't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, schemes());
    const g1 = putOnBattlefield(s0, ap, ragingKavu());
    const g2 = putOnBattlefield(s0, ap, ragingKavu());
    const b = toZone(s0, ap, bolt(), "hand");
    const k = toZone(s0, ap, ragingKavu(), "hand");
    const theirs = toZone(s0, opp, bolt(), "hand");
    expect(hasConspire(s0, ap, s0.objects[b]!)).toBe(true);
    expect(hasConspire(s0, ap, s0.objects[k]!)).toBe(false);
    expect(hasConspire(s0, opp, s0.objects[theirs]!)).toBe(false);
    expect(conspireCandidates(s0, ap, b).sort()).toEqual([g1, g2].sort());
    poolOnly(s0, ap, { R: 1 });
    let s = castNow(s0, ap, b, [ply(opp)], { conspire: [g1, g2] });
    expect(s.objects[g1]!.tapped && s.objects[g2]!.tapped).toBe(true);
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [ply(opp)] }));
    expect(life(s, opp)).toBe(40 - 6);
  });

  it("Wort, the Raidmother: only red or green instant and sorcery spells have conspire; without Wort as it's cast, no copy (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wort());
    const b = toZone(s0, ap, bolt(), "hand");
    const p = toZone(s0, ap, ponder(), "hand");
    const k = toZone(s0, ap, ragingKavu(), "hand");
    expect(hasConspire(s0, ap, s0.objects[b]!)).toBe(true);
    expect(hasConspire(s0, ap, s0.objects[p]!)).toBe(false);
    expect(hasConspire(s0, ap, s0.objects[k]!)).toBe(false);
    // The two Goblin Warriors it made aren't here (put onto the battlefield): two red creatures of ours.
    const g1 = putOnBattlefield(s0, ap, ragingKavu());
    const g2 = putOnBattlefield(s0, ap, ragingKavu());
    poolOnly(s0, ap, { R: 1 });
    let s = castNow(s0, ap, b, [ply(opp)], { conspire: [g1, g2] });
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "copyTargets" });
    // Wort gone before the spell becomes cast: the conspire trigger checks the spell still has it.
    const s1 = structuredClone(s0);
    s1.battlefield.splice(s1.battlefield.indexOf(w), 1);
    s1.objects[w]!.zone = "graveyard";
    s1.players[ap]!.graveyard.push(w);
    invalidateCharacteristics(s1);
    expect(hasConspire(s1, ap, s1.objects[b]!)).toBe(false);
    expect(planCast(s1, ap, b, [ply(opp)], undefined, "auto", undefined, { conspire: [g1, g2] })).toBeNull();
  });

  it("Rassilon, the War President: your upkeep exiles the top card to play; noncreature spells cast from exile have conspire", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, rassilon());
    const inExile = toZone(s0, ap, bolt(), "exile");
    s0.objects[inExile]!.mayPlay = { player: ap, zc: s0.objects[inExile]!.zoneChanges ?? 0, until: "exiled", turn: s0.turn };
    const inHand = toZone(s0, ap, bolt(), "hand");
    const kavuInExile = toZone(s0, ap, ragingKavu(), "exile");
    expect(hasConspire(s0, ap, s0.objects[inExile]!)).toBe(true);
    expect(hasConspire(s0, ap, s0.objects[inHand]!)).toBe(false);
    expect(hasConspire(s0, ap, s0.objects[kavuInExile]!)).toBe(false);
    // Its upkeep trigger: 2 life and the top card.
    for (const p of s0.players) emptyHand(s0, p.id);
    const top = s0.players[ap]!.library[0]!;
    const before = life(s0, ap);
    let s = goUntil(s0, (x) => x.activePlayer !== ap && x.step === "upkeep");
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep" && !x.stack.length && !x.triggerQueue.length && !x.pending && x.turn > s0.turn);
    expect(life(s, ap)).toBe(before - 2);
    expect(zone(s, top)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    expect(opp).not.toBe(ap);
  });

  it("Behold the Unspeakable, chapter II: four cards with one or fewer in hand; otherwise scry 2, then draw two", () => {
    for (const few of [true, false]) {
      const { s: s0, ap } = setup([]);
      emptyHand(s0, ap);
      if (!few) for (let i = 0; i < 3; i++) toZone(s0, ap, ponder(), "hand");
      const saga = putOnBattlefield(s0, ap, behold());
      s0.objects[saga]!.counters = { lore: 1 };
      const hand = s0.players[ap]!.hand.length;
      putCounters(s0, s0.objects[saga]!, "lore", 1);
      let s = settle(s0, { me: ap });
      if (!few) {
        expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
        expect(s.players[ap]!.hand.length).toBe(hand);
        s = settle(s);
      }
      expect(s.players[ap]!.hand.length).toBe(hand + (few ? 4 : 2));
    }
  });

  it("Tesak, Judith's Hellhound: another Dog you cast may enter with a +1/+1 counter, and can't block with it", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, tesak());
    const dog = toZone(s0, ap, purebloods(), "hand");
    const kavu = toZone(s0, ap, ragingKavu(), "hand");
    poolOnly(s0, ap, { W: 5, R: 2, G: 1 });
    let s = settle(castNow(s0, ap, dog), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "unleash" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "+1/+1 counter" }));
    expect(s.objects[dog]!.counters?.["+1/+1"]).toBe(1);
    expect(characteristics(s, s.objects[dog]!).cantBlock).toBe(true);
    // Haste from Tesak's other ability, with that counter.
    expect(objHasKeyword(s, s.objects[dog]!, "Haste")).toBe(true);
    // Not a Dog: no choice.
    s = settle(castNow(s, ap, kavu), { me: ap });
    expect(zone(s, kavu)).toBe("battlefield");
    expect(s.objects[kavu]!.counters?.["+1/+1"] ?? 0).toBe(0);
  });

  it("Niv-Mizzet, Supreme: instants and sorceries in your graveyard that are exactly two colors have jump-start", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, nivSupreme());
    const h = toZone(s0, ap, helix(), "graveyard");
    const b = toZone(s0, ap, bolt(), "graveyard");
    const theirs = toZone(s0, opp, helix(), "graveyard");
    const discard = toZone(s0, ap, ponder(), "hand");
    expect(graveyardWays(s0, s0.objects[h]!).map((w) => w.kind)).toEqual(["jumpStart"]);
    expect(graveyardWays(s0, s0.objects[b]!)).toEqual([]);
    expect(graveyardWays(s0, s0.objects[theirs]!)).toEqual([]);
    poolOnly(s0, ap, { R: 1, W: 1 });
    const s = settle(castNow(s0, ap, h, [ply(opp)], { via: "jumpStart", discard: [discard] }));
    expect(life(s, opp)).toBe(37);
    expect(zone(s, discard)).toBe("graveyard");
    expect(zone(s, h)).toBe("exile");
  });
});

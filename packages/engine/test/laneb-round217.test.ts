// Lane B round B217: Long Rest (X target cards with different mana values back to your hand, your starting life total with
// eight or more), Dark Intimations (exiled from your graveyard as you cast a Bolas planeswalker, which enters with an
// additional loyalty counter) and Fires of Mount Doom (a card exiled from the top of your library, played this way for 2
// damage to each player) and Forbidden Crypt (each draw replaced by a card from your graveyard to your hand, losing with
// none) and Heart of Kiran (a loyalty counter removed from a planeswalker you control instead of its crew cost).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, swamp } from "./helpers";
import { abilityProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, power, toughness, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const longRest = (): CardDef => ({"oracleId":"fc8df5c8-fda6-454c-a1ac-21c6e3d75b9c","name":"Long Rest","manaCost":"{X}{G}{G}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return X target cards with different mana values from your graveyard to your hand. If eight or more cards were returned to your hand this way, your life total becomes equal to your starting life total. Exile Long Rest.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/0615e930-3b6b-4b2f-a09c-0730d491545c.jpg?1783926459","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/0615e930-3b6b-4b2f-a09c-0730d491545c.jpg?1783926459","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const darkIntimations = (): CardDef => ({"oracleId":"228cb63f-0b93-4be5-94e5-4eaae9112eeb","name":"Dark Intimations","manaCost":"{2}{U}{B}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each opponent sacrifices a creature or planeswalker of their choice, then discards a card. You return a creature or planeswalker card from your graveyard to your hand, then draw a card.\nWhen you cast a Bolas planeswalker spell, exile this card from your graveyard. That planeswalker enters with an additional loyalty counter on it.","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/dd8f103c-a688-4f22-ae59-2bce1db9d44a.jpg?1783936737","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/dd8f103c-a688-4f22-ae59-2bce1db9d44a.jpg?1783936737","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const firesOfMountDoom = (): CardDef => ({"oracleId":"f4944fde-2066-4aed-85c0-6e5e00a4bfe6","name":"Fires of Mount Doom","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"When Fires of Mount Doom enters, it deals 2 damage to target creature an opponent controls. Destroy all Equipment attached to that creature.\n{2}{R}: Exile the top card of your library. You may play that card this turn. When you play a card this way, Fires of Mount Doom deals 2 damage to each player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/e/ce2d9aab-5673-4a6a-be86-13508b8929bd.jpg?1783916176","artUrl":"https://cards.scryfall.io/art_crop/front/c/e/ce2d9aab-5673-4a6a-be86-13508b8929bd.jpg?1783916176","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nicolBolasDragongod = (): CardDef => ({"oracleId":"581eedc4-efe4-4ae4-baf2-88071e7e6f6d","name":"Nicol Bolas, Dragon-God","manaCost":"{U}{B}{B}{B}{R}","cmc":5,"typeLine":"Legendary Planeswalker — Bolas","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Bolas"],"oracleText":"Nicol Bolas has all loyalty abilities of all other planeswalkers on the battlefield.\n+1: You draw a card. Each opponent exiles a card from their hand or a permanent they control.\n−3: Destroy target creature or planeswalker.\n−8: Each opponent who doesn't control a legendary creature or planeswalker loses the game.","loyalty":"4","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/6830e76d-7d38-4f6e-8ab7-abd9ac3fb0d9.jpg?1783931616","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/6830e76d-7d38-4f6e-8ab7-abd9ac3fb0d9.jpg?1783931616","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-16","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const airElemental = (): CardDef => ({"oracleId":"7744bae4-a8b7-44a5-9b4c-0048ad4cc448","name":"Air Elemental","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Flying","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0fc9ba0a-2840-48cb-8cf4-ef2a5f273849.jpg?1783935788","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0fc9ba0a-2840-48cb-8cf4-ef2a5f273849.jpg?1783935788","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const duress = (): CardDef => ({"oracleId":"33d405ea-7a9a-4970-b70f-9c05d90dd6f0","name":"Duress","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/3557e601-9b71-4ce9-9047-1a8baa72e574.jpg?1783918048","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/3557e601-9b71-4ce9-9047-1a8baa72e574.jpg?1783918048","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pelakkaWurm = (): CardDef => ({"oracleId":"d36075c2-de66-4202-9217-b1102a2bc14b","name":"Pelakka Wurm","manaCost":"{4}{G}{G}{G}","cmc":7,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nWhen this creature enters, you gain 7 life.\nWhen this creature dies, draw a card.","power":"7","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8e732593-0bdc-4dd4-9b07-9aa1a780e6e8.jpg?1783941960","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8e732593-0bdc-4dd4-9b07-9aa1a780e6e8.jpg?1783941960","commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const forbiddenCrypt = (): CardDef => ({"oracleId":"8b34b211-985b-4934-bb3b-8e6672685ac2","name":"Forbidden Crypt","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If you would draw a card, return a card from your graveyard to your hand instead. If you can't, you lose the game.\nIf a card would be put into your graveyard from anywhere, exile that card instead.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/6/c6168af2-e49b-4c57-91c0-2cac9290a560.jpg?1783947094","artUrl":"https://cards.scryfall.io/art_crop/front/c/6/c6168af2-e49b-4c57-91c0-2cac9290a560.jpg?1783947094","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const heartOfKiran = (): CardDef => ({"oracleId":"e2ee410f-2467-4f1f-84a0-8a79faedc0b3","name":"Heart of Kiran","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying, vigilance\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)\nYou may remove a loyalty counter from a planeswalker you control rather than pay Heart of Kiran's crew cost.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Flying","Vigilance","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e847c44-1849-4251-9075-88ed5c7792a6.jpg?1783936731","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e847c44-1849-4251-9075-88ed5c7792a6.jpg?1783936731","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const ajaniGoldmane = (): CardDef => ({"oracleId":"dfb5f660-fd8b-4b7b-934c-6a71cd182f15","name":"Ajani Goldmane","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Ajani","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ajani"],"oracleText":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\"","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const card = (id: string): TargetChoice => ({ kind: "object", id });
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile", top = false) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  const p = s.players[pid]!;
  if (where === "library") {
    if (top) p.library.unshift(id);
    else p.library.push(id);
  } else p[where].push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Lane B round B217", () => {
  it("are fully supported", () => {
    supported(longRest(), darkIntimations(), firesOfMountDoom(), forbiddenCrypt(), heartOfKiran());
  });

  it("Long Rest: X target cards with different mana values return to your hand, and Long Rest is exiled", () => {
    const { s: s0, ap, ids } = setup([longRest()]);
    const bears = toZone(s0, ap, grizzlyBears(), "graveyard");
    const giant = toZone(s0, ap, hillGiant(), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, [card(bears), card(giant)], undefined, undefined, 2));
    s = settle(s);
    expect(zone(s, bears)).toBe("hand");
    expect(zone(s, giant)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(life(s, ap)).toBe(40);
  });

  it("Long Rest: two targets with the same mana value can't be chosen", () => {
    const { s: s0, ap, ids } = setup([longRest()]);
    const elves = toZone(s0, ap, llanowarElves(), "graveyard");
    const duressCard = toZone(s0, ap, duress(), "graveyard");
    const bears = toZone(s0, ap, grizzlyBears(), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [card(elves), card(duressCard)], undefined, undefined, 2)).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [card(elves), card(bears)], undefined, undefined, 2)).not.toBeNull();
  });

  it("Long Rest: with eight or more cards returned, your life total becomes your starting life total", () => {
    const { s: s0, ap, ids } = setup([longRest()]);
    s0.players[ap]!.life = 13;
    const cards = [ornithopter(), llanowarElves(), grizzlyBears(), divination(), hillGiant(), airElemental(), crawWurm(), pelakkaWurm()].map((d) => toZone(s0, ap, d, "graveyard"));
    let s = run(s0, planCast(s0, ap, ids[0]!, cards.map(card), undefined, undefined, 8));
    s = settle(s);
    for (const id of cards) expect(zone(s, id)).toBe("hand");
    expect(life(s, ap)).toBe(40);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Long Rest: a target that has left the graveyard isn't returned, so seven cards don't set the life total", () => {
    const { s: s0, ap, ids } = setup([longRest()]);
    s0.players[ap]!.life = 13;
    const cards = [ornithopter(), llanowarElves(), grizzlyBears(), divination(), hillGiant(), airElemental(), crawWurm(), pelakkaWurm()].map((d) => toZone(s0, ap, d, "graveyard"));
    let s = run(s0, planCast(s0, ap, ids[0]!, cards.map(card), undefined, undefined, 8));
    // One target is exiled before Long Rest resolves.
    const gone = cards[3]!;
    const yard = s.players[ap]!.graveyard;
    yard.splice(yard.indexOf(gone), 1);
    s.players[ap]!.exile.push(gone);
    s.objects[gone]!.zone = "exile";
    s = settle(s);
    expect(zone(s, gone)).toBe("exile");
    for (const id of cards.filter((x) => x !== gone)) expect(zone(s, id)).toBe("hand");
    expect(life(s, ap)).toBe(13);
  });

  it("Dark Intimations: casting a Bolas planeswalker exiles it from your graveyard, and the planeswalker enters with an additional loyalty counter", () => {
    const { s: s0, ap, ids } = setup([nicolBolasDragongod()]);
    putOnBattlefield(s0, ap, swamp);
    const intimations = toZone(s0, ap, darkIntimations(), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(zone(s, intimations)).toBe("exile");
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters?.loyalty).toBe(5);
  });

  it("Dark Intimations: two in your graveyard are both exiled, for two more loyalty counters", () => {
    const { s: s0, ap, ids } = setup([nicolBolasDragongod()]);
    putOnBattlefield(s0, ap, swamp);
    const one = toZone(s0, ap, darkIntimations(), "graveyard");
    const two = toZone(s0, ap, darkIntimations(), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(zone(s, one)).toBe("exile");
    expect(zone(s, two)).toBe("exile");
    expect(s.objects[ids[0]!]!.counters?.loyalty).toBe(6);
  });

  it("Dark Intimations: it does nothing from your hand, or for a spell that isn't a Bolas planeswalker", () => {
    const { s: s0, ap, ids } = setup([nicolBolasDragongod(), grizzlyBears()]);
    putOnBattlefield(s0, ap, swamp);
    const inHand = toZone(s0, ap, darkIntimations(), "hand");
    const inYard = toZone(s0, ap, darkIntimations(), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[1]!));
    s = settle(s);
    expect(zone(s, inYard)).toBe("graveyard");
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(zone(s, inHand)).toBe("hand");
    expect(zone(s, inYard)).toBe("exile");
    expect(s.objects[ids[0]!]!.counters?.loyalty).toBe(5);
  });

  it("Fires of Mount Doom: playing the exiled land this way deals 2 damage to each player", () => {
    const { s: s0, ap } = setup([]);
    const fires = putOnBattlefield(s0, ap, firesOfMountDoom());
    const land = toZone(s0, ap, mountain(), "library", true);
    let s = run(s0, planActivate(s0, ap, fires, 0));
    s = settle(s);
    expect(zone(s, land)).toBe("exile");
    for (const pid of s.turnOrder) expect(life(s, pid)).toBe(40);
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
    s = settle(s);
    for (const pid of s.turnOrder) expect(life(s, pid)).toBe(38);
  });

  it("Fires of Mount Doom: casting the exiled spell this way deals 2 damage to each player as it's cast", () => {
    const { s: s0, ap } = setup([]);
    const fires = putOnBattlefield(s0, ap, firesOfMountDoom());
    const bears = toZone(s0, ap, grizzlyBears(), "library", true);
    let s = run(s0, planActivate(s0, ap, fires, 0));
    s = settle(s);
    expect(zone(s, bears)).toBe("exile");
    s = run(s, planCast(s, ap, bears));
    // The trigger goes on the stack above the Bears and resolves first.
    s = settle(s);
    expect(zone(s, bears)).toBe("battlefield");
    for (const pid of s.turnOrder) expect(life(s, pid)).toBe(38);
  });

  it("Fires of Mount Doom: a card not played this way deals no damage, and a land played from your hand doesn't trigger it", () => {
    const { s: s0, ap } = setup([mountain()]);
    const fires = putOnBattlefield(s0, ap, firesOfMountDoom());
    const bears = toZone(s0, ap, grizzlyBears(), "library", true);
    let s = run(s0, planActivate(s0, ap, fires, 0));
    s = settle(s);
    expect(zone(s, bears)).toBe("exile");
    const fromHand = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Mountain")!;
    s = settle(act(s, { type: "playLand", player: ap, objectId: fromHand }));
    for (const pid of s.turnOrder) expect(life(s, pid)).toBe(40);
  });
  it("Forbidden Crypt: a draw is replaced by the card you choose from your graveyard, put into your hand; the library is untouched", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    putOnBattlefield(s0, ap, forbiddenCrypt());
    const bears = toZone(s0, ap, grizzlyBears(), "graveyard");
    const giant = toZone(s0, ap, hillGiant(), "graveyard");
    const elves = toZone(s0, ap, llanowarElves(), "graveyard");
    const lib0 = s0.players[ap]!.library.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, [ap]);
    let p = s.pending;
    expect(p).toMatchObject({ kind: "drawEmptyReturn", player: ap, toHand: true, left: 1 });
    if (p?.kind !== "drawEmptyReturn") throw new Error("no choice");
    expect([...p.cards].sort()).toEqual([bears, giant, elves].sort());
    s = act(s, { type: "drawEmptyReturn", player: ap, objectId: giant });
    expect(zone(s, giant)).toBe("hand");
    p = s.pending;
    expect(p).toMatchObject({ kind: "drawEmptyReturn", player: ap, toHand: true, left: 0 });
    s = settle(act(s, { type: "drawEmptyReturn", player: ap, objectId: bears }), [ap]);
    expect(zone(s, bears)).toBe("hand");
    expect(zone(s, elves)).toBe("graveyard");
    expect(s.players[ap]!.library.length).toBe(lib0);
    // Its other ability: Divination is exiled instead of going to the graveyard.
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("Forbidden Crypt: with one card in the graveyard it just comes back; with none for the next draw, you lose the game", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    putOnBattlefield(s0, ap, forbiddenCrypt());
    const bears = toZone(s0, ap, grizzlyBears(), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, [ap]);
    expect(zone(s, bears)).toBe("hand");
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("Forbidden Crypt: an opponent's draw step with an empty graveyard loses them the game; a bot picks a card when it has one", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, forbiddenCrypt());
    const c = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    putOnBattlefield(s0, c, forbiddenCrypt());
    const theirs = toZone(s0, c, grizzlyBears(), "graveyard");
    toZone(s0, c, hillGiant(), "graveyard");
    let s = s0;
    for (let i = 0; i < 4000 && !(s.activePlayer === c && s.step === "main1"); i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.lost).toBe(true);
    expect(s.players[c]!.lost).toBeFalsy();
    expect(s.players[c]!.hand.length).toBeGreaterThan(0);
    // The Hill Giant costs more: the bot takes it.
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.players[ap]!.lost).toBeFalsy();
  });
  it("Heart of Kiran: with no creature to crew it, a loyalty counter removed from your planeswalker crews it", () => {
    const { s: s0, ap } = setup([]);
    const heart = putOnBattlefield(s0, ap, heartOfKiran());
    const ajani = putOnBattlefield(s0, ap, ajaniGoldmane());
    s0.objects[ajani]!.counters.loyalty = 4;
    // Only the Vehicle and the planeswalker: no creature of yours to tap.
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Creature")) s0.objects[id]!.tapped = true;
    expect(abilityProblem(s0, ap, heart, 0)).toBeNull();
    expect(abilityProblem(s0, ap, heart, 0, undefined, undefined, [])).not.toBeNull();
    let s = act(s0, { type: "activateAbility", player: ap, objectId: heart, index: 0, costs: { crewLoyalty: ajani } });
    expect(s.objects[ajani]!.counters.loyalty).toBe(3);
    s = settle(s);
    const o = s.objects[heart]!;
    expect(characteristics(s, o).types).toContain("Creature");
    expect(`${power(s, o)}/${toughness(s, o)}`).toBe("4/4");
  });

  it("Heart of Kiran: it isn't a loyalty ability, so it works after the planeswalker's loyalty ability this turn; tapping creatures still works too", () => {
    const { s: s0, ap } = setup([]);
    const heart = putOnBattlefield(s0, ap, heartOfKiran());
    const ajani = putOnBattlefield(s0, ap, ajaniGoldmane());
    s0.objects[ajani]!.counters.loyalty = 4;
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(run(s0, planActivate(s0, ap, ajani, 0)));
    expect(s.objects[ajani]!.counters.loyalty).toBe(5);
    s = act(s, { type: "activateAbility", player: ap, objectId: heart, index: 0, costs: { crewLoyalty: ajani } });
    expect(s.objects[ajani]!.counters.loyalty).toBe(4);
    expect(s.objects[giant]!.tapped).toBeFalsy();
    s = settle(s);
    expect(characteristics(s, s.objects[heart]!).types).toContain("Creature");
    // The usual crew cost: Hill Giant's power 3.
    const { s: t0, ap: bp } = setup([]);
    const heart2 = putOnBattlefield(t0, bp, heartOfKiran());
    const giant2 = putOnBattlefield(t0, bp, hillGiant());
    let t = run(t0, planActivate(t0, bp, heart2, 0, undefined, undefined, [giant2]));
    expect(t.objects[giant2]!.tapped).toBe(true);
    t = settle(t);
    expect(characteristics(t, t.objects[heart2]!).types).toContain("Creature");
  });

  it("Heart of Kiran: not with an opponent's planeswalker, one with no loyalty counters, or together with tapped creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const heart = putOnBattlefield(s0, ap, heartOfKiran());
    const theirs = putOnBattlefield(s0, opp, ajaniGoldmane());
    s0.objects[theirs]!.counters.loyalty = 4;
    const mine = putOnBattlefield(s0, ap, ajaniGoldmane());
    s0.objects[mine]!.counters.loyalty = 0;
    expect(abilityProblem(s0, ap, heart, 0, undefined, undefined, undefined, undefined, { crewLoyalty: theirs })).not.toBeNull();
    expect(abilityProblem(s0, ap, heart, 0, undefined, undefined, undefined, undefined, { crewLoyalty: mine })).not.toBeNull();
    s0.objects[mine]!.counters.loyalty = 2;
    const giant = putOnBattlefield(s0, ap, hillGiant());
    expect(abilityProblem(s0, ap, heart, 0, undefined, undefined, [giant], undefined, { crewLoyalty: mine })).not.toBeNull();
    expect(abilityProblem(s0, ap, heart, 0, undefined, undefined, undefined, undefined, { crewLoyalty: mine })).toBeNull();
  });
});

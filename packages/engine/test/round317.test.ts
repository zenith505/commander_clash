// Round 317 (Lane A, skip-list cards): Tasha, the Witch Queen (page counters on cards exiled from each opponent's graveyard,
// then a spell cast from among anyone's cards in exile with them), Triple Triad (each player's top card exiled; yours and
// the ones with lesser mana value playable free this turn), Rocco, Street Chef (each player's own exiled card until your
// next end step; "whenever a player plays a land from exile or casts a spell from exile"), The Legend of Yangchen (each
// player in turn chooses among your opponents' permanents; "you may have target opponent draw three cards") and Zenos yae
// Galvus // Shinryu, Transcendent Rival (a creature chosen by a trigger, "when the chosen creature leaves the battlefield",
// an opponent chosen as it transforms, "when the chosen player loses the game").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === name);
const tgt = (id: string) => ({ kind: "object" as const, id });
const ply = (id: PlayerId) => ({ kind: "player" as const, id });
const nextOf = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % s.turnOrder.length]!;
const prevOf = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 3) % s.turnOrder.length]!;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

// Real oracle text (Scryfall).
const tasha = (): CardDef => ({"oracleId":"863a148c-596a-492b-b68e-3e1cbfcb140f","name":"Tasha, the Witch Queen","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Planeswalker — Tasha","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Tasha"],"oracleText":"Whenever you cast a spell you don't own, create a 3/3 black Demon creature token.\n+1: Draw a card. For each opponent, exile up to one target instant or sorcery card from that player's graveyard and put a page counter on it.\n−3: You may cast a spell from among cards in exile with page counters on them without paying its mana cost.\nTasha, the Witch Queen can be your commander.","loyalty":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b1c5f679-82d0-4434-9f13-d39ad57282b8.jpg?1783922685","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b1c5f679-82d0-4434-9f13-d39ad57282b8.jpg?1783922685","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const triad = (): CardDef => ({"oracleId":"9567d963-4815-466b-a319-6d138b6a0cd2","name":"Triple Triad","manaCost":"{3}{R}{R}{R}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, each player exiles the top card of their library. Until end of turn, you may play the card you own exiled this way and each other card exiled this way with lesser mana value than it without paying their mana costs.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d9a1de36-7f47-4b28-bb56-38d7e5bed82f.jpg?1783906594","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d9a1de36-7f47-4b28-bb56-38d7e5bed82f.jpg?1783906594","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const rocco = (): CardDef => ({"oracleId":"071f5b4b-6a1e-4dc3-9c08-b79713191811","name":"Rocco, Street Chef","manaCost":"{R}{G}{W}","cmc":3,"typeLine":"Legendary Creature — Elf Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"At the beginning of your end step, each player exiles the top card of their library. Until your next end step, each player may play the card they exiled this way.\nWhenever a player plays a land from exile or casts a spell from exile, you put a +1/+1 counter on target creature and create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")","power":"2","toughness":"4","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":["Food"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/421c2ed3-be60-4814-a82c-a0e3fbb97e63.jpg?1783916440","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/421c2ed3-be60-4814-a82c-a0e3fbb97e63.jpg?1783916440","commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const yangchen = (): CardDef => ({"oracleId":"521a63cf-5e83-4649-9800-c62b2fc474d6","name":"The Legend of Yangchen // Avatar Yangchen","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Enchantment — Saga // Legendary Creature — Avatar","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — Starting with you, each player chooses up to one permanent with mana value 3 or greater from among permanents your opponents control. Exile those permanents.\nII — You may have target opponent draw three cards. If you do, draw three cards.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Airbend","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a60e8f23-90b2-4bc6-bd54-a95055556389.jpg?1783905002","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a60e8f23-90b2-4bc6-bd54-a95055556389.jpg?1783905002","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"The Legend of Yangchen","manaCost":"{3}{W}{W}","typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — Starting with you, each player chooses up to one permanent with mana value 3 or greater from among permanents your opponents control. Exile those permanents.\nII — You may have target opponent draw three cards. If you do, draw three cards.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a60e8f23-90b2-4bc6-bd54-a95055556389.jpg?1783905002","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a60e8f23-90b2-4bc6-bd54-a95055556389.jpg?1783905002"},{"name":"Avatar Yangchen","manaCost":"","typeLine":"Legendary Creature — Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Flying\nWhenever you cast your second spell each turn, airbend up to one other target nonland permanent. (Exile it. While it's exiled, its owner may cast it for {2} rather than its mana cost.)","power":"4","toughness":"5","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/a/6/a60e8f23-90b2-4bc6-bd54-a95055556389.jpg?1783905002","artUrl":"https://cards.scryfall.io/art_crop/back/a/6/a60e8f23-90b2-4bc6-bd54-a95055556389.jpg?1783905002"}]} as CardDef);
const zenos = (): CardDef => ({"oracleId":"8f52fc65-a914-421a-9426-21eb520d55d5","name":"Zenos yae Galvus // Shinryu, Transcendent Rival","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Creature — Human Noble Warrior // Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble","Warrior"],"oracleText":"My First Friend — When Zenos yae Galvus enters, choose a creature an opponent controls. Until end of turn, creatures other than Zenos yae Galvus and the chosen creature get -2/-2.\nWhen the chosen creature leaves the battlefield, transform Zenos yae Galvus.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Transform","My First Friend","Burning Chains"],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b65ffce4-bb58-418a-9bad-81533a5f2ba2.jpg?1783906617","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b65ffce4-bb58-418a-9bad-81533a5f2ba2.jpg?1783906617","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Zenos yae Galvus","manaCost":"{3}{B}{B}","typeLine":"Legendary Creature — Human Noble Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble","Warrior"],"oracleText":"My First Friend — When Zenos yae Galvus enters, choose a creature an opponent controls. Until end of turn, creatures other than Zenos yae Galvus and the chosen creature get -2/-2.\nWhen the chosen creature leaves the battlefield, transform Zenos yae Galvus.","power":"4","toughness":"4","colors":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b65ffce4-bb58-418a-9bad-81533a5f2ba2.jpg?1783906617","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b65ffce4-bb58-418a-9bad-81533a5f2ba2.jpg?1783906617"},{"name":"Shinryu, Transcendent Rival","manaCost":"","typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nAs this creature transforms into Shinryu, choose an opponent.\nBurning Chains — When the chosen player loses the game, you win the game.","power":"8","toughness":"8","colors":["B"],"colorIndicator":["B"],"imageUrl":"https://cards.scryfall.io/normal/back/b/6/b65ffce4-bb58-418a-9bad-81533a5f2ba2.jpg?1783906617","artUrl":"https://cards.scryfall.io/art_crop/back/b/6/b65ffce4-bb58-418a-9bad-81533a5f2ba2.jpg?1783906617"}]} as CardDef);
const ashiok = (): CardDef => ({"oracleId":"ebc9ff52-c914-4c48-9d35-0e4cd07741cb","name":"Ashiok, Nightmare Muse","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Planeswalker — Ashiok","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ashiok"],"oracleText":"+1: Create a 2/3 blue and black Nightmare creature token with \"Whenever this token attacks or blocks, each opponent exiles the top two cards of their library.\"\n−3: Return target nonland permanent to its owner's hand, then that player exiles a card from their hand.\n−7: You may cast up to three spells from among face-up cards your opponents own from exile without paying their mana costs.","loyalty":"5","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/112eb5ce-4fe5-45b3-b810-79fef74b07f9.jpg?1783931525","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/112eb5ce-4fe5-45b3-b810-79fef74b07f9.jpg?1783931525","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const valigarmanda = (): CardDef => ({"oracleId":"cecd2f49-8ccb-472d-9cf1-fd0f4d93546d","name":"Summon: Esper Valigarmanda","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment Creature — Saga Drake","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Saga","Drake"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Exile an instant or sorcery card from each graveyard.\nII, III, IV — Add {R} for each lore counter on this Saga. You may cast an instant or sorcery card exiled with this Saga, and mana of any type can be spent to cast that spell.\nFlying, haste","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Haste"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f0298b4-c7ca-49b8-baaa-b9fad4c2bfd5.jpg?1783906354","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f0298b4-c7ca-49b8-baaa-b9fad4c2bfd5.jpg?1783906354","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const narfi = (): CardDef => ({"oracleId":"35c416c6-f522-4b4c-93db-75c4e01843d1","name":"King Narfi's Betrayal","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Each player mills four cards. Then you may exile a creature or planeswalker card from each graveyard.\nII, III — Until end of turn, you may cast spells from among cards exiled with this Saga, and you may spend mana as though it were mana of any color to cast those spells.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/c/3/c30ff1fa-6639-492a-b257-934e5818c98f.jpg?1783928194","artUrl":"https://cards.scryfall.io/art_crop/front/c/3/c30ff1fa-6639-492a-b257-934e5818c98f.jpg?1783928194","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"} as CardDef);
const divination = () => card("Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const ogre = (name: string, cost: string, cmc: number) => card(name, "Creature — Ogre", cost, { cmc, power: "3", toughness: "3" });
const relic = (name: string) => card(name, "Artifact", "{2}", { cmc: 2 });
const testForest = card("Forest", "Basic Land — Forest", "", { supertypes: ["Basic"] });
const testWastes = card("Test Wastes", "Land", "");

describe("round 317", () => {
  it("are fully supported", () => supported(tasha(), triad(), rocco(), yangchen(), zenos(), ashiok(), valigarmanda(), narfi()));
});

describe("round 317: Tasha, the Witch Queen", () => {
  it("+1 draws, then exiles up to one instant or sorcery from each opponent's graveyard with a page counter on it", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tasha());
    s0.objects[t]!.counters.loyalty = 5;
    const o1 = nextOf(s0, ap);
    const o2 = nextOf(s0, o1);
    const o3 = nextOf(s0, o2);
    const b1 = inZone(s0, o1, bolt(), "graveyard");
    const d2 = inZone(s0, o2, divination(), "graveyard");
    const stays = inZone(s0, o3, bolt(), "graveyard");
    const hand = s0.players[ap]!.hand.length;
    const idx = abilitiesOf(s0, s0.objects[t]!).activated.findIndex((a) => a.loyalty === 1);
    // One target for each opponent (up to one), in turn order: none chosen for the third.
    let s = settle(run(s0, planActivate(s0, ap, t, idx, [tgt(b1), tgt(d2), { kind: "none" }])), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(zone(s, b1)).toBe("exile");
    expect(zone(s, d2)).toBe("exile");
    expect(zone(s, stays)).toBe("graveyard");
    expect(s.objects[b1]!.counters.page).toBe(1);
    expect(s.objects[d2]!.counters.page).toBe(1);
    expect(s.objects[t]!.counters.loyalty).toBe(6);
  });

  it("−3 casts a spell from among anyone's cards in exile with page counters, free, only as it resolves; a spell you don't own makes a Demon", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tasha());
    s0.objects[t]!.counters.loyalty = 5;
    const o1 = nextOf(s0, ap);
    const o2 = nextOf(s0, o1);
    // Anyone's card in exile with a page counter, whatever put it there; one without isn't offered.
    const theirs = inZone(s0, o1, bolt(), "graveyard");
    const other = inZone(s0, o2, divination(), "graveyard");
    const plain = inZone(s0, o2, bolt(), "graveyard");
    for (const [id, page] of [[theirs, 1], [other, 2], [plain, 0]] as const) {
      const o = s0.objects[id]!;
      s0.players[o.owner]!.graveyard.splice(s0.players[o.owner]!.graveyard.indexOf(id), 1);
      o.zone = "exile";
      s0.players[o.owner]!.exile.push(id);
      if (page) o.counters.page = page;
    }
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")) s0.objects[id]!.tapped = true;
    const idx = abilitiesOf(s0, s0.objects[t]!).activated.findIndex((a) => a.loyalty === -3);
    let s = settle(run(s0, planActivate(s0, ap, t, idx)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    const opts = (s.pending as { options: string[] }).options;
    expect(opts).toContain(theirs);
    expect(opts).toContain(other);
    expect(opts).not.toContain(plain);
    s = act(s, { type: "chooseOption", player: ap, choice: theirs });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: theirs });
    const life = s.players[o2]!.life;
    s = settle(run(s, planCast(s, ap, theirs, [ply(o2)])), ap);
    expect(s.players[o2]!.life).toBe(life - 3);
    // Its owner's graveyard; a spell you don't own: a 3/3 Demon.
    expect(s.players[o1]!.graveyard).toContain(theirs);
    expect(named(s, "Demon Token").length + named(s, "Demon").length).toBe(1);
    // The other card stays exiled with its counter; it can't be cast later (rulings).
    expect(zone(s, other)).toBe("exile");
    expect(s.objects[other]!.mayPlay).toBeUndefined();
  });
});

describe("round 317: Triple Triad", () => {
  it("each player exiles their top card; you may play yours and those with lesser mana value free this turn, lands with a land play", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, triad());
    const o1 = nextOf(s0, ap);
    const o2 = nextOf(s0, o1);
    const o3 = nextOf(s0, o2);
    let s = passUntil(s0, "end", prevOf(s0, ap));
    const mine = inZone(s, ap, ogre("Three Ogre", "{2}{R}", 3), "library");
    const lesser = inZone(s, o1, relic("Two Relic"), "library");
    const greater = inZone(s, o2, ogre("Four Ogre", "{3}{R}", 4), "library");
    const land = inZone(s, o3, testWastes, "library");
    s = settle(passUntil(s, "upkeep", ap), ap);
    for (const id of [mine, lesser, greater, land]) expect(zone(s, id)).toBe("exile");
    expect(s.objects[mine]!.mayPlay).toMatchObject({ player: ap, free: true, until: "thisTurn" });
    expect(s.objects[lesser]!.mayPlay).toMatchObject({ player: ap, free: true });
    expect(s.objects[land]!.mayPlay).toMatchObject({ player: ap });
    expect(s.objects[greater]!.mayPlay).toBeUndefined();
    s = passUntil(s, "main1", ap);
    // Free, with the usual timing: no mana needed.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    s = settle(run(s, planCast(s, ap, mine)), ap);
    expect(zone(s, mine)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, lesser)), ap);
    expect(zone(s, lesser)).toBe("battlefield");
    expect(s.objects[lesser]!.controller).toBe(ap);
    s = settle(act(s, { type: "playLand", player: ap, objectId: land }), ap);
    expect(zone(s, land)).toBe("battlefield");
    // Over at the end of the turn.
    s = passUntil(s, "upkeep", o1);
    expect(s.objects[greater]!.mayPlay).toBeUndefined();
  });

  it("with no card of yours exiled, nothing can be played", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, triad());
    const o1 = nextOf(s0, ap);
    let s = passUntil(s0, "end", prevOf(s0, ap));
    s.players[ap]!.library = [];
    const theirs = inZone(s, o1, relic("Two Relic"), "library");
    s = settle(passUntil(s, "upkeep", ap), ap);
    expect(zone(s, theirs)).toBe("exile");
    expect(s.objects[theirs]!.mayPlay).toBeUndefined();
  });
});

describe("round 317: Rocco, Street Chef", () => {
  it("at your end step each player exiles their top card and may play it until your next end step; playing from exile triggers Rocco", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rocco());
    const o1 = nextOf(s0, ap);
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Bear" }));
    let s = passUntil(s0, "end", ap);
    // The trigger waits on the stack: the cards on top of the libraries are set now.
    const mine = inZone(s, ap, relic("My Relic"), "library");
    const theirs = inZone(s, o1, testWastes, "library");
    s = settle(s, ap);
    if (s.pending) s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(zone(s, mine)).toBe("exile");
    expect(zone(s, theirs)).toBe("exile");
    expect(s.objects[mine]!.mayPlay).toMatchObject({ player: ap, until: "yourNextEndStep" });
    expect(s.objects[theirs]!.mayPlay).toMatchObject({ player: o1, until: "yourNextEndStep", untilOf: ap });
    // The next player plays theirs on their turn (Rocco's controller targets a creature for the counter, and gets a Food).
    s = passUntil(s, "main1", o1);
    const counters = s.objects[b]!.counters["+1/+1"] ?? 0;
    s = act(s, { type: "playLand", player: o1, objectId: theirs });
    s = settle(s, ap);
    while (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(zone(s, theirs)).toBe("battlefield");
    expect(named(s, "Food").length + named(s, "Food Token").length).toBe(1);
    expect((s.objects[b]!.counters["+1/+1"] ?? 0) + (s.objects[r]!.counters["+1/+1"] ?? 0)).toBe(counters + 1);
    // Still yours to play through the other players' end steps, until your next one begins.
    s = passUntil(s, "main1", ap);
    expect(s.objects[mine]!.mayPlay).toBeDefined();
    s = passUntil(s, "end", ap);
    expect(s.objects[mine]!.mayPlay).toBeUndefined();
  });

  it("an opponent's card from your end step is still theirs to play after their own end step", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, rocco());
    const o1 = nextOf(s0, ap);
    let s = passUntil(s0, "end", ap);
    const theirs = inZone(s, o1, relic("Their Relic"), "library");
    s = settle(s, ap);
    s = passUntil(s, "upkeep", nextOf(s, o1));
    expect(s.objects[theirs]!.mayPlay).toMatchObject({ player: o1 });
  });
});

describe("round 317: The Legend of Yangchen", () => {
  it("chapter I: starting with you, each player chooses up to one permanent with mana value 3 or greater your opponents control; all exiled at once", () => {
    const { s: s0, ap, ids } = setup([yangchen()]);
    const o1 = nextOf(s0, ap);
    const o2 = nextOf(s0, o1);
    const big1 = putOnBattlefield(s0, o1, ogre("Big Ogre", "{2}{R}", 3));
    const big2 = putOnBattlefield(s0, o2, ogre("Bigger Ogre", "{3}{R}", 4));
    const small = putOnBattlefield(s0, o1, bear({ name: "Small Bear", cmc: 2 }));
    const mine = putOnBattlefield(s0, ap, ogre("My Ogre", "{2}{R}", 3));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // You choose first, among your opponents' permanents only.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    const opts = (s.pending as { options: string[] }).options;
    expect(opts).toContain(big1);
    expect(opts).toContain(big2);
    expect(opts).not.toContain(small);
    expect(opts).not.toContain(mine);
    s = act(s, { type: "pickPermanents", player: ap, ids: [big1] });
    // Each opponent then chooses too (the bots), still among your opponents' permanents; nothing is exiled until all have chosen.
    s = settle(s, ap);
    expect(zone(s, big1)).toBe("exile");
    expect(zone(s, mine)).toBe("battlefield");
    expect(zone(s, small)).toBe("battlefield");
  });

  it("chapter II: you may have target opponent draw three cards; if you do, you draw three", () => {
    const { s: s0, ap, ids } = setup([yangchen()]);
    const o1 = nextOf(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    while (s.pending?.player === ap) s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }), ap);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters.lore).toBe(1);
    s = passUntil(s, "main1", nextOf(s, ap));
    s = passUntil(s, "main1", ap);
    // Chapter II's target: an opponent, chosen as it's put on the stack (rulings).
    s = settle(s, ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(o1)] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect((s.pending as { prompt: string }).prompt).toMatch(/target opponent draw three cards/);
    const mine = s.players[ap]!.hand.length;
    const theirs = s.players[o1]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.players[ap]!.hand.length).toBe(mine + 3);
    expect(s.players[o1]!.hand.length).toBe(theirs + 3);
  });
});

describe("round 317: Zenos yae Galvus // Shinryu, Transcendent Rival", () => {
  const castZenos = (s0: GameState, ap: PlayerId, id: string) => {
    s0.players[ap]!.manaPool.B = 2;
    return settle(run(s0, planCast(s0, ap, id)), ap);
  };
  it("enters: choose a creature an opponent controls; until end of turn creatures other than Zenos and it get -2/-2", () => {
    const { s: s0, ap, ids } = setup([zenos()]);
    const o1 = nextOf(s0, ap);
    const chosen = putOnBattlefield(s0, o1, ogre("Chosen Ogre", "{2}{R}", 3));
    const other = putOnBattlefield(s0, o1, ogre("Other Ogre", "{2}{R}", 3));
    const mine = putOnBattlefield(s0, ap, ogre("My Ogre", "{2}{R}", 3));
    let s = castZenos(s0, ap, ids[0]!);
    // Not targeted: chosen as the trigger resolves, among creatures your opponents control.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    const opts = (s.pending as { options: string[] }).options;
    expect(opts).toEqual(expect.arrayContaining([chosen, other]));
    expect(opts).not.toContain(mine);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [chosen] }), ap);
    expect(pt(s, chosen)).toBe("3/3");
    expect(pt(s, other)).toBe("1/1");
    expect(pt(s, mine)).toBe("1/1");
    expect(pt(s, ids[0]!)).toBe("4/4");
    expect(s.objects[ids[0]!]!.chosen?.object?.id).toBe(chosen);
    // A creature entering later isn't affected (CR 611.2c).
    const late = putOnBattlefield(s, o1, ogre("Late Ogre", "{2}{R}", 3));
    expect(pt(s, late)).toBe("3/3");
  });

  it("when the chosen creature leaves the battlefield, Zenos transforms; as it does, you choose an opponent, and when that player loses, you win", () => {
    const { s: s0, ap, ids } = setup([zenos(), bolt()]);
    const o1 = nextOf(s0, ap);
    const chosen = putOnBattlefield(s0, o1, ogre("Chosen Ogre", "{2}{R}", 3));
    // The only creature an opponent controls: chosen without a question.
    let s = castZenos(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.chosen?.object?.id).toBe(chosen);
    // Bolt kills the chosen 3/3 (it isn't shrunk): Zenos transforms.
    s = run(s, planCast(s, ap, ids[1]!, [tgt(chosen)]));
    s = settle(s, ap);
    expect(zone(s, chosen)).toBe("graveyard");
    expect(s.objects[ids[0]!]!.face).toBe(1);
    // "As this creature transforms into Shinryu, choose an opponent" (CR 712.20).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "player" });
    expect((s.pending as { options: string[] }).options).not.toContain(String(ap));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(o1) }), ap);
    expect(s.objects[ids[0]!]!.chosen?.player).toBe(o1);
    // That player loses the game: you win.
    s.players[o1]!.life = 0;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(s.players[o1]!.lost).toBe(true);
    expect(s.winner).toBe(ap);
  });

  it("another opponent losing doesn't win the game; a different creature leaving doesn't transform it", () => {
    const { s: s0, ap, ids } = setup([zenos(), bolt()]);
    const o1 = nextOf(s0, ap);
    const o2 = nextOf(s0, o1);
    const chosen = putOnBattlefield(s0, o1, ogre("Chosen Ogre", "{2}{R}", 3));
    const other = putOnBattlefield(s0, o1, ogre("Other Ogre", "{2}{R}", 3));
    let s = castZenos(s0, ap, ids[0]!);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [chosen] }), ap);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(other)])), ap);
    expect(zone(s, other)).toBe("graveyard");
    expect(s.objects[ids[0]!]!.face ?? 0).toBe(0);
    s.players[o2]!.life = 0;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(s.players[o2]!.lost).toBe(true);
    expect(s.winner ?? null).toBeNull();
  });
});

describe("round 317: Ashiok, Nightmare Muse", () => {
  const loyaltyIndex = (s: GameState, id: string, n: number) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.loyalty === n);
  it("−3 returns a nonland permanent to its owner's hand, then that player exiles a card from their hand (the returned one may be it)", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, ashiok());
    s0.objects[a]!.counters.loyalty = 5;
    const o1 = nextOf(s0, ap);
    const ogreId = putOnBattlefield(s0, o1, ogre("Their Ogre", "{2}{R}", 3));
    s0.players[o1]!.hand = [];
    const kept = inZone(s0, o1, bolt(), "hand");
    let s = run(s0, planActivate(s0, ap, a, loyaltyIndex(s0, a, -3), [tgt(ogreId)]));
    s = settle(s, ap);
    expect(zone(s, ogreId) === "exile" || zone(s, kept) === "exile").toBe(true);
    expect(s.players[o1]!.hand.length).toBe(1);
    expect(s.players[o1]!.exile.length).toBe(1);
  });

  it("−3 on a token: the token isn't a card, so its owner exiles a card from their hand", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, ashiok());
    s0.objects[a]!.counters.loyalty = 5;
    const o1 = nextOf(s0, ap);
    const tok = putOnBattlefield(s0, o1, ogre("Ogre Token", "", 0));
    s0.objects[tok]!.isToken = true;
    s0.players[o1]!.hand = [];
    const c1 = inZone(s0, o1, bolt(), "hand");
    const c2 = inZone(s0, o1, divination(), "hand");
    let s = run(s0, planActivate(s0, ap, a, loyaltyIndex(s0, a, -3), [tgt(tok)]));
    for (let i = 0; i < 20 && (s.stack.length || s.pending?.kind !== "discard"); i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "discard", player: o1, exile: true });
    expect((s.pending as { among?: string[] }).among?.sort()).toEqual([c1, c2].sort());
    expect(() => act(s, { type: "discard", player: o1, objectIds: [tok] })).toThrow();
    s = settle(act(s, { type: "discard", player: o1, objectIds: [c2] }), ap);
    expect(zone(s, c2)).toBe("exile");
    expect(s.objects[tok]).toBeUndefined();
  });

  it("−7 casts up to three spells from among face-up cards your opponents own in exile, free, as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, ashiok());
    s0.objects[a]!.counters.loyalty = 8;
    const o1 = nextOf(s0, ap);
    const o2 = nextOf(s0, o1);
    const toExile = (pid: PlayerId, def: CardDef, faceDown = false) => {
      const id = inZone(s0, pid, def, "graveyard");
      s0.players[pid]!.graveyard.splice(s0.players[pid]!.graveyard.indexOf(id), 1);
      s0.objects[id]!.zone = "exile";
      s0.players[pid]!.exile.push(id);
      if (faceDown) s0.objects[id]!.faceDown = "morph";
      return id;
    };
    const r1 = toExile(o1, relic("Relic One"));
    const r2 = toExile(o2, relic("Relic Two"));
    const hidden = toExile(o2, relic("Hidden Relic"), true);
    const own = toExile(ap, relic("My Relic"));
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")) s0.objects[id]!.tapped = true;
    let s = settle(run(s0, planActivate(s0, ap, a, loyaltyIndex(s0, a, -7))), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    const opts = (s.pending as { options: string[] }).options;
    expect(opts).toEqual(expect.arrayContaining([r1, r2]));
    expect(opts).not.toContain(hidden);
    expect(opts).not.toContain(own);
    s = act(s, { type: "chooseOption", player: ap, choice: r1 });
    s = settle(run(s, planCast(s, ap, r1)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    s = act(s, { type: "chooseOption", player: ap, choice: r2 });
    s = settle(run(s, planCast(s, ap, r2)), ap);
    while (s.pending?.player === ap && s.pending.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(zone(s, r1)).toBe("battlefield");
    expect(zone(s, r2)).toBe("battlefield");
    expect(s.objects[r1]!.controller).toBe(ap);
    expect(zone(s, own)).toBe("exile");
  });
});

describe("round 317: Summon: Esper Valigarmanda", () => {
  it("I exiles an instant or sorcery card from each graveyard; II and III add {R} per lore counter and cast one of them with mana of any type", () => {
    const { s: s0, ap, ids } = setup([valigarmanda()]);
    const o1 = nextOf(s0, ap);
    const o2 = nextOf(s0, o1);
    const o3 = nextOf(s0, o2);
    const b = inZone(s0, o1, bolt(), "graveyard");
    const d = inZone(s0, o2, divination(), "graveyard");
    const stays = inZone(s0, o3, ogre("Dead Ogre", "{2}{R}", 3), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, d)).toBe("exile");
    expect(zone(s, stays)).toBe("graveyard");
    // Chapter II on your next turn: {R}{R}, then Lightning Bolt cast for its cost as it resolves.
    s = passUntil(s, "upkeep", o1);
    s = passUntil(s, "main1", ap);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining([b, d]));
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: b, how: "paid", anyType: true });
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    const life = s.players[o2]!.life;
    s = settle(run(s, planCast(s, ap, b, [ply(o2)])), ap);
    expect(s.players[o2]!.life).toBe(life - 3);
    expect(s.players[o1]!.graveyard).toContain(b);
    // Chapter III: {R}{R}{R} pays for Divination's {2}{U} (mana of any type).
    s = passUntil(s, "upkeep", o1);
    s = passUntil(s, "main1", ap);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    s = act(s, { type: "chooseOption", player: ap, choice: d });
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, d)), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[o2]!.graveyard).toContain(d);
  });
});

describe("round 317: King Narfi's Betrayal", () => {
  it("I mills four each, then you may exile a creature or planeswalker card from each graveyard; II lets you cast them this turn with mana of any color", () => {
    const { s: s0, ap, ids } = setup([narfi()]);
    const o1 = nextOf(s0, ap);
    const o2 = nextOf(s0, o1);
    const theirs = inZone(s0, o1, ogre("Milled Ogre", "{2}{R}", 3), "library");
    const skipped = inZone(s0, o2, ogre("Skipped Ogre", "{2}{R}", 3), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(zone(s, theirs)).toBe("graveyard");
    // You choose in each graveyard with one (not targeted, rulings): this one, then none from the next.
    for (let i = 0; i < 8 && s.pending?.kind === "searchLibrary" && s.pending.player === ap; i++) {
      const cards = (s.pending as { cards: string[] }).cards;
      s = settle(act(s, { type: "searchLibrary", player: ap, found: cards.includes(theirs) ? [theirs] : [] }), ap);
    }
    expect(zone(s, theirs)).toBe("exile");
    expect(zone(s, skipped)).toBe("graveyard");
    // Chapter II: cast it this turn, with mana of any color (blue pays the red).
    s = passUntil(s, "upkeep", o1);
    s = passUntil(s, "main1", ap);
    s = settle(s, ap);
    expect(s.objects[theirs]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", castOnly: true, anyType: true });
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    s.players[ap]!.manaPool.U = 3;
    s = settle(run(s, planCast(s, ap, theirs)), ap);
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
  });
});

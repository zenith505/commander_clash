// Lane B round B216: Bone Mask (the next damage from a source of your choice prevented, and that many cards exiled from
// the top of your library), Forbidden Ritual (sacrifice a nontoken permanent, and the target opponent loses 2 life unless
// they sacrifice a permanent or discard a card, repeated as often as you like), Preferred Selection (look at the top two
// cards; sacrifice it and pay {2}{G}{G} for one of them, or one goes to the bottom) and Curse of the Cabal (while it's
// suspended, each player at their upkeep may sacrifice a permanent to put two time counters on it).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const boneMask = (): CardDef => ({"oracleId":"ddfc7dac-f921-4529-935c-6c588890c522","name":"Bone Mask","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}: The next time a source of your choice would deal damage to you this turn, prevent that damage. Exile cards from the top of your library equal to the damage prevented this way.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f46aea3-ea00-46c4-b207-522ceeeae68b.jpg?1783947044","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f46aea3-ea00-46c4-b207-522ceeeae68b.jpg?1783947044","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const forbiddenRitual = (): CardDef => ({"oracleId":"4b5d9c76-8be8-4e25-b978-9750df3d8c15","name":"Forbidden Ritual","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Sacrifice a nontoken permanent. If you do, target opponent loses 2 life unless that player sacrifices a permanent of their choice or discards a card. You may repeat this process any number of times.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f5327e6d-db4e-4b44-a00e-b764e80b8946.jpg?1783946994","artUrl":"https://cards.scryfall.io/art_crop/front/f/5/f5327e6d-db4e-4b44-a00e-b764e80b8946.jpg?1783946994","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const preferredSelection = (): CardDef => ({"oracleId":"1d05d2d6-3ea1-4d8a-9f1c-6fc3f5e38ea9","name":"Preferred Selection","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, look at the top two cards of your library. You may sacrifice this enchantment and pay {2}{G}{G}. If you do, put one of those cards into your hand. If you don't, put one of those cards on the bottom of your library.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/59ce9668-78ef-44a5-ba9c-49fa740b8cb5.jpg?1783947062","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/59ce9668-78ef-44a5-ba9c-49fa740b8cb5.jpg?1783947062","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const curseOfTheCabal = (): CardDef => ({"oracleId":"cafede0d-aa14-4266-b619-321ac756262d","name":"Curse of the Cabal","manaCost":"{9}{B}","cmc":10,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player sacrifices half the permanents they control of their choice, rounded down.\nSuspend 2—{2}{B}{B} (Rather than cast this card from your hand, you may pay {2}{B}{B} and exile it with two time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nAt the beginning of each player's upkeep, if this card is suspended, that player may sacrifice a permanent of their choice. If the player does, put two time counters on this card.","colors":["B"],"colorIdentity":["B"],"keywords":["Suspend"],"imageUrl":"https://cards.scryfall.io/normal/front/d/4/d4323aa6-a1fb-42ee-9634-3747129fde3b.jpg?1783943235","artUrl":"https://cards.scryfall.io/art_crop/front/d/4/d4323aa6-a1fb-42ee-9634-3747129fde3b.jpg?1783943235","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

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
const nextOf = (s: GameState, pid: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const planManaFor = (s: GameState, pid: PlayerId, cost: string) => planMana(s, pid, parseManaCost(cost))!;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "exile", top = false) => {
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
const emptyHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
};
/** Passes (bots answering their own questions) until `pid` gets priority with nothing pending. */
const untilPriority = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 400 && (waitingOn(s) !== pid || s.pending); i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Plays on (bots answering, no attacks) until `stop` holds. */
const playUntil = (s: GameState, stop: (s: GameState) => boolean, me: PlayerId[] = []) => {
  for (let i = 0; i < 4000 && !stop(s); i++) {
    const p = s.pending;
    if (p && me.includes(p.player) && p.kind !== "discardToHandSize") throw new Error(`unexpected question for ${p.player}: ${JSON.stringify(p).slice(0, 300)}`);
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  if (!stop(s)) throw new Error("never got there");
  return s;
};

describe("Lane B round B216", () => {
  it("are fully supported", () => {
    supported(boneMask(), forbiddenRitual(), preferredSelection(), curseOfTheCabal());
  });

  it("Bone Mask: the next damage from the chosen source is prevented, and that many cards are exiled from the top of your library", () => {
    const { s: s0, ap, opp } = setup([]);
    const mask = putOnBattlefield(s0, ap, boneMask());
    const bolt = toZone(s0, opp, lightningBolt(), "hand");
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, mountain());
    const top3 = s0.players[ap]!.library.slice(0, 3);
    const lib0 = s0.players[ap]!.library.length;
    let s = untilPriority(s0, opp);
    s = run(s, planCast(s, opp, bolt, [player(ap)]));
    s = untilPriority(s, ap);
    s = run(s, planActivate(s, ap, mask, 0));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("damageSource");
    if (p?.kind !== "chooseOption") throw new Error("no source choice");
    const i = p.labels!.findIndex((l) => l.startsWith("Lightning Bolt"));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: p.options[i]! }));
    expect(zone(s, bolt)).toBe("graveyard");
    expect(life(s, ap)).toBe(40);
    expect(s.players[ap]!.library.length).toBe(lib0 - 3);
    for (const id of top3) expect(zone(s, id)).toBe("exile");
    // Used up: nothing more is exiled.
    expect(s.damageRules ?? []).toHaveLength(0);
  });

  it("Bone Mask: with fewer cards in your library than the damage, the damage is still all prevented and the whole library exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const mask = putOnBattlefield(s0, ap, boneMask());
    const bolt = toZone(s0, opp, lightningBolt(), "hand");
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, mountain());
    const p0 = s0.players[ap]!;
    for (const id of p0.library.slice(2)) delete s0.objects[id];
    p0.library = p0.library.slice(0, 2);
    let s = untilPriority(s0, opp);
    s = run(s, planCast(s, opp, bolt, [player(ap)]));
    s = untilPriority(s, ap);
    s = run(s, planActivate(s, ap, mask, 0));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error("no source choice");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: p.options[p.labels!.findIndex((l) => l.startsWith("Lightning Bolt"))]! }));
    expect(life(s, ap)).toBe(40);
    expect(s.players[ap]!.library).toHaveLength(0);
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("Forbidden Ritual: each pass you sacrifice a nontoken permanent and the target opponent loses 2 life (no permanent or card to give instead); you choose whether to go again", () => {
    const { s: s0, ap, ids } = setup([forbiddenRitual()]);
    const b = nextOf(s0, ap, 1);
    emptyHand(s0, b);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(b)]));
    s = settle(s, [ap]);
    // The first sacrifice: one of your nontoken permanents.
    let p = s.pending;
    expect(p?.kind === "pickPermanents" && p.action).toBe("sacrifice");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bears] }), [ap]);
    expect(zone(s, bears)).toBe("graveyard");
    expect(life(s, b)).toBe(38);
    p = s.pending;
    expect(p).toMatchObject({ kind: "chooseMay", player: ap, repeat: true });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), [ap]);
    p = s.pending;
    expect(p?.kind === "pickPermanents" && p.action).toBe("sacrifice");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [giant] }), [ap]);
    expect(zone(s, giant)).toBe("graveyard");
    expect(life(s, b)).toBe(36);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, repeat: true });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), [ap]);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(life(s, b)).toBe(36);
  });

  it("Forbidden Ritual: the opponent may sacrifice a permanent or discard a card instead of losing the life", () => {
    const { s: s0, ap, ids } = setup([forbiddenRitual()]);
    const b = nextOf(s0, ap, 1);
    emptyHand(s0, b);
    const theirs = putOnBattlefield(s0, b, grizzlyBears());
    putOnBattlefield(s0, ap, grizzlyBears());
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(b)]));
    s = settle(s, [ap, b]);
    const pick = s.pending;
    if (pick?.kind !== "pickPermanents") throw new Error("no sacrifice");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [pick.options.find((id) => nameOf(s, id) === "Grizzly Bears")!] }), [ap, b]);
    const q = s.pending;
    expect(q?.player).toBe(b);
    // B gives up the Bears rather than the life.
    if (q?.kind === "chooseOption") {
      const i = q.labels!.findIndex((l) => /sacrifice/i.test(l));
      s = act(s, { type: "chooseOption", player: b, choice: q.options[i]! });
    }
    if (s.pending?.kind === "pickPermanents" && s.pending.player === b) s = act(s, { type: "pickPermanents", player: b, ids: [theirs] });
    s = settle(s, [ap]);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(life(s, b)).toBe(40);
  });

  it("Forbidden Ritual: with only tokens there's nothing to sacrifice, so nothing happens and there's no repeat", () => {
    const { s: s0, ap, ids } = setup([forbiddenRitual()]);
    const b = nextOf(s0, ap, 1);
    emptyHand(s0, b);
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(b)]));
    // Every permanent of A's a token now.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.isToken = true;
    s = settle(s, [ap]);
    expect(s.pending).toBeNull();
    expect(life(s, b)).toBe(40);
  });

  it("Preferred Selection: at your upkeep, the top two cards are named in the question; paying sacrifices it and puts the one you choose into your hand", () => {
    const { s: s0, ap } = setup([]);
    const sel = putOnBattlefield(s0, ap, preferredSelection());
    const elves = toZone(s0, ap, llanowarElves(), "library", true);
    const giant = toZone(s0, ap, hillGiant(), "library", true);
    let s = playUntil(s0, (x) => x.pending?.kind === "chooseMay" && x.pending.player === ap, [ap]);
    const p = s.pending;
    if (p?.kind !== "chooseMay") throw new Error("no question");
    expect(s.activePlayer).toBe(ap);
    expect(p.prompt).toContain("Hill Giant and Llanowar Elves");
    expect(p.pay?.mana).toBe("{2}{G}{G}");
    const hand0 = s.players[ap]!.hand.length;
    s = run(s, [...planManaFor(s, ap, "{2}{G}{G}"), { type: "chooseMay", player: ap, yes: true }]);
    expect(zone(s, sel)).toBe("graveyard");
    const q = s.pending;
    expect(q?.kind === "chooseOption" && q.what).toBe("lookedCard");
    if (q?.kind !== "chooseOption") throw new Error("no pick");
    expect([...q.options].sort()).toEqual([elves, giant].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: elves });
    expect(zone(s, elves)).toBe("hand");
    expect(s.players[ap]!.library[0]).toBe(giant);
    expect(s.players[ap]!.hand.length).toBe(hand0 + 1);
  });

  it("Preferred Selection: declining keeps it, and the card you choose goes to the bottom, the other staying on top", () => {
    const { s: s0, ap } = setup([]);
    const sel = putOnBattlefield(s0, ap, preferredSelection());
    const elves = toZone(s0, ap, llanowarElves(), "library", true);
    const giant = toZone(s0, ap, hillGiant(), "library", true);
    let s = playUntil(s0, (x) => x.pending?.kind === "chooseMay" && x.pending.player === ap, [ap]);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    const q = s.pending;
    expect(q?.kind === "chooseOption" && q.what).toBe("lookedCard");
    s = act(s, { type: "chooseOption", player: ap, choice: giant });
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(giant);
    expect(lib[0]).toBe(elves);
    expect(zone(s, sel)).toBe("battlefield");
  });

  it("Preferred Selection: without the mana there's no question, only the card to the bottom", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, preferredSelection());
    toZone(s0, ap, llanowarElves(), "library", true);
    toZone(s0, ap, hillGiant(), "library", true);
    // A's lands all gone: nothing to pay with.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      delete s0.objects[id];
    }
    const s = playUntil(s0, (x) => x.pending?.player === ap && x.activePlayer === ap && x.step === "upkeep", [ap]);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("lookedCard");
  });

  it("Curse of the Cabal: while it's suspended, at each player's upkeep that player may sacrifice a permanent to put two time counters on it", () => {
    const { s: s0, ap } = setup([]);
    const b = nextOf(s0, ap, 1);
    const curse = toZone(s0, ap, curseOfTheCabal(), "exile");
    s0.objects[curse]!.counters.time = 2;
    const bs = [0, 1, 2, 3, 4].map(() => putOnBattlefield(s0, b, grizzlyBears()));
    // To B's upkeep: B (a bot with five permanents) sacrifices one.
    let s = playUntil(s0, (x) => x.activePlayer === b && x.step === "draw", [ap]);
    expect(bs.filter((id) => zone(s, id) === "graveyard")).toHaveLength(1);
    expect(s.objects[curse]!.counters.time).toBe(4);
    // The next player, with no permanents, doesn't.
    const c = nextOf(s0, ap, 2);
    s = playUntil(s, (x) => x.activePlayer === c && x.step === "draw", [ap]);
    expect(s.objects[curse]!.counters.time).toBe(4);
    // At A's own upkeep A is asked too; declining, the suspend counter comes off.
    s = playUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === ap);
    expect(s.activePlayer).toBe(ap);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = playUntil(s, (x) => x.activePlayer === ap && x.step === "draw", [ap]);
    expect(s.objects[curse]!.counters.time).toBe(3);
  });

  it("Curse of the Cabal: a player with no permanent to sacrifice isn't asked", () => {
    const { s: s0, ap } = setup([]);
    const curse = toZone(s0, ap, curseOfTheCabal(), "exile");
    s0.objects[curse]!.counters.time = 2;
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      delete s0.objects[id];
    }
    invalidateCharacteristics(s0);
    // Round to A's next draw step with no question for A: only suspend's counter comes off.
    let s = playUntil(s0, (x) => x.activePlayer !== ap, [ap]);
    s = playUntil(s, (x) => x.activePlayer === ap && x.step === "draw", [ap]);
    expect(s.objects[curse]!.counters.time).toBe(1);
  });

  it("Curse of the Cabal: not suspended (no time counters), the upkeep ability does nothing", () => {
    const { s: s0, ap } = setup([]);
    const b = nextOf(s0, ap, 1);
    const curse = toZone(s0, ap, curseOfTheCabal(), "exile");
    [0, 1, 2, 3, 4].map(() => putOnBattlefield(s0, b, grizzlyBears()));
    const s = playUntil(s0, (x) => x.activePlayer === b && x.step === "draw", [ap]);
    expect(s.objects[curse]!.counters.time ?? 0).toBe(0);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === b)).toHaveLength(5);
  });
});

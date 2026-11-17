// Round 395 (Lane A): cards each opponent exiles until a nonland card, one of them cast for free at your end step if a
// permanent left the battlefield under your control (Krang & Shredder), a spell of mana value 5 or more copied when an
// opponent's revealed top card shares a card type with it (Gandalf, Westward Voyager), and damage divided by the most one
// source dealt to one permanent or player this turn (Impact Resonance).

import { describe, expect, it } from "vitest";
import { act, bear, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { dealDamage, objectSource } from "../src/damage";

// Real card data (Scryfall).
const krang = (): CardDef => ({"oracleId":"2385c8fb-9c38-4ff3-8f61-4e25a8c7d46b","name":"Krang & Shredder","manaCost":"{4}{U/B}{U/B}","cmc":6,"typeLine":"Legendary Creature — Utrom Human Ninja","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Utrom","Human","Ninja"],"oracleText":"Whenever Krang & Shredder enter or attack, each opponent exiles cards from the top of their library until they exile a nonland card.\nDisappear — At the beginning of your end step, if a permanent left the battlefield under your control this turn, you may cast a card exiled with Krang & Shredder without paying its mana cost.","power":"6","toughness":"7","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Disappear"],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b5437e2-e3f4-4c19-a2aa-a75f65a001bb.jpg?1783904075","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b5437e2-e3f4-4c19-a2aa-a75f65a001bb.jpg?1783904075","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gandalf = (): CardDef => ({"oracleId":"4563ae4b-6226-4cc9-abde-582d0ab83433","name":"Gandalf, Westward Voyager","manaCost":"{3}{G}{U}","cmc":5,"typeLine":"Legendary Creature — Avatar Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar","Wizard"],"oracleText":"Whenever you cast a spell with mana value 5 or greater, each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card. (A copy of a permanent spell becomes a token.)","power":"5","toughness":"5","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/6/56910251-6339-4f8b-b863-29caab4965d8.jpg?1783916038","artUrl":"https://cards.scryfall.io/art_crop/front/5/6/56910251-6339-4f8b-b863-29caab4965d8.jpg?1783916038","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const resonance = (): CardDef => ({"oracleId":"94846856-fe68-4ada-8c34-a54de568e803","name":"Impact Resonance","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Impact Resonance deals X damage divided as you choose among any number of target creatures, where X is the greatest amount of damage dealt by a source to a permanent or player this turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/42be7ec3-4c40-43f2-b1f8-d785069d4fdc.jpg?1783938867","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/42be7ec3-4c40-43f2-b1f8-d785069d4fdc.jpg?1783938867","commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const earthquake = (): CardDef => ({"oracleId":"9a40614b-50a3-422c-849e-53c8b7d3d204","name":"Earthquake","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Earthquake deals X damage to each creature without flying and each player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const linked = (s: GameState, id: ObjectId) => (s.linkedExile?.[`${id}@${s.objects[id]!.zoneChanges ?? 0}`] ?? []).map((l) => l.id);

describe("round 395: compiles", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [krang(), gandalf(), resonance()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Krang & Shredder", () => {
  it("as it enters each opponent exiles cards until a nonland card, all of them linked to it, lands too", () => {
    const { s: s0, ap, ids } = setup([krang()]);
    const [o1, o2, o3] = others(s0, ap) as [PlayerId, PlayerId, PlayerId];
    const div = onTop(s0, o1, divination());
    const lands = [onTop(s0, o1, forest), onTop(s0, o1, forest)];
    const b2 = onTop(s0, o2, bear());
    const b3 = onTop(s0, o3, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const k = ids[0]!;
    expect(s.objects[k]!.zone).toBe("battlefield");
    for (const id of [div, ...lands, b2, b3]) expect(s.objects[id]!.zone).toBe("exile");
    expect(linked(s, k).sort()).toEqual([div, ...lands, b2, b3].sort());
  });

  it("an opponent with no nonland card exiles their whole library", () => {
    const { s: s0, ap, ids } = setup([krang()]);
    const o1 = others(s0, ap)[0]!;
    s0.players[o1]!.library = s0.players[o1]!.library.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest").slice(0, 3);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.players[o1]!.library).toHaveLength(0);
    expect(linked(s, ids[0]!).filter((id) => s.objects[id]!.owner === o1)).toHaveLength(3);
  });

  /** Krang & Shredder cast (its enters trigger resolved) with Divination on top of the next opponent's library. */
  const withKrang = (extra: CardDef[] = []) => {
    const { s: s0, ap, ids } = setup([krang(), ...extra]);
    const o1 = others(s0, ap)[0]!;
    const div = onTop(s0, o1, divination());
    const mine = putOnBattlefield(s0, ap, bear());
    return { s: settle(run(s0, planCast(s0, ap, ids[0]!)), ap), ap, ids, o1, div, mine };
  };

  it("disappear: at your end step, if a permanent left the battlefield under your control, you may cast one of them free (lands not offered)", () => {
    const { s: s1, ap, ids, o1, div, mine } = withKrang([murder()]);
    let s = settle(run(s1, planCast(s1, ap, ids[1]!, [{ kind: "object", id: mine }])), ap);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "end", ap);
    s = settle(s, ap);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "castFromAmong" && p.player === ap).toBe(true);
    if (p?.kind !== "chooseOption") throw new Error("no choice");
    // Only the nonland cards exiled with it, and "Done".
    for (const o of p.options.filter((x) => x !== "none")) expect(s.cards[s.objects[o]!.cardId]!.types).not.toContain("Land");
    expect(p.options).toContain(div);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: div }), ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: div });
    const pool = JSON.stringify(s.players[ap]!.manaPool);
    s = settle(run(s, planCast(s, ap, div)), ap);
    expect(JSON.stringify(s.players[ap]!.manaPool)).toBe(pool);
    expect(s.objects[div]!.zone).toBe("graveyard");
    expect(s.objects[div]!.owner).toBe(o1);
    // Divination drew you two cards, cast without paying its mana cost.
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("disappear doesn't trigger if no permanent left the battlefield under your control this turn (intervening if)", () => {
    const { s: s1, ap } = withKrang();
    let s = passUntil(s1, "end", ap);
    expect(s.stack.some((x) => x.description.startsWith("Krang & Shredder"))).toBe(false);
    s = settle(s, ap);
    expect(s.pending).toBeNull();
  });

  it("its attack trigger exiles more cards with it, and they can be cast later too", () => {
    const { s: s1, ap, o1, div } = withKrang();
    const k = s1.battlefield.find((id) => s1.cards[s1.objects[id]!.cardId]!.name === "Krang & Shredder")!;
    s1.objects[k]!.controlledSinceTurn = -1;
    const before = linked(s1, k).length;
    const top = onTop(s1, o1, divination());
    let s = passUntil(s1, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: o1 }] });
    s = settle(s, ap);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(linked(s, k).length).toBeGreaterThan(before);
    expect(linked(s, k)).toContain(div);
    expect(linked(s, k)).toContain(top);
  });
});

describe("Gandalf, Westward Voyager", () => {
  /** Gandalf on your battlefield; each opponent's top card is `tops[i]` (Forest when not given). */
  const begin = (hand: CardDef[], tops: (CardDef | undefined)[]) => {
    const { s, ap, ids } = setup(hand);
    putOnBattlefield(s, ap, gandalf());
    const opps = others(s, ap);
    opps.forEach((pid, i) => onTop(s, pid, tops[i] ?? forest));
    return { s, ap, ids, opps };
  };
  const lifeOf = (s: GameState, opps: PlayerId[]) => opps.reduce((n, p) => n + s.players[p]!.life, 0);

  it("a revealed card that shares a card type with the spell: the spell is copied and each opponent draws a card", () => {
    const { s: s0, ap, ids, opps } = begin([lavaAxe()], [undefined, divination()]);
    const hands = opps.map((p) => s0.players[p]!.hand.length);
    const life = lifeOf(s0, opps);
    const mine = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opps[0]! }])));
    // Lava Axe and its copy: 10 damage among the opponents.
    expect(life - lifeOf(s, opps)).toBe(10);
    opps.forEach((p, i) => expect(s.players[p]!.hand.length).toBe(hands[i]! + 1));
    expect(s.players[ap]!.hand.length).toBe(mine - 1);
  });

  it("only one copy however many revealed cards share a type (rulings)", () => {
    const { s: s0, ap, ids, opps } = begin([lavaAxe()], [divination(), divination(), divination()]);
    const life = lifeOf(s0, opps);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opps[0]! }])));
    expect(life - lifeOf(s, opps)).toBe(10);
  });

  it("none shares a card type: you draw a card and nothing is copied", () => {
    const { s: s0, ap, ids, opps } = begin([lavaAxe()], [bear(), undefined, bear()]);
    const hands = opps.map((p) => s0.players[p]!.hand.length);
    const life = lifeOf(s0, opps);
    const mine = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opps[0]! }])));
    expect(life - lifeOf(s, opps)).toBe(5);
    opps.forEach((p, i) => expect(s.players[p]!.hand.length).toBe(hands[i]!));
    expect(s.players[ap]!.hand.length).toBe(mine);
    // The revealed cards stay on top.
    opps.forEach((p) => expect(s.players[p]!.library.length).toBeGreaterThan(0));
  });

  it("a creature spell copied becomes a token", () => {
    const { s: s0, ap, ids } = begin([wurm()], [bear()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const wurms = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Craw Wurm" || s.objects[id]!.isToken && s.objects[id]!.cardId === s.objects[ids[0]!]!.cardId);
    expect(wurms).toHaveLength(2);
    expect(wurms.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
  });

  it("a spell with mana value less than 5 doesn't trigger it", () => {
    const { s: s0, ap, ids, opps } = begin([divination()], [divination(), divination(), divination()]);
    const hands = opps.map((p) => s0.players[p]!.hand.length);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    opps.forEach((p, i) => expect(s.players[p]!.hand.length).toBe(hands[i]!));
  });
});

describe("Impact Resonance", () => {
  const tgt = (id: ObjectId) => ({ kind: "object" as const, id });
  const dmg = (s: GameState, id: ObjectId) => s.objects[id]!.damage ?? 0;

  it("X is the most one source dealt to one permanent or player this turn: divided among any number of target creatures", () => {
    const { s: s0, ap, ids, opp } = setup([bolt(), resonance()]);
    const [b1, b2, b3] = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear({ name: "Bear Three", toughness: "4" }))];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b1)])));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.turnLog?.greatestDamage).toBe(3);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ ...tgt(b2), amount: 2 }, { ...tgt(b3), amount: 1 }])));
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(dmg(s, b3)).toBe(1);
  });

  it("one source's damage to one player over the turn is added up; different sources aren't", () => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear({ name: "Other Bears" }));
    dealDamage(s, objectSource(s, s.objects[a]!), { player: opp }, 2);
    dealDamage(s, objectSource(s, s.objects[b]!), { player: opp }, 3);
    expect(s.turnLog?.greatestDamage).toBe(3);
    dealDamage(s, objectSource(s, s.objects[a]!), { player: opp }, 2);
    expect(s.turnLog?.greatestDamage).toBe(4);
  });

  it("damage dealt to several things at once counts once for each (Earthquake for 2 is 2)", () => {
    const { s: s0, ap, ids, opp } = setup([earthquake()]);
    putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2)));
    expect(s.turnLog?.greatestDamage).toBe(2);
  });

  it("with no damage dealt this turn, X is 0", () => {
    const { s: s0, ap, ids } = setup([resonance()]);
    expect(s0.turnLog?.greatestDamage ?? 0).toBe(0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

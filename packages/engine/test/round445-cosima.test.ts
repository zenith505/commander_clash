// Round 445 (Lane A): Cosima, God of the Voyage // The Omenkeel ("At the beginning of your upkeep, you may exile Cosima.
// If you do, it gains "Whenever a land you control enters, if Cosima is exiled, you may put a voyage counter on it. If you
// don't, return Cosima to the battlefield with X +1/+1 counters on it and draw X cards, where X is the number of voyage
// counters on it."" and "Whenever a Vehicle you control deals combat damage to a player, that player exiles that many cards
// from the top of their library. You may play lands from among those cards for as long as they remain exiled.": CR
// 400.7j, 611.2c, 113.6k, 113.8, 603.4, 122.6, 305.2; rulings).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, characteristics, compileCard, faceDef, invalidateCharacteristics, isFullySupported, restingDef, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const cosima = (): CardDef => ({"oracleId":"648100cd-d44a-48f8-87e4-a1d5467f348c","name":"Cosima, God of the Voyage // The Omenkeel","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — God // Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"At the beginning of your upkeep, you may exile Cosima. If you do, it gains \"Whenever a land you control enters, if Cosima is exiled, you may put a voyage counter on it. If you don't, return Cosima to the battlefield with X +1/+1 counters on it and draw X cards, where X is the number of voyage counters on it.\"","power":"2","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b660733-6ed4-49a6-ae4c-e9e4f9c851cf.jpg?1783928158","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b660733-6ed4-49a6-ae4c-e9e4f9c851cf.jpg?1783928158","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Cosima, God of the Voyage","manaCost":"{2}{U}","typeLine":"Legendary Creature — God","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"At the beginning of your upkeep, you may exile Cosima. If you do, it gains \"Whenever a land you control enters, if Cosima is exiled, you may put a voyage counter on it. If you don't, return Cosima to the battlefield with X +1/+1 counters on it and draw X cards, where X is the number of voyage counters on it.\"","power":"2","toughness":"4","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b660733-6ed4-49a6-ae4c-e9e4f9c851cf.jpg?1783928158","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b660733-6ed4-49a6-ae4c-e9e4f9c851cf.jpg?1783928158"},{"name":"The Omenkeel","manaCost":"{1}{U}","typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Whenever a Vehicle you control deals combat damage to a player, that player exiles that many cards from the top of their library. You may play lands from among those cards for as long as they remain exiled.\nCrew 1","power":"3","toughness":"3","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/9/b/9b660733-6ed4-49a6-ae4c-e9e4f9c851cf.jpg?1783928158","artUrl":"https://cards.scryfall.io/art_crop/back/9/b/9b660733-6ed4-49a6-ae4c-e9e4f9c851cf.jpg?1783928158"}]}) as CardDef;

/** A new card for `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** On to `ap`'s next upkeep, where Cosima's trigger asks; exile it (or not). */
const upkeepExile = (s: GameState, ap: PlayerId, yes: boolean) => {
  s = settle(passUntil(s, "upkeep", ap), ap);
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
  expect(s.pending?.kind === "chooseMay" && s.pending.prompt).toMatch(/exile Cosima/);
  return settle(act(s, { type: "chooseMay", player: ap, yes }), ap);
};
/** In `ap`'s first main phase, play a Forest from their hand. */
const playForest = (s: GameState, ap: PlayerId) => {
  s = passUntil(s, "main1", ap);
  const l = inHand(s, ap, forest);
  return settle(act(s, { type: "playLand", player: ap, objectId: l }), ap);
};
const board = () => {
  const { s, ap, opp } = setup([]);
  const c = putOnBattlefield(s, ap, cosima());
  return { s, ap, opp, c };
};

describe("round 445: Cosima, God of the Voyage", () => {
  it("is fully supported, both faces", () => {
    expect(isFullySupported(cosima())).toBe(true);
    const d = restingDef(cosima());
    const front = compileCard(faceDef(d, 0));
    expect(front.unsupported).toEqual([]);
    expect(front.triggers[0]).toMatchObject({ event: "yourUpkeep", body: { effects: [{ type: "may", effects: [{ type: "exile", what: { ref: "self" }, setsDid: true }] }, { type: "if", cond: { kind: "youDid" }, effects: [{ type: "gainInExile" }] }] } });
    const back = compileCard(faceDef(d, 1));
    expect(back.unsupported).toEqual([]);
    expect(back.triggers[0]).toMatchObject({ event: "creatureYouControlDealsCombatDamageToPlayer", body: { effects: [{ type: "exileTopLandsPlayable", who: { ref: "eventPlayer" }, n: { count: { kind: "eventAmount" } } }] } });
  });

  it("exiled at your upkeep, it gains the ability; a land you control entering then puts a voyage counter on it", () => {
    const b = board();
    let s = upkeepExile(b.s, b.ap, true);
    const o = s.objects[b.c]!;
    expect(o.zone).toBe("exile");
    expect(o.gainedInExile?.zc).toBe(o.zoneChanges);
    s = playForest(s, b.ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: b.ap });
    expect(s.pending?.kind === "chooseMay" && s.pending.prompt).toMatch(/voyage counter on Cosima/);
    s = settle(act(s, { type: "chooseMay", player: b.ap, yes: true }), b.ap);
    expect(s.objects[b.c]!.zone).toBe("exile");
    expect(s.objects[b.c]!.counters.voyage).toBe(1);
  });

  it("not putting a counter returns it with X +1/+1 counters and draws X, X its voyage counters in exile", () => {
    const b = board();
    let s = upkeepExile(b.s, b.ap, true);
    s = playForest(s, b.ap);
    s = settle(act(s, { type: "chooseMay", player: b.ap, yes: true }), b.ap);
    s.objects[b.c]!.counters.voyage = 3;
    // Next turn: it's exiled, so its own upkeep ability doesn't trigger (CR 113.6).
    s = settle(passUntil(s, "upkeep", b.ap), b.ap);
    expect(s.pending).toBeNull();
    s = passUntil(s, "main1", b.ap);
    const hand = s.players[b.ap]!.hand.length;
    s = playForest(s, b.ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: b.ap });
    s = settle(act(s, { type: "chooseMay", player: b.ap, yes: false }), b.ap);
    const o = s.objects[b.c]!;
    expect(o.zone).toBe("battlefield");
    expect(o.controller).toBe(b.ap);
    expect(o.counters["+1/+1"]).toBe(3);
    expect(o.counters.voyage).toBeUndefined();
    expect(characteristics(s, o).name).toBe("Cosima, God of the Voyage");
    // The Forest left the hand, three cards came in.
    expect(s.players[b.ap]!.hand.length).toBe(hand + 3);
  });

  it("with no voyage counters it may still return, with no counters and no cards drawn (rulings)", () => {
    const b = board();
    let s = passUntil(upkeepExile(b.s, b.ap, true), "main1", b.ap);
    const hand = s.players[b.ap]!.hand.length;
    s = playForest(s, b.ap);
    s = settle(act(s, { type: "chooseMay", player: b.ap, yes: false }), b.ap);
    expect(s.objects[b.c]!.zone).toBe("battlefield");
    expect(s.objects[b.c]!.counters["+1/+1"]).toBeUndefined();
    expect(s.players[b.ap]!.hand.length).toBe(hand);
  });

  it("declined at upkeep, it stays on the battlefield and gains nothing", () => {
    const b = board();
    let s = upkeepExile(b.s, b.ap, false);
    expect(s.objects[b.c]!.zone).toBe("battlefield");
    expect(s.objects[b.c]!.gainedInExile).toBeUndefined();
    s = playForest(s, b.ap);
    expect(s.pending).toBeNull();
  });

  it("a Cosima exiled some other way has no such ability", () => {
    const b = board();
    const s0 = b.s;
    s0.battlefield.splice(s0.battlefield.indexOf(b.c), 1);
    s0.objects[b.c]!.zone = "exile";
    s0.players[b.ap]!.exile.push(b.c);
    invalidateCharacteristics(s0);
    const s = playForest(passUntil(s0, "upkeep", b.ap), b.ap);
    expect(s.pending).toBeNull();
    expect(s.objects[b.c]!.zone).toBe("exile");
  });

  it("an opponent's land entering doesn't trigger it", () => {
    const b = board();
    let s = upkeepExile(b.s, b.ap, true);
    s = playForest(s, b.opp);
    expect(s.pending).toBeNull();
    expect(s.objects[b.c]!.counters.voyage).toBeUndefined();
  });

  it("gone from exile before the ability resolves, nothing happens, even if it's exiled again (rulings, CR 603.4)", () => {
    const b = board();
    let s = upkeepExile(b.s, b.ap, true);
    s = passUntil(s, "main1", b.ap);
    const l = inHand(s, b.ap, forest);
    s = act(s, { type: "playLand", player: b.ap, objectId: l });
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(0);
    // It leaves exile and comes back: a new object (CR 400.7), without the ability.
    const o = s.objects[b.c]!;
    o.zoneChanges = (o.zoneChanges ?? 0) + 2;
    invalidateCharacteristics(s);
    const hand = s.players[b.ap]!.hand.length;
    s = settle(s, b.ap);
    expect(s.pending).toBeNull();
    expect(s.objects[b.c]!.zone).toBe("exile");
    expect(s.players[b.ap]!.hand.length).toBe(hand);
  });
});

describe("round 445: Cosima, bots", () => {
  it("exile it at upkeep unless it's their commander, then add voyage counters until three", () => {
    const b = board();
    let s = settle(passUntil(b.s, "upkeep", b.ap), b.ap);
    expect(botActions(s, b.ap)).toEqual([{ type: "chooseMay", player: b.ap, yes: true }]);
    s.objects[b.c]!.isCommander = true;
    expect(botActions(s, b.ap)).toEqual([{ type: "chooseMay", player: b.ap, yes: false }]);
    s.objects[b.c]!.isCommander = false;
    s = playForest(settle(act(s, { type: "chooseMay", player: b.ap, yes: true }), b.ap), b.ap);
    expect(botActions(s, b.ap)).toEqual([{ type: "chooseMay", player: b.ap, yes: true }]);
    s.objects[b.c]!.counters.voyage = 3;
    expect(botActions(s, b.ap)).toEqual([{ type: "chooseMay", player: b.ap, yes: false }]);
  });
});

describe("round 445: The Omenkeel", () => {
  /** The Omenkeel attacking `opp` as a creature (crewed, here an effect), with `top` the top of their library. */
  const attack = (forestFirst: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, cosima());
    s0.objects[k]!.face = 1;
    invalidateCharacteristics(s0);
    addEffect(s0, ap, [k], [{ kind: "addTypes", types: ["Artifact", "Creature"], subtypes: [] }]);
    const lib = s0.players[opp]!.library;
    const name = (id: ObjectId) => s0.cards[s0.objects[id]!.cardId]!.name;
    const f = lib.filter((id) => name(id) === "Forest").slice(0, 2);
    const g = lib.find((id) => name(id) === "Grizzly Bears")!;
    const top = forestFirst ? [f[0]!, g, f[1]!] : [g, f[0]!, f[1]!];
    s0.players[opp]!.library = [...top, ...lib.filter((id) => !top.includes(id))];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    s = settle(s, ap);
    for (let i = 0; i < 20 && s.step !== "main2"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    return { s, ap, opp, k, top };
  };

  it("a Vehicle you control dealing combat damage: that player exiles that many cards, and you may play the lands", () => {
    const { s, ap, opp, top } = attack(true);
    expect(characteristics(s, s.objects[top[0]!]!).name).toBe("Forest");
    expect(s.players[opp]!.life).toBe(37);
    for (const id of top) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.objects[top[0]!]!.mayPlay).toMatchObject({ player: ap, until: "exiled", landOnly: true });
    // The Grizzly Bears can't be cast: lands only.
    expect(s.objects[top[1]!]!.mayPlay).toBeUndefined();
    expect(castProblem(s, ap, top[1]!)).toBeTruthy();
    // A land play of yours (rulings: no extra land play).
    const s2 = settle(act(s, { type: "playLand", player: ap, objectId: top[0]! }), ap);
    expect(s2.objects[top[0]!]!.zone).toBe("battlefield");
    expect(s2.objects[top[0]!]!.controller).toBe(ap);
    expect(() => act(s2, { type: "playLand", player: ap, objectId: top[2]! })).toThrow();
  });

  it("the permission lasts while the cards stay exiled, after The Omenkeel is gone (rulings)", () => {
    const { s: s0, ap, k, top } = attack(false);
    s0.battlefield.splice(s0.battlefield.indexOf(k), 1);
    s0.objects[k]!.zone = "graveyard";
    s0.objects[k]!.zoneChanges = (s0.objects[k]!.zoneChanges ?? 0) + 1;
    s0.players[ap]!.graveyard.push(k);
    invalidateCharacteristics(s0);
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: top[1]! }), ap);
    expect(s.objects[top[1]!]!.zone).toBe("battlefield");
  });

  it("an opponent can't play them", () => {
    const { s, opp, top } = attack(true);
    expect(() => act(s, { type: "playLand", player: opp, objectId: top[0]! })).toThrow();
  });
});

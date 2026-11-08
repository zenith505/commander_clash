// Lane B round B143: the Oaths (Oath of Druids, Oath of Lieges, Oath of Mages, Oath of Scholars, Oath of Ghouls). At the
// beginning of each player's upkeep, that player chooses the target for the Oath's controller: an opponent of theirs who
// has more (Ghouls: fewer) of something than they do. That's part of the targeting requirement, so with no such player the
// trigger is removed (CR 603.3d) and it doesn't resolve if it's no longer true (CR 608.2b; rulings). Then the first player
// may do what it says, as the one doing it (CR 101.4).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const druids = (): CardDef => ({"oracleId":"cf0dcb27-f02e-4065-81dc-75fbbb09ea3f","name":"Oath of Druids","manaCost":"{1}{G}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player chooses target player who controls more creatures than they do and is their opponent. The first player may reveal cards from the top of their library until they reveal a creature card. If the first player does, that player puts that card onto the battlefield and all other cards revealed this way into their graveyard.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf14de50-d123-400c-862e-2c95fd2aa23f.jpg?1783946504","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf14de50-d123-400c-862e-2c95fd2aa23f.jpg?1783946504","commanderLegal":"legal","set":"exo","releasedAt":"1998-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lieges = (): CardDef => ({"oracleId":"87038354-6762-4069-be34-7d40ae308a8d","name":"Oath of Lieges","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player chooses target player who controls more lands than they do and is their opponent. The first player may search their library for a basic land card, put that card onto the battlefield, then shuffle.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/470a2092-eeda-4557-8cee-ac401b61a225.jpg?1783946530","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/470a2092-eeda-4557-8cee-ac401b61a225.jpg?1783946530","commanderLegal":"legal","set":"exo","releasedAt":"1998-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mages = (): CardDef => ({"oracleId":"2b749918-f425-4243-aabb-7350bb74403c","name":"Oath of Mages","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player chooses target player who has more life than they do and is their opponent. The first player may have this enchantment deal 1 damage to the second player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/ed8708d2-2c73-4da5-b6ff-41c083b59caa.jpg?1783946510","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/ed8708d2-2c73-4da5-b6ff-41c083b59caa.jpg?1783946510","commanderLegal":"legal","set":"exo","releasedAt":"1998-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const scholars = (): CardDef => ({"oracleId":"da4a5129-b005-4fc6-b175-0416627881db","name":"Oath of Scholars","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player chooses target player who has more cards in hand than they do and is their opponent. The first player may discard their hand and draw three cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d61376ad-21c8-4d34-b37d-ed60877f5d4a.jpg?1783946523","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d61376ad-21c8-4d34-b37d-ed60877f5d4a.jpg?1783946523","commanderLegal":"legal","set":"exo","releasedAt":"1998-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ghouls = (): CardDef => ({"oracleId":"b9490b52-6c3f-437b-b2c2-9e81c4b43b61","name":"Oath of Ghouls","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player chooses target player whose graveyard has fewer creature cards in it than their graveyard does and is their opponent. The first player may return a creature card from their graveyard to their hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/1102f35a-ae62-479d-b61c-31a82978aedd.jpg?1783946515","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/1102f35a-ae62-479d-b61c-31a82978aedd.jpg?1783946515","commanderLegal":"legal","set":"exo","releasedAt":"1998-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const phoenix = (): CardDef => ({"oracleId":"279e573d-b7a3-4e62-a708-3ec992d97972","name":"Retriever Phoenix","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Phoenix","supertypes":[],"types":["Creature"],"subtypes":["Phoenix"],"oracleText":"Flying, haste\nWhen this creature enters, if you cast it, learn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or discard a card to draw a card.)\nAs long as this card is in your graveyard, if you would learn, you may instead return this card to the battlefield.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Haste","Learn"],"imageUrl":"https://cards.scryfall.io/normal/front/4/d/4dd6cb53-3c82-4ac3-be1e-311322729198.jpg?1783927349","artUrl":"https://cards.scryfall.io/art_crop/front/4/d/4dd6cb53-3c82-4ac3-be1e-311322729198.jpg?1783927349","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const igneous = (): CardDef => ({"oracleId":"2e31af8f-5e94-4888-857d-911253eac2cd","name":"Igneous Inspiration","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Igneous Inspiration deals 3 damage to any target.\nLearn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or discard a card to draw a card.)","colors":["R"],"colorIdentity":["R"],"keywords":["Learn"],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/5781ad7b-dc1b-4cc1-9e72-6e714b9ba1de.jpg?1783927354","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/5781ad7b-dc1b-4cc1-9e72-6e714b9ba1de.jpg?1783927354","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gambit = (): CardDef => ({"oracleId":"fab8c985-d7a9-41eb-9884-01128b97af5c","name":"Flaming Gambit","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Flaming Gambit deals X damage to target player or planeswalker. That player or that planeswalker's controller may choose a creature they control and have Flaming Gambit deal that damage to it instead.\nFlashback {X}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fb7fd9b7-c394-4ab3-b945-b4aab694eb6a.jpg?1783945149","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fb7fd9b7-c394-4ab3-b945-b4aab694eb6a.jpg?1783945149","commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5", oracleText: "+1: You gain 1 life." });
const hexBeast = card("Test Hexproof Beast", "Creature — Beast", "{2}{G}", { power: "2", toughness: "2", keywords: ["Hexproof"], oracleText: "Hexproof" });
const sanctity = card("Leyline of Sanctity", "Enchantment", "{2}{W}{W}", { oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const who = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
/** Everyone passes until the stack is empty; chooseMay answered with `may`, questions of `me` stop it, bots answer the rest. */
const settle = (s: GameState, opts: { me?: PlayerId[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** `n` cards from the top of `pid`'s library put into their `zone`; returns their ids. */
const from = (s: GameState, pid: PlayerId, n: number, zone: "hand" | "graveyard", creature?: boolean) => {
  const p = s.players[pid]!;
  const ids = p.library.filter((id) => creature === undefined || (name(s, id) === "Grizzly Bears") === creature).slice(0, n);
  for (const id of ids) {
    p.library.splice(p.library.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    p[zone].push(id);
  }
  invalidateCharacteristics(s);
  return ids;
};
/** Empties `pid`'s hand into their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = [];
};
const creatures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Creature"));
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));

describe("Lane B round B143: the Oaths", () => {
  it("compiles all five Oaths", () => supported(druids(), lieges(), mages(), scholars(), ghouls()));

  it("Oath of Druids: the upkeep's player chooses an opponent with more creatures, then may reveal until a creature card", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c, d] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    putOnBattlefield(s, ap, druids());
    putOnBattlefield(s, ap, bear({ name: "Test Own Bear" }));
    putOnBattlefield(s, c, bear({ name: "Test Bear One" }));
    putOnBattlefield(s, c, bear({ name: "Test Bear Two" }));
    s = passUntil(s, "upkeep", b);
    const p = s.pending;
    // That player chooses the target for the Oath's controller.
    expect(p?.kind === "chooseTargets" && p.player === b && p.controller === ap).toBe(true);
    // Not themselves, nor an opponent with no more creatures than they have.
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(b)] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(d)] })).toThrow();
    // The Oath's controller is one of their opponents too.
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(ap)] })).not.toThrow();
    s = act(s, { type: "chooseTargets", player: b, targets: [who(c)] });
    // Two lands on top, then a creature card.
    const lib = s.players[b]!.library;
    const [f1, f2] = lib.filter((id) => name(s, id) === "Forest");
    const bearCard = lib.find((id) => name(s, id) === "Grizzly Bears")!;
    s.players[b]!.library = [f1!, f2!, bearCard, ...lib.filter((id) => id !== f1 && id !== f2 && id !== bearCard)];
    s = settle(s, { me: [b] });
    const may = s.pending;
    expect(may?.kind === "chooseMay" && may.player === b).toBe(true);
    s = act(s, { type: "chooseMay", player: b, yes: true });
    s = settle(s);
    expect(s.objects[bearCard]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[bearCard]!)).toBe(b);
    expect(s.objects[f1!]!.zone).toBe("graveyard");
    expect(s.objects[f2!]!.zone).toBe("graveyard");
    expect(s.players[b]!.graveyard).toEqual(expect.arrayContaining([f1, f2]));
  });

  it("Oath of Druids: declining reveals nothing", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c] = [next(s, ap), next(s, ap, 2)];
    putOnBattlefield(s, ap, druids());
    putOnBattlefield(s, c, bear({ name: "Test Bear One" }));
    s = passUntil(s, "upkeep", b);
    s = act(s, { type: "chooseTargets", player: b, targets: [who(c)] });
    const before = s.players[b]!.library.length;
    s = settle(s, { may: false });
    expect(s.players[b]!.library.length).toBe(before);
    expect(creatures(s, b)).toHaveLength(0);
  });

  it("with no opponent who outnumbers the upkeep's player, the trigger is removed (CR 603.3d)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const b = next(s, ap);
    putOnBattlefield(s, ap, druids());
    putOnBattlefield(s, b, bear({ name: "Test Bear One" }));
    s = passUntil(s, "upkeep", b);
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
    expect(s.log.some((l) => /Oath of Druids's ability has no legal targets and is removed/.test(l.text))).toBe(true);
  });

  it("a player with hexproof can't be chosen: the Oath's controller targets (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c] = [next(s, ap), next(s, ap, 2)];
    putOnBattlefield(s, ap, druids());
    putOnBattlefield(s, c, sanctity);
    putOnBattlefield(s, c, bear({ name: "Test Bear One" }));
    putOnBattlefield(s, ap, bear({ name: "Test Own Bear" }));
    s = passUntil(s, "upkeep", b);
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(c)] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(ap)] })).not.toThrow();
  });

  it("Oath of Mages: 1 damage to the second player, unless they no longer have more life as it resolves", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c, d] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    putOnBattlefield(s, ap, mages());
    s.players[b]!.life = 30;
    s.players[c]!.life = 35;
    s.players[d]!.life = 20;
    s.players[ap]!.life = 30;
    s = passUntil(s, "upkeep", b);
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(ap)] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(d)] })).toThrow();
    const chosen = act(s, { type: "chooseTargets", player: b, targets: [who(c)] });
    // It does: the Oath deals the damage.
    const yes = settle(structuredClone(chosen), { may: true });
    expect(yes.players[c]!.life).toBe(34);
    expect(yes.log.some((l) => /Oath of Mages deals 1 damage/.test(l.text))).toBe(true);
    // C falls to 29 life before it resolves: no longer more than B's 30, so it doesn't resolve (rulings).
    let no = structuredClone(chosen);
    no.players[c]!.life = 29;
    no = settle(no, { me: [b] });
    expect(no.pending).toBeFalsy();
    expect(no.stack).toHaveLength(0);
    expect(no.players[c]!.life).toBe(29);
  });

  it("Oath of Scholars: an opponent with more cards in hand; the first player may discard their hand and draw three", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c, d] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    putOnBattlefield(s, ap, scholars());
    for (const p of [ap, b, c, d]) emptyHand(s, p);
    const [kept] = from(s, b, 1, "hand");
    from(s, c, 4, "hand");
    s = passUntil(s, "upkeep", b);
    // Only C has more cards in hand than B.
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(ap)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: b, targets: [who(c)] });
    s = settle(s, { may: true });
    expect(s.objects[kept!]!.zone).toBe("graveyard");
    expect(s.players[b]!.hand).toHaveLength(3);
    expect(s.players[c]!.hand).toHaveLength(4);
  });

  it("Oath of Ghouls: an opponent with fewer creature cards in their graveyard; the first player may return one", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c, d] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    putOnBattlefield(s, ap, ghouls());
    const yard = from(s, b, 2, "graveyard", true);
    from(s, c, 2, "graveyard", true);
    from(s, d, 3, "graveyard", false);
    s = passUntil(s, "upkeep", b);
    // C has as many creature cards as B: not fewer. D's lands don't count.
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(c)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: b, targets: [who(d)] });
    s = settle(s, { may: true });
    expect(yard.filter((id) => s.objects[id]!.zone === "hand")).toHaveLength(1);
    expect(s.players[b]!.hand).toEqual(expect.arrayContaining([yard.find((id) => s.objects[id]!.zone === "hand")]));
  });

  it("Oath of Lieges: an opponent with more lands; the basic land enters under the first player's control (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c] = [next(s, ap), next(s, ap, 2)];
    putOnBattlefield(s, ap, lieges());
    putOnBattlefield(s, b, forest);
    expect(lands(s, b)).toHaveLength(1);
    s = passUntil(s, "upkeep", b);
    // C has no lands, the Oath's controller has many.
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [who(c)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: b, targets: [who(ap)] });
    s = settle(s, { may: true });
    expect(lands(s, b)).toHaveLength(2);
  });

  it("bots choose the target and take what the Oath offers (Druids), but keep a big hand (Scholars)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c] = [next(s, ap), next(s, ap, 2)];
    putOnBattlefield(s, ap, druids());
    putOnBattlefield(s, c, bear({ name: "Test Bear One" }));
    s = passUntil(s, "upkeep", b);
    s = settle(s);
    expect(creatures(s, b)).toHaveLength(1);

    const { s: t0, ap: ap2 } = setup([]);
    let t = t0;
    const [b2, c2] = [next(t, ap2), next(t, ap2, 2)];
    putOnBattlefield(t, ap2, scholars());
    for (const p of t.turnOrder) emptyHand(t, p);
    const big = from(t, b2, 4, "hand");
    from(t, c2, 6, "hand");
    t = passUntil(t, "upkeep", b2);
    t = settle(t);
    expect(big.every((id) => t.objects[id]!.zone === "hand")).toBe(true);
  });
});

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Retriever Phoenix in `pid`'s graveyard. */
const phoenixInYard = (s: GameState, pid: PlayerId) => {
  const id = putOnBattlefield(s, pid, phoenix());
  moveObject(s, id, "graveyard");
  invalidateCharacteristics(s);
  return id;
};

describe("Lane B round B143: Retriever Phoenix", () => {
  it("compiles", () => supported(phoenix(), igneous()));

  it("learning with it in your graveyard: you may return it to the battlefield instead, and nothing else happens", () => {
    const { s: s0, ap, ids } = setup([igneous(), bear({ name: "Test Spare Bear" })]);
    let s = s0;
    const b = next(s, ap);
    const ph = phoenixInYard(s, ap);
    const victim = putOnBattlefield(s, b, bear({ name: "Test Victim" }));
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: victim }]));
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "chooseMay" && p.player === ap && p.insteadOfLearn === ph).toBe(true);
    const hand = [...s.players[ap]!.hand];
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: [ap] });
    // Learn is replaced: no discard asked, no card drawn.
    expect(s.pending).toBeFalsy();
    expect(s.objects[ph]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[ph]!)).toBe(ap);
    expect(s.players[ap]!.hand).toEqual(hand);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    // It wasn't cast, so its own learn doesn't trigger.
    expect(s.stack).toHaveLength(0);
  });

  it("declining it: the learn happens as usual", () => {
    const { s: s0, ap, ids } = setup([igneous(), bear({ name: "Test Spare Bear" })]);
    let s = s0;
    const b = next(s, ap);
    const ph = phoenixInYard(s, ap);
    const victim = putOnBattlefield(s, b, bear({ name: "Test Victim" }));
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: victim }]));
    s = settle(s, { me: [ap] });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    const p = s.pending;
    expect(p?.kind === "chooseMay" && p.player === ap && !p.insteadOfLearn && /discard a card/.test(p.prompt)).toBe(true);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: [ap] });
    // The card to discard (the hand is that card alone).
    expect(s.pending?.kind).toBe("discard");
    s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] });
    s = settle(s, { me: [ap] });
    expect(s.objects[ph]!.zone).toBe("graveyard");
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("dying with its own learn trigger on the stack, it may come back with that trigger (rulings)", () => {
    const { s: s0, ap, ids } = setup([phoenix()]);
    let s = s0;
    s = run(s, planCast(s, ap, ids[0]!));
    // The spell resolves; its enters trigger ("if you cast it, learn") goes on the stack.
    for (let i = 0; i < 20 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    for (let i = 0; i < 5 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack).toHaveLength(1);
    moveObject(s, ids[0]!, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "chooseMay" && p.insteadOfLearn !== undefined).toBe(true);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: [ap] });
    expect(s.battlefield.filter((id) => name(s, id) === "Retriever Phoenix")).toHaveLength(1);
    expect(s.stack).toHaveLength(0);
  });

  it("bots take it back rather than learn", () => {
    const { s: s0, ap, ids } = setup([igneous()]);
    let s = s0;
    const b = next(s, ap);
    const ph = phoenixInYard(s, ap);
    const victim = putOnBattlefield(s, b, bear({ name: "Test Victim" }));
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: victim }]));
    s = settle(s);
    expect(s.objects[ph]!.zone).toBe("battlefield");
  });
});

describe("Lane B round B143: Flaming Gambit", () => {
  it("compiles", () => supported(gambit()));

  /** Ana casts Flaming Gambit with X = 3 at `at` (Ben by default); Ben has a 2/2 and the hexproof 2/2. */
  const start = (at?: (s: GameState, b: PlayerId) => TargetChoice) => {
    const { s: s0, ap, ids } = setup([gambit()]);
    let s = s0;
    const b = next(s, ap);
    const small = putOnBattlefield(s, b, bear({ name: "Test Small Bear" }));
    const hex = putOnBattlefield(s, b, hexBeast);
    const theirs = putOnBattlefield(s, next(s, ap, 2), bear({ name: "Test Other Bear" }));
    const t = at ? at(s, b) : who(b);
    s = run(s, planCast(s, ap, ids[0]!, [t], undefined, undefined, 3));
    s = settle(s, { me: [b] });
    return { s, ap, b, small, hex, theirs };
  };

  it("the target player chooses one of their creatures, even one with hexproof (it isn't targeted), and it takes the damage", () => {
    let { s, b, small, hex, theirs } = start();
    const p = s.pending;
    expect(p?.kind === "pickPermanents" && p.player === b && p.min === 0 && p.count === 1).toBe(true);
    if (p?.kind !== "pickPermanents") return;
    expect(p.options).toEqual(expect.arrayContaining([small, hex]));
    expect(p.options).not.toContain(theirs);
    s = act(s, { type: "pickPermanents", player: b, ids: [hex] });
    s = settle(s, { me: [b] });
    expect(s.objects[hex]!.zone).toBe("graveyard");
    expect(s.players[b]!.life).toBe(40);
  });

  it("choosing none: the target player is dealt the damage", () => {
    let { s, b, small } = start();
    s = act(s, { type: "pickPermanents", player: b, ids: [] });
    s = settle(s, { me: [b] });
    expect(s.players[b]!.life).toBe(37);
    expect(s.objects[small]!.zone).toBe("battlefield");
  });

  it("at a planeswalker: its controller chooses", () => {
    let pw = "";
    let { s, b } = start((st, bb) => {
      pw = putOnBattlefield(st, bb, walker);
      st.objects[pw]!.counters.loyalty = 5;
      return { kind: "object", id: pw };
    });
    expect(s.pending?.player).toBe(b);
    s = act(s, { type: "pickPermanents", player: b, ids: [] });
    s = settle(s, { me: [b] });
    expect(s.objects[pw]!.counters.loyalty).toBe(2);
    expect(s.players[b]!.life).toBe(40);
  });

  it("bots move the damage to a creature that survives it, and keep a creature that wouldn't for damage they can take", () => {
    // Only 2/2s: 3 damage to a 40-life player is kept.
    let { s, b } = start();
    s = settle(s);
    expect(s.players[b]!.life).toBe(37);
    // A 5/5 takes it.
    const { s: t0, ap, ids } = setup([gambit()]);
    let t = t0;
    const b2 = next(t, ap);
    const big = putOnBattlefield(t, b2, card("Test Big Beast", "Creature — Beast", "{4}{G}", { power: "5", toughness: "5" }));
    t = run(t, planCast(t, ap, ids[0]!, [who(b2)], undefined, undefined, 3));
    t = settle(t);
    expect(t.players[b2]!.life).toBe(40);
    expect(t.objects[big]!.damage).toBe(3);
  });
});

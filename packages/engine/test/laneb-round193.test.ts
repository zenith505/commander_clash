// Lane B round B193: Demilich ("Whenever this creature attacks, exile up to one target instant or sorcery card from your
// graveyard. Copy it. You may cast the copy."), Founding the Third Path (I: "You may cast an instant or sorcery spell with
// mana value 1 or 2 from your hand without paying its mana cost."; III: "Exile target instant or sorcery card from your
// graveyard. Copy it. You may cast the copy."), Arcane Proxy ("When this creature enters, if you cast it, exile target
// instant or sorcery card with mana value less than or equal to this creature's power from your graveyard. Copy that card.
// You may cast the copy without paying its mana cost."), Toluz, Clever Conductor ("Whenever you discard one or more cards,
// exile them from your graveyard." "When Toluz dies, put the cards exiled with it into their owner's hand."), Sproutback
// Trudge ("At the beginning of your end step, if you gained life this turn, you may cast this creature from your
// graveyard.") and Bilbo, Thief in the Night ("Whenever Bilbo attacks, you may cast an artifact, instant, or sorcery spell
// from your graveyard. If an instant or sorcery spell cast this way would be put into your graveyard, exile it instead.").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { moveObject } from "../src/game";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const demilich = (): CardDef => ({"oracleId":"eeb50bfc-8443-482b-bfc1-ea96b37809cd","name":"Demilich","manaCost":"{U}{U}{U}{U}","cmc":4,"typeLine":"Creature — Skeleton Wizard","supertypes":[],"types":["Creature"],"subtypes":["Skeleton","Wizard"],"oracleText":"This spell costs {U} less to cast for each instant and sorcery spell you've cast this turn.\nWhenever this creature attacks, exile up to one target instant or sorcery card from your graveyard. Copy it. You may cast the copy.\nYou may cast this card from your graveyard by exiling four instant and/or sorcery cards from your graveyard in addition to paying its other costs.","power":"4","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0a1351ed-b9df-4a6d-aaa1-ec6db673d265.jpg?1783926516","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0a1351ed-b9df-4a6d-aaa1-ec6db673d265.jpg?1783926516","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const founding = (): CardDef => ({"oracleId":"0eff910a-712d-4652-8b3b-9eddf63eb891","name":"Founding the Third Path","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don't trigger. Sacrifice after III.)\nI — You may cast an instant or sorcery spell with mana value 1 or 2 from your hand without paying its mana cost.\nII — Target player mills four cards.\nIII — Exile target instant or sorcery card from your graveyard. Copy it. You may cast the copy.","colors":["U"],"colorIdentity":["U"],"keywords":["Read Ahead","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/2/d/2d841faa-9e0b-45ff-9dfd-f8a169d9af76.jpg?1783921351","artUrl":"https://cards.scryfall.io/art_crop/front/2/d/2d841faa-9e0b-45ff-9dfd-f8a169d9af76.jpg?1783921351","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
const proxy = (): CardDef => ({"oracleId":"792f8235-f23b-4858-bdd4-c7a186b7a470","name":"Arcane Proxy","manaCost":"{7}","cmc":7,"typeLine":"Artifact Creature — Wizard","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Wizard"],"oracleText":"Prototype {1}{U}{U} — 2/1 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nWhen this creature enters, if you cast it, exile target instant or sorcery card with mana value less than or equal to this creature's power from your graveyard. Copy that card. You may cast the copy without paying its mana cost.","power":"4","toughness":"3","colors":[],"colorIdentity":["U"],"keywords":["Prototype"],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6d74d2e-7382-4fe3-ac3e-6906203ffcc7.jpg?1783920101","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6d74d2e-7382-4fe3-ac3e-6906203ffcc7.jpg?1783920101","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"mythic","layout":"prototype","gameChanger":false}) as CardDef;
const toluz = (): CardDef => ({"oracleId":"005c181a-05db-4c15-9893-65103cca338e","name":"Toluz, Clever Conductor","manaCost":"{W/U}{U}{U/B}","cmc":3,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"When Toluz enters, it connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.)\nWhenever you discard one or more cards, exile them from your graveyard.\nWhen Toluz dies, put the cards exiled with it into their owner's hand.","power":"3","toughness":"1","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Connive"],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e6da6284-1577-4bc2-85dd-5984aea72ac6.jpg?1783923019","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e6da6284-1577-4bc2-85dd-5984aea72ac6.jpg?1783923019","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const trudge = (): CardDef => ({"oracleId":"d9826660-0f34-4d82-8915-cf2796ab8d9a","name":"Sproutback Trudge","manaCost":"{7}{G}{G}","cmc":9,"typeLine":"Creature — Fungus Beast","supertypes":[],"types":["Creature"],"subtypes":["Fungus","Beast"],"oracleText":"This spell costs {X} less to cast, where X is the amount of life you gained this turn.\nTrample\nAt the beginning of your end step, if you gained life this turn, you may cast this creature from your graveyard.","power":"9","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/d/b/dbf26e54-bdfe-4da8-acbb-4f1a98faba49.jpg?1783927585","artUrl":"https://cards.scryfall.io/art_crop/front/d/b/dbf26e54-bdfe-4da8-acbb-4f1a98faba49.jpg?1783927585","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bilbo = (): CardDef => ({"oracleId":"72a9a85d-7cfc-4b3c-82db-9d35be6c0982","name":"Bilbo, Thief in the Night","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — Halfling Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Halfling","Rogue"],"oracleText":"Spells you cast from anywhere other than your hand cost {1} less to cast.\nWhenever Bilbo attacks, you may cast an artifact, instant, or sorcery spell from your graveyard. If an instant or sorcery spell cast this way would be put into your graveyard, exile it instead.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/484c7f83-8339-4ae1-8350-68ce1f7d05a3.jpg?1783902786","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/484c7f83-8339-4ae1-8350-68ce1f7d05a3.jpg?1783902786","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const blast = card("Test Blast", "Sorcery", "{X}{R}", { cmc: 1, oracleText: "Test Blast deals X damage to any target." });
const rock = card("Test Rock", "Artifact", "{3}", { cmc: 3, oracleText: "{T}: Add {C}." });
const ogre = card("Test Ogre", "Creature — Ogre", "{4}{R}", { cmc: 5, power: "5", toughness: "5" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** `attacker` attacks `defender`; its attack trigger waits on the stack. */
const attack = (s: GameState, ap: PlayerId, attacker: ObjectId, defender: PlayerId) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
const noLands = (s: GameState, pid: PlayerId) => {
  s.battlefield = s.battlefield.filter((id) => !(controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land")));
  invalidateCharacteristics(s);
};
const castPaid = (s: GameState, pid: PlayerId, id: ObjectId, targets?: TargetChoice[], x?: number) => run(s, planCast(s, pid, id, targets, undefined, undefined, x));

describe("Round B193 cards are supported", () => {
  it("compiles all six", () => supported(demilich(), founding(), proxy(), toluz(), trudge(), bilbo()));
});

const heal = card("Test Heal", "Instant", "{W}", { cmc: 1, oracleText: "You gain 3 life." });
const loot = card("Test Loot", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Draw two cards, then discard two cards." });
const rot = card("Test Rot", "Sorcery", "{B}", { cmc: 1, oracleText: "Target player discards two cards." });
const doom = card("Test Doom", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pendingCopy = (s: GameState) => (s.pending?.kind === "castFree" ? s.pending.objectId : "");

describe("Demilich: as it attacks, exile up to one instant or sorcery card from your graveyard, copy it and cast the copy paying its costs", () => {
  it("the copy is cast for its mana cost as the trigger resolves; the card stays exiled and the copy is gone after", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, demilich());
    const b = into(s0, ap, bolt, "graveyard");
    let s = settle(attack(s0, ap, d, opp), { targets: [tgt(b)] });
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [b, "none"] });
    expect(s.pending?.kind === "chooseOption" && s.pending.prompt).not.toMatch(/without paying/);
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid" });
    const copy = pendingCopy(s);
    expect(copy).not.toBe(b);
    // Paying {R}: with no mana it can't be cast.
    const broke = structuredClone(s);
    noLands(broke, ap);
    expect(planCast(broke, ap, copy, [{ kind: "player", id: opp }])).toBeNull();
    const life = lifeOf(s, opp);
    s = settle(castPaid(s, ap, copy, [{ kind: "player", id: opp }]));
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.players[ap]!.graveyard.includes(copy)).toBe(false);
  });

  it("X is chosen as the copy is cast (rulings: all its costs paid); declining leaves the card exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, demilich());
    const x = into(s0, ap, blast, "graveyard");
    let s = settle(attack(s0, ap, d, opp), { targets: [tgt(x)] });
    s = act(s, { type: "chooseOption", player: ap, choice: x });
    const copy = pendingCopy(s);
    const life = lifeOf(s, opp);
    s = settle(castPaid(s, ap, copy, [{ kind: "player", id: opp }], 4));
    expect(lifeOf(s, opp)).toBe(life - 4);
    // Declined this time.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const d2 = putOnBattlefield(t0, ap2, demilich());
    const b = into(t0, ap2, bolt, "graveyard");
    let t = settle(attack(t0, ap2, d2, opp2), { targets: [tgt(b)] });
    t = act(t, { type: "chooseOption", player: ap2, choice: b });
    const c2 = pendingCopy(t);
    t = settle(act(t, { type: "chooseMay", player: ap2, yes: false }));
    expect(t.objects[b]!.zone).toBe("exile");
    expect(t.players[ap2]!.exile.includes(c2)).toBe(false);
    expect(t.stack).toHaveLength(0);
  });

  it("up to one target: with none chosen nothing is exiled or cast; a creature card isn't a legal target", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, demilich());
    const b = into(s0, ap, bolt, "graveyard");
    const o = into(s0, ap, ogre, "graveyard");
    const s1 = attack(s0, ap, d, opp);
    expect(s1.pending?.kind).toBe("chooseTargets");
    expect(() => act(s1, { type: "chooseTargets", player: ap, targets: [tgt(o)] })).toThrow();
    const s = settle(s1, { targets: [{ kind: "none" }] });
    expect(s.pending).toBeNull();
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});

describe("Founding the Third Path", () => {
  it("I: cast an instant or sorcery spell with mana value 1 or 2 from your hand for free; one of mana value 3 can't be", () => {
    const { s: s0, ap, opp, ids } = setup([founding(), bolt, divination, loot]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "readAhead" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    // Test Bolt (1) and Test Loot (2), not Test Divination (3).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand", options: [ids[1], ids[3], "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: ids[1]! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: ids[1] });
    expect(s.pending?.kind === "castFree" && s.pending.how).toBeUndefined();
    noLands(s, ap);
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(s.objects[ids[2]!]!.zone).toBe("hand");
  });

  it("III: exile an instant or sorcery card from your graveyard, copy it and cast the copy paying its costs (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([founding()]);
    const b = into(s0, ap, bolt, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }), { targets: [tgt(b)] });
    expect(s.objects[b]!.zone).toBe("exile");
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid" });
    const life = lifeOf(s, opp);
    s = settle(castPaid(s, ap, pendingCopy(s), [{ kind: "player", id: opp }]));
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("Arcane Proxy: when it enters, if you cast it, exile an instant or sorcery card with mana value up to its power from your graveyard and cast a copy for free", () => {
  it("prototyped (2/1): a card of mana value 2 or less; the copy is cast without paying its mana cost", () => {
    const { s: s0, ap, opp, ids } = setup([proxy()]);
    const b = into(s0, ap, bolt, "graveyard");
    const dv = into(s0, ap, divination, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "prototype" }));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(dv)] })).toThrow();
    s = settle(s, { targets: [tgt(b)] });
    expect(s.objects[b]!.zone).toBe("exile");
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree" });
    expect(s.pending?.kind === "castFree" && s.pending.how).toBeUndefined();
    noLands(s, ap);
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, pendingCopy(s), [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("cast for {7} (7/7): a mana value 3 card is fine", () => {
    const { s: s0, ap, ids } = setup([proxy()]);
    const dv = into(s0, ap, divination, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(dv)] });
    expect(s.objects[dv]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
  });
});

describe("Toluz, Clever Conductor: discarded cards are exiled from your graveyard and come back to your hand when Toluz dies", () => {
  it("its own connive: the discarded card is exiled; two discarded at once go together; when Toluz dies they're put into your hand", () => {
    const { s: s0, ap, ids } = setup([toluz(), loot, doom]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    // Connive discards Test Doom's twin: a bear drawn stays; Test Doom is kept for later, the drawn card goes.
    const drawn = s.players[ap]!.hand.find((id) => !ids.includes(id))!;
    s = settle(act(s, { type: "discard", player: ap, objectIds: [drawn] }));
    expect(s.objects[drawn]!.zone).toBe("exile");
    // Test Loot: draw two, then discard two at once (one event, one trigger, both exiled).
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    const two = s.players[ap]!.hand.filter((id) => id !== ids[2]).slice(0, 2);
    s = act(s, { type: "discard", player: ap, objectIds: two });
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(1);
    s = settle(s);
    for (const id of two) expect(s.objects[id]!.zone).toBe("exile");
    // Test Loot itself went to the graveyard as it resolved (not discarded): it stays there.
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    // Toluz dies: the three cards come back to their owner's hand.
    const t = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Toluz, Clever Conductor")!;
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(t)])));
    expect(s.objects[t]!.zone).toBe("graveyard");
    for (const id of [drawn, ...two]) expect(s.objects[id]!.zone).toBe("hand");
  });

  it("a card that left the graveyard before the trigger resolves stays where it went (CR 400.7); another player's discards don't count", () => {
    const { s: s0, ap, opp, ids } = setup([loot, rot]);
    putOnBattlefield(s0, ap, toluz());
    // The opponent discards two: no trigger, their cards stay in their graveyard.
    const theirs = [into(s0, opp, bolt, "hand"), into(s0, opp, divination, "hand")];
    s0.players[opp]!.hand = [...theirs];
    let s = run(s0, planCast(s0, ap, ids[1]!, [{ kind: "player", id: opp }]));
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: opp, objectIds: theirs });
    s = settle(s);
    for (const id of theirs) expect(s.objects[id]!.zone).toBe("graveyard");
    // You discard two; before Toluz's trigger resolves, one of them is put back on top of your library.
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    const two = s.players[ap]!.hand.slice(0, 2);
    s = act(s, { type: "discard", player: ap, objectIds: two });
    expect(s.stack.some((x) => x.kind === "ability") || s.triggerQueue.length > 0).toBe(true);
    moveObject(s, two[0]!, "library");
    s = settle(s);
    expect(s.objects[two[0]!]!.zone).toBe("library");
    expect(s.objects[two[1]!]!.zone).toBe("exile");
  });
});

describe("Sproutback Trudge: at the beginning of your end step, if you gained life this turn, you may cast it from your graveyard", () => {
  it("cast from the graveyard as the trigger resolves, paying its cost minus the life gained this turn", () => {
    const { s: s0, ap, ids } = setup([heal]);
    const tr = into(s0, ap, trudge(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: tr, how: "paid" });
    // {7}{G}{G} less 3: {4}{G}{G}. Five mana isn't enough, six is.
    noLands(s, ap);
    const short = structuredClone(s);
    short.players[ap]!.manaPool = { ...short.players[ap]!.manaPool, G: 2, C: 3 };
    expect(planCast(short, ap, tr)).toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 2, C: 4 };
    s = settle(run(s, planCast(s, ap, tr)));
    expect(s.objects[tr]!.zone).toBe("battlefield");
  });

  it("no life gained this turn: no trigger; it doesn't work from the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const tr = into(s0, ap, trudge(), "graveyard");
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 10 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toBeNull();
    expect(s.objects[tr]!.zone).toBe("graveyard");
    const { s: t0, ap: ap2, ids } = setup([heal]);
    putOnBattlefield(t0, ap2, trudge());
    let t = settle(run(t0, planCast(t0, ap2, ids[0]!)));
    t = passUntil(t, "end", ap2);
    for (let i = 0; i < 10 && !t.pending && (t.stack.length || t.triggerQueue.length); i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(t.pending).toBeNull();
  });

  it("declined: it stays in the graveyard", () => {
    const { s: s0, ap, ids } = setup([heal]);
    const tr = into(s0, ap, trudge(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[tr]!.zone).toBe("graveyard");
  });
});

describe("Bilbo, Thief in the Night: as it attacks, cast an artifact, instant or sorcery spell from your graveyard, paying its costs", () => {
  it("an instant cast this way is exiled instead of going back; a creature card isn't offered", () => {
    const { s: s0, ap, opp } = setup([]);
    const bb = putOnBattlefield(s0, ap, bilbo());
    const b = into(s0, ap, bolt, "graveyard");
    const r = into(s0, ap, rock, "graveyard");
    into(s0, ap, ogre, "graveyard");
    let s = settle(attack(s0, ap, bb, opp));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [b, r, "none"] });
    expect(s.pending?.kind === "chooseOption" && s.pending.prompt).toBe("cast an artifact, instant, or sorcery spell from your graveyard?");
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b, how: "paid" });
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("an artifact spell: {1} less from its own first ability, and not exiled if it would go to a graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const bb = putOnBattlefield(s0, ap, bilbo());
    const r = into(s0, ap, rock, "graveyard");
    let s = settle(attack(s0, ap, bb, opp));
    s = act(s, { type: "chooseOption", player: ap, choice: r });
    noLands(s, ap);
    const short = structuredClone(s);
    short.players[ap]!.manaPool = { ...short.players[ap]!.manaPool, C: 1 };
    expect(planCast(short, ap, r)).toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
    s = run(s, planCast(s, ap, r));
    expect(s.objects[r]!.zone).toBe("stack");
    expect(s.objects[r]!.exileIfToGraveyard).toBeUndefined();
    s = settle(s);
    expect(s.objects[r]!.zone).toBe("battlefield");
  });

  it("declined: nothing is cast and the cards stay in the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const bb = putOnBattlefield(s0, ap, bilbo());
    const b = into(s0, ap, bolt, "graveyard");
    let s = settle(attack(s0, ap, bb, opp));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});

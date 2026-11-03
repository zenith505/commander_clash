// Round 266: Toralf, God of Fury // Toralf's Hammer (excess noncombat damage dealt again to "any target other than that
// permanent"; "Equipped creature gets +3/+0 as long as it's legendary").

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question but blockers (none declared). */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
const indexOf = (s: GameState, id: ObjectId, text: RegExp) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));
  if (i < 0) throw new Error(`no ability ${text}`);
  return i;
};

const toralf = (): CardDef => ({"oracleId":"fffcb71f-e802-436e-917d-eaa6607ab74f","name":"Toralf, God of Fury // Toralf's Hammer","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Creature — God // Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"Trample\nWhenever a creature or planeswalker an opponent controls is dealt excess noncombat damage, Toralf deals damage equal to the excess to any target other than that permanent.","power":"5","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Trample","Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/22a6a5f1-1405-4efb-af3e-e1f58d664e99.jpg?1783928227","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/22a6a5f1-1405-4efb-af3e-e1f58d664e99.jpg?1783928227","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Toralf, God of Fury","manaCost":"{2}{R}{R}","typeLine":"Legendary Creature — God","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"Trample\nWhenever a creature or planeswalker an opponent controls is dealt excess noncombat damage, Toralf deals damage equal to the excess to any target other than that permanent.","power":"5","toughness":"4","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/22a6a5f1-1405-4efb-af3e-e1f58d664e99.jpg?1783928227","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/22a6a5f1-1405-4efb-af3e-e1f58d664e99.jpg?1783928227"},{"name":"Toralf's Hammer","manaCost":"{1}{R}","typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{1}{R}, {T}, Unattach Toralf's Hammer: It deals 3 damage to any target. Return Toralf's Hammer to its owner's hand.\"\nEquipped creature gets +3/+0 as long as it's legendary.\nEquip {1}{R}","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/2/2/22a6a5f1-1405-4efb-af3e-e1f58d664e99.jpg?1783928227","artUrl":"https://cards.scryfall.io/art_crop/back/2/2/22a6a5f1-1405-4efb-af3e-e1f58d664e99.jpg?1783928227"}]}) as CardDef;
const blast = (n: number) => card(`Test Blast ${n}`, "Instant", "{R}", { oracleText: `Test Blast ${n} deals ${n} damage to target creature or planeswalker.` });
const wall = (extra: Partial<CardDef> = {}) => card("Test Wall", "Creature — Wall", "{1}", { power: "0", toughness: "2", ...extra });

describe("Toralf, God of Fury: the excess dealt again to any target other than that permanent", () => {
  it("is fully supported, both faces", () => {
    expect(isFullySupported(toralf())).toBe(true);
  });

  it("deals the excess of noncombat damage to an opponent's creature to another target (CR 120.10)", () => {
    const { s: s0, ap, ids } = setup([blast(5)]);
    let s = s0;
    const opp = opps(s, ap)[0]!;
    putOnBattlefield(s, ap, toralf());
    const w = putOnBattlefield(s, opp, wall());
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: w }]));
    s = settle(s);
    // 5 damage to a 0/2: 3 excess; Toralf's trigger asks for its target.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("can't target the permanent that was dealt the excess", () => {
    const { s: s0, ap, ids } = setup([blast(5)]);
    let s = s0;
    const opp = opps(s, ap)[0]!;
    putOnBattlefield(s, ap, toralf());
    const w = putOnBattlefield(s, opp, wall({ oracleText: "Indestructible", keywords: ["Indestructible"] }));
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: w }]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: w }] })).toThrow();
  });

  it("doesn't trigger on lethal damage with nothing beyond it or on your own creatures", () => {
    const { s: s0, ap, ids } = setup([blast(2), blast(5)]);
    let s = s0;
    const opp = opps(s, ap)[0]!;
    putOnBattlefield(s, ap, toralf());
    const w = putOnBattlefield(s, opp, wall());
    const mine = putOnBattlefield(s, ap, wall());
    const [two, five] = ids;
    s = settle(run(s, planCast(s, ap, two!, [{ kind: "object", id: w }])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[w]!.zone).not.toBe("battlefield");
    s = settle(run(s, planCast(s, ap, five!, [{ kind: "object", id: mine }])));
    expect(s.pending).toBeFalsy();
  });
});

describe("Toralf's Hammer", () => {
  it("gives +3/+0 only to a legendary creature (CR 205.4)", () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    const hammer = putOnBattlefield(s, ap, toralf());
    s.objects[hammer]!.face = 1;
    const plain = putOnBattlefield(s, ap, card("Test Squire", "Creature — Human", "{1}", { power: "1", toughness: "1" }));
    s.objects[hammer]!.attachedTo = plain;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[hammer]!).name).toBe("Toralf's Hammer");
    expect(power(s, s.objects[plain]!)).toBe(1);
    const legend = putOnBattlefield(s, ap, card("Test Hero", "Legendary Creature — Human", "{1}", { power: "1", toughness: "1" }));
    s.objects[hammer]!.attachedTo = legend;
    invalidateCharacteristics(s);
    expect(power(s, s.objects[legend]!)).toBe(4);
  });

  it("grants an ability that unattaches it, deals 3 damage with the Hammer as the source and returns it to hand", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = opps(s, ap)[0]!;
    const hammer = putOnBattlefield(s, ap, toralf());
    s.objects[hammer]!.face = 1;
    const legend = putOnBattlefield(s, ap, card("Test Hero", "Legendary Creature — Human", "{1}", { power: "1", toughness: "1", colors: ["G"] }));
    s.objects[hammer]!.attachedTo = legend;
    invalidateCharacteristics(s);
    s.players[ap]!.manaPool.R = 2;
    const i = indexOf(s, legend, /Unattach/);
    const life = s.players[opp]!.life;
    s = run(s, planActivate(s, ap, legend, i, [{ kind: "player", id: opp }]));
    expect(s.objects[hammer]!.attachedTo).toBeUndefined();
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.map((id) => s.cards[s.objects[id]!.cardId]!.name)).toContain(toralf().name);
  });
});

const zurzoth = (): CardDef => ({"oracleId":"a7da9ec5-f82f-4a6d-9737-06a1556e2dd6","name":"Zurzoth, Chaos Rider","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Devil","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Devil"],"oracleText":"Whenever an opponent draws their first card each turn, if it's not their turn, you create a 1/1 red Devil creature token with \"When this token dies, it deals 1 damage to any target.\"\nWhenever one or more Devils you control attack one or more players, you and those players each draw a card, then discard a card at random.","power":"2","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3d94b4c3-7944-41b6-8c92-78fd6e50658d.jpg?1783930501","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3d94b4c3-7944-41b6-8c92-78fd6e50658d.jpg?1783930501","commanderLegal":"legal","set":"jmp","releasedAt":"2020-07-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const devil = (name = "Test Devil") => card(name, "Creature — Devil", "{1}{R}", { power: "1", toughness: "1" });
/** To the declare attackers step of the active player's turn. */
const toAttack = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending?.kind).toBe("declareAttackers");
  return s;
};

describe("Zurzoth, Chaos Rider: Devils attacking one or more players", () => {
  it("is fully supported", () => {
    expect(isFullySupported(zurzoth())).toBe(true);
  });

  it("triggers once; you and the players the Devils attack each draw, then discard at random", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [o1, o2, o3] = opps(s, ap);
    putOnBattlefield(s, ap, zurzoth());
    const d1 = putOnBattlefield(s, ap, devil());
    const d2 = putOnBattlefield(s, ap, devil("Other Devil"));
    const d3 = putOnBattlefield(s, ap, devil("Third Devil"));
    const bear = putOnBattlefield(s, ap, card("Test Bear", "Creature — Bear", "{1}", { power: "2", toughness: "2" }));
    const yard = (p: PlayerId) => s.players[p]!.graveyard.length;
    const lib = (p: PlayerId) => s.players[p]!.library.length;
    const before = [ap, o1!, o2!, o3!].map((p) => [yard(p), lib(p), s.players[p]!.hand.length]);
    s = toAttack(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d1, defender: o1! }, { attacker: d2, defender: o1! }, { attacker: d3, defender: o2! }, { attacker: bear, defender: o3! }] });
    expect(s.stack.length + s.triggerQueue.length).toBe(1);
    s = settle(s);
    const after = [ap, o1!, o2!, o3!].map((p) => [yard(p), lib(p), s.players[p]!.hand.length]);
    // You, o1 and o2 drew one and discarded one; o3 (attacked only by the Bear) didn't.
    for (const i of [0, 1, 2]) expect(after[i]).toEqual([before[i]![0]! + 1, before[i]![1]! - 1, before[i]![2]]);
    expect(after[3]).toEqual(before[3]);
  });

  it("doesn't trigger for Devils attacking only a planeswalker (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [o1] = opps(s, ap);
    putOnBattlefield(s, ap, zurzoth());
    const d1 = putOnBattlefield(s, ap, devil());
    const pw = putOnBattlefield(s, o1!, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5", oracleText: "+1: You gain 1 life." }));
    s.objects[pw]!.counters = { loyalty: 5 };
    s = toAttack(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d1, defender: o1!, planeswalker: pw }] });
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
  });
});

const auntie = (): CardDef => ({"oracleId":"e3cd53c1-86bd-4177-adb0-a1fa693b44c6","name":"Auntie Ool, Cursewretch","manaCost":"{1}{B}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Goblin Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Warlock"],"oracleText":"Ward—Blight 2. (To blight 2, a player puts two -1/-1 counters on a creature they control.)\nWhenever one or more -1/-1 counters are put on a creature, draw a card if you control that creature. If you don't control it, its controller loses 1 life.","power":"4","toughness":"4","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Blight","Ward"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a2e4252-9fbc-4d43-8935-db2cafaa7b5f.jpg?1783904606","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a2e4252-9fbc-4d43-8935-db2cafaa7b5f.jpg?1783904606","commanderLegal":"legal","set":"ecc","releasedAt":"2026-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const grower = (name = "Test Grower", toughness = "3") => card(name, "Creature — Elf", "{1}", { power: "1", toughness });

describe("Auntie Ool, Cursewretch: Ward—Blight 2 and -1/-1 counters put on a creature", () => {
  it("is fully supported", () => {
    expect(isFullySupported(auntie())).toBe(true);
  });

  /** ap casts a 1-damage blast at opp's Auntie Ool; returns the state at the ward payment. */
  const targetAuntie = (mine: CardDef[]) => {
    const { s: s0, ap, ids } = setup([blast(1)]);
    let s = s0;
    const opp = opps(s, ap)[0]!;
    const a = putOnBattlefield(s, opp, auntie());
    const creatures = mine.map((c) => putOnBattlefield(s, ap, c));
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: a }]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, blight: 2 });
    return { s, ap, opp, a, creatures };
  };

  it("lets the spell's controller blight 2 to pay: the creature they pick gets two -1/-1 counters, and its controller loses 1 life", () => {
    let { s, ap, opp, a, creatures } = targetAuntie([grower(), grower("Other Grower")]);
    const life = s.players[ap]!.life;
    const oppHand = s.players[opp]!.hand.length;
    s = act(s, { type: "payUnless", player: ap, pay: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "counters", counter: "-1/-1", count: 1 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [creatures[1]!] }));
    expect(s.objects[creatures[1]!]!.counters["-1/-1"]).toBe(2);
    expect(s.objects[creatures[0]!]!.counters["-1/-1"]).toBeUndefined();
    // Auntie Ool's controller doesn't control that creature: its controller loses 1 life, nobody draws.
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[opp]!.hand.length).toBe(oppHand);
    // The blast wasn't countered: it dealt its damage.
    expect(s.objects[a]!.damage).toBe(1);
  });

  it("asks for no pick with one creature, and counts the creature as it last existed if the counters kill it (CR 608.2h)", () => {
    let { s, ap, creatures } = targetAuntie([grower("Test Grower", "2")]);
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }));
    expect(s.objects[creatures[0]!]!.zone).not.toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("isn't offered with no creature to blight (CR 701.68b): the spell is countered", () => {
    const { s: s0, ap, ids } = setup([blast(1)]);
    let s = s0;
    const opp = opps(s, ap)[0]!;
    const a = putOnBattlefield(s, opp, auntie());
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: a }])));
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
    expect(s.objects[a]!.damage).toBe(0);
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
  });

  it("draws a card for Auntie Ool's controller when the counters go on a creature they control", () => {
    const { s: s0, ap } = setup([card("Test Wither", "Sorcery", "{B}", { oracleText: "Put two -1/-1 counters on target creature." })]);
    let s = s0;
    putOnBattlefield(s, ap, auntie());
    const g = putOnBattlefield(s, ap, grower());
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!, [{ kind: "object", id: g }])));
    expect(s.objects[g]!.counters["-1/-1"]).toBe(2);
    // The spell left the hand, then one card drawn.
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("is paid by a bot with a creature that survives, never its commander", () => {
    let { s, ap, creatures } = targetAuntie([grower("Test Grower", "2"), grower("Big Grower", "5")]);
    s = run(s, botActions(s, ap));
    if (s.pending?.kind === "pickPermanents") s = run(s, botActions(s, ap));
    s = settle(s);
    expect(s.objects[creatures[1]!]!.counters["-1/-1"]).toBe(2);
    expect(s.objects[creatures[0]!]!.zone).toBe("battlefield");
  });
});

// Round 266: Toralf, God of Fury // Toralf's Hammer (excess noncombat damage dealt again to "any target other than that
// permanent"; "Equipped creature gets +3/+0 as long as it's legendary").

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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

const brass = (): CardDef => ({"oracleId":"43b5e462-d860-473d-828f-6c513fc7768a","name":"Admiral Beckett Brass","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Human Pirate","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Pirate"],"oracleText":"Other Pirates you control get +1/+1.\nAt the beginning of your end step, gain control of target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this turn.","power":"3","toughness":"3","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b13e2b43-bf51-47e1-bc4e-fa80fa50f607.jpg?1783913428","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b13e2b43-bf51-47e1-bc4e-fa80fa50f607.jpg?1783913428","commanderLegal":"legal","set":"sld","releasedAt":"2023-12-06","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const pirate = (name: string, extra: Partial<CardDef> = {}) => card(name, "Creature — Human Pirate", "{1}", { power: "1", toughness: "1", ...extra });
/** Pass priority (answering blockers with none) until the game reaches `step`, stopping at any other question. */
const passTo = (s: GameState, step: GameState["step"], max = 400) => {
  for (let i = 0; i < max && s.step !== step && !s.over; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Admiral Beckett Brass: a player dealt combat damage by three or more Pirates this turn", () => {
  it("is fully supported", () => {
    expect(isFullySupported(brass())).toBe(true);
  });

  const attackWith = (n: number, extra: Partial<CardDef> = {}) => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [o1, o2] = opps(s, ap);
    putOnBattlefield(s, ap, brass());
    const ps = Array.from({ length: n }, (_, i) => putOnBattlefield(s, ap, pirate(`Test Pirate ${i}`, i === 0 ? extra : {})));
    const prize = putOnBattlefield(s, o1!, card("Test Prize", "Artifact", "{3}"));
    const other = putOnBattlefield(s, o2!, card("Other Prize", "Artifact", "{3}"));
    s = toAttack(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: ps.map((attacker) => ({ attacker, defender: o1! })) });
    s = passTo(s, "end");
    return { s, ap, o1: o1!, o2: o2!, prize, other };
  };

  it("gains control of a nonland permanent that player controls at your end step, not another player's", () => {
    let { s, ap, prize, other } = attackWith(3);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: other }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: prize }] }));
    expect(controllerOf(s, s.objects[prize]!)).toBe(ap);
  });

  it("counts a double-striking Pirate once (rulings): two Pirates aren't enough", () => {
    let { s, prize } = attackWith(2, { oracleText: "Double strike", keywords: ["Double strike"] });
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(controllerOf(s, s.objects[prize]!)).not.toBe(s.activePlayer);
  });
});

const hellkite = (): CardDef => ({"oracleId":"1c772df4-bd88-4f7e-853c-5dd06f4cf70e","name":"Territorial Hellkite","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying, haste\nAt the beginning of combat on your turn, choose an opponent at random that this creature didn't attack during your last combat. This creature attacks that player this combat if able. If you can't choose an opponent this way, tap this creature.","power":"6","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3c44e5c2-fddb-47cb-825f-c57b49f181ba.jpg?1783935942","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3c44e5c2-fddb-47cb-825f-c57b49f181ba.jpg?1783935942","commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("Territorial Hellkite: an opponent at random it didn't attack during your last combat", () => {
  it("is fully supported", () => {
    expect(isFullySupported(hellkite())).toBe(true);
  });

  /** To the beginning of combat with the Hellkite's trigger resolved. */
  const begin = (seed: number, prep?: (s: GameState, ap: PlayerId, hk: ObjectId) => void) => {
    const { s: s0, ap } = setup([], seed);
    let s = s0;
    const hk = putOnBattlefield(s, ap, hellkite());
    prep?.(s, ap, hk);
    s = passTo(s, "beginCombat");
    s = settle(s);
    return { s, ap, hk };
  };

  it("with no last combat, any opponent; it must attack that player if able, not another (CR 508.1d)", () => {
    let { s, ap, hk } = begin(5);
    const chosen = s.effects.flatMap((e) => e.mods).find((m) => m.kind === "mustAttackPlayer");
    expect(chosen).toMatchObject({ kind: "mustAttackPlayer" });
    const target = (chosen as { player: PlayerId }).player;
    expect(opps(s, ap)).toContain(target);
    s = toAttack(s);
    const other = opps(s, ap).find((p) => p !== target)!;
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hk, defender: other }] })).toThrow();
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hk, defender: target }] });
    expect(s.objects[hk]!.attacking).toBe(target);
  });

  it("never picks the player it attacked during your last combat (rulings)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { s } = begin(seed, (s, ap, hk) => {
        const o1 = opps(s, ap)[0]!;
        s.players[ap]!.combatsBegun = [{ turn: s.turn - 4, combat: 1 }];
        s.objects[hk]!.attackedInCombat = { turn: s.turn - 4, combat: 1, player: o1 };
      });
      const m = s.effects.flatMap((e) => e.mods).find((x) => x.kind === "mustAttackPlayer") as { player: PlayerId };
      expect(m.player).not.toBe(opps(s, s.activePlayer)[0]);
    }
  });

  it("a planeswalker it attacked doesn't count as attacking its controller", () => {
    for (const seed of [1, 2, 3]) {
      const { s } = begin(seed, (s, ap, hk) => {
        s.players[ap]!.combatsBegun = [{ turn: s.turn - 4, combat: 1 }];
        s.objects[hk]!.attackedInCombat = { turn: s.turn - 4, combat: 1 };
      });
      expect(s.effects.flatMap((e) => e.mods).some((x) => x.kind === "mustAttackPlayer")).toBe(true);
    }
  });

  it("is tapped when it can't choose an opponent: the only one left is the one it attacked last combat", () => {
    const { s, hk } = begin(5, (s, ap, hk) => {
      const [o1, o2, o3] = opps(s, ap);
      s.players[o2!]!.lost = true;
      s.players[o3!]!.lost = true;
      s.players[ap]!.combatsBegun = [{ turn: s.turn - 4, combat: 1 }];
      s.objects[hk]!.attackedInCombat = { turn: s.turn - 4, combat: 1, player: o1! };
    });
    expect(s.objects[hk]!.tapped).toBe(true);
    expect(s.effects.flatMap((e) => e.mods).some((x) => x.kind === "mustAttackPlayer" && x.player !== "chosen")).toBe(false);
  });

  it("remembers the player it attacked for its controller's next combat", () => {
    let { s, ap, hk } = begin(5);
    const target = (s.effects.flatMap((e) => e.mods).find((m) => m.kind === "mustAttackPlayer") as { player: PlayerId }).player;
    s = toAttack(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hk, defender: target }] });
    expect(s.objects[hk]!.attackedInCombat).toEqual({ turn: s.turn, combat: s.combatsThisTurn, player: target });
    expect(s.players[ap]!.combatsBegun).toEqual([{ turn: s.turn, combat: s.combatsThisTurn }]);
  });
});

const resolve = (): CardDef => ({"oracleId":"12bd2051-297b-4bab-ac64-6eb26a42e3e2","name":"Nahiri's Resolve","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+0 and have haste.\nAt the beginning of your end step, exile any number of nontoken artifacts and/or creatures you control. Return those cards to the battlefield under their owner's control at the beginning of your next upkeep.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/0443321b-e999-4bdd-8d8e-65fbaa6cabb4.jpg?1783916442","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/0443321b-e999-4bdd-8d8e-65fbaa6cabb4.jpg?1783916442","commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("Nahiri's Resolve: exile any number until your next upkeep", () => {
  it("is fully supported", () => {
    expect(isFullySupported(resolve())).toBe(true);
  });

  it("exiles the nontoken artifacts and creatures you pick at your end step and returns them under their owners' control at your next upkeep (CR 603.7)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = opps(s, ap)[0]!;
    putOnBattlefield(s, ap, resolve());
    const bear = putOnBattlefield(s, ap, card("Test Bear", "Creature — Bear", "{1}", { power: "2", toughness: "2" }));
    const rock = putOnBattlefield(s, ap, card("Test Rock", "Artifact", "{1}"));
    const kept = putOnBattlefield(s, ap, card("Test Kept", "Creature — Bear", "{1}", { power: "2", toughness: "2" }));
    // One you control but don't own: it returns under its owner's control.
    const borrowed = putOnBattlefield(s, opp, card("Test Borrowed", "Creature — Bear", "{1}", { power: "2", toughness: "2" }));
    addEffect(s, ap, [borrowed], [{ kind: "control" }], "game");
    const tok = putOnBattlefield(s, ap, card("Test Token", "Creature — Bear", "{1}", { power: "1", toughness: "1" }));
    s.objects[tok]!.isToken = true;
    s = passTo(s, "end");
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "flicker", min: 0 });
    const options = (s.pending as { options: ObjectId[] }).options;
    expect(options).toEqual(expect.arrayContaining([bear, rock, kept, borrowed]));
    expect(options).not.toContain(tok);
    const cardOf = (id: ObjectId) => s.objects[id]!.cardId;
    const ids = [bear, rock, borrowed].map(cardOf);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bear, rock, borrowed] }));
    const exiled = Object.values(s.objects).filter((o) => o.zone === "exile" && ids.includes(o.cardId));
    expect(exiled).toHaveLength(3);
    expect(s.objects[kept]!.zone).toBe("battlefield");
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    const back = s.battlefield.map((id) => s.objects[id]!).filter((o) => ids.includes(o.cardId));
    expect(back).toHaveLength(3);
    expect(back.find((o) => o.cardId === cardOf(borrowed) || s.cards[o.cardId]!.name === "Test Borrowed")!.controller).toBe(opp);
    expect(back.filter((o) => o.owner === ap).every((o) => controllerOf(s, o) === ap)).toBe(true);
  });

  it("is answered by a bot without exiling its creatures (they couldn't block meanwhile)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, resolve());
    const bear = putOnBattlefield(s, ap, card("Test Bear", "Creature — Bear", "{1}", { power: "2", toughness: "2", oracleText: "When this creature enters, you gain 1 life." }));
    s = passTo(s, "end");
    s = settle(s);
    expect(s.pending?.kind).toBe("pickPermanents");
    s = settle(run(s, botActions(s, ap)));
    expect(s.objects[bear]!.zone).toBe("battlefield");
  });
});

const sidisi = (): CardDef => ({"oracleId":"72074972-418d-4dce-83cf-ce8cf310fc42","name":"Sidisi, Regent of the Mire","manaCost":"{1}{B}","cmc":2,"typeLine":"Legendary Creature — Zombie Snake Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie","Snake","Warlock"],"oracleText":"{T}, Sacrifice a creature you control with mana value X other than Sidisi: Return target creature card with mana value X plus 1 from your graveyard to the battlefield. Activate only as a sorcery.","power":"1","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/47374d23-662b-4ba7-a94f-37c9bc759cc6.jpg?1783907370","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/47374d23-662b-4ba7-a94f-37c9bc759cc6.jpg?1783907370","commanderLegal":"legal","set":"tdm","releasedAt":"2025-04-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const critter = (name: string, cost: string) => card(name, "Creature — Bear", cost, { power: "2", toughness: "2" });
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Sidisi, Regent of the Mire: sacrifice a creature with mana value X, return one with mana value X plus 1", () => {
  it("is fully supported", () => {
    expect(isFullySupported(sidisi())).toBe(true);
  });

  it("returns a creature card with mana value X plus 1 for a creature with mana value X (CR 107.3a, 602.2b)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const sd = putOnBattlefield(s, ap, sidisi());
    const two = putOnBattlefield(s, ap, critter("Test Two", "{1}{G}"));
    const three = putOnBattlefield(s, ap, critter("Test Three", "{2}{G}"));
    const back = toYard(s, ap, critter("Test Back", "{2}{G}"));
    const four = toYard(s, ap, critter("Test Four", "{3}{G}"));
    expect(abilityProblem(s, ap, sd, 0)).toBeNull();
    // X 2: the mana value 3 card, paid with the mana value 2 creature, not the 3.
    expect(abilityProblem(s, ap, sd, 0, [{ kind: "object", id: four }], undefined, undefined, 2, { sacrifice: [two] })).not.toBeNull();
    expect(abilityProblem(s, ap, sd, 0, [{ kind: "object", id: back }], undefined, undefined, 2, { sacrifice: [three] })).not.toBeNull();
    s = settle(run(s, planActivate(s, ap, sd, 0, [{ kind: "object", id: back }], undefined, undefined, 2, { sacrifice: [two] })));
    expect(s.objects[two]!.zone).toBe("graveyard");
    expect(s.objects[three]!.zone).toBe("battlefield");
    expect(s.battlefield.some((id) => s.objects[id]!.cardId === s.objects[back]!.cardId)).toBe(true);
  });

  it("can't sacrifice itself, and can't be activated with no pair of mana values that works", () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    const sd = putOnBattlefield(s, ap, sidisi());
    // Sidisi's own mana value is 2: a 3 in the graveyard doesn't make it activatable on its own.
    toYard(s, ap, critter("Test Back", "{2}{G}"));
    expect(abilityProblem(s, ap, sd, 0)).not.toBeNull();
  });

  it("is activated by a bot trading a lesser creature for a better one", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const sd = putOnBattlefield(s, ap, sidisi());
    const one = putOnBattlefield(s, ap, critter("Test One", "{G}"));
    const big = toYard(s, ap, card("Test Big", "Creature — Beast", "{1}{G}", { power: "4", toughness: "4" }));
    s.players[ap]!.hand = [];
    s.players[ap]!.command = [];
    // Bots use activated abilities in their second main phase.
    s = passTo(s, "main2");
    for (let i = 0; i < 10 && s.objects[one]!.zone === "battlefield"; i++) {
      const plan = botActions(s, ap);
      if (!plan.length || plan.every((a) => a.type === "passPriority")) break;
      s = settle(run(s, plan));
    }
    expect(s.objects[one]!.zone).toBe("graveyard");
    expect(s.objects[big]!.zone).not.toBe("graveyard");
    void sd;
  });
});

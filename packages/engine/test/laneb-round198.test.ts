// Lane B round B198: Boneyard Mycodrax ("This creature's power and toughness are each equal to the number of other
// creature cards in your graveyard." and scavenge), Templar Knight ("{W}, Tap five untapped attacking creatures you
// control named Templar Knight: Search your library for a legendary artifact card, put it onto the battlefield, then
// shuffle."), Sea Gate Stormcaller ("When this creature enters, copy the next instant or sorcery spell with mana value 2
// or less you cast this turn when you cast it. If this creature was kicked, copy that spell twice instead. You may choose
// new targets for the copies."), Gorm the Great ("Gorm must be blocked if able, and Gorm must be blocked by two or more
// creatures if able."), Dream Chisel and Obscuring Aether ("Face-down creature spells you cast cost {1} less to cast."),
// Kadena, Slinking Sorcerer ("The first face-down creature spell you cast each turn costs {3} less to cast.") and Goblin
// Maskmaker ("Whenever this creature attacks, face-down spells you cast this turn cost {1} less to cast.").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const mycodrax = (): CardDef => ({"oracleId":"f852adf6-3e54-4a1d-92e1-7dbc6d2228ce","name":"Boneyard Mycodrax","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Fungus","supertypes":[],"types":["Creature"],"subtypes":["Fungus"],"oracleText":"Boneyard Mycodrax's power and toughness are each equal to the number of other creature cards in your graveyard.\nScavenge {4}{B} ({4}{B}, Exile this card from your graveyard: Put a number of +1/+1 counters equal to this card's power on target creature. Scavenge only as a sorcery.)","power":"*","toughness":"*","colors":["B"],"colorIdentity":["B"],"keywords":["Scavenge"],"imageUrl":"https://cards.scryfall.io/normal/front/f/6/f6ac1131-8e96-46be-85e0-55844d0d2935.jpg?1783931218","artUrl":"https://cards.scryfall.io/art_crop/front/f/6/f6ac1131-8e96-46be-85e0-55844d0d2935.jpg?1783931218","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const templar = (): CardDef => ({"oracleId":"f9453fe2-fadf-4cd4-8d2c-0eaa0e2d78d6","name":"Templar Knight","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Vigilance\n{W}, Tap five untapped attacking creatures you control named Templar Knight: Search your library for a legendary artifact card, put it onto the battlefield, then shuffle.\nA deck can have any number of cards named Templar Knight.","power":"3","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3d5a1bec-9128-4c5e-98c3-317424f892d1.jpg?1783910984","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3d5a1bec-9128-4c5e-98c3-317424f892d1.jpg?1783910984","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const stormcaller = (): CardDef => ({"oracleId":"675de007-a71e-4036-8204-140c67871b7f","name":"Sea Gate Stormcaller","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Kicker {4}{U}\nWhen this creature enters, copy the next instant or sorcery spell with mana value 2 or less you cast this turn when you cast it. If this creature was kicked, copy that spell twice instead. You may choose new targets for the copies.","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1e14e677-9bfa-4bcc-9772-8e7758d7538a.jpg?1783929387","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1e14e677-9bfa-4bcc-9772-8e7758d7538a.jpg?1783929387","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const gorm = (): CardDef => ({"oracleId":"a7195e9f-53fa-4fb5-b1f1-099c0a772090","name":"Gorm the Great","manaCost":"{3}{G}","cmc":4,"typeLine":"Legendary Creature — Giant Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Giant","Warrior"],"oracleText":"Partner with Virtus the Veiled (When this creature enters, target player may put Virtus into their hand from their library, then shuffle.)\nVigilance\nGorm must be blocked if able, and Gorm must be blocked by two or more creatures if able.","power":"2","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":["Partner with","Vigilance","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/41603938-9527-42fc-a870-b662c3871ae3.jpg?1783934878","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/41603938-9527-42fc-a870-b662c3871ae3.jpg?1783934878","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chisel = (): CardDef => ({"oracleId":"7776c114-c02a-4694-9b9d-00fbfad2d2a2","name":"Dream Chisel","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Face-down creature spells you cast cost {1} less to cast.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e89610e9-f1d3-4332-901a-2598bf01d61d.jpg?1783945031","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e89610e9-f1d3-4332-901a-2598bf01d61d.jpg?1783945031","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const aether = (): CardDef => ({"oracleId":"70bfb805-2009-44c8-b5bd-2ca281637566","name":"Obscuring Aether","manaCost":"{G}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Face-down creature spells you cast cost {1} less to cast.\n{1}{G}: Turn this enchantment face down. (It becomes a 2/2 creature.)","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0bff71e3-b309-4659-9d43-7a0d8ada1efc.jpg?1783938578","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0bff71e3-b309-4659-9d43-7a0d8ada1efc.jpg?1783938578","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kadena = (): CardDef => ({"oracleId":"4da13eb8-ca18-43f1-b54b-d3ddceb980d2","name":"Kadena, Slinking Sorcerer","manaCost":"{1}{B}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Snake Wizard Sorcerer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Snake","Wizard","Sorcerer"],"oracleText":"The first face-down creature spell you cast each turn costs {3} less to cast.\nWhenever a face-down creature you control enters, draw a card.","power":"3","toughness":"3","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/68a144f1-df18-4dc5-81c3-dff2af27527f.jpg?1783932799","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/68a144f1-df18-4dc5-81c3-dff2af27527f.jpg?1783932799","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const maskmaker = (): CardDef => ({"oracleId":"ff4b9723-d5f1-40d2-aa35-fa3d2a6f4b5c","name":"Goblin Maskmaker","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Citizen","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Citizen"],"oracleText":"Whenever this creature attacks, face-down spells you cast this turn cost {1} less to cast.","power":"1","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/6154a991-c602-4fca-91a3-3830060da60e.jpg?1783912880","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/6154a991-c602-4fca-91a3-3830060da60e.jpg?1783912880","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

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
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** The same, keeping each copy's targets when asked whether to choose new ones (CR 707.10c). */
const resolveAll = (s0: GameState) => {
  let s = settle(s0);
  for (let i = 0; i < 10 && s.pending?.kind === "copyTargets"; i++) s = settle(act(s, { type: "copyTargets", player: s.pending.player } as Action));
  return s;
};
const ptOf = (s: GameState, id: ObjectId) => `${characteristics(s, s.objects[id]!).power}/${characteristics(s, s.objects[id]!).toughness}`;
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.tapped && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land")).length;
const vanilla = (name: string, typeLine: string, manaCost: string, mv: number, p: number, t: number, oracleText = "", keywords: string[] = []) => card(name, typeLine, manaCost, { cmc: mv, power: String(p), toughness: String(t), oracleText, keywords });
const morph = vanilla("Test Morph", "Creature — Beast", "{4}{G}", 5, 4, 4, "Morph {2}{G}", ["Morph"]);
const morph2 = vanilla("Test Other Morph", "Creature — Bird", "{3}{U}", 4, 3, 3, "Morph {1}{U}", ["Morph"]);
const zap = card("Test Zap", "Instant", "{R}", { cmc: 1, oracleText: "Test Zap deals 1 damage to any target." });
const blast = card("Test Blast", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Test Blast deals 1 damage to any target." });
const xZap = card("Test X Zap", "Instant", "{X}{R}", { cmc: 1, oracleText: "Test X Zap deals X damage to any target." });
/** Cast face down for {3} (CR 702.37c), the special payment the test lands pay. */
const faceDown = (s: GameState, pid: PlayerId, id: ObjectId) => settle(run(s, planCast(s, pid, id, undefined, undefined, "auto", undefined, { faceDown: true })));
/** To `pid`'s declare attackers step, its question asked. */
const toAttacks = (s0: GameState, pid: PlayerId) => {
  let s = passUntil(s0, "declareAttackers", pid);
  for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Past declare blockers with no blocks, to `pid` holding priority in the declare blockers step. */
const pastBlocks = (s0: GameState, pid: PlayerId) => {
  let s = s0;
  for (let i = 0; i < 40 && (s.step !== "declareBlockers" || s.pending?.kind === "declareBlockers"); i++) {
    const p = s.pending;
    s = p?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: p.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  for (let i = 0; i < 10 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Boneyard Mycodrax", () => {
  it("counts the creature cards in your graveyard on the battlefield; in the graveyard, the other ones (CR 604.3)", () => {
    supported(mycodrax());
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mycodrax());
    into(s0, ap, vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 2, 2), "graveyard");
    into(s0, ap, vanilla("Test Elk", "Creature — Elk", "{2}{G}", 3, 3, 3), "graveyard");
    into(s0, ap, card("Test Sorcery", "Sorcery", "{G}", { cmc: 1, oracleText: "Draw a card." }), "graveyard");
    // Another player's graveyard doesn't count.
    into(s0, opp, vanilla("Test Wolf", "Creature — Wolf", "{1}{G}", 2, 2, 2), "graveyard");
    expect(ptOf(s0, m)).toBe("2/2");
    // In the graveyard it doesn't count itself.
    const y = into(s0, ap, mycodrax(), "graveyard");
    expect(ptOf(s0, m)).toBe("3/3");
    expect(characteristics(s0, s0.objects[y]!).power).toBe(2);
  });

  it("scavenge gives counters equal to its power in the graveyard, the other creature cards there (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const y = into(s0, ap, mycodrax(), "graveyard");
    into(s0, ap, vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 2, 2), "graveyard");
    into(s0, ap, vanilla("Test Elk", "Creature — Elk", "{2}{G}", 3, 3, 3), "graveyard");
    into(s0, ap, vanilla("Test Hound", "Creature — Dog", "{1}{G}", 2, 2, 2), "graveyard");
    const who = putOnBattlefield(s0, ap, vanilla("Test Squire", "Creature — Human", "{W}", 1, 1, 1));
    const s = settle(run(s0, planActivate(s0, ap, y, 0, [tgt(who)])));
    expect(zoneOf(s, y)).toBe("exile");
    expect(s.objects[who]!.counters["+1/+1"]).toBe(3);
    expect(ptOf(s, who)).toBe("4/4");
  });
});

describe("Templar Knight", () => {
  const relic = card("Test Relic", "Legendary Artifact", "{3}", { cmc: 3, oracleText: "" });
  const attackWith = (n: number, extra = 0) => {
    const { s: s0, ap, opp } = setup([]);
    const knights = Array.from({ length: n }, () => putOnBattlefield(s0, ap, templar()));
    const idle = Array.from({ length: extra }, () => putOnBattlefield(s0, ap, templar()));
    const r = into(s0, ap, relic, "library");
    let s = toAttacks(s0, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: knights.map((k) => ({ attacker: k, defender: opp })) });
    return { s: pastBlocks(s, ap), ap, knights, idle, r };
  };

  it("five attacking Templar Knights, itself among them, tap to put a legendary artifact card onto the battlefield", () => {
    supported(templar());
    const { s: s0, ap, knights, r } = attackWith(5);
    // Vigilance: still untapped while attacking.
    expect(knights.every((k) => !s0.objects[k]!.tapped)).toBe(true);
    let s = settle(run(s0, planActivate(s0, ap, knights[0]!, 0, undefined, undefined, undefined, undefined, { tap: knights })));
    expect(knights.every((k) => s.objects[k]!.tapped)).toBe(true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [r] }));
    expect(zoneOf(s, r)).toBe("battlefield");
  });

  it("not with four attacking: a Templar Knight that isn't attacking doesn't count, nor another creature", () => {
    const { s: s0, ap, knights, idle } = attackWith(4, 1);
    putOnBattlefield(s0, ap, vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    expect(planActivate(s0, ap, knights[0]!, 0)).toBeNull();
    expect(planActivate(s0, ap, knights[0]!, 0, undefined, undefined, undefined, undefined, { tap: [...knights, ...idle].slice(0, 5) })).toBeNull();
  });
});

describe("Sea Gate Stormcaller", () => {
  const enter = (kicked: boolean, hand: CardDef[]) => {
    const { s: s0, ap, ids, opp } = setup([stormcaller(), ...hand]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, kicked ? { kicks: [0] } : {})));
    expect(zoneOf(s, ids[0]!)).toBe("battlefield");
    return { s, ap, ids, opp };
  };
  const life = (s: GameState, p: PlayerId) => s.players[p]!.life;

  it("copies the next instant or sorcery spell with mana value 2 or less once; the one after isn't copied", () => {
    supported(stormcaller());
    const { s: s0, ap, ids, opp } = enter(false, [zap, zap]);
    const l = life(s0, opp);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(l - 2);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(l - 3);
  });

  it("kicked, twice; a spell with mana value 3 isn't copied and doesn't use it up", () => {
    const { s: s0, ap, ids, opp } = enter(true, [blast, zap]);
    const l = life(s0, opp);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(l - 1);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(l - 4);
  });

  it("the copy may get a new target", () => {
    const { s: s0, ap, ids, opp } = enter(false, [zap]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const [l, l3] = [life(s0, opp), life(s0, third)];
    let s = settle(run(s0, planCast(s0, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "copyTargets", copyOf: "Test Zap" });
    s = resolveAll(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: third }] } as Action));
    expect([life(s, opp), life(s, third)]).toEqual([l - 1, l3 - 1]);
  });

  it("an X spell's mana value counts X (CR 202.3e): X 2 makes it 3, not copied; X 1 is 2, copied", () => {
    const a = enter(false, [xZap]);
    const l = life(a.s, a.opp);
    const s = resolveAll(run(a.s, planCast(a.s, a.ap, a.ids[1]!, [{ kind: "player", id: a.opp }], undefined, undefined, 2)));
    expect(life(s, a.opp)).toBe(l - 2);
    const b = enter(false, [xZap]);
    const l2 = life(b.s, b.opp);
    const t = resolveAll(run(b.s, planCast(b.s, b.ap, b.ids[1]!, [{ kind: "player", id: b.opp }], undefined, undefined, 1)));
    expect(life(t, b.opp)).toBe(l2 - 2);
  });

  it("it still copies once ~ is gone; the copy isn't cast, so the trigger is used up after the spell (rulings)", () => {
    const { s: s0, ap, ids, opp } = enter(true, [zap, zap]);
    const sc = ids[0]!;
    // Gone after the delayed trigger was made.
    const s1 = structuredClone(s0);
    s1.battlefield.splice(s1.battlefield.indexOf(sc), 1);
    s1.objects[sc]!.zone = "graveyard";
    s1.players[ap]!.graveyard.push(sc);
    invalidateCharacteristics(s1);
    const l = life(s1, opp);
    let s = resolveAll(run(s1, planCast(s1, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(l - 3);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(l - 4);
  });
});

describe("Gorm the Great", () => {
  const attack = (blockers: number) => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gorm());
    const walls = Array.from({ length: blockers }, (_, i) => putOnBattlefield(s0, opp, vanilla(`Test Wall ${i}`, "Creature — Wall", "{1}{W}", 2, 0, 4)));
    let s = toAttacks(s0, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    for (let i = 0; i < 40 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) {
      const p = s.pending;
      s = p?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: p.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, ap, opp, g, walls };
  };

  it("must be blocked by two or more creatures if able (CR 509.1c): none or one isn't enough when two can", () => {
    supported(gorm());
    const { s, opp, g, walls } = attack(3);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must be blocked/);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: walls[0]!, attacker: g }] })).toThrow(/two or more creatures/);
    const t = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: walls[0]!, attacker: g }, { blocker: walls[1]!, attacker: g }] });
    expect(t.objects[g]!.blockedBy).toHaveLength(2);
    const u = act(s, { type: "declareBlockers", player: opp, blocks: walls.map((w) => ({ blocker: w, attacker: g })) });
    expect(u.objects[g]!.blockedBy).toHaveLength(3);
  });

  it("with only one creature able to block it, that one does (rulings); a tapped one can't", () => {
    const { s: s0, opp, g, walls } = attack(2);
    const s = structuredClone(s0);
    s.objects[walls[1]!]!.tapped = true;
    invalidateCharacteristics(s);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must be blocked/);
    const t = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: walls[0]!, attacker: g }] });
    expect(t.objects[g]!.blockedBy).toEqual([walls[0]]);
  });

  it("a bot blocks it with two", () => {
    const { s, opp, g } = attack(3);
    let t = s;
    for (const a of botActions(t, opp)) t = act(t, a);
    expect(t.objects[g]!.blockedBy?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("face-down creature spells cost less", () => {
  it("Dream Chisel and Obscuring Aether: {1} less each, only for a spell cast face down (CR 708.4)", () => {
    supported(chisel(), aether(), kadena(), maskmaker());
    const { s: s0, ap, ids } = setup([morph, morph2]);
    putOnBattlefield(s0, ap, chisel());
    let s = faceDown(s0, ap, ids[0]!);
    expect(tappedLands(s, ap)).toBe(2);
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    putOnBattlefield(s, ap, aether());
    invalidateCharacteristics(s);
    s = faceDown(s, ap, ids[1]!);
    expect(tappedLands(s, ap)).toBe(3);
    // Cast face up, the creature costs what it costs.
    const t0 = setup([morph]);
    putOnBattlefield(t0.s, t0.ap, chisel());
    const t = settle(run(t0.s, planCast(t0.s, t0.ap, t0.ids[0]!)));
    expect(tappedLands(t, t0.ap)).toBe(5);
  });

  it("Obscuring Aether can still turn itself face down", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, aether());
    const s = settle(run(s0, planActivate(s0, ap, a, 0)));
    expect(s.objects[a]!.faceDown).toBeTruthy();
    expect(ptOf(s, a)).toBe("2/2");
  });

  it("Kadena: the first face-down spell each turn costs {3} less, the next one doesn't; one cast earlier counts", () => {
    const { s: s0, ap, ids } = setup([morph, morph2]);
    putOnBattlefield(s0, ap, kadena());
    let s = faceDown(s0, ap, ids[0]!);
    expect(tappedLands(s, ap)).toBe(0);
    s = faceDown(s, ap, ids[1]!);
    expect(tappedLands(s, ap)).toBe(3);
    // A face-down spell cast before Kadena was there was the first this turn.
    const t0 = setup([morph, morph2]);
    let t = faceDown(t0.s, t0.ap, t0.ids[0]!);
    putOnBattlefield(t, t0.ap, kadena());
    invalidateCharacteristics(t);
    t = faceDown(t, t0.ap, t0.ids[1]!);
    expect(tappedLands(t, t0.ap)).toBe(6);
    // A creature spell cast face up isn't one: the face-down one after it is still the first.
    const u0 = setup([vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 2, 2), morph]);
    putOnBattlefield(u0.s, u0.ap, kadena());
    invalidateCharacteristics(u0.s);
    let u = settle(run(u0.s, planCast(u0.s, u0.ap, u0.ids[0]!)));
    u = faceDown(u, u0.ap, u0.ids[1]!);
    expect(tappedLands(u, u0.ap)).toBe(2);
  });

  it("Goblin Maskmaker: after it attacks, face-down spells cost {1} less this turn", () => {
    const { s: s0, ap, ids, opp } = setup([morph]);
    const g = putOnBattlefield(s0, ap, maskmaker());
    let s = toAttacks(s0, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    s = settle(s);
    s = passUntil(s, "main2", ap);
    const before = tappedLands(s, ap);
    s = faceDown(s, ap, ids[0]!);
    expect(tappedLands(s, ap) - before).toBe(2);
    // The next turn it's over.
    const t0 = setup([morph]);
    putOnBattlefield(t0.s, t0.ap, maskmaker());
    const t = faceDown(t0.s, t0.ap, t0.ids[0]!);
    expect(tappedLands(t, t0.ap)).toBe(3);
  });
});

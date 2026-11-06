// Round 289: from the top of the popularity list.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type TargetChoice } from "../src";
import { moveObject } from "../src/game";
import { putCounters } from "../src/counters";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const answer = (s: GameState, choice: string) => act(s, { type: "chooseOption", player: s.pending!.player, choice } as Action);
void passUntil; void characteristics; void invalidateCharacteristics; void card; void bear;

// Real oracle text (Scryfall).
const soulTransfer = (): CardDef => ({"oracleId":"1e46c709-5278-44f3-9f0e-f71bd9558339","name":"Soul Transfer","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose one. If you control an artifact and an enchantment as you cast this spell, you may choose both instead.\n• Exile target creature or planeswalker.\n• Return target creature or planeswalker card from your graveyard to your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const goblinGame = (): CardDef => ({"oracleId":"4a10c945-ad8b-47b6-8cbd-7b4e2612a9b0","name":"Goblin Game","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player hides at least one item, then all players reveal them simultaneously. Each player loses life equal to the number of items they revealed. The player who revealed the fewest items then loses half their life, rounded up. If two or more players are tied for fewest, each loses half their life, rounded up.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"pls","releasedAt":"2001-02-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const doom = (): CardDef => ({"oracleId":"f398a742-22c1-4da9-9d49-fdce2eb93d01","name":"Doom Reigns Supreme","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment — Plan","supertypes":[],"types":["Enchantment"],"subtypes":["Plan"],"oracleText":"Whenever a Villain you control enters, each opponent loses 1 life and you gain 1 life. Put a plan counter on this enchantment.\nWhen the fifth plan counter is put on this enchantment, sacrifice it. When you do, target opponent exiles the top five cards of their library. You may cast up to two spells from among the exiled cards without paying their mana costs.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const pursuit = (): CardDef => ({"oracleId":"214cfbc8-369e-4035-9b65-80d0e0024889","name":"Cryptic Pursuit","manaCost":"{2}{U}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you cast an instant or sorcery spell from your hand, manifest the top card of your library. (Put that card onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nWhenever a face-down creature you control dies, exile it if it's an instant or sorcery card. You may cast that card until the end of your next turn.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Manifest"],"commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const yarus = (): CardDef => ({"oracleId":"30fd6171-3e57-4c05-a86b-e1c0479ba236","name":"Yarus, Roar of the Old Gods","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Centaur Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Centaur","Druid"],"oracleText":"Other creatures you control have haste.\nWhenever one or more face-down creatures you control deal combat damage to a player, draw a card.\nWhenever a face-down creature you control dies, return it to the battlefield face down under its owner's control if it's a permanent card, then turn it face up.","power":"4","toughness":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"697f3fd9-1577-4f69-bdf8-db1f673d3505","name":"The Bears of Littjara","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create a 2/2 blue Shapeshifter creature token with changeling.\nII — Any number of target Shapeshifter creatures you control have base power and toughness 4/4.\nIII — Choose up to one target creature or planeswalker. Each creature with power 4 or greater you control deals damage equal to its power to that permanent.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const warGames = (): CardDef => ({"oracleId":"d7cfe3a3-e8e6-446d-a855-46c845f657fa","name":"The War Games","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Each player creates three tapped 1/1 white Warrior creature tokens. The tokens are goaded for as long as this Saga remains on the battlefield.\nII, III — Put a +1/+1 counter on each Warrior creature.\nIV — You may exile a nontoken creature you control. When you do, exile all Warriors.","colors":["W"],"colorIdentity":["W"],"keywords":["Goad"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const vault = (): CardDef => ({"oracleId":"586fb987-cd77-420f-978c-2ce140bcdcfb","name":"Vault 13: Dweller's Journey","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — For each player, exile up to one other target enchantment or creature that player controls until this Saga leaves the battlefield.\nII — You gain 2 life and scry 2.\nIII — Return two cards exiled with this Saga to the battlefield under their owners' control and put the rest on the bottom of their owners' libraries.","colors":["W"],"colorIdentity":["W"],"keywords":["Scry"],"commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const steed = (): CardDef => ({"oracleId":"22c643b1-62dd-477c-8944-97b3becdfdbe","name":"Phantom Steed","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Horse Illusion","supertypes":[],"types":["Creature"],"subtypes":["Horse","Illusion"],"oracleText":"Flash\nWhen this creature enters, exile another target creature you control until this creature leaves the battlefield.\nWhenever this creature attacks, create a tapped and attacking token that's a copy of the exiled card, except it's an Illusion in addition to its other types. Sacrifice that token at end of combat.","power":"4","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flash"],"commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

describe("round 289", () => {
  it("every card of the round compiles fully", () => {
    supported(soulTransfer(), goblinGame(), doom(), pursuit(), yarus(), bears(), warGames(), vault(), steed());
  });
});

describe("Soul Transfer", () => {
  const art = card("Test Relic", "Artifact", "{1}");
  const ench = card("Test Aura Field", "Enchantment", "{1}");
  const both = card("Test Artifact Enchantment", "Artifact Enchantment", "{1}");
  const game = (yours: CardDef[]) => {
    const { s, ap, ids, opp } = setup([soulTransfer()]);
    for (const d of yours) putOnBattlefield(s, ap, d);
    const foe = putOnBattlefield(s, opp, bear());
    const dead = putOnBattlefield(s, ap, bear({ name: "Test Dead Bear" }));
    moveObject(s, dead, "graveyard");
    return { s, ap, spell: ids[0]!, foe, dead };
  };

  it("with an artifact and an enchantment as you cast it, you may choose both modes", () => {
    const { s: s0, ap, spell, foe, dead } = game([art, ench]);
    const s = settle(run(s0, planCast(s0, ap, spell, [tgt(foe), tgt(dead)], [0, 1])));
    expect(zone(s, foe)).toBe("exile");
    expect(zone(s, dead)).toBe("hand");
  });

  it("one artifact enchantment is both (rulings); with only an artifact, just one mode", () => {
    const g = game([both]);
    expect(planCast(g.s, g.ap, g.spell, [tgt(g.foe), tgt(g.dead)], [0, 1])).not.toBeNull();
    const h = game([art]);
    expect(planCast(h.s, h.ap, h.spell, [tgt(h.foe), tgt(h.dead)], [0, 1])).toBeNull();
    const s = settle(run(h.s, planCast(h.s, h.ap, h.spell, [tgt(h.dead)], [1])));
    expect(zone(s, h.dead)).toBe("hand");
    expect(zone(s, h.foe)).toBe("battlefield");
  });
});

describe("Goblin Game", () => {
  it("each player hides at least one item; each loses that many life, then the fewest loses half their life, rounded up", () => {
    const { s: s0, ap, ids } = setup([goblinGame()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    const order = [...s.turnOrder];
    const picks: Record<number, string> = { [order[0]!]: "2", [order[1]!]: "1", [order[2]!]: "3", [order[3]!]: "4" };
    const life = Object.fromEntries(order.map((p) => [p, s.players[p]!.life]));
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "secretNumber", numberRange: { min: 1 } });
      // Zero items can't be hidden.
      expect(() => answer(s, "0")).toThrow();
      s = settle(answer(s, picks[s.pending!.player]!));
    }
    const fewest = order[1]!;
    for (const p of order) {
      const after = life[p]! - Number(picks[p]);
      expect(s.players[p]!.life).toBe(p === fewest ? after - Math.ceil(after / 2) : after);
    }
  });

  it("players tied for fewest each lose half their life; half of a negative total is 0 (rulings)", () => {
    const { s: s0, ap, ids } = setup([goblinGame()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const order = [...s.turnOrder];
    s.players[order[2]!]!.life = 0;
    const picks: Record<number, string> = { [order[0]!]: "1", [order[1]!]: "5", [order[2]!]: "1", [order[3]!]: "1" };
    const life = Object.fromEntries(order.map((p) => [p, s.players[p]!.life]));
    while (s.pending?.kind === "chooseOption" && s.pending.what === "secretNumber") s = settle(answer(s, picks[s.pending.player]!));
    expect(s.players[order[1]!]!.life).toBe(life[order[1]!]! - 5);
    for (const p of [order[0]!, order[3]!]) expect(s.players[p]!.life).toBe(life[p]! - 1 - Math.ceil((life[p]! - 1) / 2));
    // At -1 after the first loss, half of 0 is lost: still -1.
    expect(s.players[order[2]!]!.life).toBe(-1);
  });
});

describe("Doom Reigns Supreme", () => {
  it("the fifth plan counter: sacrifice it, then target opponent exiles their top five and you may cast up to two of them free", () => {
    const { s: s0, ap, opp } = setup([]);
    const doomId = putOnBattlefield(s0, ap, doom());
    putCounters(s0, s0.objects[doomId]!, "plan", 4);
    // The opponent's top five: three instants and two lands.
    const zap = (n: number) => card(`Test Zap ${n}`, "Instant", "{1}{R}", { cmc: 2, oracleText: "Draw a card." });
    const top = [zap(1), card("Test Wastes A", "Land"), zap(2), zap(3), card("Test Wastes B", "Land")].map((d) => {
      const id = putOnBattlefield(s0, opp, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      return id;
    });
    s0.players[opp]!.library.unshift(...top);
    let s = s0;
    putCounters(s, s.objects[doomId]!, "plan", 1);
    s = settle(s);
    expect(zone(s, doomId)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    for (const id of top) expect(zone(s, id)).toBe("exile");
    // Two of the three instants cast, then no more.
    const hand = s.players[ap]!.hand.length;
    for (const pick of [top[0]!, top[2]!]) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
      expect(s.pending!.kind === "chooseOption" && s.pending.options).not.toContain(top[1]);
      s = act(s, { type: "chooseOption", player: ap, choice: pick } as Action);
      expect(s.pending).toMatchObject({ kind: "castFree", objectId: pick });
      s = run(s, planCast(s, ap, pick));
    }
    // Two cast: no third offer.
    expect(s.pending).toBeNull();
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, top[3]!)).toBe("exile");
  });
});

/** A face-down 2/2 of `pid`'s, the card `def` underneath. */
const faceDown = (s: GameState, pid: number, def: CardDef, kind: "manifest" | "morph" = "manifest") => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.faceDown = kind;
  invalidateCharacteristics(s);
  return id;
};
const kill = (s: GameState, id: string) => {
  s.objects[id]!.damage = 5;
  invalidateCharacteristics(s);
  return settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
};

describe("Cryptic Pursuit", () => {
  const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
  it("a face-down creature that dies is exiled if it's an instant or sorcery card, castable until the end of your next turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pursuit());
    const fd = faceDown(s0, ap, bolt);
    const fdBear = faceDown(s0, ap, bear({ name: "Test Hidden Bear" }));
    let s = kill(s0, fd);
    expect(zone(s, fd)).toBe("exile");
    expect(s.objects[fd]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn" });
    s = kill(s, fdBear);
    expect(zone(s, fdBear)).toBe("graveyard");
  });
});

describe("Yarus, Roar of the Old Gods", () => {
  const flipper = card("Test Flipper", "Creature — Human", "{2}{U}", { cmc: 3, power: "3", toughness: "3", oracleText: "Morph {U}\nWhen this creature is turned face up, draw two cards.", keywords: ["Morph"] });
  const greeter = card("Test Greeter", "Creature — Human", "{2}{W}", { cmc: 3, power: "1", toughness: "1", oracleText: "When this creature enters, you gain 5 life." });
  const relic = card("Test Shrine", "Enchantment", "{2}", { cmc: 2, oracleText: "" });
  const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
  it("a face-down creature that dies comes back face down, then is turned face up: its turned-face-up trigger, not its enters one", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, yarus());
    const a = faceDown(s0, ap, flipper, "morph");
    const b = faceDown(s0, ap, greeter);
    const hand = s0.players[ap]!.hand.length;
    const life = s0.players[ap]!.life;
    let s = kill(s0, a);
    expect(zone(s, a)).toBe("battlefield");
    expect(s.objects[a]!.faceDown).toBeUndefined();
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    s = kill(s, b);
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.faceDown).toBeUndefined();
    expect(s.players[ap]!.life).toBe(life);
  });

  it("a noncreature permanent card comes back face up as itself; an instant card stays in the graveyard", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, yarus());
    const a = faceDown(s0, ap, relic);
    const b = faceDown(s0, ap, bolt);
    let s = kill(s0, a);
    expect(zone(s, a)).toBe("battlefield");
    expect(characteristics(s, s.objects[a]!).types).toEqual(["Enchantment"]);
    s = kill(s, b);
    expect(zone(s, b)).toBe("graveyard");
  });

  it("a face-up creature dying doesn't trigger it", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, yarus());
    const a = putOnBattlefield(s0, ap, bear());
    const s = kill(s0, a);
    expect(zone(s, a)).toBe("graveyard");
  });
});

/** The chooseTargets answer: `ids`, then "none" for the rest of the slots it offers. */
const targetsFor = (s: GameState, ids: TargetChoice[], slots: number) => [...ids, ...Array.from({ length: Math.max(0, slots - ids.length) }, () => ({ kind: "none" }) as TargetChoice)];
const lore = (s: GameState, saga: string) => {
  putCounters(s, s.objects[saga]!, "lore", 1);
  return settle(s);
};

describe("The Bears of Littjara", () => {
  const shifter = (n: number) => bear({ name: `Test Shapeshifter ${n}`, typeLine: "Creature — Shapeshifter", subtypes: ["Shapeshifter"], power: "1", toughness: "1" });
  it("II: any number of target Shapeshifters you control have base power and toughness 4/4 from then on", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, bears());
    const a = putOnBattlefield(s0, ap, shifter(1));
    const b = putOnBattlefield(s0, ap, shifter(2));
    const plain = putOnBattlefield(s0, ap, bear());
    let s = lore(s0, saga);
    // I: a 2/2 Shapeshifter with changeling.
    const token = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[token]!).subtypes).toContain("Shapeshifter");
    s = lore(s, saga);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const spec = s.pending!.kind === "chooseTargets" ? s.pending.specs : [];
    expect(spec.length).toBeGreaterThan(0);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: targetsFor(s, [tgt(a), tgt(token)], spec.length) }));
    s = passUntil(s, "upkeep");
    expect(`${characteristics(s, s.objects[a]!).power}/${characteristics(s, s.objects[a]!).toughness}`).toBe("4/4");
    expect(`${characteristics(s, s.objects[token]!).power}/${characteristics(s, s.objects[token]!).toughness}`).toBe("4/4");
    expect(`${characteristics(s, s.objects[b]!).power}/${characteristics(s, s.objects[b]!).toughness}`).toBe("1/1");
    expect(`${characteristics(s, s.objects[plain]!).power}/${characteristics(s, s.objects[plain]!).toughness}`).toBe("2/2");
  });

  it("III: each creature you control with power 4 or greater deals damage equal to its power to up to one target creature or planeswalker", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, bears());
    const big = putOnBattlefield(s0, ap, bear({ name: "Test Big", power: "4", toughness: "4" }));
    const bigger = putOnBattlefield(s0, ap, bear({ name: "Test Bigger", power: "5", toughness: "5" }));
    putOnBattlefield(s0, ap, bear({ name: "Test Small", power: "3", toughness: "3" }));
    const foe = putOnBattlefield(s0, opp, bear({ name: "Test Wall", power: "0", toughness: "12" }));
    putCounters(s0, s0.objects[saga]!, "lore", 2);
    let s = lore(s0, saga);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(foe)] }));
    expect(s.objects[foe]!.damage).toBe(9);
    expect(zone(s, big)).toBe("battlefield");
    expect(zone(s, bigger)).toBe("battlefield");
    expect(zone(s, saga)).toBe("graveyard");
  });
});

describe("The War Games", () => {
  it("I: each player creates three tapped 1/1 Warriors, goaded for as long as the Saga remains", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, warGames());
    let s = lore(s0, saga);
    const warriors = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(warriors.length).toBe(12);
    for (const pid of s.turnOrder) expect(warriors.filter((id) => s.objects[id]!.controller === pid).length).toBe(3);
    const theirs = warriors.find((id) => s.objects[id]!.controller === opp)!;
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[theirs]!).goadedBy).toContain(ap);
    // The Saga leaves: no longer goaded.
    moveObject(s, saga, "graveyard");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[theirs]!).goadedBy ?? []).not.toContain(ap);
  });

  it("II and III grow Warriors; IV: you may exile a nontoken creature you control, and when you do, exile all Warriors", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, warGames());
    const mine = putOnBattlefield(s0, ap, bear());
    const theirWarrior = putOnBattlefield(s0, opp, bear({ name: "Test Warrior", typeLine: "Creature — Human Warrior", subtypes: ["Human", "Warrior"] }));
    let s = lore(s0, saga);
    s = lore(s, saga);
    expect(s.objects[theirWarrior]!.counters["+1/+1"]).toBe(1);
    s = lore(s, saga);
    expect(s.objects[theirWarrior]!.counters["+1/+1"]).toBe(2);
    s = lore(s, saga);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 5 && s.pending?.kind === "pickPermanents"; i++) s = act(s, { type: "pickPermanents", player: ap, ids: [mine] } as Action);
    s = settle(s);
    expect(zone(s, mine)).toBe("exile");
    expect(zone(s, theirWarrior)).toBe("exile");
    expect(s.battlefield.filter((id) => s.objects[id]?.isToken).length).toBe(0);
  });

  it("IV with no nontoken creature to exile: the Warriors stay", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, warGames());
    let s = lore(s0, saga);
    putCounters(s, s.objects[saga]!, "lore", 2);
    s = settle(s);
    s = lore(s, saga);
    // Nothing to exile: not even asked (CR 603.12: no reflexive trigger).
    expect(s.pending).toBeNull();
    expect(s.battlefield.filter((id) => s.objects[id]?.isToken).length).toBe(12);
  });
});

describe("Vault 13: Dweller's Journey", () => {
  it("I exiles up to one per player until it leaves; III returns two chosen and puts the rest on the bottom of their owners' libraries", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, vault());
    const order = [0, 1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!);
    const victims = order.slice(1).map((pid, i) => putOnBattlefield(s0, pid, bear({ name: `Test Victim ${i}` })));
    let s = lore(s0, saga);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const slots = s.pending!.kind === "chooseTargets" ? s.pending.specs.length : 0;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" } as TargetChoice, ...victims.map(tgt)].slice(0, slots) }));
    for (const v of victims) expect(zone(s, v)).toBe("exile");
    // II: gain 2 life and scry 2.
    s = lore(s, saga);
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] } as Action));
    // III: the first two victims return; the third goes to the bottom of its owner's library.
    s = lore(s, saga);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [victims[0]!, victims[1]!] } as Action));
    expect(zone(s, victims[0]!)).toBe("battlefield");
    expect(s.objects[victims[0]!]!.controller).toBe(order[1]);
    expect(zone(s, victims[1]!)).toBe("battlefield");
    expect(zone(s, victims[2]!)).toBe("library");
    expect(s.players[order[3]!]!.library.at(-1)).toBe(victims[2]);
    expect(zone(s, saga)).toBe("graveyard");
  });
});

describe("Phantom Steed", () => {
  it("exiles another creature you control until it leaves; when it attacks, a tapped and attacking Illusion copy of the exiled card, sacrificed at end of combat", () => {
    const { s: s0, ap, ids, opp } = setup([steed()]);
    const pet = putOnBattlefield(s0, ap, bear({ name: "Test Pet", power: "3", toughness: "3" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(pet)] }));
    expect(zone(s, pet)).toBe("exile");
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ids[0]!, defender: opp }] } as Action);
    for (let i = 0; i < 20 && s.step === "declareAttackers" && !s.battlefield.some((id) => s.objects[id]!.isToken); i++) {
      if (s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom") s = answer(s, String(opp));
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const token = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(token).toBeDefined();
    const c = characteristics(s, s.objects[token]!);
    expect(c.name).toBe("Test Pet");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Illusion"]));
    expect(s.objects[token]!.tapped).toBe(true);
    expect(s.objects[token]!.attacking).toBe(opp);
    s = passUntil(s, "main2", ap);
    expect(s.objects[token]?.zone ?? "gone").not.toBe("battlefield");
    expect(zone(s, pet)).toBe("exile");
  });
});

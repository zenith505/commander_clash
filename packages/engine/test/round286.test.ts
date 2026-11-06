// Round 286: from the top of the popularity list. A target player gaining control of up to three creatures that must
// block (Domineering Will); creatures taken for the turn that you can't sacrifice, and an opponent you can't attack
// (Call for Aid); "exactly two cards ... that have different names" from which an opponent picks one for your hand
// (Burning-Rune Demon); creature cards with different powers, two of which an opponent shuffles back (Threats
// Undetected); sacrificing any number of creatures with base power or toughness 1 or less (Angelic Aberration); a copy of
// each Adventure instant or sorcery spell you cast (Lucky Clover); damage for each nonland card revealed before a land,
// doubled if that land is a Mountain (Goblin Charbelcher).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { attackProblem } from "../src/game";
import { canBeSacrificed, canSacrificeForCost } from "../src/cards";
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
const pl = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const ctl = (s: GameState, id: string) => ch(s, id).controller;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
/** A fresh copy of `def` on top of `pid`'s library. */
function toLibrary(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}

// Real oracle text (Scryfall).
const unearthly = (): CardDef => ({"oracleId":"9527d2dc-d2e2-4259-aefe-2342ea07bc63","name":"An Unearthly Child","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II, III — Reveal cards from the top of your library until you reveal a Doctor card, a card with doctor's companion, or a Vehicle card. Put that card into your hand and the rest on the bottom of your library in a random order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const charbelcher = (): CardDef => ({"oracleId":"c9b1557b-70b1-44f2-9fc2-7aa0b035b187","name":"Goblin Charbelcher","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Reveal cards from the top of your library until you reveal a land card. This artifact deals damage equal to the number of nonland cards revealed this way to any target. If the revealed land card was a Mountain, this artifact deals double that damage instead. Put the revealed cards on the bottom of your library in any order.","colors":[],"colorIdentity":[],"keywords":["Double"],"commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const clover = (): CardDef => ({"oracleId":"370d67f6-8d43-46ca-ae6c-00799bb0bd0c","name":"Lucky Clover","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever you cast an Adventure instant or sorcery spell, copy it. You may choose new targets for the copy.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bonecrusher = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]}) as CardDef;
const aberration = (): CardDef => ({"oracleId":"60d0c941-39f6-4144-abef-02b0a84d602e","name":"Angelic Aberration","manaCost":"{5}{W}","cmc":6,"typeLine":"Creature — Eldrazi Angel","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi","Angel"],"oracleText":"Devoid (This card has no color.)\nFlying, vigilance\nWhen this creature enters, sacrifice any number of creatures each with base power or toughness 1 or less. Create that many 4/4 colorless Eldrazi Angel creature tokens with flying and vigilance.","power":"4","toughness":"4","colors":[],"colorIdentity":["W"],"keywords":["Flying","Devoid","Vigilance"],"commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const burningRune = (): CardDef => ({"oracleId":"d551fae8-6b40-4118-b9db-29d2f5dff405","name":"Burning-Rune Demon","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Demon Berserker","supertypes":[],"types":["Creature"],"subtypes":["Demon","Berserker"],"oracleText":"Flying\nWhen this creature enters, you may search your library for exactly two cards not named Burning-Rune Demon that have different names. If you do, reveal those cards. An opponent chooses one of them. Put the chosen card into your hand and the other into your graveyard, then shuffle.","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const threats = (): CardDef => ({"oracleId":"24108160-e72b-4451-b1b1-b2b3ac3ede85","name":"Threats Undetected","manaCost":"{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for up to four creature cards with different powers and reveal them. An opponent chooses two of those cards. Shuffle the chosen cards into your library and put the rest into your hand.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const domineering = (): CardDef => ({"oracleId":"2c438ecb-b127-4450-9395-2d1eea294f30","name":"Domineering Will","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target player gains control of up to three target nonattacking creatures until end of turn. Untap those creatures. They block this turn if able.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const callForAid = (): CardDef => ({"oracleId":"6d650eef-1156-4e3b-8fa8-90a6ee04d9a8","name":"Call for Aid","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gain control of all creatures target opponent controls until end of turn. Untap those creatures. They gain haste until end of turn. You can't attack that player this turn. You can't sacrifice those creatures this turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 286", () => {
  it("every card of the round compiles fully", () => {
    supported(domineering(), callForAid(), burningRune(), threats(), aberration(), clover(), charbelcher(), unearthly());
  });
});

describe("Domineering Will", () => {
  it("the target player gains control of up to three nonattacking creatures until end of turn, untapped, and they must block", () => {
    const { s: s0, ap, ids, opp } = setup([domineering()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const a = putOnBattlefield(s0, third, bear());
    const b = putOnBattlefield(s0, third, bear());
    s0.objects[a]!.tapped = true;
    invalidateCharacteristics(s0);
    // You give the third player's creatures to the opponent.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [pl(opp), tgt(a), tgt(b), { kind: "none" }], undefined, "auto")));
    expect(ctl(s, a)).toBe(opp);
    expect(ctl(s, b)).toBe(opp);
    expect(s.objects[a]!.tapped).toBe(false);
    expect(ch(s, a).mustBlock).toBe(true);
    // Back to their controller at the cleanup step (CR 514.2).
    s = passUntil(s, "upkeep", opp);
    expect(ctl(s, a)).toBe(third);
    expect(ch(s, a).mustBlock ?? false).toBe(false);
  });

  it("an attacking creature can't be targeted", () => {
    const { s: s0, ap, ids, opp } = setup([domineering()]);
    const a = putOnBattlefield(s0, opp, bear());
    s0.objects[a]!.attacking = { player: ap } as never;
    invalidateCharacteristics(s0);
    expect(planCast(s0, ap, ids[0]!, [pl(ap), tgt(a), { kind: "none" }, { kind: "none" }], undefined, "auto")).toBeNull();
  });
});

describe("Call for Aid", () => {
  const game = () => {
    const { s: s0, ap, ids, opp } = setup([callForAid()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[a]!.tapped = true;
    const mine = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [pl(opp)], undefined, "auto")));
    return { s, ap, opp, third, a, b, mine };
  };

  it("gains control of all their creatures, untapped and with haste, until end of turn", () => {
    const { s, ap, a, b } = game();
    expect(ctl(s, a)).toBe(ap);
    expect(ctl(s, b)).toBe(ap);
    expect(s.objects[a]!.tapped).toBe(false);
    expect(ch(s, a).keywords).toContain("Haste");
  });

  it("you can't attack that player this turn, but another opponent is fine", () => {
    const { s, opp, third, a } = game();
    expect(attackProblem(s, s.objects[a]!, opp)).not.toBeNull();
    expect(attackProblem(s, s.objects[a]!, third)).toBeNull();
  });

  it("you can't sacrifice those creatures this turn, for a cost or by an effect; your own creatures you can (rulings)", () => {
    const { s, a, b, mine } = game();
    for (const id of [a, b]) {
      expect(canBeSacrificed(s, s.objects[id]!)).toBe(false);
      expect(canSacrificeForCost(s, s.objects[id]!)).toBe(false);
    }
    expect(canBeSacrificed(s, s.objects[mine]!)).toBe(true);
  });

  it("all of it ends with the turn, and the creatures go back", () => {
    let { s, opp, a } = game();
    s = passUntil(s, "upkeep", opp);
    expect(ctl(s, a)).toBe(opp);
    expect(canBeSacrificed(s, s.objects[a]!)).toBe(true);
  });
});

describe("Burning-Rune Demon", () => {
  const sol = card("Test Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
  const stone = card("Test Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });
  const game = () => {
    const { s: s0, ap, ids } = setup([burningRune()]);
    const a = toLibrary(s0, ap, sol);
    const b = toLibrary(s0, ap, stone);
    const other = toLibrary(s0, ap, burningRune());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    return { s, ap, a, b, other };
  };

  it("exactly two cards with different names, not named Burning-Rune Demon; an opponent picks the one for the hand", () => {
    let { s, ap, a, b, other } = game();
    s = act(s, { type: "chooseMay", player: ap, yes: true } as Action);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2, exactly: true });
    const offered = (s.pending as { cards: string[] }).cards;
    expect(offered).not.toContain(other);
    expect(offered.filter((id) => nameOf(s, id) === "Forest")).toHaveLength(1);
    // One card alone isn't allowed.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [a] })).toThrow();
    s = act(s, { type: "searchLibrary", player: ap, found: [a, b] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(third) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: third, min: 1, max: 1, forPlayer: ap });
    s = settle(act(s, { type: "searchLibrary", player: third, found: [b] }));
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("finding nothing is allowed; not searching shuffles nothing (rulings)", () => {
    let { s, ap } = game();
    const before = [...s.players[ap]!.library];
    const no = settle(act(s, { type: "chooseMay", player: ap, yes: false } as Action));
    expect(no.pending).toBeNull();
    expect(no.players[ap]!.library).toEqual(before);
    s = settle(act(act(s, { type: "chooseMay", player: ap, yes: true } as Action), { type: "searchLibrary", player: ap, found: [] }));
    expect(s.pending).toBeNull();
  });
});

describe("Threats Undetected", () => {
  const cre = (p: number) => card(`Test Beast ${p}`, "Creature — Beast", "{2}", { power: String(p), toughness: "3" });
  it("up to four creature cards with different powers; the opponent's two are shuffled back, the rest go to the hand", () => {
    const { s: s0, ap, ids } = setup([threats()]);
    const four = [cre(1), cre(3), cre(4), cre(5)].map((d) => toLibrary(s0, ap, d));
    const same = toLibrary(s0, ap, card("Test Twin", "Creature — Beast", "{2}", { power: "3", toughness: "1" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 4, distinctPowers: true });
    // Two with power 3 can't both be found (rulings: different numbers).
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [four[1]!, same] })).toThrow();
    s = act(s, { type: "searchLibrary", player: ap, found: four });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 2, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [four[0]!, four[3]!] }));
    expect(s.objects[four[0]!]!.zone).toBe("library");
    expect(s.objects[four[3]!]!.zone).toBe("library");
    expect(s.objects[four[1]!]!.zone).toBe("hand");
    expect(s.objects[four[2]!]!.zone).toBe("hand");
    expect(s.players[ap]!.library).toContain(four[0]!);
  });

  it("with two found, both go back into the library", () => {
    const { s: s0, ap, ids } = setup([threats()]);
    const two = [cre(1), cre(2)].map((d) => toLibrary(s0, ap, d));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: two }));
    expect(s.pending).toBeNull();
    expect(two.map((id) => s.objects[id]!.zone)).toEqual(["library", "library"]);
  });
});

describe("Angelic Aberration", () => {
  it("sacrifices any number of creatures with base power or toughness 1 or less, then that many 4/4 Angels", () => {
    const { s: s0, ap, ids } = setup([aberration()]);
    const elf = putOnBattlefield(s0, ap, card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const wall = putOnBattlefield(s0, ap, card("Test Wall", "Creature — Wall", "{1}", { power: "3", toughness: "1" }));
    const pumped = putOnBattlefield(s0, ap, card("Test Pup", "Creature — Dog", "{1}", { power: "1", toughness: "1" }));
    s0.objects[pumped]!.counters["+1/+1"] = 3;
    const bigBear = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    const pend = s.pending as { kind: string; cards?: string[]; options?: string[] } | null;
    expect(pend?.kind).toBe("pickPermanents");
    const offered = pend!.cards ?? pend!.options ?? [];
    // Counters don't change its base power and toughness (rulings); the 2/2 has neither 1 or less.
    expect(offered).toEqual(expect.arrayContaining([elf, wall, pumped]));
    expect(offered).not.toContain(bigBear);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [elf, pumped] }));
    expect(s.objects[elf]!.zone).toBe("graveyard");
    expect(s.objects[pumped]!.zone).toBe("graveyard");
    expect(s.objects[wall]!.zone).toBe("battlefield");
    const angels = s.battlefield.filter((id) => s.objects[id]!.isToken && ch(s, id).subtypes.includes("Angel"));
    expect(angels).toHaveLength(2);
    expect(ch(s, angels[0]!).keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
  });
});

describe("Lucky Clover", () => {
  it("an Adventure instant cast as an Adventure is copied; the copy may get a new target", () => {
    const { s: s0, ap, ids, opp } = setup([bonecrusher()]);
    putOnBattlefield(s0, ap, clover());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const life = (s: GameState, p: PlayerId) => s.players[p]!.life;
    const [l1, l2] = [life(s0, opp), life(s0, third)];
    let s = run(s0, planCast(s0, ap, ids[0]!, [pl(opp)], undefined, "auto", undefined, { face: 1 }));
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(1);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap, copyOf: "Stomp" });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [pl(third)] } as unknown as Action));
    expect(s.pending).toBeNull();
    expect(life(s, opp) + life(s, third)).toBe(l1 + l2 - 4);
    // The card itself goes on an adventure; the copy is gone.
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("casting the creature isn't an Adventure spell", () => {
    const { s: s0, ap, ids } = setup([bonecrusher()]);
    putOnBattlefield(s0, ap, clover());
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto"));
    expect(s.triggerQueue.length).toBe(0);
    expect(s.stack.length).toBe(1);
  });
});

describe("Goblin Charbelcher", () => {
  const fire = (top: CardDef[], library?: "empty") => {
    const { s: s0, ap, opp } = setup([]);
    const cb = putOnBattlefield(s0, ap, charbelcher());
    if (library === "empty") s0.players[ap]!.library = [];
    const ids = [...top].reverse().map((d) => toLibrary(s0, ap, d)).reverse();
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, cb, 0, [pl(opp)]));
    s = settle(s);
    // The revealed cards go on the bottom in an order you choose.
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: [...s.pending.cards], away: [] }));
    return { s, ap, ids, dealt: life - s.players[opp]!.life };
  };

  it("damage equal to the nonland cards revealed before the land", () => {
    const { s, ap, ids, dealt } = fire([bear(), bear(), forest, bear()]);
    expect(dealt).toBe(2);
    // The revealed cards went to the bottom; the card after the land is on top.
    expect(s.players[ap]!.library[0]).toBe(ids[3]);
    expect(s.players[ap]!.library.slice(-3).sort()).toEqual([ids[0], ids[1], ids[2]].sort());
  });

  it("double that damage if the land is a Mountain", () => {
    expect(fire([bear(), bear(), bear(), mountain]).dealt).toBe(6);
  });

  it("with no land card at all, the damage is the number of cards revealed (rulings)", () => {
    expect(fire([bear(), bear(), bear()], "empty").dealt).toBe(3);
  });
});

describe("An Unearthly Child", () => {
  const companion = card("Test Companion", "Legendary Creature — Human", "{1}{W}", { power: "1", toughness: "1", oracleText: "Doctor's companion (You can have two commanders if the other is the Doctor.)", keywords: ["Doctor's companion"] });
  const doctor = card("Test Time Lord", "Legendary Creature — Time Lord Doctor", "{3}{W}", { power: "3", toughness: "3" });
  const vehicle = card("Test Cart", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Crew 1" });
  const human = card("Test Plain Human", "Creature — Human", "{W}", { power: "1", toughness: "1" });

  it("each chapter reveals until a Doctor, a card with doctor's companion, or a Vehicle; the rest go to the bottom", () => {
    const { s: s0, ap, ids } = setup([unearthly()]);
    // Top: a Human without the ability, the companion, a bear, the Vehicle, a bear, the Doctor.
    const lib = [human, companion, bear(), vehicle, bear(), doctor].reverse().map((d) => toLibrary(s0, ap, d)).reverse();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto")));
    // I: the companion; the Human before it goes to the bottom.
    expect(s.players[ap]!.hand).toContain(lib[1]);
    expect(s.players[ap]!.hand).not.toContain(lib[0]);
    expect(s.players[ap]!.library.at(-1)).toBe(lib[0]);
    expect(s.players[ap]!.library[0]).toBe(lib[2]);
    // II: the Vehicle.
    putCounters(s, s.objects[ids[0]!]!, "lore", 1);
    s = settle(s);
    expect(s.players[ap]!.hand).toContain(lib[3]);
    expect(s.players[ap]!.library.slice(-2)).toEqual([lib[0], lib[2]]);
    // III: the Doctor, then the Saga is sacrificed (CR 714.4).
    putCounters(s, s.objects[ids[0]!]!, "lore", 1);
    s = settle(s);
    expect(s.players[ap]!.hand).toContain(lib[5]);
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
  });
});

// Round 109, cards down the popularity list: Halo Fountain ("Untap a tapped creature you control" as a cost), Lathril
// ("Tap ten untapped Elves you control"), Mutational Advantage (damage to "those permanents" prevented, the set fixed as
// it resolves, rulings), Perpetual Timepiece (any number of target cards shuffled in, the library shuffled even with
// none, rulings), Maelstrom of the Spirit Dragon (mana only for Dragon or Omen spells), Quartzwood Crasher (an X/X token,
// X the damage creatures with trample dealt), For the Common Good (copies of a token), Daretti, Scrap Savant (a target
// in "If you do, ...", and an emblem returning artifacts that are put into your graveyard).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, characteristics, compileCard, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const fountain = card("Halo Fountain", "Artifact", "{2}{W}", {
  oracleText:
    "{W}, {T}, Untap a tapped creature you control: Create a 1/1 green and white Citizen creature token.\n{W}{W}, {T}, Untap two tapped creatures you control: Draw a card.\n{W}{W}{W}{W}{W}, {T}, Untap fifteen tapped creatures you control: You win the game.",
});
const lathril = card("Lathril, Blade of the Elves", "Legendary Creature — Elf Noble", "{2}{B}{G}", {
  power: "2",
  toughness: "3",
  keywords: ["Menace"],
  oracleText:
    "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever Lathril deals combat damage to a player, create that many 1/1 green Elf Warrior creature tokens.\n{T}, Tap ten untapped Elves you control: Each opponent loses 10 life and you gain 10 life.",
});
const advantage = card("Mutational Advantage", "Instant", "{1}{G}{U}", {
  keywords: ["Proliferate"],
  oracleText:
    "Permanents you control with counters on them gain hexproof and indestructible until end of turn. Prevent all damage that would be dealt to those permanents this turn. Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)",
});
const timepiece = card("Perpetual Timepiece", "Artifact", "{2}", {
  keywords: ["Mill"],
  oracleText: "{T}: Mill two cards. (Put the top two cards of your library into your graveyard.)\n{2}, Exile this artifact: Shuffle any number of target cards from your graveyard into your library.",
});
const maelstrom = card("Maelstrom of the Spirit Dragon", "Land", "", {
  oracleText:
    "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Dragon spell or an Omen spell.\n{4}, {T}, Sacrifice this land: Search your library for a Dragon card, reveal it, put it into your hand, then shuffle.",
});
const crasher = card("Quartzwood Crasher", "Creature — Dinosaur Beast", "{2}{R}{R}{G}", {
  power: "6",
  toughness: "6",
  keywords: ["Trample"],
  oracleText:
    "Trample\nWhenever one or more creatures you control with trample deal combat damage to a player, create an X/X green Dinosaur Beast creature token with trample, where X is the amount of damage those creatures dealt to that player.",
});
const commonGood = card("For the Common Good", "Sorcery", "{X}{X}{G}", {
  oracleText: "Create X tokens that are copies of target token you control. Then tokens you control gain indestructible until your next turn. You gain 1 life for each token you control.",
});
const daretti = card("Daretti, Scrap Savant", "Legendary Planeswalker — Daretti", "{3}{R}", {
  loyalty: "3",
  oracleText:
    '+2: Discard up to two cards, then draw that many cards.\n−2: Sacrifice an artifact. If you do, return target artifact card from your graveyard to the battlefield.\n−10: You get an emblem with "Whenever an artifact is put into your graveyard from the battlefield, return that card to the battlefield at the beginning of the next end step."\nDaretti, Scrap Savant can be your commander.',
});
// Test cards.
const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const trinket = card("Test Trinket", "Artifact", "{1}");
const relic = card("Test Relic", "Artifact", "{3}");
const brute = card("Test Brute", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", keywords: ["Trample"] });
const plain = card("Test Plain", "Creature — Ogre", "{2}{R}", { power: "4", toughness: "4" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planActivate>) => {
  if (!plan) throw new Error("no plan");
  return plan.reduce((x, a) => act(x, a), s);
};
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name.replace(/ Token$/, "") === name);
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

describe("Halo Fountain", () => {
  it("untaps a tapped creature you control as part of the cost, then makes a Citizen", () => {
    supported(fountain);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const f = putOnBattlefield(s, ap, fountain);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear());
    // Nothing tapped: it can't be activated.
    expect(planActivate(s, ap, f, 0, undefined, undefined, undefined, undefined, { tap: [a] })).toBeNull();
    s.objects[a]!.tapped = true;
    // Not an untapped creature.
    expect(planActivate(s, ap, f, 0, undefined, undefined, undefined, undefined, { tap: [b] })).toBeNull();
    s = settle(run(s, planActivate(s, ap, f, 0, undefined, undefined, undefined, undefined, { tap: [a] })));
    expect(s.objects[a]!.tapped).toBe(false);
    expect(s.objects[f]!.tapped).toBe(true);
    expect(tokensNamed(s, "Citizen")).toHaveLength(1);
  });

  it("a creature with a stun counter can't pay it (the counter would be removed instead, CR 122.1d)", () => {
    const { s, ap } = setup([]);
    const f = putOnBattlefield(s, ap, fountain);
    const a = putOnBattlefield(s, ap, bear());
    s.objects[a]!.tapped = true;
    s.objects[a]!.counters.stun = 1;
    expect(planActivate(s, ap, f, 0, undefined, undefined, undefined, undefined, { tap: [a] })).toBeNull();
  });

  it("a bot untaps its best tapped creature to draw", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const p = s.players[ap]!;
    p.command = [];
    for (const id of p.hand.splice(0)) {
      s.objects[id]!.zone = "library";
      p.library.push(id);
    }
    const f = putOnBattlefield(s, ap, fountain);
    const small = putOnBattlefield(s, ap, bear());
    const big = putOnBattlefield(s, ap, plain);
    const other = putOnBattlefield(s, ap, bear({ name: "Other Bears" }));
    for (const id of [small, big, other]) s.objects[id]!.tapped = true;
    s = passUntil(s, "main2", ap);
    for (let i = 0; i < 6 && s.objects[f]!.tapped === false; i++) s = settle(act(s, botActions(s, ap)[0]!));
    expect(s.objects[f]!.tapped).toBe(true);
    expect(s.objects[big]!.tapped).toBe(false);
  });
});

describe("Lathril, Blade of the Elves", () => {
  it("taps ten other untapped Elves: each opponent loses 10 life and you gain 10", () => {
    supported(lathril);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const l = putOnBattlefield(s, ap, lathril);
    const elves = Array.from({ length: 9 }, () => putOnBattlefield(s, ap, elf));
    // Lathril isn't one of the ten (rulings).
    expect(planActivate(s, ap, l, 0, undefined, undefined, undefined, undefined, { tap: [l, ...elves] })).toBeNull();
    elves.push(putOnBattlefield(s, ap, elf, { sick: true }));
    const opp = next(s, ap);
    const [mine, theirs] = [s.players[ap]!.life, s.players[opp]!.life];
    s = settle(run(s, planActivate(s, ap, l, 0, undefined, undefined, undefined, undefined, { tap: elves })));
    expect(s.players[opp]!.life).toBe(theirs - 10);
    expect(s.players[ap]!.life).toBe(mine + 10);
    expect(elves.every((id) => s.objects[id]!.tapped)).toBe(true);
  });
});

describe("Mutational Advantage", () => {
  it("those with counters as it resolves: hexproof, indestructible, and damage to them prevented; one that gets a counter later isn't", () => {
    supported(advantage);
    const { s: s0, ap, ids } = setup([advantage, shock, shock]);
    let s = s0;
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear({ name: "Other Bears" }));
    s.objects[a]!.counters["+1/+1"] = 1;
    s = settle(cast(s, ap, ids[0]!));
    // Proliferate: choose nothing.
    if (s.pending) s = settle(act(s, botActions(s, s.pending.player)[0]!));
    expect(s.pending).toBeFalsy();
    expect(characteristics(s, s.objects[a]!).keywords).toEqual(expect.arrayContaining(["Hexproof", "Indestructible"]));
    s.objects[b]!.counters["+1/+1"] = 1;
    s = settle(cast(s, ap, ids[1]!, [target(a)]));
    s = settle(cast(s, ap, ids[2]!, [target(b)]));
    expect(s.objects[a]!.damage).toBe(0);
    expect(s.objects[b]!.damage).toBe(2);
    expect(characteristics(s, s.objects[b]!).keywords).not.toContain("Hexproof");
  });
});

describe("Perpetual Timepiece", () => {
  it("shuffles the target cards into your library", () => {
    supported(timepiece);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const t = putOnBattlefield(s, ap, timepiece);
    const x = inGraveyard(s, ap, trinket);
    const y = inGraveyard(s, ap, relic);
    const z = inGraveyard(s, ap, elf);
    s = settle(run(s, planActivate(s, ap, t, 1, [target(x), target(y)])));
    expect(s.objects[t]!.zone).toBe("exile");
    expect([x, y, z].map((id) => s.objects[id]!.zone)).toEqual(["library", "library", "graveyard"]);
  });

  it("with no target chosen, it still shuffles your library (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const t = putOnBattlefield(s, ap, timepiece);
    const before = [...s.players[ap]!.library];
    s = settle(run(s, planActivate(s, ap, t, 1, [])));
    expect(s.log.some((l) => /shuffles their library/.test(l.text))).toBe(true);
    expect(s.players[ap]!.library).not.toEqual(before);
  });
});

describe("Maelstrom of the Spirit Dragon", () => {
  it("its colored mana is only for Dragon or Omen spells", () => {
    supported(maelstrom);
    const mana = compileCard(maelstrom).mana![1]!;
    expect(mana.spendOnly?.spells?.subtypes).toEqual(["Dragon", "Omen"]);
  });
});

describe("Quartzwood Crasher", () => {
  it("an X/X Dinosaur Beast, X the combat damage your creatures with trample dealt to that player; the others' doesn't count", () => {
    supported(crasher);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = next(s, ap);
    const c = putOnBattlefield(s, ap, crasher);
    const t = putOnBattlefield(s, ap, brute);
    const n = putOnBattlefield(s, ap, plain);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [c, t, n].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(passUntil(s, "main2", ap));
    const dinos = tokensNamed(s, "Dinosaur Beast");
    expect(dinos).toHaveLength(1);
    const d = s.objects[dinos[0]!]!;
    expect([characteristics(s, d).power, characteristics(s, d).toughness]).toEqual([9, 9]);
    expect(characteristics(s, d).keywords).toContain("Trample");
  });
});

describe("For the Common Good", () => {
  it("X copies of a token; then all your tokens gain indestructible, and you gain 1 life for each", () => {
    supported(commonGood);
    const { s: s0, ap, ids } = setup([commonGood]);
    let s = s0;
    const tok = putOnBattlefield(s, ap, bear({ name: "Test Token" }));
    s.objects[tok]!.isToken = true;
    const other = putOnBattlefield(s, ap, trinket);
    s.objects[other]!.isToken = true;
    const life = s.players[ap]!.life;
    s = settle(planCast(s, ap, ids[0]!, [target(tok)], undefined, "auto", 2)!.reduce((x, a) => act(x, a), s));
    const copies = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Test Token");
    expect(copies).toHaveLength(3);
    for (const id of [...copies, other]) expect(characteristics(s, s.objects[id]!).keywords).toContain("Indestructible");
    expect(s.players[ap]!.life).toBe(life + 4);
  });
});

describe("Daretti, Scrap Savant", () => {
  it("−2: sacrifice an artifact; if you do, the target artifact card returns", () => {
    supported(daretti);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const d = putOnBattlefield(s, ap, daretti);
    s.objects[d]!.counters.loyalty = 3;
    const junk = putOnBattlefield(s, ap, trinket);
    const back = inGraveyard(s, ap, relic);
    s = settle(run(s, planActivate(s, ap, d, 1, [target(back)])));
    expect(s.objects[junk]!.zone).toBe("graveyard");
    expect(s.objects[back]!.zone).toBe("battlefield");
  });

  it("−2 with no artifact to sacrifice returns nothing", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const d = putOnBattlefield(s, ap, daretti);
    s.objects[d]!.counters.loyalty = 3;
    const back = inGraveyard(s, ap, relic);
    s = settle(run(s, planActivate(s, ap, d, 1, [target(back)])));
    expect(s.objects[back]!.zone).toBe("graveyard");
  });

  it("−10: the emblem returns an artifact of yours that went to your graveyard at the beginning of the next end step", () => {
    const { s: s0, ap, ids } = setup([shock]);
    let s = s0;
    const d = putOnBattlefield(s, ap, daretti);
    s.objects[d]!.counters.loyalty = 10;
    s = settle(run(s, planActivate(s, ap, d, 2)));
    expect(s.objects[d]!.zone).toBe("graveyard");
    const golem = putOnBattlefield(s, ap, card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "2", toughness: "2" }));
    s = settle(cast(s, ap, ids[0]!, [target(golem)]));
    expect(s.objects[golem]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[golem]!.zone).toBe("battlefield");
    expect(abilitiesOf).toBeDefined();
  });
});

// "An X/X token" (Inscription of Insight, Miming Slime, Devastating Summons and others): X is worked out once, as the token
// is created, and is its printed power and toughness from then on (rulings on Inscription of Insight). "The greatest power
// among creatures they control" counts the target player's creatures (Inscription of Abundance); "the greatest toughness
// among creatures you control" (Kin-Tree Invocation, Ghalta the Immovable, Last March of the Ents). "Has base power and
// toughness X/X" and "becomes an X/X ... creature" from a resolving spell or ability: X fixed as it resolves (CR 608.2h).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, planActivate, planCast, power, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { moveObject } from "../src/game";
import { defOf } from "../src/cards";

// Real oracle text (Scryfall).
const insight = card("Inscription of Insight", "Sorcery", "{3}{U}", { keywords: ["Kicker", "Scry"], oracleText: "Kicker {2}{U}{U}\nChoose one. If this spell was kicked, choose any number instead.\n• Return up to two target creatures to their owners' hands.\n• Scry 2, then draw two cards.\n• Target player creates an X/X blue Illusion creature token, where X is the number of cards in their hand." });
const abundance = card("Inscription of Abundance", "Instant", "{1}{G}", { keywords: ["Fight", "Kicker"], oracleText: "Kicker {2}{G}\nChoose one. If this spell was kicked, choose any number instead.\n• Put two +1/+1 counters on target creature.\n• Target player gains X life, where X is the greatest power among creatures they control.\n• Target creature you control fights target creature you don't control." });
const miming = card("Miming Slime", "Sorcery", "{2}{G}", { oracleText: "Create an X/X green Ooze creature token, where X is the greatest power among creatures you control." });
const kinTree = card("Kin-Tree Invocation", "Sorcery", "{B}{G}", { oracleText: "Create an X/X black and green Spirit Warrior creature token, where X is the greatest toughness among creatures you control." });
const summons = card("Devastating Summons", "Sorcery", "{R}", { oracleText: "As an additional cost to cast this spell, sacrifice X lands.\nCreate two X/X red Elemental creature tokens." });
const genesis = card("Gelatinous Genesis", "Sorcery", "{X}{X}{G}", { oracleText: "Create X X/X green Ooze creature tokens." });
const carver = card("Flesh Carver", "Creature \u2014 Human Wizard", "{2}{B}", { power: "2", toughness: "2", keywords: ["Intimidate"], oracleText: "Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\n{1}{B}, Sacrifice another creature: Put two +1/+1 counters on this creature.\nWhen this creature dies, create an X/X black Horror creature token, where X is this creature's power." });
const mysticGenesis = card("Mystic Genesis", "Instant", "{2}{G}{U}{U}", { oracleText: "Counter target spell. Create an X/X green Ooze creature token, where X is that spell's mana value." });
const wurmcalling = card("Wurmcalling", "Sorcery", "{X}{G}", { keywords: ["Buyback"], oracleText: "Buyback {2}{G} (You may pay an additional {2}{G} as you cast this spell. If you do, put this card into your hand as it resolves.)\nCreate an X/X green Wurm creature token." });
const summonings = card("Metallurgic Summonings", "Enchantment", "{3}{U}{U}", { oracleText: "Whenever you cast an instant or sorcery spell, create an X/X colorless Construct artifact creature token, where X is that spell's mana value.\n{3}{U}{U}, Exile this enchantment: Return all instant and sorcery cards from your graveyard to your hand. Activate only if you control six or more artifacts." });
const factory = card("Vulshok Factory", "Artifact", "{2}{R}", { oracleText: "{T}: Add {R}. Put a charge counter on this artifact.\n{2}{R}, {T}, Sacrifice this artifact: Create an X/X colorless Golem artifact creature token with haste, where X is the number of charge counters on Vulshok Factory. Activate only as a sorcery." });
const broodmaster = card("Hydra Broodmaster", "Creature \u2014 Hydra", "{4}{G}{G}", { power: "7", toughness: "7", keywords: ["Monstrosity"], oracleText: "{X}{X}{G}: Monstrosity X. (If this creature isn't monstrous, put X +1/+1 counters on it and it becomes monstrous.)\nWhen this creature becomes monstrous, create X X/X green Hydra creature tokens." });
const ghalta = card("Ghalta the Immovable", "Legendary Creature \u2014 Elder Dinosaur", "{8}{W}", { power: "0", toughness: "7", oracleText: "This spell costs {X} less to cast, where X is the greatest toughness among creatures you control.\nCreatures you control can attack as though they didn't have defender.\nEach creature you control with toughness greater than its power assigns combat damage equal to its toughness rather than its power." });
const lastMarch = card("Last March of the Ents", "Sorcery", "{6}{G}{G}", { oracleText: "This spell can't be countered.\nDraw cards equal to the greatest toughness among creatures you control, then put any number of creature cards from your hand onto the battlefield." });
const biomass = card("Biomass Mutation", "Instant", "{X}{G/U}{G/U}", { oracleText: "Creatures you control have base power and toughness X/X until end of turn." });
const staff = card("Chimeric Staff", "Artifact", "{4}", { oracleText: "{X}: This artifact becomes an X/X Construct artifact creature until end of turn." });
const branchbender = card("Elvish Branchbender", "Creature \u2014 Elf Druid", "{2}{G}", { power: "2", toughness: "2", oracleText: "{T}: Until end of turn, target Forest becomes an X/X Treefolk creature in addition to its other types, where X is the number of Elves you control." });
const minsc = card("Minsc, Beloved Ranger", "Legendary Creature \u2014 Human Ranger", "{R}{G}{W}", { power: "3", toughness: "3", oracleText: "When Minsc enters, create Boo, a legendary 1/1 red Hamster creature token with trample and haste.\n{X}: Until end of turn, target creature you control has base power and toughness X/X and becomes a Giant in addition to its other types. Activate only as a sorcery." });
const testament = card("Testament of Faith", "Enchantment", "{W}", { oracleText: "{X}: This enchantment becomes an X/X Wall creature with defender in addition to its other types until end of turn." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const tokens = (s: GameState, pid: PlayerId, re: RegExp) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && re.test(defOf(s, s.objects[id]!).name));
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const big = (p: number, t: number) => card(`Beast ${p}/${t}`, "Creature — Beast", "{4}", { power: String(p), toughness: String(t) });
/** Only these cards in hand: the rest of the opening hand goes back to the library. */
const onlyHand = (s: GameState, pid: PlayerId, ids: string[]) => {
  for (const id of s.players[pid]!.hand.filter((x) => !ids.includes(x))) moveObject(s, id, "library");
};

describe("X/X tokens: parse", () => {
  it("the new shapes compile", () => supported(insight, abundance, miming, kinTree, summons, genesis, carver, mysticGenesis, wurmcalling, summonings, factory, broodmaster, ghalta, lastMarch));
});

describe("Inscription of Insight: target player creates an X/X token, X the cards in their hand", () => {
  it("counts that player's hand as it resolves, and the token keeps its size when the hand changes", () => {
    const { s: s0, ap, ids, opp } = setup([insight]);
    const hand = s0.players[opp]!.hand.length;
    expect(hand).toBeGreaterThan(2);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], [2])));
    const [t] = tokens(s, opp, /Illusion/);
    expect(t).toBeDefined();
    expect(pt(s, t!)).toBe(`${hand}/${hand}`);
    expect(characteristicsColors(s, t!)).toEqual(["U"]);
    // Fixed once created (rulings): the opponent's hand shrinking doesn't change it.
    for (const id of s.players[opp]!.hand.slice(0, 2)) moveObject(s, id, "graveyard");
    expect(pt(s, t!)).toBe(`${hand}/${hand}`);
  });

  it("kicked, all three modes in order: bounce, scry and draw, then the token counts the hand after drawing", () => {
    const { s: s0, ap, ids } = setup([insight]);
    putOnBattlefield(s0, ap, forest);
    putOnBattlefield(s0, ap, forest);
    onlyHand(s0, ap, ids);
    const mine = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(mine), { kind: "none" }, { kind: "player", id: ap }], [0, 1, 2], "auto", undefined, { kicks: [0] }));
    s = settle(s);
    // Scry 2 asks where the cards go.
    for (let i = 0; i < 4 && s.pending?.kind === "arrangeTop"; i++) s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    expect(s.pending).toBeFalsy();
    // The bear came back to hand, then two cards were drawn: three cards when the token is created.
    expect(s.players[ap]!.hand).toContain(mine);
    const [t] = tokens(s, ap, /Illusion/);
    expect(pt(s, t!)).toBe("3/3");
  });
});

describe("Inscription of Abundance: the greatest power among creatures they control", () => {
  it("the target player's own creatures, not yours", () => {
    const { s: s0, ap, ids, opp } = setup([abundance]);
    putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, big(5, 2));
    putOnBattlefield(s0, ap, big(7, 7));
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], [1])));
    expect(s.players[opp]!.life).toBe(life + 5);
  });

  it("with no creatures, or only creatures with negative power, no life is gained (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([abundance]);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], [1])));
    expect(s.players[opp]!.life).toBe(life);
  });

  it("kicked: the counters come first, then the life counts them, then the fight", () => {
    const { s: s0, ap, ids, opp } = setup([abundance]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, big(3, 3));
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(mine), { kind: "player", id: ap }, target(mine), target(theirs)], [0, 1, 2], "auto", undefined, { kicks: [0] })));
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.damage).toBe(3);
  });
});

describe("X/X tokens from the spell's X, a count or a stat", () => {
  it("Wurmcalling with X=3 makes a 3/3 Wurm; Gelatinous Genesis with X=2 makes two 2/2 Oozes", () => {
    const { s: s0, ap, ids } = setup([wurmcalling, genesis]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3)));
    const [w] = tokens(s, ap, /Wurm/);
    expect(pt(s, w!)).toBe("3/3");
    s = settle(run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", 2)));
    const oozes = tokens(s, ap, /Ooze/);
    expect(oozes.length).toBe(2);
    expect(oozes.map((id) => pt(s, id))).toEqual(["2/2", "2/2"]);
  });

  it("Miming Slime: the greatest power among creatures you control; Kin-Tree Invocation: the greatest toughness", () => {
    const { s: s0, ap, ids, opp } = setup([miming, kinTree]);
    putOnBattlefield(s0, ap, big(4, 1));
    putOnBattlefield(s0, ap, big(1, 6));
    putOnBattlefield(s0, opp, big(9, 9));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, tokens(s, ap, /Ooze/)[0]!)).toBe("4/4");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(pt(s, tokens(s, ap, /Spirit Warrior/)[0]!)).toBe("6/6");
  });

  it("Devastating Summons: X is the number of lands sacrificed as it's cast", () => {
    const { s: s0, ap, ids } = setup([summons]);
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && defOf(s0, s0.objects[id]!).types.includes("Land")).length;
    const sac = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && defOf(s0, s0.objects[id]!).name === "Plains");
    // Without saying which lands, it can't be cast (CR 601.2h).
    expect(() => run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3))).toThrow(/additional cost/);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3, { sacrifice: sac })));
    const made = tokens(s, ap, /Elemental/);
    expect(made.map((id) => pt(s, id))).toEqual(["3/3", "3/3"]);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && defOf(s, s.objects[id]!).types.includes("Land")).length).toBe(lands - 3);
  });

  it("Flesh Carver: its power as it last existed on the battlefield (CR 608.2h)", () => {
    const { s: s0, ap, opp } = setup([]);
    const fc = putOnBattlefield(s0, ap, carver);
    s0.objects[fc]!.counters["+1/+1"] = 2;
    let s = s0;
    moveObject(s, fc, "graveyard");
    s = settle(s);
    expect(pt(s, tokens(s, ap, /Horror/)[0]!)).toBe("4/4");
    expect(tokens(s, opp, /Horror/)).toEqual([]);
  });

  it("Mystic Genesis: the countered spell's mana value", () => {
    const theirs = card("Big Spell", "Sorcery", "{3}{R}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([theirs, mysticGenesis]);
    // Cast a spell and, holding priority, counter it.
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(pt(s, tokens(s, ap, /Ooze/)[0]!)).toBe("4/4");
  });

  it("Vulshok Factory: the charge counters on it as it was sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, factory);
    s0.objects[f]!.counters.charge = 3;
    const s = settle(run(s0, planActivate(s0, ap, f, 1)));
    expect(s.objects[f]!.zone).toBe("graveyard");
    const [g] = tokens(s, ap, /Golem/);
    expect(pt(s, g!)).toBe("3/3");
  });

  it("Hydra Broodmaster: X X/X Hydras for monstrosity X", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, broodmaster);
    const s = settle(run(s0, planActivate(s0, ap, h, 0, undefined, undefined, undefined, 2)));
    const hydras = tokens(s, ap, /Hydra/);
    expect(hydras.map((id) => pt(s, id))).toEqual(["2/2", "2/2"]);
  });

  it("Ghalta the Immovable costs the greatest toughness less", () => {
    const { s, ap, ids } = setup([ghalta]);
    const generic = () => {
      const c = spellCost(s, ap, s.objects[ids[0]!]!);
      return c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
    };
    expect(generic()).toBe(8);
    putOnBattlefield(s, ap, big(1, 5));
    putOnBattlefield(s, ap, big(3, 2));
    expect(generic()).toBe(3);
  });
});

describe("base power and toughness X/X, becomes an X/X", () => {
  it("parse", () => supported(biomass, staff, branchbender, minsc, testament));

  it("Biomass Mutation: X/X base, counters still on top (CR 613.4b-c), until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([biomass]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, big(1, 6));
    s0.objects[b]!.counters["+1/+1"] = 1;
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 4)));
    expect([pt(s, a), pt(s, b), pt(s, theirs)]).toEqual(["4/4", "5/5", "2/2"]);
    // A creature that comes later isn't affected (CR 611.2c).
    const late = putOnBattlefield(s, ap, bear());
    expect(pt(s, late)).toBe("2/2");
  });

  it("Chimeric Staff: an X/X Construct artifact creature until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const st = putOnBattlefield(s0, ap, staff);
    const s = settle(run(s0, planActivate(s0, ap, st, 0, undefined, undefined, undefined, 3)));
    expect(pt(s, st)).toBe("3/3");
    expect(defOfTypes(s, st)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  });

  it("Elvish Branchbender: X is the Elves as it resolves, and stays (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const bb = putOnBattlefield(s0, ap, branchbender);
    putOnBattlefield(s0, ap, card("Elf Two", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const f = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && defOf(s0, s0.objects[id]!).name === "Forest")!;
    let s = settle(run(s0, planActivate(s0, ap, bb, 0, [target(f)])));
    expect(pt(s, f)).toBe("2/2");
    putOnBattlefield(s, ap, card("Elf Three", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    expect(pt(s, f)).toBe("2/2");
  });
});

function defOfTypes(s: GameState, id: ObjectId) {
  return characteristics(s, s.objects[id]!).types;
}

function characteristicsColors(s: GameState, id: ObjectId) {
  return defOf(s, s.objects[id]!).colors;
}

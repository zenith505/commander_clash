// Round 114, the first of the most played cards: "add X mana in any combination of colors" from a spell or a triggered
// ability (Klauth, Manamorphose), with a color-split choice as it resolves (CR 106.1b, 608.2d).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, defOf, mayPlayFromExile, manaValue, spellCost, invalidateCharacteristics, isFullySupported, isLegalTarget, isSuspended, type TargetSpec, objHasKeyword, manaAbilitiesOn, planCast, planUnlock, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { loseLife, moveObject } from "../src/game";
import { nextRandom } from "../src/rng";

// Real oracle text (Scryfall).
const klauth = card("Klauth, Unrivaled Ancient", "Legendary Creature — Dragon", "{5}{R}{G}", {
  power: "4",
  toughness: "4",
  keywords: ["Flying", "Haste"],
  oracleText:
    "Flying, haste\nWhenever Klauth attacks, add X mana in any combination of colors, where X is the total power of attacking creatures. Spend this mana only to cast spells. Until end of turn, you don't lose this mana as steps and phases end.",
});
const manamorphose = card("Manamorphose", "Instant", "{1}{R/G}", { oracleText: "Add two mana in any combination of colors.\nDraw a card." });
const desolation = card("Desolation of Smaug", "Sorcery", "{2}{R}{R}", {
  oracleText: "Desolation of Smaug deals 3 damage to each non-Dragon creature.\nAdd four mana in any combination of colors. Spend this mana only to cast Dragon spells.",
});

const pool = (s: GameState, pid: PlayerId) => s.players[pid]!.manaPool;

describe("add X mana in any combination of colors", () => {
  it("these cards play", () => {
    for (const d of [klauth, manamorphose, desolation]) expect(isFullySupported(d)).toBe(true);
    for (const d of [
      card("Cosmic Crucible", "Artifact", "{5}", {
        oracleText: "At the beginning of your first main phase, add four mana in any combination of colors.\nWhenever you cast a noncreature spell, you may copy it. You may choose new targets for the copy. Do this only once each turn. (A copy of a permanent spell becomes a token.)",
      }),
      card("Sarkhan, Fireblood", "Legendary Planeswalker — Sarkhan", "{1}{R}{R}", {
        loyalty: "3",
        oracleText: "+1: You may discard a card. If you do, draw a card.\n+1: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells.\n−7: Create four 5/5 red Dragon creature tokens with flying.",
      }),
    ])
      expect(isFullySupported(d)).toBe(true);
    // Another player adding it isn't read.
    expect(isFullySupported(card("Odd Ritual", "Instant", "{1}", { oracleText: "Target player adds two mana in any combination of colors." }))).toBe(false);
  });

  it("Manamorphose: the colors are chosen as it resolves, before the draw (rulings)", () => {
    const { s: s0, ap, ids } = setup([manamorphose]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "manaMix", player: ap, n: 2 });
    const hand = s.players[ap]!.hand.length;
    expect(() => act(s, { type: "manaMix", player: ap, counts: { U: 1 } })).toThrow(/all 2 mana/);
    expect(() => act(s, { type: "manaMix", player: ap, counts: { U: 3, B: -1 } })).toThrow();
    const before = { ...pool(s, ap) };
    s = act(s, { type: "manaMix", player: ap, counts: { U: 1, B: 1 } });
    expect(pool(s, ap).U).toBe(before.U + 1);
    expect(pool(s, ap).B).toBe(before.B + 1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.log.some((l) => /adds \{U\}\{B\}/.test(l.text))).toBe(true);
  });

  it("two of the same color is fine too", () => {
    const { s: s0, ap, ids } = setup([manamorphose]);
    const s = act(cast(s0, ap, ids[0]!), { type: "manaMix", player: ap, counts: { G: 2 } });
    expect(pool(s, ap).G).toBeGreaterThanOrEqual(2);
  });

  it("Klauth: X is the total power of attacking creatures as it resolves; the mana stays until end of turn, for spells only", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, klauth);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }, { attacker: b, defender: opp }] });
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "manaMix", player: ap, n: 6 });
    s = act(s, { type: "manaMix", player: ap, counts: { R: 3, G: 2, W: 1 } });
    expect(s.players[ap]!.manaLots?.filter((l) => l.keep === "turn" && l.only).reduce((n, l) => n + l.n, 0)).toBe(6);
    // Still there in the second main phase.
    s = passUntil(s, "main2", ap);
    expect(pool(s, ap).R + pool(s, ap).G + pool(s, ap).W).toBeGreaterThanOrEqual(6);
    // Gone once the turn ends (CR 500.4).
    s = passUntil(s, "upkeep");
    expect(Object.values(pool(s, ap)).reduce((a, n) => a + n, 0)).toBe(0);
  });

  it("Klauth: an attacker removed in response makes less mana", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, klauth);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }, { attacker: b, defender: opp }] });
    expect(s.stack.length).toBe(1);
    // The Bear leaves combat before the trigger resolves (CR 506.4).
    s = structuredClone(s);
    delete s.objects[b]!.attacking;
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "manaMix", n: 4 });
  });

  it("Desolation of Smaug: its mana only pays for Dragon spells", () => {
    const dragon = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5" });
    const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
    const { s: s0, ap, ids } = setup([desolation, dragon, giant]);
    let s = cast(s0, ap, ids[0]!);
    s = act(s, { type: "manaMix", player: ap, counts: { R: 4 } });
    expect(s.players[ap]!.manaLots?.find((l) => l.mana === "R")?.only).toBeTruthy();
    // Tap every land: only the Dragon can be cast.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 4, G: 0, C: 0 };
    s.players[ap]!.manaPool.R += 2;
    s.players[ap]!.manaLots = [{ mana: "R", n: 4, only: s.players[ap]!.manaLots!.find((l) => l.mana === "R")!.only! }];
    expect(planCast(s, ap, ids[2]!)).toBeNull();
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
  });

  it("a bot gives the mana the colors its hand asks for", () => {
    const blue = card("Deep Analysis", "Sorcery", "{3}{U}{U}");
    const { s: s0, ap, ids } = setup([manamorphose, blue]);
    s0.players[ap]!.command = [];
    let s = cast(s0, ap, ids[0]!);
    const [a] = botActions(s, ap);
    expect(a).toEqual({ type: "manaMix", player: ap, counts: { U: 2 } });
    s = applyAction(s, a!);
    expect(s.pending).toBeNull();
  });
});

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
/** The opponents after `ap` in turn order. */
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!) as [PlayerId, PlayerId, PlayerId];

describe("for each opponent, you may ... up to one target card from that player's graveyard", () => {
  const sepulchral = card("Sepulchral Primordial", "Creature — Avatar", "{5}{B}{B}", {
    power: "5",
    toughness: "4",
    keywords: ["Intimidate"],
    oracleText: "Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nWhen this creature enters, for each opponent, you may put up to one target creature card from that player's graveyard onto the battlefield under your control.",
  });
  const diluvian = card("Diluvian Primordial", "Creature — Avatar", "{5}{U}{U}", {
    power: "5",
    toughness: "5",
    keywords: ["Flying"],
    oracleText: "Flying\nWhen this creature enters, for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. If a spell cast this way would be put into a graveyard, exile it instead.",
  });
  const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
  const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

  it("Sepulchral Primordial: asked about each card; the ones turned down stay, the others enter together", () => {
    const { s: s0, ap, ids } = setup([sepulchral]);
    const [b, , d] = opponentsOf(s0, ap);
    const b1 = inGraveyard(s0, b, bear({ name: "Bear B" }));
    const d1 = inGraveyard(s0, d, bear({ name: "Bear D" }));
    let s = settle(passAll(cast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b1), { kind: "none" }, target(d1)] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", card: b1, prompt: "put Bear B onto the battlefield under your control" });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", card: d1, prompt: "put Bear D onto the battlefield under your control" });
    // Nothing has moved yet.
    expect(s.objects[d1]!.zone).toBe("graveyard");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[d1]!.zone).toBe("battlefield");
    expect(s.objects[d1]!.controller).toBe(ap);
  });

  it("Sepulchral Primordial: both turned down, nothing happens", () => {
    const { s: s0, ap, ids } = setup([sepulchral]);
    const [b, c] = opponentsOf(s0, ap);
    const b1 = inGraveyard(s0, b, bear({ name: "Bear B" }));
    const c1 = inGraveyard(s0, c, bear({ name: "Bear C" }));
    let s = settle(passAll(cast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b1), target(c1), { kind: "none" }] }));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toBeNull();
    expect([b1, c1].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("Diluvian Primordial: each opponent's card cast one at a time, then exiled; one turned down stays", () => {
    expect(isFullySupported(diluvian)).toBe(true);
    const { s: s0, ap, ids } = setup([diluvian]);
    const [b, c, d] = opponentsOf(s0, ap);
    const bb = inGraveyard(s0, b, bolt);
    const cd = inGraveyard(s0, c, divination);
    const db = inGraveyard(s0, d, bolt);
    const life = s0.players[d]!.life;
    const hand = s0.players[ap]!.hand.length - 1;
    let s = settle(passAll(cast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bb), target(cd), target(db)] }));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: bb });
    s = run(s, planCast(s, ap, bb, [{ kind: "player", id: d }]));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: cd });
    s = run(s, planCast(s, ap, cd));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: db });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    // The last one cast resolves first (rulings).
    expect(s.stack.map((x) => x.objectId)).toEqual([bb, cd]);
    s = settle(s);
    expect(s.players[d]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[bb]!.zone).toBe("exile");
    expect(s.objects[cd]!.zone).toBe("exile");
    expect(s.objects[db]!.zone).toBe("graveyard");
  });

  it("without the exile rider the cast isn't read from an opponent's graveyard alone", () => {
    expect(isFullySupported(card("Odd Primordial", "Creature — Avatar", "{5}{U}{U}", { power: "5", toughness: "5", oracleText: "When this creature enters, you may cast target instant card from an opponent's graveyard without paying its mana cost." }))).toBe(false);
  });
});

describe("flood counters: an Island in addition to its other types for as long as it has one", () => {
  const xolatoyac = card("Xolatoyac, the Smiling Flood", "Legendary Creature — Salamander Serpent", "{4}{G}{U}", {
    power: "6",
    toughness: "6",
    oracleText: "Whenever Xolatoyac enters or attacks, put a flood counter on target land. That land is an Island in addition to its other types for as long as it has a flood counter on it.\nAt the beginning of your end step, untap each permanent you control with a counter on it.",
  });
  const aquitect = card("Aquitect's Will", "Kindred Sorcery — Merfolk", "{U}", {
    oracleText: "Put a flood counter on target land. That land is an Island in addition to its other types for as long as it has a flood counter on it. If you control a Merfolk, draw a card.",
  });
  const mountain = card("Mountain", "Basic Land — Mountain");

  it("Xolatoyac: the land keeps its types and abilities and taps for {U} too, until the counter is gone, even with Xolatoyac gone (rulings)", () => {
    expect(isFullySupported(xolatoyac)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([xolatoyac]);
    const m = putOnBattlefield(s0, opp, mountain);
    let s = settle(passAll(cast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(m)] }));
    expect(s.objects[m]!.counters.flood).toBe(1);
    const ch = characteristics(s, s.objects[m]!);
    expect(ch.subtypes).toEqual(expect.arrayContaining(["Mountain", "Island"]));
    expect(ch.types).toEqual(["Land"]);
    expect(manaAbilitiesOn(s, s.objects[m]!).map((a) => JSON.stringify(a.produces))).toEqual(expect.arrayContaining([expect.stringContaining('"R"'), expect.stringContaining('"U"')]));
    // Xolatoyac leaves: still an Island.
    s = structuredClone(s);
    moveObject(s, ids[0]!, "graveyard");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[m]!).subtypes).toContain("Island");
    // The counter is removed: no longer an Island, for good (CR 611.2b).
    s.objects[m]!.counters.flood = 0;
    invalidateCharacteristics(s);
    s = passAll(s);
    expect(characteristics(s, s.objects[m]!).subtypes).toEqual(["Mountain"]);
    s.objects[m]!.counters.flood = 1;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[m]!).subtypes).toEqual(["Mountain"]);
  });

  it("Aquitect's Will: draws only with a Merfolk", () => {
    expect(isFullySupported(aquitect)).toBe(true);
    const { s: s0, ap, ids } = setup([aquitect]);
    const m = putOnBattlefield(s0, ap, mountain);
    const hand = s0.players[ap]!.hand.length - 1;
    const s = settle(cast(s0, ap, ids[0]!, [target(m)]));
    expect(characteristics(s, s.objects[m]!).subtypes).toEqual(expect.arrayContaining(["Mountain", "Island"]));
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("exile a card from a graveyard, and the exiled card's card types (Cemetery cards)", () => {
  const protector = card("Cemetery Protector", "Creature — Human Soldier", "{2}{W}{W}", {
    power: "3",
    toughness: "4",
    keywords: ["Flash"],
    oracleText: "Flash\nWhen this creature enters, exile a card from a graveyard.\nWhenever you play a land or cast a spell, if it shares a card type with the exiled card, create a 1/1 white Human creature token.",
  });
  const gatekeeper = card("Cemetery Gatekeeper", "Creature — Vampire", "{1}{R}", {
    power: "2",
    toughness: "1",
    keywords: ["First strike"],
    oracleText: "First strike\nWhen this creature enters, exile a card from a graveyard.\nWhenever a player plays a land or casts a spell, if it shares a card type with the exiled card, this creature deals 2 damage to that player.",
  });
  const prowler = card("Cemetery Prowler", "Creature — Wolf", "{1}{G}{G}", {
    power: "3",
    toughness: "4",
    keywords: ["Vigilance"],
    oracleText: "Vigilance\nWhenever this creature enters or attacks, exile a card from a graveyard.\nSpells you cast cost {1} less to cast for each card type they share with cards exiled with this creature.",
  });
  const golem = card("Test Golem", "Artifact Creature — Golem", "{4}", { power: "3", toughness: "3" });
  const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
  const mountain = card("Mountain", "Basic Land — Mountain");
  const humans = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid).length;
  const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.objects[id]!.zone = "hand";
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.players[pid]!.hand.push(id);
    return id;
  };

  it("these cards play; the exile is linked", () => {
    for (const d of [protector, gatekeeper, prowler]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Cemetery Protector: you choose the card from any graveyard; then a creature spell or a creature land makes a Human", () => {
    const { s: s0, ap, ids } = setup([protector, ogre]);
    const [b, c] = opponentsOf(s0, ap);
    const giant = inGraveyard(s0, b, bear({ name: "Their Bear" }));
    const spell = inGraveyard(s0, c, card("Opt", "Instant", "{U}"));
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "exile" });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no pick");
    expect(s.pending.cards).toEqual(expect.arrayContaining([giant, spell]));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [giant] }));
    expect(s.objects[giant]!.zone).toBe("exile");
    expect(s.objects[spell]!.zone).toBe("graveyard");
    // A creature spell: a Human.
    s = settle(cast(s, ap, ids[1]!));
    expect(humans(s, ap)).toBe(1);
    // A land doesn't share a type with a creature card.
    const m = toHand(s, ap, mountain);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = settle(act(s, { type: "playLand", player: ap, objectId: m }));
    expect(humans(s, ap)).toBe(1);
  });

  it("Cemetery Protector: a land exiled, playing a land makes a Human; the exiled card gone before it resolves, nothing (CR 603.4)", () => {
    const { s: s0, ap, ids } = setup([protector, ogre]);
    const [b] = opponentsOf(s0, ap);
    const land = inGraveyard(s0, b, mountain);
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }));
    const m = toHand(s, ap, mountain);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = act(s, { type: "playLand", player: ap, objectId: m });
    expect(s.stack.length).toBe(1);
    const gone = structuredClone(s);
    moveObject(gone, land, "graveyard");
    expect(humans(settle(gone), ap)).toBe(0);
    expect(humans(settle(s), ap)).toBe(1);
  });

  it("Cemetery Gatekeeper: any player's matching spell or land deals 2 damage to that player", () => {
    const { s: s0, ap, ids } = setup([gatekeeper]);
    const [b] = opponentsOf(s0, ap);
    const land = inGraveyard(s0, b, mountain);
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }));
    const life = s.players[ap]!.life;
    const m = toHand(s, ap, mountain);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = settle(act(s, { type: "playLand", player: ap, objectId: m }));
    // Its controller is a player too.
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Cemetery Prowler: {1} less for each card type shared with the exiled cards, not for each card (rulings)", () => {
    const { s: s0, ap, ids } = setup([prowler]);
    const [b] = opponentsOf(s0, ap);
    const g1 = inGraveyard(s0, b, golem);
    const g2 = inGraveyard(s0, b, bear({ name: "Other Bear" }));
    const golemInHand = toHand(s0, ap, golem);
    const ogreInHand = toHand(s0, ap, ogre);
    const bolt = toHand(s0, ap, card("Lightning Bolt", "Instant", "{R}"));
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g1] }));
    const cost = (id: string) => {
      const c = spellCost(s, ap, s.objects[id]!);
      return manaValue(c.cost) + c.extra;
    };
    expect(cost(golemInHand)).toBe(2); // Artifact and Creature
    expect(cost(ogreInHand)).toBe(2); // Creature: {2}{R} -> {1}{R}
    expect(cost(bolt)).toBe(1);
    // A second creature card exiled with it: still {1} for Creature.
    const key = `${ids[0]}@${s.objects[ids[0]!]!.zoneChanges ?? 0}`;
    moveObject(s, g2, "exile");
    s.linkedExile![key]!.push({ id: g2, zc: s.objects[g2]!.zoneChanges ?? 0 });
    expect(cost(ogreInHand)).toBe(2);
  });

  it("a bot exiles an opponent's card, the one sharing the most card types with its hand", () => {
    const { s: s0, ap, ids } = setup([prowler]);
    const [b, c] = opponentsOf(s0, ap);
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((x) => x === ids[0]);
    toHand(s0, ap, ogre);
    const mine = inGraveyard(s0, ap, ogre);
    const spell = inGraveyard(s0, b, card("Opt", "Instant", "{U}"));
    const theirBear = inGraveyard(s0, c, bear({ name: "Their Bear" }));
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending?.kind).toBe("searchLibrary");
    const [a] = botActions(s, ap);
    expect(a).toEqual({ type: "searchLibrary", player: ap, found: [theirBear] });
    expect([mine, spell]).not.toContain((a as { found: string[] }).found[0]);
  });
});

describe("The Key to the Vault", () => {
  const key = card("The Key to the Vault", "Legendary Artifact — Equipment", "{1}{U}", {
    oracleText: "Whenever equipped creature deals combat damage to a player, look at that many cards from the top of your library. You may exile a nonland card from among them. Put the rest on the bottom of your library in a random order. You may cast the exiled card without paying its mana cost.\nEquip {2}{U}",
  });
  const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
  /** Ap's equipped Bear has hit opp; the trigger is waiting to resolve; the top of ap's library is Divination, then two Forests. */
  function hit() {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[putOnBattlefield(s0, ap, key)]!.attachedTo = b;
    const div = putOnBattlefield(s0, ap, divination);
    moveObject(s0, div, "library");
    const lib = s0.players[ap]!.library;
    s0.players[ap]!.library = [div, ...lib.filter((x) => x !== div)];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 30 && s.pending?.kind !== "searchLibrary"; i++) {
      const pid = waitingOn(s)!;
      s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: pid, blocks: [] } : { type: "passPriority", player: pid });
    }
    return { s, ap, opp, div };
  }

  it("plays", () => expect(isFullySupported(key)).toBe(true));

  it("looks at two cards (2 damage), exiles Divination, the Forest goes to the bottom, then casts it free", () => {
    let { s, ap, div } = hit();
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [div], min: 0, max: 1 });
    const second = s.players[ap]!.library[1]!;
    s = act(s, { type: "searchLibrary", player: ap, found: [div] });
    expect(s.objects[div]!.zone).toBe("exile");
    expect(s.players[ap]!.library[s.players[ap]!.library.length - 1]).toBe(second);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: div });
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, div)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("declining the cast, the card stays exiled (rulings: you choose as it resolves)", () => {
    let { s, ap, div } = hit();
    s = act(s, { type: "searchLibrary", player: ap, found: [div] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[div]!.zone).toBe("exile");
    expect(s.pending).toBeNull();
  });

  it("taking nothing, both go to the bottom", () => {
    let { s, ap, div } = hit();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.objects[div]!.zone).toBe("library");
    expect(s.players[ap]!.library.slice(-2)).toContain(div);
  });
});

describe("Eerie: whenever an enchantment you control enters and whenever you fully unlock a Room (CR 709.5i)", () => {
  const tracker = card("Entity Tracker", "Creature — Human Scout", "{2}{U}", {
    power: "2",
    toughness: "3",
    keywords: ["Flash"],
    oracleText: "Flash\nEerie — Whenever an enchantment you control enters and whenever you fully unlock a Room, draw a card.",
  });
  const REMINDER = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
  const glassworks = scry("split", [
    { name: "Glassworks", mana_cost: "{2}{R}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, this Room deals 4 damage to target creature an opponent controls.${REMINDER}` },
    { name: "Shattered Yard", mana_cost: "{4}{R}", type_line: "Enchantment — Room", oracle_text: `At the beginning of your end step, this Room deals 1 damage to each opponent.${REMINDER}` },
  ]);

  it("Entity Tracker: the Room entering draws (an enchantment), unlocking its second door draws again, the first door alone doesn't", () => {
    expect(isFullySupported(tracker)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([glassworks]);
    putOnBattlefield(s0, ap, tracker);
    putOnBattlefield(s0, opp, bear());
    const hand = s0.players[ap]!.hand.length - 1;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 }));
    for (let i = 0; i < 10 && (s.stack.length || s.triggerQueue.length || s.pending); i++) s = s.pending ? act(s, botActions(s, waitingOn(s)!)[0]!) : settle(s);
    // One draw: an enchantment entered (Shattered Yard's door unlocked, not fully).
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s = run(s, planUnlock(s, ap, ids[0]!, 0));
    for (let i = 0; i < 10 && (s.stack.length || s.triggerQueue.length || s.pending); i++) s = s.pending ? act(s, botActions(s, waitingOn(s)!)[0]!) : settle(s);
    expect(s.objects[ids[0]!]!.unlocked?.length).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

describe("Dragonhawk, Fate's Tempest", () => {
  const dragonhawk = card("Dragonhawk, Fate's Tempest", "Legendary Creature — Bird Dragon", "{3}{R}{R}", {
    power: "5",
    toughness: "5",
    keywords: ["Flying"],
    oracleText:
      "Flying\nWhenever Dragonhawk enters or attacks, exile the top X cards of your library, where X is the number of creatures you control with power 4 or greater. You may play those cards until your next end step. At the beginning of your next end step, Dragonhawk deals 2 damage to each opponent for each of those cards that are still exiled.",
  });
  /** Ap attacks with Dragonhawk next to a 4/4; the trigger has resolved (X = 2: both have power 4 or greater). */
  function attacked() {
    const { s: s0, ap, opp } = setup([]);
    const hawk = putOnBattlefield(s0, ap, dragonhawk);
    putOnBattlefield(s0, ap, card("Big Bear", "Creature — Bear", "{3}{G}", { power: "4", toughness: "4" }));
    putOnBattlefield(s0, ap, bear());
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hawk, defender: opp }] });
    s = settle(s);
    return { s, ap, opp, top };
  }

  it("plays", () => expect(isFullySupported(dragonhawk)).toBe(true));

  it("exiles X = 2 cards to play; at your next end step, 2 damage to each opponent for each still exiled", () => {
    const { s: s1, ap, opp, top } = attacked();
    for (const id of top) expect(s1.objects[id]).toMatchObject({ zone: "exile", mayPlay: { player: ap, until: "yourNextEndStep" } });
    const lives = new Map(s1.turnOrder.filter((p) => p !== ap).map((p) => [p, s1.players[p]!.life]));
    let s = passUntil(s1, "main2", ap);
    // Play one of them (a Forest) from exile; the other stays.
    s = act(s, { type: "playLand", player: ap, objectId: top[0]! });
    expect(s.objects[top[0]!]!.zone).toBe("battlefield");
    s = passUntil(s, "end", ap);
    s = settle(s);
    // The Bird Dragon hit one opponent for 5 in combat; every opponent also takes 2 for the one card still exiled.
    for (const [p, life] of lives) expect(life - s.players[p]!.life).toBe(p === opp ? 7 : 2);
  });
});

describe("Delay: a countered spell is exiled with time counters and gains suspend (CR 702.62)", () => {
  const delay = card("Delay", "Instant", "{1}{U}", {
    oracleText:
      "Counter target spell. If the spell is countered this way, exile it with three time counters on it instead of putting it into its owner's graveyard. If it doesn't have suspend, it gains suspend. (At the beginning of its owner's upkeep, they remove a time counter. When the last is removed, they may play it without paying its mana cost. If it's a creature, it has haste.)",
  });
  const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
  const island = card("Island", "Basic Land — Island");
  const mountain = card("Mountain", "Basic Land — Mountain");

  it("plays", () => expect(isFullySupported(delay)).toBe(true));

  it("the Giant is exiled with three time counters, suspended; when the last is removed its owner casts it free, with haste", () => {
    const { s: s0, ap, opp, ids } = setup([giant]);
    const g = ids[0]!;
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, mountain);
    const d = putOnBattlefield(s0, opp, delay);
    moveObject(s0, d, "hand");
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, island);
    let s = run(s0, planCast(s0, ap, g));
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, d, [{ kind: "stack", id: s.stack.find((x) => x.objectId === g)!.id }]));
    s = settle(s);
    const o = s.objects[g]!;
    expect(o.zone).toBe("exile");
    expect(o.counters.time).toBe(3);
    expect(isSuspended(s, o)).toBe(true);
    o.counters.time = 1; // two upkeeps later
    s = passUntil(s, "upkeep", ap);
    s = passUntil(act(s, { type: "passPriority", player: waitingOn(s)! }), "upkeep", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: g, how: "suspend" });
    s = settle(run(s, botActions(s, ap)));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(true);
  });

  it("Suspend and Doom's Time Platform: exiling a creature or a graveyard card with time counters gives it suspend", () => {
    const suspendCard = card("Suspend", "Instant", "{U}", {
      oracleText: "Exile target creature and put two time counters on it. If it doesn't have suspend, it gains suspend. (At the beginning of its owner's upkeep, remove a time counter from that card. When the last is removed, the player plays it without paying its mana cost. If it's a creature, it has haste.)",
    });
    const platform = card("Doom's Time Platform", "Legendary Artifact", "{3}{U}{R}", {
      oracleText: "Whenever you attack, exile target nonland card from your graveyard with two time counters on it. If it doesn't have suspend, it gains suspend.",
    });
    for (const d of [suspendCard, platform]) expect(isFullySupported(d)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([suspendCard]);
    putOnBattlefield(s0, ap, island);
    const b = putOnBattlefield(s0, opp, bear());
    const s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]).toMatchObject({ zone: "exile", counters: { time: 2 } });
    expect(isSuspended(s, s.objects[b]!)).toBe(true);
  });

  it("a card that left exile and came back is a new object without the gained suspend (CR 400.7)", () => {
    const { s: s0, ap, opp, ids } = setup([giant]);
    const g = ids[0]!;
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, mountain);
    const d = putOnBattlefield(s0, opp, delay);
    moveObject(s0, d, "hand");
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, island);
    let s = run(s0, planCast(s0, ap, g));
    s = act(s, { type: "passPriority", player: ap });
    s = settle(run(s, planCast(s, opp, d, [{ kind: "stack", id: s.stack.find((x) => x.objectId === g)!.id }])));
    moveObject(s, g, "graveyard");
    moveObject(s, g, "exile");
    s.objects[g]!.counters.time = 2;
    expect(isSuspended(s, s.objects[g]!)).toBe(false);
  });
});

describe("Deep Gnome Terramancer: lands entering under an opponent's control without being played", () => {
  const terramancer = card("Deep Gnome Terramancer", "Creature — Gnome Wizard", "{1}{W}", {
    power: "2",
    toughness: "2",
    keywords: ["Flash"],
    oracleText:
      "Flash\nMold Earth — Whenever one or more lands enter under an opponent's control without being played, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle. Do this only once each turn.",
  });
  const growth = card("Rampant Growth", "Sorcery", "{1}{G}", { oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." });
  const plains = card("Plains", "Basic Land — Plains");

  it("plays", () => expect(isFullySupported(terramancer)).toBe(true));

  it("a land played doesn't trigger it; one put onto the battlefield does, and only once each turn once you search", () => {
    const { s: s0, ap, opp, ids } = setup([growth, growth]);
    putOnBattlefield(s0, opp, terramancer);
    for (const _ of [0, 1]) moveObject(s0, putOnBattlefield(s0, opp, plains), "library");
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    const land = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: land }));
    expect(s.pending).toBeNull();
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = s.pending ? act(s, botActions(s, waitingOn(s)!)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp });
    s = settle(act(s, botActions(s, opp)[0]!));
    const plainsOut = () => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Plains" && s.objects[id]!.controller === opp).length;
    expect(plainsOut()).toBe(1);
    // A second Rampant Growth this turn: no trigger (done once this turn, CR 603.2h).
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      expect(s.pending?.kind).not.toBe("chooseMay");
      s = s.pending ? act(s, botActions(s, waitingOn(s)!)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(plainsOut()).toBe(1);
  });
});

describe("Imposter Mech: a copy that's a Vehicle artifact with crew 3 and loses all other card types", () => {
  const mech = card("Imposter Mech", "Artifact — Vehicle", "{1}{U}", {
    power: "3",
    toughness: "1",
    oracleText: "You may have this Vehicle enter as a copy of a creature an opponent controls, except it's a Vehicle artifact with crew 3 and it loses all other card types.\nCrew 3",
  });
  const knight = card("Serra Angel", "Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance" });

  it("plays", () => expect(isFullySupported(mech)).toBe(true));

  it("copies an opponent's Serra Angel (not your own creature) as a noncreature Vehicle artifact with no Angel type, flying and crew 3", () => {
    const { s: s0, ap, opp, ids } = setup([mech]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, card("Island", "Basic Land — Island"));
    const theirs = putOnBattlefield(s0, opp, knight);
    putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy", options: [theirs, "none"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: theirs } as Action));
    const c = characteristics(s, s.objects[ids[0]!]!);
    expect(c.name).toBe("Serra Angel");
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Vehicle"]);
    expect(c.keywords).toContain("Flying");
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(compileCard(defOf(s, s.objects[ids[0]!]!)).activated.some((a) => a.crew === 3)).toBe(true);
  });
});

describe("instant and sorcery spells you cast have storm (CR 702.40a)", () => {
  const prismari = card("Prismari, the Inspiration", "Legendary Creature — Elder Dragon", "{5}{U}{R}", {
    power: "7",
    toughness: "7",
    keywords: ["Flying", "Ward"],
    oracleText: "Flying\nWard—Pay 5 life.\nInstant and sorcery spells you cast have storm. (Whenever you cast an instant or sorcery spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)",
  });
  const ral = card("Ral, Crackling Wit", "Legendary Planeswalker — Ral", "{2}{U}{R}", {
    loyalty: "4",
    oracleText:
      "Whenever you cast a noncreature spell, put a loyalty counter on Ral.\n+1: Create a 1/1 blue and red Otter creature token with prowess.\n−3: Draw three cards, then discard two cards.\n−10: Draw three cards. You get an emblem with \"Instant and sorcery spells you cast have storm.\" (Whenever you cast an instant or sorcery spell, copy it for each spell cast before it this turn.)",
  });
  const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
  const island = card("Island", "Basic Land — Island");

  it("plays", () => {
    expect(isFullySupported(prismari)).toBe(true);
    expect(isFullySupported(ral)).toBe(true);
  });

  /** Ap casts Divination twice; how many cards they drew. */
  function twice(s0: GameState, ap: PlayerId, ids: string[]) {
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, island);
    const hand = s0.players[ap]!.hand.length - 2;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    return s.players[ap]!.hand.length - hand;
  }

  it("with Prismari, the second Divination is copied once: six cards", () => {
    const { s, ap, ids } = setup([divination, divination]);
    putOnBattlefield(s, ap, prismari);
    expect(twice(s, ap, ids)).toBe(6);
  });

  it("Ral's −10 gives the emblem; it does the same, and with Prismari too each storm triggers: eight cards", () => {
    const { s: s0, ap, ids } = setup([divination, divination]);
    const r = putOnBattlefield(s0, ap, ral);
    s0.objects[r]!.counters.loyalty = 10;
    const s = settle(activate(s0, ap, r, 2));
    expect(s.emblems?.length).toBe(1);
    expect(twice(structuredClone(s), ap, ids)).toBe(6);
    putOnBattlefield(s, ap, prismari);
    expect(twice(s, ap, ids)).toBe(8);
  });
});

describe("Brainstealer Dragon", () => {
  const dragon = card("Brainstealer Dragon", "Creature — Dragon Horror", "{5}{B}{B}", {
    power: "6",
    toughness: "6",
    keywords: ["Flying"],
    oracleText:
      "Flying\nAt the beginning of your end step, exile the top card of each opponent's library. You may play those cards for as long as they remain exiled. If you cast a spell this way, you may spend mana as though it were mana of any color to cast it.\nWhenever a nonland permanent an opponent owns enters the battlefield under your control, they lose life equal to its mana value.",
  });
  const viper = card("Ambush Viper", "Creature — Snake", "{1}{G}", { power: "2", toughness: "1", keywords: ["Flash", "Deathtouch"], oracleText: "Flash\nDeathtouch" });

  it("plays", () => {
    expect(isFullySupported(dragon)).toBe(true);
    expect(isFullySupported(card("Stolen Strategy", "Enchantment", "{4}{R}", { oracleText: "At the beginning of your upkeep, exile the top card of each opponent's library. Until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells." }))).toBe(true);
  });

  it("exiles each opponent's top card at your end step; you cast an opponent's Viper with Islands, and its owner loses 2 life", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dragon);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, card("Island", "Basic Land — Island"));
    const v = putOnBattlefield(s0, opp, viper);
    moveObject(s0, v, "library");
    s0.players[opp]!.library = [v, ...s0.players[opp]!.library.filter((x) => x !== v)];
    const others = s0.turnOrder.filter((p) => p !== ap).map((p) => s0.players[p]!.library[0]!);
    let s = settle(passUntil(s0, "end", ap));
    for (const id of others) expect(s.objects[id]).toMatchObject({ zone: "exile", mayPlay: { player: ap, until: "exiled", anyType: true } });
    expect(s.players[ap]!.library.length).toBe(s0.players[ap]!.library.length); // not your own
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, v)));
    expect(s.objects[v]).toMatchObject({ zone: "battlefield", owner: opp });
    expect(characteristics(s, s.objects[v]!).controller).toBe(ap);
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});

describe("Invert Polarity", () => {
  const invert = card("Invert Polarity", "Instant", "{U}{U}{R}", {
    oracleText: "Choose target spell, then flip a coin. If you win the flip, gain control of that spell and you may choose new targets for it. If you lose the flip, counter that spell.",
  });
  const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
  /** The next coin flip comes out as `win`. */
  function rig(s: GameState, win: boolean) {
    for (let x = 1; ; x++) {
      if (nextRandom({ rngState: x } as GameState) < 0.5 === win) {
        s.rngState = x;
        return;
      }
    }
  }
  /** Ap Bolts opp; opp answers with Invert Polarity; the flip is rigged. */
  function invertBolt(win: boolean) {
    const { s: s0, ap, opp, ids } = setup([bolt]);
    putOnBattlefield(s0, ap, card("Mountain", "Basic Land — Mountain"));
    const inv = putOnBattlefield(s0, opp, invert);
    moveObject(s0, inv, "hand");
    for (const l of ["Island", "Island", "Mountain"]) putOnBattlefield(s0, opp, card(l, `Basic Land — ${l}`));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, inv, [{ kind: "stack", id: s.stack.find((x) => x.objectId === ids[0])!.id }]));
    rig(s, win);
    for (let i = 0; i < 6 && s.stack.length > 1 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, boltId: ids[0]! };
  }

  it("plays", () => expect(isFullySupported(invert)).toBe(true));

  it("winning the flip, its new controller may retarget the Bolt at its caster", () => {
    let { s, ap, opp, boltId } = invertBolt(true);
    expect(s.stack.find((x) => x.objectId === boltId)?.controller).toBe(opp);
    expect(s.pending).toMatchObject({ player: opp });
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
    s = act(s, { type: "newTargets", player: opp, targets: [{ kind: "player", id: ap }] });
    const life = s.players[ap]!.life;
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 3);
  });

  it("losing the flip, the Bolt is countered", () => {
    let { s, opp, boltId } = invertBolt(false);
    const life = s.players[opp]!.life;
    s = settle(s);
    expect(s.objects[boltId]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
  });
});

describe("Starfall Invocation", () => {
  const starfall = card("Starfall Invocation", "Sorcery", "{3}{W}{W}", {
    oracleText:
      "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nDestroy all creatures. If the gift was promised, return a creature card put into your graveyard this way to the battlefield under your control.",
  });
  const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
  function wrath(gift: boolean) {
    const { s: s0, ap, opp, ids } = setup([starfall]);
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, ap, card("Plains", "Basic Land — Plains"));
    const mine = putOnBattlefield(s0, ap, giant);
    const theirs = putOnBattlefield(s0, opp, bear());
    // A creature card already in your graveyard can't come back: only one put there this way.
    const old = putOnBattlefield(s0, ap, bear());
    moveObject(s0, old, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, gift ? { gift: opp } : {})));
    return { s, ap, opp, mine, theirs, old };
  }

  it("plays", () => expect(isFullySupported(starfall)).toBe(true));

  it("with the gift promised, you return a creature card that died to it (not one already there)", () => {
    let { s, ap, mine, theirs, old } = wrath(true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [mine] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [mine] }));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[old]!.zone).toBe("graveyard");
  });

  it("without it, everything just dies", () => {
    const { s, mine } = wrath(false);
    expect(s.pending).toBeNull();
    expect(s.objects[mine]!.zone).toBe("graveyard");
  });
});

describe("Wrathful Red Dragon", () => {
  const wrd = card("Wrathful Red Dragon", "Creature — Dragon", "{3}{R}{R}", {
    power: "5",
    toughness: "5",
    keywords: ["Flying"],
    oracleText: "Flying\nWhenever a Dragon you control is dealt damage, it deals that much damage to any target that isn't a Dragon.",
  });
  const whelp = card("Dragon Whelp", "Creature — Dragon", "{2}{R}{R}", { power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying" });
  const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

  it("plays", () => expect(isFullySupported(wrd)).toBe(true));

  it("a Dragon you control dealt lethal damage still deals that much to any target that isn't a Dragon (its last known self)", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    putOnBattlefield(s0, ap, card("Mountain", "Basic Land — Mountain"));
    putOnBattlefield(s0, ap, wrd);
    const w = putOnBattlefield(s0, ap, whelp);
    s0.objects[w]!.damage = 1;
    const theirDragon = putOnBattlefield(s0, opp, whelp);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(w)]));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const spec = (s.pending as { specs: TargetSpec[] }).specs[0]!;
    expect(isLegalTarget(s, spec, target(theirDragon), ap)).toBe(false);
    expect(isLegalTarget(s, spec, { kind: "player", id: opp }, ap)).toBe(true);
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.objects[w]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});

describe("Valgavoth, Harrower of Souls", () => {
  const valgavoth = card("Valgavoth, Harrower of Souls", "Legendary Creature — Elder Demon", "{2}{B}{R}", {
    power: "4",
    toughness: "4",
    keywords: ["Flying", "Ward"],
    oracleText: "Ward—Pay 2 life.\nFlying\nWhenever an opponent loses life for the first time during each of their turns, put a +1/+1 counter on Valgavoth and draw a card.",
  });

  it("plays", () => expect(isFullySupported(valgavoth)).toBe(true));

  it("triggers on an opponent's first life loss during their own turn only", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, opp, valgavoth);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    // The third player loses life during ap's turn: not their turn.
    loseLife(s0, third, 1);
    let s = settle(s0);
    expect(s.objects[v]!.counters["+1/+1"] ?? 0).toBe(0);
    loseLife(s, ap, 2);
    loseLife(s, ap, 2);
    s = settle(s);
    expect(s.objects[v]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Hermit Druid", () => {
  const druid = card("Hermit Druid", "Creature — Human Druid", "{1}{G}", {
    power: "1",
    toughness: "1",
    oracleText: "{G}, {T}: Reveal cards from the top of your library until you reveal a basic land card. Put that card into your hand and all other cards revealed this way into your graveyard.",
  });

  it("plays", () => expect(isFullySupported(druid)).toBe(true));

  it("the basic land goes to your hand, the cards revealed before it into your graveyard; with none, the whole library", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, druid);
    s0.objects[d]!.controlledSinceTurn = -1;
    putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    const lib = s0.players[ap]!.library;
    const land = lib.find((id) => s0.cards[s0.objects[id]!.cardId]!.types.includes("Land"))!;
    const spells = lib.filter((id) => !s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")).slice(0, 2);
    s0.players[ap]!.library = [...spells, land, ...lib.filter((x) => x !== land && !spells.includes(x))];
    let s = settle(activate(s0, ap, d, 0));
    expect(s.objects[land]!.zone).toBe("hand");
    for (const id of spells) expect(s.objects[id]!.zone).toBe("graveyard");
    // No basic land left: every card is revealed and goes to the graveyard.
    const { s: t0, ap: ap2 } = setup([]);
    const d2 = putOnBattlefield(t0, ap2, druid);
    t0.objects[d2]!.controlledSinceTurn = -1;
    putOnBattlefield(t0, ap2, card("Forest", "Basic Land — Forest"));
    for (const id of [...t0.players[ap2]!.library]) if (t0.cards[t0.objects[id]!.cardId]!.types.includes("Land")) moveObject(t0, id, "exile");
    const t = settle(activate(t0, ap2, d2, 0));
    expect(t.players[ap2]!.library.length).toBe(0);
  });
});

describe("Fighter Class level 3: up to one target creature blocks the attacker this combat if able", () => {
  const fighter = card("Fighter Class", "Enchantment — Class", "{R}{W}", {
    oracleText:
      "(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, search your library for an Equipment card, reveal it, put it into your hand, then shuffle.\n{1}{R}{W}: Level 2\nEquip abilities you activate cost {2} less to activate.\n{3}{R}{W}: Level 3\nWhenever a creature you control attacks, up to one target creature blocks it this combat if able.",
  });

  it("plays", () => expect(isFullySupported(fighter)).toBe(true));

  it("triggered for two attackers on one blocker, it must block one of them, either one", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, fighter);
    s0.objects[f]!.classLevel = 3;
    const a1 = putOnBattlefield(s0, ap, bear());
    const a2 = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(blocker)] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must block/);
    expect(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a1 }] }).objects[blocker]!.blocking).toEqual([a1]);
    expect(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a2 }] }).objects[blocker]!.blocking).toEqual([a2]);
  });
});

describe("Urza's Workshop", () => {
  const workshop = card("Urza's Workshop", "Land — Urza's", "", { oracleText: "{T}: Add {C}.\nMetalcraft — {T}: Add {C} for each Urza's land you control. Activate only if you control three or more artifacts." });
  const mine = card("Urza's Mine", "Land — Urza's Mine", "", { oracleText: "{T}: Add {C}. If you control an Urza's Power-Plant and an Urza's Tower, add {C}{C} instead." });

  it("plays", () => expect(isFullySupported(workshop)).toBe(true));

  it("with three artifacts, adds {C} for each Urza's land you control (itself too)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, workshop);
    putOnBattlefield(s0, ap, mine);
    putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    const rock = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, rock);
    expect(compileCard(workshop).activated[0]!.mana).toBe(true);
    const tap: Action = { type: "activateAbility", player: ap, objectId: w, index: 0 };
    expect(() => act(s0, tap)).toThrow();
    putOnBattlefield(s0, ap, rock);
    const s = act(s0, tap);
    expect(pool(s, ap).C).toBe(2);
  });
});

describe("the untap symbol {Q} (CR 107.6)", () => {
  const sentry = card("Safehold Sentry", "Creature — Elf Warrior", "{1}{W}", { power: "2", toughness: "2", oracleText: "{2}{W}, {Q}: This creature gets +0/+2 until end of turn. ({Q} is the untap symbol.)" });
  const mantle = card("Umbral Mantle", "Artifact — Equipment", "{3}", { oracleText: "Equipped creature has \"{3}, {Q}: This creature gets +2/+2 until end of turn.\" ({Q} is the untap symbol.)\nEquip {0}" });

  it("these cards play", () => {
    for (const d of [sentry, mantle]) expect(isFullySupported(d)).toBe(true);
  });

  it("untaps the creature as a cost; can't be activated while untapped or summoning sick", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, sentry);
    const sick = putOnBattlefield(s0, ap, sentry, { sick: true });
    s0.players[ap]!.manaPool.W = 3;
    const use = (x: string): Action => ({ type: "activateAbility", player: ap, objectId: x, index: 0 });
    expect(() => act(s0, use(id))).toThrow(/untapped/);
    s0.objects[id]!.tapped = true;
    s0.objects[sick]!.tapped = true;
    expect(() => act(s0, use(sick))).toThrow(/summoning sickness/);
    let s = act(s0, use(id));
    expect(s.objects[id]!.tapped).toBe(false);
    s = passAll(s);
    expect(characteristics(s, s.objects[id]!).toughness).toBe(4);
  });
});

describe("You may cast ~ from exile", () => {
  const squee = card("Squee, the Immortal", "Legendary Creature — Goblin", "{1}{R}{R}", { power: "2", toughness: "1", oracleText: "You may cast this card from your graveyard or from exile." });
  const griffin = card("Misthollow Griffin", "Creature — Griffin", "{2}{U}{U}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nYou may cast this card from exile." });

  it("these cards play", () => {
    for (const d of [squee, griffin]) expect(isFullySupported(d)).toBe(true);
  });

  it("Squee: its owner casts it from exile and from the graveyard, paying its mana cost; an opponent can't", () => {
    const { s: s0, ap, ids } = setup([squee, griffin]);
    const [sq, gr] = ids as [string, string];
    moveObject(s0, sq, "exile");
    moveObject(s0, gr, "exile");
    const opp = s0.players.find((p) => p.id !== ap)!.id;
    expect(mayPlayFromExile(s0, s0.objects[sq]!, ap)).toBe(true);
    expect(mayPlayFromExile(s0, s0.objects[sq]!, opp)).toBe(false);
    let s = cast(s0, ap, sq);
    expect(s.objects[sq]!.zone).toBe("battlefield");
    s = cast(s, ap, gr);
    expect(s.objects[gr]!.zone).toBe("battlefield");
    moveObject(s, sq, "graveyard");
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    for (const a of planCast(s, ap, sq, undefined, undefined, undefined, undefined, { via: "permission" })!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[sq]!.zone).toBe("battlefield");
  });
});

describe("Dance of the Dead", () => {
  const dance = card("Dance of the Dead", "Enchantment — Aura", "{1}{B}", {
    oracleText:
      "Enchant creature card in a graveyard\nWhen this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Put enchanted creature card onto the battlefield tapped under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.\nEnchanted creature gets +1/+1 and doesn't untap during its controller's untap step.\nAt the beginning of the upkeep of enchanted creature's controller, that player may pay {1}{B}. If the player does, untap that creature.",
  });

  it("plays", () => expect(isFullySupported(dance)).toBe(true));

  it("returns the creature tapped, +1/+1; it stays tapped through the untap step until its controller pays {1}{B}", () => {
    const { s: s0, ap, ids } = setup([dance]);
    const b = putOnBattlefield(s0, ap, bear());
    moveObject(s0, b, "graveyard");
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(b)])!) s = act(s, a);
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[b]).toMatchObject({ zone: "battlefield", tapped: true });
    expect(characteristics(s, s.objects[b]!).power).toBe(3);
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[b]!.tapped).toBe(true);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.B = 2;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[b]!.tapped).toBe(false);
    expect(s.players[ap]!.manaPool.B).toBe(0);
  });
});

describe("flicker: return those cards under their owner's control", () => {
  const displace = card("Displace", "Instant", "{2}{U}", { oracleText: "Exile up to two target creatures you control, then return those cards to the battlefield under their owner's control." });
  const brago = card("Brago, King Eternal", "Legendary Creature — Spirit Noble", "{2}{W}{U}", { power: "2", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever Brago deals combat damage to a player, exile any number of target nonland permanents you control, then return those cards to the battlefield under their owner's control." });

  it("these cards play", () => {
    for (const d of [displace, brago]) expect(isFullySupported(d)).toBe(true);
  });

  it("Displace: both creatures come back as new, untapped objects", () => {
    const { s: s0, ap, ids } = setup([displace]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[a]!.tapped = true;
    const zc = s0.objects[a]!.zoneChanges ?? 0;
    const s = cast(s0, ap, ids[0]!, [target(a), target(b)]);
    for (const x of [a, b]) expect(s.objects[x]).toMatchObject({ zone: "battlefield", controller: ap, tapped: false });
    expect(s.objects[a]!.zoneChanges).toBe(zc + 2);
  });
});

describe("Opalescence, Humility, March of the Machines, Starfield of Nyx (layers 4, 6 and 7b, CR 613)", () => {
  const opalescence = card("Opalescence", "Enchantment", "{2}{W}{W}", { oracleText: "Each other non-Aura enchantment is a creature in addition to its other types and has base power and base toughness each equal to its mana value." });
  const humility = card("Humility", "Enchantment", "{2}{W}{W}", { oracleText: "All creatures lose all abilities and have base power and toughness 1/1." });
  const march = card("March of the Machines", "Enchantment", "{3}{U}", { oracleText: "Each noncreature artifact is an artifact creature with power and toughness each equal to its mana value." });
  const starfield = card("Starfield of Nyx", "Enchantment", "{4}{W}", {
    oracleText: "At the beginning of your upkeep, you may return target enchantment card from your graveyard to the battlefield.\nAs long as you control five or more enchantments, each other non-Aura enchantment you control is a creature in addition to its other types and has base power and base toughness each equal to its mana value.",
  });
  const worship = card("Worship", "Enchantment", "{3}{W}", { oracleText: "If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead." });
  const glorious = card("Glorious Anthem", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." });
  const aura = card("Pacifism", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
  const isCreature = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types.includes("Creature");
  const ptOf = (s: GameState, id: string) => { const c = characteristics(s, s.objects[id]!); return `${c.power}/${c.toughness}`; };

  it("these cards play", () => {
    for (const d of [opalescence, humility, march, starfield, card("Dress Down", "Enchantment", "{1}{U}", { keywords: ["Flash"], oracleText: "Flash\nWhen this enchantment enters, draw a card.\nCreatures lose all abilities.\nAt the beginning of the end step, sacrifice this enchantment." })]) expect(isFullySupported(d)).toBe(true);
  });

  it("Opalescence animates each other non-Aura enchantment at its mana value, not itself", () => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, opalescence);
    const w = putOnBattlefield(s, ap, worship);
    invalidateCharacteristics(s);
    expect(isCreature(s, o)).toBe(false);
    expect(isCreature(s, w)).toBe(true);
    expect(ptOf(s, w)).toBe("4/4");
  });

  it("Opalescence, then Humility: all 1/1 (Humility's timestamp is later, rulings)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, opalescence);
    const h = putOnBattlefield(s, ap, humility);
    const w = putOnBattlefield(s, ap, worship);
    invalidateCharacteristics(s);
    expect(ptOf(s, h)).toBe("1/1");
    expect(ptOf(s, w)).toBe("1/1");
    // Worship lost its ability (layer 6) but Humility's own effect keeps applying to it (CR 613.6).
    expect(characteristics(s, s.objects[h]!).types).toContain("Creature");
  });

  it("Humility, then Opalescence: Humility and Worship are 4/4", () => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, humility);
    putOnBattlefield(s, ap, opalescence);
    const w = putOnBattlefield(s, ap, worship);
    invalidateCharacteristics(s);
    expect(ptOf(s, h)).toBe("4/4");
    expect(ptOf(s, w)).toBe("4/4");
  });

  it("Humility removes a creature's abilities and sets it 1/1; anthems still apply after (layer 7c)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, humility);
    putOnBattlefield(s, ap, glorious);
    const flyer = putOnBattlefield(s, ap, card("Serra Angel", "Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance" }));
    invalidateCharacteristics(s);
    expect(ptOf(s, flyer)).toBe("2/2");
    expect(objHasKeyword(s, s.objects[flyer]!, "Flying")).toBe(false);
  });

  it("March of the Machines: a noncreature artifact is a creature at its mana value; a 0 one dies", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, march);
    const rock = putOnBattlefield(s0, ap, card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." }));
    const zero = putOnBattlefield(s0, ap, card("Mox Opal", "Legendary Artifact", "{0}", { oracleText: "Metalcraft — {T}: Add one mana of any color. Activate only if you control three or more artifacts." }));
    invalidateCharacteristics(s0);
    expect(isCreature(s0, rock)).toBe(true);
    expect(ptOf(s0, rock)).toBe("2/2");
    const s = passAll(s0);
    expect(s.objects[zero]!.zone).toBe("graveyard");
  });

  it("Starfield of Nyx: only with five or more enchantments; Auras stay Auras", () => {
    const { s, ap } = setup([]);
    const st = putOnBattlefield(s, ap, starfield);
    const w = putOnBattlefield(s, ap, worship);
    putOnBattlefield(s, ap, glorious);
    putOnBattlefield(s, ap, humility);
    invalidateCharacteristics(s);
    expect(isCreature(s, w)).toBe(false);
    const p = putOnBattlefield(s, ap, aura);
    invalidateCharacteristics(s);
    expect(isCreature(s, w)).toBe(true);
    expect(isCreature(s, p)).toBe(false);
    expect(isCreature(s, st)).toBe(false);
  });
});

describe("Aetheric Amplifier, Ezuri", () => {
  const amp = card("Aetheric Amplifier", "Artifact", "{3}", {
    oracleText: "{T}: Add one mana of any color.\n{4}, {T}: Choose one. Activate only as a sorcery.\n• Double the number of each kind of counter on target permanent.\n• Double the number of each kind of counter you have.",
  });
  const ezuri = card("Ezuri, Renegade Leader", "Legendary Creature — Elf Warrior", "{1}{G}{G}", { power: "2", toughness: "2", oracleText: "{G}: Regenerate another target Elf.\n{2}{G}{G}{G}: Elf creatures you control get +3/+3 and gain trample until end of turn." });

  it("these cards play", () => {
    for (const d of [amp, ezuri]) expect(isFullySupported(d)).toBe(true);
    expect(compileCard(amp).activated.find((a) => a.body.modal)!.sorcerySpeed).toBe(true);
  });

  it("doubles each kind of counter you have (CR 701.10e)", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, amp);
    s0.players[ap]!.energy = 3;
    s0.players[ap]!.experience = 2;
    s0.players[ap]!.manaPool.C = 4;
    const index = compileCard(amp).activated.findIndex((a) => a.body.modal);
    let s = act(s0, { type: "activateAbility", player: ap, objectId: id, index, modes: [1] });
    s = passAll(s);
    expect(s.players[ap]!.energy).toBe(6);
    expect(s.players[ap]!.experience).toBe(4);
    expect(s.players[ap]!.poison ?? 0).toBe(0);
  });

  it("Ezuri can't regenerate itself", () => {
    const { s, ap } = setup([]);
    const e = putOnBattlefield(s, ap, ezuri);
    const elf = putOnBattlefield(s, ap, card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." }));
    s.players[ap]!.manaPool.G = 1;
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: e, index: 0, targets: [target(e)] })).toThrow();
    const t = act(s, { type: "activateAbility", player: ap, objectId: e, index: 0, targets: [target(elf)] });
    expect(t.stack.length).toBe(1);
  });
});

describe("Neoform", () => {
  const neoform = card("Neoform", "Sorcery", "{G}{U}", {
    oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nSearch your library for a creature card with mana value equal to 1 plus the sacrificed creature's mana value, put that card onto the battlefield with an additional +1/+1 counter on it, then shuffle.",
  });
  const three = card("Three Drop", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3" });

  it("plays", () => expect(isFullySupported(neoform)).toBe(true));

  it("finds a creature with mana value 1 more and puts it onto the battlefield with a +1/+1 counter", () => {
    const { s: s0, ap, ids } = setup([neoform]);
    const fodder = putOnBattlefield(s0, ap, bear());
    const t = putOnBattlefield(s0, ap, three);
    moveObject(s0, t, "library");
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { sacrifice: [fodder] })!) s = act(s, a);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [t] });
    s = act(s, { type: "searchLibrary", player: ap, found: [t] });
    expect(s.objects[t]).toMatchObject({ zone: "battlefield", counters: { "+1/+1": 1 } });
  });
});

describe("Turntimber Symbiosis", () => {
  const symbiosis = card("Turntimber Symbiosis", "Sorcery", "{4}{G}{G}{G}", {
    oracleText: "Look at the top seven cards of your library. You may put a creature card from among them onto the battlefield. If that card has mana value 3 or less, it enters with three additional +1/+1 counters on it. Put the rest on the bottom of your library in a random order.",
  });
  const big = card("Big Beast", "Creature — Beast", "{3}{G}", { power: "4", toughness: "4" });

  it("plays", () => expect(isFullySupported(symbiosis)).toBe(true));

  for (const [label, small] of [["mana value 3 or less: three +1/+1 counters", true], ["mana value 4: none", false]] as const)
    it(label, () => {
      const { s: s0, ap, ids } = setup([symbiosis]);
      const b = putOnBattlefield(s0, ap, small ? bear() : big);
      moveObject(s0, b, "library");
      const lib = s0.players[ap]!.library;
      s0.players[ap]!.library = [b, ...lib.filter((x) => x !== b)];
      let s = s0;
      for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
      for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind).toBe("searchLibrary");
      s = act(s, { type: "searchLibrary", player: ap, found: [b] });
      expect(s.objects[b]!.zone).toBe("battlefield");
      expect(s.objects[b]!.counters?.["+1/+1"] ?? 0).toBe(small ? 3 : 0);
    });
});

describe("Kindred Summons", () => {
  const summons = card("Kindred Summons", "Instant", "{5}{G}{G}", {
    oracleText: "Choose a creature type. Reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library.",
  });
  const elf = () => card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });

  it("plays", () => expect(isFullySupported(summons)).toBe(true));

  it("X is the number of creatures you control of that type; that many come in together", () => {
    const { s: s0, ap, ids } = setup([summons]);
    putOnBattlefield(s0, ap, elf());
    putOnBattlefield(s0, ap, elf());
    const lib = [elf(), elf(), elf()].map((d) => { const id = putOnBattlefield(s0, ap, d); moveObject(s0, id, "library"); return id; });
    const p = s0.players[ap]!;
    // Two forests, then the three Elves.
    const forests = p.library.filter((id) => !lib.includes(id)).slice(0, 2);
    p.library = [...forests, ...lib, ...p.library.filter((id) => !lib.includes(id) && !forests.includes(id))];
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "creatureType" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Elf" });
    expect(lib.map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "library"]);
    expect(forests.every((id) => s.objects[id]!.zone === "library")).toBe(true);
  });
});

describe("Nether Traitor, Escape to the Wilds", () => {
  const traitor = card("Nether Traitor", "Creature — Spirit", "{B}{B}", {
    power: "1",
    toughness: "1",
    keywords: ["Haste", "Shadow"],
    oracleText: "Haste\nShadow (This creature can block or be blocked by only creatures with shadow.)\nWhenever another creature is put into your graveyard from the battlefield, you may pay {B}. If you do, return this card from your graveyard to the battlefield.",
  });
  const wilds = card("Escape to the Wilds", "Sorcery", "{3}{R}{G}", { oracleText: "Exile the top five cards of your library. You may play cards exiled this way until the end of your next turn.\nYou may play an additional land this turn." });
  const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
  const wrath = card("Day of Judgment", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures." });

  it("these cards play", () => {
    for (const d of [traitor, wilds]) expect(isFullySupported(d)).toBe(true);
  });

  it("Nether Traitor returns from the graveyard when another creature of yours dies, for {B}", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const t = putOnBattlefield(s0, ap, traitor);
    moveObject(s0, t, "graveyard");
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, card("Swamp", "Basic Land — Swamp"));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(b)])!) s = act(s, a);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.B = 1;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[t]!.zone).toBe("battlefield");
  });

  it("not when it dies at the same time as the other creature (CR 603.10a)", () => {
    const { s: s0, ap, ids } = setup([wrath]);
    const t = putOnBattlefield(s0, ap, traitor);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, card("Swamp", "Basic Land — Swamp"));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
    expect(s.objects[t]!.zone).toBe("graveyard");
  });
});

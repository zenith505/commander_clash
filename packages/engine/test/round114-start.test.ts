// Round 114, the first of the most played cards: "add X mana in any combination of colors" from a spell or a triggered
// ability (Klauth, Manamorphose), with a color-split choice as it resolves (CR 106.1b, 608.2d).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, manaValue, spellCost, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

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

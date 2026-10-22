// Round 114, the first of the most played cards: "add X mana in any combination of colors" from a spell or a triggered
// ability (Klauth, Manamorphose), with a color-split choice as it resolves (CR 106.1b, 608.2d).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
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

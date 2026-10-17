// Mana added by triggers at the beginning of main phases: to another player ("that player adds", "the active player
// adds", CR 106.4), with a spending restriction (CR 106.6), and "each of your main phases" (CR 505.1: precombat and
// postcombat). The Sieges' "As ~ enters, choose Khans or Dragons" (anchor words, CR 614.12b). Bigger on the Inside's
// granted ability: a target player adds the mana and their next spell has cascade (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, compileCard, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { loseLife, moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const pool = (s: GameState, pid: PlayerId) => s.players[pid]!.manaPool;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const vineyard = card("Eladamri's Vineyard", "Enchantment", "{G}", { oracleText: "At the beginning of each player's first main phase, that player adds {G}{G}." });
const urn = card("Blinkmoth Urn", "Artifact", "{5}", { oracleText: "At the beginning of each player's first main phase, if this artifact is untapped, that player adds {C} for each artifact they control." });
const belbe = card("Belbe, Corrupted Observer", "Legendary Creature — Phyrexian Zombie Elf", "{B}{G}", { power: "2", toughness: "2", oracleText: "At the beginning of each postcombat main phase, the active player adds {C}{C} for each of your opponents who lost life this turn. (Damage causes loss of life.)" });
const paintmage = card("Abstract Paintmage", "Creature — Djinn Sorcerer", "{U}{U/R}{R}", { power: "2", toughness: "2", oracleText: "At the beginning of your first main phase, add {U}{R}. Spend this mana only to cast instant and sorcery spells." });
const frontier = card("Frontier Siege", "Enchantment", "{3}{G}", { keywords: ["Fight"], oracleText: "As this enchantment enters, choose Khans or Dragons.\n• Khans — At the beginning of each of your main phases, add {G}{G}.\n• Dragons — Whenever a creature you control with flying enters, you may have it fight target creature you don't control." });
const palace = card("Palace Siege", "Enchantment", "{3}{B}{B}", { oracleText: "As this enchantment enters, choose Khans or Dragons.\n• Khans — At the beginning of your upkeep, return target creature card from your graveyard to your hand.\n• Dragons — At the beginning of your upkeep, each opponent loses 2 life and you gain 2 life." });
const citadel = card("Citadel Siege", "Enchantment", "{2}{W}{W}", { oracleText: "As this enchantment enters, choose Khans or Dragons.\n• Khans — At the beginning of combat on your turn, put two +1/+1 counters on target creature you control.\n• Dragons — At the beginning of combat on each opponent's turn, tap target creature that player controls." });
const bigger = card("Bigger on the Inside", "Enchantment — Aura", "{3}{R}{G}", { keywords: ["Enchant"], oracleText: "Enchant artifact or land\nEnchanted permanent has \"{T}: Target player adds two mana of any one color. The next spell they cast this turn has cascade.\" (When they cast their next spell, they exile cards from the top of their library until they exile a nonland card that costs less. They may cast it without paying its mana cost. They put the exiled cards on the bottom in a random order.)" });

const relic = card("Test Relic", "Artifact", "{1}");
const sorcery = card("Test Sorcery", "Sorcery", "{U}{R}", { oracleText: "Draw a card." });
const ogre = card("Ogre Test", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4" });
const sprite = card("Sprite Test", "Creature — Faerie", "{U}", { power: "1", toughness: "1" });

describe("main phase mana for other players, restricted mana, each of your main phases", () => {
  it("parse", () => {
    supported(vineyard, urn, belbe, paintmage, frontier, palace, citadel, bigger);
    expect(compileCard(vineyard).triggers[0]).toMatchObject({ event: "eachFirstMain", body: { effects: [{ type: "addMana", mana: "{G}{G}", who: { ref: "eventPlayer" } }] } });
    expect(compileCard(frontier).entersAnchor).toEqual(["Khans", "Dragons"]);
    expect(compileCard(frontier).triggers[0]).toMatchObject({ event: "yourMain", activeIf: { kind: "anchor", word: "Khans" } });
    expect(compileCard(frontier).triggers[1]!.activeIf).toEqual({ kind: "anchor", word: "Dragons" });
  });

  it("Eladamri's Vineyard: the active player adds {G}{G} at the beginning of their first main phase, not the Vineyard's controller", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, vineyard);
    const other = next(s0, ap);
    let s = passUntil(s0, "main1", other);
    s = settle(s);
    expect(pool(s, other).G).toBe(2);
    expect(pool(s, ap).G).toBe(0);
    expect(s.log.some((l) => l.text === `${s.players[other]!.name} adds {G}{G}.`)).toBe(true);
    // Not in a postcombat main phase.
    s = passUntil(s, "main2", other);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("Blinkmoth Urn: that player adds {C} for each artifact they control, only while the Urn is untapped", () => {
    const { s: s0, ap } = setup([]);
    const u = putOnBattlefield(s0, ap, urn);
    const other = next(s0, ap);
    putOnBattlefield(s0, other, relic);
    putOnBattlefield(s0, other, relic);
    let s = passUntil(s0, "main1", other);
    s = settle(s);
    expect(pool(s, other).C).toBe(2);
    // Tapped: it doesn't trigger (CR 603.4).
    s.objects[u]!.tapped = true;
    s = passUntil(s, "main1", next(s, other));
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("Belbe: the active player adds {C}{C} for each of Belbe's controller's opponents who lost life this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, belbe);
    const other = next(s0, ap);
    let s = passUntil(s0, "main1", other);
    // Two of Belbe's controller's opponents lose life (one of them the active player); Belbe's controller does too.
    loseLife(s, other, 1);
    loseLife(s, next(s, other), 2);
    loseLife(s, ap, 3);
    s = passUntil(s, "main2", other);
    s = settle(s);
    expect(pool(s, other).C).toBe(4);
    expect(pool(s, ap).C).toBe(0);
  });

  it("Abstract Paintmage: {U}{R} that can be spent only on instant and sorcery spells", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, paintmage);
    let s = passUntil(s0, "main1", next(s0, ap));
    s = passUntil(s, "main1", ap);
    s = settle(s);
    expect(pool(s, ap)).toMatchObject({ U: 1, R: 1 });
    expect(s.players[ap]!.manaLots).toEqual([
      expect.objectContaining({ mana: "U", n: 1, only: expect.objectContaining({ text: "Spend this mana only to cast instant and sorcery spells." }) }),
      expect.objectContaining({ mana: "R", n: 1, only: expect.objectContaining({ text: "Spend this mana only to cast instant and sorcery spells." }) }),
    ]);
    // The sorcery is paid with it, without tapping a land.
    const id = putOnBattlefield(s, ap, sorcery);
    moveObject(s, id, "hand");
    const plan = planCast(s, ap, s.players[ap]!.hand[s.players[ap]!.hand.length - 1]!);
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(0);
  });

  it("Frontier Siege (Khans): {G}{G} at the beginning of each of your main phases, precombat and postcombat", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, frontier);
    s0.objects[f]!.chosen = { anchor: "Khans" };
    let s = passUntil(s0, "main1", next(s0, ap));
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s = passUntil(s, "main1", ap);
    s = settle(s);
    expect(pool(s, ap).G).toBe(2);
    s = passUntil(s, "main2", ap);
    s = settle(s);
    expect(pool(s, ap).G).toBe(2);
    // Dragons: no mana.
    s.objects[f]!.chosen = { anchor: "Dragons" };
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("Palace Siege: the choice is made as it enters (CR 614.12b); Dragons drains each opponent in your upkeep", () => {
    const { s: s0, ap, ids } = setup([palace]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "anchor", options: ["Khans", "Dragons"], player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "Dragons" });
    expect(s.objects[ids[0]!]!.chosen).toEqual({ anchor: "Dragons" });
    const lives = s.turnOrder.map((p) => s.players[p]!.life);
    s = passUntil(s, "upkeep", next(s, ap));
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(s.turnOrder.map((p, i) => lives[i]! + (p === ap ? 2 : -2)));
  });

  it("Palace Siege (Khans): return target creature card from your graveyard in your upkeep", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, palace);
    s0.objects[p]!.chosen = { anchor: "Khans" };
    const b = putOnBattlefield(s0, ap, bear());
    moveObject(s0, b, "graveyard");
    let s = passUntil(s0, "upkeep", next(s0, ap));
    s = passUntil(s, "upkeep", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] }));
    expect(s.players[ap]!.hand).toContain(b);
  });

  it("Citadel Siege (Dragons): at the beginning of combat on each opponent's turn, tap target creature that player controls", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, citadel);
    s0.objects[c]!.chosen = { anchor: "Dragons" };
    const other = next(s0, ap);
    const theirs = putOnBattlefield(s0, other, bear());
    putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "beginCombat", other);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const specs = (s.pending as { specs: { controller?: string }[] }).specs;
    expect(specs).toHaveLength(1);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] });
    s = settle(s);
    expect(s.objects[theirs]!.tapped).toBe(true);
  });
});

describe("Bigger on the Inside", () => {
  /** A land of `pid`'s enchanted with Bigger on the Inside, and the index of the granted ability. */
  function enchanted(s: GameState, pid: PlayerId) {
    const land = s.battlefield.find((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    const aura = putOnBattlefield(s, pid, bigger);
    s.objects[aura]!.attachedTo = land;
    const index = abilitiesOf(s, s.objects[land]!).activated.findIndex((a) => /Target player adds/.test(a.body.text));
    expect(index).toBeGreaterThanOrEqual(0);
    return { land, index };
  }
  function activateFor(s: GameState, pid: PlayerId, land: string, index: number, who: PlayerId) {
    const plan = planActivate(s, pid, land, index, [{ kind: "player", id: who } as TargetChoice]);
    expect(plan).not.toBeNull();
    for (const a of plan!) s = act(s, a);
    return settle(s);
  }

  it("the enchanted land's {T} ability uses the stack (it has a target, CR 605.1a): you add two mana of one color", () => {
    const { s: s0, ap } = setup([]);
    const { land, index } = enchanted(s0, ap);
    expect(abilitiesOf(s0, s0.objects[land]!).activated[index]!.body.targets).toHaveLength(1);
    let s = activateFor(s0, ap, land, index, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    expect(pool(s, ap).R).toBe(2);
    expect(s.objects[land]!.tapped).toBe(true);
  });

  it("the next spell they cast this turn has cascade: only the first, and only theirs", () => {
    const { s: s0, ap, ids } = setup([ogre, ogre]);
    const { land, index } = enchanted(s0, ap);
    s0.cards[sprite.oracleId] = sprite;
    const top = putOnBattlefield(s0, ap, sprite);
    moveObject(s0, top, "library");
    s0.players[ap]!.library.splice(s0.players[ap]!.library.indexOf(top), 1);
    s0.players[ap]!.library.unshift(top);
    let s = activateFor(s0, ap, land, index, ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Green" }));
    const plan = planCast(s, ap, ids[0]!);
    for (const a of plan!) s = act(s, a);
    // Cascade triggers as the Ogre is cast and resolves first: the Sprite (mana value 1 < 4).
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: top });
  });

  it("a target opponent adds the mana and chooses its color; your own next spell doesn't cascade", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    const { land, index } = enchanted(s0, ap);
    const other = next(s0, ap);
    let s = activateFor(s0, ap, land, index, other);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color", player: other });
    s = settle(act(s, { type: "chooseOption", player: other, choice: "Blue" }));
    expect(pool(s, other).U).toBe(2);
    expect(pool(s, ap).U).toBe(0);
    expect(s.nextCast).toEqual([expect.objectContaining({ controller: other, cascade: true })]);
    const plan = planCast(s, ap, ids[0]!);
    for (const a of plan!) s = act(s, a);
    expect(s.triggerQueue.length).toBe(0);
  });
});

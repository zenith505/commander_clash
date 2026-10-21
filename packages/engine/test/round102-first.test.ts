// Round 102: Vigor (a +1/+1 counter for each 1 damage prevented, CR 615.5), Wheel of Misfortune and Menacing Ogre
// (numbers chosen secretly, revealed at once), Conqueror's Flail (opponents can't cast spells during your turn while
// it's attached), Full Throttle ("at the beginning of each combat this turn"), Baral ("whenever a spell or ability you
// control counters a spell"), Laelia ("one or more cards are put into exile from your library and/or your graveyard").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const vigor = card("Vigor", "Creature — Elemental Incarnation", "{3}{G}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nIf damage would be dealt to another creature you control, prevent that damage. Put a +1/+1 counter on that creature for each 1 damage prevented this way.\nWhen Vigor is put into a graveyard from anywhere, shuffle it into its owner's library." });
const wheel = card("Wheel of Misfortune", "Sorcery", "{2}{R}", { oracleText: "Each player secretly chooses a number 0 or greater, then all players reveal those numbers simultaneously and determine the highest and lowest numbers revealed this way. Wheel of Misfortune deals damage equal to the highest number to each player who chose that number. Each player who didn't choose the lowest number discards their hand, then draws seven cards." });
const ogre = card("Menacing Ogre", "Creature — Ogre", "{3}{R}{R}", { power: "3", toughness: "3", keywords: ["Haste", "Trample"], oracleText: "Trample, haste\nWhen this creature enters, each player secretly chooses a number. Then those numbers are revealed. Each player with the highest number loses that much life. If you are one of those players, put two +1/+1 counters on this creature." });
const flail = card("Conqueror's Flail", "Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1 for each color among permanents you control.\nAs long as this Equipment is attached to a creature, your opponents can't cast spells during your turn.\nEquip {2}" });
const throttle = card("Full Throttle", "Sorcery", "{4}{R}{R}", { oracleText: "After this main phase, there are two additional combat phases.\nAt the beginning of each combat this turn, untap all creatures that attacked this turn." });
const baral = card("Baral, Chief of Compliance", "Legendary Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "3", oracleText: "Instant and sorcery spells you cast cost {1} less to cast.\nWhenever a spell or ability you control counters a spell, you may draw a card. If you do, discard a card." });
const laelia = card("Laelia, the Blade Reforged", "Legendary Creature — Spirit Warrior", "{2}{R}", { power: "2", toughness: "2", keywords: ["Haste"], oracleText: "Haste\nWhenever Laelia attacks, exile the top card of your library. You may play that card this turn.\nWhenever one or more cards are put into exile from your library and/or your graveyard, put a +1/+1 counter on Laelia." });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const bog = card("Bojuka Bog", "Land", "", { oracleText: "This land enters tapped.\nWhen this land enters, exile target player's graveyard.\n{T}: Add {B}." });
const mill = card("Mind Sculpt", "Sorcery", "{1}{U}", { oracleText: "Target opponent mills seven cards." });
const fireExile = card("Exile Two", "Sorcery", "{1}", { oracleText: "Exile the top two cards of your library." });

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = pass(s);
  return s;
};
const cast = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3]) => {
  const plan = planCast(s, pid, id, targets);
  if (!plan) throw new Error("can't cast");
  return plan.reduce((x, a) => act(x, a), s);
};
/** Put a card of `pid`'s into their hand, made for the test. */
const toHand = (s: GameState, pid: PlayerId, d: Parameters<typeof putOnBattlefield>[2]) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("round 102: first cards", () => {
  it("parse", () => {
    for (const c of [vigor, wheel, ogre, flail, throttle, baral, laelia]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Vigor: damage to another creature you control is prevented and becomes +1/+1 counters; Vigor itself and others' creatures take it", () => {
    const { s: s0, ap, opp, ids } = setup([bolt, bolt, bolt]);
    const v = putOnBattlefield(s0, ap, vigor);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.players[ap]!.manaPool.R = 3;
    let s = settle(cast(s0, ap, ids[0]!, [target(mine)]));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.damage).toBe(0);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, mine)).toBe("5/5");
    s = settle(cast(s, ap, ids[1]!, [target(v)]));
    expect(s.objects[v]!.damage).toBe(3);
    s = settle(cast(s, ap, ids[2]!, [target(theirs)]));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Wheel of Misfortune: the highest number deals that much to each who chose it; all but the lowest wheel", () => {
    const { s: s0, ap, ids } = setup([wheel]);
    s0.players[ap]!.manaPool.R = 3;
    const order = [0, 1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!);
    const hands = order.map((p) => [...s0.players[p]!.hand].filter((id) => id !== ids[0]));
    const picks = [0, 3, 3, 1];
    let s = cast(s0, ap, ids[0]!);
    s = settle(s);
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "secretNumber", player: order[i] });
      // The others' numbers aren't shown before everyone has chosen.
      expect(s.log.slice(-3).map((l) => l.text).join(" ")).not.toMatch(/chooses \d/);
      s = act(s, { type: "chooseOption", player: order[i]!, choice: String(picks[i]) });
    }
    s = settle(s);
    expect(order.map((p) => s.players[p]!.life)).toEqual([40, 37, 37, 40]);
    // The lowest (0) keeps their hand; the others discarded theirs and drew seven.
    expect(hands[0]!.every((id) => s.objects[id]!.zone === "hand")).toBe(true);
    for (const i of [1, 2, 3]) {
      expect(hands[i]!.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
      expect(s.players[order[i]!]!.hand).toHaveLength(7);
    }
    expect(() => act(s0, { type: "chooseOption", player: ap, choice: "1" })).toThrow();
  });

  it("Wheel of Misfortune: everyone choosing the same number takes the damage and keeps their hand; a bot answers", () => {
    const { s: s0, ap, ids } = setup([wheel]);
    s0.players[ap]!.manaPool.R = 3;
    let s = settle(cast(s0, ap, ids[0]!));
    const hand = [...s.players[ap]!.hand];
    for (let i = 0; i < 4; i++) s = act(s, { type: "chooseOption", player: waitingOn(s)!, choice: "2" });
    s = settle(s);
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual([38, 38, 38, 38]);
    expect(s.players[ap]!.hand).toEqual(hand);
    // A number above the range is refused; a bot picks a number.
    let b = settle(cast(s0, ap, ids[0]!));
    expect(() => act(b, { type: "chooseOption", player: ap, choice: "1000" })).toThrow();
    expect(() => act(b, { type: "chooseOption", player: ap, choice: "-1" })).toThrow();
    b = act(b, { type: "chooseOption", player: ap, choice: "5" });
    const [a] = botActions(b, waitingOn(b)!);
    expect(a).toMatchObject({ type: "chooseOption" });
  });

  it("Menacing Ogre: each player with the highest number loses that much life; counters when you're one of them", () => {
    for (const mine of [4, 1]) {
      const { s: s0, ap, ids } = setup([ogre]);
      s0.players[ap]!.manaPool.R = 5;
      let s = settle(cast(s0, ap, ids[0]!));
      const picks = [mine, 4, 0, 2];
      for (let i = 0; i < 4; i++) s = act(s, { type: "chooseOption", player: waitingOn(s)!, choice: String(picks[i]) });
      s = settle(s);
      const order = [0, 1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
      expect(order.map((p) => s.players[p]!.life)).toEqual(mine === 4 ? [36, 36, 40, 40] : [40, 36, 40, 40]);
      expect(pt(s, ids[0]!)).toBe(mine === 4 ? "5/5" : "3/3");
    }
  });

  it("Conqueror's Flail: while it's attached, opponents can't cast spells during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, flail);
    const b = putOnBattlefield(s0, ap, bear());
    const theirBolt = toHand(s0, opp, bolt);
    expect(castProblem(s0, opp, theirBolt)).not.toMatch(/can't cast spells during/);
    s0.objects[f]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect(castProblem(s0, opp, theirBolt)).toMatch(/can't cast spells during/);
    // +1/+1 for each color among permanents you control: the bear is green.
    expect(pt(s0, b)).toBe("3/3");
  });

  it("Full Throttle: two more combat phases, and each beginning of combat untaps the creatures that attacked", () => {
    const { s: s0, ap, opp, ids } = setup([throttle]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.manaPool.R = 6;
    let s = settle(cast(s0, ap, ids[0]!));
    let attacks = 0;
    for (let i = 0; i < 600 && s.step !== "end"; i++) {
      const pend = s.pending;
      if (pend?.kind === "declareAttackers") {
        // Untapped at the beginning of each combat after the first.
        expect(s.objects[b]!.tapped).toBe(false);
        s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
        attacks++;
      } else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pend.player, blocks: [] });
      else s = pass(s);
    }
    expect(attacks).toBe(3);
    expect(s.players[opp]!.life).toBe(34);
  });

  it("Baral: countering a spell lets you draw, then discard; instants and sorceries cost {1} less", () => {
    const { s: s0, ap, opp, ids } = setup([counterspell, divination]);
    putOnBattlefield(s0, ap, baral);
    const theirs = toHand(s0, opp, bolt);
    s0.players[opp]!.manaPool.R = 1;
    s0.priority = opp;
    let s = cast(s0, opp, theirs, [{ kind: "player", id: ap }]);
    while (waitingOn(s) !== ap) s = pass(s);
    s.players[ap]!.manaPool.U = 2;
    s = cast(s, ap, ids[0]!, [{ kind: "stack", id: s.stack[0]!.id }]);
    s = settle(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
    expect(s.players[ap]!.hand.length).toBe(hand);
    // Divination for {1}{U}: two mana pays for it.
    s = settle(s);
    s.players[ap]!.manaPool.U = 2;
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
  });

  it("Laelia: once for each event exiling cards from your library or graveyard, not an opponent's", () => {
    const { s: s0, ap, opp, ids } = setup([fireExile, mill, bog]);
    const l = putOnBattlefield(s0, ap, laelia);
    s0.players[ap]!.manaPool.U = 3;
    // Two cards in one event: one counter.
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[l]!.counters["+1/+1"]).toBe(1);
    // An opponent's graveyard exiled: no counter.
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    const yard = s.players[opp]!.graveyard.length;
    expect(yard).toBeGreaterThan(0);
    expect(s.objects[l]!.counters["+1/+1"]).toBe(1);
    // Our own graveyard exiled by Bojuka Bog: a counter.
    const plan = planCast(s, ap, ids[2]!);
    expect(plan).toBeNull(); // a land is played, not cast
    s = act(s, { type: "playLand", player: ap, objectId: ids[2]! });
    while (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }] });
    s = settle(s);
    expect(s.players[ap]!.graveyard).toHaveLength(0);
    expect(s.objects[l]!.counters["+1/+1"]).toBe(2);
  });
});

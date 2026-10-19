// Emblems (CR 114): "[Player] gets an emblem with [ability]" puts an emblem into the command zone, owned and controlled
// by that player (114.2), with no characteristics but those abilities (114.3), which work in the command zone (114.4).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, mountain, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { createEmblem } from "../src/emblems";
import { playerLoses } from "../src/game";
import { applyAction, botActions, characteristics, isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const pw = (name: string, subtype: string, loyalty: string, oracleText: string, cost = "{4}{W}{W}") => card(name, `Legendary Planeswalker — ${subtype}`, cost, { loyalty, oracleText });

// Real oracle text (Scryfall).
const elspeth = pw("Elspeth, Sun's Champion", "Elspeth", "4", '+1: Create three 1/1 white Soldier creature tokens.\n−3: Destroy all creatures with power 4 or greater.\n−7: You get an emblem with "Creatures you control get +2/+2 and have flying."');
const inferno = pw("Chandra, Awakened Inferno", "Chandra", "6", 'This spell can\'t be countered.\n+2: Each opponent gets an emblem with "At the beginning of your upkeep, this emblem deals 1 damage to you."\n−3: Chandra, Awakened Inferno deals 3 damage to each non-Elemental creature.\n−X: Chandra, Awakened Inferno deals X damage to target creature or planeswalker. If a permanent dealt damage this way would die this turn, exile it instead.', "{4}{R}{R}");
const koth = pw("Koth, Fire of Resistance", "Koth", "4", "+2: Search your library for a basic Mountain card, reveal it, put it into your hand, then shuffle.\n−3: Koth deals damage equal to the number of Mountains you control to target creature.\n−7: You get an emblem with \"Whenever a Mountain you control enters, this emblem deals 4 damage to any target.\"", "{2}{R}{R}");
const obNix = pw("Ob Nixilis Reignited", "Nixilis", "5", "+1: You draw a card and you lose 1 life.\n−3: Destroy target creature.\n−8: Target opponent gets an emblem with \"Whenever a player draws a card, you lose 2 life.\"", "{3}{B}{B}");
const vraska = pw("Vraska, Golgari Queen", "Vraska", "4", "+2: You may sacrifice another permanent. If you do, you gain 1 life and draw a card.\n−3: Destroy target nonland permanent with mana value 3 or less.\n−9: You get an emblem with \"Whenever a creature you control deals combat damage to a player, that player loses the game.\"", "{2}{B}{G}");
const lastHope = pw("Liliana, the Last Hope", "Liliana", "3", "+1: Up to one target creature gets -2/-1 until your next turn.\n−2: Mill two cards, then you may return a creature card from your graveyard to your hand.\n−7: You get an emblem with \"At the beginning of your end step, create X 2/2 black Zombie creature tokens, where X is two plus the number of Zombies you control.\"", "{1}{B}{B}");
const apex = pw("Garruk, Apex Predator", "Garruk", "5", "+1: Destroy another target planeswalker.\n+1: Create a 3/3 black Beast creature token with deathtouch.\n−3: Destroy target creature. You gain life equal to its toughness.\n−8: Target opponent gets an emblem with \"Whenever a creature attacks you, it gets +5/+5 and gains trample until end of turn.\"", "{5}{B}{G}");
const kaito = pw("Kaito, Cunning Infiltrator", "Kaito", "3", "Whenever a creature you control deals combat damage to a player, put a loyalty counter on Kaito.\n+1: Up to one target creature you control can't be blocked this turn.\n−2: Draw a card, then discard a card.\n−9: You get an emblem with \"Whenever a player casts a spell, you create a 2/1 blue Ninja creature token.\"", "{2}{U}{U}");
const zombie = card("Walking Corpse", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });

/** Pass priority until the stack is empty, answering nothing. */
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.resolving) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
function walker(s: GameState, pid: PlayerId, d: CardDef, loyalty: number) {
  const id = putOnBattlefield(s, pid, d);
  s.objects[id]!.counters.loyalty = loyalty;
  return id;
}
const emblemsOf = (s: GameState, pid: PlayerId) => (s.emblems ?? []).filter((id) => s.objects[id]!.owner === pid);
const ultimate = (d: CardDef) => d.oracleText.split("\n").filter((l) => /^[+−0]/.test(l)).findIndex((l) => l.includes("emblem"));

describe("emblems (CR 114)", () => {
  it("compile", () => {
    supported(elspeth, inferno, koth, obNix, vraska, lastHope, apex, kaito);
  });

  it("an emblem is in the command zone, owned and controlled by its player, with no characteristics but its abilities (CR 114.2-3)", () => {
    const { s: s0, ap } = setup([]);
    const e = walker(s0, ap, elspeth, 7);
    const s = settle(activate(s0, ap, e, ultimate(elspeth)));
    const [em] = emblemsOf(s, ap);
    expect(em).toBeDefined();
    const o = s.objects[em!]!;
    expect(o).toMatchObject({ zone: "command", owner: ap, controller: ap, emblem: true });
    const c = characteristics(s, o);
    expect(c.types).toEqual([]);
    expect(c.colors).toEqual([]);
    expect(s.players[ap]!.command).not.toContain(em); // not one of the commanders
    // The planeswalker paid 7 loyalty and died; the emblem stays (CR 114.4).
    expect(s.battlefield).not.toContain(e);
  });

  it("Elspeth's emblem: creatures you control get +2/+2 and have flying, also ones that enter later; not others' (CR 611.3a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const e = walker(s0, ap, elspeth, 8);
    let s = settle(activate(s0, ap, e, ultimate(elspeth)));
    expect(pt(s, mine)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[mine]!, "Flying")).toBe(true);
    expect(pt(s, theirs)).toBe("2/2");
    const later = putOnBattlefield(s, ap, bear());
    expect(pt(s, later)).toBe("4/4");
    // Elspeth is still there with 1 loyalty: the emblem doesn't depend on her.
    expect(s.objects[e]!.counters.loyalty).toBe(1);
  });

  it("Chandra, Awakened Inferno: each opponent gets an emblem that deals 1 damage to them at the beginning of their upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = walker(s0, ap, inferno, 6);
    let s = settle(activate(s0, ap, c, 0));
    const opps = s.turnOrder.filter((p) => p !== ap);
    for (const p of opps) expect(emblemsOf(s, p)).toHaveLength(1);
    expect(emblemsOf(s, ap)).toHaveLength(0);
    const life = s.players[opp]!.life;
    s = passUntil(s, "draw", opp);
    expect(s.players[opp]!.life).toBe(life - 1);
    // Only on its owner's upkeep: the others still have their life.
    for (const p of opps.filter((p) => p !== opp)) expect(s.players[p]!.life).toBe(40);
    expect(s.log.some((l) => /Chandra, Awakened Inferno emblem deals 1 damage/.test(l.text))).toBe(true);
  });

  it("Koth's emblem deals 4 damage to any target whenever a Mountain you control enters", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = walker(s0, ap, koth, 7);
    let s = settle(activate(s0, ap, k, ultimate(koth)));
    const life = s.players[opp]!.life;
    s.players[ap]!.landsPlayedThisTurn = 0;
    const m = putOnBattlefield(s, ap, mountain);
    s.battlefield.splice(s.battlefield.indexOf(m), 1);
    s.objects[m]!.zone = "hand";
    s.players[ap]!.hand.push(m);
    s = act(s, { type: "playLand", player: ap, objectId: m });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("Ob Nixilis Reignited's emblem goes to the target opponent: whenever any player draws, that opponent loses 2 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = walker(s0, ap, obNix, 8);
    let s = activate(s0, ap, o, ultimate(obNix), [{ kind: "player", id: opp }]);
    s = settle(s);
    expect(emblemsOf(s, opp)).toHaveLength(1);
    const life = s.players[opp]!.life;
    // The opponent draws in their draw step; the next player too.
    s = passUntil(s, "main1", opp);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.life).toBe(40);
  });

  it("Vraska's emblem: a creature you control dealing combat damage to a player makes that player lose the game", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = walker(s0, ap, vraska, 9);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(activate(s0, ap, v, ultimate(vraska)));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 60 && !s.players[opp]!.lost; i++) {
      const p = waitingOn(s)!;
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: p, blocks: [] }) : act(s, { type: "passPriority", player: p });
    }
    expect(s.players[opp]!.lost).toBe(true);
  });

  it("Liliana, the Last Hope's emblem: at the beginning of your end step, X Zombies where X is two plus the Zombies you control", () => {
    const { s: s0, ap } = setup([]);
    const l = walker(s0, ap, lastHope, 7);
    putOnBattlefield(s0, ap, zombie);
    let s = settle(activate(s0, ap, l, ultimate(lastHope)));
    const zombies = (s: GameState) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Zombie") && s.objects[id]!.controller === ap).length;
    expect(zombies(s)).toBe(1);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(zombies(s)).toBe(4);
  });

  it("Garruk, Apex Predator's emblem on an opponent: a creature attacking that player gets +5/+5 and trample", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = walker(s0, ap, apex, 8);
    const b = putOnBattlefield(s0, ap, bear());
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const b2 = putOnBattlefield(s0, ap, bear());
    let s = settle(activate(s0, ap, g, 3, [{ kind: "player", id: opp }]));
    expect(emblemsOf(s, opp)).toHaveLength(1);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }, { attacker: b2, defender: other }] });
    s = settle(s);
    expect(pt(s, b)).toBe("7/7");
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
    expect(pt(s, b2)).toBe("2/2");
  });

  it("Kaito's emblem: whenever any player casts a spell, its owner creates a 2/1 Ninja", () => {
    const { s: s0, ap } = setup([bear()]);
    const k = walker(s0, ap, kaito, 9);
    let s = settle(activate(s0, ap, k, ultimate(kaito)));
    const hand = s.players[ap]!.hand[0]!;
    s = settle(cast(s, ap, hand));
    const ninjas = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Ninja"));
    expect(ninjas).toHaveLength(1);
    expect(pt(s, ninjas[0]!)).toBe("2/1");
    expect(s.objects[ninjas[0]!]!.controller).toBe(ap);
  });

  it("a player who leaves the game takes their emblems with them (CR 800.4a)", () => {
    const { s: s0, ap, opp } = setup([bear()]);
    // The opponent has Kaito's emblem, then leaves the game.
    createEmblem(s0, opp, ["Whenever a player casts a spell, you create a 2/1 blue Ninja creature token."], "Kaito, Cunning Infiltrator");
    playerLoses(s0, opp, "test");
    let s = s0;
    expect(s.players[opp]!.lost).toBe(true);
    s = settle(cast(s, ap, s.players[ap]!.hand[0]!));
    expect(s.log.some((l) => /emblem's ability triggers/.test(l.text))).toBe(false);
    expect(Object.values(s.objects).some((o) => o.zone === "battlefield" && characteristics(s, o).subtypes.includes("Ninja"))).toBe(false);
  });

  it("bots use an emblem ultimate when they can", () => {
    const { s: s0, ap } = setup([]);
    walker(s0, ap, elspeth, 7);
    putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.isBot = true;
    // Nothing else to do first: bots cast their spells before using loyalty abilities.
    for (const id of s0.players[ap]!.hand) s0.objects[id]!.zone = "library";
    s0.players[ap]!.library.push(...s0.players[ap]!.hand);
    s0.players[ap]!.hand = [];
    let s = s0;
    for (let i = 0; i < 20 && !emblemsOf(s, ap).length; i++) {
      const p = waitingOn(s)!;
      const acts = botActions(s, p);
      if (!acts.length) break;
      for (const a of acts) s = applyAction(s, a);
    }
    expect(emblemsOf(s, ap)).toHaveLength(1);
  });

  it("an emblem's target is chosen as the trigger goes on the stack: Koth's emblem with the opponent's creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = walker(s0, ap, koth, 7);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = settle(activate(s0, ap, k, ultimate(koth)));
    const m = putOnBattlefield(s, ap, mountain);
    s.battlefield.splice(s.battlefield.indexOf(m), 1);
    s.objects[m]!.zone = "hand";
    s.players[ap]!.hand.push(m);
    s = act(s, { type: "playLand", player: ap, objectId: m });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] }));
    expect(s.players[opp]!.graveyard.length).toBeGreaterThan(0);
  });
});

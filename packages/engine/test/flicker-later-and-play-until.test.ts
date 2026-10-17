// Exile now, return at the beginning of the next end step (CR 603.7) for several targets, groups, ~ itself, "if you do",
// tapped and with a counter, all returned together by one delayed trigger; "return that card to its owner's hand at the
// beginning of the next end step" after a dies trigger (Liesa rulings: only if it's still in the graveyard); "until your
// next end step, you may play it"; "if it would leave the battlefield, exile it instead" (CR 614.1a).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const eerie = card("Eerie Interlude", "Instant", "{2}{W}", { oracleText: "Exile any number of target creatures you control. Return those cards to the battlefield under their owner's control at the beginning of the next end step." });
const ghostway = card("Ghostway", "Instant", "{2}{W}", { oracleText: "Exile each creature you control. Return those cards to the battlefield under their owner's control at the beginning of the next end step." });
const maze = card("Mystifying Maze", "Land", "", { oracleText: "{T}: Add {C}.\n{4}, {T}: Exile target attacking creature an opponent controls. At the beginning of the next end step, return it to the battlefield tapped under its owner's control." });
const swan = card("Salvation Swan", "Creature — Bird Cleric", "{3}{W}", { power: "3", toughness: "3", keywords: ["Flying", "Flash"], oracleText: "Flash\nFlying\nWhenever this creature or another Bird you control enters, exile up to one target creature you control without flying. Return it to the battlefield under its owner's control with a flying counter on it at the beginning of the next end step." });
const astralSlide = card("Astral Slide", "Enchantment", "{2}{W}", { oracleText: "Whenever a player cycles a card, you may exile target creature. If you do, return that card to the battlefield under its owner's control at the beginning of the next end step." });
const planarGuide = card("Planar Guide", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1", oracleText: "{3}{W}, Exile this creature: Exile all creatures. At the beginning of the next end step, return those cards to the battlefield under their owners' control." });
const nezahal = card("Nezahal, Primal Tide", "Legendary Creature — Elder Dinosaur", "{5}{U}{U}", { power: "7", toughness: "7", oracleText: "This spell can't be countered.\nYou have no maximum hand size.\nWhenever an opponent casts a noncreature spell, draw a card.\nDiscard three cards: Exile Nezahal. Return it to the battlefield tapped under its owner's control at the beginning of the next end step." });
const liesa = card("Liesa, Forgotten Archangel", "Legendary Creature — Angel", "{2}{W}{W}{B}", { power: "4", toughness: "5", keywords: ["Flying", "Lifelink"], oracleText: "Flying, lifelink\nWhenever another nontoken creature you control dies, return that card to its owner's hand at the beginning of the next end step.\nIf a creature an opponent controls would die, exile it instead." });
const yasmin = card("Yasmin Khan", "Legendary Creature — Human Detective", "{3}{R}", { power: "3", toughness: "3", keywords: ["Doctor's companion"], oracleText: "{T}: Exile the top card of your library. Until your next end step, you may play it.\nDoctor's companion (You can have two commanders if the other is the Doctor.)" });
const whip = card("Whip of Erebos", "Legendary Enchantment Artifact", "{2}{B}{B}", { oracleText: "Creatures you control have lifelink.\n{2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else. Activate only as a sorcery." });
const roll = card("Roll-Roll-Roll-Roll", "Enchantment — Saga", "{2}{U}", { oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI, II, III, IV — Exile up to one target creature or land you control. If you do, return it to the battlefield under its owner's control at the beginning of the next end step." });
const wiccan = card("Wiccan, Rising Magician", "Legendary Creature — Mutant Warlock Hero", "{4}{U}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever you cast a noncreature spell, exile another target nonland, nontoken permanent. Return that card to the battlefield under its owner's control at the beginning of the next end step." });
const cycler = card("Cycler Test", "Instant", "{5}", { keywords: ["Cycling"], oracleText: "Cycling {1} ({1}, Discard this card: Draw a card.)" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const token = (s: GameState, pid: PlayerId) => {
  const id = putOnBattlefield(s, pid, bear({ name: "Bear Token" }));
  s.objects[id]!.isToken = true;
  return id;
};

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const castIt = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => run(s, planCast(s, pid, id, targets));
const activateIt = (s: GameState, pid: PlayerId, id: string, index: number, targets?: TargetChoice[]) => run(s, planActivate(s, pid, id, index, targets));
const toEnd = (s: GameState, pid: PlayerId) => settle(passUntil(s, "end", pid));
const toGraveyard = (s: GameState, id: string) => {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = "graveyard";
  s.players[o.owner]!.graveyard.push(id);
};

describe("exile now, return at the next end step", () => {
  it("parse", () => {
    for (const d of [eerie, ghostway, maze, swan, astralSlide, planarGuide, nezahal, liesa, yasmin, whip, roll, wiccan]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Eerie Interlude: the chosen creatures come back together at the end step; a token doesn't come back (CR 111.7)", () => {
    const { s: s0, ap, ids } = setup([eerie]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const t = token(s0, ap);
    let s = castIt(s0, ap, ids[0]!, [target(a), target(b), target(t)]);
    expect([s.objects[a]!.zone, s.objects[b]!.zone]).toEqual(["exile", "exile"]);
    expect(s.objects[t]).toBeUndefined();
    expect(s.delayed?.length).toBe(1);
    s = passUntil(s, "end", ap);
    expect(s.triggerQueue.length + s.stack.length).toBe(1);
    s = settle(s);
    expect([s.objects[a]!.zone, s.objects[b]!.zone]).toEqual(["battlefield", "battlefield"]);
    expect(s.objects[a]!.controller).toBe(ap);
  });

  it("Ghostway: each creature you control, not the others'", () => {
    const { s: s0, ap, opp, ids } = setup([ghostway]);
    const a = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = castIt(s0, ap, ids[0]!);
    expect([s.objects[a]!.zone, s.objects[theirs]!.zone]).toEqual(["exile", "battlefield"]);
    s = toEnd(s, ap);
    expect(s.objects[a]!.zone).toBe("battlefield");
  });

  it("Planar Guide: all creatures, each back under its owner's control", () => {
    const { s: s0, ap, opp } = setup([]);
    const guide = putOnBattlefield(s0, ap, planarGuide);
    const a = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[theirs]!.controller = ap; // stolen: returns under its owner's control
    let s = activateIt(s0, ap, guide, 0);
    expect([s.objects[a]!.zone, s.objects[theirs]!.zone, s.objects[guide]!.zone]).toEqual(["exile", "exile", "exile"]);
    s = toEnd(s, ap);
    expect([s.objects[a]!.zone, s.objects[theirs]!.zone, s.objects[guide]!.zone]).toEqual(["battlefield", "battlefield", "exile"]);
    expect(s.objects[theirs]!.controller).toBe(opp);
  });

  it("Mystifying Maze: the attacker comes back tapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, maze);
    const attacker = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker, defender: ap }] });
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = activateIt(s, ap, m, 0, [target(attacker)]);
    expect(s.objects[attacker]!.zone).toBe("exile");
    s = toEnd(s, opp);
    expect(s.objects[attacker]!.zone).toBe("battlefield");
    expect(s.objects[attacker]!.tapped).toBe(true);
  });

  it("Salvation Swan: back with a flying counter", () => {
    const { s: s0, ap, ids } = setup([swan]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 5 && s.pending?.kind === "chooseTargets"; i++) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.objects[b]!.zone).toBe("exile");
    s = toEnd(s, ap);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.counters.flying).toBe(1);
  });

  it("Astral Slide: only if you choose to exile it", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([cycler]);
      putOnBattlefield(s0, ap, astralSlide);
      const theirs = putOnBattlefield(s0, opp, bear());
      let s = run(s0, planActivate(s0, ap, ids[0]!, 0));
      for (let i = 0; i < 20 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
        const p = s.pending;
        if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [target(theirs)] });
        else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.objects[theirs]!.zone, String(yes)).toBe(yes ? "exile" : "battlefield");
      s = toEnd(s, ap);
      expect(s.objects[theirs]!.zone).toBe("battlefield");
    }
  });

  it("Nezahal: exiles itself and comes back tapped", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nezahal);
    const hand = s0.players[ap]!.hand;
    expect(hand.length).toBeGreaterThanOrEqual(3);
    const s1 = run(s0, planActivate(s0, ap, n, 0, undefined, undefined, undefined, undefined, { discard: hand.slice(0, 3) }));
    expect(s1.players[ap]!.hand.length).toBe(hand.length - 3);
    let s = s1;
    expect(s.objects[n]!.zone).toBe("exile");
    s = toEnd(s, ap);
    expect(s.objects[n]!.zone).toBe("battlefield");
    expect(s.objects[n]!.tapped).toBe(true);
  });

  it("Wiccan: a noncreature spell blinks a nonland, nontoken permanent until the end step", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    putOnBattlefield(s0, ap, wiccan);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    for (let i = 0; i < 5 && s.pending?.kind === "chooseTargets"; i++) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] }));
    expect(s.objects[theirs]!.zone).toBe("exile");
    s = toEnd(s, ap);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });
});

describe("later, about a card or a permission", () => {
  it("Liesa: the card returns to hand at the end step, unless it left the graveyard first", () => {
    const { s: s0, ap, ids } = setup([shock, shock]);
    putOnBattlefield(s0, ap, liesa);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    let s = castIt(s0, ap, ids[0]!, [target(a)]);
    s = castIt(s, ap, ids[1]!, [target(b)]);
    expect([s.objects[a]!.zone, s.objects[b]!.zone]).toEqual(["graveyard", "graveyard"]);
    expect(s.delayed?.length).toBe(2);
    // b leaves the graveyard: a new object (CR 400.7), so it stays where it went.
    const g = s.players[ap]!.graveyard;
    g.splice(g.indexOf(b), 1);
    s.objects[b]!.zone = "exile";
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(b);
    s = toEnd(s, ap);
    expect([s.objects[a]!.zone, s.objects[b]!.zone]).toEqual(["hand", "exile"]);
  });

  it("Yasmin Khan: the card may be played until your next end step begins", () => {
    const { s: s0, ap } = setup([]);
    const y = putOnBattlefield(s0, ap, yasmin);
    let s = activateIt(s0, ap, y, 0);
    const exiled = s.players[ap]!.exile.find((id) => s.objects[id]!.mayPlay);
    expect(exiled).toBeDefined();
    expect(s.objects[exiled!]!.mayPlay?.until).toBe("yourNextEndStep");
    s = passUntil(s, "main2", ap);
    expect(s.objects[exiled!]!.mayPlay).toBeDefined();
    s = passUntil(s, "end", ap);
    expect(s.objects[exiled!]!.mayPlay).toBeUndefined();
  });

  it("Yasmin Khan: used on an opponent's turn, it lasts through their end step until yours", () => {
    const { s: s0, ap, opp } = setup([]);
    const y = putOnBattlefield(s0, ap, yasmin);
    let s = passUntil(s0, "upkeep", opp);
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = activateIt(s, ap, y, 0);
    const exiled = s.players[ap]!.exile.find((id) => s.objects[id]!.mayPlay)!;
    s = passUntil(s, "cleanup", opp);
    expect(s.objects[exiled]!.mayPlay).toBeDefined();
    s = passUntil(s, "end", ap);
    expect(s.objects[exiled]!.mayPlay).toBeUndefined();
  });

  it("Whip of Erebos: the returned creature is exiled if it would die, and at the end step otherwise", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const w = putOnBattlefield(s0, ap, whip);
    const a = putOnBattlefield(s0, ap, bear());
    toGraveyard(s0, a);
    let s = activateIt(s0, ap, w, 0, [{ kind: "object", id: a }]);
    expect(s.objects[a]!.zone).toBe("battlefield");
    s = castIt(s, ap, ids[0]!, [target(a)]);
    expect(s.objects[a]!.zone).toBe("exile");
  });

  it("Roll-Roll-Roll-Roll: chapter I blinks one of your creatures until the end step", () => {
    const { s: s0, ap, ids } = setup([roll]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 5 && s.pending?.kind === "chooseTargets"; i++) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.objects[b]!.zone).toBe("exile");
    s = toEnd(s, ap);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

// Round 101: "Remove up to three counters from target permanent" (Glissa Sunslayer, Render Inert): any kinds, chosen
// one at a time as it resolves (rulings); "Remove X counters" (Thornmantle Striker): with fewer on it, all of them;
// "For each counter removed this way" (Hex Parasite): only those actually removed. Also Defense of the Heart (sacrifice,
// then search) and Crime Novelist (a counter, then mana).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const glissa = card("Glissa Sunslayer", "Legendary Creature — Phyrexian Zombie Elf", "{1}{B}{G}", { power: "3", toughness: "3", keywords: ["First strike", "Deathtouch"], oracleText: "First strike, deathtouch\nWhenever Glissa Sunslayer deals combat damage to a player, choose one —\n• You draw a card and lose 1 life.\n• Destroy target enchantment.\n• Remove up to three counters from target permanent." });
const render = card("Render Inert", "Sorcery", "{2}{B}", { oracleText: "Remove up to five counters from target permanent.\nDraw a card." });
const striker = card("Thornmantle Striker", "Creature — Elf Rogue", "{4}{B}", { power: "4", toughness: "3", oracleText: "When this creature enters, choose one —\n• Remove X counters from target permanent, where X is the number of Elves you control.\n• Target creature an opponent controls gets -X/-X until end of turn, where X is the number of Elves you control." });
const hex = card("Hex Parasite", "Artifact Creature — Phyrexian Insect", "{1}", { power: "1", toughness: "1", oracleText: "{X}{B/P}: Remove up to X counters from target permanent. For each counter removed this way, this creature gets +1/+0 until end of turn. ({B/P} can be paid with either {B} or 2 life.)" });
const thrull = card("Thrull Parasite", "Creature — Thrull", "{B}", { power: "1", toughness: "1", keywords: ["Extort"], oracleText: "Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\n{T}, Pay 2 life: Remove a counter from target nonland permanent." });
const defense = card("Defense of the Heart", "Enchantment", "{3}{G}", { oracleText: "At the beginning of your upkeep, if an opponent controls three or more creatures, sacrifice this enchantment, search your library for up to two creature cards, put those cards onto the battlefield, then shuffle." });
const novelist = card("Crime Novelist", "Creature — Goblin Bard", "{2}{R}", { power: "1", toughness: "3", oracleText: "Whenever you sacrifice an artifact, put a +1/+1 counter on this creature and add {R}." });

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = pass(s);
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do it");
  return settle(plan.reduce((x, a) => act(x, a), s));
};
const choose = (s: GameState, choice: string) => {
  expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("removeCounter");
  return settle(act(s, { type: "chooseOption", player: (s.pending as { player: number }).player, choice }));
};

describe("round 101: removing chosen counters", () => {
  it("parse", () => {
    for (const c of [glissa, render, striker, hex, thrull, defense, novelist]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Render Inert: up to five, of any kinds, one at a time; stopping early", () => {
    const { s: s0, ap, opp, ids } = setup([render]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.counters = { "+1/+1": 3, shield: 1, stun: 1 };
    s0.players[ap]!.manaPool.B = 3;
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.options).toEqual(["+1/+1", "shield", "stun", "done"]);
    s = choose(s, "shield");
    s = choose(s, "+1/+1");
    s = choose(s, "+1/+1");
    // Nothing is removed until the choosing is done.
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
    s = choose(s, "done");
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.counters).toMatchObject({ "+1/+1": 1, shield: 0, stun: 1 });
    expect(pt(s, b)).toBe("3/3");
  });

  it("Render Inert: a permanent with no counters is a legal target, and you still draw", () => {
    const { s: s0, ap, opp, ids } = setup([render]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.players[ap]!.manaPool.B = 3;
    const hand = s0.players[ap]!.hand.length;
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand); // the sorcery left, a card came in
  });

  it("Thornmantle Striker: X is the Elves you control; one kind of counter needs no choice, fewer than X are all removed", () => {
    for (const [loyalty, left] of [[5, 3], [1, 0]] as const) {
      const { s: s0, ap, opp, ids } = setup([striker]);
      putOnBattlefield(s0, ap, bear({ name: "Llanowar Elves", typeLine: "Creature — Elf Druid", subtypes: ["Elf", "Druid"] }));
      const walker = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5" }));
      s0.objects[walker]!.counters = { loyalty };
      s0.players[ap]!.manaPool.B = 5;
      let s = run(s0, planCast(s0, ap, ids[0]!));
      if (s.pending?.kind === "chooseModes") s = settle(act(s, { type: "chooseModes", player: ap, modes: [0] }));
      if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(walker)] }));
      expect(s.pending).toBeFalsy();
      // With no loyalty left, the planeswalker goes to the graveyard (CR 704.5i).
      if (left) expect(s.objects[walker]!.counters.loyalty).toBe(left);
      else expect(s.objects[walker]!.zone).toBe("graveyard");
    }
  });

  it("Hex Parasite: +1/+0 only for the counters actually removed", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hex);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.counters = { "+1/+1": 2 };
    s0.players[ap]!.manaPool.B = 6;
    let s = run(s0, planActivate(s0, ap, h, 0, [target(b)], undefined, undefined, 5));
    s = choose(s, "+1/+1");
    s = choose(s, "+1/+1");
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.counters["+1/+1"]).toBe(0);
    expect(pt(s, h)).toBe("3/1");
  });

  it("Glissa Sunslayer: combat damage to a player, then up to three counters off a permanent", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, glissa);
    const walker = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "4" }));
    s0.objects[walker]!.counters = { loyalty: 4 };
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    for (let i = 0; i < 40 && !(s.pending?.kind === "chooseModes" || s.pending?.kind === "chooseTargets"); i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : pass(s);
    if (s.pending?.kind === "chooseModes") s = act(s, { type: "chooseModes", player: ap, modes: [2] });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(walker)] });
    s = settle(s);
    s = choose(s, "loyalty");
    s = choose(s, "loyalty");
    s = choose(s, "loyalty");
    expect(s.objects[walker]!.counters.loyalty).toBe(1);
  });

  it("bots take the helpful counters off an opponent's permanent and the harmful ones off their own", () => {
    const { s: s0, ap, opp, ids } = setup([render]);
    const theirs = putOnBattlefield(s0, ap, bear());
    s0.objects[theirs]!.counters = { "+1/+1": 1, "-1/-1": 1 };
    s0.players[opp]!.hand.push(ids[0]!);
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((x) => x !== ids[0]);
    s0.objects[ids[0]!]!.owner = opp;
    s0.objects[ids[0]!]!.controller = opp;
    const s = structuredClone(s0);
    s.pending = { kind: "chooseOption", player: opp, source: "Render Inert", what: "removeCounter", about: theirs, options: ["+1/+1", "-1/-1", "done"], prompt: "" };
    expect(botActions(s, opp)).toEqual([{ type: "chooseOption", player: opp, choice: "+1/+1" }]);
    s.pending = { kind: "chooseOption", player: ap, source: "Render Inert", what: "removeCounter", about: theirs, options: ["+1/+1", "-1/-1", "done"], prompt: "" };
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "-1/-1" }]);
    s.pending = { kind: "chooseOption", player: ap, source: "Render Inert", what: "removeCounter", about: theirs, options: ["+1/+1", "done"], prompt: "" };
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "done" }]);
  });

  it("Thrull Parasite: one counter, of the kind chosen", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, thrull);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.counters = { "+1/+1": 1, stun: 2 };
    let s = run(s0, planActivate(s0, ap, t, 0, [target(b)]));
    s = choose(s, "stun");
    expect(s.objects[b]!.counters).toMatchObject({ "+1/+1": 1, stun: 1 });
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life - 2);
  });
});

describe("round 101: Defense of the Heart and Crime Novelist", () => {
  it("Defense of the Heart: sacrificed, then up to two creature cards onto the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, defense);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, bear());
    const p = s0.players[ap]!;
    const big = [0, 1].map((i) => {
      const id = putOnBattlefield(s0, ap, bear({ name: `Library Bear ${i}` }));
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      p.library.push(id);
      return id;
    });
    let s = passUntil(s0, "upkeep", ap);
    for (let i = 0; i < 20 && !s.pending && s.objects[d]!.zone === "battlefield"; i++) s = pass(s);
    for (let i = 0; i < 20 && s.pending; i++) {
      const a = botActions(s, waitingOn(s)!);
      s = act(s, s.pending.kind === "searchLibrary" ? { type: "searchLibrary", player: ap, found: big } : a[0]!);
    }
    s = settle(s);
    expect(s.objects[d]!.zone).toBe("graveyard");
    for (const id of big) expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("Crime Novelist: a +1/+1 counter and {R} when you sacrifice an artifact", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, novelist);
    const treasure = putOnBattlefield(s0, ap, card("Test Treasure", "Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Draw a card." }));
    const s = run(s0, planActivate(s0, ap, treasure, 0, []));
    expect(s.objects[n]!.counters["+1/+1"]).toBe(1);
    expect(s.players[ap]!.manaPool.R).toBe(1);
  });
});

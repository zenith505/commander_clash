// Round 96: who puts counters (Vorinclex, Monstrous Raider and Innkeeper's Talent's level 3: "If you would put one or more
// counters on a permanent or player ...", rulings: the player putting them, not the permanent's controller), "with counters
// on them" grants (Innkeeper's Talent's ward), and "When the twelfth hour counter is put on ~" (Midnight Clock, a Plan).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, cast, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, isFullySupported, planActivate, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const vorinclex = card("Vorinclex, Monstrous Raider", "Legendary Creature — Phyrexian Praetor", "{4}{G}{G}", {
  power: "6",
  toughness: "6",
  keywords: ["Trample", "Haste"],
  oracleText:
    "Trample, haste\nIf you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead.\nIf an opponent would put one or more counters on a permanent or player, they put half that many of each of those kinds of counters on that permanent or player instead, rounded down.",
});
const innkeeper = card("Innkeeper's Talent", "Enchantment — Class", "{1}{G}", {
  oracleText:
    "(Gain the next level as a sorcery to add its ability.)\nAt the beginning of combat on your turn, put a +1/+1 counter on target creature you control.\n{G}: Level 2\nPermanents you control with counters on them have ward {1}.\n{3}{G}: Level 3\nIf you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead.",
});
const clock = card("Midnight Clock", "Artifact", "{2}{U}", {
  oracleText:
    "{T}: Add {U}.\n{2}{U}: Put an hour counter on this artifact.\nAt the beginning of each upkeep, put an hour counter on this artifact.\nWhen the twelfth hour counter is put on this artifact, shuffle your hand and graveyard into your library, then draw seven cards. Exile this artifact.",
});
const syndication = card("Villainous Syndication", "Enchantment — Plan", "{1}{B}", {
  oracleText:
    "Tap an untapped Villain you control: Mill a card. Put a plan counter on this enchantment. Activate only as a sorcery. (To mill a card, put the top card of your library into your graveyard.)\nWhen the fourth plan counter is put on this enchantment, sacrifice it. When you do, return target creature card from your graveyard to the battlefield.",
});
const growth = card("Battlegrowth", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature." });
const bolster = card("Grow Strong", "Sorcery", "{G}", { oracleText: "Put three +1/+1 counters on target creature." });
const charge = card("Attune with Aether", "Sorcery", "{G}", { oracleText: "Search your library for a basic land card, reveal it, put it into your hand, then shuffle. You get {E}{E}." });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextAfter = (s: GameState, p: number) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;

describe("who puts the counters", () => {
  it("parse", () => {
    for (const d of [vorinclex, innkeeper, clock, syndication]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Vorinclex doubles the counters its controller puts, on anyone's permanent", () => {
    const { s: s0, ap, ids } = setup([bolster]);
    putOnBattlefield(s0, ap, vorinclex);
    const theirs = putOnBattlefield(s0, nextAfter(s0, ap), bear());
    const s = settle(cast(s0, ap, ids[0]!, [target(theirs)]));
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(6);
  });

  it("Vorinclex halves (rounded down) the counters an opponent puts, even on their own permanents", () => {
    const { s: s0, ap, ids } = setup([bolster, growth]);
    putOnBattlefield(s0, nextAfter(s0, ap), vorinclex);
    const mine = putOnBattlefield(s0, ap, bear());
    let s = settle(cast(s0, ap, ids[0]!, [target(mine)]));
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1); // three halved
    s = settle(cast(s, ap, ids[1]!, [target(mine)]));
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1); // one halved is none
  });

  it("Vorinclex doubles a player's counters too (energy)", () => {
    const { s: s0, ap, ids } = setup([charge]);
    putOnBattlefield(s0, ap, vorinclex);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[ap]!.energy).toBe(4);
  });

  it("Innkeeper's Talent: ward {1} at level 2 for permanents with counters; doubles at level 3", () => {
    const { s: s0, ap, ids } = setup([growth, bolster]);
    const inn = putOnBattlefield(s0, ap, innkeeper);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, forest);
    const a = putOnBattlefield(s0, ap, bear());
    const run = (s: GameState, i: number) => {
      for (const x of planActivate(s, ap, inn, i)!) s = act(s, x);
      return settle(s);
    };
    // Level bars are the class's activated abilities, in order.
    let s = run(s0, 0);
    expect(s.objects[inn]!.classLevel).toBe(2);
    s = settle(cast(s, ap, ids[0]!, [target(a)]));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    const warded = (id: string) => abilitiesOf(s, s.objects[id]!).triggers.some((t) => t.event === "becomesTargetOfOpponent");
    expect([warded(a), warded(inn)]).toEqual([true, false]);
    s = run(s, 1);
    expect(s.objects[inn]!.classLevel).toBe(3);
    s = settle(cast(s, ap, ids[1]!, [target(a)]));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(7);
  });
});

describe("the Nth counter", () => {
  it("Midnight Clock: the twelfth hour counter shuffles hand and graveyard in, draws seven, exiles it", () => {
    const { s: s0, ap } = setup([growth, growth]);
    const c = putOnBattlefield(s0, ap, clock);
    s0.objects[c]!.counters.hour = 10;
    const run = (s: GameState) => {
      for (const x of planActivate(s, ap, c, 0)!) s = act(s, x);
      return settle(s);
    };
    let s = run(s0);
    expect(s.objects[c]!.counters.hour).toBe(11);
    expect(s.objects[c]!.zone).toBe("battlefield");
    s = run(s);
    expect(s.objects[c]!.zone).toBe("exile");
    expect(s.players[ap]!.hand).toHaveLength(7);
    expect(s.players[ap]!.graveyard).toHaveLength(0);
  });

  it("past twelve it doesn't trigger again", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, clock);
    s0.objects[c]!.counters.hour = 12;
    let s = s0;
    for (const x of planActivate(s, ap, c, 0)!) s = act(s, x);
    s = settle(s);
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.objects[c]!.counters.hour).toBe(13);
  });
});

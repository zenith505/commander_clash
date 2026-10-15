// Clash (CR 701.30): you and an opponent you choose reveal the top card of your libraries, each decides (in APNAP
// order) whether to put it on the bottom, and you win if yours has the greater mana value.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup, swamp, target } from "./helpers";
import { invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};
/** Puts a new card on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** Answers the clash: which opponent, then each player's top-or-bottom choice in order. */
const clash = (s: GameState, opp: PlayerId, bottoms: boolean[]) => {
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "clash" });
  s = act(s, { type: "chooseOption", player: s.pending!.player, choice: String(opp) });
  for (const yes of bottoms) {
    expect(s.pending).toMatchObject({ kind: "chooseMay", clash: true });
    s = act(s, { type: "chooseMay", player: s.pending!.player, yes });
  }
  return settle(s);
};

// Real oracle text (Scryfall).
const REMINDER = " (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)";
const boggart = card("Adder-Staff Boggart", "Creature — Goblin Warrior", "{1}{R}", {
  power: "2",
  toughness: "1",
  keywords: ["Clash"],
  oracleText: "When this creature enters, clash with an opponent. If you win, put a +1/+1 counter on this creature." + REMINDER,
});
const ants = card("Release the Ants", "Instant", "{1}{R}", { keywords: ["Clash"], oracleText: "Release the Ants deals 1 damage to any target. Clash with an opponent. If you win, return Release the Ants to its owner's hand." + REMINDER });
const strangle = card("Weed Strangle", "Sorcery", "{3}{B}{B}", { keywords: ["Clash"], oracleText: "Destroy target creature. Clash with an opponent. If you win, you gain life equal to that creature's toughness." + REMINDER });
const ringskipper = card("Ringskipper", "Creature — Faerie Wizard", "{1}{U}", {
  power: "1",
  toughness: "1",
  keywords: ["Flying", "Clash"],
  oracleText: "Flying\nWhen this creature dies, clash with an opponent. If you win, return this card to its owner's hand." + REMINDER,
});
const pullingTeeth = card("Pulling Teeth", "Sorcery", "{1}{B}", { keywords: ["Clash"], oracleText: "Clash with an opponent. If you win, target player discards two cards. Otherwise, that player discards a card." + REMINDER });
const big = card("Big Thing", "Creature — Beast", "{4}{G}{G}", { power: "6", toughness: "6" });
const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });

describe("clash", () => {
  it("Adder-Staff Boggart: a higher mana value wins; each player puts their card where they choose, in APNAP order", () => {
    supported(boggart, ants, strangle, ringskipper, pullingTeeth);
    const { s: s0, ap, ids, opp } = setup([boggart]);
    const mine = onTop(s0, ap, big);
    const theirs = onTop(s0, opp, forest);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = clash(s, opp, [true, false]);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.players[ap]!.library.at(-1)).toBe(mine);
    expect(s.players[opp]!.library[0]).toBe(theirs);
  });

  it("a tie doesn't win; an opponent with an empty library reveals nothing, so any card wins", () => {
    const { s: s0, ap, ids, opp } = setup([boggart, boggart]);
    onTop(s0, ap, bear());
    onTop(s0, opp, bear());
    let s = clash(run(s0, planCast(s0, ap, ids[0]!)), opp, [false, false]);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBeUndefined();
    onTop(s, ap, forest);
    s.players[opp]!.library = [];
    s = clash(run(s, planCast(s, ap, ids[1]!)), opp, [false]);
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(1);
  });

  it("Release the Ants returns to its owner's hand straight from the stack when you win", () => {
    const { s: s0, ap, ids, opp } = setup([ants]);
    onTop(s0, ap, big);
    onTop(s0, opp, forest);
    const s = clash(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), opp, [false, false]);
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(s.players[ap]!.graveyard).not.toContain(ids[0]);
  });

  it("Weed Strangle gains life equal to the destroyed creature's last toughness", () => {
    const { s: s0, ap, ids, opp } = setup([strangle]);
    const victim = putOnBattlefield(s0, opp, bear({ toughness: "4" }));
    onTop(s0, ap, big);
    onTop(s0, opp, forest);
    const life = s0.players[ap]!.life;
    const s = clash(run(s0, planCast(s0, ap, ids[0]!, [target(victim)])), opp, [false, false]);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("Ringskipper returns from the graveyard when it dies and you win; Pulling Teeth's 'otherwise' when you lose", () => {
    const { s: s0, ap, ids, opp } = setup([wrath, pullingTeeth]);
    const r = putOnBattlefield(s0, ap, ringskipper);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, swamp);
    onTop(s0, ap, big);
    onTop(s0, opp, forest);
    let s = clash(run(s0, planCast(s0, ap, ids[0]!)), opp, [false, false]);
    expect(s.objects[r]!.zone).toBe("hand");
    // My top card is still the 6-drop; theirs now a bigger one: I lose, so the target discards one card.
    onTop(s, opp, card("Huge Thing", "Creature — Beast", "{7}{G}", { power: "8", toughness: "8" }));
    const hand = s.players[opp]!.hand.length;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    s = clash(s, opp, [false, false]);
    for (let i = 0; i < 5 && s.pending?.kind === "discard"; i++) s = settle(act(s, { type: "discard", player: s.pending.player, objectIds: s.players[s.pending.player]!.hand.slice(0, s.pending.count) }));
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
  });
});

// Round 94: Kutzil, Malamet Exemplar ("creatures you control each with power greater than its base power": base power is
// printed, defined or set, before modifications and counters, rulings), and more of the round's cards.

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const kutzil = card("Kutzil, Malamet Exemplar", "Legendary Creature — Cat Warrior", "{1}{G}{W}", { power: "3", toughness: "3", oracleText: "Your opponents can't cast spells during your turn.\nWhenever one or more creatures you control each with power greater than its base power deals combat damage to a player, draw a card." });

const birgi = card("Birgi, God of Storytelling", "Legendary Creature — God", "{2}{R}", { power: "3", toughness: "3", oracleText: "Whenever you cast a spell, add {R}. Until end of turn, you don't lose this mana as steps and phases end.\nCreatures you control can boast twice during each of your turns rather than once." });
const usher = card("Usher of the Fallen", "Creature — Spirit Warrior", "{W}", { power: "2", toughness: "1", keywords: ["Boast"], oracleText: "Boast — {1}{W}: Create a 1/1 white Human Warrior creature token. (Activate only if this creature attacked this turn and only once each turn.)" });

const harvest = card("Second Harvest", "Instant", "{2}{G}{G}", { oracleText: "For each token you control, create a token that's a copy of that permanent." });
const legion = card("Clone Legion", "Sorcery", "{7}{U}{U}", { oracleText: "For each creature target player controls, create a token that's a copy of that creature." });
const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));

describe("Kutzil, Malamet Exemplar", () => {
  it("parse", () => expect(isFullySupported(kutzil)).toBe(true));

  it("draws once when creatures with power above their base power deal combat damage to a player", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, kutzil);
    const big = putOnBattlefield(s0, ap, bear());
    const pumped = putOnBattlefield(s0, ap, bear());
    s0.objects[big]!.counters["+1/+1"] = 1;
    addEffect(s0, ap, [pumped], [{ kind: "modifyPT", power: 1, toughness: 0 }]);
    const hand = s0.players[ap]!.hand.length;
    let s = attack(s0, ap, [{ attacker: big, defender: opp }, { attacker: pumped, defender: opp }]);
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("a creature whose power was set (its new base power) or only at its printed power doesn't count", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, kutzil);
    const plain = putOnBattlefield(s0, ap, bear());
    const set = putOnBattlefield(s0, ap, bear());
    addEffect(s0, ap, [set], [{ kind: "setPT", power: 5, toughness: 5 }]);
    const hand = s0.players[ap]!.hand.length;
    let s = attack(s0, ap, [{ attacker: plain, defender: opp }, { attacker: set, defender: opp }]);
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[opp]!.life).toBe(33);
  });
});

describe("Birgi, God of Storytelling", () => {
  it("parse", () => expect(isFullySupported(birgi)).toBe(true));

  it("creatures you control can boast twice during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const u = putOnBattlefield(s0, ap, usher);
    let s = attack(s0, ap, [{ attacker: u, defender: opp }]);
    s = activate(s, ap, u, 0);
    expect(abilityProblem(s, ap, u, 0)).toMatch(/only once each turn/);
    putOnBattlefield(s, ap, birgi);
    expect(abilityProblem(s, ap, u, 0)).not.toMatch(/only/); // just the mana, which planning taps lands for
    s = activate(s, ap, u, 0);
    expect(abilityProblem(s, ap, u, 0)).toMatch(/only twice each turn/);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.includes("Human Warrior"))).toHaveLength(2);
  });
});

describe("a token copy of each one (Second Harvest, Clone Legion)", () => {
  it("parse", () => {
    for (const d of [harvest, legion]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Second Harvest: a copy of each token you control, untapped and without its counters (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([harvest]);
    const soldier = putOnBattlefield(s0, ap, bear({ name: "Soldier" }));
    const t = putOnBattlefield(s0, ap, treasure);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Token" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "Not a token" }));
    for (const id of [soldier, t, theirs]) s0.objects[id]!.isToken = true;
    s0.objects[soldier]!.tapped = true;
    s0.objects[soldier]!.counters["+1/+1"] = 2;
    const s = settle(cast(s0, ap, ids[0]!));
    const names = (n: string) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === n);
    expect(names("Soldier")).toHaveLength(2);
    expect(names("Treasure")).toHaveLength(2);
    expect(names("Not a token")).toHaveLength(1);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Their Token")).toHaveLength(1);
    const copy = names("Soldier").find((id) => id !== soldier)!;
    expect(s.objects[copy]!.tapped).toBe(false);
    expect(s.objects[copy]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[copy]!.isToken).toBe(true);
    void mine;
  });

  it("Clone Legion: a copy of each creature the target player controls, under your control", () => {
    const { s: s0, ap, opp, ids } = setup([legion]);
    const before = s0.battlefield.length;
    putOnBattlefield(s0, opp, bear({ name: "Ogre A" }));
    putOnBattlefield(s0, opp, bear({ name: "Ogre B" }));
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    const copies = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(copies.map((id) => s.cards[s.objects[id]!.cardId]!.name).sort()).toEqual(["Ogre A", "Ogre B"]);
    expect(s.battlefield.length).toBe(before + 4);
  });
});

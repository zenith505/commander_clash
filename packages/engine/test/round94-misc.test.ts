// Round 94: Kutzil, Malamet Exemplar ("creatures you control each with power greater than its base power": base power is
// printed, defined or set, before modifications and counters, rulings), and more of the round's cards.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const kutzil = card("Kutzil, Malamet Exemplar", "Legendary Creature — Cat Warrior", "{1}{G}{W}", { power: "3", toughness: "3", oracleText: "Your opponents can't cast spells during your turn.\nWhenever one or more creatures you control each with power greater than its base power deals combat damage to a player, draw a card." });

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

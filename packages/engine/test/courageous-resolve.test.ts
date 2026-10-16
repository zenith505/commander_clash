// Courageous Resolve: protection from each of your opponents (CR 702.16i, k), and fateful hour's "you can't lose life
// this turn, you can't lose the game this turn, and your opponents can't win the game this turn" (CR 119.8, 104.3;
// rulings: damage is still dealt, costs of life can't be paid, and the life total is checked only as it resolves).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, waitingOn, type CardDef } from "../src";
import { cardSource, dealDamage, objectSource } from "../src/damage";
import { abilityProblem, blockProblem, loseLife, winGame } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const resolve = card("Courageous Resolve", "Instant", "{2}{W}", { oracleText: "Up to one target creature you control gains protection from each of your opponents until end of turn. Draw a card. (It can't be blocked, targeted, dealt damage, enchanted, or equipped by anything controlled by those players.)\nFateful hour — If you have 5 or less life, you can't lose life this turn, you can't lose the game this turn, and your opponents can't win the game this turn." });
const grace = card("Angel's Grace Part", "Instant", "{W}", { oracleText: "You can't lose the game this turn and your opponents can't win the game this turn." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const lifeCost = card("Test Life Altar", "Artifact", "{1}", { oracleText: "Pay 2 life: Draw a card." });

/** Courageous Resolve cast and resolved by the active player at `life`. */
function resolved(life: number, withTarget = true) {
  const { s: s0, ap, opp, ids } = setup([resolve]);
  const b = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
  s0.players[ap]!.life = life;
  const hand = s0.players[ap]!.hand.length;
  const s = cast(s0, ap, ids[0]!, withTarget ? [target(b)] : [{ kind: "none" }]);
  return { s, ap, opp, b, hand };
}

describe("Courageous Resolve", () => {
  it("parse", () => supported(resolve, grace));

  it("protection from each of your opponents, and draw a card", () => {
    const { s, ap, opp, b, hand } = resolved(20);
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Protection from each of your opponents");
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    expect(dealDamage(s, objectSource(s, s.objects[theirs]!), { object: s.objects[b]! }, 2)).toBe(0);
    s.objects[b]!.attacking = opp;
    expect(blockProblem(s, s.objects[theirs]!, s.objects[b]!, opp)).toMatch(/protection/);
    // Above 5 life, no fateful hour.
    loseLife(s, ap, 3);
    expect(s.players[ap]!.life).toBe(17);
  });

  it("no target chosen: you still draw (rulings)", () => {
    const { s, ap, hand } = resolved(20, false);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("fateful hour: damage is dealt but no life is lost, nobody wins, life can't be paid; next turn it's over", () => {
    const { s: s1, ap, opp } = resolved(5);
    let s = s1;
    expect(dealDamage(s, cardSource(shock, opp), { player: ap }, 3)).toBe(3);
    expect(s.players[ap]!.life).toBe(5);
    loseLife(s, ap, 10);
    expect(s.players[ap]!.life).toBe(5);
    // Can't pay life (CR 119.8).
    const altar = putOnBattlefield(s, ap, lifeCost);
    expect(abilityProblem(s, ap, altar, 0)).toMatch(/can't pay 2 life/);
    // An opponent can't win this turn.
    winGame(s, opp, "test");
    expect(s.over).toBe(false);
    // Even at 0 life, they don't lose this turn.
    s.players[ap]!.life = 0;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.lost).toBeFalsy();
    // At the next turn, the 0 life total makes them lose.
    s = passUntil(s, "upkeep", undefined, 200);
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("fateful hour: a life total above 5 as it resolves does nothing (rulings)", () => {
    const { s, ap } = resolved(6);
    loseLife(s, ap, 2);
    expect(s.players[ap]!.life).toBe(4);
    expect(s.turnRules).toBeUndefined();
  });

  it("You can't lose the game this turn and your opponents can't win the game this turn", () => {
    const { s: s0, ap, opp, ids } = setup([grace]);
    let s = cast(s0, ap, ids[0]!);
    winGame(s, opp, "test");
    expect(s.over).toBe(false);
    s.players[ap]!.life = -3;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.lost).toBeFalsy();
  });
});

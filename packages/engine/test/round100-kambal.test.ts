// Round 100: Kambal, Profiteering Mayor: "Whenever one or more tokens your opponents control enter, for each of them,
// create a tapped token that's a copy of it. This ability triggers only once each turn." A batch trigger (CR 603.2c);
// each copy has the token's copiable values (CR 707.2, rulings).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const kambal = card("Kambal, Profiteering Mayor", "Legendary Creature — Human Advisor", "{1}{W}{B}", { power: "2", toughness: "4", oracleText: "Whenever one or more tokens your opponents control enter, for each of them, create a tapped token that's a copy of it. This ability triggers only once each turn.\nWhenever one or more tokens you control enter, each opponent loses 1 life and you gain 1 life." });
const alarm = card("Raise the Alarm", "Instant", "{1}{W}", { oracleText: "Create two 1/1 white Soldier creature tokens." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const soldiers = (s: GameState, pid: number) => s.battlefield.map((id) => s.objects[id]!).filter((o) => o.isToken && o.controller === pid && s.cards[o.cardId]!.name.startsWith("Soldier"));

describe("round 100: Kambal, Profiteering Mayor", () => {
  it("parse", () => expect(isFullySupported(kambal)).toBe(true));

  it("copies each token an opponent makes, tapped, once each turn; and drains for its own", () => {
    const { s: s0, ap, opp, ids } = setup([alarm, alarm]);
    putOnBattlefield(s0, opp, kambal);
    const [apLife, oppLife] = [s0.players[ap]!.life, s0.players[opp]!.life];
    s0.players[ap]!.manaPool.W = 4;
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    expect(soldiers(s, ap)).toHaveLength(2);
    const mine = soldiers(s, opp);
    expect(mine).toHaveLength(2);
    expect(mine.every((o) => o.tapped)).toBe(true);
    expect(s.players[ap]!.life).toBe(apLife - 1);
    expect(s.players[opp]!.life).toBe(oppLife + 1);
    // A second batch this turn: no more copies.
    s = settle(planCast(s, ap, ids[1]!)!.reduce((x, a) => act(x, a), s));
    expect(soldiers(s, ap)).toHaveLength(4);
    expect(soldiers(s, opp)).toHaveLength(2);
  });
});

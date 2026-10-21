// Round 100: Ugin, the Ineffable's +1: "Exile the top card of your library face down and look at it. Create a 2/2
// colorless Spirit creature token. When that token leaves the battlefield, put the exiled card into your hand." A delayed
// trigger about the token (CR 603.7c), for any zone it goes to; the card only if it's still the same object (CR 400.7).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const ugin = card("Ugin, the Ineffable", "Legendary Planeswalker — Ugin", "{6}", { loyalty: "4", oracleText: "Colorless spells you cast cost {2} less to cast.\n+1: Exile the top card of your library face down and look at it. Create a 2/2 colorless Spirit creature token. When that token leaves the battlefield, put the exiled card into your hand.\n−3: Destroy target permanent that's one or more colors." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
const plusOne = (spell: typeof murder) => {
  const { s: s0, ap, ids } = setup([spell]);
  const u = putOnBattlefield(s0, ap, ugin);
  const top = s0.players[ap]!.library[0]!;
  const s = settle(run(s0, planActivate(s0, ap, u, 0)));
  const token = s.battlefield.find((id) => s.objects[id]!.isToken)!;
  return { s, ap, ids, top, token };
};

describe("round 100: Ugin, the Ineffable", () => {
  it("parse", () => expect(isFullySupported(ugin)).toBe(true));

  it("+1 exiles the top card face down, makes a Spirit; the card comes to hand when the Spirit dies", () => {
    const { s: s1, ap, ids, top, token } = plusOne(murder);
    expect(s1.objects[top]!.zone).toBe("exile");
    expect(s1.objects[top]!.hiddenExile?.seen).toEqual([ap]);
    expect(token).toBeDefined();
    s1.players[ap]!.manaPool.B = 3;
    const s = settle(run(s1, planCast(s1, ap, ids[0]!, [target(token)])));
    expect(s.objects[top]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(top);
  });

  it("any way it leaves counts: bounced", () => {
    const { s: s1, ap, ids, top, token } = plusOne(unsummon);
    s1.players[ap]!.manaPool.U = 1;
    const s = settle(run(s1, planCast(s1, ap, ids[0]!, [target(token)])));
    expect(s.objects[top]!.zone).toBe("hand");
  });
});

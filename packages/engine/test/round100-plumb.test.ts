// Round 100: Plumb the Forbidden: "As an additional cost to cast this spell, you may sacrifice one or more creatures.
// When you do, copy this spell for each creature sacrificed this way." An X of 0 or more in an additional cost (CR 107.3a,
// 601.2b) and a reflexive trigger as it's cast (CR 603.12); the copies aren't cast (CR 707.10).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const plumb = card("Plumb the Forbidden", "Instant", "{1}{B}", { oracleText: "As an additional cost to cast this spell, you may sacrifice one or more creatures. When you do, copy this spell for each creature sacrificed this way.\nYou draw a card and lose 1 life." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return s;
};

describe("round 100: Plumb the Forbidden", () => {
  it("parse", () => {
    expect(isFullySupported(plumb)).toBe(true);
    expect(compileCard(plumb).additionalCosts).toMatchObject([{ kind: "sacrifice", x: true, optional: true }]);
  });

  it("two creatures sacrificed: two copies, three draws and three life lost", () => {
    const { s: s0, ap, ids } = setup([plumb]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const [cards, life] = [s0.players[ap]!.hand.length, s0.players[ap]!.life];
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { sacrifice: [a] })).toBeNull(); // exactly X of them
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { sacrifice: [a, b] }));
    expect([s.objects[a]!.zone, s.objects[b]!.zone]).toEqual(["graveyard", "graveyard"]);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(cards - 1 + 3);
    expect(s.players[ap]!.life).toBe(life - 3);
  });

  it("none sacrificed: no trigger, one draw", () => {
    const { s: s0, ap, ids } = setup([plumb]);
    const [cards, life] = [s0.players[ap]!.hand.length, s0.players[ap]!.life];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 0)));
    expect(s.players[ap]!.hand.length).toBe(cards);
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.log.some((l) => /cop(y|ies)/i.test(l.text) && /Plumb/.test(l.text))).toBe(false);
  });
});

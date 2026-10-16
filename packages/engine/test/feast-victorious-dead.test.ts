// Feast of the Victorious Dead: "if one or more creatures died this turn, you gain that much life and distribute that
// many +1/+1 counters": an intervening if (CR 603.4), and "that much" is the number of creatures that died this turn,
// counted as it resolves (rulings); the counters are divided as it resolves (CR 608.2d).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, moveObject, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const feast = card("Feast of the Victorious Dead", "Enchantment", "{W}{B}", { oracleText: "At the beginning of your end step, if one or more creatures died this turn, you gain that much life and distribute that many +1/+1 counters among any number of creatures you control." });

/** Pass priority until the end step's trigger is resolving (or the turn ends). */
function toEndStep(s: GameState, ap: number): GameState {
  s = passUntil(s, "end", ap);
  for (let i = 0; i < 20 && !s.pending && s.step === "end"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("Feast of the Victorious Dead", () => {
  it("parse", () => expect(isFullySupported(feast)).toBe(true));

  it("gains a life and divides a counter for each creature that died this turn, anyone's", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, feast);
    const a = putOnBattlefield(s0, ap, bear({ name: "Mine A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Mine B" }));
    moveObject(s0, putOnBattlefield(s0, opp, bear({ name: "Theirs" })), "graveyard");
    moveObject(s0, putOnBattlefield(s0, ap, bear({ name: "Mine C" })), "graveyard");
    moveObject(s0, putOnBattlefield(s0, opp, bear({ name: "Theirs 2" })), "graveyard");
    const life = s0.players[ap]!.life;
    let s = toEndStep(s0, ap);
    expect(s.pending).toMatchObject({ kind: "distribute", player: ap, total: 3, counter: "+1/+1" });
    s = act(s, { type: "distribute", player: ap, parts: { [a]: 2, [b]: 1 } });
    expect(s.players[ap]!.life).toBe(life + 3);
    expect([s.objects[a]!.counters["+1/+1"], s.objects[b]!.counters["+1/+1"]]).toEqual([2, 1]);
  });

  it("doesn't trigger if no creature died this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, feast);
    putOnBattlefield(s0, ap, bear());
    const life = s0.players[ap]!.life;
    const s = passAll(passUntil(s0, "end", ap));
    expect(s.pending?.kind).not.toBe("distribute");
    expect(s.log.some((l) => /Feast of the Victorious Dead/.test(l.text))).toBe(false);
    expect(s.players[ap]!.life).toBe(life);
  });
});

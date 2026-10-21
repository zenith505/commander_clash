// Round 100: Twinflame, "Choose any number of target creatures you control. For each of them, create a token that's a copy
// of that creature, except it has haste" (CR 707.9b), exiled at the beginning of the next end step; strive adds {2}{R} per
// target beyond the first (CR 702.111a).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, objHasKeyword, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const twinflame = card("Twinflame", "Sorcery", "{1}{R}", { oracleText: "Strive — This spell costs {2}{R} more to cast for each target beyond the first.\nChoose any number of target creatures you control. For each of them, create a token that's a copy of that creature, except it has haste. Exile those tokens at the beginning of the next end step." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 100: Twinflame", () => {
  it("parse", () => {
    expect(isFullySupported(twinflame)).toBe(true);
  });

  it("a hasty copy of each target, exiled at the next end step", () => {
    const { s: s0, ap, ids } = setup([twinflame]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Runeclaw Bear" }));
    Object.assign(s0.players[ap]!.manaPool, { R: 2, C: 3 });
    let s = settle(cast(s0, ap, ids[0]!, [target(a), target(b)]));
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(2);
    for (const t of tokens) expect(objHasKeyword(s, s.objects[t]!, "Haste")).toBe(true);
    expect(s.players[ap]!.manaPool.R + s.players[ap]!.manaPool.C).toBe(0); // {1}{R} + {2}{R}
    s = settle(passUntil(s, "cleanup", ap));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(0);
  });
});

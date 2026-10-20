// Round 95: Return the Favor (spree, CR 702.172): "+ {1} — Copy target instant spell, sorcery spell, activated ability, or
// triggered ability. You may choose new targets for the copy." (CR 707.10, 115.1c-d) and "+ {1} — Change the target of
// target spell or ability with a single target." (CR 115.7a).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const favor = card("Return the Favor", "Instant", "{R}{R}", { oracleText: "Spree (Choose one or more additional costs.)\n+ {1} — Copy target instant spell, sorcery spell, activated ability, or triggered ability. You may choose new targets for the copy.\n+ {1} — Change the target of target spell or ability with a single target." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  for (const a of plan!) s = act(s, a);
  return s;
};
const resolveTop = (s: GameState) => {
  const n = s.stack.length;
  for (let i = 0; i < 10 && !s.pending && s.stack.length >= n; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Return the Favor", () => {
  it("parse", () => expect(isFullySupported(favor)).toBe(true));

  it("copies a spell on the stack, with a new target for the copy", () => {
    const { s: s0, ap, ids, opp } = setup([shock, favor]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Bear B" }));
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, mountain);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(a)]));
    const shockItem = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: shockItem.id }], [0]));
    s = resolveTop(s);
    expect(s.pending?.kind).toBe("copyTargets");
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [target(b)] }));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("changes the target of a spell with a single target", () => {
    const { s: s0, ap, ids, opp } = setup([shock, favor]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Bear B" }));
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, mountain);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(a)]));
    const shockItem = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: shockItem.id }], [1]));
    s = resolveTop(s);
    expect(s.pending?.kind).toBe("changeTarget");
    s = settle(act(s, { type: "changeTarget", player: ap, target: target(b) }));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});

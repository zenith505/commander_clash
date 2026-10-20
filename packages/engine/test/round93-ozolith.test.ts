// Round 93: The Ozolith. "Whenever a creature you control leaves the battlefield, if it had counters on it, put those
// counters on The Ozolith." (put on, not moved: rulings) "At the beginning of combat on your turn, if The Ozolith has
// counters on it, you may move all counters from The Ozolith onto target creature." (all of them or none, CR 122.5)

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const ozolith = card("The Ozolith", "Legendary Artifact", "{1}", { oracleText: "Whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on The Ozolith.\nAt the beginning of combat on your turn, if The Ozolith has counters on it, you may move all counters from The Ozolith onto target creature." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("The Ozolith", () => {
  it("parse", () => expect(isFullySupported(ozolith)).toBe(true));

  it("gets the counters of a creature of yours that leaves, then moves them all at the beginning of combat", () => {
    const { s: s0, ap, ids, opp } = setup([murder, unsummon]);
    const oz = putOnBattlefield(s0, ap, ozolith);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const plain = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[a]!.counters = { "+1/+1": 2 };
    s0.objects[b]!.counters = { "+1/+1": 1, flying: 1 };
    s0.objects[theirs]!.counters = { "+1/+1": 5 };
    let s = settle(cast(s0, ap, ids[0]!, [target(a)]));
    expect(s.objects[oz]!.counters).toEqual({ "+1/+1": 2 });
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    expect(s.objects[oz]!.counters).toMatchObject({ "+1/+1": 3, flying: 1 });
    // An opponent's creature isn't yours.
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "graveyard";
    // Beginning of combat: target a creature, then choose to move.
    s = passUntil(s, "beginCombat", ap);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(plain)] });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[plain]!.counters).toMatchObject({ "+1/+1": 3, flying: 1 });
    expect(Object.values(s.objects[oz]!.counters).every((n) => !n)).toBe(true);
  });

  it("no counters, no trigger at the beginning of combat", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ozolith);
    putOnBattlefield(s0, ap, bear());
    const s = passUntil(s0, "beginCombat", ap);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    expect(s.pending?.kind).not.toBe("chooseTargets");
  });
});

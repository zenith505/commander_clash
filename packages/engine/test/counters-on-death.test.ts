// "When ~ dies, put its counters on target creature you control": as many of each kind as it had as it last existed,
// put on (not moved), -1/-1 counters included (rulings on Dockworker Drone, Spiteful Squad).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const drone = card("Dockworker Drone", "Artifact Creature — Robot", "{1}{W}", { power: "1", toughness: "1", oracleText: "This creature enters with a +1/+1 counter on it.\nWhen this creature dies, put its counters on target creature you control." });
const captain = card("Selfless Police Captain", "Creature — Human Detective", "{1}{W}", { power: "1", toughness: "1", oracleText: "This creature enters with a +1/+1 counter on it.\nWhen this creature leaves the battlefield, put its +1/+1 counters on target creature you control." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });

describe("put its counters on target creature", () => {
  it("is supported", () => [drone, captain].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Dockworker Drone puts every kind of counter it had, -1/-1 counters too", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const d = putOnBattlefield(s0, ap, drone);
    s0.objects[d]!.counters = { "+1/+1": 1, charge: 2, "-1/-1": 1 };
    const b = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!, [target(d)]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    // +1/+1 and -1/-1 annihilate as a state-based action (CR 704.5q); the charge counters stay.
    expect(s.objects[b]!.counters).toEqual({ charge: 2 });
  });

  it("Selfless Police Captain puts only its +1/+1 counters, when it leaves for any zone", () => {
    const { s: s0, ap, ids } = setup([unsummon]);
    const c = putOnBattlefield(s0, ap, captain);
    s0.objects[c]!.counters = { "+1/+1": 2, charge: 1 };
    const b = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!, [target(c)]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.objects[c]!.zone).toBe("hand");
    expect(s.objects[b]!.counters).toEqual({ "+1/+1": 2 });
  });
});

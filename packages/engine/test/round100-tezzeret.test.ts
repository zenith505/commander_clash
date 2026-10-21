// Round 100: Tezzeret, Cruel Captain: "If it's an artifact creature, put a +1/+1 counter on it", "If it's not a creature,
// it becomes a 0/0 Robot artifact creature": about the target as the ability resolves (CR 608.2c), still a legal target.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, planActivate, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const tezzeret = card("Tezzeret, Cruel Captain", "Legendary Planeswalker — Tezzeret", "{3}", { loyalty: "4", oracleText: "Whenever an artifact you control enters, put a loyalty counter on Tezzeret.\n0: Untap target artifact or creature. If it's an artifact creature, put a +1/+1 counter on it.\n−3: Search your library for an artifact card with mana value 1 or less, reveal it, put it into your hand, then shuffle.\n−7: You get an emblem with \"At the beginning of combat on your turn, put three +1/+1 counters on target artifact you control. If it's not a creature, it becomes a 0/0 Robot artifact creature.\"" });
const golem = card("Bronze Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" });
const rock = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const activate = (s: GameState, pid: number, id: string, i: number, t: string) => {
  const plan = planActivate(s, pid, id, i, [target(t)]);
  if (!plan) throw new Error("can't activate");
  return settle(plan.reduce((x, a) => act(x, a), s));
};

describe("round 100: Tezzeret, Cruel Captain", () => {
  it("parse", () => expect(isFullySupported(tezzeret)).toBe(true));

  it("0: untaps; a counter only on an artifact creature", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tezzeret);
    const g = putOnBattlefield(s0, ap, golem);
    s0.objects[g]!.tapped = true;
    const s = activate(s0, ap, t, 0, g);
    expect(s.objects[g]!.tapped).toBe(false);
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
    const { s: s1, ap: ap1 } = setup([]);
    const t1 = putOnBattlefield(s1, ap1, tezzeret);
    const b = putOnBattlefield(s1, ap1, bear());
    s1.objects[b]!.tapped = true;
    const z = activate(s1, ap1, t1, 0, b);
    expect(z.objects[b]!.tapped).toBe(false);
    expect(z.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("−7 emblem: a noncreature artifact becomes a 0/0 Robot with three counters, a 3/3", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tezzeret);
    s0.objects[t]!.counters.loyalty = 7;
    const r = putOnBattlefield(s0, ap, rock);
    const plan = planActivate(s0, ap, t, 2);
    if (!plan) throw new Error("can't activate");
    let s = settle(plan.reduce((x, a) => act(x, a), s0));
    // This turn's beginning of combat: the emblem's trigger targets the artifact.
    s = passUntil(s, "beginCombat", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(r)] }));
    const c = characteristics(s, s.objects[r]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Robot");
    expect([c.power, c.toughness]).toEqual([3, 3]);
  });
});

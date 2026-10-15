// Abilities on the stack as targets (CR 115.1b, 115.7): "Counter target activated or triggered ability", "Counter
// target activated ability", "Counter target spell, activated ability, or triggered ability" (CR 701.6b), and "Change
// the target of target spell or ability with a single target" (Bolt Bend). Mana abilities never use the stack.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const stifle = card("Stifle", "Instant", "{U}", { oracleText: "Counter target activated or triggered ability. (Mana abilities can't be targeted.)" });
const squelch = card("Squelch", "Instant", "{1}{U}", { oracleText: "Counter target activated ability. (Mana abilities can't be targeted.)\nDraw a card." });
const disallow = card("Disallow", "Instant", "{1}{U}{U}", { oracleText: "Counter target spell, activated ability, or triggered ability. (Mana abilities can't be targeted.)" });
const boltBend = card("Bolt Bend", "Instant", "{3}{R}", { oracleText: "This spell costs {3} less to cast if you control a creature with power 4 or greater.\nChange the target of target spell or ability with a single target." });
const visionary = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", { power: "1", toughness: "1", oracleText: "When this creature enters, draw a card." });
const pyromancer = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const run = (s: GameState, plan: Action[]) => plan.reduce((x, a) => act(x, a), s);
function castOnly(s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) {
  const plan = planCast(s, pid, id, targets);
  if (!plan) throw new Error(`can't cast ${s.cards[s.objects[id]!.cardId]!.name}`);
  return run(s, plan);
}
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const abilityOnStack = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.kind === "ability")!.id });
/** Elvish Visionary cast and resolved, its enters trigger waiting on the stack, `pid` holding priority. */
function withTrigger(s: GameState, pid: PlayerId, id: string) {
  s = castOnly(s, pid, id);
  for (let i = 0; i < 20 && !s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
}
/** Prodigal Pyromancer's ability activated at `t`, on the stack. */
function pinged(s: GameState, pid: PlayerId, src: string, t: TargetChoice) {
  const plan = planActivate(s, pid, src, 0, [t]);
  if (!plan) throw new Error("can't activate");
  return run(s, plan);
}

describe("abilities on the stack as targets", () => {
  it("compile", () => {
    for (const d of [stifle, squelch, disallow, boltBend]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Stifle counters a triggered ability; its source stays", () => {
    const { s: s0, ap, ids } = setup([visionary, stifle]);
    let s = withTrigger(s0, ap, ids[0]!);
    const hand = s.players[ap]!.hand.length;
    s = settle(castOnly(s, ap, ids[1]!, [abilityOnStack(s)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 1); // Stifle left, nothing drawn
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.stack.length).toBe(0);
  });

  it("Squelch counters an activated ability but can't target a triggered one or a spell", () => {
    const { s: s0, ap, ids, opp } = setup([visionary, squelch, shock]);
    const p = putOnBattlefield(s0, ap, pyromancer);
    const b = putOnBattlefield(s0, opp, bear());
    const t = withTrigger(structuredClone(s0), ap, ids[0]!);
    expect(planCast(t, ap, ids[1]!, [abilityOnStack(t)])).toBeNull();
    const sp = castOnly(structuredClone(s0), ap, ids[2]!, [{ kind: "object", id: b }]);
    expect(planCast(sp, ap, ids[1]!, [{ kind: "stack", id: sp.stack[0]!.id }])).toBeNull();
    let s = pinged(s0, ap, p, { kind: "object", id: b });
    const hand = s.players[ap]!.hand.length;
    s = settle(castOnly(s, ap, ids[1]!, [abilityOnStack(s)]));
    expect(s.objects[b]!.damage).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand); // Squelch left, a card drawn
  });

  it("Disallow counters a spell, an activated ability or a triggered ability", () => {
    const { s: s0, ap, ids, opp } = setup([visionary, disallow, shock]);
    const p = putOnBattlefield(s0, ap, pyromancer);
    const b = putOnBattlefield(s0, opp, bear());
    const t = withTrigger(structuredClone(s0), ap, ids[0]!);
    const hand = t.players[ap]!.hand.length;
    expect(settle(castOnly(t, ap, ids[1]!, [abilityOnStack(t)])).players[ap]!.hand.length).toBe(hand - 1);
    const a = pinged(structuredClone(s0), ap, p, { kind: "object", id: b });
    expect(settle(castOnly(a, ap, ids[1]!, [abilityOnStack(a)])).objects[b]!.damage).toBe(0);
    const sp = castOnly(s0, ap, ids[2]!, [{ kind: "object", id: b }]);
    expect(settle(castOnly(sp, ap, ids[1]!, [{ kind: "stack", id: sp.stack[0]!.id }])).objects[b]!.zone).toBe("battlefield");
  });

  it("Bolt Bend changes the target of an activated ability", () => {
    const { s: s0, ap, ids, opp } = setup([boltBend]);
    const p = putOnBattlefield(s0, ap, pyromancer);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = pinged(s0, ap, p, { kind: "object", id: mine });
    s = settle(castOnly(s, ap, ids[0]!, [abilityOnStack(s)]));
    expect(s.pending).toMatchObject({ kind: "changeTarget", player: ap });
    s = settle(act(s, { type: "changeTarget", player: ap, target: { kind: "object", id: theirs } }));
    expect([s.objects[mine]!.damage, s.objects[theirs]!.damage]).toEqual([0, 1]);
  });
});

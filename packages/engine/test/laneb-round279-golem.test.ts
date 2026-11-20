// Lane B round B279: Emblazoned Golem ("Kicker {X}. Spend only colored mana on X. No more than one mana of each color may
// be spent this way. If this creature was kicked, it enters with X +1/+1 counters on it."; CR 702.33, 107.3a, 601.2f-h).

import { describe, expect, it } from "vitest";
import { act, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions } from "../src/bot";
import { applyAction, castProblem, invalidateCharacteristics, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const golem = (): CardDef => ({"oracleId":"fbeafc81-1ddb-4b54-8f86-e6afd5f81db8","name":"Emblazoned Golem","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"Kicker {X} (You may pay an additional {X} as you cast this spell.)\nSpend only colored mana on X. No more than one mana of each color may be spent this way.\nIf this creature was kicked, it enters with X +1/+1 counters on it.","power":"1","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Kicker"],"layout":"normal"}) as CardDef;
const sculptor = (): CardDef => ({"oracleId":"96b87445-6362-4a17-91b2-cbf203fd03fd","name":"Etherium Sculptor","manaCost":"{1}{U}","cmc":2,"typeLine":"Artifact Creature — Vedalken Artificer","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Vedalken","Artificer"],"oracleText":"Artifact spells you cast cost {1} less to cast.","power":"1","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && !s.over && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
  invalidateCharacteristics(s);
};
const tappedNames = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped).map((id) => s.cards[s.objects[id]!.cardId]!.name).sort();
const KICKED = { kicks: [0] };

describe("Emblazoned Golem", () => {
  it("is supported", () => {
    expect(isFullySupported(golem())).toBe(true);
    expect(isFullySupported(sculptor())).toBe(true);
  });

  it("kicked for X = 5, X is paid with one mana of each color and it enters with five +1/+1 counters", () => {
    const { s: s0, ap, ids } = setup([golem()]);
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 5, KICKED);
    expect(plan).not.toBeNull();
    let s = run(s0, plan);
    // {2} and one land of each basic type for X: seven lands, all five colors among them.
    const tapped = tappedNames(s, ap);
    expect(tapped).toHaveLength(7);
    for (const name of ["Plains", "Island", "Swamp", "Mountain", "Forest"]) expect(tapped).toContain(name);
    s = settle(passAll(s));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(o.counters["+1/+1"]).toBe(5);
    expect(power(s, o)).toBe(6);
    expect(toughness(s, o)).toBe(7);
  });

  it("X can't be more than 5: there are only five colors", () => {
    const { s, ap, ids } = setup([golem()]);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, 6, KICKED)).toBeNull();
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, 6, KICKED)).toMatch(/not enough mana/);
  });

  it("colorless mana and a second mana of one color pay only the {2}", () => {
    const { s: s0, ap, ids } = setup([golem()]);
    // {C}{C}{R}{R}{G}: X = 2 is red and green, the {2} colorless; X = 3 has no third color.
    const s = structuredClone(s0);
    poolOnly(s, ap, { C: 2, R: 2, G: 1 });
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, 3, KICKED)).toMatch(/not enough mana/);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, 2, KICKED)).toBeNull();
    let t = act(s, { type: "castSpell", player: ap, objectId: ids[0]!, x: 2, kicks: [0] });
    expect(t.players[ap]!.manaPool).toMatchObject({ C: 0, R: 1, G: 0 });
    t = settle(passAll(t));
    expect(t.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    // Four red mana: X = 2 can't be paid (one red is all X may have), X = 1 can.
    const r = structuredClone(s0);
    poolOnly(r, ap, { R: 4 });
    expect(castProblem(r, ap, ids[0]!, undefined, undefined, undefined, undefined, 2, KICKED)).toMatch(/not enough mana/);
    expect(castProblem(r, ap, ids[0]!, undefined, undefined, undefined, undefined, 1, KICKED)).toBeNull();
    // Colorless only: kicked with X = 1 can't be paid; unkicked, the {2} can.
    const c = structuredClone(s0);
    poolOnly(c, ap, { C: 3 });
    expect(castProblem(c, ap, ids[0]!, undefined, undefined, undefined, undefined, 1, KICKED)).toMatch(/not enough mana/);
    expect(castProblem(c, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { kicks: [] })).toBeNull();
  });

  it("not kicked, it's a 1/2 for {2} with no counters", () => {
    const { s: s0, ap, ids } = setup([golem()]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [] }));
    expect(tappedNames(s, ap)).toHaveLength(2);
    s = settle(passAll(s));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(o.counters["+1/+1"] ?? 0).toBe(0);
    expect(power(s, o)).toBe(1);
  });

  it("a cost reduction may take off X, so with Etherium Sculptor X = 6 is five colored mana and the {2}", () => {
    const { s: s0, ap, ids } = setup([golem()]);
    putOnBattlefield(s0, ap, sculptor());
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 6, KICKED);
    expect(plan).not.toBeNull();
    let s = run(s0, plan);
    expect(tappedNames(s, ap).filter((n) => n !== "Etherium Sculptor")).toHaveLength(7);
    s = settle(passAll(s));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(6);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 7, KICKED)).toBeNull();
  });

  it("a bot kicks it with as many colors as it can pay", () => {
    const { s: s0, ap, ids } = setup([golem()]);
    // Only the Golem in hand, no commander to cast first.
    const p = s0.players[ap]!;
    for (const id of p.hand.filter((h) => h !== ids[0]!)) {
      p.hand.splice(p.hand.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      p.library.push(id);
    }
    p.command.splice(0);
    let s = s0;
    for (let i = 0; i < 30 && s.objects[ids[0]!]!.zone === "hand"; i++) {
      const acts = botActions(s, waitingOn(s)!);
      if (!acts.length) break;
      for (const a of acts) s = act(s, a);
      if (s.activePlayer !== ap) break;
    }
    s = settle(s);
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(o.counters["+1/+1"]).toBe(5);
  });
});

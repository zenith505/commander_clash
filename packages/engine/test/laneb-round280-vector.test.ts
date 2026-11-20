// Lane B round B280: Filigree Vector ("When this creature enters, put a +1/+1 counter on each of any number of target
// creatures and a charge counter on each of any number of target artifacts."): two groups of targets in one triggered
// ability (CR 115.3, 115.6, 601.2c, 603.3d; rulings: an artifact creature may be a target of both).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { botActions } from "../src/bot";
import { applyAction, isFullySupported, offerTargets, planCast, sourceQuality, waitingOn, type Action, type CardDef, type GameState, type TargetChoice } from "../src";

// Real card data (Scryfall).
const vector = (): CardDef => ({"oracleId":"44b90948-e85a-4f69-a9e2-aba63775ba40","name":"Filigree Vector","manaCost":"{3}{W}","cmc":4,"typeLine":"Artifact Creature — Phyrexian Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Construct"],"oracleText":"When this creature enters, put a +1/+1 counter on each of any number of target creatures and a charge counter on each of any number of target artifacts.\n{1}, {T}, Sacrifice another artifact: Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Proliferate"],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const bear = (): CardDef => ({"oracleId":"14c8cff3-ef9f-4a0d-8e9b-5e0a9bc4a2ea","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const counters = (s: GameState, id: string) => s.objects[id]!.counters;
const NONE: TargetChoice = { kind: "none" };

/** You cast Filigree Vector, with Ornithopter and Sol Ring; the next player has a Grizzly Bears and a Sol Ring. */
const board = () => {
  const { s: s0, ap, opp, ids } = setup([vector()]);
  const thopter = putOnBattlefield(s0, ap, ornithopter());
  const ring = putOnBattlefield(s0, ap, solRing());
  const theirBear = putOnBattlefield(s0, opp, bear());
  const theirRing = putOnBattlefield(s0, opp, solRing());
  const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
  return { s, ap, opp, vec: ids[0]!, thopter, ring, theirBear, theirRing };
};

/** The targets as offered (offerTargets): one optional entry per object each group could be, chosen in order. */
const laidOut = (s: GameState, creatures: string[], artifacts: string[]) => {
  const pend = s.pending as Extract<GameState["pending"], { kind: "chooseTargets" }>;
  const offered = offerTargets(s, pend.specs, pend.player, 0, sourceQuality(s, pend.sourceId), pend.sourceId);
  const nCreatures = offered.filter((t) => t.text === "target creature").length;
  const nArtifacts = offered.filter((t) => t.text === "target artifact").length;
  expect(nCreatures + nArtifacts).toBe(offered.length);
  const group = (ids: string[], n: number) => Array.from({ length: n }, (_, k): TargetChoice => (ids[k] ? target(ids[k]!) : NONE));
  return [...group(creatures, nCreatures), ...group(artifacts, nArtifacts)];
};

describe("Filigree Vector", () => {
  it("is supported", () => {
    expect(isFullySupported(vector())).toBe(true);
  });

  it("its enters trigger asks for both groups of targets at once: an artifact creature may be in both", () => {
    const { s: s0, ap, vec, thopter, ring, theirBear, theirRing } = board();
    expect(s0.pending?.kind).toBe("chooseTargets");
    const pend = s0.pending as Extract<GameState["pending"], { kind: "chooseTargets" }>;
    expect(pend.player).toBe(ap);
    expect(pend.specs.map((t) => t.text)).toEqual(["target creature", "target artifact"]);
    // Creatures: the Vector, Ornithopter, their Bears and the four commanders aren't out; artifacts: the Vector, Ornithopter, two Sol Rings.
    let s = act(s0, { type: "chooseTargets", player: ap, targets: laidOut(s0, [vec, thopter, theirBear], [vec, ring]) });
    expect(s.pending).toBeNull();
    // One ability on the stack, with all five targets (CR 601.2c, 603.3d).
    expect(s.stack.length).toBe(1);
    expect(s.stack[0]!.targets?.length).toBe(5);
    s = settle(s);
    expect(counters(s, vec)["+1/+1"]).toBe(1);
    expect(counters(s, vec).charge).toBe(1);
    expect(counters(s, thopter)["+1/+1"]).toBe(1);
    expect(counters(s, thopter).charge ?? 0).toBe(0);
    expect(counters(s, theirBear)["+1/+1"]).toBe(1);
    expect(counters(s, ring).charge).toBe(1);
    expect(counters(s, theirRing).charge ?? 0).toBe(0);
  });

  it("each group may be left empty (CR 115.6)", () => {
    const { s: s0, ap, vec, ring, theirRing } = board();
    let s = act(s0, { type: "chooseTargets", player: ap, targets: laidOut(s0, [], [ring, theirRing]) });
    s = settle(s);
    expect(counters(s, vec)["+1/+1"] ?? 0).toBe(0);
    expect(counters(s, ring).charge).toBe(1);
    expect(counters(s, theirRing).charge).toBe(1);
    const { s: t0, ap: ap2, vec: vec2 } = board();
    let t = act(t0, { type: "chooseTargets", player: ap2, targets: laidOut(t0, [vec2], []) });
    t = settle(t);
    expect(counters(t, vec2)["+1/+1"]).toBe(1);
    expect(counters(t, vec2).charge ?? 0).toBe(0);
  });

  it("within one group an object can't be chosen twice (CR 115.3), and the layout must be the one offered", () => {
    const { s, ap, vec, ring } = board();
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: laidOut(s, [vec, vec], []) })).toThrow();
    // Not laid out as offered: which group a target is for can't be told.
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(vec), target(ring)] })).toThrow();
    // A creature that isn't an artifact can't be in the artifact group.
    const { s: t, ap: ap2, theirBear } = board();
    expect(() => applyAction(t, { type: "chooseTargets", player: ap2, targets: laidOut(t, [], [theirBear]) })).toThrow();
  });

  it("a target gone by resolution is left out; the rest still get their counters (CR 608.2b)", () => {
    const { s: s0, ap, vec, thopter, ring } = board();
    let s = act(s0, { type: "chooseTargets", player: ap, targets: laidOut(s0, [thopter], [thopter, ring]) });
    // Ornithopter leaves before it resolves.
    s = structuredClone(s);
    const p = s.players[ap]!;
    s.battlefield.splice(s.battlefield.indexOf(thopter), 1);
    s.objects[thopter]!.zone = "graveyard";
    s.objects[thopter]!.zoneChanges = (s.objects[thopter]!.zoneChanges ?? 0) + 1;
    p.graveyard.push(thopter);
    s = settle(s);
    expect(counters(s, ring).charge).toBe(1);
    expect(counters(s, vec)["+1/+1"] ?? 0).toBe(0);
  });

  it("a bot puts the counters on its own creatures and artifacts only", () => {
    const { s: s0, ap, opp, vec, thopter, ring, theirBear, theirRing } = board();
    s0.players[ap]!.isBot = true;
    let s = s0;
    for (const a of botActions(s, ap)) s = applyAction(s, a);
    expect(s.pending).toBeNull();
    s = settle(s);
    expect(counters(s, vec)["+1/+1"]).toBe(1);
    expect(counters(s, thopter)["+1/+1"]).toBe(1);
    expect(counters(s, vec).charge).toBe(1);
    expect(counters(s, thopter).charge).toBe(1);
    expect(counters(s, ring).charge).toBe(1);
    expect(counters(s, theirBear)["+1/+1"] ?? 0).toBe(0);
    expect(counters(s, theirRing).charge ?? 0).toBe(0);
    expect(opp).not.toBe(ap);
  });
});

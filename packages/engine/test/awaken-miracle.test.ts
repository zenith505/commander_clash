// Awaken (CR 702.113a): an alternative cost that adds "put N +1/+1 counters on target land you control and it becomes a
// 0/0 Elemental creature with haste" (permanently: it's still a land). Miracle (702.94a-b): the first card a player
// draws in a turn may be revealed; its trigger lets them cast it for its miracle cost as it resolves, ignoring timing.

import { describe, expect, it } from "vitest";
import { act, bear, card, island, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, isFullySupported, objIsType, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall), with the keywords Scryfall lists.
const clutch = card("Clutch of Currents", "Sorcery", "{U}", { keywords: ["Awaken"], oracleText: "Return target creature to its owner's hand.\nAwaken 3—{4}{U} (If you cast this spell for {4}{U}, also put three +1/+1 counters on target land you control and it becomes a 0/0 Elemental creature with haste. It's still a land.)" });
const discovery = card("Coastal Discovery", "Sorcery", "{3}{U}", { keywords: ["Awaken"], oracleText: "Draw two cards.\nAwaken 4—{5}{U} (If you cast this spell for {5}{U}, also put four +1/+1 counters on target land you control and it becomes a 0/0 Elemental creature with haste. It's still a land.)" });
const mastery = card("Temporal Mastery", "Sorcery", "{5}{U}{U}", { keywords: ["Miracle"], oracleText: "Take an extra turn after this one. Exile Temporal Mastery.\nMiracle {1}{U} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)" });
const wrath = card("Thunderous Wrath", "Instant", "{4}{R}{R}", { keywords: ["Miracle"], oracleText: "Thunderous Wrath deals 5 damage to any target.\nMiracle {R} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)" });
const entreat = card("Entreat the Angels", "Sorcery", "{X}{X}{W}{W}{W}", { keywords: ["Miracle"], oracleText: "Create X 4/4 white Angel creature tokens with flying.\nMiracle {X}{W}{W} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)" });
const inspiration = card("Inspiration", "Instant", "{3}{U}", { oracleText: "Target player draws two cards." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
/** Pass priority until something needs an answer or the stack and trigger queue are empty. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;

describe("awaken", () => {
  it("parses", () => supported(clutch, discovery));

  it("Clutch of Currents: one target normally; awakened, also a land you control becomes a 0/0 haste Elemental with three counters", () => {
    const { s: s0, ap, ids, opp } = setup([clutch, clutch]);
    const a = putOnBattlefield(s0, opp, bear()), b = putOnBattlefield(s0, opp, bear());
    const land = putOnBattlefield(s0, ap, island);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(a), { kind: "none" }])));
    expect(s.players[opp]!.hand).toContain(a);
    expect(objIsType(s, s.objects[land]!, "Creature")).toBe(false);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(b), target(land)], undefined, "auto", undefined, { alt: "awaken" })));
    expect(s.players[opp]!.hand).toContain(b);
    const c = characteristics(s, s.objects[land]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Island", "Elemental"]));
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.keywords).toContain("Haste");
    // It stays a creature after the turn ends (the effect has no duration).
    s = passUntil(s, "upkeep", opp);
    expect(characteristics(s, s.objects[land]!).types).toContain("Creature");
  });

  it("can't target a land you don't control", () => {
    const { s: s0, ap, ids, opp } = setup([discovery]);
    const theirs = putOnBattlefield(s0, opp, island);
    expect(planCast(s0, ap, ids[0]!, [target(theirs)], undefined, "auto", undefined, { alt: "awaken" })).toBeNull();
  });

  it("Coastal Discovery: bots awaken it when they can pay for it", () => {
    const { s: s0, ap, ids } = setup([discovery]);
    s0.players[ap]!.hand = [...ids];
    s0.players[ap]!.command = [];
    const plan = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(plan?.type === "castSpell" ? plan.alt : undefined).toBe("awaken");
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, plan?.type === "castSpell" ? plan.targets : undefined, undefined, "auto", undefined, { alt: "awaken" })));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    const creatures = s.battlefield.filter((id) => objIsType(s, s.objects[id]!, "Land") && objIsType(s, s.objects[id]!, "Creature"));
    expect(creatures).toHaveLength(1);
    expect(characteristics(s, s.objects[creatures[0]!]!).power).toBe(4);
  });
});

describe("miracle", () => {
  it("parses", () => supported(mastery, wrath, entreat));

  /** `pid`'s next draw step, with its turn-based draw done. */
  const nextDrawStep = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "end", pid === s.activePlayer ? pid : undefined), "draw", pid);

  it("Temporal Mastery: revealed as the first draw of the turn, cast for {1}{U} as the trigger resolves, at sorcery's otherwise wrong time", () => {
    const { s: s0, ap } = setup([]);
    const tm = onTop(s0, ap, mastery);
    let s = nextDrawStep(s0, ap);
    expect(s.players[ap]!.hand).toContain(tm);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: tm, how: "miracle" });
    const before = untapped(s, ap);
    s = run(s, planCast(s, ap, tm));
    expect(untapped(s, ap)).toBe(before - 2);
    s = settle(s);
    expect(s.objects[tm]!.zone).toBe("exile");
    expect(s.extraTurns?.length).toBe(1);
  });

  it("not cast: it stays in hand", () => {
    const { s: s0, ap } = setup([]);
    const tm = onTop(s0, ap, mastery);
    let s = settle(nextDrawStep(s0, ap));
    expect(s.pending).toMatchObject({ kind: "castFree", how: "miracle" });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.hand).toContain(tm);
    expect(s.pending).toBeFalsy();
  });

  it("only the first card drawn this turn, on any player's turn: Thunderous Wrath for {R} drawn by Inspiration in an opponent's upkeep", () => {
    const { s: s0, ap, ids, opp } = setup([inspiration, inspiration]);
    let s = priorityToIn(passUntil(s0, "upkeep", opp), ap);
    onTop(s, ap, bear());
    const w = onTop(s, ap, wrath);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }])));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: w, how: "miracle" });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, w, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 5);
    // Drawn second this turn: no trigger.
    const w2 = onTop(s, ap, wrath);
    onTop(s, ap, bear());
    s = settle(run(priorityToIn(s, ap), planCast(priorityToIn(s, ap), ap, ids[1]!, [{ kind: "player", id: ap }])));
    expect(s.players[ap]!.hand).toContain(w2);
    expect(s.pending).toBeFalsy();
  });

  it("Entreat the Angels: X is chosen and paid in the miracle cost {X}{W}{W}", () => {
    const { s: s0, ap } = setup([]);
    const e = onTop(s0, ap, entreat);
    let s = settle(nextDrawStep(s0, ap));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: e, how: "miracle" });
    const before = untapped(s, ap);
    s = run(s, planCast(s, ap, e, undefined, undefined, "auto", 3));
    expect(untapped(s, ap)).toBe(before - 5);
    s = settle(s);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toHaveLength(3);
  });

  it("bots cast a miracle when they can pay for it", () => {
    const { s: s0, ap } = setup([]);
    const tm = onTop(s0, ap, mastery);
    let s = settle(nextDrawStep(s0, ap));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: tm });
    s = run(s, botActions(s, ap));
    expect(s.objects[tm]!.zone).toBe("stack");
  });
});

/** Pass priority until `pid` has it, in the same step. */
function priorityToIn(s: GameState, pid: PlayerId) {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
}

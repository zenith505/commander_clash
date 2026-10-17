// Wishing Well: "{T}: Put a coin counter on ~. When you do, you may cast target instant or sorcery card with mana value
// equal to the number of coin counters on ~ from your graveyard ...": a reflexive trigger (CR 603.12) whose target is
// chosen after the counter is put, with exactly that mana value.

import { describe, expect, it } from "vitest";
import { act, activate, card, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { moveObject } from "../src/game";

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const inGraveyard = (s: GameState, pid: number, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};

// Real oracle text (Scryfall).
const well = card("Wishing Well", "Artifact", "{3}{U}", { oracleText: "{T}: Put a coin counter on this artifact. When you do, you may cast target instant or sorcery card with mana value equal to the number of coin counters on this artifact from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead. Activate only as a sorcery." });
const ping = card("Test Ping", "Sorcery", "{R}", { oracleText: "Test Ping deals 1 damage to any target." });
const blast = card("Test Blast", "Sorcery", "{1}{R}", { oracleText: "Test Blast deals 2 damage to any target." });

describe("Wishing Well", () => {
  it("parse", () => expect(isFullySupported(well)).toBe(true));

  it("with one coin counter, only a mana value 1 card; cast free and exiled after", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, well);
    const p = inGraveyard(s0, ap, ping);
    const b = inGraveyard(s0, ap, blast);
    let s = settle(activate(s0, ap, w, 0));
    expect(s.objects[w]!.counters.coin).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(b)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(p)] }));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: p });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, p, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[p]!.zone).toBe("exile");
  });

  it("with two coin counters, a mana value 2 card", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, well);
    s0.objects[w]!.counters.coin = 1;
    const p = inGraveyard(s0, ap, ping);
    const b = inGraveyard(s0, ap, blast);
    let s = settle(activate(s0, ap, w, 0));
    expect(s.objects[w]!.counters.coin).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(p)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b });
  });
});

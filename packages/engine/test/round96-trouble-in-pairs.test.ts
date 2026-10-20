// Round 96: Trouble in Pairs ("If an opponent would begin an extra turn, that player skips that turn instead", CR 614.10,
// 500.7; three draw triggers, rulings) and Ugin's Nexus-style "If a player would begin an extra turn".

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const trouble = card("Trouble in Pairs", "Enchantment", "{2}{W}{W}", {
  oracleText:
    "If an opponent would begin an extra turn, that player skips that turn instead.\nWhenever an opponent attacks you with two or more creatures, draws their second card each turn, or casts their second spell each turn, you draw a card.",
});
const timeWarp = card("Time Warp", "Sorcery", "{3}{U}{U}", { oracleText: "Target player takes an extra turn after this one." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function stepOnce(s: GameState): GameState {
  const pid = waitingOn(s)!;
  const pend = s.pending;
  if (pend?.kind === "declareAttackers") return act(s, { type: "declareAttackers", player: pid, attacks: [] });
  if (pend?.kind === "declareBlockers") return act(s, { type: "declareBlockers", player: pid, blocks: [] });
  if (pend?.kind === "discardToHandSize") return act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
  return act(s, { type: "passPriority", player: pid });
}
function nextTurns(s: GameState, k: number): PlayerId[] {
  const out: PlayerId[] = [];
  for (let i = 0; i < k; i++) {
    const turn = s.turn;
    for (let j = 0; j < 2000 && s.turn === turn; j++) s = stepOnce(s);
    out.push(s.activePlayer);
  }
  return out;
}
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;

describe("Trouble in Pairs", () => {
  it("parse", () => expect(isFullySupported(trouble)).toBe(true));

  it("an opponent's extra turn is skipped; the normal order goes on", () => {
    const { s: s0, ap, ids } = setup([timeWarp]);
    putOnBattlefield(s0, nextAfter(s0, ap), trouble);
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(s.extraTurns).toHaveLength(1);
    expect(nextTurns(s, 2)).toEqual([nextAfter(s, ap), nextAfter(s, nextAfter(s, ap))]);
    expect(s.log.join("\n")).not.toContain("takes an extra turn");
  });

  it("its controller's own extra turn is taken", () => {
    const { s: s0, ap, ids } = setup([timeWarp]);
    putOnBattlefield(s0, ap, trouble);
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(nextTurns(s, 1)).toEqual([ap]);
  });

  it("once it has left, an extra turn created while it was out is taken (rulings)", () => {
    const { s: s0, ap, ids } = setup([timeWarp]);
    const t = putOnBattlefield(s0, nextAfter(s0, ap), trouble);
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    s.battlefield.splice(s.battlefield.indexOf(t), 1);
    s.objects[t]!.zone = "graveyard";
    expect(nextTurns(s, 1)).toEqual([ap]);
  });

  it("draws when an opponent casts their second spell and when they draw their second card in a turn", () => {
    const { s: s0, ap, ids } = setup([shock, divination]);
    const watcher = nextAfter(s0, ap);
    putOnBattlefield(s0, watcher, trouble);
    s0.players[ap]!.draws = { turn: s0.turn, n: 0 }; // nothing drawn yet this turn
    const hand0 = s0.players[watcher]!.hand.length;
    // The first spell: nothing.
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: watcher }]));
    expect(s.players[watcher]!.hand.length).toBe(hand0);
    // The second spell: one card; it draws two cards, the second of them is their second this turn: another.
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[watcher]!.hand.length).toBe(hand0 + 2);
  });

  it("draws when an opponent attacks it with two or more creatures, not one", () => {
    const { s: s0, ap } = setup([]);
    const watcher = nextAfter(s0, ap);
    putOnBattlefield(s0, watcher, trouble);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    const hand0 = s.players[watcher]!.hand.length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: watcher }, { attacker: b, defender: watcher }] });
    s = settle(s);
    expect(s.players[watcher]!.hand.length).toBe(hand0 + 1);
  });
});

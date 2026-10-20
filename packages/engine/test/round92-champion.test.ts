// Round 92: Champion of Lambholt. "Creatures with power less than this creature's power can't block creatures you
// control." A blocking restriction (CR 509.1b), judged against the Champion's power as blockers are declared.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const champion = card("Champion of Lambholt", "Creature — Human Warrior", "{1}{G}{G}", { power: "1", toughness: "1", oracleText: "Creatures with power less than this creature's power can't block creatures you control.\nWhenever another creature you control enters, put a +1/+1 counter on this creature." });
const wurm = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" });

/** To the declare blockers step, `attacker` attacking `def`. */
function toBlocks(s: GameState, ap: PlayerId, def: PlayerId, attacker: string) {
  for (let i = 0; i < 100 && s.pending?.kind !== "declareBlockers"; i++) {
    const p = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: def }] });
    else s = act(s, { type: "passPriority", player: p });
  }
  expect(s.pending).toMatchObject({ kind: "declareBlockers", player: def });
  return s;
}

describe("Champion of Lambholt", () => {
  it("parse", () => expect(isFullySupported(champion)).toBe(true));

  it("creatures with less power than the Champion can't block your creatures; others can", () => {
    const { s: s0, ap, opp } = setup([]);
    const ch = putOnBattlefield(s0, ap, champion);
    s0.objects[ch]!.counters["+1/+1"] = 2; // 3/3
    const mine = putOnBattlefield(s0, ap, bear());
    const small = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, wurm);
    const s = toBlocks(s0, ap, opp, mine);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: small, attacker: mine }] })).toThrow(/power less than Champion of Lambholt/);
    const s1 = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: big, attacker: mine }] });
    expect(s1.objects[big]!.blocking).toEqual([mine]);
  });

  it("equal power can block", () => {
    const { s: s0, ap, opp } = setup([]);
    const ch = putOnBattlefield(s0, ap, champion);
    s0.objects[ch]!.counters["+1/+1"] = 1; // 2/2
    const mine = putOnBattlefield(s0, ap, bear());
    const small = putOnBattlefield(s0, opp, bear());
    const s = toBlocks(s0, ap, opp, mine);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: small, attacker: mine }] })).not.toThrow();
  });
});

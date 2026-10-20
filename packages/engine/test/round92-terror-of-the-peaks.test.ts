// Round 92: Terror of the Peaks. "Spells your opponents cast that target this creature cost an additional 3 life to
// cast." An additional cost (CR 601.2f), paid once per spell however often it targets it; life can be paid only if
// your life total is at least that much (CR 119.4).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { castProblem, isFullySupported, planCast, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const terror = card("Terror of the Peaks", "Creature — Dragon", "{3}{R}{R}", { power: "5", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nSpells your opponents cast that target this creature cost an additional 3 life to cast.\nWhenever another creature you control enters, this creature deals damage equal to that creature's power to any target." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const castBy = (s: GameState, pid: PlayerId, id: string, target: { kind: "object"; id: string } | { kind: "player"; id: PlayerId }) => planCast(s, pid, id, [target])!.reduce((x, a) => act(x, a), s);

describe("Terror of the Peaks", () => {
  it("parse", () => expect(isFullySupported(terror)).toBe(true));

  it("an opponent's spell targeting it costs 3 life more; its controller's doesn't", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    // Terror is the opponent's; Shock is cast with {R} in the pool.
    const t = putOnBattlefield(s0, opp, terror);
    s0.players[ap]!.manaPool.R = 1;
    const s1 = castBy(s0, ap, ids[0]!, { kind: "object", id: t });
    expect(s1.players[ap]!.life).toBe(37);
    expect(s1.stack).toHaveLength(1);
    // Targeting a player instead: no extra cost.
    const s2 = castBy(s0, ap, ids[0]!, { kind: "player", id: opp });
    expect(s2.players[ap]!.life).toBe(40);
  });

  it("not with less than 3 life", () => {
    const { s, ap, opp, ids } = setup([shock]);
    const t = putOnBattlefield(s, opp, terror);
    s.players[ap]!.life = 2;
    s.players[ap]!.manaPool.R = 1;
    expect(castProblem(s, ap, ids[0]!, [{ kind: "object", id: t }])).toMatch(/life/);
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: t }])).toBeNull();
  });

  it("its controller's own spells pay nothing extra", () => {
    const { s, ap, ids } = setup([shock]);
    const t = putOnBattlefield(s, ap, terror);
    expect(castBy(s, ap, ids[0]!, { kind: "object", id: t }).players[ap]!.life).toBe(40);
  });
});

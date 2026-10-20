// Round 92: Mindbreak Trap. "If an opponent cast three or more spells this turn, you may pay {0} rather than pay this
// spell's mana cost. Exile any number of target spells." One opponent must have cast three (rulings); the spells are
// exiled, not countered, so a spell that can't be countered goes too (rulings).

import { describe, expect, it } from "vitest";
import { act, card, passAll, putOnBattlefield, setup } from "./helpers";
import { castProblem, isFullySupported, moveObject, planCast, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const trap = card("Mindbreak Trap", "Instant — Trap", "{2}{U}{U}", { oracleText: "If an opponent cast three or more spells this turn, you may pay {0} rather than pay this spell's mana cost.\nExile any number of target spells." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "This spell can't be countered.\nLightning Bolt deals 3 damage to any target." });

function inHand(s: GameState, pid: PlayerId, d: Parameters<typeof putOnBattlefield>[2]) {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "hand");
  return id;
}

/** `opp` casts Shock and an uncounterable Bolt at `ap`; `ap` then has priority with Mindbreak Trap in hand. */
function twoSpells() {
  const { s: s0, ap, opp, ids } = setup([trap]);
  let s = s0;
  const a = inHand(s, opp, shock);
  const b = inHand(s, opp, bolt);
  s.players[opp]!.manaPool.R = 2;
  s.priority = opp;
  for (const id of [a, b]) s = planCast(s, opp, id, [{ kind: "player", id: ap }])!.reduce((x, y) => act(x, y), s);
  s.priority = ap;
  return { s, ap, opp, trapId: ids[0]!, spells: s.stack.map((x) => x.id), cards: [a, b] };
}

describe("Mindbreak Trap", () => {
  it("parse", () => expect(isFullySupported(trap)).toBe(true));

  it("exiles any number of target spells, even one that can't be countered", () => {
    const { s: s0, ap, trapId, spells, cards } = twoSpells();
    s0.players[ap]!.manaPool.U = 4;
    let s = planCast(s0, ap, trapId, spells.map((id) => ({ kind: "stack" as const, id })))!.reduce((x, a) => act(x, a), s0);
    s = passAll(s);
    for (const c of cards) expect(s.objects[c]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(40);
  });

  it("{0} only if one opponent cast three or more spells this turn", () => {
    const { s, ap, opp, trapId, spells } = twoSpells();
    const targets = [{ kind: "stack" as const, id: spells[0]! }];
    expect(castProblem(s, ap, trapId, targets, undefined, undefined, undefined, undefined, { alt: "alternative" })).not.toBeNull();
    // Two spells from another opponent don't add up.
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s.castThisTurn = [...(s.castThisTurn ?? []), { player: other, card: "x" }, { player: other, card: "x" }];
    expect(castProblem(s, ap, trapId, targets, undefined, undefined, undefined, undefined, { alt: "alternative" })).not.toBeNull();
    s.castThisTurn.push({ player: opp, card: "x" });
    expect(castProblem(s, ap, trapId, targets, undefined, undefined, undefined, undefined, { alt: "alternative" })).toBeNull();
    const after = passAll(planCast(s, ap, trapId, targets, undefined, "auto", undefined, { alt: "alternative" })!.reduce((x, a) => act(x, a), s));
    expect(after.stack.map((x) => x.id)).toEqual([spells[1]]);
  });
});

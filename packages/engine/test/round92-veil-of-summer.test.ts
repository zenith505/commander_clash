// Round 92: Veil of Summer. "Draw a card if an opponent has cast a blue or black spell this turn. Spells you control
// can't be countered this turn. You and permanents you control gain hexproof from blue and from black until end of turn."
// Hexproof from a color (CR 702.11d, 702.11f): not the target of spells of that color its opponents control, or of
// abilities they control from sources of that color.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { castProblem, isFullySupported, moveObject, planCast, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const veil = card("Veil of Summer", "Instant", "{G}", { oracleText: "Draw a card if an opponent has cast a blue or black spell this turn. Spells you control can't be countered this turn. You and permanents you control gain hexproof from blue and from black until end of turn. (You and they can't be the targets of blue or black spells or abilities your opponents control.)" });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const doomBlade = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const peek = card("Peek", "Instant", "{U}", { oracleText: "Look at target player's hand.\nDraw a card." });
const weaver = card("Sporeweb Weaver", "Creature — Spider", "{2}{G}", { power: "1", toughness: "4", keywords: ["Reach", "Hexproof from", "Hexproof"], oracleText: "Reach, hexproof from blue\nWhenever this creature is dealt damage, you gain 1 life and create a 1/1 green Saproling creature token." });

/** A card in `pid`'s hand. */
function inHand(s: GameState, pid: PlayerId, d: Parameters<typeof putOnBattlefield>[2]) {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "hand");
  return id;
}
const castVeil = (s: GameState, pid: PlayerId, id: string) => passAll(planCast(s, pid, id)!.reduce((x, a) => act(x, a), s));

describe("Veil of Summer", () => {
  it("parse", () => [veil, weaver].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("draws a card only if an opponent has cast a blue or black spell this turn", () => {
    const { s, ap, opp, ids } = setup([veil]);
    const hand = s.players[ap]!.hand.length - 1;
    expect(castVeil(s, ap, ids[0]!).players[ap]!.hand.length).toBe(hand);
    const { s: s2, ap: ap2, opp: opp2, ids: ids2 } = setup([veil]);
    s2.castThisTurn = [{ player: opp2, card: "Murder", colors: ["B"] }];
    expect(castVeil(s2, ap2, ids2[0]!).players[ap2]!.hand.length).toBe(hand + 1);
    void opp;
  });

  it("your spells can't be countered this turn", () => {
    const { s: s0, ap, opp, ids } = setup([veil, bear()]);
    let s = castVeil(s0, ap, ids[0]!);
    s = planCast(s, ap, ids[1]!)!.reduce((x, a) => act(x, a), s);
    const bearSpell = s.stack[s.stack.length - 1]!;
    const cs = inHand(s, opp, counterspell);
    s.players[opp]!.manaPool.U = 2;
    s.priority = opp;
    s = planCast(s, opp, cs, [{ kind: "stack", id: bearSpell.id }])!.reduce((x, a) => act(x, a), s);
    s = passAll(s);
    s = passAll(s);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
  });

  it("you and your permanents have hexproof from blue and from black: opponents' blue and black spells can't target them", () => {
    const { s: s0, ap, opp, ids } = setup([veil]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = castVeil(s0, ap, ids[0]!);
    const murder = inHand(s, opp, doomBlade);
    const sh = inHand(s, opp, shock);
    const pk = inHand(s, opp, peek);
    Object.assign(s.players[opp]!.manaPool, { B: 3, R: 1, U: 1 });
    s.priority = opp;
    expect(castProblem(s, opp, murder, [{ kind: "object", id: b }])).not.toBeNull();
    expect(castProblem(s, opp, pk, [{ kind: "player", id: ap }])).not.toBeNull();
    expect(castProblem(s, opp, sh, [{ kind: "object", id: b }])).toBeNull(); // red
    expect(castProblem(s, opp, sh, [{ kind: "player", id: ap }])).toBeNull();
    // Its controller's own blue spell can.
    s.players[ap]!.manaPool.U = 1;
    s.priority = ap;
    const myPeek = inHand(s, ap, peek);
    expect(castProblem(s, ap, myPeek, [{ kind: "player", id: ap }])).toBeNull();
  });

  it("Sporeweb Weaver: hexproof from blue as a keyword (the card data's \"Hexproof\" isn't hexproof)", () => {
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, opp, weaver);
    const cs = inHand(s, ap, card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." }));
    const sh = inHand(s, ap, shock);
    Object.assign(s.players[ap]!.manaPool, { U: 1, R: 1 });
    expect(castProblem(s, ap, cs, [{ kind: "object", id: w }])).not.toBeNull();
    expect(castProblem(s, ap, sh, [{ kind: "object", id: w }])).toBeNull();
  });
});

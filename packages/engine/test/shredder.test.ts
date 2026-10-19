// Shredder, Shadow Master: "for each other opponent, create a token that's a copy of ~ tapped and attacking that
// player, except it isn't legendary" is myriad's tokens (CR 702.116a) with no "may"; the tokens enter attacking, so they
// don't trigger "whenever ~ attacks" (rulings), and are sacrificed at end of combat.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const shredder = card("Shredder, Shadow Master", "Legendary Creature — Human Ninja", "{3}{B}{B}", {
  power: "5",
  toughness: "5",
  oracleText: "Whenever Shredder attacks a player, for each other opponent, create a token that's a copy of Shredder tapped and attacking that player, except it isn't legendary. Sacrifice those tokens at end of combat.\nWhenever Shredder deals combat damage to a player, that player loses half their life, rounded up.",
});

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const declare = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const named = (s: GameState) => s.battlefield.filter((x) => s.cards[s.objects[x]!.cardId]!.name === "Shredder, Shadow Master");

describe("Shredder, Shadow Master", () => {
  it("compiles", () => expect(isFullySupported(shredder)).toBe(true));

  it("attacking one opponent, a nonlegendary token copy attacks each other opponent; each player hit loses half their life", () => {
    const { s: s0, ap, opp } = setup([]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const sh = putOnBattlefield(s0, ap, shredder);
    let s = declare(s0, ap, [{ attacker: sh, defender: opp }]);
    // No "may": the tokens are just created.
    expect(s.pending?.kind).not.toBe("chooseMay");
    const toks = named(s).filter((x) => s.objects[x]!.isToken);
    expect(toks).toHaveLength(2);
    expect(toks.map((x) => s.objects[x]!.attacking).sort()).toEqual([...others].sort());
    for (const t of toks) {
      expect(s.objects[t]!.tapped).toBe(true);
      expect(characteristics(s, s.objects[t]!).supertypes).not.toContain("Legendary");
    }
    // The tokens didn't attack (they entered attacking): no more tokens from their copies of the ability (rulings).
    s = settle(passUntil(s, "endCombat", ap));
    // 5 combat damage, then half the rest rounded up: 40 - 5 = 35, loses 18.
    for (const p of [opp, ...others]) expect(s.players[p]!.life).toBe(17);
    // Sacrificed at end of combat; Shredder stays.
    s = settle(passUntil(s, "main2", ap));
    expect(named(s)).toEqual([sh]);
  });

  it("attacking a planeswalker isn't attacking a player: no tokens", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shredder);
    const pw = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "9" }));
    s0.objects[pw]!.counters.loyalty = 9;
    const s = settle(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: sh, defender: opp, planeswalker: pw }] }));
    expect(named(s)).toEqual([sh]);
  });
});

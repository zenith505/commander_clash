// Addendum (round 91): "If you cast this spell during your main phase, ..." (CR 207.2c: an ability word, no rules
// meaning of its own). It's whether the spell was cast during its caster's main phase; a copy wasn't cast at all
// (CR 707.10; rulings on Careful Consideration). Also Inspiring Call's "those creatures": the ones it counted.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, objHasKeyword, power, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const formation = card("Unbreakable Formation", "Instant", "{2}{W}", { oracleText: "Creatures you control gain indestructible until end of turn.\nAddendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures and they gain vigilance until end of turn." });
const perception = card("Precognitive Perception", "Instant", "{3}{U}{U}", { oracleText: "Draw three cards.\nAddendum — If you cast this spell during your main phase, instead scry 3, then draw three cards." });
const consideration = card("Careful Consideration", "Instant", "{2}{U}{U}", { oracleText: "Target player draws four cards, then discards three cards. If you cast this spell during your main phase, instead that player draws four cards, then discards two cards." });
const insight = card("Sphinx's Insight", "Instant", "{2}{W}{U}", { oracleText: "Draw two cards.\nAddendum — If you cast this spell during your main phase, you gain 2 life." });
const krosa = card("Might of Old Krosa", "Instant", "{G}", { oracleText: "Target creature gets +2/+2 until end of turn. If you cast this spell during your main phase, that creature gets +4/+4 until end of turn instead." });
const call = card("Inspiring Call", "Instant", "{2}{G}", { oracleText: "Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain indestructible until end of turn." });

const inCombat = (s: GameState) => passUntil(s, "beginCombat", s.activePlayer);

describe("addendum", () => {
  it("parse", () => {
    for (const d of [formation, perception, consideration, insight, krosa, call]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Unbreakable Formation in your main phase: counters and vigilance too", () => {
    const { s: s0, ap, ids } = setup([formation]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = cast(s0, ap, ids[0]!);
    const o = s.objects[b]!;
    expect(objHasKeyword(s, o, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, o, "Vigilance")).toBe(true);
    expect(o.counters["+1/+1"]).toBe(1);
  });

  it("Unbreakable Formation in combat: only indestructible", () => {
    const { s: s0, ap, ids } = setup([formation]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = cast(inCombat(s0), ap, ids[0]!);
    const o = s.objects[b]!;
    expect(objHasKeyword(s, o, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, o, "Vigilance")).toBe(false);
    expect(o.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Sphinx's Insight: 2 life only in your main phase", () => {
    const main = setup([insight]);
    const life = main.s.players[main.ap]!.life;
    expect(cast(main.s, main.ap, main.ids[0]!).players[main.ap]!.life).toBe(life + 2);
    const combat = setup([insight]);
    expect(cast(inCombat(combat.s), combat.ap, combat.ids[0]!).players[combat.ap]!.life).toBe(life);
  });

  it("Might of Old Krosa: +4/+4 in your main phase, +2/+2 otherwise", () => {
    const main = setup([krosa]);
    const b = putOnBattlefield(main.s, main.ap, bear());
    let s = cast(main.s, main.ap, main.ids[0]!, [target(b)]);
    expect(s.objects[b]!.counters).toEqual({});
    expect(power(s, s.objects[b]!)).toBe(6);
    const combat = setup([krosa]);
    const c = putOnBattlefield(combat.s, combat.ap, bear());
    s = cast(inCombat(combat.s), combat.ap, combat.ids[0]!, [target(c)]);
    expect(power(s, s.objects[c]!)).toBe(4);
  });

  it("Precognitive Perception in your main phase: scry 3 (a choice), then draw three", () => {
    const { s: s0, ap, ids } = setup([perception]);
    const hand = s0.players[ap]!.hand.length;
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending?.player).toBe(ap);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    // Keep everything on top.
    const pend = s.pending!;
    if (pend.kind !== "arrangeTop") throw new Error("no scry");
    s = act(s, { type: "arrangeTop", player: ap, top: pend.cards, away: [] });
    for (let i = 0; i < 10 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Precognitive Perception outside your main phase: just three cards", () => {
    const { s: s0, ap, ids } = setup([perception]);
    const hand = s0.players[ap]!.hand.length;
    const s = cast(inCombat(s0), ap, ids[0]!);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Inspiring Call: a card for each creature with a +1/+1 counter, and they gain indestructible", () => {
    const { s: s0, ap, ids } = setup([call]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const c = putOnBattlefield(s0, ap, bear());
    s0.objects[a]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters["+1/+1"] = 2;
    const hand = s0.players[ap]!.hand.length;
    const s = cast(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    expect(objHasKeyword(s, s.objects[a]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[c]!, "Indestructible")).toBe(false);
  });
});

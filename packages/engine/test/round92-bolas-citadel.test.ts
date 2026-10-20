// Round 92: Bolas's Citadel. "You may play lands and cast spells from the top of your library. If you cast a spell this
// way, pay life equal to its mana value rather than pay its mana cost." An alternative cost (CR 118.9; rulings: no other
// alternative cost with it, X is 0, the usual timing, a land uses the turn's land play).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, botActions, castProblem, isFullySupported, planActivate, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const citadel = card("Bolas's Citadel", "Legendary Artifact", "{3}{B}{B}{B}", { oracleText: "You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost.\n{T}, Sacrifice ten nonland permanents: Each opponent loses 10 life." });
const futureSight = card("Future Sight", "Enchantment", "{2}{U}{U}{U}", { oracleText: "Play with the top card of your library revealed.\nYou may play lands and cast spells from the top of your library." });
const ogre = bear({ name: "Hill Ogre", manaCost: "{3}{R}", power: "3", toughness: "3" });

/** `def` on top of `pid`'s library. */
function onTop(s: GameState, pid: PlayerId, def: typeof ogre) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}

describe("Bolas's Citadel", () => {
  it("parse", () => {
    for (const d of [citadel, futureSight]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("casts the top card for life equal to its mana value, not its mana cost", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, citadel);
    const top = onTop(s0, ap, ogre);
    expect(altCostsFor(s0, ap, s0.objects[top]!).map((a) => a.kind)).toEqual(["citadel"]);
    // Not for its mana cost: only for life.
    expect(castProblem(s0, ap, top)).toMatch(/paying life/);
    const plan = planCast(s0, ap, top, undefined, undefined, "auto", undefined, { alt: "citadel" });
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    expect(s.players[ap]!.life).toBe(36);
    expect(s.objects[top]!.zone).toBe("stack");
    expect(Object.values(s.players[ap]!.manaPool).every((n) => n === 0)).toBe(true);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped)).toEqual([]);
  });

  it("plays a land from the top with the turn's land play", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, citadel);
    const land = onTop(s0, ap, forest);
    const s = act(s0, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(40);
  });

  it("with Future Sight too, either way", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, citadel);
    putOnBattlefield(s0, ap, futureSight);
    const top = onTop(s0, ap, ogre);
    expect(planCast(s0, ap, top)).not.toBeNull();
    expect(planCast(s0, ap, top, undefined, undefined, "auto", undefined, { alt: "citadel" })).not.toBeNull();
  });

  it("not from the hand", () => {
    const { s, ap, ids } = setup([ogre]);
    putOnBattlefield(s, ap, citadel);
    expect(altCostsFor(s, ap, s.objects[ids[0]!]!).map((a) => a.kind)).not.toContain("citadel");
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "citadel" })).not.toBeNull();
  });

  it("sacrificing ten nonland permanents: each opponent loses 10 life", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, citadel);
    const fodder = [c, ...Array.from({ length: 9 }, () => putOnBattlefield(s0, ap, bear()))];
    // Only nine others: not enough without the Citadel itself, and lands don't count.
    expect(planActivate(s0, ap, c, 0, undefined, undefined, undefined, undefined, { sacrifice: fodder.slice(1) })).toBeNull();
    const plan = planActivate(s0, ap, c, 0, undefined, undefined, undefined, undefined, { sacrifice: fodder });
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    for (let i = 0; i < 10 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life)).toEqual([30, 30, 30]);
    expect(s.objects[c]!.zone).toBe("graveyard"); // it can be one of the ten (rulings)
  });

  it("a bot casts the top card for life while its life is high", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.isBot = true;
    putOnBattlefield(s0, ap, citadel);
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")) s0.objects[id]!.tapped = true;
    s0.players[ap]!.hand = [];
    const top = onTop(s0, ap, ogre);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === top)).toBe(true);
  });
});

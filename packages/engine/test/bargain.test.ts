// Bargain (CR 702.166): "As an additional cost to cast this spell, you may sacrifice an artifact, enchantment, or
// token." A spell whose bargain cost was paid was bargained (702.166b), which its other abilities check, also on the
// permanent it becomes ("when ~ enters, if it was bargained"); "costs {2} less to cast if it's bargained".

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { bargainCandidates, botActions, castProblem, isFullySupported, manaValue, planCast, spellCost, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const grapple = card("Candy Grapple", "Instant", "{1}{B}", { keywords: ["Bargain"], oracleText: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nTarget creature gets -3/-3 until end of turn. If this spell was bargained, that creature gets -5/-5 until end of turn instead." });
const glutton = card("Hamlet Glutton", "Creature — Giant", "{5}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample", "Bargain"], oracleText: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nThis spell costs {2} less to cast if it's bargained.\nTrample\nWhen this creature enters, you gain 3 life." });
const fae = card("High Fae Negotiator", "Creature — Faerie Warlock", "{3}{B}{B}", { power: "3", toughness: "5", keywords: ["Flying", "Bargain"], oracleText: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nFlying\nWhen this creature enters, if it was bargained, each opponent loses 3 life and you gain 3 life." });
const glory = card("Archon's Glory", "Instant", "{W}", { keywords: ["Bargain"], oracleText: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nTarget creature gets +2/+2 until end of turn. If this spell was bargained, that creature also gains flying and lifelink until end of turn." });
const stopgap = card("Johann's Stopgap", "Sorcery", "{3}{U}", { keywords: ["Bargain"], oracleText: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nThis spell costs {2} less to cast if it's bargained.\nReturn target nonland permanent to its owner's hand. Draw a card." });
const food = card("Food", "Token Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this token: You gain 3 life." });
const giant = card("Hill Giant Test", "Creature — Giant", "{3}{R}", { power: "4", toughness: "4" });

const token = (s: GameState, pid: number, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.isToken = true;
  return id;
};

describe("bargain", () => {
  it("parses", () => {
    supported(grapple, glutton, fae, glory, stopgap);
  });

  it("what can be bargained: your artifacts, enchantments and tokens", () => {
    const { s, ap, opp, ids } = setup([grapple]);
    const f = token(s, ap, food);
    const b = token(s, ap, bear());
    putOnBattlefield(s, ap, bear()); // a nontoken creature isn't one
    token(s, opp, food); // nor is someone else's
    expect(bargainCandidates(s, ap, ids[0]!).sort()).toEqual([f, b].sort());
  });

  it("a bargained spell does its bargained part; unbargained, the other", () => {
    const { s: s0, ap, opp, ids } = setup([grapple]);
    const f = token(s0, ap, food);
    const g = putOnBattlefield(s0, opp, giant);
    expect(castProblem(s0, ap, ids[0]!, [target(g)], undefined, undefined, undefined, undefined, { bargain: g })).toMatch(/bargain sacrifices/);
    let s = cast(s0, ap, ids[0]!, [target(g)]);
    expect(pt(s, g)).toBe("1/1");
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([grapple]);
    const f1 = token(s1, ap1, food);
    const g1 = putOnBattlefield(s1, opp1, giant);
    s = s1;
    for (const a of planCast(s1, ap1, ids1[0]!, [target(g1)], undefined, "auto", undefined, { bargain: f1 })!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[f1]?.zone).not.toBe("battlefield");
    expect(s.objects[g1]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /sacrifices Food \(bargain\)/.test(l.text))).toBe(true);
    expect(f).toBeDefined();
  });

  it("'costs {2} less if it's bargained'", () => {
    const { s, ap, ids } = setup([glutton]);
    const f = token(s, ap, food);
    const cost = (bargain?: string) => {
      const c = spellCost(s, ap, s.objects[ids[0]!]!, 0, [], bargain ? { bargain } : {});
      return manaValue(c.cost) + c.extra;
    };
    expect(cost()).toBe(7);
    expect(cost(f)).toBe(5);
  });

  it("'when ~ enters, if it was bargained' sees how the spell was cast", () => {
    const { s: s0, ap, opp, ids } = setup([fae]);
    const f = token(s0, ap, food);
    let s = s0;
    for (const a of planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { bargain: f })!) s = act(s, a);
    for (let i = 0; i < 12 && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(37);
    expect(s.players[ap]!.life).toBe(43);
    expect(s.objects[ids[0]!]!.bargained).toBe(true);

    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([fae]);
    s = cast(s1, ap1, ids1[0]!);
    for (let i = 0; i < 12 && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp1]!.life).toBe(40);
  });

  it("a bot bargains a spare token", () => {
    const { s: s0, ap, opp, ids } = setup([stopgap]);
    const f = token(s0, ap, food);
    putOnBattlefield(s0, opp, giant);
    let s = s0;
    // It may cast its commander first; let that resolve.
    for (let i = 0; i < 30 && s.stack.at(-1)?.objectId !== ids[0]; i++)
      if (s.stack.length || waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.stack.at(-1)).toMatchObject({ objectId: ids[0] });
    expect(s.objects[f]?.zone).not.toBe("battlefield");
  });
});

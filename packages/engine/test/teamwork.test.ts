// Teamwork N (Marvel Super Heroes): "As an additional cost to cast this spell, you may tap any number of creatures you
// control with total power N or more." The rules text checks "if this spell was cast using teamwork". There is no CR
// entry yet; the reminder text is the rule. Tapping creatures for it isn't a {T} cost, so summoning-sick creatures can
// help (CR 302.6). Also "Choose one. If you control a commander as you cast this spell, you may choose both instead."

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, isFullySupported, objHasKeyword, planCast, teamworkCandidates, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** No problem but the mana, which the lands on the battlefield pay for (castProblem looks at the mana pool). */
const MANA_ONLY = /^not enough mana/;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

// Real oracle text (Scryfall).
const reminder = (n: number) => `Teamwork ${n} (As an additional cost to cast this spell, you may tap any number of creatures you control with total power ${n} or more.)`;
const beastMode = card("Beast Mode", "Instant", "{1}{G}", { keywords: ["Teamwork"], oracleText: `${reminder(1)}\nTarget creature gets +2/+2 and gains trample until end of turn. Also put a +1/+1 counter on that creature if this spell was cast using teamwork.` });
const goNuts = card("Go Nuts!", "Sorcery", "{G}", { keywords: ["Teamwork"], oracleText: `${reminder(3)}\nChoose one. If this spell was cast using teamwork, choose both instead.\n• Put a +1/+1 counter on target creature.\n• Target creature you control fights target creature an opponent controls.` });
const murdock = card("Murdock's Crusade", "Sorcery", "{1}{W}", { keywords: ["Teamwork"], oracleText: `${reminder(4)}\nChoose one. If this spell was cast using teamwork, choose both instead.\n• Street Justice — Exile target creature with toughness 4 or greater.\n• Legal Justice — Exile target enchantment with mana value 4 or greater.` });
const quantum = card("Quantum Reduction", "Enchantment — Aura", "{1}{U}", { keywords: ["Teamwork", "Enchant"], oracleText: `${reminder(2)}\nYou may cast this spell as though it had flash if it's cast using teamwork.\nEnchant creature\nEnchanted creature gets -5/-0 and loses all abilities.` });
const inquiry = card("Timeline Inquiry", "Instant", "{3}{U}", { keywords: ["Teamwork"], oracleText: `${reminder(2)}\nDraw three cards. Then discard a card unless this spell was cast using teamwork.` });
const helicarrier = card("Helicarrier Strike", "Instant", "{W}", { keywords: ["Teamwork"], oracleText: `${reminder(2)}\nHelicarrier Strike deals 2 damage to target attacking or blocking creature. If this spell was cast using teamwork, it deals 4 damage to that creature instead.` });
const repulsor = card("Repulsor Blast", "Sorcery", "{3}{R}", { keywords: ["Teamwork"], oracleText: `${reminder(2)}\nRepulsor Blast deals 5 damage to target creature. If this spell was cast using teamwork, it also deals 2 damage to that creature's controller.` });
const heroic = card("Heroic Teamwork", "Instant", "{2}{W}", { keywords: ["Teamwork"], oracleText: `${reminder(3)}\nOne or two target creatures each get +2/+1 until end of turn. If this spell was cast using teamwork, draw a card.` });
const akroma = card("Akroma's Will", "Instant", "{3}{W}", { oracleText: "Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Creatures you control gain flying, vigilance, and double strike until end of turn.\n• Creatures you control gain lifelink, indestructible, and protection from each color until end of turn." });
const giant = card("Hill Giant Test", "Creature — Giant", "{3}{R}", { power: "4", toughness: "4" });
const pump = card("Wall Test", "Creature — Wall", "{1}", { power: "0", toughness: "4" });

describe("teamwork", () => {
  it("parses", () => {
    supported(beastMode, goNuts, murdock, quantum, inquiry, helicarrier, repulsor, heroic, akroma);
  });

  it("paid: the creatures are tapped and the spell does its teamwork part", () => {
    const { s: s0, ap, ids } = setup([beastMode]);
    const a = putOnBattlefield(s0, ap, bear());
    const helper = putOnBattlefield(s0, ap, bear(), { sick: true }); // summoning sick creatures can be tapped for it
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(a)], undefined, "auto", undefined, { teamwork: [helper] }));
    expect(s.objects[helper]!.tapped).toBe(true);
    expect(s.objects[ids[0]!]!.teamwork).toBe(true);
    s = settle(s);
    expect(pt(s, a)).toBe("5/5");
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[a]!, "Trample")).toBe(true);
  });

  it("not paid: no teamwork part", () => {
    const { s: s0, ap, ids } = setup([beastMode]);
    const a = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(a)]));
    expect(s.objects[ids[0]!]!.teamwork).toBeUndefined();
    s = settle(s);
    expect(pt(s, a)).toBe("4/4");
    expect(s.objects[a]!.counters["+1/+1"]).toBeUndefined();
  });

  it("the tapped creatures need total power N or more; tapped ones and others' don't count", () => {
    const { s, ap, opp, ids } = setup([goNuts]);
    const a = putOnBattlefield(s, ap, bear());
    const wall = putOnBattlefield(s, ap, pump);
    const theirs = putOnBattlefield(s, opp, giant);
    const tapped = putOnBattlefield(s, ap, giant);
    s.objects[tapped]!.tapped = true;
    expect(teamworkCandidates(s, ap).sort()).toEqual([a, wall].sort());
    const both = [target(a), target(a), target(theirs)];
    expect(castProblem(s, ap, ids[0]!, both, [0, 1], undefined, undefined, undefined, { teamwork: [a, wall] })).toMatch(/total power 3 or more/);
    expect(castProblem(s, ap, ids[0]!, both, [0, 1], undefined, undefined, undefined, { teamwork: [theirs] })).not.toBeNull();
    expect(castProblem(s, ap, ids[0]!, both, [0, 1], undefined, undefined, undefined, { teamwork: [tapped] })).not.toBeNull();
  });

  it("'choose one; if cast using teamwork, choose both instead'", () => {
    const { s: s0, ap, opp, ids } = setup([goNuts]);
    const a = putOnBattlefield(s0, ap, giant);
    const theirs = putOnBattlefield(s0, opp, bear());
    const both = [target(a), target(a), target(theirs)];
    // Without teamwork, exactly one mode; with it, both.
    expect(castProblem(s0, ap, ids[0]!, both, [0, 1])).toMatch(/mode/);
    expect(castProblem(s0, ap, ids[0]!, [target(a)], [0], undefined, undefined, undefined, { teamwork: [a] })).toMatch(/mode/);
    let s = run(s0, planCast(s0, ap, ids[0]!, both, [0, 1], "auto", undefined, { teamwork: [a] }));
    s = settle(s);
    // The counter first (5/5), then the fight: the bear dies, the giant takes 2.
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[a]!.damage).toBe(2);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("modes with flavor names (Street Justice, Legal Justice)", () => {
    const { s, ap, opp, ids } = setup([murdock]);
    const g = putOnBattlefield(s, opp, giant);
    expect(castProblem(s, ap, ids[0]!, [target(g)], [0])).toMatch(MANA_ONLY);
  });

  it("'as though it had flash if it's cast using teamwork'", () => {
    const { s: s0, ap, opp, ids } = setup([quantum]);
    const a = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, giant);
    const s = passUntil(s0, "beginCombat", ap);
    expect(castProblem(s, ap, ids[0]!, [target(theirs)])).toMatch(/sorcery|main phase|timing|instant/i);
    expect(castProblem(s, ap, ids[0]!, [target(theirs)], undefined, undefined, undefined, undefined, { teamwork: [a] })).toMatch(MANA_ONLY);
    expect(planCast(s, ap, ids[0]!, [target(theirs)], undefined, "auto", undefined, { teamwork: [a] })).not.toBeNull();
  });

  it("'then discard a card unless this spell was cast using teamwork'", () => {
    const { s: s0, ap, ids } = setup([inquiry]);
    const a = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { teamwork: [a] })));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);

    const { s: s1, ap: ap1, ids: ids1 } = setup([inquiry]);
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap1 });
  });

  it("'also deals 2 damage to that creature's controller'", () => {
    const { s: s0, ap, opp, ids } = setup([repulsor]);
    const a = putOnBattlefield(s0, ap, bear());
    const g = putOnBattlefield(s0, opp, giant);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(g)], undefined, "auto", undefined, { teamwork: [a] })));
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(38);
  });

  it("a bot uses teamwork when it has spare creatures", () => {
    const { s: s0, ap, opp, ids } = setup([goNuts]);
    const g = ids[0]!;
    putOnBattlefield(s0, ap, giant);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    // Only Go Nuts! in hand, so the bot doesn't spend its green mana on other cards first.
    for (const id of s0.players[ap]!.hand.filter((h) => h !== g)) {
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    s0.players[ap]!.hand = [g];
    let s = s0;
    for (let i = 0; i < 30 && s.stack.at(-1)?.objectId !== g; i++)
      if (s.stack.length || waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else for (const x of botActions(s, ap)) s = act(s, x);
    expect(s.stack.at(-1)).toMatchObject({ objectId: g });
    expect(s.objects[g]!.teamwork).toBe(true);
    expect(s.stack.at(-1)!.modes).toEqual([0, 1]);
  });
});

describe("'if you control a commander as you cast this spell, you may choose both instead'", () => {
  it("both modes only while you control a commander", () => {
    const { s: s0, ap, ids } = setup([akroma]);
    const a = putOnBattlefield(s0, ap, bear());
    expect(castProblem(s0, ap, ids[0]!, [], [0, 1])).toMatch(/mode/);
    expect(castProblem(s0, ap, ids[0]!, [], [1])).toMatch(MANA_ONLY);
    putOnBattlefield(s0, ap, giant, { commander: true });
    expect(castProblem(s0, ap, ids[0]!, [], [0, 1])).toMatch(MANA_ONLY);
    expect(castProblem(s0, ap, ids[0]!, [], [0])).toMatch(MANA_ONLY); // "may"
    const s = passAll(settle(run(s0, planCast(s0, ap, ids[0]!, [], [0, 1]))));
    expect(objHasKeyword(s, s.objects[a]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[a]!, "Indestructible")).toBe(true);
  });
});

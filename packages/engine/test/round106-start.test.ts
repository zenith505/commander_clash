// Round 106, the first popular cards: Brass's Tunnel-Grinder ("then if there are three or more bore counters on it,
// remove those counters and transform it"), March of Swirling Mist (exile any number of blue cards from your hand, each
// {2} off), Return to Dust (the second target is exiled only if it was cast in your main phase), Defiler of Vigor (an
// optional 2 life for {G} less on green permanent spells).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { castProblem, isFullySupported, lifeCostOffers, planCast, spellCost, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const grinder = scry("transform", [
  { name: "Brass's Tunnel-Grinder", mana_cost: "{2}{R}", type_line: "Legendary Artifact", oracle_text: "When Brass's Tunnel-Grinder enters, discard any number of cards, then draw that many cards plus one.\nAt the beginning of your end step, if you descended this turn, put a bore counter on Brass's Tunnel-Grinder. Then if there are three or more bore counters on it, remove those counters and transform it. (You descended if a permanent card was put into your graveyard from anywhere.)" },
  { name: "Tecutlan, the Searing Rift", type_line: "Legendary Land — Cave", oracle_text: "(Transforms from Brass's Tunnel-Grinder.)\n{T}: Add {R}.\nWhenever you cast a permanent spell using mana produced by Tecutlan, discover X, where X is that spell's mana value." },
], { keywords: ["Transform", "Discover"] });
const march = card("March of Swirling Mist", "Instant", "{X}{U}", { oracleText: "As an additional cost to cast this spell, you may exile any number of blue cards from your hand. This spell costs {2} less to cast for each card exiled this way.\nUp to X target creatures phase out. (While they're phased out, they're treated as though they don't exist. Each one phases in before its controller untaps during their next untap step.)" });
const dust = card("Return to Dust", "Instant", "{2}{W}{W}", { oracleText: "Exile target artifact or enchantment. If you cast this spell during your main phase, you may exile up to one other target artifact or enchantment." });
const defiler = card("Defiler of Vigor", "Creature — Phyrexian Wurm", "{3}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nAs an additional cost to cast green permanent spells, you may pay 2 life. Those spells cost {G} less to cast if you paid life this way. This effect reduces only the amount of green mana you pay.\nWhenever you cast a green permanent spell, put a +1/+1 counter on each creature you control." });

// Test cards.
const blue = (name: string) => card(name, "Instant", "{1}{U}", { oracleText: "Draw a card." });
const relic = (name: string) => card(name, "Artifact", "{2}");
const greenOx = card("Green Ox", "Creature — Ox", "{2}{G}{G}", { power: "3", toughness: "3" });
const redOx = card("Red Ox", "Creature — Ox", "{2}{R}{R}", { power: "3", toughness: "3" });
const growth = card("Test Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return settle(s);
};
const show = (c: ReturnType<typeof spellCost>) => `${c.cost.symbols.map((y) => (y.kind === "colored" ? y.color : y.kind === "generic" ? String(y.amount) : y.kind)).join("")}+${c.extra}`;
const toYard = (s: GameState, pid: PlayerId, id: string) => {
  s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
};

describe("round 106: the first popular cards", () => {
  it("parse", () => [grinder, march, dust, defiler].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Brass's Tunnel-Grinder: a bore counter at your end step only if you descended; the third transforms it", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, grinder);
    // Not descended: no trigger.
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    expect(s.objects[g]!.counters.bore ?? 0).toBe(0);
    // Descended (a permanent card put into your graveyard this turn) with two counters already: the third transforms it.
    s = passUntil(s, "main1", ap);
    s.objects[g]!.counters.bore = 2;
    s.descendedThisTurn = [ap];
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[g]!.counters.bore ?? 0).toBe(0);
    expect(s.objects[g]!.face).toBe(1);
  });

  it("Brass's Tunnel-Grinder: below three counters it stays as it is", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, grinder);
    s0.descendedThisTurn = [ap];
    const s = settle(passUntil(s0, "end", ap));
    expect(s.objects[g]!.counters.bore).toBe(1);
    expect(s.objects[g]!.face ?? 0).toBe(0);
  });

  it("Tecutlan: a permanent spell cast with its mana discovers; one cast with other mana doesn't", () => {
    const { s: s0, ap, ids } = setup([card("Red Imp", "Creature — Imp", "{R}", { power: "1", toughness: "1" }), card("Green Imp", "Creature — Imp", "{G}", { power: "1", toughness: "1" })]);
    const t = putOnBattlefield(s0, ap, grinder);
    s0.objects[t]!.face = 1;
    for (const id of s0.battlefield) if (id !== t && s0.objects[id]!.controller === ap && !s0.cards[s0.objects[id]!.cardId]!.subtypes.includes("Forest")) s0.objects[id]!.tapped = true;
    let s = s0;
    const plan = planCast(s, ap, ids[0]!);
    for (const a of plan!) s = act(s, a);
    expect(s.objects[t]!.tapped).toBe(true);
    expect(s.stack.at(-1)!.body?.text ?? "").toMatch(/discover/i);
    // Its mana is gone: the Green Imp is cast with a Forest.
    s = settle(s);
    const s2 = run(s, planCast(s, ap, ids[1]!));
    expect(s2.log.slice(-12).join("\n")).not.toMatch(/discover/i);
  });

  it("March of Swirling Mist: each blue card exiled takes {2} off, down to {U}", () => {
    const { s: s0, ap, ids } = setup([march, blue("Blue A"), blue("Blue B"), relic("Not Blue")]);
    const [m, a, b, r] = ids as [string, string, string, string];
    const o = s0.objects[m]!;
    expect(show(spellCost(s0, ap, o, 3))).toBe("xU+3");
    expect(show(spellCost(s0, ap, o, 3, [], { exileFromHand: [a] }))).toBe("xU+1");
    expect(show(spellCost(s0, ap, o, 3, [], { exileFromHand: [a, b] }))).toBe("xU+0");
    // X=3 with two cards exiled: {3}{U} minus {4} is {U} (never below its colored mana).
    expect(castProblem(s0, ap, m, undefined, undefined, undefined, undefined, undefined, { exileFromHand: [r] })).toMatch(/blue card/);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const plan = planCast(s0, ap, m, [target(mine), target(theirs)], undefined, "auto", 2, { exileFromHand: [a, b] });
    expect(plan).not.toBeNull();
    const lands = () => s0.battlefield.filter((id) => s0.cards[s0.objects[id]!.cardId]!.types.includes("Land"));
    const before = lands().filter((id) => !s0.objects[id]!.tapped).length;
    const s = run(s0, plan);
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[r]!.zone).toBe("hand");
    expect(s.objects[mine]!.zone).toBe("phasedOut");
    expect(s.objects[theirs]!.zone).toBe("phasedOut");
    // Only {U} was paid: one land tapped.
    expect(before - lands().filter((id) => !s.objects[id]!.tapped).length).toBe(1);
  });

  it("March of Swirling Mist: exiling none is fine", () => {
    const { s: s0, ap, ids } = setup([march, blue("Blue A")]);
    const bearId = putOnBattlefield(s0, ap, bear());
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(bearId)], undefined, "auto", 1));
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.objects[bearId]!.zone).toBe("phasedOut");
  });

  it("Return to Dust: in your main phase, both targets are exiled", () => {
    const { s: s0, ap, opp, ids } = setup([dust]);
    const [r1, r2] = [putOnBattlefield(s0, opp, relic("Relic 1")), putOnBattlefield(s0, opp, relic("Relic 2"))];
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(r1), target(r2)]));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[r1]!.zone).toBe("exile");
    expect(s.objects[r2]!.zone).toBe("exile");
  });

  it("Return to Dust: on another turn it can still target two, but exiles only the first (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([dust]);
    const [r1, r2] = [putOnBattlefield(s0, opp, relic("Relic 1")), putOnBattlefield(s0, opp, relic("Relic 2"))];
    let s = passUntil(s0, "upkeep", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, ap, ids[0]!, [target(r1), target(r2)]));
    expect(s.pending).toBeFalsy();
    expect(s.objects[r1]!.zone).toBe("exile");
    expect(s.objects[r2]!.zone).toBe("battlefield");
  });

  it("Defiler of Vigor: 2 life takes {G} off a green permanent spell; not other spells; once per spell", () => {
    const { s: s0, ap, ids } = setup([greenOx, redOx, growth]);
    const [g, r, i] = ids as [string, string, string];
    const d = putOnBattlefield(s0, ap, defiler);
    expect(lifeCostOffers(s0, ap, g)).toEqual([{ id: d, life: 2 }]);
    expect(lifeCostOffers(s0, ap, r)).toEqual([]);
    expect(lifeCostOffers(s0, ap, i)).toEqual([]);
    expect(show(spellCost(s0, ap, s0.objects[g]!, 0))).toBe("GG+2");
    expect(show(spellCost(s0, ap, s0.objects[g]!, 0, [], { lifeFor: [d] }))).toBe("G+2");
    expect(castProblem(s0, ap, r, undefined, undefined, undefined, undefined, undefined, { lifeFor: [d] })).toMatch(/can't pay life/);
    expect(castProblem(s0, ap, g, undefined, undefined, undefined, undefined, undefined, { lifeFor: [d, d] })).toMatch(/can't pay life/);
    const life = s0.players[ap]!.life;
    const s = run(s0, planCast(s0, ap, g, undefined, undefined, "auto", undefined, { lifeFor: [d] }));
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.objects[g]!.zone).toBe("battlefield");
    // Its cast trigger: a +1/+1 counter on each creature you control (the Ox wasn't on the battlefield yet).
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
  });

  it("Defiler of Vigor: not paying life, the spell costs as much as ever", () => {
    const { s: s0, ap, ids } = setup([greenOx]);
    putOnBattlefield(s0, ap, defiler);
    const life = s0.players[ap]!.life;
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.players[ap]!.life).toBe(life);
  });
});

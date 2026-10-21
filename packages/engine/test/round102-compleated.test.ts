// Round 102: compleated (CR 702.150a) and hybrid Phyrexian mana ({G/W/P}, CR 107.4f), Vraska, Betrayal's Sting's −2 and
// −9, Chromatic Orrery's mana paying a Phyrexian symbol (CR 609.4b), and Valgavoth (cards it exiles, played for life).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, castProblem, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const vraska = card("Vraska, Betrayal's Sting", "Legendary Planeswalker — Vraska", "{4}{B}{B/P}", { loyalty: "6", keywords: ["Proliferate", "Compleated"], oracleText: "Compleated ({B/P} can be paid with {B} or 2 life. If life was paid, this planeswalker enters with two fewer loyalty counters.)\n0: You draw a card and lose 1 life. Proliferate.\n−2: Target creature becomes a Treasure artifact with \"{T}, Sacrifice this artifact: Add one mana of any color\" and loses all other card types and abilities.\n−9: If target player has fewer than nine poison counters, they get a number of poison counters equal to the difference." });
const ajani = card("Ajani, Sleeper Agent", "Legendary Planeswalker — Ajani", "{1}{G}{G/W/P}{W}", { loyalty: "4", keywords: ["Compleated"], oracleText: "Compleated ({G/W/P} can be paid with {G}, {W}, or 2 life. If life was paid, this planeswalker enters with two fewer loyalty counters.)\n+1: Reveal the top card of your library. If it's a creature or planeswalker card, put it into your hand. Otherwise, you may put it on the bottom of your library.\n−3: Distribute three +1/+1 counters among up to three target creatures. They gain vigilance until end of turn.\n−6: You get an emblem with \"Whenever you cast a creature or planeswalker spell, target opponent gets two poison counters.\"" });
const orrery = card("Chromatic Orrery", "Legendary Artifact", "{7}", { oracleText: "You may spend mana as though it were mana of any color.\n{T}: Add {C}{C}{C}{C}{C}.\n{5}, {T}: Draw a card for each color among permanents you control." });
const valgavoth = card("Valgavoth, Terror Eater", "Legendary Creature — Elder Demon", "{6}{B}{B}{B}", { power: "9", toughness: "9", keywords: ["Flying", "Lifelink", "Ward"], oracleText: "Flying, lifelink\nWard—Sacrifice three nonland permanents.\nIf a card you didn't control would be put into an opponent's graveyard from anywhere, exile it instead.\nDuring your turn, you may play cards exiled with Valgavoth. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost." });
const probe = card("Gitaxian Probe", "Sorcery", "{U/P}", { oracleText: "({U/P} can be paid with either {U} or 2 life.)\nLook at target player's hand.\nDraw a card." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = pass(s);
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do it");
  return settle(plan.reduce((x, a) => act(x, a), s));
};
/** Only the mana in the pool pays: every land tapped. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, pool);
};

describe("round 102: compleated, Phyrexian mana, Valgavoth", () => {
  it("parse", () => {
    for (const c of [vraska, ajani, valgavoth]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("compleated: two fewer loyalty counters when life paid for the Phyrexian symbol, all of them otherwise", () => {
    for (const life of [true, false]) {
      const { s: s0, ap, ids } = setup([vraska]);
      poolOnly(s0, ap, life ? { C: 4, B: 1 } : { C: 4, B: 2 });
      const s = run(s0, planCast(s0, ap, ids[0]!));
      expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
      expect(s.objects[ids[0]!]!.counters.loyalty).toBe(life ? 4 : 6);
      expect(s.players[ap]!.life).toBe(life ? 38 : 40);
    }
  });

  it("hybrid Phyrexian {G/W/P}: either color or 2 life; compleated counts it", () => {
    for (const [pool, loyalty, lifeLeft] of [[{ C: 1, G: 1, W: 2 }, 4, 40], [{ C: 1, G: 1, W: 1 }, 2, 38]] as const) {
      const { s: s0, ap, ids } = setup([ajani]);
      poolOnly(s0, ap, pool);
      const s = run(s0, planCast(s0, ap, ids[0]!));
      expect(s.objects[ids[0]!]!.counters.loyalty).toBe(loyalty);
      expect(s.players[ap]!.life).toBe(lifeLeft);
    }
  });

  it("Vraska −2: the creature becomes only a Treasure artifact with the mana ability; −9: up to nine poison counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vraska);
    s0.objects[v]!.counters.loyalty = 12;
    const b = putOnBattlefield(s0, opp, bear({ name: "Legendary Bear", typeLine: "Legendary Creature — Bear", supertypes: ["Legendary"] }));
    let s = run(s0, planActivate(s0, ap, v, 1, [target(b)]));
    const c = characteristics(s, s.objects[b]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Treasure"]);
    expect(c.supertypes).toContain("Legendary");
    expect(abilitiesOf(s, s.objects[b]!).mana).toHaveLength(1);
    // −9 next turn: from 3 poison counters to 9.
    s.players[opp]!.poison = 3;
    delete s.activatedThisTurn;
    for (const id of s.battlefield) s.objects[id]!.activatedThisTurn = undefined;
    s = run(s, planActivate(s, ap, v, 2, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.poison).toBe(9);
  });

  it("Chromatic Orrery: any mana pays a Phyrexian symbol, so no life is paid", () => {
    for (const withOrrery of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([probe]);
      if (withOrrery) putOnBattlefield(s0, ap, orrery);
      poolOnly(s0, ap, { C: 1 });
      const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
      expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
      expect(s.players[ap]!.life).toBe(withOrrery ? 40 : 38);
      expect(s.players[ap]!.manaPool.C).toBe(withOrrery ? 0 : 1);
    }
  });

  it("Valgavoth: an opponent's dying creature is exiled with it, and cast during your turn only for life", () => {
    const { s: s0, ap, opp, ids } = setup([murder]);
    putOnBattlefield(s0, ap, valgavoth);
    const g = putOnBattlefield(s0, opp, giant);
    const mine = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.manaPool.B = 3;
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(g)]));
    expect(s.objects[g]!.zone).toBe("exile");
    // Murder is our card: it goes to our graveyard as usual.
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // Cast for life equal to its mana value (4), and not for mana.
    expect(castProblem(s, ap, g)).toMatch(/pay life/);
    expect(castProblem(s, ap, g, undefined, undefined, undefined, undefined, undefined, { alt: "citadel" })).toBeNull();
    const plan = planCast(s, ap, g, undefined, undefined, undefined, undefined, { alt: "citadel" });
    s = run(s, plan);
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.controller).toBe(ap);
    expect(s.players[ap]!.life).toBe(36);
    // It's ours now: when it dies, it goes to its owner's graveyard (we controlled it).
    s.objects[g]!.damage = 5;
    invalidateCharacteristics(s);
    s = settle(pass(s));
    expect(s.objects[g]!.zone).toBe("graveyard");
    // Our own creature dying goes to our graveyard.
    s.objects[mine]!.damage = 5;
    s = settle(pass(s));
    expect(s.objects[mine]!.zone).toBe("graveyard");
  });

  it("Valgavoth: a discarded card is exiled too; not castable during an opponent's turn", () => {
    const rot = card("Mind Rot", "Sorcery", "{2}{B}", { oracleText: "Target player discards two cards." });
    const { s: s0, ap, opp, ids } = setup([rot]);
    putOnBattlefield(s0, ap, valgavoth);
    const g = putOnBattlefield(s0, opp, giant);
    s0.battlefield.splice(s0.battlefield.indexOf(g), 1);
    s0.objects[g]!.zone = "hand";
    s0.players[opp]!.hand = [g];
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.B = 3;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    while (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: s.pending.player, objectIds: s.players[s.pending.player]!.hand.slice(0, s.pending.count) }));
    expect(s.objects[g]!.zone).toBe("exile");
    expect(castProblem(s, ap, g, undefined, undefined, undefined, undefined, undefined, { alt: "citadel" })).toBeNull();
    // During an opponent's turn: no permission.
    s = passUntil(s, "main1", opp);
    expect(castProblem(s, ap, g, undefined, undefined, undefined, undefined, undefined, { alt: "citadel" })).not.toBeNull();
  });
});

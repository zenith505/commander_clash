// "Whenever you cast a spell that targets a creature you control" (Season of Growth), repartee's "an instant or sorcery
// spell that targets a creature", "... that targets an opponent or a creature an opponent controls" (Danitha), "an
// opponent casts a spell that targets you or a creature you control" (Reparations): what the spell targets as it's cast
// (CR 601.2c). Rulings: it triggers once however many of its targets match, and "you" is the ability's controller.

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passAll, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, planCast, waitingOn, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const growth = card("Season of Growth", "Enchantment", "{1}{G}", { keywords: ["Scry"], oracleText: "Whenever a creature you control enters, scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nWhenever you cast a spell that targets a creature you control, draw a card." });
const danitha = card("Danitha, Spear of Agony", "Legendary Creature — Human Knight", "{2}{B}", { power: "2", toughness: "2", keywords: ["First strike"], oracleText: "First strike\nWhenever you cast a spell that targets an opponent or a creature an opponent controls, put a +1/+1 counter on Danitha." });
const reparations = card("Reparations", "Enchantment", "{1}{W}{U}", { oracleText: "Whenever an opponent casts a spell that targets you or a creature you control, you may draw a card." });
const graduation = card("Graduation Day", "Enchantment", "{W}", { keywords: ["Repartee"], oracleText: "Repartee — Whenever you cast an instant or sorcery spell that targets a creature, put a +1/+1 counter on target creature you control." });
const tandem = card("Tandem Tactics", "Instant", "{1}{W}", { oracleText: "Up to two target creatures each get +1/+2 until end of turn. You gain 2 life." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const spike = card("Lava Spike", "Sorcery — Arcane", "{R}", { oracleText: "Lava Spike deals 3 damage to target player or planeswalker." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
const hand = (s: GameState, p: number) => s.players[p]!.hand.length;

describe("cast triggers about a spell's targets", () => {
  it("compiles them", () => {
    supported(growth, danitha, reparations, graduation);
    expect(compileCard(reparations).triggers[0]!.cast).toMatchObject({ by: "opponent", targets: ["you", { kind: "object", controller: "you" }] });
    expect(compileCard(graduation).triggers[0]!.cast).toMatchObject({ spell: { types: ["Instant", "Sorcery"] }, targets: [{ kind: "object", types: ["Creature"] }] });
  });

  it("Season of Growth: one card for a spell targeting two of your creatures, none for one targeting theirs", () => {
    let { s, ap, opp, ids } = setup([tandem, shock]);
    putOnBattlefield(s, ap, growth);
    const [a, b] = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    const theirs = putOnBattlefield(s, opp, bear());
    const before = hand(s, ap);
    s = run(s, planCast(s, ap, ids[0]!, [target(a), target(b)]));
    expect(s.stack).toHaveLength(2); // the trigger is above the spell (rulings)
    s = passAll(s);
    expect(hand(s, ap)).toBe(before - 1 + 1);
    s = passAll(run(s, planCast(s, ap, ids[1]!, [target(theirs)])));
    expect(hand(s, ap)).toBe(before - 2 + 1);
    expect(s.battlefield).not.toContain(theirs);
  });

  it("Danitha: a counter for a spell targeting an opponent, none for one targeting you", () => {
    let { s, ap, opp, ids } = setup([spike, shock]);
    const d = putOnBattlefield(s, ap, danitha);
    s = passAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
    s = passAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: ap }])));
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
  });

  it("Reparations: an opponent's spell at you or your creature lets you draw; yours doesn't", () => {
    let { s, ap, opp, ids } = setup([shock]);
    // The opponent controls Reparations; you (the active player) cast Shock at their creature.
    putOnBattlefield(s, opp, reparations);
    const theirs = putOnBattlefield(s, opp, bear());
    const before = hand(s, opp);
    s = run(s, planCast(s, ap, ids[0]!, [target(theirs)]));
    expect(s.stack).toHaveLength(2);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = passAll(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(hand(s, opp)).toBe(before + 1);
    // Your own Reparations doesn't care about your spells.
    let t = setup([shock]);
    putOnBattlefield(t.s, t.ap, reparations);
    putOnBattlefield(t.s, t.ap, mountain);
    t.s = run(t.s, planCast(t.s, t.ap, t.ids[0]!, [{ kind: "player", id: t.ap }]));
    expect(t.s.stack).toHaveLength(1);
  });

  it("Graduation Day: only instants and sorceries that target a creature, and then a target of its own", () => {
    let { s, ap, opp, ids } = setup([shock, spike]);
    putOnBattlefield(s, ap, graduation);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    // Lava Spike at a player: no trigger.
    s = passAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.objects[mine]!.counters["+1/+1"] ?? 0).toBe(0);
    s = run(s, planCast(s, ap, ids[0]!, [target(theirs)]));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = passAll(act(s, { type: "chooseTargets", player: ap, targets: [target(mine)] }));
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    s = passAll(s);
    expect(s.objects[theirs]!.damage).toBe(2);
  });
});

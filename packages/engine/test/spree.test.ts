// Spree (CR 702.172a): "Choose one or more modes. As an additional cost to cast this spell, pay the costs associated
// with those modes." The rulings: at least one mode, each once, paid also when cast without paying its mana cost.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, castProblem, planCast, compileCard, isFullySupported, manaValue, parseManaCost, spellCost, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const total = (c: { cost: ReturnType<typeof parseManaCost>; extra: number }) => manaValue(c.cost) + c.extra;

// Real oracle text (Scryfall).
const derailment = card("Explosive Derailment", "Instant", "{R}", { keywords: ["Spree"], oracleText: "Spree (Choose one or more additional costs.)\n+ {2} — Explosive Derailment deals 4 damage to target creature.\n+ {2} — Destroy target artifact." });
const avarice = card("Insatiable Avarice", "Sorcery", "{B}", { keywords: ["Spree"], oracleText: "Spree (Choose one or more additional costs.)\n+ {2} — Search your library for a card, then shuffle and put that card on top.\n+ {B}{B} — Target player draws three cards and loses 3 life." });
const blast = card("Metamorphic Blast", "Instant", "{U}", { keywords: ["Spree"], oracleText: "Spree (Choose one or more additional costs.)\n+ {1} — Until end of turn, target creature becomes a white Rabbit with base power and toughness 0/1.\n+ {3} — Target player draws two cards." });
const accident = card("Unfortunate Accident", "Instant", "{B}", { keywords: ["Spree"], oracleText: 'Spree (Choose one or more additional costs.)\n+ {2}{B} — Destroy target creature.\n+ {1} — Create a 1/1 red Mercenary creature token with "{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery."' });
const relic = card("Test Relic", "Artifact", "{2}");

describe("spree", () => {
  it("each chosen mode adds its cost; the mana value stays the mana cost's (rulings)", () => {
    supported(derailment, avarice, blast, accident);
    const modal = compileCard(derailment).spell!.modal!;
    expect(modal).toMatchObject({ min: 1, max: 2, costs: ["{2}", "{2}"] });
    const { s, ap, ids } = setup([derailment]);
    const o = s.objects[ids[0]!]!;
    expect(total(spellCost(s, ap, o, 0, [], { modes: [0] }))).toBe(3);
    expect(total(spellCost(s, ap, o, 0, [], { modes: [0, 1] }))).toBe(5);
    expect(manaValue(parseManaCost(derailment.manaCost))).toBe(1);
  });

  it("at least one mode, each once; only the chosen modes' targets", () => {
    const { s: s0, ap, ids, opp } = setup([derailment]);
    const b = putBear(s0, opp);
    const r = putRelic(s0, opp);
    expect(castProblem(s0, ap, ids[0]!, [], [])).toMatch(/one/);
    expect(castProblem(s0, ap, ids[0]!, [target(b), target(b)], [0, 0])).toMatch(/only once/);
    let s = cast(s0, ap, ids[0]!, [target(b)], [0]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[r]!.zone).toBe("battlefield");
    const { s: s1, ap: ap1, ids: ids1, opp: opp1 } = setup([derailment]);
    const b1 = putBear(s1, opp1);
    const r1 = putRelic(s1, opp1);
    s = cast(s1, ap1, ids1[0]!, [target(b1), target(r1)], [0, 1]);
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[r1]!.zone).toBe("graveyard");
  });

  it("the modes are paid for: with mana for only one, choosing both isn't possible", () => {
    const { s, ap, ids, opp } = setup([derailment]);
    const b = putBear(s, opp);
    const r = putRelic(s, opp);
    // Tap all but three of the lands.
    let left = 3;
    for (const id of s.battlefield) {
      const o = s.objects[id]!;
      if (o.controller !== ap || !s.cards[o.cardId]!.types.includes("Land")) continue;
      if (left > 0 && s.cards[o.cardId]!.name === "Mountain") left--;
      else o.tapped = true;
    }
    expect(planCast(s, ap, ids[0]!, [target(b), target(r)], [0, 1])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [target(b)], [0])).not.toBeNull();
  });

  it("cast without paying its mana cost, the chosen modes' costs are still paid (rulings)", () => {
    const { s, ap, ids } = setup([blast]);
    s.pending = { kind: "castFree", player: ap, objectId: ids[0]!, source: "test" };
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!, 0, [], { modes: [1] }))).toBe(3);
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!, 0, [], { modes: [0, 1] }))).toBe(4);
  });

  it("Insatiable Avarice: the player draws three and loses 3 life", () => {
    const { s: s0, ap, ids, opp } = setup([avarice]);
    putOnBattlefield(s0, ap, swamp);
    const hand = s0.players[opp]!.hand.length;
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], [1]);
    expect(s.players[opp]!.hand.length).toBe(hand + 3);
    expect(s.players[opp]!.life).toBe(37);
  });

  it("a bot pays for the most useful modes it can afford", () => {
    const { s: s0, ap, ids, opp } = setup([accident]);
    putBear(s0, opp, { name: "Big Test", power: "6", toughness: "6" });
    s0.players[ap]!.hand = [ids[0]!];
    s0.players[ap]!.landsPlayedThisTurn = 1;
    let s: GameState = s0;
    let modes: number[] | undefined;
    for (let i = 0; i < 300 && !modes; i++) {
      const acts = botActions(s, waitingOn(s)!);
      for (const a of acts) {
        s = act(s, a);
        modes ??= s.stack.find((it) => it.objectId === ids[0])?.modes;
      }
    }
    expect(modes).toEqual([0, 1]);
  });
});

const putBear = (s: GameState, pid: number, extra: Partial<CardDef> = {}) => putOnBattlefield(s, pid, bear(extra));
const putRelic = (s: GameState, pid: number) => putOnBattlefield(s, pid, relic);

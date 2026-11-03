// Fuse (CR 702.102): a split card with fuse may be cast from hand as both halves, one fused split spell with the halves'
// characteristics combined (709.4d) that follows the left half's instructions, then the right half's (702.102d). And a
// split card has either of its names when a name is chosen (709.4a, 201.4b).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup, target } from "./helpers";
import { castableFaces, castProblem, defOf, hasName, isFullySupported, planCast, spellManaValue, waitingOn, type Action, type GameState } from "../src";
import { cardNameOptions } from "../src/names";

// Real oracle text (Scryfall); each half's text has the fuse line.
const FUSE = "Fuse (You may cast one or both halves of this card from your hand.)";
const wearTear = scry(
  "split",
  [
    { name: "Wear", mana_cost: "{1}{R}", type_line: "Instant", oracle_text: `Destroy target artifact.\n${FUSE}` },
    { name: "Tear", mana_cost: "{W}", type_line: "Instant", oracle_text: `Destroy target enchantment.\n${FUSE}` },
  ],
  { keywords: ["Fuse"] },
);
const toilTrouble = scry(
  "split",
  [
    { name: "Toil", mana_cost: "{2}{B}", type_line: "Sorcery", oracle_text: `Target player draws two cards and loses 2 life.\n${FUSE}` },
    { name: "Trouble", mana_cost: "{2}{R}", type_line: "Sorcery", oracle_text: `Trouble deals damage to target player equal to the number of cards in that player's hand.\n${FUSE}` },
  ],
  { keywords: ["Fuse"] },
);
const giveTake = scry(
  "split",
  [
    { name: "Give", mana_cost: "{2}{G}", type_line: "Sorcery", oracle_text: `Put three +1/+1 counters on target creature.\n${FUSE}` },
    { name: "Take", mana_cost: "{2}{U}", type_line: "Sorcery", oracle_text: `Remove all +1/+1 counters from target creature you control. Draw that many cards.\n${FUSE}` },
  ],
  { keywords: ["Fuse"] },
);
const fleshBlood = scry(
  "split",
  [
    { name: "Flesh", mana_cost: "{3}{B}{G}", type_line: "Sorcery", oracle_text: `Exile target creature card from a graveyard. Put X +1/+1 counters on target creature, where X is the power of the card you exiled.\n${FUSE}` },
    { name: "Blood", mana_cost: "{R}{G}", type_line: "Sorcery", oracle_text: `Target creature you control deals damage equal to its power to any target.\n${FUSE}` },
  ],
  { keywords: ["Fuse"] },
);
const relic = card("Darksteel Relic", "Artifact", "{0}", { oracleText: "" });
const pacifism = card("Spirit Chain", "Enchantment", "{1}{W}", { oracleText: "" });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};

describe("fuse (CR 702.102)", () => {
  it("compiles: each half alone and the two fused", () => {
    expect(isFullySupported(wearTear)).toBe(true);
    expect(isFullySupported(toilTrouble)).toBe(true);
  });

  it("Wear // Tear fused from hand: both costs paid, mana value 3, red and white, the left half then the right", () => {
    const { s: s0, ap, ids, opp } = setup([wearTear]);
    const id = ids[0]!;
    const [art, ench] = [putOnBattlefield(s0, opp, relic), putOnBattlefield(s0, opp, pacifism)];
    expect(castableFaces(s0, s0.objects[id]!)).toEqual([0, 1, 2]);
    let s = run(s0, planCast(s0, ap, id, [target(art), target(ench)], undefined, "auto", undefined, { face: 2 }));
    const d = defOf(s, s.objects[id]!);
    expect(d).toMatchObject({ name: "Wear // Tear", types: ["Instant"], colors: ["W", "R"] });
    expect(spellManaValue(s, s.stack[0]!)).toBe(3);
    s = settle(s);
    expect(s.objects[art]!.zone).toBe("graveyard");
    expect(s.objects[ench]!.zone).toBe("graveyard");
    expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("only from hand: in a graveyard or anywhere else, a fuse card is cast as one half", () => {
    const { s, ids } = setup([wearTear]);
    const o = s.objects[ids[0]!]!;
    o.zone = "exile";
    expect(castableFaces(s, o)).toEqual([0, 1]);
  });

  it("Toil // Trouble on the same player twice: Trouble counts the two cards Toil drew (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([toilTrouble]);
    const before = s0.players[opp]!.hand.length;
    const who = { kind: "player" as const, id: opp };
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [who, who], undefined, "auto", undefined, { face: 2 })));
    expect(s.players[opp]!.hand.length).toBe(before + 2);
    expect(s.players[opp]!.life).toBe(40 - 2 - (before + 2));
  });

  it("a fuse card whose halves can't be read as one spell stays unsupported", () => {
    // Breaking // Entering: Entering's "Put a creature card from a graveyard onto the battlefield" isn't supported, so the
    // card isn't either.
    const breakingEntering = scry(
      "split",
      [
        { name: "Breaking", mana_cost: "{U}{B}", type_line: "Sorcery", oracle_text: `Target player mills eight cards.\n${FUSE}` },
        { name: "Entering", mana_cost: "{4}{B}{R}", type_line: "Sorcery", oracle_text: `Put a creature card from a graveyard onto the battlefield under your control. It gains haste until end of turn.\n${FUSE}` },
      ],
      { keywords: ["Fuse"] },
    );
    expect(isFullySupported(breakingEntering)).toBe(false);
    // Flesh's "where X is the power of the card you exiled" is since Lane B round B100, and Blood's "Target creature you
    // control deals damage" names its source by target, shifted like any other in the fused spell (laneb-round100.test.ts).
    expect(isFullySupported(fleshBlood)).toBe(true);
    // Take's "Draw that many cards" is since Lane B round B67 (laneb-round67.test.ts).
    expect(isFullySupported(giveTake)).toBe(true);
  });
});

describe("naming a split card (CR 709.4a, 201.4b)", () => {
  it("offers each half's name, and the card has either", () => {
    const { s, ids } = setup([wearTear]);
    const names = cardNameOptions(s);
    expect(names).toContain("Wear");
    expect(names).toContain("Tear");
    expect(names).not.toContain("Wear // Tear");
    expect(hasName(defOf(s, s.objects[ids[0]!]!).name, "Tear")).toBe(true);
    expect(hasName("Wear", "Tear")).toBe(false);
    // Cast, it's one half or both (CR 709.3).
    expect(castProblem(s, s.activePlayer, ids[0]!)).toMatch(/choose which half/);
  });
});

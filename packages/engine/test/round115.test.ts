// Round 115, most played cards: bots take spells over with Commandeer and Invert Polarity; cards that suspend other
// cards (Jhoira of the Ghitu, Kang Prime, CR 702.62).

import { describe, expect, it } from "vitest";
import { act, card, island, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, isSuspended, planActivate, planCast, waitingOn, type Action, type GameState } from "../src";
import { moveObject } from "../src/game";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const toHand = (s: GameState, pid: string, def: ReturnType<typeof card>) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "hand");
  return id;
};

// Real oracle text (Scryfall).
const commandeer = card("Commandeer", "Instant", "{5}{U}{U}", {
  oracleText:
    "You may exile two blue cards from your hand rather than pay this spell's mana cost.\nGain control of target noncreature spell. You may choose new targets for it. (If that spell is an artifact, enchantment, or planeswalker, the permanent enters under your control.)",
});
const invert = card("Invert Polarity", "Instant", "{U}{U}{R}", {
  oracleText: "Choose target spell, then flip a coin. If you win the flip, gain control of that spell and you may choose new targets for it. If you lose the flip, counter that spell.",
});
const relic = card("Mind Stone Relic", "Artifact", "{3}", { oracleText: "" });
const jhoira = card("Jhoira of the Ghitu", "Legendary Creature — Human Wizard", "{1}{U}{R}", {
  power: "2",
  toughness: "2",
  oracleText:
    "{2}, Exile a nonland card from your hand: Put four time counters on the exiled card. If it doesn't have suspend, it gains suspend. (At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. If it's a creature, it has haste.)",
});
const kang = card("Kang Prime", "Legendary Creature — Human Villain", "{3}{U}{B}", {
  power: "3",
  toughness: "5",
  keywords: ["Flying"],
  oracleText:
    "Flying\nWhenever Kang Prime enters or attacks, exile cards from the top of your library until you exile a nonland card. Put two time counters on that card. If it doesn't have suspend, it gains suspend. (At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. If it's a creature, it has haste.)",
});
const titan = card("Big Titan", "Creature — Giant", "{7}{G}{G}", { power: "9", toughness: "9" });

describe("bots take spells over", () => {
  /** Ap casts a 3-mana artifact; the next player holds `answer` with plenty of Islands and Mountains. */
  function answering(answer: ReturnType<typeof card>) {
    const { s: s0, ap, opp, ids } = setup([relic]);
    let s = s0;
    const a = toHand(s, opp, answer);
    for (let i = 0; i < 7; i++) putOnBattlefield(s, opp, island);
    putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    return { s, opp, a };
  }
  it("a bot casts Commandeer on an opponent's spell", () => {
    expect(isFullySupported(commandeer)).toBe(true);
    const { s, opp, a } = answering(commandeer);
    const plan = botActions(s, opp);
    const cast = plan.find((x) => x.type === "castSpell");
    expect(cast).toMatchObject({ objectId: a });
  });
  it("a bot casts Invert Polarity on an opponent's spell", () => {
    expect(isFullySupported(invert)).toBe(true);
    const { s, opp, a } = answering(invert);
    const cast = botActions(s, opp).find((x) => x.type === "castSpell");
    expect(cast).toMatchObject({ objectId: a });
  });
});

describe("cards that suspend other cards", () => {
  it("Kang Prime: the nonland card exiled from the top gets two time counters and suspend", () => {
    expect(isFullySupported(kang)).toBe(true);
    const { s: s0, ap, ids } = setup([kang]);
    let s = s0;
    const lib = s.players[ap]!.library;
    // A land on top, then a nonland card.
    const land = putOnBattlefield(s, ap, card("Forest", "Basic Land — Forest"));
    const big = putOnBattlefield(s, ap, titan);
    for (const id of [big, land]) {
      moveObject(s, id, "library", { top: true });
    }
    expect(lib.slice(0, 2)).toEqual([land, big]);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 12 && (s.stack.length || s.pending); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[land]!.zone).toBe("exile");
    expect(s.objects[big]!.zone).toBe("exile");
    expect(s.objects[big]!.counters.time).toBe(2);
    expect(isSuspended(s, s.objects[big]!)).toBe(true);
    expect(isSuspended(s, s.objects[land]!)).toBe(false);
  });

  it("Jhoira of the Ghitu: the card exiled to pay its cost gets four time counters and suspend; a bot uses it", () => {
    expect(isFullySupported(jhoira)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const j = putOnBattlefield(s, ap, jhoira);
    const big = toHand(s, ap, titan);
    const land = toHand(s, ap, card("Forest", "Basic Land — Forest"));
    // A land can't pay the cost.
    expect(planActivate(s, ap, j, 0, [], undefined, undefined, undefined, { exileFromHand: [land] })).toBeNull();
    s = run(s, planActivate(s, ap, j, 0, [], undefined, undefined, undefined, { exileFromHand: [big] }));
    expect(s.objects[big]!.zone).toBe("exile");
    for (let i = 0; i < 6 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[big]!.counters.time).toBe(4);
    expect(isSuspended(s, s.objects[big]!)).toBe(true);
    // A bot with Jhoira and a card it can't afford suspends it.
    const { s: b0, ap: bp } = setup([]);
    const bj = putOnBattlefield(b0, bp, jhoira);
    const bbig = toHand(b0, bp, card("Huge Titan", "Creature — Giant", "{9}{G}{G}{G}{G}{G}{G}{G}", { power: "16", toughness: "16" }));
    b0.step = "main2"; // bots use abilities once they're done casting spells
    b0.players[bp]!.hand = [bbig];
    b0.players[bp]!.command = []; // nothing else to cast
    const plan = botActions(b0, bp);
    expect(plan.find((x) => x.type === "activateAbility")).toMatchObject({ objectId: bj, costs: { exileFromHand: [bbig] } });
  });
});
